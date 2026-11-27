package com.serviceos.app.ui.technician

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechOnboardingScreen(
    onBack: () -> Unit = {},
    onFinish: () -> Unit = {}
) {
    val context = LocalContext.current
    val extraColors = LocalExtraColors.current
    val coroutineScope = rememberCoroutineScope()
    var step by remember { mutableStateOf(1) } // 1: Entity & Trade, 2: License & KYC, 3: Vehicle & Submit
    var tradeCategory by remember { mutableStateOf("HVAC & Cooling") }
    var licenseNumber by remember { mutableStateOf("") }
    var nationalIdNumber by remember { mutableStateOf("") }
    var vehicleMakeModel by remember { mutableStateOf("") }
    var vehiclePlate by remember { mutableStateOf("") }
    var uploadedDocUrl by remember { mutableStateOf<String?>(null) }
    var uploadedFileName by remember { mutableStateOf<String?>(null) }
    var submissionStatus by remember { mutableStateOf<String?>(null) }
    var isUploadingDoc by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val docPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        coroutineScope.launch {
            isUploadingDoc = true
            errorMessage = null
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes == null || bytes.isEmpty()) {
                    errorMessage = "Could not read selected KYC document."
                } else {
                    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                    val name = uri.lastPathSegment?.substringAfterLast('/')?.ifBlank { "kyc_license.jpg" } ?: "kyc_license.jpg"
                    ApiClient.uploadProofImage(bytes, name, mime).onSuccess { url ->
                        uploadedDocUrl = url
                        uploadedFileName = name
                    }.onFailure { err ->
                        errorMessage = err.message ?: "Failed to upload verification document."
                    }
                }
            } catch (e: Exception) {
                errorMessage = e.message ?: "Error reading selected file."
            } finally {
                isUploadingDoc = false
            }
        }
    }

    LaunchedEffect(Unit) {
        if (!ApiClient.getAccessToken().isNullOrBlank()) {
            ApiClient.getTechnicianOnboarding().onSuccess { arr ->
                val latest = arr.optJSONObject(0) ?: return@onSuccess
                submissionStatus = latest.optString("status", "").ifBlank { null }
                if (licenseNumber.isBlank()) licenseNumber = latest.optString("licenseNumber", "")
                if (nationalIdNumber.isBlank()) nationalIdNumber = latest.optString("nationalIdNumber", "")
                if (vehicleMakeModel.isBlank()) vehicleMakeModel = latest.optString("vehicleMakeModel", "")
                if (vehiclePlate.isBlank()) vehiclePlate = latest.optString("vehicleLicensePlate", "")
                if (tradeCategory.isBlank()) tradeCategory = latest.optString("tradeCategory", "HVAC & Cooling")
                val docs = latest.optJSONArray("documentUrls")
                if (docs != null && docs.length() > 0 && uploadedDocUrl == null) {
                    uploadedDocUrl = docs.optString(0, "").ifBlank { null }
                    if (uploadedDocUrl != null) uploadedFileName = "Existing Uploaded KYC Document"
                }
            }
        }
    }

    fun submitCredentials() {
        val docUrl = uploadedDocUrl
        if (docUrl.isNullOrBlank()) {
            errorMessage = "Please upload your trade license or government ID document."
            step = 2
            return
        }
        isSubmitting = true
        errorMessage = null
        coroutineScope.launch {
            val res = ApiClient.submitTechnicianOnboarding(
                licenseNumber = licenseNumber.trim(),
                nationalIdNumber = nationalIdNumber.trim().ifBlank { null },
                vehicleMakeModel = vehicleMakeModel.trim(),
                vehicleLicensePlate = vehiclePlate.trim(),
                tradeCategory = tradeCategory.trim().ifBlank { "General" },
                documentUrls = listOf(docUrl)
            )
            if (res.isSuccess) {
                ApiClient.updateDutyStatus("ONLINE")
            }
            isSubmitting = false
            res.onSuccess { json ->
                val data = json.optJSONObject("data") ?: json
                submissionStatus = data.optString("status", "SUBMITTED")
                onFinish()
            }.onFailure { err ->
                errorMessage = err.message ?: "Unable to submit KYC onboarding packet."
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pro Partner Onboarding ($step/3)") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (step > 1) step-- else onBack()
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 8.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(modifier = Modifier.padding(16.dp)) {
                    Button(
                        enabled = !isSubmitting && !isUploadingDoc,
                        onClick = {
                            errorMessage = null
                            if (step == 2 && (licenseNumber.isBlank() || uploadedDocUrl.isNullOrBlank())) {
                                errorMessage = "Enter your trade license number and upload a KYC verification photo/document."
                                return@Button
                            }
                            if (step == 3 && (vehicleMakeModel.isBlank() || vehiclePlate.isBlank())) {
                                errorMessage = "Enter your vehicle make/model and license plate."
                                return@Button
                            }
                            if (step < 3) step++ else submitCredentials()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Text(
                            text = when {
                                isSubmitting -> "Submitting Verification..."
                                step == 3 -> "Submit Credentials & Go Online →"
                                else -> "Continue →"
                            },
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            LinearProgressIndicator(
                progress = { step / 3f },
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth()
            )

            if (!submissionStatus.isNullOrBlank()) {
                Surface(
                    color = extraColors.verified.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Latest KYC Status: $submissionStatus",
                        color = extraColors.verified,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            if (!errorMessage.isNullOrBlank()) {
                Text(
                    text = errorMessage ?: "",
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }

            when (step) {
                1 -> {
                    Text("1. Trade Specialization & Partner Profile", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    Text("Select your primary trade category for dispatch verification.", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    OutlinedTextField(
                        value = tradeCategory,
                        onValueChange = { tradeCategory = it },
                        label = { Text("Primary Trade Category") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(14.dp),
                        border = androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Independent Contractor (Verified Trade Partner)", fontWeight = FontWeight.Bold)
                            Text("Direct Stripe Connect payouts with compliant escrow ledger audit records.", fontSize = 12.sp)
                        }
                    }
                }
                2 -> {
                    Text("2. Trade License & Government KYC", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    OutlinedTextField(
                        value = licenseNumber,
                        onValueChange = { licenseNumber = it },
                        label = { Text("Trade License #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = nationalIdNumber,
                        onValueChange = { nationalIdNumber = it },
                        label = { Text("Government / National ID # (Optional)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedButton(
                        enabled = !isUploadingDoc,
                        onClick = { docPicker.launch("image/*") },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            if (uploadedDocUrl != null) Icons.Default.CheckCircle else Icons.Default.UploadFile,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            when {
                                isUploadingDoc -> "Uploading Document..."
                                uploadedFileName != null -> "Uploaded: $uploadedFileName"
                                else -> "Upload License / ID Document *"
                            }
                        )
                    }
                }
                3 -> {
                    Text("3. Dispatch Vehicle & Activation", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    OutlinedTextField(
                        value = vehicleMakeModel,
                        onValueChange = { vehicleMakeModel = it },
                        label = { Text("Service Vehicle Make & Model") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = vehiclePlate,
                        onValueChange = { vehiclePlate = it },
                        label = { Text("Vehicle License Plate") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}
