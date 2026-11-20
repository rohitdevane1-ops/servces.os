# ServiceOS — Complete Issues & Solutions Report (single file)

**Scope:** every known defect, with evidence, impact, the fix, and verification status.
**Branch:** `fix/remediation-phased-execution` (branched from `remediation/hardening-phase5-audit-resolution`).
**Status of fixes:** Core P0 (01–08), P1 (09–14), P2 (15–17, 19–21, 23) remediation implemented and verified against real embedded PostgreSQL 16 + Fastify + Stripe mocks on `fix/remediation-phased-execution` (see §9 below).

**Evidence labels:** **[V]** verified in code/migrations or executed test output · **[R]** from earlier audit, not re-checked · **[U]** unverified on this host due to missing Docker/Flutter SDK (wired in `.github/workflows/ci.yml`).
**Environment limits:** Docker Engine and Flutter/Android SDK CLIs are not installed on this Windows host, so container image builds and Flutter/Gradle builds are statically verified only; database tests execute on real PostgreSQL 16 via `embedded-postgres` (with minimal PostGIS shim where native `postgis` extension is absent; CI uses `postgis/postgis:16-3.4-alpine`).

---

## 0. Master table

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 01 | P0 | Stripe network calls inside open DB transactions | [V] |
| 02 | P0 | Stripe webhook blocked by tenant resolver | [V] |
| 03 | P0 | Webhook claims event, then returns 200 for missing local data | [V] |
| 04 | P0 | Payout timeout marks payout FAILED → double-pay risk | [V] |
| 05 | P0 | Webhook/payout SQL uses columns and a status that don't exist | [V] vs migrations, [U] on live DB |
| 06 | P0 | PIN success sets a `NOT NULL` column to NULL | [V] vs migrations, [U] on live DB |
| 07 | P0 | `ON CONFLICT` targets partial unique indexes without predicate | [V] vs migrations, [U] on live DB |
| 08 | P0 | Ledger never credits Customer Escrow (2010) at capture | [V] |
| 09 | P1 | `payout.failed` matched with a Payout ID against a Transfer ID column | [V] |
| 10 | P1 | `transfer.reversed`: no cumulative tracking, no ledger entry | [V] |
| 11 | P1 | No `trustProxy`; `127.0.0.1` rate-limit allow-list | [V] |
| 12 | P1 | Safety-PIN lockout stored in process memory | [V] |
| 13 | P1 | Public default `APP_ENCRYPTION_KEY` accepted in production | [V] |
| 14 | P1→P2 | Admin login throttle only in browser `localStorage` | [V] (server per-user lockout exists) |
| 15 | P2 | Flutter `GoRouter` never mounted | [V] |
| 16 | P2 | AdminContext hydrates mock/localStorage entities in production | [V] |
| 17 | P2 | CI masks audit failures; Docker not built; no mobile/DB jobs | [V] |
| 18 | P2 | Supabase vs Fastify dual data path | [R] |
| 19 | P2 | Refresh-cookie CSRF protection | [R] |
| 20 | P2 | Webhook signature skipped when secret unset (non-prod); dead `staging` branch | [V] |
| 21 | P2 | Dead payout status `TRANSFER_CONFIRMED` in balance SQL | [V] |
| 22 | P2 | Tenant resolver queries DB on every request | [R] |
| 23 | P2 | Test suite is static; no live-DB/Stripe-mock/worker tests | [V] |
| 24 | P3/P4 | Lint warnings, hardcoded hosts, no monitoring, dead code, a11y/responsive, deprecations | [R] |

Fix order: **06 and 05/07 first** (they likely break core flows on a real DB), then 02/03, 01, 04/08/09/10, then security/UX/CI.

---

## 1. P0 — Critical

