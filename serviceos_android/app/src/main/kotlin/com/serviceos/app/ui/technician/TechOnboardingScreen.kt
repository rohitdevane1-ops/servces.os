package com.serviceos.app.ui.technician

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechOnboardingScreen(
    onBack: () -> Unit = {},
    onFinish: () -> Unit = {}
) {
    var step by remember { mutableStateOf(1) } // 1: Entity, 2: License & Insurance, 3: Rates & Radius
    var licenseNumber by remember { mutableStateOf("") }
    var insuranceCarrier by remember { mutableStateOf("") }
    var hourlyRate by remember { mutableStateOf(95f) }
    var radiusMiles by remember { mutableStateOf(25f) }
    val extraColors = LocalExtraColors.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pro Partner Onboarding ($step/3)") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (step > 1) step-- else onBack()
                    }) {
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
                        onClick = {
                            if (step < 3) step++ else onFinish()
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
                            text = if (step == 3) "Complete Verification & Go Online →" else "Continue →",
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
            LinearProgressIndicator(
                progress = step / 3f,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth()
            )

            when (step) {
                1 -> {
                    Text("1. Contractor Entity Classification", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    Text("Select your legal trade structure.", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(14.dp),
                        border = androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Independent Contractor (1099-NEC)", fontWeight = FontWeight.Bold)
                            Text("Direct Stripe payouts to your bank account with automated tax records.", fontSize = 12.sp)
                        }
                    }
                }
                2 -> {
                    Text("2. Trade License & Insurance", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    OutlinedTextField(
                        value = licenseNumber,
                        onValueChange = { licenseNumber = it },
                        label = { Text("State Trade License #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = insuranceCarrier,
                        onValueChange = { insuranceCarrier = it },
                        label = { Text("General Liability Insurance Carrier") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                3 -> {
                    Text("3. Hourly Rate & Travel Geofence", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    Text("Base Labor Rate: ${com.serviceos.app.data.network.ApiClient.formatCurrency(hourlyRate.toDouble())} / hr", fontWeight = FontWeight.SemiBold)
                    Slider(
                        value = hourlyRate,
                        onValueChange = { hourlyRate = it },
                        valueRange = 60f..200f
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Emergency Dispatch Radius: ${radiusMiles.toInt()} miles", fontWeight = FontWeight.SemiBold)
                    Slider(
                        value = radiusMiles,
                        onValueChange = { radiusMiles = it },
                        valueRange = 5f..50f
                    )
                }
            }
        }
    }
}
