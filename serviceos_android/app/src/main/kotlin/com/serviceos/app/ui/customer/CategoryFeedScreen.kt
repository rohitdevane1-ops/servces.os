package com.serviceos.app.ui.customer

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.serviceos.app.data.model.ServiceItem
import com.serviceos.app.data.repository.ServiceRepository
import com.serviceos.app.ui.components.CategoryRow
import com.serviceos.app.ui.components.ServiceCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryFeedScreen(
    categoryName: String = "Plumbing Services",
    initialCategoryId: String? = ServiceRepository.selectedCategory?.id,
    onBack: () -> Unit = {},
    onServiceClick: (ServiceItem) -> Unit = {}
) {
    val categories by ServiceRepository.categoriesFlow.collectAsState()
    val services by ServiceRepository.featuredServicesFlow.collectAsState()
    var selectedId by remember(initialCategoryId) {
        mutableStateOf(initialCategoryId ?: categories.firstOrNull()?.id)
    }
    val selectedCategory = categories.find { it.id == selectedId }
    val filteredServices = remember(services, selectedId) {
        if (selectedId.isNullOrBlank()) services
        else services.filter { it.categoryId == selectedId }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = selectedCategory?.name ?: categoryName,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { selectedId = null }) {
                        Icon(Icons.Default.FilterList, contentDescription = "Show All")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                Spacer(modifier = Modifier.height(6.dp))
                CategoryRow(
                    categories = categories,
                    selectedCategoryId = selectedId,
                    onCategorySelected = { selectedId = if (selectedId == it.id) null else it.id }
                )
            }

            if (filteredServices.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = androidx.compose.ui.Alignment.Center
                    ) {
                        Text(
                            text = "No active services listed in this category yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            } else {
                items(filteredServices) { service ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        ServiceCard(
                            service = service,
                            onBookClick = { onServiceClick(service) },
                            onClick = { onServiceClick(service) }
                        )
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
