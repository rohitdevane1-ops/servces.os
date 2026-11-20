import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load root and local .env files
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export const INSECURE_DEFAULTS = [
  'servicepro_os_super_secure_jwt_access_secret_key_minimum_32_characters_long_for_entropy',
  'servicepro_os_super_secure_jwt_refresh_secret_key_minimum_32_characters_long_for_entropy',
  'turnkey_bootstrap_setup_token_enterprise',
  'ChangeMe_ProductionJwtSecretKey_Min32Chars!',
  'ChangeMe_ProductionRefreshSecretKey_Min32Chars!',
  'ServiceProBootstrapToken2026!',
  // Publicly known default APP_ENCRYPTION_KEY (valid 64-hex, so the format check alone is not enough)
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(v => parseInt(v, 10)).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:80,http://localhost:3000'),
  
  // Database Pool
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/servicepro_os'),
  DB_POOL_MAX: z.string().transform(v => parseInt(v, 10)).default('20'),
  
  // JWT Cryptographic Secrets (Supports both JWT_SECRET and JWT_ACCESS_SECRET)
  JWT_SECRET: z.string().min(32).default('servicepro_os_super_secure_jwt_access_secret_key_minimum_32_characters_long_for_entropy'),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).default('servicepro_os_super_secure_jwt_refresh_secret_key_minimum_32_characters_long_for_entropy'),
  JWT_ACCESS_EXPIRY_SECONDS: z.string().transform(v => parseInt(v, 10)).default('900'), // 15 mins
  JWT_REFRESH_EXPIRY_DAYS: z.string().transform(v => parseInt(v, 10)).default('30'), // 30 days
  
  // Sensitive Data Encryption at Rest (AES-256-GCM - 32 bytes hex)
  APP_ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  
  // Anti-Bot & Captcha Protection (Cloudflare Turnstile / hCaptcha)
  CAPTCHA_SECRET_KEY: z.string().optional(),
  CAPTCHA_ENFORCED: z.string().default('false'),
  CAPTCHA_PROVIDER: z.enum(['turnstile', 'hcaptcha']).default('turnstile'),
  CAPTCHA_MANDATORY_PRODUCTION: z.string().default('false'),
  
  // Turnkey Installer Setup (Supports both BOOTSTRAP_TOKEN and INITIAL_ADMIN_BOOTSTRAP_SECRET)
  BOOTSTRAP_TOKEN: z.string().min(16).default('turnkey_bootstrap_setup_token_enterprise'),
  INITIAL_ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  
  // External Provider Credentials (Optional during development / self-hosting)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_PHONE: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().default('support@serviceproos.com'),

  // Reverse-proxy trust: 'false' (default) | 'true' | hop count (e.g. '1') | comma list of IPs/CIDRs
  TRUST_PROXY: z.string().default('false'),
  // Payment outbox worker lifecycle
  OUTBOX_WORKER_ENABLED: z.string().default('true'),
});

export type TrustProxySetting = boolean | string | string[] | ((address: string, hop: number) => boolean);

/** Validate and normalise TRUST_PROXY. Anything unrecognised fails closed (throws). */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const v = (raw ?? 'false').trim();
  if (v === '' || v.toLowerCase() === 'false' || v === '0') return false;
  if (v.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(v)) {
    const hops = parseInt(v, 10);
    if (hops < 1 || hops > 10) throw new Error('[Configuration Error] TRUST_PROXY hop count must be between 1 and 10');
    const fn = (_address: string, hop: number) => hop <= hops;
    (fn as any).hops = hops;
    return fn;
  }
  const entries = v.split(',').map(x => x.trim()).filter(Boolean);
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  const ipv6 = /^[0-9a-fA-F:]+(\/\d{1,3})?$/;
  for (const e of entries) {
    if (!(ipv4.test(e) || (e.includes(':') && ipv6.test(e)))) {
      throw new Error(`[Configuration Error] TRUST_PROXY entry '${e}' is not a valid IP/CIDR, hop count, or boolean`);
    }
  }
  if (entries.length === 0) return false;
  return entries;
}

