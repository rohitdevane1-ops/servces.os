/**
 * Real-PostgreSQL test harness.
 *
 * Starts a throw-away PostgreSQL (via `embedded-postgres`) and applies the real
 * migrations from src/database/migrations. If the server has no PostGIS extension
 * (embedded builds do not ship it), a minimal shim is installed so the geography
 * columns/ST_* calls used by the routes still execute. In CI (postgis/postgis:16)
 * set TEST_DATABASE_URL to use the real image with the real extension instead.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/database/migrations');

export interface TestDb {
  pool: pg.Pool;
  url: string;
  usesPostgisShim: boolean;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export function listMigrations(kind: 'up' | 'down'): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && (kind === 'down' ? f.endsWith('.down.sql') : !f.endsWith('.down.sql')))
    .sort();
}

const POSTGIS_SHIM = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
    CREATE DOMAIN geography AS text;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION st_makepoint(double precision, double precision) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT 'POINT(' || $1 || ' ' || $2 || ')' $$;
CREATE OR REPLACE FUNCTION st_setsrid(text, integer) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
`;

/** Adapt PostGIS-specific DDL when only the shim is available. */
export function adaptSql(sql: string, shim: boolean): string {
  if (!shim) return sql;
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS "postgis";?/gi, '')
    .replace(/GEOGRAPHY\s*\(\s*Point\s*,\s*4326\s*\)/gi, 'geography')
    .replace(/GEOMETRY\s*\(\s*Point\s*,\s*4326\s*\)/gi, 'geography')
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX[^;]*USING\s+GIST[^;]*;/gi, '');
}

export async function applyMigrationFile(
  pool: pg.Pool,
  file: string,
  shim: boolean
): Promise<void> {
  const sql = adaptSql(
    fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/^\uFEFF/, ''),
    shim
  );
  await pool.query(sql);
}

export async function applyMigrations(
  pool: pg.Pool,
  shim: boolean,
  upTo?: string
): Promise<void> {
  for (const f of listMigrations('up')) {
    if (upTo && f > upTo) break;
    await applyMigrationFile(pool, f, shim);
  }
}

export async function startTestDb(opts: { migrateUpTo?: string | null } = {}): Promise<TestDb> {
  const external = process.env.TEST_DATABASE_URL;
  let stopFn: () => Promise<void> = async () => {};
  let url: string;

  if (external) {
    const adminPool = new pg.Pool({ connectionString: external, max: 2 });
    const dbName = `srv_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
    const u = new URL(external);
    u.pathname = `/${dbName}`;
    url = u.toString();
    stopFn = async () => {
      await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await adminPool.end();
    };
  } else {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const port = await freePort();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serviceos-pg-'));
    const server = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await server.initialise();
    await server.start();
    await server.createDatabase('serviceos_test');
    url = `postgresql://postgres:postgres@127.0.0.1:${port}/serviceos_test`;
    stopFn = async () => {
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    };
  }

  const pool = new pg.Pool({ connectionString: url, max: 10 });

  const ext = await pool.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'`);
  const usesPostgisShim = ext.rowCount === 0;
  if (usesPostgisShim) await pool.query(POSTGIS_SHIM);

  if (opts.migrateUpTo !== null) {
    await applyMigrations(pool, usesPostgisShim, opts.migrateUpTo ?? undefined);
  }

  return {
    pool,
    url,
    usesPostgisShim,
    stop: async () => {
      await pool.end();
      await stopFn();
    },
  };
}

/** Insert a tenant + chart of accounts + users used by finance/booking tests. */
export async function seedTenant(pool: pg.Pool, slug = 'acme') {
  const t = await pool.query(
    `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
    [`Tenant ${slug}`, slug]
  );
  const tenantId = t.rows[0].id as string;
  const accounts = [
    ['1010', 'Operating Cash Clearing', 'ASSET'],
    ['1020', 'Stripe Holding Escrow Clearing', 'ASSET'],
    ['2010', 'Customer Escrow Deposits Liability', 'LIABILITY'],
    ['2020', 'Technician Unpaid Payables', 'LIABILITY'],
    ['4010', 'Platform Commission Revenue', 'REVENUE'],
    ['5010', 'Stripe Merchant Processing Expense', 'EXPENSE'],
  ];
  const ids: Record<string, string> = {};
  for (const [no, name, type] of accounts) {
    const r = await pool.query(
      `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [tenantId, no, name, type]
    );
    ids[no] = r.rows[0].id;
  }
  return { tenantId, accountIds: ids };
}

