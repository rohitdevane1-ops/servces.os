import pg from 'pg';
import { env } from '../config/env.js';
import { getStripe } from './stripeClient.js';
import { pool, tenantQuery } from '../database/pool.js';
import { AuthService } from '../modules/auth/auth.service.js';

export type SupportedPaymentGateway = 'stripe' | 'paytabs' | 'telr';

export interface DecryptedTenantIntegrations {
  stripeSecretKey?: string;
  paytabsProfileId?: string;
  paytabsServerKey?: string;
  paytabsRegion?: string;
  telrStoreId?: string;
  telrAuthKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  smtpHost?: string;
  smtpUser?: string;
  smtpPassword?: string;
  fcmServerKey?: string;
  twilioEnabled: boolean;
  awsSesEnabled: boolean;
  fcmPushEnabled: boolean;
}

export async function resolveTenantIntegrationSecrets(
  tenantId?: string,
  targetPool: pg.Pool = pool
): Promise<DecryptedTenantIntegrations> {
  const hasEnvTwilio = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_PHONE);
  const result: DecryptedTenantIntegrations = {
    stripeSecretKey: env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes('your_stripe') ? env.STRIPE_SECRET_KEY : undefined,
    paytabsProfileId: env.PAYTABS_PROFILE_ID || undefined,
    paytabsServerKey: env.PAYTABS_SERVER_KEY || undefined,
    paytabsRegion: env.PAYTABS_REGION || 'ARE',
    telrStoreId: env.TELR_STORE_ID || undefined,
    telrAuthKey: env.TELR_AUTH_KEY || undefined,
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || undefined,
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || undefined,
    twilioFromNumber: env.TWILIO_FROM_PHONE || undefined,
    twilioEnabled: hasEnvTwilio,
    awsSesEnabled: false,
    fcmPushEnabled: false,
  };

  if (!tenantId) return result;

  try {
    const res = await tenantQuery<{
      twilio_enabled: boolean;
      aws_ses_enabled: boolean;
      fcm_push_enabled: boolean;
      encrypted_secrets: Record<string, any>;
      public_settings: Record<string, any>;
    }>(
      `SELECT twilio_enabled, aws_ses_enabled, fcm_push_enabled,
              COALESCE(encrypted_secrets, '{}'::jsonb) AS encrypted_secrets,
              COALESCE(public_settings, '{}'::jsonb) AS public_settings
       FROM integration_configs
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
      tenantId,
      targetPool
    );
    const row = res.rows[0];
    if (!row) return result;

    result.twilioEnabled = Boolean(
      row.twilio_enabled ||
      (result.twilioAccountSid && result.twilioAuthToken && result.twilioFromNumber)
    );
    result.awsSesEnabled = Boolean(row.aws_ses_enabled);
    result.fcmPushEnabled = Boolean(row.fcm_push_enabled);

    const enc = row.encrypted_secrets || {};
    const pub = row.public_settings || {};
    const decryptField = (v: unknown): string | undefined => {
      if (typeof v !== 'string' || !v) return undefined;
      try {
        return AuthService.decryptSecret(v);
      } catch {
        return undefined;
      }
    };

    if (typeof enc.stripe === 'string') {
      result.stripeSecretKey = decryptField(enc.stripe) || result.stripeSecretKey;
    } else if (enc.stripe && typeof enc.stripe === 'object') {
      result.stripeSecretKey = decryptField(enc.stripe.secretKey) || result.stripeSecretKey;
    }

    if (typeof enc.paytabs === 'string') {
      result.paytabsServerKey = decryptField(enc.paytabs) || result.paytabsServerKey;
    } else if (enc.paytabs && typeof enc.paytabs === 'object') {
      result.paytabsProfileId = decryptField(enc.paytabs.profileId) || result.paytabsProfileId;
      result.paytabsServerKey = decryptField(enc.paytabs.serverKey) || result.paytabsServerKey;
    }

    if (typeof enc.telr === 'string') {
      result.telrAuthKey = decryptField(enc.telr) || result.telrAuthKey;
    } else if (enc.telr && typeof enc.telr === 'object') {
      result.telrStoreId = decryptField(enc.telr.storeId) || result.telrStoreId;
      result.telrAuthKey = decryptField(enc.telr.authKey) || result.telrAuthKey;
    }

    if (enc.twilio && typeof enc.twilio === 'object') {
      result.twilioAccountSid = decryptField(enc.twilio.accountSid) || (typeof pub.twilioSid === 'string' ? pub.twilioSid : undefined) || result.twilioAccountSid;
      result.twilioAuthToken = decryptField(enc.twilio.authToken) || result.twilioAuthToken;
      result.twilioFromNumber = decryptField(enc.twilio.fromNumber) || (typeof pub.twilioFrom === 'string' ? pub.twilioFrom : undefined) || result.twilioFromNumber;
    }

    if (enc.smtp && typeof enc.smtp === 'object') {
      result.smtpHost = decryptField(enc.smtp.host);
      result.smtpUser = decryptField(enc.smtp.user);
      result.smtpPassword = decryptField(enc.smtp.password);
    }

    if (typeof enc.fcm === 'string') {
      result.fcmServerKey = decryptField(enc.fcm);
    } else if (enc.fcm && typeof enc.fcm === 'object') {
      result.fcmServerKey = decryptField(enc.fcm.serverKey);
    }
  } catch {
    // Fallback to process.env if integration_configs table is unavailable
  }

  return result;
}

export class GatewayOperationNotSupportedError extends Error {
  public readonly statusCode = 501;
  public readonly code = 'GATEWAY_OPERATION_NOT_SUPPORTED';

  constructor(message: string) {
    super(message);
    this.name = 'GatewayOperationNotSupportedError';
  }
}

export interface PreAuthRequest {
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  returnUrl?: string;
  paymentMethodId?: string;
  metadata: Record<string, string>;
}

export interface PreAuthResult {
  gateway: SupportedPaymentGateway;
  providerReferenceId: string;
  clientSecret: string | null;
  redirectUrl: string | null;
  status: string;
}

export interface CaptureResult {
  gateway: SupportedPaymentGateway;
  providerReferenceId: string;
  capturedAmountCents: number;
  status: string;
}

export interface RefundRequest {
  providerReferenceId: string;
  amountCents: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  gateway: SupportedPaymentGateway;
  refundId: string;
  amountCents: number;
  status: string;
}

export interface VerifyPreAuthResult {
  gateway: SupportedPaymentGateway;
  providerReferenceId: string;
  authorized: boolean;
  status: 'requires_capture' | 'succeeded' | 'pending' | 'failed';
  rawStatus?: string;
}

export interface PaymentGatewayAdapter {
  readonly name: SupportedPaymentGateway;
  isConfigured(): boolean;
  createPreAuth(req: PreAuthRequest): Promise<PreAuthResult>;
  verifyPreAuth(providerReferenceId: string): Promise<VerifyPreAuthResult>;
  cancelPreAuth(providerReferenceId: string): Promise<void>;
  capture(providerReferenceId: string, amountCents?: number): Promise<CaptureResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
}

class StripeGatewayAdapter implements PaymentGatewayAdapter {
  readonly name: SupportedPaymentGateway = 'stripe';
  constructor(private readonly secretKeyOverride?: string) {}

  private get key(): string | undefined {
    return this.secretKeyOverride ?? env.STRIPE_SECRET_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.key && !this.key.includes('your_stripe'));
  }

  async createPreAuth(req: PreAuthRequest): Promise<PreAuthResult> {
    const stripe = getStripe(this.key);
    const params: any = {
      amount: req.amountCents,
      currency: req.currency.toLowerCase(),
      capture_method: 'manual',
      metadata: req.metadata,
    };
    if (req.paymentMethodId) {
      params.payment_method = req.paymentMethodId;
      params.confirm = true;
      params.return_url = req.returnUrl || `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/complete`;
    }
    const pi = await stripe.paymentIntents.create(params, { idempotencyKey: req.idempotencyKey });
    return {
      gateway: 'stripe',
      providerReferenceId: pi.id,
      clientSecret: pi.client_secret ?? null,
      redirectUrl: null,
      status: pi.status,
    };
  }

  async verifyPreAuth(providerReferenceId: string): Promise<VerifyPreAuthResult> {
    const stripe = getStripe(this.key);
    const pi = await stripe.paymentIntents.retrieve(providerReferenceId);
    const status =
      pi.status === 'succeeded'
        ? 'succeeded'
        : pi.status === 'requires_capture'
          ? 'requires_capture'
          : pi.status === 'canceled'
            ? 'failed'
            : 'pending';
    return {
      gateway: 'stripe',
      providerReferenceId: pi.id,
      authorized: status === 'succeeded' || status === 'requires_capture',
      status,
      rawStatus: pi.status,
    };
  }

  async cancelPreAuth(providerReferenceId: string): Promise<void> {
    const stripe = getStripe(this.key);
    await stripe.paymentIntents.cancel(providerReferenceId);
  }

  async capture(providerReferenceId: string, amountCents?: number): Promise<CaptureResult> {
    const stripe = getStripe(this.key);
    const pi = await stripe.paymentIntents.capture(
      providerReferenceId,
      amountCents !== undefined ? { amount_to_capture: amountCents } : undefined
    );
    return {
      gateway: 'stripe',
      providerReferenceId: pi.id,
      capturedAmountCents: pi.amount_received,
      status: pi.status,
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    const stripe = getStripe(this.key);
    const refund = await stripe.refunds.create(
      {
        payment_intent: req.providerReferenceId,
        amount: req.amountCents,
        reason: 'requested_by_customer',
      },
      { idempotencyKey: req.idempotencyKey }
    );
    return {
      gateway: 'stripe',
      refundId: refund.id,
      amountCents: refund.amount,
      status: refund.status || 'succeeded',
    };
  }
}

class PayTabsGatewayAdapter implements PaymentGatewayAdapter {
  readonly name: SupportedPaymentGateway = 'paytabs';
  constructor(
    private readonly profileIdOverride?: string,
    private readonly serverKeyOverride?: string,
    private readonly regionOverride?: string
  ) {}

  private get profileId(): string | undefined {
    return this.profileIdOverride ?? env.PAYTABS_PROFILE_ID;
  }

  private get serverKey(): string | undefined {
    return this.serverKeyOverride ?? env.PAYTABS_SERVER_KEY;
  }

  private get endpointBase(): string {
    const regionMap: Record<string, string> = {
      ARE: 'https://secure.paytabs.com',
      SAU: 'https://secure.paytabs.sa',
      OMN: 'https://secure-oman.paytabs.com',
      JOR: 'https://secure-jordan.paytabs.com',
      EGY: 'https://secure-egypt.paytabs.com',
    };
    return regionMap[(this.regionOverride || env.PAYTABS_REGION || 'ARE').toUpperCase()] || 'https://secure.paytabs.com';
  }

  isConfigured(): boolean {
    return Boolean(this.profileId && this.serverKey);
  }

  async createPreAuth(req: PreAuthRequest): Promise<PreAuthResult> {
    if (!this.isConfigured()) {
      throw new Error('PayTabs UAE credentials (PAYTABS_PROFILE_ID, PAYTABS_SERVER_KEY) are not configured.');
    }
    const res = await fetch(`${this.endpointBase}/payment/request`, {
      method: 'POST',
      headers: {
        Authorization: this.serverKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: Number(this.profileId),
        tran_type: 'auth',
        tran_class: 'ecom',
        cart_id: req.metadata.bookingRef || req.idempotencyKey,
        cart_currency: req.currency.toUpperCase(),
        cart_amount: Number((req.amountCents / 100).toFixed(2)),
        cart_description: `ServiceOS Booking ${req.metadata.bookingRef || ''}`.trim(),
        return: req.returnUrl || `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/complete`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    const authResponseStatus = data?.payment_result?.response_status;
    if (
      !res.ok ||
      !data?.tran_ref ||
      (authResponseStatus && authResponseStatus !== 'A') ||
      (!data?.redirect_url && authResponseStatus !== 'A')
    ) {
      throw new Error(
        `PayTabs auth request failed: ${data?.payment_result?.response_message || data?.message || res.status}`
      );
    }
    return {
      gateway: 'paytabs',
      providerReferenceId: String(data.tran_ref),
      clientSecret: null,
      redirectUrl: data.redirect_url || null,
      status: 'requires_action',
    };
  }

  async verifyPreAuth(providerReferenceId: string): Promise<VerifyPreAuthResult> {
    if (!this.isConfigured()) {
      throw new Error('PayTabs UAE credentials (PAYTABS_PROFILE_ID, PAYTABS_SERVER_KEY) are not configured.');
    }
    const res = await fetch(`${this.endpointBase}/payment/query`, {
      method: 'POST',
      headers: {
        Authorization: this.serverKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: Number(this.profileId),
        tran_ref: providerReferenceId,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(`PayTabs query failed with HTTP ${res.status}`);
    }
    const responseStatus = String(data?.payment_result?.response_status || '').toUpperCase();
    const tranType = String(data?.tran_type || '').toLowerCase();
    if (responseStatus === 'A') {
      const mapped = tranType === 'sale' ? 'succeeded' : 'requires_capture';
      return {
        gateway: 'paytabs',
        providerReferenceId: String(data.tran_ref || providerReferenceId),
        authorized: true,
        status: mapped,
        rawStatus: `${tranType}:${responseStatus}`,
      };
    }
    const failed = ['D', 'E', 'V', 'C'].includes(responseStatus);
    return {
      gateway: 'paytabs',
      providerReferenceId,
      authorized: false,
      status: failed ? 'failed' : 'pending',
      rawStatus: `${tranType}:${responseStatus || 'UNKNOWN'}`,
    };
  }

  async cancelPreAuth(providerReferenceId: string): Promise<void> {
    if (!this.isConfigured()) return;
    await fetch(`${this.endpointBase}/payment/request`, {
      method: 'POST',
      headers: {
        Authorization: this.serverKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: Number(this.profileId),
        tran_type: 'void',
        tran_class: 'ecom',
        tran_ref: providerReferenceId,
      }),
      signal: AbortSignal.timeout(10000),
    });
  }

  async capture(providerReferenceId: string, amountCents?: number): Promise<CaptureResult> {
    if (!this.isConfigured()) throw new Error('PayTabs credentials not configured.');
    const res = await fetch(`${this.endpointBase}/payment/request`, {
      method: 'POST',
      headers: {
        Authorization: this.serverKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: Number(this.profileId),
        tran_type: 'capture',
        tran_class: 'ecom',
        tran_ref: providerReferenceId,
        ...(amountCents !== undefined ? { cart_amount: Number((amountCents / 100).toFixed(2)) } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    const captureStatus = data?.payment_result?.response_status;
    if (!res.ok || captureStatus !== 'A') {
      throw new Error(
        `PayTabs capture failed: ${data?.payment_result?.response_message || data?.message || captureStatus || res.status}`
      );
    }
    return {
      gateway: 'paytabs',
      providerReferenceId: String(data.tran_ref || providerReferenceId),
      capturedAmountCents: amountCents ?? 0,
      status: 'succeeded',
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (!this.isConfigured()) throw new Error('PayTabs credentials not configured.');
    const res = await fetch(`${this.endpointBase}/payment/request`, {
      method: 'POST',
      headers: {
        Authorization: this.serverKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: Number(this.profileId),
        tran_type: 'refund',
        tran_class: 'ecom',
        tran_ref: req.providerReferenceId,
        cart_currency: req.currency.toUpperCase(),
        cart_amount: Number((req.amountCents / 100).toFixed(2)),
        cart_description: req.reason || 'Customer refund',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    const refundStatus = data?.payment_result?.response_status;
    if (!res.ok || refundStatus !== 'A') {
      throw new Error(
        `PayTabs refund failed: ${data?.payment_result?.response_message || data?.message || refundStatus || res.status}`
      );
    }
    return {
      gateway: 'paytabs',
      refundId: String(data.tran_ref || `pt_ref_${Date.now()}`),
      amountCents: req.amountCents,
      status: 'succeeded',
    };
  }
}

class TelrGatewayAdapter implements PaymentGatewayAdapter {
  readonly name: SupportedPaymentGateway = 'telr';
  constructor(
    private readonly storeIdOverride?: string,
    private readonly authKeyOverride?: string
  ) {}

  private get storeId(): string | undefined {
    return this.storeIdOverride ?? env.TELR_STORE_ID;
  }

  private get authKey(): string | undefined {
    return this.authKeyOverride ?? env.TELR_AUTH_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.storeId && this.authKey);
  }

  async createPreAuth(req: PreAuthRequest): Promise<PreAuthResult> {
    if (!this.isConfigured()) {
      throw new Error('Telr UAE credentials (TELR_STORE_ID, TELR_AUTH_KEY) are not configured.');
    }
    const res = await fetch('https://secure.telr.com/gateway/order.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'create',
        store: Number(this.storeId),
        authkey: this.authKey,
        order: {
          cartid: req.metadata.bookingRef || req.idempotencyKey,
          test: env.NODE_ENV !== 'production' ? '1' : '0',
          amount: (req.amountCents / 100).toFixed(2),
          currency: req.currency.toUpperCase(),
          description: `ServiceOS Booking ${req.metadata.bookingRef || ''}`.trim(),
        },
        return: {
          authorised: req.returnUrl || `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/complete`,
          declined: `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/declined`,
          cancelled: `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/cancelled`,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (!res.ok || !data?.order?.ref) {
      throw new Error(`Telr order creation failed: ${data?.error?.message || res.status}`);
    }
    return {
      gateway: 'telr',
      providerReferenceId: String(data.order.ref),
      clientSecret: null,
      redirectUrl: data.order.url || null,
      status: 'requires_action',
    };
  }

  async verifyPreAuth(providerReferenceId: string): Promise<VerifyPreAuthResult> {
    if (!this.isConfigured()) {
      throw new Error('Telr UAE credentials (TELR_STORE_ID, TELR_AUTH_KEY) are not configured.');
    }
    const res = await fetch('https://secure.telr.com/gateway/order.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'check',
        store: Number(this.storeId),
        authkey: this.authKey,
        order: { ref: providerReferenceId },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(`Telr order check failed with HTTP ${res.status}`);
    }
    const statusCode = Number(data?.order?.status?.code ?? 0);
    // Telr status codes: 2 = Authorised, 3 = Paid/Captured; negative/4/5/6 = Cancelled/Expired/Declined
    if (statusCode === 3 || statusCode === 2) {
      return {
        gateway: 'telr',
        providerReferenceId: String(data?.order?.ref || providerReferenceId),
        authorized: true,
        status: statusCode === 3 ? 'succeeded' : 'requires_capture',
        rawStatus: String(data?.order?.status?.text || statusCode),
      };
    }
    return {
      gateway: 'telr',
      providerReferenceId,
      authorized: false,
      status: statusCode < 0 || statusCode >= 4 ? 'failed' : 'pending',
      rawStatus: String(data?.order?.status?.text || statusCode),
    };
  }

  async cancelPreAuth(_providerReferenceId: string): Promise<void> {
    // Telr hosted checkouts expire automatically when uncaptured; no server void API needed.
  }

  async capture(_providerReferenceId: string, _amountCents?: number): Promise<CaptureResult> {
    throw new GatewayOperationNotSupportedError(
      'Telr direct server-side capture is not supported by this adapter; use hosted Telr sale flow or configure Stripe/PayTabs.'
    );
  }

  async refund(_req: RefundRequest): Promise<RefundResult> {
    throw new GatewayOperationNotSupportedError(
      'Telr direct server-side refunds are not supported by this adapter; process refunds via Telr Merchant Portal or configure Stripe/PayTabs.'
    );
  }
}

const adapters: Record<SupportedPaymentGateway, PaymentGatewayAdapter> = {
  stripe: new StripeGatewayAdapter(),
  paytabs: new PayTabsGatewayAdapter(),
  telr: new TelrGatewayAdapter(),
};

export function getPaymentGateway(override?: SupportedPaymentGateway): PaymentGatewayAdapter {
  const active = override || env.PAYMENT_GATEWAY || 'stripe';
  return adapters[active] || adapters.stripe;
}

export async function getTenantPaymentGateway(
  tenantId?: string,
  override?: SupportedPaymentGateway,
  targetPool: pg.Pool = pool
): Promise<{
  gateway: PaymentGatewayAdapter;
  secrets: DecryptedTenantIntegrations;
  isConfigured: boolean;
}> {
  const secrets = await resolveTenantIntegrationSecrets(tenantId, targetPool);
  const active = override || env.PAYMENT_GATEWAY || 'stripe';
  if (active === 'paytabs') {
    const adapter = new PayTabsGatewayAdapter(
      secrets.paytabsProfileId,
      secrets.paytabsServerKey,
      secrets.paytabsRegion
    );
    return { gateway: adapter, secrets, isConfigured: adapter.isConfigured() };
  }
  if (active === 'telr') {
    const adapter = new TelrGatewayAdapter(secrets.telrStoreId, secrets.telrAuthKey);
    return { gateway: adapter, secrets, isConfigured: adapter.isConfigured() };
  }
  const adapter = new StripeGatewayAdapter(secrets.stripeSecretKey);
  return { gateway: adapter, secrets, isConfigured: adapter.isConfigured() };
}
