# ServicePro OS — Buyer Turnkey Deployment & Installation Guide

> **Target Environment**: Docker Compose / Ubuntu 22.04+ / Cloud VPS (AWS, GCP, DigitalOcean, Hetzner)  
> **Prerequisites**: Docker Engine 24+, Docker Compose v2.20+, Domain Name with DNS access  
> **Estimated Deployment Time**: Under 10 minutes  

---

## 1. Quick Start: Turnkey Docker Deployment

The fastest way to launch ServicePro OS in production is using the bundled `docker-compose.yml`.

### Step 1: Clone or Extract Repository

```bash
cd /opt/servicepro
```

### Step 2: Configure Environment Variables

Generate cryptographically secure production secrets using the bundled utility:

```bash
node scripts/generate_secrets.cjs
```

Copy the provided production template and populate your generated keys:

```bash
cp .env.example .env
nano .env
```

Ensure the following variables are configured with your generated production secrets:
- `POSTGRES_PASSWORD`: Strong random string for database access.
- `JWT_SECRET`: Random 32+ character hex string for signing access tokens.
- `JWT_REFRESH_SECRET`: Random 32+ character hex string for refresh tokens.
- `BOOTSTRAP_TOKEN`: One-time setup secret key used during the initial web installer wizard.
- `APP_ENCRYPTION_KEY`: 32-byte (64 hex characters) AES-256-GCM data encryption key.

> **Security Note**: In production, PostgreSQL and Redis host ports (5432, 6379) are kept closed by default to prevent external exposure; services communicate exclusively over the private `servicepro_network` bridge. For local database GUI debugging, launch with the development override: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`.

### Step 3: Launch Containers

```bash
docker compose up -d --build
```

Verify that all 4 containers are healthy:
```bash
docker compose ps
```
You will see:
- `servicepro_postgres` (PostGIS 16 / Port 5432) — Healthy
- `servicepro_redis` (Redis 7 / Port 6379) — Healthy
- `servicepro_backend` (Fastify 5 API / Port 3000) — Healthy
- `servicepro_frontend` (React 19 Nginx / Port 80) — Up

---

## 2. First-Time Setup Wizard (`/installer`)

Once the containers are running, navigate to:

```
http://your-server-ip/installer
```
*(or `http://localhost/installer` if running locally)*

The automated Turnkey Setup Wizard will guide you through:
1. **Database Verification**: Validates PostgreSQL and PostGIS connectivity and applies database migrations.
2. **Tenant Configuration**: Sets your primary business name, subdomain slug, currency code (`USD`, `EUR`, `GBP`), and platform commission basis points (`1500` = 15%).
3. **Master Admin Account Creation**: Creates your primary administrative credentials (Email & Password).
4. **Initial Ledger Chart of Accounts**: Seeds the standard double-entry general ledger accounts (Assets, Liabilities, Revenue, Equity).
5. **Permanent Security Lock**: The `/installer` route permanently seals itself once completed. Further provisioning attempts are rejected.

---

## 3. Production Domain & SSL (Let's Encrypt Nginx Reverse Proxy)

For public production hosting, place an SSL reverse proxy in front of the application:

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

## 4. Mobile Apps Compilation & Distribution

### Flutter Mobile App (`serviceos/`)

```bash
cd serviceos

# Install Flutter dependencies
flutter pub get

# Build Android APK
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1

# Build Android App Bundle for Google Play Store
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1

# Build iOS Archive for Apple App Store
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1
```

### Native Android Jetpack Compose (`serviceos_android/`)

Open `serviceos_android` in **Android Studio Hedgehog / Iguana / Jellyfish**:
1. Configure `baseUrl` in `ApiClient.kt` to `https://api.yourdomain.com/api/v1`.
2. Select **Build > Generate Signed Bundle / APK**.
3. Select your release keystore and export the signed release `.aab`.

---

## 5. Maintenance & Backup Runbook

### Automated PostgreSQL Backup Cron

```bash
# Add to crontab for daily 02:00 UTC backups:
0 2 * * * docker exec servicepro_postgres pg_dump -U servicepro_admin servicepro | gzip > /backups/servicepro_$(date +\%F).sql.gz
```

### Manual Database Migration Check

```bash
cd /opt/servicepro/server
npm run db:verify
```
