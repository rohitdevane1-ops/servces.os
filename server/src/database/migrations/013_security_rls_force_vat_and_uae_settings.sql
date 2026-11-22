-- ==============================================================================
-- Migration: 013_security_rls_force_vat_and_uae_settings.sql
-- Description:
--   1. Fail-closed FORCE ROW LEVEL SECURITY across all 27 tenant_id tables + 6 child tables (BUG-DB-001, BUG-DB-002)
--   2. Reconcile immutability trigger FKs (ON DELETE RESTRICT) & protect provider_payout_reversals (BUG-DB-003)
--   3. UAE Localization & White-Label settings columns on tenants (5% VAT default_tax_rate_bps, WhatsApp, support phone, logo_url, default_locale)
--   4. Drop redundant indexes & add missing secondary lookup indexes (BUG-DB-009)
--   5. Domain integrity CHECK constraints (BUG-DB-008)
-- ==============================================================================

-- 1. UAE Localization & White-Label Config Columns on tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_tax_rate_bps INTEGER DEFAULT 500 NOT NULL,
  ADD COLUMN IF NOT EXISTS support_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS support_whatsapp VARCHAR(50),
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS default_locale VARCHAR(10) DEFAULT 'en' NOT NULL;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_tax_rate_bps;
ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_tax_rate_bps CHECK (default_tax_rate_bps >= 0 AND default_tax_rate_bps <= 10000);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_locale;
ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_default_locale CHECK (default_locale IN ('en', 'ar'));

-- 2. Reconcile FK ON DELETE actions on immutable tables & protect provider_payout_reversals (BUG-DB-003)
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_actor_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_booking_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT;

ALTER TABLE booking_timeline_events DROP CONSTRAINT IF EXISTS booking_timeline_events_tenant_id_fkey;
ALTER TABLE booking_timeline_events
  ADD CONSTRAINT booking_timeline_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS trg_provider_payout_reversals_immutable ON provider_payout_reversals;
CREATE TRIGGER trg_provider_payout_reversals_immutable
  BEFORE UPDATE OR DELETE ON provider_payout_reversals
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

-- 3. Fail-Closed FORCE ROW LEVEL SECURITY across all 27 tenant_id tables (BUG-DB-001, BUG-DB-002)
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users', 'user_sessions', 'admin_profiles', 'staff_profiles', 'customer_profiles',
    'provider_profiles', 'provider_locations', 'provider_shifts', 'customer_addresses',
    'service_categories', 'services', 'bookings', 'booking_timeline_events',
    'invoices', 'payment_transactions', 'ledger_accounts', 'ledger_entries',
    'provider_payouts', 'provider_payout_reversals', 'outbox_operations',
    'support_tickets', 'customer_reviews', 'notification_logs', 'audit_logs',
    'tenant_cms_configs', 'integration_configs', 'installer_provision_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I
       USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- 4. Parent-scoped Fail-Closed FORCE RLS on the 6 tenant-owned child tables (BUG-DB-002)
ALTER TABLE user_mfa_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON user_mfa_credentials;
CREATE POLICY tenant_isolation_policy ON user_mfa_credentials
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = user_mfa_credentials.user_id AND u.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = user_mfa_credentials.user_id AND u.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

ALTER TABLE service_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_pricing_tiers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON service_pricing_tiers;
CREATE POLICY tenant_isolation_policy ON service_pricing_tiers
  USING (EXISTS (SELECT 1 FROM services s WHERE s.id = service_pricing_tiers.service_id AND s.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM services s WHERE s.id = service_pricing_tiers.service_id AND s.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

ALTER TABLE dispatch_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_broadcasts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON dispatch_broadcasts;
CREATE POLICY tenant_isolation_policy ON dispatch_broadcasts
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = dispatch_broadcasts.booking_id AND b.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM bookings b WHERE b.id = dispatch_broadcasts.booking_id AND b.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

ALTER TABLE work_order_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_proofs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON work_order_proofs;
CREATE POLICY tenant_isolation_policy ON work_order_proofs
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = work_order_proofs.booking_id AND b.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM bookings b WHERE b.id = work_order_proofs.booking_id AND b.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON invoice_items;
CREATE POLICY tenant_isolation_policy ON invoice_items
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON ticket_messages;
CREATE POLICY tenant_isolation_policy ON ticket_messages
  USING (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_messages.ticket_id AND t.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_messages.ticket_id AND t.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

-- 5. Domain Integrity Checks (BUG-DB-008)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_tax_rate_bps_max;
ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_tax_rate_bps_max CHECK (tax_rate_bps <= 10000);

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS chk_payment_tx_captured_lte_authorized;
ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_payment_tx_captured_lte_authorized CHECK (captured_amount_cents <= authorized_amount_cents);

-- 6. Drop redundant indexes & add missing lookup indexes (BUG-DB-009)
DROP INDEX IF EXISTS idx_tenants_slug;
DROP INDEX IF EXISTS idx_tenants_custom_domain;
DROP INDEX IF EXISTS idx_users_tenant_email;
DROP INDEX IF EXISTS idx_payment_transactions_stripe;

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_customer_id ON customer_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient_user_id ON notification_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_payout_reversals_tenant_id ON provider_payout_reversals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_operations_tenant_status ON outbox_operations(tenant_id, status);
