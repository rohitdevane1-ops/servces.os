package com.serviceos.app.ui.customer

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
fun WorkOrderCompletionScreen(
    onBack: () -> Unit = {},
    onFinish: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val activeBooking = BookingRepository.activeBooking
    val baseAmount = activeBooking?.baseAmount ?: 149.0
    val partsAmount = activeBooking?.extraPartsAmount ?: 0.0
    val taxAmount = activeBooking?.taxAmount ?: (baseAmount * 0.05)

    var rating by remember { mutableStateOf(5) }
    var selectedTip by remember { mutableStateOf(15) }
    var isSubmitting by remember { mutableStateOf(false) }
    val extraColors = LocalExtraColors.current
    val totalWithTip = baseAmount + partsAmount + taxAmount + selectedTip

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sign-off & Escrow Release") },
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
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 8.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(modifier = Modifier.padding(16.dp)) {
                    Button(
                        enabled = !isSubmitting,
                        onClick = {
                            isSubmitting = true
                            coroutineScope.launch {
                                val bid = activeBooking?.id ?: ""
                                if (bid.isNotBlank()) {
                                    ApiClient.submitReview(bid, rating, "Customer sign-off via Android app")
                                    BookingRepository.updateStatus(bid, BookingStatus.COMPLETED)
                                }
                                isSubmitting = false
                                onFinish()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Text(
                            text = if (isSubmitting) "Releasing Escrow..." else "Sign & Release Escrow →",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            }
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
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = activeBooking?.serviceTitle ?: "Work Order Settlement",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Field Service Order Inspection & Sign-off",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                    Divider(modifier = Modifier.padding(vertical = 10.dp))
                    Text("Base Labor: ${ApiClient.formatCurrency(baseAmount)}")
                    Text("Extra Parts: ${ApiClient.formatCurrency(partsAmount)}")
                    Text("VAT: ${ApiClient.formatCurrency(taxAmount)}")
                    Text("Tip: ${ApiClient.formatCurrency(selectedTip.toDouble())}")
                    Text("Total: ${ApiClient.formatCurrency(totalWithTip)}", fontWeight = FontWeight.ExtraBold)
                }
            }

            Text(
                text = "Customer Electronic Signature",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(130.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Customer Authorized (Signed via Mobile Touch)",
                    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Text(
                text = "Add Tip for Service Specialist",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                listOf(10, 15, 20, 25).forEach { tip ->
                    FilterChip(
                        selected = selectedTip == tip,
                        onClick = { selectedTip = tip },
                        label = { Text(ApiClient.formatCurrency(tip.toDouble())) }
                    )
                }
            }

            Text(
                text = "Rate Workmanship",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..5).forEach { star ->
                    IconButton(onClick = { rating = star }) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = null,
                            tint = if (star <= rating) extraColors.rating else MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
    }
}
