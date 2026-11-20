import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment configuration
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/servicepro_os',
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('localhost') 
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true } 
    : false,
});

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
