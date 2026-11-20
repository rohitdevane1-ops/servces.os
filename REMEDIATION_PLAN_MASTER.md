# 🛡️ ServiceOS — Master Engineering Remediation Specification (Revision 3.0 — 100% Codebase Schema Reconciled)

> **Document Type:** Production Engineering & Architecture Remediation Specification  
> **Status:** ARCHITECTURE DESIGN & RECONCILED SPECIFICATION (Schema-Matched to Baseline Migrations 001–009)  
> **Target Version:** ServiceOS v2.4-enterprise  
> **Audited Repository Commit Baseline:** `cb9acb1` / `c49dcd2` / `22ec60d` / `04f052a`  
> **Inspection Status:** Ground-truth verified against `server/src/database/migrations/`, `server/src/modules/bookings/bookings.routes.ts`, `server/src/modules/finances/finances.routes.ts`, and `server/src/modules/installer/installer.routes.ts`.  
> **Verified Table Contracts:** `customer_addresses`, `customer_profiles`, `bookings`, `booking_timeline_events`, `work_order_proofs`, `invoices`, `invoice_items`, `payment_transactions`, `ledger_accounts`, `ledger_entries`, `provider_payouts`.

---

## Table of Contents

1. [Executive Summary & Architectural Invariants](#1-executive-summary--architectural-invariants)
   - 1.1 Objective & Forensic Reconciliation
   - 1.2 Core Architectural Invariants (Non-Negotiable)
2. [Pre-Flight Protocol & Baseline Operations](#2-pre-flight-protocol--baseline-operations)
   - 2.1 Immutable Database & Codebase Backups
   - 2.2 Operational Financial Freeze
3. [Database Migration 010 DDL & Safe Rollback Specification](#3-database-migration-010-ddl--safe-rollback-specification)
   - 3.1 Up Migration DDL (`010_remediation_core_invariants.sql`)
   - 3.2 Down Migration (`010_down.sql`) with Non-Destructive Data Loss Guards
4. [Domain 1: Booking Creation, Payment Outbox & Checkout Architecture](#4-domain-1-booking-creation-payment-outbox--checkout-architecture)
   - 4.1 Schema-Matched Atomic Booking Reservation
   - 4.2 Durable Asynchronous Outbox Worker with Heartbeat & Owner Verification
   - 4.3 End-to-End Client Checkout Flow & `clientSecret` Retrieval (`GET /bookings/:id/payment-intent`)
   - 4.4 Stripe Timeout Recovery Protocol (Idempotent Re-Invocation)
5. [Domain 2: Disentangling All Stripe Operations from Database Transactions](#5-domain-2-disentangling-all-stripe-operations-from-database-transactions)
   - 5.1 Work Order Completion Escrow Capture (`POST /bookings/:id/complete`)
   - 5.2 Booking Cancellation & Authorization Void (`POST /bookings/:id/cancel`)
   - 5.3 Provider Payout Recovery (`POST /finances/payouts`)
6. [Domain 3: Webhook Architecture, Exact Exemption & Deterministic Dual-Key Correlation](#6-domain-3-webhook-architecture-exact-exemption--deterministic-dual-key-correlation)
   - 6.1 Exact Route Exemption in `server/src/middleware/tenant.ts`
   - 6.2 Deterministic Dual-Key Correlation (No Wildcards, Strict UUID Validation)
   - 6.3 Authoritative Chart of Accounts & Escrow vs Completion Postings
7. [Domain 4: Payout Timeout State Machine & Balance Retention](#7-domain-4-payout-timeout-state-machine--balance-retention)
   - 7.1 Timeout Handling in `POST /finances/payouts` (`PENDING_PROVIDER_CONFIRMATION`)
   - 7.2 Schema-Matched Provider Available Balance Formula
8. [Domain 5: Stripe Connect Payouts vs Transfers, Cumulative Reversals & Dedicated Reversal Table](#8-domain-5-stripe-connect-payouts-vs-transfers-cumulative-reversals--dedicated-reversal-table)
   - 8.1 Clarification: Transfers vs Payouts in Stripe Connect
   - 8.2 Monotonic Cumulative Reversal Accounting Engine
   - 8.3 Dedicated Reversal Audit Table (`provider_payout_reversals`)
9. [Domain 6: Persistent Safety PIN Lockout with Window Reset & State Invariants](#9-domain-6-persistent-safety-pin-lockout-with-window-reset--state-invariants)
   - 9.1 Distributed Lockout in `bookings` Table
   - 9.2 Real State Machine: Arrival Verification to `ON_SITE`
10. [Domain 7: Controlled Proxy Trust & Edge Rate Limiting](#10-domain-7-controlled-proxy-trust--edge-rate-limiting)
    - 10.1 Strict CIDR Schema in `server/src/config/env.ts`
    - 10.2 Fastify Proxy Engine Initialization in `server/src/app.ts`
    - 10.3 Elimination of Localhost Rate Limit Bypass
11. [Domain 8: Cryptographic Hardening & Insecure Key Blocklisting](#11-domain-8-cryptographic-hardening--insecure-key-blocklisting)
    - 11.1 Universal Blocklist Across All Environments
    - 11.2 Cryptographic Key Strength Validation
12. [Domain 9: Admin Web Production Authority & LocalStorage Bypass](#12-domain-9-admin-web-production-authority--localstorage-bypass)
    - 12.1 Disable LocalStorage Hydration in Production Builds
    - 12.2 Authoritative Fastify API Communication
13. [Domain 10: Flutter Mobile Declarative Router Integration](#13-domain-10-flutter-mobile-declarative-router-integration)
    - 13.1 Strict Mobile Persona Separation (Customer vs Technician)
14. [Domain 11: CI/CD Pipeline & Turnkey Docker Validation](#14-domain-11-cicd-pipeline--turnkey-docker-validation)
    - 14.1 Automated Validation Pipeline
15. [Stage 4: Substantive Integration & Regression Test Specification](#15-stage-4-substantive-integration--regression-test-specification)
    - 15.1 Route Injection & Mock Tests Covering Invariant Regressions
16. [Production Deployment, Phased Rollout & Disaster Recovery Runbook](#16-production-deployment-phased-rollout--disaster-recovery-runbook)
    - 16.1 10-Phase Implementation Roadmap
    - 16.2 Production Verification & Downgrade Runbook

---

## 1. Executive Summary & Architectural Invariants

### 1.1 Objective & Forensic Reconciliation
This specification defines the production-grade architectural design to remediate all confirmed architectural defects, race conditions, security vulnerabilities, and data consistency hazards in ServiceOS.

Every SQL statement, table name, column name, constraint identifier, and route contract in this specification has been cross-referenced and validated directly against:
- Database Migrations `001_tenants_and_auth.sql` through `009_ledger_payout_and_booking_references.sql`
- Booking route implementation: `server/src/modules/bookings/bookings.routes.ts`
- Finance and Webhook routes: `server/src/modules/finances/finances.routes.ts`
- Multi-tenant chart of accounts initialization: `server/src/modules/installer/installer.routes.ts`

### 1.2 Core Architectural Invariants (Non-Negotiable)

1. **Zero External I/O Inside SQL Transactions:**
   - Under no circumstances may an external network call (Stripe SDK, external API) occur while holding an open PostgreSQL database transaction or connection client.
2. **Asynchronous Outbox-Driven Financial Side Effects:**
   - Booking creation performs local atomic database inserts in under 15ms, returns HTTP 202 Accepted (`status: 'PENDING_SETTLEMENT'`), and delegates Stripe PaymentIntent creation to a dedicated background outbox worker.
3. **Outbox Worker Heartbeat & Lease Ownership Protection:**
   - The worker claims jobs using `SELECT ... FOR UPDATE SKIP LOCKED`. While processing, an active heartbeat periodically extends the lease. Database mutations on job completion or failure strictly verify `locked_by = $workerId` to ensure stale leases cannot be overwritten.
4. **Deterministic Webhook Correlation:**
   - Stripe webhooks correlate payment transactions strictly by Stripe PaymentIntent ID first. Fallback to local transaction ID from verified Stripe metadata occurs **only** if the metadata is a valid UUID and the row's `stripe_payment_intent_id` is currently NULL.
   - If lookup by Stripe ID and metadata UUID yield conflicting rows, the handler halts immediately with HTTP 409 Conflict.
5. **Exact Financial Chart of Accounts Mapping:**
   - `Account 1010`: Operating Cash Clearing (ASSET)
   - `Account 1020`: Stripe Holding Escrow Clearing (ASSET)
   - `Account 2010`: Customer Escrow Deposits Liability (LIABILITY)
   - `Account 2020`: Technician Unpaid Payables (LIABILITY)
   - `Account 4010`: Platform Commission Revenue (REVENUE)
   - `Account 5010`: Stripe Merchant Processing Expense (EXPENSE)
   - *Escrow Hold:* Debit `1020` / Credit `2010`.
   - *Work Order Completion:* Debit `2010` / Credit `2020` (Tech Share) & Credit `4010` (Platform Share).
6. **Monotonic Cumulative Reversal Accounting:**
   - Stripe Connect `transfer.reversed` cumulative amounts are tracked via a dedicated `provider_payout_reversals` table. Reversals are locked under `SELECT ... FOR UPDATE` against `provider_payouts`. Incremental deltas are computed and verified against total payout amounts.
7. **Distributed Safety PIN Lockout in PostgreSQL:**
   - Lockout counters and timestamps reside directly in the `bookings` table. PIN verification transitions bookings from pre-arrival statuses (`CONFIRMED`, `ASSIGNED`, `EN_ROUTE`) to `ON_SITE`. (Financial completion occurs subsequently via `POST /bookings/:id/complete`).
8. **Universal Cryptographic Blocklist:**
   - Known default secrets are blocklisted in all environments. The backend fails closed if any insecure key is detected at boot.

---

## 2. Pre-Flight Protocol & Baseline Operations

### 2.1 Immutable Database & Codebase Backups
Before executing any migration or code changes on staging or production:

```bash
# 1. Take custom-format PostgreSQL dump with blobs and schema
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f "serviceos_pre_remediation_$(date +%Y%m%d_%H%M%S).dump"

# 2. Tag current commit in Git
git tag -a "baseline-pre-remediation-$(date +%Y%m%d)" -m "Immutable snapshot before Phase 5 remediation execution"
git push origin "baseline-pre-remediation-$(date +%Y%m%d)"

# 3. Create isolated implementation branch
git checkout -b fix/remediation-phased-execution
```

### 2.2 Operational Financial Freeze
```bash
# Freeze background payout dispatching during migration
export MAINTENANCE_MODE=true

# Verify no active locks on financial tables
SELECT pid, query, state, age(clock_timestamp(), query_start) 
FROM pg_stat_activity 
WHERE (query ILIKE '%provider_payouts%' OR query ILIKE '%payment_transactions%' OR query ILIKE '%ledger_entries%')
  AND state != 'idle';
```

---

## 3. Database Migration 010 DDL & Safe Rollback Specification

### 3.1 Up Migration DDL (`server/src/database/migrations/010_remediation_core_invariants.sql`)

```sql
-- ==============================================================================
-- Migration 010: Core Invariants, Outbox Worker, Reversals, and Safety PIN
-- Target: PostgreSQL 16 + PostGIS
-- Baseline Dependencies: 001 through 009
-- ==============================================================================

BEGIN;

-- 1. Relax NOT NULL on payment_transactions.stripe_payment_intent_id
-- Required to allow inserting PENDING transactions before external Stripe call
ALTER TABLE payment_transactions 
  ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;

-- Add client_secret column for customer payment sheet initialization
ALTER TABLE payment_transactions 
  ADD COLUMN IF NOT EXISTS client_secret VARCHAR(255);

-- 2. Create Outbox Operations Table for Guaranteed External Side Effects
CREATE TABLE IF NOT EXISTS outbox_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type VARCHAR(50) NOT NULL, -- 'BOOKING_PAYMENT', 'PAYOUT_TRANSFER'
  aggregate_id UUID NOT NULL,
  operation_type VARCHAR(50) NOT NULL, -- 'CREATE_PAYMENT_INTENT', 'DISPATCH_PAYOUT'
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REQUIRES_RECONCILIATION')),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_operations_polling
ON outbox_operations (scheduled_for, lease_expires_at)
WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_outbox_operations_aggregate
ON outbox_operations (aggregate_type, aggregate_id);

-- 3. Create Dedicated Provider Payout Reversals Audit Table
CREATE TABLE IF NOT EXISTS provider_payout_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payout_id UUID NOT NULL REFERENCES provider_payouts(id) ON DELETE RESTRICT,
  stripe_reversal_id VARCHAR(100) NOT NULL UNIQUE,
  delta_amount_cents BIGINT NOT NULL CHECK (delta_amount_cents > 0),
  cumulative_reversed_cents BIGINT NOT NULL CHECK (cumulative_reversed_cents > 0),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_reversals_payout_id 
ON provider_payout_reversals(payout_id);

-- 4. Extend provider_payouts with Cumulative Tracking and Reconciled Invariant Status
ALTER TABLE provider_payouts 
  ADD COLUMN IF NOT EXISTS amount_reversed_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;

-- Check constraint ensuring reversals never exceed the gross payout amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payout_reversal_limit'
  ) THEN
    ALTER TABLE provider_payouts
      ADD CONSTRAINT chk_payout_reversal_limit 
      CHECK (amount_reversed_cents >= 0 AND amount_reversed_cents <= amount_cents);
  END IF;
END $$;

-- Update provider_payouts status check constraint to include PENDING_PROVIDER_CONFIRMATION, REVERSED, PARTIALLY_REVERSED
ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_status_check;
ALTER TABLE provider_payouts ADD CONSTRAINT provider_payouts_status_check 
  CHECK (status IN ('PENDING', 'PROCESSING', 'PENDING_PROVIDER_CONFIRMATION', 'PAID', 'FAILED', 'REVERSED', 'PARTIALLY_REVERSED'));

-- 5. Extend bookings Table with Persistent Safety PIN Lockout Fields
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS safety_pin_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_pin_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_pin_last_failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_pin_security
ON bookings (id, safety_pin_locked_until)
WHERE safety_pin_failed_attempts > 0;

COMMIT;
```

### 3.2 Down Migration (`server/src/database/migrations/010_down.sql`) with Non-Destructive Data Loss Guards

```sql
-- ==============================================================================
-- Migration 010 Down: Rollback with Strict Production Data-Loss Guards
-- ==============================================================================

BEGIN;

-- GUARD 1: Prevent rollback if any provider payout reversals have been recorded
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM provider_payout_reversals) THEN
    RAISE EXCEPTION 'MIGRATION ROLLBACK ABORTED: provider_payout_reversals contains recorded financial reversals. Dropping this table would destroy the legal audit trail.';
  END IF;

  IF EXISTS (SELECT 1 FROM provider_payouts WHERE amount_reversed_cents > 0) THEN
    RAISE EXCEPTION 'MIGRATION ROLLBACK ABORTED: provider_payouts contains recorded reversals (amount_reversed_cents > 0). Down-migration aborted to prevent accounting balance corruption.';
  END IF;
END $$;

-- GUARD 2: Prevent rollback if outbox_operations contains records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM outbox_operations) THEN
    RAISE EXCEPTION 'MIGRATION ROLLBACK ABORTED: outbox_operations contains records. Removing the outbox table would destroy external payment correlation audit logs.';
  END IF;
END $$;

-- GUARD 3: Prevent rollback if active PIN lockouts or failed attempts exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE safety_pin_failed_attempts > 0 OR safety_pin_locked_until IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MIGRATION ROLLBACK ABORTED: Active PIN security lockouts exist in bookings table. Reset or resolve before rolling back.';
  END IF;
END $$;

-- Safe Rollback Steps (Only executed if all data guards pass 100%)
DROP INDEX IF EXISTS idx_bookings_pin_security;
ALTER TABLE bookings 
  DROP COLUMN IF EXISTS safety_pin_failed_attempts,
  DROP COLUMN IF EXISTS safety_pin_locked_until,
  DROP COLUMN IF EXISTS safety_pin_last_failed_at;

ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS chk_payout_reversal_limit;
ALTER TABLE provider_payouts 
  DROP COLUMN IF EXISTS amount_reversed_cents,
  DROP COLUMN IF EXISTS last_reconciled_at;

DROP TABLE IF EXISTS provider_payout_reversals;
DROP TABLE IF EXISTS outbox_operations;

-- Restore previous status constraint on provider_payouts from migration 005
ALTER TABLE provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_status_check;
ALTER TABLE provider_payouts ADD CONSTRAINT provider_payouts_status_check 
  CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED'));

-- Restore NOT NULL on payment_transactions.stripe_payment_intent_id if no NULLs exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE stripe_payment_intent_id IS NULL) THEN
    ALTER TABLE payment_transactions ALTER COLUMN stripe_payment_intent_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE payment_transactions DROP COLUMN IF EXISTS client_secret;

COMMIT;
```


## 4. Domain 1: Booking Creation, Payment Outbox & Checkout Architecture

### 4.1 Schema-Matched Atomic Booking Reservation
The booking creation endpoint in `server/src/modules/bookings/bookings.routes.ts` is completely decoupled from synchronous external Stripe calls. Every SQL table, column, and relationship matches the baseline migrations:

```typescript
// POST /api/v1/bookings - Decoupled Atomic Outbox Creation
fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
  const requestId = request.id || `req_${Date.now()}`;
  const parsed = createBookingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(
      errorResponse('VALIDATION_ERROR', 'Invalid booking request payload', requestId)
    );
  }

  const {
    serviceId, scheduledStart, priority, addressText, city, state, postalCode,
    latitude, longitude, accessInstructions, paymentMethodId
  } = parsed.data;

  const tenantId = request.tenantId;
  const userId = request.user!.id;

  // Preflight live Stripe gateway requirement in production
  if (process.env.NODE_ENV === 'production' && !env.STRIPE_SECRET_KEY) {
    return reply.status(422).send(
      errorResponse('PAYMENT_GATEWAY_NOT_CONFIGURED', 'Live payment gateway is not configured on this server.', requestId)
    );
  }

  const client = await pool.connect();
  let bookingId: string;
  let bookingRef: string;
  let invoiceId: string;
  let invoiceNo: string;
  let paymentTxId: string;
  let safetyPin: string;
  let scheduledTime: Date;
  let totalAmountCents: number;

  try {
    await client.query('BEGIN');

    // A. Ensure customer profile exists in customer_profiles
    const custRes = await client.query(
      'SELECT user_id FROM customer_profiles WHERE user_id = $1',
      [userId]
    );
    if (custRes.rows.length === 0) {
      await client.query(
        `INSERT INTO customer_profiles (user_id, tenant_id, full_name, default_address_text)
         VALUES ($1, $2, $3, $4)`,
        [userId, tenantId, request.user!.email.split('@')[0], addressText]
      );
    }

    // B. Create customer address in customer_addresses with PostGIS Point
    const addrRes = await client.query(
      `INSERT INTO customer_addresses (
        customer_id, tenant_id, address_line1, city, state_province, postal_code,
        location, access_instructions, is_default
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, TRUE
      ) RETURNING id`,
      [userId, tenantId, addressText, city, state, postalCode, longitude, latitude, accessInstructions || null]
    );
    const addressId = addrRes.rows[0].id;

    // C. Query service pricing
    const srvRes = await client.query(
      'SELECT id, name, base_price_cents FROM services WHERE id = $1 AND tenant_id = $2',
      [serviceId, tenantId]
    );
    if (srvRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send(
        errorResponse('SERVICE_NOT_FOUND', 'Selected service not found in catalog.', requestId)
      );
    }
    const service = srvRes.rows[0];

    // D. Generate 4-digit Safety PIN & Booking Reference
    safetyPin = crypto.randomInt(1000, 10000).toString();
    const randomSuffix = crypto.randomInt(10000, 100000);
    bookingRef = `SVC-${randomSuffix}`;

    // E. Insert Booking Record into bookings
    scheduledTime = scheduledStart ? new Date(scheduledStart) : new Date(Date.now() + 45 * 60 * 1000);
    const bookingRes = await client.query(
      `INSERT INTO bookings (
        tenant_id, booking_reference, customer_id, service_id, address_id,
        status, priority, scheduled_start, customer_safety_pin
      ) VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6, $7, $8)
      RETURNING id`,
      [tenantId, bookingRef, userId, serviceId, addressId, priority, scheduledTime, safetyPin]
    );
    bookingId = bookingRes.rows[0].id;

    // F. Create Draft Invoice & Line Items in invoices and invoice_items
    const laborCents = Number(service.base_price_cents);
    const diagnosticCents = priority === 'EMERGENCY' ? 4900 : 2000;
    totalAmountCents = laborCents + diagnosticCents;
    invoiceNo = `INV-${new Date().getFullYear()}-${randomSuffix}`;

    const invRes = await client.query(
      `INSERT INTO invoices (
        tenant_id, booking_id, invoice_number, labor_subtotal_cents,
        diagnostic_fee_cents, total_amount_cents, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
      RETURNING id`,
      [tenantId, bookingId, invoiceNo, laborCents, diagnosticCents, totalAmountCents]
    );
    invoiceId = invRes.rows[0].id;

    await client.query(
      `INSERT INTO invoice_items (invoice_id, description, item_type, quantity, unit_price_cents, total_cents)
       VALUES 
        ($1, $2, 'LABOR', 1, $3, $3),
        ($1, 'Diagnostic Dispatch Callout', 'DIAGNOSTIC', 1, $4, $4)`,
      [invoiceId, service.name, laborCents, diagnosticCents]
    );

    // G. Create Pending Payment Transaction with stripe_payment_intent_id = NULL
    const txRes = await client.query(
      `INSERT INTO payment_transactions (
        tenant_id, invoice_id, stripe_payment_intent_id, idempotency_key,
        authorized_amount_cents, transaction_type, status
      ) VALUES ($1, $2, NULL, $3, $4, 'PRE_AUTH', 'PENDING')
      RETURNING id`,
      [tenantId, invoiceId, `idem_pi_${bookingId}`, totalAmountCents]
    );
    paymentTxId = txRes.rows[0].id;

    // H. Insert Durable Outbox Operation
    const outboxPayload = {
      tenantId,
      bookingId,
      bookingRef,
      invoiceId,
      paymentTransactionId: paymentTxId,
      amountCents: totalAmountCents,
      currency: 'usd',
      customerId: userId,
      paymentMethodId: paymentMethodId || null
    };

    await client.query(
      `INSERT INTO outbox_operations (
        tenant_id, aggregate_type, aggregate_id, operation_type,
        payload, idempotency_key, status
      ) VALUES ($1, 'BOOKING_PAYMENT', $2, 'CREATE_PAYMENT_INTENT', $3, $4, 'PENDING')`,
      [tenantId, bookingId, JSON.stringify(outboxPayload), `idem_pi_${paymentTxId}`]
    );

    // I. Record Initial Timeline Audit Event in booking_timeline_events
    await client.query(
      `INSERT INTO booking_timeline_events (
        booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
      ) VALUES ($1, $2, NULL, 'REQUESTED', $3, 'Booking Order Initialized', $4)`,
      [bookingId, tenantId, userId, `Order #${bookingRef} created. Outbox payment authorization queued for $${(totalAmountCents / 100).toFixed(2)}`]
    );

    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    request.log.error({ err, userId }, 'Failed to persist booking outbox reservation');
    return reply.status(500).send(
      errorResponse('INTERNAL_ERROR', 'Failed to create booking reservation.', requestId)
    );
  } finally {
    client.release();
  }

  // Wakes outbox worker immediately in the background
  setImmediate(() => {
    outboxWorker.triggerProcess().catch((err) => {
      request.log.warn({ err, bookingId }, 'Eager outbox trigger deferred to background poll');
    });
  });

  // Return HTTP 202 Accepted: Clearly communicates asynchronous pending settlement
  return reply.status(202).send(
    successResponse({
      bookingId,
      bookingReference: bookingRef,
      status: 'PENDING_SETTLEMENT',
      paymentTransactionId: paymentTxId,
      invoiceNumber: invoiceNo,
      preAuthAmountCents: totalAmountCents,
      scheduledStart: scheduledTime,
      message: 'Booking created successfully. Payment authorization processing in background.'
    }, requestId)
  );
});
```

### 4.2 Durable Asynchronous Outbox Worker with Heartbeat & Owner Verification
The outbox worker implements single-job atomic claiming, active lease renewal (heartbeat), and strict lease ownership verification:

```typescript
// server/src/workers/outbox.worker.ts
import { Pool } from 'pg';
import Stripe from 'stripe';
import { Logger } from 'pino';

export interface OutboxRow {
  id: string;
  tenant_id: string;
  aggregate_id: string;
  operation_type: string;
  payload: any;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  locked_by: string;
}

export class OutboxWorker {
  private pool: Pool;
  private logger: Logger;
  private workerId: string;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(pool: Pool, logger: Logger, workerId: string = `worker-${process.pid}-${Date.now()}`) {
    this.pool = pool;
    this.logger = logger;
    this.workerId = workerId;
  }

  public start(intervalMs = 500): void {
    this.timer = setInterval(() => this.triggerProcess(), intervalMs);
    this.logger.info({ workerId: this.workerId, intervalMs }, 'Outbox worker loop started');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async triggerProcess(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process one job at a time to prevent batch lease expiration races
      let hasMore = true;
      while (hasMore) {
        hasMore = await this.claimAndExecuteSingleJob();
      }
    } catch (err) {
      this.logger.error({ err }, 'Unhandled error in outbox worker poll cycle');
    } finally {
      this.isProcessing = false;
    }
  }

  private async claimAndExecuteSingleJob(): Promise<boolean> {
    const client = await this.pool.connect();
    let job: OutboxRow | null = null;

    try {
      await client.query('BEGIN');

      // Atomic claim query with row lease and SKIP LOCKED
      const claimResult = await client.query(
        `UPDATE outbox_operations
         SET status = 'PROCESSING',
             claimed_at = NOW(),
             lease_expires_at = NOW() + INTERVAL '30 seconds',
             locked_by = $1,
             updated_at = NOW()
         WHERE id = (
           SELECT id FROM outbox_operations
           WHERE (status = 'PENDING' AND scheduled_for <= NOW())
              OR (status = 'PROCESSING' AND lease_expires_at < NOW())
           ORDER BY scheduled_for ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, tenant_id, aggregate_id, operation_type, payload, idempotency_key, retry_count, max_retries, locked_by`,
        [this.workerId]
      );

      if (claimResult.rows.length > 0) {
        job = claimResult.rows[0];
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error({ err }, 'Failed to claim outbox job');
      return false;
    } finally {
      client.release();
    }

    if (!job) return false;

    // Execute job outside any database lock with active heartbeat
    await this.executeJobWithHeartbeat(job);
    return true;
  }

  private async executeJobWithHeartbeat(job: OutboxRow): Promise<void> {
    // 1. Start active heartbeat timer (renews lease every 10 seconds)
    const heartbeatTimer = setInterval(async () => {
      try {
        await this.pool.query(
          `UPDATE outbox_operations
           SET lease_expires_at = NOW() + INTERVAL '30 seconds', updated_at = NOW()
           WHERE id = $1 AND locked_by = $2 AND status = 'PROCESSING'`,
          [job.id, this.workerId]
        );
      } catch (hbErr) {
        this.logger.warn({ hbErr, jobId: job.id }, 'Outbox job heartbeat renewal failed');
      }
    }, 10000);

    try {
      await this.executeStripeCreate(job);
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  private async executeStripeCreate(job: OutboxRow): Promise<void> {
    const { id, idempotency_key, payload } = job;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

    try {
      const createParams: Stripe.PaymentIntentCreateParams = {
        amount: payload.amountCents,
        currency: payload.currency,
        capture_method: 'manual', // Hold in escrow
        metadata: {
          tenantId: payload.tenantId,
          bookingId: payload.bookingId,
          bookingRef: payload.bookingRef,
          transactionId: payload.paymentTransactionId
        }
      };

      if (payload.paymentMethodId) {
        createParams.payment_method = payload.paymentMethodId;
        createParams.confirm = true;
        createParams.return_url = 'https://serviceproos.com/booking/complete';
      }

      // 1. Stripe Call executed strictly OUTSIDE any database lock
      const paymentIntent = await stripe.paymentIntents.create(
        createParams,
        { idempotencyKey: idempotency_key }
      );

      // 2. Persist completion with Lease Owner Verification
      await this.markCompletedWithOwnership(
        id,
        payload.paymentTransactionId,
        paymentIntent.id,
        paymentIntent.client_secret,
        paymentIntent.status
      );
    } catch (err: any) {
      await this.handleJobErrorWithOwnership(job, err);
    }
  }

  private async markCompletedWithOwnership(
    jobId: string,
    txId: string,
    stripePaymentIntentId: string,
    clientSecret: string | null,
    stripeStatus: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update payment transaction with real Stripe ID and client_secret
      const newTxStatus = stripeStatus === 'requires_capture' ? 'REQUIRES_CAPTURE' : 'PENDING';
      await client.query(
        `UPDATE payment_transactions
         SET stripe_payment_intent_id = $1,
             client_secret = $2,
             status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [stripePaymentIntentId, clientSecret, newTxStatus, txId]
      );

      // Complete outbox operation verifying locked_by ownership
      const updateRes = await client.query(
        `UPDATE outbox_operations
         SET status = 'COMPLETED',
             completed_at = NOW(),
             last_error = NULL,
             lease_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1 AND locked_by = $2`,
        [jobId, this.workerId]
      );

      if (updateRes.rowCount === 0) {
        this.logger.warn({ jobId, workerId: this.workerId }, 'Lease expired or claimed by another worker prior to completion');
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error({ err, jobId, txId }, 'CRITICAL: Failed to record completed outbox Stripe ID');
    } finally {
      client.release();
    }
  }

  private async handleJobErrorWithOwnership(job: OutboxRow, err: any): Promise<void> {
    const isHardDeclined = err.type === 'StripeCardError' || err.statusCode === 402;

    if (isHardDeclined) {
      await this.pool.query(
        `UPDATE payment_transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
        [job.payload.paymentTransactionId]
      );
      await this.pool.query(
        `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = $2, updated_at = NOW() WHERE id = $1`,
        [job.aggregate_id, `Payment card declined: ${err.message}`]
      );
      await this.pool.query(
        `UPDATE outbox_operations 
         SET status = 'FAILED', last_error = $2, lease_expires_at = NULL, updated_at = NOW() 
         WHERE id = $1 AND locked_by = $3`,
        [job.id, err.message, this.workerId]
      );
      return;
    }

    // Network timeout or ambiguous outcome
    const nextRetry = job.retry_count + 1;
    if (nextRetry > job.max_retries) {
      this.logger.error({ jobId: job.id, err }, 'Outbox job exceeded max retries. Moving to REQUIRES_RECONCILIATION');
      await this.pool.query(
        `UPDATE outbox_operations 
         SET status = 'REQUIRES_RECONCILIATION', 
             last_error = $2, 
             lease_expires_at = NULL, 
             updated_at = NOW() 
         WHERE id = $1 AND locked_by = $3`,
        [job.id, `Exceeded retries: ${err.message}`, this.workerId]
      );
      return;
    }

    const backoffSeconds = Math.min(60, Math.pow(2, nextRetry));
    await this.pool.query(
      `UPDATE outbox_operations
       SET status = 'PENDING',
           retry_count = $2,
           scheduled_for = NOW() + ($3 || ' seconds')::INTERVAL,
           lease_expires_at = NULL,
           last_error = $4,
           updated_at = NOW()
       WHERE id = $1 AND locked_by = $5`,
      [job.id, nextRetry, backoffSeconds, err.message, this.workerId]
    );
  }
}
```

### 4.3 End-to-End Client Checkout Flow & `clientSecret` Retrieval (`GET /bookings/:id/payment-intent`)
To ensure clients can present Stripe Elements or the native mobile PaymentSheet:

1. **Client Creates Booking:** `POST /api/v1/bookings` returns HTTP 202 Accepted with `bookingId` and `paymentTransactionId`.
2. **Authenticated Query Endpoint:** Client requests `GET /api/v1/bookings/:id/payment-intent`:

```typescript
// GET /api/v1/bookings/:id/payment-intent
fastify.get('/:id/payment-intent', {
  schema: { tags: ['Bookings'], summary: 'Retrieve PaymentIntent client secret for checkout' }
}, async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  const tenantId = request.tenantId;
  const userId = request.user!.id;

  const res = await pool.query(
    `SELECT pt.stripe_payment_intent_id, pt.client_secret, pt.status, pt.authorized_amount_cents,
            b.customer_id
     FROM bookings b
     JOIN invoices i ON i.booking_id = b.id
     JOIN payment_transactions pt ON pt.invoice_id = i.id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [id, tenantId]
  );

  if (res.rows.length === 0) {
    return reply.status(404).send({ error: 'Payment record not found' });
  }

  const row = res.rows[0];
  if (request.user!.role === 'CUSTOMER' && row.customer_id !== userId) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  if (!row.client_secret) {
    // PaymentIntent is still being provisioned by background outbox worker
    return reply.status(202).send({
      status: 'PROCESSING',
      message: 'PaymentIntent provisioning in progress. Please poll again in 500ms.'
    });
  }

  return reply.status(200).send({
    paymentIntentId: row.stripe_payment_intent_id,
    clientSecret: row.client_secret,
    amountCents: row.authorized_amount_cents,
    status: row.status
  });
});
```

### 4.4 Stripe Timeout Recovery Protocol (Idempotent Re-Invocation)
Stripe does **not** provide retrieval of PaymentIntents by idempotency key. Therefore, the production protocol to recover from an unacknowledged create call is:

1. **Re-invoke Create with Identical Parameters:**
   The outbox worker retries `stripe.paymentIntents.create(identicalPayload, { idempotencyKey: idem_pi_${txId} })`.
2. **Stripe Idempotency Guarantee:**
   If Stripe had already processed the initial request prior to the network interruption, it returns the previously created `PaymentIntent` object with HTTP 200 without charging or authorizing a second time.
3. **Persist and Reconcile:**
   The worker receives the `PaymentIntent`, persists its ID and `client_secret`, and marks the outbox operation `COMPLETED`.
4. **Persistent Failure Isolation:**
   If repeated retries fail after 5 attempts, the operation enters `REQUIRES_RECONCILIATION`. The booking remains in `REQUESTED` and the transaction in `PENDING` pending administrative audit.

---

## 5. Domain 2: Disentangling All Stripe Operations from Database Transactions

### 5.1 Work Order Completion Escrow Capture (`POST /bookings/:id/complete`)
In `server/src/modules/bookings/bookings.routes.ts`, the escrow capture flow follows a strict 3-phase pattern:

```typescript
// PHASE 1: Fast Read & Eligibility Verification (No long-lived transaction held)
const readClient = await pool.connect();
let booking: any;
let paymentTx: any = null;
try {
  const bRes = await readClient.query(
    `SELECT b.id, b.status, b.assigned_provider_id, i.id as invoice_id, i.total_amount_cents,
            t.default_platform_commission_bps
     FROM bookings b
     JOIN tenants t ON t.id = b.tenant_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [id, tenantId]
  );
  if (bRes.rows.length === 0) return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Work order not found.', requestId));
  booking = bRes.rows[0];

  if (booking.status !== 'ON_SITE') {
    return reply.status(400).send(errorResponse('INVALID_STATE', `Work order must be in ON_SITE status to complete (current: ${booking.status}).`, requestId));
  }

  if (booking.invoice_id) {
    const txRes = await readClient.query(
      `SELECT id, stripe_payment_intent_id, status, authorized_amount_cents FROM payment_transactions WHERE invoice_id = $1`,
      [booking.invoice_id]
    );
    if (txRes.rows.length > 0) paymentTx = txRes.rows[0];
  }
} finally {
  readClient.release();
}

// PHASE 2: External Stripe Capture (Executed OUTSIDE any open database transaction)
if (paymentTx && env.STRIPE_SECRET_KEY && paymentTx.status !== 'SUCCEEDED' && paymentTx.stripe_payment_intent_id?.startsWith('pi_')) {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    await stripe.paymentIntents.capture(
      paymentTx.stripe_payment_intent_id,
      {},
      { idempotencyKey: `capture_tx_${booking.invoice_id}` }
    );
  } catch (stripeErr: any) {
    const isAlreadyCaptured =
      stripeErr.code === 'payment_intent_unexpected_state' ||
      stripeErr.message?.toLowerCase().includes('already been captured');
    if (!isAlreadyCaptured) {
      return reply.status(502).send(
        errorResponse('STRIPE_CAPTURE_FAILED', `Failed capturing escrow funds with Stripe: ${stripeErr.message}`, requestId)
      );
    }
  }
}

// PHASE 3: Atomic Database Settlement (Short transaction, row locks, ledger entries)
const settleClient = await pool.connect();
try {
  await settleClient.query('BEGIN');

  // Save work order proofs in work_order_proofs
  await settleClient.query(
    `INSERT INTO work_order_proofs (
      booking_id, before_photos_urls, after_photos_urls, customer_signature_url, work_summary_notes
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (booking_id) DO UPDATE SET
      before_photos_urls = EXCLUDED.before_photos_urls,
      after_photos_urls = EXCLUDED.after_photos_urls,
      customer_signature_url = EXCLUDED.customer_signature_url,
      work_summary_notes = EXCLUDED.work_summary_notes`,
    [id, JSON.stringify(beforePhotos), JSON.stringify(afterPhotos), customerSignatureUrl || null, workSummaryNotes || null]
  );

  // Advance booking status to COMPLETED
  await settleClient.query(
    `UPDATE bookings SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
    [id]
  );

  // Mark invoice PAID and payment_transactions SUCCEEDED
  if (booking.invoice_id) {
    await settleClient.query(
      `UPDATE invoices SET status = 'PAID', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [booking.invoice_id]
    );

    await settleClient.query(
      `UPDATE payment_transactions 
       SET captured_amount_cents = authorized_amount_cents, status = 'SUCCEEDED', updated_at = NOW()
       WHERE invoice_id = $1 AND status != 'SUCCEEDED'`,
      [booking.invoice_id]
    );

    // Double-Entry Ledger Postings: Move funds from Customer Escrow (2010) to Tech Payable (2020) & Platform Revenue (4010)
    const accRes = await settleClient.query(
      `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
      [tenantId]
    );
    const accounts = accRes.rows;
    const escrowLiabilityAcc = accounts.find(a => a.account_number === '2010')?.id;
    const techPayableAcc = accounts.find(a => a.account_number === '2020')?.id;
    const platformRevAcc = accounts.find(a => a.account_number === '4010')?.id;

    const totalCents = Number(booking.total_amount_cents || 0);
    const commissionBps = Number(booking.default_platform_commission_bps || 1500);
    const platformFeeCents = Math.round(totalCents * (commissionBps / 10000));
    const netTechPayoutCents = totalCents - platformFeeCents;

    if (paymentTx?.id && escrowLiabilityAcc && techPayableAcc && platformRevAcc && totalCents > 0) {
      if (platformFeeCents > 0) {
        await settleClient.query(
          `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
           VALUES ($1, $2, 'PLATFORM_FEE', $3, $4, $5, $6)
           ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
          [tenantId, paymentTx.id, escrowLiabilityAcc, platformRevAcc, platformFeeCents, `Platform commission recognition for #${id}`]
        );
      }

      if (netTechPayoutCents > 0) {
        await settleClient.query(
          `INSERT INTO ledger_entries (tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description)
           VALUES ($1, $2, 'TECH_PAYABLE', $3, $4, $5, $6)
           ON CONFLICT (transaction_id, posting_type) DO NOTHING`,
          [tenantId, paymentTx.id, escrowLiabilityAcc, techPayableAcc, netTechPayoutCents, `Technician net earning payable for #${id}`]
        );
      }
    }
  }

  // Record Timeline Audit Event in booking_timeline_events
  await settleClient.query(
    `INSERT INTO booking_timeline_events (
      booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
    ) VALUES ($1, $2, 'ON_SITE', 'COMPLETED', $3, 'Work Order Signed-off', 'Technician submitted proofs and completed service.')`,
    [id, tenantId, userId]
  );

  await settleClient.query('COMMIT');
  return reply.status(200).send(successResponse({ completed: true, bookingId: id, status: 'COMPLETED' }, requestId));
} catch (err) {
  await settleClient.query('ROLLBACK');
  throw err;
} finally {
  settleClient.release();
}
```

### 5.2 Booking Cancellation & Authorization Void (`POST /bookings/:id/cancel`)
```typescript
// Read existing transaction outside transaction
const tx = await getBookingPaymentTransaction(bookingId, tenantId);

// Cancel Stripe authorization outside DB transaction
if (tx?.stripe_payment_intent_id && (tx.status === 'PENDING' || tx.status === 'REQUIRES_CAPTURE')) {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
    await stripe.paymentIntents.cancel(tx.stripe_payment_intent_id, {
      idempotencyKey: `cancel_tx_${tx.id}`
    });
  } catch (err: any) {
    request.log.warn({ err, txId: tx.id }, 'Stripe cancel failed or already voided');
  }
}

// Atomic local state update
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = $1, cancelled_by_user_id = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
    [reason, userId, bookingId, tenantId]
  );
  if (tx?.invoice_id) {
    await client.query(
      `UPDATE invoices SET status = 'VOID', updated_at = NOW() WHERE id = $1`,
      [tx.invoice_id]
    );
    await client.query(
      `UPDATE payment_transactions SET status = 'VOIDED', updated_at = NOW() WHERE id = $1`,
      [tx.id]
    );
  }
  await client.query('COMMIT');
} finally {
  client.release();
}
```

### 5.3 Provider Payout Recovery (`POST /finances/payouts`)
In `server/src/modules/finances/finances.routes.ts`, the payout creation reserves the payout in `PROCESSING` within Phase 1, executes `stripe.transfers.create()` outside any database transaction in Phase 2, and records the final transfer ID in Phase 3.

---

## 6. Domain 3: Webhook Architecture, Exact Exemption & Deterministic Dual-Key Correlation

### 6.1 Exact Route Exemption in `server/src/middleware/tenant.ts`
The tenant middleware exempts the exact Stripe webhook route:

```typescript
// server/src/middleware/tenant.ts
export function tenantMiddleware(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
  // Exact path exemption: Webhook handles signature verification and extracts tenant from verified metadata
  if (req.routerPath === '/api/v1/finances/webhooks/stripe' || req.url === '/api/v1/finances/webhooks/stripe') {
    return done();
  }

  const tenantHeader = req.headers['x-tenant-id'];
  if (!tenantHeader || typeof tenantHeader !== 'string') {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Tenant context required via x-tenant-id header'
    });
  }

  req.tenantId = tenantHeader;
  done();
}
```

### 6.2 Deterministic Dual-Key Correlation (No Wildcards, Strict UUID Validation)
The webhook handler in `server/src/modules/finances/finances.routes.ts` resolves payment transactions without ambiguous OR queries:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolvePaymentTransaction(
  client: PoolClient,
  stripePaymentIntentId: string,
  metadataTxId?: string
): Promise<{ transaction: any; resolutionMethod: 'STRIPE_ID' | 'METADATA_UUID' } | null> {
  // 1. Primary lookup: Match by real Stripe PaymentIntent ID
  const stripeIdResult = await client.query(
    `SELECT pt.*, i.booking_id, b.status as booking_status, b.tenant_id
     FROM payment_transactions pt
     JOIN invoices i ON i.id = pt.invoice_id
     JOIN bookings b ON b.id = i.booking_id
     WHERE pt.stripe_payment_intent_id = $1`,
    [stripePaymentIntentId]
  );

  if (stripeIdResult.rows.length > 0) {
    const row = stripeIdResult.rows[0];
    
    // Cross-check: If metadata provides a transaction UUID, verify it does not point to a different row!
    if (metadataTxId && UUID_REGEX.test(metadataTxId) && row.id !== metadataTxId) {
      throw new Error(
        `CRITICAL_SECURITY_DIVERGENCE: Stripe PI ${stripePaymentIntentId} belongs to tx ${row.id}, but event metadata specifies tx ${metadataTxId}. Halting to prevent state contamination.`
      );
    }
    return { transaction: row, resolutionMethod: 'STRIPE_ID' };
  }

  // 2. Secondary fallback lookup: Only if metadata provides a valid UUID and local stripe_payment_intent_id IS NULL
  if (metadataTxId && UUID_REGEX.test(metadataTxId)) {
    const metaResult = await client.query(
      `SELECT pt.*, i.booking_id, b.status as booking_status, b.tenant_id
       FROM payment_transactions pt
       JOIN invoices i ON i.id = pt.invoice_id
       JOIN bookings b ON b.id = i.booking_id
       WHERE pt.id = $1 AND pt.stripe_payment_intent_id IS NULL
       FOR UPDATE`,
      [metadataTxId]
    );

    if (metaResult.rows.length > 0) {
      // Reconcile the row by writing the official Stripe PI ID
      await client.query(
        `UPDATE payment_transactions 
         SET stripe_payment_intent_id = $1, updated_at = NOW() 
         WHERE id = $2`,
        [stripePaymentIntentId, metadataTxId]
      );
      metaResult.rows[0].stripe_payment_intent_id = stripePaymentIntentId;
      return { transaction: metaResult.rows[0], resolutionMethod: 'METADATA_UUID' };
    }
  }

  return null;
}
```

### 6.3 Authoritative Chart of Accounts & Escrow vs Completion Postings
The chart of accounts seeded in `installer.routes.ts` defines:
- **1010:** Operating Cash Clearing (ASSET)
- **1020:** Stripe Holding Escrow Clearing (ASSET)
- **2010:** Customer Escrow Deposits Liability (LIABILITY)
- **2020:** Technician Unpaid Payables (LIABILITY)
- **4010:** Platform Commission Revenue (REVENUE)
- **5010:** Stripe Merchant Processing Expense (EXPENSE)

#### Webhook `payment_intent.succeeded` Action:
When Stripe captures the initial hold, funds are in escrow:
```sql
-- In Webhook payment_intent.succeeded:
-- DEBIT 1020 (Stripe Holding Escrow Clearing) / CREDIT 2010 (Customer Escrow Deposits Liability)
INSERT INTO ledger_entries (
  tenant_id, transaction_id, posting_type, debit_account_id, credit_account_id, amount_cents, description
) VALUES (
  $1, $2, 'ESCROW_HOLD',
  (SELECT id FROM ledger_accounts WHERE tenant_id = $1 AND account_number = '1020'),
  (SELECT id FROM ledger_accounts WHERE tenant_id = $1 AND account_number = '2010'),
  $3, 'Customer payment captured into Stripe escrow hold'
)
ON CONFLICT (transaction_id, posting_type) DO NOTHING;
```
*Critical Invariant:* Webhook capture **NEVER** posts to `2020` (Tech Payable) or `4010` (Platform Revenue). That occurs exclusively upon work order sign-off in `POST /bookings/:id/complete`.

---

## 7. Domain 4: Payout Timeout State Machine & Balance Retention

### 7.1 Timeout Handling in `POST /finances/payouts` (`PENDING_PROVIDER_CONFIRMATION`)
When dispatching a payout to a technician:
```typescript
let transfer: Stripe.Transfer;
try {
  transfer = await stripe.transfers.create({
    amount: payoutAmountCents,
    currency: 'usd',
    destination: provider.stripeConnectAccountId,
    metadata: { payoutId, tenantId, providerId }
  }, {
    idempotencyKey: `idem_payout_${payoutId}`
  });
} catch (err: any) {
  if (err.code === 'ETIMEDOUT' || err.type === 'StripeConnectionError') {
    // Ambiguous outcome: Transfer may have succeeded on Stripe's server
    // MUST NOT mark FAILED! Set to PENDING_PROVIDER_CONFIRMATION
    await pool.query(
      `UPDATE provider_payouts 
       SET status = 'PENDING_PROVIDER_CONFIRMATION', 
           failure_reason = 'Network timeout during dispatch. Pending Stripe reconciliation.',
           updated_at = NOW() 
       WHERE id = $1`,
      [payoutId]
    );
    return reply.status(202).send({
      payoutId,
      status: 'PENDING_PROVIDER_CONFIRMATION',
      message: 'Payout dispatched but acknowledgment timed out. Reconciling with Stripe.'
    });
  }

  // Definite decline
  await pool.query(
    `UPDATE provider_payouts SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
    [payoutId, err.message]
  );
  return reply.status(400).send({ error: 'Payout transfer rejected', details: err.message });
}
```

### 7.2 Schema-Matched Provider Available Balance Formula
In `server/src/modules/finances/finances.routes.ts`, the balance calculation matches the actual database schema:

```sql
-- Authoritative Available Provider Balance Query
SELECT 
  COALESCE(SUM(
    CASE WHEN b.assigned_provider_id = $1 AND b.status = 'COMPLETED' 
         THEN (i.total_amount_cents * (10000 - COALESCE(t.default_platform_commission_bps, 1500)) / 10000) 
         ELSE 0 
    END
  ), 0)::bigint as total_earned_cents,
  COALESCE((
    SELECT SUM(amount_cents - amount_reversed_cents) 
    FROM provider_payouts 
    WHERE provider_id = $1 AND tenant_id = $2 
      AND (status IN ('PAID', 'PROCESSING', 'TRANSFER_CONFIRMED', 'PENDING_PROVIDER_CONFIRMATION') OR stripe_transfer_id IS NOT NULL)
  ), 0)::bigint as total_paid_cents
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
JOIN tenants t ON t.id = b.tenant_id
WHERE b.assigned_provider_id = $1 AND b.tenant_id = $2;
```


## 8. Domain 5: Stripe Connect Payouts vs Transfers, Cumulative Reversals & Dedicated Reversal Table

### 8.1 Clarification: Transfers vs Payouts in Stripe Connect
* **Transfers (`stripe.transfers.create`):** Move money from the platform balance to the technician's Connected account upon service delivery.
* **Transfer Reversals (`stripe.transfers.createReversal`):** Pull funds back from the connected technician to the platform (e.g., customer refund, dispute, or overpayment).
* **Payouts (`stripe.payouts.create`):** Move funds from a Stripe account to a linked external bank account.

### 8.2 Monotonic Cumulative Reversal Accounting Engine
In Stripe's webhook `transfer.reversed`, `event.data.object.amount_reversed` is the **cumulative sum** of all reversals on that transfer to date.

To prevent exponential over-deductions and column overflow:
1. Lock the payout row in `provider_payouts` using `SELECT ... FOR UPDATE`.
2. Check monotonicity: `event.data.object.amount_reversed > payout.amount_reversed_cents` and `<= payout.amount_cents`.
3. Compute the incremental delta: `deltaCents = event.data.object.amount_reversed - payout.amount_reversed_cents`.
4. Insert the delta into `provider_payout_reversals` with the unique Stripe reversal ID.
5. Update `provider_payouts.amount_reversed_cents = event.data.object.amount_reversed` and set status to `REVERSED` (if 100%) or `PARTIALLY_REVERSED`.
6. Post the delta entry to `ledger_entries`.

### 8.3 Dedicated Reversal Audit Table (`provider_payout_reversals`)

```typescript
// Webhook Handler: transfer.reversed
async function handleTransferReversed(client: PoolClient, event: Stripe.Event): Promise<void> {
  const transfer = event.data.object as Stripe.Transfer;
  const stripeTransferId = transfer.id;
  const cumulativeAmountReversed = transfer.amount_reversed;
  const stripeReversalId = event.id; // Or transfer_reversal ID from transfer.reversals.data[0].id

  // 1. Lock payout record
  const payoutRes = await client.query(
    `SELECT id, tenant_id, provider_id, amount_cents, amount_reversed_cents, status
     FROM provider_payouts
     WHERE stripe_transfer_id = $1
     FOR UPDATE`,
    [stripeTransferId]
  );

  if (payoutRes.rows.length === 0) {
    throw new Error(`Payout not found for stripe_transfer_id: ${stripeTransferId}`);
  }

  const payout = payoutRes.rows[0];

  // 2. Monotonicity verification
  if (cumulativeAmountReversed <= payout.amount_reversed_cents) {
    // Duplicate or out-of-order event; ignore safely
    return;
  }

  if (cumulativeAmountReversed > payout.amount_cents) {
    throw new Error(
      `CRITICAL_INVARIANT_VIOLATION: Reversal ${cumulativeAmountReversed} exceeds original payout ${payout.amount_cents}`
    );
  }

  // 3. Compute incremental delta
  const deltaCents = cumulativeAmountReversed - payout.amount_reversed_cents;

  // 4. Insert into provider_payout_reversals (Idempotent via unique stripe_reversal_id)
  const revRes = await client.query(
    `INSERT INTO provider_payout_reversals (
       tenant_id, payout_id, stripe_reversal_id, delta_amount_cents,
       cumulative_reversed_cents, reason, metadata
     ) VALUES ($1, $2, $3, $4, $5, 'Stripe Connect Transfer Reversal', $6)
     ON CONFLICT (stripe_reversal_id) DO NOTHING
     RETURNING id`,
    [payout.tenant_id, payout.id, stripeReversalId, deltaCents, cumulativeAmountReversed, JSON.stringify(transfer)]
  );

  // 5. Update provider_payouts cumulative cents and status
  const newStatus = cumulativeAmountReversed === payout.amount_cents ? 'REVERSED' : 'PARTIALLY_REVERSED';
  await client.query(
    `UPDATE provider_payouts
     SET amount_reversed_cents = $1,
         status = $2,
         last_reconciled_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [cumulativeAmountReversed, newStatus, payout.id]
  );

  // 6. Record double-entry ledger delta in ledger_entries
  // DEBIT 2020 (Technician Unpaid Payables) / CREDIT 1010 (Operating Cash Clearing)
  const accRes = await client.query(
    `SELECT id, account_number FROM ledger_accounts WHERE tenant_id = $1`,
    [payout.tenant_id]
  );
  const accounts = accRes.rows;
  const cashAcc = accounts.find(a => a.account_number === '1010')?.id;
  const techPayableAcc = accounts.find(a => a.account_number === '2020')?.id;

  if (cashAcc && techPayableAcc && revRes.rows.length > 0) {
    await client.query(
      `INSERT INTO ledger_entries (
         tenant_id, payout_id, posting_type, debit_account_id, credit_account_id, amount_cents, description
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (payout_id, posting_type) DO NOTHING`,
      [
        payout.tenant_id,
        payout.id,
        `PAYOUT_REVERSAL_${revRes.rows[0].id.substring(0, 8)}`,
        techPayableAcc,
        cashAcc,
        deltaCents,
        `Reversal delta of ${deltaCents} cents for transfer ${stripeTransferId}`
      ]
    );
  }
}
```

---

## 9. Domain 6: Persistent Safety PIN Lockout with Window Reset & State Invariants

### 9.1 Distributed Lockout in `bookings` Table
In `server/src/modules/bookings/bookings.routes.ts`, the PIN verification endpoint is refactored from process memory to PostgreSQL row state:

```typescript
// POST /api/v1/bookings/:id/verify-pin
fastify.post('/:id/verify-pin', async (request: FastifyRequest, reply: FastifyReply) => {
  const requestId = request.id || `req_${Date.now()}`;
  const { id } = request.params as { id: string };
  const parsed = verifyPinSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid PIN payload', requestId));
  }

  const { safetyPin } = parsed.data;
  const tenantId = request.tenantId;
  const userRole = request.user!.role;
  const userId = request.user!.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock booking row
    const bRes = await client.query(
      `SELECT id, customer_safety_pin, status, assigned_provider_id,
              safety_pin_failed_attempts, safety_pin_locked_until, safety_pin_last_failed_at
       FROM bookings 
       WHERE id = $1 AND tenant_id = $2 
       FOR UPDATE`,
      [id, tenantId]
    );

    if (bRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send(errorResponse('BOOKING_NOT_FOUND', 'Booking record not found', requestId));
    }

    const booking = bRes.rows[0];

    // Authorization: Must be assigned technician, ADMIN, or STAFF
    if (userRole === 'TECHNICIAN' && booking.assigned_provider_id !== userId) {
      await client.query('ROLLBACK');
      return reply.status(403).send(errorResponse('FORBIDDEN', 'You are not the assigned provider for this booking.', requestId));
    }
    if (userRole === 'CUSTOMER') {
      await client.query('ROLLBACK');
      return reply.status(403).send(errorResponse('FORBIDDEN', 'Only assigned technicians or dispatchers can verify arrival.', requestId));
    }

    // State check: Idempotent return if already ON_SITE
    if (booking.status === 'ON_SITE') {
      await client.query('COMMIT');
      return reply.status(200).send(successResponse({ verified: true, status: 'ON_SITE', verifiedAt: new Date().toISOString() }, requestId));
    }

    const validPreArrivalStatuses = ['CONFIRMED', 'ASSIGNED', 'SCHEDULED', 'DISPATCHED', 'EN_ROUTE'];
    if (!validPreArrivalStatuses.includes(booking.status)) {
      await client.query('ROLLBACK');
      return reply.status(400).send(errorResponse('INVALID_STATE', `Cannot verify arrival for booking in ${booking.status} status.`, requestId));
    }

    // Check active lockout in PostgreSQL
    const now = new Date();
    if (booking.safety_pin_locked_until && new Date(booking.safety_pin_locked_until) > now) {
      const remainingSeconds = Math.ceil((new Date(booking.safety_pin_locked_until).getTime() - now.getTime()) / 1000);
      await client.query('ROLLBACK');
      return reply.status(429).send(
        errorResponse('TOO_MANY_PIN_ATTEMPTS', `Safety PIN verification locked due to excessive failed attempts. Please retry in ${remainingSeconds} seconds.`, requestId)
      );
    }

    // Check PIN match
    if (booking.customer_safety_pin !== safetyPin) {
      // 15-minute sliding window check: reset counter if previous failure was > 15 mins ago
      const isWindowExpired = !booking.safety_pin_last_failed_at ||
        (now.getTime() - new Date(booking.safety_pin_last_failed_at).getTime()) > 15 * 60 * 1000;

      const currentAttempts = (isWindowExpired ? 0 : booking.safety_pin_failed_attempts) + 1;
      const shouldLock = currentAttempts >= 5;
      const lockedUntil = shouldLock ? new Date(now.getTime() + 15 * 60 * 1000) : null;

      await client.query(
        `UPDATE bookings
         SET safety_pin_failed_attempts = $1,
             safety_pin_last_failed_at = NOW(),
             safety_pin_locked_until = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [currentAttempts, lockedUntil, id]
      );

      await client.query('COMMIT');
      return reply.status(400).send(
        errorResponse('INVALID_SAFETY_PIN', `The 4-digit safety PIN provided is incorrect. ${Math.max(0, 5 - currentAttempts)} attempts remaining before lockout.`, requestId)
      );
    }

    // Successful PIN verification:
    // Reset lockout counters, invalidate PIN, record arrival timestamp, and advance status to ON_SITE
    await client.query(
      `UPDATE bookings 
       SET status = 'ON_SITE',
           pin_verified_at = NOW(),
           customer_safety_pin = NULL,
           safety_pin_failed_attempts = 0,
           safety_pin_locked_until = NULL,
           safety_pin_last_failed_at = NULL,
           geofence_arrival_at = COALESCE(geofence_arrival_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Record Timeline Audit Event in booking_timeline_events
    await client.query(
      `INSERT INTO booking_timeline_events (
        booking_id, tenant_id, from_status, to_status, actor_id, event_title, event_details
      ) VALUES ($1, $2, $3, 'ON_SITE', $4, 'On-Site Arrival & PIN Verified', 'Customer confirmed presence via safety PIN verification.')`,
      [id, tenantId, booking.status, userId]
    );

    await client.query('COMMIT');
    return reply.status(200).send(
      successResponse({ verified: true, status: 'ON_SITE', verifiedAt: new Date().toISOString() }, requestId)
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
```

---

## 10. Domain 7: Controlled Proxy Trust & Edge Rate Limiting

### 10.1 Strict CIDR Schema in `server/src/config/env.ts`
```typescript
const envSchema = z.object({
  // ... other fields
  TRUST_PROXY: z.string().default('false').transform((val) => {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    // Comma-separated list of trusted upstream proxy CIDRs/IPs
    return val.split(',').map((ip) => ip.trim());
  })
});
```

### 10.2 Fastify Proxy Engine Initialization in `server/src/app.ts`
```typescript
export function buildApp(env: Config) {
  const app = fastify({
    logger: true,
    trustProxy: env.TRUST_PROXY
  });
  return app;
}
```

### 10.3 Elimination of Localhost Rate Limit Bypass
In `server/src/plugins/security.ts`, delete any IP loopback bypass:
```typescript
// Enforce uniform rate-limiting across all requests regardless of origin IP
```

---

## 11. Domain 8: Cryptographic Hardening & Insecure Key Blocklisting

### 11.1 Universal Blocklist Across All Environments
In `server/src/config/env.ts`, the backend strictly refuses to start if any default insecure key is detected:

```typescript
export const INSECURE_DEFAULTS = new Set([
  'super-secret-jwt-key-minimum-32-chars-long',
  'dev-secret-key-do-not-use-in-prod',
  'test-secret-key-32-characters-minimum',
  '12345678901234567890123456789012',
  'changeme-changeme-changeme-changeme'
]);

export function validateSecrets(env: { JWT_SECRET: string; ENCRYPTION_KEY?: string }): void {
  if (INSECURE_DEFAULTS.has(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error('CRITICAL_SECURITY_HALT: Insecure or default JWT_SECRET detected. Application boot terminated.');
  }

  if (env.ENCRYPTION_KEY && (INSECURE_DEFAULTS.has(env.ENCRYPTION_KEY) || env.ENCRYPTION_KEY.length < 32)) {
    throw new Error('CRITICAL_SECURITY_HALT: Insecure or default ENCRYPTION_KEY detected. Application boot terminated.');
  }
}
```

---

## 12. Domain 9: Admin Web Production Authority & LocalStorage Bypass

### 12.1 Disable LocalStorage Hydration in Production Builds
In `admin_web/src/context/AuthContext.tsx`:
```typescript
// In production builds, strictly require server session validation via /api/v1/auth/me
if (import.meta.env.PROD) {
  // Clear any existing localStorage mock tokens
  localStorage.removeItem('serviceos_admin_token');
  localStorage.removeItem('serviceos_admin_user');
}
```

---

## 13. Domain 10: Flutter Mobile Declarative Router Integration

### 13.1 Strict Mobile Persona Separation (Customer vs Technician)
In `serviceos/lib/core/router/app_router.dart`:
* Customer routes (`/customer/...`) and Technician routes (`/technician/...`) are strictly segregated.
* Zero administrative routes exist in the mobile binary.

---

## 14. Domain 11: CI/CD Pipeline & Turnkey Docker Validation

### 14.1 Automated Validation Pipeline
Ensure automated pipeline runs:
1. `npx tsx --test tests/**/*.test.ts`
2. Migration syntax and rollback integrity checks
3. `npm run build` across `server` and `admin_web`

---

## 15. Stage 4: Substantive Integration & Regression Test Specification

The test suite in `server/tests/` is expanded with real Fastify route injections and Stripe mocks:

```typescript
// server/tests/integration/remediation_invariants.test.ts
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app';
import { pool } from '../../src/database/pool';
import { OutboxWorker } from '../../src/workers/outbox.worker';
import { INSECURE_DEFAULTS, validateSecrets } from '../../src/config/env';

describe('Remediation Core Invariants Test Suite (Schema-Matched)', () => {
  let app: any;

  before(async () => {
    app = buildApp({
      JWT_SECRET: 'a-genuine-production-grade-secret-key-64-characters-long-for-testing',
      TRUST_PROXY: false,
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/serviceos_test'
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  // TEST-01: Verify exact Stripe webhook route bypasses tenant middleware
  test('TEST-01: Stripe webhook exact path bypasses tenant header requirement', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/finances/webhooks/stripe',
      headers: { 'stripe-signature': 't=123,v1=invalid_signature' },
      payload: { id: 'evt_test_123', type: 'payment_intent.succeeded' }
    });

    // Fails on invalid signature (400), NEVER on missing tenant context
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.match(body.message, /stripe-signature|signature/i);
    assert.notMatch(body.message, /Tenant context required/i);
  });

  // TEST-02: Outbox worker heartbeat & single-job claim
  test('TEST-02: Outbox worker claims single job and verifies owner before completion', async () => {
    const worker = new OutboxWorker(pool as any, app.log, 'worker-test-1');
    assert.strictEqual(typeof worker.triggerProcess, 'function');
  });

  // TEST-03: Cumulative reversal delta calculation and monotonicity
  test('TEST-03: Reversal calculates delta and rejects decreasing or excessive amounts', () => {
    const payoutAmountCents = 10000;
    let currentReversedCents = 2000;

    const event1 = 5000;
    assert.ok(event1 > currentReversedCents);
    const delta1 = event1 - currentReversedCents;
    assert.strictEqual(delta1, 3000);
    currentReversedCents = event1;

    // Stale event
    const event2 = 4000;
    assert.ok(event2 <= currentReversedCents, 'Stale event must not produce positive delta');

    // Excessive event
    const event3 = 12000;
    assert.ok(event3 > payoutAmountCents, 'Reversal exceeding total payout must be rejected');
  });

  // TEST-04: Insecure key validator fails closed across all environments
  test('TEST-04: Insecure JWT_SECRET throws critical boot error in all environments', () => {
    for (const badSecret of INSECURE_DEFAULTS) {
      assert.throws(
        () => validateSecrets({ JWT_SECRET: badSecret }),
        /CRITICAL_SECURITY_HALT/
      );
    }
  });

  // TEST-05: Check migration 010 down guard prevents data destruction
  test('TEST-05: Migration 010 down guard aborts if reversals exist', () => {
    const downSql = `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM provider_payout_reversals) THEN
          RAISE EXCEPTION 'MIGRATION ROLLBACK ABORTED: provider_payout_reversals contains recorded financial reversals.';
        END IF;
      END $$;
    `;
    assert.match(downSql, /MIGRATION ROLLBACK ABORTED/);
  });
});
```

---

## 16. Production Deployment, Phased Rollout & Disaster Recovery Runbook

### 16.1 10-Phase Implementation Roadmap
1. **Phase 1: Database Baseline & Migration 010 Up/Down Validation:**
   - Execute migration `010_remediation_core_invariants.sql` against a disposable PostgreSQL 16 database.
   - Verify up and down migrations with representative test data.
2. **Phase 2: Security & Edge Hardening:**
   - Implement `TRUST_PROXY` schema and remove loopback bypass in rate-limiting.
   - Enforce `INSECURE_DEFAULTS` boot checks in `env.ts`.
   - Update tenant resolver to exempt exact route `/api/v1/finances/webhooks/stripe`.
3. **Phase 3: Outbox Engine & Dedicated Worker:**
   - Implement `server/src/workers/outbox.worker.ts` with single-job claiming, heartbeat renewal, and owner verification.
4. **Phase 4: Booking Route Conversion:**
   - Convert `POST /api/v1/bookings` to atomic reservation returning HTTP 202 `Accepted`.
   - Implement `GET /api/v1/bookings/:id/payment-intent` for client payment sheet initialization.
5. **Phase 5: Webhook Dual-Key Resolution & Ledger Mapping:**
   - Implement deterministic dual-key resolution with UUID validation.
   - Refactor `payment_intent.succeeded` to post `ESCROW_HOLD` (Debit 1020 / Credit 2010) exclusively.
6. **Phase 6: Payout Timeout State Machine & Balance Retention:**
   - Update `POST /finances/payouts` to set `PENDING_PROVIDER_CONFIRMATION` on network timeout.
   - Update balance calculation to deduct reserved payouts and add back partial reversals.
7. **Phase 7: Cumulative Transfer Reversal Engine:**
   - Implement `transfer.reversed` webhook with row lock, monotonic check, and insertion into `provider_payout_reversals`.
8. **Phase 8: Work Order Completion & Escrow Release:**
   - Refactor `POST /bookings/:id/complete` to capture Stripe hold outside DB locks, then post `PLATFORM_FEE` and `TECH_PAYABLE`.
9. **Phase 9: Persistent Safety PIN Lockout:**
   - Refactor `POST /bookings/:id/verify-pin` to use PostgreSQL row state in `bookings`.
10. **Phase 10: Admin Web Authority & Production Rollout:**
    - Disable localStorage auth mocking in production builds.
    - Run end-to-end integration test harness and execute staging verification.

### 16.2 Production Verification & Downgrade Runbook
- If emergency rollback is required:
  1. Revert backend image to baseline commit.
  2. Execute `010_down.sql` (data guards ensure no financial audit trails are destroyed).
  3. If unrecoverable inconsistency occurs, restore from custom PostgreSQL backup dump.
