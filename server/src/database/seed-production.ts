import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { AuthService } from '../modules/auth/auth.service.js';
import { migrateUp } from './migrate.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

/**
 * Clean Production Buyer Handover Seeder (`npm run seed:prod`).
 * ZERO fake customers, ZERO fake technicians, ZERO fake bookings.
 * Provisions only the buyer's clean UAE base tenant (AED, 5% VAT), double-entry
 * Chart of Accounts, CMS defaults, and one Super Admin account.
 */
export async function runProductionSeed(targetPool?: pg.Pool): Promise<{
  tenantId: string;
  adminUserId: string;
  adminEmail: string;
}> {
  const connectionString = process.env.DATABASE_URL;
  if (!targetPool && !connectionString) {
    throw new Error('DATABASE_URL must be configured to run seed:prod.');
  }

  const tenantName = (process.env.PROD_TENANT_NAME || 'ServiceOS UAE Operations').trim();
  const tenantSlug = (process.env.PROD_TENANT_SLUG || 'primary-uae').trim().toLowerCase();
  const currencyCode = (process.env.PROD_CURRENCY_CODE || 'AED').trim().toUpperCase();
  const currencySymbol = process.env.PROD_CURRENCY_SYMBOL || `${currencyCode} `;
  const timezone = process.env.PROD_TIMEZONE || 'Asia/Dubai';
  const taxRateBps = Number(process.env.PROD_TAX_RATE_BPS || '500');
  const taxName = (process.env.PROD_TAX_NAME || 'VAT').trim();
  const countryCode = (process.env.PROD_COUNTRY_CODE || 'AE').trim().toUpperCase();
  const distanceUnit = (process.env.PROD_DISTANCE_UNIT || 'km').trim().toLowerCase() === 'mi' ? 'mi' : 'km';
  const defaultLocale = (process.env.PROD_LOCALE || 'en').trim();
  const emergencyPhone = process.env.PROD_EMERGENCY_PHONE || null;
  const defaultMapLat = Number(process.env.PROD_MAP_LAT || '25.204800');
  const defaultMapLng = Number(process.env.PROD_MAP_LNG || '55.270800');
  const commissionBps = Number(process.env.PROD_COMMISSION_BPS || '1500');
  const adminEmail = (process.env.PROD_ADMIN_EMAIL || 'admin@yourdomain.ae').trim().toLowerCase();
  const adminPassword = process.env.PROD_ADMIN_PASSWORD || '';
  const adminFullName = (process.env.PROD_ADMIN_FULL_NAME || 'Platform Super Administrator').trim();

  if (adminPassword.length < 12) {
    throw new Error('PROD_ADMIN_PASSWORD must be set and at least 12 characters long for clean production seeding.');
  }

  const ownsPool = !targetPool;
  const db = targetPool || new pg.Pool({ connectionString });

  try {
    if (ownsPool) {
      await migrateUp(db);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
        [tenantSlug]
      );
      let tenantId: string;
      if (existing.rows.length > 0) {
        tenantId = existing.rows[0].id;
      } else {
        const tRes = await client.query<{ id: string }>(
          `INSERT INTO tenants (
            name, slug, primary_color, currency_code, currency_symbol, timezone,
            default_platform_commission_bps, default_tax_rate_bps, default_locale,
            country_code, tax_name, distance_unit, emergency_phone,
            default_map_lat, default_map_lng, is_active, installer_completed_at
          ) VALUES ($1, $2, '#6366F1', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, NOW())
          RETURNING id`,
          [
            tenantName,
            tenantSlug,
            currencyCode,
            currencySymbol,
            timezone,
            commissionBps,
            taxRateBps,
            defaultLocale,
            countryCode,
            taxName,
            distanceUnit,
            emergencyPhone,
            defaultMapLat,
            defaultMapLng,
          ]
        );
        tenantId = tRes.rows[0].id;
      }

      // Bind transaction-local FORCE RLS tenant context before touching tenant-owned tables
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Clean Chart of Accounts
      const coa = [
        ['1010', `Operating Cash Clearing (${currencyCode})`, 'ASSET'],
        ['1020', 'Payment Gateway Escrow Clearing', 'ASSET'],
        ['2010', 'Customer Escrow Deposits Liability', 'LIABILITY'],
        ['2020', 'Technician Unpaid Payables', 'LIABILITY'],
        ['2030', 'Tax / VAT / GST Payable', 'LIABILITY'],
        ['4010', 'Platform Commission Revenue', 'REVENUE'],
        ['5010', 'Payment Processing Expense', 'EXPENSE'],
      ];
      for (const [no, name, type] of coa) {
        await client.query(
          `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, account_number) DO NOTHING`,
          [tenantId, no, name, type, currencyCode]
        );
      }

      await client.query(
        `INSERT INTO tenant_cms_configs (tenant_id, hero_heading, hero_subheading, search_placeholder)
         VALUES ($1, $2, $3, 'Search home services...')
         ON CONFLICT (tenant_id) DO NOTHING`,
        [
          tenantId,
          `${tenantName} — Your Service, Our Priority`,
          `Book certified home service professionals with upfront ${currencyCode} pricing and ${(taxRateBps / 100).toFixed(2)}% ${taxName} invoicing.`,
        ]
      );

      const passwordHash = await AuthService.hashPassword(adminPassword);
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, password_hash, role, is_active, is_verified)
         VALUES ($1, $2, $3, 'ADMIN', TRUE, TRUE)
         ON CONFLICT (tenant_id, email) DO UPDATE SET is_active = TRUE
         RETURNING id`,
        [tenantId, adminEmail, passwordHash]
      );
      const adminUserId = userRes.rows[0].id;

      await client.query(
        `INSERT INTO admin_profiles (user_id, tenant_id, full_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [adminUserId, tenantId, adminFullName]
      );

      await client.query('COMMIT');
      console.log(`✅ [seed:prod] Clean production tenant initialized (ZERO demo records).`);
      console.log(`   Tenant: ${tenantName} (${currencyCode}, ${(taxRateBps / 100).toFixed(2)}% VAT, ${timezone})`);
      console.log(`   Super Admin: ${adminEmail}`);
      return { tenantId, adminUserId, adminEmail };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    if (ownsPool) {
      await db.end();
    }
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes('seed-production');
if (isDirectRun) {
  runProductionSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [seed:prod] Failed:', err);
      process.exit(1);
    });
}
