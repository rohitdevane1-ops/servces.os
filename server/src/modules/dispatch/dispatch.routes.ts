import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { broadcastBookingToNearbyProviders } from './dispatch.service.js';

const radarQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(150).default(25),
  tradeCategory: z.string().optional(),
});

const broadcastAcceptSchema = z.object({
  broadcastId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
});

const broadcastDeclineSchema = z.object({
  broadcastId: z.string().uuid(),
  reason: z.string().optional(),
});

const handoverSchema = z.object({
  bookingId: z.string().uuid(),
  newProviderId: z.string().uuid(),
  reason: z.string().min(5),
});

export async function dispatchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // 1. Live PostGIS Radar: Spatial lookup of available technicians within radius
  fastify.get('/radar', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'PostGIS spatial radar search for online technicians within radius',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = radarQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid radar spatial query parameters', requestId)
      );
    }

    const { latitude, longitude, radiusKm, tradeCategory } = parsed.data;
    const radiusMeters = radiusKm * 1000;

    let query = `
      SELECT 
        p.user_id as id,
        p.full_name as "fullName",
        p.trade_category as "tradeCategory",
        p.hourly_rate_cents as "hourlyRateCents",
        p.is_verified as "isVerified",
        pl.duty_status as "dutyStatus",
        ST_Y(pl.location::geometry) as latitude,
        ST_X(pl.location::geometry) as longitude,
        pl.heading_degrees as "headingDegrees",
        pl.last_ping_at as "lastPingAt",
        ROUND((ST_Distance(pl.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000.0)::numeric, 2) as "distanceKm",
        COALESCE(AVG(r.rating), 5.0)::numeric(3, 2) as "averageRating",
        COUNT(r.id)::int as "reviewCount"
      FROM provider_locations pl
      JOIN provider_profiles p ON p.user_id = pl.provider_id AND p.tenant_id = pl.tenant_id
      LEFT JOIN customer_reviews r ON r.provider_id = p.user_id AND r.is_public = TRUE
      WHERE pl.tenant_id = $3
        AND p.is_verified = TRUE
        AND p.is_active = TRUE
        AND pl.duty_status IN ('ONLINE', 'EN_ROUTE')
        AND pl.location IS NOT NULL
        AND ST_DWithin(pl.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $4)
    `;

    const params: any[] = [latitude, longitude, tenantId, radiusMeters];

    if (tradeCategory) {
      params.push(tradeCategory);
      query += ` AND p.trade_category = $${params.length}`;
    }

    query += `
      GROUP BY p.user_id, p.full_name, p.trade_category, p.hourly_rate_cents, p.is_verified,
               pl.duty_status, pl.location, pl.heading_degrees, pl.last_ping_at
      ORDER BY "distanceKm" ASC
      LIMIT 50
    `;

    const result = await tenantQuery(query, params, tenantId);

    // BACK-06: Field-masking for non-dispatchers / customers
    const userRole = request.user?.role;
    const isPrivileged = userRole === 'ADMIN' || userRole === 'STAFF';

    const sanitizedRows = result.rows.map(row => {
      if (isPrivileged) {
        return row;
      }
      return {
        id: row.id,
        fullName: row.fullName,
        tradeCategory: row.tradeCategory,
        isVerified: row.isVerified,
        dutyStatus: row.dutyStatus,
        // Fuzzy coordinate: rounded to 2 decimals (~1.1 km precision) to protect driver privacy
        latitude: Math.round(Number(row.latitude) * 100) / 100,
        longitude: Math.round(Number(row.longitude) * 100) / 100,
        // Coarsened to nearest whole km to prevent 3-point trilateration of exact GPS
        distanceKm: Math.max(1, Math.round(Number(row.distanceKm || 0))),
        averageRating: row.averageRating,
        reviewCount: row.reviewCount
        // hourlyRateCents & headingDegrees omitted for customers
      };
    });

    return reply.status(200).send(
      successResponse(sanitizedRows, requestId)
    );
  });

  // 2. Active Broadcast Feed for Technician (Broadcast offers waiting for response)
  fastify.get('/broadcasts/pending', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Get active pending broadcast offers for the authenticated technician',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;

    const result = await tenantQuery(
      `SELECT 
        b.id as "broadcastId",
        b.booking_id as "bookingId",
        b.offered_payout_cents as "offeredPayoutCents",
        b.expires_at as "expiresAt",
        b.created_at as "createdAt",
        bk.booking_reference as "bookingReference",
        bk.priority,
        bk.scheduled_start as "scheduledStart",
        s.name as "serviceName",
        s.estimated_duration_minutes as "estimatedDurationMinutes",
        ca.address_line1 as "addressLine1",
        ca.city,
        ca.state_province as "state",
        ca.postal_code as "postalCode",
        ST_Y(ca.location::geometry) as "jobLatitude",
        ST_X(ca.location::geometry) as "jobLongitude"
      FROM dispatch_broadcasts b
      JOIN bookings bk ON bk.id = b.booking_id AND bk.tenant_id = $1
      JOIN services s ON s.id = bk.service_id
      JOIN customer_addresses ca ON ca.id = bk.address_id
      WHERE b.provider_id = $2
        AND b.response = 'PENDING'
        AND b.expires_at > NOW()
        AND bk.status IN ('REQUESTED', 'BROADCASTING')
      ORDER BY b.created_at DESC`,
      [tenantId, userId],
      tenantId
    );

    return reply.status(200).send(
      successResponse(result.rows, requestId)
    );
  });

  // 2b. Trigger Dispatch Broadcast Wave for a Booking (Admin / Staff)
  const triggerBroadcastHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const body = request.body as { bookingId?: string; radiusMeters?: number; ttlSeconds?: number };

    if (!body?.bookingId || !z.string().uuid().safeParse(body.bookingId).success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid bookingId UUID is required.', requestId)
      );
    }

    const result = await withTenantTransaction(tenantId, (client) =>
      broadcastBookingToNearbyProviders(client, tenantId, body.bookingId!, {
        radiusMeters: body.radiusMeters,
        ttlSeconds: body.ttlSeconds,
      })
    );
    return reply.status(200).send(successResponse(result, requestId));
  };

  fastify.post('/broadcasts', {
    preHandler: [requirePermission('dispatch:reassign:manual')],
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Broadcast a pending booking to nearby verified online technicians',
      security: [{ bearerAuth: [] }]
    }
  }, triggerBroadcastHandler);

  fastify.post('/broadcast', {
    preHandler: [requirePermission('dispatch:reassign:manual')],
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Alias for triggering a dispatch broadcast wave for a booking',
      security: [{ bearerAuth: [] }]
    }
  }, triggerBroadcastHandler);

  // 3. Accept Broadcast Offer (Lock job in transactional concurrency)
  fastify.post('/broadcasts/accept', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Accept and lock a pending broadcast offer (Provider role)',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;

    const parsed = broadcastAcceptSchema.safeParse(request.body);
    if (!parsed.success || (!parsed.data.broadcastId && !parsed.data.bookingId)) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Must provide broadcastId or bookingId', requestId)
      );
    }

    const txOutcome = await withTenantTransaction<
      | { ok: true; bookingId: string }
      | { ok: false; status: number; code: string; message: string }
    >(tenantId, async (client) => {
      // Verify technician is verified, active, and not already assigned to another active job
      const provRes = await client.query<{ is_verified: boolean; is_active: boolean }>(
        `SELECT is_verified, is_active FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [userId, tenantId]
      );
      if (provRes.rows.length === 0 || !provRes.rows[0].is_verified || !provRes.rows[0].is_active) {
        return {
          ok: false,
          status: 403,
          code: 'PROVIDER_NOT_ELIGIBLE',
          message: 'Only verified active technicians can accept dispatch offers.',
        };
      }

      const activeJobRes = await client.query(
        `SELECT id FROM bookings
         WHERE assigned_provider_id = $1 AND tenant_id = $2 AND status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SITE')
         LIMIT 1`,
        [userId, tenantId]
      );
      if (activeJobRes.rows.length > 0) {
        return {
          ok: false,
          status: 409,
          code: 'PROVIDER_BUSY',
          message: 'Technician already has an active work order in progress.',
        };
      }

      // Find the broadcast offer
      let offerQuery = `
        SELECT db.id, db.booking_id, db.response, db.expires_at, b.status as booking_status
        FROM dispatch_broadcasts db
        JOIN bookings b ON b.id = db.booking_id AND b.tenant_id = $1
        WHERE db.provider_id = $2
      `;
      const params: any[] = [tenantId, userId];

      if (parsed.data.broadcastId) {
        params.push(parsed.data.broadcastId);
        offerQuery += ` AND db.id = $3 FOR UPDATE OF db`;
      } else {
        params.push(parsed.data.bookingId);
        offerQuery += ` AND db.booking_id = $3 FOR UPDATE OF db`;
      }

      const offerRes = await client.query(offerQuery, params);
      if (offerRes.rowCount === 0) {
        return {
          ok: false,
          status: 404,
          code: 'NOT_FOUND',
          message: 'Broadcast offer not found for this provider',
        };
      }

      const offer = offerRes.rows[0];

      if (offer.response !== 'PENDING') {
        return {
          ok: false,
          status: 409,
          code: 'OFFER_CLOSED',
          message: `This offer has already been ${offer.response.toLowerCase()}`,
        };
      }

      if (new Date(offer.expires_at).getTime() < Date.now()) {
        await client.query('UPDATE dispatch_broadcasts SET response = $1 WHERE id = $2', ['EXPIRED', offer.id]);
        return {
          ok: false,
          status: 410,
          code: 'OFFER_EXPIRED',
          message: 'This dispatch offer has expired',
        };
      }

      // Lock booking row
      const bookRes = await client.query(
        `SELECT id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [offer.booking_id, tenantId]
      );

      if (bookRes.rowCount === 0 || !['REQUESTED', 'BROADCASTING'].includes(bookRes.rows[0].status)) {
        return {
          ok: false,
          status: 409,
          code: 'BOOKING_UNAVAILABLE',
          message: 'Booking is no longer available for assignment',
        };
      }

      // Mark this broadcast as ACCEPTED
      await client.query(
        `UPDATE dispatch_broadcasts 
         SET response = 'ACCEPTED', responded_at = NOW() 
         WHERE id = $1`,
        [offer.id]
      );

      // Expire other pending broadcasts for this booking
      await client.query(
        `UPDATE dispatch_broadcasts 
         SET response = 'EXPIRED', responded_at = NOW() 
         WHERE booking_id = $1 AND id <> $2 AND response = 'PENDING'`,
        [offer.booking_id, offer.id]
      );

      // Assign booking and move status to EN_ROUTE
      await client.query(
        `UPDATE bookings 
         SET assigned_provider_id = $1, status = 'EN_ROUTE', updated_at = NOW() 
         WHERE id = $2`,
        [userId, offer.booking_id]
      );

      // Log timeline event
      await client.query(
        `INSERT INTO booking_timeline_events 
          (booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          offer.booking_id,
          tenantId,
          bookRes.rows[0].status,
          'EN_ROUTE',
          userId,
          'Technician Accepted Job',
          'Technician accepted the broadcast offer and is en route to site.'
        ]
      );

      // Update provider duty status
      await client.query(
        `UPDATE provider_locations 
         SET duty_status = 'EN_ROUTE', last_ping_at = NOW() 
         WHERE provider_id = $1 AND tenant_id = $2`,
        [userId, tenantId]
      );

      return { ok: true, bookingId: offer.booking_id };
    });

    if (!txOutcome.ok) {
      return reply.status(txOutcome.status).send(
        errorResponse(txOutcome.code, txOutcome.message, requestId)
      );
    }

    return reply.status(200).send(
      successResponse({
        bookingId: txOutcome.bookingId,
        status: 'EN_ROUTE',
        message: 'Job successfully locked and assigned. You are now en route.'
      }, requestId)
    );
  });

  // 4. Decline Broadcast Offer
  fastify.post('/broadcasts/decline', {
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Decline an incoming broadcast offer (Provider role)',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const userId = request.user!.id;

    const parsed = broadcastDeclineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid decline request', requestId)
      );
    }

    const res = await tenantQuery(
      `UPDATE dispatch_broadcasts
       SET response = 'DECLINED', responded_at = NOW()
       WHERE id = $1 AND provider_id = $2 AND response = 'PENDING'
       RETURNING id, booking_id`,
      [parsed.data.broadcastId, userId],
      tenantId
    );

    if (res.rowCount === 0) {
      return reply.status(404).send(
        errorResponse('NOT_FOUND', 'Active broadcast offer not found', requestId)
      );
    }

    return reply.status(200).send(
      successResponse({ broadcastId: parsed.data.broadcastId, declined: true }, requestId)
    );
  });

  // 5. Emergency Dispatch Handover / Manual Reassignment (Admin/Dispatcher)
  fastify.post('/handover', {
    preHandler: [requirePermission('dispatch:reassign:manual')],
    schema: {
      tags: ['Bookings & Dispatch'],
      summary: 'Admin manual emergency technician handover / reassignment',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const adminUserId = request.user!.id;

    const parsed = handoverSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid handover parameters', requestId)
      );
    }

    const { bookingId, newProviderId, reason } = parsed.data;

    const txOutcome = await withTenantTransaction<
      | { ok: true; providerName: string; safetyPin: string }
      | { ok: false; status: number; code: string; message: string }
    >(tenantId, async (client) => {
      // Verify booking exists and is not already completed
      const bookingRes = await client.query(
        `SELECT id, assigned_provider_id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [bookingId, tenantId]
      );

      if (bookingRes.rowCount === 0) {
        return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Booking not found' };
      }

      const booking = bookingRes.rows[0];
      if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_STATE',
          message: `Cannot reassign booking in ${booking.status} status`,
        };
      }

      // Verify new provider exists, is active, verified, online/idle
      const providerRes = await client.query<{
        user_id: string;
        full_name: string;
        is_verified: boolean;
        profile_active: boolean;
        user_active: boolean;
        duty_status: string | null;
      }>(
        `SELECT p.user_id, p.full_name, p.is_verified,
                p.is_active AS profile_active, u.is_active AS user_active,
                pl.duty_status
         FROM provider_profiles p
         JOIN users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
         LEFT JOIN provider_locations pl ON pl.provider_id = p.user_id AND pl.tenant_id = p.tenant_id
         WHERE p.user_id = $1 AND p.tenant_id = $2`,
        [newProviderId, tenantId]
      );

      if (providerRes.rowCount === 0) {
        return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Target technician not found' };
      }

      const targetProvider = providerRes.rows[0];
      // BACK-07: Enforce verified provider requirement before assignment
      if (!targetProvider.is_verified) {
        return {
          ok: false,
          status: 422,
          code: 'PROVIDER_NOT_VERIFIED',
          message: 'Target technician is not verified for work order dispatch.',
        };
      }
      if (!targetProvider.profile_active || !targetProvider.user_active) {
        return {
          ok: false,
          status: 422,
          code: 'PROVIDER_INACTIVE',
          message: 'Target technician account is deactivated and cannot accept dispatch handovers.',
        };
      }
      if (targetProvider.duty_status === 'OFFLINE') {
        return {
          ok: false,
          status: 409,
          code: 'PROVIDER_OFFLINE',
          message: 'Target technician is currently OFFLINE.',
        };
      }

      const busyRes = await client.query<{ id: string }>(
        `SELECT id FROM bookings
         WHERE tenant_id = $1 AND assigned_provider_id = $2
           AND status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SITE')
           AND id <> $3
         LIMIT 1`,
        [tenantId, newProviderId, bookingId]
      );
      if (busyRes.rows.length > 0) {
        return {
          ok: false,
          status: 409,
          code: 'PROVIDER_BUSY',
          message: 'Target technician already has another active booking in progress.',
        };
      }

      const previousProviderId = booking.assigned_provider_id;

      // Reassign booking and issue a fresh 4-digit arrival PIN + clear prior arrival verification
      const freshArrivalPin = crypto.randomInt(1000, 10000).toString();
      await client.query(
        `UPDATE bookings 
         SET assigned_provider_id = $1,
             status = 'ASSIGNED',
             customer_safety_pin = $3,
             pin_verified_at = NULL,
             geofence_arrival_at = NULL,
             safety_pin_failed_attempts = 0,
             safety_pin_locked_until = NULL,
             safety_pin_last_failed_at = NULL,
             updated_at = NOW() 
         WHERE id = $2`,
        [newProviderId, bookingId, freshArrivalPin]
      );

      await client.query(
        `UPDATE dispatch_broadcasts SET response = 'EXPIRED', responded_at = NOW()
         WHERE booking_id = $1 AND response = 'PENDING'`,
        [bookingId]
      );

      // Reset previous provider's duty status if they have no other active work orders
      if (previousProviderId && previousProviderId !== newProviderId) {
        await client.query(
          `UPDATE provider_locations 
           SET duty_status = 'ONLINE', last_ping_at = NOW() 
           WHERE provider_id = $1 AND tenant_id = $2
             AND NOT EXISTS (
               SELECT 1 FROM bookings
               WHERE assigned_provider_id = $1 AND tenant_id = $2 AND id <> $3
                 AND status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SITE')
             )`,
          [previousProviderId, tenantId, bookingId]
        );
      }

      // Update new provider's duty status
      await client.query(
        `UPDATE provider_locations 
         SET duty_status = 'ON_JOB', last_ping_at = NOW() 
         WHERE provider_id = $1 AND tenant_id = $2`,
        [newProviderId, tenantId]
      );

      // Log timeline event
      await client.query(
        `INSERT INTO booking_timeline_events 
          (booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          bookingId,
          tenantId,
          booking.status,
          'ASSIGNED',
          adminUserId,
          'Emergency Dispatch Handover',
          `Manual reassignment to ${targetProvider.full_name}. Reason: ${reason}`
        ]
      );

      // Audit log entry
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          adminUserId,
          request.user!.role,
          'BOOKING_HANDOVER',
          'booking',
          bookingId,
          JSON.stringify({ previousProviderId, newProviderId, reason })
        ]
      );

      return { ok: true, providerName: targetProvider.full_name, safetyPin: freshArrivalPin };
    });

    if (!txOutcome.ok) {
      return reply.status(txOutcome.status).send(
        errorResponse(txOutcome.code, txOutcome.message, requestId)
      );
    }

    return reply.status(200).send(
      successResponse({
        bookingId,
        assignedProviderId: newProviderId,
        providerName: txOutcome.providerName,
        safetyPin: txOutcome.safetyPin,
        message: 'Booking successfully reassigned to new technician.'
      }, requestId)
    );
  });
}
