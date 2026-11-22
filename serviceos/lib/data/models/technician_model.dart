class TechnicianModel {
  final String id;
  final String name;
  final String tradeTitle;
  final String licenseNumber;
  final String photoUrl;
  final double rating;
  final int reviewCount;
  final int completedJobs;
  final bool isOnline;
  final bool isVerified;
  final double distanceMiles;
  final String vehicleModel;
  final String licensePlate;
  final double hourlyRate;
  final double emergencySurgeRate;
  final String phone;

  const TechnicianModel({
    required this.id,
    required this.name,
    required this.tradeTitle,
    required this.licenseNumber,
    required this.photoUrl,
    required this.rating,
    required this.reviewCount,
    required this.completedJobs,
    required this.isOnline,
    required this.isVerified,
    required this.distanceMiles,
    required this.vehicleModel,
    required this.licensePlate,
    required this.hourlyRate,
    required this.emergencySurgeRate,
    required this.phone,
  });

  static double _parseNum(dynamic value, [double fallback = 0.0]) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  static int _parseInt(dynamic value, [int fallback = 0]) {
    if (value == null) return fallback;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? fallback;
  }

  factory TechnicianModel.fromJson(Map<String, dynamic> json) {
    final hourlyRateCents = json['hourlyRateCents'] ?? json['hourly_rate_cents'];
    final resolvedHourlyRate = json['hourlyRate'] != null
        ? _parseNum(json['hourlyRate'])
        : (hourlyRateCents != null ? _parseNum(hourlyRateCents) / 100.0 : 85.0);

    final distKm = json['distanceKm'] ?? json['distance_km'];
    final distMeters = json['distanceMeters'] ?? json['distance_meters'];
    final resolvedDistance = json['distanceMiles'] != null
        ? _parseNum(json['distanceMiles'])
        : (distKm != null
            ? _parseNum(distKm)
            : (distMeters != null ? _parseNum(distMeters) / 1000.0 : 0.0));

    final dutyStatus = (json['dutyStatus'] ?? json['duty_status'] ?? '').toString().toUpperCase();

    return TechnicianModel(
      id: (json['id'] ?? json['providerId'] ?? json['provider_id'] ?? '').toString(),
      name: (json['fullName'] ?? json['full_name'] ?? json['name'] ?? 'Verified Technician').toString(),
      tradeTitle: (json['tradeCategory'] ?? json['trade_category'] ?? json['tradeTitle'] ?? 'Certified Professional')
          .toString(),
      licenseNumber: (json['licenseNumber'] ?? json['license_number'] ?? '').toString(),
      photoUrl: (json['avatarUrl'] ?? json['avatar_url'] ?? json['photoUrl'] ?? 'assets/images/banner_woman.png')
          .toString(),
      rating: _parseNum(json['averageRating'] ?? json['average_rating'] ?? json['rating'], 5.0),
      reviewCount: _parseInt(json['reviewCount'] ?? json['reviewsCount'] ?? json['reviews_count'], 0),
      completedJobs: _parseInt(
        json['completedJobsCount'] ?? json['completed_jobs_count'] ?? json['completedJobs'],
        0,
      ),
      isOnline: json['isOnline'] as bool? ?? (dutyStatus == 'ONLINE' || dutyStatus == 'ON_JOB'),
      isVerified: json['isVerified'] as bool? ?? (json['is_verified'] as bool? ?? true),
      distanceMiles: resolvedDistance,
      vehicleModel:
          (json['vehicleMakeModel'] ?? json['vehicle_make_model'] ?? json['vehicleModel'] ?? 'Service Fleet Vehicle')
              .toString(),
      licensePlate:
          (json['vehicleLicensePlate'] ?? json['vehicle_license_plate'] ?? json['licensePlate'] ?? '').toString(),
      hourlyRate: resolvedHourlyRate,
      emergencySurgeRate: _parseNum(json['emergencySurgeRate'], 49.0),
      phone: (json['phoneNumber'] ?? json['phone_number'] ?? json['phone'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'tradeTitle': tradeTitle,
      'licenseNumber': licenseNumber,
      'photoUrl': photoUrl,
      'rating': rating,
      'reviewCount': reviewCount,
      'completedJobs': completedJobs,
      'isOnline': isOnline,
      'isVerified': isVerified,
      'distanceMiles': distanceMiles,
      'vehicleModel': vehicleModel,
      'licensePlate': licensePlate,
      'hourlyRate': hourlyRate,
      'emergencySurgeRate': emergencySurgeRate,
      'phone': phone,
    };
  }
}
