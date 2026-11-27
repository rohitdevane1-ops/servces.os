# ServiceOS — Unified Dual-Vision Design System

**Scope:** Shared visual specification across Admin & Staff Web (`admin_web/`), Customer & Technician Flutter (`serviceos/`), and Native Android Jetpack Compose (`serviceos_android/`).  
**Figma System File:** `https://www.figma.com/design/FflAjjnk3HZiOLAwU9dG0X` (`"ServiceOS Dual-Vision Design System"`)  
**Earlier Reference Tokens File:** `https://www.figma.com/design/i5T7729ORAuzn3JKFUrYFG`

---

## 1. Color Tokens

### Day Vision (Default Light Mode)
| Token | Hex / Value | Web (`index.css`) | Flutter (`app_theme.dart`) | Android (`Color.kt`) |
|---|---|---|---|---|
| Web Canvas | `#F4F7FB` | `--so-canvas` | — | — |
| Mobile Canvas | `#F8FAFC` | — | `AppColors.dayCanvas` | `DayCanvas` |
| Surface (Elevated Card) | `#FFFFFF` | `--so-surface` | `AppColors.daySurface` | `DaySurface` |
| Muted Surface | `#F1F5F9` / `#F8FAFC` | `--so-surface-muted` | `Color(0xFFF1F5F9)` | `MaterialTheme.colorScheme.surfaceVariant` |
| Primary Brand | `#6366F1` (Royal Indigo) | `--so-primary` | `AppColors.dayPrimary` | `DayPrimary` |
| Secondary Brand | `#7C3AED` (Vivid Violet) | `--so-accent` | `AppColors.dayAccent` | `DayAccent` |
| Admin Rail Surface | `#0C3832` (Deep Teal) | `.servicepro-sidebar` | — | — |
| Admin Active Accent | `#059669` (Emerald) | `--so-emerald` | — | — |
| Text Primary | `#0F172A` | `--so-text` | `AppColors.dayTextPrimary` | `DayTextPrimary` |
| Text Secondary | `#475569` / `#64748B` | `--so-text-muted` | `AppColors.dayTextSecondary` | `DayTextSecondary` |
| Hairline Border | `#E2E8F0` | `--so-border` | `AppColors.dayBorder` | `DayBorder` |

### Night Vision (OLED Dark Mode)
| Token | Hex / Value | Web (`index.css`) | Flutter (`app_theme.dart`) | Android (`Color.kt`) |
|---|---|---|---|---|
| OLED Canvas | `#060B14` | `--so-canvas` | `AppColors.nightCanvas` | `NightCanvas` |
| Elevated Surface | `#0C1523` | `--so-surface` | `AppColors.nightSurface` | `NightSurface` |
| Muted Surface | `#111C2E` | `--so-surface-muted` | `Color(0xFF111C2E)` | — |
| Primary Accent | `#818CF8` | `--so-primary` | `AppColors.nightPrimary` | `NightPrimary` |
| Secondary Accent | `#A78BFA` | `--so-accent` | `AppColors.nightAccent` | `NightAccent` |
| Text Primary | `#F8FAFC` | `--so-text` | `AppColors.nightTextPrimary` | `NightTextPrimary` |
| Text Secondary | `#94A3B8` | `--so-text-muted` | `AppColors.nightTextSecondary` | `NightTextSecondary` |
| Hairline Border | `rgba(255,255,255,0.10)` | `--so-border` | `AppColors.nightBorder` | `NightBorder` |

### Semantic Status Tokens (Shared)
- **Verified / Success:** `#10B981`
- **Rating / Warning:** `#F59E0B`
- **Urgent Orange:** `#F97316`
- **Critical / Error:** `#EF4444`

---

## 2. Typography & Numerical Hierarchy
- **Primary UI Font:** `Plus Jakarta Sans` (Web via Google Fonts, Flutter via `google_fonts`, Compose via Material 3 `Typography` scale).
- **Technical / Monospace Font:** `JetBrains Mono` for booking references, ledger hashes, coordinates, timestamps, and safety PINs.
- **Tabular Figures:** Apply `tabular-nums` on KPI counters, invoice totals, and dispatch timers to prevent layout jitter during animations.

---

## 3. Spacing, Radii & Responsive Grid
- **Spacing Scale:** `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`, `48px`, `64px`.
- **Corner Radii:** `12px` (buttons & inputs), `16px` (`rounded-2xl` standard cards & drawers), `24px` (hero banners, login cards, bottom sheets), `9999px` (pills & status badges).
- **Responsive Breakpoints (Web):** Mobile `320px–430px` (1-col, slide-over sidebar drawer), Tablet `768px` (2-col grid, drawer sidebar), Desktop `1024px–1920px` (persistent collapsible sidebar rail, 4-col KPI bento, 8/4 and 7/5 split grids).
