package com.serviceos.app.core.navigation

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.*
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import com.serviceos.app.data.repository.ServiceRepository
import com.serviceos.app.ui.common.*
import com.serviceos.app.ui.customer.*
import com.serviceos.app.ui.technician.*

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Login : Screen("login")
    object RoleGateway : Screen("role_gateway")

    // Customer
    object CustomerHome : Screen("customer_home")
    object CustomerSearch : Screen("customer_search")
    object CustomerCategoryFeed : Screen("customer_category_feed")
    object CustomerServiceDetail : Screen("customer_service_detail")
    object CustomerBookingWizard : Screen("customer_booking_wizard")
    object CustomerDispatchRadar : Screen("customer_dispatch_radar")
    object CustomerCompletion : Screen("customer_completion")
    object CustomerMyBookings : Screen("customer_my_bookings")
    object CustomerInvoice : Screen("customer_invoice")
    object CustomerProfile : Screen("customer_profile")
    object CustomerSupport : Screen("customer_support")

    // Technician
    object TechDashboard : Screen("tech_dashboard")
    object TechBroadcast : Screen("tech_broadcast")
    object TechJobExecution : Screen("tech_job_execution")
    object TechWallet : Screen("tech_wallet")
    object TechOnboarding : Screen("tech_onboarding")
    object TechHistory : Screen("tech_history")

    // Common
    object InAppChat : Screen("in_app_chat")
    object CommonUtilities : Screen("common_utilities")
}

