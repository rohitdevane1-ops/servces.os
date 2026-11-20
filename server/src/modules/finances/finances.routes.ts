import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import pg from 'pg';
import crypto from 'crypto';
import { pool } from '../../database/pool.js';
import { successResponse, errorResponse } from '../../types/envelope.js';
import { authenticate, requirePermission } from '../../middleware/rbac.js';
import { env } from '../../config/env.js';
import { getStripe, hasStripeConfigured, isDefinitiveStripeError } from '../../services/stripeClient.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invoiceQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'AUTHORIZED', 'PAID', 'REFUNDED', 'VOID']).optional(),
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
           pt.authorized_amount_cents, pt.currency, pt.status,
           i.booking_id, i.total_amount_cents,
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

    // 1. Transactional & Atomic Idempotency Event Claim (rolled back if target local record is missing or conflicted)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const claimRes = await client.query(
        `INSERT INTO webhook_events (id, provider, event_type, processed_at, payload)
         VALUES ($1, 'stripe', $2, NOW(), $3)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [eventId, eventType, JSON.stringify(event)]
      );

      if (claimRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(200).send({ received: true, idempotent: true });
      }

      // 2. Process Known Events Atomically with Tenant, Amount, Currency and State Validation
      if (eventType === 'payment_intent.succeeded') {
        const paymentIntent = event.data?.object;
        if (!paymentIntent?.id) {
          await client.query('ROLLBACK');
          return reply.status(400).send(errorResponse('INVALID_PAYLOAD', 'Missing paymentIntent.id', requestId));
        }

        const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
        if (resolved.status === 'CONFLICT') {
          await client.query('ROLLBACK');
          return reply.status(409).send(errorResponse(resolved.code, resolved.message, requestId));
        }
        if (resolved.status === 'MISSING') {
          await client.query('ROLLBACK');
          return reply.status(503).send(
            errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Referenced payment transaction is not committed yet; retry later.', requestId)
          );
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

          // 2. Settle Invoice
          await client.query(
            `UPDATE invoices 
             SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() 
             WHERE id = $1`,
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

          // Release Escrow to Platform Revenue (4010) and Tech Payable (2020) ONLY when booking work is COMPLETED
          if (tx.booking_status === 'COMPLETED') {
            const totalCents = Number(tx.total_amount_cents || amountReceived);
            const commissionBps = Number(tx.default_platform_commission_bps || 1500);
            const platformFeeCents = Math.round(totalCents * (commissionBps / 10000));
            const netTechPayoutCents = totalCents - platformFeeCents;

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
            await client.query('ROLLBACK');
            return reply.status(409).send(errorResponse(resolved.code, resolved.message, requestId));
          }
          if (resolved.status === 'MISSING') {
            await client.query('ROLLBACK');
            return reply.status(503).send(errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.', requestId));
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
            await client.query('ROLLBACK');
            return reply.status(409).send(errorResponse(resolved.code, resolved.message, requestId));
          }
          if (resolved.status === 'MISSING') {
            await client.query('ROLLBACK');
            return reply.status(503).send(errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.', requestId));
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
            await client.query('ROLLBACK');
            return reply.status(409).send(errorResponse(resolved.code, resolved.message, requestId));
          }
          if (resolved.status === 'MISSING') {
            await client.query('ROLLBACK');
            return reply.status(503).send(errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.', requestId));
          }
          await client.query(
            `UPDATE payment_transactions 
             SET status = 'REFUNDED', refunded_amount_cents = $1, updated_at = NOW() 
             WHERE id = $2`,
            [charge.amount_refunded || 0, resolved.row.id]
          );
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
            await client.query('ROLLBACK');
            return reply.status(503).send(
              errorResponse('WEBHOOK_TARGET_NOT_FOUND', `Payout for Stripe transfer ${transfer.id} not found yet.`, requestId)
            );
          }

          const payout = payoutRes.rows[0];
          const totalCents = parseInt(payout.amount_cents, 10);
          const alreadyReversed = parseInt(payout.amount_reversed_cents || '0', 10);
          const cumulativeReversed = Number(transfer.amount_reversed ?? transfer.amount ?? 0);

          if (cumulativeReversed <= 0 || cumulativeReversed > totalCents) {
            await client.query('ROLLBACK');
            return reply.status(422).send(
              errorResponse('INVALID_REVERSAL_AMOUNT', `Cumulative reversal ${cumulativeReversed} is out of bounds for payout amount ${totalCents}.`, requestId)
            );
          }

          if (cumulativeReversed <= alreadyReversed) {
            // Stale out-of-order or duplicate reversal event: ignore delta, claim idempotently
            await client.query('COMMIT');
            return reply.status(200).send({ received: true, idempotent: true });
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
            await client.query(
              `UPDATE provider_payouts 
               SET status = 'FAILED', updated_at = NOW() 
               WHERE stripe_transfer_id = $1`,
              [objId]
            );
          }
        }
      } else if (eventType === 'payment_intent.amount_capturable_updated') {
        const paymentIntent = event.data?.object;
        if (paymentIntent?.id) {
          const resolved = await resolveWebhookPaymentTx(client, paymentIntent.id, paymentIntent.metadata);
          if (resolved.status === 'CONFLICT') {
            await client.query('ROLLBACK');
            return reply.status(409).send(errorResponse(resolved.code, resolved.message, requestId));
          }
          if (resolved.status === 'MISSING') {
            await client.query('ROLLBACK');
            return reply.status(503).send(errorResponse('WEBHOOK_TARGET_NOT_FOUND', 'Payment transaction not committed yet.', requestId));
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
          }
        }
      }

      await client.query('COMMIT');
      return reply.status(200).send({ received: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Protected Routes Group
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);
    protectedRoutes.addHook('preHandler', requirePermission('finance:dashboard:view'));

    // 1. Executive Financial Metrics Overview
    protectedRoutes.get('/overview', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Executive financial metrics, gross turnover, commissions, and escrow balance',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const { startDate, endDate } = request.query as any;

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
        pool.query(
          `SELECT 
            COALESCE(SUM(total_amount_cents), 0)::bigint as "grossVolumeCents",
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount_cents ELSE 0 END), 0)::bigint as "settledVolumeCents",
            COUNT(id)::int as "totalInvoicesCount",
            COUNT(CASE WHEN status = 'PAID' THEN 1 END)::int as "paidInvoicesCount"
           FROM invoices 
           WHERE tenant_id = $1 ${dateFilter}`,
          params
        ),
        pool.query(
          `SELECT account_number as "accountNumber", account_name as "accountName", account_type as "accountType"
           FROM ledger_accounts
           WHERE tenant_id = $1
           ORDER BY account_number ASC`,
          [tenantId]
        ),
        pool.query(
          `SELECT pt.id, pt.stripe_payment_intent_id as "paymentIntentId", pt.authorized_amount_cents as "authorizedAmountCents",
                  pt.captured_amount_cents as "capturedAmountCents", pt.transaction_type as "transactionType",
                  pt.status, pt.created_at as "createdAt", inv.invoice_number as "invoiceNumber"
           FROM payment_transactions pt
           JOIN invoices inv ON inv.id = pt.invoice_id
           WHERE pt.tenant_id = $1
           ORDER BY pt.created_at DESC LIMIT 10`,
          [tenantId]
        )
      ]);

      const metrics = grossRes.rows[0];

      return reply.status(200).send(
        successResponse({
          grossVolumeCents: metrics.grossVolumeCents,
          settledVolumeCents: metrics.settledVolumeCents,
          totalInvoicesCount: metrics.totalInvoicesCount,
          paidInvoicesCount: metrics.paidInvoicesCount,
          accounts: accountsRes.rows,
          recentTransactions: recentTxRes.rows,
        }, requestId)
      );
    });

    // 1b. Executive Financial Metrics Alias (WEB-01)
    protectedRoutes.get('/metrics', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Executive financial metrics alias',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;
      const { startDate, endDate } = request.query as any;

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
        pool.query(
          `SELECT 
            COALESCE(SUM(total_amount_cents), 0)::bigint as "grossVolumeCents",
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount_cents ELSE 0 END), 0)::bigint as "settledVolumeCents",
            COUNT(id)::int as "totalInvoicesCount",
            COUNT(CASE WHEN status = 'PAID' THEN 1 END)::int as "paidInvoicesCount"
           FROM invoices 
           WHERE tenant_id = $1 ${dateFilter}`,
          params
        ),
        pool.query(
          `SELECT account_number as "accountNumber", account_name as "accountName", account_type as "accountType"
           FROM ledger_accounts 
           WHERE tenant_id = $1 
           ORDER BY account_number ASC`,
          [tenantId]
        ),
        pool.query(
          `SELECT pt.id, pt.stripe_payment_intent_id as "paymentIntentId", pt.authorized_amount_cents as "authorizedAmountCents",
                  pt.captured_amount_cents as "capturedAmountCents", pt.transaction_type as "transactionType",
                  pt.status, pt.created_at as "createdAt", inv.invoice_number as "invoiceNumber"
           FROM payment_transactions pt
           JOIN invoices inv ON inv.id = pt.invoice_id
           WHERE pt.tenant_id = $1
           ORDER BY pt.created_at DESC LIMIT 10`,
          [tenantId]
        )
      ]);

      const metrics = grossRes.rows[0];

      return reply.status(200).send(
        successResponse({
          grossVolumeCents: metrics.grossVolumeCents,
          settledVolumeCents: metrics.settledVolumeCents,
          totalInvoicesCount: metrics.totalInvoicesCount,
          paidInvoicesCount: metrics.paidInvoicesCount,
          accounts: accountsRes.rows,
          recentTransactions: recentTxRes.rows,
        }, requestId)
      );
    });

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
        pool.query(countQuery, params),
        pool.query(dataQuery, [...params, limit, offset])
      ]);

      const total = countRes.rows[0]?.total || 0;

      return reply.status(200).send(
        successResponse(dataRes.rows, requestId, {
          page,
          limit,
          totalRecords: total,
          totalPages: Math.ceil(total / limit)
        })
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

      const invRes = await pool.query(
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
        [invoiceId, tenantId]
      );

      if (invRes.rowCount === 0) {
        return reply.status(404).send(
          errorResponse('NOT_FOUND', 'Invoice not found', requestId)
        );
      }

      const [itemsRes, txRes] = await Promise.all([
        pool.query(
          `SELECT id, description, item_type as "itemType", quantity, unit_price_cents as "unitPriceCents", total_cents as "totalCents"
           FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC`,
          [invoiceId]
        ),
        pool.query(
          `SELECT id, stripe_payment_intent_id as "paymentIntentId", idempotency_key as "idempotencyKey",
                  authorized_amount_cents as "authorizedAmountCents", captured_amount_cents as "capturedAmountCents",
                  transaction_type as "transactionType", status, created_at as "createdAt"
           FROM payment_transactions WHERE invoice_id = $1 ORDER BY created_at DESC`,
          [invoiceId]
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

    // 4. Double-Entry General Ledger Journal Entries
    protectedRoutes.get('/ledger', {
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Audit view of double-entry ledger journal entries',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const tenantId = request.tenantId;

      const result = await pool.query(
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
        LIMIT 100`,
        [tenantId]
      );

      return reply.status(200).send(
        successResponse(result.rows, requestId)
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
      const unreconciledPayoutsRes = await pool.query(
        `SELECT pp.id, pp.provider_id, pp.amount_cents, pp.status, pp.stripe_transfer_id, pp.created_at
         FROM provider_payouts pp
         WHERE pp.tenant_id = $1
           AND pp.stripe_transfer_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM ledger_entries le 
             WHERE le.payout_id = pp.id 
                OR (le.tenant_id = $1 AND le.description LIKE '%' || pp.stripe_transfer_id || '%')
           )`,
        [tenantId]
      );

      // 2. Succeeded Payments with Unsettled Invoices (BACK-01 indicator)
      const unsettledPaymentTxsRes = await pool.query(
        `SELECT pt.id, pt.invoice_id, pt.stripe_payment_intent_id, pt.authorized_amount_cents, pt.captured_amount_cents, pt.status as tx_status,
                i.status as invoice_status, i.total_amount_cents
         FROM payment_transactions pt
         JOIN invoices i ON i.id = pt.invoice_id
         WHERE pt.tenant_id = $1
           AND pt.status = 'SUCCEEDED'
           AND i.status != 'PAID'`,
        [tenantId]
      );

      // 3. Paid Invoices without Succeeded Transactions
      const mismatchedInvoicesRes = await pool.query(
        `SELECT i.id, i.booking_id, i.total_amount_cents, i.status as invoice_status,
                pt.status as tx_status, pt.stripe_payment_intent_id
         FROM invoices i
         LEFT JOIN payment_transactions pt ON pt.invoice_id = i.id
         WHERE i.tenant_id = $1
           AND i.status = 'PAID'
           AND (pt.id IS NULL OR pt.status != 'SUCCEEDED')`,
        [tenantId]
      );

      // 4. Duplicate Ledger Candidate Postings
      const duplicateLedgersRes = await pool.query(
        `SELECT payout_id, transaction_id, posting_type, COUNT(*) as count
         FROM ledger_entries
         WHERE tenant_id = $1
           AND (payout_id IS NOT NULL OR transaction_id IS NOT NULL)
         GROUP BY payout_id, transaction_id, posting_type
         HAVING COUNT(*) > 1`,
        [tenantId]
      );

      // 5. Quarantined or Flagged Discrepancy Transactions
      const quarantinedTxsRes = await pool.query(
        `SELECT pt.id, pt.invoice_id, pt.stripe_payment_intent_id, pt.authorized_amount_cents, pt.status, pt.created_at
         FROM payment_transactions pt
         WHERE pt.tenant_id = $1 AND pt.status IN ('DISCREPANCY_QUARANTINED', 'FAILED')`,
        [tenantId]
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
      preHandler: [requirePermission('finance:payout:execute')],
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

      // PAY-05: Simulation gating: In production, fail closed if Stripe key is missing
      if (!hasStripeConfigured()) {
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
      const client = await pool.connect();
      let payoutId: string;
      let providerName: string;
      let stripeAccountId: string | null = null;
      let techPayableId: string;
      let bankAssetId: string;
      let existingPayout: any = null;
      const transferDesc = description || null;

      try {
        await client.query('BEGIN');

        // Check provider exists and lock provider row exclusively to serialize payout attempts for this provider
        const provRes = await client.query(
          `SELECT user_id, full_name, stripe_connect_account_id, stripe_payouts_enabled
           FROM provider_profiles
           WHERE user_id = $1 AND tenant_id = $2
           FOR UPDATE`,
          [providerId, tenantId]
        );

        if (provRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send(
            errorResponse('NOT_FOUND', 'Provider not found', requestId)
          );
        }

        const provider = provRes.rows[0];
        providerName = provider.full_name;
        stripeAccountId = provider.stripe_connect_account_id;

        // Verify standard ledger accounts exist before proceeding
        const accRes = await client.query(
          `SELECT id, account_number FROM ledger_accounts 
           WHERE tenant_id = $1 AND account_number IN ('1010', '2020')`,
          [tenantId]
        );
        const techPayable = accRes.rows.find(a => a.account_number === '2020');
        const bankAsset = accRes.rows.find(a => a.account_number === '1010');

        if (!techPayable || !bankAsset) {
          await client.query('ROLLBACK');
          return reply.status(422).send(
            errorResponse('LEDGER_ACCOUNTS_MISSING', 'Standard ledger accounts (1010 Operating Bank / 2020 Technician Payable) are not provisioned for this tenant.', requestId)
          );
        }
        techPayableId = techPayable.id;
        bankAssetId = bankAsset.id;

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
            await client.query('ROLLBACK');
            return reply.status(409).send(
              errorResponse('IDEMPOTENCY_KEY_MISMATCH', 'Idempotency key was previously used with different payout parameters (provider or amount).', requestId)
            );
          }
          existingPayout = ep;
          await client.query('COMMIT');
        } else {
          // Check provider's settled earnings balance (joining tenants for platform commission terms)
          // Subtract net payouts (amount_cents - amount_reversed_cents) for PAID, PROCESSING, PENDING_PROVIDER_CONFIRMATION, PARTIALLY_REVERSED
          const balanceRes = await client.query(
            `SELECT 
              COALESCE(SUM(CASE WHEN b.assigned_provider_id = $1 AND b.status = 'COMPLETED' THEN (i.total_amount_cents * (10000 - COALESCE(t.default_platform_commission_bps, 1500)) / 10000) ELSE 0 END), 0)::bigint as total_earned_cents,
              COALESCE((
                SELECT SUM(amount_cents - COALESCE(amount_reversed_cents, 0))
                FROM provider_payouts
                WHERE provider_id = $1 AND tenant_id = $2
                  AND status <> 'FAILED'
                  AND (status IN ('PAID', 'PROCESSING', 'TRANSFER_CONFIRMED', 'PENDING_PROVIDER_CONFIRMATION', 'PARTIALLY_REVERSED') OR stripe_transfer_id IS NOT NULL)
              ), 0)::bigint as total_paid_cents
             FROM bookings b
             JOIN tenants t ON t.id = b.tenant_id
             JOIN invoices i ON i.booking_id = b.id AND i.status = 'PAID'
             WHERE b.assigned_provider_id = $1 AND b.tenant_id = $2`,
            [providerId, tenantId]
          );
          const totalEarned = Number(balanceRes.rows[0]?.total_earned_cents || 0);
          const totalPaid = Number(balanceRes.rows[0]?.total_paid_cents || 0);
          const unpaidBalanceCents = Math.max(0, totalEarned - totalPaid);

          // Universal invariant: Payout must never exceed settled unpaid earnings
          if (amountCents > unpaidBalanceCents) {
            await client.query('ROLLBACK');
            return reply.status(400).send(
              errorResponse('INSUFFICIENT_PAYOUT_BALANCE', `Payout amount (${amountCents} cents) exceeds provider settled unpaid balance (${unpaidBalanceCents} cents).`, requestId)
            );
          }

          // Insert durable payout record in PROCESSING state with persisted destination & description
          const persistedDesc = transferDesc || `Provider payout to ${providerName}`;
          const pendingPayoutRes = await client.query(
            `INSERT INTO provider_payouts (
              tenant_id, provider_id, amount_cents, currency, status, idempotency_key, request_fingerprint,
              destination_account_id, transfer_description
            ) VALUES ($1, $2, $3, 'USD', 'PROCESSING', $4, $5, $6, $7)
            RETURNING id`,
            [tenantId, providerId, amountCents, idempotencyKey, requestFingerprint, stripeAccountId, persistedDesc]
          );
          payoutId = pendingPayoutRes.rows[0].id;

          // COMMIT Phase 1: Payout record is now durable in PostgreSQL
          await client.query('COMMIT');
        }
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Idempotent Replay & Crash Recovery (strictly OUTSIDE Phase 1 transaction)
      if (existingPayout) {
        const ep = existingPayout;
        const recoveryDest = ep.destination_account_id || stripeAccountId;
        const recoveryDesc = ep.transfer_description || `Provider payout recovery for ${providerName}`;

        if (!ep.stripe_transfer_id && hasStripeConfigured() && recoveryDest && ep.status !== 'FAILED') {
          try {
            const stripe = getStripe(env.STRIPE_SECRET_KEY);
            const recoveredTransfer = await stripe.transfers.create({
              amount: parseInt(ep.amount_cents, 10),
              currency: 'usd',
              destination: recoveryDest,
              description: recoveryDesc
            }, {
              idempotencyKey: `payout_stripe_${ep.id}`
            });
            ep.stripe_transfer_id = recoveredTransfer.id;
            ep.status = 'PROCESSING';
          } catch (stripeErr: any) {
            if (isDefinitiveStripeError(stripeErr)) {
              await pool.query(
                `UPDATE provider_payouts SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
                [ep.id, stripeErr.message]
              );
              return reply.status(502).send(
                errorResponse('STRIPE_TRANSFER_FAILED', `Stripe Connect payout recovery failed: ${stripeErr.message}`, requestId)
              );
            }
            await pool.query(
              `UPDATE provider_payouts SET status = 'PENDING_PROVIDER_CONFIRMATION', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
              [ep.id, stripeErr.message]
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

        if (ep.stripe_transfer_id) {
          const recClient = await pool.connect();
          try {
            await recClient.query('BEGIN');
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
            await recClient.query('COMMIT');
          } catch (recErr) {
            await recClient.query('ROLLBACK');
            throw recErr;
          } finally {
            recClient.release();
          }
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

      // PHASE 2 (PAY-03): Call Stripe Connect Transfer with durable database-backed idempotency key
      let transferRef: string;
      const isSimulated = !hasStripeConfigured();

      if (hasStripeConfigured()) {
        if (!stripeAccountId) {
          await pool.query(
            `UPDATE provider_payouts SET status = 'FAILED', failure_reason = 'Missing Stripe Connect account', updated_at = NOW() WHERE id = $1`,
            [payoutId!]
          );
          return reply.status(422).send(
            errorResponse('PROVIDER_PAYOUT_NOT_CONFIGURED', 'Technician does not have a linked Stripe Connect payout account.', requestId)
          );
        }

        try {
          const stripe = getStripe(env.STRIPE_SECRET_KEY);
          const transfer = await stripe.transfers.create({
            amount: amountCents,
            currency: 'usd',
            destination: stripeAccountId,
            description: description || `Provider payout to ${providerName}`
          }, {
            idempotencyKey: `payout_stripe_${payoutId!}`
          });
          transferRef = transfer.id;
        } catch (stripeErr: any) {
          if (isDefinitiveStripeError(stripeErr)) {
            await pool.query(
              `UPDATE provider_payouts SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
              [payoutId!, stripeErr.message]
            );
            return reply.status(502).send(
              errorResponse('STRIPE_TRANSFER_FAILED', `Stripe Connect payout transfer failed: ${stripeErr.message}`, requestId)
            );
          }

          // Ambiguous network/timeout/5xx/rate-limit failure: DO NOT mark FAILED! Keep balance reserved.
          await pool.query(
            `UPDATE provider_payouts SET status = 'PENDING_PROVIDER_CONFIRMATION', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
            [payoutId!, stripeErr.message]
          );
          return reply.status(202).send(
            successResponse({
              payoutId: payoutId!,
              amountCents,
              providerName,
              status: 'PENDING_PROVIDER_CONFIRMATION',
              message: 'Stripe transfer timed out or returned transient error; funds remain reserved pending reconciliation.'
            }, requestId)
          );
        }
      } else {
        // PAY-05: Sandbox test simulation only
        transferRef = `tr_test_simulated_${payoutId!}`;
      }

      // PHASE 3 (PAY-03): Reconcile external transfer, post double-entry ledger entries, and audit log
      const reconClient = await pool.connect();
      try {
        await reconClient.query('BEGIN');

        const payoutRes = await reconClient.query(
          `UPDATE provider_payouts
           SET stripe_transfer_id = $1, processed_at = NOW(), status = 'PROCESSING', updated_at = NOW()
           WHERE id = $2
           RETURNING id, stripe_transfer_id, amount_cents, status, created_at`,
          [transferRef, payoutId!]
        );

        await reconClient.query(
          `INSERT INTO ledger_entries (
            tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description
          ) VALUES ($1, $2, 'PAYOUT_DISBURSAL', $3, $4, $5, $6)
          ON CONFLICT (payout_id, posting_type) DO NOTHING`,
          [
            tenantId,
            payoutId!,
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
            payoutId!,
            JSON.stringify({ providerId, amountCents, transferRef, isSimulated })
          ]
        );

        await reconClient.query('COMMIT');

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
      } catch (reconErr) {
        await reconClient.query('ROLLBACK');
        throw reconErr;
      } finally {
        reconClient.release();
      }
    });

    // 5b. Reconcile Orphaned or Pending Payout (3-Phase, Zero Stripe Calls Inside DB Transaction)
    protectedRoutes.post('/payouts/:id/reconcile', {
      preHandler: [requirePermission('finance:payout:execute')],
      schema: {
        tags: ['Finances & Ledger'],
        summary: 'Reconcile interrupted or orphaned technician payout',
        security: [{ bearerAuth: [] }]
      }
    }, async (request, reply) => {
      const requestId = request.id || `req_${Date.now()}`;
      const { id } = request.params as any;
      const tenantId = request.tenantId;

      // PHASE 1: Fast Read (release DB client before Stripe I/O)
      const readClient = await pool.connect();
      let payout: any;
      let providerConnectId: string | null = null;
      try {
        const payoutRes = await readClient.query(
          `SELECT p.id, p.provider_id, p.amount_cents, p.status, p.stripe_transfer_id,
                  p.idempotency_key, p.destination_account_id, p.transfer_description,
                  pr.stripe_connect_account_id, pr.full_name
           FROM provider_payouts p
           LEFT JOIN provider_profiles pr ON pr.user_id = p.provider_id AND pr.tenant_id = p.tenant_id
           WHERE p.id = $1 AND p.tenant_id = $2`,
          [id, tenantId]
        );

        if (payoutRes.rowCount === 0) {
          return reply.status(404).send(errorResponse('NOT_FOUND', 'Payout record not found', requestId));
        }

        payout = payoutRes.rows[0];
        providerConnectId = payout.destination_account_id || payout.stripe_connect_account_id || null;
      } finally {
        readClient.release();
      }

      // PHASE 2: External Stripe Recovery/Verification OUTSIDE any open transaction
      let reconciledTransferId: string | null = payout.stripe_transfer_id || null;
      let definitiveFailureReason: string | null = null;
      let transientErrorReason: string | null = null;

      if (hasStripeConfigured()) {
        const stripe = getStripe(env.STRIPE_SECRET_KEY);
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
              currency: 'usd',
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lockRes = await client.query(
          `SELECT id, status, stripe_transfer_id, amount_cents FROM provider_payouts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [id, tenantId]
        );
        if (lockRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send(errorResponse('NOT_FOUND', 'Payout record not found', requestId));
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
          await client.query('COMMIT');
          return reply.status(200).send(successResponse({
            reconciled: true,
            payoutId: id,
            status: 'FAILED',
            message: `Confirmed definitive rejection from Stripe: ${definitiveFailureReason}`
          }, requestId));
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

          await client.query('COMMIT');
          return reply.status(200).send(successResponse({ reconciled: true, payoutId: id, status: nextStatus, transferId: effectiveTransferId }, requestId));
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
        await client.query('COMMIT');
        return reply.status(transientErrorReason ? 202 : 200).send(successResponse({
          reconciled: false,
          payoutId: id,
          status: locked.status,
          message: transientErrorReason
            ? `Stripe reconciliation encountered transient error (${transientErrorReason}); balance stays reserved.`
            : 'Stripe transfer reference not found; payout remains unreconciled.'
        }, requestId));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  });
}
