import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');

describe('Database Migrations Validation Suite', () => {
  it('All migration files have matching down-migration rollback scripts', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    const upFiles = files.filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'));
    const downFiles = files.filter(f => f.endsWith('.down.sql'));

    assert.ok(upFiles.length >= 8, `Expected at least 8 up-migration domain files, found ${upFiles.length}`);
    assert.equal(upFiles.length, downFiles.length, 'Every up-migration domain file must have an exact matching down-migration rollback script');

    for (const up of upFiles) {
      const expectedDown = up.replace('.sql', '.down.sql');
      assert.ok(
        downFiles.includes(expectedDown),
        `Missing rollback script for migration: ${up}`
      );
    }
  });

  it('All up-migrations are non-empty and syntactically structured', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'));

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      assert.ok(sql.trim().length > 100, `Migration ${file} is suspiciously short`);
      assert.ok(sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE'), `Migration ${file} must declare or alter tables`);
      
      // Ensure no hardcoded personal or demo data exists in migrations
      assert.ok(!sql.includes('john@example.com'), `${file} contains demo email`);
      assert.ok(!sql.includes('555-0199'), `${file} contains demo phone`);
    }
  });

  it('PostGIS spatial extension and columns are defined', () => {
    const sql001 = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_tenants_and_auth.sql'), 'utf-8');
    assert.ok(sql001.includes('CREATE EXTENSION IF NOT EXISTS "postgis"'), 'PostGIS extension must be declared in 001');

    const sql002 = fs.readFileSync(path.join(MIGRATIONS_DIR, '002_profiles_and_entities.sql'), 'utf-8');
    assert.ok(sql002.includes('GEOGRAPHY(Point, 4326)'), 'Provider locations and addresses must use PostGIS Point');
    assert.ok(sql002.includes('USING GIST (location)'), 'Spatial GIST index must be defined on location');
  });

  it('Double-entry ledger constraints are strictly enforced', () => {
    const sql005 = fs.readFileSync(path.join(MIGRATIONS_DIR, '005_finance_and_ledger.sql'), 'utf-8');
    assert.ok(sql005.includes('CREATE TABLE IF NOT EXISTS ledger_entries'), 'Ledger entries table must exist');
    assert.ok(sql005.includes('chk_debit_credit_different'), 'Debit and credit accounts must be strictly different');
    assert.ok(sql005.includes('amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)'), 'Ledger amounts must be positive');
  });

  it('Down migration 007 safely aborts with RAISE EXCEPTION if active financial data exists (DB-01, DB-02)', () => {
    const down007 = fs.readFileSync(path.join(MIGRATIONS_DIR, '007_finance_invoices_patch.down.sql'), 'utf-8');
    
    assert.match(
      down007,
      /RAISE\s+EXCEPTION[\s\S]*?Cannot roll back migration 007[\s\S]*?idempotency/,
      'Rollback script must explicitly abort if idempotency records exist'
    );

    assert.match(
      down007,
      /RAISE\s+EXCEPTION[\s\S]*?Cannot roll back migration 007[\s\S]*?VOIDED or PENDING/,
      'Rollback script must explicitly abort if transactions in VOIDED or PENDING state exist'
    );
  });

  it('Down migration 008 safely aborts with RAISE EXCEPTION if cross-tenant duplicate idempotency keys exist (DB-01)', () => {
    const down008 = fs.readFileSync(path.join(MIGRATIONS_DIR, '008_payout_tenant_idempotency_and_durability.down.sql'), 'utf-8');
    assert.match(
      down008,
      /RAISE\s+EXCEPTION[\s\S]*?Cannot roll back migration 008[\s\S]*?cross-tenant duplicate idempotency_keys exist/,
      'Rollback script for migration 008 must explicitly abort if duplicate idempotency keys exist'
    );
  });

  it('Migration 009 defines payout_id, posting_type, and idempotent unique indexes on ledger_entries', () => {
    const up009 = fs.readFileSync(path.join(MIGRATIONS_DIR, '009_ledger_payout_and_booking_references.sql'), 'utf-8');
    assert.match(up009, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+payout_id\s+UUID/i, '009 must add payout_id foreign key');
    assert.match(up009, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+posting_type\s+VARCHAR/i, '009 must add posting_type column');
    assert.match(up009, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_ledger_payout_posting/i, '009 must define uq_ledger_payout_posting');
    assert.match(up009, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_ledger_tx_posting/i, '009 must define uq_ledger_tx_posting');

    const down009 = fs.readFileSync(path.join(MIGRATIONS_DIR, '009_ledger_payout_and_booking_references.down.sql'), 'utf-8');
    assert.match(down009, /DROP\s+INDEX\s+IF\s+EXISTS\s+uq_ledger_tx_posting/i, '009 down must drop uq_ledger_tx_posting');
    assert.match(down009, /DROP\s+INDEX\s+IF\s+EXISTS\s+uq_ledger_payout_posting/i, '009 down must drop uq_ledger_payout_posting');
    assert.match(down009, /DROP\s+COLUMN\s+IF\s+EXISTS\s+payout_id/i, '009 down must drop payout_id column');
  });

  it('docker-compose.yml environment interpolations are safely quoted against YAML parse errors', () => {
    const composePath = path.resolve(__dirname, '../../docker-compose.yml');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
    const composeContent = fs.readFileSync(composePath, 'utf-8');
    
    // Validate that YAML parser successfully parses the file without nested mapping errors
    const parsed = YAML.parse(composeContent);
    assert.ok(parsed.services, 'Parsed compose must contain services');
    assert.ok(parsed.services.postgres, 'Parsed compose must define postgres');
    assert.ok(parsed.services.postgres_demo, 'Parsed compose must define isolated postgres_demo for 2-DB architecture');
    assert.ok(parsed.services.backend, 'Parsed compose must define backend');
    assert.ok(parsed.services.frontend, 'Parsed compose must define frontend');
    assert.ok(parsed.volumes.uploads_data, 'Parsed compose must define persistent uploads_data volume');
  });

  it('Nginx reverse proxy uses ^~ /api/ prefix priority so /api/v1/uploads/files/*.png is not intercepted as a static asset', () => {
    const nginxPath = path.resolve(__dirname, '../../admin_web/nginx.conf');
    assert.ok(fs.existsSync(nginxPath), 'admin_web/nginx.conf must exist');
    const nginxContent = fs.readFileSync(nginxPath, 'utf-8');

    assert.match(
      nginxContent,
      /location\s+\^~\s+\/api\/\s*\{/,
      'nginx.conf must use location ^~ /api/ to take precedence over static file extension regex'
    );
    assert.match(
      nginxContent,
      /location\s+=\s+\/health\s*\{/,
      'nginx.conf must proxy root /health to backend'
    );
  });
});
