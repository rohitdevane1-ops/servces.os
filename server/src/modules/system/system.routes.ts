import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { env } from '../../config/env.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { blockInDemoMode, isDemoModeEnabled } from '../../middleware/demoGuard.js';
import { getPaymentGateway } from '../../services/paymentGateway.js';
import { AuthService } from '../auth/auth.service.js';
import { safeMediaUrlSchema } from '../../utils/urlValidator.js';

const SYSTEM_CONFIG_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TENANT_BRAND_COLS = `name, slug, primary_color, currency_code, currency_symbol, timezone,
  default_platform_commission_bps, COALESCE(default_tax_rate_bps, 500) AS default_tax_rate_bps,
  COALESCE(tax_name, 'VAT') AS tax_name,
  COALESCE(country_code, 'AE') AS country_code,
  COALESCE(distance_unit, 'km') AS distance_unit,
  support_phone, support_whatsapp, emergency_phone,
  COALESCE(logo_url, brand_logo_url) AS logo_url,
  COALESCE(default_locale, 'en') AS default_locale,
  COALESCE(default_map_lat, 25.204800) AS default_map_lat,
  COALESCE(default_map_lng, 55.270800) AS default_map_lng`;

function formatTenantBrand(r: any) {
  return {
    name: r.name,
    slug: r.slug,
    primaryColor: r.primary_color,
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    timezone: r.timezone,
    commissionBps: Number(r.default_platform_commission_bps),
    taxRateBps: Number(r.default_tax_rate_bps),
    vatPercent: Number(r.default_tax_rate_bps) / 100,
    taxName: r.tax_name || 'VAT',
    countryCode: r.country_code || 'AE',
    distanceUnit: r.distance_unit === 'mi' ? 'mi' : 'km',
    supportPhone: r.support_phone,
    supportWhatsapp: r.support_whatsapp,
    emergencyPhone: r.emergency_phone ?? null,
    logoUrl: r.logo_url ?? null,
    defaultLocale: r.default_locale || 'en',
    defaultMapLat: Number(r.default_map_lat ?? 25.2048),
    defaultMapLng: Number(r.default_map_lng ?? 55.2708),
  };
}

function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}

function buildMaskedSecrets(encryptedSecrets: Record<string, any>): Record<string, any> {
  const masked: Record<string, any> = {};
  if (!encryptedSecrets || typeof encryptedSecrets !== 'object') return masked;

  for (const [provider, val] of Object.entries(encryptedSecrets)) {
    if (typeof val === 'string') {
      try {
        masked[provider] = maskSecret(AuthService.decryptSecret(val));
      } catch {
        masked[provider] = '••••';
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sub: Record<string, string> = {};
      for (const [k, cipher] of Object.entries(val)) {
        if (typeof cipher === 'string') {
          try {
            sub[k] = maskSecret(AuthService.decryptSecret(cipher));
          } catch {
            sub[k] = '••••';
          }
        }
      }
      masked[provider] = sub;
    }
  }
  return masked;
}

const updateSystemConfigSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  currencyCode: z.string().trim().length(3).transform((s) => s.toUpperCase()).optional(),
  currencySymbol: z.string().trim().min(1).max(10).optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  commissionBps: z.number().int().min(0).max(5000).optional(),
  taxRateBps: z.number().int().min(0).max(5000).optional(),
  taxName: z.string().trim().min(1).max(40).optional(),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).optional(),
  distanceUnit: z.enum(['km', 'mi']).optional(),
  supportPhone: z.string().trim().max(50).nullable().optional(),
  supportWhatsapp: z.string().trim().max(50).nullable().optional(),
  emergencyPhone: z.string().trim().max(40).nullable().optional(),
  logoUrl: safeMediaUrlSchema.nullable().optional(),
  defaultLocale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  defaultMapLat: z.number().min(-90).max(90).optional(),
  defaultMapLng: z.number().min(-180).max(180).optional(),
  pricingConfig: z.object({
    surgeMultiplier: z.number().min(0.5).max(10).optional(),
    minCalloutFee: z.number().min(0).max(100000).optional(),
    nightSurcharge: z.number().min(0).max(100000).optional(),
    surgeActive: z.boolean().optional(),
  }).optional(),
  publicSettings: z.record(z.string().max(100), z.unknown()).optional(),
});

