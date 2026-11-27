-- ==============================================================================
-- Down Migration: 014_universal_tax_refunds_and_rls_helpers.down.sql
-- Safe rollback: refuses to destroy payment_refunds or non-EN/AR locales.
-- ==============================================================================

DO $$
DECLARE
  t RECORD;
  v_has_refunds BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.payment_refunds') IS NOT NULL THEN
    FOR t IN SELECT id FROM tenants LOOP
      PERFORM set_config('app.current_tenant_id', t.id::text, true);
      IF EXISTS (SELECT 1 FROM payment_refunds) THEN
        v_has_refunds := TRUE;
        EXIT;
      END IF;
    END LOOP;
    PERFORM set_config('app.current_tenant_id', '', true);
    IF v_has_refunds THEN
      RAISE EXCEPTION 'MIGRATION 014 ROLLBACK ABORTED: payment_refunds contains refund records.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE default_locale NOT IN ('en', 'ar')) THEN
    RAISE EXCEPTION 'MIGRATION 014 ROLLBACK ABORTED: tenants contains non-en/ar default_locale values.';
  END IF;
END $$;

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

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    DELETE FROM ledger_accounts la
    WHERE la.tenant_id = t.id
      AND la.account_number = '2030'
      AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.debit_account_id = la.id OR le.credit_account_id = la.id
      );
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);
END $$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_locale;
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
