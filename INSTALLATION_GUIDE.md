# ServicePro OS — Buyer Turnkey Deployment & Installation Guide

> **Target Environment**: Docker Compose / Ubuntu 22.04+ / Cloud VPS (AWS, GCP, DigitalOcean, Hetzner)  
> **Prerequisites**: Docker Engine 24+, Docker Compose v2.20+, Node.js 22+ (for local CLI tools), Domain Name with DNS access  
> **Estimated Deployment Time**: Under 10 minutes  

---

## 1. Quick Start: Turnkey Docker Deployment

The fastest way to launch ServicePro OS in production or in the isolated Buyer Demo Sandbox is using the bundled `docker-compose.yml`.

### Step 1: Clone or Extract Repository

```bash
cd /opt/servicepro
```

### Step 2: Generate Cryptographic Secrets & Configure `.env`

Generate cryptographically secure, URL-safe production secrets using the bundled utility:

```bash
node scripts/generate_secrets.cjs
```

Copy the provided production template and populate your generated keys:

```bash
cp .env.example .env
nano .env
```

Ensure the following variables are configured with your generated production secrets (the backend refuses to start in `NODE_ENV=production` if any default placeholder from `.env.example` is left unchanged):
- `POSTGRES_PASSWORD`: High-entropy URL-safe password for PostgreSQL.
- `JWT_SECRET`: Random 32-byte (64 hex character) secret for signing access tokens.
- `JWT_REFRESH_SECRET`: Random 32-byte (64 hex character) secret for refresh tokens.
- `BOOTSTRAP_TOKEN`: One-time setup secret key used during the initial `/installer` wizard.
- `APP_ENCRYPTION_KEY`: 32-byte (64 hex character) AES-256-GCM key for encrypting TOTP MFA secrets and third-party integration credentials (`integration_configs`).

