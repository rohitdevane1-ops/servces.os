import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { blockInDemoMode } from '../../middleware/demoGuard.js';
import { AuthService } from '../auth/auth.service.js';
import { getTechnicianEarningsSummary } from '../finances/earnings.service.js';

const customerQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

const createCustomerSchema = z.object({
  email: z.string().trim().email().max(250),
  password: z.string().min(8).max(100).optional(),
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(5).max(40).optional(),
  defaultAddress: z.string().trim().max(500).optional(),
  courtesyCreditCents: z.number().int().min(0).default(0),
});

const updateCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(5).max(40).nullable().optional(),
  defaultAddress: z.string().trim().max(500).nullable().optional(),
  courtesyCreditCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const technicianQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['ONLINE', 'OFFLINE', 'ON_JOB', 'EN_ROUTE']).optional(),
  tradeCategory: z.string().optional(),
  isVerified: z.preprocess(
    (val) => (val === undefined || val === '' ? undefined : val === 'true' || val === true),
    z.boolean().optional()
  ),
  search: z.string().optional(),
});

const createTechnicianSchema = z.object({
  email: z.string().trim().email().max(250),
  password: z.string().min(8).max(100).optional(),
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(5).max(40).optional(),
  tradeCategory: z.string().trim().min(2).max(100),
  licenseNumber: z.string().trim().max(100).optional(),
  hourlyRateCents: z.number().int().min(0).default(0),
  vehicleMakeModel: z.string().trim().max(150).optional(),
  vehicleLicensePlate: z.string().trim().max(50).optional(),
  isVerified: z.boolean().default(false),
});

const updateTechnicianSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(5).max(40).nullable().optional(),
  tradeCategory: z.string().trim().min(2).max(100).optional(),
  licenseNumber: z.string().trim().max(100).nullable().optional(),
  hourlyRateCents: z.number().int().min(0).optional(),
  vehicleMakeModel: z.string().trim().max(150).nullable().optional(),
  vehicleLicensePlate: z.string().trim().max(50).nullable().optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const verifyTechnicianSchema = z.object({
  isVerified: z.boolean(),
  notes: z.string().optional(),
});

