import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../network/api_client.dart';
import '../../data/models/service_model.dart';

import '../../features/onboarding/presentation/screens/splash_screen.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/role_gateway_screen.dart';
import '../../features/dashboard/presentation/screens/customer_discover_screen.dart';
import '../../features/services/presentation/screens/global_search_screen.dart';
import '../../features/services/presentation/screens/category_feed_screen.dart';
import '../../features/services/presentation/screens/service_detail_screen.dart';
import '../../features/bookings/presentation/screens/booking_wizard_screen.dart';
import '../../features/bookings/presentation/screens/my_bookings_screen.dart';
import '../../features/dispatch/presentation/screens/live_dispatch_radar_screen.dart';
import '../../features/dispatch/presentation/screens/work_order_completion_screen.dart';
import '../../features/invoices/presentation/screens/invoice_receipt_screen.dart';
import '../../features/profile/presentation/screens/customer_profile_screen.dart';
import '../../features/support/presentation/screens/support_help_screen.dart';
import '../../features/technicians/presentation/screens/tech_dashboard_screen.dart';
import '../../features/technicians/presentation/screens/tech_broadcast_screen.dart';
import '../../features/technicians/presentation/screens/tech_job_execution_screen.dart';
import '../../features/technicians/presentation/screens/tech_wallet_screen.dart';
import '../../features/technicians/presentation/screens/tech_onboarding_screen.dart';
import '../../features/technicians/presentation/screens/tech_history_screen.dart';
import '../../features/common/presentation/screens/in_app_chat_screen.dart';
import '../../features/common/presentation/screens/common_utilities_screen.dart';

const ServiceItemModel _defaultFallbackService = ServiceItemModel(
  id: 'default',
  name: 'On-Demand Home Service',
  category: 'General',
  price: 99.0,
  durationMinutes: 60,
  rating: 4.8,
  reviewCount: 0,
  popular: false,
  description: 'Standard home service callout',
);

/// Central GoRouter configuration mapping mobile views with strict 2-persona role enforcement.
/// GEMINI.md Rule 1: Customer and Technician are the ONLY two user types in the mobile apps.
class AppRouter {
  static final GoRouter router = createRouter(
    onThemeToggle: () {},
    isDarkModeGetter: () => false,
  );

