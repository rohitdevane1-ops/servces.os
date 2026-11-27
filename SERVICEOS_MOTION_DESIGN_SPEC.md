# ServiceOS — Cinematic Motion Design Specification

**Objective:** Deliver smooth 60fps GPU-composited motion (using `transform` and `opacity` only) that guides attention, provides tactile feedback, and respects OS reduced-motion accessibility settings across Web, Flutter, and Native Android.

---

## 1. Motion Curves & Timings
- **Cinematic Standard Curve:** `cubic-bezier(0.22, 1, 0.36, 1)` (`EASE_CINEMATIC` in Web, `Curves.easeOutCubic` in Flutter, `FastOutSlowInEasing` in Compose).
- **Spring Interactive Physics:**
  - Navigation active pill (`layoutId="serviceos-subnav-pill"`): `stiffness: 420, damping: 32`.
  - Scroll progress indicator (`useSpring`): `stiffness: 180, damping: 28, restDelta: 0.001`.
  - Tactile card press (`TactileScaleCard` / `tactilePressScale`): scale `0.982` over `140ms`.

---

## 2. Platform Architecture

### A. Admin & Staff Web (`admin_web/src/`)
- **Global Accessibility Policy:** `<MotionConfig reducedMotion="user">` wraps the entire React tree in `App.tsx`, alongside `@media (prefers-reduced-motion: reduce)` CSS overrides in `index.css`.
- **Scroll-Linked Progress & Section Reveals (`MotionPrimitives.tsx`):**
  - `ScrollProgressBar`: tracks `<main>` scroll progress via `useScroll({ container })`.
  - `RevealSection`: viewport-triggered (`once: true, amount: 0.12`) section fade + `20px` vertical settle.
  - `StaggerCard`: staggered KPI/card reveal (`70ms` step capped at `350ms`) with subtle hover elevation (`y: -3px`).
  - `AnimatedNumber`: `requestAnimationFrame` cubic-out counter with `tabular-nums` (snaps immediately if reduced motion is preferred).
- **Navigation, Routes & Dialogs:**
  - `NavigationSidebar`: responsive mobile slide-over drawer + frosted backdrop scrim on `< 1024px`.
  - `ModuleSubnav`: shared-layout spring pill gliding (`layoutId`).
  - `PageRouter` & `StaffPageRouter`: `<AnimatePresence mode="wait">` subtle fade + `12px` vertical entrance.
  - `Modal`: spring dialog scale/fade + backdrop blur transition.

### B. Flutter (`serviceos/lib/`)
- **`core/widgets/motion_primitives.dart`:** `ScrollRevealItem`, `TactileScaleCard`, `PulsingStatusDot`, `AnimatedSectionHeader` — all checking `MediaQuery.maybeDisableAnimationsOf(context)`.
- **Scroll-Linked Parallax:** `CustomerDiscoverScreen` feeds clamped `ScrollController` offset into `HeroDiscoveryBanner` for multi-layer orb and graphic parallax.
- **Shared-Element & Route Continuity:** Matching `Hero(tag: 'service-hero-${service.id}')` between `ServiceCuratedCard` and `ServiceDetailScreen`; `CustomTransitionPage` helper in `AppRouter`; `AnimatedSwitcher` in `BookingWizardScreen`; `PulsingStatusDot` in `LiveDispatchRadarScreen` and `TechDashboardScreen`.

### C. Native Android (`serviceos_android/`)
- **`core/theme/Theme.kt`:** `animateColorAsState(tween(260))` across background, surface, primary, secondary, and text colors for flash-free Day/Night Vision transitions.
- **`ui/components/MotionPrimitives.kt`:** `tactilePressScale`, `RevealCard`, `RadarPulseDot`, and `ShimmerPlaceholderBox`.
- **`core/navigation/ServiceOSNavigation.kt`:** Native horizontal slide + fade transitions (`enterTransition`, `exitTransition`, `popEnterTransition`, `popExitTransition`).
- **Scroll & Field Polish:** `LazyListState`-driven parallax in `CustomerDiscoverScreen` -> `HeroBanner`, tactile `ServiceCard` press feedback, and `RadarPulseDot` in `TechDashboardScreen`.
