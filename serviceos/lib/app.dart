import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'features/onboarding/presentation/screens/splash_screen.dart';
import 'features/authentication/presentation/screens/login_screen.dart';
import 'features/authentication/presentation/screens/role_gateway_screen.dart';
import 'features/dashboard/presentation/screens/customer_discover_screen.dart';
import 'features/services/presentation/screens/global_search_screen.dart';
import 'features/services/presentation/screens/category_feed_screen.dart';
import 'features/services/presentation/screens/service_detail_screen.dart';
import 'features/bookings/presentation/screens/booking_wizard_screen.dart';
import 'features/bookings/presentation/screens/my_bookings_screen.dart';
import 'features/dispatch/presentation/screens/live_dispatch_radar_screen.dart';
import 'features/dispatch/presentation/screens/work_order_completion_screen.dart';
import 'features/invoices/presentation/screens/invoice_receipt_screen.dart';
import 'features/profile/presentation/screens/customer_profile_screen.dart';
import 'features/support/presentation/screens/support_help_screen.dart';
import 'features/technicians/presentation/screens/tech_dashboard_screen.dart';
import 'features/technicians/presentation/screens/tech_broadcast_screen.dart';
import 'features/technicians/presentation/screens/tech_job_execution_screen.dart';
import 'features/technicians/presentation/screens/tech_wallet_screen.dart';
import 'features/technicians/presentation/screens/tech_onboarding_screen.dart';
import 'features/technicians/presentation/screens/tech_history_screen.dart';
import 'features/common/presentation/screens/in_app_chat_screen.dart';
import 'features/common/presentation/screens/common_utilities_screen.dart';

enum AppViewMode {
  splash,
  login,
  roleGateway,
  // Customer Views
  customerHome,
  customerSearch,
  customerCategories,
  customerServiceDetail,
  customerBookingWizard,
  customerMyBookings,
  customerDispatchRadar,
  customerCompletion,
  customerInvoice,
  customerProfile,
  customerSupport,
  // Technician Views
  techHome,
  techBroadcast,
  techJobExecution,
  techWallet,
  techOnboarding,
  techHistory,
  // Common Views
  commonChat,
  commonUtilities,
}

class ServiceOSApp extends StatefulWidget {
  const ServiceOSApp({super.key});

  @override
  State<ServiceOSApp> createState() => _ServiceOSAppState();
}

class _ServiceOSAppState extends State<ServiceOSApp> {
  bool _isDarkMode = false;
  AppViewMode _currentView = AppViewMode.splash; // Secure startup flow: Splash -> Login -> RoleGateway

  void _toggleTheme() {
    setState(() {
      _isDarkMode = !_isDarkMode;
    });
  }

  void _navigateTo(AppViewMode mode) {
    setState(() {
      _currentView = mode;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ServiceOS',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dayTheme,
      darkTheme: AppTheme.nightTheme,
      themeMode: _isDarkMode ? ThemeMode.dark : ThemeMode.light,
      home: _buildCurrentScreen(),
    );
  }

  Widget _buildCurrentScreen() {
    switch (_currentView) {
      case AppViewMode.splash:
        return SplashScreen(
          onGetStarted: () => _navigateTo(AppViewMode.login),
        );

      case AppViewMode.login:
        return LoginScreen(
          onLoginSuccess: () => _navigateTo(AppViewMode.roleGateway),
          onSelectRole: () => _navigateTo(AppViewMode.roleGateway),
        );

      case AppViewMode.roleGateway:
        return RoleGatewayScreen(
          onSelectCustomer: () => _navigateTo(AppViewMode.customerHome),
          onSelectTechnician: () => _navigateTo(AppViewMode.techHome),
        );

      // Customer
      case AppViewMode.customerHome:
        return CustomerDiscoverScreen(
          onThemeToggle: _toggleTheme,
          isDarkMode: _isDarkMode,
          onOpenSearch: () => _navigateTo(AppViewMode.customerSearch),
          onSelectCategory: () => _navigateTo(AppViewMode.customerCategories),
          onSelectService: () => _navigateTo(AppViewMode.customerServiceDetail),
          onOpenMyBookings: () => _navigateTo(AppViewMode.customerMyBookings),
          onOpenProfile: () => _navigateTo(AppViewMode.customerProfile),
        );

      case AppViewMode.customerSearch:
        return GlobalSearchScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onSelectService: () => _navigateTo(AppViewMode.customerServiceDetail),
        );

      case AppViewMode.customerCategories:
        return CategoryFeedScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onSelectService: () => _navigateTo(AppViewMode.customerServiceDetail),
        );

      case AppViewMode.customerServiceDetail:
        return ServiceDetailScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onBookNow: () => _navigateTo(AppViewMode.customerBookingWizard),
        );

