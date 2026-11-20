package com.serviceos.app.data.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
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
    private const val DEFAULT_BASE_URL = "http://10.0.2.2:3000/api/v1"

    private var prefs: SharedPreferences? = null
    private var baseUrl: String = DEFAULT_BASE_URL
    private var tenantId: String? = null

    @Synchronized
    fun init(context: Context, customBaseUrl: String? = null, customTenantId: String? = null) {
        if (prefs == null) {
            val masterKey = MasterKey.Builder(context.applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            // Fail closed: enforce AES-256 encrypted storage, do not fall back to plaintext SharedPreferences
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
    }

    fun getTenantId(): String? = tenantId ?: prefs?.getString(KEY_TENANT_ID, null)

    private suspend fun executeRequest(
        endpoint: String,
        method: String = "GET",
        bodyJson: JSONObject? = null
    ): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl$endpoint")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15000
                readTimeout = 15000
                setRequestProperty("Content-Type", "application/json")
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
                    doOutput = true
                    OutputStreamWriter(outputStream, "UTF-8").use { it.write(bodyJson.toString()) }
                }
            }

            val statusCode = connection.responseCode

            // Automatic 401 token refresh handling
            if (statusCode == 401 && endpoint != "/auth/login" && endpoint != "/auth/refresh") {
                val refreshResult = refreshToken()
                if (refreshResult.isSuccess) {
                    return@withContext executeRequest(endpoint, method, bodyJson)
                } else {
                    clearTokens()
                }
            }

            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val responseString = BufferedReader(InputStreamReader(stream, "UTF-8")).use { it.readText() }

            val json = JSONObject(responseString)
            if (statusCode in 200..299 && json.optBoolean("success", true)) {
                Result.success(json)
            } else {
                val errorMsg = json.optJSONObject("error")?.optString("message") 
                    ?: "Request failed with code $statusCode"
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // =========================================================================
    // AUTHENTICATION OPERATIONS
    // =========================================================================
    suspend fun login(email: String, password: String): Result<JSONObject> {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
        }
        val result = executeRequest("/auth/login", "POST", body)
        result.onSuccess { res ->
            val data = res.optJSONObject("data")
            val accessToken = data?.optString("accessToken")
            val refreshToken = data?.optString("refreshToken")
            val role = data?.optJSONObject("user")?.optString("role")
            if (!role.isNullOrBlank()) {
                setUserRole(role)
            }
            if (!accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()) {
                setTokens(accessToken, refreshToken)
            }
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
            val data = res.optJSONObject("data")
            val accessToken = data?.optString("accessToken")
            val refreshToken = data?.optString("refreshToken")
            val role = data?.optJSONObject("user")?.optString("role")
            if (!role.isNullOrBlank()) {
                setUserRole(role)
            }
            if (!accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()) {
                setTokens(accessToken, refreshToken)
            }
        }
        return result
    }

    suspend fun refreshToken(): Result<JSONObject> {
        val currentRefresh = getRefreshToken() ?: return Result.failure(Exception("No refresh token stored"))
        val body = JSONObject().apply {
            put("refreshToken", currentRefresh)
        }
        val result = executeRequest("/auth/refresh", "POST", body)
        result.onSuccess { res ->
            val data = res.optJSONObject("data")
            val newAccess = data?.optString("accessToken")
            val newRefresh = data?.optString("refreshToken") ?: currentRefresh
            val role = data?.optJSONObject("user")?.optString("role")
            if (!role.isNullOrBlank()) {
                setUserRole(role)
            }
            if (!newAccess.isNullOrBlank()) {
                setTokens(newAccess, newRefresh)
            }
        }
        return result
    }

    suspend fun logout(): Result<JSONObject> {
        val currentRefresh = getRefreshToken()
        val body = if (currentRefresh != null) JSONObject().apply { put("refreshToken", currentRefresh) } else null
        val result = executeRequest("/auth/logout", "POST", body)
        clearTokens()
        return result
    }

    suspend fun validateSession(): Result<JSONObject> {
        var result = executeRequest("/auth/me", "GET")
        if (result.isFailure && getRefreshToken() != null) {
            val refreshResult = refreshToken()
            if (refreshResult.isSuccess) {
                result = executeRequest("/auth/me", "GET")
            } else {
                clearTokens()
            }
        }
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
        val endpoint = if (categoryId != null) "/services?categoryId=$categoryId" else "/services"
        val result = executeRequest(endpoint, "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun fetchBookings(status: String? = null): Result<JSONArray> {
        val endpoint = if (status != null) "/bookings?status=$status" else "/bookings"
        val result = executeRequest(endpoint, "GET")
        return result.map { it.optJSONArray("data") ?: JSONArray() }
    }

    suspend fun createBooking(bookingJson: JSONObject): Result<JSONObject> {
        return executeRequest("/bookings", "POST", bookingJson)
    }

    suspend fun fetchBookingPaymentIntent(bookingId: String): Result<JSONObject> {
        return executeRequest("/bookings/$bookingId/payment-intent", "GET")
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
}
