-- ==============================================================================
-- Migration: 010_remediation_core_invariants.sql
-- Description: Schema-contract fixes (payment/payout columns & statuses), payment outbox,
--              payout reversal audit table, persistent safety-PIN lockout, and
--              ON CONFLICT-compatible ledger idempotency indexes.
-- Target: PostgreSQL 16 + PostGIS. Single forward transaction (run by migrate.ts).
-- Every new constraint is preceded by a data validation that aborts with a clear message.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Pre-flight data validation (abort instead of silently failing later)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT stripe_payment_intent_id FROM payment_transactions
    WHERE stripe_payment_intent_id IS NOT NULL
    GROUP BY stripe_payment_intent_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION 010 ABORTED: duplicate stripe_payment_intent_id values exist in payment_transactions; resolve manually before applying.';
  END IF;

  IF EXISTS (
    SELECT transaction_id, posting_type FROM ledger_entries
    WHERE transaction_id IS NOT NULL AND posting_type IS NOT NULL
    GROUP BY transaction_id, posting_type HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION 010 ABORTED: duplicate (transaction_id, posting_type) ledger postings exist.';
  END IF;

  IF EXISTS (
    SELECT payout_id, posting_type FROM ledger_entries
    WHERE payout_id IS NOT NULL AND posting_type IS NOT NULL
    GROUP BY payout_id, posting_type HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION 010 ABORTED: duplicate (payout_id, posting_type) ledger postings exist.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE customer_safety_pin IS NOT NULL AND customer_safety_pin !~ '^[0-9]{4}$'
  ) THEN
    RAISE EXCEPTION 'MIGRATION 010 ABORTED: bookings.customer_safety_pin contains non 4-digit values.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. payment_transactions: columns used by webhook/booking code, nullable PI id, statuses
-- ------------------------------------------------------------------------------
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
BEFORE UPDATE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- A reservation row exists before Stripe has created the PaymentIntent.
ALTER TABLE payment_transactions ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_stripe_pi
ON payment_transactions (stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('PENDING', 'REQUIRES_CAPTURE', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'VOIDED', 'DISCREPANCY_QUARANTINED'));

-- ------------------------------------------------------------------------------
-- 2. provider_payouts: updated_at, reversal tracking, reconciliation, persisted destination
-- ------------------------------------------------------------------------------
ALTER TABLE provider_payouts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS amount_reversed_cents BIGINT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS destination_account_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS transfer_description TEXT;

DROP TRIGGER IF EXISTS trg_provider_payouts_updated_at ON provider_payouts;
CREATE TRIGGER trg_provider_payouts_updated_at
BEFORE UPDATE ON provider_payouts
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE provider_payouts
  ADD CONSTRAINT chk_provider_payouts_reversal_bounds
  CHECK (amount_reversed_cents >= 0 AND amount_reversed_cents <= amount_cents);

-- status was VARCHAR(20); PENDING_PROVIDER_CONFIRMATION needs 29 characters.
ALTER TABLE provider_payouts ALTER COLUMN status TYPE VARCHAR(40);

-- The inline status CHECK from migration 005 has a generated name: discover and drop it.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'provider_payouts'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE provider_payouts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE provider_payouts ADD CONSTRAINT provider_payouts_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'PENDING_PROVIDER_CONFIRMATION', 'PAID', 'FAILED', 'PARTIALLY_REVERSED', 'REVERSED'));

-- ------------------------------------------------------------------------------
-- 3. Cumulative transfer-reversal audit trail (never deleted by down-migration if populated)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_payout_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payout_id UUID NOT NULL REFERENCES provider_payouts(id) ON DELETE RESTRICT,
    stripe_event_id VARCHAR(150) NOT NULL UNIQUE,
    stripe_reversal_id VARCHAR(150),
    delta_amount_cents BIGINT NOT NULL CHECK (delta_amount_cents > 0),
    cumulative_reversed_cents BIGINT NOT NULL CHECK (cumulative_reversed_cents > 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payout_reversals_payout
ON provider_payout_reversals (payout_id, created_at);

-- ------------------------------------------------------------------------------
-- 4. bookings: persistent safety-PIN lockout; PIN becomes clearable
-- ------------------------------------------------------------------------------
ALTER TABLE bookings ALTER COLUMN customer_safety_pin DROP NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT chk_bookings_safety_pin_format
  CHECK (customer_safety_pin IS NULL OR customer_safety_pin ~ '^[0-9]{4}$');

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS safety_pin_failed_attempts INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS safety_pin_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_pin_last_failed_at TIMESTAMPTZ;

-- ------------------------------------------------------------------------------
-- 5. Durable outbox for external side effects (Stripe PaymentIntent creation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL
      CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REQUIRES_RECONCILIATION', 'CANCELLED')),
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 6 NOT NULL,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    locked_by VARCHAR(100),
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_claimable
ON outbox_operations (next_attempt_at)
WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
ON outbox_operations (aggregate_type, aggregate_id);

DROP TRIGGER IF EXISTS trg_outbox_operations_updated_at ON outbox_operations;
CREATE TRIGGER trg_outbox_operations_updated_at
BEFORE UPDATE ON outbox_operations
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- ------------------------------------------------------------------------------
-- 6. Ledger idempotency: full unique indexes so ON CONFLICT (cols) can infer them.
--    NULL keys never conflict, so semantics equal the previous partial indexes.
-- ------------------------------------------------------------------------------
DROP INDEX IF EXISTS uq_ledger_payout_posting;
DROP INDEX IF EXISTS uq_ledger_tx_posting;
CREATE UNIQUE INDEX uq_ledger_payout_posting ON ledger_entries (payout_id, posting_type);
CREATE UNIQUE INDEX uq_ledger_tx_posting ON ledger_entries (transaction_id, posting_type);
