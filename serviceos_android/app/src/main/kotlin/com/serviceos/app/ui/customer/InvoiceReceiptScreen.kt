package com.serviceos.app.ui.customer

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceReceiptScreen(
    invoiceNo: String = "",
    onBack: () -> Unit = {}
) {
    val booking = BookingRepository.activeBooking
    val baseAmount = booking?.baseAmount ?: 149.0
    val partsAmount = booking?.extraPartsAmount ?: 0.0
    val taxAmount = booking?.taxAmount ?: (baseAmount * 0.05)
    val totalAmount = booking?.totalAmount ?: (baseAmount + partsAmount + taxAmount)
    val resolvedInvoiceNo = invoiceNo.ifBlank { booking?.reference ?: "INV-10001" }

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
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.Download, contentDescription = "Download")
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
                        text = "Invoice: $resolvedInvoiceNo • Settled via Escrow Payment",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )

                    Divider(modifier = Modifier.padding(vertical = 14.dp))

                    InvoiceRow(booking?.serviceTitle ?: "Labor Service Charge", ApiClient.formatCurrency(baseAmount))
                    InvoiceRow("Authorized Replacement Parts", ApiClient.formatCurrency(partsAmount))
                    InvoiceRow("VAT (${ApiClient.vatPercent}%)", ApiClient.formatCurrency(taxAmount))
                    InvoiceRow("Escrow Protection Guarantee", "Active")

                    Divider(modifier = Modifier.padding(vertical = 14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Total Paid",
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
