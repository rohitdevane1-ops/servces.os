package com.serviceos.app.ui.common

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.launch

data class ChatMessage(
    val id: String,
    val text: String,
    val isMe: Boolean,
    val timestamp: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InAppChatScreen(
    peerName: String = "Assigned Technician",
    peerRole: String = "Field Service Specialist",
    onBack: () -> Unit = {}
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var inputText by remember { mutableStateOf("") }
    var activeTicketId by remember { mutableStateOf<String?>(null) }
    var isSending by remember { mutableStateOf(false) }
    var statusNotice by remember { mutableStateOf<String?>(null) }
    val extraColors = LocalExtraColors.current
    val messages = remember { mutableStateListOf<ChatMessage>() }

    suspend fun loadLatestThread() {
        if (ApiClient.getAccessToken().isNullOrBlank()) return
        val activeBookingId = BookingRepository.activeBooking?.id
        if (!activeBookingId.isNullOrBlank()) {
            ApiClient.getBookingMessages(activeBookingId).onSuccess { msgs ->
                messages.clear()
                val myRole = ApiClient.getUserRole()?.uppercase() ?: "CUSTOMER"
                for (i in 0 until msgs.length()) {
                    val m = msgs.optJSONObject(i) ?: continue
                    val senderRole = m.optString("senderRole", "").uppercase()
                    messages.add(
                        ChatMessage(
                            id = m.optString("id", "$i"),
                            text = m.optString("messageBody", m.optString("message_body", "")),
                            isMe = senderRole == myRole,
                            timestamp = m.optString("createdAt", "").take(16).replace("T", " ").ifBlank { "Synced" }
                        )
                    )
                }
                return
            }
        }
        ApiClient.fetchTickets().onSuccess { arr ->
            if (arr.length() > 0) {
                val first = arr.optJSONObject(0) ?: return@onSuccess
                val tid = first.optString("id", "")
                if (tid.isNotBlank()) {
                    activeTicketId = tid
                    ApiClient.fetchTicketDetails(tid).onSuccess { detail ->
                        val data = detail.optJSONObject("data") ?: detail
                        val msgs = data.optJSONArray("messages")
                        if (msgs != null) {
                            messages.clear()
                            val myRole = ApiClient.getUserRole()?.uppercase() ?: "CUSTOMER"
                            for (i in 0 until msgs.length()) {
                                val m = msgs.optJSONObject(i) ?: continue
                                val senderRole = m.optString("senderRole", "").uppercase()
                                messages.add(
                                    ChatMessage(
                                        id = m.optString("id", "$i"),
                                        text = m.optString("messageBody", m.optString("message_body", "")),
                                        isMe = senderRole == myRole,
                                        timestamp = m.optString("createdAt", "").take(16).replace("T", " ").ifBlank { "Synced" }
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        loadLatestThread()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = peerName,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(text = peerName, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                            Text(text = peerRole, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        val phone = ApiClient.supportPhone ?: ApiClient.emergencyPhone
                        if (phone.isNullOrBlank()) {
                            statusNotice = "Support line is not configured; send a message below."
                        } else {
                            runCatching {
                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                            }.onFailure {
                                statusNotice = "Support line: $phone"
                            }
                        }
                    }) {
                        Icon(Icons.Default.PhoneInTalk, contentDescription = "Call Dispatch Desk", tint = extraColors.verified)
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
            Surface(
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(13.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (activeTicketId != null) {
                            "Encrypted Thread Synced • Personal numbers masked"
                        } else {
                            "Encrypted Dispatch Channel • Personal numbers masked"
                        },
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (!statusNotice.isNullOrBlank()) {
                Text(
                    text = statusNotice ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }

            if (messages.isEmpty()) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No messages yet. Send a message below to open a synced dispatch thread.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(messages, key = { it.id }) { msg ->
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = if (msg.isMe) Alignment.CenterEnd else Alignment.CenterStart
                        ) {
                            Surface(
                                color = if (msg.isMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                                shape = RoundedCornerShape(16.dp),
                                shadowElevation = 1.dp,
                                modifier = Modifier.widthIn(max = 280.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = msg.text,
                                        color = if (msg.isMe) Color.White else MaterialTheme.colorScheme.onSurface,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = msg.timestamp,
                                        fontSize = 9.sp,
                                        color = if (msg.isMe) Color.White.copy(alpha = 0.7f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                        modifier = Modifier.align(Alignment.End)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 4.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = {
                        val ref = BookingRepository.activeBooking?.reference?.ifBlank { BookingRepository.activeBooking?.id }
                        if (!ref.isNullOrBlank()) {
                            inputText = if (inputText.isBlank()) "[Order $ref] " else "$inputText [Order $ref]"
                        } else {
                            statusNotice = "Select an active booking to attach its reference."
                        }
                    }) {
                        Icon(Icons.Default.AttachFile, contentDescription = "Attach Booking Reference")
                    }
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Message pro or dispatch...") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    IconButton(
                        enabled = !isSending && inputText.isNotBlank(),
                        onClick = {
                            val textToSend = inputText.trim()
                            if (textToSend.isBlank()) return@IconButton
                            isSending = true
                            statusNotice = null
                            coroutineScope.launch {
                                val booking = BookingRepository.activeBooking
                                val existingId = activeTicketId
                                val sendRes = when {
                                    booking != null && booking.id.isNotBlank() ->
                                        ApiClient.sendBookingMessage(booking.id, textToSend)
                                    existingId != null ->
                                        ApiClient.postTicketMessage(existingId, textToSend)
                                    else ->
                                        ApiClient.openSupportTicket(
                                            subject = "Live Dispatch Inquiry",
                                            initialMessage = textToSend,
                                            category = "Dispatch Chat",
                                            bookingId = null
                                        )
                                }
                                isSending = false
                                sendRes.onSuccess {
                                    inputText = ""
                                    loadLatestThread()
                                }.onFailure { err ->
                                    statusNotice = err.message ?: "Sign in required to persist chat messages."
                                }
                            }
                        }
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Send", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}
