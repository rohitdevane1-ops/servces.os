package com.serviceos.app.ui.debug

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController

@Composable
fun DebugScreenInspectorOverlay(
    navController: NavHostController,
    isDarkMode: Boolean,
    onThemeToggle: () -> Unit
) {
    // No-op in production release builds.
}
