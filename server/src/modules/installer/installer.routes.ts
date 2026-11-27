import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { migrateUp } from '../../database/migrate.js';
import { AuthService } from '../auth/auth.service.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { env } from '../../config/env.js';
import { blockInDemoMode, isDemoModeEnabled } from '../../middleware/demoGuard.js';

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const provisionSchema = z.object({
  provisioningToken: z.string().min(8).optional(),
  bootstrapToken: z.string().min(8).optional(),
  companyName: z.string().min(2).max(255).optional(),
  tenantName: z.string().min(2).max(255).optional(),
  subdomain: z.string().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(100),
  adminFullName: z.string().min(2).max(255),
  currencyCode: z.string().length(3).default('USD'),
  currencySymbol: z.string().min(1).max(5).default('$'),
  timezone: z.string().default('UTC'),
  countryCode: z.string().regex(/^[A-Z]{2}$/i).default('AE'),
  taxName: z.string().min(1).max(40).default('VAT'),
  defaultTaxRateBps: z.number().int().min(0).max(10000).default(500),
  distanceUnit: z.enum(['km', 'mi']).default('km'),
  defaultLocale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('en'),
  emergencyPhone: z.string().max(40).optional(),
  defaultMapLat: z.number().min(-90).max(90).default(25.2048),
  defaultMapLng: z.number().min(-180).max(180).default(55.2708),
  platformCommissionPercent: z.number().min(0).max(100).optional(),
  defaultPlatformCommissionBps: z.number().min(0).max(10000).optional(),
  primaryBrandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
});

