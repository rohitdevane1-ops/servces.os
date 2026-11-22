-- ==============================================================================
-- Migration: 011_remediation_schema_rbac_and_triggers.sql
-- Description: Add provider_profiles.is_active, invoices.refunded_amount_cents
--              and PARTIALLY_REFUNDED status, widen ledger_entries.posting_type
--              for per-event refund idempotency, seed missing RBAC permissions
--              ('finance:report:read' + full ADMIN permissions), and add missing
--              BEFORE UPDATE updated_at triggers.
-- Target: PostgreSQL 16 + PostGIS
-- ==============================================================================

-- 1. Add missing is_active column to provider_profiles (fixes BUG-BE-001)
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_provider_profiles_tenant_active
  ON provider_profiles(tenant_id, is_active, is_verified);

-- 2. Extend invoices for partial/full refund accounting (fixes BUG-BE-005)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS refunded_amount_cents BIGINT NOT NULL DEFAULT 0;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'invoices'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE invoices ALTER COLUMN status TYPE VARCHAR(30);
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOID'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_refunded_bounds;
ALTER TABLE invoices ADD CONSTRAINT chk_invoices_refunded_bounds
  CHECK (refunded_amount_cents >= 0 AND refunded_amount_cents <= total_amount_cents);

-- 3. Widen ledger_entries.posting_type to support per-event refund idempotency keys
ALTER TABLE ledger_entries ALTER COLUMN posting_type TYPE VARCHAR(180);

-- 4. Seed missing 'finance:report:read' permission & complete ADMIN role_permissions (fixes BUG-BE-014)
INSERT INTO permissions (id, domain, description) VALUES
  ('finance:report:read', 'finance', 'Generate financial reconciliation reports and export ledger summaries')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'ADMIN', id FROM permissions
ON CONFLICT DO NOTHING;

-- 5. Add missing BEFORE UPDATE updated_at triggers (fixes BUG-BE-020)
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_customer_reviews_updated_at ON customer_reviews;
CREATE TRIGGER trg_customer_reviews_updated_at
BEFORE UPDATE ON customer_reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_integration_configs_updated_at ON integration_configs;
CREATE TRIGGER trg_integration_configs_updated_at
BEFORE UPDATE ON integration_configs
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
