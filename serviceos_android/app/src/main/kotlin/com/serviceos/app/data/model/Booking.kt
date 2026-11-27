package com.serviceos.app.data.model

enum class BookingStatus(val label: String) {
    REQUESTED("Matching Pro"),
    BROADCASTING("Broadcasting"),
    SCHEDULED("Scheduled"),
    ASSIGNED("Assigned"),
    CONFIRMED("Confirmed"),
    DISPATCHED("Dispatched"),
    EN_ROUTE("En Route"),
    ON_SITE("On Site"),
    IN_PROGRESS("In Progress"),
    COMPLETED("Completed"),
    CANCELLED("Cancelled")
}

data class Booking(
    val id: String,
    val reference: String,
    val serviceTitle: String,
    val categoryName: String,
    val technicianName: String,
    val technicianAvatar: String,
    val technicianRating: Double,
    val customerAddress: String,
    val scheduledTime: String,
    val baseAmount: Double,
    val extraPartsAmount: Double = 0.0,
    val taxAmount: Double = 0.0,
    val totalAmount: Double,
    val status: BookingStatus,
    val safetyPin: String = "",
    val requiresClientAction: Boolean = false,
    val checkoutRedirectUrl: String? = null
)
