import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';

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
        AND pl.duty_status IN ('ONLINE', 'EN_ROUTE')
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

    const result = await pool.query(query, params);

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
        distanceKm: row.distanceKm,
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

    const result = await pool.query(
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
      [tenantId, userId]
    );

    return reply.status(200).send(
      successResponse(result.rows, requestId)
    );
  });

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('NOT_FOUND', 'Broadcast offer not found for this provider', requestId)
        );
      }

      const offer = offerRes.rows[0];

      if (offer.response !== 'PENDING') {
        await client.query('ROLLBACK');
        return reply.status(409).send(
          errorResponse('OFFER_CLOSED', `This offer has already been ${offer.response.toLowerCase()}`, requestId)
        );
      }

      if (new Date(offer.expires_at).getTime() < Date.now()) {
        await client.query('UPDATE dispatch_broadcasts SET response = $1 WHERE id = $2', ['EXPIRED', offer.id]);
        await client.query('COMMIT');
        return reply.status(410).send(
          errorResponse('OFFER_EXPIRED', 'This dispatch offer has expired', requestId)
        );
      }

      // Lock booking row
      const bookRes = await client.query(
        `SELECT id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [offer.booking_id, tenantId]
      );

      if (bookRes.rowCount === 0 || !['REQUESTED', 'BROADCASTING'].includes(bookRes.rows[0].status)) {
        await client.query('ROLLBACK');
        return reply.status(409).send(
          errorResponse('BOOKING_UNAVAILABLE', 'Booking is no longer available for assignment', requestId)
        );
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

      await client.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          bookingId: offer.booking_id,
          status: 'EN_ROUTE',
          message: 'Job successfully locked and assigned. You are now en route.'
        }, requestId)
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

    const res = await pool.query(
      `UPDATE dispatch_broadcasts
       SET response = 'DECLINED', responded_at = NOW()
       WHERE id = $1 AND provider_id = $2 AND response = 'PENDING'
       RETURNING id, booking_id`,
      [parsed.data.broadcastId, userId]
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify booking exists and is not already completed
      const bookingRes = await client.query(
        `SELECT id, assigned_provider_id, status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [bookingId, tenantId]
      );

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('NOT_FOUND', 'Booking not found', requestId)
        );
      }

      const booking = bookingRes.rows[0];
      if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
        await client.query('ROLLBACK');
        return reply.status(400).send(
          errorResponse('INVALID_STATE', `Cannot reassign booking in ${booking.status} status`, requestId)
        );
      }

      // Verify new provider exists and is verified
      const providerRes = await client.query(
        `SELECT user_id, full_name, is_verified FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2`,
        [newProviderId, tenantId]
      );

      if (providerRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorResponse('NOT_FOUND', 'Target technician not found', requestId)
        );
      }

      const targetProvider = providerRes.rows[0];
      // BACK-07: Enforce verified provider requirement before assignment
      if (!targetProvider.is_verified) {
        await client.query('ROLLBACK');
        return reply.status(422).send(
          errorResponse('PROVIDER_NOT_VERIFIED', 'Target technician is not verified for work order dispatch.', requestId)
        );
      }

      const previousProviderId = booking.assigned_provider_id;

      // Reassign booking
      await client.query(
        `UPDATE bookings 
         SET assigned_provider_id = $1, status = 'ASSIGNED', updated_at = NOW() 
         WHERE id = $2`,
        [newProviderId, bookingId]
      );

      // Reset previous provider's duty status if they were on this job
      if (previousProviderId) {
        await client.query(
          `UPDATE provider_locations 
           SET duty_status = 'ONLINE', last_ping_at = NOW() 
           WHERE provider_id = $1 AND tenant_id = $2`,
          [previousProviderId, tenantId]
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
          `Manual reassignment to ${providerRes.rows[0].full_name}. Reason: ${reason}`
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

      await client.query('COMMIT');

      return reply.status(200).send(
        successResponse({
          bookingId,
          assignedProviderId: newProviderId,
          providerName: providerRes.rows[0].full_name,
          message: 'Booking successfully reassigned to new technician.'
        }, requestId)
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
