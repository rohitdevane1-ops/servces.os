-- ==============================================================================
-- Rollback Migration: 011_remediation_schema_rbac_and_triggers.down.sql
-- Safe rollback: refuses to run if it would discard refund accounting data.
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoices WHERE refunded_amount_cents > 0 OR status = 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION 'MIGRATION 011 ROLLBACK ABORTED: invoices contains refund accounting data.';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE length(posting_type) > 50) THEN
    RAISE EXCEPTION 'MIGRATION 011 ROLLBACK ABORTED: ledger_entries contains extended posting_type values.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_integration_configs_updated_at ON integration_configs;
DROP TRIGGER IF EXISTS trg_customer_reviews_updated_at ON customer_reviews;
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;

ALTER TABLE ledger_entries ALTER COLUMN posting_type TYPE VARCHAR(50);

DELETE FROM role_permissions WHERE permission_id = 'finance:report:read';
DELETE FROM permissions WHERE id = 'finance:report:read';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_refunded_bounds;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ALTER COLUMN status TYPE VARCHAR(20);
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT', 'AUTHORIZED', 'PAID', 'REFUNDED', 'VOID'));
ALTER TABLE invoices DROP COLUMN IF EXISTS refunded_amount_cents;

DROP INDEX IF EXISTS idx_provider_profiles_tenant_active;
ALTER TABLE provider_profiles DROP COLUMN IF EXISTS is_active;
