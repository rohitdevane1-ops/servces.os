import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/network/supabase_service.dart';

abstract class ISupabaseRemoteDataSource {
  Future<List<Map<String, dynamic>>> fetchCategories();
  Future<List<Map<String, dynamic>>> fetchServices({String? categoryId, String? search});
  Future<List<Map<String, dynamic>>> fetchBookings({String? customerId, String? providerId});
  Future<Map<String, dynamic>?> createBooking(Map<String, dynamic> bookingData);
  Future<bool> updateBookingStatus(String bookingId, String status);
  Future<List<Map<String, dynamic>>> fetchNearbyTechnicians({
    required double latitude,
    required double longitude,
    int radiusMeters = 25000,
  });
  Future<bool> verifyArrivalGeofence({
    required String bookingId,
    required double techLat,
    required double techLng,
  });
  Future<bool> releaseEscrowToTechnician({
    required String bookingId,
    required String pinCode,
  });
  RealtimeChannel? subscribeToDispatchRadar({
    required String technicianId,
    required void Function(Map<String, dynamic> payload) onIncomingJob,
  });
  RealtimeChannel? subscribeToBookingUpdates({
    required String bookingId,
    required void Function(Map<String, dynamic> payload) onUpdate,
  });
  Future<void> unsubscribe(RealtimeChannel? channel);
  Future<String?> uploadJobEvidence({
    required String bookingId,
    required String evidenceType,
    required Uint8List bytes,
    required String fileName,
  });
}

class SupabaseRemoteDataSource implements ISupabaseRemoteDataSource {
  final SupabaseService _service;

  SupabaseRemoteDataSource({SupabaseService? service})
      : _service = service ?? SupabaseService.instance;

  SupabaseClient? get _client => _service.client;

