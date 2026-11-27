-- ==============================================================================
-- Migration: 016_full_stack_recovery_and_hardening.sql
-- Purpose:
--   1. Additive domain columns (tenants.tagline, user_sessions.locked_at,
--      profile avatar/cover/tier/location fields, service checklist/surge/PIN,
--      invoices.commission_bps_snapshot & notes, payment_transactions.checkout_redirect_url,
--      support_tickets nullable customer_id for incidents + incident_category).
--   2. Backfill invoices.commission_bps_snapshot & COA 5020 (Bonus Expense) safely
--      under FORCE RLS using per-tenant set_config loops.
--   3. New FORCE-RLS tables: booking_messages, provider_onboarding_submissions,
--      staff_daily_reports, provider_bonuses (+ ledger_entries.bonus_id).
--   4. Harden webhook_events with tenant_id + FORCE RLS + unmatched event helper.
--   5. Upgrade all 5 rls_* SECURITY DEFINER helpers for non-superuser managed PG
--      compatibility & revoke PUBLIC EXECUTE grants (serviceos_rls_runtime role).
--   6. Add composite tenant FKs & integrity checks across tenant-scoped tables.
-- Target: PostgreSQL 16 + PostGIS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Additive Columns on Existing Tables
-- ------------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tagline VARCHAR(255);

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE admin_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS account_tier VARCHAR(30) NOT NULL DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS base_location VARCHAR(255);

ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS checklist_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_surge_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_pin BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS commission_bps_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_commission_bps_snapshot;
ALTER TABLE invoices ADD CONSTRAINT chk_invoices_commission_bps_snapshot
  CHECK (commission_bps_snapshot IS NULL OR (commission_bps_snapshot >= 0 AND commission_bps_snapshot <= 10000));

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS checkout_redirect_url TEXT;

ALTER TABLE support_tickets
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS incident_category VARCHAR(30) NOT NULL DEFAULT 'Safety';

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS chk_support_tickets_customer_required_unless_incident;
ALTER TABLE support_tickets ADD CONSTRAINT chk_support_tickets_customer_required_unless_incident
  CHECK (category = 'INCIDENT' OR customer_id IS NOT NULL);

-- Per-tenant FORCE-RLS-safe backfill for invoices.commission_bps_snapshot & COA 5020
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id, default_platform_commission_bps, currency_code FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);

    UPDATE invoices
    SET commission_bps_snapshot = COALESCE(t.default_platform_commission_bps, 1500)
    WHERE tenant_id = t.id
      AND commission_bps_snapshot IS NULL;

    INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
    SELECT t.id, '5020', 'Technician Performance Bonus Expense', 'EXPENSE', t.currency_code
    WHERE NOT EXISTS (
      SELECT 1 FROM ledger_accounts la
      WHERE la.tenant_id = t.id AND la.account_number = '5020'
    );
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);
END $$;

-- ------------------------------------------------------------------------------
-- 2. Composite Parent Uniqueness Keys & Tenant-Scoped Integrity Checks
-- ------------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_id_tenant;
ALTER TABLE users ADD CONSTRAINT uq_users_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE customer_profiles DROP CONSTRAINT IF EXISTS uq_customer_profiles_user_tenant;
ALTER TABLE customer_profiles ADD CONSTRAINT uq_customer_profiles_user_tenant UNIQUE (user_id, tenant_id);

ALTER TABLE provider_profiles DROP CONSTRAINT IF EXISTS uq_provider_profiles_user_tenant;
ALTER TABLE provider_profiles ADD CONSTRAINT uq_provider_profiles_user_tenant UNIQUE (user_id, tenant_id);

ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS uq_staff_profiles_user_tenant;
ALTER TABLE staff_profiles ADD CONSTRAINT uq_staff_profiles_user_tenant UNIQUE (user_id, tenant_id);

