package com.serviceos.app

import com.serviceos.app.data.model.BookingStatus
import com.serviceos.app.data.repository.BookingRepository
import com.serviceos.app.data.repository.ServiceRepository
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RepositoryParsingTest {
    @Test
    fun parseServicesJson_parsesBigIntBasePriceCentsStrings() {
        val arr = JSONArray().apply {
            put(
                JSONObject().apply {
                    put("id", "svc-101")
                    put("name", "Emergency Pipe Leak Repair")
                    put("categoryId", "cat-plumbing")
                    put("basePriceCents", "14900")
                    put("estimatedDurationMinutes", 60)
                }
            )
        }

        val services = ServiceRepository.parseServicesJson(arr)
        assertEquals(1, services.size)
        assertEquals("svc-101", services[0].id)
        assertEquals("Emergency Pipe Leak Repair", services[0].title)
        assertEquals(149.0, services[0].basePrice, 0.001)
        assertEquals(60, services[0].durationMinutes)
    }

    @Test
    fun parseServerBookingObject_parsesBigIntQuotedAndFinalPriceCents() {
        val row = JSONObject().apply {
            put("id", "b-202")
            put("bookingReference", "SO-20200")
            put("serviceName", "Seasonal AC Tune-up")
            put("categoryName", "HVAC")
            put("providerName", "Tariq Al-Mansoor")
            put("addressText", "Dubai Marina")
            put("quotedPriceCents", "20000")
            put("finalPriceCents", "21000")
            put("status", "EN_ROUTE")
            put("customerSafetyPin", "4821")
        }

        val booking = BookingRepository.parseServerBookingObject(row)
        assertEquals("b-202", booking.id)
        assertEquals("SO-20200", booking.reference)
        assertEquals(200.0, booking.baseAmount, 0.001)
        assertEquals(10.0, booking.taxAmount, 0.001)
        assertEquals(210.0, booking.totalAmount, 0.001)
        assertEquals(BookingStatus.EN_ROUTE, booking.status)
        assertEquals("4821", booking.safetyPin)
        assertTrue(booking.totalAmount > booking.baseAmount)
    }
}
