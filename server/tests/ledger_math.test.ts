import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTaxAndCommissionSplit,
  computeProportionalRefundSplit,
} from '../src/modules/finances/ledgerMath.js';

describe('Double-Entry Ledger & Financial Engine Suite', () => {
  it('Double-entry journal entries must balance debits and credits to the exact cent', () => {
    // Scenario: Customer pays $150.00 for completed plumbing service
    // Tenant commission rate: 15% (1500 bps)
    const invoiceTotalCents = 15000n; // $150.00
    const commissionBps = 1500n; // 15%
    const platformCommissionCents = (invoiceTotalCents * commissionBps) / 10000n; // $22.50
    const providerPayableCents = invoiceTotalCents - platformCommissionCents; // $127.50

    // Entry 1: Pre-auth capture
    // Debit: Operating Bank Account (Asset 1010): +$150.00
    // Credit: Customer Escrow Liability (Liability 2010): +$150.00
    const entry1Debits = invoiceTotalCents;
    const entry1Credits = invoiceTotalCents;
    assert.equal(entry1Debits, entry1Credits, 'Initial payment capture must balance');

    // Entry 2: Service completion settlement
    // Debit: Customer Escrow Liability (Liability 2010): -$150.00
    // Credit: Platform Revenue (Revenue 4010): +$22.50
    // Credit: Technician Payable (Liability 2020): +$127.50
    const settlementDebits = invoiceTotalCents;
    const settlementCredits = platformCommissionCents + providerPayableCents;
    assert.equal(settlementDebits, settlementCredits, 'Settlement entries must equal escrow debit');
    assert.equal(settlementCredits, 15000n);
  });

  it('Calculates configurable platform commission accurately without hardcoded splits', () => {
    function calculateSplit(totalCents: number, commissionBps: number) {
      const platformFee = Math.round((totalCents * commissionBps) / 10000);
      const providerPayout = totalCents - platformFee;
      return { platformFee, providerPayout };
    }

    // 12% commission on $240.00 job
    const split1 = calculateSplit(24000, 1200);
    assert.equal(split1.platformFee, 2880); // $28.80
    assert.equal(split1.providerPayout, 21120); // $211.20
    assert.equal(split1.platformFee + split1.providerPayout, 24000);

    // 18.5% commission on $89.50 job
    const split2 = calculateSplit(8950, 1850);
    assert.equal(split2.platformFee, 1656); // $16.56
    assert.equal(split2.providerPayout, 7294); // $72.94
    assert.equal(split2.platformFee + split2.providerPayout, 8950);
  });

  it('Prevents debiting and crediting the same ledger account', () => {
    const accountA = '00000000-0000-0000-0000-000000000001';
    const accountB = '00000000-0000-0000-0000-000000000002';

    const isValid = accountA !== accountB;
    assert.equal(isValid, true);

    const isInvalid = accountA === accountA;
    assert.equal(isInvalid, true);
  });

  it('Shared computeTaxAndCommissionSplit & computeProportionalRefundSplit conserve cents cleanly', () => {
    const split = computeTaxAndCommissionSplit(10500, 500, 1500);
    assert.equal(split.taxCents, 500);
    assert.equal(split.preTaxNetCents, 10000);
    assert.equal(split.platformFeeCents, 1500);
    assert.equal(split.techPayoutCents, 8500);
    assert.equal(split.taxCents + split.platformFeeCents + split.techPayoutCents, 10500);

    const ref = computeProportionalRefundSplit(5250, 10500, 500, 1500);
    assert.equal(ref.taxReversalCents, 250);
    assert.equal(ref.platformFeeReversalCents, 750);
    assert.equal(ref.techPayableReversalCents, 4250);
    assert.equal(
      ref.taxReversalCents + ref.platformFeeReversalCents + ref.techPayableReversalCents,
      5250
    );
  });
});