### 01. Stripe I/O inside open DB transactions
**Where [V]:** `bookings.routes.ts` — create: BEGIN L66 → `paymentIntents.create` L153; confirm-payment: BEGIN L256 → `retrieve` L304 (row lock `FOR UPDATE OF b` held); cancel: BEGIN L976 → `paymentIntents.cancel` L1044. `finances.routes.ts` — payout recovery: BEGIN L729 → `transfers.create` L774; reconcile: BEGIN L1018 → L1043.
**Already correct:** work-order completion captures at L801 *outside* a transaction. Keep that structure.
**Impact:** each slow Stripe call pins a pooled connection (`DB_POOL_MAX` default 20) and row locks → pool starvation and platform-wide timeouts; a failed cancel after Stripe succeeded rolls back local state that no longer matches Stripe.
**Solution (3 phases everywhere):** (1) short transaction/read, COMMIT, release client → (2) Stripe call with a stable DB-backed idempotency key → (3) short transaction that re-locks, re-checks state and applies only valid transitions.
- *Booking create:* durable reservation + outbox row, return **202** (see 1A below).
- *confirm-payment:* read → release → `retrieve` → `requires_capture` ⇒ AUTHORIZED, `succeeded` ⇒ capture reconciliation, anything else ⇒ 409; Stripe failure ⇒ 502, no local change.
- *cancel:* read → release → cancel PI (also when tx is PENDING *with* a PI). "already canceled" = success; "already captured" ⇒ do NOT cancel booking, return 409 (needs refund flow, see decision D3); network ambiguity ⇒ 502, booking unchanged. Phase 3 voids booking/invoice/tx and writes the timeline event. A still-PENDING outbox row for that booking must be cancelled so the worker never creates a PI for a cancelled booking.
- *payout recovery/reconcile:* same three phases, using the **persisted** idempotency key and the **original** amount/destination stored on the payout row.
**1A. Booking-create outbox design**
1. Preflight: production without `STRIPE_SECRET_KEY` ⇒ 422 *before* any write.
2. One short tx: customer profile, `customer_addresses`, booking (`REQUESTED`), invoice (`DRAFT`) + items, `payment_transactions` (PENDING, PI NULL), `outbox_operations` (unique key `idem_pi_<booking_id>`), timeline event. COMMIT, release.
3. Return 202 `{bookingId, paymentTransactionId, status:'PENDING_PAYMENT'}`.
4. `GET /bookings/:id/payment-intent` (tenant-scoped, owner or ADMIN/STAFF): read DB → release → `paymentIntents.retrieve` → `{clientSecret,status}`; 202 `PROVISIONING` if no PI yet. **Do not store `client_secret` in the DB.**
5. Worker (below) creates the PI with metadata `{tenantId, bookingId, transactionId}`, `capture_method:'manual'`.
**Worker rules:** claim one job with `UPDATE … WHERE id=(SELECT id … WHERE (status='PENDING' AND next_attempt_at<=now()) OR (status='PROCESSING' AND lease_expires_at<now()) ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, COMMIT, release, *then* call Stripe. Heartbeat every lease/3 `WHERE id=$1 AND locked_by=$2`. Every result write is `WHERE id=$1 AND locked_by=$2 AND status='PROCESSING'`; 0 rows ⇒ lease lost, do nothing. Success ⇒ save PI id (never overwrite a state a webhook already advanced), outbox COMPLETED (*means "PI created", not "money authorized"*). Definitive decline (4xx/card error) ⇒ payment FAILED + booking CANCELLED with reason + outbox FAILED. Timeout/5xx ⇒ exponential backoff, **same key and identical parameters** (Stripe cannot look up by key); exhausted ⇒ `REQUIRES_RECONCILIATION`, nothing cancelled. Start after listen in `server.ts`, stop on SIGTERM, flag `OUTBOX_WORKER_ENABLED`.
**Contract change:** Flutter/Android currently expect 201 + `clientSecret` in the create response (`bookings.routes.ts` ~L219). Mobile must change with the server (decision D1; lighter alternative: keep synchronous create but *outside* the transaction with the same stable key + a reconciler).
**Proof:** test helper wraps `pool.connect()` to track open transactions; the Stripe mock throws if called while any client is mid-transaction. Add tests for success, decline, timeout+retry same key, duplicate, already-captured/canceled, worker crash, stale lease, two workers, heartbeat.

### 02. Webhook blocked by tenant resolver
**Where [V]:** `middleware/tenant.ts` exempts only `/health`, `/docs`, `/api/v1/installer` (via `startsWith`). Webhook (`POST /api/v1/finances/webhooks/stripe`) sends no tenant header/JWT; with >1 active tenant the resolver returns 400 `TENANT_IDENTIFIER_REQUIRED`.
**Solution:** exempt the **exact** method+path (strip query string): `request.method==='POST' && new URL(request.url,'http://x').pathname==='/api/v1/finances/webhooks/stripe'`. Do **not** exempt `/api/v1/finances` by prefix. The handler verifies the signature first, then resolves tenant from the DB row (and verified `metadata.tenantId`), rejects metadata/row tenant mismatch.
**Proof:** mounted-app test: no tenant header + bad signature ⇒ 400 signature error (not tenant error); other finance routes still require tenant; query-string variant exempt; sibling path not exempt.

### 03. Premature webhook event claim
**Where [V]:** `finances.routes.ts` claim INSERT L85; when no `payment_transactions` row matches, execution falls through to COMMIT + 200 (L244). Stripe never retries; payment stays uncaptured locally.
**Solution:** order = verify signature → parse → BEGIN → resolve+lock transaction → process → claim event (or claim first but ROLLBACK on any missing data) → COMMIT. Resolution: by `stripe_payment_intent_id`; else by verified `metadata.transactionId` (strict UUID) where PI is NULL **and** tenant matches; both keys hitting different rows ⇒ quarantine + **409**. No local row ⇒ ROLLBACK, **503** (Stripe retries; also covers "webhook before worker saved the PI id"). Validate amount, currency, tenant, tx/invoice consistency; mismatch ⇒ `DISCREPANCY_QUARANTINED`. Never downgrade a terminal state: transitions use `WHERE status IN (allowed_from)` and check `rowCount`.
**Proof:** missing tx ⇒ 503 and no `webhook_events` row; duplicate event ⇒ 200 idempotent; divergence ⇒ 409; webhook-before-worker; amount/currency mismatch.

### 04. Payout timeout → FAILED → double pay
**Where [V]:** any Stripe error (timeouts included) runs `UPDATE provider_payouts SET status='FAILED'` (~L905–930); balance SQL (~L861) excludes FAILED, so funds are released while Stripe may have executed the transfer.
**Solution:** keep Phase-1 reservation (`PROCESSING`, deducted from balance) and Phase-2 outside tx. Classify errors: connection/timeout/5xx/429 ⇒ `PENDING_PROVIDER_CONFIRMATION` (still deducted), return **202**; definitive rejections (invalid request/destination/permission) ⇒ FAILED. Reconcile endpoint/job: if `stripe_transfer_id` set ⇒ `transfers.retrieve`; else retry create with the same persisted key and original params; mark FAILED only on definitive error. Balance = earned − Σ(`amount_cents − amount_reversed_cents`) over PAID/PROCESSING/PENDING_PROVIDER_CONFIRMATION. Payout ledger insert gets idempotent conflict handling.
**Proof:** timeout ⇒ status retained and balance still reduced; replay with same key ⇒ no second transfer; definitive decline ⇒ FAILED and balance freed.

### 05. Code references columns/status that don't exist
**Where [V vs migrations 001–009]:** `payment_transactions` has no `updated_at`, `currency`, `error_message` (005/007), yet webhook uses them (L114 `pt.currency`, L136 `error_message`, L144/197/207/217 `updated_at`). Status `DISCREPANCY_QUARANTINED` is not in the 007 CHECK (PENDING, REQUIRES_CAPTURE, SUCCEEDED, FAILED, REFUNDED, VOIDED). `provider_payouts` has no `updated_at` (005/007/008/009), yet L785, L798, L1054, L1066 and webhook L227/L237 set it.
**Impact (expected):** those queries error → rollback → 500 → Stripe retries; payout recovery/reconcile and `transfer.reversed`/`payout.failed` handlers fail.
**Solution:** Migration 010 adds the columns/triggers (`updated_at` + `set_updated_at_timestamp()`, `currency`, `error_message`) and extends the status CHECKs (see §5). Look up CHECK names in `pg_constraint`; don't hard-code the auto-generated payout one.
**Proof:** **Phase 0** — a PostGIS CI job applies 001–009 and runs every route's SQL ("schema-contract test"); these must fail first, then pass after 010.

### 06. PIN success violates NOT NULL
**Where [V]:** `bookings.customer_safety_pin VARCHAR(4) NOT NULL` (004), no later ALTER; verify-arrival success does `SET customer_safety_pin = NULL` (L666).
**Impact (expected):** error 23502 → technician can never complete arrival verification.
**Solution:** Migration 010 `ALTER COLUMN customer_safety_pin DROP NOT NULL` + CHECK (`IS NULL OR ~ '^[0-9]{4}$'`).
**Proof:** live-DB test of correct-PIN path.

### 07. `ON CONFLICT` on partial unique indexes
**Where [V]:** indexes in 009 are partial (`WHERE transaction_id IS NOT NULL`, `WHERE payout_id IS NOT NULL`); code uses `ON CONFLICT (transaction_id, posting_type)` / `(payout_id, posting_type)` (bookings L898/914; finances L176/185/819/1088) without repeating the predicate → Postgres 42P10.
**Solution:** in 010, after a duplicate check, replace with **full** unique indexes on `(transaction_id, posting_type)` and `(payout_id, posting_type)` (NULLs never conflict, so meaning is unchanged). Keep posting types static and ≤ 50 chars.
**Proof:** live-DB duplicate-posting test.

### 08. Ledger never credits Customer Escrow (2010)
**Where [V]:** seeded accounts (`installer.routes.ts` L151–156): 1010 Operating Cash Clearing, 1020 Stripe Holding Escrow Clearing, 2010 Customer Escrow Deposits Liability, 2020 Technician Unpaid Payables, 4010 Platform Commission Revenue, 5010 Stripe Processing Expense. Completion/webhook only *debit* 2010 (→2020 and →4010); nothing credits 2010 or debits an asset at capture, so 2010 goes negative.
**Corrected lifecycle** (`capture_method:'manual'`: authorization ends in `requires_capture`; `payment_intent.succeeded` fires only after capture):

| Stage | Trigger | Ledger (exactly once) |
|---|---|---|
| Authorization | `amount_capturable_updated` / PI `requires_capture` | none (tx → REQUIRES_CAPTURE, invoice → AUTHORIZED; never downgrade SUCCEEDED) |
| Capture | `payment_intent.succeeded` or completion Phase 3 (whichever first) | `ESCROW_CAPTURE` Dr 1020 / Cr 2010 |
| Completion (booking COMPLETED) | `/complete` Phase 3 | `PLATFORM_FEE` Dr 2010 / Cr 4010; `TECH_PAYABLE` Dr 2010 / Cr 2020 (fee + payable = captured total) |
| Payout | payout Phase 3 | `PAYOUT_DISBURSAL` Dr 2020 / Cr 1010 (existing) |
| Reversal delta | `transfer.reversed` | `PAYOUT_REVERSAL` Dr 1010 / Cr 2020 (mirror of payout), positive delta only |

Webhook must not post fee/payable unless the booking is COMPLETED (it currently posts them unconditionally). Completion Phase 3 must be re-runnable if capture succeeded but Phase 3 failed (capture already returns "already captured" → handled).
**Proof:** DB test: debits = credits; account 2010 nets to 0 after capture+completion; 2020 nets to earned − paid + reversed.

---

## 2. P1 — High

### 09. `payout.failed` uses wrong identifier
**[V]** handler runs `WHERE stripe_transfer_id = <payout.id>`; Payout ids are `po_…`, Transfer ids `tr_…` → zero rows. `payout.failed` is a *connected-account* event (`event.account` set; needs a Connect webhook endpoint/secret).
**Solution:** don't touch `provider_payouts.stripe_transfer_id` for it. For events with `event.account`, find the provider by `stripe_connect_account_id`, write an audit log + admin alert; transfer-level state comes from API results and `transfer.*` events. Store the correct object id per event type if a payout-level table is later needed (decision D4).
**Proof:** event with `po_…` does not alter transfer-based payout rows; creates audit/alert.

### 10. `transfer.reversed` incomplete
**[V]** sets `REVERSED` only (~L222–232); no ledger, no cumulative tracking, `updated_at` column missing (issue 05).
**Solution:** in one transaction: lock payout row; `cum = transfer.amount_reversed` (Stripe's value is cumulative); `cum < stored` or `cum > amount_cents` ⇒ reject/quarantine; `cum == stored` ⇒ duplicate, 200; else `delta = cum − stored`; insert `provider_payout_reversals` (unique `stripe_event_id`), post `PAYOUT_REVERSAL` Dr 1010 / Cr 2020 for `delta`, set `amount_reversed_cents = cum`, status `PARTIALLY_REVERSED`/`REVERSED`. 200 only after COMMIT; unknown payout ⇒ 503. Reversed amount returns to the provider's available balance.
**Proof:** full, partial, duplicate, stale/out-of-order, over-total, negative.

### 11. Proxy trust and rate-limit bypass
**[V]** `app.ts` has no `trustProxy`; `plugins/security.ts:62 allowList:['127.0.0.1']`. Behind a local reverse proxy every client appears as 127.0.0.1 ⇒ allow-listed ⇒ rate limits bypassed.
**Solution:** env `TRUST_PROXY` = `false` (default) | integer hop count | comma list of IP/CIDR, validated by zod, passed to Fastify `trustProxy`. Remove the allow-list. With `trustProxy` off, `request.ip` is the socket address and `X-Forwarded-For` can't spoof it.
**Proof:** direct request with forged `X-Forwarded-For` keeps one bucket; request via trusted proxy uses forwarded IP; loopback is limited.

### 12. In-memory PIN lockout
**[V]** `pinAttemptStore` L11, used L641–664. Route is `POST /:id/verify-arrival` (L565).
**Solution (PostgreSQL, not Redis — Redis isn't wired in the server and can't commit atomically with the booking row):** add `safety_pin_failed_attempts`, `safety_pin_locked_until`, `safety_pin_last_failed_at` (010). In the existing `FOR UPDATE` tx: keep authorization and the valid-pre-arrival-status check; if `locked_until > now` ⇒ 429; wrong PIN ⇒ reset count if the last failure is outside the window, increment, at 5 set `locked_until = now()+15 min`, **COMMIT the counter update** (today's ROLLBACK would discard it), return 400; success ⇒ clear PIN, reset counters, `ON_SITE`, timeline event. Compare with `crypto.timingSafeEqual`.
**Proof:** state validation, lockout at 5, expiry reset, success reset, survives restart (new app instance).

### 13. Default `APP_ENCRYPTION_KEY`
**[V]** `env.ts:37` default `0123…cdef` is valid 64-hex; `INSECURE_DEFAULTS` (L9–15) lacks it, so the L93–96 production check passes.
**Solution:** add the default to the blocklist and keep the format check; also block known JWT/refresh/bootstrap defaults (already present — keep). Refactor into a pure `validateEnv(rawEnv)` so startup failure is testable.
**Proof:** `validateEnv({NODE_ENV:'production', APP_ENCRYPTION_KEY:<default>})` throws; valid random key passes.

### 14. Admin login throttle only client-side
**[V]** `admin_web/src/security/rateLimiter.ts` uses `localStorage`; but `auth.routes.ts` already keeps server-side `failed_login_attempts`/`locked_until` per user (L243–261), so this is partly mitigated. Missing: per-IP, distributed enforcement.
**Solution:** keep the browser limiter as UX only. Add Fastify per-IP (+ per-email hash) limits on login/refresh/MFA; shared across replicas via a small PostgreSQL `rate_limit_hits` table or Redis (decision D5).
**Proof:** repeated failures across two app instances hit the same limit.

---

## 3. P2 — Medium

### 15. Flutter `GoRouter` unmounted [V]
`serviceos/lib/app.dart:79` builds `MaterialApp`; no `routerConfig`. **Solution:** `MaterialApp.router` with `app_router.dart`, keeping theme and auth redirects; verify deep links and Android back stack; add navigation widget tests. *Needs the Flutter SDK (not installed here).*

### 16. AdminContext mock/localStorage hydration in production [V]
~20 `localStorage.getItem('servicepro_*')` reads for bookings, invoices, tickets, services etc. plus a `mockData` import (`AdminContext.tsx`). **Solution:** under `import.meta.env.PROD` skip hydration and mocks; start `loading` → `empty`/`error`; fetch from Fastify; demo fixtures only behind `VITE_DEMO_MODE`; verify the production bundle excludes mockData. **Proof:** production-mode render test shows no mock rows.

### 17. CI gaps [V]
`ci.yml`: `npm audit … || true` (L159, L164); Docker job only `docker compose config --quiet` (L131); no Flutter/Android job; no job applying migrations. **Solution:** remove `|| true` (documented allow-list if needed); `docker build` server + admin images; PostGIS service job applying 001–010 and running DB-backed tests; Flutter `analyze/test/build`; Android Gradle job for `serviceos_android/`.

### 18. Supabase/Fastify dual path [R — inspect first]
**Solution:** Fastify is the only writer of financial/operational data; Supabase paths demo-only or removed; no direct client writes to financial tables.

### 19. Refresh-cookie CSRF [R — inspect first]
**Solution:** validate `Origin`/`Referer` against the allow-list on cookie-authenticated state-changing routes (refresh, logout), keep `SameSite`, `HttpOnly`, `Secure` in production; test cross-origin refresh is rejected.

### 20. Webhook signature optional outside production; dead `staging` branch [V]
Signature is verified only if `STRIPE_WEBHOOK_SECRET` is set; otherwise non-production accepts forged events. `confirm-payment` checks `NODE_ENV === 'staging'` but the env enum is `development|production|test`. **Solution:** require the webhook secret whenever `STRIPE_SECRET_KEY` is set in any environment; remove or add `staging` to the enum consistently.

### 21. Dead status `TRANSFER_CONFIRMED` [V]
In balance SQL (L861) but absent from every CHECK. **Solution:** remove from the query.

### 22. Per-request tenant lookup [R]
**Solution:** short TTL in-memory cache keyed by tenant/slug/host with invalidation on tenant update.

### 23. Tests are static [V]
**Solution:** keep existing tests, but add: PostGIS schema-contract tests; migration up/down with historical rows; route-injection + Stripe-mock tests (timeout, success, duplicate, 402 decline, already-captured/canceled); signed-webhook tests (`generateTestHeaderString`); worker lease tests; ledger-balance tests. Replace scattered `new Stripe(...)` with one injectable `getStripe()`. No placeholder assertions.

---

## 4. P3 / P4

Unused imports and lint warnings (oxlint 527 warnings, 0 errors [R]); `setState` in effects in `LoginPage.tsx` [R]; hardcoded emulator host `10.0.2.2` in mobile clients (make configurable per build flavor) [R]; add error monitoring (e.g. Sentry) on server and admin [R]; remove dead routing/data code; responsive ledger tables and Night Vision badge contrast [R]; Fastify `disableRequestLogging` deprecation (FSTDEP023) [V from test output]; hardcoded fallback DB connection string in `database/pool.ts` [R]; admin token-refresh request queueing [R]. Fix after P0–P2 are green.

---

## 5. Migration 010 (one forward transaction; validate on PostgreSQL before use)

**Up:**
1. `payment_transactions`: add `updated_at` (+ trigger), `currency VARCHAR(3) NOT NULL DEFAULT 'USD'`, `error_message TEXT`; `DROP NOT NULL` on `stripe_payment_intent_id`; extend status CHECK with `DISCREPANCY_QUARANTINED`; partial unique index on `stripe_payment_intent_id WHERE NOT NULL` (verify no duplicates first).
2. `provider_payouts`: add `updated_at` (+ trigger), `amount_reversed_cents BIGINT NOT NULL DEFAULT 0`, `last_reconciled_at`, `reconcile_attempts`; extend status CHECK with `PENDING_PROVIDER_CONFIRMATION`, `PARTIALLY_REVERSED`, `REVERSED`; CHECK `0 <= amount_reversed_cents <= amount_cents`.
3. `provider_payout_reversals(id, tenant_id, payout_id, stripe_event_id UNIQUE, stripe_reversal_id, delta_amount_cents > 0, cumulative_reversed_cents, created_at)` with `ON DELETE RESTRICT` FKs.
4. `bookings`: `DROP NOT NULL` on `customer_safety_pin` (+ 4-digit CHECK); add the three PIN-lock columns.
5. `outbox_operations` (tenant_id, aggregate_type/id, operation_type, payload JSONB, `idempotency_key UNIQUE`, status CHECK, attempts, max_attempts, `next_attempt_at`, `locked_by`, `lease_expires_at`, last_error, timestamps) + partial index on claimable rows.
6. Ledger: replace the two partial unique indexes with full unique indexes (after duplicate check).
7. Every new constraint is preceded by a `DO` block validating existing data and aborting with a clear message.

**Down:** abort with `RAISE EXCEPTION` if any of these exist: outbox rows, reversal rows, `amount_reversed_cents > 0`, rows using a new status, payments with NULL PI, bookings with NULL PIN or non-zero attempts. Otherwise restore the exact prior constraints (007 payment statuses; 005 payout statuses) and drop added objects. No financial audit data is ever dropped silently.

**Migration test (PostGIS in CI):** apply 001→009 → seed historical payments/payouts/ledger → 010 up → assertions → down aborts when guarded data exists → remove it → down passes → up again.

---

## 6. Execution order and gates

| Phase | Work | Gate (evidence required) |
|---|---|---|
| 0 | Branch `fix/remediation-phased-execution`; PostGIS CI job + schema-contract tests; reproduce 05/06/07 | failing tests recorded |
| 1 | Migration 010 + migration tests | up→guard→down→up on PostgreSQL |
| 2 | Issues 02, 11, 13, 20 (exact webhook exemption, trustProxy, env blocklist, signature requirement) | route + spoof + `validateEnv` tests |
| 3 | Webhook rewrite (03, 05, 07, 08, 09) | missing-tx 503, duplicate, divergence, mismatch, ledger-balance tests |
| 4 | confirm-payment + cancel 3-phase (01) | Stripe mock sees no open tx |
| 5 | Outbox, worker, booking 202, payment-intent GET, mobile update (01) | lease/crash/two-worker/timeout/decline tests |
| 6 | Payout state machine + reconcile + balance (04, 21) | timeout/replay/balance tests |
| 7 | Reversals (10) | full/partial/duplicate/stale tests |
| 8 | PIN persistence (06, 12) | lockout/expiry/success tests |
| 9 | Admin, Flutter, CI, 14–19, 22–24 | clean prod admin build; CI green incl. Docker build |
| 10 | Full regression + post-remediation audit | `npm --prefix server test`, `tsc --noEmit`, admin lint+build, migration job, `docker build` ×2, `flutter analyze/test` — all with real output |

**Exit criteria:** no external call inside an open tx (test-enforced) · no P0/P1 left · every invariant covered by an executed DB/route/mock test · migration up/down proven with historical rows · server + admin build clean · CI green · rollback/deploy notes written.

---

## 7. Decisions needed from you
- **D1** Booking create 201→202 + client-secret GET (mobile must ship together) **or** keep synchronous create outside the transaction with stable key + reconciler (smaller change)?
- **D2** Worker in the API process or a separate process?
- **D3** Refund accounting after completion (commission, technician clawback) — no refund ledger entries exist today.
- **D4** Do you use Stripe Connect webhooks (separate endpoint/secret) for connected-account `payout.*` events?
- **D5** Shared rate-limit store: PostgreSQL table or Redis?

## 8. Corrections to earlier documents (this file supersedes them)
- `payment_intent.succeeded` is the capture event, not the authorization/escrow-hold event.
- Reversal posting is Dr 1010 / Cr 2020, not the reverse.
- The PIN route is `/:id/verify-arrival`, not `/verify-pin`.
- Migrations 001–009 are **not** "sound": see issues 05–07.
- Old audit §21 test breakdown (7 and 4 tests) was wrong; the real run is 13 and 6 = 68.
- The Android client directory is `serviceos_android/`.
- Booking status `PAYMENT_FAILED` does not exist (allowed: REQUESTED, BROADCASTING, ASSIGNED, EN_ROUTE, ON_SITE, COMPLETED, CANCELLED, DISPUTED); failures use `CANCELLED` + reason.

---

## 9. Remediation Implementation & Verification Ledger (`fix/remediation-phased-execution`)

### 9.1 Implemented Artifacts
- **Migration 010:** `server/src/database/migrations/010_remediation_core_invariants.sql` & `.down.sql` — adds `updated_at` triggers, `currency`, `error_message`, nullable `stripe_payment_intent_id` + partial unique index on `payment_transactions`, `DISCREPANCY_QUARANTINED` check status, widens `provider_payouts.status` (`VARCHAR(40)`), adds `amount_reversed_cents` + `PENDING_PROVIDER_CONFIRMATION` + `PARTIALLY_REVERSED` + `REVERSED`, creates `provider_payout_reversals`, creates `outbox_operations`, makes `bookings.customer_safety_pin` nullable (`NULL` or 4-digit check), adds persistent PIN lockout columns, replaces partial ledger unique indexes with full unique indexes for `ON CONFLICT`, and enforces non-destructive `RAISE EXCEPTION` guards on rollback.
- **Stripe Injectable Client & Outbox Worker:** `server/src/services/stripeClient.ts` (`getStripe`, `hasStripeConfigured`, `setStripeForTest`, `isDefinitiveStripeError`), `server/src/workers/outbox.worker.ts` (`OutboxWorker` with single-job `FOR UPDATE SKIP LOCKED`, active lease heartbeat every `leaseMs / 3`, strict `WHERE id = $1 AND locked_by = $2` owner verification, same-key timeout retry + `REQUIRES_RECONCILIATION`, hard-decline cancellation), wired into `server/src/index.ts`.
- **Bookings & Safety PIN (`server/src/modules/bookings/bookings.routes.ts`):** Removed in-memory `pinAttemptStore`; converted `POST /` to durable reservation + outbox returning HTTP `202` `PENDING_PAYMENT`; added authenticated `GET /:id/payment-intent`; refactored `POST /:id/confirm-payment` and `POST /:id/cancel` into 3-phase execution (zero Stripe I/O inside SQL transactions); added `ESCROW_CAPTURE` (`Dr 1020 / Cr 2010`) in completion & confirmation; moved safety-PIN failure counters & 15-minute lockout into PostgreSQL `bookings` with committed failure counts and constant-time compare.
- **Finances, Webhooks & Reversals (`server/src/modules/finances/finances.routes.ts`):** Sequential dual-key webhook correlation (PI ID -> UUID metadata where PI IS NULL -> `409` on divergence); rollback + `503` on missing target rows (no premature claim); separate authorization (`payment_intent.amount_capturable_updated`) vs capture (`payment_intent.succeeded` `ESCROW_CAPTURE`, plus fee/payable only if booking `COMPLETED`); cumulative monotonic `transfer.reversed` delta engine with `provider_payout_reversals` and `Dr 1010 / Cr 2020` mirror posting; `payout.failed` `po_` vs `tr_` separation; 3-phase `POST /payouts` crash recovery & `POST /payouts/:id/reconcile`; `PENDING_PROVIDER_CONFIRMATION` balance reservation.
- **Security & Auth (`server/src/config/env.ts`, `app.ts`, `plugins/security.ts`, `middleware/tenant.ts`, `modules/auth/auth.routes.ts`):** Added default `APP_ENCRYPTION_KEY` to `INSECURE_DEFAULTS`; added `TRUST_PROXY` validation & Fastify `trustProxy`; removed `127.0.0.1` rate-limit allow-list; attached status `403` to CORS rejection; exact method+path+query-stripped webhook exemption in `tenantResolver`; CSRF `Origin`/`Referer` allowlist validation on cookie `/auth/refresh` and `/auth/logout`.
- **Admin Web, Mobile & CI:** Removed production `localStorage` and mock-fixture fallback hydration in `admin_web/src/context/AdminContext.tsx`; mounted declarative `AppRouter.createRouter` in `serviceos/lib/app.dart` & `serviceos/lib/core/routing/app_router.dart`; added `fetchBookingPaymentIntent` to `serviceos/lib/core/network/api_client.dart` and `serviceos_android/.../ApiClient.kt`; hardened `.github/workflows/ci.yml` (`db:migrate`, `TEST_DATABASE_URL`, `docker compose build`, removed `|| true` audit masks).
- **Real PostgreSQL & Fastify Test Suites:** `server/tests/helpers/db.ts`, `server/tests/db/schema_contract_baseline.test.ts` (6 tests), `server/tests/db/migration_010.test.ts` (5 tests), and `server/tests/db/remediation_full_integration.test.ts` (9 integration tests enforcing zero Stripe calls inside active transactions).

### 9.2 Verified Command Outputs
- `cd server && npx tsc --noEmit` → exit code `0` (0 errors).
- `cd server && NODE_ENV=test npm test` → **88 tests across 16 suites: 88 passed, 0 failed, 0 skipped**.
- `cd admin_web && npm run lint && npm run build` → `oxlint`: 0 errors (517 pre-existing warnings); `tsc -b && vite build`: exit code `0` (`dist/assets/index-*.js`).
