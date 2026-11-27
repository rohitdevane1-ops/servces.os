-- ==============================================================================
-- Down Migration: 016_full_stack_recovery_and_hardening.down.sql
-- Safe rollback: refuses to discard booking_messages, onboarding submissions,
-- staff_daily_reports, provider_bonuses, or NULL-customer incident records.
-- ==============================================================================

DO $$
DECLARE
  t RECORD;
  v_err TEXT := NULL;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    IF EXISTS (SELECT 1 FROM booking_messages) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: booking_messages contains records.';
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM provider_onboarding_submissions) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: provider_onboarding_submissions contains records.';
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM staff_daily_reports) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: staff_daily_reports contains records.';
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM provider_bonuses) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: provider_bonuses contains records.';
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM ledger_entries WHERE bonus_id IS NOT NULL) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: ledger_entries contains bonus postings.';
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM support_tickets WHERE customer_id IS NULL) THEN
      v_err := 'MIGRATION 016 ROLLBACK ABORTED: support_tickets contains NULL customer_id incident rows.';
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);

  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err;
  END IF;
END $$;

-- Restore 014 PUBLIC grants & drop 016 webhook helper
GRANT EXECUTE ON FUNCTION rls_resolve_session_tenant(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_resolve_webhook_tenant(TEXT, UUID, TEXT, UUID, UUID, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_claim_next_outbox_job(TEXT, INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_renew_outbox_lease(UUID, TEXT, INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_resolve_password_reset_tenant(TEXT) TO PUBLIC;

DROP FUNCTION IF EXISTS rls_record_unmatched_webhook_event(TEXT, TEXT, TEXT, JSONB);

-- Remove webhook_events RLS & tenant_id
DROP POLICY IF EXISTS tenant_isolation_policy ON webhook_events;
ALTER TABLE webhook_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_webhook_events_tenant_id;
ALTER TABLE webhook_events DROP COLUMN IF EXISTS tenant_id;

-- Restore ledger_entries constraints & drop bonus_id
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_posting_type_required;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_posting_type_required
  CHECK ((transaction_id IS NULL AND payout_id IS NULL) OR posting_type IS NOT NULL);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_single_reference;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_single_reference
  CHECK (NOT (transaction_id IS NOT NULL AND payout_id IS NOT NULL));

DROP INDEX IF EXISTS uq_ledger_bonus_posting;
ALTER TABLE ledger_entries DROP COLUMN IF EXISTS bonus_id;

-- Drop new FORCE RLS tables
DROP POLICY IF EXISTS tenant_isolation_policy ON provider_bonuses;
DROP TRIGGER IF EXISTS trg_provider_bonuses_updated_at ON provider_bonuses;
DROP INDEX IF EXISTS idx_provider_bonuses_provider;
DROP TABLE IF EXISTS provider_bonuses;

DROP POLICY IF EXISTS tenant_isolation_policy ON staff_daily_reports;
DROP TRIGGER IF EXISTS trg_staff_daily_reports_updated_at ON staff_daily_reports;
DROP TABLE IF EXISTS staff_daily_reports;

DROP POLICY IF EXISTS tenant_isolation_policy ON provider_onboarding_submissions;
DROP TRIGGER IF EXISTS trg_provider_onboarding_submissions_updated_at ON provider_onboarding_submissions;
DROP TABLE IF EXISTS provider_onboarding_submissions;

DROP POLICY IF EXISTS tenant_isolation_policy ON booking_messages;
DROP INDEX IF EXISTS idx_booking_messages_booking;
DROP TABLE IF EXISTS booking_messages;

-- Drop composite tenant FKs & integrity checks
ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_provider_tenant;
ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_customer_tenant;
ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_booking_tenant;

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_staff_tenant;
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_booking_tenant;
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_customer_tenant;

ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS fk_provider_payouts_provider_tenant;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS fk_payment_transactions_invoice_tenant;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_booking_tenant;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_map_lng;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_map_lat;
ALTER TABLE provider_shifts DROP CONSTRAINT IF EXISTS chk_provider_shifts_time_order;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bookings_schedule_order;
DROP INDEX IF EXISTS idx_bookings_cancelled_by_user_id;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancelled_by_user_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_user_id_fkey
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_provider_tenant;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_address_tenant;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_service_tenant;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_customer_tenant;
ALTER TABLE services DROP CONSTRAINT IF EXISTS fk_services_category_tenant;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS uq_payment_transactions_id_tenant;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS uq_invoices_id_tenant;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS uq_bookings_id_tenant;
ALTER TABLE services DROP CONSTRAINT IF EXISTS uq_services_id_tenant;
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS uq_service_categories_id_tenant;
ALTER TABLE customer_addresses DROP CONSTRAINT IF EXISTS uq_customer_addresses_id_tenant;
ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS uq_staff_profiles_user_tenant;
ALTER TABLE provider_profiles DROP CONSTRAINT IF EXISTS uq_provider_profiles_user_tenant;
ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS uq_customer_profiles_user_tenant;
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_id_tenant;

-- Clean unused COA 5020 per tenant under FORCE RLS
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    DELETE FROM ledger_accounts la
    WHERE la.tenant_id = t.id
      AND la.account_number = '5020'
      AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.debit_account_id = la.id OR le.credit_account_id = la.id
      );
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);
END $$;

-- Drop additive columns
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS chk_support_tickets_customer_required_unless_incident;
ALTER TABLE support_tickets DROP COLUMN IF EXISTS incident_category;
ALTER TABLE support_tickets ALTER COLUMN customer_id SET NOT NULL;

ALTER TABLE payment_transactions DROP COLUMN IF EXISTS checkout_redirect_url;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_commission_bps_snapshot;
ALTER TABLE invoices
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS commission_bps_snapshot;

ALTER TABLE services
  DROP COLUMN IF EXISTS requires_pin,
  DROP COLUMN IF EXISTS is_surge_eligible,
  DROP COLUMN IF EXISTS checklist_items;

ALTER TABLE service_categories DROP COLUMN IF EXISTS description;

ALTER TABLE provider_profiles
  DROP COLUMN IF EXISTS base_location,
  DROP COLUMN IF EXISTS cover_url,
  DROP COLUMN IF EXISTS avatar_url;

ALTER TABLE customer_profiles
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS account_tier,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS cover_url,
  DROP COLUMN IF EXISTS avatar_url;

ALTER TABLE staff_profiles
  DROP COLUMN IF EXISTS cover_url,
  DROP COLUMN IF EXISTS avatar_url;

ALTER TABLE admin_profiles
  DROP COLUMN IF EXISTS cover_url,
  DROP COLUMN IF EXISTS avatar_url;

ALTER TABLE user_sessions DROP COLUMN IF EXISTS locked_at;
ALTER TABLE tenants DROP COLUMN IF EXISTS tagline;
