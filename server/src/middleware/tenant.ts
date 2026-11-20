import { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../database/pool.js';
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
    };
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function tenantResolver(request: FastifyRequest, reply: FastifyReply) {
  // Allow health, docs, and installer routes without tenant resolution
  if (
    request.url.startsWith('/health') ||
    request.url.startsWith('/docs') ||
    request.url.startsWith('/api/v1/installer')
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

  // Cross-tenant verification: If BOTH header and token are provided, they MUST match
  if (headerTenantId && tokenTenantId && headerTenantId.trim().toLowerCase() !== tokenTenantId.trim().toLowerCase()) {
    return reply.status(403).send(
      errorResponse('TENANT_MISMATCH', 'Supplied x-tenant-id header does not match authenticated user tenant claim.', requestId)
    );
  }

  const candidate = (tokenTenantId?.trim() || headerTenantId?.trim());

  try {
    if (candidate) {
      const isCandidateUuid = UUID_REGEX.test(candidate);
      const query = isCandidateUuid
        ? 'SELECT id, name, slug, currency_code, currency_symbol, timezone, default_platform_commission_bps FROM tenants WHERE id = $1 AND is_active = TRUE'
        : 'SELECT id, name, slug, currency_code, currency_symbol, timezone, default_platform_commission_bps FROM tenants WHERE slug = $1 AND is_active = TRUE';

      const res = await pool.query(query, [candidate]);

      if (res.rows.length === 0) {
        return reply.status(404).send(
          errorResponse('TENANT_NOT_FOUND', `Organization tenant '${candidate}' not found or inactive.`, requestId)
        );
      }

      const row = res.rows[0];
      request.tenantId = row.id;
      request.tenant = {
        id: row.id,
        name: row.name,
        slug: row.slug,
        currencyCode: row.currency_code,
        currencySymbol: row.currency_symbol,
        timezone: row.timezone,
        commissionBps: row.default_platform_commission_bps,
      };
      return;
    }

    // 2. Resolve via Host / domain if header is omitted
    const rawHost = (request.headers.host || '').split(':')[0].toLowerCase();
    if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
      const domainRes = await pool.query(
        'SELECT id, name, slug, currency_code, currency_symbol, timezone, default_platform_commission_bps FROM tenants WHERE (custom_domain = $1 OR slug = $2) AND is_active = TRUE',
        [rawHost, rawHost.split('.')[0]]
      );
      if (domainRes.rows.length > 0) {
        const row = domainRes.rows[0];
        request.tenantId = row.id;
        request.tenant = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          currencyCode: row.currency_code,
          currencySymbol: row.currency_symbol,
          timezone: row.timezone,
          commissionBps: row.default_platform_commission_bps,
        };
        return;
      }
    }

    // 3. Fallback check: if there is exactly one active tenant in the installation, resolve it;
    // if multiple exist, require explicit tenant identification.
    const allActiveRes = await pool.query(
      'SELECT id, name, slug, currency_code, currency_symbol, timezone, default_platform_commission_bps FROM tenants WHERE is_active = TRUE ORDER BY created_at ASC'
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
      request.tenant = {
        id: row.id,
        name: row.name,
        slug: row.slug,
        currencyCode: row.currency_code,
        currencySymbol: row.currency_symbol,
        timezone: row.timezone,
        commissionBps: row.default_platform_commission_bps,
      };
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
