import 'dart:math';
import '../models/booking_model.dart';
import '../datasources/supabase_remote_datasource.dart';
import '../datasources/local_fixture_datasource.dart';
import '../../core/network/supabase_service.dart';

abstract class IBookingRepository {
  Future<List<BookingModel>> getCustomerBookings();
  Future<BookingModel?> getActiveWorkOrder();
  Future<bool> approveExtraParts(String bookingId, double amount);
  Future<bool> completeWorkOrderWithSignature(String bookingId, String signatureBase64, {String? safetyPin});
  Future<BookingModel?> createBookingRequest({
    required String serviceTitle,
    required String category,
    required double basePrice,
    required double extraPartsTotal,
    required String customerAddress,
    required DateTime scheduledAt,
    bool isEmergencyRush = false,
  });
}

class BookingRepository implements IBookingRepository {
  final ISupabaseRemoteDataSource _remoteDataSource;
  final ILocalFixtureDataSource _fixtureDataSource;
  final SupabaseService _supabaseService;

  BookingRepository({
    ISupabaseRemoteDataSource? remoteDataSource,
    ILocalFixtureDataSource? fixtureDataSource,
    SupabaseService? supabaseService,
  })  : _remoteDataSource = remoteDataSource ?? SupabaseRemoteDataSource(),
        _fixtureDataSource = fixtureDataSource ?? LocalFixtureDataSource(),
        _supabaseService = supabaseService ?? SupabaseService.instance;

  List<BookingModel>? _cache;

  @override
  Future<List<BookingModel>> getCustomerBookings() async {
    if (_cache != null && _cache!.isNotEmpty) {
      return _cache!;
    }

    // Try Supabase if live connected (aligned 1:1 with 01_initial_schema.sql bookings columns)
    if (_supabaseService.isLiveConnected) {
      try {
        final remote = await _remoteDataSource.fetchBookings();
        if (remote.isNotEmpty) {
          _cache = remote.map((row) {
            final s = row['services'] as Map<String, dynamic>? ?? {};
            final totalCents = (row['total_authorized_cents'] as num?)?.toDouble() ??
                (row['labor_cost_cents'] as num?)?.toDouble() ??
                0.0;
            final laborCents = (row['labor_cost_cents'] as num?)?.toDouble() ?? totalCents;
            final partsCents = (row['parts_total_cents'] as num?)?.toDouble() ?? 0;
            final feeCents = (row['platform_fee_cents'] as num?)?.toDouble() ?? (totalCents * 0.15);
            final netCents = (row['net_payout_cents'] as num?)?.toDouble() ?? (totalCents * 0.85);

            return BookingModel(
              id: row['id'] as String? ?? row['booking_reference'] as String? ?? '',
              serviceTitle: s['name'] as String? ?? 'Service Order',
              category: 'Home Service',
              basePrice: laborCents / 100,
              extraPartsTotal: partsCents / 100,
              platformFee: feeCents / 100,
              netTechPayout: netCents / 100,
              totalAuthorized: totalCents / 100,
              status: _parseBookingStatus(row['status'] as String? ?? 'REQUESTED'),
              customerAddress: row['address_text'] as String? ?? '',
              safetyPin: row['safety_pin'] as String? ?? '',
              technicianId: row['provider_id'] as String? ?? '',
              technicianName: row['technician_name'] as String? ?? '',
              scheduledAt: DateTime.tryParse(row['scheduled_start'] as String? ?? '') ?? DateTime.now(),
            );
          }).toList();
          return _cache!;
        }
      } catch (_) {}
    }

    // Fallback to external demo fixture
    _cache = await _fixtureDataSource.loadBookings();
    if (_cache != null && _cache!.isNotEmpty) {
      return _cache!;
    }

    return [];
  }

  @override
  Future<BookingModel?> getActiveWorkOrder() async {
    final list = await getCustomerBookings();
    if (list.isEmpty) return null;
    try {
      return list.firstWhere(
        (b) => b.status == BookingStatus.inProgress || b.status == BookingStatus.enRoute,
      );
    } catch (_) {
      return list.isNotEmpty ? list.first : null;
    }
  }

