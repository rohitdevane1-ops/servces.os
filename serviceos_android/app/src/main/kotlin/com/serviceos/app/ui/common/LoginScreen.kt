package com.serviceos.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.BuildConfig
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (role: String) -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()

    var isRegisterMode by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }
    var step by remember { mutableStateOf(1) } // 1: Email & Password, 2: MFA TOTP
    var mfaSessionToken by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var isDemoMode by remember { mutableStateOf(ApiClient.isDemoMode && BuildConfig.DEMO_MODE) }

    LaunchedEffect(Unit) {
        ApiClient.fetchSystemConfig().onSuccess {
            isDemoMode = ApiClient.isDemoMode && BuildConfig.DEMO_MODE
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

    fun handleRegister() {
        val trimmedName = fullName.trim()
        val trimmedEmail = email.trim()
        if (trimmedName.length < 2) {
            errorMessage = "Please enter your full name."
            return
        }
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
            val result = ApiClient.register(
                email = trimmedEmail,
                password = password,
                fullName = trimmedName,
                phone = phone.trim().ifBlank { null }
            )
            isLoading = false
            result.onSuccess {
                if (!ApiClient.getAccessToken().isNullOrBlank()) {
                    val role = ApiClient.getUserRole() ?: "CUSTOMER"
                    onLoginSuccess(role)
                } else {
                    errorMessage = "Registration succeeded, please sign in."
                    isRegisterMode = false
                }
            }.onFailure { err ->
                errorMessage = err.message ?: "Unable to create account."
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

    val extraColors = LocalExtraColors.current

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Brand Hero Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(15.dp))
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(Color(0xFF4F46E5), Color(0xFF7C3AED))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (step == 1) Icons.Default.Shield else Icons.Default.Lock,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Column {
                        Text(
                            text = "ServiceOS",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontWeight = FontWeight.Black,
                                fontSize = 20.sp
                            ),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Customer & Pro Portal",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }

                Surface(
                    color = extraColors.verified.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.border(
                        1.dp,
                        extraColors.verified.copy(alpha = 0.3f),
                        RoundedCornerShape(20.dp)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.VerifiedUser,
                            contentDescription = null,
                            tint = extraColors.verified,
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = "256-Bit SSL",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 10.sp
                            ),
                            color = extraColors.verified
                        )
                    }
                }
            }

            // Elevated Sign-In / Sign-Up Card
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(24.dp),
                shadowElevation = 4.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, extraColors.border, RoundedCornerShape(24.dp))
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = when {
                            step == 2 -> "Two-Factor Verification"
                            isRegisterMode -> "Create Customer Account"
                            else -> "Welcome Back"
                        },
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Black),
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Text(
                        text = when {
                            step == 2 -> "Enter the 6-digit verification code from your authenticator app."
                            isRegisterMode -> "Book trusted pros with upfront pricing & escrow protection."
                            else -> "Sign in as a Customer or Verified Field Technician."
                        },
                        style = MaterialTheme.typography.bodySmall.copy(lineHeight = 18.sp),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f)
                    )

                    if (step == 1) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .border(1.dp, extraColors.border, RoundedCornerShape(14.dp))
                                .padding(4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Surface(
                                color = if (!isRegisterMode) MaterialTheme.colorScheme.primary else Color.Transparent,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        isRegisterMode = false
                                        errorMessage = null
                                    }
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 10.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Sign In",
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold),
                                        color = if (!isRegisterMode) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                    )
                                }
                            }
                            Surface(
                                color = if (isRegisterMode) MaterialTheme.colorScheme.primary else Color.Transparent,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        isRegisterMode = true
                                        errorMessage = null
                                    }
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 10.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Create Account",
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold),
                                        color = if (isRegisterMode) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                    )
                                }
                            }
                        }
                    }

                    if (!errorMessage.isNullOrBlank()) {
                        Surface(
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
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
                        if (isRegisterMode) {
                            OutlinedTextField(
                                value = fullName,
                                onValueChange = { fullName = it },
                                label = { Text("Full Name") },
                                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            )
                            OutlinedTextField(
                                value = phone,
                                onValueChange = { phone = it },
                                label = { Text("Phone Number (Optional)") },
                                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            )
                        }

                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email Address") },
                            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
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
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        OutlinedTextField(
                            value = totpCode,
                            onValueChange = { if (it.length <= 6) totpCode = it },
                            label = { Text("6-Digit TOTP Code") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
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

                    Spacer(modifier = Modifier.height(2.dp))

                    // Royal Indigo -> Violet Gradient Primary Action CTA
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(Color(0xFF4F46E5), Color(0xFF7C3AED))
                                )
                            )
                            .clickable(enabled = !isLoading) {
                                when {
                                    step == 2 -> handleVerifyMfa()
                                    isRegisterMode -> handleRegister()
                                    else -> handleLogin()
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(22.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Text(
                                    text = when {
                                        step == 2 -> "Verify & Continue"
                                        isRegisterMode -> "Create Account"
                                        else -> "Sign In"
                                    },
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                                    color = Color.White
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Default.ArrowForward,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }

            if (step == 1 && !isRegisterMode) {
                if (isDemoMode) {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, extraColors.border, RoundedCornerShape(20.dp))
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "INSTANT SANDBOX ACCESS",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 0.8.sp
                                ),
                                color = MaterialTheme.colorScheme.primary
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .border(
                                            1.dp,
                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
                                            RoundedCornerShape(14.dp)
                                        )
                                        .clickable(enabled = !isLoading) { handleDemoLogin("CUSTOMER") }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Person,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Text(
                                            text = "Demo Customer",
                                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = "Book & track pros",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                        )
                                    }
                                }

                                Surface(
                                    color = extraColors.verified.copy(alpha = 0.08f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .border(
                                            1.dp,
                                            extraColors.verified.copy(alpha = 0.28f),
                                            RoundedCornerShape(14.dp)
                                        )
                                        .clickable(enabled = !isLoading) { handleDemoLogin("TECHNICIAN") }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Engineering,
                                            contentDescription = null,
                                            tint = extraColors.verified,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Text(
                                            text = "Demo Technician",
                                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = "Radar & 85% payouts",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                        )
                                    }
                                }
                            }
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