@Composable
fun ServiceOSNavHost(
    navController: NavHostController,
    onThemeToggle: () -> Unit = {}
) {
    var sessionChecked by remember { mutableStateOf(false) }
    var resolvedDestination by remember { mutableStateOf(Screen.Splash.route) }

    LaunchedEffect(Unit) {
        ApiClient.fetchSystemConfig()
        ServiceRepository.refreshFromBackend()

        if (!ApiClient.getAccessToken().isNullOrBlank()) {
            val result = ApiClient.validateSession()
            result.onSuccess { res ->
                val data = res.optJSONObject("data")
                val user = data?.optJSONObject("user")
                val role = user?.optString("role")?.uppercase()
                BookingRepository.syncFromBackend()
                resolvedDestination = when (role) {
                    "TECHNICIAN" -> Screen.TechDashboard.route
                    "CUSTOMER" -> Screen.CustomerHome.route
                    else -> {
                        ApiClient.clearTokens()
                        Screen.Login.route
                    }
                }
            }.onFailure {
                resolvedDestination = Screen.Login.route
            }
        } else {
            resolvedDestination = Screen.Splash.route
        }
        sessionChecked = true
    }

    if (!sessionChecked) {
        SplashScreen(onGetStarted = {})
        return
    }

    NavHost(
        navController = navController,
        startDestination = resolvedDestination,
        enterTransition = {
            fadeIn(animationSpec = tween(240)) +
                slideInHorizontally(animationSpec = tween(260, easing = FastOutSlowInEasing)) { it / 12 }
        },
        exitTransition = {
            fadeOut(animationSpec = tween(180)) +
                slideOutHorizontally(animationSpec = tween(220, easing = FastOutSlowInEasing)) { -it / 16 }
        },
        popEnterTransition = {
            fadeIn(animationSpec = tween(240)) +
                slideInHorizontally(animationSpec = tween(260, easing = FastOutSlowInEasing)) { -it / 12 }
        },
        popExitTransition = {
            fadeOut(animationSpec = tween(180)) +
                slideOutHorizontally(animationSpec = tween(220, easing = FastOutSlowInEasing)) { it / 16 }
        }
    ) {
        composable(Screen.Splash.route) {
            SplashScreen(
                onGetStarted = { navController.navigate(Screen.Login.route) }
            )
        }
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = { role ->
                    val destination = when (role.uppercase()) {
                        "TECHNICIAN" -> Screen.TechDashboard.route
                        "CUSTOMER" -> Screen.CustomerHome.route
                        else -> {
                            ApiClient.clearTokens()
                            Screen.Login.route
                        }
                    }
                    navController.navigate(destination) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        composable(Screen.RoleGateway.route) {
            val role = ApiClient.getUserRole()?.uppercase()
            RoleGatewayScreen(
                onSelectCustomer = {
                    val target = when (role) {
                        "CUSTOMER" -> Screen.CustomerHome.route
                        "TECHNICIAN" -> Screen.TechDashboard.route
                        else -> Screen.Login.route
                    }
                    navController.navigate(target) {
                        popUpTo(Screen.RoleGateway.route) { inclusive = true }
                    }
                },
                onSelectTechnician = {
                    val target = when (role) {
                        "TECHNICIAN" -> Screen.TechDashboard.route
                        "CUSTOMER" -> Screen.CustomerHome.route
                        else -> Screen.Login.route
                    }
                    navController.navigate(target) {
                        popUpTo(Screen.RoleGateway.route) { inclusive = true }
                    }
                }
            )
        }

        // Customer Suite
        composable(Screen.CustomerHome.route) {
            CustomerDiscoverScreen(
                onThemeToggle = onThemeToggle,
                onSearchClick = { navController.navigate(Screen.CustomerSearch.route) },
                onCategoryClick = { cat ->
                    ServiceRepository.selectCategory(cat)
                    navController.navigate(Screen.CustomerCategoryFeed.route)
                },
                onServiceClick = { svc ->
                    ServiceRepository.selectService(svc)
                    navController.navigate(Screen.CustomerServiceDetail.route)
                },
                onBookService = { svc ->
                    ServiceRepository.selectService(svc)
                    navController.navigate(Screen.CustomerBookingWizard.route)
                },
                onOpenBookings = { navController.navigate(Screen.CustomerMyBookings.route) },
                onOpenSupport = { navController.navigate(Screen.CustomerSupport.route) },
                onOpenProfile = { navController.navigate(Screen.CustomerProfile.route) }
            )
        }
        composable(Screen.CustomerSearch.route) {
            GlobalSearchScreen(
                onBack = { navController.popBackStack() },
                onServiceClick = { svc ->
                    ServiceRepository.selectService(svc)
                    navController.navigate(Screen.CustomerServiceDetail.route)
                }
            )
        }
        composable(Screen.CustomerCategoryFeed.route) {
            val cat = ServiceRepository.selectedCategory
            CategoryFeedScreen(
                categoryName = cat?.name ?: "Home Services",
                initialCategoryId = cat?.id,
                onBack = { navController.popBackStack() },
                onServiceClick = { svc ->
                    ServiceRepository.selectService(svc)
                    navController.navigate(Screen.CustomerServiceDetail.route)
                }
            )
        }
        composable(Screen.CustomerServiceDetail.route) {
            val svc = ServiceRepository.selectedService
            if (svc != null) {
                ServiceDetailScreen(
                    service = svc,
                    onBack = { navController.popBackStack() },
                    onBookNow = { navController.navigate(Screen.CustomerBookingWizard.route) }
                )
            } else {
                ServiceDetailScreen(
                    onBack = { navController.popBackStack() },
                    onBookNow = { navController.navigate(Screen.CustomerBookingWizard.route) }
                )
            }
        }
        composable(Screen.CustomerBookingWizard.route) {
            val svc = ServiceRepository.selectedService
            BookingWizardScreen(
                serviceId = svc?.id ?: "",
                serviceTitle = svc?.title ?: "On-Demand Home Service",
                categoryName = ServiceRepository.selectedCategory?.name ?: "Home Service",
                baseLabor = svc?.basePrice ?: 149.0,
                dispatchFee = 20.0,
                onBack = { navController.popBackStack() },
                onConfirmed = { navController.navigate(Screen.CustomerDispatchRadar.route) }
            )
        }
        composable(Screen.CustomerDispatchRadar.route) {
            val activeBooking = BookingRepository.activeBooking
            LiveDispatchRadarScreen(
                safetyPin = activeBooking?.safetyPin ?: "",
                onBack = { navController.popBackStack() },
                onChatClick = { navController.navigate(Screen.InAppChat.route) },
                onCompleteClick = { navController.navigate(Screen.CustomerCompletion.route) }
            )
        }
        composable(Screen.CustomerCompletion.route) {
            WorkOrderCompletionScreen(
                onBack = { navController.popBackStack() },
                onFinish = { navController.navigate(Screen.CustomerInvoice.route) }
            )
        }
        composable(Screen.CustomerMyBookings.route) {
            MyBookingsScreen(
                onBack = { navController.popBackStack() },
                onTrackLive = { booking ->
                    BookingRepository.selectBooking(booking)
                    navController.navigate(Screen.CustomerDispatchRadar.route)
                },
                onViewInvoice = { booking ->
                    BookingRepository.selectBooking(booking)
                    navController.navigate(Screen.CustomerInvoice.route)
                }
            )
        }
        composable(Screen.CustomerInvoice.route) {
            val activeBooking = BookingRepository.activeBooking
            InvoiceReceiptScreen(
                invoiceNo = activeBooking?.reference ?: "",
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.CustomerProfile.route) {
            CustomerProfileScreen(
                onBack = { navController.popBackStack() },
                onThemeToggle = onThemeToggle,
                onOpenUtilities = { navController.navigate(Screen.CommonUtilities.route) },
                onLogout = {
                    ApiClient.clearTokens()
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        composable(Screen.CustomerSupport.route) {
            SupportHelpScreen(
                onBack = { navController.popBackStack() }
            )
        }

        // Technician Suite
        composable(Screen.TechDashboard.route) {
            TechDashboardScreen(
                onThemeToggle = onThemeToggle,
                onSimulateBroadcast = { navController.navigate(Screen.TechBroadcast.route) },
                onOpenWallet = { navController.navigate(Screen.TechWallet.route) },
                onOpenHistory = { navController.navigate(Screen.TechHistory.route) },
                onOpenOnboarding = { navController.navigate(Screen.TechOnboarding.route) }
            )
        }
        composable(Screen.TechBroadcast.route) {
            val activeBooking = BookingRepository.activeBooking
            val total = activeBooking?.totalAmount ?: 0.0
            TechBroadcastScreen(
                netPayout = if (total > 0.0) total * 0.85 else 0.0,
                escrowTotal = total,
                jobTitle = activeBooking?.serviceTitle ?: "Field Service Order",
                distanceText = activeBooking?.customerAddress?.ifBlank { "Verified Service Location" } ?: "Verified Service Location",
                onAccept = { navController.navigate(Screen.TechJobExecution.route) },
                onDecline = { navController.popBackStack() }
            )
        }
        composable(Screen.TechJobExecution.route) {
            val activeBooking = BookingRepository.activeBooking
            TechJobExecutionScreen(
                workOrderNumber = activeBooking?.reference ?: "",
                hourlyRate = activeBooking?.baseAmount ?: 149.0,
                onJobCompleted = { navController.navigate(Screen.TechWallet.route) },
                onOpenChat = { navController.navigate(Screen.InAppChat.route) }
            )
        }
        composable(Screen.TechWallet.route) {
            TechWalletScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.TechOnboarding.route) {
            TechOnboardingScreen(
                onBack = { navController.popBackStack() },
                onFinish = { navController.navigate(Screen.TechDashboard.route) }
            )
        }
        composable(Screen.TechHistory.route) {
            TechHistoryScreen(
                onBack = { navController.popBackStack() }
            )
        }

        // Common Suite
        composable(Screen.InAppChat.route) {
            InAppChatScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.CommonUtilities.route) {
            CommonUtilitiesScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