export async function installerRoutes(fastify: FastifyInstance) {
  // 0. Check Installer Provisioning Status
  fastify.get('/status', {
    schema: {
      tags: ['Turnkey Installer'],
      summary: 'Check whether the platform is already provisioned and whether Demo Sandbox mode is active',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    try {
      const res = await pool.query(
        `SELECT id, name, slug, currency_code, currency_symbol, default_tax_rate_bps, tax_name, country_code, installer_completed_at
         FROM tenants
         WHERE is_active = TRUE
         ORDER BY created_at ASC
         LIMIT 1`
      );
      const row = res.rows[0];
      let migrations: Array<{ id: number; filename: string; appliedAt: string }> = [];
      try {
        const migRes = await pool.query<{ id: number; filename: string; applied_at: Date }>(
          'SELECT id, filename, applied_at FROM _schema_migrations ORDER BY id ASC'
        );
        migrations = migRes.rows.map((m) => ({
          id: Number(m.id),
          filename: m.filename,
          appliedAt: m.applied_at instanceof Date ? m.applied_at.toISOString() : String(m.applied_at),
        }));
      } catch {
        migrations = [];
      }
      return reply.status(200).send(
        successResponse({
          provisioned: Boolean(row),
          installerLocked: Boolean(row?.installer_completed_at),
          demoMode: isDemoModeEnabled(),
          migrations,
          tenant: row
            ? {
                id: row.id,
                name: row.name,
                slug: row.slug,
                currencyCode: row.currency_code,
                currencySymbol: row.currency_symbol,
                taxRateBps: Number(row.default_tax_rate_bps ?? 500),
                taxName: row.tax_name || 'VAT',
                countryCode: row.country_code || 'AE',
              }
            : null,
        }, requestId)
      );
    } catch {
      return reply.status(200).send(
        successResponse({
          provisioned: false,
          installerLocked: false,
          demoMode: isDemoModeEnabled(),
          migrations: [],
          tenant: null,
        }, requestId)
      );
    }
  });

  // 1. Test Database Connectivity
  fastify.post('/test-db', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags: ['Turnkey Installer'],
      summary: 'Test PostgreSQL and PostGIS connectivity during setup',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    
    try {
      // Lock /test-db once provisioning has completed
      try {
        const installedCheck = await pool.query(
          'SELECT id FROM tenants WHERE installer_completed_at IS NOT NULL LIMIT 1'
        );
        if (installedCheck.rows.length > 0) {
          return reply.status(403).send(
            errorResponse('INSTALLER_LOCKED', 'System is already provisioned; installer diagnostics are locked.', requestId)
          );
        }
      } catch {
        // tenants table does not exist yet on a brand-new database — allow connectivity check
      }

      const res = await pool.query('SELECT NOW() as now');
      return reply.status(200).send(
        successResponse({
          connected: true,
          serverTime: res.rows[0].now
        }, requestId)
      );
    } catch (err: any) {
      return reply.status(500).send(
        errorResponse('DATABASE_CONNECTION_ERROR', 'Could not connect to PostgreSQL', requestId)
      );
    }
  });

  // 2. Turnkey Setup Wizard & First Administrator Provisioning
  fastify.post('/provision', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [blockInDemoMode('Turnkey installation provisioning')],
    schema: {
      tags: ['Turnkey Installer'],
      summary: 'One-time initial system provisioning and master admin setup',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const parsed = provisionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Invalid provisioning payload parameters.', requestId)
      );
    }

    const data = parsed.data;
    const effectiveCompanyName = data.companyName || data.tenantName || 'ServicePro Org';
    const effectiveToken = request.headers['x-bootstrap-token'] as string || data.bootstrapToken || data.provisioningToken;

    // A. Verify Provisioning Token (constant-time)
    if (!effectiveToken || !constantTimeEquals(effectiveToken, env.INITIAL_ADMIN_BOOTSTRAP_SECRET)) {
      return reply.status(401).send(
        errorResponse('INVALID_BOOTSTRAP_TOKEN', 'The provided setup authorization token is invalid.', requestId)
      );
    }

    // B. Execute Database Migrations FIRST so tables exist on clean databases
    try {
      await migrateUp();
    } catch (migErr: any) {
      request.log.error(migErr);
      return reply.status(500).send(
        errorResponse('MIGRATION_ERROR', `Failed applying database migrations: ${migErr.message}`, requestId)
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(84729105)');

      // C. Security Guard (inside transaction): Prevent Re-provisioning if already completed
      const existingInstalled = await client.query(
        'SELECT id FROM tenants WHERE installer_completed_at IS NOT NULL LIMIT 1'
      );
      if (existingInstalled.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.status(403).send(
          errorResponse('INSTALLER_LOCKED', 'This system has already been provisioned and is permanently locked.', requestId)
        );
      }

      const rawSlug = (data.subdomain || effectiveCompanyName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      const slug = rawSlug || `tenant-${crypto.randomBytes(4).toString('hex')}`;
      const commissionBps = data.defaultPlatformCommissionBps !== undefined
        ? data.defaultPlatformCommissionBps
        : Math.round((data.platformCommissionPercent ?? 15) * 100);

      // D. Create Buyer Organization / Tenant
      const tenantRes = await client.query(
        `INSERT INTO tenants (
          name, slug, primary_color, currency_code, currency_symbol, timezone,
          default_platform_commission_bps, default_tax_rate_bps,
          country_code, tax_name, distance_unit, default_locale,
          emergency_phone, default_map_lat, default_map_lng,
          is_active, installer_completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        RETURNING id`,
        [
          effectiveCompanyName,
          slug,
          data.primaryBrandColor,
          data.currencyCode.toUpperCase(),
          data.currencySymbol,
          data.timezone,
          commissionBps,
          data.defaultTaxRateBps,
          data.countryCode.toUpperCase(),
          data.taxName,
          data.distanceUnit,
          data.defaultLocale,
          data.emergencyPhone ?? null,
          data.defaultMapLat,
          data.defaultMapLng,
          true
        ]
      );
      const tenantId = tenantRes.rows[0].id;

      // Bind transaction-local FORCE RLS tenant context before tenant-child inserts
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // E. Create First Master Administrator
      const passwordHash = await AuthService.hashPassword(data.adminPassword);
      const userRes = await client.query(
        `INSERT INTO users (
          tenant_id, email, password_hash, role, is_active, is_verified
        ) VALUES ($1, $2, $3, 'ADMIN', TRUE, TRUE)
        RETURNING id`,
        [tenantId, data.adminEmail.toLowerCase().trim(), passwordHash]
      );
      const adminUserId = userRes.rows[0].id;

      // F. Create Admin Profile
      await client.query(
        `INSERT INTO admin_profiles (user_id, tenant_id, full_name)
         VALUES ($1, $2, $3)`,
        [adminUserId, tenantId, data.adminFullName]
      );

      // G. Initialize Chart of Accounts for Tenant
      const defaultAccounts = [
        { no: '1010', name: 'Operating Cash Clearing', type: 'ASSET' },
        { no: '1020', name: 'Stripe Holding Escrow Clearing', type: 'ASSET' },
        { no: '2010', name: 'Customer Escrow Deposits Liability', type: 'LIABILITY' },
        { no: '2020', name: 'Technician Unpaid Payables', type: 'LIABILITY' },
        { no: '2030', name: 'Tax / VAT / GST Payable', type: 'LIABILITY' },
        { no: '4010', name: 'Platform Commission Revenue', type: 'REVENUE' },
        { no: '5010', name: 'Stripe Merchant Processing Expense', type: 'EXPENSE' },
        { no: '5020', name: 'Promotional Bonus & Incentive Expense', type: 'EXPENSE' },
      ];

      for (const acc of defaultAccounts) {
        await client.query(
          `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, acc.no, acc.name, acc.type, data.currencyCode.toUpperCase()]
        );
      }

      // H. Initialize Dynamic CMS Config
      await client.query(
        `INSERT INTO tenant_cms_configs (tenant_id, hero_heading, hero_subheading, search_placeholder)
         VALUES ($1, $2, $3, $4)`,
        [
          tenantId,
          `${effectiveCompanyName} — Your Service, Our Priority`,
          `Book certified, on-demand home service professionals with upfront pricing and escrow guarantee.`,
          `Search services from ${effectiveCompanyName}...`
        ]
      );

      // I. Record Permanent Provisioning Audit Log
      await client.query(
        `INSERT INTO installer_provision_logs (tenant_id, provisioned_admin_email, client_ip, environment_signature)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, data.adminEmail, request.ip, process.platform]
      );

      await client.query('COMMIT');

      // J. Issue Administrator Tokens
      const accessToken = AuthService.generateAccessToken({
        id: adminUserId,
        role: 'ADMIN',
        tenantId,
        email: data.adminEmail,
      });

      const refreshToken = await AuthService.createSession(adminUserId, tenantId, request.ip, request.headers['user-agent']);

      reply.setCookie('refresh_token', refreshToken, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      });

      return reply.status(201).send(
        successResponse({
          provisioned: true,
          tenant: {
            id: tenantId,
            name: effectiveCompanyName,
            slug,
            currencyCode: data.currencyCode,
            currencySymbol: data.currencySymbol
          },
          admin: {
            id: adminUserId,
            email: data.adminEmail,
            fullName: data.adminFullName,
            role: 'ADMIN'
          },
          accessToken
        }, requestId)
      );
    } catch (err: any) {
      await client.query('ROLLBACK');
      request.log.error(err);
      return reply.status(500).send(
        errorResponse(
          'PROVISIONING_FAILED',
          process.env.NODE_ENV === 'production' ? 'Provisioning workflow failed' : (err.message || 'Provisioning workflow failed'),
          requestId
        )
      );
    } finally {
      client.release();
    }
  });
}
