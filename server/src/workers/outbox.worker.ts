import pg from 'pg';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import { pool, withTenantTransaction } from '../database/pool.js';
import { env } from '../config/env.js';
import { getStripe, isDefinitiveStripeError } from '../services/stripeClient.js';
import { getTenantPaymentGateway, resolveTenantIntegrationSecrets } from '../services/paymentGateway.js';
import { broadcastBookingToNearbyProviders } from '../modules/dispatch/dispatch.service.js';

export interface OutboxJob {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  operation_type: string;
  payload: any;
  idempotency_key: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date;
  locked_by: string | null;
  lease_expires_at: Date | null;
}

export interface OutboxWorkerOptions {
  workerId?: string;
  leaseMs?: number;
  pollIntervalMs?: number;
  baseBackoffMs?: number;
}

export class OutboxWorker {
  private readonly pool: pg.Pool;
  public readonly workerId: string;
  private readonly leaseMs: number;
  private readonly pollIntervalMs: number;
  private readonly baseBackoffMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;

  constructor(poolInstance: pg.Pool, opts: OutboxWorkerOptions = {}) {
    this.pool = poolInstance;
    this.leaseMs = opts.leaseMs ?? 30000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
    this.baseBackoffMs = opts.baseBackoffMs ?? 1000;
    this.workerId = opts.workerId ?? `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private activeJobs = new Set<Promise<unknown>>();

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      if (!this.running || this.inFlight) return;
      this.inFlight = true;
      const p = this.processNextJob()
        .catch((err) => {
          console.error('[OutboxWorker Error]', err);
        })
        .finally(() => {
          this.inFlight = false;
          this.activeJobs.delete(p);
        });
      this.activeJobs.add(p);
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  public nudge(): void {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;
    const p = this.processNextJob()
      .catch(() => {})
      .finally(() => {
        this.inFlight = false;
        this.activeJobs.delete(p);
      });
    this.activeJobs.add(p);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activeJobs.size > 0) {
      await Promise.allSettled([...this.activeJobs]);
    }
  }

  public async claimNextJob(): Promise<OutboxJob | null> {
    const res = await this.pool.query<OutboxJob>(
      `SELECT * FROM rls_claim_next_outbox_job($1, $2)`,
      [this.workerId, this.leaseMs]
    );
    return res.rows[0] ?? null;
  }

  public async renewLease(jobId: string): Promise<boolean> {
    const res = await this.pool.query<{ renewed: boolean }>(
      `SELECT rls_renew_outbox_lease($1, $2, $3) AS renewed`,
      [jobId, this.workerId, this.leaseMs]
    );
    return res.rows[0]?.renewed === true;
  }

  public async processNextJob(): Promise<{ processed: boolean; jobId?: string; status?: string }> {
    const job = await this.claimNextJob();
    if (!job) {
      return { processed: false };
    }

    let leaseLost = false;
    const hbIntervalMs = Math.max(25, Math.floor(this.leaseMs / 3));
    const hb = setInterval(() => {
      this.renewLease(job.id)
        .then((ok) => {
          if (!ok) {
            leaseLost = true;
          }
        })
        .catch(() => {
          // Transient DB hiccup on heartbeat; final owner-checked UPDATE will still enforce ownership
        });
    }, hbIntervalMs);

    try {
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

      if (job.operation_type !== 'CREATE_PAYMENT_INTENT') {
        throw new Error(`Unsupported outbox operation type: ${job.operation_type}`);
      }

      const secrets = await resolveTenantIntegrationSecrets(job.tenant_id, this.pool);
      let pi: { id: string; status: string; redirectUrl?: string | null };
      const useExternalNonStripe = env.PAYMENT_GATEWAY === 'paytabs' || env.PAYMENT_GATEWAY === 'telr';

      if (useExternalNonStripe) {
        const { gateway } = await getTenantPaymentGateway(job.tenant_id, env.PAYMENT_GATEWAY, this.pool);
        const preAuth = await gateway.createPreAuth({
          amountCents: Number(payload.amountCents),
          currency: (payload.currency || env.DEFAULT_CURRENCY_CODE || 'aed').toUpperCase(),
          idempotencyKey: job.idempotency_key,
          paymentMethodId: payload.paymentMethodId || undefined,
          metadata: {
            tenantId: payload.tenantId,
            bookingId: payload.bookingId,
            bookingRef: payload.bookingRef,
            customerId: payload.customerId,
            transactionId: payload.transactionId,
          },
        });
        pi = { id: preAuth.providerReferenceId, status: preAuth.status, redirectUrl: preAuth.redirectUrl ?? null };
      } else {
        const stripe = getStripe(secrets.stripeSecretKey ?? env.STRIPE_SECRET_KEY);
        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
          amount: Number(payload.amountCents),
          currency: (payload.currency || env.DEFAULT_CURRENCY_CODE || 'aed').toLowerCase(),
          capture_method: 'manual',
          metadata: {
            tenantId: payload.tenantId,
            bookingId: payload.bookingId,
            bookingRef: payload.bookingRef,
            customerId: payload.customerId,
            transactionId: payload.transactionId,
          },
        };
        if (payload.paymentMethodId) {
          paymentIntentParams.payment_method = payload.paymentMethodId;
          paymentIntentParams.confirm = true;
          paymentIntentParams.return_url = `${env.APP_BASE_URL.replace(/\/$/, '')}/booking/complete`;
        }

        const createdPi = await stripe.paymentIntents.create(paymentIntentParams, {
          idempotencyKey: job.idempotency_key,
        });
        pi = { id: createdPi.id, status: createdPi.status };
      }

      if (leaseLost) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }

      const txOutcome = await withTenantTransaction<'LEASE_LOST' | 'CANCELLED' | 'COMPLETED'>(
        job.tenant_id,
        async (client) => {
          const completeRes = await client.query(
            `UPDATE outbox_operations
             SET status = 'COMPLETED',
                 completed_at = NOW(),
                 lease_expires_at = NULL,
                 last_error = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'
             RETURNING id`,
            [job.id, this.workerId]
          );

          if (completeRes.rowCount === 0) {
            return 'LEASE_LOST';
          }

          // Check if booking was cancelled while this outbox job was PROCESSING
          const bkCheck = await client.query<{ status: string }>(
            `SELECT status FROM bookings WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [payload.bookingId, payload.tenantId]
          );
          if (bkCheck.rows[0]?.status === 'CANCELLED') {
            await client.query(
              `UPDATE outbox_operations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
              [job.id]
            );
            await client.query(
              `UPDATE payment_transactions
               SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $1),
                   status = 'VOIDED',
                   updated_at = NOW()
               WHERE id = $2 AND tenant_id = $3`,
              [pi.id, payload.transactionId, payload.tenantId]
            );
            return 'CANCELLED';
          }

          await client.query(
            `UPDATE payment_transactions
             SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $1),
                 checkout_redirect_url = COALESCE($5, checkout_redirect_url),
                 status = CASE
                   WHEN status = 'PENDING' AND $2 = 'requires_capture' THEN 'REQUIRES_CAPTURE'
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [pi.id, pi.status, payload.transactionId, payload.tenantId, pi.redirectUrl ?? null]
          );

          if (pi.status === 'requires_capture') {
            await client.query(
              `UPDATE invoices
               SET status = 'AUTHORIZED', updated_at = NOW()
               WHERE id = $1 AND tenant_id = $2 AND status = 'DRAFT'`,
              [payload.invoiceId, payload.tenantId]
            );
            await client.query('SAVEPOINT sp_outbox_broadcast');
            try {
              await broadcastBookingToNearbyProviders(client, payload.tenantId, payload.bookingId);
              await client.query('RELEASE SAVEPOINT sp_outbox_broadcast');
            } catch {
              await client.query('ROLLBACK TO SAVEPOINT sp_outbox_broadcast');
            }
          }

          return 'COMPLETED';
        },
        this.pool
      );

      if (txOutcome === 'LEASE_LOST') {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }
      if (txOutcome === 'CANCELLED') {
        try {
          if (!useExternalNonStripe) {
            const stripe = getStripe(secrets.stripeSecretKey ?? env.STRIPE_SECRET_KEY);
            await stripe.paymentIntents.cancel(pi.id);
          }
        } catch {
          // Best-effort cancellation of PI for already-cancelled booking
        }
        return { processed: true, jobId: job.id, status: 'CANCELLED' };
      }
      return { processed: true, jobId: job.id, status: 'COMPLETED' };
    } catch (err: any) {
      if (leaseLost) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }

      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const errMsg = String(err?.message || 'Unknown Stripe outbox error');

      if (isDefinitiveStripeError(err)) {
        await withTenantTransaction(
          job.tenant_id,
          async (client) => {
            const failRes = await client.query(
              `UPDATE outbox_operations
               SET status = 'FAILED',
                   last_error = $3,
                   lease_expires_at = NULL,
                   updated_at = NOW()
               WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'
               RETURNING id`,
              [job.id, this.workerId, errMsg]
            );

            if (failRes.rowCount === 1) {
              await client.query(
                `UPDATE payment_transactions
                 SET status = 'FAILED', error_message = $1, updated_at = NOW()
                 WHERE id = $2 AND status = 'PENDING'`,
                [errMsg, payload.transactionId]
              );
              await client.query(
                `UPDATE invoices
                 SET status = 'VOID', updated_at = NOW()
                 WHERE id = $1 AND status = 'DRAFT'`,
                [payload.invoiceId]
              );
              await client.query(
                `UPDATE bookings
                 SET status = 'CANCELLED', cancellation_reason = $1, updated_at = NOW()
                 WHERE id = $2 AND status = 'REQUESTED'`,
                [`Payment authorization declined: ${errMsg}`, payload.bookingId]
              );
            }
          },
          this.pool
        );
        return { processed: true, jobId: job.id, status: 'FAILED' };
      }

      if (job.attempts >= job.max_attempts) {
        const recCount = await withTenantTransaction(
          job.tenant_id,
          async (client) => {
            const recRes = await client.query(
              `UPDATE outbox_operations
               SET status = 'REQUIRES_RECONCILIATION',
                   last_error = $3,
                   lease_expires_at = NULL,
                   updated_at = NOW()
               WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'
               RETURNING id`,
              [job.id, this.workerId, errMsg]
            );
            return recRes.rowCount ?? 0;
          },
          this.pool
        );
        if (recCount === 0) {
          return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
        }
        return { processed: true, jobId: job.id, status: 'REQUIRES_RECONCILIATION' };
      }

      const delayMs = this.baseBackoffMs * Math.pow(2, Math.max(0, job.attempts - 1));
      const retryCount = await withTenantTransaction(
        job.tenant_id,
        async (client) => {
          const retryRes = await client.query(
            `UPDATE outbox_operations
             SET status = 'PENDING',
                 locked_by = NULL,
                 lease_expires_at = NULL,
                 last_error = $3,
                 next_attempt_at = NOW() + ($4::text || ' milliseconds')::interval,
                 updated_at = NOW()
             WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'
             RETURNING id`,
            [job.id, this.workerId, errMsg, delayMs]
          );
          return retryRes.rowCount ?? 0;
        },
        this.pool
      );
      if (retryCount === 0) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }
      return { processed: true, jobId: job.id, status: 'RETRY_SCHEDULED' };
    } finally {
      clearInterval(hb);
    }
  }
}

export const outboxWorker = new OutboxWorker(pool, {
  pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
});