const secretEntrySchema = z.union([
  z.string().min(1).max(4096),
  z.record(z.string().max(100), z.union([z.string().min(1).max(4096), z.null()])),
  z.null(),
]);

const updateIntegrationsSchema = z.object({
  stripeAccountId: z.string().trim().max(100).nullable().optional(),
  stripeLiveMode: z.boolean().optional(),
  twilioEnabled: z.boolean().optional(),
  awsSesEnabled: z.boolean().optional(),
  fcmPushEnabled: z.boolean().optional(),
  publicSettings: z.record(z.string().max(100), z.unknown()).optional(),
  secrets: z.object({
    stripe: secretEntrySchema.optional(),
    paytabs: secretEntrySchema.optional(),
    telr: secretEntrySchema.optional(),
    twilio: secretEntrySchema.optional(),
    smtp: secretEntrySchema.optional(),
    fcm: secretEntrySchema.optional(),
  }).strict().optional(),
});

export async function systemRoutes(fastify: FastifyInstance) {
  // 1. Public White-Label Runtime Configuration
  fastify.get('/config', async (request, reply) => {
    const gateway = getPaymentGateway();
    let tenantBrand: any = null;
    try {
      const headerTenantId = (request.headers['x-tenant-id'] as string | undefined)?.trim();
      const rawHost = (request.headers.host || '').split(':')[0].toLowerCase();

      let tRes;
      if (headerTenantId) {
        tRes = SYSTEM_CONFIG_UUID_REGEX.test(headerTenantId)
          ? await pool.query(`SELECT id, ${TENANT_BRAND_COLS} FROM tenants WHERE id = $1 AND is_active = TRUE LIMIT 1`, [headerTenantId])
          : await pool.query(`SELECT id, ${TENANT_BRAND_COLS} FROM tenants WHERE slug = $1 AND is_active = TRUE LIMIT 1`, [headerTenantId]);
      } else if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
        tRes = await pool.query(
          `SELECT id, ${TENANT_BRAND_COLS} FROM tenants
           WHERE (custom_domain = $1 OR slug = $2) AND is_active = TRUE
           ORDER BY (custom_domain = $1) DESC
           LIMIT 1`,
          [rawHost, rawHost.split('.')[0]]
        );
        if (tRes.rows.length === 0) {
          tRes = await pool.query(`SELECT id, ${TENANT_BRAND_COLS} FROM tenants WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1`);
        }
      } else {
        tRes = await pool.query(`SELECT id, ${TENANT_BRAND_COLS} FROM tenants WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1`);
      }

      if (tRes.rows.length > 0) {
        const formatted: Record<string, any> = formatTenantBrand(tRes.rows[0]);
        let publicSettings: Record<string, any> = {};
        try {
          const intRes = await tenantQuery<{ public_settings: Record<string, any> }>(
            `SELECT COALESCE(public_settings, '{}'::jsonb) AS public_settings FROM integration_configs WHERE tenant_id = $1 LIMIT 1`,
            [tRes.rows[0].id],
            tRes.rows[0].id
          );
          publicSettings = intRes.rows[0]?.public_settings || {};
        } catch {
          publicSettings = {};
        }
        formatted.pricingConfig = publicSettings.pricingConfig || null;
        tenantBrand = formatted;
      }
    } catch {
      // Fresh unmigrated DB fallback
    }

    const defaultLocale = tenantBrand?.defaultLocale || 'en';
    const supportedLocales = ['en', 'ar'].includes(defaultLocale)
      ? ['en', 'ar']
      : ['en', 'ar', defaultLocale];

    return reply.status(200).send(
      successResponse({
        demoMode: isDemoModeEnabled(),
        paymentGateway: gateway.name,
        paymentGatewayConfigured: gateway.isConfigured(),
        defaultCurrency: tenantBrand?.currencyCode || env.DEFAULT_CURRENCY_CODE || 'AED',
        defaultVatPercent: tenantBrand?.vatPercent ?? (env.DEFAULT_TAX_RATE_BPS / 100),
        defaultTaxName: tenantBrand?.taxName || 'VAT',
        defaultCountryCode: tenantBrand?.countryCode || 'AE',
        defaultDistanceUnit: tenantBrand?.distanceUnit || 'km',
        supportedLocales,
        pricingConfig: tenantBrand?.pricingConfig || null,
        tenant: tenantBrand,
      }, request.id || `req_${Date.now()}`)
    );
  });

  // 2. Update Tenant System Configuration (Admin Only, Blocked in Demo)
  const updateConfigHandler = async (request: any, reply: any) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = updateSystemConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid system configuration payload.', requestId)
      );
    }

    const d = parsed.data;
    const updatedRow = await withTenantTransaction(tenantId, async (client) => {
      const updRes = await client.query(
        `UPDATE tenants
         SET name = COALESCE($1, name),
             primary_color = COALESCE($2, primary_color),
             currency_code = COALESCE($3, currency_code),
             currency_symbol = COALESCE($4, currency_symbol),
             timezone = COALESCE($5, timezone),
             default_platform_commission_bps = COALESCE($6, default_platform_commission_bps),
             default_tax_rate_bps = COALESCE($7, default_tax_rate_bps),
             tax_name = COALESCE($8, tax_name),
             country_code = COALESCE($9, country_code),
             distance_unit = COALESCE($10, distance_unit),
             support_phone = CASE WHEN $11::boolean THEN $12 ELSE support_phone END,
             support_whatsapp = CASE WHEN $13::boolean THEN $14 ELSE support_whatsapp END,
             emergency_phone = CASE WHEN $15::boolean THEN $16 ELSE emergency_phone END,
             logo_url = CASE WHEN $17::boolean THEN $18 ELSE logo_url END,
             brand_logo_url = CASE WHEN $17::boolean THEN $18 ELSE brand_logo_url END,
             default_locale = COALESCE($19, default_locale),
             default_map_lat = COALESCE($20, default_map_lat),
             default_map_lng = COALESCE($21, default_map_lng),
             updated_at = NOW()
         WHERE id = $22
         RETURNING ${TENANT_BRAND_COLS}`,
        [
          d.name ?? null,
          d.primaryColor ?? null,
          d.currencyCode ?? null,
          d.currencySymbol ?? null,
          d.timezone ?? null,
          d.commissionBps ?? null,
          d.taxRateBps ?? null,
          d.taxName ?? null,
          d.countryCode ?? null,
          d.distanceUnit ?? null,
          d.supportPhone !== undefined,
          d.supportPhone ?? null,
          d.supportWhatsapp !== undefined,
          d.supportWhatsapp ?? null,
          d.emergencyPhone !== undefined,
          d.emergencyPhone ?? null,
          d.logoUrl !== undefined,
          d.logoUrl ?? null,
          d.defaultLocale ?? null,
          d.defaultMapLat ?? null,
          d.defaultMapLng ?? null,
          tenantId,
        ]
      );

      if (updRes.rows.length === 0) {
        return null;
      }

      let savedPricingConfig: any = null;
      if (d.pricingConfig || d.publicSettings) {
        const curInt = await client.query<{ public_settings: Record<string, any> }>(
          `SELECT COALESCE(public_settings, '{}'::jsonb) AS public_settings FROM integration_configs WHERE tenant_id = $1 FOR UPDATE`,
          [tenantId]
        );
        const existingPublic = curInt.rows[0]?.public_settings || {};
        const mergedPricing = d.pricingConfig
          ? { ...(existingPublic.pricingConfig || {}), ...d.pricingConfig }
          : existingPublic.pricingConfig;
        const mergedPublic = {
          ...existingPublic,
          ...(d.publicSettings || {}),
          ...(mergedPricing ? { pricingConfig: mergedPricing } : {}),
        };
        savedPricingConfig = mergedPublic.pricingConfig || null;

        await client.query(
          `INSERT INTO integration_configs (tenant_id, public_settings)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (tenant_id) DO UPDATE
             SET public_settings = $2::jsonb,
                 updated_at = NOW()`,
          [tenantId, JSON.stringify(mergedPublic)]
        );
      } else {
        const curInt = await client.query<{ public_settings: Record<string, any> }>(
          `SELECT COALESCE(public_settings, '{}'::jsonb) AS public_settings FROM integration_configs WHERE tenant_id = $1 LIMIT 1`,
          [tenantId]
        ).catch(() => ({ rows: [] as any[] }));
        savedPricingConfig = curInt.rows[0]?.public_settings?.pricingConfig || null;
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
         VALUES ($1, $2, $3, 'SYSTEM_CONFIG_UPDATED', 'tenant', $4, $5)`,
        [tenantId, request.user!.id, request.user!.role, tenantId, JSON.stringify(d)]
      );

      const formatted: Record<string, any> = formatTenantBrand(updRes.rows[0]);
      formatted.pricingConfig = savedPricingConfig;
      return formatted;
    });

    if (!updatedRow) {
      return reply.status(404).send(errorResponse('TENANT_NOT_FOUND', 'Tenant record not found.', requestId));
    }

      return reply.status(200).send(
        successResponse({ updated: true, tenant: updatedRow, pricingConfig: updatedRow.pricingConfig ?? null }, requestId)
      );
    };

  fastify.put('/config', {
    preHandler: [authenticate, requirePermission('system:settings:update'), blockInDemoMode('Updating tenant system configuration')],
    schema: {
      tags: ['System & Integrations'],
      summary: 'Update tenant branding, localization, tax rate, and operating parameters',
      security: [{ bearerAuth: [] }],
    },
  }, updateConfigHandler);

  fastify.put('/settings', {
    preHandler: [authenticate, requirePermission('system:settings:update'), blockInDemoMode('Updating tenant system configuration')],
    schema: {
      tags: ['System & Integrations'],
      summary: 'Update tenant branding, localization, tax rate, and operating parameters (alias)',
      security: [{ bearerAuth: [] }],
    },
  }, updateConfigHandler);

  // 2b. Read Paginated Tenant Audit Logs (Admin Only)
  fastify.get('/audit-logs', {
    preHandler: [authenticate, requirePermission('system:settings:update')],
    schema: {
      tags: ['System & Integrations'],
      summary: 'Get paginated tenant security and operational audit logs',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const q = (request.query || {}) as { limit?: string; action?: string };
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || '50', 10) || 50));

    const params: any[] = [tenantId];
    let whereClause = 'WHERE tenant_id = $1';
    if (q.action && q.action.trim()) {
      params.push(q.action.trim());
      whereClause += ` AND action = $${params.length}`;
    }
    params.push(limit);

    const res = await tenantQuery(
      `SELECT id, actor_id AS "actorId", actor_role AS "actorRole", action,
              resource_type AS "resourceType", resource_id AS "resourceId",
              diff_payload AS "diffPayload", ip_address AS "ipAddress", created_at AS "createdAt"
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
      tenantId
    );

    return reply.status(200).send(
      successResponse(res.rows, requestId)
    );
  });

  // 3. Read Masked Tenant Integration Configs (Admin Only)
  fastify.get('/integrations', {
    preHandler: [authenticate, requirePermission('system:settings:update')],
    schema: {
      tags: ['System & Integrations'],
      summary: 'Get tenant integration toggles, non-sensitive settings, and masked credential previews',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const res = await tenantQuery<{
      stripe_account_id: string | null;
      stripe_live_mode: boolean;
      twilio_enabled: boolean;
      aws_ses_enabled: boolean;
      fcm_push_enabled: boolean;
      encrypted_secrets: Record<string, any>;
      public_settings: Record<string, any>;
      updated_at: Date;
    }>(
      `SELECT stripe_account_id, stripe_live_mode, twilio_enabled, aws_ses_enabled, fcm_push_enabled,
              COALESCE(encrypted_secrets, '{}'::jsonb) AS encrypted_secrets,
              COALESCE(public_settings, '{}'::jsonb) AS public_settings,
              updated_at
       FROM integration_configs
       WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    const row = res.rows[0];
    return reply.status(200).send(
      successResponse({
        stripeAccountId: row?.stripe_account_id ?? null,
        stripeLiveMode: Boolean(row?.stripe_live_mode),
        twilioEnabled: Boolean(row?.twilio_enabled),
        awsSesEnabled: Boolean(row?.aws_ses_enabled),
        fcmPushEnabled: Boolean(row?.fcm_push_enabled),
        publicSettings: row?.public_settings ?? {},
        secretsMasked: buildMaskedSecrets(row?.encrypted_secrets || {}),
        updatedAt: row?.updated_at ?? null,
      }, requestId)
    );
  });

  // 4. Update Tenant Integration Configs with AES-256-GCM Secret Encryption (Admin Only, Blocked in Demo)
  fastify.put('/integrations', {
    preHandler: [authenticate, requirePermission('system:settings:update'), blockInDemoMode('Updating payment and integration credentials')],
    schema: {
      tags: ['System & Integrations'],
      summary: 'Update tenant integrations and store encrypted secrets at rest via AES-256-GCM',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    const parsed = updateIntegrationsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid integrations payload.', requestId)
      );
    }

    const d = parsed.data;
    const updated = await withTenantTransaction(tenantId, async (client) => {
      const existingRes = await client.query<{
        stripe_account_id: string | null;
        stripe_live_mode: boolean;
        twilio_enabled: boolean;
        aws_ses_enabled: boolean;
        fcm_push_enabled: boolean;
        encrypted_secrets: Record<string, any>;
        public_settings: Record<string, any>;
      }>(
        `SELECT stripe_account_id, stripe_live_mode, twilio_enabled, aws_ses_enabled, fcm_push_enabled,
                COALESCE(encrypted_secrets, '{}'::jsonb) AS encrypted_secrets,
                COALESCE(public_settings, '{}'::jsonb) AS public_settings
         FROM integration_configs
         WHERE tenant_id = $1
         FOR UPDATE`,
        [tenantId]
      );

      const cur = existingRes.rows[0];
      const nextEncrypted: Record<string, any> = { ...(cur?.encrypted_secrets || {}) };
      const nextPublic: Record<string, any> = d.publicSettings !== undefined
        ? { ...(cur?.public_settings || {}), ...d.publicSettings }
        : { ...(cur?.public_settings || {}) };

      const updatedSecretKeys: string[] = [];
      const deletedSecretKeys: string[] = [];

      if (d.secrets) {
        for (const [provider, val] of Object.entries(d.secrets)) {
          if (val === undefined) continue;
          if (val === null) {
            delete nextEncrypted[provider];
            deletedSecretKeys.push(provider);
          } else if (typeof val === 'string') {
            nextEncrypted[provider] = AuthService.encryptSecret(val);
            updatedSecretKeys.push(provider);
          } else if (typeof val === 'object') {
            const existingSub =
              nextEncrypted[provider] && typeof nextEncrypted[provider] === 'object'
                ? { ...nextEncrypted[provider] }
                : {};
            for (const [subKey, subVal] of Object.entries(val)) {
              if (subVal === null) {
                delete existingSub[subKey];
                deletedSecretKeys.push(`${provider}.${subKey}`);
              } else if (typeof subVal === 'string') {
                existingSub[subKey] = AuthService.encryptSecret(subVal);
                updatedSecretKeys.push(`${provider}.${subKey}`);
              }
            }
            if (Object.keys(existingSub).length === 0) {
              delete nextEncrypted[provider];
            } else {
              nextEncrypted[provider] = existingSub;
            }
          }
        }
      }

      const nextStripeAccount = d.stripeAccountId !== undefined ? d.stripeAccountId : (cur?.stripe_account_id ?? null);
      const nextStripeLive = d.stripeLiveMode ?? Boolean(cur?.stripe_live_mode);
      const nextTwilio = d.twilioEnabled ?? Boolean(cur?.twilio_enabled);
      const nextSes = d.awsSesEnabled ?? Boolean(cur?.aws_ses_enabled);
      const nextFcm = d.fcmPushEnabled ?? Boolean(cur?.fcm_push_enabled);

      const upsertRes = await client.query<{
        stripe_account_id: string | null;
        stripe_live_mode: boolean;
        twilio_enabled: boolean;
        aws_ses_enabled: boolean;
        fcm_push_enabled: boolean;
        encrypted_secrets: Record<string, any>;
        public_settings: Record<string, any>;
        updated_at: Date;
      }>(
        `INSERT INTO integration_configs (
           tenant_id, stripe_account_id, stripe_live_mode, twilio_enabled, aws_ses_enabled,
           fcm_push_enabled, encrypted_secrets, public_settings
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (tenant_id) DO UPDATE SET
           stripe_account_id = EXCLUDED.stripe_account_id,
           stripe_live_mode = EXCLUDED.stripe_live_mode,
           twilio_enabled = EXCLUDED.twilio_enabled,
           aws_ses_enabled = EXCLUDED.aws_ses_enabled,
           fcm_push_enabled = EXCLUDED.fcm_push_enabled,
           encrypted_secrets = EXCLUDED.encrypted_secrets,
           public_settings = EXCLUDED.public_settings,
           updated_at = NOW()
         RETURNING stripe_account_id, stripe_live_mode, twilio_enabled, aws_ses_enabled,
                   fcm_push_enabled, encrypted_secrets, public_settings, updated_at`,
        [
          tenantId,
          nextStripeAccount,
          nextStripeLive,
          nextTwilio,
          nextSes,
          nextFcm,
          JSON.stringify(nextEncrypted),
          JSON.stringify(nextPublic),
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
         VALUES ($1, $2, $3, 'INTEGRATIONS_UPDATED', 'integration_config', $4, $5)`,
        [
          tenantId,
          request.user!.id,
          request.user!.role,
          tenantId,
          JSON.stringify({
            updatedFlags: {
              stripeLiveMode: d.stripeLiveMode,
              twilioEnabled: d.twilioEnabled,
              awsSesEnabled: d.awsSesEnabled,
              fcmPushEnabled: d.fcmPushEnabled,
            },
            updatedPublicKeys: d.publicSettings ? Object.keys(d.publicSettings) : [],
            updatedSecretKeys,
            deletedSecretKeys,
          }),
        ]
      );

      return upsertRes.rows[0];
    });

    return reply.status(200).send(
      successResponse({
        stripeAccountId: updated.stripe_account_id,
        stripeLiveMode: updated.stripe_live_mode,
        twilioEnabled: updated.twilio_enabled,
        awsSesEnabled: updated.aws_ses_enabled,
        fcmPushEnabled: updated.fcm_push_enabled,
        publicSettings: updated.public_settings,
        secretsMasked: buildMaskedSecrets(updated.encrypted_secrets),
        updatedAt: updated.updated_at,
      }, requestId)
    );
  });
}
