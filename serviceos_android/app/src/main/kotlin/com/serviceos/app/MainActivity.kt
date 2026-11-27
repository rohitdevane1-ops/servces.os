package com.serviceos.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.serviceos.app.core.navigation.ServiceOSNavHost
import com.serviceos.app.core.theme.ServiceOSTheme
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import com.serviceos.app.ui.debug.DebugScreenInspectorOverlay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ApiClient.init(applicationContext, BuildConfig.API_BASE_URL)
        BookingRepository.init(applicationContext)
        setContent {
            var isDarkMode by rememberSaveable { mutableStateOf(false) }

            ServiceOSTheme(darkTheme = isDarkMode) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    Box(modifier = Modifier.fillMaxSize()) {
                        ServiceOSNavHost(
                            navController = navController,
                            onThemeToggle = { isDarkMode = !isDarkMode }
                        )
                        DebugScreenInspectorOverlay(
                            navController = navController,
                            isDarkMode = isDarkMode,
                            onThemeToggle = { isDarkMode = !isDarkMode }
                        )
                    }
                }
            }
        }
    }
}
