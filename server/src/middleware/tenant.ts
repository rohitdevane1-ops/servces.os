import { FastifyRequest, FastifyReply } from 'fastify';
import { pool, setActiveTenantId } from '../database/pool.js';
import { errorResponse } from '../types/envelope.js';
import { AuthService } from '../modules/auth/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    user?: {
      id: string;
      role: string;
      tenantId: string;
      email: string;
    };
    tenant?: {
      id: string;
      name: string;
      slug: string;
      currencyCode: string;
      currencySymbol: string;
      timezone: string;
      commissionBps: number;
      taxRateBps: number;
      taxName: string;
      countryCode: string;
      distanceUnit: 'km' | 'mi';
      supportPhone?: string | null;
      supportWhatsapp?: string | null;
      emergencyPhone?: string | null;
      logoUrl?: string | null;
      defaultLocale: string;
      defaultMapLat: number;
      defaultMapLng: number;
    };
  }
}

/**
 * Exact, method-aware, query-stripped match for the Stripe webhook. The handler verifies the
 * Stripe signature before any DB work and derives the tenant from the matched DB records.
 */
export const STRIPE_WEBHOOK_PATH = '/api/v1/finances/webhooks/stripe';
export function isStripeWebhookRequest(method: string, rawUrl: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const pathOnly = rawUrl.split('?')[0].replace(/\/+$/, '');
  return pathOnly === STRIPE_WEBHOOK_PATH;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TENANT_SELECT_COLS = `id, name, slug, currency_code, currency_symbol, timezone, default_platform_commission_bps,
  COALESCE(default_tax_rate_bps, 500) AS default_tax_rate_bps,
  COALESCE(tax_name, 'VAT') AS tax_name,
  COALESCE(country_code, 'AE') AS country_code,
  COALESCE(distance_unit, 'km') AS distance_unit,
  support_phone, support_whatsapp, emergency_phone,
  COALESCE(logo_url, brand_logo_url) AS logo_url,
  COALESCE(default_locale, 'en') AS default_locale,
  COALESCE(default_map_lat, 25.204800) AS default_map_lat,
  COALESCE(default_map_lng, 55.270800) AS default_map_lng`;

function mapTenantRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    timezone: row.timezone,
    commissionBps: Number(row.default_platform_commission_bps),
    taxRateBps: Number(row.default_tax_rate_bps ?? 500),
    taxName: row.tax_name || 'VAT',
    countryCode: row.country_code || 'AE',
    distanceUnit: (row.distance_unit === 'mi' ? 'mi' : 'km') as 'km' | 'mi',
    supportPhone: row.support_phone ?? null,
    supportWhatsapp: row.support_whatsapp ?? null,
    emergencyPhone: row.emergency_phone ?? null,
    logoUrl: row.logo_url ?? row.brand_logo_url ?? null,
    defaultLocale: row.default_locale || 'en',
    defaultMapLat: Number(row.default_map_lat ?? 25.2048),
    defaultMapLng: Number(row.default_map_lng ?? 55.2708),
  };
}

