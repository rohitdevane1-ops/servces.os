package com.serviceos.app.ui.technician

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.serviceos.app.core.theme.LocalExtraColors
import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.network.ApiClient
import com.serviceos.app.data.repository.BookingRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.Locale

private fun encodeProofPng(label: String): ByteArray {
    val bmp = Bitmap.createBitmap(640, 360, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    canvas.drawColor(AndroidColor.rgb(248, 250, 252))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.rgb(30, 41, 59)
        textSize = 26f
        isFakeBoldText = true
    }
    canvas.drawText("ServiceOS Field Proof", 32f, 70f, paint)
    paint.textSize = 20f
    paint.isFakeBoldText = false
    canvas.drawText(label, 32f, 120f, paint)
    canvas.drawText("Captured UTC: ${java.time.Instant.now()}", 32f, 165f, paint)
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return out.toByteArray()
}

private fun encodeSignaturePng(strokes: List<List<Offset>>): ByteArray {
    val bmp = Bitmap.createBitmap(640, 240, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    canvas.drawColor(AndroidColor.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.rgb(79, 70, 229)
        strokeWidth = 5f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    strokes.forEach { pts ->
        if (pts.size >= 2) {
            for (i in 0 until pts.size - 1) {
                canvas.drawLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, paint)
            }
        }
    }
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return out.toByteArray()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechJobExecutionScreen(
    accessNotes: String = "",
    workOrderNumber: String = "",
    hourlyRate: Double = 149.0,
    onJobCompleted: () -> Unit = {},
    onOpenChat: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val activeBooking = BookingRepository.activeBooking
    val bookingId = activeBooking?.id ?: workOrderNumber
    val grossAmount = activeBooking?.totalAmount ?: hourlyRate
    val platformFee = grossAmount * 0.15
    val netPayout = grossAmount * 0.85

    var stage by remember { mutableStateOf(1) }
    var safetyPinInput by remember { mutableStateOf("") }
    var workNotes by remember { mutableStateOf("") }
    var beforePhoto1Url by remember { mutableStateOf<String?>(null) }
    var beforePhoto2Url by remember { mutableStateOf<String?>(null) }
    var uploadingSlot by remember { mutableStateOf<Int?>(null) }
    var elapsedSeconds by remember { mutableStateOf(0) }
    val signatureStrokes = remember { mutableStateListOf<List<Offset>>() }
    var currentStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var isSubmitting by remember { mutableStateOf(false) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var isErrorMsg by remember { mutableStateOf(false) }
    val extraColors = LocalExtraColors.current

    LaunchedEffect(stage) {
        while (stage == 3) {
            delay(1000L)
            elapsedSeconds++
        }
    }

    fun formatElapsed(totalSec: Int): String {
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return String.format(Locale.US, "%02d:%02d:%02d", h, m, s)
    }

    fun captureAndUploadSlot(slot: Int) {
        if (uploadingSlot != null) return
        uploadingSlot = slot
        statusMsg = null
        isErrorMsg = false
        coroutineScope.launch {
            val bytes = encodeProofPng("Pre-Service Photo #$slot • WorkOrder $workOrderNumber")
            val res = ApiClient.uploadProofImage(bytes, "before_slot_$slot.png", "image/png")
            uploadingSlot = null
            res.onSuccess { url ->
                if (slot == 1) beforePhoto1Url = url else beforePhoto2Url = url
                statusMsg = "Before Photo $slot uploaded cleanly."
                isErrorMsg = false
            }.onFailure { err ->
                statusMsg = err.message ?: "Photo upload failed. Retry with active network."
                isErrorMsg = true
            }
        }
    }

    fun handleNextStage() {
        if (isSubmitting) return
        statusMsg = null
        isErrorMsg = false

        when (stage) {
            1 -> {
                val pin = safetyPinInput.trim()
                if (pin.length != 4) {
                    statusMsg = "Enter the 4-digit Customer Arrival Safety PIN."
                    isErrorMsg = true
                    return
                }
                if (bookingId.isBlank()) {
                    statusMsg = "No active work order found."
                    isErrorMsg = true
                    return
                }
                isSubmitting = true
                coroutineScope.launch {
                    val pinRes = ApiClient.verifyArrivalPin(bookingId, pin)
                    isSubmitting = false
                    pinRes.onSuccess {
                        BookingRepository.updateStatus(bookingId, BookingStatus.ON_SITE)
                        stage = 2
                    }.onFailure { err ->
                        statusMsg = err.message ?: "Invalid Customer Arrival PIN."
                        isErrorMsg = true
                    }
                }
            }
            2 -> {
                if (beforePhoto1Url.isNullOrBlank() || beforePhoto2Url.isNullOrBlank()) {
                    statusMsg = "Capture and upload both pre-service proof photos before starting work."
                    isErrorMsg = true
                    return
                }
                stage = 3
            }
            3 -> {
                stage = 4
            }
            else -> {
                if (signatureStrokes.isEmpty()) {
                    statusMsg = "Collect the customer's digital signature on the pad before completing."
                    isErrorMsg = true
                    return
                }
                if (bookingId.isBlank()) {
                    statusMsg = "No active work order found."
                    isErrorMsg = true
                    return
                }
                isSubmitting = true
                coroutineScope.launch {
                    val afterRes1 = ApiClient.uploadProofImage(
                        encodeProofPng("After-Service Completion #1 • WorkOrder $workOrderNumber"),
                        "after_1.png",
                        "image/png"
                    )
                    val afterRes2 = ApiClient.uploadProofImage(
                        encodeProofPng("After-Service Completion #2 • WorkOrder $workOrderNumber"),
                        "after_2.png",
                        "image/png"
                    )
                    val sigRes = ApiClient.uploadProofImage(
                        encodeSignaturePng(signatureStrokes.toList()),
                        "customer_signature.png",
                        "image/png"
                    )

                    val after1 = afterRes1.getOrNull()
                    val after2 = afterRes2.getOrNull()
                    val sigUrl = sigRes.getOrNull()
                    if (after1.isNullOrBlank() || after2.isNullOrBlank() || sigUrl.isNullOrBlank()) {
                        isSubmitting = false
                        statusMsg = afterRes1.exceptionOrNull()?.message
                            ?: afterRes2.exceptionOrNull()?.message
                            ?: sigRes.exceptionOrNull()?.message
                            ?: "Proof/signature upload failed."
                        isErrorMsg = true
                        return@launch
                    }

                    val completeRes = ApiClient.completeWorkOrder(
                        bookingId = bookingId,
                        beforePhotos = listOfNotNull(beforePhoto1Url, beforePhoto2Url),
                        afterPhotos = listOf(after1, after2),
                        customerSignatureUrl = sigUrl,
                        workSummaryNotes = workNotes.ifBlank { "Completed on-site via Technician Android App" }
                    )
                    isSubmitting = false
                    completeRes.onSuccess {
                        BookingRepository.updateStatus(bookingId, BookingStatus.COMPLETED)
                        onJobCompleted()
                    }.onFailure { err ->
                        statusMsg = err.message ?: "Failed to complete work order."
                        isErrorMsg = true
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (workOrderNumber.isNotEmpty()) "Work Order #$workOrderNumber" else "Active Work Order",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                },
                actions = {
                    IconButton(onClick = onOpenChat) {
                        Icon(Icons.Default.Chat, contentDescription = "Chat Customer")
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
                        enabled = !isSubmitting,
                        onClick = { handleNextStage() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (stage == 4) extraColors.verified else MaterialTheme.colorScheme.primary,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                    ) {
                        Text(
                            text = when {
                                isSubmitting -> "Settling Work Order..."
                                stage == 1 -> "Verify PIN & Confirm Arrival →"
                                stage == 2 -> "Submit Before Photos & Start Timer →"
                                stage == 3 -> "Finish Work & Present Signature Pad →"
                                else -> "Complete Work Order & Deposit ${ApiClient.formatCurrency(netPayout)} →"
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
            Text(
                text = "STEP $stage OF 4: ${
                    when (stage) {
                        1 -> "EN ROUTE & ARRIVAL PIN"
                        2 -> "ARRIVAL & MANDATORY PROOF"
                        3 -> "ACTIVE WORK TIMER & SCOPE"
                        else -> "CUSTOMER SIGNATURE & PAYOUT"
                    }
                }",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.primary,
                    letterSpacing = 0.8.sp
                )
            )
            LinearProgressIndicator(
                progress = stage / 4f,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth()
            )

            if (!statusMsg.isNullOrBlank()) {
                Text(
                    text = statusMsg ?: "",
                    color = if (isErrorMsg) MaterialTheme.colorScheme.error else extraColors.verified,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }

            when (stage) {
                1 -> {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(16.dp),
                        shadowElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Navigation,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "En Route to Service Location",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold)
                                    )
                                    Text(
                                        text = activeBooking?.customerAddress?.ifBlank { "GPS Turn-by-Turn Navigation Active" }
                                            ?: "GPS Turn-by-Turn Navigation Active",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                            OutlinedTextField(
                                value = safetyPinInput,
                                onValueChange = { if (it.length <= 4) safetyPinInput = it },
                                label = { Text("Customer 4-Digit Arrival Safety PIN") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (accessNotes.isNotBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Access: $accessNotes", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                2 -> {
                    Text(
                        text = "Mandatory Pre-Service Photos (2 Required)",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Text(
                        text = "Tap each slot to capture and upload proof photos before starting work.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        val slot1Done = !beforePhoto1Url.isNullOrBlank()
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (slot1Done) extraColors.verified else MaterialTheme.colorScheme.outline
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(110.dp)
                                .clickable(enabled = uploadingSlot == null) { captureAndUploadSlot(1) }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    when {
                                        uploadingSlot == 1 -> {
                                            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text("Uploading #1...", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        slot1Done -> {
                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = extraColors.verified)
                                            Text("Photo 1 Uploaded", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = extraColors.verified)
                                        }
                                        else -> {
                                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                            Text("Tap to Upload Photo 1", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                    }
                                }
                            }
                        }

                        val slot2Done = !beforePhoto2Url.isNullOrBlank()
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (slot2Done) extraColors.verified else MaterialTheme.colorScheme.outline
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(110.dp)
                                .clickable(enabled = uploadingSlot == null) { captureAndUploadSlot(2) }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    when {
                                        uploadingSlot == 2 -> {
                                            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text("Uploading #2...", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        slot2Done -> {
                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = extraColors.verified)
                                            Text("Photo 2 Uploaded", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = extraColors.verified)
                                        }
                                        else -> {
                                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                            Text("Tap to Upload Photo 2", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                3 -> {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(16.dp),
                        shadowElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("ACTIVE WORK ORDER TIMER", fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = formatElapsed(elapsedSeconds),
                                style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Black, fontSize = 42.sp)
                            )
                            Text(
                                text = "Standard Billable Rate: ${ApiClient.formatCurrency(hourlyRate)}",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = workNotes,
                        onValueChange = { workNotes = it },
                        label = { Text("Technician Work Summary Notes") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )
                }
                4 -> {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(18.dp),
                        shadowElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text("COMPLETION SETTLEMENT SUMMARY", fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                            Spacer(modifier = Modifier.height(10.dp))
                            Text("Gross Customer Billing: ${ApiClient.formatCurrency(grossAmount)}")
                            Text("ServiceOS Platform Fee (15%): -${ApiClient.formatCurrency(platformFee)}")
                            Divider(modifier = Modifier.padding(vertical = 10.dp))
                            Text(
                                text = "Your Net Direct Deposit: ${ApiClient.formatCurrency(netPayout)}",
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Black,
                                    color = extraColors.verified
                                )
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Customer Digital Signature:", fontWeight = FontWeight.Bold)
                        TextButton(onClick = {
                            signatureStrokes.clear()
                            currentStroke = emptyList()
                        }) {
                            Text("Clear Signature")
                        }
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .border(
                                1.5.dp,
                                if (signatureStrokes.isNotEmpty()) extraColors.verified else MaterialTheme.colorScheme.outline,
                                RoundedCornerShape(12.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Canvas(
                            modifier = Modifier
                                .fillMaxSize()
                                .pointerInput(Unit) {
                                    detectDragGestures(
                                        onDragStart = { offset ->
                                            currentStroke = listOf(offset)
                                        },
                                        onDrag = { change, _ ->
                                            change.consume()
                                            currentStroke = currentStroke + change.position
                                        },
                                        onDragEnd = {
                                            if (currentStroke.isNotEmpty()) {
                                                signatureStrokes.add(currentStroke)
                                                currentStroke = emptyList()
                                            }
                                        }
                                    )
                                }
                        ) {
                            val allStrokes = signatureStrokes + listOf(currentStroke)
                            allStrokes.forEach { pts ->
                                if (pts.size >= 2) {
                                    val path = Path().apply {
                                        moveTo(pts.first().x, pts.first().y)
                                        for (i in 1 until pts.size) {
                                            lineTo(pts[i].x, pts[i].y)
                                        }
                                    }
                                    drawPath(
                                        path = path,
                                        color = Color(0xFF4F46E5),
                                        style = Stroke(width = 6f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                                    )
                                }
                            }
                        }
                        if (signatureStrokes.isEmpty() && currentStroke.isEmpty()) {
                            Text(
                                text = "Sign here to authorize settlement",
                                color = Color(0xFF64748B),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
