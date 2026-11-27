package com.serviceos.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors

@Composable
fun HeroBanner(
    onSearchClick: () -> Unit = {},
    onFilterClick: () -> Unit = {},
    scrollOffsetPx: Float = 0f
) {
    val extraColors = LocalExtraColors.current
    val parallaxOffset = (scrollOffsetPx.coerceIn(0f, 320f)) * 0.16f

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Vibrant Royal Indigo & Vivid Violet Hero Card (Day Vision Signature)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 26.dp)
                .height(210.dp)
                .shadow(10.dp, RoundedCornerShape(26.dp), ambientColor = Color(0xFF4F46E5))
                .clip(RoundedCornerShape(26.dp))
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF4F46E5),
                            Color(0xFF6366F1),
                            Color(0xFF7C3AED)
                        )
                    )
                )
                .padding(horizontal = 20.dp, vertical = 20.dp)
        ) {
            // Subtle Parallax Decorative Orbs
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .align(Alignment.TopEnd)
                    .offset(x = 30.dp, y = (-30).dp)
                    .graphicsLayer { translationY = parallaxOffset * 0.5f }
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                Color.White.copy(alpha = 0.22f),
                                Color.Transparent
                            )
                        )
                    )
            )

            // Right-side Top-Rated Pro Crest
            Surface(
                color = Color.White.copy(alpha = 0.16f),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 6.dp)
                    .border(1.dp, Color.White.copy(alpha = 0.28f), RoundedCornerShape(18.dp))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        color = Color(0xFFFDE68A),
                        shape = CircleShape,
                        modifier = Modifier.size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Star,
                                contentDescription = null,
                                tint = Color(0xFFB45309),
                                modifier = Modifier.size(19.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(5.dp))
                    Text(
                        text = "4.9 ★",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 12.sp
                        ),
                        color = Color.White
                    )
                    Text(
                        text = "Top Rated",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
            }

            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(end = 86.dp)
                    .graphicsLayer { translationY = -parallaxOffset * 0.2f }
            ) {
                Surface(
                    color = Color.White.copy(alpha = 0.20f),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Verified,
                            contentDescription = null,
                            tint = Color(0xFF6EE7B7),
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "24/7 VERIFIED PROS",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 9.5.sp,
                                letterSpacing = 0.5.sp
                            ),
                            color = Color.White
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = "Your Service,\nOur Priority",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Black,
                        lineHeight = 29.sp,
                        fontSize = 24.sp
                    ),
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "Certified technicians with upfront pricing & escrow protection",
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp
                    ),
                    color = Color.White.copy(alpha = 0.88f)
                )
            }
        }

        // Floating Overlapping White Search Pill
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(28.dp),
            shadowElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
                .align(Alignment.BottomCenter)
                .height(52.dp)
                .border(1.dp, extraColors.border, RoundedCornerShape(28.dp))
                .clickable { onSearchClick() }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 16.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Search AC, plumbing, electrical...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                    modifier = Modifier.weight(1f)
                )
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .shadow(4.dp, CircleShape)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.secondary
                                )
                            )
                        )
                        .clickable { onFilterClick(); onSearchClick() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.ArrowForward,
                        contentDescription = "Go to search",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
