package com.serviceos.app.ui.customer

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.data.model.Booking
import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.launch
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyBookingsScreen(
    onBack: () -> Unit = {},
    onTrackLive: (Booking) -> Unit = {},
    onViewInvoice: (Booking) -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(0) }
    val allBookings by BookingRepository.bookingsFlow.collectAsState()
    var isSyncing by remember { mutableStateOf(false) }
    var feedbackMessage by remember { mutableStateOf<String?>(null) }

    var cancelTarget by remember { mutableStateOf<Booking?>(null) }
    var cancelReason by remember { mutableStateOf("Schedule changed") }
    var rescheduleTarget by remember { mutableStateOf<Booking?>(null) }
    var rescheduleHoursAhead by remember { mutableStateOf(4) }
    var rescheduleReason by remember { mutableStateOf("Customer requested updated slot") }
    var isMutating by remember { mutableStateOf(false) }

    fun refreshList() {
        isSyncing = true
        coroutineScope.launch {
            BookingRepository.syncFromBackend()
            isSyncing = false
        }
    }

    LaunchedEffect(Unit) {
        refreshList()
    }

    val activeBookings = remember(allBookings) {
        allBookings.filter { it.status != BookingStatus.COMPLETED && it.status != BookingStatus.CANCELLED }
    }
    val pastBookings = remember(allBookings) {
        allBookings.filter { it.status == BookingStatus.COMPLETED || it.status == BookingStatus.CANCELLED }
    }
    val displayed = if (selectedTab == 0) activeBookings else pastBookings

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Bookings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { refreshList() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh Bookings")
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
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Active (${activeBookings.size})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Past (${pastBookings.size})") }
                )
            }

            if (isSyncing) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            if (!feedbackMessage.isNullOrBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(
                        text = feedbackMessage ?: "",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            if (displayed.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (selectedTab == 0) "No active bookings found." else "No past bookings found.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    items(displayed, key = { it.id.ifBlank { it.reference } }) { booking ->
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(16.dp),
                            shadowElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = booking.status.label,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = ApiClient.formatCurrency(booking.totalAmount),
                                        fontWeight = FontWeight.ExtraBold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = booking.serviceTitle,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${booking.reference.ifBlank { "Order" }} • ${booking.technicianName} • ${booking.scheduledTime}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                                )
                                Spacer(modifier = Modifier.height(14.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    OutlinedButton(
                                        onClick = { onViewInvoice(booking) },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text("View Invoice")
                                    }
                                    Button(
                                        onClick = { onTrackLive(booking) },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = MaterialTheme.colorScheme.primary
                                        )
                                    ) {
                                        Text("Track Live")
                                    }
                                }
                                if (booking.status != BookingStatus.COMPLETED && booking.status != BookingStatus.CANCELLED) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        TextButton(
                                            onClick = {
                                                rescheduleTarget = booking
                                            },
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Text("Reschedule", fontSize = 12.sp)
                                        }
                                        TextButton(
                                            onClick = {
                                                cancelTarget = booking
                                            },
                                            modifier = Modifier.weight(1f),
                                            colors = ButtonDefaults.textButtonColors(
                                                contentColor = MaterialTheme.colorScheme.error
                                            )
                                        ) {
                                            Text("Cancel Booking", fontSize = 12.sp)
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

    if (cancelTarget != null) {
        val target = cancelTarget!!
        AlertDialog(
            onDismissRequest = { if (!isMutating) cancelTarget = null },
            title = { Text("Cancel Booking ${target.reference.ifBlank { "" }}?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("This will cancel the dispatch order and void or refund any active escrow hold.")
                    OutlinedTextField(
                        value = cancelReason,
                        onValueChange = { cancelReason = it },
                        label = { Text("Cancellation Reason") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = !isMutating,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    onClick = {
                        isMutating = true
                        coroutineScope.launch {
                            val res = BookingRepository.cancelBooking(target.id, cancelReason.trim().ifBlank { "Cancelled by customer" })
                            isMutating = false
                            cancelTarget = null
                            feedbackMessage = res.fold(
                                onSuccess = { "Booking cancelled on server." },
                                onFailure = { it.message ?: "Unable to cancel booking." }
                            )
                        }
                    }
                ) {
                    Text("Confirm Cancel")
                }
            },
            dismissButton = {
                TextButton(enabled = !isMutating, onClick = { cancelTarget = null }) {
                    Text("Keep Booking")
                }
            }
        )
    }

    if (rescheduleTarget != null) {
        val target = rescheduleTarget!!
        AlertDialog(
            onDismissRequest = { if (!isMutating) rescheduleTarget = null },
            title = { Text("Reschedule ${target.reference.ifBlank { "Booking" }}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Choose updated arrival offset from now:")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(2, 4, 24).forEach { hrs ->
                            FilterChip(
                                selected = rescheduleHoursAhead == hrs,
                                onClick = { rescheduleHoursAhead = hrs },
                                label = { Text(if (hrs == 24) "+24h" else "+${hrs}h") }
                            )
                        }
                    }
                    OutlinedTextField(
                        value = rescheduleReason,
                        onValueChange = { rescheduleReason = it },
                        label = { Text("Reschedule Note") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = !isMutating,
                    onClick = {
                        isMutating = true
                        val targetIso = ZonedDateTime.now().plusHours(rescheduleHoursAhead.toLong())
                            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                        coroutineScope.launch {
                            val res = BookingRepository.rescheduleBooking(target.id, targetIso, rescheduleReason.trim())
                            isMutating = false
                            rescheduleTarget = null
                            feedbackMessage = res.fold(
                                onSuccess = { "Booking rescheduled successfully." },
                                onFailure = { it.message ?: "Unable to reschedule booking." }
                            )
                        }
                    }
                ) {
                    Text("Save New Time")
                }
            },
            dismissButton = {
                TextButton(enabled = !isMutating, onClick = { rescheduleTarget = null }) {
                    Text("Dismiss")
                }
            }
        )
    }
}
