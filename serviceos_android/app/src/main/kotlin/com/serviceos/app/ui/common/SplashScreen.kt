package com.serviceos.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.DayAccent
import com.serviceos.app.core.theme.DayPrimary

@Composable
fun SplashScreen(
    onGetStarted: () -> Unit = {}
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        DayPrimary,
                        DayAccent,
                        Color(0xFF0F172A)
                    )
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp, vertical = 20.dp)
    ) {
        // Subtle Ambient Radial Glow
        Box(
            modifier = Modifier
                .size(260.dp)
                .align(Alignment.TopEnd)
                .offset(x = 70.dp, y = (-40).dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color.White.copy(alpha = 0.16f), Color.Transparent)
                    )
                )
        )

        // Top Environment Chip
        Surface(
            color = Color.White.copy(alpha = 0.14f),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 12.dp)
                .border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(20.dp))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF34D399))
                )
                Text(
                    text = "TURNKEY HOME SERVICES SUITE",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.8.sp,
                        fontSize = 10.sp
                    ),
                    color = Color.White
                )
            }
        }

        // Center Brand Hero & Trust Badges
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(104.dp)
                    .clip(RoundedCornerShape(30.dp))
                    .background(Color.White.copy(alpha = 0.16f))
                    .border(1.5.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(30.dp)),
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    color = Color.White.copy(alpha = 0.22f),
                    shape = RoundedCornerShape(22.dp),
                    modifier = Modifier.size(78.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = "S",
                            fontSize = 42.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(22.dp))

            Text(
                text = "ServiceOS",
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontWeight = FontWeight.Black,
                    fontSize = 38.sp,
                    color = Color.White,
                    letterSpacing = (-0.5).sp
                )
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "International Home Services\nDispatch & Escrow Platform",
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge.copy(
                    color = Color.White.copy(alpha = 0.88f),
                    fontWeight = FontWeight.Medium,
                    lineHeight = 22.sp
                )
            )

            Spacer(modifier = Modifier.height(26.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SplashTrustBadge(Icons.Default.LocationOn, "PostGIS\nDispatch", Modifier.weight(1f))
                SplashTrustBadge(Icons.Default.Shield, "Escrow\nProtected", Modifier.weight(1f))
                SplashTrustBadge(Icons.Default.VerifiedUser, "Verified\nPros", Modifier.weight(1f))
            }
        }

        // Bottom Primary CTA with Safe Insets
        Button(
            onClick = onGetStarted,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = DayPrimary
            ),
            elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .align(Alignment.BottomCenter)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "Get Started",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Black,
                        fontSize = 16.sp
                    )
                )
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    imageVector = Icons.Default.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(19.dp)
                )
            }
        }
    }
}

@Composable
private fun SplashTrustBadge(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier
) {
    Surface(
        color = Color.White.copy(alpha = 0.12f),
        shape = RoundedCornerShape(16.dp),
        modifier = modifier.border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color(0xFF34D399),
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = label,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    lineHeight = 14.sp,
                    fontSize = 10.5.sp
                ),
                color = Color.White.copy(alpha = 0.94f)
            )
        }
    }
}
