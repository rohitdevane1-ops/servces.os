import crypto from 'node:crypto';
import { env } from '../config/env.js';

const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_PATH_REGEX = /^\/api\/v1\/uploads\/([0-9a-f-]{36})\/([a-zA-Z0-9._-]+)(?:\?.*)?$/i;

function getUploadSigningSecret(): string {
  return env.APP_ENCRYPTION_KEY;
}

export function signUploadPath(tenantId: string, filename: string, exp: number): string {
  return crypto
    .createHmac('sha256', getUploadSigningSecret())
    .update(`${tenantId}:${filename}:${exp}`)
    .digest('hex');
}

export function verifyUploadSignature(
  tenantId: string,
  filename: string,
  exp: number,
  sig: string
): boolean {
  if (!UUID_REGEX.test(tenantId) || !SAFE_FILENAME_REGEX.test(filename)) {
    return false;
  }
  const expected = signUploadPath(tenantId, filename, exp);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Normalizes a signed `/api/v1/uploads/:tenantId/:filename?exp=...&sig=...` path
 * down to a stable canonical storage key before DB persistence so expiring tokens
 * do not break stored references after 24 hours.
 */
export function normalizeStoredMediaUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const match = UPLOAD_PATH_REGEX.exec(trimmed);
  if (match) {
    return `/api/v1/uploads/${match[1]}/${match[2]}`;
  }
  return trimmed;
}

/**
 * Re-signs a stored `/api/v1/uploads/:tenantId/:filename` reference on read.
 * Enforces `expectedTenantId` if supplied so a tenant cannot mint signatures for another tenant's files.
 */
export function signStoredMediaUrl(
  rawUrl: string | null | undefined,
  expectedTenantId?: string
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const match = UPLOAD_PATH_REGEX.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const tenantId = match[1];
  const filename = match[2];
  if (!UUID_REGEX.test(tenantId) || !SAFE_FILENAME_REGEX.test(filename)) {
    return trimmed;
  }
  if (expectedTenantId && tenantId.toLowerCase() !== expectedTenantId.toLowerCase()) {
    return null;
  }

  const ttlSeconds = env.UPLOAD_URL_TTL_SECONDS || 86400;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signUploadPath(tenantId, filename, exp);
  return `/api/v1/uploads/${tenantId}/${filename}?exp=${exp}&sig=${sig}`;
}

export function signStoredMediaUrls(
  urls: unknown,
  expectedTenantId?: string
): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const item of urls) {
    if (typeof item === 'string') {
      const signed = signStoredMediaUrl(item, expectedTenantId);
      if (signed) out.push(signed);
    }
  }
  return out;
}

export function normalizeStoredMediaUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const item of urls) {
    if (typeof item === 'string') {
      const normalized = normalizeStoredMediaUrl(item);
      if (normalized) out.push(normalized);
    }
  }
  return out;
}
