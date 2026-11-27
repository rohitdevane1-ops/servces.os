package com.serviceos.app.ui.customer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val listState = rememberLazyListState()
    val scrollOffsetPx by remember {
        derivedStateOf {
            if (listState.firstVisibleItemIndex == 0) listState.firstVisibleItemScrollOffset.toFloat() else 320f
        }
    }

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
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    NavigationBarItem(
                        selected = true,
                        onClick = {},
                        icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                        label = { Text("Home", fontSize = 10.sp) }
                    )
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenBookings,
                        icon = { Icon(Icons.Default.CalendarMonth, contentDescription = "Bookings") },
                        label = { Text("Bookings", fontSize = 10.sp) }
                    )
                    // Center Elevated Search FAB
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .shadow(6.dp, CircleShape)
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(
                                        MaterialTheme.colorScheme.primary,
                                        MaterialTheme.colorScheme.secondary
                                    )
                                )
                            )
                            .clickable { onSearchClick() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search Services",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenSupport,
                        icon = { Icon(Icons.Default.NotificationsNone, contentDescription = "Support") },
                        label = { Text("Support", fontSize = 10.sp) }
                    )
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenProfile,
                        icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                        label = { Text("Profile", fontSize = 10.sp) }
                    )
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                HeroBanner(
                    onSearchClick = onSearchClick,
                    scrollOffsetPx = scrollOffsetPx
                )
            }

            item {
                CategoryRow(
                    categories = categories,
                    selectedCategoryId = selectedCategoryId,
                    onCategorySelected = { cat ->
                        selectedCategoryId = cat.id
                        onCategoryClick(cat)
                    }
                )
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Popular Services",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "View All →",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        ),
                        modifier = Modifier.clickable { onSearchClick() }
                    )
                }
            }

            if (featuredServices.isEmpty()) {
                item {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            ShimmerPlaceholderBox(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(120.dp)
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "Synchronizing live service catalogue...",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                            )
                        }
                    }
                }
            } else {
                itemsIndexed(featuredServices) { index, service ->
                    RevealCard(index = index) {
                        Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                            ServiceCard(
                                service = service,
                                onBookClick = { onBookService(service) },
                                onClick = { onServiceClick(service) }
                            )
                        }
                    }
                }
            }

            item {
                TrustStrip(onClick = onSearchClick)
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
