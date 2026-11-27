package com.serviceos.app.ui.customer

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceReceiptScreen(
    invoiceNo: String = "",
    onBack: () -> Unit = {}
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val selectedBooking by BookingRepository.selectedBookingFlow.collectAsState()
    val booking = selectedBooking ?: BookingRepository.activeBooking
    var statusMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(booking?.id) {
        if (!booking?.id.isNullOrBlank()) {
            BookingRepository.fetchBookingDetail(booking!!.id)
        }
    }

    val baseAmount = booking?.baseAmount ?: 0.0
    val partsAmount = booking?.extraPartsAmount ?: 0.0
    val taxAmount = booking?.taxAmount ?: 0.0
    val totalAmount = booking?.totalAmount ?: 0.0
    val resolvedInvoiceNo = invoiceNo.ifBlank { booking?.reference ?: "" }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tax Invoice & Receipt") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        enabled = booking != null,
                        onClick = {
                            if (booking != null) {
                                val summary = "ServiceOS Receipt\n" +
                                    "Reference: ${resolvedInvoiceNo.ifBlank { booking.id }}\n" +
                                    "Service: ${booking.serviceTitle}\n" +
                                    "Total: ${ApiClient.formatCurrency(totalAmount)}"
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, "ServiceOS Receipt $resolvedInvoiceNo")
                                    putExtra(Intent.EXTRA_TEXT, summary)
                                }
                                runCatching {
                                    context.startActivity(Intent.createChooser(shareIntent, "Share Receipt"))
                                }.onFailure {
                                    statusMessage = "No share handler available on this device."
                                }
                            }
                        }
                    ) {
                        Icon(Icons.Default.Share, contentDescription = "Share Receipt")
                    }
                    IconButton(
                        enabled = booking != null,
                        onClick = {
                            val id = booking?.id ?: return@IconButton
                            coroutineScope.launch {
                                val res = BookingRepository.fetchBookingDetail(id)
                                statusMessage = res.fold(
                                    onSuccess = { "Invoice data synced from server." },
                                    onFailure = { it.message ?: "Unable to sync invoice from server." }
                                )
                            }
                        }
                    ) {
                        Icon(Icons.Default.Download, contentDescription = "Refresh Invoice")
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

            if (booking == null) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(16.dp),
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ReceiptLong,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(36.dp)
                        )
                        Text(
                            text = "No Invoice Selected",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = "Select a booking from My Bookings to view its official tax invoice and escrow breakdown.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                        )
                    }
                }
            } else {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(16.dp),
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            text = "ServiceOS Official Receipt",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold)
                        )
                        Text(
                            text = "Reference: ${resolvedInvoiceNo.ifBlank { booking.id }} • ${booking.status.label}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )

                        HorizontalDivider(modifier = Modifier.padding(vertical = 14.dp))

                        InvoiceRow(booking.serviceTitle, ApiClient.formatCurrency(baseAmount))
                        InvoiceRow("Authorized Replacement Parts", ApiClient.formatCurrency(partsAmount))
                        InvoiceRow("${ApiClient.taxName} (${ApiClient.vatPercent}%)", ApiClient.formatCurrency(taxAmount))
                        InvoiceRow("Escrow Protection Guarantee", "Active")

                        HorizontalDivider(modifier = Modifier.padding(vertical = 14.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Total",
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold)
                            )
                            Text(
                                text = ApiClient.formatCurrency(totalAmount),
                                style = MaterialTheme.typography.headlineSmall.copy(
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InvoiceRow(item: String, amount: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = item, style = MaterialTheme.typography.bodyMedium)
        Text(text = amount, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
    }
}
