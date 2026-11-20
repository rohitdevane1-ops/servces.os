import pg from 'pg';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { getStripe, isDefinitiveStripeError } from '../services/stripeClient.js';

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

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      if (!this.running || this.inFlight) return;
      this.inFlight = true;
      this.processNextJob()
        .catch((err) => {
          console.error('[OutboxWorker Error]', err);
        })
        .finally(() => {
          this.inFlight = false;
        });
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async claimNextJob(): Promise<OutboxJob | null> {
    const res = await this.pool.query<OutboxJob>(
      `UPDATE outbox_operations
       SET status = 'PROCESSING',
           locked_by = $1,
           lease_expires_at = NOW() + ($2::text || ' milliseconds')::interval,
           attempts = attempts + 1,
           updated_at = NOW()
       WHERE id = (
         SELECT id FROM outbox_operations
         WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
            OR (status = 'PROCESSING' AND lease_expires_at < NOW())
         ORDER BY next_attempt_at ASC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, tenant_id, aggregate_type, aggregate_id, operation_type, payload,
                 idempotency_key, status, attempts, max_attempts, next_attempt_at,
                 locked_by, lease_expires_at`,
      [this.workerId, this.leaseMs]
    );
    return res.rows[0] ?? null;
  }

  public async renewLease(jobId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE outbox_operations
       SET lease_expires_at = NOW() + ($3::text || ' milliseconds')::interval,
           updated_at = NOW()
       WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'`,
      [jobId, this.workerId, this.leaseMs]
    );
    return (res.rowCount ?? 0) === 1;
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

      const stripe = getStripe(env.STRIPE_SECRET_KEY);
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: Number(payload.amountCents),
        currency: (payload.currency || 'usd').toLowerCase(),
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
        paymentIntentParams.return_url = 'https://serviceproos.com/booking/complete';
      }

      const pi = await stripe.paymentIntents.create(paymentIntentParams, {
        idempotencyKey: job.idempotency_key,
      });

      if (leaseLost) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

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
          await client.query('ROLLBACK');
          return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
        }

        await client.query(
          `UPDATE payment_transactions
           SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $1),
               status = CASE
                 WHEN status = 'PENDING' AND $2 = 'requires_capture' THEN 'REQUIRES_CAPTURE'
                 ELSE status
               END,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [pi.id, pi.status, payload.transactionId, payload.tenantId]
        );

        if (pi.status === 'requires_capture') {
          await client.query(
            `UPDATE invoices
             SET status = 'AUTHORIZED', updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'DRAFT'`,
            [payload.invoiceId, payload.tenantId]
          );
        }

        await client.query('COMMIT');
        return { processed: true, jobId: job.id, status: 'COMPLETED' };
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (leaseLost) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }

      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const errMsg = String(err?.message || 'Unknown Stripe outbox error');

      if (isDefinitiveStripeError(err)) {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
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

          await client.query('COMMIT');
          return { processed: true, jobId: job.id, status: 'FAILED' };
        } catch (dbErr) {
          await client.query('ROLLBACK');
          throw dbErr;
        } finally {
          client.release();
        }
      }

      if (job.attempts >= job.max_attempts) {
        const recRes = await this.pool.query(
          `UPDATE outbox_operations
           SET status = 'REQUIRES_RECONCILIATION',
               last_error = $3,
               lease_expires_at = NULL,
               updated_at = NOW()
           WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'
           RETURNING id`,
          [job.id, this.workerId, errMsg]
        );
        if (recRes.rowCount === 0) {
          return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
        }
        return { processed: true, jobId: job.id, status: 'REQUIRES_RECONCILIATION' };
      }

      const delayMs = this.baseBackoffMs * Math.pow(2, Math.max(0, job.attempts - 1));
      const retryRes = await this.pool.query(
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
      if (retryRes.rowCount === 0) {
        return { processed: true, jobId: job.id, status: 'LEASE_LOST' };
      }
      return { processed: true, jobId: job.id, status: 'RETRY_SCHEDULED' };
    } finally {
      clearInterval(hb);
    }
  }
}

export const outboxWorker = new OutboxWorker(pool);
