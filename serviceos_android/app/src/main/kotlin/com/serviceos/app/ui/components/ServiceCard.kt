package com.serviceos.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.model.ServiceItem
import com.serviceos.app.data.network.ApiClient

private data class ServiceVisualStyle(
    val gradientColors: List<Color>,
    val icon: ImageVector,
    val badgeLabel: String
)

private fun resolveServiceVisualStyle(title: String): ServiceVisualStyle {
    val lower = title.lowercase()
    return when {
        lower.contains("ac") || lower.contains("hvac") || lower.contains("chiller") || lower.contains("cool") || lower.contains("duct") ->
            ServiceVisualStyle(
                gradientColors = listOf(Color(0xFF0284C7), Color(0xFF4F46E5), Color(0xFF6366F1)),
                icon = Icons.Default.AcUnit,
                badgeLabel = "HVAC Climate Care"
            )
        lower.contains("plumb") || lower.contains("leak") || lower.contains("pipe") || lower.contains("water") || lower.contains("drain") ->
            ServiceVisualStyle(
                gradientColors = listOf(Color(0xFF2563EB), Color(0xFF4F46E5), Color(0xFF7C3AED)),
                icon = Icons.Default.Plumbing,
                badgeLabel = "Plumbing & Water"
            )
        lower.contains("electr") || lower.contains("power") || lower.contains("panel") || lower.contains("light") ->
            ServiceVisualStyle(
                gradientColors = listOf(Color(0xFF4338CA), Color(0xFF6366F1), Color(0xFF9333EA)),
                icon = Icons.Default.Bolt,
                badgeLabel = "Electrical Pro"
            )
        lower.contains("clean") || lower.contains("sanit") || lower.contains("maid") || lower.contains("deep") ->
            ServiceVisualStyle(
                gradientColors = listOf(Color(0xFF0D9488), Color(0xFF0EA5E9), Color(0xFF4F46E5)),
                icon = Icons.Default.CleaningServices,
                badgeLabel = "Deep Sanitization"
            )
        else ->
            ServiceVisualStyle(
                gradientColors = listOf(Color(0xFF4F46E5), Color(0xFF6366F1), Color(0xFF7C3AED)),
                icon = Icons.Default.HomeRepairService,
                badgeLabel = "Verified Home Service"
            )
    }
}

@Composable
fun ServiceCard(
    service: ServiceItem,
    onBookClick: () -> Unit = {},
    onClick: () -> Unit = {}
) {
    val extraColors = LocalExtraColors.current
    val visual = resolveServiceVisualStyle(service.title)

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 3.dp,
        modifier = Modifier
            .fillMaxWidth()
            .tactilePressScale { onClick() }
            .border(
                width = 1.dp,
                color = extraColors.border,
                shape = RoundedCornerShape(20.dp)
            )
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // 1. Rich Category Gradient / Photo Header with Badges
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(142.dp)
                    .background(Brush.linearGradient(colors = visual.gradientColors))
            ) {
                // Decorative translucent architectural shapes so cards never look blank
                Box(
                    modifier = Modifier
                        .size(130.dp)
                        .align(Alignment.TopEnd)
                        .offset(x = 24.dp, y = (-26).dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.14f))
                )
                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .align(Alignment.BottomStart)
                        .offset(x = (-18).dp, y = 22.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.10f))
                )

                if (service.imageUrl.isNotBlank()) {
                    AsyncImage(
                        model = service.imageUrl,
                        contentDescription = service.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(Color.Transparent, Color.Black.withAlpha(0.28f))
                                )
                            )
                    )
                } else {
                    // Centered frosted category emblem
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(54.dp)
                                .clip(RoundedCornerShape(18.dp))
                                .background(Color.White.copy(alpha = 0.22f))
                                .border(1.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(18.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = visual.icon,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(28.dp)
                            )
                        }
                    }
                }

                // Top-Left Verified Pro Emerald Pill
                Surface(
                    color = extraColors.verified,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Verified Pro",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 10.sp
                            ),
                            color = Color.White
                        )
                    }
                }

                // Top-Right White Rating Pill
                Surface(
                    color = Color.White.copy(alpha = 0.96f),
                    shape = RoundedCornerShape(16.dp),
                    shadowElevation = 3.dp,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Rating",
                            tint = extraColors.rating,
                            modifier = Modifier.size(13.dp)
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            text = String.format("%.1f", service.rating),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 11.sp
                            ),
                            color = Color(0xFF0F172A)
                        )
                    }
                }

                // Bottom-Left Category & Duration Chip
                Surface(
                    color = Color.Black.withAlpha(0.32f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(12.dp)
                ) {
                    Text(
                        text = "${visual.badgeLabel} • ${service.durationMinutes} mins",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        ),
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            // 2. Body Content & High-Contrast Book Now CTA
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(15.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = service.title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 15.5.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (service.isVerifiedPro) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.Verified,
                            contentDescription = "Verified Pro",
                            tint = extraColors.verified,
                            modifier = Modifier.size(17.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = ApiClient.formatCurrency(service.basePrice),
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Black,
                                fontSize = 16.sp
                            ),
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Upfront escrow pricing",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(Color(0xFF4F46E5), Color(0xFF7C3AED))
                                )
                            )
                            .clickable { onBookClick() }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Book Now",
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 12.5.sp
                                ),
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.ArrowForward,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun Color.withAlpha(alpha: Float): Color = this.copy(alpha = alpha)
