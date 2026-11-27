import { PoolClient } from 'pg';

export interface BroadcastResult {
  broadcastsCreated: number;
  providerIds: string[];
  bookingStatus: string;
}

/**
 * Finds verified, active, online technicians within `radiusMeters` of the booking's
 * service address, inserts timed `dispatch_broadcasts` offers, and transitions the
 * booking from REQUESTED -> BROADCASTING when at least one offer is created.
 */
export async function broadcastBookingToNearbyProviders(
  client: PoolClient,
  tenantId: string,
  bookingId: string,
  opts: { radiusMeters?: number; ttlSeconds?: number; maxProviders?: number } = {}
): Promise<BroadcastResult> {
  const radiusMeters = opts.radiusMeters ?? 50000;
  const ttlSeconds = opts.ttlSeconds ?? 300;
  const maxProviders = opts.maxProviders ?? 10;

  const bookingRes = await client.query<{
    id: string;
    status: string;
    total_amount_cents: string | null;
    tax_total_cents: string | null;
    commission_bps: number | null;
    address_id: string;
  }>(
    `SELECT b.id, b.status, i.total_amount_cents, COALESCE(i.tax_total_cents, 0) AS tax_total_cents,
            COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) AS commission_bps, b.address_id
     FROM bookings b
     JOIN tenants t ON t.id = b.tenant_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [bookingId, tenantId]
  );

  if (bookingRes.rows.length === 0) {
    return { broadcastsCreated: 0, providerIds: [], bookingStatus: 'UNKNOWN' };
  }

  const bk = bookingRes.rows[0];
  if (!['REQUESTED', 'BROADCASTING'].includes(bk.status)) {
    return { broadcastsCreated: 0, providerIds: [], bookingStatus: bk.status };
  }

  const totalCents = Number(bk.total_amount_cents || 0);
  const taxCents = Number(bk.tax_total_cents || 0);
  const preTaxCents = Math.max(0, totalCents - taxCents);
  const commissionBps = Number(bk.commission_bps ?? 1500);
  const platformFeeCents = Math.round(preTaxCents * (commissionBps / 10000));
  const offeredPayoutCents = Math.max(0, preTaxCents - platformFeeCents);

  const nearbyRes = await client.query<{ provider_id: string }>(
    `SELECT pp.user_id AS provider_id
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id AND u.is_active = TRUE
     JOIN provider_locations pl ON pl.provider_id = pp.user_id AND pl.tenant_id = $1
     JOIN customer_addresses ca ON ca.id = $2
     WHERE pp.tenant_id = $1
       AND pp.is_verified = TRUE
       AND pp.is_active = TRUE
       AND pl.duty_status = 'ONLINE'
       AND pl.location IS NOT NULL
       AND ST_DWithin(pl.location, ca.location, $3)
     ORDER BY ST_Distance(pl.location, ca.location) ASC
     LIMIT $4`,
    [tenantId, bk.address_id, radiusMeters, maxProviders]
  );

  const providerIds: string[] = [];
  for (const row of nearbyRes.rows) {
    const ins = await client.query<{ provider_id: string }>(
      `INSERT INTO dispatch_broadcasts (booking_id, provider_id, offered_payout_cents, expires_at, response)
       VALUES ($1, $2, $3, NOW() + ($4::text || ' seconds')::interval, 'PENDING')
       ON CONFLICT (booking_id, provider_id) DO NOTHING
       RETURNING provider_id`,
      [bookingId, row.provider_id, offeredPayoutCents, ttlSeconds]
    );
    if (ins.rows.length > 0) {
      providerIds.push(ins.rows[0].provider_id);
    }
  }

  let bookingStatus = bk.status;
  if (providerIds.length > 0 && bk.status === 'REQUESTED') {
    await client.query(
      `UPDATE bookings SET status = 'BROADCASTING', updated_at = NOW() WHERE id = $1 AND status = 'REQUESTED'`,
      [bookingId]
    );
    bookingStatus = 'BROADCASTING';
  }

  return {
    broadcastsCreated: providerIds.length,
    providerIds,
    bookingStatus,
  };
}