> **Security Note**: In production, PostgreSQL and Redis host ports (`5432`, `6379`) are kept closed to the public internet by default; services communicate exclusively over the private `servicepro_network` bridge. For local database GUI debugging, launch with the development override (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`) to bind `postgres` on `127.0.0.1:5432`, or include `--profile demo` (`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile demo up -d`) to also expose the isolated `postgres_demo` sandbox on `127.0.0.1:5433`.

### Step 3: Launch Containers (Clean Production vs. 2-DB Demo Sandbox)

- **Option A — Clean Production Stack (4 Containers):**
  ```bash
  APP_DEMO_MODE=false VITE_DEMO_MODE=false docker compose up -d --build
  ```
- **Option B — Dual-Database Stack with Isolated Demo Sandbox (`postgres_demo`):**
  ```bash
  docker compose --profile demo up -d --build
  ```

Verify that all containers are healthy:
```bash
docker compose ps
```
You will see:
- `postgres` (PostgreSQL 16 + PostGIS 3.4) — Healthy
- `postgres_demo` (Optional isolated Demo Sandbox PostgreSQL 16 + PostGIS 3.4 when `--profile demo` is active) — Healthy
- `redis` (Redis 7 Alpine) — Healthy
- `backend` (Fastify 5 API on Port 3000 with `/app/uploads` persistent volume) — Healthy
- `frontend` (React 19 Nginx Reverse Proxy on Port 80) — Up

---

## 2. Database Migration & Seeding Options

All database CLI commands in `server/package.json` automatically work both in local development (`tsx src/database/*.ts`) and inside the compiled production Docker container (`node dist/database/*.js`):

```bash
# 1. Apply all 15 PostgreSQL + PostGIS migrations and verify schema integrity
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:verify

# 2A. Seed Clean Buyer Production Database (ZERO fake users, technicians, or bookings)
docker compose exec \
  -e PROD_TENANT_NAME="Your Company Name" \
  -e PROD_TENANT_SLUG="primary-org" \
  -e PROD_CURRENCY_CODE="AED" \
  -e PROD_TAX_RATE_BPS="500" \
  -e PROD_ADMIN_EMAIL="admin@yourdomain.com" \
  -e PROD_ADMIN_PASSWORD="YourStrongAdminPassword2026!" \
  backend npm run seed:prod

# 2B. OR Seed the Isolated Buyer Demo Sandbox Database (requires APP_DEMO_MODE=true & DEMO_DATABASE_URL)
docker compose exec -e APP_DEMO_MODE=true backend npm run seed:demo
```

---

## 3. First-Time Web Setup Wizard (`/installer`)

Alternatively, on an unprovisioned production database, navigate to:

```
http://your-server-ip/installer
```
*(or `http://localhost/installer` if running locally)*

The automated Turnkey Setup Wizard will guide you through:
1. **Database Verification (`POST /api/v1/installer/test-db`)**: Validates PostgreSQL 16 and PostGIS connectivity.
2. **Tenant & Regional Configuration**: Sets your business name, slug, currency code (`AED`, `USD`, `EUR`, `GBP`, `SAR`), tax rate basis points (`500` = 5% VAT), and platform commission basis points (`1500` = 15%).
3. **Master Admin Account Creation**: Creates your primary administrative credentials (`ADMIN` role).
4. **Initial Double-Entry Chart of Accounts**: Seeds the 5 core general ledger accounts (`1010` Operating Bank, `2010` Customer Escrow Liability, `2020` Technician Payable, `2030` Tax/VAT Payable Liability, `4010` Platform Commission Revenue).
5. **Permanent Security Lock**: The `/installer` route records a cryptographic seal in `installer_provision_logs` and permanently disables further provisioning calls.

---

## 4. Production Domain & SSL (Let's Encrypt Nginx Reverse Proxy)

For public HTTPS production hosting, place an SSL terminator in front of the Docker stack:

```nginx
server {
    server_name portal.yourdomain.com api.yourdomain.com;
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    server_name portal.yourdomain.com;
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    server_name api.yourdomain.com;
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 5. Mobile Apps Compilation & Distribution

Both mobile applications connect exclusively to your Fastify REST API (`/api/v1`) and resolve tenant currency, tax rate, and demo sandbox availability dynamically from `GET /api/v1/system/config`.

### Flutter Mobile App (`serviceos/` — Android & iOS)

```bash
cd serviceos

# Install Flutter dependencies
flutter pub get

# Build Android APK
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1 \
  --dart-define=TENANT_ID=primary-uae

# Build Android App Bundle (.aab) for Google Play Store
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1 \
  --dart-define=TENANT_ID=primary-uae

# Build iOS Archive (.ipa) for Apple App Store
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1 \
  --dart-define=TENANT_ID=primary-uae
```

### Native Android Jetpack Compose (`serviceos_android/`)

Build via Gradle CLI or Android Studio using the environment variables read by `serviceos_android/app/build.gradle.kts` (`ANDROID_API_BASE_URL` plus signing vars `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`):

```bash
cd serviceos_android

ANDROID_API_BASE_URL=https://api.yourdomain.com/api/v1 \
ANDROID_KEYSTORE_PATH=/path/to/release.keystore \
ANDROID_KEYSTORE_PASSWORD=your-store-password \
ANDROID_KEY_ALIAS=serviceos \
ANDROID_KEY_PASSWORD=your-key-password \
./gradlew assembleRelease
```

---

## 6. Release Validation & Dual-Database Switching Runbook

### Switching Between Demo Sandbox & Clean Production Databases

1. **Interactive Buyer Demo Sandbox (`postgres_demo`, Port `5433`)**:
   - Set `APP_DEMO_MODE=true`, `VITE_DEMO_MODE=true`, `DEMO_DATABASE_URL=postgresql://.../servicepro_demo`, and run `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile demo up -d`.
   - Migrate & seed realistic Dubai/UAE showcase data with `docker compose exec -e APP_DEMO_MODE=true backend npm run db:migrate && docker compose exec -e APP_DEMO_MODE=true backend npm run seed:demo`.
2. **Clean Buyer Production (`postgres`, Port `5432`)**:
   - Set `NODE_ENV=production`, `APP_DEMO_MODE=false`, `VITE_DEMO_MODE=false`, and point `DATABASE_URL` to `servicepro`.
   - Migrate & seed cleanly with `npm run db:migrate && npm run seed:prod` (or visit `/installer` for 1-click UI provisioning).

### Pre-Release Verification Suite

```bash
# 1. Validate all 15 SQL migration pairs & RLS coverage
node scripts/validate_migrations.cjs

# 2. Validate Flutter & Android mobile codebases for zero placeholders/mocks
node scripts/validate_dart_codebase.cjs

# 3. Run full 116-test Backend & Real-PostgreSQL integration suite
npm --prefix server test

# 4. Build Admin & Staff Web Portal production bundle
npm --prefix admin_web run build
```

### Automated PostgreSQL Backup Cron

```bash
# Add to crontab for daily 02:00 UTC backups:
0 2 * * * docker compose -f /opt/servicepro/docker-compose.yml exec -T postgres pg_dump -U servicepro_admin servicepro | gzip > /backups/servicepro_$(date +\%F).sql.gz
```
