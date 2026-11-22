import { z } from 'zod';

const SIGNED_UPLOAD_PATH_REGEX =
  /^\/api\/v1\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9._-]+(\?[a-zA-Z0-9=&_%-]+)?$/i;

/**
 * Validates that a supplied media URL is either a strict `https://` URL
 * or a signed internal `/api/v1/uploads/:tenantId/:filename?...` path.
 * Rejects `javascript:`, `data:`, `http://`, `file:`, relative paths, and `..`.
 */
export function isSafeMediaUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.length > 2048) return false;
  if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
  if (value.includes('..')) return false;

  if (SIGNED_UPLOAD_PATH_REGEX.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export const safeMediaUrlSchema = z
  .string()
  .trim()
  .refine(isSafeMediaUrl, {
    message: 'URL must be a valid https:// URL or signed /api/v1/uploads/... path.',
  });
