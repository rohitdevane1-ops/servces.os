package com.serviceos.app.ui.preview

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import com.serviceos.app.core.theme.ServiceOSTheme
import com.serviceos.app.ui.common.*
import com.serviceos.app.ui.customer.*
import com.serviceos.app.ui.technician.*

// =============================================================================
// 1. COMMON SUITE PREVIEW GALLERY (5 SCREENS)
// =============================================================================

@Preview(name = "01 Splash", group = "1 - Common", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewSplashScreen() {
    ServiceOSTheme(darkTheme = false) { SplashScreen() }
}

@Preview(name = "02 Login", group = "1 - Common", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewLoginScreen() {
    ServiceOSTheme(darkTheme = false) { LoginScreen() }
}

@Preview(name = "03 Role Gateway", group = "1 - Common", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewRoleGatewayScreen() {
    ServiceOSTheme(darkTheme = false) { RoleGatewayScreen() }
}

@Preview(name = "04 In-App Chat", group = "1 - Common", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewInAppChatScreen() {
    ServiceOSTheme(darkTheme = false) { InAppChatScreen() }
}

@Preview(name = "05 Common Utilities", group = "1 - Common", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewCommonUtilitiesScreen() {
    ServiceOSTheme(darkTheme = false) { CommonUtilitiesScreen() }
}

// =============================================================================
// 2. CUSTOMER SUITE PREVIEW GALLERY (11 SCREENS)
// =============================================================================

@Preview(name = "06 Discover Home", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewCustomerDiscoverScreen() {
    ServiceOSTheme(darkTheme = false) { CustomerDiscoverScreen() }
}

@Preview(name = "07 Global Search", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewGlobalSearchScreen() {
    ServiceOSTheme(darkTheme = false) { GlobalSearchScreen() }
}

@Preview(name = "08 Category Feed", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewCategoryFeedScreen() {
    ServiceOSTheme(darkTheme = false) { CategoryFeedScreen() }
}

@Preview(name = "09 Service Detail", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewServiceDetailScreen() {
    ServiceOSTheme(darkTheme = false) { ServiceDetailScreen() }
}

@Preview(name = "10 Booking Wizard", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewBookingWizardScreen() {
    ServiceOSTheme(darkTheme = false) { BookingWizardScreen() }
}

@Preview(name = "11 Live Dispatch Radar", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewLiveDispatchRadarScreen() {
    ServiceOSTheme(darkTheme = false) { LiveDispatchRadarScreen() }
}

@Preview(name = "12 Work Order Completion", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewWorkOrderCompletionScreen() {
    ServiceOSTheme(darkTheme = false) { WorkOrderCompletionScreen() }
}

@Preview(name = "13 My Bookings", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewMyBookingsScreen() {
    ServiceOSTheme(darkTheme = false) { MyBookingsScreen() }
}

@Preview(name = "14 Invoice Receipt", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewInvoiceReceiptScreen() {
    ServiceOSTheme(darkTheme = false) { InvoiceReceiptScreen() }
}

@Preview(name = "15 Customer Profile", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewCustomerProfileScreen() {
    ServiceOSTheme(darkTheme = false) { CustomerProfileScreen() }
}

@Preview(name = "16 Support & Help", group = "2 - Customer", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewSupportHelpScreen() {
    ServiceOSTheme(darkTheme = false) { SupportHelpScreen() }
}

// =============================================================================
// 3. TECHNICIAN SUITE PREVIEW GALLERY (6 SCREENS)
// =============================================================================

@Preview(name = "17 Tech Dashboard", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechDashboardScreen() {
    ServiceOSTheme(darkTheme = false) { TechDashboardScreen() }
}

@Preview(name = "18 Tech Broadcast Alert", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechBroadcastScreen() {
    ServiceOSTheme(darkTheme = false) { TechBroadcastScreen() }
}

@Preview(name = "19 Tech Job Execution", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechJobExecutionScreen() {
    ServiceOSTheme(darkTheme = false) { TechJobExecutionScreen() }
}

@Preview(name = "20 Tech Wallet", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechWalletScreen() {
    ServiceOSTheme(darkTheme = false) { TechWalletScreen() }
}

@Preview(name = "21 Tech Onboarding", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechOnboardingScreen() {
    ServiceOSTheme(darkTheme = false) { TechOnboardingScreen() }
}

@Preview(name = "22 Tech History", group = "3 - Technician", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewTechHistoryScreen() {
    ServiceOSTheme(darkTheme = false) { TechHistoryScreen() }
}

// =============================================================================
// 4. NIGHT VISION (OLED DARK MODE) KEY PREVIEWS
// =============================================================================

@Preview(name = "Night - Discover Home", group = "4 - Night Vision", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewNightCustomerDiscoverScreen() {
    ServiceOSTheme(darkTheme = true) { CustomerDiscoverScreen() }
}

@Preview(name = "Night - Service Detail", group = "4 - Night Vision", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewNightServiceDetailScreen() {
    ServiceOSTheme(darkTheme = true) { ServiceDetailScreen() }
}

@Preview(name = "Night - Tech Dashboard", group = "4 - Night Vision", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewNightTechDashboardScreen() {
    ServiceOSTheme(darkTheme = true) { TechDashboardScreen() }
}

@Preview(name = "Night - Login", group = "4 - Night Vision", showBackground = true, showSystemUi = true, device = Devices.PIXEL_7)
@Composable
fun PreviewNightLoginScreen() {
    ServiceOSTheme(darkTheme = true) { LoginScreen() }
}