export async function tenantResolver(request: FastifyRequest, reply: FastifyReply) {
  if (isStripeWebhookRequest(request.method, request.url)) {
    return;
  }
  const pathOnly = request.url.split('?')[0].replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const hasExplicitTenantHeader = Boolean((request.headers['x-tenant-id'] as string | undefined)?.trim());

  // Allow health, docs, installer, public GET /system/config, signed GET /uploads/*,
  // and headerless POST /auth/reset-password without tenant pre-resolution
  if (
    request.url.startsWith('/health') ||
    pathOnly === '/api/v1/health' ||
    request.url.startsWith('/docs') ||
    request.url.startsWith('/api/v1/installer') ||
    (method === 'GET' && pathOnly === '/api/v1/system/config') ||
    (method === 'GET' && pathOnly.startsWith('/api/v1/uploads/')) ||
    (!hasExplicitTenantHeader && method === 'POST' && pathOnly === '/api/v1/auth/reset-password')
  ) {
    return;
  }

  const requestId = request.id || `req_${Date.now()}`;
  
  // 1. Resolve candidate tenant identifier from header, token, or host
  const headerTenantId = request.headers['x-tenant-id'] as string | undefined;
  let tokenTenantId: string | undefined = (request.user as any)?.tenantId;

  // Extract from Authorization header if present and request.user is not yet populated (onRequest hook)
  // BACK-08: Only resolve tokenTenantId for tenant scoping; DO NOT populate request.user here.
  // The dedicated authenticate preHandler is the sole authority for establishing request.user.
  if (!tokenTenantId && request.headers.authorization?.startsWith('Bearer ')) {
    const rawToken = request.headers.authorization.slice(7).trim();
    try {
      const decoded = AuthService.verifyAccessToken(rawToken);
      if (decoded?.tenantId) {
        tokenTenantId = decoded.tenantId;
      }
    } catch {
      // Handled by subsequent auth preHandler
    }
  }

  // Fast-path cross-tenant verification when header is already a UUID (no DB hit needed)
  if (
    headerTenantId &&
    tokenTenantId &&
    UUID_REGEX.test(headerTenantId.trim()) &&
    headerTenantId.trim().toLowerCase() !== tokenTenantId.trim().toLowerCase()
  ) {
    return reply.status(403).send(
      errorResponse('TENANT_MISMATCH', 'Supplied x-tenant-id header does not match authenticated user tenant claim.', requestId)
    );
  }

  const candidate = (headerTenantId?.trim() || tokenTenantId?.trim());

  try {
    if (candidate) {
      const isCandidateUuid = UUID_REGEX.test(candidate);
      const query = isCandidateUuid
        ? `SELECT ${TENANT_SELECT_COLS} FROM tenants WHERE id = $1 AND is_active = TRUE`
        : `SELECT ${TENANT_SELECT_COLS} FROM tenants WHERE slug = $1 AND is_active = TRUE`;

      const res = await pool.query(query, [candidate]);

      if (res.rows.length === 0) {
        return reply.status(404).send(
          errorResponse('TENANT_NOT_FOUND', `Organization tenant '${candidate}' not found or inactive.`, requestId)
        );
      }

      const row = res.rows[0];

      // Cross-tenant verification after resolving slug/UUID: header tenant MUST match token tenant UUID
      if (headerTenantId && tokenTenantId && row.id.toLowerCase() !== tokenTenantId.trim().toLowerCase()) {
        return reply.status(403).send(
          errorResponse('TENANT_MISMATCH', 'Supplied x-tenant-id header does not match authenticated user tenant claim.', requestId)
        );
      }

      request.tenantId = row.id;
      request.tenant = mapTenantRow(row);
      setActiveTenantId(row.id);
      return;
    }

    // 2. Resolve via Host / domain if header is omitted (exact custom_domain prioritized over slug)
    const rawHost = (request.headers.host || '').split(':')[0].toLowerCase();
    if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
      const domainRes = await pool.query(
        `SELECT ${TENANT_SELECT_COLS} FROM tenants
         WHERE (custom_domain = $1 OR slug = $2) AND is_active = TRUE
         ORDER BY (custom_domain = $1) DESC
         LIMIT 1`,
        [rawHost, rawHost.split('.')[0]]
      );
      if (domainRes.rows.length > 0) {
        const row = domainRes.rows[0];
        request.tenantId = row.id;
        request.tenant = mapTenantRow(row);
        setActiveTenantId(row.id);
        return;
      }
    }

    // 3. Fallback check: if there is exactly one active tenant in the installation, resolve it;
    // if multiple exist, require explicit tenant identification.
    const allActiveRes = await pool.query(
      `SELECT ${TENANT_SELECT_COLS} FROM tenants WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 2`
    );

    if (allActiveRes.rows.length === 0) {
      return reply.status(404).send(
        errorResponse('TENANT_NOT_FOUND', 'No active organization found on this server. Please execute turnkey setup wizard.', requestId)
      );
    }

    if (allActiveRes.rows.length === 1) {
      // Single-tenant deployment: safe to bind the single organization
      const row = allActiveRes.rows[0];
      request.tenantId = row.id;
      request.tenant = mapTenantRow(row);
      setActiveTenantId(row.id);
      return;
    }

    // Multi-tenant deployment without tenant identifier
    return reply.status(400).send(
      errorResponse(
        'TENANT_IDENTIFIER_REQUIRED',
        'Multiple active organizations exist. Please provide x-tenant-id header or access via organization domain.',
        requestId
      )
    );
  } catch (err: any) {
    request.log.error(err);
    return reply.status(500).send(
      errorResponse('TENANT_RESOLUTION_ERROR', 'Failed to resolve tenant organization.', requestId)
    );
  }
}