/** Full fixture: customer, technician, service, address, booking, invoice, pending/authorized payment tx. */
export async function seedWorld(pool: pg.Pool, slug = 'acme') {
  const { tenantId, accountIds } = await seedTenant(pool, slug);
  const mkUser = async (email: string, role: string) =>
    (await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, is_verified) VALUES ($1,$2,'x',$3,TRUE) RETURNING id`,
      [tenantId, email, role]
    )).rows[0].id as string;

  const customerId = await mkUser(`cust@${slug}.test`, 'CUSTOMER');
  const techId = await mkUser(`tech@${slug}.test`, 'TECHNICIAN');
  const adminId = await mkUser(`admin@${slug}.test`, 'ADMIN');
  await pool.query(`INSERT INTO admin_profiles (user_id, tenant_id, full_name) VALUES ($1,$2,'Admin')`, [adminId, tenantId]);
  await pool.query(`INSERT INTO customer_profiles (user_id, tenant_id, full_name) VALUES ($1,$2,'Cust')`, [customerId, tenantId]);
  await pool.query(
    `INSERT INTO provider_profiles (user_id, tenant_id, full_name, trade_category, stripe_connect_account_id, stripe_payouts_enabled)
     VALUES ($1,$2,'Tech','PLUMBING','acct_test_1',TRUE)`, [techId, tenantId]);
  const cat = (await pool.query(
    `INSERT INTO service_categories (tenant_id, name, slug) VALUES ($1,'Plumbing','plumbing') RETURNING id`, [tenantId])).rows[0].id;
  const serviceId = (await pool.query(
    `INSERT INTO services (tenant_id, category_id, name, slug, base_price_cents) VALUES ($1,$2,'Leak fix','leak-fix',10000) RETURNING id`,
    [tenantId, cat])).rows[0].id as string;
  return { tenantId, accountIds, customerId, techId, adminId, serviceId };
}

let seq = 0;
export async function seedBooking(
  pool: pg.Pool,
  w: Awaited<ReturnType<typeof seedWorld>>,
  o: { status?: string; txStatus?: string; piId?: string | null; totalCents?: number; pin?: string | null } = {}
) {
  seq += 1;
  const total = o.totalCents ?? 12000;
  const addr = (await pool.query(
    `INSERT INTO customer_addresses (customer_id, tenant_id, address_line1, city, state_province, postal_code, location)
     VALUES ($1,$2,'1 Main','Town','ST','12345', ST_SetSRID(ST_MakePoint(0,0),4326)::geography) RETURNING id`,
    [w.customerId, w.tenantId])).rows[0].id;
  const b = (await pool.query(
    `INSERT INTO bookings (tenant_id, booking_reference, customer_id, service_id, address_id, status, scheduled_start, customer_safety_pin, assigned_provider_id)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8) RETURNING id`,
    [w.tenantId, `SVC-T${seq}-${Date.now()}`, w.customerId, w.serviceId, addr, o.status ?? 'REQUESTED', o.pin === undefined ? '1234' : o.pin,
     o.status && o.status !== 'REQUESTED' ? w.techId : null])).rows[0].id as string;
  const inv = (await pool.query(
    `INSERT INTO invoices (tenant_id, booking_id, invoice_number, labor_subtotal_cents, diagnostic_fee_cents, total_amount_cents, status)
     VALUES ($1,$2,$3,$4,2000,$5,'DRAFT') RETURNING id`,
    [w.tenantId, b, `INV-${seq}-${Date.now()}`, total - 2000, total])).rows[0].id as string;
  const piId = o.piId === undefined ? `pi_test_${seq}_${Date.now()}` : o.piId;
  const tx = (await pool.query(
    `INSERT INTO payment_transactions (tenant_id, invoice_id, stripe_payment_intent_id, idempotency_key, authorized_amount_cents, transaction_type, status)
     VALUES ($1,$2,$3,$4,$5,'PRE_AUTH',$6) RETURNING id`,
    [w.tenantId, inv, piId, `idem_${b}`, total, o.txStatus ?? 'REQUIRES_CAPTURE'])).rows[0].id as string;
  return { bookingId: b, invoiceId: inv, txId: tx, piId, totalCents: total };
}
