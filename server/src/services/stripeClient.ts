import Stripe from 'stripe';
import { env } from '../config/env.js';

let testStripeOverride: Stripe | null = null;
let cachedStripeClient: Stripe | null = null;
let cachedStripeKey: string | null = null;

/** Override the Stripe SDK client in tests. Pass null to restore default behavior. */
export function setStripeForTest(mock: Stripe | null): void {
  testStripeOverride = mock;
}

/** Return the active Stripe SDK client (cached singleton per key, or test override). */
export function getStripe(secretKey?: string): Stripe {
  if (testStripeOverride) {
    return testStripeOverride;
  }
  const key = secretKey ?? env.STRIPE_SECRET_KEY ?? '';
  if (!cachedStripeClient || cachedStripeKey !== key) {
    cachedStripeClient = new Stripe(key);
    cachedStripeKey = key;
  }
  return cachedStripeClient;
}

/** True when a Stripe secret key (env or tenant override) is configured or a test Stripe mock is active. */
export function hasStripeConfigured(overrideKey?: string): boolean {
  const key = overrideKey ?? env.STRIPE_SECRET_KEY;
  return Boolean(testStripeOverride || (key && !key.includes('your_stripe')));
}

/**
 * Distinguish definitive client/card rejections (safe to fail immediately) from
 * ambiguous network/timeout/rate-limit/5xx failures (must be reconciled safely).
 */
export function isDefinitiveStripeError(err: any): boolean {
  if (!err) return false;
  const type = String(err.type || '');
  const code = String(err.code || '');
  const status = Number(err.statusCode || err.status || 0);
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    type === 'StripeConnectionError' ||
    type === 'StripeAPIError' ||
    type === 'StripeRateLimitError' ||
    status === 429 ||
    status >= 500
  ) {
    return false;
  }
  if (
    type === 'StripeCardError' ||
    type === 'StripeInvalidRequestError' ||
    type === 'StripePermissionError' ||
    status === 400 ||
    status === 402 ||
    status === 403 ||
    status === 404
  ) {
    return true;
  }
  return false;
}
