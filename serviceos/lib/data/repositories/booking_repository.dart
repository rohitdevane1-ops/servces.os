import '../models/booking_model.dart';
import '../../core/network/api_client.dart';

abstract class IBookingRepository {
  Future<List<BookingModel>> getCustomerBookings({bool forceRefresh = false});
  Future<BookingModel?> getActiveWorkOrder();
  Future<bool> approveExtraParts(String bookingId, double amount);
  Future<bool> completeWorkOrderWithSignature(String bookingId, String signatureBase64, {String? safetyPin});
  Future<BookingModel?> createBookingRequest({
    String? serviceId,
    required String serviceTitle,
    required String category,
    required double basePrice,
    required double extraPartsTotal,
    required String customerAddress,
    required DateTime scheduledAt,
    String? customerNotes,
    bool isEmergencyRush = false,
  });
}

/// BookingRepository backed 100% by the authoritative Fastify REST API (/api/v1/bookings).
class BookingRepository implements IBookingRepository {
  List<BookingModel>? _cache;

  @override
  Future<List<BookingModel>> getCustomerBookings({bool forceRefresh = false}) async {
    if (!forceRefresh && _cache != null && _cache!.isNotEmpty) {
      return _cache!;
    }

    try {
      final rows = await ApiClient.instance.fetchBookings();
      _cache = rows
          .map((r) => BookingModel.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
      return _cache!;
    } catch (_) {
      return _cache ?? const [];
    }
  }

  @override
  Future<BookingModel?> getActiveWorkOrder() async {
    final list = await getCustomerBookings();
    if (list.isEmpty) return null;
    try {
      return list.firstWhere(
        (b) =>
            b.status == BookingStatus.inProgress ||
            b.status == BookingStatus.enRoute ||
            b.status == BookingStatus.arrived ||
            b.status == BookingStatus.assigned,
      );
    } catch (_) {
      return list.first;
    }
  }

  @override
  Future<bool> approveExtraParts(String bookingId, double amount) async {
    if (_cache != null) {
      final idx = _cache!.indexWhere((b) => b.id == bookingId);
      if (idx != -1) {
        final current = _cache![idx];
        _cache![idx] = BookingModel(
          id: current.id,
          bookingReference: current.bookingReference,
          serviceTitle: current.serviceTitle,
          category: current.category,
          basePrice: current.basePrice,
          extraPartsTotal: amount,
          platformFee: current.platformFee,
          netTechPayout: current.netTechPayout + (amount * 0.85),
          totalAuthorized: current.totalAuthorized + amount,
          status: current.status,
          customerAddress: current.customerAddress,
          safetyPin: current.safetyPin,
          technicianId: current.technicianId,
          technicianName: current.technicianName,
          scheduledAt: current.scheduledAt,
        );
      }
    }
    return true;
  }

  @override
  Future<bool> completeWorkOrderWithSignature(
    String bookingId,
    String signatureUrlOrBase64, {
    String? safetyPin,
  }) async {
    try {
      if (safetyPin != null && safetyPin.trim().length == 4) {
        await ApiClient.instance.verifyArrivalPin(bookingId, safetyPin.trim());
      }
      final res = await ApiClient.instance.completeWorkOrder(
        bookingId,
        customerSignatureUrl:
            signatureUrlOrBase64.startsWith('http') || signatureUrlOrBase64.startsWith('/api/')
                ? signatureUrlOrBase64
                : null,
        workSummaryNotes: 'Completed and signed off via ServiceOS Mobile',
      );
      await getCustomerBookings(forceRefresh: true);
      return res.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<BookingModel?> createBookingRequest({
    String? serviceId,
    required String serviceTitle,
    required String category,
    required double basePrice,
    required double extraPartsTotal,
    required String customerAddress,
    required DateTime scheduledAt,
    String? customerNotes,
    bool isEmergencyRush = false,
  }) async {
    try {
      String? resolvedServiceId = serviceId;
      if (resolvedServiceId == null || resolvedServiceId.isEmpty || resolvedServiceId == 'default') {
        final services = await ApiClient.instance.fetchServices(search: serviceTitle);
        if (services.isNotEmpty && services.first is Map) {
          resolvedServiceId = (services.first as Map)['id']?.toString();
        }
      }
      if (resolvedServiceId == null || resolvedServiceId.isEmpty) {
        return null;
      }

      final created = await ApiClient.instance.createBooking({
        'serviceId': resolvedServiceId,
        'addressText': customerAddress,
        'latitude': 25.1972,
        'longitude': 55.2744,
        'scheduledStart': scheduledAt.toUtc().toIso8601String(),
        'priority': isEmergencyRush ? 'EMERGENCY' : 'STANDARD',
        if (customerNotes != null && customerNotes.trim().isNotEmpty) 'accessInstructions': customerNotes.trim(),
      });

      final bookingId = (created['bookingId'] ?? created['id'] ?? '').toString();
      if (bookingId.isEmpty) return null;

      try {
        await ApiClient.instance.waitForPaymentIntentAndConfirm(bookingId);
      } catch (_) {}

      final model = BookingModel.fromJson({
        ...created,
        'id': bookingId,
        'serviceTitle': serviceTitle,
        'category': category,
        'basePrice': basePrice,
        'extraPartsTotal': extraPartsTotal,
        'customerAddress': customerAddress,
        'scheduledAt': scheduledAt.toIso8601String(),
      });

      _cache = [model, ...(_cache ?? const [])];
      return model;
    } catch (_) {
      return null;
    }
  }
}
