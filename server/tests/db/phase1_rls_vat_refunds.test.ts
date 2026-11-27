import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';
import type { FastifyInstance } from 'fastify';
import { startTestDb, seedWorld, type TestDb } from '../helpers/db.js';
import { pool } from '../../src/database/pool.js';
import { buildApp } from '../../src/app.js';
import { env, validateEnv } from '../../src/config/env.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { setStripeForTest } from '../../src/services/stripeClient.js';
import { getPaymentGateway, GatewayOperationNotSupportedError } from '../../src/services/paymentGateway.js';
import { runDemoSeed } from '../../src/database/seed-demo.js';
import { OutboxWorker } from '../../src/workers/outbox.worker.js';

const WEBHOOK_SECRET = 'whsec_phase1_rls_test_secret_123456';
const stripeHelper = new Stripe('sk_test_dummy');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/database/migrations');

function signWebhook(payloadObj: any): { raw: string; sig: string } {
  const raw = JSON.stringify(payloadObj);
  const sig = stripeHelper.webhooks.generateTestHeaderString({
    payload: raw,
    secret: WEBHOOK_SECRET,
  });
  return { raw, sig };
}

describe('Phase 1 Gate: Non-Superuser FORCE RLS, Universal 2030 Tax Accounting, Refunds, PayTabs/Telr & Dual-DB Isolation', () => {
  let db: TestDb;
  let appPool: pg.Pool;
  let app: FastifyInstance;
  let originalQuery: any;
  let originalConnect: any;
  let originalWebhookSecret: string | undefined;
  let originalStripeKey: string | undefined;
  let originalOutboxEnabled: string | undefined;
  let activeTxCount = 0;
  let fakeStripe: any;

  let worldA: Awaited<ReturnType<typeof seedWorld>>;
  let worldB: Awaited<ReturnType<typeof seedWorld>>;
  let staffAId: string;

  let refundCallCount = 0;
  let refundMode: 'ok' | 'serial_ok' | 'gated_ok' = 'ok';
  let onRefundEntered: (() => void) | null = null;
  let releaseRefundGate: (() => void) | null = null;

  function assertNoActiveDbTx(opName: string) {
    if (activeTxCount > 0) {
      throw new Error(`EXTERNAL_CALL_INSIDE_DB_TRANSACTION: ${opName} invoked with ${activeTxCount} open TX`);
    }
  }

  before(async () => {
    originalOutboxEnabled = process.env.OUTBOX_WORKER_ENABLED;
    process.env.OUTBOX_WORKER_ENABLED = 'false';

    db = await startTestDb();

    // Seed Tenant A: UAE (AED, 5% VAT, 15% commission)
    worldA = await seedWorld(db.pool, 'uae-co');
    await db.pool.query(
      `UPDATE tenants
       SET currency_code = 'AED', currency_symbol = 'AED ', country_code = 'AE',
           tax_name = 'VAT', default_tax_rate_bps = 500, default_platform_commission_bps = 1500,
           distance_unit = 'km', default_locale = 'en'
       WHERE id = $1`,
      [worldA.tenantId]
    );
    await db.pool.query(`UPDATE services SET base_price_cents = 8000 WHERE id = $1`, [worldA.serviceId]);
    const custPasswordHash = await AuthService.hashPassword('CustPass123!');
    await db.pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [custPasswordHash, worldA.customerId]);

    // Seed STAFF user in Tenant A (does NOT have finance:refund:adjudicate)
    staffAId = (
      await db.pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active, is_verified)
         VALUES ($1, 'staff@uae-co.test', $2, 'STAFF', TRUE, TRUE) RETURNING id`,
        [worldA.tenantId, custPasswordHash]
      )
    ).rows[0].id;
    await db.pool.query(`INSERT INTO staff_profiles (user_id, tenant_id, full_name) VALUES ($1, $2, 'Staff Ops')`, [staffAId, worldA.tenantId]);

    // Seed Tenant B: EU Germany (EUR, 19% MwSt, 20% commission, de-DE)
    worldB = await seedWorld(db.pool, 'berlin-de');
    await db.pool.query(
      `UPDATE tenants
       SET currency_code = 'EUR', currency_symbol = '€', country_code = 'DE',
           tax_name = 'MwSt', default_tax_rate_bps = 1900, default_platform_commission_bps = 2000,
           distance_unit = 'km', default_locale = 'de-DE'
       WHERE id = $1`,
      [worldB.tenantId]
    );
    await db.pool.query(`UPDATE services SET base_price_cents = 8000 WHERE id = $1`, [worldB.serviceId]);
    await db.pool.query(`UPDATE provider_profiles SET is_verified = TRUE WHERE user_id IN ($1, $2)`, [
      worldA.techId,
      worldB.techId,
    ]);

    // Create strict non-superuser NOBYPASSRLS application DB role
    await db.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'serviceos_app_test') THEN
          CREATE ROLE serviceos_app_test LOGIN PASSWORD 'app_pw_phase1' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO serviceos_app_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serviceos_app_test;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO serviceos_app_test;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO serviceos_app_test;
    `);

    const appUrl = new URL(db.url);
    appUrl.username = 'serviceos_app_test';
    appUrl.password = 'app_pw_phase1';
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });

    // Point Fastify singleton pool at the NOBYPASSRLS pool and track open transactions
    originalQuery = pool.query;
    originalConnect = pool.connect;
    (pool as any).query = appPool.query.bind(appPool);
    (pool as any).connect = async () => {
      const client = await appPool.connect();
      const rawQuery = client.query.bind(client);
      const rawRelease = client.release.bind(client);
      let inTx = false;
      (client as any).query = async (...args: any[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
        const upper = sql.trim().toUpperCase();
        if (upper === 'BEGIN' || upper.startsWith('BEGIN ')) {
          if (!inTx) { inTx = true; activeTxCount += 1; }
        }
        try {
          return await (rawQuery as any)(...args);
        } finally {
          if (upper === 'COMMIT' || upper === 'ROLLBACK' || upper.startsWith('COMMIT ') || upper.startsWith('ROLLBACK ')) {
            if (inTx) { inTx = false; activeTxCount -= 1; }
          }
        }
      };
      (client as any).release = (...args: any[]) => {
        if (inTx) { inTx = false; activeTxCount -= 1; }
        return (rawRelease as any)(...args);
      };
      return client;
    };

    originalWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
    originalStripeKey = env.STRIPE_SECRET_KEY;
    (env as any).STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    (env as any).STRIPE_SECRET_KEY = 'sk_test_phase1_mock_key';

    let seqPi = 0;
    fakeStripe = {
      webhooks: stripeHelper.webhooks,
      paymentIntents: {
        create: async (params: any) => {
          assertNoActiveDbTx('paymentIntents.create');
          seqPi += 1;
          return {
            id: `pi_phase1_${seqPi}`,
            client_secret: `pi_phase1_${seqPi}_secret`,
            status: 'requires_capture',
            amount: params.amount,
            currency: params.currency,
          };
        },
        retrieve: async (id: string) => {
          assertNoActiveDbTx('paymentIntents.retrieve');
          return { id, status: 'requires_capture', client_secret: `${id}_secret` };
        },
        capture: async (id: string) => {
          assertNoActiveDbTx('paymentIntents.capture');
          return { id, status: 'succeeded' };
        },
        cancel: async (id: string) => {
          assertNoActiveDbTx('paymentIntents.cancel');
          return { id, status: 'canceled' };
        },
      },
      transfers: {
        create: async (params: any) => {
          assertNoActiveDbTx('transfers.create');
          return { id: `tr_phase1_${Date.now()}_${params.amount}` };
        },
        retrieve: async (id: string) => {
          assertNoActiveDbTx('transfers.retrieve');
          return { id, reversed: false };
        },
      },
      refunds: {
        create: async (params: any, opts: any) => {
          assertNoActiveDbTx('refunds.create');
          refundCallCount += 1;
          if (refundMode === 'gated_ok') {
            await new Promise<void>((resolve) => {
              releaseRefundGate = resolve;
              onRefundEntered?.();
              onRefundEntered = null;
            });
          } else if (refundMode === 'serial_ok') {
            await new Promise((r) => setTimeout(r, 20));
          }
          return {
            id: `re_phase1_${refundCallCount}_${String(opts?.idempotencyKey || '').slice(0, 16)}`,
            amount: params.amount,
            status: 'succeeded',
          };
        },
      },
    };
    setStripeForTest(fakeStripe);

    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    setStripeForTest(null);
    (env as any).STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    (env as any).STRIPE_SECRET_KEY = originalStripeKey;
    if (originalOutboxEnabled === undefined) delete process.env.OUTBOX_WORKER_ENABLED;
    else process.env.OUTBOX_WORKER_ENABLED = originalOutboxEnabled;

    if (originalQuery) (pool as any).query = originalQuery;
    if (originalConnect) (pool as any).connect = originalConnect;
    if (appPool) await appPool.end();
    if (app) await app.close();
    if (db) await db.stop();
  });

  function bearer(userId: string, role: string, tenantId: string, email = 'user@test.local') {
    return `Bearer ${AuthService.generateAccessToken({ id: userId, role, tenantId, email })}`;
  }

  test('1. NOBYPASSRLS role runs full auth -> booking -> outbox -> webhook -> completion (2030 VAT) -> payout & blocks cross-tenant queries', async () => {
    // Verify DB role truly lacks SUPERUSER and BYPASSRLS
    const roleCheck = await appPool.query(
      `SELECT current_user, u.usesuper, u.usebypassrls
       FROM pg_user u WHERE u.usename = current_user`
    );
    assert.equal(roleCheck.rows[0].current_user, 'serviceos_app_test');
    assert.equal(roleCheck.rows[0].usesuper, false);
    assert.equal(roleCheck.rows[0].usebypassrls, false);

    // Seed a booking row in Tenant B directly as superuser and confirm NOBYPASSRLS sees 0 rows without GUC
    await db.pool.query(
      `INSERT INTO customer_addresses (customer_id, tenant_id, address_line1, city, state_province, postal_code, location)
       VALUES ($1, $2, '1 Berlin Str', 'Berlin', 'BE', '10115', ST_SetSRID(ST_MakePoint(13.4, 52.5), 4326)::geography)`,
      [worldB.customerId, worldB.tenantId]
    );
    const addrB = (await db.pool.query(`SELECT id FROM customer_addresses WHERE tenant_id = $1 LIMIT 1`, [worldB.tenantId])).rows[0].id;
    await db.pool.query(
      `INSERT INTO bookings (tenant_id, booking_reference, customer_id, service_id, address_id, status, scheduled_start, customer_safety_pin)
       VALUES ($1, 'DE-ISO-1', $2, $3, $4, 'REQUESTED', NOW(), '9999')`,
      [worldB.tenantId, worldB.customerId, worldB.serviceId, addrB]
    );

    const noGucCount = await appPool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM bookings`);
    assert.equal(noGucCount.rows[0].cnt, 0, 'FORCE RLS must return 0 rows when app.current_tenant_id is unset');

    // Login, refresh, /me, logout via Fastify under NOBYPASSRLS
    const realLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-id': worldA.tenantId, 'x-client-platform': 'flutter' },
      payload: { email: 'cust@uae-co.test', password: 'CustPass123!' },
    });
    assert.equal(realLoginRes.statusCode, 200, realLoginRes.body);
    const { accessToken: custAccess, refreshToken } = realLoginRes.json().data;
    assert.ok(refreshToken);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${custAccess}`, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(meRes.statusCode, 200, meRes.body);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-tenant-id': worldA.tenantId, 'x-client-platform': 'flutter' },
      payload: { refreshToken },
    });
    assert.equal(refreshRes.statusCode, 200, refreshRes.body);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'x-tenant-id': worldA.tenantId, 'x-client-platform': 'flutter' },
      payload: { refreshToken: refreshRes.json().data.refreshToken },
    });
    assert.equal(logoutRes.statusCode, 200, logoutRes.body);

    // Technician online GPS ping
    const techAuth = bearer(worldA.techId, 'TECHNICIAN', worldA.tenantId, 'tech@uae-co.test');
    const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@uae-co.test');
    const custAuth = `Bearer ${custAccess}`;

    const pingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/technicians/location-ping',
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { latitude: 25.2048, longitude: 55.2708, dutyStatus: 'ONLINE' },
    });
    assert.equal(pingRes.statusCode, 200, pingRes.body);

    // Customer creates booking (8000 labor + 2000 diagnostic = 10000 subtotal + 5% VAT = 10500 total)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        serviceId: worldA.serviceId,
        addressText: 'Boulevard Plaza Tower 1',
        city: 'Dubai',
        state: 'DU',
        postalCode: '00000',
        latitude: 25.205,
        longitude: 55.271,
      },
    });
    assert.equal(createRes.statusCode, 202, createRes.body);
    const created = createRes.json().data;
    assert.equal(created.subtotalCents, 10000);
    assert.equal(created.vatAmountCents, 500);
    assert.equal(created.preAuthAmountCents, 10500);

    // Verify dynamic invoice tax item label (uses tenant taxName 'VAT', not hardcoded 'UAE VAT')
    const taxItemRes = await db.pool.query(
      `SELECT ii.description, ii.total_cents FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.booking_id = $1 AND ii.item_type = 'TAX'`,
      [created.bookingId]
    );
    assert.equal(taxItemRes.rows[0].description, 'VAT (5.00%)');
    assert.equal(Number(taxItemRes.rows[0].total_cents), 500);

    // Run OutboxWorker directly on NOBYPASSRLS pool
    const worker = new OutboxWorker(appPool, { leaseMs: 15000 });
    const jobRes = await worker.processNextJob();
    assert.equal(jobRes.status, 'COMPLETED');

    const txRow = (await db.pool.query(
      `SELECT pt.id, pt.stripe_payment_intent_id, pt.invoice_id
       FROM payment_transactions pt JOIN invoices i ON i.id = pt.invoice_id
       WHERE i.booking_id = $1`,
      [created.bookingId]
    )).rows[0];

    // Webhook resolves tenant cleanly under NOBYPASSRLS
    const { raw, sig } = signWebhook({
      id: `evt_cap_uae_${created.bookingId}`,
      type: 'payment_intent.amount_capturable_updated',
      data: {
        object: {
          id: txRow.stripe_payment_intent_id,
          status: 'requires_capture',
          metadata: { tenantId: worldA.tenantId, transactionId: txRow.id },
        },
      },
    });
    const whRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(whRes.statusCode, 200, whRes.body);

    // Verify dispatch broadcast offered payout is computed on PRE-TAX subtotal (8500 = 85% of 10000, NOT 8925)
    const pendingRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/broadcasts/pending',
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(pendingRes.statusCode, 200, pendingRes.body);
    const offer = pendingRes.json().data.find((o: any) => o.bookingId === created.bookingId);
    assert.ok(offer);
    assert.equal(Number(offer.offeredPayoutCents), 8500);

    // Accept -> Verify Arrival -> Complete work order
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/broadcasts/accept',
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: created.bookingId },
    });
    assert.equal(acceptRes.statusCode, 200, acceptRes.body);

    const arrRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${created.bookingId}/verify-arrival`,
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { safetyPin: created.safetyPin, latitude: 25.205, longitude: 55.271 },
    });
    assert.equal(arrRes.statusCode, 200, arrRes.body);

    const compRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${created.bookingId}/complete`,
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { workSummaryNotes: 'Completed UAE AC tuneup' },
    });
    assert.equal(compRes.statusCode, 200, compRes.body);

    // Verify double-entry 2030 VAT separation
    const ledgerRows = (
      await db.pool.query(
        `SELECT le.posting_type, la_d.account_number AS dr, la_c.account_number AS cr, le.amount_cents
         FROM ledger_entries le
         JOIN ledger_accounts la_d ON la_d.id = le.debit_account_id
         JOIN ledger_accounts la_c ON la_c.id = le.credit_account_id
         WHERE le.transaction_id = $1`,
        [txRow.id]
      )
    ).rows;
    const byType = Object.fromEntries(ledgerRows.map((r: any) => [r.posting_type, r]));
    assert.equal(Number(byType.ESCROW_CAPTURE.amount_cents), 10500);
    assert.equal(Number(byType.TAX_PAYABLE.amount_cents), 500);
    assert.equal(byType.TAX_PAYABLE.cr, '2030');
    assert.equal(Number(byType.PLATFORM_FEE.amount_cents), 1500);
    assert.equal(byType.PLATFORM_FEE.cr, '4010');
    assert.equal(Number(byType.TECH_PAYABLE.amount_cents), 8500);
    assert.equal(byType.TECH_PAYABLE.cr, '2020');

    // Account 2010 must net to 0 for this transaction
    const net2010 = await db.pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN la_c.account_number = '2010' THEN le.amount_cents ELSE 0 END), 0)::bigint -
        COALESCE(SUM(CASE WHEN la_d.account_number = '2010' THEN le.amount_cents ELSE 0 END), 0)::bigint AS net
       FROM ledger_entries le
       JOIN ledger_accounts la_d ON la_d.id = le.debit_account_id
       JOIN ledger_accounts la_c ON la_c.id = le.credit_account_id
       WHERE le.transaction_id = $1`,
      [txRow.id]
    );
    assert.equal(Number(net2010.rows[0].net), 0);

    // Verify GET /payouts & POST /payouts enforce pre-tax 8500 cap (cannot withdraw tax or commission)
    const payGetRes = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/payouts',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(payGetRes.statusCode, 200, payGetRes.body);
    const bal = payGetRes.json().data.balances.find((b: any) => b.providerId === worldA.techId);
    assert.equal(bal.totalEarnedCents, 8500);
    assert.equal(bal.unpaidBalanceCents, 8500);

    const overPayout = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/payouts',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'uae-overpay-1' },
      payload: { providerId: worldA.techId, amountCents: 8600 },
    });
    assert.equal(overPayout.statusCode, 400);
    assert.equal(overPayout.json().error.code, 'INSUFFICIENT_PAYOUT_BALANCE');

    const okPayout = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/payouts',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'uae-pay-1' },
      payload: { providerId: worldA.techId, amountCents: 8500 },
    });
    assert.equal(okPayout.statusCode, 200, okPayout.body);

    const reconRes = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/reconciliation-report',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(reconRes.statusCode, 200);
    assert.equal(reconRes.json().data.healthy, true);

    // Cross-tenant isolation inside NOBYPASSRLS transaction: Tenant A sees only Tenant A
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [worldA.tenantId]);
      const tIds = await client.query(`SELECT DISTINCT tenant_id FROM bookings`);
      assert.deepEqual(tIds.rows.map((r: any) => r.tenant_id), [worldA.tenantId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  test('2. Universal Multi-Country config (EU DE 19% MwSt EUR) and pre-tax 2030 accounting', async () => {
    const cfgRes = await app.inject({
      method: 'GET',
      url: '/api/v1/system/config',
      headers: { 'x-tenant-id': worldB.tenantId },
    });
    assert.equal(cfgRes.statusCode, 200, cfgRes.body);
    const cfg = cfgRes.json().data;
    assert.equal(cfg.defaultCurrency, 'EUR');
    assert.equal(cfg.defaultVatPercent, 19);
    assert.equal(cfg.defaultTaxName, 'MwSt');
    assert.equal(cfg.defaultCountryCode, 'DE');
    assert.equal(cfg.tenant.defaultLocale, 'de-DE');

    const custBAuth = bearer(worldB.customerId, 'CUSTOMER', worldB.tenantId, 'cust@berlin-de.test');
    const techBAuth = bearer(worldB.techId, 'TECHNICIAN', worldB.tenantId, 'tech@berlin-de.test');

    const pingBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/technicians/location-ping',
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { latitude: 52.52, longitude: 13.405, dutyStatus: 'ONLINE' },
    });
    assert.equal(pingBRes.statusCode, 200, pingBRes.body);

    const bRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: custBAuth, 'x-tenant-id': worldB.tenantId },
      payload: {
        serviceId: worldB.serviceId,
        addressText: 'Friedrichstrasse 100',
        city: 'Berlin',
        state: 'BE',
        postalCode: '10117',
        latitude: 52.521,
        longitude: 13.388,
      },
    });
    assert.equal(bRes.statusCode, 202, bRes.body);
    const bData = bRes.json().data;
    assert.equal(bData.subtotalCents, 10000);
    assert.equal(bData.vatAmountCents, 1900);
    assert.equal(bData.preAuthAmountCents, 11900);
    assert.equal(bData.currency, 'EUR');

    const taxItem = await db.pool.query(
      `SELECT ii.description FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.booking_id = $1 AND ii.item_type = 'TAX'`,
      [bData.bookingId]
    );
    assert.equal(taxItem.rows[0].description, 'MwSt (19.00%)');

    // Run outbox + accept + verify + complete
    const worker = new OutboxWorker(appPool, { leaseMs: 15000 });
    assert.equal((await worker.processNextJob()).status, 'COMPLETED');
    const acceptBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/broadcasts/accept',
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { bookingId: bData.bookingId },
    });
    assert.equal(acceptBRes.statusCode, 200, acceptBRes.body);
    const arrBRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bData.bookingId}/verify-arrival`,
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { safetyPin: bData.safetyPin, latitude: 52.521, longitude: 13.388 },
    });
    assert.equal(arrBRes.statusCode, 200, arrBRes.body);
    const comp = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bData.bookingId}/complete`,
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { workSummaryNotes: 'Berlin boiler maintenance' },
    });
    assert.equal(comp.statusCode, 200, comp.body);

    const txRow = (await db.pool.query(
      `SELECT pt.id FROM payment_transactions pt JOIN invoices i ON i.id = pt.invoice_id WHERE i.booking_id = $1`,
      [bData.bookingId]
    )).rows[0];
    const entries = (await db.pool.query(
      `SELECT posting_type, amount_cents FROM ledger_entries WHERE transaction_id = $1`,
      [txRow.id]
    )).rows;
    const map = Object.fromEntries(entries.map((r: any) => [r.posting_type, Number(r.amount_cents)]));
    assert.equal(map.ESCROW_CAPTURE, 11900);
    assert.equal(map.TAX_PAYABLE, 1900);
    assert.equal(map.PLATFORM_FEE, 2000); // 20% of 10000 pre-tax
    assert.equal(map.TECH_PAYABLE, 8000); // 80% of 10000 pre-tax
  });

  test('3. POST /finances/refunds: RBAC 403, concurrency race, idempotency, proportional reversal, charge.refunded dedup, reconciliation, prod fail-closed', async () => {
    const custAuth = bearer(worldA.customerId, 'CUSTOMER', worldA.tenantId, 'cust@uae-co.test');
    const techAuth = bearer(worldA.techId, 'TECHNICIAN', worldA.tenantId, 'tech@uae-co.test');
    const staffAuth = bearer(staffAId, 'STAFF', worldA.tenantId, 'staff@uae-co.test');
    const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@uae-co.test');

    // Create, accept, arrive, and complete a UAE booking (10500 total = 10000 subtotal + 500 VAT)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        serviceId: worldA.serviceId,
        addressText: 'Marina Gate 2',
        city: 'Dubai',
        state: 'DU',
        postalCode: '00000',
        latitude: 25.088,
        longitude: 55.146,
      },
    });
    assert.equal(createRes.statusCode, 202);
    const bk = createRes.json().data;
    const worker = new OutboxWorker(appPool, { leaseMs: 15000 });
    assert.equal((await worker.processNextJob()).status, 'COMPLETED');

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/broadcasts/accept',
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: bk.bookingId },
    });
    assert.equal(acceptRes.statusCode, 200, acceptRes.body);
    const arrRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/verify-arrival`,
      headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
      payload: { safetyPin: bk.safetyPin, latitude: 25.088, longitude: 55.146 },
    });
    assert.equal(arrRes.statusCode, 200, arrRes.body);
    assert.equal(
      (await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bk.bookingId}/complete`,
        headers: { authorization: techAuth, 'x-tenant-id': worldA.tenantId },
        payload: { workSummaryNotes: 'Done' },
      })).statusCode,
      200
    );

    // RBAC check: STAFF lacks finance:refund:adjudicate -> 403
    const staffDenied = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: staffAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'staff-deny-1' },
      payload: { bookingId: bk.bookingId, amountCents: 1000 },
    });
    assert.equal(staffDenied.statusCode, 403);

    // Missing Idempotency-Key -> 400
    const missingKey = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: bk.bookingId, amountCents: 1000 },
    });
    assert.equal(missingKey.statusCode, 400);
    assert.equal(missingKey.json().error.code, 'IDEMPOTENCY_KEY_REQUIRED');

    // Partial refund 5250 first -> checks partial status + reconciliation-report clean!
    refundCallCount = 0;
    const partialRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'ref-partial-1' },
      payload: { bookingId: bk.bookingId, amountCents: 5250, reason: '50% service discount' },
    });
    assert.equal(partialRes.statusCode, 200, partialRes.body);
    assert.equal(partialRes.json().data.invoiceStatus, 'PARTIALLY_REFUNDED');
    assert.equal(refundCallCount, 1);

    const reconPartial = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/reconciliation-report',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(reconPartial.json().data.healthy, true);

    // Deterministic Phase 2 concurrent overlap on remaining 5250:
    // - race1 reserves PENDING in Phase 1 and pauses inside Phase 2 (Stripe call, 0 open DB TX)
    // - race2 with distinct key sees remaining = 0 -> 400 REFUND_EXCEEDS_PAID (0 extra Stripe calls)
    // - inFlightReplay with same key sees PENDING -> 409 REFUND_IN_PROGRESS
    refundMode = 'gated_ok';
    const enteredPromise = new Promise<void>((resolve) => {
      onRefundEntered = resolve;
    });
    const race1Promise = app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'ref-race-a' },
      payload: { bookingId: bk.bookingId, amountCents: 5250 },
    });
    await enteredPromise;

    const race2 = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'ref-race-b' },
      payload: { bookingId: bk.bookingId, amountCents: 5250 },
    });
    assert.equal(race2.statusCode, 400, race2.body);
    assert.equal(race2.json().error.code, 'REFUND_EXCEEDS_PAID');
    assert.equal(refundCallCount, 2, 'Stripe refund must NOT be invoked for over-refund race loser');

    const inFlightReplay = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'ref-race-a' },
      payload: { bookingId: bk.bookingId, amountCents: 5250 },
    });
    assert.equal(inFlightReplay.statusCode, 409, inFlightReplay.body);
    assert.equal(inFlightReplay.json().error.code, 'REFUND_IN_PROGRESS');
    assert.equal(refundCallCount, 2);

    refundMode = 'ok';
    releaseRefundGate!();
    releaseRefundGate = null;
    const winner = await race1Promise;
    assert.equal(winner.statusCode, 200, winner.body);
    assert.equal(winner.json().data.invoiceStatus, 'REFUNDED');
    assert.equal(winner.json().data.transactionStatus, 'REFUNDED');
    assert.equal(refundCallCount, 2);

    const afterFullRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'ref-after-full' },
      payload: { bookingId: bk.bookingId, amountCents: 100 },
    });
    assert.equal(afterFullRes.statusCode, 409, afterFullRes.body);
    assert.equal(afterFullRes.json().error.code, 'NOT_REFUNDABLE');
    assert.equal(refundCallCount, 2);

    // Replay winning idempotency key -> 200 idempotent, still 2 Stripe refund calls total
    const replayKey = 'ref-race-a';
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': replayKey },
      payload: { bookingId: bk.bookingId, amountCents: 5250 },
    });
    assert.equal(replayRes.statusCode, 200, replayRes.body);
    assert.equal(replayRes.json().data.idempotent, true);
    assert.equal(refundCallCount, 2);

    // Verify tx + invoice status transitioned to REFUNDED & proportional reversal balanced exactly
    const txAfter = (
      await db.pool.query(
        `SELECT pt.id, pt.status AS tx_status, pt.stripe_payment_intent_id, pt.refunded_amount_cents,
                i.status AS inv_status
         FROM payment_transactions pt JOIN invoices i ON i.id = pt.invoice_id
         WHERE i.booking_id = $1`,
        [bk.bookingId]
      )
    ).rows[0];
    assert.equal(txAfter.tx_status, 'REFUNDED');
    assert.equal(txAfter.inv_status, 'REFUNDED');
    assert.equal(Number(txAfter.refunded_amount_cents), 10500);

    const revSums = (
      await db.pool.query(
        `SELECT la_d.account_number AS acc, SUM(le.amount_cents)::bigint AS total
         FROM ledger_entries le
         JOIN ledger_accounts la_d ON la_d.id = le.debit_account_id
         WHERE le.transaction_id = $1 AND le.posting_type LIKE 'REFUND_%'
         GROUP BY la_d.account_number`,
        [txAfter.id]
      )
    ).rows;
    const revMap = Object.fromEntries(revSums.map((r: any) => [r.acc, Number(r.total)]));
    assert.equal(revMap['2030'], 500);
    assert.equal(revMap['4010'], 1500);
    assert.equal(revMap['2020'], 8500);

    const ledgerCountBeforeWebhook = (
      await db.pool.query(`SELECT COUNT(*)::int AS cnt FROM ledger_entries WHERE transaction_id = $1`, [txAfter.id])
    ).rows[0].cnt;

    // Subsequent Stripe charge.refunded webhook must NOT create duplicate refund ledger rows
    const { raw: refRaw, sig: refSig } = signWebhook({
      id: `evt_ch_ref_${bk.bookingId}`,
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: txAfter.stripe_payment_intent_id,
          amount_refunded: 10500,
          refunds: { data: [{ id: winner.json().data.refundId }] },
          metadata: { tenantId: worldA.tenantId, transactionId: txAfter.id },
        },
      },
    });
    const whRefRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': refSig },
      payload: refRaw,
    });
    assert.equal(whRefRes.statusCode, 200, whRefRes.body);

    const ledgerCountAfterWebhook = (
      await db.pool.query(`SELECT COUNT(*)::int AS cnt FROM ledger_entries WHERE transaction_id = $1`, [txAfter.id])
    ).rows[0].cnt;
    assert.equal(ledgerCountAfterWebhook, ledgerCountBeforeWebhook, 'charge.refunded webhook must deduplicate already-posted POST /refunds entries');

    // Full reconciliation report remains clean after full refund
    const reconFull = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/reconciliation-report',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(reconFull.statusCode, 200);
    assert.equal(reconFull.json().data.healthy, true);

    // Production fail-closed when STRIPE_SECRET_KEY is missing
    const savedNodeEnv = env.NODE_ENV;
    const savedStripe = env.STRIPE_SECRET_KEY;
    try {
      (env as any).NODE_ENV = 'production';
      (env as any).STRIPE_SECRET_KEY = undefined;
      setStripeForTest(null);
      const failProd = await app.inject({
        method: 'POST',
        url: '/api/v1/finances/refunds',
        headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'prod-fail-1' },
        payload: { bookingId: bk.bookingId, amountCents: 100 },
      });
      assert.equal(failProd.statusCode, 503);
      assert.equal(failProd.json().error.code, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
    } finally {
      setStripeForTest(fakeStripe);
      (env as any).NODE_ENV = savedNodeEnv;
      (env as any).STRIPE_SECRET_KEY = savedStripe;
    }
  });

  test('4. Dual-DB isolation, validateEnv guards, blockInDemoMode 403, PayTabs/Telr failure handling, and 014 round-trip', async () => {
    const savedDemoUrl = process.env.DEMO_DATABASE_URL;
    const savedDbUrl = process.env.DATABASE_URL;
    const savedDemoMode = process.env.APP_DEMO_MODE;

    try {
      delete process.env.DEMO_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/prod_db';
      await assert.rejects(() => runDemoSeed(), /DEMO_DATABASE_URL must be configured/);

      process.env.DEMO_DATABASE_URL = process.env.DATABASE_URL;
      await assert.rejects(() => runDemoSeed(), /MUST NOT equal DATABASE_URL/);

      assert.throws(
        () =>
          validateEnv({
            NODE_ENV: 'development',
            DATABASE_URL: 'postgresql://u:p@localhost:5432/same',
            DEMO_DATABASE_URL: 'postgresql://u:p@localhost:5432/same',
          }),
        /MUST NOT equal DATABASE_URL/
      );

      assert.throws(
        () =>
          validateEnv({
            NODE_ENV: 'development',
            APP_DEMO_MODE: 'true',
            STRIPE_SECRET_KEY: 'sk_live_51FakeKeyForGuardTest',
          }),
        /live Stripe key/
      );

      assert.throws(
        () =>
          validateEnv({
            NODE_ENV: 'production',
            APP_DEMO_MODE: 'true',
            JWT_SECRET: 'custom_prod_jwt_access_secret_key_over_32_chars_ok',
            JWT_REFRESH_SECRET: 'custom_prod_jwt_refresh_secret_key_over_32_chars_ok',
            BOOTSTRAP_TOKEN: 'custom_prod_bootstrap_token_ok_2026',
            APP_ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          }),
        /isolated DEMO_DATABASE_URL/
      );

      // blockInDemoMode checks
      process.env.APP_DEMO_MODE = 'true';
      const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@uae-co.test');

      const cmsDemo = await app.inject({
        method: 'PUT',
        url: '/api/v1/support/settings/cms',
        headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
        payload: { heroHeading: 'Demo', heroSubheading: 'Subheading', searchPlaceholder: 'Search' },
      });
      assert.equal(cmsDemo.statusCode, 403);
      assert.equal(cmsDemo.json().error.code, 'DEMO_MODE_RESTRICTED');

      const payoutDemo = await app.inject({
        method: 'POST',
        url: '/api/v1/finances/payouts',
        headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'demo-blk-1' },
        payload: { providerId: worldA.techId, amountCents: 100 },
      });
      assert.equal(payoutDemo.statusCode, 403);
      assert.equal(payoutDemo.json().error.code, 'DEMO_MODE_RESTRICTED');

      const refundDemo = await app.inject({
        method: 'POST',
        url: '/api/v1/finances/refunds',
        headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId, 'idempotency-key': 'demo-blk-2' },
        payload: { bookingId: '00000000-0000-0000-0000-000000000001', amountCents: 100 },
      });
      assert.equal(refundDemo.statusCode, 403);
      assert.equal(refundDemo.json().error.code, 'DEMO_MODE_RESTRICTED');

      const instDemo = await app.inject({
        method: 'POST',
        url: '/api/v1/installer/provision',
        headers: { 'x-tenant-id': worldA.tenantId },
        payload: {},
      });
      assert.equal(instDemo.statusCode, 403);
      assert.equal(instDemo.json().error.code, 'DEMO_MODE_RESTRICTED');
    } finally {
      if (savedDemoUrl === undefined) delete process.env.DEMO_DATABASE_URL;
      else process.env.DEMO_DATABASE_URL = savedDemoUrl;
      if (savedDbUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDbUrl;
      if (savedDemoMode === undefined) delete process.env.APP_DEMO_MODE;
      else process.env.APP_DEMO_MODE = savedDemoMode;
    }

    // Telr fail-closed 501 checks
    const telr = getPaymentGateway('telr');
    await assert.rejects(
      () => telr.capture('ord_1', 1000),
      (e: any) => e instanceof GatewayOperationNotSupportedError && e.statusCode === 501
    );
    await assert.rejects(
      () => telr.refund({ providerReferenceId: 'ord_1', amountCents: 1000, currency: 'AED', idempotencyKey: 'k1' }),
      (e: any) => e instanceof GatewayOperationNotSupportedError && e.statusCode === 501
    );

    // PayTabs HTTP 200 decline body checks
    const savedFetch = globalThis.fetch;
    const savedPtProfile = env.PAYTABS_PROFILE_ID;
    const savedPtKey = env.PAYTABS_SERVER_KEY;
    try {
      (env as any).PAYTABS_PROFILE_ID = '99999';
      (env as any).PAYTABS_SERVER_KEY = 'pt_server_key_test';
      (globalThis as any).fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          tran_ref: 'TST_DECLINED_1',
          payment_result: { response_status: 'D', response_message: 'Insufficient funds' },
        }),
      });
      const paytabs = getPaymentGateway('paytabs');
      await assert.rejects(() => paytabs.capture('TST_DECLINED_1', 1000), /Insufficient funds/);
      await assert.rejects(
        () => paytabs.refund({ providerReferenceId: 'TST_DECLINED_1', amountCents: 1000, currency: 'AED', idempotencyKey: 'pt1' }),
        /Insufficient funds/
      );
    } finally {
      globalThis.fetch = savedFetch;
      (env as any).PAYTABS_PROFILE_ID = savedPtProfile;
      (env as any).PAYTABS_SERVER_KEY = savedPtKey;
    }

    // Migration 014 down -> verify data-loss guard rejects while refund/non-EN-AR rows exist -> clean -> down/up round-trip
    const downSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '014_universal_tax_refunds_and_rls_helpers.down.sql'), 'utf8');
    const upSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '014_universal_tax_refunds_and_rls_helpers.sql'), 'utf8');
    await assert.rejects(() => db.pool.query(downSql), /MIGRATION 014 ROLLBACK ABORTED/);
    await db.pool.query(`DELETE FROM payment_refunds`);
    await db.pool.query(`UPDATE tenants SET default_locale = 'en' WHERE default_locale NOT IN ('en', 'ar')`);
    await db.pool.query(downSql);
    const tblAfterDown = await db.pool.query(`SELECT to_regclass('public.payment_refunds') AS t`);
    assert.equal(tblAfterDown.rows[0].t, null);
    await db.pool.query(upSql);
    const tblAfterUp = await db.pool.query(`SELECT to_regclass('public.payment_refunds') AS t`);
    assert.equal(tblAfterUp.rows[0].t, 'payment_refunds');
  });
});
