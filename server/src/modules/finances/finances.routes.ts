import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import pg from 'pg';
import crypto from 'crypto';
import { pool, tenantQuery, withTenantTransaction } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { blockInDemoMode } from '../../middleware/demoGuard.js';
import { env } from '../../config/env.js';
import { getStripe, hasStripeConfigured, isDefinitiveStripeError } from '../../services/stripeClient.js';
import { resolveTenantIntegrationSecrets, getTenantPaymentGateway } from '../../services/paymentGateway.js';
import { broadcastBookingToNearbyProviders } from '../dispatch/dispatch.service.js';
import { getTechnicianEarningsSummary } from './earnings.service.js';
import { computeTaxAndCommissionSplit } from './ledgerMath.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class WebhookAbortError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function asValidUuid(v: unknown): string | null {
  return typeof v === 'string' && UUID_REGEX.test(v.trim()) ? v.trim() : null;
}

function extractWebhookLookupIds(eventType: string, event: any) {
  const obj = event?.data?.object || {};
  const meta = obj?.metadata || {};

  let piId: string | null = null;
  let transferId: string | null = null;
  let connectAccountId: string | null = null;

  if (
    eventType === 'payment_intent.succeeded' ||
    eventType === 'payment_intent.payment_failed' ||
    eventType === 'payment_intent.canceled' ||
    eventType === 'payment_intent.amount_capturable_updated'
  ) {
    piId = typeof obj.id === 'string' ? obj.id : null;
  } else if (eventType === 'charge.refunded') {
    piId = typeof obj.payment_intent === 'string' ? obj.payment_intent : null;
  } else if (eventType === 'transfer.paid' || eventType === 'transfer.reversed') {
    transferId = typeof obj.id === 'string' ? obj.id : null;
  } else if (eventType === 'payout.paid' || eventType === 'payout.failed') {
    const objId = typeof obj.id === 'string' ? obj.id : '';
    if (objId.startsWith('tr_')) {
      transferId = objId;
    } else if (objId.startsWith('po_') && typeof event.account === 'string') {
      connectAccountId = event.account;
    }
  }

  const txId = asValidUuid(meta.transactionId ?? meta.transaction_id);
  const invoiceId = asValidUuid(meta.invoiceId ?? meta.invoice_id);
  const bookingId = asValidUuid(meta.bookingId ?? meta.booking_id);

  const requiresExistingTarget =
    eventType === 'payment_intent.succeeded' ||
    eventType === 'payment_intent.payment_failed' ||
    eventType === 'payment_intent.canceled' ||
    eventType === 'payment_intent.amount_capturable_updated' ||
    eventType === 'charge.refunded' ||
    eventType === 'transfer.paid' ||
    eventType === 'transfer.reversed' ||
    ((eventType === 'payout.paid' || eventType === 'payout.failed') && Boolean(transferId));

  return { piId, invoiceId, transferId, bookingId, txId, connectAccountId, requiresExistingTarget };
}

