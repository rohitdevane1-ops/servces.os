# ServicePro OS — UAE Enterprise Home Services & Dispatch Platform

> **Market Edition:** Dubai / UAE Turnkey Acquisition Release (`AED`, **5% UAE VAT**, **English LTR / Arabic RTL**, Dual-Database Demo & Production Architecture)  
> **Stack:** Fastify 5 + TypeScript + PostgreSQL 16/PostGIS + React 19 + Flutter + Native Android Kotlin/Compose

---

## 1. Platform Architecture

1. **Enterprise REST API Backend (`server/`)**: Fastify 5 + TypeScript + PostgreSQL 16 + PostGIS (`16` paired up/down migrations, fail-closed `FORCE ROW LEVEL SECURITY`, durable payment outbox worker, double-entry general ledger with pre-tax Account `2030` VAT/Tax liability accounting, proportional refund reversals, HMAC-signed media uploads, and modular payment gateway adapter supporting **Stripe**, **PayTabs**, and **Telr**).
2. **Admin & Staff Web Control Portal (`admin_web/`)**: React 19 + Vite + TypeScript + Tailwind CSS with **52+ operational screens**, **English (LTR) & Arabic (RTL)** bilingual switcher, live Dubai sandbox banner & one-click demo logins (when `VITE_DEMO_MODE=true`), and Nginx hardened reverse proxy.
3. **Cross-Platform Mobile App (`serviceos/`)**: Flutter (Android & iOS) with `ApiClient` JWT single-flight refresh, AED + 5% UAE VAT checkout, and Day/Night Vision themes.
4. **Native Android App (`serviceos_android/`)**: Kotlin + Jetpack Compose Material 3 with `BuildConfig.API_BASE_URL` HTTPS release enforcement and `EncryptedSharedPreferences`.

---

## 2. Dual-Environment Setup (2 Databases: Production vs. Dubai Demo Sandbox)

This repository uses a **single clean codebase** that can run against **two completely isolated PostgreSQL databases**:

| Mode | Environment Flags | Database | Seeding Command | Behavior |
|---|---|---|---|---|
| **Live Dubai Demo Sandbox** | `APP_DEMO_MODE=true`, `VITE_DEMO_MODE=true` | `DEMO_DATABASE_URL` (`postgres_demo`) | `npm run seed:demo` | Pre-loads **12 AED UAE services**, **10 verified Dubai technicians** (Marina, Downtown, Business Bay, JLT, Al Quoz), and **45 historical bookings** (past 30 days) with 5% VAT invoices & ledger entries. Shows top sandbox banner, enables One-Click Demo Login, and blocks destructive actions (password changes, etc.). |
| **Clean Buyer Production** | `APP_DEMO_MODE=false`, `VITE_DEMO_MODE=false` | `DATABASE_URL` (`postgres`) | `npm run seed:prod` | **ZERO fake users, technicians, or bookings.** Seeds only the buyer's UAE base tenant (`AED`, 5% VAT, `Asia/Dubai`), Chart of Accounts, CMS defaults, and 1 Super Admin account. |

---

## 3. Quick Start & Local Setup

### Step 1: Generate Production-Grade Secrets
```bash
node scripts/generate_secrets.cjs
```
Copy `.env.example` to `.env` and populate your generated keys:
```bash
cp .env.example .env
```

### Step 2: Launch PostgreSQL 16 + PostGIS (Docker)
- **Production Database Only:**
  ```bash
  docker compose up -d --build
  ```
- **Both Production + Separate Demo Sandbox Databases (2-DB Mode):**
  ```bash
  docker compose --profile demo up -d --build
  ```

### Step 3: Run Migrations & Choose Your Seed Command
```bash
# Apply all 16 PostgreSQL + PostGIS migrations
npm run db:migrate
npm run db:verify

# Option A — Populate Separate Dubai Interactive Sandbox DB
npm run seed:demo

# Option B — Clean Production Buyer Handover DB (ZERO demo data)
PROD_ADMIN_EMAIL=admin@yourdomain.ae \
PROD_ADMIN_PASSWORD=StrongProductionPassword2026! \
npm run seed:prod
```

---

## 4. Key Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | Primary Production PostgreSQL 16 + PostGIS URI | `postgresql://.../servicepro` |
| `DEMO_DATABASE_URL` | Optional separate Demo Sandbox PostgreSQL URI | `postgresql://.../servicepro_demo` |
| `APP_DEMO_MODE` | Backend demo mode (`true` enables `/auth/demo-login` & destructive guards) | `false` |
| `VITE_DEMO_MODE` | Frontend demo banner & One-Click Dubai Sandbox Login buttons | `false` |
| `DEFAULT_TAX_RATE_BPS` | Server-side VAT in basis points (`500` = **5.00% UAE VAT**) | `500` |
| `PAYMENT_GATEWAY` | Active UAE payment adapter: `stripe` \| `paytabs` \| `telr` | `stripe` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe UAE API & HMAC webhook keys | — |
| `PAYTABS_PROFILE_ID` / `PAYTABS_SERVER_KEY` / `PAYTABS_REGION` | PayTabs UAE (`ARE`) credentials | `ARE` |
| `TELR_STORE_ID` / `TELR_AUTH_KEY` | Telr UAE credentials | — |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `APP_ENCRYPTION_KEY` | High-entropy secrets (placeholder values rejected in production) | Generate via `scripts/generate_secrets.cjs` |

---

## 5. Verification & Test Commands

```bash
# 1. Validate all 16 SQL Migration Pairs & Mobile Dart/Kotlin Codebases
npm run validate

# 2. Backend TypeScript Compile Check
npm --prefix server run build

# 3. Full Backend Unit & Real-PostgreSQL Integration Suite (120 Tests across 22 Suites)
npm --prefix server test

# 4. Admin & Staff Web Portal Lint & Production Build
npm --prefix admin_web run lint
npm --prefix admin_web run build
```

---

## 6. Deployment & Buyer Handover Guidelines

1. Set `NODE_ENV=production`, `APP_DEMO_MODE=false`, and `VITE_DEMO_MODE=false`.
2. Generate unique secrets with `node scripts/generate_secrets.cjs` (never reuse `.env.example` placeholders — the server fails closed on startup if detected).
3. Configure your UAE payment gateway (`PAYMENT_GATEWAY=stripe`, `paytabs`, or `telr`) and TLS reverse proxy in front of `admin_web` (port 80) and `server` (port 3000).
4. Run `npm run db:migrate && npm run seed:prod` for a completely clean buyer database with zero demo artifacts.
