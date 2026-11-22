import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { AuthService } from '../auth/auth.service.js';
import { blockInDemoMode } from '../../middleware/demoGuard.js';
import { env } from '../../config/env.js';
import { resolveTenantIntegrationSecrets } from '../../services/paymentGateway.js';

const ticketQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});

const createTicketSchema = z.object({
  subject: z.string().min(3).max(255),
  category: z.string().default('General Support'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  bookingId: z.string().uuid().optional(),
  initialMessage: z.string().min(5),
});

const postMessageSchema = z.object({
  messageBody: z.string().min(1),
  attachmentsUrls: z.array(z.string()).default([]),
});

const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  assignedStaffId: z.string().uuid().nullable().optional(),
});

const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

const moderateReviewSchema = z.object({
  isPublic: z.boolean(),
  moderationFlagged: z.boolean(),
});

const cmsConfigSchema = z.object({
  heroHeading: z.string().min(3).max(255),
  heroSubheading: z.string().min(5),
  searchPlaceholder: z.string().min(3).max(255),
  promoCouponCode: z.string().optional(),
  promoDiscountPercent: z.number().int().min(0).max(100).optional(),
});

export async function supportRoutes(fastify: FastifyInstance) {
  // Public Pre-Login Tenant CMS & Branding Config (no auth required; scoped by tenantResolver)
  fastify.get('/settings/cms', {
    schema: {
      tags: ['Tenant CMS & Config'],
      summary: 'Get white-label CMS header and promotional banner config',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const res = await tenantQuery(
      `SELECT 
        hero_heading as "heroHeading",
        hero_subheading as "heroSubheading",
        search_placeholder as "searchPlaceholder",
        promo_coupon_code as "promoCouponCode",
        promo_discount_percent as "promoDiscountPercent"
       FROM tenant_cms_configs
       WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    const config = res.rows[0] || {
      heroHeading: 'Your Service, Our Priority',
      heroSubheading: 'Book top-rated verified home service professionals on demand with upfront pricing and escrow guarantee.',
      searchPlaceholder: 'Search 340+ certified home services...',
      promoCouponCode: null,
      promoDiscountPercent: null
    };

    return reply.status(200).send(
      successResponse(config, requestId)
    );
  });

  fastify.register(async (fastify) => {
    fastify.addHook('preHandler', authenticate);

  // ============================================================================
  // SUPPORT TICKETS & MESSAGING
  // ============================================================================

  // 1. List Support Tickets
  fastify.get('/tickets', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'List support tickets with filtering and pagination',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userRole = request.user!.role;
    const userId = request.user!.id;

    const parsed = ticketQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid ticket query parameters', requestId)
      );
    }

    const { page, limit, status, priority } = parsed.data;
    const offset = (page - 1) * limit;

    let countQuery = `SELECT COUNT(id)::int as total FROM support_tickets WHERE tenant_id = $1`;
    let dataQuery = `
      SELECT 
        t.id,
        t.ticket_number as "ticketNumber",
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.created_at as "createdAt",
        t.updated_at as "updatedAt",
        cp.full_name as "customerName",
        u.email as "customerEmail",
        sp.full_name as "assignedStaffName"
      FROM support_tickets t
      JOIN customer_profiles cp ON cp.user_id = t.customer_id
      JOIN users u ON u.id = cp.user_id
      LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
      WHERE t.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    // Role-based filtering and access gating
    if (userRole === 'CUSTOMER') {
      params.push(userId);
      countQuery += ` AND customer_id = $${params.length}`;
      dataQuery += ` AND t.customer_id = $${params.length}`;
    } else if (userRole === 'ADMIN') {
      // Admin has tenant-wide ticket access
    } else if (userRole === 'STAFF') {
      const perms = await AuthService.getUserPermissions(userRole);
      if (!perms.includes('support:manage')) {
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'Staff user lacks support:manage permission', requestId)
        );
      }
    } else {
      // Other roles (e.g. TECHNICIAN) cannot access customer tickets
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Technicians do not have access to customer support desk', requestId)
      );
    }

    if (status) {
      params.push(status);
      countQuery += ` AND status = $${params.length}`;
      dataQuery += ` AND t.status = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      countQuery += ` AND priority = $${params.length}`;
      dataQuery += ` AND t.priority = $${params.length}`;
    }

    dataQuery += ` ORDER BY t.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

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

  // 2. Create Support Ticket
  fastify.post('/tickets', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Open a new support ticket with initial message',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;

    // Technicians cannot open customer support tickets (BUG-BE-004)
    if (request.user!.role === 'TECHNICIAN') {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Technicians cannot open customer support tickets via this endpoint.', requestId)
      );
    }

    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid ticket payload', requestId)
      );
    }

    const { subject, category, priority, bookingId, initialMessage } = parsed.data;
    const rawCustomerId = (request.body as any)?.customerId;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (rawCustomerId !== undefined && (typeof rawCustomerId !== 'string' || !UUID_RE.test(rawCustomerId))) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'customerId must be a valid UUID.', requestId)
      );
    }

    // Validate customer ownership of linked booking
    if (bookingId) {
      const bRes = await tenantQuery(
        'SELECT id, customer_id FROM bookings WHERE id = $1 AND tenant_id = $2',
        [bookingId, tenantId],
        tenantId
      );
      if (bRes.rows.length === 0) {
        return reply.status(404).send(
          errorResponse('BOOKING_NOT_FOUND', 'Specified booking does not exist in this organization.', requestId)
        );
      }
      if (!['ADMIN', 'STAFF'].includes(request.user!.role) && bRes.rows[0].customer_id !== userId) {
        return reply.status(403).send(
          errorResponse('FORBIDDEN', 'You can only link support tickets to your own bookings.', requestId)
        );
      }
    }

    const ticketNumber = `TICK-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    const targetCustomerId = rawCustomerId && ['ADMIN', 'STAFF'].includes(request.user!.role)
      ? String(rawCustomerId)
      : userId;

    const txOutcome = await withTenantTransaction<
      | { ok: true; ticket: any }
      | { ok: false }
    >(tenantId, async (client) => {
      const userCheck = await client.query(
        'SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2',
        [targetCustomerId, tenantId]
      );
      if (userCheck.rows.length === 0) {
        return { ok: false };
      }

      await client.query(
        `INSERT INTO customer_profiles (user_id, tenant_id, full_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [targetCustomerId, tenantId, String(userCheck.rows[0].email).split('@')[0]]
      );

      const ticketRes = await client.query(
        `INSERT INTO support_tickets (
          tenant_id, ticket_number, customer_id, booking_id, subject, category, priority, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
        RETURNING id, ticket_number, subject, category, priority, status, created_at`,
        [tenantId, ticketNumber, targetCustomerId, bookingId || null, subject, category, priority]
      );

      const ticket = ticketRes.rows[0];

      // Add initial message
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, message_body, attachments_urls)
         VALUES ($1, $2, $3, '[]'::jsonb)`,
        [ticket.id, userId, initialMessage]
      );

      return { ok: true, ticket };
    });

    if (!txOutcome.ok) {
      return reply.status(404).send(
        errorResponse('CUSTOMER_NOT_FOUND', 'Target customer not found in this organization.', requestId)
      );
    }

    const ticket = txOutcome.ticket;
    return reply.status(201).send(
      successResponse({
        ...ticket,
        ticketNumber: ticket.ticket_number,
        createdAt: ticket.created_at,
        message: 'Support ticket opened successfully'
      }, requestId)
    );
  });

  // 3. Get Support Ticket Thread
  fastify.get('/tickets/:id', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Get ticket details and conversation thread',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: ticketId } = request.params as { id: string };

    const ticketRes = await tenantQuery(
      `SELECT 
        t.id,
        t.ticket_number as "ticketNumber",
        t.customer_id as "customerId",
        cp.full_name as "customerName",
        u.email as "customerEmail",
        t.booking_id as "bookingId",
        b.booking_reference as "bookingReference",
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.assigned_staff_id as "assignedStaffId",
        sp.full_name as "assignedStaffName",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt"
      FROM support_tickets t
      JOIN customer_profiles cp ON cp.user_id = t.customer_id
      JOIN users u ON u.id = cp.user_id
      LEFT JOIN bookings b ON b.id = t.booking_id
      LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
      WHERE t.id = $1 AND t.tenant_id = $2`,
      [ticketId, tenantId],
      tenantId
    );

    if (ticketRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Support ticket not found', requestId)
      );
    }

    // Enforce role-based ticket access
    const userRole = request.user!.role;
    const userId = request.user!.id;
    const isCustomerOwner = userRole === 'CUSTOMER' && ticketRes.rows[0].customerId === userId;
    const isAdmin = userRole === 'ADMIN';
    const isSupportStaff = userRole === 'STAFF' && (await AuthService.getUserPermissions(userRole)).includes('support:manage');

    if (!isCustomerOwner && !isAdmin && !isSupportStaff) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'You do not have authorization to view this support ticket.', requestId)
      );
    }

    const messagesRes = await tenantQuery(
      `SELECT 
        tm.id,
        tm.sender_id as "senderId",
        u.email as "senderEmail",
        u.role as "senderRole",
        tm.message_body as "messageBody",
        tm.attachments_urls as "attachmentsUrls",
        tm.created_at as "createdAt"
      FROM ticket_messages tm
      JOIN users u ON u.id = tm.sender_id
      WHERE tm.ticket_id = $1
      ORDER BY tm.created_at ASC`,
      [ticketId],
      tenantId
    );

    return reply.status(200).send(
      successResponse({
        ...ticketRes.rows[0],
        messages: messagesRes.rows
      }, requestId)
    );
  });

  // 4. Post Reply Message to Ticket
  fastify.post('/tickets/:id/messages', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Post reply message to support ticket thread',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;
    const { id: ticketId } = request.params as { id: string };

    const parsed = postMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Message body cannot be empty', requestId)
      );
    }

    // Verify ticket exists and belongs to tenant
    const tCheck = await tenantQuery(
      `SELECT id, customer_id FROM support_tickets WHERE id = $1 AND tenant_id = $2`,
      [ticketId, tenantId],
      tenantId
    );

    if (tCheck.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Support ticket not found', requestId)
      );
    }

    // Enforce role-based reply access
    const userRole = request.user!.role;
    const isCustomerOwner = userRole === 'CUSTOMER' && tCheck.rows[0].customer_id === userId;
    const isAdmin = userRole === 'ADMIN';
    const isSupportStaff = userRole === 'STAFF' && (await AuthService.getUserPermissions(userRole)).includes('support:manage');

    if (!isCustomerOwner && !isAdmin && !isSupportStaff) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'You do not have authorization to post to this support ticket.', requestId)
      );
    }

    const msgRow = await withTenantTransaction(tenantId, async (client) => {
      const msgRes = await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, message_body, attachments_urls)
         VALUES ($1, $2, $3, $4)
         RETURNING id, sender_id, message_body, created_at`,
        [ticketId, userId, parsed.data.messageBody, JSON.stringify(parsed.data.attachmentsUrls)]
      );
      await client.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
      return msgRes.rows[0];
    });

    return reply.status(201).send(
      successResponse({
        id: msgRow.id,
        senderId: msgRow.sender_id,
        messageBody: msgRow.message_body,
        createdAt: msgRow.created_at
      }, requestId)
    );
  });

  // 5. Update Ticket Status & Assignment (Admin/Staff)
  fastify.patch('/tickets/:id/status', {
    preHandler: [requirePermission('support:manage')],
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Update ticket resolution status or assigned agent',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: ticketId } = request.params as { id: string };

    const parsed = updateTicketStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid status update parameters', requestId)
      );
    }

    const { status, assignedStaffId } = parsed.data;

    let updateQuery = `UPDATE support_tickets SET updated_at = NOW()`;
    const params: any[] = [ticketId, tenantId];

    if (status) {
      params.push(status);
      updateQuery += `, status = $${params.length}`;
    }
    if (assignedStaffId !== undefined) {
      if (assignedStaffId !== null) {
        const staffCheck = await tenantQuery(
          `SELECT user_id FROM staff_profiles WHERE user_id = $1 AND tenant_id = $2`,
          [assignedStaffId, tenantId],
          tenantId
        );
        if (staffCheck.rows.length === 0) {
          return reply.status(400).send(
            errorResponse('INVALID_STAFF_ASSIGNMENT', 'Assigned staff member does not belong to this organization.', requestId)
          );
        }
      }
      params.push(assignedStaffId);
      updateQuery += `, assigned_staff_id = $${params.length}`;
    }

    updateQuery += ` WHERE id = $1 AND tenant_id = $2 RETURNING id, ticket_number, status, assigned_staff_id, updated_at`;

    const res = await tenantQuery(updateQuery, params, tenantId);
    if (res.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Ticket not found', requestId)
      );
    }

    return reply.status(200).send(
      successResponse(res.rows[0], requestId)
    );
  });

  // ============================================================================
  // CUSTOMER REVIEWS & RATINGS
  // ============================================================================

  // 6. List Reviews
  fastify.get('/reviews', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'List verified customer reviews with provider filters',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { providerId } = request.query as { providerId?: string };

    let query = `
      SELECT 
        r.id,
        r.booking_id as "bookingId",
        r.rating,
        r.comment,
        r.is_public as "isPublic",
        r.moderation_flagged as "moderationFlagged",
        r.provider_response as "providerResponse",
        r.created_at as "createdAt",
        cp.full_name as "customerName",
        pp.full_name as "providerName",
        s.name as "serviceName"
      FROM customer_reviews r
      JOIN bookings b ON b.id = r.booking_id
      JOIN services s ON s.id = b.service_id
      JOIN customer_profiles cp ON cp.user_id = r.customer_id
      JOIN provider_profiles pp ON pp.user_id = r.provider_id
      WHERE r.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (providerId) {
      params.push(providerId);
      query += ` AND r.provider_id = $${params.length}`;
    }

    // Unless admin, only show public and unflagged reviews
    if (request.user?.role !== 'ADMIN' && request.user?.role !== 'STAFF') {
      query += ` AND r.is_public = TRUE AND r.moderation_flagged = FALSE`;
    }

    query += ` ORDER BY r.created_at DESC LIMIT 50`;

    const result = await tenantQuery(query, params, tenantId);

    return reply.status(200).send(
      successResponse(result.rows, requestId)
    );
  });

  // 7. Post Customer Review for Completed Booking
  fastify.post('/reviews', {
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Post rating and review for completed booking (Customer role)',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;

    const parsed = createReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Rating must be between 1 and 5', requestId)
      );
    }

    const { bookingId, rating, comment } = parsed.data;

    // Verify booking is completed and belongs to user
    const bookRes = await tenantQuery(
      `SELECT id, customer_id, assigned_provider_id, status
       FROM bookings WHERE id = $1 AND tenant_id = $2`,
      [bookingId, tenantId],
      tenantId
    );

    if (bookRes.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Booking not found', requestId)
      );
    }

    const booking = bookRes.rows[0];
    if (booking.customer_id !== userId) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Only the booking customer can submit a review', requestId)
      );
    }

    if (booking.status !== 'COMPLETED' || !booking.assigned_provider_id) {
      return reply.status(400).send(
        errorResponse('INVALID_STATE', 'Reviews can only be submitted for completed bookings with an assigned provider', requestId)
      );
    }

    const reviewRes = await tenantQuery(
      `INSERT INTO customer_reviews (
        tenant_id, booking_id, customer_id, provider_id, rating, comment
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (booking_id) DO UPDATE SET
        rating = $5, comment = $6, updated_at = NOW()
      RETURNING id, rating, comment, created_at`,
      [tenantId, bookingId, userId, booking.assigned_provider_id, rating, comment || null],
      tenantId
    );

    return reply.status(201).send(
      successResponse(reviewRes.rows[0], requestId)
    );
  });

  // 8. Moderate Review (Admin)
  fastify.patch('/reviews/:id/moderate', {
    preHandler: [requirePermission('support:manage')],
    schema: {
      tags: ['Support Desk & CRM'],
      summary: 'Admin review moderation toggle',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id: reviewId } = request.params as { id: string };

    const parsed = moderateReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid moderation parameters', requestId)
      );
    }

    const { isPublic, moderationFlagged } = parsed.data;

    const res = await tenantQuery(
      `UPDATE customer_reviews
       SET is_public = $1, moderation_flagged = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, is_public as "isPublic", moderation_flagged as "moderationFlagged"`,
      [isPublic, moderationFlagged, reviewId, tenantId],
      tenantId
    );

    if (res.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Review not found', requestId)
      );
    }

    return reply.status(200).send(
      successResponse(res.rows[0], requestId)
    );
  });

  // ============================================================================
  // TENANT CMS & BRANDING CONFIGS (Protected Admin Update)
  // ============================================================================

  // 10. Update Tenant CMS Configs (Admin)
  fastify.put('/settings/cms', {
    preHandler: [requirePermission('system:settings:update'), blockInDemoMode('Updating tenant CMS configuration')],
    schema: {
      tags: ['Tenant CMS & Config'],
      summary: 'Update tenant white-label CMS marketing text and promos',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = cmsConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid CMS parameters', requestId)
      );
    }

    const { heroHeading, heroSubheading, searchPlaceholder, promoCouponCode, promoDiscountPercent } = parsed.data;

    await tenantQuery(
      `INSERT INTO tenant_cms_configs (
        tenant_id, hero_heading, hero_subheading, search_placeholder, promo_coupon_code, promo_discount_percent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id) DO UPDATE SET
        hero_heading = $2,
        hero_subheading = $3,
        search_placeholder = $4,
        promo_coupon_code = $5,
        promo_discount_percent = $6,
        updated_at = NOW()`,
      [tenantId, heroHeading, heroSubheading, searchPlaceholder, promoCouponCode || null, promoDiscountPercent ?? null],
      tenantId
    );

    return reply.status(200).send(
      successResponse({ updated: true, heroHeading, heroSubheading }, requestId)
    );
  });

  // ============================================================================
  // DIRECT SMS DISPATCH & SAFETY INCIDENTS
  // ============================================================================

  const sendSmsSchema = z.object({
    recipientPhone: z.string().trim().min(5).max(32),
    recipientName: z.string().trim().max(120).optional(),
    message: z.string().trim().min(1).max(1000),
    bookingId: z.string().uuid().optional(),
  });

  fastify.post('/sms/send', {
    preHandler: [requirePermission('support:manage')],
    schema: {
      tags: ['Support & Communications'],
      summary: 'Send or queue a direct SMS message to a customer or technician',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const parsed = sendSmsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid SMS payload.', requestId)
      );
    }

    const { recipientPhone, recipientName, message, bookingId } = parsed.data;
    const secrets = await resolveTenantIntegrationSecrets(tenantId);
    const isDemoMode = env.APP_DEMO_MODE === 'true';

    let status: 'SENT' | 'PENDING' | 'FAILED' = 'PENDING';
    let delivered = false;
    let providerConfigured = false;
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;

    if (isDemoMode) {
      status = 'SENT';
      delivered = true;
      providerConfigured = true;
      providerMessageId = `sms_demo_${Date.now()}`;
    } else if (
      secrets.twilioEnabled &&
      secrets.twilioAccountSid &&
      secrets.twilioAuthToken &&
      secrets.twilioFromNumber
    ) {
      providerConfigured = true;
      try {
        const authHeader = Buffer.from(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`).toString('base64');
        const formBody = new URLSearchParams({
          To: recipientPhone,
          From: secrets.twilioFromNumber,
          Body: message,
        });
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(secrets.twilioAccountSid)}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authHeader}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString(),
            signal: AbortSignal.timeout(10000),
          }
        );
        const twilioData: any = await twilioRes.json().catch(() => ({}));
        if (twilioRes.ok && twilioData?.sid) {
          status = 'SENT';
          delivered = true;
          providerMessageId = String(twilioData.sid);
        } else {
          status = 'FAILED';
          errorMessage = twilioData?.message || `Twilio API returned status ${twilioRes.status}`;
        }
      } catch (err: any) {
        status = 'FAILED';
        errorMessage = err?.message || 'Twilio network dispatch error';
      }
    } else {
      errorMessage = 'Twilio SMS gateway is not configured; notification queued as PENDING.';
    }

    const logRes = await withTenantTransaction<{ id: string; created_at: string }>(tenantId, async (client) => {
      const inserted = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO notification_logs (
          tenant_id, recipient_user_id, channel, template_type, destination,
          status, provider_response_id, error_message
        ) VALUES ($1, $2, 'SMS', 'DIRECT_SMS', $3, $4, $5, $6)
        RETURNING id, created_at`,
        [tenantId, null, recipientPhone, status, providerMessageId, errorMessage]
      );

      await client.query(
        `INSERT INTO audit_logs (
          tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload
        ) VALUES ($1, $2, $3, 'SMS_DISPATCHED', 'notification_logs', $4, $5)`,
        [
          tenantId,
          request.user?.id || null,
          request.user?.role || null,
          inserted.rows[0].id,
          JSON.stringify({
            recipientPhone,
            recipientName: recipientName || null,
            bookingId: bookingId || null,
            messagePreview: message.slice(0, 160),
            status,
            providerConfigured,
          }),
        ]
      );

      return inserted.rows[0];
    });

    return reply.status(201).send(
      successResponse(
        {
          id: logRes.id,
          status,
          delivered,
          providerConfigured,
          recipientPhone,
          recipientName: recipientName || null,
          message,
          providerMessageId,
          errorMessage,
          createdAt: logRes.created_at,
        },
        requestId
      )
    );
  });

  fastify.get('/incidents', {
    preHandler: [requirePermission('support:manage')],
    schema: {
      tags: ['Support & Communications'],
      summary: 'List tenant safety and operational incidents backed by support_tickets',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const res = await tenantQuery(
      `SELECT st.id,
              st.ticket_number AS "ticketNumber",
              st.subject,
              st.priority,
              st.status,
              st.booking_id AS "bookingId",
              st.customer_id AS "customerId",
              st.created_at AS "createdAt",
              st.updated_at AS "updatedAt",
              b.booking_reference AS "bookingReference",
              cp.full_name AS "customerName",
              COALESCE(
                (SELECT tm.message_body FROM ticket_messages tm WHERE tm.ticket_id = st.id ORDER BY tm.created_at ASC LIMIT 1),
                st.subject
              ) AS description
       FROM support_tickets st
       LEFT JOIN bookings b ON b.id = st.booking_id AND b.tenant_id = st.tenant_id
       LEFT JOIN customer_profiles cp ON cp.user_id = st.customer_id AND cp.tenant_id = st.tenant_id
       WHERE st.tenant_id = $1 AND st.category = 'INCIDENT'
       ORDER BY st.created_at DESC
       LIMIT 100`,
      [tenantId],
      tenantId
    );

    const mapped = res.rows.map((r: any) => ({
      ...r,
      title: r.subject,
      severity: r.priority === 'URGENT' ? 'CRITICAL' : r.priority === 'NORMAL' ? 'MEDIUM' : r.priority,
    }));

    return reply.status(200).send(successResponse(mapped, requestId));
  });

  const createIncidentSchema = z.object({
    subject: z.string().trim().min(3).max(255),
    description: z.string().trim().min(3).max(2000),
    severity: z.enum(['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL']).default('HIGH'),
    bookingId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
  });

  fastify.post('/incidents', {
    preHandler: [requirePermission('support:manage'), blockInDemoMode('Create safety incident')],
    schema: {
      tags: ['Support & Communications'],
      summary: 'Create a safety or escalation incident',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const parsed = createIncidentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid incident payload.', requestId)
      );
    }

    const { subject, description, severity, bookingId, customerId } = parsed.data;
    const dbPriority = severity === 'CRITICAL' ? 'URGENT' : severity === 'MEDIUM' ? 'NORMAL' : severity;
    const ticketNumber = `INC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    const created = await withTenantTransaction<{ ok: true; row: any } | { ok: false; status: number; code: string; message: string }>(
      tenantId,
      async (client) => {
        let targetCustomerId = customerId || null;
        if (bookingId) {
          const bRes = await client.query<{ customer_id: string }>(
            'SELECT customer_id FROM bookings WHERE id = $1 AND tenant_id = $2',
            [bookingId, tenantId]
          );
          if (bRes.rowCount === 0) {
            return { ok: false, status: 404, code: 'BOOKING_NOT_FOUND', message: 'Referenced booking not found.' };
          }
          targetCustomerId = bRes.rows[0].customer_id;
        } else if (targetCustomerId) {
          const cRes = await client.query(
            'SELECT user_id FROM customer_profiles WHERE user_id = $1 AND tenant_id = $2',
            [targetCustomerId, tenantId]
          );
          if (cRes.rowCount === 0) {
            return { ok: false, status: 404, code: 'CUSTOMER_NOT_FOUND', message: 'Referenced customer profile not found.' };
          }
        } else {
          const fallbackRes = await client.query<{ user_id: string }>(
            'SELECT user_id FROM customer_profiles WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
            [tenantId]
          );
          targetCustomerId = fallbackRes.rows[0]?.user_id || null;
        }

        if (!targetCustomerId) {
          return {
            ok: false,
            status: 400,
            code: 'CUSTOMER_REQUIRED',
            message: 'bookingId or customerId is required to log an incident when no customer profile exists yet.',
          };
        }

        const tRes = await client.query(
          `INSERT INTO support_tickets (
            tenant_id, ticket_number, customer_id, booking_id, subject, category, priority, status
          ) VALUES ($1, $2, $3, $4, $5, 'INCIDENT', $6, 'OPEN')
          RETURNING id, ticket_number AS "ticketNumber", subject, priority, status, booking_id AS "bookingId", created_at AS "createdAt"`,
          [tenantId, ticketNumber, targetCustomerId, bookingId || null, subject, dbPriority]
        );
        const ticket = tRes.rows[0];

        if (request.user?.id) {
          await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, message_body) VALUES ($1, $2, $3)`,
            [ticket.id, request.user.id, description]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (
            tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload
          ) VALUES ($1, $2, $3, 'INCIDENT_CREATED', 'support_tickets', $4, $5)`,
          [tenantId, request.user?.id || null, request.user?.role || null, ticket.id, JSON.stringify({ subject, severity, dbPriority })]
        );

        return { ok: true, row: ticket };
      }
    );

    if (!created.ok) {
      return reply.status(created.status).send(errorResponse(created.code, created.message, requestId));
    }

    return reply.status(201).send(
      successResponse(
        {
          ...created.row,
          title: created.row.subject,
          description,
          severity,
        },
        requestId
      )
    );
  });

  fastify.patch('/incidents/:id/resolve', {
    preHandler: [requirePermission('support:manage'), blockInDemoMode('Resolve safety incident')],
    schema: {
      tags: ['Support & Communications'],
      summary: 'Resolve a safety or escalation incident',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const { id } = request.params as any;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Valid incident UUID is required.', requestId));
    }

    const resolveSchema = z.object({
      resolutionNotes: z.string().trim().max(2000).optional(),
    });
    const parsed = resolveSchema.safeParse(request.body || {});
    const resolutionNotes = parsed.success ? parsed.data.resolutionNotes : undefined;

    const updated = await withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `UPDATE support_tickets
         SET status = 'RESOLVED', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND category = 'INCIDENT'
         RETURNING id, ticket_number AS "ticketNumber", subject, priority, status, updated_at AS "updatedAt"`,
        [id, tenantId]
      );
      if (res.rowCount === 0) return null;

      if (resolutionNotes && request.user?.id) {
        await client.query(
          `INSERT INTO ticket_messages (ticket_id, sender_id, message_body) VALUES ($1, $2, $3)`,
          [id, request.user.id, `[RESOLVED] ${resolutionNotes}`]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (
          tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload
        ) VALUES ($1, $2, $3, 'INCIDENT_RESOLVED', 'support_tickets', $4, $5)`,
        [tenantId, request.user?.id || null, request.user?.role || null, id, JSON.stringify({ resolutionNotes: resolutionNotes || null })]
      );

      return res.rows[0];
    });

    if (!updated) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Incident not found.', requestId));
    }

    return reply.status(200).send(successResponse({ resolved: true, ...updated }, requestId));
  });
  });
}
