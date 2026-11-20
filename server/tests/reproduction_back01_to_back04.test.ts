import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Financial Integrity Reproduction & Verification Suite (BACK-01 through BACK-04)', () => {
  const financesFilePath = path.resolve(process.cwd(), 'src/modules/finances/finances.routes.ts');
  const bookingsFilePath = path.resolve(process.cwd(), 'src/modules/bookings/bookings.routes.ts');

  const financesSrc = fs.readFileSync(financesFilePath, 'utf8');
  const bookingsSrc = fs.readFileSync(bookingsFilePath, 'utf8');

  // ============================================================================
  // BACK-01: Stripe Webhook Validation & Settlement Invariants
  // ============================================================================
  it('BACK-01 Invariant: Webhook handler must validate amount_received and currency from Stripe event', () => {
    const webhookSection = financesSrc.slice(
      financesSrc.indexOf("if (eventType === 'payment_intent.succeeded')"),
      financesSrc.indexOf("else if (eventType === 'payment_intent.payment_failed')")
    );

    assert.ok(webhookSection.length > 0, 'payment_intent.succeeded handler block must exist');

    // The verified invariant: Must read amount_received from paymentIntent
    const readsAmountReceived = webhookSection.includes('amount_received') || webhookSection.includes('amountReceived');
    assert.ok(
      readsAmountReceived,
      'DEFECT BACK-01: Webhook handler currently blindly copies authorized_amount_cents without reading paymentIntent.amount_received'
    );

    // The verified invariant: Must update invoices to PAID
    const updatesInvoice = webhookSection.includes('UPDATE invoices') && webhookSection.includes('PAID');
    assert.ok(
      updatesInvoice,
      'DEFECT BACK-01: Webhook handler fails to update invoices table to PAID upon successful payment capture'
    );

    // The verified invariant: Must post double-entry ledger entries
    const postsLedger = webhookSection.includes('INSERT INTO ledger_entries');
    assert.ok(
      postsLedger,
      'DEFECT BACK-01: Webhook handler fails to post double-entry ledger entries upon payment capture'
    );
  });

  // ============================================================================
  // BACK-02: Stripe Capture Must NOT Be Executed Inside Open SQL Transaction
  // ============================================================================
  it('BACK-02 Invariant: Stripe paymentIntents.capture must NOT be called inside an open SQL transaction block', () => {
    const completeRoute = bookingsSrc.slice(
      bookingsSrc.indexOf("fastify.post('/:id/complete',"),
      bookingsSrc.indexOf("fastify.post('/:id/cancel',")
    );

    assert.ok(completeRoute.length > 0, 'POST /:id/complete route definition must exist');

    // Find indices of BEGIN, Stripe capture, and final COMMIT
    const beginIndex = completeRoute.indexOf(".query('BEGIN')");
    const captureIndex = completeRoute.indexOf("stripe.paymentIntents.capture");
    const finalCommitIndex = completeRoute.lastIndexOf(".query('COMMIT')");

    assert.ok(beginIndex !== -1, 'Database transaction BEGIN must exist');
    assert.ok(finalCommitIndex !== -1, 'Database transaction COMMIT must exist');
    assert.ok(captureIndex !== -1, 'Stripe capture call must be present');

    // The verified invariant: Stripe capture must be executed BEFORE or OUTSIDE the open SQL transaction
    const isInsideTransaction = captureIndex > beginIndex && captureIndex < finalCommitIndex;
    assert.equal(
      isInsideTransaction,
      false,
      'Stripe paymentIntents.capture must NOT be executed inside open SQL transaction (between BEGIN and COMMIT)'
    );
  });

  // ============================================================================
  // BACK-03: Ledger Deduplication Must NOT Use description LIKE Text Search
  // ============================================================================
  it('BACK-03 Invariant: Payout and reconcile routes must NOT rely on description LIKE for ledger deduplication', () => {
    // Check that fragile 'description LIKE' is eliminated from payout retry
    assert.equal(
      financesSrc.includes("description LIKE $3"),
      false,
      'DEFECT BACK-03: Payout idempotency still falls back to fragile description LIKE search instead of unique constraints'
    );

    assert.equal(
      financesSrc.includes("description LIKE $2"),
      false,
      'DEFECT BACK-03: Reconcile route still falls back to fragile description LIKE search'
    );
  });

  // ============================================================================
  // BACK-04: Payout State Machine & Double Disbursal Invariants
  // ============================================================================
  it('BACK-04 Invariant: Payout balance calculation must track all processing and confirmed transfers', () => {
    // Balance calculation must check all active and confirmed states
    assert.match(
      financesSrc,
      /status\s+IN\s*\([^)]*TRANSFER_CONFIRMED[^)]*\)/,
      'DEFECT BACK-04: Payout balance query must recognize TRANSFER_CONFIRMED state'
    );

    assert.match(
      financesSrc,
      /stripe_transfer_id\s+IS\s+NOT\s+NULL/,
      'DEFECT BACK-04: Balance calculation must include any payout with an external transfer ID regardless of local status'
    );

    // Webhook must support transfer.reversed to prevent stranded balances
    const handlesTransferReversed = financesSrc.includes("transfer.reversed");
    assert.ok(
      handlesTransferReversed,
      'DEFECT BACK-04: Webhook handler must handle transfer.reversed to mark payouts REVERSED'
    );

    // Webhook must support payout.failed
    const handlesPayoutFailed = financesSrc.includes("payout.failed");
    assert.ok(
      handlesPayoutFailed,
      'DEFECT BACK-04: Webhook handler must handle payout.failed to mark payouts FAILED'
    );
  });
});
