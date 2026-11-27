/**
 * Pure Double-Entry Accounting & Commission Split Helpers.
 * Shared across bookings, finances, and unit tests to guarantee exact cent conservation.
 */

export interface SettlementSplit {
  totalCents: number;
  taxCents: number;
  preTaxNetCents: number;
  commissionBps: number;
  platformFeeCents: number;
  techPayoutCents: number;
}

export function computeTaxAndCommissionSplit(
  grossTotalCents: number,
  taxCents: number,
  commissionBps: number
): SettlementSplit {
  const safeTotal = Math.max(0, Math.round(grossTotalCents));
  const safeTax = Math.max(0, Math.min(safeTotal, Math.round(taxCents)));
  const preTaxNetCents = Math.max(0, safeTotal - safeTax);
  const safeBps = Math.max(0, Math.min(10000, Math.round(commissionBps)));
  const platformFeeCents = Math.round((preTaxNetCents * safeBps) / 10000);
  const techPayoutCents = Math.max(0, preTaxNetCents - platformFeeCents);

  return {
    totalCents: safeTotal,
    taxCents: safeTax,
    preTaxNetCents,
    commissionBps: safeBps,
    platformFeeCents,
    techPayoutCents,
  };
}

export interface ProportionalRefundSplit {
  refundCents: number;
  taxReversalCents: number;
  platformFeeReversalCents: number;
  techPayableReversalCents: number;
}

export function computeProportionalRefundSplit(
  refundCents: number,
  invoiceTotalCents: number,
  invoiceTaxCents: number,
  commissionBps: number
): ProportionalRefundSplit {
  const safeRefund = Math.max(0, Math.round(refundCents));
  const safeTotal = Math.max(1, Math.round(invoiceTotalCents));
  const safeTax = Math.max(0, Math.min(safeTotal, Math.round(invoiceTaxCents)));

  const taxReversalCents = Math.min(
    safeRefund,
    Math.round((safeTax * safeRefund) / safeTotal)
  );
  const preTaxRefund = Math.max(0, safeRefund - taxReversalCents);
  const safeBps = Math.max(0, Math.min(10000, Math.round(commissionBps)));
  const platformFeeReversalCents = Math.round((preTaxRefund * safeBps) / 10000);
  const techPayableReversalCents = Math.max(0, preTaxRefund - platformFeeReversalCents);

  return {
    refundCents: safeRefund,
    taxReversalCents,
    platformFeeReversalCents,
    techPayableReversalCents,
  };
}
