import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';

const customerQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

const technicianQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['ONLINE', 'OFFLINE', 'ON_JOB', 'EN_ROUTE']).optional(),
  tradeCategory: z.string().optional(),
  isVerified: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  search: z.string().optional(),
});

const verifyTechnicianSchema = z.object({
  isVerified: z.boolean(),
  notes: z.string().optional(),
});

const updateDutyStatusSchema = z.object({
  dutyStatus: z.enum(['ONLINE', 'OFFLINE', 'ON_JOB', 'EN_ROUTE']),
});

const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  headingDegrees: z.number().min(0).max(360).optional(),
  dutyStatus: z.enum(['ONLINE', 'OFFLINE', 'ON_JOB', 'EN_ROUTE']).optional(),
});

export async function crmRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ============================================================================
  // CUSTOMER MANAGEMENT
  // ============================================================================

  // 1. List Customers (Admin/Staff)
  fastify.get('/customers', {
    preHandler: [requirePermission('crm:customers:manage')],
    schema: {
      tags: ['CRM & Customers'],
      summary: 'List tenant customers with metrics and pagination',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = customerQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid query parameters', requestId)
      );
    }

    const { page, limit, search } = parsed.data;
    const offset = (page - 1) * limit;

    let countQuery = `
      SELECT COUNT(c.user_id)::int as total
      FROM customer_profiles c
      JOIN users u ON u.id = c.user_id
      WHERE c.tenant_id = $1
    `;
    let dataQuery = `
      SELECT 
        c.user_id as id,
        c.full_name as "fullName",
        u.email,
        u.phone as "phoneNumber",
        c.default_address_text as "defaultAddress",
        c.courtesy_credit_cents as "courtesyCreditCents",
        c.created_at as "createdAt",
        COUNT(b.id)::int as "totalBookings",
        COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' THEN inv.total_amount_cents ELSE 0 END), 0)::bigint as "totalSpentCents"
      FROM customer_profiles c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN bookings b ON b.customer_id = c.user_id
      LEFT JOIN invoices inv ON inv.booking_id = b.id AND inv.status = 'PAID'
      WHERE c.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    if (search) {
      params.push(`%${search}%`);
      countQuery += ` AND (c.full_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)`;
      dataQuery += ` AND (c.full_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)`;
    }

    dataQuery += `
      GROUP BY c.user_id, c.full_name, u.email, u.phone, c.default_address_text, c.courtesy_credit_cents, c.created_at
      ORDER BY c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset])
    ]);

    const total = countRes.rows[0]?.total || 0;

    return reply.status(200).send(
      successResponse(dataRes.rows, requestId, {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit)
      })
    );
  });

  // 2. Customer Dossier Detail
  fastify.get('/customers/:id', {
    preHandler: [requirePermission('crm:customers:manage')],
    schema: {
      tags: ['CRM & Customers'],
      summary: 'Get 360-degree customer dossier',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: customerId } = request.params as { id: string };

    const profileRes = await pool.query(
      `SELECT 
        c.user_id as id,
        c.full_name as "fullName",
        u.email,
        u.phone as "phoneNumber",
        c.default_address_text as "defaultAddress",
        c.courtesy_credit_cents as "courtesyCreditCents",
        c.stripe_customer_id as "stripeCustomerId",
        c.created_at as "createdAt"
      FROM customer_profiles c
      JOIN users u ON u.id = c.user_id
      WHERE c.user_id = $1 AND c.tenant_id = $2`,
      [customerId, tenantId]
    );

    if (profileRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Customer profile not found', requestId)
      );
    }

    const customer = profileRes.rows[0];

    // Fetch addresses, recent bookings, and support tickets
    const [addressesRes, bookingsRes, ticketsRes] = await Promise.all([
      pool.query(
        `SELECT id, address_line1 as "addressLine1", address_line2 as "addressLine2", city, state_province as "state", postal_code as "postalCode", is_default as "isDefault"
         FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [customerId]
      ),
      pool.query(
        `SELECT b.id, b.booking_reference as "bookingReference", b.status, b.scheduled_start as "scheduledStart", s.name as "serviceName",
                p.full_name as "providerName", inv.total_amount_cents as "totalAmountCents"
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         LEFT JOIN provider_profiles p ON p.user_id = b.assigned_provider_id
         LEFT JOIN invoices inv ON inv.booking_id = b.id
         WHERE b.customer_id = $1 AND b.tenant_id = $2
         ORDER BY b.created_at DESC LIMIT 10`,
        [customerId, tenantId]
      ),
      pool.query(
        `SELECT id, ticket_number as "ticketNumber", subject, priority, status, created_at as "createdAt"
         FROM support_tickets WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [customerId, tenantId]
      )
    ]);

    return reply.status(200).send(
      successResponse({
        ...customer,
        addresses: addressesRes.rows,
        recentBookings: bookingsRes.rows,
        supportTickets: ticketsRes.rows,
      }, requestId)
    );
  });

  // ============================================================================
  // TECHNICIAN & FLEET MANAGEMENT
  // ============================================================================

  // 3. List Technicians (Admin/Staff)
  fastify.get('/technicians', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'List tenant technicians with live duty status and metrics',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = technicianQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid query parameters', requestId)
      );
    }

    const { page, limit, status, tradeCategory, isVerified, search } = parsed.data;
    const offset = (page - 1) * limit;

    let countQuery = `
      SELECT COUNT(p.user_id)::int as total
      FROM provider_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN provider_locations pl ON pl.provider_id = p.user_id
      WHERE p.tenant_id = $1
    `;
    let dataQuery = `
      SELECT 
        p.user_id as id,
        p.full_name as "fullName",
        u.email,
        u.phone as "phoneNumber",
        p.trade_category as "tradeCategory",
        p.license_number as "licenseNumber",
        p.is_verified as "isVerified",
        p.verified_at as "verifiedAt",
        p.hourly_rate_cents as "hourlyRateCents",
        p.vehicle_make_model as "vehicleMakeModel",
        p.vehicle_license_plate as "vehicleLicensePlate",
        COALESCE(pl.duty_status, 'OFFLINE') as "dutyStatus",
        pl.last_ping_at as "lastPingAt",
        ST_Y(pl.location::geometry) as latitude,
        ST_X(pl.location::geometry) as longitude,
        COUNT(DISTINCT b.id)::int as "completedJobsCount",
        COALESCE(AVG(r.rating), 5.0)::numeric(3, 2) as "averageRating",
        COUNT(DISTINCT r.id)::int as "reviewCount"
      FROM provider_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN provider_locations pl ON pl.provider_id = p.user_id
      LEFT JOIN bookings b ON b.assigned_provider_id = p.user_id AND b.status = 'COMPLETED'
      LEFT JOIN customer_reviews r ON r.provider_id = p.user_id AND r.is_public = TRUE
      WHERE p.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (status) {
      params.push(status);
      countQuery += ` AND pl.duty_status = $${params.length}`;
      dataQuery += ` AND pl.duty_status = $${params.length}`;
    }
    if (tradeCategory) {
      params.push(tradeCategory);
      countQuery += ` AND p.trade_category = $${params.length}`;
      dataQuery += ` AND p.trade_category = $${params.length}`;
    }
    if (isVerified !== undefined) {
      params.push(isVerified);
      countQuery += ` AND p.is_verified = $${params.length}`;
      dataQuery += ` AND p.is_verified = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      countQuery += ` AND (p.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR p.trade_category ILIKE $${params.length})`;
      dataQuery += ` AND (p.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR p.trade_category ILIKE $${params.length})`;
    }

    dataQuery += `
      GROUP BY p.user_id, p.full_name, u.email, u.phone, p.trade_category, p.license_number,
               p.is_verified, p.verified_at, p.hourly_rate_cents, p.vehicle_make_model, p.vehicle_license_plate,
               pl.duty_status, pl.last_ping_at, pl.location
      ORDER BY p.is_verified DESC, p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset])
    ]);

    const total = countRes.rows[0]?.total || 0;

    return reply.status(200).send(
      successResponse(dataRes.rows, requestId, {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit)
      })
    );
  });

  // 4. Technician Dossier Detail
  fastify.get('/technicians/:id', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Get technician profile dossier, vehicle, payout status and history',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: techId } = request.params as { id: string };

    const profileRes = await pool.query(
      `SELECT 
        p.user_id as id,
        p.full_name as "fullName",
        u.email,
        u.phone as "phoneNumber",
        p.trade_category as "tradeCategory",
        p.license_number as "licenseNumber",
        p.is_verified as "isVerified",
        p.verified_at as "verifiedAt",
        p.stripe_connect_account_id as "stripeConnectAccountId",
        p.stripe_payouts_enabled as "stripePayoutsEnabled",
        p.hourly_rate_cents as "hourlyRateCents",
        p.vehicle_make_model as "vehicleMakeModel",
        p.vehicle_license_plate as "vehicleLicensePlate",
        COALESCE(pl.duty_status, 'OFFLINE') as "dutyStatus",
        pl.last_ping_at as "lastPingAt",
        ST_Y(pl.location::geometry) as latitude,
        ST_X(pl.location::geometry) as longitude,
        p.created_at as "createdAt"
      FROM provider_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN provider_locations pl ON pl.provider_id = p.user_id
      WHERE p.user_id = $1 AND p.tenant_id = $2`,
      [techId, tenantId]
    );

    if (profileRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Technician not found', requestId)
      );
    }

    const tech = profileRes.rows[0];

    // Fetch shifts, reviews, and recent payouts
    const [shiftsRes, reviewsRes, payoutsRes] = await Promise.all([
      pool.query(
        `SELECT day_of_week as "dayOfWeek", start_time as "startTime", end_time as "endTime", is_active as "isActive"
         FROM provider_shifts WHERE provider_id = $1 ORDER BY day_of_week ASC`,
        [techId]
      ),
      pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at as "createdAt", cp.full_name as "customerName"
         FROM customer_reviews r
         JOIN customer_profiles cp ON cp.user_id = r.customer_id
         WHERE r.provider_id = $1 AND r.is_public = TRUE
         ORDER BY r.created_at DESC LIMIT 10`,
        [techId]
      ),
      pool.query(
        `SELECT id, amount_cents as "amountCents", status, created_at as "createdAt", processed_at as "processedAt"
         FROM provider_payouts WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [techId]
      )
    ]);

    return reply.status(200).send(
      successResponse({
        ...tech,
        shifts: shiftsRes.rows,
        recentReviews: reviewsRes.rows,
        recentPayouts: payoutsRes.rows,
      }, requestId)
    );
  });

  // 5. Verify / Unverify Technician (Admin Only)
  fastify.patch('/technicians/:id/verify', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Toggle verification status for technician compliance',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: techId } = request.params as { id: string };

    const parsed = verifyTechnicianSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid verification parameters', requestId)
      );
    }

    const { isVerified, notes } = parsed.data;

    const res = await pool.query(
      `UPDATE provider_profiles
       SET is_verified = $1,
           verified_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3
       RETURNING user_id, full_name, is_verified, verified_at`,
      [isVerified, techId, tenantId]
    );

    if (res.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Technician not found', requestId)
      );
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        request.user!.id,
        request.user!.role,
        isVerified ? 'TECHNICIAN_VERIFIED' : 'TECHNICIAN_UNVERIFIED',
        'provider_profile',
        techId,
        JSON.stringify({ isVerified, notes })
      ]
    );

    return reply.status(200).send(
      successResponse({
        id: res.rows[0].user_id,
        fullName: res.rows[0].full_name,
        isVerified: res.rows[0].is_verified,
        verifiedAt: res.rows[0].verified_at,
        message: `Technician verification status updated to ${isVerified ? 'VERIFIED' : 'UNVERIFIED'}`
      }, requestId)
    );
  });

  // 6. Real-time GPS Location Ping Ingestion (Mobile Tech App)
  fastify.post('/technicians/location-ping', {
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Technician mobile GPS telemetry ping ingestion with PostGIS point update',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userRole = request.user?.role;
    const userId = request.user!.id;

    // BACK-05: Enforce TECHNICIAN role for telemetry writes
    if (userRole !== 'TECHNICIAN' && userRole !== 'ADMIN') {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Only technicians can submit GPS location telemetry.', requestId)
      );
    }

    const parsed = locationPingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid GPS coordinates', requestId)
      );
    }

    const { latitude, longitude, headingDegrees, dutyStatus } = parsed.data;

    // BACK-05: Reject placeholder (0, 0) coordinates to prevent corrupting spatial radar
    if (latitude === 0 && longitude === 0) {
      return reply.status(400).send(
        errorResponse('INVALID_COORDINATES', 'Zero GPS coordinates are not permitted for live telemetry.', requestId)
      );
    }

    // Upsert into provider_locations
    await pool.query(
      `INSERT INTO provider_locations (
        provider_id, tenant_id, location, duty_status, heading_degrees, last_ping_at
      ) VALUES (
        $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 
        COALESCE($5, 'ONLINE'), $6, NOW()
      )
      ON CONFLICT (provider_id) DO UPDATE SET
        location = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
        duty_status = COALESCE($5, provider_locations.duty_status),
        heading_degrees = COALESCE($6, provider_locations.heading_degrees),
        last_ping_at = NOW()`,
      [userId, tenantId, longitude, latitude, dutyStatus, headingDegrees]
    );

    return reply.status(200).send(
      successResponse({ recorded: true, timestamp: new Date().toISOString() }, requestId)
    );
  });

  // 7. Toggle Duty Status (Online / Offline / On Job)
  fastify.put('/technicians/duty-status', {
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Technician toggle duty status (ONLINE, OFFLINE, etc.)',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userRole = request.user?.role;
    const userId = request.user!.id;

    // BACK-05: Enforce TECHNICIAN role for duty status writes
    if (userRole !== 'TECHNICIAN' && userRole !== 'ADMIN') {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Only technicians can toggle duty status.', requestId)
      );
    }

    const parsed = updateDutyStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid duty status value', requestId)
      );
    }

    const { dutyStatus } = parsed.data;

    // BACK-05: Update duty status on existing record without injecting fake (0, 0) coordinates
    await pool.query(
      `UPDATE provider_locations 
       SET duty_status = $1, last_ping_at = NOW() 
       WHERE provider_id = $2 AND tenant_id = $3`,
      [dutyStatus, userId, tenantId]
    );

    // Sync active state to provider_profiles
    await pool.query(
      `UPDATE provider_profiles
       SET is_active = CASE WHEN $1 = 'OFFLINE' THEN FALSE ELSE TRUE END, updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [dutyStatus, userId, tenantId]
    );

    return reply.status(200).send(
      successResponse({ dutyStatus, message: `Status updated to ${dutyStatus}` }, requestId)
    );
  });
}
