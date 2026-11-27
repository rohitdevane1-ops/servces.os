package com.serviceos.app.data.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.serviceos.app.data.model.Booking
import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

object BookingRepository {
    private const val PREFS_NAME = "serviceos_bookings_prefs"
    private const val KEY_BOOKINGS_JSON = "saved_bookings_v1"

    private var prefs: SharedPreferences? = null
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookingsFlow: StateFlow<List<Booking>> = _bookings.asStateFlow()

    private val _selectedBooking = MutableStateFlow<Booking?>(null)
    val selectedBookingFlow: StateFlow<Booking?> = _selectedBooking.asStateFlow()

    val sampleBookings: List<Booking>
        get() = _bookings.value

    val activeBooking: Booking?
        get() = _selectedBooking.value ?: _bookings.value.firstOrNull()

    fun selectBooking(booking: Booking) {
        _selectedBooking.value = booking
    }

    @Synchronized
    fun init(context: Context) {
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
            loadFromPreferences()
        }
    }

    fun parseServerBookingsJson(arr: JSONArray): List<Booking> {
        val list = mutableListOf<Booking>()
        for (i in 0 until arr.length()) {
            val row = arr.optJSONObject(i) ?: continue
            list.add(parseServerBookingObject(row))
        }
        return list
    }

    fun parseServerBookingObject(row: JSONObject): Booking {
        val quotedCents = row.optString("quotedPriceCents")
            .ifBlank { row.optString("quoted_price_cents", "0") }
            .toDoubleOrNull() ?: row.optDouble("quotedPriceCents", 0.0)
        val finalCents = row.optString("finalPriceCents")
            .ifBlank { row.optString("final_price_cents", "0") }
            .toDoubleOrNull() ?: quotedCents

        val baseAmount = if (quotedCents > 0.0) quotedCents / 100.0 else row.optDouble("baseAmount", 0.0)
        val totalAmount = if (finalCents > 0.0) finalCents / 100.0 else baseAmount
        val taxAmount = (totalAmount - baseAmount).coerceAtLeast(0.0)
        val statusRaw = row.optString("status", "REQUESTED").uppercase()
        val parsedStatus = runCatching { BookingStatus.valueOf(statusRaw) }.getOrDefault(BookingStatus.REQUESTED)

        return Booking(
            id = row.optString("id", row.optString("bookingId", "")),
            reference = row.optString("bookingReference", row.optString("booking_reference", "")),
            serviceTitle = row.optString("serviceName", row.optString("serviceTitle", "Service Order")),
            categoryName = row.optString("categoryName", "Home Service"),
            technicianName = row.optString("providerName", row.optString("technicianName", "Awaiting Pro")),
            technicianAvatar = "",
            technicianRating = row.optDouble("providerRating", 0.0),
            customerAddress = row.optString("addressText", row.optString("customerAddress", "")),
            scheduledTime = row.optString("scheduledStart", row.optString("scheduledTime", "Scheduled")),
            baseAmount = baseAmount,
            extraPartsAmount = row.optDouble("extraPartsAmount", 0.0),
            taxAmount = taxAmount,
            totalAmount = totalAmount,
            status = parsedStatus,
            safetyPin = row.optString("customerSafetyPin", row.optString("safetyPin", ""))
        )
    }

    private fun loadFromPreferences() {
        val raw = prefs?.getString(KEY_BOOKINGS_JSON, null) ?: return
        try {
            val arr = JSONArray(raw)
            val parsed = parseServerBookingsJson(arr)
            _bookings.value = parsed
            if (_selectedBooking.value == null && parsed.isNotEmpty()) {
                _selectedBooking.value = parsed.first()
            }
        } catch (_: Exception) {
            _bookings.value = emptyList()
        }
    }

    @Synchronized
    private fun saveToPreferences() {
        val current = _bookings.value
        val arr = JSONArray()
        for (b in current) {
            val obj = JSONObject()
            obj.put("id", b.id)
            obj.put("bookingReference", b.reference)
            obj.put("serviceTitle", b.serviceTitle)
            obj.put("categoryName", b.categoryName)
            obj.put("technicianName", b.technicianName)
            obj.put("technicianAvatar", b.technicianAvatar)
            obj.put("technicianRating", b.technicianRating)
            obj.put("customerAddress", b.customerAddress)
            obj.put("scheduledTime", b.scheduledTime)
            obj.put("baseAmount", b.baseAmount)
            obj.put("extraPartsAmount", b.extraPartsAmount)
            obj.put("taxAmount", b.taxAmount)
            obj.put("totalAmount", b.totalAmount)
            obj.put("status", b.status.name)
            obj.put("safetyPin", b.safetyPin)
            arr.put(obj)
        }
        prefs?.edit()?.putString(KEY_BOOKINGS_JSON, arr.toString())?.apply()
    }

    fun addBooking(booking: Booking) {
        _bookings.update { listOf(booking) + it }
        _selectedBooking.value = booking
        saveToPreferences()
    }

    fun updateStatus(bookingId: String, newStatus: BookingStatus) {
        _bookings.update { list ->
            list.map {
                if (it.id == bookingId || it.reference == bookingId) it.copy(status = newStatus) else it
            }
        }
        _selectedBooking.value = _bookings.value.firstOrNull { it.id == bookingId || it.reference == bookingId }
            ?: _selectedBooking.value
        saveToPreferences()
    }

    suspend fun syncFromBackend(): Boolean {
        val res = ApiClient.fetchBookings()
        val arr = res.getOrNull() ?: return false
        val parsed = parseServerBookingsJson(arr)
        _bookings.value = parsed
        if (parsed.isNotEmpty()) {
            _selectedBooking.value = parsed.first()
        }
        saveToPreferences()
        return true
    }

    suspend fun fetchBookingDetail(bookingId: String): Result<JSONObject> {
        val res = ApiClient.fetchBookingDetails(bookingId)
        res.onSuccess { json ->
            val data = json.optJSONObject("data") ?: json
            val bookingObj = data.optJSONObject("booking") ?: data
            val parsed = parseServerBookingObject(bookingObj)
            if (parsed.id.isNotBlank()) {
                _bookings.update { list ->
                    val replaced = list.map { if (it.id == parsed.id) parsed else it }
                    if (replaced.any { it.id == parsed.id }) replaced else listOf(parsed) + replaced
                }
                if (_selectedBooking.value?.id == parsed.id || _selectedBooking.value == null) {
                    _selectedBooking.value = parsed
                }
                saveToPreferences()
            }
        }
        return res
    }

    suspend fun cancelBooking(bookingId: String, reason: String): Result<Unit> {
        val res = ApiClient.cancelBooking(bookingId, reason)
        return res.fold(
            onSuccess = {
                updateStatus(bookingId, BookingStatus.CANCELLED)
                syncFromBackend()
                Result.success(Unit)
            },
            onFailure = { Result.failure(it) }
        )
    }

    suspend fun rescheduleBooking(
        bookingId: String,
        scheduledStart: String,
        reason: String? = null
    ): Result<Unit> {
        val res = ApiClient.rescheduleBooking(bookingId, scheduledStart, reason)
        return res.fold(
            onSuccess = {
                syncFromBackend()
                Result.success(Unit)
            },
            onFailure = { Result.failure(it) }
        )
    }

    suspend fun createAndAuthorizeBooking(
        serviceId: String,
        serviceTitle: String,
        categoryName: String,
        addressText: String,
        baseAmount: Double,
        isEmergency: Boolean,
        accessInstructions: String? = null,
        scheduledStart: String? = null
    ): Result<Booking> {
        val payload = JSONObject().apply {
            put("serviceId", serviceId)
            put("addressText", addressText)
            put("latitude", ApiClient.defaultMapLat)
            put("longitude", ApiClient.defaultMapLng)
            put("priority", if (isEmergency) "EMERGENCY" else "STANDARD")
            if (!accessInstructions.isNullOrBlank()) put("accessInstructions", accessInstructions)
            if (!scheduledStart.isNullOrBlank()) put("scheduledStart", scheduledStart)
        }
        val createRes = ApiClient.createBooking(payload)
        val resJson = createRes.getOrElse { return Result.failure(it) }
        val data = resJson.optJSONObject("data") ?: resJson
        val bookingId = data.optString("bookingId", data.optString("id", ""))
        if (bookingId.isBlank()) {
            return Result.failure(Exception("Server did not return a valid booking ID."))
        }
        val confirmRes = ApiClient.waitForPaymentIntentAndConfirm(bookingId)
        val confirmJson = confirmRes.getOrElse {
            return Result.failure(it)
        }
        val confirmData = confirmJson.optJSONObject("data") ?: confirmJson
        val requiresClientAction = confirmData.optBoolean("requiresClientAction", false)
        val checkoutRedirectUrl = confirmData.optString("checkoutRedirectUrl", "").ifBlank { null }
        val tax = baseAmount * (ApiClient.vatPercent / 100.0)
        val created = Booking(
            id = bookingId,
            reference = data.optString("bookingReference", bookingId),
            serviceTitle = serviceTitle,
            categoryName = categoryName,
            technicianName = "Awaiting Assigned Pro",
            technicianAvatar = "",
            technicianRating = 0.0,
            customerAddress = addressText,
            scheduledTime = scheduledStart ?: "Today",
            baseAmount = baseAmount,
            extraPartsAmount = 0.0,
            taxAmount = tax,
            totalAmount = baseAmount + tax,
            status = BookingStatus.REQUESTED,
            safetyPin = data.optString("customerSafetyPin", data.optString("safetyPin", "")),
            requiresClientAction = requiresClientAction,
            checkoutRedirectUrl = checkoutRedirectUrl
        )
        addBooking(created)
        return Result.success(created)
    }
}
