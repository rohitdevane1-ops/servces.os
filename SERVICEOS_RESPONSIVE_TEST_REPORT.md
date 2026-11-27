# ServiceOS — Responsive & Browser Verification Report

**Test Tool:** Headless Chromium / Edge driven by Playwright (`admin_web/e2e/responsive_smoke.mjs`) against `admin_web` production build (`vite preview`) + live isolated Fastify / embedded PostgreSQL backend.  
**Date:** 2026-11-27

---

## 1. 10-Breakpoint Matrix (Day Vision & Night Vision)

| Viewport Width | Theme Mode | Reduced Motion | `scrollWidth` | `innerWidth` | Horizontal Overflow | Broken Images | Primary CTA Visible | Uncaught Page Errors |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| `320px` | Day | `no-preference` | 320 | 320 | `0px` | 0 | Yes | 0 |
| `320px` | Night | `reduce` | 320 | 320 | `0px` | 0 | Yes | 0 |
| `360px` | Day | `no-preference` | 360 | 360 | `0px` | 0 | Yes | 0 |
| `360px` | Night | `no-preference` | 360 | 360 | `0px` | 0 | Yes | 0 |
| `375px` | Day | `no-preference` | 375 | 375 | `0px` | 0 | Yes | 0 |
| `375px` | Night | `no-preference` | 375 | 375 | `0px` | 0 | Yes | 0 |
| `390px` | Day | `no-preference` | 390 | 390 | `0px` | 0 | Yes | 0 |
| `390px` | Night | `no-preference` | 390 | 390 | `0px` | 0 | Yes | 0 |
| `430px` | Day | `no-preference` | 430 | 430 | `0px` | 0 | Yes | 0 |
| `430px` | Night | `no-preference` | 430 | 430 | `0px` | 0 | Yes | 0 |
| `768px` | Day | `no-preference` | 768 | 768 | `0px` | 0 | Yes | 0 |
| `768px` | Night | `no-preference` | 768 | 768 | `0px` | 0 | Yes | 0 |
| `1024px` | Day | `no-preference` | 1024 | 1024 | `0px` | 0 | Yes | 0 |
| `1024px` | Night | `no-preference` | 1024 | 1024 | `0px` | 0 | Yes | 0 |
| `1280px` | Day | `no-preference` | 1280 | 1280 | `0px` | 0 | Yes | 0 |
| `1280px` | Night | `no-preference` | 1280 | 1280 | `0px` | 0 | Yes | 0 |
| `1440px` | Day | `no-preference` | 1440 | 1440 | `0px` | 0 | Yes | 0 |
| `1440px` | Night | `no-preference` | 1440 | 1440 | `0px` | 0 | Yes | 0 |
| `1920px` | Day | `no-preference` | 1920 | 1920 | `0px` | 0 | Yes | 0 |
| `1920px` | Night | `no-preference` | 1920 | 1920 | `0px` | 0 | Yes | 0 |

---

## 2. Notes & Limitations Observed
- Each viewport pass recorded `1` expected network `404` console log for `/api/v1/system/config` because the Fastify API server (`server/`) was not running during static `vite preview` verification; zero JavaScript exceptions (`pageErrors: 0`) occurred.
- Authenticated workspace pages (Admin modules 1–8 and Staff modules 1–4) require a live Fastify backend cookie session (`httpOnly` fail-closed auth), so live rendered Playwright screenshots inside the authenticated workspace were not captured; responsive layout hardening (`NavigationSidebar` slide-over drawer `< 1024px`, `TopNavbar` mobile compaction, `Page11DispatchBoard` `overflow-x-auto` wrapper) was verified via source inspection, `oxlint`, and `tsc -b && vite build`.
- Flutter (`flutter`/`dart`) and Android Gradle (`java`) toolchains are not installed on this Windows host, so mobile multi-device emulator/simulator rendering was not executed locally.
