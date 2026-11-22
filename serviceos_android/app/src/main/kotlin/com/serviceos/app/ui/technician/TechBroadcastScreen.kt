package com.serviceos.app.ui.technician

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun TechBroadcastScreen(
    onAccept: () -> Unit = {},
    onDecline: () -> Unit = {},
    netPayout: Double = 0.0,
    escrowTotal: Double = 0.0,
    jobTitle: String = "Field Service Order",
    distanceText: String = "Verified Customer Location",
    customerNote: String = "Service instructions provided upon dispatch acceptance."
) {
    val coroutineScope = rememberCoroutineScope()
    var broadcast by remember { mutableStateOf<JSONObject?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var countdownSeconds by remember { mutableStateOf(60) }
    val extraColors = LocalExtraColors.current

    fun applyBroadcastPayload(item: JSONObject?) {
        broadcast = item
        if (item != null) {
            val rem = item.optInt("remainingSeconds", item.optInt("ttlSeconds", 60))
            countdownSeconds = if (rem > 0) rem else 60
        }
    }

    suspend fun loadPendingBroadcast() {
        isLoading = true
        errorMessage = null
        val res = ApiClient.fetchPendingBroadcasts()
        res.onSuccess { arr ->
            val first = if (arr.length() > 0) arr.optJSONObject(0) else null
            applyBroadcastPayload(first)
        }.onFailure { err ->
            errorMessage = err.message
        }
        isLoading = false
    }

    LaunchedEffect(Unit) {
        loadPendingBroadcast()
    }

    val activeId = broadcast?.let {
        it.optString("id", it.optString("broadcastId", ""))
    } ?: ""

    LaunchedEffect(activeId, countdownSeconds) {
        if (activeId.isNotBlank() && countdownSeconds > 0) {
            delay(1000L)
            countdownSeconds = (countdownSeconds - 1).coerceAtLeast(0)
        }
    }

    val hasLiveBroadcast = broadcast != null
    val displayTitle = broadcast?.let {
        it.optString("serviceTitle", it.optString("serviceName", jobTitle)).ifBlank { jobTitle }
    } ?: jobTitle
    val displayEscrow = broadcast?.let {
        val cents = it.optDouble("totalAuthorizedCents", it.optDouble("totalAmountCents", Double.NaN))
        if (!cents.isNaN() && cents > 0) cents / 100.0
        else it.optDouble("totalAuthorized", it.optDouble("escrowTotal", escrowTotal))
    } ?: escrowTotal
    val displayNetPayout = broadcast?.let {
        val netCents = it.optDouble("netTechPayoutCents", it.optDouble("netPayoutCents", Double.NaN))
        if (!netCents.isNaN() && netCents > 0) netCents / 100.0
        else {
            val direct = it.optDouble("netPayout", Double.NaN)
            if (!direct.isNaN() && direct > 0) direct else displayEscrow * 0.85
        }
    } ?: if (netPayout > 0.0) netPayout else displayEscrow * 0.85
    val displayDistance = broadcast?.let {
        val addr = it.optString("customerAddress", it.optString("addressText", ""))
        val km = it.optDouble("distanceKm", Double.NaN)
        when {
            addr.isNotBlank() && !km.isNaN() -> "$addr (${String.format(java.util.Locale.US, "%.1f", km)} km)"
            addr.isNotBlank() -> addr
            !km.isNaN() -> "${String.format(java.util.Locale.US, "%.1f", km)} km away"
            else -> distanceText
        }
    } ?: distanceText
    val displayNote = broadcast?.let {
        it.optString("customerNotes", it.optString("accessInstructions", customerNote)).ifBlank { customerNote }
    } ?: customerNote

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (!hasLiveBroadcast && escrowTotal <= 0.0) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.FlashOn,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "No Active Dispatch Broadcasts",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = errorMessage ?: "Stay online to receive incoming 60-second emergency dispatches near you.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = { coroutineScope.launch { loadPendingBroadcast() } },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Check Dispatch Queue")
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedButton(onClick = onDecline, modifier = Modifier.fillMaxWidth()) {
                        Text("Back to Radar")
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (!errorMessage.isNullOrBlank()) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }

                    // Top Broadcast Bar & 60s Countdown
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.FlashOn,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "EMERGENCY BROADCAST",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 0.8.sp
                                    ),
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Timer,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "${countdownSeconds}s left",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.error
                                )
                            )
                        }
                    }

                    LinearProgressIndicator(
                        progress = (countdownSeconds / 60f).coerceIn(0f, 1f),
                        color = MaterialTheme.colorScheme.error,
                        trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
                        modifier = Modifier.fillMaxWidth()
                    )

                    // Large Net Payout Card
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(20.dp),
                        shadowElevation = 3.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(
                                text = "GUARANTEED NET PAYOUT (85%)",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                    fontSize = 11.sp
                                ),
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = ApiClient.formatCurrency(displayNetPayout),
                                style = MaterialTheme.typography.headlineLarge.copy(
                                    fontWeight = FontWeight.Black,
                                    fontSize = 36.sp,
                                    color = extraColors.verified
                                )
                            )
                            Text(
                                text = "Customer Escrow Total: ${ApiClient.formatCurrency(displayEscrow)} (15% platform fee deducted automatically)",
                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 11.sp),
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }

                    // Job Details Card
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(20.dp),
                        shadowElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(
                                text = displayTitle,
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Black,
                                    fontSize = 20.sp
                                ),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.LocationOn,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = displayDistance,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            Divider(modifier = Modifier.padding(vertical = 14.dp))

                            Text(
                                text = "Customer Note:",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "\"$displayNote\"",
                                style = MaterialTheme.typography.bodyMedium,
                                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Bottom Accept / Decline Buttons
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        enabled = !isSubmitting && countdownSeconds > 0,
                        onClick = {
                            isSubmitting = true
                            errorMessage = null
                            coroutineScope.launch {
                                val res = if (activeId.isNotBlank()) {
                                    ApiClient.acceptBroadcast(activeId)
                                } else {
                                    Result.failure(Exception("No active dispatch ID available to accept."))
                                }
                                res.onSuccess {
                                    BookingRepository.syncFromBackend()
                                    isSubmitting = false
                                    onAccept()
                                }.onFailure { err ->
                                    isSubmitting = false
                                    errorMessage = err.message ?: "Failed to accept broadcast."
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = extraColors.verified,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                    ) {
                        Text(
                            text = if (isSubmitting) "LOCKING DISPATCH..." else "ACCEPT & LOCK JOB →",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Black,
                                letterSpacing = 0.5.sp
                            )
                        )
                    }

                    OutlinedButton(
                        enabled = !isSubmitting,
                        onClick = {
                            if (activeId.isBlank()) {
                                onDecline()
                                return@OutlinedButton
                            }
                            isSubmitting = true
                            coroutineScope.launch {
                                ApiClient.declineBroadcast(activeId, "Technician declined dispatch")
                                isSubmitting = false
                                onDecline()
                            }
                        },
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Text(
                            text = "Pass / Decline",
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                        )
                    }
                }
            }
        }
    }
}
