import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';
import { authenticator } from 'otplib';
import type { FastifyInstance } from 'fastify';
import { startTestDb, seedWorld, seedBooking, type TestDb } from '../helpers/db.js';
import { pool } from '../../src/database/pool.js';
import { buildApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { AuthService, setPasswordResetNotifierForTest } from '../../src/modules/auth/auth.service.js';
import { setStripeForTest } from '../../src/services/stripeClient.js';
import { OutboxWorker } from '../../src/workers/outbox.worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/database/migrations');

// Minimal valid 1x1 PNG binary (89 50 4E 47 0D 0A 1A 0A ...)
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

function buildMultipartPayload(fieldName: string, filename: string, mimeType: string, content: Buffer) {
  const boundary = '----ServiceOSPhase2Boundary7890';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([header, content, footer]),
  };
}

describe('Phase 2 Gate: API Completeness, Geofence, URL Validation, Arabic Slugs, Integrations & Signed Uploads', () => {
  let db: TestDb;
  let appPool: pg.Pool;
  let app: FastifyInstance;
  let originalQuery: any;
  let originalConnect: any;
  let originalOutboxEnabled: string | undefined;
  let originalUploadDir: string | undefined;
  let originalStripeKey: string | undefined;
  let tempUploadDir: string;

  let worldA: Awaited<ReturnType<typeof seedWorld>>;
  let worldB: Awaited<ReturnType<typeof seedWorld>>;
  let techA2Id: string;

  let capturedResetInfo: { tenantId: string; userId: string; email: string; token: string } | null = null;

  const bearer = (id: string, role: string, tenantId: string, email: string) =>
    `Bearer ${AuthService.generateAccessToken({ id, role, tenantId, email })}`;

  before(async () => {
    originalOutboxEnabled = process.env.OUTBOX_WORKER_ENABLED;
    process.env.OUTBOX_WORKER_ENABLED = 'false';

    tempUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serviceos-p2-uploads-'));
    originalUploadDir = env.UPLOAD_STORAGE_DIR;
    (env as any).UPLOAD_STORAGE_DIR = tempUploadDir;
    process.env.UPLOAD_STORAGE_DIR = tempUploadDir;

    db = await startTestDb();

    worldA = await seedWorld(db.pool, 'p2-uae');
    await db.pool.query(
      `UPDATE tenants
       SET currency_code = 'AED', currency_symbol = 'AED ', country_code = 'AE',
           tax_name = 'VAT', default_tax_rate_bps = 500, default_platform_commission_bps = 1500
       WHERE id = $1`,
      [worldA.tenantId]
    );
    await db.pool.query(`UPDATE provider_profiles SET is_verified = TRUE, is_active = TRUE WHERE user_id = $1`, [
      worldA.techId,
    ]);

    // Second tech in worldA (verified, active)
    const techPassHash = await AuthService.hashPassword('TechPass123!');
    techA2Id = (
      await db.pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active, is_verified)
         VALUES ($1, 'tech2@p2-uae.test', $2, 'TECHNICIAN', TRUE, TRUE) RETURNING id`,
        [worldA.tenantId, techPassHash]
      )
    ).rows[0].id;
    await db.pool.query(
      `INSERT INTO provider_profiles (user_id, tenant_id, full_name, trade_category, is_verified, is_active)
       VALUES ($1, $2, 'Tech Two', 'HVAC', TRUE, TRUE)`,
      [techA2Id, worldA.tenantId]
    );
    await db.pool.query(
      `INSERT INTO provider_locations (provider_id, tenant_id, location, duty_status)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint(55.2708, 25.2048), 4326)::geography, 'ONLINE')`,
      [techA2Id, worldA.tenantId]
    );

    worldB = await seedWorld(db.pool, 'p2-de');

    // Create NOBYPASSRLS runtime DB role
    await db.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'serviceos_app_test') THEN
          CREATE ROLE serviceos_app_test LOGIN PASSWORD 'app_pw_phase2' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO serviceos_app_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serviceos_app_test;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO serviceos_app_test;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO serviceos_app_test;
    `);

    const appUrl = new URL(db.url);
    appUrl.username = 'serviceos_app_test';
    appUrl.password = 'app_pw_phase2';
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });

    originalQuery = pool.query;
    originalConnect = pool.connect;
    (pool as any).query = appPool.query.bind(appPool);
    (pool as any).connect = appPool.connect.bind(appPool);

    originalStripeKey = env.STRIPE_SECRET_KEY;
    (env as any).STRIPE_SECRET_KEY = 'sk_test_phase2_mock_key';

    let piSeq = 0;
    const fakeStripe: any = {
      webhooks: new Stripe('sk_test_dummy').webhooks,
      paymentIntents: {
        create: async (params: any) => {
          piSeq += 1;
          return {
            id: `pi_p2_${piSeq}`,
            client_secret: `pi_p2_${piSeq}_secret`,
            status: 'requires_capture',
            amount: params.amount,
            currency: params.currency,
          };
        },
        retrieve: async (id: string) => ({ id, status: 'requires_capture', client_secret: `${id}_secret` }),
        capture: async (id: string) => ({ id, status: 'succeeded' }),
        cancel: async (id: string) => ({ id, status: 'canceled' }),
      },
      transfers: {
        create: async (params: any) => ({ id: `tr_p2_${Date.now()}_${params.amount}` }),
      },
      refunds: {
        create: async (params: any) => ({ id: `re_p2_${Date.now()}_${params.amount}`, status: 'succeeded', amount: params.amount }),
        retrieve: async (id: string) => ({ id, status: 'succeeded' }),
      },
    };
    setStripeForTest(fakeStripe);
    setPasswordResetNotifierForTest((info) => {
      capturedResetInfo = { tenantId: info.tenantId, userId: info.userId, email: info.email, token: info.token };
    });

    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    setPasswordResetNotifierForTest(null);
    setStripeForTest(null);
    (env as any).STRIPE_SECRET_KEY = originalStripeKey;
    (env as any).UPLOAD_STORAGE_DIR = originalUploadDir;
    if (originalUploadDir === undefined) delete process.env.UPLOAD_STORAGE_DIR;
    else process.env.UPLOAD_STORAGE_DIR = originalUploadDir;

    if (originalOutboxEnabled === undefined) delete process.env.OUTBOX_WORKER_ENABLED;
    else process.env.OUTBOX_WORKER_ENABLED = originalOutboxEnabled;

    if (originalQuery) (pool as any).query = originalQuery;
    if (originalConnect) (pool as any).connect = originalConnect;
    if (app) await app.close();
    if (appPool) await appPool.end().catch(() => {});
    if (db) await db.stop();
    fs.rmSync(tempUploadDir, { recursive: true, force: true });
  });

  test('1. Auth completeness: register, anti-enum forgot/reset password under NOBYPASSRLS, MFA disable, reauthenticate & demo guards', async () => {
    // Register customer
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-tenant-id': worldA.tenantId, 'x-client-platform': 'flutter' },
      payload: {
        email: 'NewCust@p2-uae.test',
        password: 'RegPass123!',
        fullName: 'Layla Al-Mansoori',
        phone: '+971501234567',
      },
    });
    assert.equal(regRes.statusCode, 201, regRes.body);
    const regData = regRes.json().data;
    assert.ok(regData.accessToken);
    assert.ok(regData.refreshToken);
    assert.equal(regData.user.role, 'CUSTOMER');
    const regUserId = regData.user.id;
    const oldRefreshToken = regData.refreshToken;

    // Duplicate register -> 409
    const dupRegRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { email: 'newcust@p2-uae.test', password: 'RegPass123!', fullName: 'Dup' },
    });
    assert.equal(dupRegRes.statusCode, 409);

    // Forgot password anti-enumeration on unknown email -> still 200 and no token captured
    capturedResetInfo = null;
    const unknownForgot = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { email: 'nobody@p2-uae.test' },
    });
    assert.equal(unknownForgot.statusCode, 200);
    assert.equal(capturedResetInfo, null);

    // Forgot password on registered customer -> 200, hook captures raw token, never exposed in HTTP or DB log
    const knownForgot = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { email: 'newcust@p2-uae.test' },
    });
    assert.equal(knownForgot.statusCode, 200);
    assert.equal((knownForgot.json().data as any).token, undefined);
    assert.ok(capturedResetInfo?.token);
    const resetToken = capturedResetInfo!.token;

    // Reset password WITHOUT x-tenant-id header in multi-tenant DB -> resolves via SECURITY DEFINER under NOBYPASSRLS
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, newPassword: 'NewStrongPass456!' },
    });
    assert.equal(resetRes.statusCode, 200, resetRes.body);

    // Replay reset token -> rejected 400
    const replayReset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, newPassword: 'AnotherPass789!' },
    });
    assert.equal(replayReset.statusCode, 400);

    // Old refresh token revoked during password reset
    const oldRefreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { refreshToken: oldRefreshToken },
    });
    assert.equal(oldRefreshRes.statusCode, 401);

    // Old password fails, new password succeeds
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { email: 'newcust@p2-uae.test', password: 'RegPass123!' },
    });
    assert.equal(oldLogin.statusCode, 401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-id': worldA.tenantId },
      payload: { email: 'newcust@p2-uae.test', password: 'NewStrongPass456!' },
    });
    assert.equal(newLogin.statusCode, 200, newLogin.body);
    const userToken = newLogin.json().data.accessToken;

    // Reauthenticate check
    const badReauth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauthenticate',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: { password: 'WrongPassword!' },
    });
    assert.equal(badReauth.statusCode, 401);

    const okReauth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauthenticate',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: { password: 'NewStrongPass456!' },
    });
    assert.equal(okReauth.statusCode, 200);
    assert.equal(okReauth.json().data.verified, true);

    // MFA setup -> confirm -> disable
    const mfaSetupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/setup',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: {},
    });
    assert.equal(mfaSetupRes.statusCode, 200, mfaSetupRes.body);
    const mfaSecret = mfaSetupRes.json().data.secret;
    const validTotp1 = authenticator.generate(mfaSecret);

    const mfaConfirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: { totpCode: validTotp1 },
    });
    assert.equal(mfaConfirmRes.statusCode, 200, mfaConfirmRes.body);

    const badDisable = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/disable',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: { currentPassword: 'WrongPassword!', totpCode: authenticator.generate(mfaSecret) },
    });
    assert.equal(badDisable.statusCode, 401);

    const okDisable = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/disable',
      headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
      payload: { currentPassword: 'NewStrongPass456!', totpCode: authenticator.generate(mfaSecret) },
    });
    assert.equal(okDisable.statusCode, 200, okDisable.body);
    assert.equal(okDisable.json().data.disabled, true);

    // Demo mode blocks MFA mutation routes
    const savedDemo = process.env.APP_DEMO_MODE;
    try {
      process.env.APP_DEMO_MODE = 'true';
      const setupDemo = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/setup',
        headers: { authorization: `Bearer ${userToken}`, 'x-tenant-id': worldA.tenantId },
        payload: {},
      });
      assert.equal(setupDemo.statusCode, 403);
      assert.equal(setupDemo.json().error.code, 'DEMO_MODE_RESTRICTED');
    } finally {
      if (savedDemo === undefined) delete process.env.APP_DEMO_MODE;
      else process.env.APP_DEMO_MODE = savedDemo;
    }
    assert.ok(regUserId);
  });

  test('2. Bookings & Dispatch: URL allowlist, PostGIS geofence, reschedule, assign, and hardened handover', async () => {
    const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@p2-uae.test');
    const custAuth = bearer(worldA.customerId, 'CUSTOMER', worldA.tenantId, 'cust@p2-uae.test');
    const tech1Auth = bearer(worldA.techId, 'TECHNICIAN', worldA.tenantId, 'tech@p2-uae.test');
    const tech2Auth = bearer(techA2Id, 'TECHNICIAN', worldA.tenantId, 'tech2@p2-uae.test');

    // Ping tech1 online at Dubai address
    assert.equal(
      (await app.inject({
        method: 'POST',
        url: '/api/v1/crm/technicians/location-ping',
        headers: { authorization: tech1Auth, 'x-tenant-id': worldA.tenantId },
        payload: { latitude: 25.205, longitude: 55.271, dutyStatus: 'ONLINE' },
      })).statusCode,
      200
    );

    // Create booking at (25.205, 55.271)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        serviceId: worldA.serviceId,
        addressText: 'Sheikh Zayed Rd Tower 5',
        city: 'Dubai',
        state: 'DU',
        postalCode: '00000',
        latitude: 25.205,
        longitude: 55.271,
      },
    });
    assert.equal(createRes.statusCode, 202, createRes.body);
    const bk = createRes.json().data;
    const worker = new OutboxWorker(appPool, { leaseMs: 15000 });
    assert.equal((await worker.processNextJob()).status, 'COMPLETED');

    // Reschedule booking
    const futureSlot = new Date(Date.now() + 3600_000).toISOString();
    const reschedOk = await app.inject({
      method: 'PATCH',
      url: `/api/v1/bookings/${bk.bookingId}/reschedule`,
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
      payload: { scheduledStart: futureSlot, reason: 'Customer prefers afternoon' },
    });
    assert.equal(reschedOk.statusCode, 200, reschedOk.body);

    const reschedPast = await app.inject({
      method: 'PATCH',
      url: `/api/v1/bookings/${bk.bookingId}/reschedule`,
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
      payload: { scheduledStart: new Date(Date.now() - 3600_000).toISOString() },
    });
    assert.equal(reschedPast.statusCode, 400);

    // Assign booking to tech1 via POST /bookings/:id/assign
    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/assign`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { providerId: worldA.techId, reason: 'Closest HVAC/plumbing lead' },
    });
    assert.equal(assignRes.statusCode, 200, assignRes.body);
    assert.equal(assignRes.json().data.status, 'ASSIGNED');

    // Busy tech1 cannot be assigned to a second booking simultaneously -> 409 PROVIDER_BUSY
    const bk2Seed = await seedBooking(db.pool, worldA, { status: 'REQUESTED', totalCents: 10000 });
    const busyAssign = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk2Seed.bookingId}/assign`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { providerId: worldA.techId },
    });
    assert.equal(busyAssign.statusCode, 409);
    assert.equal(busyAssign.json().error.code, 'PROVIDER_BUSY');

    // Geofence rejection when tech1 submits coords ~2km away from (25.205, 55.271)
    const farArrival = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/verify-arrival`,
      headers: { authorization: tech1Auth, 'x-tenant-id': worldA.tenantId },
      payload: { safetyPin: bk.safetyPin, latitude: 25.225, longitude: 55.271 },
    });
    assert.equal(farArrival.statusCode, 422, farArrival.body);
    assert.equal(farArrival.json().error.code, 'GEOFENCE_VIOLATION');

    // Valid arrival within geofence -> 200
    const okArrival = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/verify-arrival`,
      headers: { authorization: tech1Auth, 'x-tenant-id': worldA.tenantId },
      payload: { safetyPin: bk.safetyPin, latitude: 25.2051, longitude: 55.2711 },
    });
    assert.equal(okArrival.statusCode, 200, okArrival.body);
    assert.equal(okArrival.json().data.status, 'ON_SITE');

    // Emergency handover while ON_SITE -> rotates PIN, resets pin_verified_at, rejects busy/offline/inactive techs
    const handoverOk = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/handover',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: bk.bookingId, newProviderId: techA2Id, reason: 'Tech 1 vehicle issue' },
    });
    assert.equal(handoverOk.statusCode, 200, handoverOk.body);
    const rotatedPin = handoverOk.json().data.safetyPin;
    assert.match(rotatedPin, /^\d{4}$/);

    const afterHandoverRow = (
      await db.pool.query(`SELECT pin_verified_at, status FROM bookings WHERE id = $1`, [bk.bookingId])
    ).rows[0];
    assert.equal(afterHandoverRow.pin_verified_at, null);
    assert.equal(afterHandoverRow.status, 'ASSIGNED');

    // Handover to OFFLINE tech must fail 409 PROVIDER_OFFLINE
    await db.pool.query(`UPDATE provider_locations SET duty_status = 'OFFLINE' WHERE provider_id = $1`, [worldA.techId]);
    const offlineHandover = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/handover',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: bk.bookingId, newProviderId: worldA.techId, reason: 'Retry offline tech' },
    });
    assert.equal(offlineHandover.statusCode, 409);
    assert.equal(offlineHandover.json().error.code, 'PROVIDER_OFFLINE');

    // Tech2 verifies arrival with rotated PIN at exact address
    const tech2Arr = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/verify-arrival`,
      headers: { authorization: tech2Auth, 'x-tenant-id': worldA.tenantId },
      payload: { safetyPin: rotatedPin, latitude: 25.205, longitude: 55.271 },
    });
    assert.equal(tech2Arr.statusCode, 200, tech2Arr.body);

    // Reject unsafe media URLs (javascript:, http://, data:, bare filename)
    for (const badUrl of [
      'javascript:alert(1)',
      'http://insecure.test/photo.jpg',
      'data:image/png;base64,AAAA',
      'b1.jpg',
    ]) {
      const badComp = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bk.bookingId}/complete`,
        headers: { authorization: tech2Auth, 'x-tenant-id': worldA.tenantId },
        payload: { beforePhotos: [badUrl], workSummaryNotes: 'Test' },
      });
      assert.equal(badComp.statusCode, 400, `Expected 400 for unsafe URL: ${badUrl}`);
    }

    // Accept safe https:// media URLs
    const goodComp = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bk.bookingId}/complete`,
      headers: { authorization: tech2Auth, 'x-tenant-id': worldA.tenantId },
      payload: {
        beforePhotos: ['https://cdn.serviceos.test/before-1.jpg'],
        afterPhotos: ['https://cdn.serviceos.test/after-1.jpg'],
        customerSignatureUrl: 'https://cdn.serviceos.test/sig-1.png',
        workSummaryNotes: 'Completed cleanly',
      },
    });
    assert.equal(goodComp.statusCode, 200, goodComp.body);
  });

  test('3. Arabic slugs, Services/Categories CRUD, CRM CRUD, Duty-Status UPSERT & Tech Self-Earnings', async () => {
    const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@p2-uae.test');
    const custAuth = bearer(worldA.customerId, 'CUSTOMER', worldA.tenantId, 'cust@p2-uae.test');

    // Arabic categories + services generate distinct valid Unicode slugs (never empty '-')
    const catAr = await app.inject({
      method: 'POST',
      url: '/api/v1/services/categories',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { name: 'خدمات التكييف والتبريد', iconName: 'snowflake' },
    });
    assert.equal(catAr.statusCode, 201, catAr.body);
    const catId = catAr.json().data.id;
    assert.equal(catAr.json().data.slug, 'خدمات-التكييف-والتبريد');

    const svcAr1 = await app.inject({
      method: 'POST',
      url: '/api/v1/services',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { categoryId: catId, name: 'صيانة مكيف سبليت', basePriceCents: 15000 },
    });
    assert.equal(svcAr1.statusCode, 201, svcAr1.body);
    assert.equal(svcAr1.json().data.slug, 'صيانة-مكيف-سبليت');

    const svcAr2 = await app.inject({
      method: 'POST',
      url: '/api/v1/services',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { categoryId: catId, name: 'تنظيف مجاري الهواء', basePriceCents: 22000 },
    });
    assert.equal(svcAr2.statusCode, 201, svcAr2.body);
    assert.equal(svcAr2.json().data.slug, 'تنظيف-مجاري-الهواء');

    // Update & soft-delete service and category
    const svcId1 = svcAr1.json().data.id;
    const updSvc = await app.inject({
      method: 'PUT',
      url: `/api/v1/services/${svcId1}`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        basePriceCents: 18000,
        tiers: [{ tierName: 'VIP', multiplier: 1.5, description: 'Same day' }],
      },
    });
    assert.equal(updSvc.statusCode, 200, updSvc.body);
    assert.equal(Number(updSvc.json().data.base_price_cents), 18000);
    assert.equal(updSvc.json().data.pricing_tiers.length, 1);

    const delSvc = await app.inject({
      method: 'DELETE',
      url: `/api/v1/services/${svcId1}`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(delSvc.statusCode, 200);
    const delCat = await app.inject({
      method: 'DELETE',
      url: `/api/v1/services/categories/${catId}`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(delCat.statusCode, 200);

    // CRM Customer Create & Update
    const crmCust = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/customers',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        email: 'vip-crm@p2-uae.test',
        fullName: 'Omar Khalid',
        phone: '+971509998877',
        defaultAddress: 'Palm Jumeirah Villa 12',
        courtesyCreditCents: 5000,
      },
    });
    assert.equal(crmCust.statusCode, 201, crmCust.body);
    const crmCustId = crmCust.json().data.id;

    const updCrmCust = await app.inject({
      method: 'PUT',
      url: `/api/v1/crm/customers/${crmCustId}`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { courtesyCreditCents: 7500, fullName: 'Omar K.' },
    });
    assert.equal(updCrmCust.statusCode, 200, updCrmCust.body);
    assert.equal(updCrmCust.json().data.courtesyCreditCents, 7500);

    // CRM Technician Create (no provider_locations row yet) + Duty-Status UPSERT without fake (0,0)
    const crmTech = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/technicians',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        email: 'new-tech@p2-uae.test',
        fullName: 'Tariq Hassan',
        tradeCategory: 'ELECTRICAL',
        hourlyRateCents: 12000,
        isVerified: true,
      },
    });
    assert.equal(crmTech.statusCode, 201, crmTech.body);
    const newTechId = crmTech.json().data.id;
    const newTechAuth = bearer(newTechId, 'TECHNICIAN', worldA.tenantId, 'new-tech@p2-uae.test');

    const dutyUpsert = await app.inject({
      method: 'PUT',
      url: '/api/v1/crm/technicians/duty-status',
      headers: { authorization: newTechAuth, 'x-tenant-id': worldA.tenantId },
      payload: { dutyStatus: 'ONLINE' },
    });
    assert.equal(dutyUpsert.statusCode, 200, dutyUpsert.body);
    assert.equal(dutyUpsert.json().data.dutyStatus, 'ONLINE');
    assert.equal(dutyUpsert.json().data.hasLocation, false);

    // Verify DB location column remained NULL (no fake 0,0)
    const locRow = (
      await db.pool.query(`SELECT duty_status, location FROM provider_locations WHERE provider_id = $1`, [newTechId])
    ).rows[0];
    assert.equal(locRow.duty_status, 'ONLINE');
    assert.equal(locRow.location, null);

    // Technician Self-Earnings endpoints
    const bEarn = await seedBooking(db.pool, worldA, { status: 'COMPLETED', txStatus: 'SUCCEEDED', totalCents: 10500 });
    await db.pool.query(
      `UPDATE bookings SET assigned_provider_id = $1 WHERE id = $2`,
      [newTechId, bEarn.bookingId]
    );
    await db.pool.query(
      `UPDATE invoices SET status = 'PAID', tax_total_cents = 500, paid_at = NOW() WHERE id = $1`,
      [bEarn.invoiceId]
    );

    const earnCustDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/technician/earnings',
      headers: { authorization: custAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(earnCustDenied.statusCode, 403);

    const earnCrossDenied = await app.inject({
      method: 'GET',
      url: `/api/v1/finances/technician/earnings?providerId=${worldA.techId}`,
      headers: { authorization: newTechAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(earnCrossDenied.statusCode, 403);

    const earnOwn = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/technician/earnings',
      headers: { authorization: newTechAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(earnOwn.statusCode, 200, earnOwn.body);
    assert.equal(earnOwn.json().data.totalEarnedCents, 8500);
    assert.equal(earnOwn.json().data.unpaidBalanceCents, 8500);

    const earnAlias = await app.inject({
      method: 'GET',
      url: '/api/v1/crm/technicians/me/earnings',
      headers: { authorization: newTechAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(earnAlias.statusCode, 200, earnAlias.body);
    assert.equal(earnAlias.json().data.unpaidBalanceCents, 8500);
  });

  test('4. Finances overview, System config/encrypted integrations, Signed uploads & Migration 015 round-trip', async () => {
    const adminBAuth = bearer(worldB.adminId, 'ADMIN', worldB.tenantId, 'admin@p2-de.test');
    const techBAuth = bearer(worldB.techId, 'TECHNICIAN', worldB.tenantId, 'tech@p2-de.test');

    // Cleanly test /finances/overview & /finances/metrics excluding DRAFT, VOID, REFUNDED & netting PARTIALLY_REFUNDED
    const invPaid = await seedBooking(db.pool, worldB, { status: 'COMPLETED', txStatus: 'SUCCEEDED', totalCents: 10500 });
    await db.pool.query(`UPDATE invoices SET status = 'PAID', tax_total_cents = 500, paid_at = NOW() WHERE id = $1`, [invPaid.invoiceId]);

    const invPartial = await seedBooking(db.pool, worldB, { status: 'COMPLETED', txStatus: 'SUCCEEDED', totalCents: 10500 });
    await db.pool.query(`UPDATE invoices SET status = 'PARTIALLY_REFUNDED', tax_total_cents = 500, refunded_amount_cents = 5250, paid_at = NOW() WHERE id = $1`, [invPartial.invoiceId]);

    const invRefunded = await seedBooking(db.pool, worldB, { status: 'COMPLETED', txStatus: 'REFUNDED', totalCents: 10500 });
    await db.pool.query(`UPDATE invoices SET status = 'REFUNDED', tax_total_cents = 500, refunded_amount_cents = 10500, paid_at = NOW() WHERE id = $1`, [invRefunded.invoiceId]);

    await seedBooking(db.pool, worldB, { status: 'REQUESTED', txStatus: 'PENDING', totalCents: 20000 }); // DRAFT
    const invVoid = await seedBooking(db.pool, worldB, { status: 'CANCELLED', txStatus: 'VOIDED', totalCents: 30000 });
    await db.pool.query(`UPDATE invoices SET status = 'VOID' WHERE id = $1`, [invVoid.invoiceId]);

    const ovRes = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/overview',
      headers: { authorization: adminBAuth, 'x-tenant-id': worldB.tenantId },
    });
    const metRes = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/metrics',
      headers: { authorization: adminBAuth, 'x-tenant-id': worldB.tenantId },
    });
    assert.equal(ovRes.statusCode, 200, ovRes.body);
    assert.equal(metRes.statusCode, 200, metRes.body);
    const ov = ovRes.json().data;
    const met = metRes.json().data;
    assert.equal(ov.grossVolumeCents, met.grossVolumeCents);
    assert.equal(Number(ov.grossVolumeCents), 15750);
    assert.equal(Number(ov.settledVolumeCents), 15750);
    assert.equal(Number(ov.refundedVolumeCents), 15750);
    assert.equal(ov.totalInvoicesCount, 3);
    assert.equal(ov.paidInvoicesCount, 2);

    // PUT /system/config & public GET /system/config reflection
    const updCfg = await app.inject({
      method: 'PUT',
      url: '/api/v1/system/config',
      headers: { authorization: adminBAuth, 'x-tenant-id': worldB.tenantId },
      payload: {
        currencyCode: 'EUR',
        currencySymbol: '€',
        countryCode: 'DE',
        taxRateBps: 1900,
        taxName: 'MwSt',
        distanceUnit: 'km',
        defaultLocale: 'de-DE',
        logoUrl: 'https://cdn.serviceos.test/logo-de.png',
      },
    });
    assert.equal(updCfg.statusCode, 200, updCfg.body);

    const getCfg = await app.inject({
      method: 'GET',
      url: '/api/v1/system/config',
      headers: { 'x-tenant-id': worldB.tenantId },
    });
    assert.equal(getCfg.statusCode, 200);
    assert.equal(getCfg.json().data.defaultCurrency, 'EUR');
    assert.equal(getCfg.json().data.defaultVatPercent, 19);
    assert.equal(getCfg.json().data.defaultTaxName, 'MwSt');

    // Encrypted Integrations CRUD
    const putInt1 = await app.inject({
      method: 'PUT',
      url: '/api/v1/system/integrations',
      headers: { authorization: adminBAuth, 'x-tenant-id': worldB.tenantId },
      payload: {
        stripeLiveMode: true,
        twilioEnabled: true,
        publicSettings: { supportEmail: 'ops@berlin.de' },
        secrets: {
          stripe: { secretKey: 'sk_live_secret_token_9876' },
          twilio: { authToken: 'tw_secret_auth_4321' },
        },
      },
    });
    assert.equal(putInt1.statusCode, 200, putInt1.body);
    assert.equal(putInt1.json().data.secretsMasked.stripe.secretKey, '••••9876');
    assert.equal(putInt1.json().data.secretsMasked.twilio.authToken, '••••4321');
    assert.ok(!putInt1.body.includes('sk_live_secret_token_9876'));

    // Raw DB inspection confirms AES-256-GCM ciphertext & clean audit log
    const rawCfg = (
      await db.pool.query(`SELECT encrypted_secrets FROM integration_configs WHERE tenant_id = $1`, [worldB.tenantId])
    ).rows[0];
    const cipherStripe = rawCfg.encrypted_secrets.stripe.secretKey;
    assert.notEqual(cipherStripe, 'sk_live_secret_token_9876');
    assert.equal(cipherStripe.split(':').length, 3);
    assert.equal(AuthService.decryptSecret(cipherStripe), 'sk_live_secret_token_9876');

    const auditRows = await db.pool.query(
      `SELECT diff_payload::text AS txt FROM audit_logs WHERE tenant_id = $1 AND action = 'INTEGRATIONS_UPDATED'`,
      [worldB.tenantId]
    );
    assert.ok(!auditRows.rows[0].txt.includes('sk_live_secret_token_9876'));

    // Partial update preserves twilio and deletes stripe key via null
    const putInt2 = await app.inject({
      method: 'PUT',
      url: '/api/v1/system/integrations',
      headers: { authorization: adminBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { secrets: { stripe: { secretKey: null } } },
    });
    assert.equal(putInt2.statusCode, 200);
    assert.equal(putInt2.json().data.secretsMasked.stripe, undefined);
    assert.equal(putInt2.json().data.secretsMasked.twilio.authToken, '••••4321');

    // Multipart Uploads: reject HTML spoofed as PNG, accept real PNG, verify signed GET & completion usage
    const spoofed = buildMultipartPayload('file', 'evil.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>'));
    const spoofRes = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId, 'content-type': spoofed.contentType },
      payload: spoofed.body,
    });
    assert.equal(spoofRes.statusCode, 400);
    assert.equal(spoofRes.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');

    const goodMp = buildMultipartPayload('file', 'proof.png', 'image/png', VALID_1X1_PNG);
    const upRes = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId, 'content-type': goodMp.contentType },
      payload: goodMp.body,
    });
    assert.equal(upRes.statusCode, 201, upRes.body);
    const signedUrl: string = upRes.json().data.url;
    assert.ok(signedUrl.startsWith(`/api/v1/uploads/${worldB.tenantId}/`));

    const getGood = await app.inject({ method: 'GET', url: signedUrl });
    assert.equal(getGood.statusCode, 200);
    assert.equal(getGood.headers['content-type'], 'image/png');
    assert.equal(getGood.headers['x-content-type-options'], 'nosniff');
    assert.equal(getGood.headers['content-security-policy'], 'sandbox');

    const tamperedUrl = signedUrl.replace(/sig=[^&]+/, 'sig=' + '0'.repeat(64));
    const getBad = await app.inject({ method: 'GET', url: tamperedUrl });
    assert.equal(getBad.statusCode, 403);

    // Confirm signed upload URL is accepted in work-order completion
    const bkUpload = await seedBooking(db.pool, worldB, { status: 'ON_SITE', txStatus: 'REQUIRES_CAPTURE', totalCents: 10000 });
    const compWithSigned = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bkUpload.bookingId}/complete`,
      headers: { authorization: techBAuth, 'x-tenant-id': worldB.tenantId },
      payload: { beforePhotos: [signedUrl], afterPhotos: [signedUrl], workSummaryNotes: 'Verified with uploaded photo' },
    });
    assert.equal(compWithSigned.statusCode, 200, compWithSigned.body);

    // Migration 015 down/up round-trip on real Postgres (verify data-loss guard rejects first)
    const down015 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '015_phase2_auth_resets_and_encrypted_integrations.down.sql'),
      'utf8'
    );
    const up015 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '015_phase2_auth_resets_and_encrypted_integrations.sql'),
      'utf8'
    );
    await assert.rejects(() => db.pool.query(down015), /MIGRATION 015 ROLLBACK ABORTED/);
    await db.pool.query(`UPDATE integration_configs SET encrypted_secrets = '{}'::jsonb`);
    await db.pool.query(`DELETE FROM provider_locations WHERE location IS NULL`);
    await db.pool.query(down015);
    const tblAfterDown = await db.pool.query(`SELECT to_regclass('public.password_reset_tokens') AS t`);
    assert.equal(tblAfterDown.rows[0].t, null);
    await db.pool.query(up015);
    const tblAfterUp = await db.pool.query(`SELECT to_regclass('public.password_reset_tokens') AS t`);
    assert.equal(tblAfterUp.rows[0].t, 'password_reset_tokens');
  });

  test('10. Remediation API Completeness: installer/status, audit-logs, settings, invoices, refunds, sms, incidents, availability & dispatch alias', async () => {
    const adminAuth = bearer(worldA.adminId, 'ADMIN', worldA.tenantId, 'admin@p2-uae.test');

    // 1. GET /installer/status
    const instStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/installer/status',
      headers: { 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(instStatus.statusCode, 200, instStatus.body);
    assert.equal(instStatus.json().data.provisioned, true);
    assert.equal(instStatus.json().data.tenant.id, worldA.tenantId);

    // 2. PUT /system/settings alias & GET /system/audit-logs
    const putSettings = await app.inject({
      method: 'PUT',
      url: '/api/v1/system/settings',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { commissionBps: 1800, publicSettings: { surgeMultiplier: 1.25 } },
    });
    assert.equal(putSettings.statusCode, 200, putSettings.body);

    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/system/audit-logs?limit=20',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(auditRes.statusCode, 200, auditRes.body);
    assert.ok(Array.isArray(auditRes.json().data));

    // 3. POST /finances/invoices + GET /finances/refunds + POST /finances/refunds/:id/reconcile
    const bkInv = await seedBooking(db.pool, worldA, { status: 'COMPLETED', txStatus: 'SUCCEEDED', totalCents: 15000 });
    const postInv = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/invoices',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        bookingId: bkInv.bookingId,
        laborSubtotalCents: 12000,
        partsSubtotalCents: 2000,
        diagnosticFeeCents: 1000,
      },
    });
    assert.equal(postInv.statusCode, 201, postInv.body);
    assert.ok(postInv.json().data.invoiceNumber);

    const settledTotal = Number(postInv.json().data.totalAmountCents);
    await db.pool.query(`UPDATE invoices SET status = 'PAID', paid_at = NOW() WHERE id = $1`, [bkInv.invoiceId]);
    await db.pool.query(
      `UPDATE payment_transactions
       SET status = 'SUCCEEDED',
           authorized_amount_cents = GREATEST(authorized_amount_cents, $2),
           captured_amount_cents = $2
       WHERE id = $1`,
      [bkInv.txId, settledTotal]
    );

    // Create refund via API and verify listing + reconcile endpoint
    const createRefRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/refunds',
      headers: {
        authorization: adminAuth,
        'x-tenant-id': worldA.tenantId,
        'idempotency-key': `test_ref_list_${Date.now()}`,
      },
      payload: { bookingId: bkInv.bookingId, amountCents: 5000, reason: 'Partial warranty refund' },
    });
    assert.equal(createRefRes.statusCode, 200, createRefRes.body);

    // Insert a pending reconciliation refund row and reconcile it
    const pendRef = await db.pool.query<{ id: string }>(
      `INSERT INTO payment_refunds (
        tenant_id, payment_transaction_id, invoice_id, booking_id, idempotency_key,
        amount_cents, currency, reason, status
      )
      SELECT $1, pt.id, i.id, b.id, $2, 2500, 'AED', 'Pending reconciliation', 'REQUIRES_RECONCILIATION'
      FROM bookings b
      JOIN invoices i ON i.booking_id = b.id
      JOIN payment_transactions pt ON pt.invoice_id = i.id
      WHERE b.id = $3
      RETURNING id`,
      [worldA.tenantId, `pending_recon_${Date.now()}`, bkInv.bookingId]
    );
    const pendingRefundId = pendRef.rows[0].id;

    const listRefunds = await app.inject({
      method: 'GET',
      url: '/api/v1/finances/refunds',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(listRefunds.statusCode, 200, listRefunds.body);
    assert.ok(listRefunds.json().data.some((r: any) => r.id === pendingRefundId));

    const reconRes = await app.inject({
      method: 'POST',
      url: `/api/v1/finances/refunds/${pendingRefundId}/reconcile`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {},
    });
    assert.equal(reconRes.statusCode, 200, reconRes.body);
    assert.equal(reconRes.json().data.reconciled, true);

    // 4. POST /support/sms/send
    const smsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/support/sms/send',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        recipientPhone: '+971501234567',
        recipientName: 'Layla Client',
        message: 'Technician is 10 minutes away.',
        bookingId: bkInv.bookingId,
      },
    });
    assert.equal(smsRes.statusCode, 201, smsRes.body);
    assert.ok(['PENDING', 'SENT'].includes(smsRes.json().data.status));

    // 5. GET / POST / PATCH /support/incidents
    const createInc = await app.inject({
      method: 'POST',
      url: '/api/v1/support/incidents',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        subject: 'Breaker panel overheating report',
        description: 'Technician noticed thermal wear on breaker panel.',
        severity: 'HIGH',
        bookingId: bkInv.bookingId,
      },
    });
    assert.equal(createInc.statusCode, 201, createInc.body);
    const incId = createInc.json().data.id;

    const listInc = await app.inject({
      method: 'GET',
      url: '/api/v1/support/incidents',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(listInc.statusCode, 200, listInc.body);
    assert.ok(listInc.json().data.some((i: any) => i.id === incId));

    const resolveInc = await app.inject({
      method: 'PATCH',
      url: `/api/v1/support/incidents/${incId}/resolve`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { resolutionNotes: 'Replaced breaker module safely.' },
    });
    assert.equal(resolveInc.statusCode, 200, resolveInc.body);
    assert.equal(resolveInc.json().data.status, 'RESOLVED');

    // 6. GET & PUT /crm/technicians/:id/availability
    const putAvail = await app.inject({
      method: 'PUT',
      url: `/api/v1/crm/technicians/${worldA.techId}/availability`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: {
        shifts: [
          { dayOfWeek: 1, startTime: '08:30', endTime: '17:30', isActive: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '18:00', isActive: true },
        ],
      },
    });
    assert.equal(putAvail.statusCode, 200, putAvail.body);
    assert.equal(putAvail.json().data.shifts.length, 2);

    const getAvail = await app.inject({
      method: 'GET',
      url: `/api/v1/crm/technicians/${worldA.techId}/availability`,
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
    });
    assert.equal(getAvail.statusCode, 200, getAvail.body);
    assert.equal(getAvail.json().data.shifts.length, 2);
    assert.equal(getAvail.json().data.shifts[0].startTime, '08:30');

    // 7. POST /dispatch/broadcast alias
    const bkBroadcast = await seedBooking(db.pool, worldA, { status: 'REQUESTED', totalCents: 9000 });
    const aliasRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/broadcast',
      headers: { authorization: adminAuth, 'x-tenant-id': worldA.tenantId },
      payload: { bookingId: bkBroadcast.bookingId },
    });
    assert.equal(aliasRes.statusCode, 200, aliasRes.body);
  });
});
