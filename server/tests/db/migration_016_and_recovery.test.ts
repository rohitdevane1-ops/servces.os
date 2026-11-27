import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  applyMigrationFile,
  createEphemeralAppRole,
  seedBooking,
  seedWorld,
  startTestDb,
  type TestDb,
} from '../helpers/db.js';

describe('Migration 016, Non-Superuser FORCE RLS & Recovery API Suite', () => {
  let db: TestDb;
  let app: FastifyInstance;
  let AuthService: typeof import('../../src/modules/auth/auth.service.js').AuthService;

  before(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = 'test';
    process.env.APP_DEMO_MODE = 'false';
    process.env.OUTBOX_WORKER_ENABLED = 'false';

    ({ AuthService } = await import('../../src/modules/auth/auth.service.js'));
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app?.close();
    await db?.stop();
  });

  test('Non-superuser NOSUPERUSER/NOBYPASSRLS role enforces FORCE RLS on migration 016 & core tables', async () => {
    const wA = await seedWorld(db.pool, 'rls-a');
    const wB = await seedWorld(db.pool, 'rls-b');
    const bA = await seedBooking(db.pool, wA, { status: 'ASSIGNED' });
    const bB = await seedBooking(db.pool, wB, { status: 'ASSIGNED' });

    await db.pool.query(
      `INSERT INTO booking_messages (tenant_id, booking_id, sender_id, sender_role, message_body)
       VALUES ($1, $2, $3, 'CUSTOMER', 'Tenant A only')`,
      [wA.tenantId, bA.bookingId, wA.customerId]
    );
    await db.pool.query(
      `INSERT INTO booking_messages (tenant_id, booking_id, sender_id, sender_role, message_body)
       VALUES ($1, $2, $3, 'CUSTOMER', 'Tenant B only')`,
      [wB.tenantId, bB.bookingId, wB.customerId]
    );

    const appRole = await createEphemeralAppRole(db.pool, db.url);
    try {
      const client = await appRole.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [wA.tenantId]);
        const msgRes = await client.query<{ message_body: string }>(
          `SELECT message_body FROM booking_messages`
        );
        assert.deepEqual(msgRes.rows.map((r) => r.message_body), ['Tenant A only']);

        // Unmatched webhook helper succeeds under non-superuser SECURITY DEFINER
        await client.query(
          `SELECT rls_record_unmatched_webhook_event($1, 'stripe', 'account.updated', '{}'::jsonb)`,
          [`evt_unmatched_${crypto.randomBytes(4).toString('hex')}`]
        );

        // Tenant lookup via non-superuser SECURITY DEFINER works
        const resolved = await client.query<{ tenant_id: string | null }>(
          `SELECT rls_resolve_webhook_tenant($1, NULL, NULL, NULL, NULL, NULL) AS tenant_id`,
          [bB.piId]
        );
        assert.equal(resolved.rows[0].tenant_id, wB.tenantId);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    } finally {
      await appRole.cleanup();
    }
  });

  test('New endpoints: booking chat, bonuses + payout balance, staff/duty-status/onboarding, daily reports, auth lock/reauth', async () => {
    const w = await seedWorld(db.pool, 'rec-ops');
    const b = await seedBooking(db.pool, w, { status: 'ASSIGNED', totalCents: 10500 });
    await db.pool.query(
      `UPDATE invoices SET tax_total_cents = 500, commission_bps_snapshot = 1500, status = 'PAID' WHERE id = $1`,
      [b.invoiceId]
    );
    await db.pool.query(
      `UPDATE payment_transactions SET status = 'SUCCEEDED', captured_amount_cents = 10500 WHERE id = $1`,
      [b.txId]
    );
    await db.pool.query(`UPDATE bookings SET status = 'COMPLETED' WHERE id = $1`, [b.bookingId]);

    const adminToken = AuthService.generateAccessToken({ id: w.adminId, email: 'admin@rec-ops.test', role: 'ADMIN', tenantId: w.tenantId });
    const custToken = AuthService.generateAccessToken({ id: w.customerId, email: 'cust@rec-ops.test', role: 'CUSTOMER', tenantId: w.tenantId });
    const techToken = AuthService.generateAccessToken({ id: w.techId, email: 'tech@rec-ops.test', role: 'TECHNICIAN', tenantId: w.tenantId });

    // 1. Booking messages (GET + POST)
    const msgPost = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${b.bookingId}/messages`,
      headers: { authorization: `Bearer ${custToken}`, 'x-tenant-id': w.tenantId },
      payload: { messageText: 'Gate code is 4488' },
    });
    assert.equal(msgPost.statusCode, 201, msgPost.body);
    const msgGet = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${b.bookingId}/messages`,
      headers: { authorization: `Bearer ${techToken}`, 'x-tenant-id': w.tenantId },
    });
    assert.equal(msgGet.statusCode, 200);
    assert.equal(msgGet.json().data.messages.length, 1);
    assert.equal(msgGet.json().data.messages[0].messageText, 'Gate code is 4488');

    // 2. Technician bonus credits balance + COA 5020 ledger
    const bonusRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/bonuses',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { providerId: w.techId, amountCents: 1500, reason: 'On-time 5-star reward' },
    });
    assert.equal(bonusRes.statusCode, 201, bonusRes.body);

    const earnRes = await app.inject({
      method: 'GET',
      url: `/api/v1/finances/technician/earnings?providerId=${w.techId}`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
    });
    assert.equal(earnRes.statusCode, 200);
    // 8500 from completed job (10000 pre-tax * 85%) + 1500 bonus = 10000
    assert.equal(earnRes.json().data.totalEarnedCents, 10000);

    // 3. Invoice modification lock for non-DRAFT invoices
    const lockedInv = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/invoices',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { bookingId: b.bookingId, laborSubtotalCents: 999999 },
    });
    assert.equal(lockedInv.statusCode, 409);
    assert.equal(lockedInv.json().error.code, 'INVOICE_LOCKED');

    // 4. Staff CRUD + Remote duty status toggle + Technician onboarding + Daily reports + SMS status
    const createStaff = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/staff',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { email: 'ops@rec-ops.test', fullName: 'Sara Dispatcher', department: 'Dispatch', assignedTerritory: 'Dubai' },
    });
    assert.equal(createStaff.statusCode, 201, createStaff.body);

    const dutyRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/crm/technicians/${w.techId}/duty-status`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { dutyStatus: 'ONLINE' },
    });
    assert.equal(dutyRes.statusCode, 200, dutyRes.body);
    assert.equal(dutyRes.json().data.dutyStatus, 'ONLINE');

    const onboardPost = await app.inject({
      method: 'POST',
      url: '/api/v1/crm/technicians/onboarding',
      headers: { authorization: `Bearer ${techToken}`, 'x-tenant-id': w.tenantId },
      payload: {
        licenseNumber: 'DED-778899',
        vehicleMakeModel: 'Toyota HiAce',
        vehicleLicensePlate: 'DXB-A1234',
        tradeCategory: 'HVAC & AC',
        documentUrls: ['https://cdn.example.com/license.pdf'],
      },
    });
    assert.equal(onboardPost.statusCode, 201, onboardPost.body);
    const onboardReview = await app.inject({
      method: 'PATCH',
      url: `/api/v1/crm/technicians/onboarding/${onboardPost.json().data.id}/review`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { status: 'APPROVED', reviewerNotes: 'All clear' },
    });
    assert.equal(onboardReview.statusCode, 200, onboardReview.body);

    const reportRes = await app.inject({
      method: 'POST',
      url: '/api/v1/support/daily-reports',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
      payload: { jobsCompleted: 12, ticketsResolved: 4, highlights: 'Smooth Dubai Metro dispatch shift.' },
    });
    assert.equal(reportRes.statusCode, 201, reportRes.body);

    const smsStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/support/sms/status',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-id': w.tenantId },
    });
    assert.equal(smsStatus.statusCode, 200);
    assert.equal(typeof smsStatus.json().data.configured, 'boolean');

    // 5. Auth /me profile update + session lock & cookie reauthenticate
    const pwHash = await AuthService.hashPassword('StrongPass2026!');
    await db.pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [pwHash, w.adminId]);
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-id': w.tenantId },
      payload: { email: 'admin@rec-ops.test', password: 'StrongPass2026!' },
    });
    assert.equal(loginRes.statusCode, 200, loginRes.body);
    const setCookieHeader = loginRes.headers['set-cookie'];
    const cookiePair = (Array.isArray(setCookieHeader) ? setCookieHeader[0] : String(setCookieHeader)).split(';')[0];

    const meUpd = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${loginRes.json().data.accessToken}`, 'x-tenant-id': w.tenantId },
      payload: { fullName: 'Zayed Admin Updated' },
    });
    assert.equal(meUpd.statusCode, 200, meUpd.body);
    assert.equal(meUpd.json().data.updated, true);

    const meGet = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${loginRes.json().data.accessToken}`, 'x-tenant-id': w.tenantId },
    });
    assert.equal(meGet.statusCode, 200, meGet.body);
    assert.equal(meGet.json().data.user.fullName, 'Zayed Admin Updated');

    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/lock',
      headers: {
        authorization: `Bearer ${loginRes.json().data.accessToken}`,
        cookie: cookiePair,
        'x-tenant-id': w.tenantId,
      },
    });
    assert.equal(lockRes.statusCode, 200, lockRes.body);

    const refreshWhileLocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: cookiePair, 'x-tenant-id': w.tenantId },
    });
    assert.equal(refreshWhileLocked.statusCode, 423);
    assert.equal(refreshWhileLocked.json().error.code, 'SESSION_LOCKED');

    const unlockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauthenticate',
      headers: { cookie: cookiePair, 'x-tenant-id': w.tenantId },
      payload: { password: 'StrongPass2026!' },
    });
    assert.equal(unlockRes.statusCode, 200, unlockRes.body);
    assert.ok(unlockRes.json().data.accessToken);
  });

  test('Migration 016 down.sql data-loss guards & clean down -> up round-trip', async () => {
    // Non-empty provider_bonuses / booking_messages must fail down.sql cleanly (and ledger_entries remain immutable)
    await assert.rejects(
      () => applyMigrationFile(db.pool, '016_full_stack_recovery_and_hardening.down.sql', db.usesPostgisShim),
      /ABORTED|non-empty|Aborting rollback/i
    );

    // Clean down -> up round-trip verified on fresh migrated database without immutable ledger entries
    const cleanDb = await startTestDb();
    try {
      await applyMigrationFile(cleanDb.pool, '016_full_stack_recovery_and_hardening.down.sql', cleanDb.usesPostgisShim);
      await applyMigrationFile(cleanDb.pool, '016_full_stack_recovery_and_hardening.sql', cleanDb.usesPostgisShim);
    } finally {
      await cleanDb.stop();
    }
  });
});
