package com.serviceos.app.ui.technician

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import com.serviceos.app.ui.components.RadarPulseDot
import com.serviceos.app.ui.components.RevealCard
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechDashboardScreen(
    onThemeToggle: () -> Unit = {},
    onSimulateBroadcast: () -> Unit = {},
    onOpenWallet: () -> Unit = {},
    onOpenHistory: () -> Unit = {},
    onOpenOnboarding: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val bookings by BookingRepository.bookingsFlow.collectAsState()
    var isOnline by remember { mutableStateOf(true) }
    var pendingBroadcastCount by remember { mutableStateOf(0) }
    var serverEarnedAmount by remember { mutableStateOf<Double?>(null) }
    var serverCompletedCount by remember { mutableStateOf<Int?>(null) }
    val extraColors = LocalExtraColors.current

    LaunchedEffect(Unit) {
        BookingRepository.syncFromBackend()
        ApiClient.fetchPendingBroadcasts().onSuccess { arr ->
            pendingBroadcastCount = arr.length()
        }
        ApiClient.fetchTechnicianEarnings().onSuccess { json ->
            val data = json.optJSONObject("data") ?: json
            val totalEarnedCents = data.optDouble("totalEarnedCents", data.optDouble("unpaidBalanceCents", Double.NaN))
            if (!totalEarnedCents.isNaN()) {
                serverEarnedAmount = totalEarnedCents / 100.0
            }
            val count = data.optInt("completedJobsCount", -1)
            if (count >= 0) {
                serverCompletedCount = count
            }
        }
    }

    val completedJobs = remember(bookings) {
        bookings.filter { it.status == BookingStatus.COMPLETED }
    }
    val completedJobsDisplayCount = serverCompletedCount ?: completedJobs.size
    val todayNetEarnings = remember(completedJobs, serverEarnedAmount) {
        serverEarnedAmount ?: completedJobs.sumOf { it.totalAmount * 0.85 }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "ServiceOS Pro Radar",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = "Verified Service Specialist",
                            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onThemeToggle) {
                        Icon(Icons.Default.BrightnessMedium, contentDescription = "Toggle Theme")
                    }
                    IconButton(onClick = onOpenWallet) {
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Wallet")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Radar Online / Offline Toggle Card
            RevealCard(index = 0) {
            Surface(
                color = if (isOnline) extraColors.verified.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(18.dp),
                border = androidx.compose.foundation.BorderStroke(
                    width = 1.dp,
                    color = if (isOnline) extraColors.verified else MaterialTheme.colorScheme.outline
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadarPulseDot(
                            color = if (isOnline) extraColors.verified else MaterialTheme.colorScheme.outline,
                            isActive = isOnline,
                            size = 11.dp
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = if (isOnline) "ONLINE ON RADAR" else "OFFLINE",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 14.sp
                                ),
                                color = if (isOnline) extraColors.verified else MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = if (isOnline) "Receiving active service area broadcasts" else "Go online to receive jobs",
                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 11.sp),
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }
                    Switch(
                        checked = isOnline,
                        onCheckedChange = {
                            isOnline = it
                            coroutineScope.launch {
                                ApiClient.updateDutyStatus(if (it) "ONLINE" else "OFFLINE")
                            }
                        }
                    )
                }
            }
            }

            // 2. Today's Net Earnings Card (85% Net Escrow Share)
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(20.dp),
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "TODAY'S NET PAYOUTS (85%)",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                fontSize = 10.sp
                            ),
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                        Text(
                            text = "Stripe Express",
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold
                            )
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = ApiClient.formatCurrency(todayNetEarnings),
                        style = MaterialTheme.typography.headlineLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 32.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "$completedJobsDisplayCount Completed Jobs • Verified Pro",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = extraColors.verified
                        )
                    )
                }
            }

            // 3. Central Dispatch Radar Pulse Simulation
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    color = (if (isOnline) extraColors.verified else MaterialTheme.colorScheme.primary).copy(alpha = 0.15f),
                    shape = CircleShape,
                    modifier = Modifier.size(170.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Surface(
                            color = (if (isOnline) extraColors.verified else MaterialTheme.colorScheme.primary).copy(alpha = 0.35f),
                            shape = CircleShape,
                            modifier = Modifier.size(110.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Surface(
                                    color = if (isOnline) extraColors.verified else MaterialTheme.colorScheme.primary,
                                    shape = CircleShape,
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.WifiTethering,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Text(
                text = "Scanning active dispatch radius...",
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 12.sp),
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )

            // 4. Quick Action Buttons
            Button(
                onClick = onSimulateBroadcast,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (pendingBroadcastCount > 0) {
                        "View Active Broadcasts ($pendingBroadcastCount)"
                    } else {
                        "Check Dispatch Broadcasts"
                    },
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.ExtraBold)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onOpenHistory,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Scorecard")
                }
                OutlinedButton(
                    onClick = onOpenOnboarding,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Badge, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Credentials")
                }
            }
        }
    }
}
