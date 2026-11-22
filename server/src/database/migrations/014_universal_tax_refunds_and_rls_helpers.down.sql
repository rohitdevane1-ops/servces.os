-- ==============================================================================
-- Down Migration: 014_universal_tax_refunds_and_rls_helpers.down.sql
-- ==============================================================================

DROP FUNCTION IF EXISTS rls_renew_outbox_lease(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS rls_claim_next_outbox_job(TEXT, INTEGER);
DROP FUNCTION IF EXISTS rls_resolve_webhook_tenant(TEXT, UUID, TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS rls_resolve_session_tenant(TEXT);

DROP POLICY IF EXISTS tenant_isolation_policy ON payment_refunds;
DROP TRIGGER IF EXISTS trg_payment_refunds_updated_at ON payment_refunds;
DROP INDEX IF EXISTS idx_payment_refunds_tx;
DROP INDEX IF EXISTS uq_payment_refunds_stripe_event;
DROP INDEX IF EXISTS uq_payment_refunds_stripe_refund;
DROP TABLE IF EXISTS payment_refunds;

DELETE FROM ledger_accounts la
WHERE la.account_number = '2030'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.debit_account_id = la.id OR le.credit_account_id = la.id
  );

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_locale;
UPDATE tenants SET default_locale = 'en' WHERE default_locale NOT IN ('en', 'ar');
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_default_locale
  CHECK (default_locale IN ('en', 'ar'));

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_country_code;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_distance_unit;

ALTER TABLE tenants
  DROP COLUMN IF EXISTS default_map_lng,
  DROP COLUMN IF EXISTS default_map_lat,
  DROP COLUMN IF EXISTS emergency_phone,
  DROP COLUMN IF EXISTS distance_unit,
  DROP COLUMN IF EXISTS tax_name,
  DROP COLUMN IF EXISTS country_code;