ALTER TABLE customer_addresses DROP CONSTRAINT IF EXISTS uq_customer_addresses_id_tenant;
ALTER TABLE customer_addresses ADD CONSTRAINT uq_customer_addresses_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS uq_service_categories_id_tenant;
ALTER TABLE service_categories ADD CONSTRAINT uq_service_categories_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE services DROP CONSTRAINT IF EXISTS uq_services_id_tenant;
ALTER TABLE services ADD CONSTRAINT uq_services_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS uq_bookings_id_tenant;
ALTER TABLE bookings ADD CONSTRAINT uq_bookings_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS uq_invoices_id_tenant;
ALTER TABLE invoices ADD CONSTRAINT uq_invoices_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS uq_payment_transactions_id_tenant;
ALTER TABLE payment_transactions ADD CONSTRAINT uq_payment_transactions_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE services DROP CONSTRAINT IF EXISTS fk_services_category_tenant;
ALTER TABLE services ADD CONSTRAINT fk_services_category_tenant
  FOREIGN KEY (category_id, tenant_id) REFERENCES service_categories(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_customer_tenant;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_customer_tenant
  FOREIGN KEY (customer_id, tenant_id) REFERENCES customer_profiles(user_id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_service_tenant;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_service_tenant
  FOREIGN KEY (service_id, tenant_id) REFERENCES services(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_address_tenant;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_address_tenant
  FOREIGN KEY (address_id, tenant_id) REFERENCES customer_addresses(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_provider_tenant;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_provider_tenant
  FOREIGN KEY (assigned_provider_id, tenant_id) REFERENCES provider_profiles(user_id, tenant_id)
  MATCH SIMPLE ON DELETE SET NULL (assigned_provider_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancelled_by_user_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_user_id_fkey
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by_user_id
  ON bookings (cancelled_by_user_id)
  WHERE cancelled_by_user_id IS NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bookings_schedule_order;
ALTER TABLE bookings ADD CONSTRAINT chk_bookings_schedule_order
  CHECK (scheduled_end IS NULL OR scheduled_end >= scheduled_start);

ALTER TABLE provider_shifts DROP CONSTRAINT IF EXISTS chk_provider_shifts_time_order;
ALTER TABLE provider_shifts ADD CONSTRAINT chk_provider_shifts_time_order
  CHECK (end_time > start_time);

-- Single-column coordinate checks (remain independent of 014.down.sql column drops)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_map_lat;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_default_map_lat
  CHECK (default_map_lat BETWEEN -90 AND 90);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_default_map_lng;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_default_map_lng
  CHECK (default_map_lng BETWEEN -180 AND 180);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_booking_tenant;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_booking_tenant
  FOREIGN KEY (booking_id, tenant_id) REFERENCES bookings(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS fk_payment_transactions_invoice_tenant;
ALTER TABLE payment_transactions ADD CONSTRAINT fk_payment_transactions_invoice_tenant
  FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS fk_provider_payouts_provider_tenant;
ALTER TABLE provider_payouts ADD CONSTRAINT fk_provider_payouts_provider_tenant
  FOREIGN KEY (provider_id, tenant_id) REFERENCES provider_profiles(user_id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_customer_tenant;
ALTER TABLE support_tickets ADD CONSTRAINT fk_support_tickets_customer_tenant
  FOREIGN KEY (customer_id, tenant_id) REFERENCES customer_profiles(user_id, tenant_id)
  MATCH SIMPLE ON DELETE CASCADE;

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_booking_tenant;
ALTER TABLE support_tickets ADD CONSTRAINT fk_support_tickets_booking_tenant
  FOREIGN KEY (booking_id, tenant_id) REFERENCES bookings(id, tenant_id)
  MATCH SIMPLE ON DELETE SET NULL (booking_id);

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_staff_tenant;
ALTER TABLE support_tickets ADD CONSTRAINT fk_support_tickets_staff_tenant
  FOREIGN KEY (assigned_staff_id, tenant_id) REFERENCES staff_profiles(user_id, tenant_id)
  MATCH SIMPLE ON DELETE SET NULL (assigned_staff_id);

ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_booking_tenant;
ALTER TABLE customer_reviews ADD CONSTRAINT fk_customer_reviews_booking_tenant
  FOREIGN KEY (booking_id, tenant_id) REFERENCES bookings(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_customer_tenant;
ALTER TABLE customer_reviews ADD CONSTRAINT fk_customer_reviews_customer_tenant
  FOREIGN KEY (customer_id, tenant_id) REFERENCES customer_profiles(user_id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE customer_reviews DROP CONSTRAINT IF EXISTS fk_customer_reviews_provider_tenant;
ALTER TABLE customer_reviews ADD CONSTRAINT fk_customer_reviews_provider_tenant
  FOREIGN KEY (provider_id, tenant_id) REFERENCES provider_profiles(user_id, tenant_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 3. New Domain Tables (All under Fail-Closed FORCE ROW LEVEL SECURITY)
-- ------------------------------------------------------------------------------

-- 3A. Booking-Scoped Chat Messages (Customer <-> Technician <-> Admin/Staff)
CREATE TABLE IF NOT EXISTS booking_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    booking_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('ADMIN', 'STAFF', 'TECHNICIAN', 'CUSTOMER')),
    message_body TEXT NOT NULL CHECK (length(trim(message_body)) > 0),
    attachments_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_booking_messages_booking_tenant FOREIGN KEY (booking_id, tenant_id) REFERENCES bookings(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_messages_sender_tenant FOREIGN KEY (sender_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_booking_messages_booking
  ON booking_messages (tenant_id, booking_id, created_at ASC);

ALTER TABLE booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON booking_messages;
CREATE POLICY tenant_isolation_policy ON booking_messages
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3B. Technician Compliance Onboarding Submissions
CREATE TABLE IF NOT EXISTS provider_onboarding_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    entity_type VARCHAR(40) NOT NULL DEFAULT 'INDEPENDENT_CONTRACTOR',
    trade_category VARCHAR(100) NOT NULL,
    license_number VARCHAR(100),
    insurance_carrier VARCHAR(150),
    government_id_number VARCHAR(100),
    vehicle_make_model VARCHAR(150),
    vehicle_license_plate VARCHAR(50),
    hourly_rate_cents BIGINT CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0),
    service_radius_km INTEGER CHECK (service_radius_km IS NULL OR (service_radius_km >= 1 AND service_radius_km <= 500)),
    document_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'
      CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    reviewer_notes TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_onboarding_tenant_user UNIQUE (tenant_id, user_id),
    CONSTRAINT fk_provider_onboarding_provider_tenant FOREIGN KEY (user_id, tenant_id) REFERENCES provider_profiles(user_id, tenant_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_provider_onboarding_submissions_updated_at ON provider_onboarding_submissions;
CREATE TRIGGER trg_provider_onboarding_submissions_updated_at
  BEFORE UPDATE ON provider_onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE provider_onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_onboarding_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON provider_onboarding_submissions;
CREATE POLICY tenant_isolation_policy ON provider_onboarding_submissions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3C. Staff Daily Operations Reports
CREATE TABLE IF NOT EXISTS staff_daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    staff_user_id UUID NOT NULL,
    report_date DATE NOT NULL,
    reference_code VARCHAR(60) NOT NULL,
    shift_label VARCHAR(40) NOT NULL DEFAULT 'STANDARD',
    bookings_handled_count INTEGER NOT NULL DEFAULT 0 CHECK (bookings_handled_count >= 0),
    tickets_resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (tickets_resolved_count >= 0),
    incidents_escalated_count INTEGER NOT NULL DEFAULT 0 CHECK (incidents_escalated_count >= 0),
    metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary_notes TEXT NOT NULL,
    handover_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'REVIEWED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_daily_reports_user_date UNIQUE (tenant_id, staff_user_id, report_date),
    CONSTRAINT uq_staff_daily_reports_ref UNIQUE (tenant_id, reference_code),
    CONSTRAINT fk_staff_daily_reports_user_tenant FOREIGN KEY (staff_user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trg_staff_daily_reports_updated_at ON staff_daily_reports;
CREATE TRIGGER trg_staff_daily_reports_updated_at
  BEFORE UPDATE ON staff_daily_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE staff_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_daily_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON staff_daily_reports;
CREATE POLICY tenant_isolation_policy ON staff_daily_reports
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3D. Technician Bonuses & Immutable Double-Entry Bonus Link
CREATE TABLE IF NOT EXISTS provider_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    provider_id UUID NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    category VARCHAR(30) NOT NULL DEFAULT 'PERFORMANCE'
      CHECK (category IN ('PERFORMANCE', 'QUALITY', 'EMERGENCY', 'REFERRAL', 'ADJUSTMENT')),
    reason VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'DISBURSED', 'VOIDED')),
    awarded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_bonuses_tenant_idem UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_provider_bonuses_provider_tenant FOREIGN KEY (provider_id, tenant_id) REFERENCES provider_profiles(user_id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_provider_bonuses_provider
  ON provider_bonuses (tenant_id, provider_id, status);

DROP TRIGGER IF EXISTS trg_provider_bonuses_updated_at ON provider_bonuses;
CREATE TRIGGER trg_provider_bonuses_updated_at
  BEFORE UPDATE ON provider_bonuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE provider_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_bonuses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON provider_bonuses;
CREATE POLICY tenant_isolation_policy ON provider_bonuses
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS bonus_id UUID REFERENCES provider_bonuses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_bonus_posting
  ON ledger_entries (bonus_id, posting_type);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_single_reference;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_single_reference
  CHECK (
    (CASE WHEN transaction_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN payout_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN bonus_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_posting_type_required;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_posting_type_required
  CHECK ((transaction_id IS NULL AND payout_id IS NULL AND bonus_id IS NULL) OR posting_type IS NOT NULL);

-- ------------------------------------------------------------------------------
-- 4. Webhook Events Tenant Isolation (FORCE RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_id
  ON webhook_events (tenant_id)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON webhook_events;
CREATE POLICY tenant_isolation_policy ON webhook_events
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ------------------------------------------------------------------------------
-- 5. Non-Superuser-Compatible SECURITY DEFINER RLS Helpers + Tightened Grants
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rls_resolve_session_tenant(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_bypass BOOLEAN;
  v_prev_tenant TEXT;
  v_tenant_id UUID;
  t RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) INTO v_can_bypass;

  IF v_can_bypass THEN
    SELECT tenant_id INTO v_tenant_id
    FROM user_sessions
    WHERE refresh_token_hash = p_token_hash
    LIMIT 1;
    RETURN v_tenant_id;
  END IF;

  v_prev_tenant := current_setting('app.current_tenant_id', true);
  FOR t IN SELECT id FROM tenants ORDER BY created_at ASC LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    SELECT tenant_id INTO v_tenant_id
    FROM user_sessions
    WHERE refresh_token_hash = p_token_hash
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
      RETURN v_tenant_id;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rls_resolve_password_reset_tenant(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_bypass BOOLEAN;
  v_prev_tenant TEXT;
  v_tenant_id UUID;
  t RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) INTO v_can_bypass;

  IF v_can_bypass THEN
    SELECT tenant_id INTO v_tenant_id
    FROM password_reset_tokens
    WHERE token_hash = p_token_hash
    LIMIT 1;
    RETURN v_tenant_id;
  END IF;

  v_prev_tenant := current_setting('app.current_tenant_id', true);
  FOR t IN SELECT id FROM tenants ORDER BY created_at ASC LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    SELECT tenant_id INTO v_tenant_id
    FROM password_reset_tokens
    WHERE token_hash = p_token_hash
    LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
      PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
      RETURN v_tenant_id;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
  RETURN NULL;
END;
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
  v_can_bypass BOOLEAN;
  v_prev_tenant TEXT;
  v_tenant_id UUID;
  t RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) INTO v_can_bypass;

  IF v_can_bypass THEN
    IF p_payment_intent_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM payment_transactions WHERE stripe_payment_intent_id = p_payment_intent_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    IF p_transaction_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM payment_transactions WHERE id = p_transaction_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    IF p_invoice_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM invoices WHERE id = p_invoice_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    IF p_booking_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM bookings WHERE id = p_booking_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    IF p_transfer_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM provider_payouts WHERE stripe_transfer_id = p_transfer_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    IF p_connect_account_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM provider_profiles WHERE stripe_connect_account_id = p_connect_account_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN RETURN v_tenant_id; END IF;
    END IF;
    RETURN NULL;
  END IF;

  v_prev_tenant := current_setting('app.current_tenant_id', true);
  FOR t IN SELECT id FROM tenants ORDER BY created_at ASC LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    IF p_payment_intent_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM payment_transactions WHERE stripe_payment_intent_id = p_payment_intent_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
    IF p_transaction_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM payment_transactions WHERE id = p_transaction_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
    IF p_invoice_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM invoices WHERE id = p_invoice_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
    IF p_booking_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM bookings WHERE id = p_booking_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
    IF p_transfer_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM provider_payouts WHERE stripe_transfer_id = p_transfer_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
    IF p_connect_account_id IS NOT NULL THEN
      SELECT tenant_id INTO v_tenant_id FROM provider_profiles WHERE stripe_connect_account_id = p_connect_account_id LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true); RETURN v_tenant_id; END IF;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rls_claim_next_outbox_job(
  p_worker_id TEXT,
  p_lease_ms INTEGER DEFAULT 60000
) RETURNS SETOF outbox_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_bypass BOOLEAN;
  v_prev_tenant TEXT;
  v_row outbox_operations%ROWTYPE;
  t RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) INTO v_can_bypass;

  IF v_can_bypass THEN
    RETURN QUERY
    WITH next_job AS (
      SELECT id FROM outbox_operations
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
    RETURN;
  END IF;

  v_prev_tenant := current_setting('app.current_tenant_id', true);
  FOR t IN SELECT id FROM tenants ORDER BY created_at ASC LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    WITH next_job AS (
      SELECT id FROM outbox_operations
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
    RETURNING o.* INTO v_row;

    IF v_row.id IS NOT NULL THEN
      PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
      RETURN NEXT v_row;
      RETURN;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
  RETURN;
END;
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
  v_can_bypass BOOLEAN;
  v_prev_tenant TEXT;
  v_updated INTEGER;
  t RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) INTO v_can_bypass;

  IF v_can_bypass THEN
    UPDATE outbox_operations
    SET
      lease_expires_at = NOW() + (GREATEST(1000, p_lease_ms)::text || ' milliseconds')::interval,
      updated_at = NOW()
    WHERE id = p_job_id AND status = 'PROCESSING' AND locked_by = p_worker_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
  END IF;

  v_prev_tenant := current_setting('app.current_tenant_id', true);
  FOR t IN SELECT id FROM tenants ORDER BY created_at ASC LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    UPDATE outbox_operations
    SET
      lease_expires_at = NOW() + (GREATEST(1000, p_lease_ms)::text || ' milliseconds')::interval,
      updated_at = NOW()
    WHERE id = p_job_id AND status = 'PROCESSING' AND locked_by = p_worker_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
      RETURN TRUE;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', COALESCE(v_prev_tenant, ''), true);
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION rls_record_unmatched_webhook_event(
  p_id TEXT,
  p_provider TEXT,
  p_event_type TEXT,
  p_redacted_payload JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted TEXT;
BEGIN
  INSERT INTO webhook_events (id, tenant_id, provider, event_type, payload)
  VALUES (p_id, NULL, p_provider, p_event_type, p_redacted_payload)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted;
  RETURN v_inserted IS NOT NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'serviceos_rls_runtime') THEN
    CREATE ROLE serviceos_rls_runtime NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON FUNCTION rls_resolve_session_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_resolve_password_reset_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_resolve_webhook_tenant(TEXT, UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_claim_next_outbox_job(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_renew_outbox_lease(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_record_unmatched_webhook_event(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rls_resolve_session_tenant(TEXT) TO serviceos_rls_runtime;
GRANT EXECUTE ON FUNCTION rls_resolve_password_reset_tenant(TEXT) TO serviceos_rls_runtime;
GRANT EXECUTE ON FUNCTION rls_resolve_webhook_tenant(TEXT, UUID, TEXT, UUID, UUID, TEXT) TO serviceos_rls_runtime;
GRANT EXECUTE ON FUNCTION rls_claim_next_outbox_job(TEXT, INTEGER) TO serviceos_rls_runtime;
GRANT EXECUTE ON FUNCTION rls_renew_outbox_lease(UUID, TEXT, INTEGER) TO serviceos_rls_runtime;
GRANT EXECUTE ON FUNCTION rls_record_unmatched_webhook_event(TEXT, TEXT, TEXT, JSONB) TO serviceos_rls_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servicepro_app') THEN
    GRANT serviceos_rls_runtime TO servicepro_app;
  END IF;
END $$;
