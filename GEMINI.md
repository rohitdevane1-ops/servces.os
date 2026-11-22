# ServiceOS — Commercial Handover & Engineering Master Rules (`GEMINI.md`)

> **Project**: ServicePro OS / ServiceOS — International Home Services Management & Dispatch Platform  
> **Target Commercial Valuation**: \$20,000 – \$60,000 Turnkey Software Acquisition  
> **Client Applications**: 
> 1. **Customer & Technician Flutter App** (`serviceos/` — iOS & Android)
> 2. **Customer & Technician Native Android App** (`serviceos_android/` — Kotlin + Jetpack Compose Material 3)
> 3. **Admin & Staff Web Control Portal** (`admin_web/` — React 19 + TypeScript + Tailwind + RTL/LTR)
> **Backend & Dual Database**: Fastify 5 API (`server/`) + PostgreSQL 16 + PostGIS (`servicepro` Clean Production DB + `servicepro_demo` Isolated Buyer Demo Sandbox DB) + Redis 7  
> **Visual Design Language**: Dual-Vision Engine — **Day Vision** (Vivid Light Mode matching reference mockup) + **Night Vision** (OLED Dark Mode)

---

## 1. Golden Rules of Engineering ServiceOS

1. **Strictly 2 Mobile User Personas**:
   * **Customer** and **Technician** are the ONLY two user types in the mobile apps.
   * **Admin** and **Staff** operate business dispatch, CRM, compliance, and financial operations via the dedicated Web Control Portal (`admin_web/`).
2. **Zero Internal/Hardcoded Demo Data**:
   * Never hardcode mock users, fake identities, or unverified credentials inside application source code.
   * Showcase data lives exclusively inside the isolated **Demo Sandbox DB (`servicepro_demo`, `APP_DEMO_MODE=true`)** seeded via `npm --prefix server run seed:demo`, while the **Clean Production DB (`servicepro`, `APP_DEMO_MODE=false`)** is provisioned via `npm --prefix server run seed:prod` or the one-time `/installer` wizard with zero fake records.
3. **No Random or AI-Generated Ugly UIs**:
   * All mobile screens must strictly follow the **Day Vision (Light Mode)** design system extracted from the approved master reference image (`design_references/brand/serviceos_master_ui.jpg`):
     * Pure white elevated cards (`#FFFFFF`) with `rounded-2xl` corners.
     * Soft clean slate canvas background (`#F8FAFC`).
     * Royal Purple (`#6366F1`) & Vivid Violet (`#7C3AED`) brand accents.
     * Soft pastel gradient hero banner with search pill and smiling woman graphic (*"Your Service Our Priority"*).
     * Floating circular category icon badges overlapping landscape photo banners.
     * Amber `★ 4.8` rating pills, Emerald verified pro badges, and crisp purple `Book Now →` buttons.
   * Provide an instant toggle for **Night Vision (Dark Mode)** (`#060B14` obsidian background, `#0C1523` surface cards).
4. **No Placeholder Code**:
   * Never write `// TODO: implement later` or stub methods that throw `UnimplementedError()`.
   * Write full, production-ready, compilable code with real state handling and error fallbacks.
5. **No Duplicate Components**:
   * Reusable Flutter UI widgets (cards, buttons, inputs, headers, status chips) must live exclusively in `serviceos/lib/shared/components/` and `serviceos/lib/core/widgets/`.

---

## 2. Directory & Structure Map

```
├── GEMINI.md                        # Master engineering rules & workspace map
├── README.md                        # Quick start & Dual-Database buyer overview
├── API_DOCUMENTATION.md             # Complete Fastify 5 REST API specification
├── PROJECT_ARCHITECTURE.md          # System topology, PostGIS & Double-Entry Ledger
├── COMMERCIAL_HANDOVER.md           # Turnkey asset inventory & buyer valuation dossier
├── INSTALLATION_GUIDE.md            # Docker Compose, migrations, Dual-DB & mobile build guide
│
├── design_references/               # Approved visual mockups & cropped image assets
│   ├── brand/                       # Master UI reference image & brand logo
│   └── booking/                     # Cropped category banners (plumbing, cleaning, etc.)
│
├── server/                          # Fastify 5 + PostgreSQL 16 + PostGIS + Redis API Server
│   └── src/database/migrations/     # 15 paired Up/Down PostgreSQL + PostGIS migrations (001–015)
│
├── scripts/                         # Release & Security Validators + Secret Generator
│   ├── generate_secrets.cjs         # Cryptographic key generator for .env
│   ├── validate_migrations.cjs      # SQL migration pair & RLS policy validator
│   └── validate_dart_codebase.cjs   # Flutter Dart & Android Kotlin zero-placeholder scanner
│
├── serviceos/                       # Flutter iOS & Android Mobile Application
│   ├── assets/                      # Bundled images, icons, and illustrations
│   └── lib/
│       ├── core/                    # Themes, GoRouter, Dio ApiClient, utilities
│       ├── data/                    # BIGINT-safe models & Fastify repositories
│       ├── features/                # Domain feature modules (bookings, services, dispatch...)
│       └── shared/                  # Reusable widgets, enums, extensions
│
├── serviceos_android/               # Native Android Kotlin + Jetpack Compose Application
│   └── app/src/main/kotlin/         # Material 3 customer & technician suites + EncryptedSharedPreferences
│
└── admin_web/                       # React 19 + TypeScript Admin & Staff Web Control Portal
```

---

## 3. Visual Review Gate
Before any backend wiring, every screen's UI must be validated against the approved visual standards.
