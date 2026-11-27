package com.serviceos.app.core.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class ServiceOSExtraColors(
    val border: Color,
    val rating: Color,
    val verified: Color,
    val warning: Color,
    val heroGradientStart: Color,
    val heroGradientEnd: Color
)

val LocalExtraColors = staticCompositionLocalOf {
    ServiceOSExtraColors(
        border = DayBorder,
        rating = RatingAmber,
        verified = VerifiedEmerald,
        warning = WarningOrange,
        heroGradientStart = Color(0xFFEEF2FF),
        heroGradientEnd = Color(0xFFEDE9FE)
    )
}

@Composable
fun ServiceOSTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val animSpec = tween<Color>(durationMillis = 260)
    val primary by animateColorAsState(if (darkTheme) NightPrimary else DayPrimary, animSpec, label = "primary")
    val secondary by animateColorAsState(if (darkTheme) NightAccent else DayAccent, animSpec, label = "secondary")
    val background by animateColorAsState(if (darkTheme) NightCanvas else DayCanvas, animSpec, label = "background")
    val surface by animateColorAsState(if (darkTheme) NightSurface else DaySurface, animSpec, label = "surface")
    val onBackground by animateColorAsState(if (darkTheme) NightTextPrimary else DayTextPrimary, animSpec, label = "onBackground")
    val outline by animateColorAsState(if (darkTheme) NightBorder else DayBorder, animSpec, label = "outline")

    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = primary,
            secondary = secondary,
            background = background,
            surface = surface,
            onPrimary = Color.White,
            onSecondary = Color.White,
            onBackground = onBackground,
            onSurface = onBackground,
            outline = outline
        )
    } else {
        lightColorScheme(
            primary = primary,
            secondary = secondary,
            background = background,
            surface = surface,
            onPrimary = Color.White,
            onSecondary = Color.White,
            onBackground = onBackground,
            onSurface = onBackground,
            outline = outline
        )
    }

    val extraColors = ServiceOSExtraColors(
        border = outline,
        rating = RatingAmber,
        verified = VerifiedEmerald,
        warning = WarningOrange,
        heroGradientStart = if (darkTheme) Color(0xFF0F172A) else Color(0xFFEEF2FF),
        heroGradientEnd = if (darkTheme) Color(0xFF1E1B4B) else Color(0xFFEDE9FE)
    )

    CompositionLocalProvider(LocalExtraColors provides extraColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