  @override
  Future<List<Map<String, dynamic>>> fetchCategories() async {
    if (_client == null) return [];
    try {
      final response = await _client!
          .from('categories')
          .select()
          .order('priority_rank', ascending: true);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] fetchCategories error: $e');
      return [];
    }
  }

  @override
  Future<List<Map<String, dynamic>>> fetchServices({String? categoryId, String? search}) async {
    if (_client == null) return [];
    try {
      var query = _client!.from('services').select('*, categories(*)');
      if (categoryId != null && categoryId.isNotEmpty && categoryId.toLowerCase() != 'all') {
        query = query.eq('category_id', categoryId);
      }
      if (search != null && search.trim().isNotEmpty) {
        query = query.ilike('name', '%$search%');
      }
      final response = await query;
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] fetchServices error: $e');
      return [];
    }
  }

  @override
  Future<List<Map<String, dynamic>>> fetchBookings({String? customerId, String? providerId}) async {
    if (_client == null) return [];
    try {
      var query = _client!.from('bookings').select('*, services(*), provider_profiles(*)');
      if (customerId != null) {
        query = query.eq('customer_id', customerId);
      }
      if (providerId != null) {
        query = query.eq('provider_id', providerId);
      }
      final response = await query.order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] fetchBookings error: $e');
      return [];
    }
  }

  @override
  Future<Map<String, dynamic>?> createBooking(Map<String, dynamic> bookingData) async {
    if (_client == null) return null;
    try {
      final response = await _client!
          .from('bookings')
          .insert(bookingData)
          .select()
          .single();
      return Map<String, dynamic>.from(response);
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] createBooking error: $e');
      return null;
    }
  }

  @override
  Future<bool> updateBookingStatus(String bookingId, String status) async {
    if (_client == null) return false;
    try {
      await _client!
          .from('bookings')
          .update({'status': status})
          .eq('id', bookingId);
      return true;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] updateBookingStatus error: $e');
      return false;
    }
  }

  @override
  Future<List<Map<String, dynamic>>> fetchNearbyTechnicians({
    required double latitude,
    required double longitude,
    int radiusMeters = 25000,
  }) async {
    if (_client == null) return [];
    try {
      final response = await _client!.rpc('find_nearest_technicians', params: {
        'p_lat': latitude,
        'p_lng': longitude,
        'p_radius_meters': radiusMeters,
      });
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      try {
        final fallback = await _client!
            .from('provider_profiles')
            .select('*, users(*)')
            .eq('is_online', true)
            .eq('is_verified', true);
        return List<Map<String, dynamic>>.from(fallback);
      } catch (err) {
        debugPrint('[SupabaseRemoteDataSource] fetchNearbyTechnicians error: $err');
        return [];
      }
    }
  }

  @override
  Future<bool> verifyArrivalGeofence({
    required String bookingId,
    required double techLat,
    required double techLng,
  }) async {
    if (_client == null) return false;
    try {
      final response = await _client!.rpc('verify_arrival_geofence', params: {
        'p_booking_id': bookingId,
        'p_tech_lat': techLat,
        'p_tech_lng': techLng,
      });
      return response == true;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] verifyArrivalGeofence error: $e');
      return false;
    }
  }

  @override
  Future<bool> releaseEscrowToTechnician({
    required String bookingId,
    required String pinCode,
  }) async {
    if (_client == null) return false;
    try {
      final response = await _client!.rpc('release_escrow_to_technician', params: {
        'p_booking_id': bookingId,
        'p_pin_code': pinCode,
      });
      return response == true;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] releaseEscrowToTechnician error: $e');
      return false;
    }
  }

  @override
  RealtimeChannel? subscribeToDispatchRadar({
    required String technicianId,
    required void Function(Map<String, dynamic> payload) onIncomingJob,
  }) {
    if (_client == null) return null;
    try {
      final channel = _client!.channel('tech_dispatch_$technicianId');
      channel.onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'bookings',
        callback: (payload) {
          onIncomingJob(payload.newRecord);
        },
      ).subscribe();
      return channel;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] subscribeToDispatchRadar error: $e');
      return null;
    }
  }

  @override
  RealtimeChannel? subscribeToBookingUpdates({
    required String bookingId,
    required void Function(Map<String, dynamic> payload) onUpdate,
  }) {
    if (_client == null) return null;
    try {
      final channel = _client!.channel('booking_live_$bookingId');
      channel.onPostgresChanges(
        event: PostgresChangeEvent.update,
        schema: 'public',
        table: 'bookings',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'id',
          value: bookingId,
        ),
        callback: (payload) {
          onUpdate(payload.newRecord);
        },
      ).subscribe();
      return channel;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] subscribeToBookingUpdates error: $e');
      return null;
    }
  }

  @override
  Future<void> unsubscribe(RealtimeChannel? channel) async {
    if (channel != null && _client != null) {
      try {
        await _client!.removeChannel(channel);
      } catch (e) {
        debugPrint('[SupabaseRemoteDataSource] unsubscribe error: $e');
      }
    }
  }

  @override
  Future<String?> uploadJobEvidence({
    required String bookingId,
    required String evidenceType,
    required Uint8List bytes,
    required String fileName,
  }) async {
    if (_client == null) return null;
    try {
      final storagePath = 'bookings/$bookingId/$evidenceType/$fileName';
      await _client!.storage.from('job-evidence').uploadBinary(
        storagePath,
        bytes,
        fileOptions: const FileOptions(upsert: true),
      );
      final publicUrl = _client!.storage.from('job-evidence').getPublicUrl(storagePath);
      final capturedByUserId = _client!.auth.currentUser?.id;

      if (capturedByUserId != null) {
        await _client!.from('job_evidence').insert({
          'booking_id': bookingId,
          'evidence_type': evidenceType,
          'media_url': publicUrl,
          'captured_by_user_id': capturedByUserId,
          'captured_at': DateTime.now().toIso8601String(),
        });
      }

      return publicUrl;
    } catch (e) {
      debugPrint('[SupabaseRemoteDataSource] uploadJobEvidence error: $e');
      return null;
    }
  }
}
