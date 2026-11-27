package com.serviceos.app.ui.common

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.BuildConfig
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommonUtilitiesScreen(
    initialTab: Int = 0,
    onBack: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(initialTab) }
    val extraColors = LocalExtraColors.current
    val bookings by BookingRepository.bookingsFlow.collectAsState()

    var isHealthy by remember { mutableStateOf<Boolean?>(null) }
    var serverVersion by remember { mutableStateOf<String?>(null) }
    var networkMessage by remember { mutableStateOf("Tap Check Connection to probe Fastify API & PostgreSQL.") }
    var isChecking by remember { mutableStateOf(false) }

    fun checkHealthNow() {
        isChecking = true
        coroutineScope.launch {
            val healthRes = ApiClient.fetchHealth()
            val configRes = ApiClient.fetchSystemConfig()
            isChecking = false
            healthRes.onSuccess { json ->
                val data = json.optJSONObject("data") ?: json
                isHealthy = data.optString("status") == "pass"
                serverVersion = data.optString("version", "1.0.0")
                val dbState = data.optString("database", "healthy")
                networkMessage = "API Online (v$serverVersion) • Database: $dbState • Config synced: ${configRes.isSuccess}"
            }.onFailure { err ->
                isHealthy = false
                networkMessage = err.message ?: "Unable to reach backend server at ${BuildConfig.API_BASE_URL}"
            }
        }
    }

    LaunchedEffect(Unit) {
        checkHealthNow()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("System Utilities") },
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
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Alerts") })
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Sync") })
                Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Network") })
                Tab(selected = selectedTab == 3, onClick = { selectedTab = 3 }, text = { Text("Build") })
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                when (selectedTab) {
                    0 -> {
                        Text("Notification Center", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                        NotifItem(
                            "System Status",
                            networkMessage,
                            if (isHealthy == true) "Online" else "Standby",
                            MaterialTheme.colorScheme.primary
                        )
                    }
                    1 -> {
                        Surface(
                            color = extraColors.verified.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CloudDone, contentDescription = null, tint = extraColors.verified)
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("Encrypted Local Cache Ready", fontWeight = FontWeight.Bold, color = extraColors.verified)
                                    Text("${bookings.size} booking(s) cached securely in AES-256 EncryptedSharedPreferences.", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                    2 -> {
                        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    imageVector = if (isHealthy == true) Icons.Default.Wifi else Icons.Default.WifiOff,
                                    contentDescription = null,
                                    tint = if (isHealthy == true) extraColors.verified else MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(54.dp)
                                )
                                Spacer(modifier = Modifier.height(14.dp))
                                Text(
                                    text = if (isHealthy == true) "Backend Connected" else "Backend Unreachable",
                                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black)
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = networkMessage,
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(
                                    enabled = !isChecking,
                                    onClick = { checkHealthNow() },
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(if (isChecking) "Checking..." else "Check Connection")
                                }
                            }
                        }
                    }
                    3 -> {
                        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(54.dp))
                                Spacer(modifier = Modifier.height(14.dp))
                                Text("ServiceOS Android v${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black))
                                Text(
                                    text = "Endpoint: ${BuildConfig.API_BASE_URL}\nServer Version: ${serverVersion ?: "Not queried"} • Currency: ${ApiClient.currencyCode}",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(
                                    enabled = !isChecking,
                                    onClick = { checkHealthNow() },
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text("Refresh Server Metadata →")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotifItem(title: String, subtitle: String, time: String, tint: Color) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = tint.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp), modifier = Modifier.size(38.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Notifications, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(text = title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                    Text(text = time, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(text = subtitle, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }
    }
}