      case AppViewMode.customerBookingWizard:
        return BookingWizardScreen(
          onBack: () => _navigateTo(AppViewMode.customerServiceDetail),
          onConfirmed: () => _navigateTo(AppViewMode.customerDispatchRadar),
        );

      case AppViewMode.customerMyBookings:
        return MyBookingsScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onTrackLive: (_) => _navigateTo(AppViewMode.customerDispatchRadar),
          onViewInvoice: (_) => _navigateTo(AppViewMode.customerInvoice),
        );

      case AppViewMode.customerDispatchRadar:
        return LiveDispatchRadarScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onChatWithTech: () => _navigateTo(AppViewMode.commonChat),
          onCompleteJob: () => _navigateTo(AppViewMode.customerCompletion),
        );

      case AppViewMode.customerCompletion:
        return WorkOrderCompletionScreen(
          onDone: () => _navigateTo(AppViewMode.customerInvoice),
        );

      case AppViewMode.customerInvoice:
        return InvoiceReceiptScreen(
          onBack: () => _navigateTo(AppViewMode.customerMyBookings),
        );

      case AppViewMode.customerProfile:
        return CustomerProfileScreen(
          isDarkMode: _isDarkMode,
          onThemeToggle: _toggleTheme,
          onBack: () => _navigateTo(AppViewMode.customerHome),
          onLogout: () => _navigateTo(AppViewMode.login),
        );

      case AppViewMode.customerSupport:
        return SupportHelpScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
        );

      // Technician
      case AppViewMode.techHome:
        return TechDashboardScreen(
          onThemeToggle: _toggleTheme,
          isDarkMode: _isDarkMode,
          onSimulateBroadcast: () => _navigateTo(AppViewMode.techBroadcast),
          onOpenWallet: () => _navigateTo(AppViewMode.techWallet),
          onOpenHistory: () => _navigateTo(AppViewMode.techHistory),
          onOpenOnboarding: () => _navigateTo(AppViewMode.techOnboarding),
        );

      case AppViewMode.techBroadcast:
        return TechBroadcastScreen(
          onAccept: () => _navigateTo(AppViewMode.techJobExecution),
          onDecline: () => _navigateTo(AppViewMode.techHome),
        );

      case AppViewMode.techJobExecution:
        return TechJobExecutionScreen(
          onJobCompleted: () => _navigateTo(AppViewMode.techWallet),
          onOpenChat: () => _navigateTo(AppViewMode.commonChat),
        );

      case AppViewMode.techWallet:
        return TechWalletScreen(
          onBack: () => _navigateTo(AppViewMode.techHome),
        );

      case AppViewMode.techOnboarding:
        return TechOnboardingScreen(
          onBack: () => _navigateTo(AppViewMode.techHome),
          onFinishOnboarding: () => _navigateTo(AppViewMode.techHome),
        );

      case AppViewMode.techHistory:
        return TechHistoryScreen(
          onBack: () => _navigateTo(AppViewMode.techHome),
        );

      // Common
      case AppViewMode.commonChat:
        return InAppChatScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
        );

      case AppViewMode.commonUtilities:
        return CommonUtilitiesScreen(
          onBack: () => _navigateTo(AppViewMode.customerHome),
        );
    }
  }
}
