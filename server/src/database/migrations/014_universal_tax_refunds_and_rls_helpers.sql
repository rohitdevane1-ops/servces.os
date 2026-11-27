-- ==============================================================================
-- Migration: 014_universal_tax_refunds_and_rls_helpers.sql
-- Purpose:
--   1. Universal multi-country tenant configuration (country, tax name, distance
--      unit, emergency phone, map center, relaxed ISO locale, unified logo_url).
--   2. Backfill COA 2030 ('Tax / VAT / GST Payable', LIABILITY) for all tenants.
--   3. Durable payment_refunds audit & reservation table with FORCE RLS.
--   4. SECURITY DEFINER helpers for pre-tenant/system operations under FORCE RLS:
--      - rls_resolve_session_tenant(token_hash)
--      - rls_resolve_webhook_tenant(pi_id, invoice_id, transfer_id, booking_id)
--      - rls_claim_next_outbox_job(worker_id, lease_ms)
--      - rls_renew_outbox_lease(job_id, worker_id, lease_ms)
-- Target: PostgreSQL 16 + PostGIS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Universal Multi-Country Tenant Columns & Locale/Unit Constraints
-- ------------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'AE' NOT NULL,
  ADD COLUMN IF NOT EXISTS tax_name VARCHAR(40) DEFAULT 'VAT' NOT NULL,
  ADD COLUMN IF NOT EXISTS distance_unit VARCHAR(5) DEFAULT 'km' NOT NULL,
  ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(40),
  ADD COLUMN IF NOT EXISTS default_map_lat NUMERIC(9, 6) DEFAULT 25.204800 NOT NULL,
  ADD COLUMN IF NOT EXISTS default_map_lng NUMERIC(9, 6) DEFAULT 55.270800 NOT NULL;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_distance_unit;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_distance_unit
  CHECK (distance_unit IN ('km', 'mi'));

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_country_code;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_country_code
  CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_locale;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_default_locale
  CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$');

UPDATE tenants
SET logo_url = brand_logo_url
WHERE logo_url IS NULL
  AND brand_logo_url IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Backfill COA 2030 Tax / VAT / GST Payable Liability Account (FORCE RLS safe)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id, currency_code FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
    SELECT t.id, '2030', 'Tax / VAT / GST Payable', 'LIABILITY', t.currency_code
    WHERE NOT EXISTS (
      SELECT 1
      FROM ledger_accounts la
      WHERE la.tenant_id = t.id
        AND la.account_number = '2030'
    );
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);
END $$;

-- ------------------------------------------------------------------------------
-- 3. Durable payment_refunds Table with FORCE ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES bookings(id) ON DELETE RESTRICT,
    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(150) NOT NULL,
    stripe_refund_id VARCHAR(150),
    stripe_event_id VARCHAR(150),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(10) DEFAULT 'AED' NOT NULL,
    reason VARCHAR(120),
    notes TEXT,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL
      CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REQUIRES_RECONCILIATION')),
    ledger_posted BOOLEAN DEFAULT FALSE NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_payment_refunds_tenant_idem UNIQUE (tenant_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_refunds_stripe_refund
  ON payment_refunds (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_refunds_stripe_event
  ON payment_refunds (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_refunds_tx
  ON payment_refunds (payment_transaction_id, created_at);

DROP TRIGGER IF EXISTS trg_payment_refunds_updated_at ON payment_refunds;
CREATE TRIGGER trg_payment_refunds_updated_at
BEFORE UPDATE ON payment_refunds
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON payment_refunds;
CREATE POLICY tenant_isolation_policy ON payment_refunds
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ------------------------------------------------------------------------------
-- 4. SECURITY DEFINER RLS Helpers for Pre-Auth / Webhook / Outbox Resolution
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rls_resolve_session_tenant(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id
  FROM user_sessions
  WHERE refresh_token_hash = p_token_hash
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION rls_resolve_webhook_tenant(
  p_payment_intent_id TEXT DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_transfer_id TEXT DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL,
  p_connect_account_id TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF p_payment_intent_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM payment_transactions
    WHERE stripe_payment_intent_id = p_payment_intent_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM payment_transactions
    WHERE id = p_transaction_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM invoices
    WHERE id = p_invoice_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM bookings
    WHERE id = p_booking_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  IF p_transfer_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM provider_payouts
    WHERE stripe_transfer_id = p_transfer_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  IF p_connect_account_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM provider_profiles
    WHERE stripe_connect_account_id = p_connect_account_id
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rls_claim_next_outbox_job(
  p_worker_id TEXT,
  p_lease_ms INTEGER DEFAULT 60000
) RETURNS SETOF outbox_operations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH next_job AS (
    SELECT id
    FROM outbox_operations
    WHERE (
      (status = 'PENDING' AND next_attempt_at <= NOW())
      OR (status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= NOW())
    )
    ORDER BY next_attempt_at ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE outbox_operations o
  SET
    status = 'PROCESSING',
    locked_by = p_worker_id,
    lease_expires_at = NOW() + (GREATEST(1000, p_lease_ms)::text || ' milliseconds')::interval,
    attempts = o.attempts + 1,
    updated_at = NOW()
  FROM next_job
  WHERE o.id = next_job.id
  RETURNING o.*;
$$;

CREATE OR REPLACE FUNCTION rls_renew_outbox_lease(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_ms INTEGER DEFAULT 60000
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE outbox_operations
  SET
    lease_expires_at = NOW() + (GREATEST(1000, p_lease_ms)::text || ' milliseconds')::interval,
    updated_at = NOW()
  WHERE id = p_job_id
    AND status = 'PROCESSING'
    AND locked_by = p_worker_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION rls_resolve_session_tenant(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_resolve_webhook_tenant(TEXT, UUID, TEXT, UUID, UUID, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_claim_next_outbox_job(TEXT, INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_renew_outbox_lease(UUID, TEXT, INTEGER) TO PUBLIC;
