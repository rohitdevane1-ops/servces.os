package com.serviceos.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.model.ServiceCategory

private fun iconForCategory(name: String): ImageVector {
    val s = name.lowercase()
    return when {
        s.contains("ac") || s.contains("hvac") || s.contains("cool") -> Icons.Default.AcUnit
        s.contains("plumb") -> Icons.Default.Plumbing
        s.contains("electr") -> Icons.Default.Bolt
        s.contains("clean") -> Icons.Default.CleaningServices
        s.contains("paint") -> Icons.Default.FormatPaint
        s.contains("car") || s.contains("auto") -> Icons.Default.DirectionsCar
        s.contains("move") -> Icons.Default.LocalShipping
        else -> Icons.Default.HomeRepairService
    }
}

private val CategoryPastelPalette = listOf(
    Color(0xFF0EA5E9),
    Color(0xFF6366F1),
    Color(0xFFF59E0B),
    Color(0xFF10B981),
    Color(0xFF7C3AED)
)

@Composable
fun CategoryRow(
    categories: List<ServiceCategory>,
    selectedCategoryId: String?,
    onCategorySelected: (ServiceCategory) -> Unit
) {
    val extraColors = LocalExtraColors.current

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .border(1.dp, extraColors.border, RoundedCornerShape(20.dp))
    ) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            itemsIndexed(categories) { index, category ->
                val isSelected = category.id == selectedCategoryId
                val tint = CategoryPastelPalette[index % CategoryPastelPalette.size]
                val circleColor by animateColorAsState(
                    targetValue = if (isSelected) MaterialTheme.colorScheme.primary else tint.copy(alpha = 0.14f),
                    label = "catCircleColor"
                )
                val iconTint by animateColorAsState(
                    targetValue = if (isSelected) Color.White else tint,
                    label = "catIconTint"
                )
                val scale by animateFloatAsState(
                    targetValue = if (isSelected) 1.06f else 1f,
                    animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                    label = "catScale"
                )

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .width(64.dp)
                        .clickable { onCategorySelected(category) }
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                            }
                            .clip(CircleShape)
                            .background(circleColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = iconForCategory(category.name),
                            contentDescription = category.name,
                            tint = iconTint,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = category.name,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.SemiBold,
                            fontSize = 11.sp
                        ),
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}
