package com.serviceos.app.ui.common

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommonUtilitiesScreen(
    initialTab: Int = 0,
    onBack: () -> Unit = {}
) {
    var selectedTab by remember { mutableStateOf(initialTab) }
    val extraColors = LocalExtraColors.current

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
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Alerts (X11)") })
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Offline (X12)") })
                Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Network (X13)") })
                Tab(selected = selectedTab == 3, onClick = { selectedTab = 3 }, text = { Text("Update (X14)") })
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
                        NotifItem("System Ready", "Dispatch and booking alerts appear here in real time.", "Active", MaterialTheme.colorScheme.primary)
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
                                    Text("Offline Sync Storage Ready", fontWeight = FontWeight.Bold, color = extraColors.verified)
                                    Text("0 actions queued. All local records are synchronized with cloud.", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                    2 -> {
                        Box(modifier = Modifier.fillMaxWidth().height(260.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.WifiOff, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(54.dp))
                                Spacer(modifier = Modifier.height(14.dp))
                                Text("No Internet Connection", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black))
                                Text("Active in-progress jobs remain cached safely.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(onClick = {}, shape = RoundedCornerShape(10.dp)) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Retry Connection")
                                }
                            }
                        }
                    }
                    3 -> {
                        Box(modifier = Modifier.fillMaxWidth().height(260.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(54.dp))
                                Spacer(modifier = Modifier.height(14.dp))
                                Text("ServiceOS v2.4.0 Available", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black))
                                Text("Includes live radar tracking precision and Stripe Express instant cashout.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(onClick = {}, shape = RoundedCornerShape(10.dp)) {
                                    Text("Update Now via Google Play →")
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

@Composable
private fun QueueItem(title: String) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(text = title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        }
    }
}