export function validateEnv(source: Record<string, string | undefined>) {
const rawEnv = {
  ...source,
  JWT_SECRET: source.JWT_SECRET || source.JWT_ACCESS_SECRET,
  BOOTSTRAP_TOKEN: source.BOOTSTRAP_TOKEN || source.INITIAL_ADMIN_BOOTSTRAP_SECRET,
};

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('[Configuration Error] Invalid environment variables:');
  console.error(parsed.error.format());
  throw new Error('Environment configuration validation failed');
}

const validated = parsed.data;

// Resolve aliases
const effectiveJwtSecret = validated.JWT_SECRET || validated.JWT_ACCESS_SECRET || 'servicepro_os_super_secure_jwt_access_secret_key_minimum_32_characters_long_for_entropy';
const effectiveBootstrapToken = validated.BOOTSTRAP_TOKEN || validated.INITIAL_ADMIN_BOOTSTRAP_SECRET || 'turnkey_bootstrap_setup_token_enterprise';

// Fail-closed security check for production
if (validated.NODE_ENV === 'production') {
  if (INSECURE_DEFAULTS.includes(effectiveJwtSecret)) {
    throw new Error('[Security Exception] Refusing to start in production with default insecure JWT_SECRET');
  }
  if (INSECURE_DEFAULTS.includes(validated.JWT_REFRESH_SECRET)) {
    throw new Error('[Security Exception] Refusing to start in production with default insecure JWT_REFRESH_SECRET');
  }
  if (INSECURE_DEFAULTS.includes(effectiveBootstrapToken)) {
    throw new Error('[Security Exception] Refusing to start in production with default insecure BOOTSTRAP_TOKEN');
  }
  if (
    INSECURE_DEFAULTS.includes(validated.APP_ENCRYPTION_KEY) ||
    !/^[0-9a-f]{64}$/i.test(validated.APP_ENCRYPTION_KEY)
  ) {
    throw new Error('[Security Exception] Refusing to start in production without a valid 32-byte hex APP_ENCRYPTION_KEY');
  }
  if (validated.CAPTCHA_ENFORCED === 'true' && (!validated.CAPTCHA_SECRET_KEY || validated.CAPTCHA_SECRET_KEY.trim() === '')) {
    throw new Error('[Security Exception] Refusing to start in production with CAPTCHA_ENFORCED=true without CAPTCHA_SECRET_KEY configured');
  }
  if (validated.CAPTCHA_MANDATORY_PRODUCTION === 'true') {
    if (validated.CAPTCHA_ENFORCED !== 'true' || !validated.CAPTCHA_SECRET_KEY || validated.CAPTCHA_SECRET_KEY.trim() === '') {
      throw new Error('[Security Exception] Refusing to start in production: CAPTCHA_MANDATORY_PRODUCTION=true requires CAPTCHA_ENFORCED=true and a valid CAPTCHA_SECRET_KEY');
    }
  }
  if (validated.STRIPE_SECRET_KEY && (!validated.STRIPE_WEBHOOK_SECRET || validated.STRIPE_WEBHOOK_SECRET.trim() === '')) {
    throw new Error('[Security Exception] Refusing to start in production with STRIPE_SECRET_KEY without STRIPE_WEBHOOK_SECRET configured');
  }
}

parseTrustProxy(validated.TRUST_PROXY); // fail fast on invalid proxy configuration

return {
  ...validated,
  JWT_SECRET: effectiveJwtSecret,
  JWT_ACCESS_SECRET: effectiveJwtSecret, // alias
  BOOTSTRAP_TOKEN: effectiveBootstrapToken,
  INITIAL_ADMIN_BOOTSTRAP_SECRET: effectiveBootstrapToken, // alias
};
}

export const env = validateEnv(process.env as Record<string, string | undefined>);
export const trustProxySetting: TrustProxySetting = parseTrustProxy(env.TRUST_PROXY);
