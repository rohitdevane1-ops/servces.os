# ServiceOS — Remediation Plan v4 (evidence-based)

**Status: PLAN ONLY. No application code, migration, worker or test has been implemented or run for these fixes.**
Baseline inspected: branch `remediation/hardening-phase5-audit-resolution` @ `00aca4b`. Server tests at baseline: 68/68 pass — but see §1.2: those tests are static and did not catch the defects below.

Evidence labels: **[V]** verified by reading code/migrations in this session (file:line given) · **[R]** reported by earlier audit/Copilot, not re-verified · **[U]** unverified, needs proof in Phase 0.

---

## 1. Findings register

### 1.1 Original P0–P4 list, re-checked against code

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1a | Stripe create inside open tx (booking create) | **[V] confirmed** | `bookings.routes.ts` BEGIN L66 → `paymentIntents.create` L153 → COMMIT later |
| 1b | Stripe `retrieve` inside tx holding `FOR UPDATE` row lock (confirm-payment) | **[V]** | BEGIN L256, retrieve L304 |
| 1c | Stripe `cancel` inside tx holding row lock | **[V]** | BEGIN L976, cancel L1044; non-"already canceled" error → ROLLBACK after Stripe may have succeeded |
| 1d | Stripe transfer inside tx (payout recovery + reconcile) | **[V]** | `finances.routes.ts` BEGIN L729 → transfers.create L774; BEGIN L1018 → L1043 |
| 1e | Completion capture | **Already correct** | capture L801 is outside tx (3-phase). Preserve it. |
| 2 | Webhook blocked by tenant resolver | **[V]** | `tenant.ts` exempts only `/health`, `/docs`, `/api/v1/installer` via `startsWith`; webhook path not exempt. Resolver falls back to Host/single-tenant, fails with multiple tenants. |
| 3 | Premature event claim | **[V]** | claim INSERT L85; if no `payment_transactions` row matches, handler falls through to COMMIT + `200` (L244) — event is burned, Stripe never retries |
| 4 | Payout timeout → FAILED | **[V]** | any Stripe error (incl. timeout) runs `UPDATE provider_payouts SET status='FAILED'` (~L905–930) → balance freed → double-pay risk |
| 5 | `payout.failed` uses `po_` id against `stripe_transfer_id` | **[V]** | handler `WHERE stripe_transfer_id = payoutObj.id` |
| 6 | `transfer.reversed` sets REVERSED, no ledger, no cumulative tracking | **[V]** | handler ~L222–232 |
| 7 | trustProxy / localhost allow-list | **[V]** | `security.ts:62 allowList: ['127.0.0.1']`; `app.ts` has no `trustProxy` |
| 8 | In-memory PIN lockout | **[V]** | `pinAttemptStore` L11, L641–664. **Real route is `POST /:id/verify-arrival` (L565) — earlier plan revisions wrongly called it `/verify-pin`.** |
| 9 | Default `APP_ENCRYPTION_KEY` accepted in production | **[V] confirmed** | `env.ts:37` default `0123…cdef` is valid 64-hex; `INSECURE_DEFAULTS` (L9–15) does **not** contain it, so the L93 check passes |
| 10 | Client-side-only admin rate limit | **[V] partly mitigated** | `rateLimiter.ts` uses localStorage (not authority), but `auth.routes.ts` already maintains server-side `failed_login_attempts`/`locked_until` per user (L243–261). Gap = per-IP/distributed throttle only. |
| 11 | Flutter GoRouter not mounted | **[V]** | `app.dart:79` builds `MaterialApp`; no `routerConfig`/`GoRouter` |
| 12 | AdminContext localStorage hydration | **[V]** | ~20 `localStorage.getItem('servicepro_*')` for bookings/invoices/tickets/etc. + `mockData` import |
| 13 | CI masks audits; Docker only `compose config`; no mobile; no migration job | **[V]** | `ci.yml` L159/L164 `|| true`; L131 `docker compose config --quiet`; no flutter/gradle step; no migrate step found |
| 14, 15, 16–20 | Dual data path, refresh-cookie CSRF, warnings, hosts, monitoring | **[U]** | not re-inspected; schedule inspection in Phase 9 before any change |

