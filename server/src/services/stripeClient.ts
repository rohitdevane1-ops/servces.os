import Stripe from 'stripe';
import { env } from '../config/env.js';

let testStripeOverride: Stripe | null = null;
const MAX_STRIPE_CLIENTS = 64;
const cachedStripeClients = new Map<string, Stripe>();

/** Override the Stripe SDK client in tests. Pass null to restore default behavior. */
export function setStripeForTest(mock: Stripe | null): void {
  testStripeOverride = mock;
}

/** Return the active Stripe SDK client (LRU-bounded per key, or test override). */
export function getStripe(secretKey?: string): Stripe {
  if (testStripeOverride) {
    return testStripeOverride;
  }
  const key = secretKey ?? env.STRIPE_SECRET_KEY ?? '';
  const existing = cachedStripeClients.get(key);
  if (existing) {
    cachedStripeClients.delete(key);
    cachedStripeClients.set(key, existing);
    return existing;
  }
  if (cachedStripeClients.size >= MAX_STRIPE_CLIENTS) {
    const oldestKey = cachedStripeClients.keys().next().value;
    if (oldestKey !== undefined) {
      cachedStripeClients.delete(oldestKey);
    }
  }
  const client = new Stripe(key);
  cachedStripeClients.set(key, client);
  return client;
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
