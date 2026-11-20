import Stripe from 'stripe';
import { env } from '../config/env.js';

let testStripeOverride: Stripe | null = null;

/** Override the Stripe SDK client in tests. Pass null to restore default behavior. */
export function setStripeForTest(mock: Stripe | null): void {
  testStripeOverride = mock;
}

/** Return the active Stripe SDK client (or the test override if registered). */
export function getStripe(secretKey?: string): Stripe {
  if (testStripeOverride) {
    return testStripeOverride;
  }
  return new Stripe(secretKey ?? env.STRIPE_SECRET_KEY ?? '');
}

/** True when a Stripe secret key is configured or a test Stripe mock is active. */
export function hasStripeConfigured(): boolean {
  return Boolean(testStripeOverride || env.STRIPE_SECRET_KEY);
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
