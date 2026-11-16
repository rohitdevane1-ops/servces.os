import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate } from '../../middleware/rbac.js';
import { env } from '../../config/env.js';

// Lockout store for customer safety PIN verification brute-force protection
const pinAttemptStore = new Map<string, { attempts: number; lockedUntil: number }>();

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

  // 1. Create On-Demand Booking Request
  fastify.post('/', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Create an on-demand booking request with pre-auth escrow hold',
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

    const { serviceId, addressText, city, state, postalCode, latitude, longitude, accessInstructions, scheduledStart, priority } = parsed.data;
    const userId = request.user!.id;
    const tenantId = request.tenantId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // A. Ensure customer profile exists
      let custRes = await client.query('SELECT user_id FROM customer_profiles WHERE user_id = $1', [userId]);
      if (custRes.rows.length === 0) {
        await client.query(
          `INSERT INTO customer_profiles (user_id, tenant_id, full_name, default_address_text)
           VALUES ($1, $2, $3, $4)`,
          [userId, tenantId, request.user!.email.split('@')[0], addressText]
        );
      }

      // B. Create or find customer address with PostGIS Point
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
      const scheduledTime = scheduledStart ? new Date(scheduledStart) : new Date(Date.now() + 45 * 60 * 1000); // 45m emergency default
      const bookingRes = await client.query(
        `INSERT INTO bookings (
          tenant_id, booking_reference, customer_id, service_id, address_id,
          status, priority, scheduled_start, customer_safety_pin
        ) VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6, $7, $8)
        RETURNING *`,
        [tenantId, bookingRef, userId, serviceId, addressId, priority, scheduledTime, safetyPin]
      );
      const booking = bookingRes.rows[0];

      // F. Create Initial Itemized Invoice
      const laborCents = Number(service.base_price_cents);
      const diagnosticCents = priority === 'EMERGENCY' ? 4900 : 2000;
      const totalAmountCents = laborCents + diagnosticCents;
      const invoiceNo = `INV-${new Date().getFullYear()}-${randomSuffix}`;

      // H. Create Pre-Auth Payment Transaction Record with verified hold status
      let stripeIntentId: string;
      let clientSecret: string | null = null;
      let initialPaymentStatus: 'REQUIRES_CAPTURE' | 'PENDING' = 'PENDING';
      let invoiceStatus: 'AUTHORIZED' | 'DRAFT' = 'DRAFT';

      if (env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(env.STRIPE_SECRET_KEY);
          const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
            amount: totalAmountCents,
            currency: 'usd',
            capture_method: 'manual', // Hold funds until completion
            metadata: {
              tenantId,
              bookingRef,
              customerId: userId,
            }
          };

          if (parsed.data.paymentMethodId) {
            paymentIntentParams.payment_method = parsed.data.paymentMethodId;
            paymentIntentParams.confirm = true;
            paymentIntentParams.return_url = 'https://serviceproos.com/booking/complete';
          }

          const paymentIntent = await stripe.paymentIntents.create(
            paymentIntentParams,
            { idempotencyKey: `idem_pi_${booking.id}` }
          );

          stripeIntentId = paymentIntent.id;
          clientSecret = paymentIntent.client_secret;

          // Only record as AUTHORIZED/REQUIRES_CAPTURE if Stripe confirmed the hold
          if (paymentIntent.status === 'requires_capture') {
            initialPaymentStatus = 'REQUIRES_CAPTURE';
            invoiceStatus = 'AUTHORIZED';
          }
        } catch (stripeErr: any) {
          await client.query('ROLLBACK');
          return reply.status(502).send(
            errorResponse('STRIPE_PREAUTH_FAILED', `Stripe pre-authorization hold failed: ${stripeErr.message}`, requestId)
          );
        }
      } else {
        if (process.env.NODE_ENV === 'production') {
          await client.query('ROLLBACK');
          return reply.status(422).send(
            errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live payment gateway (Stripe) is not configured on this server.', requestId)
          );
        }
        stripeIntentId = `pi_sandbox_unsettled_${Date.now()}_${randomSuffix}`;
      }

      const invRes = await client.query(
        `INSERT INTO invoices (
          tenant_id, booking_id, invoice_number, labor_subtotal_cents,
          diagnostic_fee_cents, total_amount_cents, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [tenantId, booking.id, invoiceNo, laborCents, diagnosticCents, totalAmountCents, invoiceStatus]
      );
      const invoiceId = invRes.rows[0].id;

      // G. Insert Invoice Line Items
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, item_type, quantity, unit_price_cents, total_cents)
         VALUES 
          ($1, $2, 'LABOR', 1, $3, $3),
          ($1, 'Diagnostic Dispatch Callout', 'DIAGNOSTIC', 1, $4, $4)`,
        [invoiceId, service.name, laborCents, diagnosticCents]
      );

      await client.query(
        `INSERT INTO payment_transactions (
          tenant_id, invoice_id, stripe_payment_intent_id, idempotency_key,
          authorized_amount_cents, transaction_type, status
        ) VALUES ($1, $2, $3, $4, $5, 'PRE_AUTH', $6)`,
        [tenantId, invoiceId, stripeIntentId, `idem_${booking.id}`, totalAmountCents, initialPaymentStatus]
      );

      // I. Record Initial Timeline Audit Event
      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, NULL, 'REQUESTED', $3, 'Booking Order Initialized', $4)`,
        [booking.id, tenantId, userId, `Order #${bookingRef} created with escrow pre-auth of $${(totalAmountCents / 100).toFixed(2)}`]
      );

      await client.query('COMMIT');

      return reply.status(201).send(
        successResponse({
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          status: booking.status,
          safetyPin: booking.customer_safety_pin,
          clientSecret: clientSecret || undefined,
          scheduledStart: booking.scheduled_start,
          serviceName: service.name,
          preAuthAmountCents: totalAmountCents,
          invoiceNumber: invoiceNo,
        }, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 1b. Confirm Pre-Authorization Hold after Client Stripe SDK Card Authorization (PAY-01)
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bRes = await client.query(
        `SELECT b.id, b.status, b.customer_id, i.id as invoice_id, pt.id as tx_id, pt.stripe_payment_intent_id, pt.status as tx_status
         FROM bookings b
         JOIN invoices i ON i.booking_id = b.id AND i.tenant_id = $2
         JOIN payment_transactions pt ON pt.invoice_id = i.id AND pt.tenant_id = $2
         WHERE b.id = $1 AND b.tenant_id = $2
         FOR UPDATE OF b`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Booking record not found.', requestId));
      }

      const row = bRes.rows[0];

      // Strict Authorization Guard: Caller must be the booking owner or an authorized operator (canonical ADMIN/STAFF)
      const isOwner = row.customer_id === callerId;
      const isPrivilegedOperator = ['ADMIN', 'STAFF'].includes(callerRole || '');

      if (!isOwner && !isPrivilegedOperator) {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You are not authorized to confirm payment for this booking.', requestId)
        );
      }

      // Idempotent return if already in a confirmed state
      if (row.tx_status === 'REQUIRES_CAPTURE' || row.tx_status === 'SUCCEEDED') {
        await client.query('COMMIT');
        return reply.status(200).send(successResponse({ confirmed: true, status: row.tx_status }, requestId));
      }

      // Require verifiable PaymentIntent identifier
      if (!row.stripe_payment_intent_id) {
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('PAYMENT_INTENT_MISSING', 'No payment intent associated with this booking invoice.', requestId)
        );
      }

      let targetTxStatus: 'REQUIRES_CAPTURE' | 'SUCCEEDED' = 'REQUIRES_CAPTURE';
      let targetInvoiceStatus: 'AUTHORIZED' | 'PAID' = 'AUTHORIZED';

      if (env.STRIPE_SECRET_KEY && row.stripe_payment_intent_id.startsWith('pi_')) {
        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);

        if (pi.status === 'succeeded') {
          targetTxStatus = 'SUCCEEDED';
          targetInvoiceStatus = 'PAID';
        } else if (pi.status === 'requires_capture') {
          targetTxStatus = 'REQUIRES_CAPTURE';
          targetInvoiceStatus = 'AUTHORIZED';
        } else {
          await client.query('ROLLBACK');
          return reply.status(400).send(
            errorResponse('PAYMENT_NOT_AUTHORIZED', `Stripe PaymentIntent status is ${pi.status}; payment is not authorized.`, requestId)
          );
        }
      } else if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        await client.query('ROLLBACK');
        return reply.status(422).send(
          errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live Stripe gateway is not configured on this server.', requestId)
        );
      }

      if (targetTxStatus === 'SUCCEEDED') {
        await client.query(
          `UPDATE payment_transactions 
           SET status = 'SUCCEEDED', captured_amount_cents = authorized_amount_cents 
           WHERE id = $1`, 
          [row.tx_id]
        );
      } else {
        await client.query(`UPDATE payment_transactions SET status = 'REQUIRES_CAPTURE' WHERE id = $1`, [row.tx_id]);
      }

      if (targetInvoiceStatus === 'PAID') {
        await client.query(`UPDATE invoices SET status = 'PAID', updated_at = NOW() WHERE id = $1`, [row.invoice_id]);
        
        // Post double-entry ledger entry for settled/paid customer payments:
        // Debit: 1010 (Operating Bank Account)
        // Credit: 2010 (Customer Escrow Liability)
        const accRes = await client.query(
          `SELECT id, account_number FROM ledger_accounts 
           WHERE tenant_id = $1 AND account_number IN ('1010', '2010')`,
          [tenantId]
        );
        const bankAsset = accRes.rows.find(a => a.account_number === '1010');
        const escrowLiability = accRes.rows.find(a => a.account_number === '2010');

        if (bankAsset && escrowLiability) {
          const invAmountRes = await client.query(`SELECT total_amount_cents FROM invoices WHERE id = $1`, [row.invoice_id]);
          const amountCents = invAmountRes.rows[0]?.total_amount_cents || 0;
          if (amountCents > 0) {
            await client.query(
              `INSERT INTO ledger_entries (tenant_id, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, $3, $4, $5)`,
              [tenantId, bankAsset.id, escrowLiability.id, amountCents, `Payment settled for booking ${id}`]
            );
          }
        }
      } else {
        await client.query(`UPDATE invoices SET status = 'AUTHORIZED', updated_at = NOW() WHERE id = $1`, [row.invoice_id]);
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
        'SELECT id, customer_safety_pin, status, assigned_provider_id FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
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

      // Check PIN lockout
      const attemptKey = `pin_${id}`;
      const now = Date.now();
      const attemptRecord = pinAttemptStore.get(attemptKey);
      if (attemptRecord && attemptRecord.lockedUntil > now) {
        const remainingSeconds = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
        await client.query('ROLLBACK');
        return reply.status(429).send(
          errorResponse('TOO_MANY_PIN_ATTEMPTS', `Safety PIN verification locked due to excessive failed attempts. Please retry in ${remainingSeconds} seconds.`, requestId)
        );
      }

      if (booking.customer_safety_pin !== safetyPin) {
        const currentAttempts = (attemptRecord && attemptRecord.lockedUntil <= now ? attemptRecord.attempts : 0) + 1;
        if (currentAttempts >= 5) {
          pinAttemptStore.set(attemptKey, { attempts: currentAttempts, lockedUntil: now + 15 * 60 * 1000 }); // 15-minute lockout
        } else {
          pinAttemptStore.set(attemptKey, { attempts: currentAttempts, lockedUntil: 0 });
        }
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_SAFETY_PIN', `The 4-digit safety PIN provided is incorrect. ${Math.max(0, 5 - currentAttempts)} attempts remaining before lockout.`, requestId)
        );
      }

      // Successful verification: clear lockout and invalidate PIN so it cannot be reused
      pinAttemptStore.delete(attemptKey);
      await client.query(
        `UPDATE bookings 
         SET status = 'ON_SITE', pin_verified_at = NOW(), customer_safety_pin = NULL, geofence_arrival_at = COALESCE(geofence_arrival_at, NOW())
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bRes = await client.query(
        `SELECT b.id, b.status, b.assigned_provider_id, i.id as invoice_id, i.total_amount_cents,
                t.default_platform_commission_bps
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.id = $1 AND b.tenant_id = $2
         FOR UPDATE OF b`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Work order not found.', requestId)
        );
      }

      const booking = bRes.rows[0];

      // Authorization: Must be assigned technician, ADMIN, or STAFF
      if (userRole === 'TECHNICIAN' && booking.assigned_provider_id !== userId) {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You are not the assigned provider for this work order.', requestId)
        );
      }
      if (userRole === 'CUSTOMER') {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'Customers cannot sign-off provider work orders directly.', requestId)
        );
      }

      // State check: Must be in ON_SITE status to complete work order (or idempotent return if already completed)
      if (booking.status === 'COMPLETED') {
        await client.query('COMMIT');
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
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_STATE', `Work order must be in ON_SITE status to complete (current status: ${booking.status}).`, requestId)
        );
      }

      // A. Save Work Order Proofs & Signatures (using canonical column name work_summary_notes)
      await client.query(
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
      await client.query(
        `UPDATE bookings SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // C. Capture Invoice Payment & Release Escrow Hold Idempotently
      if (booking.invoice_id) {
        let txId: string | null = null;
        const txRes = await client.query(
          `SELECT id, stripe_payment_intent_id, status FROM payment_transactions WHERE invoice_id = $1`,
          [booking.invoice_id]
        );
        if (txRes.rows.length > 0) {
          const tx = txRes.rows[0];
          txId = tx.id;
          if (env.STRIPE_SECRET_KEY && tx.status !== 'SUCCEEDED' && tx.stripe_payment_intent_id?.startsWith('pi_')) {
            try {
              const stripe = new Stripe(env.STRIPE_SECRET_KEY);
              await stripe.paymentIntents.capture(
                tx.stripe_payment_intent_id,
                {},
                { idempotencyKey: `capture_tx_${booking.invoice_id}` }
              );
            } catch (stripeErr: any) {
              const isAlreadyCaptured =
                stripeErr.code === 'payment_intent_unexpected_state' ||
                stripeErr.message?.toLowerCase().includes('already been captured');
              if (isAlreadyCaptured) {
                const stripe = new Stripe(env.STRIPE_SECRET_KEY);
                const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id);
                if (pi.status !== 'succeeded') {
                  await client.query('ROLLBACK');
                  return reply.status(502).send(
                    errorResponse('STRIPE_CAPTURE_FAILED', `Stripe PaymentIntent is in unexpected state: ${pi.status}`, requestId)
                  );
                }
              } else {
                await client.query('ROLLBACK');
                return reply.status(502).send(
                  errorResponse('STRIPE_CAPTURE_FAILED', `Failed capturing escrow funds with Stripe: ${stripeErr.message}`, requestId)
                );
              }
            }
          }
        }

        await client.query(
          `UPDATE invoices SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1`,
          [booking.invoice_id]
        );

        // Update Payment Transaction (conditional on non-succeeded status)
        await client.query(
          `UPDATE payment_transactions 
           SET captured_amount_cents = authorized_amount_cents, status = 'SUCCEEDED'
           WHERE invoice_id = $1 AND status != 'SUCCEEDED'`,
          [booking.invoice_id]
        );

        // D. Post Double-Entry Ledger Entries Idempotently
        const accRes = await client.query(
          `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
          [tenantId]
        );
        const accounts = accRes.rows;
        const cashAcc = accounts.find(a => a.account_number === '1010')?.id;
        const escrowLiabilityAcc = accounts.find(a => a.account_number === '2010')?.id;
        const techPayableAcc = accounts.find(a => a.account_number === '2020')?.id;
        const platformRevAcc = accounts.find(a => a.account_number === '4010')?.id;

        const totalCents = Number(booking.total_amount_cents || 0);
        const commissionBps = Number(booking.default_platform_commission_bps || 1500);
        const platformFeeCents = Math.round(totalCents * (commissionBps / 10000));
        const netTechPayoutCents = totalCents - platformFeeCents;

        // Check if ledger entries already exist for this transaction
        const existingLedger = txId
          ? await client.query(`SELECT id FROM ledger_entries WHERE transaction_id = $1 LIMIT 1`, [txId])
          : { rows: [] };

        if (existingLedger.rows.length === 0 && cashAcc && escrowLiabilityAcc && techPayableAcc && platformRevAcc && totalCents > 0) {
          // Debit Customer Escrow Liability, Credit Platform Revenue & Technician Payable
          await client.query(
            `INSERT INTO ledger_entries (tenant_id, transaction_id, debit_account_id, credit_account_id, amount_cents, description)
             VALUES 
              ($1, $2, $3, $4, $5, $6),
              ($1, $2, $3, $7, $8, $9)`,
            [
              tenantId,
              txId,
              escrowLiabilityAcc,
              platformRevAcc,
              platformFeeCents,
              `Platform commission recognition (${(commissionBps/100).toFixed(1)}%) for #${id}`,
              techPayableAcc,
              netTechPayoutCents,
              `Technician net earning payable for #${id}`
            ]
          );
        }
      }

      // E. Record Timeline Audit Event
      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, $3, 'COMPLETED', $4, 'Work Order Sign-Off & Escrow Capture', 'Customer digital signature recorded; escrow captured and split posted to ledger.')`,
        [id, tenantId, booking.status, request.user!.id]
      );

      await client.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          completed: true,
          status: 'COMPLETED',
          completedAt: new Date().toISOString()
        }, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 6. Cancel Booking Order
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bRes = await client.query(
        `SELECT b.id, b.status, b.customer_id, b.assigned_provider_id, i.id as invoice_id
         FROM bookings b
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.id = $1 AND b.tenant_id = $2
         FOR UPDATE OF b`,
        [id, tenantId]
      );

      if (bRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Booking record not found.', requestId)
        );
      }

      const booking = bRes.rows[0];

      // Authorization: Admin, Staff, or the customer who booked it
      const canCancel = userRole === 'ADMIN' ||
                        userRole === 'STAFF' ||
                        (userRole === 'CUSTOMER' && booking.customer_id === userId);

      if (!canCancel) {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You do not have permission to cancel this booking.', requestId)
        );
      }

      // If already cancelled, return idempotent response
      if (booking.status === 'CANCELLED') {
        await client.query('COMMIT');
        return reply.status(200).send(
          successResponse({
            id: booking.id,
            status: 'CANCELLED',
            message: 'Booking is already cancelled.'
          }, requestId)
        );
      }

      // Cannot cancel completed jobs
      if (booking.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_STATE', 'Cannot cancel an already completed work order. Open a dispute or refund request instead.', requestId)
        );
      }

      // Update booking status
      await client.query(
        `UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Void or cancel related invoice and release escrow authorization
      if (booking.invoice_id) {
        if (env.STRIPE_SECRET_KEY) {
          const txRes = await client.query(
            `SELECT stripe_payment_intent_id FROM payment_transactions WHERE invoice_id = $1 AND status = 'REQUIRES_CAPTURE'`,
            [booking.invoice_id]
          );
          if (txRes.rows.length > 0 && txRes.rows[0].stripe_payment_intent_id.startsWith('pi_')) {
            try {
              const stripe = new Stripe(env.STRIPE_SECRET_KEY);
              await stripe.paymentIntents.cancel(
                txRes.rows[0].stripe_payment_intent_id,
                {},
                { idempotencyKey: `cancel_tx_${booking.invoice_id}` }
              );
            } catch (stripeErr: any) {
              const isAlreadyCanceled = stripeErr.code === 'resource_already_canceled' ||
                                        String(stripeErr.message || '').toLowerCase().includes('already been canceled') ||
                                        String(stripeErr.message || '').toLowerCase().includes('already canceled');
              if (!isAlreadyCanceled) {
                await client.query('ROLLBACK');
                return reply.status(502).send(
                  errorResponse('STRIPE_CANCELLATION_FAILED', `Failed to release pre-authorization hold with Stripe: ${stripeErr.message}`, requestId)
                );
              }
              request.log.warn({ err: stripeErr }, 'Stripe PaymentIntent was already voided/canceled');
            }
          }
        }

        await client.query(
          `UPDATE invoices SET status = 'VOID' WHERE id = $1`,
          [booking.invoice_id]
        );

        await client.query(
          `UPDATE payment_transactions 
           SET status = 'VOIDED'
           WHERE invoice_id = $1 AND status IN ('REQUIRES_CAPTURE', 'PENDING')`,
          [booking.invoice_id]
        );
      }

      // Record timeline audit event
      const cancellationReason = reason ? `Cancellation reason: ${reason}` : 'Cancelled by customer / admin.';
      await client.query(
        `INSERT INTO booking_timeline_events (
          booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
        ) VALUES ($1, $2, $3, 'CANCELLED', $4, 'Booking Cancelled', $5)`,
        [id, tenantId, booking.status, userId, cancellationReason]
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
