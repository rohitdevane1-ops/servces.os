-- ==============================================================================
-- Rollback Migration: 013_security_rls_force_vat_and_uae_settings.down.sql
-- ==============================================================================

DROP INDEX IF EXISTS idx_outbox_operations_tenant_status;
DROP INDEX IF EXISTS idx_provider_payout_reversals_tenant_id;
DROP INDEX IF EXISTS idx_notification_logs_recipient_user_id;
DROP INDEX IF EXISTS idx_customer_reviews_customer_id;
DROP INDEX IF EXISTS idx_user_sessions_tenant_id;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS chk_payment_tx_captured_lte_authorized;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_tax_rate_bps_max;

DO $$
DECLARE
  tbl TEXT;
  child_tables TEXT[] := ARRAY[
    'user_mfa_credentials', 'service_pricing_tiers', 'dispatch_broadcasts',
    'work_order_proofs', 'invoice_items', 'ticket_messages', 'booking_timeline_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY child_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

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
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I
       USING (NULLIF(current_setting(''app.current_tenant_id'', true), '''') IS NULL OR tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       WITH CHECK (NULLIF(current_setting(''app.current_tenant_id'', true), '''') IS NULL OR tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_provider_payout_reversals_immutable ON provider_payout_reversals;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_tenant_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_booking_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_actor_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe ON payment_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON tenants(custom_domain);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_locale;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_tax_rate_bps;
ALTER TABLE tenants
  DROP COLUMN IF EXISTS default_locale,
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS support_whatsapp,
  DROP COLUMN IF EXISTS support_phone,
  DROP COLUMN IF EXISTS default_tax_rate_bps;
