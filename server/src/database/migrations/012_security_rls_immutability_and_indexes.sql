-- ==============================================================================
-- Migration: 012_security_rls_immutability_and_indexes.sql
-- Purpose:
--   1. Enable PostgreSQL Row-Level Security (RLS) tenant-isolation policies across
--      tenant-scoped tables (BUG-DB-001)
--   2. Enforce non-null posting_type on ledger_entries with payout/tx refs (BUG-DB-003)
--   3. Add immutability triggers on ledger_entries, audit_logs, booking_timeline_events,
--      and installer_provision_logs (BUG-DB-004)
--   4. Tenant-scope idempotency_key on payment_transactions & outbox_operations and
--      enforce refunded_amount_cents <= captured_amount_cents (BUG-DB-005)
--   5. Add case-insensitive users(tenant_id, LOWER(email)) uniqueness and missing
--      high-impact indexes (BUG-DB-006)
-- ==============================================================================

-- 1. Immutability trigger function for append-only audit & financial ledger tables
CREATE OR REPLACE FUNCTION prevent_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: % on %.id=% is forbidden.', TG_OP, TG_TABLE_NAME, OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

DROP TRIGGER IF EXISTS trg_booking_timeline_events_immutable ON booking_timeline_events;
CREATE TRIGGER trg_booking_timeline_events_immutable
  BEFORE UPDATE OR DELETE ON booking_timeline_events
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

DROP TRIGGER IF EXISTS trg_installer_provision_logs_immutable ON installer_provision_logs;
CREATE TRIGGER trg_installer_provision_logs_immutable
  BEFORE UPDATE OR DELETE ON installer_provision_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

-- 2. Enforce non-null posting_type whenever transaction_id or payout_id is populated
--    so NULLS DISTINCT cannot bypass uq_ledger_tx_posting / uq_ledger_payout_posting
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_posting_type_required;
ALTER TABLE ledger_entries
  ADD CONSTRAINT chk_ledger_posting_type_required
  CHECK ((transaction_id IS NULL AND payout_id IS NULL) OR posting_type IS NOT NULL);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_single_reference;
ALTER TABLE ledger_entries
  ADD CONSTRAINT chk_ledger_single_reference
  CHECK (NOT (transaction_id IS NOT NULL AND payout_id IS NOT NULL));

-- 3. Tenant-scope idempotency_key on payment_transactions and outbox_operations
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_idempotency_key_key;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS uq_payment_tx_tenant_idempotency;
ALTER TABLE payment_transactions
  ADD CONSTRAINT uq_payment_tx_tenant_idempotency UNIQUE (tenant_id, idempotency_key);

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS chk_payment_tx_refund_lte_captured;
ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_payment_tx_refund_lte_captured
  CHECK (refunded_amount_cents <= captured_amount_cents);

ALTER TABLE outbox_operations DROP CONSTRAINT IF EXISTS outbox_operations_idempotency_key_key;
ALTER TABLE outbox_operations DROP CONSTRAINT IF EXISTS uq_outbox_tenant_idempotency;
ALTER TABLE outbox_operations
  ADD CONSTRAINT uq_outbox_tenant_idempotency UNIQUE (tenant_id, idempotency_key);

-- 4. Case-insensitive email uniqueness & missing high-impact indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email_lower
  ON users (tenant_id, LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_refresh_token_hash
  ON user_sessions (refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit_account
  ON ledger_entries (debit_account_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit_account
  ON ledger_entries (credit_account_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id
  ON payment_transactions (invoice_id);

CREATE INDEX IF NOT EXISTS idx_bookings_service_id
  ON bookings (service_id);

CREATE INDEX IF NOT EXISTS idx_bookings_address_id
  ON bookings (address_id);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_scheduled_start
  ON bookings (tenant_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id
  ON support_tickets (customer_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_booking_id
  ON support_tickets (booking_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_staff_id
  ON support_tickets (assigned_staff_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_resource
  ON audit_logs (tenant_id, resource_type, resource_id);

-- 5. Enable Row-Level Security (RLS) tenant-isolation policies across tenant-scoped tables
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users', 'user_sessions', 'admin_profiles', 'staff_profiles', 'customer_profiles',
    'provider_profiles', 'provider_locations', 'provider_shifts', 'customer_addresses',
    'service_categories', 'services', 'bookings', 'invoices', 'payment_transactions',
    'ledger_accounts', 'ledger_entries', 'provider_payouts', 'provider_payout_reversals',
    'outbox_operations', 'support_tickets', 'customer_reviews', 'notification_logs',
    'audit_logs', 'tenant_cms_configs', 'integration_configs', 'installer_provision_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I
       USING (NULLIF(current_setting(''app.current_tenant_id'', true), '''') IS NULL OR tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       WITH CHECK (NULLIF(current_setting(''app.current_tenant_id'', true), '''') IS NULL OR tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;
