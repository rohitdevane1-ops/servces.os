# ServicePro OS — REST API & Integration Specification

> **Base URL**: `https://api.yourdomain.com/api/v1`  
> **Health Probes**: `GET /health` and `GET /api/v1/health`  
> **Interactive OpenAPI / Swagger UI**: `https://api.yourdomain.com/docs` (in non-production or authenticated environments)  
> **Envelope Standard**: Unified `ApiResponse<T>` with RFC 3339 timestamps and unique request tracing IDs  

---

## 1. Standard Response Envelope

Every endpoint returns a standardized JSON response envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "timestamp": "2026-11-21T12:00:00.000Z",
    "requestId": "req_1732190400000",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalRecords": 142,
      "totalPages": 8
    }
  }
}
```

On error, HTTP status codes align with standard REST semantics (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `502`, `503`):

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "SCHEMA_VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "latitude", "issue": "Number must be less than or equal to 90" }
    ]
  },
  "meta": {
    "timestamp": "2026-11-21T12:00:00.000Z",
    "requestId": "req_1732190400000"
  }
}
```

---

## 2. Authentication & Tenant Resolution Headers

For authenticated requests, supply the Bearer JWT access token. The tenant is automatically resolved from the authenticated user's JWT claim (`tenantId`), or from `x-tenant-id` (UUID or slug) for public routes:

```http
Authorization: Bearer <jwt_access_token>
x-tenant-id: primary-uae
Content-Type: application/json
```

> **Cross-Tenant Spoofing Protection**: If both `Authorization` and `x-tenant-id` are supplied and refer to different tenants, the API immediately rejects the request with `HTTP 403 TENANT_MISMATCH`.

---

## 3. Complete API Endpoint Catalog

### System & Tenant Configuration (`/api/v1/system`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/config` | Public regional config (`currencyCode`, `taxRateBps`, `taxName`, `demoMode`, `defaultLocale`, `paymentGateway`, `supportPhone`, `logoUrl`, `publicSettings`) | Public |
| `PUT` | `/config` & `/settings` | Update tenant regional, tax, commission, branding, pricing tiers (`pricingConfig`), & contact settings | Admin (Blocked in Demo Mode) |
| `GET` | `/integrations` | Retrieve masked status of configured payment/SMS/email/push integrations | Admin |
| `PUT` | `/integrations` | Encrypt (AES-256-GCM) and save third-party integration credentials | Admin (Blocked in Demo Mode) |
| `GET` | `/audit-logs` | Paginated security and administrative audit trail | Admin |

### Signed Media Uploads (`/api/v1/uploads`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Upload PNG/JPEG/WEBP/PDF file (magic-byte validated) and receive HMAC-signed URL | Authenticated |
| `GET` | `/:tenantId/:filename` | Stream uploaded media after verifying `exp` and HMAC-SHA256 `sig` query params | Public (Signed URL) |

### Authentication, MFA & Password Recovery (`/api/v1/auth`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Register new `CUSTOMER` or `TECHNICIAN` account with profile row | Public |
| `POST` | `/login` | Authenticate user with email & password (returns tokens or `mfaRequired` challenge) | Public |
| `POST` | `/demo-login` | Instant role login (`ADMIN`, `STAFF`, `TECHNICIAN`, `CUSTOMER`) when `APP_DEMO_MODE=true` | Public (Demo Mode Only) |
| `POST` | `/refresh` | Rotate expired access token using refresh token | Public |
| `POST` | `/mfa/verify` | Validate 6-digit TOTP or 80-bit emergency recovery code against MFA challenge token | Public |
| `POST` | `/mfa/setup` | Generate encrypted pending TOTP secret & `otpauth://` URI | Authenticated |
| `POST` | `/mfa/confirm` | Confirm pending TOTP code, activate MFA, and issue 8 one-time recovery codes | Authenticated |
| `POST` | `/mfa/disable` | Disable MFA after verifying password + current TOTP/backup code | Authenticated (Blocked in Demo Mode) |
| `POST` | `/reauthenticate` | Verify current password for session unlock (`SessionLockModal`) & restore access token | Authenticated / Refresh Cookie |
| `POST` | `/lock` | Mark active session locked server-side (`user_sessions.locked_at`) and require `reauthenticate` | Authenticated |
| `POST` | `/change-password` | Verify current password, update hash, and revoke other sessions | Authenticated (Blocked in Demo Mode) |
| `POST` | `/forgot-password` | Generate SHA-256 password reset token (anti-enumeration 200 response) | Public |
| `POST` | `/reset-password` | Consume one-time reset token, update password, and revoke all user sessions | Public (Blocked in Demo Mode) |
| `POST` | `/logout` | Revoke active refresh session | Authenticated |
| `GET` | `/me` | Get authenticated user identity, profile, and tenant metadata | Authenticated |
| `PUT` | `/me` | Update authenticated user profile fields (`fullName`, `phone`, `department`, `assignedTerritory`, `avatarUrl`) | Authenticated (Blocked in Demo Mode) |

