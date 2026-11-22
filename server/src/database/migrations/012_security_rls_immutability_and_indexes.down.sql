-- ==============================================================================
-- Rollback Migration: 012_security_rls_immutability_and_indexes.down.sql
-- ==============================================================================

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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_audit_logs_tenant_resource;
DROP INDEX IF EXISTS idx_support_tickets_assigned_staff_id;
DROP INDEX IF EXISTS idx_support_tickets_booking_id;
DROP INDEX IF EXISTS idx_support_tickets_customer_id;
DROP INDEX IF EXISTS idx_bookings_tenant_scheduled_start;
DROP INDEX IF EXISTS idx_bookings_address_id;
DROP INDEX IF EXISTS idx_bookings_service_id;
DROP INDEX IF EXISTS idx_payment_transactions_invoice_id;
DROP INDEX IF EXISTS idx_ledger_entries_credit_account;
DROP INDEX IF EXISTS idx_ledger_entries_debit_account;
DROP INDEX IF EXISTS uq_user_sessions_refresh_token_hash;
DROP INDEX IF EXISTS uq_users_tenant_email_lower;

-- Pre-flight guard: refuse rollback if cross-tenant duplicate idempotency keys exist
DO $$
BEGIN
  IF EXISTS (
    SELECT idempotency_key FROM outbox_operations GROUP BY idempotency_key HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot rollback 012: cross-tenant duplicate idempotency_key exists in outbox_operations';
  END IF;
  IF EXISTS (
    SELECT idempotency_key FROM payment_transactions GROUP BY idempotency_key HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot rollback 012: cross-tenant duplicate idempotency_key exists in payment_transactions';
  END IF;
END $$;

ALTER TABLE outbox_operations DROP CONSTRAINT IF EXISTS uq_outbox_tenant_idempotency;
ALTER TABLE outbox_operations ADD CONSTRAINT outbox_operations_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS chk_payment_tx_refund_lte_captured;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS uq_payment_tx_tenant_idempotency;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_single_reference;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_posting_type_required;

DROP TRIGGER IF EXISTS trg_provider_payout_reversals_immutable ON provider_payout_reversals;
DROP TRIGGER IF EXISTS trg_installer_provision_logs_immutable ON installer_provision_logs;
DROP TRIGGER IF EXISTS trg_booking_timeline_events_immutable ON booking_timeline_events;
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries;
DROP FUNCTION IF EXISTS prevent_immutable_mutation();
