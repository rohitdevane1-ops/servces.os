import '../models/technician_model.dart';
import '../../core/network/api_client.dart';

abstract class ITechnicianRepository {
  Future<List<TechnicianModel>> getNearbyTechnicians({
    double latitude = 25.1972,
    double longitude = 55.2744,
    double radiusKm = 25.0,
    bool forceRefresh = false,
  });
  Future<TechnicianModel?> getTechnicianById(String id);
  Future<bool> updateDutyStatus(String technicianId, bool isOnline);
}

/// TechnicianRepository backed 100% by the authoritative Fastify REST API.
class TechnicianRepository implements ITechnicianRepository {
  List<TechnicianModel>? _cache;

  @override
  Future<List<TechnicianModel>> getNearbyTechnicians({
    double latitude = 25.1972,
    double longitude = 55.2744,
    double radiusKm = 25.0,
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh && _cache != null && _cache!.isNotEmpty) {
      return _cache!;
    }

    try {
      final rows = await ApiClient.instance.fetchRadarTechnicians(
        latitude: latitude,
        longitude: longitude,
        radiusKm: radiusKm,
      );
      if (rows.isNotEmpty) {
        _cache = rows
            .map((r) => TechnicianModel.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList();
        return _cache!;
      }
    } catch (_) {}

    return _cache ?? const [];
  }

  @override
  Future<TechnicianModel?> getTechnicianById(String id) async {
    try {
      final me = await ApiClient.instance.getMe();
      if (me['success'] == true && me['data']?['user'] is Map) {
        final userMap = Map<String, dynamic>.from(me['data']['user'] as Map);
        if ((userMap['role'] ?? '').toString().toUpperCase() == 'TECHNICIAN') {
          return TechnicianModel.fromJson(userMap);
        }
      }
    } catch (_) {}

    final list = await getNearbyTechnicians();
    try {
      return list.firstWhere((t) => t.id == id);
    } catch (_) {
      return list.isNotEmpty ? list.first : null;
    }
  }

  @override
  Future<bool> updateDutyStatus(String technicianId, bool isOnline) async {
    try {
      await ApiClient.instance.updateDutyStatus(isOnline ? 'ONLINE' : 'OFFLINE');
    } catch (_) {
      return false;
    }

    if (_cache != null) {
      final idx = _cache!.indexWhere((t) => t.id == technicianId);
      if (idx != -1) {
        final current = _cache![idx];
        _cache![idx] = TechnicianModel(
          id: current.id,
          name: current.name,
          tradeTitle: current.tradeTitle,
          licenseNumber: current.licenseNumber,
          photoUrl: current.photoUrl,
          rating: current.rating,
          reviewCount: current.reviewCount,
          completedJobs: current.completedJobs,
          isOnline: isOnline,
          isVerified: current.isVerified,
          distanceMiles: current.distanceMiles,
          vehicleModel: current.vehicleModel,
          licensePlate: current.licensePlate,
          hourlyRate: current.hourlyRate,
          emergencySurgeRate: current.emergencySurgeRate,
          phone: current.phone,
        );
      }
    }
    return true;
  }
}