### Turnkey Installer (`/api/v1/installer`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/status` | Check whether the installation is already provisioned and sealed | Public |
| `POST` | `/test-db` | Test PostgreSQL 16 + PostGIS database connectivity | Bootstrap Token |
| `POST` | `/provision` | Run migrations, seed tenant, chart of accounts & master admin, and permanently lock installer | Bootstrap Token |

### Services & Catalog (`/api/v1/services`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | List active service categories (supports Arabic/Unicode slugs) | Public |
| `POST` | `/categories` | Create new service category | Admin |
| `PUT` | `/categories/:id` | Update service category name, icon, banner, or active status | Admin |
| `DELETE` | `/categories/:id` | Soft-deactivate or delete service category | Admin |
| `GET` | `/` | List services with computed pricing tiers (`STANDARD`, `URGENT`, `EMERGENCY`) | Public |
| `POST` | `/` | Create new service with pricing tiers | Admin |
| `PUT` | `/:id` | Update service details, base price cents, duration, or active status | Admin |
| `DELETE` | `/:id` | Soft-deactivate or delete service | Admin |

### Bookings & Dispatch (`/api/v1/bookings` & `/api/v1/dispatch`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/bookings` | Create booking with server-side tax calculation (`default_tax_rate_bps`) & durable payment outbox job | Customer / Admin / Staff |
| `GET` | `/bookings` | List tenant bookings with role scoping (excludes `customer_safety_pin`) | Authenticated |
| `GET` | `/bookings/:id` | Get 360-degree booking dossier (exposes `customer_safety_pin` only to owning Customer or Admin/Staff) | Authenticated |
| `GET` | `/bookings/:id/payment-intent` | Poll client payment-intent creation / outbox status before confirmation | Customer (Owner) / Admin / Staff |
| `POST` | `/bookings/:id/confirm-payment` | Reconcile client-completed payment hold with Stripe/PayTabs/Telr | Customer (Owner) / Admin / Staff |
| `PATCH` | `/bookings/:id/status` | Transition booking status (`EN_ROUTE`, `ON_SITE`, etc.) with ownership checks | Provider / Admin / Staff |
| `PATCH` | `/bookings/:id/reschedule` | Reschedule booking timestamp with audit timeline entry | Customer (Owner) / Admin / Staff |
| `POST` | `/bookings/:id/cancel` | Cancel booking (blocks customer self-cancel once `ON_SITE`) and void/refund hold | Customer / Admin / Staff |
| `POST` | `/bookings/:id/verify-arrival` | Verify 4-digit Safety PIN (5-attempt lockout) + 500m PostGIS arrival geofence | Provider (Assigned) |
| `POST` | `/bookings/:id/complete` | Validate photo proof URLs, capture payment, post pre-tax + `2030` VAT double-entry ledger | Provider (Assigned) / Admin / Staff |
| `GET` | `/bookings/:id/messages` | List two-way messages and signed media attachments on a booking thread | Customer / Provider / Admin / Staff |
| `POST` | `/bookings/:id/messages` | Post message and optional attachments to booking communication thread | Customer / Provider / Admin / Staff |
| `GET` | `/dispatch/radar` | PostGIS `ST_DWithin` spatial radar search for online technicians | Authenticated |
| `POST` | `/dispatch/broadcast` | Trigger automated or manual dispatch broadcast wave for a booking (alias for `/dispatch/broadcasts`) | Admin / Staff |
| `GET` | `/dispatch/broadcasts/pending` | Fetch pending 60-second timed broadcast offers for logged-in technician | Provider |
| `POST` | `/dispatch/broadcasts/accept` | Atomically accept and lock broadcast offer | Provider |
| `POST` | `/dispatch/broadcasts/decline` | Decline broadcast offer | Provider |
| `POST` | `/dispatch/assign` | Direct manual technician assignment for `REQUESTED`/`BROADCASTING` bookings | Admin / Staff |
| `POST` | `/dispatch/handover` | Emergency reassignment of active booking with fresh 4-digit Safety PIN generation | Admin / Staff |

