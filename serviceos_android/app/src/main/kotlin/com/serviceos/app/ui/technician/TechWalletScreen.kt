package com.serviceos.app.ui.technician

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
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
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechWalletScreen(
    onBack: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val extraColors = LocalExtraColors.current
    val allBookings by BookingRepository.bookingsFlow.collectAsState()
    var serverAvailableBalance by remember { mutableStateOf<Double?>(null) }
    var serverLedgerRows by remember { mutableStateOf<List<Triple<String, String, String>>>(emptyList()) }
    var payoutDialogTitle by remember { mutableStateOf<String?>(null) }
    var payoutDialogMessage by remember { mutableStateOf("") }

    suspend fun refreshEarnings() {
        ApiClient.fetchTechnicianEarnings().onSuccess { json ->
            val data = json.optJSONObject("data") ?: json
            val unpaidCents = data.optDouble("unpaidBalanceCents", data.optDouble("totalEarnedCents", Double.NaN))
            if (!unpaidCents.isNaN()) {
                serverAvailableBalance = unpaidCents / 100.0
            }
            val recent = data.optJSONArray("recentCompletedBookings")
            if (recent != null && recent.length() > 0) {
                val list = mutableListOf<Triple<String, String, String>>()
                for (i in 0 until recent.length()) {
                    val row = recent.optJSONObject(i) ?: continue
                    val ref = row.optString("bookingReference", "")
                    val svcName = row.optString("serviceName", "Completed Job")
                    val netCents = row.optDouble("netEarningCents", 0.0)
                    val dateStr = row.optString("completedAt", "").take(10).ifBlank { "Settled" }
                    val label = if (ref.isNotBlank()) "$ref • $svcName" else svcName
                    list.add(Triple(label, dateStr, "+${ApiClient.formatCurrency(netCents / 100.0)}"))
                }
                serverLedgerRows = list
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshEarnings()
    }

    val completedJobs = remember(allBookings) {
        allBookings.filter { it.status == BookingStatus.COMPLETED }
    }
    val availableBalance = remember(completedJobs, serverAvailableBalance) {
        serverAvailableBalance ?: completedJobs.sumOf { it.totalAmount * 0.85 }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Earnings & Stripe Wallet") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(22.dp),
                shadowElevation = 3.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Text(
                        text = "AVAILABLE FOR CASHOUT",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            fontSize = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = ApiClient.formatCurrency(availableBalance),
                        style = MaterialTheme.typography.headlineLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 38.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = extraColors.verified,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Stripe Express Payout Account",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            ),
                            color = extraColors.verified
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    refreshEarnings()
                                    payoutDialogTitle = "Stripe Express Payout Status"
                                    payoutDialogMessage = if (availableBalance > 0.0) {
                                        "Available balance ${ApiClient.formatCurrency(availableBalance)} is eligible for disbursement via the Finance Admin Payouts desk."
                                    } else {
                                        "No unpaid completed balance is currently eligible for disbursement."
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp)
                        ) {
                            Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Sync Payouts", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        OutlinedButton(
                            onClick = {
                                payoutDialogTitle = "Scheduled Settlement"
                                payoutDialogMessage = "Double-entry ledger settlements are disbursed through your Admin Finance desk once Stripe Express transfers are reconciled."
                            },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp)
                        ) {
                            Icon(Icons.Default.AccountBalance, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Settlement Info", fontSize = 13.sp)
                        }
                    }
                }
            }

            Text(
                text = "Recent Completed Work Orders (${if (serverLedgerRows.isNotEmpty()) serverLedgerRows.size else completedJobs.size})",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            if (serverLedgerRows.isNotEmpty()) {
                serverLedgerRows.forEach { entry ->
                    PayoutItem(
                        title = entry.first,
                        date = entry.second,
                        netAmount = entry.third,
                        accentColor = extraColors.verified
                    )
                }
            } else if (completedJobs.isEmpty()) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(14.dp),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No completed job payouts recorded yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            } else {
                completedJobs.forEach { job ->
                    PayoutItem(
                        title = "${job.reference} • ${job.serviceTitle}",
                        date = job.scheduledTime,
                        netAmount = "+${ApiClient.formatCurrency(job.totalAmount * 0.85)}",
                        accentColor = extraColors.verified
                    )
                }
            }
        }
    }

    if (payoutDialogTitle != null) {
        AlertDialog(
            onDismissRequest = { payoutDialogTitle = null },
            title = { Text(payoutDialogTitle ?: "") },
            text = { Text(payoutDialogMessage) },
            confirmButton = {
                TextButton(onClick = { payoutDialogTitle = null }) {
                    Text("OK")
                }
            }
        )
    }
}

@Composable
private fun PayoutItem(title: String, date: String, netAmount: String, accentColor: Color) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(text = title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge)
                Text(text = date, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            Text(
                text = netAmount,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = accentColor
                )
            )
        }
    }
}
