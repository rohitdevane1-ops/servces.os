# ServiceOS — Phase 0 UI/UX Initial Audit Report

**Audit Date:** 2026-11-26  
**Scope:** Complete read-only inspection across `admin_web/`, `serviceos/`, and `serviceos_android/` prior to full cross-platform UI/UX and motion execution.  
**Master Rules Baseline:** [GEMINI.md](./GEMINI.md)

---

## 1. Repository Inventory Summary

| Application | Stack | Source Files | Screens / Pages | Key Shared Components |
|---|---|---|---|---|
| **Admin & Staff Web Portal** (`admin_web/src/`) | React 19.3.1, TypeScript ~7.0.2, Tailwind CSS v4.3.5, Recharts 3.10.1, Leaflet 1.9.4, `motion` | 108 `.ts`/`.tsx`/`.css` files | 38 Admin pages (`pagesMaster.ts` + `FacebookProfilePage`, `SystemInstallerPage`) + 14 Staff pages (`staffPagesMaster.ts`) + `LoginPage` | `NavigationSidebar`, `TopNavbar`, `ModuleSubnav`, `Modal`, `MotionPrimitives`, `RealDispatchMap`, 11 modal/drawer workflows |
| **Flutter Mobile App** (`serviceos/lib/`) | Flutter >=3.19.0, Dart >=3.0.0, Riverpod 2.5.1, GoRouter 14.2.0, Dio 5.4.3+1, `flutter_map` | 44 `.dart` files | 20 screens (Customer + Technician personas only; 0 Admin/Staff mobile routes) | `ServiceOSAppHeader`, `HeroDiscoveryBanner`, `CategoryPillSelector`, `ServiceCuratedCard`, `TrustVerificationStrip`, `motion_primitives.dart` |
| **Native Android App** (`serviceos_android/app/src/main/kotlin/`) | Kotlin, Jetpack Compose BOM 2024.04.00, Material 3, Navigation Compose 2.7.7, Coil 2.6.0 | 38 `.kt` files | 22 screens (Customer + Technician personas only; 0 Admin/Staff mobile routes) | `AppHeader`, `CategoryPill`, `HeroBanner`, `ServiceCard`, `TrustStrip` |

---

## 2. Screen & Route Inventory

### A. Admin & Staff Web (`admin_web/src/`)
- **Auth & Commercial:** `LoginPage`, `SystemInstallerPage`, `FacebookProfilePage`
- **Admin Modules (8 Modules, Pages 1–36):**
  - Module 1 (Dashboard & Operations): `Page01MainDashboard`, `Page02LiveOperations`, `Page03TodayActivity`, `Page04PendingWork`, `Page05CriticalAlerts`
  - Module 2 (Bookings & Dispatch): `Page06AllBookings`, `Page07NewBookingRequests`, `Page08ActiveBookings`, `Page09BookingDetails`, `Page10BookingRescheduling`, `Page11DispatchBoard`, `Page12ManualDispatchHandover`
  - Module 3 (Services & Pricing): `Page13AllServices`, `Page14ServiceCategories`, `Page15AddEditService`, `Page16ServiceDetails`, `Page17PricingManagement`
  - Module 4 (Customers): `Page18AllCustomers`, `Page19CustomerProfile`, `Page20CustomerBookingHistory`, `Page21CustomerSupportTickets`
  - Module 5 (Technicians): `Page22AllTechnicians`, `Page23TechnicianProfile`, `Page24TechnicianAvailability`, `Page25TechnicianPerformance`
  - Module 6 (Finance): `Page26FinancialDashboard`, `Page27TransactionHistory`, `Page28CustomerInvoices`, `Page29TechnicianPayouts`, `Page30RefundManagement`
  - Module 7 (Support & Reviews): `Page31SupportTicketDashboard`, `Page32TicketDetailsConversation`, `Page33CustomerReviewsManagement`
  - Module 8 (Platform Settings): `Page34WebsiteContentManagement`, `Page35GeneralPlatformSettings`, `Page36PaymentNotificationConfig`
- **Staff Desk (4 Modules, Pages 101–113 + 114):** `StaffDashboard`, `StaffOrderIntake`, `StaffActivityStream`, `StaffOrderAssignment`, `StaffLiveDispatch`, `StaffTechAvailability`, `StaffEmergencyHandover`, `StaffActiveOrders`, `StaffScheduleCalendar`, `StaffRescheduleDesk`, `StaffJobVerification`, `StaffCustomerComm`, `StaffDailyReport`, `FacebookProfilePage`.

### B. Flutter (`serviceos/lib/`)
- **Onboarding & Auth:** `SplashScreen`, `LoginScreen`, `RoleGatewayScreen`
- **Customer Suite:** `CustomerDiscoverScreen`, `GlobalSearchScreen`, `CategoryFeedScreen`, `ServiceDetailScreen`, `BookingWizardScreen`, `MyBookingsScreen`, `LiveDispatchRadarScreen`, `WorkOrderCompletionScreen`, `InvoiceReceiptScreen`, `CustomerProfileScreen`, `SupportHelpScreen`
- **Technician Suite:** `TechDashboardScreen`, `TechBroadcastScreen`, `TechJobExecutionScreen`, `TechWalletScreen`, `TechOnboardingScreen`, `TechHistoryScreen`
- **Common:** `InAppChatScreen`, `CommonUtilitiesScreen`

