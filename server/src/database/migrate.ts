import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type pg from 'pg';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distMigrationsDir = path.resolve(__dirname, 'migrations');
const srcMigrationsDir = path.resolve(__dirname, '../../src/database/migrations');
const MIGRATIONS_DIR = fs.existsSync(distMigrationsDir) ? distMigrationsDir : srcMigrationsDir;

async function ensureMigrationTable(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<string[]> {
  await ensureMigrationTable(client);
  const res = await client.query<{ name: string }>(
    'SELECT name FROM _schema_migrations ORDER BY id ASC'
  );
  return res.rows.map(r => r.name);
}

const MIGRATION_ADVISORY_LOCK_KEY = 84729104;

export async function migrateUp(targetPool: pg.Pool = pool): Promise<void> {
  const client = await targetPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      const applied = await getAppliedMigrations(client);
      
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort();

      const pending = files.filter(f => !applied.includes(f));

      if (pending.length === 0) {
        console.log('✓ Database schema is already up to date. (0 pending migrations)');
        return;
      }

      console.log(`Executing ${pending.length} pending database migration(s)...`);

      for (const file of pending) {
        const filePath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query('BEGIN');
        try {
          console.log(`  Applying: ${file}...`);
          await client.query(sql);
          await client.query(
            'INSERT INTO _schema_migrations (name) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`  ✓ Applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ✗ Error in migration ${file}:`, err);
          throw err;
        }
      }

      console.log('✓ All migrations applied successfully.');
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export async function migrateDown(targetPool: pg.Pool = pool): Promise<void> {
  const client = await targetPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      const applied = await getAppliedMigrations(client);

      if (applied.length === 0) {
        console.log('No applied migrations to rollback.');
        return;
      }

      const lastMigration = applied[applied.length - 1];
      const downFile = lastMigration.replace(/\.sql$/, '.down.sql');
      const downPath = path.join(MIGRATIONS_DIR, downFile);

      if (!fs.existsSync(downPath)) {
        throw new Error(`Rollback file not found: ${downFile}`);
      }

      console.log(`Rolling back: ${lastMigration} using ${downFile}...`);
      const sql = fs.readFileSync(downPath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('DELETE FROM _schema_migrations WHERE name = $1', [lastMigration]);
        await client.query('COMMIT');
        console.log(`✓ Rolled back: ${lastMigration}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ Error rolling back ${lastMigration}:`, err);
        throw err;
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

// CLI Execution entry point
const command = process.argv[2] || 'up';

if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  (async () => {
    try {
      if (command === 'down') {
        await migrateDown();
      } else {
        await migrateUp();
      }
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error('Migration failed:', err);
      await pool.end().catch(() => {});
      process.exit(1);
    }
  })();
}