async function postProportionalRefundLedger(
  client: pg.PoolClient,
  opts: {
    tenantId: string;
    txId: string;
    invoiceId: string;
    bookingStatus: string;
    totalCents: number;
    taxCents: number;
    commissionBps: number;
    prevRefundedCents: number;
    deltaRefundCents: number;
    refundKey: string;
    reasonDescription: string;
  }
): Promise<void> {
  if (opts.deltaRefundCents <= 0) return;

  const accRes = await client.query<{ id: string; account_number: string }>(
    `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
    [opts.tenantId]
  );
  const accounts = accRes.rows;
  const bankAssetAcc = accounts.find((a) => a.account_number === '1010')?.id;
  const escrowClearingAcc = accounts.find((a) => a.account_number === '1020')?.id;
  const clearingAcc = escrowClearingAcc || bankAssetAcc;
  const escrowLiabilityAcc = accounts.find((a) => a.account_number === '2010')?.id;
  const techPayableAcc = accounts.find((a) => a.account_number === '2020')?.id;
  let taxPayableAcc = accounts.find((a) => a.account_number === '2030')?.id;
  const platformRevAcc = accounts.find((a) => a.account_number === '4010')?.id;

  if (!clearingAcc) return;

  const keySuffix = opts.refundKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);

  if (opts.bookingStatus !== 'COMPLETED') {
    if (escrowLiabilityAcc) {
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
        [
          opts.tenantId,
          opts.txId,
          `REFUND_ESCROW:${keySuffix}`,
          escrowLiabilityAcc,
          clearingAcc,
          opts.deltaRefundCents,
          opts.reasonDescription,
        ]
      );
    }
    return;
  }

  const totalCents = Math.max(opts.totalCents, opts.prevRefundedCents + opts.deltaRefundCents);
  const taxCents = Math.min(totalCents, Math.max(0, opts.taxCents));
  const cumBefore = Math.max(0, Math.min(totalCents, opts.prevRefundedCents));
  const cumAfter = Math.max(cumBefore, Math.min(totalCents, opts.prevRefundedCents + opts.deltaRefundCents));

  const calcSplit = (cumRefunded: number) => {
    const taxPortion = totalCents > 0 ? Math.round((taxCents * cumRefunded) / totalCents) : 0;
    const preTaxPortion = Math.max(0, cumRefunded - taxPortion);
    const feePortion = Math.round((preTaxPortion * opts.commissionBps) / 10000);
    return { taxPortion, feePortion };
  };

  const before = calcSplit(cumBefore);
  const after = calcSplit(cumAfter);

  const safeTaxRev = Math.max(0, Math.min(opts.deltaRefundCents, after.taxPortion - before.taxPortion));
  const safeFeeRev = Math.max(0, Math.min(opts.deltaRefundCents - safeTaxRev, after.feePortion - before.feePortion));
  const safeTechRev = opts.deltaRefundCents - safeTaxRev - safeFeeRev;

  if (safeTaxRev > 0 && !taxPayableAcc) {
    const insTax = await client.query<{ id: string }>(
      `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type)
       VALUES ($1, '2030', 'Tax / VAT / GST Payable', 'LIABILITY')
       ON CONFLICT (tenant_id, account_number) DO UPDATE SET account_name = EXCLUDED.account_name
       RETURNING id`,
      [opts.tenantId]
    );
    taxPayableAcc = insTax.rows[0]?.id;
  }

  if (safeTaxRev > 0 && taxPayableAcc) {
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
      [
        opts.tenantId,
        opts.txId,
        `REFUND_TAX:${keySuffix}`,
        taxPayableAcc,
        clearingAcc,
        safeTaxRev,
        `Tax reversal for ${opts.reasonDescription}`,
      ]
    );
  }

  if (safeFeeRev > 0 && platformRevAcc) {
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
      [
        opts.tenantId,
        opts.txId,
        `REFUND_PLATFORM_FEE:${keySuffix}`,
        platformRevAcc,
        clearingAcc,
        safeFeeRev,
        `Platform commission reversal for ${opts.reasonDescription}`,
      ]
    );
  }

  if (safeTechRev > 0 && techPayableAcc) {
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
      [
        opts.tenantId,
        opts.txId,
        `REFUND_TECH_PAYABLE:${keySuffix}`,
        techPayableAcc,
        clearingAcc,
        safeTechRev,
        `Technician payable reversal for ${opts.reasonDescription}`,
      ]
    );
  }
}

const invoiceQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOID']).optional(),
});

const payoutTriggerSchema = z.object({
  providerId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  description: z.string().optional(),
});

type ResolvedTxResult =
  | { status: 'FOUND'; row: any }
  | { status: 'MISSING' }
  | { status: 'CONFLICT'; code: string; message: string };

/**
 * Sequential dual-key webhook resolution:
 *  1) Match by verified Stripe PaymentIntent ID first.
 *  2) Fallback to metadata.transactionId (strict UUID) ONLY where stripe_payment_intent_id IS NULL.
 *  3) Reject divergence between PaymentIntent ID, metadata.transactionId, and metadata.tenantId with 409.
 */
async function resolveWebhookPaymentTx(
  client: pg.PoolClient,
  stripePaymentIntentId: string,
  metadata?: Record<string, any>
): Promise<ResolvedTxResult> {
  const selectSql = `
    SELECT pt.id, pt.tenant_id, pt.invoice_id, pt.stripe_payment_intent_id,
           pt.authorized_amount_cents, pt.captured_amount_cents, pt.refunded_amount_cents,
           pt.currency, pt.status,
           i.booking_id, i.total_amount_cents, COALESCE(i.tax_total_cents, 0) AS tax_total_cents,
           i.commission_bps_snapshot,
           b.status as booking_status, b.assigned_provider_id,
           t.default_platform_commission_bps
    FROM payment_transactions pt
    JOIN invoices i ON i.id = pt.invoice_id
    JOIN bookings b ON b.id = i.booking_id
    JOIN tenants t ON t.id = pt.tenant_id`;

  const metaTxId = typeof metadata?.transactionId === 'string' && UUID_REGEX.test(metadata.transactionId)
    ? metadata.transactionId
    : null;
  const metaTenantId = typeof metadata?.tenantId === 'string' && UUID_REGEX.test(metadata.tenantId)
    ? metadata.tenantId
    : null;

  const byPiRes = await client.query(
    `${selectSql} WHERE pt.stripe_payment_intent_id = $1 FOR UPDATE OF pt`,
    [stripePaymentIntentId]
  );

  if (byPiRes.rows.length > 0) {
    const row = byPiRes.rows[0];
    if (metaTxId && row.id !== metaTxId) {
      return {
        status: 'CONFLICT',
        code: 'WEBHOOK_CORRELATION_CONFLICT',
        message: `Stripe PaymentIntent ${stripePaymentIntentId} maps to transaction ${row.id}, conflicting with metadata transactionId ${metaTxId}.`,
      };
    }
    if (metaTenantId && row.tenant_id !== metaTenantId) {
      return {
        status: 'CONFLICT',
        code: 'WEBHOOK_TENANT_MISMATCH',
        message: `Webhook metadata tenantId ${metaTenantId} mismatches payment transaction tenant ${row.tenant_id}.`,
      };
    }
    return { status: 'FOUND', row };
  }

  if (metaTxId) {
    const byMetaRes = await client.query(
      `${selectSql} WHERE pt.id = $1 FOR UPDATE OF pt`,
      [metaTxId]
    );
    if (byMetaRes.rows.length > 0) {
      const row = byMetaRes.rows[0];
      if (row.stripe_payment_intent_id && row.stripe_payment_intent_id !== stripePaymentIntentId) {
        return {
          status: 'CONFLICT',
          code: 'WEBHOOK_CORRELATION_CONFLICT',
          message: `Transaction ${row.id} is already bound to ${row.stripe_payment_intent_id}, conflicting with incoming ${stripePaymentIntentId}.`,
        };
      }
      if (metaTenantId && row.tenant_id !== metaTenantId) {
        return {
          status: 'CONFLICT',
          code: 'WEBHOOK_TENANT_MISMATCH',
          message: `Webhook metadata tenantId ${metaTenantId} mismatches payment transaction tenant ${row.tenant_id}.`,
        };
      }
      if (!row.stripe_payment_intent_id) {
        await client.query(
          `UPDATE payment_transactions
           SET stripe_payment_intent_id = $1, updated_at = NOW()
           WHERE id = $2 AND stripe_payment_intent_id IS NULL`,
          [stripePaymentIntentId, row.id]
        );
        row.stripe_payment_intent_id = stripePaymentIntentId;
      }
      return { status: 'FOUND', row };
    }
  }

  return { status: 'MISSING' };
}

export async function financeRoutes(fastify: FastifyInstance) {
  // Capture raw body buffer for Stripe webhook HMAC signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as any).rawBody = body;
      const json = JSON.parse((body as Buffer).toString('utf8'));
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Public Inbound Stripe Webhook (Idempotent Event Processing & HMAC Signature Verification)
  fastify.post('/webhooks/stripe', {
    schema: {
      tags: ['Finances & Ledger'],
      summary: 'Inbound Stripe webhook listener with idempotency verification and signature verification',
    }
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const sig = request.headers['stripe-signature'] as string;
    let event: any = request.body;

    // Enforce HMAC signature verification in production and whenever STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is configured
    if (env.STRIPE_WEBHOOK_SECRET) {
      if (!sig) {
        return reply.status(400).send(
          errorResponse('MISSING_STRIPE_SIGNATURE', 'Missing Stripe signature header.', requestId)
        );
      }
      try {
        const stripe = getStripe(env.STRIPE_SECRET_KEY || '');
        const rawPayload = (request as any).rawBody || (typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
        event = stripe.webhooks.constructEvent(rawPayload, sig, env.STRIPE_WEBHOOK_SECRET);
      } catch (sigErr: any) {
        return reply.status(400).send(
          errorResponse('INVALID_STRIPE_SIGNATURE', `Signature verification failed: ${sigErr.message}`, requestId)
        );
      }
    } else if (env.NODE_ENV === 'production' || env.STRIPE_SECRET_KEY) {
      return reply.status(500).send(
        errorResponse('WEBHOOK_SECRET_MISSING', 'STRIPE_WEBHOOK_SECRET is required to process inbound webhooks.', requestId)
      );
    }

    if (!event || !event.id || !event.type) {
      return reply.status(400).send(
        errorResponse('INVALID_PAYLOAD', 'Missing Stripe event payload or id', requestId)
      );
    }

    const eventId = event.id;
    const eventType = event.type;
    const lookup = extractWebhookLookupIds(eventType, event);

    // Resolve tenant BEFORE opening DB transaction via SECURITY DEFINER helper so FORCE RLS is bound
    const tLookupRes = await pool.query<{ tenant_id: string | null }>(
      `SELECT rls_resolve_webhook_tenant($1, $2, $3, $4, $5, $6) AS tenant_id`,
      [lookup.piId, lookup.invoiceId, lookup.transferId, lookup.bookingId, lookup.txId, lookup.connectAccountId]
    );
    const webhookTenantId = tLookupRes.rows[0]?.tenant_id ?? null;

    if (!webhookTenantId) {
      if (lookup.requiresExistingTarget) {
        return reply.status(503).send(
          errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Referenced payment transaction is not committed yet; retry later.', requestId)
        );
      }
      await pool.query(
        `SELECT rls_record_unmatched_webhook_event($1, 'stripe', $2, $3::jsonb)`,
        [eventId, eventType, JSON.stringify(event)]
      );
      return reply.status(200).send({ received: true });
    }

    // 1. Transactional & Atomic Idempotency Event Claim (rolled back if WebhookAbortError thrown)
    let webhookOutcome: { status: number; body: any };
    try {
      webhookOutcome = await withTenantTransaction(webhookTenantId, async (client) => {
        const claimRes = await client.query(
          `INSERT INTO webhook_events (id, provider, event_type, tenant_id, processed_at, payload)
           VALUES ($1, 'stripe', $2, $3, NOW(), $4)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [eventId, eventType, webhookTenantId, JSON.stringify(event)]
        );

        if (claimRes.rowCount === 0) {
          return { status: 200, body: { received: true, idempotent: true } };
        }

        // 2. Process Known Events Atomically with Tenant, Amount, Currency and State Validation
        if (eventType === 'payment_intent.succeeded') {
          const paymentIntent = event.data?.object;
          if (!paymentIntent?.id) {
            throw new WebhookAbortError(400, 'INVALID_PAYLOAD', 'Missing paymentIntent.id');
          }

        const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
        if (resolved.status === 'CONFLICT') {
          throw new WebhookAbortError(409, resolved.code, resolved.message);
        }
        if (resolved.status === 'MISSING') {
          throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', 'Referenced payment transaction is not committed yet; retry later.');
        }

        const tx = resolved.row;
        const amountReceived = paymentIntent.amount_received ?? paymentIntent.amount;
        const eventCurrency = (paymentIntent.currency || 'usd').toUpperCase();
        const authorizedCents = parseInt(tx.authorized_amount_cents, 10);
        const txCurrency = (tx.currency || 'usd').toUpperCase();

        // Strict Discrepancy Quarantine: Check amount and currency
        if (amountReceived !== authorizedCents || eventCurrency !== txCurrency) {
          await client.query(
            `UPDATE payment_transactions 
             SET status = 'DISCREPANCY_QUARANTINED', error_message = $1, updated_at = NOW() 
             WHERE id = $2`,
            [`Amount/currency mismatch: received ${amountReceived} ${eventCurrency}, expected ${authorizedCents} ${txCurrency}`, tx.id]
          );
        } else {
          // 1. Settle Payment Transaction (idempotent transition to SUCCEEDED)
          await client.query(
            `UPDATE payment_transactions 
             SET status = 'SUCCEEDED', captured_amount_cents = $1, updated_at = NOW() 
             WHERE id = $2 AND status IN ('PENDING', 'REQUIRES_CAPTURE', 'SUCCEEDED')`,
            [amountReceived, tx.id]
          );

          // 2. Settle Invoice (never overwrite PARTIALLY_REFUNDED or REFUNDED statuses)
          await client.query(
            `UPDATE invoices 
             SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() 
             WHERE id = $1 AND status IN ('DRAFT', 'AUTHORIZED')`,
            [tx.invoice_id]
          );

          // 3. Post Double-Entry Ledger Entries
          const accRes = await client.query(
            `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
            [tx.tenant_id]
          );
          const accounts = accRes.rows;
          const bankAssetAcc = accounts.find(a => a.account_number === '1010')?.id;
          const escrowClearingAcc = accounts.find(a => a.account_number === '1020')?.id || bankAssetAcc;
          const escrowLiabilityAcc = accounts.find(a => a.account_number === '2010')?.id;
          const techPayableAcc = accounts.find(a => a.account_number === '2020')?.id;
          let taxPayableAcc = accounts.find(a => a.account_number === '2030')?.id;
          const platformRevAcc = accounts.find(a => a.account_number === '4010')?.id;

          // Always record ESCROW_CAPTURE on capture: Dr 1020 (Stripe Holding Escrow Clearing) / Cr 2010 (Customer Escrow Liability)
          if (escrowClearingAcc && escrowLiabilityAcc && amountReceived > 0) {
            await client.query(
              `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, 'ESCROW_CAPTURE', $3, $4, $5, $6)
               ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
              [tx.tenant_id, tx.id, escrowClearingAcc, escrowLiabilityAcc, amountReceived, `Escrow captured via webhook for invoice ${tx.invoice_id}`]
            );
          }

          // Release Escrow to Tax (2030), Platform Revenue (4010) and Tech Payable (2020) ONLY when booking work is COMPLETED
          if (tx.booking_status === 'COMPLETED') {
            const totalCents = Number(tx.total_amount_cents ?? amountReceived);
            const rawTaxCents = Math.min(totalCents, Math.max(0, Number(tx.tax_total_cents ?? 0)));
            const commissionBps = Number(tx.commission_bps_snapshot ?? tx.default_platform_commission_bps ?? 1500);
            const split = computeTaxAndCommissionSplit(totalCents, rawTaxCents, commissionBps);
            const taxCents = split.taxCents;
            const platformFeeCents = split.platformFeeCents;
            const netTechPayoutCents = split.techPayoutCents;

            if (taxCents > 0 && !taxPayableAcc) {
              const insTax = await client.query<{ id: string }>(
                `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type)
                 VALUES ($1, '2030', 'Tax / VAT / GST Payable', 'LIABILITY')
                 ON CONFLICT (tenant_id, account_number) DO UPDATE SET account_name = EXCLUDED.account_name
                 RETURNING id`,
                [tx.tenant_id]
              );
              taxPayableAcc = insTax.rows[0]?.id;
            }

            if (escrowLiabilityAcc && taxPayableAcc && taxCents > 0) {
              await client.query(
                `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                 VALUES ($1, $2, 'TAX_PAYABLE', $3, $4, $5, $6)
                 ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
                [tx.tenant_id, tx.id, escrowLiabilityAcc, taxPayableAcc, taxCents, `Tax payable via webhook for invoice ${tx.invoice_id}`]
              );
            }

            if (escrowLiabilityAcc && platformRevAcc && platformFeeCents > 0) {
              await client.query(
                `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                 VALUES ($1, $2, 'PLATFORM_FEE', $3, $4, $5, $6)
                 ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
                [tx.tenant_id, tx.id, escrowLiabilityAcc, platformRevAcc, platformFeeCents, `Platform fee via webhook for invoice ${tx.invoice_id}`]
              );
            }

            if (escrowLiabilityAcc && techPayableAcc && netTechPayoutCents > 0) {
              await client.query(
                `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                 VALUES ($1, $2, 'TECH_PAYABLE', $3, $4, $5, $6)
                 ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
                [tx.tenant_id, tx.id, escrowLiabilityAcc, techPayableAcc, netTechPayoutCents, `Technician payable via webhook for invoice ${tx.invoice_id}`]
              );
            }
          }
        }
      } else if (eventType === 'payment_intent.payment_failed') {
        const paymentIntent = event.data?.object;
        if (paymentIntent?.id) {
          const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
          if (resolved.status === 'CONFLICT') {
            throw new WebhookAbortError(409, resolved.code, resolved.message);
          }
          if (resolved.status === 'MISSING') {
            throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.');
          }
          await client.query(
            `UPDATE payment_transactions 
             SET status = 'FAILED', updated_at = NOW() 
             WHERE id = $1 AND status NOT IN ('SUCCEEDED', 'REFUNDED')`,
            [resolved.row.id]
          );
        }
      } else if (eventType === 'payment_intent.canceled') {
        const paymentIntent = event.data?.object;
        if (paymentIntent?.id) {
          const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
          if (resolved.status === 'CONFLICT') {
            throw new WebhookAbortError(409, resolved.code, resolved.message);
          }
          if (resolved.status === 'MISSING') {
            throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.');
          }
          await client.query(
            `UPDATE payment_transactions 
             SET status = 'VOIDED', updated_at = NOW() 
             WHERE id = $1 AND status NOT IN ('SUCCEEDED', 'REFUNDED')`,
            [resolved.row.id]
          );
        }
      } else if (eventType === 'charge.refunded') {
        const charge = event.data?.object;
        if (charge?.payment_intent) {
          const resolved = await resolveWebhookPaymentTx(client, charge.payment_intent, charge.metadata);
          if (resolved.status === 'CONFLICT') {
            throw new WebhookAbortError(409, resolved.code, resolved.message);
          }
          if (resolved.status === 'MISSING') {
            throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.');
          }
          const tx = resolved.row;
          const cumulativeRefunded = Math.max(0, Number(charge.amount_refunded || 0));
          const prevRefunded = Math.max(0, Number(tx.refunded_amount_cents || 0));
          const totalCents = Number(tx.total_amount_cents || tx.captured_amount_cents || tx.authorized_amount_cents || 0);
          const capturedCap = Number(tx.captured_amount_cents || 0) > 0
            ? Number(tx.captured_amount_cents)
            : totalCents;
          const boundedRefunded = Math.min(capturedCap, cumulativeRefunded);

          // Deduplicate against already-posted payment_refunds initiated from POST /finances/refunds
          const existingRefundsRes = await client.query<{
            id: string;
            stripe_refund_id: string | null;
            amount_cents: string;
            ledger_posted: boolean;
          }>(
            `SELECT id, stripe_refund_id, amount_cents, ledger_posted
             FROM payment_refunds
             WHERE payment_transaction_id = $1
             FOR UPDATE`,
            [tx.id]
          );

          const stripeRefundIds = Array.isArray(charge.refunds?.data)
            ? charge.refunds.data.map((r: any) => String(r?.id || '')).filter(Boolean)
            : [];

          if (stripeRefundIds.length > 0) {
            await client.query(
              `UPDATE payment_refunds
               SET stripe_event_id = COALESCE(stripe_event_id, $1), updated_at = NOW()
               WHERE payment_transaction_id = $2
                 AND stripe_refund_id = ANY($3::text[])
                 AND stripe_event_id IS NULL`,
              [eventId, tx.id, stripeRefundIds]
            );
          }

          const alreadyLedgerPostedCents = existingRefundsRes.rows
            .filter((r) => r.ledger_posted)
            .reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);

          const effectivePrev = Math.max(prevRefunded, alreadyLedgerPostedCents);
          const deltaRefundCents = Math.max(0, boundedRefunded - effectivePrev);
          const effectiveTotalForRatio = capturedCap > 0 ? capturedCap : totalCents;
          const isFullRefund = effectiveTotalForRatio > 0 && boundedRefunded >= effectiveTotalForRatio;

          if (boundedRefunded > 0) {
            await client.query(
              `UPDATE payment_transactions
               SET status = CASE WHEN $1 THEN 'REFUNDED' ELSE status END,
                   refunded_amount_cents = LEAST(GREATEST(captured_amount_cents, total_amount_cents_cap.val), GREATEST(refunded_amount_cents, $2)),
                   updated_at = NOW()
               FROM (SELECT $4::bigint AS val) AS total_amount_cents_cap
               WHERE id = $3`,
              [isFullRefund, boundedRefunded, tx.id, effectiveTotalForRatio]
            );

            await client.query(
              `UPDATE invoices
               SET status = CASE WHEN $1 THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
                   refunded_amount_cents = LEAST(total_amount_cents, GREATEST(refunded_amount_cents, $2)),
                   updated_at = NOW()
               WHERE id = $3`,
              [isFullRefund, boundedRefunded, tx.invoice_id]
            );
          }

          if (deltaRefundCents > 0) {
            const firstRefundId = stripeRefundIds.length > 0 ? stripeRefundIds[0] : null;
            await client.query(
              `INSERT INTO payment_refunds (
                tenant_id, payment_transaction_id, invoice_id, booking_id,
                idempotency_key, stripe_refund_id, stripe_event_id,
                amount_cents, currency, reason, status, ledger_posted
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SUCCEEDED', TRUE)
              ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
              [
                tx.tenant_id,
                tx.id,
                tx.invoice_id,
                tx.booking_id,
                `wh_refund_${eventId}`,
                firstRefundId,
                eventId,
                deltaRefundCents,
                (tx.currency || 'AED').toUpperCase(),
                'Stripe webhook charge.refunded reconciliation',
              ]
            );

            await postProportionalRefundLedger(client, {
              tenantId: tx.tenant_id,
              txId: tx.id,
              invoiceId: tx.invoice_id,
              bookingStatus: tx.booking_status,
              totalCents: effectiveTotalForRatio,
              taxCents: Number(tx.tax_total_cents || 0),
              commissionBps: Number(tx.commission_bps_snapshot ?? tx.default_platform_commission_bps ?? 1500),
              prevRefundedCents: effectivePrev,
              deltaRefundCents,
              refundKey: eventId,
              reasonDescription: `invoice ${tx.invoice_id} (${eventId})`,
            });
          }
        }
      } else if (eventType === 'transfer.paid' || eventType === 'payout.paid') {
        const transfer = event.data?.object;
        if (transfer?.id) {
          const objId = String(transfer.id);
          if (objId.startsWith('po_') && eventType === 'payout.paid') {
            if (event.account) {
              const provRes = await client.query(
                `SELECT tenant_id, user_id FROM provider_profiles WHERE stripe_connect_account_id = $1`,
                [event.account]
              );
              if (provRes.rows.length > 0) {
                await client.query(
                  `INSERT INTO audit_logs (tenant_id, actor_role, action, resource_type, resource_id, diff_payload)
                   VALUES ($1, 'SYSTEM', 'CONNECTED_ACCOUNT_PAYOUT_PAID', 'provider_profile', $2, $3)`,
                  [
                    provRes.rows[0].tenant_id,
                    provRes.rows[0].user_id,
                    JSON.stringify({ stripePayoutId: objId, connectAccount: event.account })
                  ]
                );
              }
            }
          } else {
            const existsRes = await client.query(
              `SELECT id, status FROM provider_payouts WHERE stripe_transfer_id = $1 FOR UPDATE`,
              [objId]
            );
            if (existsRes.rows.length === 0) {
              throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', `Payout for Stripe transfer ${objId} not committed yet.`);
            }
            await client.query(
              `UPDATE provider_payouts
               SET status = 'PAID', processed_at = COALESCE(processed_at, NOW()), updated_at = NOW()
               WHERE id = $1 AND status IN ('PROCESSING', 'PENDING_PROVIDER_CONFIRMATION')`,
              [existsRes.rows[0].id]
            );
          }
        }
      } else if (eventType === 'transfer.reversed') {
        const transfer = event.data?.object;
        if (transfer?.id) {
          const payoutRes = await client.query<{
            id: string;
            tenant_id: string;
            provider_id: string;
            amount_cents: string;
            amount_reversed_cents: string;
            status: string;
          }>(
            `SELECT id, tenant_id, provider_id, amount_cents, amount_reversed_cents, status
             FROM provider_payouts
             WHERE stripe_transfer_id = $1
             FOR UPDATE`,
            [transfer.id]
          );

          if (payoutRes.rows.length === 0) {
            throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', `Payout for Stripe transfer ${transfer.id} not found yet.`);
          }

          const payout = payoutRes.rows[0];
          const totalCents = parseInt(payout.amount_cents, 10);
          const alreadyReversed = parseInt(payout.amount_reversed_cents || '0', 10);
          const cumulativeReversed = Number(transfer.amount_reversed ?? transfer.amount ?? 0);

          if (cumulativeReversed <= 0 || cumulativeReversed > totalCents) {
            throw new WebhookAbortError(422, 'INVALID_REVERSAL_AMOUNT', `Cumulative reversal ${cumulativeReversed} is out of bounds for payout amount ${totalCents}.`);
          }

          if (cumulativeReversed <= alreadyReversed) {
            // Stale out-of-order or duplicate reversal event: ignore delta, claim idempotently
            return { status: 200, body: { received: true, idempotent: true } };
          }

          const deltaCents = cumulativeReversed - alreadyReversed;
          const stripeReversalId = transfer.reversals?.data?.[0]?.id || null;

          const revInsertRes = await client.query<{ id: string }>(
            `INSERT INTO provider_payout_reversals (
               tenant_id, payout_id, stripe_event_id, stripe_reversal_id, delta_amount_cents, cumulative_reversed_cents
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (stripe_event_id) DO NOTHING
             RETURNING id`,
            [payout.tenant_id, payout.id, eventId, stripeReversalId, deltaCents, cumulativeReversed]
          );

          if (revInsertRes.rows.length > 0) {
            const newPayoutStatus = cumulativeReversed === totalCents ? 'REVERSED' : 'PARTIALLY_REVERSED';
            await client.query(
              `UPDATE provider_payouts
               SET amount_reversed_cents = $1, status = $2, updated_at = NOW()
               WHERE id = $3`,
              [cumulativeReversed, newPayoutStatus, payout.id]
            );

            // Reversal delta ledger entry: mirrors PAYOUT_DISBURSAL (Dr 1010 Operating Cash / Cr 2020 Tech Payable)
            const accRes = await client.query(
              `SELECT id, account_number FROM ledger_accounts
               WHERE tenant_id = $1 AND account_number IN ('1010', '2020')`,
              [payout.tenant_id]
            );
            const bankAsset = accRes.rows.find(a => a.account_number === '1010');
            const techPayable = accRes.rows.find(a => a.account_number === '2020');

            if (bankAsset && techPayable) {
              const postingType = `PAYOUT_REVERSAL_${revInsertRes.rows[0].id.replace(/-/g, '').slice(0, 24)}`;
              await client.query(
                `INSERT INTO ledger_entries (tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (payout_id, posting_type) DO NOTHING`,
                [
                  payout.tenant_id,
                  payout.id,
                  postingType,
                  bankAsset.id,
                  techPayable.id,
                  deltaCents,
                  `Reversal delta (${deltaCents} cents) for transfer ${transfer.id}`
                ]
              );
            }
          }
        }
      } else if (eventType === 'payout.failed') {
        const payoutObj = event.data?.object;
        if (payoutObj?.id) {
          const objId = String(payoutObj.id);
          // A Stripe connected-account payout ID (po_...) is NOT a platform transfer ID (tr_...).
          if (objId.startsWith('po_')) {
            if (event.account) {
              const provRes = await client.query(
                `SELECT tenant_id, user_id FROM provider_profiles WHERE stripe_connect_account_id = $1`,
                [event.account]
              );
              if (provRes.rows.length > 0) {
                await client.query(
                  `INSERT INTO audit_logs (tenant_id, actor_role, action, resource_type, resource_id, diff_payload)
                   VALUES ($1, 'SYSTEM', 'CONNECTED_ACCOUNT_PAYOUT_FAILED', 'provider_profile', $2, $3)`,
                  [
                    provRes.rows[0].tenant_id,
                    provRes.rows[0].user_id,
                    JSON.stringify({ stripePayoutId: objId, connectAccount: event.account, failureCode: payoutObj.failure_code })
                  ]
                );
              }
            }
          } else if (objId.startsWith('tr_')) {
            const existsRes = await client.query<{
              id: string;
              tenant_id: string;
              amount_cents: string;
              amount_reversed_cents: string | null;
              status: string;
            }>(
              `SELECT id, tenant_id, amount_cents, amount_reversed_cents, status
               FROM provider_payouts WHERE stripe_transfer_id = $1 FOR UPDATE`,
              [objId]
            );
              if (existsRes.rows.length === 0) {
                throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', `Payout for failed transfer ${objId} not committed yet.`);
              }
              const fp = existsRes.rows[0];
              if (fp.status !== 'FAILED') {
                await client.query(
                  `UPDATE provider_payouts SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
                  [fp.id]
                );
                const unreversedCents = Math.max(0, Number(fp.amount_cents) - Number(fp.amount_reversed_cents || 0));
                const accRes = await client.query(
                  `SELECT id, account_number FROM ledger_accounts
                   WHERE tenant_id = $1 AND account_number IN ('1010', '2020')`,
                  [fp.tenant_id]
                );
                const bankAsset = accRes.rows.find((a) => a.account_number === '1010');
                const techPayable = accRes.rows.find((a) => a.account_number === '2020');
                if (bankAsset && techPayable && unreversedCents > 0) {
                  await client.query(
                    `INSERT INTO ledger_entries (tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                     VALUES ($1, $2, 'PAYOUT_FAILED_REVERSAL', $3, $4, $5, $6)
                     ON CONFLICT (payout_id, posting_type) DO NOTHING`,
                    [fp.tenant_id, fp.id, bankAsset.id, techPayable.id, unreversedCents, `Failed payout reversal for transfer ${objId}`]
                  );
                }
              }
            }
          }
        } else if (eventType === 'payment_intent.amount_capturable_updated') {
          const paymentIntent = event.data?.object;
          if (paymentIntent?.id) {
            const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
            if (resolved.status === 'CONFLICT') {
              throw new WebhookAbortError(409, resolved.code, resolved.message);
            }
            if (resolved.status === 'MISSING') {
              throw new WebhookAbortError(503, 'WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.');
            }
            // Authorization only: advance PENDING -> REQUIRES_CAPTURE without downgrading SUCCEEDED or posting revenue ledger
            if (resolved.row.status === 'PENDING' && paymentIntent.status === 'requires_capture') {
              await client.query(
                `UPDATE payment_transactions SET status = 'REQUIRES_CAPTURE', updated_at = NOW() WHERE id = $1 AND status = 'PENDING'`,
                [resolved.row.id]
              );
              await client.query(
                `UPDATE invoices SET status = 'AUTHORIZED', updated_at = NOW() WHERE id = $1 AND status = 'DRAFT'`,
                [resolved.row.invoice_id]
              );
              await client.query('SAVEPOINT sp_broadcast_webhook');
              try {
                await broadcastBookingToNearbyProviders(client, resolved.row.tenant_id, resolved.row.booking_id);
                await client.query('RELEASE SAVEPOINT sp_broadcast_webhook');
              } catch {
                await client.query('ROLLBACK TO SAVEPOINT sp_broadcast_webhook');
              }
            }
          }
        }

        return { status: 200, body: { received: true } };
      });
    } catch (err: any) {
      if (err instanceof WebhookAbortError) {
        return reply.status(err.status).send(errorResponse(err.code, err.message, requestId));
      }
      throw err;
    }

    return reply.status(webhookOutcome.status).send(webhookOutcome.body);
  });

  // Technician Self-Earnings Route (Authenticated Technician, or Admin/Staff with ?providerId=)
  fastify.get('/technician/earnings', {
    preHandler: [authenticate],
    schema: {
      tags: ['Finances & Ledger'],
      summary: 'Get authenticated technician personal earnings summary and payout history',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;
    const role = request.user!.role;
    const requestedProviderId = (request.query as { providerId?: string } | undefined)?.providerId;

    if (role === 'CUSTOMER') {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Customers cannot access technician earnings endpoints.', requestId)
      );
    }
    if (role === 'TECHNICIAN' && requestedProviderId && requestedProviderId !== request.user!.id) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', 'Technicians can only view their own earnings.', requestId)
      );
    }

    const targetProviderId =
      role === 'TECHNICIAN' ? request.user!.id : (requestedProviderId || request.user!.id);
    if (!asValidUuid(targetProviderId)) {
      return reply.status(400).send(
        errorResponse('VALIDATION_ERROR', 'Valid providerId UUID is required.', requestId)
      );
    }

    const summary = await getTechnicianEarningsSummary(tenantId, targetProviderId, request.tenant?.currencyCode);
    if (!summary) {
      return reply.status(404).send(
        errorResponse('PROVIDER_PROFILE_NOT_FOUND', 'Technician profile not found in this organization.', requestId)
      );
    }

    return reply.status(200).send(successResponse(summary, requestId));
  });

  // Protected Routes Group
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);
    protectedRoutes.addHook('preHandler', requirePermission('finance:dashboard:view'));

    // 1. Executive Financial Metrics Overview (Shared Handler for /overview & /metrics)
    const getOverviewMetricsHandler = async (request: any, reply: any) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const { startDate, endDate } = (request.query || {}) as { startDate?: string; endDate?: string };

      const params: any[] = [tenantId];
      let dateFilter = '';
      if (startDate) {
        params.push(startDate);
        dateFilter += ` AND issued_at >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        dateFilter += ` AND issued_at <= $${params.length}`;
      }

      const [grossRes, accountsRes, recentTxRes] = await Promise.all([
        tenantQuery(
          `SELECT 
            COALESCE(SUM(CASE WHEN status NOT IN ('DRAFT', 'VOID', 'REFUNDED')
              THEN GREATEST(0, total_amount_cents - COALESCE(refunded_amount_cents, 0)) ELSE 0 END), 0)::bigint as "grossVolumeCents",
            COALESCE(SUM(CASE WHEN status IN ('PAID', 'PARTIALLY_REFUNDED')
              THEN GREATEST(0, total_amount_cents - COALESCE(refunded_amount_cents, 0)) ELSE 0 END), 0)::bigint as "settledVolumeCents",
            COALESCE(SUM(CASE WHEN status NOT IN ('DRAFT', 'VOID')
              THEN COALESCE(refunded_amount_cents, 0) ELSE 0 END), 0)::bigint as "refundedVolumeCents",
            COALESCE(SUM(CASE WHEN status IN ('PAID', 'PARTIALLY_REFUNDED')
              THEN GREATEST(0, ROUND(COALESCE(tax_total_cents, 0)::numeric * GREATEST(0, total_amount_cents - COALESCE(refunded_amount_cents, 0))::numeric / GREATEST(1, total_amount_cents)::numeric))
              ELSE 0 END), 0)::bigint as "taxCollectedCents",
            COUNT(CASE WHEN status NOT IN ('DRAFT', 'VOID') THEN 1 END)::int as "totalInvoicesCount",
            COUNT(CASE WHEN status IN ('PAID', 'PARTIALLY_REFUNDED') THEN 1 END)::int as "paidInvoicesCount"
           FROM invoices 
           WHERE tenant_id = $1 ${dateFilter}`,
          params,
          tenantId
        ),
        tenantQuery(
          `SELECT account_number as "accountNumber", account_name as "accountName", account_type as "accountType"
           FROM ledger_accounts
           WHERE tenant_id = $1
           ORDER BY account_number ASC`,
          [tenantId],
          tenantId
        ),
        tenantQuery(
          `SELECT pt.id, pt.stripe_payment_intent_id as "paymentIntentId", pt.authorized_amount_cents as "authorizedAmountCents",
                  pt.captured_amount_cents as "capturedAmountCents", pt.refunded_amount_cents as "refundedAmountCents",
                  pt.transaction_type as "transactionType", pt.status, pt.currency, pt.created_at as "createdAt",
                  inv.invoice_number as "invoiceNumber"
           FROM payment_transactions pt
           JOIN invoices inv ON inv.id = pt.invoice_id
           WHERE pt.tenant_id = $1
           ORDER BY pt.created_at DESC LIMIT 10`,
          [tenantId],
          tenantId
        )
      ]);

      const metrics = grossRes.rows[0];

      return reply.status(200).send(
        successResponse({
          currency: (request.tenant?.currencyCode || 'AED').toUpperCase(),
          grossVolumeCents: Number(metrics.grossVolumeCents || 0),
          settledVolumeCents: Number(metrics.settledVolumeCents || 0),
          refundedVolumeCents: Number(metrics.refundedVolumeCents || 0),
          taxCollectedCents: Number(metrics.taxCollectedCents || 0),
          totalInvoicesCount: Number(metrics.totalInvoicesCount || 0),
          paidInvoicesCount: Number(metrics.paidInvoicesCount || 0),
          accounts: accountsRes.rows,
          recentTransactions: recentTxRes.rows.map((tx: any) => ({
            ...tx,
            authorizedAmountCents: Number(tx.authorizedAmountCents || 0),
            capturedAmountCents: Number(tx.capturedAmountCents || 0),
            refundedAmountCents: Number(tx.refundedAmountCents || 0),
          })),
        }, requestId)
      );
    };

    protectedRoutes.get('/overview', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Executive financial metrics, gross turnover, commissions, and escrow balance',
        security: [{ bearerAuth: [] }]
      }
    }, getOverviewMetricsHandler);

    // 1b. Executive Financial Metrics Alias (WEB-01)
    protectedRoutes.get('/metrics', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Executive financial metrics alias',
        security: [{ bearerAuth: [] }]
      }
    }, getOverviewMetricsHandler);

    // 2. List Invoices with Filter and Pagination
    protectedRoutes.get('/invoices', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'List itemized invoices',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const parsed = invoiceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', 'Invalid invoice query parameters', requestId)
        );
      }

      const { page, limit, status } = parsed.data;
      const offset = (page - 1) * limit;

      let countQuery = `SELECT COUNT(id)::int as total FROM invoices WHERE tenant_id = $1`;
      let dataQuery = `
        SELECT 
          inv.id,
          inv.invoice_number as "invoiceNumber",
          inv.booking_id as "bookingId",
          b.booking_reference as "bookingReference",
          cp.full_name as "customerName",
          pp.full_name as "providerName",
          s.name as "serviceName",
          inv.labor_subtotal_cents as "laborSubtotalCents",
          inv.parts_subtotal_cents as "partsSubtotalCents",
          inv.tax_total_cents as "taxTotalCents",
          inv.total_amount_cents as "totalAmountCents",
          inv.status,
          inv.issued_at as "issuedAt",
          inv.paid_at as "paidAt"
        FROM invoices inv
        JOIN bookings b ON b.id = inv.booking_id
        JOIN customer_profiles cp ON cp.user_id = b.customer_id
        LEFT JOIN provider_profiles pp ON pp.user_id = b.assigned_provider_id
        JOIN services s ON s.id = b.service_id
        WHERE inv.tenant_id = $1
      `;

      const params: any[] = [tenantId];
      if (status) {
        params.push(status);
        countQuery += ` AND status = $2`;
        dataQuery += ` AND inv.status = $2`;
      }

      dataQuery += ` ORDER BY inv.issued_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const [countRes, dataRes] = await Promise.all([
        tenantQuery(countQuery, params, tenantId),
        tenantQuery(dataQuery, [...params, limit, offset], tenantId)
      ]);

      const total = Number(countRes.rows[0]?.total || 0);

      return reply.status(200).send(
        successResponse(
          dataRes.rows.map((inv: any) => ({
            ...inv,
            laborSubtotalCents: Number(inv.laborSubtotalCents || 0),
            partsSubtotalCents: Number(inv.partsSubtotalCents || 0),
            taxTotalCents: Number(inv.taxTotalCents || 0),
            totalAmountCents: Number(inv.totalAmountCents || 0),
          })),
          requestId,
          {
            page,
            limit,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
          }
        )
      );
    });

    // 3. Single Invoice Detail with Line Items
    protectedRoutes.get('/invoices/:id', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Get single itemized invoice with line items and payment transactions',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const { id: invoiceId } = request.params as { id: string };

      const invRes = await tenantQuery(
        `SELECT 
          inv.id,
          inv.invoice_number as "invoiceNumber",
          inv.booking_id as "bookingId",
          b.booking_reference as "bookingReference",
          cp.full_name as "customerName",
          u_cust.email as "customerEmail",
          pp.full_name as "providerName",
          inv.labor_subtotal_cents as "laborSubtotalCents",
          inv.parts_subtotal_cents as "partsSubtotalCents",
          inv.diagnostic_fee_cents as "diagnosticFeeCents",
          inv.tax_rate_bps as "taxRateBps",
          inv.tax_total_cents as "taxTotalCents",
          inv.discount_cents as "discountCents",
          inv.total_amount_cents as "totalAmountCents",
          inv.status,
          inv.issued_at as "issuedAt",
          inv.paid_at as "paidAt"
        FROM invoices inv
        JOIN bookings b ON b.id = inv.booking_id
        JOIN customer_profiles cp ON cp.user_id = b.customer_id
        JOIN users u_cust ON u_cust.id = cp.user_id
        LEFT JOIN provider_profiles pp ON pp.user_id = b.assigned_provider_id
        WHERE inv.id = $1 AND inv.tenant_id = $2`,
        [invoiceId, tenantId],
        tenantId
      );

      if (invRes.rowCount === 0) {
        return reply.status(404).send(
          errorResponse('NOT_FOUND', 'Invoice not found', requestId)
        );
      }

      const [itemsRes, txRes] = await Promise.all([
        tenantQuery(
          `SELECT id, description, item_type as "itemType", quantity, unit_price_cents as "unitPriceCents", total_cents as "totalCents"
           FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC`,
          [invoiceId],
          tenantId
        ),
        tenantQuery(
          `SELECT id, stripe_payment_intent_id as "paymentIntentId", idempotency_key as "idempotencyKey",
                  authorized_amount_cents as "authorizedAmountCents", captured_amount_cents as "capturedAmountCents",
                  transaction_type as "transactionType", status, created_at as "createdAt"
           FROM payment_transactions WHERE invoice_id = $1 ORDER BY created_at DESC`,
          [invoiceId],
          tenantId
        )
      ]);

      return reply.status(200).send(
        successResponse({
          ...invRes.rows[0],
          items: itemsRes.rows,
          transactions: txRes.rows
        }, requestId)
      );
    });

    // 3b. Create or Upsert Draft Invoice for a Booking (Admin / Staff)
    protectedRoutes.post('/invoices', {
      preHandler: [blockInDemoMode('Creating or updating invoices')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Create or update an itemized draft invoice for a booking',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const createInvSchema = z.object({
        bookingId: z.string().min(1),
        laborSubtotalCents: z.number().int().min(0).optional(),
        partsSubtotalCents: z.number().int().min(0).default(0),
        diagnosticFeeCents: z.number().int().min(0).default(0),
        discountCents: z.number().int().min(0).default(0),
        notes: z.string().max(1000).nullable().optional(),
      });

      const parsed = createInvSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid invoice payload.', requestId)
        );
      }

      const d = parsed.data;
      const result = await withTenantTransaction(tenantId, async (client) => {
        const bRes = await client.query<{
          id: string;
          booking_reference: string;
          quoted_price_cents: string | null;
          default_tax_rate_bps: number | null;
          default_platform_commission_bps: number | null;
        }>(
          `SELECT b.id, b.booking_reference, s.base_price_cents AS quoted_price_cents,
                  t.default_tax_rate_bps, t.default_platform_commission_bps
           FROM bookings b
           JOIN services s ON s.id = b.service_id
           JOIN tenants t ON t.id = b.tenant_id
           WHERE (b.id::text = $1 OR b.booking_reference = $1) AND b.tenant_id = $2
           LIMIT 1`,
          [d.bookingId.trim(), tenantId]
        );

        if (bRes.rows.length === 0) {
          return { error: 'BOOKING_NOT_FOUND' as const };
        }

        const booking = bRes.rows[0];
        const taxRateBps = Number(booking.default_tax_rate_bps ?? 500);
        const commissionBpsSnapshot = Number(booking.default_platform_commission_bps ?? 1500);
        const laborCents = d.laborSubtotalCents ?? Number(booking.quoted_price_cents || 10000);
        const preTaxSubtotal = Math.max(0, laborCents + d.partsSubtotalCents + d.diagnosticFeeCents - d.discountCents);
        const computedTax = Math.round((preTaxSubtotal * taxRateBps) / 10000);
        const totalCents = preTaxSubtotal + computedTax;

        const existingInv = await client.query<{ id: string; invoice_number: string; status: string }>(
          `SELECT id, invoice_number, status FROM invoices WHERE booking_id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE`,
          [booking.id, tenantId]
        );

        if (existingInv.rows.length > 0) {
          const curInv = existingInv.rows[0];
          if (curInv.status !== 'DRAFT') {
            return { error: 'INVOICE_LOCKED' as const, status: curInv.status };
          }
          const upd = await client.query(
            `UPDATE invoices
             SET labor_subtotal_cents = $1,
                 parts_subtotal_cents = $2,
                 diagnostic_fee_cents = $3,
                 discount_cents = $4,
                 tax_rate_bps = $5,
                 tax_total_cents = $6,
                 total_amount_cents = $7,
                 commission_bps_snapshot = COALESCE(commission_bps_snapshot, $8),
                 notes = COALESCE($9, notes),
                 updated_at = NOW()
             WHERE id = $10
             RETURNING id, invoice_number AS "invoiceNumber", booking_id AS "bookingId",
                       labor_subtotal_cents AS "laborSubtotalCents", parts_subtotal_cents AS "partsSubtotalCents",
                       tax_total_cents AS "taxTotalCents", total_amount_cents AS "totalAmountCents",
                       status, notes, issued_at AS "issuedAt"`,
            [laborCents, d.partsSubtotalCents, d.diagnosticFeeCents, d.discountCents, taxRateBps, computedTax, totalCents, commissionBpsSnapshot, d.notes ?? null, curInv.id]
          );
          return { invoice: upd.rows[0] };
        }

        const invNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
        const ins = await client.query(
          `INSERT INTO invoices (
             tenant_id, booking_id, invoice_number, labor_subtotal_cents, parts_subtotal_cents,
             diagnostic_fee_cents, discount_cents, tax_rate_bps, tax_total_cents, total_amount_cents,
             commission_bps_snapshot, notes, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT')
           RETURNING id, invoice_number AS "invoiceNumber", booking_id AS "bookingId",
                     labor_subtotal_cents AS "laborSubtotalCents", parts_subtotal_cents AS "partsSubtotalCents",
                     tax_total_cents AS "taxTotalCents", total_amount_cents AS "totalAmountCents",
                     status, notes, issued_at AS "issuedAt"`,
          [tenantId, booking.id, invNumber, laborCents, d.partsSubtotalCents, d.diagnosticFeeCents, d.discountCents, taxRateBps, computedTax, totalCents, commissionBpsSnapshot, d.notes ?? null]
        );
        return { invoice: ins.rows[0] };
      });

      if ('error' in result) {
        if (result.error === 'INVOICE_LOCKED') {
          return reply.status(409).send(errorResponse('INVOICE_LOCKED', `Invoice is in ${result.status} state and can no longer be edited.`, requestId));
        }
        return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Target booking not found for invoice generation.', requestId));
      }

      return reply.status(201).send(successResponse(result.invoice, requestId));
    });

    // 4. Double-Entry General Ledger Journal Entries (Paginated)
    protectedRoutes.get('/ledger', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Audit view of double-entry ledger journal entries',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const q = (request.query || {}) as { page?: string; limit?: string };
      const limit = Math.min(200, Math.max(1, parseInt(q.limit || '50', 10) || 50));
      const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
      const offset = (page - 1) * limit;

      const [countRes, result] = await Promise.all([
        tenantQuery<{ total: string }>(`SELECT COUNT(*)::bigint AS total FROM ledger_entries WHERE tenant_id = $1`, [tenantId], tenantId),
        tenantQuery(
          `SELECT 
            le.id,
            le.amount_cents as "amountCents",
            le.description,
            le.posted_at as "postedAt",
            da.account_number as "debitAccountNumber",
            da.account_name as "debitAccountName",
            da.account_type as "debitAccountType",
            ca.account_number as "creditAccountNumber",
            ca.account_name as "creditAccountName",
            ca.account_type as "creditAccountType"
          FROM ledger_entries le
          JOIN ledger_accounts da ON da.id = le.debit_account_id
          JOIN ledger_accounts ca ON ca.id = le.credit_account_id
          WHERE le.tenant_id = $1
          ORDER BY le.posted_at DESC
          LIMIT $2 OFFSET $3`,
          [tenantId, limit, offset],
          tenantId
        ),
      ]);

      const total = Number(countRes.rows[0]?.total || 0);
      return reply.status(200).send(
        successResponse(
          result.rows.map((r: any) => ({ ...r, amountCents: Number(r.amountCents || 0) })),
          requestId,
          { page, limit, totalRecords: total, totalPages: Math.ceil(total / limit) }
        )
      );
    });

    // 4b. Read-Only Financial Reconciliation & Integrity Audit Report
    protectedRoutes.get('/reconciliation-report', {
      preHandler: [requirePermission('finance:report:read')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Read-only financial reconciliation and integrity audit report',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      // 1. Unreconciled Payouts: Payouts with a transfer ID but missing ledger entry
      const unreconciledPayoutsRes = await tenantQuery(
        `SELECT pp.id, pp.provider_id, pp.amount_cents, pp.status, pp.stripe_transfer_id, pp.created_at
         FROM provider_payouts pp
         WHERE pp.tenant_id = $1
           AND pp.stripe_transfer_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM ledger_entries le 
             WHERE le.payout_id = pp.id 
                OR (le.tenant_id = $1 AND le.description LIKE '%' || pp.stripe_transfer_id || '%')
           )`,
        [tenantId],
        tenantId
      );

      // 2. Succeeded Payments with Unsettled Invoices (BACK-01 indicator; allows partial refunds)
      const unsettledPaymentTxsRes = await tenantQuery(
        `SELECT pt.id, pt.invoice_id, pt.stripe_payment_intent_id, pt.authorized_amount_cents, pt.captured_amount_cents, pt.status as tx_status,
                i.status as invoice_status, i.total_amount_cents
         FROM payment_transactions pt
         JOIN invoices i ON i.id = pt.invoice_id
         WHERE pt.tenant_id = $1
           AND pt.status = 'SUCCEEDED'
           AND i.status NOT IN ('PAID', 'PARTIALLY_REFUNDED')`,
        [tenantId],
        tenantId
      );

      // 3. Paid Invoices without Succeeded Transactions
      const mismatchedInvoicesRes = await tenantQuery(
        `SELECT i.id, i.booking_id, i.total_amount_cents, i.status as invoice_status,
                pt.status as tx_status, pt.stripe_payment_intent_id
         FROM invoices i
         LEFT JOIN payment_transactions pt ON pt.invoice_id = i.id
         WHERE i.tenant_id = $1
           AND i.status = 'PAID'
           AND (pt.id IS NULL OR pt.status != 'SUCCEEDED')`,
        [tenantId],
        tenantId
      );

      // 4. Duplicate Ledger Candidate Postings
      const duplicateLedgersRes = await tenantQuery(
        `SELECT payout_id, transaction_id, posting_type, COUNT(*) as count
         FROM ledger_entries
         WHERE tenant_id = $1
           AND (payout_id IS NOT NULL OR transaction_id IS NOT NULL)
         GROUP BY payout_id, transaction_id, posting_type
         HAVING COUNT(*) > 1`,
        [tenantId],
        tenantId
      );

      // 5. Quarantined Discrepancy Transactions (normal card declines 'FAILED' do not break reconciliation health)
      const quarantinedTxsRes = await tenantQuery(
        `SELECT pt.id, pt.invoice_id, pt.stripe_payment_intent_id, pt.authorized_amount_cents, pt.status, pt.created_at
         FROM payment_transactions pt
         WHERE pt.tenant_id = $1 AND pt.status = 'DISCREPANCY_QUARANTINED'
         ORDER BY pt.created_at DESC
         LIMIT 100`,
        [tenantId],
        tenantId
      );

      const isClean = unreconciledPayoutsRes.rowCount === 0 &&
                      unsettledPaymentTxsRes.rowCount === 0 &&
                      mismatchedInvoicesRes.rowCount === 0 &&
                      duplicateLedgersRes.rowCount === 0 &&
                      quarantinedTxsRes.rowCount === 0;

      return reply.status(200).send(
        successResponse({
          healthy: isClean,
          timestamp: new Date().toISOString(),
          unreconciledPayoutsCount: unreconciledPayoutsRes.rowCount,
          unsettledPaymentTxsCount: unsettledPaymentTxsRes.rowCount,
          mismatchedInvoicesCount: mismatchedInvoicesRes.rowCount,
          duplicateLedgerCount: duplicateLedgersRes.rowCount,
          quarantinedTxsCount: quarantinedTxsRes.rowCount,
          details: {
            unreconciledPayouts: unreconciledPayoutsRes.rows,
            unsettledPaymentTxs: unsettledPaymentTxsRes.rows,
            mismatchedInvoices: mismatchedInvoicesRes.rows,
            duplicateLedgers: duplicateLedgersRes.rows,
            quarantinedTxs: quarantinedTxsRes.rows
          }
        }, requestId)
      );
    });

    // 5. Trigger Provider Payout with Pre-Reservation Durability and Two-Phase Stripe Reconciliation (PAY-02, PAY-03, PAY-04, PAY-05)
    protectedRoutes.post('/payouts', {
      preHandler: [requirePermission('finance:payout:execute'), blockInDemoMode('Technician payout disbursement')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Initiate technician payout transfer with durable idempotency reservation',
        security: [{ bearerAuth: [] }],
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string', description: 'Mandatory caller-generated idempotency key' }
          },
          required: ['idempotency-key']
        }
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const parsed = payoutTriggerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', 'Invalid payout parameters', requestId)
        );
      }

      const { providerId, amountCents, description } = parsed.data;

      // PAY-02: Validate Idempotency-Key header FIRST before calculating balance
      const clientKey = (request.headers['idempotency-key'] as string | undefined)?.trim();
      if (!clientKey) {
        return reply.status(400).send(
          errorResponse('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header is strictly required for financial payout operations.', requestId)
        );
      }

      const idempotencyKey = `payout_${clientKey}`;
      const requestFingerprint = crypto.createHash('sha256').update(`${tenantId}:${providerId}:${amountCents}`).digest('hex');

      const payoutSecrets = await resolveTenantIntegrationSecrets(tenantId);
      const payoutStripeKey = payoutSecrets.stripeSecretKey;

      // PAY-05: Simulation gating: In production, fail closed if Stripe key is missing
      if (!hasStripeConfigured(payoutStripeKey)) {
        if (process.env.NODE_ENV === 'production') {
          return reply.status(422).send(
            errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live Stripe payout gateway is not configured on this server.', requestId)
          );
        }
        if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_PAYOUT_SIMULATION !== 'true') {
          return reply.status(503).send(
            errorResponse('PAYOUT_GATEWAY_UNAVAILABLE', 'Stripe Connect gateway credentials not configured. Payout processing is disabled in this environment.', requestId)
          );
        }
      }

      // PHASE 1 (PAY-02, PAY-03): Atomically serialize provider, check idempotency, reserve balance, and durably commit payout
      const transferDesc = description || null;
      const phase1 = await withTenantTransaction<
        | { status: 'ERROR'; httpStatus: number; code: string; message: string }
        | {
            status: 'EXISTING';
            existingPayout: any;
            providerName: string;
            stripeAccountId: string | null;
            techPayableId: string;
            bankAssetId: string;
          }
        | {
            status: 'CREATED';
            payoutId: string;
            providerName: string;
            stripeAccountId: string | null;
            techPayableId: string;
            bankAssetId: string;
          }
      >(tenantId, async (client) => {
        // Check provider exists and lock provider row exclusively to serialize payout attempts for this provider
        const provRes = await client.query(
          `SELECT user_id, full_name, stripe_connect_account_id, stripe_payouts_enabled
           FROM provider_profiles
           WHERE user_id = $1 AND tenant_id = $2
           FOR UPDATE`,
          [providerId, tenantId]
        );

        if (provRes.rowCount === 0) {
          return { status: 'ERROR', httpStatus: 404, code: 'NOT_FOUND', message: 'Provider not found' };
        }

        const provider = provRes.rows[0];
        if (hasStripeConfigured(payoutStripeKey) && !provider.stripe_payouts_enabled) {
          return {
            status: 'ERROR',
            httpStatus: 422,
            code: 'PAYOUTS_NOT_ENABLED',
            message: 'Provider Stripe Connect payouts are not enabled.',
          };
        }
        const providerName = provider.full_name;
        const stripeAccountId = provider.stripe_connect_account_id;

        // Verify standard ledger accounts exist before proceeding
        const accRes = await client.query(
          `SELECT id, account_number FROM ledger_accounts 
           WHERE tenant_id = $1 AND account_number IN ('1010', '2020')`,
          [tenantId]
        );
        const techPayable = accRes.rows.find(a => a.account_number === '2020');
        const bankAsset = accRes.rows.find(a => a.account_number === '1010');

        if (!techPayable || !bankAsset) {
          return {
            status: 'ERROR',
            httpStatus: 422,
            code: 'LEDGER_ACCOUNTS_MISSING',
            message: 'Standard ledger accounts (1010 Operating Bank / 2020 Technician Payable) are not provisioned for this tenant.',
          };
        }
        const techPayableId = techPayable.id;
        const bankAssetId = bankAsset.id;

        // PAY-02: Check existing payout idempotency INSIDE the serialized transaction BEFORE balance calculation
        const existingPayoutRes = await client.query<{
          id: string;
          stripe_transfer_id: string | null;
          amount_cents: string;
          status: string;
          request_fingerprint?: string;
          destination_account_id?: string | null;
          transfer_description?: string | null;
        }>(
          `SELECT id, stripe_transfer_id, amount_cents, status, request_fingerprint, destination_account_id, transfer_description
           FROM provider_payouts 
           WHERE idempotency_key = $1 AND tenant_id = $2
           FOR UPDATE`,
          [idempotencyKey, tenantId]
        );

        if (existingPayoutRes.rows.length > 0) {
          const ep = existingPayoutRes.rows[0];
          // Reject key reuse with mismatched parameters (409 Conflict)
          if (ep.request_fingerprint && ep.request_fingerprint !== requestFingerprint) {
            return {
              status: 'ERROR',
              httpStatus: 409,
              code: 'IDEMPOTENCY_KEY_MISMATCH',
              message: 'Idempotency key was previously used with different payout parameters (provider or amount).',
            };
          }
          return {
            status: 'EXISTING',
            existingPayout: ep,
            providerName,
            stripeAccountId,
            techPayableId,
            bankAssetId,
          };
        }

        // Check provider's settled pre-tax earnings balance + approved bonuses net of proportional refunds and taxes (2030)
        // Subtract net payouts (amount_cents - amount_reversed_cents) for PAID, PROCESSING, PENDING_PROVIDER_CONFIRMATION, PARTIALLY_REVERSED
        const balanceRes = await client.query(
          `SELECT 
            COALESCE(SUM(CASE WHEN b.assigned_provider_id = $1 AND b.status = 'COMPLETED'
              THEN GREATEST(
                0,
                ROUND(
                  (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                  / GREATEST(1, i.total_amount_cents)::numeric
                ) - ROUND(
                  ROUND(
                    (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                    / GREATEST(1, i.total_amount_cents)::numeric
                  ) * COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) / 10000.0
                )
              )
              ELSE 0 END), 0)::bigint
            + COALESCE((
              SELECT SUM(pb.amount_cents)
              FROM provider_bonuses pb
              WHERE pb.provider_id = $1 AND pb.tenant_id = $2 AND pb.status IN ('APPROVED', 'DISBURSED')
            ), 0)::bigint as total_earned_cents,
            COALESCE((
              SELECT SUM(amount_cents - COALESCE(amount_reversed_cents, 0))
              FROM provider_payouts
              WHERE provider_id = $1 AND tenant_id = $2
                AND status <> 'FAILED'
                AND (status IN ('PAID', 'PROCESSING', 'PENDING_PROVIDER_CONFIRMATION', 'PARTIALLY_REVERSED') OR stripe_transfer_id IS NOT NULL)
            ), 0)::bigint as total_paid_cents
           FROM bookings b
           JOIN tenants t ON t.id = b.tenant_id
           JOIN invoices i ON i.booking_id = b.id AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
           WHERE b.assigned_provider_id = $1 AND b.tenant_id = $2`,
          [providerId, tenantId]
        );
        const totalEarned = Number(balanceRes.rows[0]?.total_earned_cents || 0);
        const totalPaid = Number(balanceRes.rows[0]?.total_paid_cents || 0);
        const unpaidBalanceCents = Math.max(0, totalEarned - totalPaid);

        // Universal invariant: Payout must never exceed settled unpaid earnings
        if (amountCents > unpaidBalanceCents) {
          return {
            status: 'ERROR',
            httpStatus: 400,
            code: 'INSUFFICIENT_PAYOUT_BALANCE',
            message: `Payout amount (${amountCents} cents) exceeds provider settled unpaid balance (${unpaidBalanceCents} cents).`,
          };
        }

        // Insert durable payout record in PROCESSING state with persisted destination & description
        const persistedDesc = transferDesc || `Provider payout to ${providerName}`;
        const payoutCurrency = (request.tenant?.currencyCode || 'AED').toUpperCase();
        const pendingPayoutRes = await client.query(
          `INSERT INTO provider_payouts (
            tenant_id, provider_id, amount_cents, currency, status, idempotency_key, request_fingerprint,
            destination_account_id, transfer_description
          ) VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6, $7, $8)
          RETURNING id`,
          [tenantId, providerId, amountCents, payoutCurrency, idempotencyKey, requestFingerprint, stripeAccountId, persistedDesc]
        );

        // COMMIT Phase 1: Payout record is now durable in PostgreSQL
        return {
          status: 'CREATED',
          payoutId: pendingPayoutRes.rows[0].id,
          providerName,
          stripeAccountId,
          techPayableId,
          bankAssetId,
        };
      });

      if (phase1.status === 'ERROR') {
        return reply.status(phase1.httpStatus).send(
          errorResponse(phase1.code, phase1.message, requestId)
        );
      }

      const { providerName, stripeAccountId, techPayableId, bankAssetId } = phase1;

      // Idempotent Replay & Crash Recovery (strictly OUTSIDE Phase 1 transaction)
      if (phase1.status === 'EXISTING') {
        const ep = phase1.existingPayout;
        const recoveryDest = ep.destination_account_id || stripeAccountId;
        const recoveryDesc = ep.transfer_description || `Provider payout recovery for ${providerName}`;

        if (!ep.stripe_transfer_id && hasStripeConfigured(payoutStripeKey) && recoveryDest && ep.status !== 'FAILED') {
          try {
            const stripe = getStripe(payoutStripeKey ?? env.STRIPE_SECRET_KEY);
            const recoveredTransfer = await stripe.transfers.create({
              amount: parseInt(ep.amount_cents, 10),
              currency: (request.tenant?.currencyCode || 'AED').toLowerCase(),
              destination: recoveryDest,
              description: recoveryDesc
            }, {
              idempotencyKey: `payout_stripe_${ep.id}`
            });
            ep.stripe_transfer_id = recoveredTransfer.id;
            ep.status = 'PROCESSING';
          } catch (stripeErr: any) {
            if (isDefinitiveStripeError(stripeErr)) {
              await tenantQuery(
                `UPDATE provider_payouts SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
                [ep.id, stripeErr.message],
                tenantId
              );
              return reply.status(502).send(
                errorResponse('STRIPE_TRANSFER_FAILED', `Stripe Connect payout recovery failed: ${stripeErr.message}`, requestId)
              );
            }
            await tenantQuery(
              `UPDATE provider_payouts SET status = 'PENDING_PROVIDER_CONFIRMATION', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
              [ep.id, stripeErr.message],
              tenantId
            );
            return reply.status(202).send(
              successResponse({
                payoutId: ep.id,
                transferId: null,
                amountCents: parseInt(ep.amount_cents, 10),
                status: 'PENDING_PROVIDER_CONFIRMATION',
                message: 'Payout outcome remains ambiguous due to network error; balance reserved pending reconciliation.'
              }, requestId)
            );
          }
        }

        if (ep.status === 'FAILED') {
          return reply.status(409).send(
            errorResponse('PAYOUT_FAILED_TERMINAL', 'This idempotency key belongs to a failed payout; retry with a new Idempotency-Key.', requestId)
          );
        }

        if (ep.stripe_transfer_id) {
          await withTenantTransaction(tenantId, async (recClient) => {
            if (!['PROCESSING', 'PAID', 'PARTIALLY_REVERSED', 'REVERSED'].includes(ep.status)) {
              ep.status = 'PROCESSING';
            }
            await recClient.query(
              `UPDATE provider_payouts
               SET stripe_transfer_id = COALESCE(stripe_transfer_id, $1),
                   status = $2,
                   processed_at = COALESCE(processed_at, NOW()),
                   last_reconciled_at = NOW(),
                   updated_at = NOW()
               WHERE id = $3`,
              [ep.stripe_transfer_id, ep.status, ep.id]
            );

            await recClient.query(
              `INSERT INTO ledger_entries (tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
               VALUES ($1, $2, 'PAYOUT_DISBURSAL', $3, $4, $5, $6)
               ON CONFLICT (payout_id, posting_type) DO NOTHING`,
              [tenantId, ep.id, techPayableId, bankAssetId, ep.amount_cents, `Payout to ${providerName} (${ep.stripe_transfer_id}) [Reconciled]`]
            );
          });
        }

        return reply.status(200).send(
          successResponse({
            payoutId: ep.id,
            transferId: ep.stripe_transfer_id,
            amountCents: parseInt(ep.amount_cents, 10),
            status: ep.status,
            message: 'Existing payout operation retrieved idempotently.'
          }, requestId)
        );
      }

      const payoutId = phase1.payoutId;

      // PHASE 2 (PAY-03): Call Stripe Connect Transfer with durable database-backed idempotency key
      let transferRef: string;
      const isSimulated = !hasStripeConfigured(payoutStripeKey);

      if (hasStripeConfigured(payoutStripeKey)) {
        if (!stripeAccountId) {
          await tenantQuery(
            `UPDATE provider_payouts SET status = 'FAILED', failure_reason = 'Missing Stripe Connect account', updated_at = NOW() WHERE id = $1`,
            [payoutId],
            tenantId
          );
          return reply.status(422).send(
            errorResponse('PROVIDER_PAYOUT_NOT_CONFIGURED', 'Technician does not have a linked Stripe Connect payout account.', requestId)
          );
        }

        try {
          const stripe = getStripe(payoutStripeKey ?? env.STRIPE_SECRET_KEY);
          const transfer = await stripe.transfers.create({
            amount: amountCents,
            currency: (request.tenant?.currencyCode || 'AED').toLowerCase(),
            destination: stripeAccountId,
            description: description || `Provider payout to ${providerName}`
          }, {
            idempotencyKey: `payout_stripe_${payoutId}`
          });
          transferRef = transfer.id;
        } catch (stripeErr: any) {
          if (isDefinitiveStripeError(stripeErr)) {
            await tenantQuery(
              `UPDATE provider_payouts SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
              [payoutId, stripeErr.message],
              tenantId
            );
            return reply.status(502).send(
              errorResponse('STRIPE_TRANSFER_FAILED', `Stripe Connect payout transfer failed: ${stripeErr.message}`, requestId)
            );
          }

          // Ambiguous network/timeout/5xx/rate-limit failure: DO NOT mark FAILED! Keep balance reserved.
          await tenantQuery(
            `UPDATE provider_payouts SET status = 'PENDING_PROVIDER_CONFIRMATION', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
            [payoutId, stripeErr.message],
            tenantId
          );
          return reply.status(202).send(
            successResponse({
              payoutId,
              amountCents,
              providerName,
              status: 'PENDING_PROVIDER_CONFIRMATION',
              message: 'Stripe transfer timed out or returned transient error; funds remain reserved pending reconciliation.'
            }, requestId)
          );
        }
      } else {
        // PAY-05: Sandbox test simulation only
        transferRef = `tr_test_simulated_${payoutId}`;
      }

      // PHASE 3 (PAY-03): Reconcile external transfer, post double-entry ledger entries, and audit log
      const payoutRes = await withTenantTransaction(tenantId, async (reconClient) => {
        const res = await reconClient.query(
          `UPDATE provider_payouts
           SET stripe_transfer_id = $1, processed_at = NOW(), status = 'PROCESSING', updated_at = NOW()
           WHERE id = $2
           RETURNING id, stripe_transfer_id, amount_cents, status, created_at`,
          [transferRef, payoutId]
        );

        await reconClient.query(
          `INSERT INTO ledger_entries (
            tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description
          ) VALUES ($1, $2, 'PAYOUT_DISBURSAL', $3, $4, $5, $6)
          ON CONFLICT (payout_id, posting_type) DO NOTHING`,
          [
            tenantId,
            payoutId,
            techPayableId,
            bankAssetId,
            amountCents,
            description || `Payout to ${providerName} (${transferRef})`
          ]
        );

        await reconClient.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            request.user!.id,
            request.user!.role,
            'PAYOUT_PROCESSED',
            'provider_payout',
            payoutId,
            JSON.stringify({ providerId, amountCents, transferRef, isSimulated })
          ]
        );

        return res;
      });

      return reply.status(200).send(
        successResponse({
          payoutId: payoutRes.rows[0].id,
          transferId: transferRef,
          amountCents,
          providerName,
          status: payoutRes.rows[0].status,
          isSimulated,
          message: 'Provider payout initiated with PROCESSING status and posted to ledger.'
        }, requestId)
      );
    });

    // 5b. Reconcile Orphaned or Pending Payout (3-Phase, Zero Stripe Calls Inside DB Transaction)
    protectedRoutes.post('/payouts/:id/reconcile', {
      preHandler: [requirePermission('finance:payout:execute'), blockInDemoMode('Payout reconciliation')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Reconcile interrupted or orphaned technician payout',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const { id } = request.params as any;
      const tenantId = request.tenantId;

      // PHASE 1: Fast Read (releases DB tx before Stripe I/O)
      const payoutRes = await tenantQuery(
        `SELECT p.id, p.provider_id, p.amount_cents, p.status, p.stripe_transfer_id,
                p.idempotency_key, p.destination_account_id, p.transfer_description,
                pr.stripe_connect_account_id, pr.full_name
         FROM provider_payouts p
         LEFT JOIN provider_profiles pr ON pr.user_id = p.provider_id AND pr.tenant_id = p.tenant_id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [id, tenantId],
        tenantId
      );

      if (payoutRes.rowCount === 0) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Payout record not found', requestId));
      }

      const payout = payoutRes.rows[0];
      const providerConnectId: string | null = payout.destination_account_id || payout.stripe_connect_account_id || null;

      // PHASE 2: External Stripe Recovery/Verification OUTSIDE any open transaction
      let reconciledTransferId: string | null = payout.stripe_transfer_id || null;
      let definitiveFailureReason: string | null = null;
      let transientErrorReason: string | null = null;

      const reconSecrets = await resolveTenantIntegrationSecrets(tenantId);
      const reconStripeKey = reconSecrets.stripeSecretKey;

      if (hasStripeConfigured(reconStripeKey)) {
        const stripe = getStripe(reconStripeKey ?? env.STRIPE_SECRET_KEY);
        if (reconciledTransferId && reconciledTransferId.startsWith('tr_') && !reconciledTransferId.startsWith('tr_test_')) {
          try {
            const retrieved = await stripe.transfers.retrieve(reconciledTransferId);
            if (retrieved.reversed) {
              // Full reversal details are handled by transfer.reversed webhook; do not overwrite
            }
          } catch (stripeErr: any) {
            if (!isDefinitiveStripeError(stripeErr)) {
              transientErrorReason = stripeErr.message;
            }
          }
        } else if (!reconciledTransferId && providerConnectId && payout.status !== 'FAILED') {
          try {
            const recovered = await stripe.transfers.create({
              amount: parseInt(payout.amount_cents, 10),
              currency: (request.tenant?.currencyCode || 'AED').toLowerCase(),
              destination: providerConnectId,
              description: payout.transfer_description || `Admin reconciliation payout ${payout.id}`
            }, {
              idempotencyKey: `payout_stripe_${payout.id}`
            });
            reconciledTransferId = recovered.id;
          } catch (stripeErr: any) {
            if (isDefinitiveStripeError(stripeErr)) {
              definitiveFailureReason = stripeErr.message;
            } else {
              transientErrorReason = stripeErr.message;
            }
          }
        }
      }

      // PHASE 3: Short Atomic Reconciliation Transaction
      const reconcileOutcome = await withTenantTransaction<{ status: number; body: any }>(
        tenantId,
        async (client) => {
          const lockRes = await client.query(
            `SELECT id, status, stripe_transfer_id, amount_cents FROM provider_payouts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [id, tenantId]
          );
          if (lockRes.rowCount === 0) {
            return { status: 404, body: errorResponse('NOT_FOUND', 'Payout record not found', requestId) };
          }

          const locked = lockRes.rows[0];
          const effectiveTransferId = locked.stripe_transfer_id || reconciledTransferId;

          if (definitiveFailureReason && !effectiveTransferId) {
            await client.query(
              `UPDATE provider_payouts
               SET status = 'FAILED', failure_reason = $2, reconcile_attempts = reconcile_attempts + 1,
                   last_reconciled_at = NOW(), updated_at = NOW()
               WHERE id = $1`,
              [id, definitiveFailureReason]
            );
            return {
              status: 200,
              body: successResponse({
                reconciled: true,
                payoutId: id,
                status: 'FAILED',
                message: `Confirmed definitive rejection from Stripe: ${definitiveFailureReason}`
              }, requestId),
            };
          }

          if (effectiveTransferId) {
            const nextStatus = ['PROCESSING', 'PAID', 'PARTIALLY_REVERSED', 'REVERSED'].includes(locked.status)
              ? locked.status
              : 'PROCESSING';

            await client.query(
              `UPDATE provider_payouts
               SET stripe_transfer_id = COALESCE(stripe_transfer_id, $1),
                   status = $2,
                   processed_at = COALESCE(processed_at, NOW()),
                   reconcile_attempts = reconcile_attempts + 1,
                   last_reconciled_at = NOW(),
                   updated_at = NOW()
               WHERE id = $3`,
              [effectiveTransferId, nextStatus, id]
            );

            const accRes = await client.query(
              `SELECT id, account_number FROM ledger_accounts 
               WHERE tenant_id = $1 AND account_number IN ('1010', '2020')`,
              [tenantId]
            );
            const techPayable = accRes.rows.find(a => a.account_number === '2020');
            const bankAsset = accRes.rows.find(a => a.account_number === '1010');
            if (techPayable && bankAsset) {
              await client.query(
                `INSERT INTO ledger_entries (tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
                 VALUES ($1, $2, 'PAYOUT_DISBURSAL', $3, $4, $5, $6)
                 ON CONFLICT (payout_id, posting_type) DO NOTHING`,
                [tenantId, id, techPayable.id, bankAsset.id, locked.amount_cents, `Reconciled payout ${id} (${effectiveTransferId})`]
              );
            }

            return {
              status: 200,
              body: successResponse({ reconciled: true, payoutId: id, status: nextStatus, transferId: effectiveTransferId }, requestId),
            };
          }

          await client.query(
            `UPDATE provider_payouts
             SET reconcile_attempts = reconcile_attempts + 1,
                 last_reconciled_at = NOW(),
                 failure_reason = COALESCE($2, failure_reason),
                 updated_at = NOW()
             WHERE id = $1`,
            [id, transientErrorReason]
          );
          return {
            status: transientErrorReason ? 202 : 200,
            body: successResponse({
              reconciled: false,
              payoutId: id,
              status: locked.status,
              message: transientErrorReason
                ? `Stripe reconciliation encountered transient error (${transientErrorReason}); balance stays reserved.`
                : 'Stripe transfer reference not found; payout remains unreconciled.'
            }, requestId),
          };
        }
      );

      return reply.status(reconcileOutcome.status).send(reconcileOutcome.body);
    });

    // 7. Authoritative Provider Payout Balances & History (Fixes BUG-PAGE-01)
    protectedRoutes.get('/payouts', {
      schema: {
        tags: ['Finances & General Ledger'],
        summary: 'Get provider unpaid payout balances and persisted payout history',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const balancesRes = await tenantQuery(
        `SELECT
          p.user_id AS provider_id,
          p.full_name,
          p.trade_category,
          p.stripe_connect_account_id,
          p.stripe_payouts_enabled,
          COALESCE(t.default_platform_commission_bps, 1500) AS commission_bps,
          COALESCE(COUNT(DISTINCT CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED') THEN b.id END), 0)::int AS completed_jobs,
          COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
            THEN GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))
            ELSE 0 END), 0)::bigint AS gross_revenue_cents,
          COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' AND i.status IN ('PAID', 'PARTIALLY_REFUNDED')
            THEN GREATEST(
              0,
              ROUND(
                (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                / GREATEST(1, i.total_amount_cents)::numeric
              ) - ROUND(
                ROUND(
                  (GREATEST(0, i.total_amount_cents - COALESCE(i.tax_total_cents, 0))::numeric * GREATEST(0, i.total_amount_cents - COALESCE(i.refunded_amount_cents, 0))::numeric)
                  / GREATEST(1, i.total_amount_cents)::numeric
                ) * COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) / 10000.0
              )
            )
            ELSE 0 END), 0)::bigint
          + COALESCE((
            SELECT SUM(pb.amount_cents)
            FROM provider_bonuses pb
            WHERE pb.provider_id = p.user_id AND pb.tenant_id = $1 AND pb.status IN ('APPROVED', 'DISBURSED')
          ), 0)::bigint AS total_earned_cents,
          COALESCE((
            SELECT SUM(pp.amount_cents - COALESCE(pp.amount_reversed_cents, 0))
            FROM provider_payouts pp
            WHERE pp.provider_id = p.user_id AND pp.tenant_id = $1
              AND pp.status <> 'FAILED'
              AND (pp.status IN ('PAID', 'PROCESSING', 'PENDING_PROVIDER_CONFIRMATION', 'PARTIALLY_REVERSED') OR pp.stripe_transfer_id IS NOT NULL)
          ), 0)::bigint AS total_disbursed_cents
         FROM provider_profiles p
         JOIN tenants t ON t.id = p.tenant_id
         LEFT JOIN bookings b ON b.assigned_provider_id = p.user_id AND b.tenant_id = p.tenant_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE p.tenant_id = $1
         GROUP BY p.user_id, p.full_name, p.trade_category, p.stripe_connect_account_id, p.stripe_payouts_enabled, t.default_platform_commission_bps
         ORDER BY p.full_name ASC`,
        [tenantId],
        tenantId
      );

      const historyRes = await tenantQuery(
        `SELECT pp.id, pp.provider_id, p.full_name AS provider_name, pp.amount_cents, pp.currency,
                pp.status, pp.stripe_transfer_id, pp.processed_at, pp.created_at
         FROM provider_payouts pp
         JOIN provider_profiles p ON p.user_id = pp.provider_id
         WHERE pp.tenant_id = $1
         ORDER BY pp.created_at DESC
         LIMIT 100`,
        [tenantId],
        tenantId
      );

      return reply.status(200).send(
        successResponse({
          currency: (request.tenant?.currencyCode || 'AED').toUpperCase(),
          balances: balancesRes.rows.map((r: any) => {
            const earned = Number(r.total_earned_cents || 0);
            const disbursed = Number(r.total_disbursed_cents || 0);
            const unpaid = Math.max(0, earned - disbursed);
            return {
              providerId: r.provider_id,
              fullName: r.full_name,
              tradeCategory: r.trade_category,
              connectAccountMasked: r.stripe_connect_account_id
                ? `Connect •••• ${String(r.stripe_connect_account_id).slice(-4)}`
                : 'Not Linked',
              payoutsEnabled: Boolean(r.stripe_payouts_enabled),
              completedJobs: r.completed_jobs,
              grossRevenueCents: Number(r.gross_revenue_cents || 0),
              totalEarnedCents: earned,
              totalDisbursedCents: disbursed,
              unpaidBalanceCents: unpaid,
            };
          }),
          history: historyRes.rows.map((h: any) => ({
            id: h.id,
            providerId: h.provider_id,
            providerName: h.provider_name,
            amountCents: Number(h.amount_cents),
            currency: h.currency,
            status: h.status,
            transferId: h.stripe_transfer_id,
            processedAt: h.processed_at,
            createdAt: h.created_at,
          })),
        }, requestId)
      );
    });

    // 7b. List Refunds History (Admin / Staff)
    protectedRoutes.get('/refunds', {
      schema: {
        tags: ['Finances & General Ledger'],
        summary: 'List persisted payment refunds with status, invoice, and booking references',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const res = await tenantQuery(
        `SELECT pr.id, pr.payment_transaction_id AS "paymentTransactionId", pr.invoice_id AS "invoiceId",
                pr.booking_id AS "bookingId", b.booking_reference AS "bookingReference",
                i.invoice_number AS "invoiceNumber", cp.full_name AS "customerName",
                pr.amount_cents AS "amountCents", pr.currency, pr.reason, pr.notes,
                pr.status, pr.stripe_refund_id AS "stripeRefundId", pr.error_message AS "errorMessage",
                pr.ledger_posted AS "ledgerPosted", pr.created_at AS "createdAt", pr.updated_at AS "updatedAt"
         FROM payment_refunds pr
         JOIN invoices i ON i.id = pr.invoice_id
         JOIN bookings b ON b.id = pr.booking_id
         LEFT JOIN customer_profiles cp ON cp.user_id = b.customer_id
         WHERE pr.tenant_id = $1
         ORDER BY pr.created_at DESC
         LIMIT 100`,
        [tenantId],
        tenantId
      );

      return reply.status(200).send(
        successResponse(res.rows.map((r: any) => ({
          ...r,
          amountCents: Number(r.amountCents || 0),
        })), requestId)
      );
    });

    // 8. Authoritative Refund Execution with Durable Reservation, Proportional Tax/Commission/Tech Reversal & Stripe Dedup
    protectedRoutes.post('/refunds', {
      preHandler: [requirePermission('finance:refund:adjudicate'), blockInDemoMode('Customer refund adjudication')],
      schema: {
        tags: ['Finances & General Ledger'],
        summary: 'Issue a full or partial refund via Stripe with durable reservation, proportional tax/fee/tech reversal, and idempotency',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const tenantGateway = await getTenantPaymentGateway(tenantId);
      const refundStripeKey = tenantGateway.secrets.stripeSecretKey;
      const activeGateway = env.PAYMENT_GATEWAY || 'stripe';
      const gatewayConfigured =
        activeGateway === 'stripe' ? hasStripeConfigured(refundStripeKey) : tenantGateway.isConfigured;

      if (env.NODE_ENV === 'production' && !gatewayConfigured) {
        return reply.status(503).send(
          errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live Stripe gateway must be configured to issue refunds in production.', requestId)
        );
      }

      const refundSchema = z.object({
        bookingId: z.string().uuid().optional(),
        invoiceId: z.string().uuid().optional(),
        transactionId: z.string().uuid().optional(),
        amountCents: z.number().int().positive().optional(),
        reason: z.string().min(3).max(120).default('Customer refund approved by admin'),
        notes: z.string().max(1000).optional(),
        idempotencyKey: z.string().min(1).max(140).optional(),
      }).refine((d) => Boolean(d.bookingId || d.invoiceId || d.transactionId), {
        message: 'At least one of bookingId, invoiceId, or transactionId is required.',
      });

      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid refund payload.', requestId)
        );
      }

      const headerIdemKey = (request.headers['idempotency-key'] as string | undefined)?.trim();
      const bodyIdemKey = parsed.data.idempotencyKey?.trim();
      const idempotencyKey = headerIdemKey || bodyIdemKey;
      if (!idempotencyKey) {
        return reply.status(400).send(
          errorResponse('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header or body idempotencyKey is required for refunds.', requestId)
        );
      }

      // Phase 1: Lock target transaction, check idempotency, verify remaining captured capacity, and insert PENDING reservation
      const phase1 = await withTenantTransaction<
        | { status: 'RETURN'; httpStatus: number; body: any }
        | {
            status: 'RESERVED';
            refundRowId: string;
            requestedAmountCents: number;
            txId: string;
            invoiceId: string;
            bookingId: string;
            bookingStatus: string;
            stripePaymentIntentId: string | null;
            currency: string;
            totalCents: number;
            taxCents: number;
            commissionBps: number;
            capturedCap: number;
          }
      >(tenantId, async (client) => {
        const existingRes = await client.query<{
          id: string;
          status: string;
          amount_cents: string;
          stripe_refund_id: string | null;
          invoice_id: string;
          payment_transaction_id: string;
          error_message: string | null;
        }>(
          `SELECT id, status, amount_cents, stripe_refund_id, invoice_id, payment_transaction_id, error_message
           FROM payment_refunds
           WHERE tenant_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [tenantId, idempotencyKey]
        );

        if (existingRes.rows.length > 0) {
          const existing = existingRes.rows[0];
          if (existing.status === 'SUCCEEDED') {
            const txNow = await client.query(
              `SELECT pt.refunded_amount_cents, i.status AS invoice_status
               FROM payment_transactions pt
               JOIN invoices i ON i.id = pt.invoice_id
               WHERE pt.id = $1`,
              [existing.payment_transaction_id]
            );
            return {
              status: 'RETURN',
              httpStatus: 200,
              body: successResponse({
                refundId: existing.stripe_refund_id || existing.id,
                refundRecordId: existing.id,
                invoiceId: existing.invoice_id,
                invoiceStatus: txNow.rows[0]?.invoice_status,
                refundedAmountCents: Number(txNow.rows[0]?.refunded_amount_cents ?? existing.amount_cents),
                amountCents: Number(existing.amount_cents),
                idempotent: true,
              }, requestId),
            };
          }
          if (existing.status === 'PENDING' || existing.status === 'REQUIRES_RECONCILIATION') {
            return {
              status: 'RETURN',
              httpStatus: 409,
              body: errorResponse('REFUND_IN_PROGRESS', 'A refund with this Idempotency-Key is already in progress.', requestId),
            };
          }
          return {
            status: 'RETURN',
            httpStatus: 409,
            body: errorResponse('REFUND_PREVIOUSLY_FAILED', existing.error_message || 'This Idempotency-Key previously failed; use a new Idempotency-Key.', requestId),
          };
        }

        const filterClauses: string[] = ['pt.tenant_id = $1'];
        const params: any[] = [tenantId];
        if (parsed.data.transactionId) {
          params.push(parsed.data.transactionId);
          filterClauses.push(`pt.id = $${params.length}`);
        } else if (parsed.data.invoiceId) {
          params.push(parsed.data.invoiceId);
          filterClauses.push(`i.id = $${params.length}`);
        } else if (parsed.data.bookingId) {
          params.push(parsed.data.bookingId);
          filterClauses.push(`i.booking_id = $${params.length}`);
        }

        const txRes = await client.query<{
          tx_id: string;
          invoice_id: string;
          booking_id: string;
          stripe_payment_intent_id: string | null;
          captured_amount_cents: string;
          tx_refunded_cents: string;
          tx_status: string;
          currency: string;
          total_amount_cents: string;
          tax_total_cents: string;
          inv_refunded_cents: string;
          invoice_status: string;
          booking_status: string;
          commission_bps: number | null;
        }>(
          `SELECT pt.id AS tx_id, pt.invoice_id, i.booking_id, pt.stripe_payment_intent_id,
                  pt.captured_amount_cents, pt.refunded_amount_cents AS tx_refunded_cents,
                  pt.status AS tx_status, pt.currency,
                  i.total_amount_cents, COALESCE(i.tax_total_cents, 0) AS tax_total_cents,
                  COALESCE(i.refunded_amount_cents, 0) AS inv_refunded_cents, i.status AS invoice_status,
                  b.status AS booking_status, COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) AS commission_bps
           FROM payment_transactions pt
           JOIN invoices i ON i.id = pt.invoice_id
           JOIN bookings b ON b.id = i.booking_id
           JOIN tenants t ON t.id = pt.tenant_id
           WHERE ${filterClauses.join(' AND ')}
           ORDER BY pt.created_at DESC
           LIMIT 1
           FOR UPDATE OF pt`,
          params
        );

        if (txRes.rows.length === 0) {
          return {
            status: 'RETURN',
            httpStatus: 404,
            body: errorResponse('INVOICE_NOT_FOUND', 'No matching invoice/payment transaction found for refund.', requestId),
          };
        }

        const tx = txRes.rows[0];
        if (!['PAID', 'PARTIALLY_REFUNDED'].includes(tx.invoice_status) || tx.tx_status !== 'SUCCEEDED') {
          return {
            status: 'RETURN',
            httpStatus: 409,
            body: errorResponse('NOT_REFUNDABLE', 'Only settled/succeeded payments can be refunded.', requestId),
          };
        }

        const pendingRes = await client.query<{ pending_cents: string }>(
          `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS pending_cents
           FROM payment_refunds
           WHERE payment_transaction_id = $1 AND status IN ('PENDING', 'REQUIRES_RECONCILIATION')`,
          [tx.tx_id]
        );
        const pendingCents = Number(pendingRes.rows[0]?.pending_cents || 0);
        const capturedAmount = Number(tx.captured_amount_cents || 0);
        const invoiceTotal = Number(tx.total_amount_cents || 0);
        const capturedCap = capturedAmount > 0 ? Math.min(capturedAmount, invoiceTotal) : invoiceTotal;
        const alreadyRefunded = Math.max(Number(tx.tx_refunded_cents || 0), Number(tx.inv_refunded_cents || 0));
        const remaining = Math.max(0, capturedCap - alreadyRefunded - pendingCents);
        const requestedAmount = parsed.data.amountCents ?? remaining;

        if (requestedAmount <= 0 || requestedAmount > remaining) {
          return {
            status: 'RETURN',
            httpStatus: 400,
            body: errorResponse(
              'REFUND_EXCEEDS_PAID',
              `Requested refund (${requestedAmount}) exceeds remaining refundable balance (${remaining}).`,
              requestId
            ),
          };
        }

        const insRes = await client.query<{ id: string }>(
          `INSERT INTO payment_refunds (
            tenant_id, payment_transaction_id, invoice_id, booking_id, initiated_by,
            idempotency_key, amount_cents, currency, reason, notes, status, ledger_posted
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', FALSE)
          RETURNING id`,
          [
            tenantId,
            tx.tx_id,
            tx.invoice_id,
            tx.booking_id,
            request.user!.id,
            idempotencyKey,
            requestedAmount,
            (tx.currency || 'AED').toUpperCase(),
            parsed.data.reason,
            parsed.data.notes || null,
          ]
        );

        return {
          status: 'RESERVED',
          refundRowId: insRes.rows[0].id,
          requestedAmountCents: requestedAmount,
          txId: tx.tx_id,
          invoiceId: tx.invoice_id,
          bookingId: tx.booking_id,
          bookingStatus: tx.booking_status,
          stripePaymentIntentId: tx.stripe_payment_intent_id,
          currency: (tx.currency || 'AED').toUpperCase(),
          totalCents: invoiceTotal,
          taxCents: Number(tx.tax_total_cents || 0),
          commissionBps: Number(tx.commission_bps ?? 1500),
          capturedCap,
        };
      });

      if (phase1.status === 'RETURN') {
        return reply.status(phase1.httpStatus).send(phase1.body);
      }

      // Phase 2: External Gateway Refund strictly OUTSIDE any SQL transaction
      let stripeRefundId = `re_local_${phase1.refundRowId.replace(/-/g, '').slice(0, 20)}`;
      if (
        hasStripeConfigured(refundStripeKey) &&
        phase1.stripePaymentIntentId &&
        !String(phase1.stripePaymentIntentId).startsWith('pi_sandbox_') &&
        (activeGateway === 'stripe' || String(phase1.stripePaymentIntentId).startsWith('pi_'))
      ) {
        try {
          const stripe = getStripe(refundStripeKey ?? env.STRIPE_SECRET_KEY);
          const stripeRef = await stripe.refunds.create(
            {
              payment_intent: phase1.stripePaymentIntentId,
              amount: phase1.requestedAmountCents,
              reason: 'requested_by_customer',
              metadata: {
                tenantId,
                refundId: phase1.refundRowId,
                transactionId: phase1.txId,
                invoiceId: phase1.invoiceId,
              },
            },
            { idempotencyKey: `refund_${idempotencyKey}` }
          );
          stripeRefundId = stripeRef.id;
        } catch (stripeErr: any) {
          const errMsg = String(stripeErr?.message || 'Stripe refund request failed');
          if (isDefinitiveStripeError(stripeErr)) {
            await tenantQuery(
              `UPDATE payment_refunds SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1`,
              [phase1.refundRowId, errMsg],
              tenantId
            );
            return reply.status(402).send(
              errorResponse('STRIPE_REFUND_FAILED', `Stripe rejected refund: ${errMsg}`, requestId)
            );
          }
          await tenantQuery(
            `UPDATE payment_refunds SET status = 'REQUIRES_RECONCILIATION', error_message = $2, updated_at = NOW() WHERE id = $1`,
            [phase1.refundRowId, errMsg],
            tenantId
          );
          return reply.status(502).send(
            errorResponse('STRIPE_REFUND_TRANSIENT_ERROR', `Stripe refund encountered transient error: ${errMsg}`, requestId)
          );
        }
      } else if (
        (activeGateway === 'paytabs' || activeGateway === 'telr') &&
        tenantGateway.isConfigured &&
        phase1.stripePaymentIntentId &&
        !String(phase1.stripePaymentIntentId).startsWith('pi_sandbox_')
      ) {
        try {
          const gwRef = await tenantGateway.gateway.refund({
            providerReferenceId: phase1.stripePaymentIntentId,
            amountCents: phase1.requestedAmountCents,
            currency: phase1.currency,
            reason: parsed.data.reason,
            idempotencyKey: `refund_${idempotencyKey}`,
          });
          stripeRefundId = gwRef.refundId;
        } catch (gwErr: any) {
          const errMsg = String(gwErr?.message || `${tenantGateway.gateway.name} refund failed`);
          if (gwErr?.code === 'GATEWAY_OPERATION_NOT_SUPPORTED') {
            await tenantQuery(
              `UPDATE payment_refunds SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1`,
              [phase1.refundRowId, errMsg],
              tenantId
            );
            return reply.status(501).send(errorResponse('GATEWAY_OPERATION_NOT_SUPPORTED', errMsg, requestId));
          }
          await tenantQuery(
            `UPDATE payment_refunds SET status = 'REQUIRES_RECONCILIATION', error_message = $2, updated_at = NOW() WHERE id = $1`,
            [phase1.refundRowId, errMsg],
            tenantId
          );
          return reply.status(502).send(
            errorResponse('GATEWAY_REFUND_ERROR', `${tenantGateway.gateway.name} refund failed: ${errMsg}`, requestId)
          );
        }
      }

      // Phase 3: Atomic Settlement, Invoice/Tx Status Transition, Proportional Ledger Reversal & Audit Log
      const settled = await withTenantTransaction(tenantId, async (client) => {
        const lockedTxRes = await client.query<{
          refunded_amount_cents: string;
          captured_amount_cents: string;
          status: string;
        }>(
          `SELECT refunded_amount_cents, captured_amount_cents, status
           FROM payment_transactions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [phase1.txId, tenantId]
        );
        await client.query(
          `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [phase1.invoiceId, tenantId]
        );
        await client.query(
          `SELECT id FROM payment_refunds WHERE id = $1 FOR UPDATE`,
          [phase1.refundRowId]
        );

        const prevRefunded = Number(lockedTxRes.rows[0]?.refunded_amount_cents || 0);
        const newRefunded = Math.min(phase1.capturedCap, prevRefunded + phase1.requestedAmountCents);
        const isFullRefund = newRefunded >= phase1.capturedCap;
        const nextInvStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        const nextTxStatus = isFullRefund ? 'REFUNDED' : 'SUCCEEDED';

        await client.query(
          `UPDATE payment_refunds
           SET status = 'SUCCEEDED', stripe_refund_id = $2, ledger_posted = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [phase1.refundRowId, stripeRefundId]
        );

        await client.query(
          `UPDATE payment_transactions
           SET refunded_amount_cents = $1, status = $2, updated_at = NOW()
           WHERE id = $3`,
          [newRefunded, nextTxStatus, phase1.txId]
        );

        await client.query(
          `UPDATE invoices
           SET refunded_amount_cents = LEAST(total_amount_cents, $1), status = $2, updated_at = NOW()
           WHERE id = $3`,
          [newRefunded, nextInvStatus, phase1.invoiceId]
        );

        await postProportionalRefundLedger(client, {
          tenantId,
          txId: phase1.txId,
          invoiceId: phase1.invoiceId,
          bookingStatus: phase1.bookingStatus,
          totalCents: phase1.totalCents,
          taxCents: phase1.taxCents,
          commissionBps: phase1.commissionBps,
          prevRefundedCents: prevRefunded,
          deltaRefundCents: phase1.requestedAmountCents,
          refundKey: stripeRefundId,
          reasonDescription: `refund ${stripeRefundId}: ${parsed.data.reason}`,
        });

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
           VALUES ($1, $2, $3, 'REFUND_ISSUED', 'invoice', $4, $5)`,
          [
            tenantId,
            request.user!.id,
            request.user!.role,
            phase1.invoiceId,
            JSON.stringify({
              refundRecordId: phase1.refundRowId,
              refundRef: stripeRefundId,
              amountCents: phase1.requestedAmountCents,
              reason: parsed.data.reason,
              fullRefund: isFullRefund,
            }),
          ]
        );

        return {
          refundId: stripeRefundId,
          refundRecordId: phase1.refundRowId,
          invoiceId: phase1.invoiceId,
          invoiceStatus: nextInvStatus,
          transactionStatus: nextTxStatus,
          refundedAmountCents: newRefunded,
          amountCents: phase1.requestedAmountCents,
        };
      });

      return reply.status(200).send(successResponse(settled, requestId));
    });

    // 8b. Reconcile Stuck or Pending Refund (3-Phase, Zero Stripe Calls Inside DB Transaction)
    protectedRoutes.post('/refunds/:id/reconcile', {
      preHandler: [requirePermission('finance:refund:adjudicate'), blockInDemoMode('Customer refund reconciliation')],
      schema: {
        tags: ['Finances & General Ledger'],
        summary: 'Reconcile a PENDING or REQUIRES_RECONCILIATION refund against Stripe and update ledger or release lock',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const { id } = request.params as { id: string };

      if (!asValidUuid(id)) {
        return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Valid refund UUID is required.', requestId));
      }

      // Phase 1: Read refund & related transaction/invoice outside any long lock
      const refRes = await tenantQuery<{
        id: string;
        payment_transaction_id: string;
        invoice_id: string;
        booking_id: string;
        idempotency_key: string;
        amount_cents: string;
        currency: string;
        reason: string;
        status: string;
        stripe_refund_id: string | null;
        ledger_posted: boolean;
        stripe_payment_intent_id: string | null;
        captured_amount_cents: string;
        total_amount_cents: string;
        tax_total_cents: string;
        booking_status: string;
        commission_bps: number | null;
      }>(
        `SELECT pr.id, pr.payment_transaction_id, pr.invoice_id, pr.booking_id,
                pr.idempotency_key, pr.amount_cents, pr.currency, pr.reason,
                pr.status, pr.stripe_refund_id, pr.ledger_posted,
                pt.stripe_payment_intent_id, pt.captured_amount_cents,
                i.total_amount_cents, COALESCE(i.tax_total_cents, 0) AS tax_total_cents,
                b.status AS booking_status, COALESCE(i.commission_bps_snapshot, t.default_platform_commission_bps, 1500) AS commission_bps
         FROM payment_refunds pr
         JOIN payment_transactions pt ON pt.id = pr.payment_transaction_id
         JOIN invoices i ON i.id = pr.invoice_id
         JOIN bookings b ON b.id = pr.booking_id
         JOIN tenants t ON t.id = pr.tenant_id
         WHERE pr.id = $1 AND pr.tenant_id = $2`,
        [id, tenantId],
        tenantId
      );

      if (refRes.rowCount === 0) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Refund record not found.', requestId));
      }

      const refundRow = refRes.rows[0];
      if (refundRow.status === 'SUCCEEDED' || refundRow.status === 'FAILED') {
        return reply.status(200).send(
          successResponse({
            reconciled: true,
            refundRecordId: refundRow.id,
            refundId: refundRow.stripe_refund_id || refundRow.id,
            status: refundRow.status,
            amountCents: Number(refundRow.amount_cents),
            idempotent: true,
          }, requestId)
        );
      }

      // Phase 2: Query or retry external Gateway Refund outside any SQL transaction
      let resolvedStripeRefundId: string | null = refundRow.stripe_refund_id;
      let definitiveFailureReason: string | null = null;
      let transientErrorReason: string | null = null;

      const reconGateway = await getTenantPaymentGateway(tenantId);
      const reconRefundStripeKey = reconGateway.secrets.stripeSecretKey;
      const reconActiveGateway = env.PAYMENT_GATEWAY || 'stripe';
      const isStripeIntentForRefund =
        reconActiveGateway === 'stripe' || String(refundRow.stripe_payment_intent_id || '').startsWith('pi_');

      if (
        hasStripeConfigured(reconRefundStripeKey) &&
        refundRow.stripe_payment_intent_id &&
        !String(refundRow.stripe_payment_intent_id).startsWith('pi_sandbox_') &&
        isStripeIntentForRefund
      ) {
        try {
          const stripe = getStripe(reconRefundStripeKey ?? env.STRIPE_SECRET_KEY);
          if (resolvedStripeRefundId && resolvedStripeRefundId.startsWith('re_') && !resolvedStripeRefundId.startsWith('re_local_')) {
            const retrieved = await stripe.refunds.retrieve(resolvedStripeRefundId);
            if (retrieved.status === 'failed' || retrieved.status === 'canceled') {
              definitiveFailureReason = retrieved.failure_reason || `Stripe refund ${retrieved.status}`;
              resolvedStripeRefundId = null;
            }
          } else {
            const stripeRef = await stripe.refunds.create(
              {
                payment_intent: refundRow.stripe_payment_intent_id,
                amount: Number(refundRow.amount_cents),
                reason: 'requested_by_customer',
                metadata: {
                  tenantId,
                  refundId: refundRow.id,
                  transactionId: refundRow.payment_transaction_id,
                  invoiceId: refundRow.invoice_id,
                },
              },
              { idempotencyKey: `refund_${refundRow.idempotency_key}` }
            );
            if (stripeRef.status === 'failed' || stripeRef.status === 'canceled') {
              definitiveFailureReason = `Stripe refund ${stripeRef.status}`;
            } else {
              resolvedStripeRefundId = stripeRef.id;
            }
          }
        } catch (stripeErr: any) {
          const errMsg = String(stripeErr?.message || 'Stripe refund reconciliation failed');
          if (isDefinitiveStripeError(stripeErr)) {
            definitiveFailureReason = errMsg;
          } else {
            transientErrorReason = errMsg;
          }
        }
      } else if (
        (reconActiveGateway === 'paytabs' || reconActiveGateway === 'telr') &&
        reconGateway.isConfigured &&
        refundRow.stripe_payment_intent_id &&
        !String(refundRow.stripe_payment_intent_id).startsWith('pi_sandbox_') &&
        !isStripeIntentForRefund
      ) {
        if (!resolvedStripeRefundId) {
          try {
            const gwRef = await reconGateway.gateway.refund({
              providerReferenceId: refundRow.stripe_payment_intent_id,
              amountCents: Number(refundRow.amount_cents),
              currency: refundRow.currency || 'AED',
              reason: refundRow.reason,
              idempotencyKey: `refund_${refundRow.idempotency_key}`,
            });
            resolvedStripeRefundId = gwRef.refundId;
          } catch (gwErr: any) {
            const errMsg = String(gwErr?.message || `${reconGateway.gateway.name} refund reconciliation failed`);
            if (gwErr?.code === 'GATEWAY_OPERATION_NOT_SUPPORTED') {
              definitiveFailureReason = errMsg;
            } else {
              transientErrorReason = errMsg;
            }
          }
        }
      } else {
        resolvedStripeRefundId = resolvedStripeRefundId || `re_local_${refundRow.id.replace(/-/g, '').slice(0, 20)}`;
      }

      // Phase 3: Atomic Settlement or Failure Unlock
      const outcome = await withTenantTransaction<{ status: number; body: any }>(tenantId, async (client) => {
        const lockRefund = await client.query<{
          id: string;
          status: string;
          amount_cents: string;
          ledger_posted: boolean;
        }>(
          `SELECT id, status, amount_cents, ledger_posted FROM payment_refunds WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [id, tenantId]
        );
        if (lockRefund.rowCount === 0) {
          return { status: 404, body: errorResponse('NOT_FOUND', 'Refund record not found.', requestId) };
        }
        const cur = lockRefund.rows[0];
        if (cur.status === 'SUCCEEDED' || cur.status === 'FAILED') {
          return {
            status: 200,
            body: successResponse({
              reconciled: true,
              refundRecordId: cur.id,
              status: cur.status,
              amountCents: Number(cur.amount_cents),
              idempotent: true,
            }, requestId),
          };
        }

        if (definitiveFailureReason) {
          await client.query(
            `UPDATE payment_refunds SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1`,
            [id, definitiveFailureReason]
          );
          return {
            status: 200,
            body: successResponse({
              reconciled: true,
              refundRecordId: id,
              status: 'FAILED',
              errorMessage: definitiveFailureReason,
            }, requestId),
          };
        }

        if (resolvedStripeRefundId && !transientErrorReason) {
          const lockedTxRes = await client.query<{
            refunded_amount_cents: string;
          }>(
            `SELECT refunded_amount_cents FROM payment_transactions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [refundRow.payment_transaction_id, tenantId]
          );
          await client.query(
            `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [refundRow.invoice_id, tenantId]
          );

          const capturedAmount = Number(refundRow.captured_amount_cents || 0);
          const invoiceTotal = Number(refundRow.total_amount_cents || 0);
          const capturedCap = capturedAmount > 0 ? Math.min(capturedAmount, invoiceTotal) : invoiceTotal;
          const prevRefunded = Number(lockedTxRes.rows[0]?.refunded_amount_cents || 0);
          const requestedCents = Number(refundRow.amount_cents);
          const newRefunded = Math.min(capturedCap, prevRefunded + requestedCents);
          const isFullRefund = newRefunded >= capturedCap;
          const nextInvStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
          const nextTxStatus = isFullRefund ? 'REFUNDED' : 'SUCCEEDED';

          await client.query(
            `UPDATE payment_refunds
             SET status = 'SUCCEEDED', stripe_refund_id = $2, ledger_posted = TRUE, error_message = NULL, updated_at = NOW()
             WHERE id = $1`,
            [id, resolvedStripeRefundId]
          );

          await client.query(
            `UPDATE payment_transactions
             SET refunded_amount_cents = $1, status = $2, updated_at = NOW()
             WHERE id = $3`,
            [newRefunded, nextTxStatus, refundRow.payment_transaction_id]
          );

          await client.query(
            `UPDATE invoices
             SET refunded_amount_cents = LEAST(total_amount_cents, $1), status = $2, updated_at = NOW()
             WHERE id = $3`,
            [newRefunded, nextInvStatus, refundRow.invoice_id]
          );

          if (!cur.ledger_posted) {
            await postProportionalRefundLedger(client, {
              tenantId,
              txId: refundRow.payment_transaction_id,
              invoiceId: refundRow.invoice_id,
              bookingStatus: refundRow.booking_status,
              totalCents: invoiceTotal,
              taxCents: Number(refundRow.tax_total_cents || 0),
              commissionBps: Number(refundRow.commission_bps ?? 1500),
              prevRefundedCents: prevRefunded,
              deltaRefundCents: requestedCents,
              refundKey: resolvedStripeRefundId,
              reasonDescription: `reconciled refund ${resolvedStripeRefundId}: ${refundRow.reason}`,
            });
          }

          return {
            status: 200,
            body: successResponse({
              reconciled: true,
              refundRecordId: id,
              refundId: resolvedStripeRefundId,
              status: 'SUCCEEDED',
              invoiceId: refundRow.invoice_id,
              invoiceStatus: nextInvStatus,
              refundedAmountCents: newRefunded,
              amountCents: requestedCents,
            }, requestId),
          };
        }

        await client.query(
          `UPDATE payment_refunds SET error_message = COALESCE($2, error_message), updated_at = NOW() WHERE id = $1`,
          [id, transientErrorReason]
        );
        return {
          status: 202,
          body: successResponse({
            reconciled: false,
            refundRecordId: id,
            status: 'REQUIRES_RECONCILIATION',
            message: transientErrorReason || 'Refund outcome remains pending with payment gateway.',
          }, requestId),
        };
      });

      return reply.status(outcome.status).send(outcome.body);
    });

    // 9. Technician Promotional Bonuses & Incentives (List + Award)
    protectedRoutes.get('/bonuses', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'List technician bonuses and incentive payouts',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const q = (request.query || {}) as { providerId?: string };

      const params: any[] = [tenantId];
      let where = 'WHERE pb.tenant_id = $1';
      if (q.providerId && asValidUuid(q.providerId)) {
        params.push(q.providerId);
        where += ` AND pb.provider_id = $${params.length}`;
      }

      const res = await tenantQuery(
        `SELECT pb.id, pb.provider_id AS "providerId", pp.full_name AS "providerName",
                pb.amount_cents AS "amountCents", pb.currency, pb.category, pb.reason, pb.status,
                pb.awarded_by AS "awardedBy",
                pb.created_at AS "createdAt"
         FROM provider_bonuses pb
         JOIN provider_profiles pp ON pp.user_id = pb.provider_id AND pp.tenant_id = pb.tenant_id
         ${where}
         ORDER BY pb.created_at DESC
         LIMIT 100`,
        params,
        tenantId
      );

      return reply.status(200).send(
        successResponse(
          res.rows.map((r: any) => ({ ...r, amountCents: Number(r.amountCents || 0) })),
          requestId
        )
      );
    });

    protectedRoutes.post('/bonuses', {
      preHandler: [requirePermission('finance:payout:execute'), blockInDemoMode('Awarding technician bonus')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Award a technician promotional bonus and credit technician payable ledger',
        security: [{ bearerAuth: [] }],
      },
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const parsed = z.object({
        providerId: z.string().uuid(),
        amountCents: z.number().int().positive().max(10000000),
        reason: z.string().trim().min(2).max(255),
        category: z.enum(['PERFORMANCE', 'QUALITY', 'EMERGENCY', 'REFERRAL', 'ADJUSTMENT']).default('PERFORMANCE'),
      }).safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(
          errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid bonus payload.', requestId)
        );
      }

      const { providerId, amountCents, reason, category } = parsed.data;
      const currency = (request.tenant?.currencyCode || 'AED').toUpperCase();
      const rawIdemKey = (request.headers['idempotency-key'] as string | undefined)?.trim();
      const idempotencyKey = rawIdemKey || `bonus_${crypto.randomUUID()}`;

      const outcome = await withTenantTransaction<
        | { ok: true; bonus: any }
        | { ok: false; status: number; code: string; message: string }
      >(tenantId, async (client) => {
        const techRes = await client.query<{ full_name: string }>(
          `SELECT full_name FROM provider_profiles WHERE user_id = $1 AND tenant_id = $2`,
          [providerId, tenantId]
        );
        if (techRes.rows.length === 0) {
          return { ok: false, status: 404, code: 'PROVIDER_NOT_FOUND', message: 'Technician profile not found.' };
        }

        const existingRes = await client.query(
          `SELECT id, provider_id AS "providerId", amount_cents AS "amountCents", currency, category, reason, status, created_at AS "createdAt"
           FROM provider_bonuses
           WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, idempotencyKey]
        );
        if (existingRes.rows.length > 0) {
          const ex = existingRes.rows[0];
          return { ok: true, bonus: { ...ex, providerName: techRes.rows[0].full_name, amountCents: Number(ex.amountCents) } };
        }

        const bonusRes = await client.query(
          `INSERT INTO provider_bonuses (tenant_id, provider_id, awarded_by, amount_cents, currency, category, reason, idempotency_key, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED')
           RETURNING id, provider_id AS "providerId", amount_cents AS "amountCents", currency, category, reason, status, created_at AS "createdAt"`,
          [tenantId, providerId, request.user?.id || null, amountCents, currency, category, reason, idempotencyKey]
        );
        const bonus = bonusRes.rows[0];

        const accRes = await client.query<{ id: string; account_number: string }>(
          `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1 AND account_number IN ('2020', '5020')`,
          [tenantId]
        );
        const techPayable = accRes.rows.find((a) => a.account_number === '2020')?.id;
        let bonusExpense = accRes.rows.find((a) => a.account_number === '5020')?.id;
        if (!bonusExpense) {
          const insAcc = await client.query<{ id: string }>(
            `INSERT INTO ledger_accounts (tenant_id, account_number, account_name, account_type, currency_code)
             VALUES ($1, '5020', 'Promotional Bonus & Incentive Expense', 'EXPENSE', $2)
             ON CONFLICT (tenant_id, account_number) DO UPDATE SET account_name = EXCLUDED.account_name
             RETURNING id`,
            [tenantId, currency]
          );
          bonusExpense = insAcc.rows[0]?.id;
        }
        if (techPayable && bonusExpense) {
          await client.query(
            `INSERT INTO ledger_entries (tenant_id, bonus_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
             VALUES ($1, $2, 'BONUS_AWARD', $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [tenantId, bonus.id, bonusExpense, techPayable, amountCents, `Bonus for ${techRes.rows[0].full_name}: ${reason}`]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, diff_payload)
           VALUES ($1, $2, $3, 'BONUS_AWARDED', 'provider_bonuses', $4, $5)`,
          [tenantId, request.user?.id || null, request.user?.role || null, bonus.id, JSON.stringify({ providerId, amountCents, reason })]
        );

        return { ok: true, bonus: { ...bonus, providerName: techRes.rows[0].full_name, amountCents: Number(bonus.amountCents) } };
      });

      if (!outcome.ok) {
        return reply.status(outcome.status).send(errorResponse(outcome.code, outcome.message, requestId));
      }

      return reply.status(201).send(successResponse(outcome.bonus, requestId));
    });
  });
}