### C. Native Android (`serviceos_android/`)
- **Common:** `SplashScreen`, `LoginScreen`, `RoleGatewayScreen`, `InAppChatScreen`, `CommonUtilitiesScreen`
- **Customer Suite:** `CustomerDiscoverScreen`, `GlobalSearchScreen`, `CategoryFeedScreen`, `ServiceDetailScreen`, `BookingWizardScreen`, `LiveDispatchRadarScreen`, `WorkOrderCompletionScreen`, `MyBookingsScreen`, `InvoiceReceiptScreen`, `CustomerProfileScreen`, `SupportHelpScreen`
- **Technician Suite:** `TechDashboardScreen`, `TechBroadcastScreen`, `TechJobExecutionScreen`, `TechWalletScreen`, `TechOnboardingScreen`, `TechHistoryScreen`

---

## 3. Identified Issues & Findings

### High Priority (Layout, Data Hygiene, Lint)
1. **UTF-8 Mojibake Across 50 `admin_web/src/` Files:** Legacy double-encoded UTF-8 sequences (`â€¢`, `â†’`, `â†‘`, `â† `, `â€”`, etc.) appear in 50 files (including `LoginPage.tsx`, `Page02LiveOperations.tsx`, `Page11DispatchBoard.tsx`, `Page26FinancialDashboard.tsx`, `StaffDashboard.tsx`, and modal drawers).
2. **Mobile Responsive Blocker in `NavigationSidebar.tsx`:** `NavigationSidebar` enforces `w-80 min-w-[320px]` in normal flex flow when expanded, causing horizontal overflow on `320px–768px` viewports. On `< 1024px`, the sidebar must operate as a slide-over drawer with backdrop scrim.
3. **`TopNavbar.tsx` Narrow-Viewport Crowding:** On `320px–430px`, padding and full button labels crowd the search bar and action cluster.
4. **2 `oxlint` Fast-Refresh Warnings:** `ThemeContext.tsx` exports `useTheme` alongside `ThemeProvider`, and `MotionPrimitives.tsx` exports `EASE_CINEMATIC` alongside React components.

### Medium Priority (Motion, Visual Polish, Platform Parity)
5. **Unanimated Web Dialogs & Staff Route Transitions:** `Modal.tsx` and `StaffPageRouter.tsx` lack `motion/react` `AnimatePresence` transitions, whereas `PageRouter.tsx` and `TopNavbar.tsx` already use them.
6. **Flutter Route & Detail Continuity:** `AppRouter` (`app_router.dart`) uses default builders without smooth transitions; `ServiceDetailScreen`, `BookingWizardScreen`, `LiveDispatchRadarScreen`, and `TechDashboardScreen` need matching `Hero` tags, step transitions (`AnimatedSwitcher`), and live pulsing radar status dots.
7. **Native Android Motion & Edge-to-Edge Parity:**
   - `MainActivity.kt` does not call `enableEdgeToEdge()`.
   - `Theme.kt` switches between Day and Night color schemes instantaneously without `animateColorAsState`.
   - `ServiceOSNavigation.kt` lacks animated `NavHost` transitions.
   - `CustomerDiscoverScreen.kt`, `HeroBanner.kt`, `ServiceCard.kt`, `CategoryPill.kt`, and `TechDashboardScreen.kt` lack scroll-linked parallax, tactile press scale, and pulsing radar halos.

---

## 4. Zero-Hardcoded-Data Audit
- `admin_web/src/data/mockData.ts` exports empty typed arrays (`[]`) with zero fabricated records.
- `scripts/validate_dart_codebase.cjs` passes across 44 Dart files and 38 Kotlin files with zero hardcoded mock identities and zero `TODO` / `UnimplementedError()` stubs.
- **Guardrail:** All redesign upgrades must preserve strict API-driven / empty-state behavior with zero fabricated statistics or fake entities.

---

## 5. Toolchain & Plugin Availability (Observed)
- **Available locally:** `node v24.20.0`, `npm 11.19.0`, `playwright`, Google Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`), Microsoft Edge.
- **Not installed locally:** `flutter`, `dart`, `java` / Android Gradle JDK. (Validation for Flutter/Kotlin relies on `node scripts/validate_dart_codebase.cjs` plus careful static inspection; native compilation cannot run on this host.)
- **Plugins:**
  - **Figma:** Team file `https://www.figma.com/design/FflAjjnk3HZiOLAwU9dG0X` (`"ServiceOS Dual-Vision Design System"`; Starter-plan MCP write rate-limit paywall encountered when calling `use_figma`).
  - **Canva:** Connected (`DAHcBzEznVY`).
  - **Context7:** Connected (`motion/react`, `gsap`, `flutter_animate` docs available).
  - **Mobbin:** Requires a paid Mobbin plan (`https://mobbin.com/pricing`), unavailable for automated search in this environment.
