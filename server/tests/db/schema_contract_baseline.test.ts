import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, seedWorld, seedBooking, applyMigrationFile, type TestDb } from '../helpers/db.js';

/**
 * Phase 0 — schema-contract tests: run the exact SQL shapes used by the routes against the
 * real migrations. Section A documents the defects at baseline (migrations 001-009);
 * Section B proves migration 010 resolves them.
 */
describe('Schema contract @ baseline migrations 001-009 (documents defects)', () => {
  let db: TestDb;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  before(async () => {
    db = await startTestDb({ migrateUpTo: '009_ledger_payout_and_booking_references.sql' });
    w = await seedWorld(db.pool);
  });
  after(async () => { await db.stop(); });

  const fails = async (sql: string, params: any[], re: RegExp) =>
    assert.rejects(() => db.pool.query(sql, params), re);

  test('payment_transactions has no updated_at (webhook UPDATE)', async () => {
    const b = await seedBooking(db.pool, w);
    await fails(`UPDATE payment_transactions SET status='SUCCEEDED', updated_at=NOW() WHERE id=$1`, [b.txId], /updated_at/);
  });
  test('payment_transactions has no currency / error_message columns', async () => {
    await fails(`SELECT pt.currency FROM payment_transactions pt`, [], /currency/);
    const b = await seedBooking(db.pool, w);
    await fails(`UPDATE payment_transactions SET error_message='x' WHERE id=$1`, [b.txId], /error_message/);
  });
  test('DISCREPANCY_QUARANTINED violates status CHECK', async () => {
    const b = await seedBooking(db.pool, w);
    await fails(`UPDATE payment_transactions SET status='DISCREPANCY_QUARANTINED' WHERE id=$1`, [b.txId], /check constraint/i);
  });
  test('provider_payouts has no updated_at', async () => {
    await fails(`UPDATE provider_payouts SET status='PROCESSING', updated_at=NOW() WHERE id=$1`, ['00000000-0000-0000-0000-000000000000'], /updated_at/);
  });
  test('clearing customer_safety_pin violates NOT NULL', async () => {
    const b = await seedBooking(db.pool, w, { status: 'EN_ROUTE' });
    await fails(`UPDATE bookings SET customer_safety_pin = NULL WHERE id=$1`, [b.bookingId], /not-null|null value/i);
  });
  test('ON CONFLICT (transaction_id, posting_type) cannot infer the partial unique index', async () => {
    const b = await seedBooking(db.pool, w);
    await fails(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1,$2,'PLATFORM_FEE',$3,$4,100,'x') ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
      [w.tenantId, b.txId, w.accountIds['2010'], w.accountIds['4010']], /no unique or exclusion constraint/i);
  });
});
