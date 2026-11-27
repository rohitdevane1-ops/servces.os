package com.serviceos.app.ui.customer

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerProfileScreen(
    onBack: () -> Unit = {},
    onThemeToggle: () -> Unit = {},
    onOpenUtilities: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val bookings by BookingRepository.bookingsFlow.collectAsState()

    var fullName by remember { mutableStateOf("Unauthenticated Session") }
    var email by remember { mutableStateOf("Sign in to sync your verified profile") }
    var roleLabel by remember { mutableStateOf("GUEST") }
    var isAuthenticated by remember { mutableStateOf(false) }
    var activeDialogTitle by remember { mutableStateOf<String?>(null) }
    var activeDialogBody by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        if (!ApiClient.getAccessToken().isNullOrBlank()) {
            ApiClient.validateSession().onSuccess { res ->
                val data = res.optJSONObject("data")
                val user = data?.optJSONObject("user")
                if (user != null) {
                    isAuthenticated = true
                    fullName = user.optString("fullName", user.optString("name", "Verified Customer"))
                    email = user.optString("email", "")
                    roleLabel = user.optString("role", "CUSTOMER").uppercase()
                }
            }
        }
    }

    val savedAddresses = remember(bookings) {
        bookings.map { it.customerAddress.trim() }.filter { it.isNotBlank() }.distinct()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Profile & Settings") },
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
            // Profile Card
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(16.dp),
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                        modifier = Modifier.size(64.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = fullName,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column {
                        Text(
                            text = fullName,
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = email,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                        )
                        Text(
                            text = if (isAuthenticated) "Verified $roleLabel • ServiceOS" else "Guest Preview Mode",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            // Menu Items
            ProfileMenuItem(
                icon = Icons.Default.LocationOn,
                title = "Saved Addresses",
                subtitle = if (savedAddresses.isEmpty()) "No service addresses recorded yet" else "${savedAddresses.size} service address(es) on bookings",
                onClick = {
                    activeDialogTitle = "Saved Service Addresses"
                    activeDialogBody = if (savedAddresses.isEmpty()) {
                        "Addresses you book with will automatically appear here from your confirmed orders."
                    } else {
                        savedAddresses.joinToString("\n• ", prefix = "• ")
                    }
                }
            )
            ProfileMenuItem(
                icon = Icons.Default.CreditCard,
                title = "Payment & Escrow Policy",
                subtitle = "Stripe PaymentIntent escrow hold protection",
                onClick = {
                    activeDialogTitle = "Escrow Payment Protection"
                    activeDialogBody = "Bookings authorize funds safely via Stripe PaymentIntent before dispatch. Capture and settlement run only after technician completion."
                }
            )
            ProfileMenuItem(
                icon = Icons.Default.Notifications,
                title = "Notifications & Diagnostics",
                subtitle = "Alerts, sync queue & health diagnostics",
                onClick = onOpenUtilities
            )
            ProfileMenuItem(
                icon = Icons.Default.BrightnessMedium,
                title = "Theme Engine",
                subtitle = "Day / Night Vision toggle",
                onClick = onThemeToggle
            )
            ProfileMenuItem(
                icon = Icons.Default.Security,
                title = "Security & Session",
                subtitle = if (isAuthenticated) "Encrypted AES-256 session active" else "Not signed in",
                onClick = {
                    activeDialogTitle = "Security & Session Status"
                    activeDialogBody = if (isAuthenticated) {
                        "Signed in as $fullName ($email). Tokens are encrypted via Android MasterKey (AES256-GCM) with single-flight JWT refresh."
                    } else {
                        "Sign in on the Login screen to establish an encrypted session."
                    }
                }
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedButton(
                onClick = {
                    coroutineScope.launch {
                        ApiClient.logout()
                        onLogout()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Log Out of Account", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
            }
        }
    }

    if (activeDialogTitle != null) {
        AlertDialog(
            onDismissRequest = { activeDialogTitle = null },
            title = { Text(activeDialogTitle ?: "") },
            text = { Text(activeDialogBody) },
            confirmButton = {
                TextButton(onClick = { activeDialogTitle = null }) {
                    Text("Close")
                }
            }
        )
    }
}

@Composable
private fun ProfileMenuItem(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit = {}) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge)
                Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            Icon(imageVector = Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
        }
    }
}
