-- ==============================================================================
-- Down Migration: 015_phase2_auth_resets_and_encrypted_integrations.down.sql
-- Safe rollback: refuses to discard encrypted integration secrets or NULL locations.
-- ==============================================================================

DO $$
DECLARE
  t RECORD;
  v_has_secrets BOOLEAN := FALSE;
  v_has_null_loc BOOLEAN := FALSE;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.current_tenant_id', t.id::text, true);
    IF EXISTS (
      SELECT 1 FROM integration_configs
      WHERE encrypted_secrets IS NOT NULL AND encrypted_secrets <> '{}'::jsonb
    ) THEN
      v_has_secrets := TRUE;
      EXIT;
    END IF;
    IF EXISTS (SELECT 1 FROM provider_locations WHERE location IS NULL) THEN
      v_has_null_loc := TRUE;
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant_id', '', true);

  IF v_has_secrets THEN
    RAISE EXCEPTION 'MIGRATION 015 ROLLBACK ABORTED: integration_configs contains encrypted_secrets.';
  END IF;
  IF v_has_null_loc THEN
    RAISE EXCEPTION 'MIGRATION 015 ROLLBACK ABORTED: provider_locations contains rows with NULL location.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS rls_resolve_password_reset_tenant(TEXT);

DROP POLICY IF EXISTS tenant_isolation_policy ON password_reset_tokens;
DROP INDEX IF EXISTS idx_password_reset_tokens_tenant_hash;
DROP INDEX IF EXISTS idx_password_reset_tokens_user;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;

ALTER TABLE integration_configs
  DROP COLUMN IF EXISTS public_settings,
  DROP COLUMN IF EXISTS encrypted_secrets;

ALTER TABLE provider_locations ALTER COLUMN location SET NOT NULL;
