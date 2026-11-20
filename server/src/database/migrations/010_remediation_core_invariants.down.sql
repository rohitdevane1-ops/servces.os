-- ==============================================================================
-- Migration: 010_remediation_core_invariants.down.sql
-- Safe rollback: REFUSES to run if it would discard financial / audit data.
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM provider_payout_reversals) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: provider_payout_reversals contains financial audit rows.';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_payouts WHERE amount_reversed_cents > 0) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: provider_payouts has recorded reversal amounts.';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_payouts WHERE status IN ('PENDING_PROVIDER_CONFIRMATION', 'PARTIALLY_REVERSED', 'REVERSED')) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: provider_payouts rows use statuses that do not exist in the previous schema.';
  END IF;
  IF EXISTS (SELECT 1 FROM outbox_operations) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: outbox_operations contains rows (payment correlation history).';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_transactions WHERE stripe_payment_intent_id IS NULL) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: payment_transactions has reservations without a PaymentIntent id.';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_transactions WHERE status = 'DISCREPANCY_QUARANTINED') THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: quarantined payment transactions exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_transactions WHERE currency <> 'USD' OR error_message IS NOT NULL) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: payment_transactions currency/error_message data would be lost.';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE customer_safety_pin IS NULL) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: bookings with cleared PINs exist; NOT NULL cannot be restored.';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE safety_pin_failed_attempts > 0 OR safety_pin_locked_until IS NOT NULL) THEN
    RAISE EXCEPTION 'MIGRATION 010 ROLLBACK ABORTED: active safety-PIN lockout state exists.';
  END IF;
END $$;

-- Ledger indexes back to their migration-009 (partial) definitions
DROP INDEX IF EXISTS uq_ledger_payout_posting;
DROP INDEX IF EXISTS uq_ledger_tx_posting;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_payout_posting
ON ledger_entries (payout_id, posting_type) WHERE payout_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_tx_posting
ON ledger_entries (transaction_id, posting_type) WHERE transaction_id IS NOT NULL;

DROP TABLE IF EXISTS outbox_operations;
DROP TABLE IF EXISTS provider_payout_reversals;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bookings_safety_pin_format;
ALTER TABLE bookings
  DROP COLUMN IF EXISTS safety_pin_failed_attempts,
  DROP COLUMN IF EXISTS safety_pin_locked_until,
  DROP COLUMN IF EXISTS safety_pin_last_failed_at;
ALTER TABLE bookings ALTER COLUMN customer_safety_pin SET NOT NULL;

ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_status_check;
ALTER TABLE provider_payouts ALTER COLUMN status TYPE VARCHAR(20);
ALTER TABLE provider_payouts ADD CONSTRAINT provider_payouts_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED'));
ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS chk_provider_payouts_reversal_bounds;
DROP TRIGGER IF EXISTS trg_provider_payouts_updated_at ON provider_payouts;
ALTER TABLE provider_payouts
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS amount_reversed_cents,
  DROP COLUMN IF EXISTS last_reconciled_at,
  DROP COLUMN IF EXISTS reconcile_attempts,
  DROP COLUMN IF EXISTS destination_account_id,
  DROP COLUMN IF EXISTS transfer_description;

DROP INDEX IF EXISTS uq_payment_tx_stripe_pi;
ALTER TABLE payment_transactions ALTER COLUMN stripe_payment_intent_id SET NOT NULL;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('PENDING', 'REQUIRES_CAPTURE', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'VOIDED'));
DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON payment_transactions;
ALTER TABLE payment_transactions
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS error_message;
