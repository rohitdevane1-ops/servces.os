import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import type { FastifyInstance } from 'fastify';
import { startTestDb, seedWorld, seedBooking, type TestDb } from '../helpers/db.js';
import { pool } from '../../src/database/pool.js';
import { buildApp } from '../../src/app.js';
import { env, validateEnv, parseTrustProxy, INSECURE_DEFAULTS } from '../../src/config/env.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { setStripeForTest } from '../../src/services/stripeClient.js';
import { OutboxWorker } from '../../src/workers/outbox.worker.js';

const WEBHOOK_SECRET = 'whsec_test_integration_secret_123456';
const stripeHelper = new Stripe('sk_test_dummy');

function signWebhookEvent(payloadObj: any): { raw: string; sig: string } {
  const raw = JSON.stringify(payloadObj);
  const sig = stripeHelper.webhooks.generateTestHeaderString({
    payload: raw,
    secret: WEBHOOK_SECRET,
  });
  return { raw, sig };
}

describe('ServiceOS Full Production Remediation Integration Suite (Real PostgreSQL + Fastify + Stripe Mock)', () => {
  let db: TestDb;
  let app: FastifyInstance;
  let originalQuery: any;
  let originalConnect: any;
  let originalWebhookSecret: string | undefined;
  let originalStripeKey: string | undefined;
  let originalOutboxEnabled: string | undefined;
  let activeTxCount = 0;

  let w1: Awaited<ReturnType<typeof seedWorld>>;
  let w2: Awaited<ReturnType<typeof seedWorld>>;
  let adminToken1: string;
  let custToken1: string;
  let techToken1: string;

  const mockHandlers: {
    piCreate?: (params: any, opts: any) => Promise<any>;
    piRetrieve?: (id: string) => Promise<any>;
    piCapture?: (id: string, params: any, opts: any) => Promise<any>;
    piCancel?: (id: string, params: any, opts: any) => Promise<any>;
    trCreate?: (params: any, opts: any) => Promise<any>;
    trRetrieve?: (id: string) => Promise<any>;
  } = {};

  function assertNoActiveDbTransaction(opName: string) {
    if (activeTxCount > 0) {
      throw new Error(`EXTERNAL_CALL_INSIDE_DB_TRANSACTION: ${opName} called while ${activeTxCount} PostgreSQL tx open!`);
    }
  }

  before(async () => {
    originalOutboxEnabled = process.env.OUTBOX_WORKER_ENABLED;
    process.env.OUTBOX_WORKER_ENABLED = 'false'; // Test invokes workers deterministically

    db = await startTestDb(); // Applies migrations 001 through 010
    w1 = await seedWorld(db.pool, 'acme');
    w2 = await seedWorld(db.pool, 'beta'); // Multi-tenant environment

    adminToken1 = AuthService.generateAccessToken({
      id: w1.adminId,
      tenantId: w1.tenantId,
      role: 'ADMIN',
      email: 'admin@acme.test',
    });
    custToken1 = AuthService.generateAccessToken({
      id: w1.customerId,
      tenantId: w1.tenantId,
      role: 'CUSTOMER',
      email: 'cust@acme.test',
    });
    techToken1 = AuthService.generateAccessToken({
      id: w1.techId,
      tenantId: w1.tenantId,
      role: 'TECHNICIAN',
      email: 'tech@acme.test',
    });

    originalQuery = pool.query;
    originalConnect = pool.connect;
    originalWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
    originalStripeKey = env.STRIPE_SECRET_KEY;

    (env as any).STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    (env as any).STRIPE_SECRET_KEY = 'sk_test_integration_key';

    // Route all pool queries through real embedded PostgreSQL + track open BEGIN/COMMIT/ROLLBACK transactions
    (pool as any).query = (text: any, params?: any[]) => db.pool.query(text, params);
    (pool as any).connect = async () => {
      const client = await db.pool.connect();
      let inTx = false;
      return {
        query: async (sql: any, params?: any[]) => {
          const upper = (typeof sql === 'string' ? sql : sql?.text || '').trim().toUpperCase();
          if (upper === 'BEGIN' || upper.startsWith('BEGIN ') || upper.startsWith('BEGIN;')) {
            if (!inTx) {
              inTx = true;
              activeTxCount += 1;
            }
          } else if (
            upper === 'COMMIT' || upper.startsWith('COMMIT ') || upper.startsWith('COMMIT;') ||
            upper === 'ROLLBACK' || upper.startsWith('ROLLBACK ') || upper.startsWith('ROLLBACK;')
          ) {
            if (inTx) {
              inTx = false;
              activeTxCount = Math.max(0, activeTxCount - 1);
            }
          }
          return client.query(sql, params);
        },
        release: (err?: any) => {
          if (inTx) {
            inTx = false;
            activeTxCount = Math.max(0, activeTxCount - 1);
          }
          return client.release(err);
        },
      };
    };

    const stripeMock: any = {
      webhooks: stripeHelper.webhooks,
      paymentIntents: {
        create: async (params: any, opts: any) => {
          assertNoActiveDbTransaction('paymentIntents.create');
          if (mockHandlers.piCreate) return mockHandlers.piCreate(params, opts);
          return { id: `pi_mock_${Date.now()}`, client_secret: 'pi_mock_secret_123', status: 'requires_payment_method' };
        },
        retrieve: async (id: string) => {
          assertNoActiveDbTransaction('paymentIntents.retrieve');
          if (mockHandlers.piRetrieve) return mockHandlers.piRetrieve(id);
          return { id, client_secret: `${id}_secret`, status: 'requires_capture' };
        },
        capture: async (id: string, params: any, opts: any) => {
          assertNoActiveDbTransaction('paymentIntents.capture');
          if (mockHandlers.piCapture) return mockHandlers.piCapture(id, params, opts);
          return { id, status: 'succeeded' };
        },
        cancel: async (id: string, params: any, opts: any) => {
          assertNoActiveDbTransaction('paymentIntents.cancel');
          if (mockHandlers.piCancel) return mockHandlers.piCancel(id, params, opts);
          return { id, status: 'canceled' };
        },
      },
      transfers: {
        create: async (params: any, opts: any) => {
          assertNoActiveDbTransaction('transfers.create');
          if (mockHandlers.trCreate) return mockHandlers.trCreate(params, opts);
          return { id: `tr_mock_${Date.now()}` };
        },
        retrieve: async (id: string) => {
          assertNoActiveDbTransaction('transfers.retrieve');
          if (mockHandlers.trRetrieve) return mockHandlers.trRetrieve(id);
          return { id, reversed: false };
        },
      },
    };
    setStripeForTest(stripeMock);

    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    setStripeForTest(null);
    (pool as any).query = originalQuery;
    (pool as any).connect = originalConnect;
    (env as any).STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    (env as any).STRIPE_SECRET_KEY = originalStripeKey;
    process.env.OUTBOX_WORKER_ENABLED = originalOutboxEnabled;
    await app.close();
    await db.stop();
  });

  beforeEach(() => {
    mockHandlers.piCreate = undefined;
    mockHandlers.piRetrieve = undefined;
    mockHandlers.piCapture = undefined;
    mockHandlers.piCancel = undefined;
    mockHandlers.trCreate = undefined;
    mockHandlers.trRetrieve = undefined;
  });

  test('Multi-tenant webhook route exemption is exact (POST path only; GET and sibling finance routes still require tenant)', async () => {
    const overviewNoTenant = await app.inject({ method: 'GET', url: '/api/v1/finances/overview' });
    assert.equal(overviewNoTenant.statusCode, 400);
    assert.equal(JSON.parse(overviewNoTenant.payload).error.code, 'TENANT_IDENTIFIER_REQUIRED');

    const getWebhook = await app.inject({ method: 'GET', url: '/api/v1/finances/webhooks/stripe' });
    assert.equal(getWebhook.statusCode, 400);
    assert.equal(JSON.parse(getWebhook.payload).error.code, 'TENANT_IDENTIFIER_REQUIRED');

    const badSig = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe?source=stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
      payload: JSON.stringify({ id: 'evt_bad_sig', type: 'payment_intent.succeeded' }),
    });
    assert.equal(badSig.statusCode, 400);
    assert.equal(JSON.parse(badSig.payload).error.code, 'INVALID_STRIPE_SIGNATURE');
  });

  test('Webhook missing target -> 503 + rollback claim; retry -> 200 + claim; replay -> idempotent 200', async () => {
    const evtId = 'evt_missing_then_ready';
    const piId = 'pi_late_commit_1';
    const { raw, sig } = signWebhookEvent({
      id: evtId,
      type: 'payment_intent.succeeded',
      data: { object: { id: piId, amount_received: 12000, currency: 'usd' } },
    });

    const res503 = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(res503.statusCode, 503);
    assert.equal((await db.pool.query(`SELECT count(*)::int c FROM webhook_events WHERE id=$1`, [evtId])).rows[0].c, 0);

    // Seed matching booking & completed status, then replay same signed webhook
    const b = await seedBooking(db.pool, w1, { status: 'COMPLETED', txStatus: 'REQUIRES_CAPTURE', piId });
    const res200 = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(res200.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [b.txId])).rows[0].status, 'SUCCEEDED');

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(replay.statusCode, 200);
    assert.equal(JSON.parse(replay.payload).idempotent, true);
  });

  test('Booking create (202) -> webhook arrives before worker saves PI ID -> UUID correlation + worker does not downgrade SUCCEEDED', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${custToken1}`, 'x-tenant-id': w1.tenantId },
      payload: { serviceId: w1.serviceId, addressText: '123 Ocean Dr', latitude: 25.76, longitude: -80.19 },
    });
    assert.equal(createRes.statusCode, 202);
    const created = JSON.parse(createRes.payload).data;
    assert.equal(created.status, 'PENDING_PAYMENT');

    // Client GET payment-intent before worker runs -> 202 PROVISIONING; non-owner blocked 403
    const otherCustRow = await db.pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, is_active) VALUES ($1, 'other-owner@a.test', 'x', 'CUSTOMER', TRUE) RETURNING id`,
      [w1.tenantId]
    );
    const otherCustToken = AuthService.generateAccessToken({ id: otherCustRow.rows[0].id, tenantId: w1.tenantId, role: 'CUSTOMER', email: 'other-owner@a.test' });
    const forbiddenRes = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${created.bookingId}/payment-intent`,
      headers: { authorization: `Bearer ${otherCustToken}`, 'x-tenant-id': w1.tenantId },
    });
    assert.equal(forbiddenRes.statusCode, 403);

    const provRes = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${created.bookingId}/payment-intent`,
      headers: { authorization: `Bearer ${custToken1}`, 'x-tenant-id': w1.tenantId },
    });
    assert.equal(provRes.statusCode, 202);
    assert.equal(JSON.parse(provRes.payload).data.status, 'PROVISIONING');

    // Webhook arrives BEFORE worker finishes (stripe_payment_intent_id IS NULL locally)
    const { raw, sig } = signWebhookEvent({
      id: 'evt_early_webhook_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_early_bound_1',
          amount_received: created.preAuthAmountCents,
          currency: 'usd',
          metadata: { transactionId: created.paymentTransactionId, tenantId: w1.tenantId },
        },
      },
    });
    const whRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(whRes.statusCode, 200);

    const txAfterWh = (await db.pool.query(`SELECT status, stripe_payment_intent_id FROM payment_transactions WHERE id=$1`, [created.paymentTransactionId])).rows[0];
    assert.equal(txAfterWh.status, 'SUCCEEDED');
    assert.equal(txAfterWh.stripe_payment_intent_id, 'pi_early_bound_1');

    // Only ESCROW_CAPTURE is posted while booking is REQUESTED (no premature PLATFORM_FEE/TECH_PAYABLE!)
    const legs = (await db.pool.query(`SELECT posting_type FROM ledger_entries WHERE transaction_id=$1`, [created.paymentTransactionId])).rows;
    assert.deepEqual(legs.map((r) => r.posting_type), ['ESCROW_CAPTURE']);

    // Worker runs later and returns requires_capture: must NEVER downgrade SUCCEEDED
    mockHandlers.piCreate = async () => ({ id: 'pi_early_bound_1', status: 'requires_capture', client_secret: 'sec_1' });
    const worker = new OutboxWorker(db.pool);
    const wr = await worker.processNextJob();
    assert.equal(wr.status, 'COMPLETED');
    const txAfterWorker = (await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [created.paymentTransactionId])).rows[0];
    assert.equal(txAfterWorker.status, 'SUCCEEDED');
  });

  test('Divergent Stripe ID and metadata UUID -> 409 CONFLICT; amount mismatch -> DISCREPANCY_QUARANTINED', async () => {
    const a = await seedBooking(db.pool, w1, { piId: 'pi_div_A' });
    const b = await seedBooking(db.pool, w1, { piId: 'pi_div_B' });

    const { raw, sig } = signWebhookEvent({
      id: 'evt_divergent_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_div_A', amount_received: 12000, currency: 'usd', metadata: { transactionId: b.txId, tenantId: w1.tenantId } } },
    });
    const divRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload: raw,
    });
    assert.equal(divRes.statusCode, 409);
    assert.equal((await db.pool.query(`SELECT count(*)::int c FROM webhook_events WHERE id='evt_divergent_1'`)).rows[0].c, 0);

    const { raw: rawMm, sig: sigMm } = signWebhookEvent({
      id: 'evt_mismatch_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_div_B', amount_received: 999, currency: 'usd' } },
    });
    const mmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sigMm },
      payload: rawMm,
    });
    assert.equal(mmRes.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [b.txId])).rows[0].status, 'DISCREPANCY_QUARANTINED');
    assert.equal((await db.pool.query(`SELECT count(*)::int c FROM ledger_entries WHERE transaction_id=$1`, [b.txId])).rows[0].c, 0);
  });

  test('Outbox worker: concurrent SKIP LOCKED, heartbeat renewal, stale-lease ownership, timeout+reconciliation, hard decline', async () => {
    // 1. Two concurrent workers race on 1 job -> Stripe create called once
    const b1 = await seedBooking(db.pool, w1, { piId: null, txStatus: 'PENDING' });
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT',$3,$4)`,
      [w1.tenantId, b1.bookingId, JSON.stringify({ tenantId: w1.tenantId, bookingId: b1.bookingId, bookingRef: 'R1', invoiceId: b1.invoiceId, transactionId: b1.txId, customerId: w1.customerId, amountCents: 12000, currency: 'usd' }), `idem_race_${b1.bookingId}`]
    );
    let stripeCalls = 0;
    mockHandlers.piCreate = async () => {
      stripeCalls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return { id: `pi_race_${stripeCalls}`, status: 'requires_capture', client_secret: 'sec_race' };
    };
    const wA = new OutboxWorker(db.pool, { workerId: 'worker-A', leaseMs: 120 });
    const wB = new OutboxWorker(db.pool, { workerId: 'worker-B', leaseMs: 120 });
    const [rA, rB] = await Promise.all([wA.processNextJob(), wB.processNextJob()]);
    assert.equal(stripeCalls, 1);
    assert.equal([rA.status, rB.status].filter((s) => s === 'COMPLETED').length, 1);
    assert.equal([rA.status, rB.status].filter((s) => !s).length, 1);

    // 2. Heartbeat keeps a slow job's lease alive + stale lease theft prevents old worker from overwriting
    const b2 = await seedBooking(db.pool, w1, { piId: null, txStatus: 'PENDING' });
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT',$3,$4)`,
      [w1.tenantId, b2.bookingId, JSON.stringify({ tenantId: w1.tenantId, bookingId: b2.bookingId, bookingRef: 'R2', invoiceId: b2.invoiceId, transactionId: b2.txId, customerId: w1.customerId, amountCents: 12000, currency: 'usd' }), `idem_hb_${b2.bookingId}`]
    );
    mockHandlers.piCreate = async () => {
      await new Promise((r) => setTimeout(r, 140)); // longer than 90ms lease; heartbeat (30ms) renews it!
      return { id: 'pi_hb_ok', status: 'requires_capture' };
    };
    const wHb = new OutboxWorker(db.pool, { workerId: 'worker-hb', leaseMs: 90 });
    const hbRes = await wHb.processNextJob();
    assert.equal(hbRes.status, 'COMPLETED');

    // Stale lease reclamation + owner check
    const b3 = await seedBooking(db.pool, w1, { piId: null, txStatus: 'PENDING' });
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key, status, locked_by, lease_expires_at)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT',$3,$4,'PROCESSING','dead-worker',NOW() - INTERVAL '5 seconds')`,
      [w1.tenantId, b3.bookingId, JSON.stringify({ tenantId: w1.tenantId, bookingId: b3.bookingId, bookingRef: 'R3', invoiceId: b3.invoiceId, transactionId: b3.txId, customerId: w1.customerId, amountCents: 12000, currency: 'usd' }), `idem_stale_${b3.bookingId}`]
    );
    mockHandlers.piCreate = async () => ({ id: 'pi_reclaimed_1', status: 'requires_capture' });
    const reclaimRes = await new OutboxWorker(db.pool, { workerId: 'worker-reclaim' }).processNextJob();
    assert.equal(reclaimRes.status, 'COMPLETED');

    // 3. Stripe timeout retries with identical key+params, then transitions to REQUIRES_RECONCILIATION without cancelling booking
    const b4 = await seedBooking(db.pool, w1, { piId: null, txStatus: 'PENDING' });
    const idemTimeout = `idem_to_${b4.bookingId}`;
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key, max_attempts)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT',$3,$4,2)`,
      [w1.tenantId, b4.bookingId, JSON.stringify({ tenantId: w1.tenantId, bookingId: b4.bookingId, bookingRef: 'R4', invoiceId: b4.invoiceId, transactionId: b4.txId, customerId: w1.customerId, amountCents: 12000, currency: 'usd' }), idemTimeout]
    );
    const seenKeys: string[] = [];
    mockHandlers.piCreate = async (_p, opts) => {
      seenKeys.push(opts.idempotencyKey);
      const err: any = new Error('Socket timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    };
    const wRetry = new OutboxWorker(db.pool, { baseBackoffMs: 1 });
    assert.equal((await wRetry.processNextJob()).status, 'RETRY_SCHEDULED');
    await new Promise((r) => setTimeout(r, 15));
    assert.equal((await wRetry.processNextJob()).status, 'REQUIRES_RECONCILIATION');
    assert.deepEqual(seenKeys, [idemTimeout, idemTimeout]);
    assert.equal((await db.pool.query(`SELECT status FROM bookings WHERE id=$1`, [b4.bookingId])).rows[0].status, 'REQUESTED');
    assert.equal((await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [b4.txId])).rows[0].status, 'PENDING');

    // 4. Hard Stripe decline fails payment & cancels booking cleanly
    const b5 = await seedBooking(db.pool, w1, { piId: null, txStatus: 'PENDING' });
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT',$3,$4)`,
      [w1.tenantId, b5.bookingId, JSON.stringify({ tenantId: w1.tenantId, bookingId: b5.bookingId, bookingRef: 'R5', invoiceId: b5.invoiceId, transactionId: b5.txId, customerId: w1.customerId, amountCents: 12000, currency: 'usd' }), `idem_dec_${b5.bookingId}`]
    );
    mockHandlers.piCreate = async () => {
      const err: any = new Error('Your card was declined');
      err.type = 'StripeCardError';
      err.statusCode = 402;
      throw err;
    };
    assert.equal((await wRetry.processNextJob()).status, 'FAILED');
    assert.equal((await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [b5.txId])).rows[0].status, 'FAILED');
    assert.equal((await db.pool.query(`SELECT status FROM bookings WHERE id=$1`, [b5.bookingId])).rows[0].status, 'CANCELLED');
  });

  test('Authorization vs Capture, Completion Ledger Zero-Net on 2010, and Cancel 3-phase guards', async () => {
    const b = await seedBooking(db.pool, w1, { status: 'EN_ROUTE', txStatus: 'PENDING', totalCents: 10000, piId: 'pi_e2e_1' });

    // Confirm payment (retrieve -> requires_capture; outside DB tx; no revenue ledger yet)
    const confRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${b.bookingId}/confirm-payment`,
      headers: { authorization: `Bearer ${custToken1}`, 'x-tenant-id': w1.tenantId },
    });
    assert.equal(confRes.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status FROM payment_transactions WHERE id=$1`, [b.txId])).rows[0].status, 'REQUIRES_CAPTURE');
    assert.equal((await db.pool.query(`SELECT count(*)::int c FROM ledger_entries WHERE transaction_id=$1`, [b.txId])).rows[0].c, 0);

    // Get PaymentIntent client_secret
    const piGet = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${b.bookingId}/payment-intent`,
      headers: { authorization: `Bearer ${custToken1}`, 'x-tenant-id': w1.tenantId },
    });
    assert.equal(piGet.statusCode, 200);
    assert.equal(JSON.parse(piGet.payload).data.clientSecret, 'pi_e2e_1_secret');

    // Verify arrival with valid PIN -> sets customer_safety_pin = NULL, status = ON_SITE
    const pinOk = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${b.bookingId}/verify-arrival`,
      headers: { authorization: `Bearer ${techToken1}`, 'x-tenant-id': w1.tenantId },
      payload: { safetyPin: '1234' },
    });
    assert.equal(pinOk.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT customer_safety_pin FROM bookings WHERE id=$1`, [b.bookingId])).rows[0].customer_safety_pin, null);

    // Complete booking -> captures outside DB tx & posts ESCROW_CAPTURE + PLATFORM_FEE + TECH_PAYABLE
    const compRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${b.bookingId}/complete`,
      headers: { authorization: `Bearer ${techToken1}`, 'x-tenant-id': w1.tenantId },
      payload: {
        beforePhotos: ['https://cdn.serviceos.test/b1.jpg'],
        afterPhotos: ['https://cdn.serviceos.test/a1.jpg'],
        workSummaryNotes: 'Done',
      },
    });
    assert.equal(compRes.statusCode, 200);

    // Ledger accounting proof: Account 2010 must net to 0 (credits === debits) for this transaction!
    const net2010 = (await db.pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN credit_account_id = $1 THEN amount_cents ELSE 0 END), 0)::bigint -
         COALESCE(SUM(CASE WHEN debit_account_id = $1 THEN amount_cents ELSE 0 END), 0)::bigint AS net
       FROM ledger_entries WHERE transaction_id = $2`,
      [w1.accountIds['2010'], b.txId]
    )).rows[0].net;
    assert.equal(Number(net2010), 0, 'Customer Escrow Liability (2010) must net to 0 after capture + completion');

    // Cancel pending booking voids tx & marks outbox CANCELLED
    const bPend = await seedBooking(db.pool, w1, { status: 'REQUESTED', txStatus: 'PENDING', piId: null });
    await db.pool.query(
      `INSERT INTO outbox_operations (tenant_id, aggregate_type, aggregate_id, operation_type, payload, idempotency_key)
       VALUES ($1,'BOOKING_PAYMENT',$2,'CREATE_PAYMENT_INTENT','{}',$3)`,
      [w1.tenantId, bPend.bookingId, `idem_cancel_ob_${bPend.bookingId}`]
    );
    const canRes = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${bPend.bookingId}/cancel`,
      headers: { authorization: `Bearer ${custToken1}`, 'x-tenant-id': w1.tenantId },
      payload: { reason: 'Changed mind' },
    });
    assert.equal(canRes.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status FROM outbox_operations WHERE aggregate_id=$1`, [bPend.bookingId])).rows[0].status, 'CANCELLED');
  });

  test('Payout timeout reservation, reconcile, cumulative transfer.reversed, and payout.failed (po_)', async () => {
    // Seed a completed PAID booking worth 10000 cents -> tech earned 8500 cents (default 15% fee)
    const wPay = await seedWorld(db.pool, 'payco');
    const adminPay = AuthService.generateAccessToken({ id: wPay.adminId, tenantId: wPay.tenantId, role: 'ADMIN', email: 'admin@payco.test' });
    const bDone = await seedBooking(db.pool, wPay, { status: 'COMPLETED', txStatus: 'SUCCEEDED', totalCents: 10000 });
    await db.pool.query(`UPDATE invoices SET status='PAID', paid_at=NOW() WHERE id=$1`, [bDone.invoiceId]);

    // 1. Timeout on Stripe transfer -> 202 PENDING_PROVIDER_CONFIRMATION & balance reserved!
    mockHandlers.trCreate = async () => {
      const err: any = new Error('Connect timeout');
      err.type = 'StripeConnectionError';
      throw err;
    };
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/payouts',
      headers: { authorization: `Bearer ${adminPay}`, 'x-tenant-id': wPay.tenantId, 'idempotency-key': 'k-timeout-1' },
      payload: { providerId: wPay.techId, amountCents: 8500 },
    });
    assert.equal(p1.statusCode, 202);
    const payoutId = JSON.parse(p1.payload).data.payoutId;
    assert.equal((await db.pool.query(`SELECT status FROM provider_payouts WHERE id=$1`, [payoutId])).rows[0].status, 'PENDING_PROVIDER_CONFIRMATION');

    // Attempt second payout immediately with new key -> rejected 400 (cannot double-pay!)
    mockHandlers.trCreate = async () => ({ id: 'tr_should_not_run' });
    const pDouble = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/payouts',
      headers: { authorization: `Bearer ${adminPay}`, 'x-tenant-id': wPay.tenantId, 'idempotency-key': 'k-double-2' },
      payload: { providerId: wPay.techId, amountCents: 100 },
    });
    assert.equal(pDouble.statusCode, 400);
    assert.equal(JSON.parse(pDouble.payload).error.code, 'INSUFFICIENT_PAYOUT_BALANCE');

    // Reconcile recovers transfer ID using persisted key -> PROCESSING & ledger PAYOUT_DISBURSAL
    mockHandlers.trCreate = async (_p, opts) => {
      assert.equal(opts.idempotencyKey, `payout_stripe_${payoutId}`);
      return { id: 'tr_reconciled_8500' };
    };
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/finances/payouts/${payoutId}/reconcile`,
      headers: { authorization: `Bearer ${adminPay}`, 'x-tenant-id': wPay.tenantId },
    });
    assert.equal(recRes.statusCode, 200);
    assert.equal(JSON.parse(recRes.payload).data.transferId, 'tr_reconciled_8500');

    // 2. payout.failed with po_... must NOT mark tr_ transfer row as FAILED
    const { raw: rawPo, sig: sigPo } = signWebhookEvent({
      id: 'evt_po_fail_1',
      type: 'payout.failed',
      account: 'acct_test_1',
      data: { object: { id: 'po_bank_fail_1', failure_code: 'account_closed' } },
    });
    const poRes = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sigPo },
      payload: rawPo,
    });
    assert.equal(poRes.statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status FROM provider_payouts WHERE id=$1`, [payoutId])).rows[0].status, 'PROCESSING');

    // 3. Cumulative transfer.reversed accounting (3000 -> stale 2000 -> over-total 99999 -> full 8500)
    const sendRev = (id: string, amount_reversed: number) => {
      const { raw, sig } = signWebhookEvent({
        id,
        type: 'transfer.reversed',
        data: { object: { id: 'tr_reconciled_8500', amount_reversed, reversals: { data: [{ id: `trr_${id}` }] } } },
      });
      return app.inject({
        method: 'POST',
        url: '/api/v1/finances/webhooks/stripe',
        headers: { 'content-type': 'application/json', 'stripe-signature': sig },
        payload: raw,
      });
    };

    assert.equal((await sendRev('evt_rev_1', 3000)).statusCode, 200);
    assert.equal((await db.pool.query(`SELECT status, amount_reversed_cents FROM provider_payouts WHERE id=$1`, [payoutId])).rows[0].status, 'PARTIALLY_REVERSED');
    assert.equal((await sendRev('evt_rev_stale', 2000)).statusCode, 200); // ignored cleanly
    assert.equal((await sendRev('evt_rev_over', 99999)).statusCode, 422); // rejected
    assert.equal((await sendRev('evt_rev_full', 8500)).statusCode, 200);

    const poFinal = (await db.pool.query(`SELECT status, amount_reversed_cents FROM provider_payouts WHERE id=$1`, [payoutId])).rows[0];
    assert.equal(poFinal.status, 'REVERSED');
    assert.equal(Number(poFinal.amount_reversed_cents), 8500);
    const revSum = (await db.pool.query(`SELECT SUM(delta_amount_cents)::bigint s FROM provider_payout_reversals WHERE payout_id=$1`, [payoutId])).rows[0].s;
    assert.equal(Number(revSum), 8500);

    // Available balance restored (can trigger payout of 8500 again cleanly after full reversal)
    mockHandlers.trCreate = async () => ({ id: 'tr_after_rev_1' });
    const pReissued = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/payouts',
      headers: { authorization: `Bearer ${adminPay}`, 'x-tenant-id': wPay.tenantId, 'idempotency-key': 'k-after-rev-1' },
      payload: { providerId: wPay.techId, amountCents: 8500 },
    });
    assert.equal(pReissued.statusCode, 200);
  });

  test('Persistent PostgreSQL PIN lockout persists across instances, resets on expired window and on success', async () => {
    const b = await seedBooking(db.pool, w1, { status: 'EN_ROUTE', pin: '4321' });
    for (let i = 1; i <= 5; i += 1) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${b.bookingId}/verify-arrival`,
        headers: { authorization: `Bearer ${techToken1}`, 'x-tenant-id': w1.tenantId },
        payload: { safetyPin: '0000' },
      });
      assert.equal(r.statusCode, 400);
    }

    // 6th attempt via a brand-new Fastify instance must still return 429!
    const app2 = await buildApp();
    await app2.ready();
    try {
      const locked = await app2.inject({
        method: 'POST',
        url: `/api/v1/bookings/${b.bookingId}/verify-arrival`,
        headers: { authorization: `Bearer ${techToken1}`, 'x-tenant-id': w1.tenantId },
        payload: { safetyPin: '4321' },
      });
      assert.equal(locked.statusCode, 429);
      assert.equal(JSON.parse(locked.payload).error.code, 'TOO_MANY_PIN_ATTEMPTS');
    } finally {
      await app2.close();
    }

    // Expire the lock in DB -> valid PIN resets attempts & clears customer_safety_pin to NULL
    await db.pool.query(`UPDATE bookings SET safety_pin_locked_until = NOW() - INTERVAL '1 minute' WHERE id=$1`, [b.bookingId]);
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${b.bookingId}/verify-arrival`,
      headers: { authorization: `Bearer ${techToken1}`, 'x-tenant-id': w1.tenantId },
      payload: { safetyPin: '4321' },
    });
    assert.equal(ok.statusCode, 200);
    const bRow = (await db.pool.query(`SELECT status, customer_safety_pin, safety_pin_failed_attempts FROM bookings WHERE id=$1`, [b.bookingId])).rows[0];
    assert.equal(bRow.status, 'ON_SITE');
    assert.equal(bRow.customer_safety_pin, null);
    assert.equal(bRow.safety_pin_failed_attempts, 0);
  });

  test('Security hardening: APP_ENCRYPTION_KEY default rejected in prod, parseTrustProxy validates, spoofed XFF blocked, refresh CSRF rejected', async () => {
    const validBase: Record<string, string> = {
      NODE_ENV: 'production',
      JWT_SECRET: 'prod_jwt_unique_key_at_least_32_characters_long_9911',
      JWT_REFRESH_SECRET: 'prod_refresh_unique_key_at_least_32_characters_9911',
      BOOTSTRAP_TOKEN: 'prod_bootstrap_unique_token_9911',
      APP_ENCRYPTION_KEY: 'a'.repeat(64),
    };
    assert.doesNotThrow(() => validateEnv(validBase));
    assert.throws(
      () => validateEnv({ ...validBase, APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }),
      /Security Exception/
    );
    assert.ok(INSECURE_DEFAULTS.includes('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'));

    assert.equal(parseTrustProxy('false'), false);
    assert.equal(typeof parseTrustProxy('2'), 'function');
    assert.deepEqual(parseTrustProxy('10.0.0.0/8, 172.16.0.1'), ['10.0.0.0/8', '172.16.0.1']);
    assert.throws(() => parseTrustProxy('not-an-ip'), /TRUST_PROXY/);

    // Cross-origin Origin rejected with 403 by CORS, and cross-origin Referer cookie refresh rejected with 403 CSRF_ORIGIN_MISMATCH
    const corsReject = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        'x-tenant-id': w1.tenantId,
        origin: 'https://attacker.example',
        cookie: 'refresh_token=some_cookie_value',
      },
    });
    assert.equal(corsReject.statusCode, 403);

    const csrfRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        'x-tenant-id': w1.tenantId,
        referer: 'https://attacker.example/csrf-form',
        cookie: 'refresh_token=some_cookie_value',
      },
    });
    assert.equal(csrfRes.statusCode, 403);
    assert.equal(JSON.parse(csrfRes.payload).error.code, 'CSRF_ORIGIN_MISMATCH');

    // Forged X-Forwarded-For does NOT bypass /auth/login 5/min rate limit (and 127.0.0.1 is no longer allow-listed)
    for (let i = 0; i < 6; i += 1) {
      const lr = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'x-tenant-id': w1.tenantId,
          'x-forwarded-for': `203.0.113.${i + 10}`,
          'x-captcha-token': 'test-captcha-pass',
        },
        payload: { email: 'nonexistent@acme.test', password: 'WrongPassword123!' },
      });
      if (i < 5) {
        assert.equal(lr.statusCode, 401);
      } else {
        assert.equal(lr.statusCode, 429, 'Forged X-Forwarded-For from 127.0.0.1 must be rate-limited');
      }
    }
  });
});
