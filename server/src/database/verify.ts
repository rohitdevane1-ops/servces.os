import { pool, withTenantTransaction } from './pool.js';
import { isDemoModeEnabled } from '../middleware/demoGuard.js';

export async function verifyDatabaseSchema(): Promise<{
  success: boolean;
  errors: string[];
  tablesFound: string[];
  extensions: string[];
  mode?: 'DEMO_SANDBOX' | 'CLEAN_PRODUCTION';
}> {
  const errors: string[] = [];
  const requiredTables = [
    'tenants',
    'users',
    'user_sessions',
    'user_mfa_credentials',
    'password_reset_tokens',
    'permissions',
    'role_permissions',
    'admin_profiles',
    'staff_profiles',
    'customer_profiles',
    'provider_profiles',
    'provider_locations',
    'provider_shifts',
    'customer_addresses',
    'service_categories',
    'services',
    'service_pricing_tiers',
    'bookings',
    'dispatch_broadcasts',
    'booking_timeline_events',
    'work_order_proofs',
    'invoices',
    'invoice_items',
    'payment_transactions',
    'payment_refunds',
    'webhook_events',
    'ledger_accounts',
    'ledger_entries',
    'provider_payouts',
    'provider_payout_reversals',
    'outbox_operations',
    'support_tickets',
    'ticket_messages',
    'customer_reviews',
    'notification_logs',
    'audit_logs',
    'tenant_cms_configs',
    'integration_configs',
    'installer_provision_logs'
  ];

  try {
    // 1. Verify Extensions
    const extRes = await pool.query<{ extname: string }>(
      'SELECT extname FROM pg_extension WHERE extname IN (\'postgis\', \'uuid-ossp\')'
    );
    const extensions = extRes.rows.map(r => r.extname);
    if (!extensions.includes('uuid-ossp')) {
      errors.push('Extension uuid-ossp is not installed');
    }
    if (!extensions.includes('postgis')) {
      errors.push('Extension postgis is not installed');
    }

    // 2. Verify Tables
    const tableRes = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tablesFound = tableRes.rows.map(r => r.table_name);

    for (const table of requiredTables) {
      if (!tablesFound.includes(table)) {
        errors.push(`Required database table missing: public.${table}`);
      }
    }

    // 3. Verify Spatial Index
    const indexRes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes 
       WHERE tablename = 'provider_locations' AND indexname = 'idx_provider_locations_gist'`
    );
    if (indexRes.rows.length === 0) {
      errors.push('Spatial index idx_provider_locations_gist missing on provider_locations');
    }

    // 4. Verify Tenant-Scoped Records under FORCE ROW LEVEL SECURITY & Dual-DB Mode
    const mode = isDemoModeEnabled() ? 'DEMO_SANDBOX' : 'CLEAN_PRODUCTION';
    if (tablesFound.includes('tenants') && tablesFound.includes('users')) {
      const tenantsRes = await pool.query<{ id: string; name: string; slug: string }>(
        'SELECT id, name, slug FROM tenants ORDER BY created_at ASC'
      );
      let totalUsers = 0;
      for (const t of tenantsRes.rows) {
        const count = await withTenantTransaction(t.id, async (client) => {
          const userCountRes = await client.query<{ count: string }>('SELECT COUNT(*) as count FROM users');
          return parseInt(userCountRes.rows[0]?.count || '0', 10);
        });
        totalUsers += count;
      }
      console.log(
        `[Database Mode: ${mode}] Verified ${tenantsRes.rows.length} tenant(s) and ${totalUsers} total user account(s) under FORCE RLS.`
      );
    }

    return {
      success: errors.length === 0,
      errors,
      tablesFound,
      extensions,
      mode
    };
  } catch (err: any) {
    return {
      success: false,
      errors: [err.message || 'Database connection error'],
      tablesFound: [],
      extensions: []
    };
  }
}

if (process.argv[1] && /verify\.(ts|js)$/.test(process.argv[1])) {
  (async () => {
    console.log('Running Database Schema Verification...');
    const result = await verifyDatabaseSchema();
    if (result.success) {
      console.log('✓ Database verification passed! All tables and PostGIS spatial extensions confirmed.');
      await pool.end();
      process.exit(0);
    } else {
      console.error('✗ Database verification failed with errors:');
      result.errors.forEach(e => console.error(`  - ${e}`));
      await pool.end();
      process.exit(1);
    }
  })();
}