### 1.2 NEW defects found in this pass (runtime-breaking, missed by the 68 static tests)

These are code ↔ schema mismatches against migrations 001–009. **[V]** against the migration files (no other `.sql` exists in the repo). Because no PostgreSQL is available locally (see §6), each must be reproduced in Phase 0 on a real DB before being "fixed" — treat them as **very likely, pending proof**.

| ID | Defect | Where | Consequence |
|----|--------|-------|-------------|
| N1 | `payment_transactions` has **no** `updated_at`, `currency`, `error_message` columns (005/007) | webhook `UPDATE … updated_at = NOW()` (L144,197,207,217), `SELECT pt.currency` (L114), `SET error_message` (L136) | `payment_intent.succeeded` etc. throw → rollback → 500 → Stripe retries forever |
| N2 | `payment_transactions.status` CHECK lacks `DISCREPANCY_QUARANTINED` (007 allows PENDING, REQUIRES_CAPTURE, SUCCEEDED, FAILED, REFUNDED, VOIDED) | webhook L136, finance query L637 | quarantine path violates CHECK |
| N3 | `provider_payouts` has **no** `updated_at` (005/007/008/009) | L785, L798, L1054, L1066 and webhook L227/L237 | payout recovery/reconcile + `transfer.reversed`/`payout.failed` handlers throw |
| N4 | `bookings.customer_safety_pin` is `NOT NULL` (004) and nothing relaxes it | verify-arrival success: `SET customer_safety_pin = NULL` (L666) | successful PIN verification raises 23502 → technician can never arrive-verify |
| N5 | `ON CONFLICT (transaction_id, posting_type)` / `(payout_id, posting_type)` target **partial** unique indexes (009, `WHERE … IS NOT NULL`) without repeating the predicate | bookings L898/914, finances L176/185/819/1088 | Postgres error 42P10 "no unique or exclusion constraint matching" |
| N6 | **Ledger never credits 2010 (Customer Escrow Liability)**; completion/webhook only *debit* 2010 (→2020/4010) | completion L884–920, webhook | 2010 goes negative; assets 1010/1020 never debited at capture → books are balanced per-entry but economically wrong |
| N7 | Payout status `TRANSFER_CONFIRMED` referenced in balance SQL (L861) but absent from every CHECK | finances | dead branch; clean up |
| N8 | `confirm-payment` checks `NODE_ENV === 'staging'`, but env enum is `development|production|test` | bookings ~L318 | dead branch; also webhook signature skipped whenever `STRIPE_WEBHOOK_SECRET` unset in non-prod (forgeable events in dev/staging) |

> Why the tests missed this: `tests/*.test.ts` assert on source text/regex; none execute SQL. Passing 68/68 says nothing about N1–N5.

### 1.3 Errors in my earlier revisions (corrected here)
1. Rev 2/3 treated `payment_intent.succeeded` as the "escrow hold". With `capture_method: 'manual'` authorization ends in `requires_capture`; `succeeded` only follows capture. **Wrong — fixed in §2.**
2. Rev 3 reversal posting was Dr 2020 / Cr 1010 (same direction as the payout). A reversal must **mirror** the payout: **Dr 1010 / Cr 2020**.
3. Rev 3 named the route `/verify-pin`; it is `/verify-arrival`.
4. Rev 3 dropped `customer_safety_pin` semantics and ignored N1–N8; Rev 3's `PAYMENT_FAILED` booking status violates the bookings CHECK (allowed: REQUESTED, BROADCASTING, ASSIGNED, EN_ROUTE, ON_SITE, COMPLETED, CANCELLED, DISPUTED).
5. "100% schema-matched" claims removed: nothing is claimed matched until Phase 0/1 run on PostgreSQL.

---

## 2. Corrected payment & ledger model

