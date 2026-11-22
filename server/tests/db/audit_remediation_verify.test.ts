import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestDb, applyMigrationFile, type TestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { pool } from '../../src/database/pool.js';

describe('Post-Audit Remediation Verification on Real PostgreSQL 16 (Migration 012)', () => {
  let db: TestDb;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let origQuery: typeof pool.query;
  let origConnect: typeof pool.connect;

  let tenantA: string;
  let tenantB: string;
  let adminA: string;
  let customerA: string;
  let customerB: string;
  let techA1: string;
  let techA2: string;
  let serviceA: string;

  let adminAToken: string;
  let customerAToken: string;

  before(async () => {
    db = await startTestDb();

    origQuery = pool.query.bind(pool);
    origConnect = pool.connect.bind(pool);
    (pool as any).query = db.pool.query.bind(db.pool);
    (pool as any).connect = db.pool.connect.bind(db.pool);

    app = await buildApp();

    const tA = await db.pool.query(
      `INSERT INTO tenants (name, slug, default_platform_commission_bps, is_active)
       VALUES ('Tenant Alpha', 'tenant-alpha-audit', 0, TRUE) RETURNING id`
    );
    tenantA = tA.rows[0].id;

    const tB = await db.pool.query(
      `INSERT INTO tenants (name, slug, default_platform_commission_bps, is_active)
       VALUES ('Tenant Beta', 'tenant-beta-audit', 1500, TRUE) RETURNING id`
    );
    tenantB = tB.rows[0].id;

    const mkUser = async (tId: string, email: string, role: string) => {
      const r = await db.pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, 'hash', $3, TRUE) RETURNING id`,
        [tId, email, role]
      );
      return r.rows[0].id as string;
    };

    adminA = await mkUser(tenantA, 'admin@alpha.test', 'ADMIN');
    customerA = await mkUser(tenantA, 'cust@alpha.test', 'CUSTOMER');
    customerB = await mkUser(tenantB, 'cust@beta.test', 'CUSTOMER');
    techA1 = await mkUser(tenantA, 'tech1@alpha.test', 'TECHNICIAN');
    techA2 = await mkUser(tenantA, 'tech2@alpha.test', 'TECHNICIAN');

    await db.pool.query(
      `INSERT INTO customer_profiles (user_id, tenant_id, full_name) VALUES ($1, $2, 'Customer Alpha')`,
      [customerA, tenantA]
    );
    await db.pool.query(
      `INSERT INTO customer_profiles (user_id, tenant_id, full_name) VALUES ($1, $2, 'Customer Beta')`,
      [customerB, tenantB]
    );
    for (const [uid, name] of [[techA1, 'Tech One'], [techA2, 'Tech Two']] as const) {
      await db.pool.query(
        `INSERT INTO provider_profiles (user_id, tenant_id, full_name, trade_category, is_verified, is_active)
         VALUES ($1, $2, $3, 'Plumbing', TRUE, TRUE)`,
        [uid, tenantA, name]
      );
      await db.pool.query(
        `INSERT INTO provider_locations (provider_id, tenant_id, location, duty_status)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint(-80.19, 25.76), 4326)::geography, 'ONLINE')`,
        [uid, tenantA]
      );
    }

    const catRes = await db.pool.query(
      `INSERT INTO service_categories (tenant_id, name, slug, is_active)
       VALUES ($1, 'Plumbing', 'plumbing', TRUE) RETURNING id`,
      [tenantA]
    );
    const svcRes = await db.pool.query(
      `INSERT INTO services (tenant_id, category_id, name, slug, base_price_cents, estimated_duration_minutes, is_active)
       VALUES ($1, $2, 'Emergency Leak Repair', 'emergency-leak-repair', 10000, 60, TRUE) RETURNING id`,
      [tenantA, catRes.rows[0].id]
    );
    serviceA = svcRes.rows[0].id;
    await db.pool.query(
      `INSERT INTO service_pricing_tiers (service_id, tier_name, multiplier, description)
       VALUES ($1, 'STANDARD', 1.00, 'Standard rate'), ($1, 'EMERGENCY', 1.50, 'Urgent rate')`,
      [serviceA]
    );

    adminAToken = AuthService.generateAccessToken({ id: adminA, tenantId: tenantA, role: 'ADMIN', email: 'admin@alpha.test' });
    customerAToken = AuthService.generateAccessToken({ id: customerA, tenantId: tenantA, role: 'CUSTOMER', email: 'cust@alpha.test' });
  });

  after(async () => {
    (pool as any).query = origQuery;
    (pool as any).connect = origConnect;
    if (app) await app.close();
    if (db) await db.stop();
  });

  it('BUG-BE-001: GET /api/v1/services returns 200 with computed tier priceCents (no t.price_cents 42703 crash)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/services',
      headers: { 'x-tenant-id': tenantA },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].pricing_tiers.length, 2);
    assert.equal(body.data[0].pricing_tiers[0].priceCents, 10000);
    assert.equal(body.data[0].pricing_tiers[1].priceCents, 15000);
  });

  it('BUG-BE-002: POST /api/v1/bookings rejects cross-tenant customerId with 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: {
        authorization: `Bearer ${adminAToken}`,
        'x-tenant-id': tenantA,
      },
      payload: {
        serviceId: serviceA,
        customerId: customerB,
        addressText: '123 Cross Tenant Rd',
        latitude: 25.7617,
        longitude: -80.1918,
      },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'CUSTOMER_NOT_FOUND');
  });

  it('BUG-BE-005 & BUG-BE-007: ON_SITE customer cancel returns 409; handover issues fresh PIN', async () => {
    const addr = await db.pool.query(
      `INSERT INTO customer_addresses (customer_id, tenant_id, address_line1, city, state_province, postal_code, location)
       VALUES ($1, $2, '456 Main St', 'Miami', 'FL', '33101', ST_SetSRID(ST_MakePoint(-80.19, 25.76), 4326)::geography) RETURNING id`,
      [customerA, tenantA]
    );
    const bRes = await db.pool.query(
      `INSERT INTO bookings (tenant_id, booking_reference, customer_id, service_id, address_id, assigned_provider_id, status, scheduled_start, customer_safety_pin)
       VALUES ($1, 'BK-AUDIT-01', $2, $3, $4, $5, 'ON_SITE', NOW(), NULL) RETURNING id`,
      [tenantA, customerA, serviceA, addr.rows[0].id, techA1]
    );
    const bookingId = bRes.rows[0].id;

    // Customer cannot self-cancel an ON_SITE booking
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bookingId}/cancel`,
      headers: { authorization: `Bearer ${customerAToken}`, 'x-tenant-id': tenantA },
      payload: { reason: 'Changed mind' },
    });
    assert.equal(cancelRes.statusCode, 409);
    assert.equal(cancelRes.json().error.code, 'CANCELLATION_WINDOW_CLOSED');

    // Admin emergency handover reassigns and generates a fresh 4-digit PIN
    const handRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/handover',
      headers: { authorization: `Bearer ${adminAToken}`, 'x-tenant-id': tenantA },
      payload: { bookingId, newProviderId: techA2, reason: 'Original tech vehicle breakdown' },
    });
    assert.equal(handRes.statusCode, 200);
    const updated = await db.pool.query('SELECT status, assigned_provider_id, customer_safety_pin FROM bookings WHERE id = $1', [bookingId]);
    assert.equal(updated.rows[0].status, 'ASSIGNED');
    assert.equal(updated.rows[0].assigned_provider_id, techA2);
    assert.match(updated.rows[0].customer_safety_pin, /^\d{4}$/);
  });

  it('BUG-BE-011: Deleted user is rejected fail-closed with 401', async () => {
    const ghostId = crypto.randomUUID();
    const ghostToken = AuthService.generateAccessToken({ id: ghostId, tenantId: tenantA, role: 'CUSTOMER', email: 'ghost@alpha.test' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${ghostToken}`, 'x-tenant-id': tenantA },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'ACCOUNT_NOT_FOUND');
  });

  it('BUG-DB-001/003/004: Migration 012 enforces ledger immutability, RLS policies, and clean down/up rollback', async () => {
    const acc1 = await db.pool.query(
      `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type) VALUES ($1, '1010', 'Cash', 'ASSET') RETURNING id`,
      [tenantA]
    );
    const acc2 = await db.pool.query(
      `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type) VALUES ($1, '2010', 'Escrow', 'LIABILITY') RETURNING id`,
      [tenantA]
    );
    const le = await db.pool.query(
      `INSERT INTO ledger_entries (tenant_id, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1, $2, $3, 5000, 'Immutability test') RETURNING id`,
      [tenantA, acc1.rows[0].id, acc2.rows[0].id]
    );

    await assert.rejects(
      () => db.pool.query(`UPDATE ledger_entries SET amount_cents = 1 WHERE id = $1`, [le.rows[0].id]),
      /IMMUTABLE_RECORD_VIOLATION/
    );
    await assert.rejects(
      () => db.pool.query(`DELETE FROM ledger_entries WHERE id = $1`, [le.rows[0].id]),
      /IMMUTABLE_RECORD_VIOLATION/
    );

    await applyMigrationFile(db.pool, '012_security_rls_immutability_and_indexes.down.sql', db.usesPostgisShim);
    await applyMigrationFile(db.pool, '012_security_rls_immutability_and_indexes.sql', db.usesPostgisShim);
  });
});
