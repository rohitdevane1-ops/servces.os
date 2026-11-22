package com.serviceos.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (role: String) -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }
    var step by remember { mutableStateOf(1) } // 1: Email & Password, 2: MFA TOTP
    var mfaSessionToken by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var isDemoMode by remember { mutableStateOf(ApiClient.isDemoMode) }

    LaunchedEffect(Unit) {
        ApiClient.fetchSystemConfig().onSuccess {
            isDemoMode = ApiClient.isDemoMode
        }
    }

    fun handleDemoLogin(role: String) {
        errorMessage = null
        isLoading = true
        coroutineScope.launch {
            val result = ApiClient.demoLogin(role)
            isLoading = false
            result.onSuccess {
                val resolvedRole = ApiClient.getUserRole() ?: role
                onLoginSuccess(resolvedRole)
            }.onFailure { err ->
                errorMessage = err.message ?: "Demo sandbox login unavailable."
            }
        }
    }

    fun handleLogin() {
        val trimmedEmail = email.trim()
        if (trimmedEmail.isBlank() || !trimmedEmail.contains("@")) {
            errorMessage = "Please enter a valid email address."
            return
        }
        if (password.length < 8) {
            errorMessage = "Password must be at least 8 characters."
            return
        }

        errorMessage = null
        isLoading = true

        coroutineScope.launch {
            val result = ApiClient.login(trimmedEmail, password)
            isLoading = false
            result.onSuccess { res ->
                val data = res.optJSONObject("data")
                val status = data?.optString("status")

                if (status == "MFA_REQUIRED") {
                    val token = data.optString("mfaSessionToken")
                    if (!token.isNullOrBlank()) {
                        mfaSessionToken = token
                        step = 2
                        return@onSuccess
                    }
                }

                // If access token was saved, advance with authoritative role
                if (!ApiClient.getAccessToken().isNullOrBlank()) {
                    val role = ApiClient.getUserRole() ?: "CUSTOMER"
                    onLoginSuccess(role)
                } else {
                    errorMessage = res.optJSONObject("error")?.optString("message") ?: "Login failed."
                }
            }.onFailure { err ->
                errorMessage = err.message ?: "Authentication failed. Please verify your credentials."
            }
        }
    }

    fun handleVerifyMfa() {
        val trimmedCode = totpCode.trim()
        val token = mfaSessionToken

        if (trimmedCode.length != 6) {
            errorMessage = "Please enter the complete 6-digit TOTP code."
            return
        }
        if (token.isNullOrBlank()) {
            errorMessage = "MFA challenge expired. Please sign in again."
            step = 1
            return
        }

        errorMessage = null
        isLoading = true

        coroutineScope.launch {
            val result = ApiClient.verifyMfa(token, trimmedCode)
            isLoading = false
            result.onSuccess {
                if (!ApiClient.getAccessToken().isNullOrBlank()) {
                    val role = ApiClient.getUserRole() ?: "CUSTOMER"
                    onLoginSuccess(role)
                } else {
                    errorMessage = "Failed to establish authenticated session."
                }
            }.onFailure { err ->
                errorMessage = err.message ?: "Verification code invalid or expired."
            }
        }
    }

    fun handleRestoreSavedSession() {
        val refreshToken = ApiClient.getRefreshToken()
        if (refreshToken.isNullOrBlank()) {
            errorMessage = "No saved session found. Please sign in with email and password."
            return
        }

        errorMessage = null
        isLoading = true

        coroutineScope.launch {
            val result = ApiClient.refreshToken()
            isLoading = false
            result.onSuccess {
                val role = ApiClient.getUserRole() ?: "CUSTOMER"
                onLoginSuccess(role)
            }.onFailure {
                errorMessage = "Saved session expired. Please enter password."
            }
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Spacer(modifier = Modifier.height(20.dp))
                Surface(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (step == 1) Icons.Default.Shield else Icons.Default.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                Text(
                    text = if (step == 1) "Sign In to ServiceOS" else "Two-Factor Verification",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black)
                )

                Text(
                    text = if (step == 1)
                        "Enter your credentials to access your enterprise services account."
                    else
                        "Enter the 6-digit verification code from your authenticator app.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )

                if (!errorMessage.isNullOrBlank()) {
                    Surface(
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }

                if (step == 1) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email Address") },
                        leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    OutlinedTextField(
                        value = totpCode,
                        onValueChange = { if (it.length <= 6) totpCode = it },
                        label = { Text("6-Digit TOTP Code") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    TextButton(
                        onClick = {
                            step = 1
                            mfaSessionToken = null
                            totpCode = ""
                        },
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text("← Back to Email Sign-In")
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        if (step == 1) handleLogin() else handleVerifyMfa()
                    },
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = if (step == 1) "Sign In →" else "Verify & Continue →",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }

                if (step == 1) {
                    if (isDemoMode) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { handleDemoLogin("CUSTOMER") },
                                enabled = !isLoading,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp)
                            ) {
                                Text("Demo Customer")
                            }
                            OutlinedButton(
                                onClick = { handleDemoLogin("TECHNICIAN") },
                                enabled = !isLoading,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp)
                            ) {
                                Text("Demo Technician")
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = { handleRestoreSavedSession() },
                        enabled = !isLoading,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Quick Sign-In with Saved Session")
                    }
                }
            }
        }
    }
}
