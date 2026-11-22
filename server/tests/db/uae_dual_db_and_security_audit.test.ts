/**
 * Real-PostgreSQL Verification Suite for:
 *  - Migration 013 Fail-Closed FORCE RLS (non-superuser role, BUG-DB-001 & BUG-DB-002)
 *  - Dual-Database Seeding: seed-demo.ts (Dubai 12 AED services, 10 Dubai techs, 45 bookings w/ 5% VAT) vs seed-production.ts (ZERO demo data)
 *  - Demo Mode Safeguards (one-click demo login + destructive action blocking)
 *  - Security & Financial Fixes (BUG-BE-004, BUG-BE-005, BUG-DEVOPS-002, server-side 5% UAE VAT)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, seedWorld, type TestDb } from '../helpers/db.js';
import { pool } from '../../src/database/pool.js';
import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { validateEnv } from '../../src/config/env.js';
import { runDemoSeed } from '../../src/database/seed-demo.js';
import { runProductionSeed } from '../../src/database/seed-production.js';

describe('UAE Turnkey, Dual-Database Seeding & Fail-Closed RLS Suite (Real PostgreSQL 16)', () => {
  let db: TestDb;
  let origQuery: typeof pool.query;
  let origConnect: typeof pool.connect;
  let app: Awaited<ReturnType<typeof buildApp>>;

  before(async () => {
    db = await startTestDb();
    origQuery = pool.query.bind(pool);
    origConnect = pool.connect.bind(pool);
    (pool as any).query = db.pool.query.bind(db.pool);
    (pool as any).connect = db.pool.connect.bind(db.pool);
    app = await buildApp();
  });

  after(async () => {
    delete process.env.APP_DEMO_MODE;
    delete process.env.PROD_ADMIN_PASSWORD;
    await app.close();
    (pool as any).query = origQuery;
    (pool as any).connect = origConnect;
    await db.stop();
  });

  it('BUG-DB-001 & BUG-DB-002: Migration 013 enforces fail-closed FORCE RLS as a non-superuser role', async () => {
    const wA = await seedWorld(db.pool, 'rls-alpha');
    const wB = await seedWorld(db.pool, 'rls-beta');

    // Create a non-superuser application role and grant table access
    await db.pool.query(`DO $$ BEGIN CREATE ROLE serviceos_rls_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await db.pool.query(`GRANT USAGE ON SCHEMA public TO serviceos_rls_app`);
    await db.pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serviceos_rls_app`);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE serviceos_rls_app');

      // 1. Unset app.current_tenant_id -> MUST return 0 rows (fail-closed!)
      const unsetRes = await client.query(`SELECT id FROM users`);
      assert.equal(unsetRes.rows.length, 0, 'Fail-closed RLS must return 0 rows when app.current_tenant_id is unset');

      // 2. Scoped to Tenant A -> MUST see only Tenant A users, 0 Tenant B users
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [wA.tenantId]);
      const scopedRes = await client.query<{ tenant_id: string }>(`SELECT tenant_id FROM users`);
      assert.ok(scopedRes.rows.length > 0, 'Tenant A should see its own users');
      assert.ok(
        scopedRes.rows.every((r) => r.tenant_id === wA.tenantId),
        'Tenant A must never see Tenant B rows'
      );
      assert.equal(
        scopedRes.rows.some((r) => r.tenant_id === wB.tenantId),
        false,
        'Cross-tenant leakage detected'
      );

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('seed-demo.ts populates 12 UAE AED services, 10 Dubai technicians, and 45 historical bookings with 5% VAT (idempotent)', async () => {
    const first = await runDemoSeed(db.pool);
    assert.equal(first.servicesSeeded, 12);
    assert.equal(first.techniciansSeeded, 10);
    assert.equal(first.bookingsSeeded, 45);

    const vatCheck = await db.pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM invoices WHERE tenant_id = $1 AND tax_rate_bps = 500 AND tax_total_cents > 0`,
      [first.tenantId]
    );
    assert.equal(parseInt(vatCheck.rows[0].cnt, 10), 45, 'All 45 Dubai demo invoices must include 5% UAE VAT');

    // Re-running seed:demo must be idempotent (0 duplicate bookings)
    const second = await runDemoSeed(db.pool);
    assert.equal(second.bookingsSeeded, 0);
  });

  it('seed-production.ts creates a clean UAE tenant (AED, 5% VAT) with ZERO fake bookings/customers/technicians', async () => {
    process.env.PROD_TENANT_SLUG = 'clean-buyer-uae';
    process.env.PROD_ADMIN_EMAIL = 'owner@buyercompany.ae';
    process.env.PROD_ADMIN_PASSWORD = 'CleanProductionPassword2026!';

    const res = await runProductionSeed(db.pool);
    const bookingsCnt = await db.pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM bookings WHERE tenant_id = $1`, [res.tenantId]);
    const customersCnt = await db.pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM customer_profiles WHERE tenant_id = $1`, [res.tenantId]);
    const techsCnt = await db.pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM provider_profiles WHERE tenant_id = $1`, [res.tenantId]);
    const tenantRow = await db.pool.query(`SELECT currency_code, default_tax_rate_bps FROM tenants WHERE id = $1`, [res.tenantId]);

    assert.equal(parseInt(bookingsCnt.rows[0].cnt, 10), 0);
    assert.equal(parseInt(customersCnt.rows[0].cnt, 10), 0);
    assert.equal(parseInt(techsCnt.rows[0].cnt, 10), 0);
    assert.equal(tenantRow.rows[0].currency_code, 'AED');
    assert.equal(Number(tenantRow.rows[0].default_tax_rate_bps), 500);
  });

  it('Demo Mode safeguards: /auth/demo-login works only when APP_DEMO_MODE=true and blocks /auth/change-password', async () => {
    const demoTenantRes = await db.pool.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = 'dubai-demo' LIMIT 1`);
    const demoTenantId = demoTenantRes.rows[0].id;

    // 1. Disabled by default -> 403
    process.env.APP_DEMO_MODE = 'false';
    const disabledRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/demo-login',
      headers: { 'x-tenant-id': demoTenantId },
      payload: { role: 'ADMIN' },
    });
    assert.equal(disabledRes.statusCode, 403);

    // 2. Enabled -> 200 with real JWT
    process.env.APP_DEMO_MODE = 'true';
    const enabledRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/demo-login',
      headers: { 'x-tenant-id': demoTenantId },
      payload: { role: 'ADMIN' },
    });
    assert.equal(enabledRes.statusCode, 200);
    const token = enabledRes.json().data.accessToken;
    assert.ok(token);

    // 3. Destructive password change blocked in Demo Mode -> 403 DEMO_MODE_RESTRICTED
    const pwdRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': demoTenantId },
      payload: { currentPassword: 'DubaiDemo2026!', newPassword: 'NewPassword2026!' },
    });
    assert.equal(pwdRes.statusCode, 403);
    assert.equal(pwdRes.json().error.code, 'DEMO_MODE_RESTRICTED');
    process.env.APP_DEMO_MODE = 'false';
  });

  it('BUG-BE-004 & BUG-BE-005 & BUG-DEVOPS-002 & 5% VAT: Security and server-side VAT invariants hold', async () => {
    const w = await seedWorld(db.pool, 'sec-check-uae');
    await db.pool.query(`UPDATE tenants SET currency_code = 'AED', default_tax_rate_bps = 500 WHERE id = $1`, [w.tenantId]);

    // Deactivate technician -> PUT /crm/technicians/duty-status MUST return 403 and NOT reactivate
    await db.pool.query(`UPDATE provider_profiles SET is_active = FALSE WHERE user_id = $1`, [w.techId]);
    const techToken = AuthService.generateAccessToken({ id: w.techId, role: 'TECHNICIAN', tenantId: w.tenantId, email: 'tech@sec-check-uae.test' });
    const dutyRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/crm/technicians/duty-status',
      headers: { authorization: `Bearer ${techToken}`, 'x-tenant-id': w.tenantId },
      payload: { dutyStatus: 'ONLINE' },
    });
    assert.equal(dutyRes.statusCode, 403);
    const activeCheck = await db.pool.query<{ is_active: boolean }>(`SELECT is_active FROM provider_profiles WHERE user_id = $1`, [w.techId]);
    assert.equal(activeCheck.rows[0].is_active, false, 'Deactivated technician must stay inactive');

    // Technician cannot open customer support ticket (BUG-BE-004)
    const tickRes = await app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { authorization: `Bearer ${techToken}`, 'x-tenant-id': w.tenantId },
      payload: { subject: 'Test ticket', category: 'General', priority: 'NORMAL', initialMessage: 'Testing role guard' },
    });
    assert.equal(tickRes.statusCode, 403);

    // Server-side 5% UAE VAT calculation on POST /api/v1/bookings
    const custToken = AuthService.generateAccessToken({ id: w.customerId, role: 'CUSTOMER', tenantId: w.tenantId, email: 'cust@sec-check-uae.test' });
    const bkRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${custToken}`, 'x-tenant-id': w.tenantId },
      payload: {
        serviceId: w.serviceId, // 10000 cents + 2000 diagnostic = 12000 subtotal -> 5% VAT = 600 -> 12600 total
        addressText: 'Marina Promenade, Dubai Marina',
        latitude: 25.0805,
        longitude: 55.1403,
      },
    });
    assert.equal(bkRes.statusCode, 202);
    const bkData = bkRes.json().data;
    assert.equal(bkData.subtotalCents, 12000);
    assert.equal(bkData.vatRatePercent, 5);
    assert.equal(bkData.vatAmountCents, 600);
    assert.equal(bkData.preAuthAmountCents, 12600);
    assert.equal(bkData.currency, 'AED');

    // BUG-DEVOPS-002: validateEnv rejects .env.example placeholder secrets in production
    assert.throws(() => {
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'ReplaceWithSecureJwtSecretKeyMin32CharactersLong2026!',
        JWT_REFRESH_SECRET: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        BOOTSTRAP_TOKEN: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
        APP_ENCRYPTION_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      });
    }, /default insecure JWT_SECRET/);
  });
});
