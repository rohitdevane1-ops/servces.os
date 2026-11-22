package com.serviceos.app.ui.customer

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.serviceos.app.data.model.ServiceCategory
import com.serviceos.app.data.model.ServiceItem
import com.serviceos.app.data.repository.ServiceRepository
import com.serviceos.app.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerDiscoverScreen(
    onThemeToggle: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    onCategoryClick: (ServiceCategory) -> Unit = {},
    onServiceClick: (ServiceItem) -> Unit = {},
    onBookService: (ServiceItem) -> Unit = {},
    onOpenBookings: () -> Unit = {},
    onOpenSupport: () -> Unit = {},
    onOpenProfile: () -> Unit = {}
) {
    val categories by ServiceRepository.categoriesFlow.collectAsState()
    val featuredServices by ServiceRepository.featuredServicesFlow.collectAsState()
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (categories.isEmpty() || featuredServices.isEmpty()) {
            ServiceRepository.refreshFromBackend()
        }
    }

    Scaffold(
        topBar = {
            AppHeader(
                locationTitle = "Select Service Location",
                onThemeToggle = onThemeToggle
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                NavigationBarItem(
                    selected = true,
                    onClick = {},
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Home, contentDescription = "Discover") },
                    label = { Text("Discover") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenBookings,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.List, contentDescription = "Bookings") },
                    label = { Text("Bookings") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenSupport,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Help, contentDescription = "Support") },
                    label = { Text("Support") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onOpenProfile,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profile") }
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                HeroBanner(onSearchClick = onSearchClick)
            }

            item {
                TrustStrip()
            }

            item {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Browse Categories",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "${categories.size} Categories →",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    CategoryRow(
                        categories = categories,
                        selectedCategoryId = selectedCategoryId,
                        onCategorySelected = { cat ->
                            selectedCategoryId = cat.id
                            onCategoryClick(cat)
                        }
                    )
                }
            }

            item {
                Text(
                    text = "Most Requested Near You",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }

            items(featuredServices) { service ->
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    ServiceCard(
                        service = service,
                        onBookClick = { onBookService(service) },
                        onClick = { onServiceClick(service) }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
