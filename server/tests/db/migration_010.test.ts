import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, seedWorld, seedBooking, applyMigrationFile, type TestDb } from '../helpers/db.js';

const UP = '010_remediation_core_invariants.sql';
const DOWN = '010_remediation_core_invariants.down.sql';

describe('Migration 010 up/down on real PostgreSQL with historical rows', () => {
  let db: TestDb;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let hist: Awaited<ReturnType<typeof seedBooking>>;
  let payoutId: string;

  before(async () => {
    db = await startTestDb({ migrateUpTo: '009_ledger_payout_and_booking_references.sql' });
    w = await seedWorld(db.pool);
    hist = await seedBooking(db.pool, w, { status: 'COMPLETED', txStatus: 'SUCCEEDED' });
    payoutId = (await db.pool.query(
      `INSERT INTO provider_payouts (tenant_id, provider_id, stripe_transfer_id, amount_cents, status, idempotency_key)
       VALUES ($1,$2,'tr_hist_1',5000,'PAID','idem-hist-1') RETURNING id`, [w.tenantId, w.techId])).rows[0].id;
    await db.pool.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1,$2,'PLATFORM_FEE',$3,$4,1800,'hist')`, [w.tenantId, hist.txId, w.accountIds['2010'], w.accountIds['4010']]);
  });
  after(async () => { await db.stop(); });

  test('up applies cleanly and preserves historical financial rows', async () => {
    await applyMigrationFile(db.pool, UP, db.usesPostgisShim);
    const tx = await db.pool.query(`SELECT status, currency, updated_at FROM payment_transactions WHERE id=$1`, [hist.txId]);
    assert.equal(tx.rows[0].status, 'SUCCEEDED');
    assert.equal(tx.rows[0].currency, 'USD');
    const po = await db.pool.query(`SELECT status, amount_reversed_cents FROM provider_payouts WHERE id=$1`, [payoutId]);
    assert.equal(po.rows[0].status, 'PAID');
    assert.equal(Number(po.rows[0].amount_reversed_cents), 0);
    const le = await db.pool.query(`SELECT count(*)::int c FROM ledger_entries`);
    assert.equal(le.rows[0].c, 1);
  });

  test('previously failing SQL shapes now work', async () => {
    const b = await seedBooking(db.pool, w, { status: 'EN_ROUTE' });
    await db.pool.query(`UPDATE payment_transactions SET status='DISCREPANCY_QUARANTINED', error_message='m', updated_at=NOW() WHERE id=$1`, [b.txId]);
    await db.pool.query(`UPDATE provider_payouts SET status='PENDING_PROVIDER_CONFIRMATION', updated_at=NOW() WHERE id=$1`, [payoutId]);
    await db.pool.query(`UPDATE provider_payouts SET status='PAID' WHERE id=$1`, [payoutId]);
    await db.pool.query(`UPDATE bookings SET customer_safety_pin=NULL WHERE id=$1`, [b.bookingId]);
    const ins = () => db.pool.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1,$2,'ESCROW_CAPTURE',$3,$4,100,'x') ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
      [w.tenantId, b.txId, w.accountIds['1020'], w.accountIds['2010']]);
    assert.equal((await ins()).rowCount, 1);
    assert.equal((await ins()).rowCount, 0, 'second identical posting is deduplicated');
    const ins2 = () => db.pool.query(
      `INSERT INTO ledger_entries (tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1,$2,'PAYOUT_REVERSAL',$3,$4,100,'x') ON CONFLICT (payout_id, posting_type) DO NOTHING`,
      [w.tenantId, payoutId, w.accountIds['1010'], w.accountIds['2020']]);
    assert.equal((await ins2()).rowCount, 1);
    assert.equal((await ins2()).rowCount, 0);
  });

  test('constraints reject invalid data', async () => {
    await assert.rejects(() => db.pool.query(`UPDATE provider_payouts SET amount_reversed_cents = 999999 WHERE id=$1`, [payoutId]), /check/i);
    await assert.rejects(() => db.pool.query(`UPDATE bookings SET customer_safety_pin='12' WHERE id=$1`, [hist.bookingId]), /check/i);
    await assert.rejects(() => db.pool.query(`UPDATE payment_transactions SET status='BOGUS' WHERE id=$1`, [hist.txId]), /check/i);
  });

  test('down REFUSES while guarded data exists (no silent audit loss)', async () => {
    await db.pool.query(`UPDATE provider_payouts SET status='PARTIALLY_REVERSED', amount_reversed_cents=100 WHERE id=$1`, [payoutId]);
    await db.pool.query(
      `INSERT INTO provider_payout_reversals (tenant_id, payout_id, stripe_event_id, delta_amount_cents, cumulative_reversed_cents)
       VALUES ($1,$2,'evt_1',100,100)`, [w.tenantId, payoutId]);
    await assert.rejects(() => applyMigrationFile(db.pool, DOWN, db.usesPostgisShim), /ROLLBACK ABORTED/);
    const still = await db.pool.query(`SELECT count(*)::int c FROM provider_payout_reversals`);
    assert.equal(still.rows[0].c, 1);
  });

  test('down succeeds after guarded data is removed, restores prior constraints, and up re-applies', async () => {
    await db.pool.query(`DELETE FROM provider_payout_reversals`);
    await db.pool.query(`UPDATE provider_payouts SET status='PAID', amount_reversed_cents=0`);
    await db.pool.query(`UPDATE payment_transactions SET status='REQUIRES_CAPTURE', error_message=NULL WHERE status='DISCREPANCY_QUARANTINED'`);
    await db.pool.query(`UPDATE bookings SET customer_safety_pin='9999' WHERE customer_safety_pin IS NULL`);
    await applyMigrationFile(db.pool, DOWN, db.usesPostgisShim);
    await assert.rejects(() => db.pool.query(`SELECT updated_at FROM provider_payouts`), /updated_at/);
    await assert.rejects(() => db.pool.query(`UPDATE provider_payouts SET status='REVERSED' WHERE id=$1`, [payoutId]), /check/i);
    await applyMigrationFile(db.pool, UP, db.usesPostgisShim); // re-runnable
    const o = await db.pool.query(`SELECT count(*)::int c FROM outbox_operations`);
    assert.equal(o.rows[0].c, 0);
  });
});