const updateDutyStatusSchema = z.object({
  dutyStatus: z.enum(['ONLINE', 'OFFLINE', 'ON_JOB', 'EN_ROUTE']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).refine(
  (d) => (d.latitude === undefined && d.longitude === undefined) || (d.latitude !== undefined && d.longitude !== undefined),
  { message: 'Both latitude and longitude must be provided together.' }
);

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
      tenantQuery(countQuery, params, tenantId),
      tenantQuery(dataQuery, [...params, limit, offset], tenantId)
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

    const profileRes = await tenantQuery(
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
      [customerId, tenantId],
      tenantId
    );

    if (profileRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Customer profile not found', requestId)
      );
    }

    const customer = profileRes.rows[0];

    // Fetch addresses, recent bookings, and support tickets
    const [addressesRes, bookingsRes, ticketsRes] = await Promise.all([
      tenantQuery(
        `SELECT id, address_line1 as "addressLine1", address_line2 as "addressLine2", city, state_province as "state", postal_code as "postalCode", is_default as "isDefault"
         FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [customerId],
        tenantId
      ),
      tenantQuery(
        `SELECT b.id, b.booking_reference as "bookingReference", b.status, b.scheduled_start as "scheduledStart", s.name as "serviceName",
                p.full_name as "providerName", inv.total_amount_cents as "totalAmountCents"
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         LEFT JOIN provider_profiles p ON p.user_id = b.assigned_provider_id
         LEFT JOIN invoices inv ON inv.booking_id = b.id
         WHERE b.customer_id = $1 AND b.tenant_id = $2
         ORDER BY b.created_at DESC LIMIT 10`,
        [customerId, tenantId],
        tenantId
      ),
      tenantQuery(
        `SELECT id, ticket_number as "ticketNumber", subject, priority, status, created_at as "createdAt"
         FROM support_tickets WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [customerId, tenantId],
        tenantId
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

  // 2b. Create Customer (Admin/Staff)
  fastify.post('/customers', {
    preHandler: [requirePermission('crm:customers:manage')],
    schema: {
      tags: ['CRM & Customers'],
      summary: 'Create a new tenant customer profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid customer payload.', requestId)
      );
    }

    const { email, password, fullName, phone, defaultAddress, courtesyCreditCents } = parsed.data;
    const rawPassword = password || crypto.randomBytes(16).toString('hex');
    const passwordHash = await AuthService.hashPassword(rawPassword);

    try {
      const created = await withTenantTransaction(tenantId, async (client) => {
        const uRes = await client.query<{ id: string; email: string; phone: string | null; created_at: Date }>(
          `INSERT INTO users (tenant_id, email, phone, password_hash, role, is_active, is_verified)
           VALUES ($1, $2, $3, $4, 'CUSTOMER', TRUE, TRUE)
           RETURNING id, email, phone, created_at`,
          [tenantId, email.toLowerCase(), phone || null, passwordHash]
        );
        const u = uRes.rows[0];

        await client.query(
          `INSERT INTO customer_profiles (user_id, tenant_id, full_name, default_address_text, courtesy_credit_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [u.id, tenantId, fullName, defaultAddress || null, courtesyCreditCents]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
           VALUES ($1, $2, $3, 'CUSTOMER_CREATED', 'customer_profile', $4, $5)`,
          [tenantId, request.user!.id, request.user!.role, u.id, JSON.stringify({ email: u.email, fullName })]
        );

        return {
          id: u.id,
          email: u.email,
          phoneNumber: u.phone,
          fullName,
          defaultAddress: defaultAddress || null,
          courtesyCreditCents,
          createdAt: u.created_at,
        };
      });

      return reply.status(201).send(successResponse(created, requestId));
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('EMAIL_ALREADY_EXISTS', 'A user with this email already exists in this organization.', requestId)
        );
      }
      throw err;
    }
  });

  // 2c. Update Customer (Admin/Staff)
  fastify.put('/customers/:id', {
    preHandler: [requirePermission('crm:customers:manage')],
    schema: {
      tags: ['CRM & Customers'],
      summary: 'Update an existing tenant customer profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: customerId } = request.params as { id: string };
    if (!z.string().uuid().safeParse(customerId).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid customer ID.', requestId));
    }

    const parsed = updateCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid customer update payload.', requestId)
      );
    }

    const { fullName, phone, defaultAddress, courtesyCreditCents, isActive } = parsed.data;

    const updated = await withTenantTransaction(tenantId, async (client) => {
      const profRes = await client.query<{
        user_id: string;
        full_name: string;
        default_address_text: string | null;
        courtesy_credit_cents: string;
      }>(
        `UPDATE customer_profiles
         SET full_name = COALESCE($1, full_name),
             default_address_text = CASE WHEN $2::boolean THEN $3 ELSE default_address_text END,
             courtesy_credit_cents = COALESCE($4, courtesy_credit_cents),
             updated_at = NOW()
         WHERE user_id = $5 AND tenant_id = $6
         RETURNING user_id, full_name, default_address_text, courtesy_credit_cents`,
        [
          fullName ?? null,
          defaultAddress !== undefined,
          defaultAddress ?? null,
          courtesyCreditCents ?? null,
          customerId,
          tenantId,
        ]
      );

      if (profRes.rows.length === 0) {
        return null;
      }

      const uRes = await client.query<{ email: string; phone: string | null; is_active: boolean }>(
        `UPDATE users
         SET phone = CASE WHEN $1::boolean THEN $2 ELSE phone END,
             is_active = COALESCE($3, is_active),
             updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5
         RETURNING email, phone, is_active`,
        [phone !== undefined, phone ?? null, isActive ?? null, customerId, tenantId]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
         VALUES ($1, $2, $3, 'CUSTOMER_UPDATED', 'customer_profile', $4, $5)`,
        [tenantId, request.user!.id, request.user!.role, customerId, JSON.stringify(parsed.data)]
      );

      return {
        id: customerId,
        email: uRes.rows[0]?.email,
        phoneNumber: uRes.rows[0]?.phone ?? null,
        isActive: uRes.rows[0]?.is_active ?? true,
        fullName: profRes.rows[0].full_name,
        defaultAddress: profRes.rows[0].default_address_text,
        courtesyCreditCents: Number(profRes.rows[0].courtesy_credit_cents || 0),
      };
    });

    if (!updated) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Customer profile not found.', requestId));
    }

    return reply.status(200).send(successResponse(updated, requestId));
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
      tenantQuery(countQuery, params, tenantId),
      tenantQuery(dataQuery, [...params, limit, offset], tenantId)
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

  // 3b. Technician Self-Earnings Summary
  fastify.get('/technicians/me/earnings', {
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Get authenticated technician personal net earnings summary and payout history',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const role = request.user!.role;
    const requestedProviderId = (request.query as { providerId?: string } | undefined)?.providerId;

    if (role === 'CUSTOMER') {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Customers cannot access technician earnings endpoints.', requestId)
      );
    }

    if (role === 'TECHNICIAN' && requestedProviderId && requestedProviderId !== request.user!.id) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Technicians can only view their own earnings summary.', requestId)
      );
    }

    const targetProviderId =
      role === 'TECHNICIAN' ? request.user!.id : (requestedProviderId || request.user!.id);

    if (!z.string().uuid().safeParse(targetProviderId).success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid providerId UUID is required.', requestId)
      );
    }

    const summary = await getTechnicianEarningsSummary(tenantId, targetProviderId, request.tenant?.currencyCode);
    if (!summary) {
      return reply.status(404).send(
        errorResponse('PROVIDER_PROFILE_NOT_FOUND', 'Technician profile not found in this organization.', requestId)
      );
    }

    return reply.status(200).send(successResponse(summary, requestId));
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

    const profileRes = await tenantQuery(
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
      [techId, tenantId],
      tenantId
    );

    if (profileRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Technician not found', requestId)
      );
    }

    const tech = profileRes.rows[0];

    // Fetch shifts, reviews, and recent payouts
    const [shiftsRes, reviewsRes, payoutsRes] = await Promise.all([
      tenantQuery(
        `SELECT day_of_week as "dayOfWeek", start_time as "startTime", end_time as "endTime", is_active as "isActive"
         FROM provider_shifts WHERE provider_id = $1 ORDER BY day_of_week ASC`,
        [techId],
        tenantId
      ),
      tenantQuery(
        `SELECT r.id, r.rating, r.comment, r.created_at as "createdAt", cp.full_name as "customerName"
         FROM customer_reviews r
         JOIN customer_profiles cp ON cp.user_id = r.customer_id
         WHERE r.provider_id = $1 AND r.is_public = TRUE
         ORDER BY r.created_at DESC LIMIT 10`,
        [techId],
        tenantId
      ),
      tenantQuery(
        `SELECT id, amount_cents as "amountCents", status, created_at as "createdAt", processed_at as "processedAt"
         FROM provider_payouts WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [techId],
        tenantId
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

  // 4b. Create Technician (Admin/Staff)
  fastify.post('/technicians', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Create a new tenant technician profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = createTechnicianSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid technician payload.', requestId)
      );
    }

    const {
      email,
      password,
      fullName,
      phone,
      tradeCategory,
      licenseNumber,
      hourlyRateCents,
      vehicleMakeModel,
      vehicleLicensePlate,
      isVerified,
    } = parsed.data;
    const rawPassword = password || crypto.randomBytes(16).toString('hex');
    const passwordHash = await AuthService.hashPassword(rawPassword);

    try {
      const created = await withTenantTransaction(tenantId, async (client) => {
        const uRes = await client.query<{ id: string; email: string; phone: string | null; created_at: Date }>(
          `INSERT INTO users (tenant_id, email, phone, password_hash, role, is_active, is_verified)
           VALUES ($1, $2, $3, $4, 'TECHNICIAN', TRUE, TRUE)
           RETURNING id, email, phone, created_at`,
          [tenantId, email.toLowerCase(), phone || null, passwordHash]
        );
        const u = uRes.rows[0];

        await client.query(
          `INSERT INTO provider_profiles (
             user_id, tenant_id, full_name, trade_category, license_number,
             hourly_rate_cents, vehicle_make_model, vehicle_license_plate,
             is_verified, verified_at, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN NOW() ELSE NULL END, TRUE)`,
          [
            u.id,
            tenantId,
            fullName,
            tradeCategory,
            licenseNumber || null,
            hourlyRateCents,
            vehicleMakeModel || null,
            vehicleLicensePlate || null,
            isVerified,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
           VALUES ($1, $2, $3, 'TECHNICIAN_CREATED', 'provider_profile', $4, $5)`,
          [tenantId, request.user!.id, request.user!.role, u.id, JSON.stringify({ email: u.email, fullName, tradeCategory, isVerified })]
        );

        return {
          id: u.id,
          email: u.email,
          phoneNumber: u.phone,
          fullName,
          tradeCategory,
          licenseNumber: licenseNumber || null,
          hourlyRateCents,
          vehicleMakeModel: vehicleMakeModel || null,
          vehicleLicensePlate: vehicleLicensePlate || null,
          isVerified,
          isActive: true,
          dutyStatus: 'OFFLINE',
          createdAt: u.created_at,
        };
      });

      return reply.status(201).send(successResponse(created, requestId));
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send(
          errorResponse('EMAIL_ALREADY_EXISTS', 'A user with this email already exists in this organization.', requestId)
        );
      }
      throw err;
    }
  });

  // 4c. Update Technician (Admin/Staff)
  fastify.put('/technicians/:id', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Update an existing tenant technician profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: techId } = request.params as { id: string };
    if (!z.string().uuid().safeParse(techId).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid technician ID.', requestId));
    }

    const parsed = updateTechnicianSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid technician update payload.', requestId)
      );
    }

    const {
      fullName,
      phone,
      tradeCategory,
      licenseNumber,
      hourlyRateCents,
      vehicleMakeModel,
      vehicleLicensePlate,
      isVerified,
      isActive,
    } = parsed.data;

    const updated = await withTenantTransaction(tenantId, async (client) => {
      const profRes = await client.query<{
        user_id: string;
        full_name: string;
        trade_category: string;
        license_number: string | null;
        hourly_rate_cents: string;
        vehicle_make_model: string | null;
        vehicle_license_plate: string | null;
        is_verified: boolean;
        is_active: boolean;
      }>(
        `UPDATE provider_profiles
         SET full_name = COALESCE($1, full_name),
             trade_category = COALESCE($2, trade_category),
             license_number = CASE WHEN $3::boolean THEN $4 ELSE license_number END,
             hourly_rate_cents = COALESCE($5, hourly_rate_cents),
             vehicle_make_model = CASE WHEN $6::boolean THEN $7 ELSE vehicle_make_model END,
             vehicle_license_plate = CASE WHEN $8::boolean THEN $9 ELSE vehicle_license_plate END,
             is_verified = COALESCE($10, is_verified),
             verified_at = CASE
               WHEN $10 IS TRUE THEN COALESCE(verified_at, NOW())
               WHEN $10 IS FALSE THEN NULL
               ELSE verified_at
             END,
             is_active = COALESCE($11, is_active),
             updated_at = NOW()
         WHERE user_id = $12 AND tenant_id = $13
         RETURNING user_id, full_name, trade_category, license_number, hourly_rate_cents,
                   vehicle_make_model, vehicle_license_plate, is_verified, is_active`,
        [
          fullName ?? null,
          tradeCategory ?? null,
          licenseNumber !== undefined,
          licenseNumber ?? null,
          hourlyRateCents ?? null,
          vehicleMakeModel !== undefined,
          vehicleMakeModel ?? null,
          vehicleLicensePlate !== undefined,
          vehicleLicensePlate ?? null,
          isVerified ?? null,
          isActive ?? null,
          techId,
          tenantId,
        ]
      );

      if (profRes.rows.length === 0) {
        return null;
      }

      const uRes = await client.query<{ email: string; phone: string | null }>(
        `UPDATE users
         SET phone = CASE WHEN $1::boolean THEN $2 ELSE phone END,
             is_active = COALESCE($3, is_active),
             updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5
         RETURNING email, phone`,
        [phone !== undefined, phone ?? null, isActive ?? null, techId, tenantId]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
         VALUES ($1, $2, $3, 'TECHNICIAN_UPDATED', 'provider_profile', $4, $5)`,
        [tenantId, request.user!.id, request.user!.role, techId, JSON.stringify(parsed.data)]
      );

      const p = profRes.rows[0];
      return {
        id: p.user_id,
        email: uRes.rows[0]?.email,
        phoneNumber: uRes.rows[0]?.phone ?? null,
        fullName: p.full_name,
        tradeCategory: p.trade_category,
        licenseNumber: p.license_number,
        hourlyRateCents: Number(p.hourly_rate_cents || 0),
        vehicleMakeModel: p.vehicle_make_model,
        vehicleLicensePlate: p.vehicle_license_plate,
        isVerified: p.is_verified,
        isActive: p.is_active,
      };
    });

    if (!updated) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Technician not found.', requestId));
    }

    return reply.status(200).send(successResponse(updated, requestId));
  });

  // 5. Verify / Unverify Technician (Admin Only)
  fastify.patch('/technicians/:id/verify', {
    preHandler: [requirePermission('crm:technicians:manage'), blockInDemoMode('Changing technician compliance verification')],
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

    const updatedTech = await withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `UPDATE provider_profiles
         SET is_verified = $1,
             verified_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE user_id = $2 AND tenant_id = $3
         RETURNING user_id, full_name, is_verified, verified_at`,
        [isVerified, techId, tenantId]
      );

      if (res.rowCount === 0) {
        return null;
      }

      // Audit log
      await client.query(
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

      return res.rows[0];
    });

    if (!updatedTech) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Technician not found', requestId)
      );
    }

    return reply.status(200).send(
      successResponse({
        id: updatedTech.user_id,
        fullName: updatedTech.full_name,
        isVerified: updatedTech.is_verified,
        verifiedAt: updatedTech.verified_at,
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

    // Verify provider profile exists in this tenant before writing GPS telemetry
    const profileCheck = await tenantQuery(
      'SELECT user_id FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId],
      tenantId
    );
    if (profileCheck.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('PROVIDER_PROFILE_NOT_FOUND', 'Technician profile not found for this organization.', requestId)
      );
    }

    // Upsert into provider_locations
    await tenantQuery(
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
      [userId, tenantId, longitude, latitude, dutyStatus, headingDegrees],
      tenantId
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

    const { dutyStatus, latitude, longitude } = parsed.data;
    if (latitude !== undefined && longitude !== undefined && latitude === 0 && longitude === 0) {
      return reply.status(400).send(
        errorResponse('INVALID_COORDINATES', 'Zero GPS coordinates are not permitted for live telemetry.', requestId)
      );
    }

    // Verify technician profile exists and has not been deactivated by admin (BUG-BE-005)
    const profRes = await tenantQuery<{ user_id: string; is_active: boolean }>(
      `SELECT user_id, is_active FROM provider_profiles
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId],
      tenantId
    );

    if (profRes.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('PROVIDER_PROFILE_NOT_FOUND', 'Technician profile not found for this organization.', requestId)
      );
    }

    if (!profRes.rows[0].is_active) {
      return reply.status(403).send(
        errorResponse('PROVIDER_DEACTIVATED', 'Your technician profile has been deactivated by administration and cannot go online.', requestId)
      );
    }

    // UPSERT duty status safely without injecting fake (0, 0) coordinates when location has never been pinged
    const upsertRes = await tenantQuery<{ duty_status: string; has_location: boolean }>(
      `INSERT INTO provider_locations (
        provider_id, tenant_id, location, duty_status, last_ping_at
      ) VALUES (
        $1, $2,
        CASE WHEN $3::double precision IS NOT NULL AND $4::double precision IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
          ELSE NULL
        END,
        $5, NOW()
      )
      ON CONFLICT (provider_id) DO UPDATE SET
        duty_status = EXCLUDED.duty_status,
        location = COALESCE(EXCLUDED.location, provider_locations.location),
        last_ping_at = NOW()
      RETURNING duty_status, (location IS NOT NULL) AS has_location`,
      [userId, tenantId, latitude ?? null, longitude ?? null, dutyStatus],
      tenantId
    );

    return reply.status(200).send(
      successResponse({
        dutyStatus: upsertRes.rows[0].duty_status,
        hasLocation: upsertRes.rows[0].has_location,
        message: `Status updated to ${dutyStatus}`,
      }, requestId)
    );
  });

  // 7. Technician Weekly Shift Availability Schedule (Admin / Staff)
  fastify.get('/technicians/:id/availability', {
    preHandler: [requirePermission('crm:technicians:manage')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Get technician weekly shift availability schedule',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id } = request.params as { id: string };

    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Valid technician UUID is required.', requestId));
    }

    const techCheck = await tenantQuery(
      'SELECT user_id FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2',
      [id, tenantId],
      tenantId
    );
    if (techCheck.rowCount === 0) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Technician not found.', requestId));
    }

    const shiftsRes = await tenantQuery<{
      id: string;
      providerId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }>(
      `SELECT id,
              provider_id AS "providerId",
              day_of_week AS "dayOfWeek",
              SUBSTRING(start_time::text FROM 1 FOR 5) AS "startTime",
              SUBSTRING(end_time::text FROM 1 FOR 5) AS "endTime",
              is_active AS "isActive"
       FROM provider_shifts
       WHERE provider_id = $1 AND tenant_id = $2
       ORDER BY day_of_week ASC, start_time ASC`,
      [id, tenantId],
      tenantId
    );

    return reply.status(200).send(
      successResponse({ providerId: id, shifts: shiftsRes.rows }, requestId)
    );
  });

  const availabilityShiftSchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must be HH:MM or HH:MM:SS'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must be HH:MM or HH:MM:SS'),
    isActive: z.boolean().default(true),
  });

  const updateAvailabilitySchema = z.object({
    shifts: z.array(availabilityShiftSchema).max(21),
  });

  fastify.put('/technicians/:id/availability', {
    preHandler: [requirePermission('crm:technicians:manage'), blockInDemoMode('Updating technician shift availability')],
    schema: {
      tags: ['CRM & Technicians'],
      summary: 'Replace technician weekly shift availability schedule',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id } = request.params as { id: string };

    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Valid technician UUID is required.', requestId));
    }

    const parsed = updateAvailabilitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid shift schedule payload.', requestId)
      );
    }

    const shifts = parsed.data.shifts;
    for (const s of shifts) {
      if (s.isActive && s.startTime >= s.endTime) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', `Shift endTime (${s.endTime}) must be after startTime (${s.startTime}) for day ${s.dayOfWeek}.`, requestId)
        );
      }
    }

    const outcome = await withTenantTransaction<{ ok: true; shifts: any[] } | { ok: false }>(tenantId, async (client) => {
      const techCheck = await client.query(
        'SELECT user_id FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenantId]
      );
      if (techCheck.rowCount === 0) {
        return { ok: false };
      }

      await client.query(
        'DELETE FROM provider_shifts WHERE provider_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      const saved: any[] = [];
      for (const s of shifts) {
        const ins = await client.query(
          `INSERT INTO provider_shifts (provider_id, tenant_id, day_of_week, start_time, end_time, is_active)
           VALUES ($1, $2, $3, $4::time, $5::time, $6)
           RETURNING id, provider_id AS "providerId", day_of_week AS "dayOfWeek",
                     SUBSTRING(start_time::text FROM 1 FOR 5) AS "startTime",
                     SUBSTRING(end_time::text FROM 1 FOR 5) AS "endTime",
                     is_active AS "isActive"`,
          [id, tenantId, s.dayOfWeek, s.startTime, s.endTime, s.isActive]
        );
        saved.push(ins.rows[0]);
      }

      await client.query(
        `INSERT INTO audit_logs (
          tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload
        ) VALUES ($1, $2, $3, 'TECHNICIAN_AVAILABILITY_UPDATED', 'provider_shifts', $4, $5)`,
        [tenantId, request.user?.id || null, request.user?.role || null, id, JSON.stringify({ shiftCount: saved.length })]
      );

      return { ok: true, shifts: saved };
    });

    if (!outcome.ok) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Technician not found.', requestId));
    }

    return reply.status(200).send(
      successResponse({ providerId: id, shifts: outcome.shifts }, requestId)
    );
  });
}