### 2.1 Separate state machines
- **Outbox operation** (`outbox_operations.status`): PENDING → PROCESSING → COMPLETED | FAILED | REQUIRES_RECONCILIATION. COMPLETED means *"Stripe PaymentIntent created and its ID persisted"* — **not** that money is authorized.
- **Payment transaction** (`payment_transactions.status`): PENDING (no/unauthorized PI) → REQUIRES_CAPTURE (authorized) → SUCCEEDED (captured) | FAILED | VOIDED | REFUNDED | DISCREPANCY_QUARANTINED.
- **Invoice**: DRAFT → AUTHORIZED → PAID | VOID | REFUNDED.
- **Booking** keeps its existing machine; payment failure at creation → `CANCELLED` with `cancellation_reason` (no new status).

### 2.2 Stripe event → action

| Stripe event | Meaning | Local action | Ledger |
|---|---|---|---|
| `payment_intent.amount_capturable_updated` / PI status `requires_capture` | Authorized | tx → REQUIRES_CAPTURE, invoice → AUTHORIZED (never downgrade a SUCCEEDED row) | none |
| `payment_intent.succeeded` | Captured | validate amount+currency+tenant; tx → SUCCEEDED, `captured_amount_cents`; invoice → PAID | **ESCROW_CAPTURE: Dr 1020 / Cr 2010** (amount_received) |
| `payment_intent.payment_failed` | Failed | tx → FAILED | none |
| `payment_intent.canceled` | Auth released | tx → VOIDED (only if not SUCCEEDED) | none |
| `charge.refunded` | Refund | update refunded amount | **Open decision D3** (currently no ledger) |

### 2.3 Postings (each exactly once via unique key)
1. **Capture** (webhook *or* completion Phase 3, whichever first): `ESCROW_CAPTURE` Dr 1020 Stripe Holding / Cr 2010 Customer Escrow.
2. **Completion** (only when booking is COMPLETED): `PLATFORM_FEE` Dr 2010 / Cr 4010; `TECH_PAYABLE` Dr 2010 / Cr 2020. Fee + payable = captured total (assert in code and test).
3. **Payout**: `PAYOUT_DISBURSAL` Dr 2020 / Cr 1010 (matches existing code).
4. **Reversal delta**: `PAYOUT_REVERSAL` Dr 1010 / Cr 2020, positive delta only; reversed amount returns to the provider's available balance.
5. Webhook must **not** post fee/payable unless booking.status = COMPLETED (today it posts them unconditionally — N6 family). Completion Phase 3 must be safely re-runnable if capture succeeded but Phase 3 failed (capture call already returns "already captured" → handled; keep).
6. Proof obligation: a DB-backed test sums debits = credits and checks account 2010 nets to 0 after capture+completion, and 2020 nets to (earned − paid + reversed).

Idempotency fix for N5: replace the two partial unique indexes with **full** unique indexes on `(transaction_id, posting_type)` and `(payout_id, posting_type)` (NULLs never conflict, so semantics are unchanged) *after* checking for duplicates; then existing `ON CONFLICT (cols)` works. Posting type strings stay ≤ 50 chars and static (no embedded IDs).

---

## 3. Migration 010 design (must be validated on PostgreSQL before use)

