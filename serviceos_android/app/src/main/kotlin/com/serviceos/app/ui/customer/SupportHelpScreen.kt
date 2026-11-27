package com.serviceos.app.ui.customer

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.ErrorRed
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.launch

private data class TicketSummaryItem(
    val id: String,
    val subject: String,
    val status: String,
    val priority: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportHelpScreen(
    onBack: () -> Unit = {},
    promoCode: String? = null,
    promoDescription: String? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var livePromoCode by remember { mutableStateOf(promoCode) }
    var livePromoDiscount by remember { mutableStateOf(0) }
    var tickets by remember { mutableStateOf<List<TicketSummaryItem>>(emptyList()) }
    var ticketSubject by remember { mutableStateOf("") }
    var ticketMessage by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    suspend fun loadSupportData() {
        ApiClient.fetchSystemConfig()
        ApiClient.fetchCmsConfig().onSuccess { json ->
            val data = json.optJSONObject("data") ?: json
            val code = data.optString("promoCouponCode", "")
            val pct = data.optInt("promoDiscountPercent", 0)
            if (code.isNotBlank() && code != "null") {
                livePromoCode = code
                livePromoDiscount = pct
            }
        }
        if (!ApiClient.getAccessToken().isNullOrBlank()) {
            ApiClient.fetchTickets().onSuccess { arr ->
                val list = mutableListOf<TicketSummaryItem>()
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    list.add(
                        TicketSummaryItem(
                            id = obj.optString("id", ""),
                            subject = obj.optString("subject", "Support Request"),
                            status = obj.optString("status", "OPEN"),
                            priority = obj.optString("priority", "NORMAL")
                        )
                    )
                }
                tickets = list
            }
        }
    }

    LaunchedEffect(Unit) {
        loadSupportData()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Help & Emergency Center") },
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
            if (!statusMessage.isNullOrBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = statusMessage ?: "",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            // Emergency SOS Card
            Surface(
                color = ErrorRed,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "24/7 PRIORITY SOS LINE",
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                            fontSize = 12.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Rapid Emergency Response",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black),
                        color = Color.White
                    )
                    Text(
                        text = "Immediate dispatch for gas leaks, water main bursts, and electrical fire hazards.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.9f)
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Button(
                        onClick = {
                            val emergency = ApiClient.emergencyPhone ?: ApiClient.supportPhone
                            if (emergency.isNullOrBlank()) {
                                statusMessage = "Emergency hotline is not configured by your service provider yet. Open a URGENT ticket below."
                            } else {
                                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$emergency"))
                                runCatching { context.startActivity(dialIntent) }.onFailure {
                                    statusMessage = "Dialer unavailable. Emergency number: $emergency"
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Phone, contentDescription = null, tint = ErrorRed)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (!ApiClient.emergencyPhone.isNullOrBlank()) {
                                "Call Emergency (${ApiClient.emergencyPhone})"
                            } else {
                                "Call 24/7 Emergency Dispatch"
                            },
                            color = ErrorRed,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Open Support Ticket Form
            Text(
                text = "Submit Support Ticket",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(14.dp),
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = ticketSubject,
                        onValueChange = { ticketSubject = it },
                        label = { Text("Subject") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = ticketMessage,
                        onValueChange = { ticketMessage = it },
                        label = { Text("Describe your issue") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        enabled = !isSubmitting,
                        onClick = {
                            if (ticketSubject.trim().length < 3 || ticketMessage.trim().length < 5) {
                                statusMessage = "Please enter a subject and message (minimum 5 characters)."
                                return@Button
                            }
                            isSubmitting = true
                            coroutineScope.launch {
                                val res = ApiClient.openSupportTicket(
                                    subject = ticketSubject.trim(),
                                    initialMessage = ticketMessage.trim(),
                                    category = "Customer Support",
                                    priority = "HIGH"
                                )
                                isSubmitting = false
                                res.onSuccess {
                                    ticketSubject = ""
                                    ticketMessage = ""
                                    statusMessage = "Support ticket submitted to operations desk."
                                    loadSupportData()
                                }.onFailure { err ->
                                    statusMessage = err.message ?: "Sign in required to submit support tickets."
                                }
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(if (isSubmitting) "Submitting..." else "Submit Ticket")
                    }
                }
            }

            if (tickets.isNotEmpty()) {
                Text(
                    text = "Your Support Tickets (${tickets.size})",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                tickets.forEach { t ->
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(12.dp),
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(t.subject, fontWeight = FontWeight.Bold)
                                Text(
                                    "Priority: ${t.priority}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            }
                            Text(
                                text = t.status,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }

            // Promo Coupons
            Text(
                text = "Promotional Balance & Perks",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(14.dp),
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    if (!livePromoCode.isNullOrBlank()) {
                        Text(
                            text = "Coupon Code: $livePromoCode",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = promoDescription ?: if (livePromoDiscount > 0) {
                                "Active promotional discount: $livePromoDiscount% off eligible bookings."
                            } else {
                                "Active promotional coupon synced from server."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    } else {
                        Text(
                            text = "No Active Promotional Credits",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                        )
                        Text(
                            text = "Promotional coupons or referral credits will appear here when issued.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }
}