  static GoRouter createRouter({
    required VoidCallback onThemeToggle,
    required bool Function() isDarkModeGetter,
  }) {
    Map<String, dynamic>? activeBooking;

    void setActiveFromModel(dynamic b) {
      if (b == null) return;
      try {
        activeBooking = {
          'bookingId': b.id,
          'bookingReference': b.bookingReference,
          'invoiceNumber': 'INV-${b.bookingReference}',
          'serviceTitle': b.serviceTitle,
          'customerAddress': b.customerAddress,
          'safetyPin': b.safetyPin,
          'techName': b.technicianName,
          'basePrice': b.basePrice,
          'diagnosticFee': 20.0,
          'partsCost': b.extraPartsTotal,
        };
      } catch (_) {}
    }

    return GoRouter(
      initialLocation: '/splash',
      redirect: (context, state) async {
        final isPublicRoute = state.matchedLocation == '/login' ||
            state.matchedLocation == '/splash' ||
            state.matchedLocation == '/role-gateway';

        if (isPublicRoute) return null;

        final user = await ApiClient.instance.validateSession();
        if (user == null) {
          return '/login';
        }

        final role = (user['role'] ?? '').toString().toUpperCase();
        // Strictly 2 mobile user personas: CUSTOMER and TECHNICIAN
        if (role != 'CUSTOMER' && role != 'TECHNICIAN') {
          await ApiClient.instance.logout();
          return '/login';
        }

        final isTechRoute =
            state.matchedLocation.startsWith('/tech') ||
            state.matchedLocation.startsWith('/technician');
        final isCustomerRoute = state.matchedLocation.startsWith('/customer');

        if (isTechRoute && role != 'TECHNICIAN') {
          return '/customer/home';
        }
        if (isCustomerRoute && role != 'CUSTOMER') {
          return '/tech/dashboard';
        }

        return null;
      },
      routes: [
        GoRoute(
          path: '/splash',
          builder: (context, state) => SplashScreen(
            onGetStarted: () => context.go('/login'),
          ),
        ),
        GoRoute(
          path: '/login',
          builder: (context, state) => LoginScreen(
            onLoginSuccess: () async {
              final savedRole = (await ApiClient.instance.getSavedUserRole() ?? '').toUpperCase();
              if (!context.mounted) return;
              if (savedRole == 'TECHNICIAN') {
                context.go('/tech/dashboard');
              } else if (savedRole == 'CUSTOMER') {
                context.go('/customer/home');
              } else {
                context.go('/role-gateway');
              }
            },
            onSelectRole: () => context.go('/role-gateway'),
          ),
        ),
        GoRoute(
          path: '/role-gateway',
          builder: (context, state) => RoleGatewayScreen(
            onSelectCustomer: () async {
              final role = (await ApiClient.instance.getSavedUserRole() ?? '').toUpperCase();
              if (!context.mounted) return;
              if (role == 'TECHNICIAN') {
                context.go('/tech/dashboard');
              } else if (role == 'CUSTOMER') {
                context.go('/customer/home');
              } else {
                context.go('/login');
              }
            },
            onSelectTechnician: () async {
              final role = (await ApiClient.instance.getSavedUserRole() ?? '').toUpperCase();
              if (!context.mounted) return;
              if (role == 'TECHNICIAN') {
                context.go('/tech/dashboard');
              } else if (role == 'CUSTOMER') {
                context.go('/customer/home');
              } else {
                context.go('/login');
              }
            },
          ),
        ),

        // Customer Suite
        GoRoute(
          path: '/customer/home',
          builder: (context, state) => CustomerDiscoverScreen(
            onThemeToggle: onThemeToggle,
            isDarkMode: isDarkModeGetter(),
          ),
        ),
        GoRoute(
          path: '/customer/search',
          builder: (context, state) => GlobalSearchScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onSelectService: (svc) => context.push('/customer/service-detail', extra: svc),
          ),
        ),
        GoRoute(
          path: '/customer/categories',
          builder: (context, state) => CategoryFeedScreen(
            categorySlug: state.uri.queryParameters['slug'] ?? 'all',
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onSelectService: (svc) => context.push('/customer/service-detail', extra: svc),
          ),
        ),
        GoRoute(
          path: '/customer/service-detail',
          builder: (context, state) {
            final svc = state.extra is ServiceItemModel
                ? state.extra as ServiceItemModel
                : _defaultFallbackService;
            return ServiceDetailScreen(
              service: svc,
              onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
              onProceedToBooking: () => context.push('/customer/booking-wizard', extra: svc),
              onConfigureBooking: (totalPrice, tierTitle) => context.push(
                '/customer/booking-wizard',
                extra: <String, dynamic>{
                  'service': svc,
                  'tierPrice': totalPrice,
                  'tierTitle': tierTitle,
                },
              ),
            );
          },
        ),
        GoRoute(
          path: '/customer/booking-wizard',
          builder: (context, state) {
            final extra = state.extra;
            ServiceItemModel svc = _defaultFallbackService;
            double? tierPrice;
            String? tierTitle;
            if (extra is ServiceItemModel) {
              svc = extra;
            } else if (extra is Map) {
              if (extra['service'] is ServiceItemModel) {
                svc = extra['service'] as ServiceItemModel;
              }
              if (extra['tierPrice'] is num) {
                tierPrice = (extra['tierPrice'] as num).toDouble();
              }
              tierTitle = extra['tierTitle']?.toString();
            }
            return BookingWizardScreen(
              service: svc,
              selectedTierTitle: tierTitle,
              selectedPackagePrice: tierPrice,
              onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
              onBookingCreated: (created) {
                activeBooking = created;
              },
              onBookingConfirmed: () => context.go('/customer/dispatch-radar'),
            );
          },
        ),
        GoRoute(
          path: '/customer/my-bookings',
          builder: (context, state) => MyBookingsScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onTrackLive: (b) {
              setActiveFromModel(b);
              context.push('/customer/dispatch-radar');
            },
            onViewInvoice: (b) {
              setActiveFromModel(b);
              context.push('/customer/invoice');
            },
          ),
        ),
        GoRoute(
          path: '/customer/dispatch-radar',
          builder: (context, state) => LiveDispatchRadarScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onChatWithTech: () => context.push('/common/chat'),
            onCompleteJob: () => context.push('/customer/completion'),
            safetyPin: (activeBooking?['safetyPin'] ?? activeBooking?['safety_pin'])?.toString(),
          ),
        ),
        GoRoute(
          path: '/customer/completion',
          builder: (context, state) => WorkOrderCompletionScreen(
            bookingId: (activeBooking?['bookingId'] ?? activeBooking?['id'])?.toString(),
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onSignOffComplete: () => context.go('/customer/invoice'),
          ),
        ),
        GoRoute(
          path: '/customer/invoice',
          builder: (context, state) {
            final ab = activeBooking;
            final bookingRef = (ab?['bookingReference'] ?? ab?['booking_reference'] ?? '').toString();
            final invNum = ab?['invoiceNumber']?.toString() ??
                (bookingRef.isNotEmpty ? 'INV-$bookingRef' : '');
            final partsCost = ((ab?['partsCost'] ?? ab?['extraPartsTotal'] ?? ab?['extra_parts_total'] ?? 0) as num).toDouble();
            final laborCost = ((ab?['basePrice'] ?? ab?['base_price'] ?? 0) as num).toDouble();
            final diagnosticFee = ((ab?['diagnosticFee'] ?? ab?['diagnostic_fee'] ?? 0) as num).toDouble();
            return InvoiceReceiptScreen(
              onBack: () => context.canPop() ? context.pop() : context.go('/customer/my-bookings'),
              invoiceNumber: invNum,
              bookingReference: bookingRef,
              serviceName: (ab?['serviceTitle'] ?? ab?['service_title'] ?? 'Field Service Order').toString(),
              customerAddress: (ab?['customerAddress'] ?? ab?['customer_address'] ?? 'Customer Service Address').toString(),
              techName: (ab?['techName'] ?? ab?['technicianName'] ?? ab?['technician_name'] ?? 'Certified Technician').toString(),
              laborCost: laborCost,
              diagnosticFee: diagnosticFee,
              parts: partsCost > 0
                  ? [
                      {'name': 'Approved Replacement Parts', 'price': partsCost},
                    ]
                  : const [],
            );
          },
        ),
        GoRoute(
          path: '/customer/profile',
          builder: (context, state) => CustomerProfileScreen(
            isDarkMode: isDarkModeGetter(),
            onThemeToggle: onThemeToggle,
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onLogout: () async {
              await ApiClient.instance.logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ),
        GoRoute(
          path: '/customer/support',
          builder: (context, state) => SupportHelpScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
          ),
        ),

        // Technician Suite
        GoRoute(
          path: '/tech/dashboard',
          builder: (context, state) => TechDashboardScreen(
            onThemeToggle: onThemeToggle,
            isDarkMode: isDarkModeGetter(),
            onSimulateBroadcast: () => context.push('/tech/broadcast'),
            onOpenWallet: () => context.push('/tech/wallet'),
          ),
        ),
        GoRoute(
          path: '/tech/broadcast',
          builder: (context, state) => TechBroadcastScreen(
            onAccept: () => context.go('/tech/execution'),
            onDecline: () => context.canPop() ? context.pop() : context.go('/tech/dashboard'),
          ),
        ),
        GoRoute(
          path: '/tech/execution',
          builder: (context, state) => TechJobExecutionScreen(
            onJobCompleted: () => context.go('/tech/wallet'),
            onOpenChat: () => context.push('/common/chat'),
          ),
        ),
        GoRoute(
          path: '/tech/wallet',
          builder: (context, state) => TechWalletScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/tech/dashboard'),
          ),
        ),
        GoRoute(
          path: '/tech/onboarding',
          builder: (context, state) => TechOnboardingScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/tech/dashboard'),
            onFinishOnboarding: () => context.go('/tech/dashboard'),
          ),
        ),
        GoRoute(
          path: '/tech/history',
          builder: (context, state) => TechHistoryScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/tech/dashboard'),
          ),
        ),

        // Common Suite
        GoRoute(
          path: '/common/chat',
          builder: (context, state) => InAppChatScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
          ),
        ),
        GoRoute(
          path: '/common/utilities',
          builder: (context, state) => CommonUtilitiesScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
          ),
        ),
      ],
    );
  }
}