Rules: single forward transaction; names discovered, not assumed (the `provider_payouts` status CHECK name is auto-generated — look it up via `pg_constraint`, don't hard-code); every new constraint preceded by a data-validation `DO` block that aborts with a clear message; down-migration refuses if it would delete audit/financial data.

**Up (010):**
1. `payment_transactions`: `ADD updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (+ trigger `set_updated_at_timestamp`), `ADD currency VARCHAR(3) NOT NULL DEFAULT 'USD'`, `ADD error_message TEXT`, `ALTER stripe_payment_intent_id DROP NOT NULL`, extend status CHECK with `DISCREPANCY_QUARANTINED`; add `UNIQUE (stripe_payment_intent_id)` partial/where not null (it is currently non-unique — verify no duplicates first).
2. `provider_payouts`: `ADD updated_at` (+trigger), `amount_reversed_cents BIGINT NOT NULL DEFAULT 0`, `last_reconciled_at`, `reconcile_attempts INT`, extend status CHECK with `PENDING_PROVIDER_CONFIRMATION`, `PARTIALLY_REVERSED`, `REVERSED`; CHECK `0 <= amount_reversed_cents <= amount_cents`.
3. `provider_payout_reversals(id, tenant_id, payout_id, stripe_event_id UNIQUE, stripe_reversal_id NULL, delta_amount_cents >0, cumulative_reversed_cents, created_at)`, FKs `ON DELETE RESTRICT`, tenant-consistent composite FK if feasible.
4. `bookings`: `ALTER customer_safety_pin DROP NOT NULL`; `safety_pin_failed_attempts INT NOT NULL DEFAULT 0`, `safety_pin_locked_until TIMESTAMPTZ`, `safety_pin_last_failed_at TIMESTAMPTZ`; CHECK pin is NULL or 4 digits.
5. `outbox_operations` (tenant_id, aggregate_type/id, operation_type, payload JSONB, `idempotency_key` UNIQUE, status CHECK, attempts, max_attempts, `next_attempt_at`, `locked_by`, `lease_expires_at`, last_error, timestamps) + partial index for claimable rows.
6. `webhook_events`: add `tenant_id NULL`, `status` (`PROCESSED`) — claim row is only committed with the processing (see §4.2).
7. Ledger unique indexes: drop partial, create full (§2.3) after duplicate check.
8. **No stripe `client_secret` column.** Client secrets are credentials; fetch from Stripe on demand (§4.1) instead of persisting them.

**Down (010):** abort (`RAISE EXCEPTION`) if any of: `outbox_operations` rows, `provider_payout_reversals` rows, `amount_reversed_cents>0`, any payout/payment row using a new status, `payment_transactions` rows with NULL PI, bookings with `customer_safety_pin IS NULL` or non-zero attempts. Otherwise restore the exact prior constraints (007 payment status list; 005 payout status list) and drop added objects.

**Migration test (real PG, in CI):** apply 001→009 → seed historical rows (payments, payouts incl. PROCESSING, ledger entries) → 010 up → assert → 010 down aborts when guarded data exists → delete guarded data → down passes → up again (re-runnable).

---

## 4. Design by domain

### 4.1 Booking creation + payment outbox (Issue 1a, C)
- Preflight: production without `STRIPE_SECRET_KEY` → 422 **before** any write.
- One short tx: customer profile, `customer_addresses`, booking (`REQUESTED`), invoice (`DRAFT`) + items, `payment_transactions` (PENDING, PI NULL, existing `idempotency_key` = `idem_pi_<booking_id>`), `outbox_operations` (key = same stable value), timeline event. COMMIT, release.
- Return **202** `{bookingId, paymentTransactionId, status:'PENDING_PAYMENT'}`; never 201.
- `GET /bookings/:id/payment-intent`: tenant-scoped, owner or ADMIN/STAFF only; DB read → release → if PI ID exists, `stripe.paymentIntents.retrieve` **outside any tx** and return `{clientSecret,status}`; if not yet created → 202 `{status:'PROVISIONING'}`.
- Worker (§4.3) creates the PI with metadata `{tenantId, bookingId, transactionId}`, `capture_method:'manual'`, same params + same idempotency key on every retry.
- **Contract change:** Flutter and Android clients currently expect 201 + `clientSecret` in the create response (`bookings.routes.ts` L219–223). They must be updated together (Open decision D1).

### 4.2 Webhook (Issues 2, 3, 5-part)
- Tenant exemption: exact match on `request.method==='POST'` and pathname (query stripped) `=== '/api/v1/finances/webhooks/stripe'`; add a test mounting the real app. No `startsWith` on `/api/v1/finances`.
- Order: verify signature (require `STRIPE_WEBHOOK_SECRET` whenever `STRIPE_SECRET_KEY` is set, in every env — fixes N8) → parse → BEGIN → resolve → process → **claim event as the last write inside the same tx** (or claim first but ROLLBACK on any missing data) → COMMIT.
- Resolution: by `stripe_payment_intent_id`; else by verified `metadata.transactionId` (strict UUID) where PI is NULL **and** `metadata.tenantId` equals the row's tenant; if both keys hit different rows → quarantine + **409**. Lock row `FOR UPDATE`.
- No local row → ROLLBACK (no claim), **503** so Stripe retries (covers "webhook before worker saved the PI ID" because metadata fallback then binds it).
- Validate amount, currency, tenant, tx/invoice consistency; mismatch → `DISCREPANCY_QUARANTINED` (needs N1/N2 migration).
- Never downgrade: SUCCEEDED is terminal vs. REQUIRES_CAPTURE/FAILED events; transitions use `WHERE status IN (allowed_from)` and check `rowCount`.
- `payout.failed`: it is a connected-account payout (`po_…`, `event.account` present, needs a Connect endpoint/secret). Do **not** touch `provider_payouts.stripe_transfer_id`. Record an audit + flag for admin review; transfer-level failures come from `transfer.*`/API errors. (Open decision D4.)

### 4.3 Outbox worker (B)
- Claim one job: `UPDATE … WHERE id = (SELECT id … WHERE (status='PENDING' AND next_attempt_at<=now()) OR (status='PROCESSING' AND lease_expires_at<now()) ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING …`, commit, release client **before** Stripe.
- Heartbeat every lease/3 renewing `WHERE id=$1 AND locked_by=$2`; if it matches 0 rows the worker aborts its result handling.
- Every completion/failure/retry `UPDATE … WHERE id=$1 AND locked_by=$2 AND status='PROCESSING'`; `rowCount=0` → log, do nothing (lost lease).
- Results: success → save PI ID (do not overwrite SUCCEEDED/REQUIRES_CAPTURE set by webhook), outbox COMPLETED. `StripeCardError`/4xx definitive → payment FAILED + booking CANCELLED (+reason) + outbox FAILED. Timeout/5xx/connection → retry with exponential backoff + jitter, **same key and identical params** (Stripe has no lookup by key); exhausted → REQUIRES_RECONCILIATION, tx stays PENDING, booking untouched; an admin reconciler endpoint re-runs the same-key create.
- Lifecycle: started in `server.ts` after listen, stopped on SIGTERM (drain current job); disabled via `OUTBOX_WORKER_ENABLED` for API-only replicas; one process-wide singleton.

### 4.4 confirm-payment and cancel (Issue 1b/1c)
Three phases each: (1) short read (tenant, ownership, state) → release; (2) Stripe outside tx; (3) short tx `FOR UPDATE` re-check state, apply only valid transitions.
- confirm-payment: retrieve PI; `requires_capture` → AUTHORIZED; `succeeded` → treat as capture reconciliation; else 409 with state; Stripe failure → 502 and no local change.
- cancel: Phase 1 decides; Phase 2 `paymentIntents.cancel` with stable key if tx has a PI and is REQUIRES_CAPTURE **or** PENDING-with-PI; "already canceled" = success; "already captured/succeeded" → **do not cancel booking**, return 409 + reconciliation (needs refund flow, D3); ambiguous network error → 502, booking stays, retry-safe. Phase 3 cancels booking/voids invoice/tx, timeline event. If a PENDING outbox row exists, mark it `CANCELLED`-equivalent (add status or set FAILED with reason) so the worker doesn't create a PI for a cancelled booking.

### 4.5 Payouts (Issue 4, 1d, E)
- Keep Phase 1 reservation (PROCESSING, deducted from balance) and Phase 2 outside tx.
- Stripe error classification: connection/timeout/5xx/rate-limit → `PENDING_PROVIDER_CONFIRMATION` (still deducted), return **202**; definitive (`StripeInvalidRequestError`, permission, invalid destination) → FAILED + free balance.
- Move recovery/reconcile Stripe calls (L774, L1043) out of transactions: read → release → Stripe → short tx. Reuse the **persisted** idempotency key + original amount/destination (store destination account & currency on the row, add `stripe_destination` if needed) — never recompute from current provider data.
- Reconcile endpoint/job: if `stripe_transfer_id` present → `transfers.retrieve`; else retry create with same key/params; success → PROCESSING→PAID path; confirm FAILED only on definitive error.
- Balance SQL: earned − Σ(`amount_cents − amount_reversed_cents` for PAID/PROCESSING/PENDING_PROVIDER_CONFIRMATION); drop dead `TRANSFER_CONFIRMED`; never count FAILED. Phase 3 payout ledger insert gets idempotent `ON CONFLICT`.

### 4.6 Reversals (Issue 6)
`transfer.reversed`: lock payout row; `cum = transfer.amount_reversed`; `cum < stored` or `cum > amount_cents` → reject/quarantine; `cum == stored` → duplicate, 200; else `delta = cum − stored`; insert reversal row (unique `stripe_event_id`), post `PAYOUT_REVERSAL` Dr 1010 / Cr 2020 for `delta`, set `amount_reversed_cents = cum`, status PARTIALLY_REVERSED/REVERSED — all in one tx, 200 only after commit. Out-of-order older event (smaller cum) is ignored safely; unknown payout → 503.

### 4.7 Safety PIN (Issue 8, N4) — `POST /:id/verify-arrival`
Remove `pinAttemptStore`. Keep authorization and `validPreArrivalStatuses` as is. In the existing `FOR UPDATE` tx: if `safety_pin_locked_until > now` → 429; wrong PIN → if `last_failed_at` older than lock/window reset count, `attempts+1`, at 5 set `locked_until = now+15m`, **COMMIT the counter update** (today's ROLLBACK would discard it — a bug to avoid), return 400; success → clear PIN (needs N4 nullable), reset counters, ON_SITE, timeline event. Constant-time compare (`crypto.timingSafeEqual`).

### 4.8 Security & config (Issues 7, 9, 10)
- `TRUST_PROXY` env: `false` (default) | integer hop count | comma list of IP/CIDR; validated by zod; wired to Fastify `trustProxy`. Production without it set → behaves as untrusted (log warning). Remove `allowList: ['127.0.0.1']`; with `trustProxy` off, `request.ip` is the socket address and cannot be spoofed via `X-Forwarded-For`.
- Refactor `env.ts` into a pure `validateEnv(raw)` (so startup failure is unit-testable) and add `APP_ENCRYPTION_KEY` default, plus bootstrap/JWT/refresh defaults, to the blocklist; reject in production; keep format check. Also reject in `NODE_ENV=test`? No — tests use known fixtures; keep prod-only, test via `validateEnv`.
- Admin: keep server `failed_login_attempts`; add Fastify per-IP login limit (existing `@fastify/rate-limit`); for multi-replica sharing, back with PostgreSQL (small `rate_limit_hits` table) **or** a Redis store if infra allows (D5). Admin localStorage limiter becomes UX-only.

### 4.9 Admin, Flutter, CI, rest (Issues 11–20)
- AdminContext: in `import.meta.env.PROD`, no `mockData` import path and no `servicepro_*` entity hydration; start `loading`→`empty|error`; fetch from Fastify; demo fixtures behind explicit `VITE_DEMO_MODE` build flag; tree-shake check in build.
- Flutter: mount `app_router.dart` via `MaterialApp.router` in `app.dart`, preserving theme/auth redirects; verify deep links + Android back stack; widget/navigation tests (needs Flutter SDK — not installed here).
- CI: remove `|| true` (use `--audit-level=high` and a documented allow-list); `docker build` for server & admin images; PostGIS service job that applies 001–010 and runs DB-backed tests; Flutter `analyze/test/build apk` job; Android Gradle job if the Android project exists (the `android/` path does not exist at repo root — locate it first).
- Items 14–20: inspect first (§1 [U]), then fix; Fastify stays the only writer of financial/operational data; Supabase paths demo-only or removed.

---

## 5. Execution phases (each ends with a gate; no phase starts before the previous gate passes)

| Phase | Work | Gate (evidence required) |
|---|---|---|
| **0** | Branch `fix/remediation-phased-execution`. Add PostGIS CI job + `tests/db/` harness; **schema-contract tests** that run every route's SQL against real PG after 001–009. Reproduce N1–N5 as failing tests. | Failing tests recorded (proves defects); CI log |
| **1** | Migration 010 up/down + migration tests with historical rows | up→guard→down→up pass on PG |
| **2** | Quick wins: trustProxy/allow-list, env blocklist + `validateEnv`, tenant exemption + exact-path test | tests + spoof tests pass |
| **3** | Webhook rewrite (§4.2) incl. ledger model §2 | missing-tx→503 & no claim; duplicate; divergence; amount mismatch; N1/N2/N5 tests green |
| **4** | confirm-payment + cancel 3-phase | Stripe mock asserts no open tx (spy on `pool` active client) |
| **5** | Outbox, worker, booking 202, payment-intent GET, client updates | crash/stale lease/two-worker/heartbeat/timeout/decline tests green |
| **6** | Payout state machine + recovery/reconcile + balance | timeout→PENDING_PROVIDER_CONFIRMATION; replay; balance tests |
| **7** | Reversals | full/partial/duplicate/out-of-order tests; ledger nets correct |
| **8** | PIN persistence | state, lockout, expiry reset, success reset, N4 |
| **9** | Admin, Flutter, CI, remaining P2–P4 | admin prod build has no mock hydration; CI jobs green |
| **10** | Full regression + post-remediation audit report | all commands below with output |

Commands for the final evidence pack: `npm --prefix server test`, `npx tsc --noEmit` (server), `npm --prefix admin_web run lint && run build`, DB migration job, `docker build` ×2, `flutter analyze && flutter test` (if available).

"No Stripe call inside a DB tx" is enforced by a test helper that wraps `pool.connect()`, tracks open transactions, and makes the Stripe mock fail if invoked while any tracked client is mid-transaction.

---

## 6. Test strategy & environment limits
- **This machine has no `psql`, `docker`, or `flutter`** [V]. DB-backed tests must run in CI (PostGIS 16 service) or after installing Postgres locally; Flutter/Android checks likewise. I will not claim these passed until they run.
- Stripe is mocked via an injectable client factory (replace `new Stripe(...)` scattered through routes with one `getStripe()`), supporting timeout, success, duplicate-idempotency, 402 decline, already-captured, already-canceled.
- Webhook tests use real signature generation (`stripe.webhooks.generateTestHeaderString`).
- Existing static tests are kept but are not counted as evidence for any invariant above.

## 7. Open decisions (need your answer before Phase 5/7)
- **D1** Booking create contract changes 201→202 and `clientSecret` moves to a GET. Mobile apps must ship together. Alternative with much less blast radius: keep synchronous create **outside** the transaction (reserve → Stripe → record, with the same stable key and a reconciler) and still return `clientSecret` — simpler, but not the outbox you specified. Which?
- **D2** Worker placement: in-process in the API (simplest) or separate process/container?
- **D3** Refund accounting after completion (who bears fee/commission, tech clawback). Currently no ledger entries exist for refunds.
- **D4** Do you use Stripe Connect webhooks (separate endpoint/secret) for connected-account `payout.*` events?
- **D5** Shared rate-limit store: PostgreSQL table or Redis?

## 8. Definition of done
No external call inside an open tx (test-enforced) · no known P0/P1 or N1–N8 left · every invariant above covered by an executed DB/route/mock test · migration up/down proven on PostgreSQL with historical rows and guards · server + admin build clean · CI green incl. Docker build · deployment & rollback notes written · post-remediation audit with command output attached.