### CRM & Fleet Management (`/api/v1/crm`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/customers` | List customer directory with lifetime value metrics | Admin / Staff |
| `POST` | `/customers` | Create new customer user and profile | Admin / Staff |
| `GET` | `/customers/:id` | Get customer dossier, addresses, and booking history | Admin / Staff |
| `PUT` | `/customers/:id` | Update customer profile, phone, or courtesy credit | Admin / Staff |
| `GET` | `/technicians` | List technician fleet roster with duty status, rating, and coordinates | Admin / Staff |
| `POST` | `/technicians` | Onboard new technician user, provider profile, and initial shift | Admin / Staff |
| `GET` | `/technicians/:id` | Get technician dossier, vehicle, license, and shift schedule | Admin / Staff |
| `PUT` | `/technicians/:id` | Update technician profile, hourly rate, specialties, or shifts | Admin / Staff |
| `GET` | `/technicians/:id/availability` | Get technician weekly availability schedule (`provider_shifts`) | Admin / Staff |
| `PUT` | `/technicians/:id/availability` | Replace technician weekly availability shifts (`provider_shifts`) | Admin / Staff |
| `GET` | `/technicians/me/earnings` | Authenticated technician net earnings summary, recent completed jobs & payouts | Provider |
| `PATCH` | `/technicians/:id/verify` | Toggle technician compliance verification badge | Admin |
| `POST` | `/technicians/location-ping` | Ingest live GPS coordinates into PostGIS `provider_locations` | Provider |
| `PUT` | `/technicians/duty-status` | UPSERT authenticated technician duty status (`ONLINE`, `OFFLINE`, `ON_JOB`) | Provider / Admin / Staff |
| `PUT` | `/technicians/:id/duty-status` | Dispatcher/Admin updates target technician duty status (`ONLINE`, `OFFLINE`, `ON_JOB`, `EN_ROUTE`) | Admin / Staff (Blocked in Demo Mode) |
| `GET` | `/technicians/onboarding` | List technician KYC/vehicle onboarding packets (self or tenant queue) | Technician / Admin / Staff |
| `POST` | `/technicians/onboarding` | Submit or update technician KYC, license, vehicle, and document proofs | Technician / Admin (Blocked in Demo Mode) |
| `PATCH` | `/technicians/onboarding/:id/review` | Approve, reject, or move technician KYC packet `UNDER_REVIEW` | Admin / Staff (Blocked in Demo Mode) |
| `GET` | `/staff` | List tenant operations staff directory | Admin / Staff |
| `POST` | `/staff` | Provision new tenant operations staff account and profile | Admin (Blocked in Demo Mode) |
| `PUT` | `/staff/:id` | Update staff profile, department, territory, shift hours, or active flag | Admin (Blocked in Demo Mode) |

