-- ==============================================================================
-- Migration: 015_phase2_auth_resets_and_encrypted_integrations.sql
-- Purpose:
--   1. Durable password_reset_tokens table with FORCE ROW LEVEL SECURITY +
--      rls_resolve_password_reset_tenant() SECURITY DEFINER helper.
--   2. Encrypted per-tenant integration secret storage on integration_configs
--      (encrypted_secrets JSONB + public_settings JSONB).
--   3. Allow provider_locations.location to be NULL until first live GPS ping
--      so PUT /crm/technicians/duty-status persists status without fake (0,0).
-- Target: PostgreSQL 16 + PostGIS
-- ==============================================================================

-- 1. Password Reset Tokens Table (Single-Use, SHA-256 Hashed, 15m TTL)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    requested_ip INET,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_tenant_hash
  ON password_reset_tokens (tenant_id, token_hash);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON password_reset_tokens;
CREATE POLICY tenant_isolation_policy ON password_reset_tokens
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION rls_resolve_password_reset_tenant(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id
  FROM password_reset_tokens
  WHERE token_hash = p_token_hash
  LIMIT 1;
$$;

-- 2. Encrypted Integration Secrets & Public Settings on integration_configs
ALTER TABLE integration_configs
  ADD COLUMN IF NOT EXISTS encrypted_secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS public_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Allow provider_locations.location to be NULL prior to first real GPS ping
ALTER TABLE provider_locations
  ALTER COLUMN location DROP NOT NULL;
