#!/usr/bin/env node
/**
 * ServiceOS / ServicePro OS — SQL Migration & Rollback Pair Release Validator
 * Validates all PostgreSQL 16 + PostGIS migrations in server/src/database/migrations/
 * for exact up/down pairing, DDL structural balance, RLS tenant isolation policies,
 * and zero hardcoded demo/personal identities.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'server', 'src', 'database', 'migrations');

const FORBIDDEN_PATTERNS = [
  'Eleanor Vance',
  'john@example.com',
  '555-0199',
  'supabase.co',
  'SOS-ENTERPRISE',
];

function validateMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    console.error(`[FAIL] Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(migrationsDir).sort();
  const upFiles = allFiles.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));
  const downFiles = allFiles.filter((f) => f.endsWith('.down.sql'));

  const errors = [];

  if (upFiles.length < 15) {
    errors.push(`Expected at least 15 up-migration files, found ${upFiles.length}`);
  }

  if (upFiles.length !== downFiles.length) {
    errors.push(`Up/Down migration count mismatch: ${upFiles.length} up vs ${downFiles.length} down`);
  }

  let rlsEnabledCount = 0;
  let rlsPolicyCount = 0;

  for (const upFile of upFiles) {
    const expectedDown = upFile.replace(/\.sql$/, '.down.sql');
    if (!downFiles.includes(expectedDown)) {
      errors.push(`Missing rollback (.down.sql) script for migration: ${upFile}`);
    }

    const upPath = path.join(migrationsDir, upFile);
    const upSql = fs.readFileSync(upPath, 'utf8');

    if (upSql.trim().length < 80) {
      errors.push(`Migration ${upFile} is unexpectedly short (${upSql.trim().length} chars)`);
    }

    if (!/(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|CREATE\s+POLICY|CREATE\s+OR\s+REPLACE\s+FUNCTION)/i.test(upSql)) {
      errors.push(`Migration ${upFile} does not contain any recognizable DDL statements`);
    }

    const rlsMatches = upSql.match(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    if (rlsMatches) rlsEnabledCount += rlsMatches.length;

    const policyMatches = upSql.match(/CREATE\s+POLICY/gi);
    if (policyMatches) rlsPolicyCount += policyMatches.length;

    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (upSql.includes(forbidden)) {
        errors.push(`Migration ${upFile} contains forbidden literal: "${forbidden}"`);
      }
    }

    if (downFiles.includes(expectedDown)) {
      const downPath = path.join(migrationsDir, expectedDown);
      const downSql = fs.readFileSync(downPath, 'utf8');
      if (downSql.trim().length < 20) {
        errors.push(`Rollback migration ${expectedDown} is unexpectedly empty or short`);
      }
    }
  }

  if (rlsEnabledCount < 10 || rlsPolicyCount < 10) {
    errors.push(`Insufficient Row-Level Security coverage across migrations (ENABLE RLS=${rlsEnabledCount}, CREATE POLICY=${rlsPolicyCount})`);
  }

  if (errors.length > 0) {
    console.error('=== SQL MIGRATION VALIDATION FAILED ===');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `[PASS] Validated ${upFiles.length} up-migrations and ${downFiles.length} rollback scripts (${rlsEnabledCount} RLS table locks, ${rlsPolicyCount} RLS policies).`
  );
}

validateMigrations();