### Finances, Double-Entry Ledger & Refunds (`/api/v1/finances`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/overview` & `/metrics` | Executive financial overview (`grossVolumeCents`, `settledVolumeCents`, `taxCollectedCents`, `platformCommissionCents`, `refundedVolumeCents`) | Admin / Staff |
| `GET` | `/invoices` | List invoices with pagination and status filter | Admin / Staff |
| `POST` | `/invoices` | Create standalone or supplemental invoice with line items | Admin / Staff |
| `GET` | `/invoices/:id` | Get itemized invoice with line items and payment transactions | Authenticated |
| `GET` | `/ledger` | Audit view of immutable double-entry ledger journal entries (`1010`, `2010`, `2020`, `2030`, `4010`) | Admin |
| `GET` | `/technician/earnings` | Technician self-service earnings, net completed volume, and payout history (alias alongside `/crm/technicians/me/earnings`) | Provider |
| `GET` | `/payouts` | List provider payout transfers and available unpaid balances | Admin / Staff |
| `POST` | `/payouts` | Initiate durable 2-phase provider payout with `Idempotency-Key` and request fingerprint | Admin |
| `POST` | `/payouts/:id/reconcile` | Reconcile processing payout transfer status with payment gateway | Admin |
| `GET` | `/bonuses` | List technician performance & incentive bonuses (`provider_bonuses`) | Admin / Staff / Provider |
| `POST` | `/bonuses` | Award idempotent technician bonus crediting Technician Payable (`2020`) & Commission/Incentive (`5020`) | Admin (Blocked in Demo Mode) |
| `GET` | `/refunds` | List customer payment refunds | Admin / Staff |
| `POST` | `/refunds` | Execute full or partial refund with proportional `2030`/`4010`/`2020` ledger reversal | Admin / Staff |
| `POST` | `/refunds/:id/reconcile` | Reconcile stuck `PROCESSING` refund against payment gateway | Admin |
| `POST` | `/webhooks/stripe` | Inbound Stripe webhook listener (`payment_intent.succeeded`, `charge.refunded`, `transfer.reversed`, `payout.failed`) | Public (HMAC Verified) |

### Support Desk, Reviews & CMS (`/api/v1/support`)

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/tickets` | List support tickets with status and priority filters | Authenticated |
| `POST` | `/tickets` | Open new support ticket with initial message | Authenticated |
| `GET` | `/tickets/:id` | Get support ticket conversation thread | Authenticated |
| `POST` | `/tickets/:id/messages` | Post reply message to ticket thread | Authenticated |
| `PATCH` | `/tickets/:id/status` | Update ticket status or assigned staff agent | Admin / Staff |
| `POST` | `/sms/send` | Dispatch direct SMS via tenant Twilio secret (with `notification_logs` audit trail) | Admin / Staff |
| `GET` | `/sms/status` | Get masked Twilio gateway status and recent SMS delivery logs | Admin / Staff |
| `GET` | `/communications/:customerId` | Unified customer timeline across SMS notifications, tickets, and booking chat | Admin / Staff |
| `GET` | `/daily-reports` | List staff daily shift handover reports (`staff_daily_reports`) | Admin / Staff |
| `POST` | `/daily-reports` | Submit or update daily shift handover summary & blockers | Admin / Staff (Blocked in Demo Mode) |
| `GET` | `/incidents` | List critical operational incidents (`support_tickets` with `category='INCIDENT'`) | Admin / Staff |
| `POST` | `/incidents` | Log new operational incident | Admin / Staff |
| `PATCH` | `/incidents/:id/resolve` | Resolve critical operational incident and append timeline note | Admin / Staff |
| `GET` | `/reviews` | List customer reviews with provider and moderation filters | Authenticated |
| `POST` | `/reviews` | Submit 1–5 star rating and review for completed booking | Customer |
| `PATCH` | `/reviews/:id/moderate` | Admin review moderation toggle | Admin |
| `GET` | `/settings/cms` | Get tenant white-label branding and marketing promo | Public |
| `PUT` | `/settings/cms` | Update tenant CMS marketing banners and coupons | Admin |
