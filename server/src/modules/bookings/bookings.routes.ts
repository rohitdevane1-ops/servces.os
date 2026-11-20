import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate } from '../../middleware/rbac.js';
import { env } from '../../config/env.js';
import { getStripe, hasStripeConfigured } from '../../services/stripeClient.js';
import { outboxWorker } from '../../workers/outbox.worker.js';

const createBookingSchema = z.object({
  serviceId: z.string().uuid(),
  addressText: z.string().min(5),
  city: z.string().default('Miami'),
  state: z.string().default('FL'),
  postalCode: z.string().default('33101'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accessInstructions: z.string().optional(),
  scheduledStart: z.string().datetime().optional(),
  priority: z.enum(['STANDARD', 'URGENT', 'EMERGENCY']).default('STANDARD'),
  paymentMethodId: z.string().optional(),
});

const verifyPinSchema = z.object({
  safetyPin: z.string().length(4),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const completeWorkOrderSchema = z.object({
  beforePhotos: z.array(z.string()).default([]),
  afterPhotos: z.array(z.string()).default([]),
  customerSignatureUrl: z.string().optional(),
  workSummaryNotes: z.string().optional(),
});

export async function bookingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // 1. Create On-Demand Booking Request (Decoupled Phase 1 Reservation + Durable Outbox)
  fastify.post('/', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Create an on-demand booking request with durable outbox payment reservation',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = createBookingSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid booking request parameters', requestId)
      );
    }

    const { serviceId, addressText, city, state, postalCode, latitude, longitude, accessInstructions, scheduledStart, priority, paymentMethodId } = parsed.data;
    const userId = request.user!.id;
    const tenantId = request.tenantId;

    // Preflight Stripe configuration BEFORE opening any DB transaction
    if (!hasStripeConfigured() && process.env.NODE_ENV === 'production') {
      return reply.status(422).send(
        errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live payment gateway (Stripe) is not configured on this server.', requestId)
      );
    }

    const stripeEnabled = hasStripeConfigured();
    const client = await pool.connect();
    let responsePayload: any = null;

    try {
      await client.query('BEGIN');

      // A. Ensure customer profile exists
      const custRes = await client.query('SELECT user_id FROM customer_profiles WHERE user_id = $1', [userId]);
      if (custRes.rows.length === 0) {
        await client.query(
          `INSERT INTO customer_profiles (user_id, tenant_id, full_name, default_address_text)
           VALUES ($1, $2, $3, $4)`,
          [userId, tenantId, request.user!.email.split('@')[0], addressText]
        );
      }

      // B. Create customer address with PostGIS Point
      const addrRes = await client.query(
        `INSERT INTO customer_addresses (
          customer_id, tenant_id, address_line1, city, state_province, postal_code,
          location, access_instructions, is_default
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, TRUE
        ) RETURNING id`,
        [userId, tenantId, addressText, city, state, postalCode, longitude, latitude, accessInstructions || null]
      );
      const addressId = addrRes.rows[0].id;

      // C. Query service pricing
      const srvRes = await client.query(
        'SELECT id, name, base_price_cents FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId]
      );
      if (srvRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('SERVICE_NOT_FOUND', 'Selected service not found in catalog.', requestId)
        );
      }
      const service = srvRes.rows[0];

      // D. Generate Cryptographically Secure 4-digit Safety PIN & Booking Reference
      const safetyPin = crypto.randomInt(1000, 10000).toString();
      const randomSuffix = crypto.randomInt(10000, 100000);
      const bookingRef = `SVC-${randomSuffix}`;

      // E. Insert Booking Record
      const scheduledTime = scheduledStart ? new Date(scheduledStart) : new Date(Date.now() + 45 * 60 * 1000);
      const bookingRes = await client.query(
        `INSERT INTO bookings (
          tenant_id, booking_reference, customer_id, service_id, address_id,
          status, priority, scheduled_start, customer_safety_pin
        ) VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6, $7, $8)
        RETURNING *`,
        [tenantId, bookingRef, userId, serviceId, addressId, priority, scheduledTime, safetyPin]
      );
      const booking = bookingRes.rows[0];

      // F. Create Initial Draft Invoice & Line Items
      const laborCents = Number(service.base_price_cents);
      const diagnosticCents = priority === 'EMERGENCY' ? 4900 : 2000;
      const totalAmountCents = laborCents + diagnosticCents;
      const invoiceNo = `INV-${new Date().getFullYear()}-${randomSuffix}`;

      const invRes = await client.query(
        `INSERT INTO invoices (
          tenant_id, booking_id, invoice_number, labor_subtotal_cents,
          diagnostic_fee_cents, total_amount_cents, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
        RETURNING id`,
        [tenantId, booking.id, invoiceNo, laborCents, diagnosticCents, totalAmountCents]
      );
      const invoiceId = invRes.rows[0].id;

      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, item_type, quantity, unit_price_cents, total_cents)
         VALUES 
          ($1, $2, 'LABOR', 1, $3, $3),
          ($1, 'Diagnostic Dispatch Callout', 'DIAGNOSTIC', 1, $4, $4)`,
        [invoiceId, service.name, laborCents, diagnosticCents]
      );

      // G. Insert durable PENDING payment transaction (never call Stripe inside this tx)
      const sandboxIntentId = stripeEnabled ? null : `pi_sandbox_unsettled_${Date.now()}_${randomSuffix}`;
      const txRes = await client.query(
        `INSERT INTO payment_transactions (
          tenant_id, invoice_id, stripe_payment_intent_id, idempotency_key,
          authorized_amount_cents, transaction_type, status
        ) VALUES ($1, $2, $3, $4, $5, 'PRE_AUTH', 'PENDING')
        RETURNING id`,
        [tenantId, invoiceId, sandboxIntentId, `idem_${booking.id}`, totalAmountCents]
      );
      const paymentTransactionId = txRes.rows[0].id;

      // H. Enqueue durable outbox operation when Stripe is configured
      if (stripeEnabled) {
        const outboxPayload = {
          tenantId,
          bookingId: booking.id,
          bookingRef,
          invoiceId,
          transactionId: paymentTransactionId,
          customerId: userId,
          amountCents: totalAmountCents,
          currency: 'usd',
          paymentMethodId: paymentMethodId || null,
        };

        await client.query(
          `INSERT INTO outbox_operations (
            tenant_id, aggregate_type, aggregate_id, operation_type,
            payload, idempotency_key, status
          ) VALUES ($1, 'BOOKING_PAYMENT', $2, 'CREATE_PAYMENT_INTENT', $3, $4, 'PENDING')`,
          [tenantId, booking.id, JSON.stringify(outboxPayload), `idem_pi_${booking.id}`]
        );
      }

      // I. Record Initial Timeline Audit Event
      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, NULL, 'REQUESTED', $3, 'Booking Order Initialized', $4)`,
        [booking.id, tenantId, userId, `Order #${bookingRef} reserved; escrow authorization queued for $${(totalAmountCents / 100).toFixed(2)}`]
      );

      await client.query('COMMIT');

      responsePayload = {
        bookingId: booking.id,
        bookingReference: booking.booking_reference,
        paymentTransactionId,
        status: 'PENDING_PAYMENT',
        bookingStatus: booking.status,
        safetyPin: booking.customer_safety_pin,
        scheduledStart: booking.scheduled_start,
        serviceName: service.name,
        preAuthAmountCents: totalAmountCents,
        invoiceNumber: invoiceNo,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (stripeEnabled && process.env.OUTBOX_WORKER_ENABLED !== 'false') {
      setImmediate(() => {
        outboxWorker.processNextJob().catch(() => {});
      });
    }

    return reply.status(202).send(successResponse(responsePayload, requestId));
  });

  // 1a. Retrieve PaymentIntent Client Secret & Provisioning Status for Client Checkout
  fastify.get('/:id/payment-intent', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Retrieve PaymentIntent client_secret and provisioning status for a booking',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const tenantId = request.tenantId;
    const callerId = request.user?.id;
    const callerRole = request.user?.role;

    const readClient = await pool.connect();
    let row: any;
    try {
      const res = await readClient.query(
        `SELECT b.id as booking_id, b.customer_id,
                pt.id as tx_id, pt.stripe_payment_intent_id, pt.status as tx_status, pt.authorized_amount_cents,
                oo.status as outbox_status, oo.last_error as outbox_error
         FROM bookings b
         JOIN invoices i ON i.booking_id = b.id AND i.tenant_id = $2
         JOIN payment_transactions pt ON pt.invoice_id = i.id AND pt.tenant_id = $2
         LEFT JOIN outbox_operations oo ON oo.aggregate_type = 'BOOKING_PAYMENT' AND oo.aggregate_id = b.id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId]
      );

      if (res.rows.length === 0) {
        return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Booking payment record not found.', requestId));
      }

      row = res.rows[0];
    } finally {
      readClient.release();
    }

    const isOwner = row.customer_id === callerId;
    const isPrivilegedOperator = ['ADMIN', 'STAFF'].includes(callerRole || '');
    if (!isOwner && !isPrivilegedOperator) {
      return reply.status(403).send(errorResponse('FORBIDDEN', 'Not authorized to access this booking payment intent.', requestId));
    }

    if (!row.stripe_payment_intent_id) {
      return reply.status(202).send(
        successResponse({
          bookingId: id,
          paymentTransactionId: row.tx_id,
          status: row.tx_status === 'FAILED' ? 'FAILED' : 'PROVISIONING',
          outboxStatus: row.outbox_status || 'PENDING',
          error: row.outbox_error || undefined,
        }, requestId)
      );
    }

    if (hasStripeConfigured() && row.stripe_payment_intent_id.startsWith('pi_')) {
      const stripe = getStripe(env.STRIPE_SECRET_KEY);
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      return reply.status(200).send(
        successResponse({
          bookingId: id,
          paymentTransactionId: row.tx_id,
          paymentIntentId: pi.id,
          clientSecret: pi.client_secret,
          status: row.tx_status,
          stripeStatus: pi.status,
          amountCents: Number(row.authorized_amount_cents),
        }, requestId)
      );
    }

    return reply.status(200).send(
      successResponse({
        bookingId: id,
        paymentTransactionId: row.tx_id,
        paymentIntentId: row.stripe_payment_intent_id,
        clientSecret: null,
        status: row.tx_status,
        amountCents: Number(row.authorized_amount_cents),
      }, requestId)
    );
  });

  // 1b. Confirm Pre-Authorization Hold after Client Stripe SDK Card Authorization (PAY-01, 3-Phase)
  fastify.post('/:id/confirm-payment', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Confirm pre-authorization hold after client card confirmation',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const tenantId = request.tenantId;
    const callerId = request.user?.id;
    const callerRole = request.user?.role;

    // PHASE 1: Fast Read & Authorization Guard (release DB client before Stripe I/O)
    const readClient = await pool.connect();
    let row: any;
    try {
      const bRes = await readClient.query(
        `SELECT b.id, b.status, b.customer_id, i.id as invoice_id, i.total_amount_cents,
                pt.id as tx_id, pt.stripe_payment_intent_id, pt.status as tx_status, pt.authorized_amount_cents
         FROM bookings b
         JOIN invoices i ON i.booking_id = b.id AND i.tenant_id = $2
         JOIN payment_transactions pt ON pt.invoice_id = i.id AND pt.tenant_id = $2
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Booking record not found.', requestId));
      }

      row = bRes.rows[0];
    } finally {
      readClient.release();
    }

    // Strict Authorization Guard: Caller must be the booking owner or an authorized operator (canonical ADMIN/STAFF)
    const isOwner = row.customer_id === callerId;
    const isPrivilegedOperator = ['ADMIN', 'STAFF'].includes(callerRole || '');

    if (!isOwner && !isPrivilegedOperator) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'You are not authorized to confirm payment for this booking.', requestId)
      );
    }

    // Idempotent return if already in a confirmed state
    if (row.tx_status === 'REQUIRES_CAPTURE' || row.tx_status === 'SUCCEEDED') {
      return reply.status(200).send(successResponse({ confirmed: true, status: row.tx_status }, requestId));
    }

    if (!row.stripe_payment_intent_id) {
      return reply.status(400).send(
        errorResponse('PAYMENT_INTENT_MISSING', 'No payment intent associated with this booking invoice.', requestId)
      );
    }

    // PHASE 2: External Stripe Retrieve (OUTSIDE any DB transaction)
    let targetTxStatus: 'REQUIRES_CAPTURE' | 'SUCCEEDED' = 'REQUIRES_CAPTURE';
    let targetInvoiceStatus: 'AUTHORIZED' | 'PAID' = 'AUTHORIZED';

    if (hasStripeConfigured() && row.stripe_payment_intent_id.startsWith('pi_')) {
      let pi: Stripe.PaymentIntent;
      try {
        const stripe = getStripe(env.STRIPE_SECRET_KEY);
        pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      } catch (stripeErr: any) {
        return reply.status(502).send(
          errorResponse('STRIPE_RETRIEVE_FAILED', `Failed to verify PaymentIntent with Stripe: ${stripeErr.message}`, requestId)
        );
      }

      if (pi.status === 'succeeded') {
        targetTxStatus = 'SUCCEEDED';
        targetInvoiceStatus = 'PAID';
      } else if (pi.status === 'requires_capture') {
        targetTxStatus = 'REQUIRES_CAPTURE';
        targetInvoiceStatus = 'AUTHORIZED';
      } else {
        return reply.status(409).send(
          errorResponse('PAYMENT_NOT_AUTHORIZED', `Stripe PaymentIntent status is ${pi.status}; payment is not authorized.`, requestId)
        );
      }
    } else if (process.env.NODE_ENV === 'production') {
      return reply.status(422).send(
        errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live Stripe gateway is not configured on this server.', requestId)
      );
    }

    // PHASE 3: Short Atomic Reconciliation Transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT status FROM payment_transactions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [row.tx_id, tenantId]
      );
      const currentStatus = lockRes.rows[0]?.status;
      if (currentStatus === 'SUCCEEDED') {
        await client.query('COMMIT');
        return reply.status(200).send(successResponse({ confirmed: true, status: 'SUCCEEDED' }, requestId));
      }

      if (targetTxStatus === 'SUCCEEDED') {
        await client.query(
          `UPDATE payment_transactions 
           SET status = 'SUCCEEDED', captured_amount_cents = authorized_amount_cents, updated_at = NOW() 
           WHERE id = $1`,
          [row.tx_id]
        );
      } else {
        await client.query(
          `UPDATE payment_transactions SET status = 'REQUIRES_CAPTURE', updated_at = NOW() WHERE id = $1 AND status = 'PENDING'`,
          [row.tx_id]
        );
      }

      if (targetInvoiceStatus === 'PAID') {
        await client.query(`UPDATE invoices SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`, [row.invoice_id]);

        // Escrow Capture: Debit 1020 (Stripe Holding Escrow Clearing), Credit 2010 (Customer Escrow Deposits Liability)
        const accRes = await client.query(
          `SELECT id, account_number FROM ledger_accounts 
           WHERE tenant_id = $1 AND account_number IN ('1010', '1020', '2010')`,
          [tenantId]
        );
        const escrowClearing = accRes.rows.find(a => a.account_number === '1020') || accRes.rows.find(a => a.account_number === '1010');
        const escrowLiability = accRes.rows.find(a => a.account_number === '2010');

        if (escrowClearing && escrowLiability) {
          const amountCents = Number(row.total_amount_cents || row.authorized_amount_cents || 0);
          if (amountCents > 0) {
            await client.query(
              `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, 'ESCROW_CAPTURE', $3, $4, $5, $6)
               ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
              [tenantId, row.tx_id, escrowClearing.id, escrowLiability.id, amountCents, `Escrow captured for booking ${id}`]
            );
          }
        }
      } else {
        await client.query(`UPDATE invoices SET status = 'AUTHORIZED', updated_at = NOW() WHERE id = $1 AND status = 'DRAFT'`, [row.invoice_id]);
      }

      await client.query('COMMIT');
      return reply.status(200).send(successResponse({ confirmed: true, status: targetTxStatus }, requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 2. Query Bookings List (Paginated & Filtered)
  fastify.get('/', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Get paginated list of bookings with filtering',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          priority: { type: 'string' },
          search: { type: 'string' },
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;
    const { status, priority, search, page = 1, limit = 20 } = request.query as any;

    const offset = (Math.max(1, page) - 1) * limit;

    let queryText = `
      SELECT b.id, b.booking_reference, b.status, b.priority, b.scheduled_start,
             s.name as service_name, s.base_price_cents,
             cp.full_name as customer_name, u_cust.phone as customer_phone,
             ca.address_line1 as customer_address, ca.city as customer_city,
             pp.full_name as technician_name, b.assigned_provider_id,
             i.total_amount_cents, i.status as payment_status
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      JOIN customer_profiles cp ON cp.user_id = b.customer_id
      JOIN users u_cust ON u_cust.id = cp.user_id
      JOIN customer_addresses ca ON ca.id = b.address_id
      LEFT JOIN provider_profiles pp ON pp.user_id = b.assigned_provider_id
      LEFT JOIN invoices i ON i.booking_id = b.id
      WHERE b.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Customer can only view own bookings
    if (userRole === 'CUSTOMER') {
      queryText += ` AND b.customer_id = $${paramIndex++}`;
      params.push(userId);
    }

    // Technician can only view assigned bookings
    if (userRole === 'TECHNICIAN') {
      queryText += ` AND b.assigned_provider_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (status && status !== 'all') {
      queryText += ` AND b.status = $${paramIndex++}`;
      params.push(status.toUpperCase());
    }

    if (priority && priority !== 'all') {
      queryText += ` AND b.priority = $${paramIndex++}`;
      params.push(priority.toUpperCase());
    }

    if (search && search.trim()) {
      queryText += ` AND (b.booking_reference ILIKE $${paramIndex} OR cp.full_name ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Count Total Records
    const countSql = `SELECT COUNT(*) as count FROM (${queryText}) as filtered`;
    const countRes = await pool.query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].count, 10);

    // Fetch Paginated Records
    queryText += ` ORDER BY b.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const res = await pool.query(queryText, params);

    return reply.status(200).send(
      successResponse(res.rows, requestId, {
        page: Number(page),
        limit: Number(limit),
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1
      })
    );
  });

  // 3. Get Full Booking Dossier
  fastify.get('/:id', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Get full booking dossier by ID',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;

    const bRes = await pool.query(
      `SELECT b.*, s.name as service_name, s.description as service_desc,
              cp.full_name as customer_name, u_cust.phone as customer_phone, u_cust.email as customer_email,
              ca.address_line1 as customer_address, ca.city, ca.state_province, ca.postal_code,
              ST_X(ca.location::geometry) as longitude, ST_Y(ca.location::geometry) as latitude,
              pp.full_name as technician_name, pp.trade_category, pp.vehicle_make_model, pp.vehicle_license_plate,
              u_tech.phone as technician_phone,
              i.id as invoice_id, i.invoice_number, i.total_amount_cents, i.status as payment_status
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_profiles cp ON cp.user_id = b.customer_id
       JOIN users u_cust ON u_cust.id = cp.user_id
       JOIN customer_addresses ca ON ca.id = b.address_id
       LEFT JOIN provider_profiles pp ON pp.user_id = b.assigned_provider_id
       LEFT JOIN users u_tech ON u_tech.id = pp.user_id
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.id = $1 AND b.tenant_id = $2`,
      [id, tenantId]
    );

    if (bRes.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('BOOKING_NOT_FOUND', 'Work order dossier not found.', requestId)
      );
    }

    const booking = bRes.rows[0];

    // Ownership Authorization: Admin/Staff can view all; Customer only their own; Tech only if assigned
    const isOwner = userRole === 'ADMIN' ||
                    userRole === 'STAFF' ||
                    (userRole === 'CUSTOMER' && booking.customer_id === userId) ||
                    (userRole === 'TECHNICIAN' && booking.assigned_provider_id === userId);

    if (!isOwner) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'You do not have permission to view this booking.', requestId)
      );
    }

    // Mask Safety PIN: Only the customer who owns the booking (or ADMIN) should see it
    if (userRole !== 'CUSTOMER' && userRole !== 'ADMIN') {
      delete booking.customer_safety_pin;
    }

    // Fetch Timeline Events
    const tlRes = await pool.query(
      `SELECT id, from_status, to_status, event_title, event_details, created_at
       FROM booking_timeline_events
       WHERE booking_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // Fetch Work Order Proofs
    const pfRes = await pool.query(
      `SELECT before_photos_urls, after_photos_urls, customer_signature_url, work_summary_notes, submitted_at
       FROM work_order_proofs WHERE booking_id = $1`,
      [id]
    );

    // Fetch Invoice Line Items
    let items: any[] = [];
    if (booking.invoice_id) {
      const itemsRes = await pool.query(
        'SELECT description, item_type, quantity, unit_price_cents, total_cents FROM invoice_items WHERE invoice_id = $1',
        [booking.invoice_id]
      );
      items = itemsRes.rows;
    }

    return reply.status(200).send(
      successResponse({
        booking,
        timeline: tlRes.rows,
        proofs: pfRes.rows[0] || null,
        invoiceItems: items
      }, requestId)
    );
  });

  // 4. Technician On-Site Arrival & Safety PIN Verification
  fastify.post('/:id/verify-arrival', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Verify customer 4-digit arrival safety PIN and confirm on-site status',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const parsed = verifyPinSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'A 4-digit numeric safety PIN is required.', requestId)
      );
    }

    const { safetyPin } = parsed.data;
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bRes = await client.query(
        `SELECT id, customer_safety_pin, status, assigned_provider_id,
                safety_pin_failed_attempts, safety_pin_locked_until, safety_pin_last_failed_at
         FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Booking record not found', requestId)
        );
      }

      const booking = bRes.rows[0];

      // Authorization: Must be assigned technician, ADMIN, or STAFF
      if (userRole === 'TECHNICIAN' && booking.assigned_provider_id !== userId) {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You are not the assigned provider for this booking.', requestId)
        );
      }
      if (userRole === 'CUSTOMER') {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'Only assigned technicians or dispatchers can verify arrival.', requestId)
        );
      }

      // State check: cannot verify arrival if already cancelled or completed
      const validPreArrivalStatuses = ['CONFIRMED', 'ASSIGNED', 'SCHEDULED', 'DISPATCHED', 'EN_ROUTE'];
      if (booking.status === 'ON_SITE') {
        await client.query('COMMIT');
        return reply.status(200).send(
          successResponse({
            verified: true,
            status: 'ON_SITE',
            verifiedAt: new Date().toISOString()
          }, requestId)
        );
      }
      if (!validPreArrivalStatuses.includes(booking.status)) {
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_STATE', `Cannot verify arrival for booking in ${booking.status} status.`, requestId)
        );
      }

      // Persistent PostgreSQL PIN lockout enforcement
      const now = Date.now();
      const lockedUntilMs = booking.safety_pin_locked_until ? new Date(booking.safety_pin_locked_until).getTime() : 0;
      if (lockedUntilMs > now) {
        const remainingSeconds = Math.ceil((lockedUntilMs - now) / 1000);
        await client.query('COMMIT');
        return reply.status(429).send(
          errorResponse('TOO_MANY_PIN_ATTEMPTS', `Safety PIN verification locked due to excessive failed attempts. Please retry in ${remainingSeconds} seconds.`, requestId)
        );
      }

      const storedPin = String(booking.customer_safety_pin || '');
      const pinMatches =
        storedPin.length === safetyPin.length &&
        storedPin.length > 0 &&
        crypto.timingSafeEqual(Buffer.from(storedPin, 'utf8'), Buffer.from(safetyPin, 'utf8'));

      if (!pinMatches) {
        const lastFailedMs = booking.safety_pin_last_failed_at ? new Date(booking.safety_pin_last_failed_at).getTime() : 0;
        const windowExpired = (lockedUntilMs > 0 && lockedUntilMs <= now) || (lastFailedMs > 0 && now - lastFailedMs > 15 * 60 * 1000);
        const baseAttempts = windowExpired ? 0 : Number(booking.safety_pin_failed_attempts || 0);
        const currentAttempts = baseAttempts + 1;
        const newLockedUntil = currentAttempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null;

        await client.query(
          `UPDATE bookings
           SET safety_pin_failed_attempts = $1,
               safety_pin_locked_until = $2,
               safety_pin_last_failed_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [currentAttempts, newLockedUntil, id]
        );
        // COMMIT failed attempt counter so lockout persists across instances and restarts
        await client.query('COMMIT');
        return reply.status(400).send(
          errorResponse('INVALID_SAFETY_PIN', `The 4-digit safety PIN provided is incorrect. ${Math.max(0, 5 - currentAttempts)} attempts remaining before lockout.`, requestId)
        );
      }

      // Successful verification: clear lockout and invalidate PIN so it cannot be reused
      await client.query(
        `UPDATE bookings 
         SET status = 'ON_SITE',
             pin_verified_at = NOW(),
             customer_safety_pin = NULL,
             safety_pin_failed_attempts = 0,
             safety_pin_locked_until = NULL,
             safety_pin_last_failed_at = NULL,
             geofence_arrival_at = COALESCE(geofence_arrival_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // Record Timeline Audit Event
      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, $3, 'ON_SITE', $4, 'On-Site Arrival & PIN Verified', 'Customer confirmed presence via safety PIN verification.')`,
        [id, tenantId, booking.status, userId]
      );

      await client.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          verified: true,
          status: 'ON_SITE',
          verifiedAt: new Date().toISOString()
        }, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 5. Complete Work Order & Release Escrow Funds
  fastify.post('/:id/complete', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Sign-off work order, upload dual photos, and capture escrow hold',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const parsed = completeWorkOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid completion payload', requestId)
      );
    }

    const { beforePhotos, afterPhotos, customerSignatureUrl, workSummaryNotes } = parsed.data;
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;

    // PHASE 1: Fast Read & Eligibility Verification (No long-lived transaction held)
    const readClient = await pool.connect();
    let booking: any;
    let paymentTx: any = null;

    try {
      const bRes = await readClient.query(
        `SELECT b.id, b.status, b.assigned_provider_id, i.id as invoice_id, i.total_amount_cents,
                t.default_platform_commission_bps
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Work order not found.', requestId)
        );
      }

      booking = bRes.rows[0];

      // Authorization: Must be assigned technician, ADMIN, or STAFF
      if (userRole === 'TECHNICIAN' && booking.assigned_provider_id !== userId) {
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You are not the assigned provider for this work order.', requestId)
        );
      }
      if (userRole === 'CUSTOMER') {
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'Customers cannot sign-off provider work orders directly.', requestId)
        );
      }

      // State check: Idempotent return if already completed
      if (booking.status === 'COMPLETED') {
        return reply.status(200).send(
          successResponse({
            completed: true,
            bookingId: id,
            status: 'COMPLETED',
            idempotent: true
          }, requestId)
        );
      }

      if (booking.status !== 'ON_SITE') {
        return reply.status(400).send(
          errorResponse('INVALID_STATE', `Work order must be in ON_SITE status to complete (current status: ${booking.status}).`, requestId)
        );
      }

      if (booking.invoice_id) {
        const txRes = await readClient.query(
          `SELECT id, stripe_payment_intent_id, status FROM payment_transactions WHERE invoice_id = $1`,
          [booking.invoice_id]
        );
        if (txRes.rows.length === 0) {
          return reply.status(400).send(
            errorResponse('PAYMENT_TRANSACTION_MISSING', 'Work order invoice lacks an authorized payment transaction.', requestId)
          );
        }

        paymentTx = txRes.rows[0];
        const validStatuses = ['REQUIRES_CAPTURE', 'AUTHORIZED', 'SUCCEEDED', 'PENDING'];
        if (!validStatuses.includes(paymentTx.status)) {
          return reply.status(400).send(
            errorResponse('INVALID_PAYMENT_STATE', `Payment transaction is in invalid state: ${paymentTx.status}`, requestId)
          );
        }
      }
    } finally {
      readClient.release();
    }

    // PHASE 2: External Stripe Capture (Executed OUTSIDE any open database transaction)
    if (booking.invoice_id && paymentTx && hasStripeConfigured() && paymentTx.status !== 'SUCCEEDED' && paymentTx.stripe_payment_intent_id?.startsWith('pi_')) {
      try {
        const stripe = getStripe(env.STRIPE_SECRET_KEY);
        await stripe.paymentIntents.capture(
          paymentTx.stripe_payment_intent_id,
          {},
          { idempotencyKey: `capture_tx_${booking.invoice_id}` }
        );
      } catch (stripeErr: any) {
        const isAlreadyCaptured =
          stripeErr.code === 'payment_intent_unexpected_state' ||
          stripeErr.message?.toLowerCase().includes('already been captured');
        if (isAlreadyCaptured) {
          const stripe = getStripe(env.STRIPE_SECRET_KEY);
          const pi = await stripe.paymentIntents.retrieve(paymentTx.stripe_payment_intent_id);
          if (pi.status !== 'succeeded') {
            return reply.status(502).send(
              errorResponse('STRIPE_CAPTURE_FAILED', `Stripe PaymentIntent is in unexpected state: ${pi.status}`, requestId)
            );
          }
        } else {
          return reply.status(502).send(
            errorResponse('STRIPE_CAPTURE_FAILED', `Failed capturing escrow funds with Stripe: ${stripeErr.message}`, requestId)
          );
        }
      }
    }

    // PHASE 3: Atomic Database Settlement (Short transaction, row locks, ledger entries)
    const settleClient = await pool.connect();
    try {
      await settleClient.query('BEGIN');

      // Re-lock booking to guarantee concurrency safety
      const lockRes = await settleClient.query(
        `SELECT id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId]
      );
      if (lockRes.rows.length === 0 || lockRes.rows[0].status === 'COMPLETED') {
        await settleClient.query('COMMIT');
        return reply.status(200).send(
          successResponse({ completed: true, bookingId: id, status: 'COMPLETED', idempotent: true }, requestId)
        );
      }

      // A. Save Work Order Proofs & Signatures (using canonical column name work_summary_notes)
      await settleClient.query(
        `INSERT INTO work_order_proofs (
          booking_id, before_photos_urls, after_photos_urls, customer_signature_url, work_summary_notes
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (booking_id) DO UPDATE SET
          before_photos_urls = EXCLUDED.before_photos_urls,
          after_photos_urls = EXCLUDED.after_photos_urls,
          customer_signature_url = EXCLUDED.customer_signature_url,
          work_summary_notes = EXCLUDED.work_summary_notes`,
        [id, JSON.stringify(beforePhotos), JSON.stringify(afterPhotos), customerSignatureUrl || null, workSummaryNotes || null]
      );

      // B. Advance Booking Status to COMPLETED
      await settleClient.query(
        `UPDATE bookings SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // C. Capture Invoice Payment & Release Escrow Hold Idempotently
      if (booking.invoice_id) {
        await settleClient.query(
          `UPDATE invoices SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`,
          [booking.invoice_id]
        );

        // Update Payment Transaction (conditional on non-succeeded status)
        await settleClient.query(
          `UPDATE payment_transactions 
           SET captured_amount_cents = authorized_amount_cents, status = 'SUCCEEDED', updated_at = NOW()
           WHERE invoice_id = $1 AND status != 'SUCCEEDED'`,
          [booking.invoice_id]
        );

        // D. Post Double-Entry Ledger Entries Idempotently
        const accRes = await settleClient.query(
          `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
          [tenantId]
        );
        const accounts = accRes.rows;
        const cashAcc = accounts.find(a => a.account_number === '1010')?.id;
        const escrowClearingAcc = accounts.find(a => a.account_number === '1020')?.id || cashAcc;
        const escrowLiabilityAcc = accounts.find(a => a.account_number === '2010')?.id;
        const techPayableAcc = accounts.find(a => a.account_number === '2020')?.id;
        const platformRevAcc = accounts.find(a => a.account_number === '4010')?.id;

        const totalCents = Number(booking.total_amount_cents || 0);
        const commissionBps = Number(booking.default_platform_commission_bps || 1500);
        const platformFeeCents = Math.round(totalCents * (commissionBps / 10000));
        const netTechPayoutCents = totalCents - platformFeeCents;

        if (paymentTx?.id && escrowClearingAcc && escrowLiabilityAcc && techPayableAcc && platformRevAcc && totalCents > 0) {
          // Record Escrow Capture idempotently (Dr 1020 Stripe Holding Escrow / Cr 2010 Customer Escrow Deposits)
          await settleClient.query(
            `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
             VALUES ($1, $2, 'ESCROW_CAPTURE', $3, $4, $5, $6)
             ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
            [
              tenantId,
              paymentTx.id,
              escrowClearingAcc,
              escrowLiabilityAcc,
              totalCents,
              `Escrow captured on work order completion for #${id}`
            ]
          );

          if (platformFeeCents > 0) {
            await settleClient.query(
              `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, 'PLATFORM_FEE', $3, $4, $5, $6)
               ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
              [
                tenantId,
                paymentTx.id,
                escrowLiabilityAcc,
                platformRevAcc,
                platformFeeCents,
                `Platform commission recognition (${(commissionBps/100).toFixed(1)}%) for #${id}`
              ]
            );
          }

          if (netTechPayoutCents > 0) {
            await settleClient.query(
              `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, 'TECH_PAYABLE', $3, $4, $5, $6)
               ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
              [
                tenantId,
                paymentTx.id,
                escrowLiabilityAcc,
                techPayableAcc,
                netTechPayoutCents,
                `Technician net earning payable for #${id}`
              ]
            );
          }
        }
      }

      // E. Record Timeline Audit Event
      await settleClient.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, $3, 'COMPLETED', $4, 'Work Order Sign-Off & Escrow Capture', 'Customer digital signature recorded; escrow captured and split posted to ledger.')`,
        [id, tenantId, booking.status, request.user!.id]
      );

      await settleClient.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          completed: true,
          status: 'COMPLETED',
          completedAt: new Date().toISOString()
        }, requestId)
      );
    } catch (err: any) {
      await settleClient.query('ROLLBACK');
      throw err;
    } finally {
      settleClient.release();
    }
  });

  // 6. Cancel Booking Order (3-Phase: Read -> Stripe Cancel Outside TX -> Atomic DB Settlement)
  fastify.post('/:id/cancel', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Cancel a booking with authorization checks and escrow void/release',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { id } = request.params as any;
    const { reason } = (request.body as any) || {};
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;

    // PHASE 1: Fast Read & Authorization (no DB lock held across Stripe network I/O)
    const readClient = await pool.connect();
    let booking: any;
    try {
      const bRes = await readClient.query(
        `SELECT b.id, b.status, b.customer_id, b.assigned_provider_id,
                i.id as invoice_id,
                pt.id as tx_id, pt.stripe_payment_intent_id, pt.status as tx_status
         FROM bookings b
         LEFT JOIN invoices i ON i.booking_id = b.id
         LEFT JOIN payment_transactions pt ON pt.invoice_id = i.id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Booking record not found.', requestId)
        );
      }
      booking = bRes.rows[0];
    } finally {
      readClient.release();
    }

    const canCancel = userRole === 'ADMIN' ||
                      userRole === 'STAFF' ||
                      (userRole === 'CUSTOMER' && booking.customer_id === userId);
    if (!canCancel) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'You do not have permission to cancel this booking.', requestId)
      );
    }

    if (booking.status === 'CANCELLED') {
      return reply.status(200).send(
        successResponse({
          id: booking.id,
          status: 'CANCELLED',
          message: 'Booking is already cancelled.'
        }, requestId)
      );
    }

    if (booking.status === 'COMPLETED') {
      return reply.status(400).send(
        errorResponse('INVALID_STATE', 'Cannot cancel an already completed work order. Open a dispute or refund request instead.', requestId)
      );
    }

    if (booking.tx_status === 'SUCCEEDED') {
      return reply.status(409).send(
        errorResponse('PAYMENT_ALREADY_CAPTURED', 'Payment has already been captured; refund is required before cancelling.', requestId)
      );
    }

    // PHASE 2: Cancel Stripe PaymentIntent Authorization Outside Any Open Transaction
    if (
      booking.invoice_id &&
      hasStripeConfigured() &&
      booking.stripe_payment_intent_id?.startsWith('pi_') &&
      ['REQUIRES_CAPTURE', 'PENDING'].includes(booking.tx_status)
    ) {
      try {
        const stripe = getStripe(env.STRIPE_SECRET_KEY);
        await stripe.paymentIntents.cancel(
          booking.stripe_payment_intent_id,
          {},
          { idempotencyKey: `cancel_tx_${booking.invoice_id}` }
        );
      } catch (stripeErr: any) {
        const msg = String(stripeErr?.message || '').toLowerCase();
        const isAlreadyCanceled = stripeErr.code === 'resource_already_canceled' ||
                                  msg.includes('already been canceled') ||
                                  msg.includes('already canceled');
        const isAlreadyCaptured = msg.includes('already been captured') || msg.includes('succeeded');
        if (isAlreadyCaptured) {
          return reply.status(409).send(
            errorResponse('PAYMENT_ALREADY_CAPTURED', 'Stripe PaymentIntent has already been captured; refund required.', requestId)
          );
        }
        if (!isAlreadyCanceled) {
          return reply.status(502).send(
            errorResponse('STRIPE_CANCELLATION_FAILED', `Failed to release pre-authorization hold with Stripe: ${stripeErr.message}`, requestId)
          );
        }
        request.log.warn({ err: stripeErr }, 'Stripe PaymentIntent was already voided/canceled');
      }
    }

    // PHASE 3: Short Atomic Local Settlement Transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId]
      );
      if (lockRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Booking record not found.', requestId));
      }
      const locked = lockRes.rows[0];
      if (locked.status === 'CANCELLED') {
        await client.query('COMMIT');
        return reply.status(200).send(
          successResponse({ id: locked.id, status: 'CANCELLED', message: 'Booking is already cancelled.' }, requestId)
        );
      }
      if (locked.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_STATE', 'Cannot cancel an already completed work order.', requestId)
        );
      }

      const cancellationReason = reason ? `Cancellation reason: ${reason}` : 'Cancelled by customer / admin.';
      await client.query(
        `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = $2, cancelled_by_user_id = $3, updated_at = NOW() WHERE id = $1`,
        [id, cancellationReason, userId]
      );

      // Prevent background outbox worker from creating a PI for this cancelled booking
      await client.query(
        `UPDATE outbox_operations
         SET status = 'CANCELLED', lease_expires_at = NULL, updated_at = NOW()
         WHERE aggregate_type = 'BOOKING_PAYMENT'
           AND aggregate_id = $1
           AND status IN ('PENDING', 'REQUIRES_RECONCILIATION')`,
        [id]
      );

      if (booking.invoice_id) {
        await client.query(
          `UPDATE invoices SET status = 'VOID', updated_at = NOW() WHERE id = $1`,
          [booking.invoice_id]
        );

        await client.query(
          `UPDATE payment_transactions 
           SET status = 'VOIDED', updated_at = NOW()
           WHERE invoice_id = $1 AND status IN ('REQUIRES_CAPTURE', 'PENDING')`,
          [booking.invoice_id]
        );
      }

      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, $3, 'CANCELLED', $4, 'Booking Cancelled', $5)`,
        [id, tenantId, locked.status, userId, cancellationReason]
      );

      await client.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          id,
          status: 'CANCELLED',
          cancelledAt: new Date().toISOString()
        }, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
