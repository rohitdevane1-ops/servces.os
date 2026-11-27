package com.serviceos.app.data.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.serviceos.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object ApiClient {
    private const val PREFS_NAME = "serviceos_secure_prefs"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_TENANT_ID = "tenant_id"
    private const val KEY_USER_ROLE = "user_role"

    private var prefs: SharedPreferences? = null
    private var baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')
    private var tenantId: String? = null
    private val refreshMutex = Mutex()

    @Volatile
    var isDemoMode: Boolean = false
        private set

    @Volatile
    var currencyCode: String = "AED"
        private set

    @Volatile
    var currencySymbol: String = "AED "
        private set

    @Volatile
    var vatPercent: Double = 5.0
        private set

    @Volatile
    var taxName: String = "VAT"
        private set

    @Volatile
    var emergencyPhone: String? = null
        private set

    @Volatile
    var supportPhone: String? = null
        private set

    @Volatile
    var defaultMapLat: Double = 25.2048
        private set

    @Volatile
    var defaultMapLng: Double = 55.2708
        private set

    fun formatCurrency(amount: Double): String {
        val safe = if (amount.isFinite()) amount else 0.0
        val sym = currencySymbol.trim()
        if (sym == "$" || sym == "€" || sym == "£" || sym == "₹") {
            return String.format(java.util.Locale.US, "%s%.2f", sym, safe)
        }
        return String.format(java.util.Locale.US, "%s %.2f", currencyCode, safe)
    }

    @Synchronized
    fun init(context: Context, customBaseUrl: String? = null, customTenantId: String? = null) {
        if (prefs == null) {
            val masterKey = MasterKey.Builder(context.applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            prefs = EncryptedSharedPreferences.create(
                context.applicationContext,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
        if (!customBaseUrl.isNullOrBlank()) {
            baseUrl = customBaseUrl.trimEnd('/')
        }
        if (!customTenantId.isNullOrBlank() && customTenantId != "00000000-0000-0000-0000-000000000001") {
            tenantId = customTenantId
        }
    }

    fun setTokens(accessToken: String, refreshToken: String) {
        prefs?.edit()
            ?.putString(KEY_ACCESS_TOKEN, accessToken)
            ?.putString(KEY_REFRESH_TOKEN, refreshToken)
            ?.apply()
    }

    fun setUserRole(role: String?) {
        if (role.isNullOrBlank()) {
            prefs?.edit()?.remove(KEY_USER_ROLE)?.apply()
        } else {
            prefs?.edit()?.putString(KEY_USER_ROLE, role.uppercase())?.apply()
        }
    }

    fun getUserRole(): String? = prefs?.getString(KEY_USER_ROLE, null)

    fun getAccessToken(): String? = prefs?.getString(KEY_ACCESS_TOKEN, null)

    fun getRefreshToken(): String? = prefs?.getString(KEY_REFRESH_TOKEN, null)

    fun clearTokens() {
        prefs?.edit()
            ?.remove(KEY_ACCESS_TOKEN)
            ?.remove(KEY_REFRESH_TOKEN)
            ?.remove(KEY_USER_ROLE)
            ?.apply()
    }

    fun setTenantId(id: String?) {
        tenantId = if (id.isNullOrBlank() || id == "00000000-0000-0000-0000-000000000001") null else id
        if (tenantId == null) {
            prefs?.edit()?.remove(KEY_TENANT_ID)?.apply()
        } else {
            prefs?.edit()?.putString(KEY_TENANT_ID, tenantId)?.apply()
        }
    }

    fun getTenantId(): String? = tenantId ?: prefs?.getString(KEY_TENANT_ID, null)

    private fun extractAndPersistTokens(data: JSONObject?) {
        if (data == null) return
        val tokensObj = data.optJSONObject("tokens")
        val accessToken = data.optString("accessToken").ifBlank { tokensObj?.optString("accessToken") ?: "" }
        val refreshToken = data.optString("refreshToken").ifBlank { tokensObj?.optString("refreshToken") ?: "" }
        val role = data.optJSONObject("user")?.optString("role")
        val tenant = data.optJSONObject("user")?.optString("tenantId")
            ?.ifBlank { data.optString("tenantId") }

        if (!role.isNullOrBlank()) {
            setUserRole(role)
        }
        if (!tenant.isNullOrBlank()) {
            setTenantId(tenant)
        }
        if (accessToken.isNotBlank() && refreshToken.isNotBlank()) {
            setTokens(accessToken, refreshToken)
        } else if (accessToken.isNotBlank()) {
            val existingRefresh = getRefreshToken() ?: ""
            setTokens(accessToken, existingRefresh)
        }
    }

    private suspend fun executeRequest(
        endpoint: String,
        method: String = "GET",
        bodyJson: JSONObject? = null,
        allowRetry: Boolean = true
    ): Result<JSONObject> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL("$baseUrl$endpoint")
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15000
                readTimeout = 15000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("x-client-platform", "android")

                val currentTenantId = getTenantId()
                if (!currentTenantId.isNullOrBlank()) {
                    setRequestProperty("x-tenant-id", currentTenantId)
                }

                val token = getAccessToken()
                if (!token.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $token")
                }

                if (bodyJson != null && (method == "POST" || method == "PUT" || method == "PATCH")) {
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    OutputStreamWriter(outputStream, "UTF-8").use { it.write(bodyJson.toString()) }
                }
            }

            val statusCode = connection.responseCode

            // Single-flight 401 token refresh handling
            if (allowRetry && statusCode == 401 && endpoint != "/auth/login" && endpoint != "/auth/refresh" && endpoint != "/auth/demo-login") {
                val refreshed = refreshMutex.withLock {
                    refreshToken().isSuccess
                }
                if (refreshed) {
                    return@withContext executeRequest(endpoint, method, bodyJson, allowRetry = false)
                } else {
                    clearTokens()
                }
            }

            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val responseString = if (stream != null) {
                BufferedReader(InputStreamReader(stream, "UTF-8")).use { it.readText() }
            } else {
                "{}"
            }

            val json = try {
                JSONObject(responseString.ifBlank { "{}" })
            } catch (_: Exception) {
                JSONObject().put("success", false).put("error", JSONObject().put("message", "HTTP $statusCode"))
            }
            if (statusCode in 200..299 && json.optBoolean("success", true)) {
                Result.success(json)
            } else {
                val errorMsg = json.optJSONObject("error")?.optString("message")
                    ?: "Request failed with code $statusCode"
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }

    // =========================================================================
    // SYSTEM RUNTIME & TENANT CONFIG
    // =========================================================================
    suspend fun fetchHealth(): Result<JSONObject> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val origin = baseUrl.removeSuffix("/api/v1").trimEnd('/')
            val url = URL("$origin/health")
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Accept", "application/json")
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (code in 200..299) Result.success(json)
            else Result.failure(Exception("Health check failed ($code)"))
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }

    suspend fun fetchSystemConfig(): Result<JSONObject> {
        val result = executeRequest("/system/config", "GET")
        result.onSuccess { res ->
            val data = res.optJSONObject("data")
            if (data != null) {
                isDemoMode = data.optBoolean("demoMode", false)
                val tenant = data.optJSONObject("tenant")
                currencyCode = tenant?.optString("currencyCode")
                    ?.ifBlank { data.optString("defaultCurrency", "AED") } ?: "AED"
                currencySymbol = tenant?.optString("currencySymbol")
                    ?.ifBlank { "$currencyCode " } ?: "$currencyCode "
                taxName = tenant?.optString("taxName")
                    ?.ifBlank { data.optString("defaultTaxName", "VAT") } ?: "VAT"
                val tenantVat = tenant?.optDouble("vatPercent", Double.NaN)
                vatPercent = if (tenantVat != null && !tenantVat.isNaN()) {
                    tenantVat
                } else {
                    data.optDouble("defaultVatPercent", 5.0)
                }
                emergencyPhone = tenant?.optString("emergencyPhone")?.takeIf { it.isNotBlank() && it != "null" }
                supportPhone = tenant?.optString("supportPhone")?.takeIf { it.isNotBlank() && it != "null" }
                val lat = tenant?.optDouble("defaultMapLat", Double.NaN)
                if (lat != null && !lat.isNaN()) defaultMapLat = lat
                val lng = tenant?.optDouble("defaultMapLng", Double.NaN)
                if (lng != null && !lng.isNaN()) defaultMapLng = lng
            }
        }
        return result
    }

    // =========================================================================
    // AUTHENTICATION OPERATIONS
    // =========================================================================
    suspend fun register(
        email: String,
        password: String,
        fullName: String,
        phone: String? = null
    ): Result<JSONObject> {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
            put("fullName", fullName)
            if (!phone.isNullOrBlank()) put("phone", phone)
        }
        val result = executeRequest("/auth/register", "POST", body, allowRetry = false)
        result.onSuccess { res ->
            extractAndPersistTokens(res.optJSONObject("data"))
        }
        return result
    }

    suspend fun login(email: String, password: String): Result<JSONObject> {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
        }
        val result = executeRequest("/auth/login", "POST", body)
        result.onSuccess { res ->
            extractAndPersistTokens(res.optJSONObject("data"))
        }
        return result
    }

    suspend fun demoLogin(role: String): Result<JSONObject> {
        val normalizedRole = if (role.uppercase() == "TECHNICIAN") "TECHNICIAN" else "CUSTOMER"
        val body = JSONObject().apply {
            put("role", normalizedRole)
        }
        val result = executeRequest("/auth/demo-login", "POST", body)
        result.onSuccess { res ->
            extractAndPersistTokens(res.optJSONObject("data"))
        }
        return result
    }

    suspend fun verifyMfa(mfaSessionToken: String, totpCode: String): Result<JSONObject> {
        val body = JSONObject().apply {
            put("mfaSessionToken", mfaSessionToken)
            put("totpCode", totpCode)
        }
        val result = executeRequest("/auth/mfa/verify", "POST", body)
        result.onSuccess { res ->
            extractAndPersistTokens(res.optJSONObject("data"))
        }
        return result
    }

    suspend fun refreshToken(): Result<JSONObject> {
        val currentRefresh = getRefreshToken() ?: return Result.failure(Exception("No refresh token stored"))
        val body = JSONObject().apply {
            put("refreshToken", currentRefresh)
        }
        val result = executeRequest("/auth/refresh", "POST", body, allowRetry = false)
        result.onSuccess { res ->
            extractAndPersistTokens(res.optJSONObject("data"))
        }
        return result
    }

    suspend fun logout(): Result<JSONObject> {
        val currentRefresh = getRefreshToken()
        val body = if (currentRefresh != null) JSONObject().apply { put("refreshToken", currentRefresh) } else null
        val result = executeRequest("/auth/logout", "POST", body, allowRetry = false)
        clearTokens()
        return result
    }

    suspend fun validateSession(): Result<JSONObject> {
        val result = executeRequest("/auth/me", "GET")
        result.onSuccess { res ->
            val data = res.optJSONObject("data")
            val role = data?.optJSONObject("user")?.optString("role")
            if (!role.isNullOrBlank()) {
                setUserRole(role)
            }
        }
        return result
    }

    // =========================================================================
    // CATALOG & BOOKING OPERATIONS
    // =========================================================================
    suspend fun fetchCategories(): Result<JSONArray> {
        val result = executeRequest("/services/categories", "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchServices(categoryId: String? = null): Result<JSONArray> {
        val endpoint = if (!categoryId.isNullOrBlank()) "/services?categoryId=$categoryId" else "/services"
        val result = executeRequest(endpoint, "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchBookings(status: String? = null): Result<JSONArray> {
        val endpoint = if (!status.isNullOrBlank()) "/bookings?status=$status" else "/bookings"
        val result = executeRequest(endpoint, "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchBookingDetails(bookingId: String): Result<JSONObject> {
        return executeRequest("/bookings/$bookingId", "GET")
    }

    suspend fun rescheduleBooking(
        bookingId: String,
        scheduledStart: String,
        reason: String? = null
    ): Result<JSONObject> {
        val body = JSONObject().apply {
            put("scheduledStart", scheduledStart)
            if (!reason.isNullOrBlank()) put("reason", reason)
        }
        return executeRequest("/bookings/$bookingId/reschedule", "PATCH", body)
    }

    suspend fun createBooking(bookingJson: JSONObject): Result<JSONObject> {
        return executeRequest("/bookings", "POST", bookingJson)
    }

    suspend fun confirmPayment(bookingId: String): Result<JSONObject> {
        return executeRequest("/bookings/$bookingId/confirm-payment", "POST", JSONObject())
    }

    suspend fun fetchBookingPaymentIntent(bookingId: String): Result<JSONObject> {
        return executeRequest("/bookings/$bookingId/payment-intent", "GET")
    }

    suspend fun waitForPaymentIntentAndConfirm(
        bookingId: String,
        maxAttempts: Int = 10,
        pollDelayMs: Long = 500L
    ): Result<JSONObject> {
        var lastError: Throwable? = null
        for (attempt in 0 until maxAttempts) {
            val intentRes = fetchBookingPaymentIntent(bookingId)
            val raw = intentRes.getOrNull()
            if (raw != null) {
                val data = raw.optJSONObject("data") ?: raw
                val outboxStatus = data.optString("outboxStatus", "").uppercase()
                val piId = data.optString("paymentIntentId", "")
                val bookingStatus = data.optString("status", "").uppercase()
                if (outboxStatus == "FAILED" || bookingStatus == "FAILED") {
                    val errText = data.optString("error", "Payment pre-authorization failed")
                    return Result.failure(Exception(errText))
                }
                if (piId.isNotBlank() || outboxStatus == "COMPLETED") {
                    break
                }
            } else {
                lastError = intentRes.exceptionOrNull()
            }
            if (attempt < maxAttempts - 1) {
                kotlinx.coroutines.delay(pollDelayMs)
            }
        }
        val confirmed = confirmPayment(bookingId)
        if (confirmed.isFailure && lastError != null) {
            return Result.failure(confirmed.exceptionOrNull() ?: lastError)
        }
        return confirmed
    }

    suspend fun cancelBooking(bookingId: String, reason: String?): Result<JSONObject> {
        val body = JSONObject().apply {
            if (reason != null) put("reason", reason)
        }
        return executeRequest("/bookings/$bookingId/cancel", "POST", body)
    }

    suspend fun verifyArrivalPin(bookingId: String, pin: String): Result<JSONObject> {
        val body = JSONObject().apply { put("safetyPin", pin) }
        return executeRequest("/bookings/$bookingId/verify-arrival", "POST", body)
    }

    suspend fun completeWorkOrder(
        bookingId: String,
        beforePhotos: List<String> = emptyList(),
        afterPhotos: List<String> = emptyList(),
        customerSignatureUrl: String? = null,
        workSummaryNotes: String? = null
    ): Result<JSONObject> {
        val body = JSONObject().apply {
            put("beforePhotos", JSONArray(beforePhotos))
            put("afterPhotos", JSONArray(afterPhotos))
            if (!customerSignatureUrl.isNullOrBlank()) put("customerSignatureUrl", customerSignatureUrl)
            if (!workSummaryNotes.isNullOrBlank()) put("workSummaryNotes", workSummaryNotes)
        }
        return executeRequest("/bookings/$bookingId/complete", "POST", body)
    }

    // =========================================================================
    // DISPATCH RADAR, BROADCASTS, TELEMETRY & SUPPORT
    // =========================================================================
    suspend fun fetchPendingBroadcasts(): Result<JSONArray> {
        val result = executeRequest("/dispatch/broadcasts/pending", "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun acceptBroadcast(broadcastId: String): Result<JSONObject> {
        val body = JSONObject().apply { put("broadcastId", broadcastId) }
        return executeRequest("/dispatch/broadcasts/accept", "POST", body)
    }

    suspend fun declineBroadcast(broadcastId: String, reason: String? = null): Result<JSONObject> {
        val body = JSONObject().apply {
            put("broadcastId", broadcastId)
            if (!reason.isNullOrBlank()) put("reason", reason)
        }
        return executeRequest("/dispatch/broadcasts/decline", "POST", body)
    }

    suspend fun updateDutyStatus(dutyStatus: String): Result<JSONObject> {
        val body = JSONObject().apply { put("dutyStatus", dutyStatus) }
        return executeRequest("/crm/technicians/duty-status", "PUT", body)
    }

    suspend fun sendLocationPing(lat: Double, lng: Double, heading: Double? = null, dutyStatus: String? = null): Result<Boolean> {
        val body = JSONObject().apply {
            put("latitude", lat)
            put("longitude", lng)
            if (heading != null) put("headingDegrees", heading)
            if (dutyStatus != null) put("dutyStatus", dutyStatus)
        }
        val result = executeRequest("/crm/technicians/location-ping", "POST", body)
        return result.map { true }
    }

    suspend fun submitReview(bookingId: String, rating: Int, comment: String? = null): Result<JSONObject> {
        val body = JSONObject().apply {
            put("bookingId", bookingId)
            put("rating", rating)
            if (!comment.isNullOrBlank()) put("comment", comment)
        }
        return executeRequest("/support/reviews", "POST", body)
    }

    suspend fun fetchReviews(providerId: String? = null): Result<JSONArray> {
        val endpoint = if (!providerId.isNullOrBlank()) "/support/reviews?providerId=$providerId" else "/support/reviews"
        val result = executeRequest(endpoint, "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchCmsConfig(): Result<JSONObject> {
        return executeRequest("/support/settings/cms", "GET")
    }

    suspend fun fetchTickets(): Result<JSONArray> {
        val result = executeRequest("/support/tickets", "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchTicketDetails(ticketId: String): Result<JSONObject> {
        return executeRequest("/support/tickets/$ticketId", "GET")
    }

    suspend fun openSupportTicket(
        subject: String,
        initialMessage: String,
        category: String = "General Support",
        priority: String = "NORMAL",
        bookingId: String? = null
    ): Result<JSONObject> {
        val body = JSONObject().apply {
            put("subject", subject)
            put("category", category)
            put("priority", priority)
            put("initialMessage", initialMessage)
            if (!bookingId.isNullOrBlank()) put("bookingId", bookingId)
        }
        return executeRequest("/support/tickets", "POST", body)
    }

    suspend fun postTicketMessage(ticketId: String, messageBody: String): Result<JSONObject> {
        val body = JSONObject().apply {
            put("messageBody", messageBody)
            put("attachmentsUrls", JSONArray())
        }
        return executeRequest("/support/tickets/$ticketId/messages", "POST", body)
    }

    suspend fun fetchTechnicianEarnings(): Result<JSONObject> {
        return executeRequest("/crm/technicians/me/earnings", "GET")
    }

    suspend fun getBookingMessages(bookingId: String): Result<JSONArray> {
        val result = executeRequest("/bookings/$bookingId/messages", "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun sendBookingMessage(
        bookingId: String,
        messageBody: String,
        attachmentUrls: List<String> = emptyList()
    ): Result<JSONObject> {
        val urlsJson = JSONArray()
        attachmentUrls.forEach { urlsJson.put(it) }
        val body = JSONObject().apply {
            put("messageBody", messageBody)
            if (attachmentUrls.isNotEmpty()) put("attachmentsUrls", urlsJson)
        }
        return executeRequest("/bookings/$bookingId/messages", "POST", body)
    }

    suspend fun getTechnicianOnboarding(): Result<JSONArray> {
        val result = executeRequest("/crm/technicians/onboarding", "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun submitTechnicianOnboarding(
        licenseNumber: String,
        nationalIdNumber: String?,
        vehicleMakeModel: String,
        vehicleLicensePlate: String,
        tradeCategory: String,
        documentUrls: List<String>
    ): Result<JSONObject> {
        val urlsJson = JSONArray()
        documentUrls.forEach { urlsJson.put(it) }
        val body = JSONObject().apply {
            put("licenseNumber", licenseNumber)
            if (!nationalIdNumber.isNullOrBlank()) put("nationalIdNumber", nationalIdNumber)
            put("vehicleMakeModel", vehicleMakeModel)
            put("vehicleLicensePlate", vehicleLicensePlate)
            put("tradeCategory", tradeCategory)
            put("documentUrls", urlsJson)
        }
        return executeRequest("/crm/technicians/onboarding", "POST", body)
    }

    suspend fun updateProfile(
        fullName: String? = null,
        phone: String? = null,
        defaultAddress: String? = null
    ): Result<JSONObject> {
        val body = JSONObject().apply {
            if (!fullName.isNullOrBlank()) put("fullName", fullName)
            if (phone != null) put("phone", phone)
            if (defaultAddress != null) put("defaultAddress", defaultAddress)
        }
        return executeRequest("/auth/me", "PUT", body)
    }

    suspend fun uploadProofImage(
        bytes: ByteArray,
        filename: String = "proof.png",
        mimeType: String = "image/png",
        allowRetry: Boolean = true
    ): Result<String> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val boundary = "----ServiceOSBoundary${System.currentTimeMillis()}"
            val url = URL("$baseUrl/uploads")
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 15000
                doOutput = true
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                setRequestProperty("x-client-platform", "android")

                val currentTenantId = getTenantId()
                if (!currentTenantId.isNullOrBlank()) {
                    setRequestProperty("x-tenant-id", currentTenantId)
                }
                val token = getAccessToken()
                if (!token.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $token")
                }

                java.io.DataOutputStream(outputStream).use { dos ->
                    dos.writeBytes("--$boundary\r\n")
                    dos.writeBytes("Content-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\n")
                    dos.writeBytes("Content-Type: $mimeType\r\n\r\n")
                    dos.write(bytes)
                    dos.writeBytes("\r\n--$boundary--\r\n")
                    dos.flush()
                }
            }

            val statusCode = connection.responseCode
            if (allowRetry && statusCode == 401) {
                val refreshed = refreshMutex.withLock {
                    refreshToken().isSuccess
                }
                if (refreshed) {
                    return@withContext uploadProofImage(bytes, filename, mimeType, allowRetry = false)
                } else {
                    clearTokens()
                }
            }

            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val responseString = if (stream != null) {
                BufferedReader(InputStreamReader(stream, "UTF-8")).use { it.readText() }
            } else {
                "{}"
            }
            val json = JSONObject(responseString.ifBlank { "{}" })
            val uploadedUrl = json.optJSONObject("data")?.optString("url", "") ?: ""
            if (statusCode in 200..299 && json.optBoolean("success", true) && uploadedUrl.isNotBlank()) {
                Result.success(uploadedUrl)
            } else {
                val msg = json.optJSONObject("error")?.optString("message") ?: "Upload failed ($statusCode)"
                Result.failure(Exception(msg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }
}
