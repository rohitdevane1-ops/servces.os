import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { AsyncLocalStorage } from 'node:async_hooks';

// Load environment configuration
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const { Pool } = pg;

export interface TenantContextStore {
  tenantId?: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContextStore>();

export function getActiveTenantId(): string | undefined {
  return tenantContextStorage.getStore()?.tenantId;
}

export function setActiveTenantId(tenantId?: string): void {
  const store = tenantContextStorage.getStore();
  if (store && tenantId) {
    store.tenantId = tenantId;
  }
}

export function runWithTenantContext<T>(
  tenantId: string | undefined,
  fn: () => T
): T {
  return tenantContextStorage.run({ tenantId }, fn);
}

export function isLocalDbHost(connectionString?: string): boolean {
  if (!connectionString) return true;
  try {
    const parsed = new URL(connectionString);
    return [
      'localhost',
      '127.0.0.1',
      '::1',
      '[::1]',
      'postgres',
      'postgres_demo',
    ].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function resolveSslConfig(connectionString?: string): boolean | { rejectUnauthorized: boolean } {
  const dbSsl = process.env.DB_SSL?.toLowerCase();
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

  if (dbSsl === 'false' || dbSsl === 'disable' || dbSsl === '0') {
    return false;
  }
  if (dbSsl === 'true' || dbSsl === 'require' || dbSsl === '1') {
    return { rejectUnauthorized };
  }
  if (process.env.NODE_ENV === 'production' && !isLocalDbHost(connectionString)) {
    return { rejectUnauthorized };
  }
  return false;
}

const rawPoolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
const safePoolMax = Number.isFinite(rawPoolMax) && rawPoolMax > 0 ? rawPoolMax : 20;

const effectiveDatabaseUrl =
  process.env.APP_DEMO_MODE === 'true' && process.env.DEMO_DATABASE_URL
    ? process.env.DEMO_DATABASE_URL
    : process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'production' && !effectiveDatabaseUrl) {
  throw new Error('[Database Error] DATABASE_URL must be configured in production.');
}

export const pool = new Pool({
  connectionString: effectiveDatabaseUrl || 'postgresql://postgres:postgres@localhost:5432/servicepro_os',
  max: safePoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  ssl: resolveSslConfig(effectiveDatabaseUrl),
});

/**
 * Execute a callback inside a PostgreSQL transaction with `app.current_tenant_id`
 * bound via `set_config(..., true)` so fail-closed FORCE RLS enforces tenant isolation.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
  targetPool: pg.Pool = pool
): Promise<T> {
  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function tenantQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
  explicitTenantId?: string,
  targetPool: pg.Pool = pool
): Promise<pg.QueryResult<T>> {
  const tenantId = explicitTenantId ?? getActiveTenantId();
  if (!tenantId) {
    return targetPool.query<T>(text, params);
  }
  return withTenantTransaction<pg.QueryResult<T>>(
    tenantId,
    (client) => client.query<T>(text, params),
    targetPool
  );
}

export async function connectTenant(
  explicitTenantId?: string,
  targetPool: pg.Pool = pool
): Promise<pg.PoolClient> {
  const tenantId = explicitTenantId ?? getActiveTenantId();
  const client = await targetPool.connect();
  if (tenantId) {
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
    } catch (err) {
      client.release();
      throw err;
    }
    const origRelease = client.release.bind(client);
    let released = false;
    client.release = ((err?: Error | boolean) => {
      if (released) return;
      released = true;
      if (err) {
        origRelease(err as any);
        return;
      }
      Promise.resolve(client.query(`SELECT set_config('app.current_tenant_id', '', false)`))
        .then(() => origRelease())
        .catch(() => origRelease(true));
    }) as typeof client.release;
  }
  return client;
}

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[SQL Query]', { text: text.substring(0, 100), duration, rows: res.rowCount });
  }
  return res;
}
