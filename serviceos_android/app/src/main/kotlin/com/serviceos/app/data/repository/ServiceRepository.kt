package com.serviceos.app.data.repository

import com.serviceos.app.data.model.ServiceCategory
import com.serviceos.app.data.model.ServiceItem
import com.serviceos.app.data.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

object ServiceRepository {
    private val _categories = MutableStateFlow<List<ServiceCategory>>(emptyList())
    val categoriesFlow: StateFlow<List<ServiceCategory>> = _categories.asStateFlow()

    private val _featuredServices = MutableStateFlow<List<ServiceItem>>(emptyList())
    val featuredServicesFlow: StateFlow<List<ServiceItem>> = _featuredServices.asStateFlow()

    private val _selectedService = MutableStateFlow<ServiceItem?>(null)
    val selectedServiceFlow: StateFlow<ServiceItem?> = _selectedService.asStateFlow()

    private val _selectedCategory = MutableStateFlow<ServiceCategory?>(null)
    val selectedCategoryFlow: StateFlow<ServiceCategory?> = _selectedCategory.asStateFlow()

    val categories: List<ServiceCategory>
        get() = _categories.value

    val featuredServices: List<ServiceItem>
        get() = _featuredServices.value

    val selectedService: ServiceItem?
        get() = _selectedService.value ?: _featuredServices.value.firstOrNull()

    val selectedCategory: ServiceCategory?
        get() = _selectedCategory.value ?: _categories.value.firstOrNull()

    fun selectService(service: ServiceItem) {
        _selectedService.value = service
    }

    fun selectCategory(category: ServiceCategory) {
        _selectedCategory.value = category
    }

    fun setCatalogue(categories: List<ServiceCategory>, services: List<ServiceItem>) {
        _categories.value = categories
        _featuredServices.value = services
        if (_selectedService.value == null && services.isNotEmpty()) {
            _selectedService.value = services.first()
        }
        if (_selectedCategory.value == null && categories.isNotEmpty()) {
            _selectedCategory.value = categories.first()
        }
    }

    fun parseCategoriesJson(arr: JSONArray): List<ServiceCategory> {
        val list = mutableListOf<ServiceCategory>()
        for (i in 0 until arr.length()) {
            val obj = arr.optJSONObject(i) ?: continue
            list.add(
                ServiceCategory(
                    id = obj.optString("id", "cat_$i"),
                    name = obj.optString("name", obj.optString("title", "Service Category")),
                    iconEmoji = "🔧",
                    isEmergencyEligible = true
                )
            )
        }
        return list
    }

    fun parseServicesJson(arr: JSONArray): List<ServiceItem> {
        val list = mutableListOf<ServiceItem>()
        for (i in 0 until arr.length()) {
            val obj = arr.optJSONObject(i) ?: continue
            val priceCentsStr = obj.optString("basePriceCents")
                .ifBlank { obj.optString("base_price_cents", "0") }
            val priceCents = priceCentsStr.toDoubleOrNull() ?: obj.optDouble("basePriceCents", 0.0)
            val basePrice = if (priceCents > 0.0) priceCents / 100.0 else obj.optDouble("price", 129.0)

            list.add(
                ServiceItem(
                    id = obj.optString("id", "svc_$i"),
                    title = obj.optString("name", obj.optString("title", "Home Service")),
                    categoryId = obj.optString("categoryId", obj.optString("category_id", "")),
                    basePrice = basePrice,
                    durationMinutes = obj.optInt("estimatedDurationMinutes", 60),
                    rating = 4.9,
                    reviewCount = 120,
                    imageUrl = obj.optString("imageUrl", ""),
                    isVerifiedPro = true
                )
            )
        }
        return list
    }

    suspend fun refreshFromBackend(): Boolean {
        val catsRes = ApiClient.fetchCategories()
        val svcsRes = ApiClient.fetchServices()

        val parsedCats = catsRes.getOrNull()?.let { parseCategoriesJson(it) } ?: emptyList()
        val parsedSvcs = svcsRes.getOrNull()?.let { parseServicesJson(it) } ?: emptyList()

        if (parsedCats.isNotEmpty() || parsedSvcs.isNotEmpty()) {
            setCatalogue(parsedCats, parsedSvcs)
            return true
        }
        return false
    }
}
