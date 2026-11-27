package com.serviceos.app.ui.debug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.serviceos.app.core.navigation.Screen

private data class InspectorScreenEntry(
    val title: String,
    val route: String,
    val icon: ImageVector
)

private data class InspectorSection(
    val header: String,
    val screens: List<InspectorScreenEntry>
)

private val inspectorSections = listOf(
    InspectorSection(
        header = "Common Suite (5)",
        screens = listOf(
            InspectorScreenEntry("Splash Screen", Screen.Splash.route, Icons.Default.AutoAwesome),
            InspectorScreenEntry("Sign In & MFA", Screen.Login.route, Icons.Default.Lock),
            InspectorScreenEntry("Role Gateway", Screen.RoleGateway.route, Icons.Default.SwitchAccount),
            InspectorScreenEntry("In-App Chat & VoIP", Screen.InAppChat.route, Icons.Default.Chat),
            InspectorScreenEntry("System Utilities", Screen.CommonUtilities.route, Icons.Default.Tune)
        )
    ),
    InspectorSection(
        header = "Customer Suite (11)",
        screens = listOf(
            InspectorScreenEntry("Discover Home", Screen.CustomerHome.route, Icons.Default.Home),
            InspectorScreenEntry("Global Search", Screen.CustomerSearch.route, Icons.Default.Search),
            InspectorScreenEntry("Category Feed", Screen.CustomerCategoryFeed.route, Icons.Default.Category),
            InspectorScreenEntry("Service Detail", Screen.CustomerServiceDetail.route, Icons.Default.HomeRepairService),
            InspectorScreenEntry("Booking Wizard", Screen.CustomerBookingWizard.route, Icons.Default.EventAvailable),
            InspectorScreenEntry("Live Dispatch Radar", Screen.CustomerDispatchRadar.route, Icons.Default.Radar),
            InspectorScreenEntry("Work Order Completion", Screen.CustomerCompletion.route, Icons.Default.Verified),
            InspectorScreenEntry("My Bookings", Screen.CustomerMyBookings.route, Icons.Default.CalendarMonth),
            InspectorScreenEntry("Invoice Receipt", Screen.CustomerInvoice.route, Icons.Default.ReceiptLong),
            InspectorScreenEntry("Customer Profile", Screen.CustomerProfile.route, Icons.Default.Person),
            InspectorScreenEntry("Support & Help", Screen.CustomerSupport.route, Icons.Default.SupportAgent)
        )
    ),
    InspectorSection(
        header = "Technician Suite (6)",
        screens = listOf(
            InspectorScreenEntry("Pro Radar Dashboard", Screen.TechDashboard.route, Icons.Default.WifiTethering),
            InspectorScreenEntry("60s Broadcast Alert", Screen.TechBroadcast.route, Icons.Default.NotificationsActive),
            InspectorScreenEntry("Job Execution & Proof", Screen.TechJobExecution.route, Icons.Default.Build),
            InspectorScreenEntry("Earnings Wallet", Screen.TechWallet.route, Icons.Default.AccountBalanceWallet),
            InspectorScreenEntry("Pro Onboarding", Screen.TechOnboarding.route, Icons.Default.Badge),
            InspectorScreenEntry("Job Scorecard History", Screen.TechHistory.route, Icons.Default.History)
        )
    )
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebugScreenInspectorOverlay(
    navController: NavHostController,
    isDarkMode: Boolean,
    onThemeToggle: () -> Unit
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    var showSheet by remember { mutableStateOf(false) }

    if (backStackEntry == null || currentRoute == Screen.Splash.route) {
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Compact translucent circular button tucked safely above bottom navigation
        Surface(
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
            shape = CircleShape,
            shadowElevation = 6.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(end = 14.dp, bottom = 86.dp)
                .size(40.dp)
                .clickable { showSheet = true }
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Apps,
                    contentDescription = "Browse All 22 Screens",
                    tint = Color.White,
                    modifier = Modifier.size(19.dp)
                )
            }
        }
    }

    if (showSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Live Screen Explorer (22)",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Tap any screen to inspect live on emulator",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                        )
                    }

                    FilledTonalButton(
                        onClick = onThemeToggle,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(
                            imageVector = if (isDarkMode) Icons.Default.LightMode else Icons.Default.DarkMode,
                            contentDescription = "Toggle Vision Mode",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isDarkMode) "Day" else "Night",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 460.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(bottom = 24.dp)
                ) {
                    inspectorSections.forEach { section ->
                        item(key = "hdr_${section.header}") {
                            Text(
                                text = section.header.uppercase(),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 0.8.sp
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = 8.dp, bottom = 2.dp)
                            )
                        }

                        items(section.screens, key = { it.route }) { entry ->
                            val isActive = currentRoute == entry.route
                            Surface(
                                color = if (isActive) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                } else {
                                    MaterialTheme.colorScheme.background
                                },
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .border(
                                        width = if (isActive) 1.5.dp else 1.dp,
                                        color = if (isActive) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
                                        },
                                        shape = RoundedCornerShape(14.dp)
                                    )
                                    .clickable {
                                        showSheet = false
                                        runCatching {
                                            navController.navigate(entry.route) {
                                                launchSingleTop = true
                                            }
                                        }
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(34.dp)
                                            .clip(CircleShape)
                                            .background(
                                                if (isActive) {
                                                    Brush.linearGradient(
                                                        listOf(
                                                            MaterialTheme.colorScheme.primary,
                                                            MaterialTheme.colorScheme.secondary
                                                        )
                                                    )
                                                } else {
                                                    Brush.linearGradient(
                                                        listOf(
                                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                                        )
                                                    )
                                                }
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = entry.icon,
                                            contentDescription = entry.title,
                                            tint = if (isActive) Color.White else MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = entry.title,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = entry.route,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
                                        )
                                    }
                                    if (isActive) {
                                        Text(
                                            text = "ACTIVE",
                                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.ExtraBold),
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Default.ChevronRight,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
