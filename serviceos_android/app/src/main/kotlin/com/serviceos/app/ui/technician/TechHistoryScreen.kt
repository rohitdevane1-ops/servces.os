package com.serviceos.app.ui.technician

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechHistoryScreen(
    onBack: () -> Unit = {}
) {
    val extraColors = LocalExtraColors.current
    val allBookings by BookingRepository.bookingsFlow.collectAsState()
    var completedCount by remember { mutableStateOf<Int?>(null) }
    var totalEarned by remember { mutableStateOf<Double?>(null) }

    val checklistItems = remember {
        mutableStateListOf(
            "Drain & Pipe Diagnostic Kit Inspected" to true,
            "Cordless Expansion & Torque Tools Charged" to true,
            "Digital Inspection Borescope Operational" to true,
            "PPE, Lockout/Tagout & Safety Kit Stocked" to true
        )
    }

    LaunchedEffect(Unit) {
        BookingRepository.syncFromBackend()
        ApiClient.fetchTechnicianEarnings().onSuccess { json ->
            val data = json.optJSONObject("data") ?: json
            val count = data.optInt("completedJobsCount", -1)
            if (count >= 0) completedCount = count
            val earnedCents = data.optDouble("totalEarnedCents", Double.NaN)
            if (!earnedCents.isNaN()) totalEarned = earnedCents / 100.0
        }
    }

    val localCompleted = remember(allBookings) {
        allBookings.filter { it.status == BookingStatus.COMPLETED }
    }
    val resolvedCompletedCount = completedCount ?: localCompleted.size
    val resolvedEarned = totalEarned ?: localCompleted.sumOf { it.totalAmount * 0.85 }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pro Scorecard & Van Audit") },
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
                shape = RoundedCornerShape(20.dp),
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("PRO PERFORMANCE SUMMARY", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = extraColors.rating)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Technician Scorecard", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black))
                    Text(
                        text = if (resolvedCompletedCount > 0) {
                            "Synced from completed work orders & ledger"
                        } else {
                            "No completed work orders recorded yet"
                        },
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("$resolvedCompletedCount", fontWeight = FontWeight.Black, fontSize = 20.sp, color = extraColors.verified)
                            Text("Completed Jobs", fontSize = 11.sp)
                        }
                        Column {
                            Text(
                                text = if (resolvedEarned > 0.0) ApiClient.formatCurrency(resolvedEarned) else "—",
                                fontWeight = FontWeight.Black,
                                fontSize = 20.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text("Net Earnings", fontSize = 11.sp)
                        }
                        Column {
                            val checkedCount = checklistItems.count { it.second }
                            Text("$checkedCount/${checklistItems.size}", fontWeight = FontWeight.Black, fontSize = 20.sp, color = extraColors.rating)
                            Text("Van Audit", fontSize = 11.sp)
                        }
                    }
                }
            }

            Text("Daily Van Tools & Safety Checklist", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
            checklistItems.forEachIndexed { idx, item ->
                VanCheckItem(
                    title = item.first,
                    checked = item.second,
                    onToggle = {
                        checklistItems[idx] = item.first to !item.second
                    }
                )
            }
        }
    }
}

@Composable
private fun VanCheckItem(title: String, checked: Boolean, onToggle: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() }
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (checked) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(text = title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
        }
    }
}
