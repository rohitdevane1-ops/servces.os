-- ==============================================================================
-- Down Migration: 015_phase2_auth_resets_and_encrypted_integrations.down.sql
-- ==============================================================================

DROP FUNCTION IF EXISTS rls_resolve_password_reset_tenant(TEXT);

DROP POLICY IF EXISTS tenant_isolation_policy ON password_reset_tokens;
DROP INDEX IF EXISTS idx_password_reset_tokens_tenant_hash;
DROP INDEX IF EXISTS idx_password_reset_tokens_user;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;

ALTER TABLE integration_configs
  DROP COLUMN IF EXISTS public_settings,
  DROP COLUMN IF EXISTS encrypted_secrets;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM provider_locations WHERE location IS NULL) THEN
    ALTER TABLE provider_locations ALTER COLUMN location SET NOT NULL;
  END IF;
END $$;