  @override
  Future<bool> approveExtraParts(String bookingId, double amount) async {
    if (_supabaseService.isLiveConnected && _supabaseService.client != null) {
      try {
        final partsCents = (amount * 100).round();
        final approved = await _supabaseService.client!.rpc(
          'approve_booking_extra_parts',
          params: {
            'p_booking_id': bookingId,
            'p_parts_total_cents': partsCents,
          },
        );
        if (approved != true) return false;
      } catch (_) {
        return false;
      }
    }

    if (_cache != null) {
      final idx = _cache!.indexWhere((b) => b.id == bookingId);
      if (idx != -1) {
        final current = _cache![idx];
        _cache![idx] = BookingModel(
          id: current.id,
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
  Future<bool> completeWorkOrderWithSignature(String bookingId, String signatureBase64, {String? safetyPin}) async {
    final cachedPin = _cache?.where((b) => b.id == bookingId).map((b) => b.safetyPin).firstOrNull ?? '';
    final pinToUse = (safetyPin != null && safetyPin.trim().isNotEmpty) ? safetyPin.trim() : cachedPin;

    if (_supabaseService.isLiveConnected) {
      if (pinToUse.isEmpty) {
        return false;
      }
      final released = await _remoteDataSource.releaseEscrowToTechnician(
        bookingId: bookingId,
        pinCode: pinToUse,
      );
      if (!released) {
        return false;
      }
    }
    if (_cache != null) {
      final idx = _cache!.indexWhere((b) => b.id == bookingId);
      if (idx != -1) {
        final current = _cache![idx];
        _cache![idx] = BookingModel(
          id: current.id,
          serviceTitle: current.serviceTitle,
          category: current.category,
          basePrice: current.basePrice,
          extraPartsTotal: current.extraPartsTotal,
          platformFee: current.platformFee,
          netTechPayout: current.netTechPayout,
          totalAuthorized: current.totalAuthorized,
          status: BookingStatus.completed,
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
  Future<BookingModel?> createBookingRequest({
    required String serviceTitle,
    required String category,
    required double basePrice,
    required double extraPartsTotal,
    required String customerAddress,
    required DateTime scheduledAt,
    bool isEmergencyRush = false,
  }) async {
    final newRef = 'SO-${10000 + (DateTime.now().millisecondsSinceEpoch % 90000)}';
    final rushFee = isEmergencyRush ? 49.00 : 0.00;
    final total = basePrice + extraPartsTotal + rushFee;
    final platformFee = total * 0.15;
    final netPayout = total * 0.85;
    final safetyPin = '${Random.secure().nextInt(9000) + 1000}'; // FLUT-06: Cryptographically secure 4-digit PIN (1000-9999)

    if (_supabaseService.isLiveConnected && _supabaseService.client != null) {
      try {
        final client = _supabaseService.client!;
        final currentUserId = client.auth.currentUser?.id;
        if (currentUserId == null) return null;

        final userRow = await client
            .from('users')
            .select('tenant_id')
            .eq('id', currentUserId)
            .maybeSingle();
        final tenantId = userRow?['tenant_id'] as String?;
        if (tenantId == null) return null;

        var serviceRow = await client
            .from('services')
            .select('id')
            .ilike('name', serviceTitle)
            .limit(1)
            .maybeSingle();
        serviceRow ??= await client
            .from('services')
            .select('id')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        final serviceId = serviceRow?['id'] as String?;
        if (serviceId == null) return null;

        final created = await _remoteDataSource.createBooking({
          'tenant_id': tenantId,
          'customer_id': currentUserId,
          'service_id': serviceId,
          'booking_reference': newRef,
          'address_text': customerAddress,
          'scheduled_start': scheduledAt.toUtc().toIso8601String(),
          'is_emergency': isEmergencyRush,
          'emergency_surcharge_cents': (rushFee * 100).round(),
          'labor_cost_cents': (basePrice * 100).round(),
          'parts_total_cents': (extraPartsTotal * 100).round(),
          'platform_fee_cents': (platformFee * 100).round(),
          'net_payout_cents': (netPayout * 100).round(),
          'total_authorized_cents': (total * 100).round(),
          'safety_pin': safetyPin,
          'status': 'REQUESTED',
        });
        if (created == null) return null;

        final createdModel = BookingModel(
          id: created['id'] as String? ?? newRef,
          serviceTitle: serviceTitle,
          category: category,
          basePrice: basePrice,
          extraPartsTotal: extraPartsTotal,
          platformFee: platformFee,
          netTechPayout: netPayout,
          totalAuthorized: total,
          status: _parseBookingStatus(created['status'] as String? ?? 'REQUESTED'),
          customerAddress: created['address_text'] as String? ?? customerAddress,
          safetyPin: created['safety_pin'] as String? ?? safetyPin,
          technicianId: created['provider_id'] as String? ?? '',
          technicianName: 'Pending Assignment',
          scheduledAt: scheduledAt,
        );
        _cache ??= [];
        _cache!.insert(0, createdModel);
        return createdModel;
      } catch (_) {
        return null;
      }
    }

    final newBooking = BookingModel(
      id: newRef,
      serviceTitle: serviceTitle,
      category: category,
      basePrice: basePrice,
      extraPartsTotal: extraPartsTotal,
      platformFee: platformFee,
      netTechPayout: netPayout,
      totalAuthorized: total,
      status: BookingStatus.requested,
      customerAddress: customerAddress,
      safetyPin: safetyPin,
      technicianId: '',
      technicianName: 'Pending Assignment',
      scheduledAt: scheduledAt,
    );

    _cache ??= [];
    _cache!.insert(0, newBooking);
    return newBooking;
  }

  BookingStatus _parseBookingStatus(String status) {
    switch (status.toUpperCase()) {
      case 'EN_ROUTE':
        return BookingStatus.enRoute;
      case 'IN_PROGRESS':
        return BookingStatus.inProgress;
      case 'COMPLETED':
        return BookingStatus.completed;
      case 'CANCELLED':
        return BookingStatus.cancelled;
      default:
        return BookingStatus.requested;
    }
  }
}
