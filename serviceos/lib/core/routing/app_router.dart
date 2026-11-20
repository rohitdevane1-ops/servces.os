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

/// Central GoRouter configuration mapping mobile views with role enforcement & native back-stack support.
class AppRouter {
  static final GoRouter router = createRouter(
    onThemeToggle: () {},
    isDarkModeGetter: () => false,
  );

  static GoRouter createRouter({
    required VoidCallback onThemeToggle,
    required bool Function() isDarkModeGetter,
  }) {
    return GoRouter(
      initialLocation: '/splash',
      redirect: (context, state) async {
        final isPublicRoute = state.matchedLocation == '/login' ||
            state.matchedLocation == '/splash' ||
            state.matchedLocation == '/role-gateway';

        if (isPublicRoute) return null;

        // Validate live server session and user role
        final user = await ApiClient.instance.validateSession();
        if (user == null) {
          return '/login';
        }

        final role = (user['role'] ?? '').toString().toUpperCase();

        final isTechRoute =
            state.matchedLocation.startsWith('/tech') ||
            state.matchedLocation.startsWith('/technician');
        final isCustomerRoute = state.matchedLocation.startsWith('/customer');
        final isAdminRoute = state.matchedLocation.startsWith('/admin');

        if (isTechRoute && role != 'TECHNICIAN' && role != 'ADMIN') {
          return '/customer/home';
        }
        if (isCustomerRoute && role != 'CUSTOMER' && role != 'ADMIN') {
          return '/tech/dashboard';
        }
        if (isAdminRoute && role != 'ADMIN') {
          return role == 'TECHNICIAN' ? '/tech/dashboard' : '/customer/home';
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
            onLoginSuccess: () => context.go('/role-gateway'),
            onSelectRole: () => context.go('/role-gateway'),
          ),
        ),
        GoRoute(
          path: '/role-gateway',
          builder: (context, state) => RoleGatewayScreen(
            onSelectCustomer: () => context.go('/customer/home'),
            onSelectTechnician: () => context.go('/tech/dashboard'),
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
            );
          },
        ),
        GoRoute(
          path: '/customer/booking-wizard',
          builder: (context, state) {
            final svc = state.extra is ServiceItemModel
                ? state.extra as ServiceItemModel
                : _defaultFallbackService;
            return BookingWizardScreen(
              service: svc,
              onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
              onBookingConfirmed: () => context.go('/customer/dispatch-radar'),
            );
          },
        ),
        GoRoute(
          path: '/customer/my-bookings',
          builder: (context, state) => MyBookingsScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onTrackLive: (_) => context.push('/customer/dispatch-radar'),
            onViewInvoice: (_) => context.push('/customer/invoice'),
          ),
        ),
        GoRoute(
          path: '/customer/dispatch-radar',
          builder: (context, state) => LiveDispatchRadarScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onChatWithTech: () => context.push('/common/chat'),
            onCompleteJob: () => context.push('/customer/completion'),
          ),
        ),
        GoRoute(
          path: '/customer/completion',
          builder: (context, state) => WorkOrderCompletionScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onSignOffComplete: () => context.go('/customer/invoice'),
          ),
        ),
        GoRoute(
          path: '/customer/invoice',
          builder: (context, state) => InvoiceReceiptScreen(
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/my-bookings'),
          ),
        ),
        GoRoute(
          path: '/customer/profile',
          builder: (context, state) => CustomerProfileScreen(
            isDarkMode: isDarkModeGetter(),
            onThemeToggle: onThemeToggle,
            onBack: () => context.canPop() ? context.pop() : context.go('/customer/home'),
            onLogout: () => context.go('/login'),
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
