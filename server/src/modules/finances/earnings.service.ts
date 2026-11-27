import { tenantQuery } from '../../database/pool.js';

export interface TechnicianEarningsSummary {
  providerId: string;
  fullName: string;
  tradeCategory: string;
  currency: string;
  commissionBps: number;
  completedJobsCount: number;
  grossRevenueCents: number;
  totalEarnedCents: number;
  totalDisbursedCents: number;
  unpaidBalanceCents: number;
  recentPayouts: Array<{
    id: string;
    amountCents: number;
    amountReversedCents: number;
    currency: string;
    status: string;
    transferId: string | null;
    processedAt: string | null;
    createdAt: string;
  }>;
  recentCompletedBookings: Array<{
    bookingId: string;
    bookingReference: string;
    serviceName: string;
    completedAt: string;
    totalAmountCents: number;
    taxTotalCents: number;
    refundedAmountCents: number;
    netEarningCents: number;
  }>;
}

/**
 * Shared self-earnings ledger calculation for a single technician using pre-tax
 * net-of-refund commission splits aligned with POST /finances/payouts.
 */
export async function getTechnicianEarningsSummary(
  tenantId: string,
  providerId: string,
  currencyFallback = 'AED'
): Promise<TechnicianEarningsSummary | null> {
  const summaryRes = await tenantQuery<{
    provider_id: string;
    full_name: string;
    trade_category: string;
    currency_code: string | null;
    commission_bps: number;
    completed_jobs: number;
    gross_revenue_cents: string;
    total_earned_cents: string;
    total_disbursed_cents: string;
  }>(
    `SELECT
       p.user_id AS provider_id,
       p.full_name,
       p.trade_category,
       t.currency_code,
       COALESCE(t.default_platform_commission_bps, 1500) AS commission_bps,
       COALESCE(COUNT(DISTINCT CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED') THEN b.id END), 0)::int AS completed_jobs,
       COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
         THEN GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))
         ELSE 0 END), 0)::bigint AS gross_revenue_cents,
       COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
         THEN GREATEST(
           0,
           ROUND(
             (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
             / GREATEST(1, i.total_amount_cents)::numeric
           ) - ROUND(
             ROUND(
               (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
               / GREATEST(1, i.total_amount_cents)::numeric
             ) * COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) / 10000.0
           )
         )
         ELSE 0 END), 0)::bigint
       + COALESCE((
         SELECT SUM(pb.amount_cents)
         FROM provider_bonuses pb
         WHERE pb.provider_id = p.user_id AND pb.tenant_id = $2 AND pb.status IN ('APPROVED', 'DISBURSED')
       ), 0)::bigint AS total_earned_cents,
       COALESCE((
         SELECT SUM(pp.amount_cents - COALESCE(pp.amount_reversed_cents, 0))
         FROM provider_payouts pp
         WHERE pp.provider_id = p.user_id AND pp.tenant_id = $2
           AND pp.status <> 'FAILED'
           AND (pp.status IN ('PAID', 'PROCESSING', 'PENDING_PROVIDER_CONFIRMATION', 'PARTIALLY_REVERSED') OR pp.stripe_transfer_id IS NOT NULL)
       ), 0)::bigint AS total_disbursed_cents
     FROM provider_profiles p
     JOIN tenants t ON t.id = p.tenant_id
     LEFT JOIN bookings b ON b.assigned_provider_id = p.user_id AND b.tenant_id = p.tenant_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE p.user_id = $1 AND p.tenant_id = $2
     GROUP BY p.user_id, p.full_name, p.trade_category, t.currency_code, t.default_platform_commission_bps`,
    [providerId, tenantId],
    tenantId
  );

  if (summaryRes.rows.length === 0) {
    return null;
  }

  const row = summaryRes.rows[0];
  const [payoutsRes, jobsRes] = await Promise.all([
    tenantQuery(
      `SELECT id, amount_cents, COALESCE(amount_reversed_cents, 0) AS amount_reversed_cents,
              currency, status, stripe_transfer_id, processed_at, created_at
       FROM provider_payouts
       WHERE provider_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [providerId, tenantId],
      tenantId
    ),
    tenantQuery(
      `SELECT b.id AS booking_id, b.booking_reference, s.name AS service_name, b.updated_at AS completed_at,
              COALESCE(i.total_amount_cents, 0) AS total_amount_cents,
              COALESCE(i.tax_total_cents, 0) AS tax_total_cents,
              COALESCE(i.refunded_amount_cents, 0) AS refunded_amount_cents,
              CASE WHEN i.id IS NOT NULL AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
                THEN GREATEST(
                  0,
                  ROUND(
                    (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                    / GREATEST(1, i.total_amount_cents)::numeric
                  ) - ROUND(
                    ROUND(
                      (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                      / GREATEST(1, i.total_amount_cents)::numeric
                    ) * COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) / 10000.0
                  )
                )
                ELSE 0
              END::bigint AS net_earning_cents
       FROM bookings b
       JOIN tenants t ON t.id = b.tenant_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.assigned_provider_id = $1 AND b.tenant_id = $2 AND b.status = 'COMPLETED'
       ORDER BY b.updated_at DESC
       LIMIT 20`,
      [providerId, tenantId],
      tenantId
    ),
  ]);

  const totalEarnedCents = Number(row.total_earned_cents || 0);
  const totalDisbursedCents = Number(row.total_disbursed_cents || 0);

  return {
    providerId: row.provider_id,
    fullName: row.full_name,
    tradeCategory: row.trade_category,
    currency: (row.currency_code || currencyFallback || 'AED').toUpperCase(),
    commissionBps: Number(row.commission_bps),
    completedJobsCount: Number(row.completed_jobs || 0),
    grossRevenueCents: Number(row.gross_revenue_cents || 0),
    totalEarnedCents,
    totalDisbursedCents,
    unpaidBalanceCents: Math.max(0, totalEarnedCents - totalDisbursedCents),
    recentPayouts: payoutsRes.rows.map((p: any) => ({
      id: p.id,
      amountCents: Number(p.amount_cents),
      amountReversedCents: Number(p.amount_reversed_cents || 0),
      currency: p.currency,
      status: p.status,
      transferId: p.stripe_transfer_id ?? null,
      processedAt: p.processed_at ?? null,
      createdAt: p.created_at,
    })),
    recentCompletedBookings: jobsRes.rows.map((j: any) => ({
      bookingId: j.booking_id,
      bookingReference: j.booking_reference,
      serviceName: j.service_name,
      completedAt: j.completed_at,
      totalAmountCents: Number(j.total_amount_cents || 0),
      taxTotalCents: Number(j.tax_total_cents || 0),
      refundedAmountCents: Number(j.refunded_amount_cents || 0),
      netEarningCents: Number(j.net_earning_cents || 0),
    })),
  };
}
