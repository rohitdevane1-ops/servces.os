enum BookingStatus {
  draft,
  requested,
  broadcasting,
  assigned,
  enRoute,
  arrived,
  inProgress,
  completed,
  settled,
  cancelled
}

class BookingModel {
  final String id;
  final String bookingReference;
  final String serviceTitle;
  final String category;
  final double basePrice;
  final double extraPartsTotal;
  final double platformFee;
  final double netTechPayout;
  final double totalAuthorized;
  final BookingStatus status;
  final String customerAddress;
  final String safetyPin;
  final String technicianId;
  final String technicianName;
  final DateTime scheduledAt;
  final DateTime? completedAt;

  const BookingModel({
    required this.id,
    this.bookingReference = '',
    required this.serviceTitle,
    required this.category,
    required this.basePrice,
    required this.extraPartsTotal,
    required this.platformFee,
    required this.netTechPayout,
    required this.totalAuthorized,
    required this.status,
    required this.customerAddress,
    required this.safetyPin,
    required this.technicianId,
    required this.technicianName,
    required this.scheduledAt,
    this.completedAt,
  });

  static double _parseNum(dynamic value, [double fallback = 0.0]) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  static BookingStatus parseStatus(String? raw) {
    final normalized = (raw ?? 'requested').toLowerCase().replaceAll('_', '');
    switch (normalized) {
      case 'draft':
        return BookingStatus.draft;
      case 'requested':
      case 'pending':
        return BookingStatus.requested;
      case 'broadcasting':
        return BookingStatus.broadcasting;
      case 'assigned':
      case 'confirmed':
      case 'dispatched':
      case 'scheduled':
        return BookingStatus.assigned;
      case 'enroute':
        return BookingStatus.enRoute;
      case 'arrived':
      case 'onsite':
        return BookingStatus.arrived;
      case 'inprogress':
        return BookingStatus.inProgress;
      case 'completed':
        return BookingStatus.completed;
      case 'settled':
        return BookingStatus.settled;
      case 'cancelled':
        return BookingStatus.cancelled;
      default:
        return BookingStatus.requested;
    }
  }

  factory BookingModel.fromJson(Map<String, dynamic> json) {
    final basePriceCents = json['basePriceCents'] ??
        json['base_price_cents'] ??
        json['quotedPriceCents'] ??
        json['quoted_price_cents'] ??
        json['laborCostCents'] ??
        json['labor_cost_cents'];
    final totalCents = json['totalAuthorizedCents'] ??
        json['total_authorized_cents'] ??
        json['finalPriceCents'] ??
        json['final_price_cents'] ??
        json['totalAmountCents'] ??
        json['total_amount_cents'] ??
        basePriceCents;
    final partsCents = json['partsTotalCents'] ?? json['parts_total_cents'];
    final feeCents = json['platformFeeCents'] ?? json['platform_fee_cents'];
    final payoutCents = json['providerPayoutCents'] ??
        json['provider_payout_cents'] ??
        json['netPayoutCents'] ??
        json['net_payout_cents'];

    final double resolvedBase = json['basePrice'] != null
        ? _parseNum(json['basePrice'])
        : (basePriceCents != null ? _parseNum(basePriceCents) / 100.0 : 0.0);
    final double resolvedTotal = json['totalAuthorized'] != null
        ? _parseNum(json['totalAuthorized'])
        : (totalCents != null ? _parseNum(totalCents) / 100.0 : resolvedBase);
    final double resolvedParts = json['extraPartsTotal'] != null
        ? _parseNum(json['extraPartsTotal'])
        : (partsCents != null ? _parseNum(partsCents) / 100.0 : 0.0);
    final double resolvedFee = json['platformFee'] != null
        ? _parseNum(json['platformFee'])
        : (feeCents != null ? _parseNum(feeCents) / 100.0 : resolvedTotal * 0.15);
    final double resolvedPayout = json['netTechPayout'] != null
        ? _parseNum(json['netTechPayout'])
        : (payoutCents != null ? _parseNum(payoutCents) / 100.0 : resolvedTotal * 0.85);

    final idStr = (json['id'] ?? json['bookingId'] ?? '').toString();
    final refStr = (json['bookingReference'] ?? json['booking_reference'] ?? idStr).toString();

    return BookingModel(
      id: idStr,
      bookingReference: refStr,
      serviceTitle: (json['serviceTitle'] ?? json['serviceName'] ?? json['service_name'] ?? 'Service Order').toString(),
      category: (json['category'] ?? json['categoryName'] ?? json['category_name'] ?? 'Home Service').toString(),
      basePrice: resolvedBase,
      extraPartsTotal: resolvedParts,
      platformFee: resolvedFee,
      netTechPayout: resolvedPayout,
      totalAuthorized: resolvedTotal,
      status: parseStatus(json['status']?.toString()),
      customerAddress: (json['customerAddress'] ?? json['addressText'] ?? json['address_text'] ?? '').toString(),
      safetyPin: (json['safetyPin'] ?? json['customerSafetyPin'] ?? json['safety_pin'] ?? '').toString(),
      technicianId: (json['technicianId'] ?? json['assignedProviderId'] ?? json['providerId'] ?? '').toString(),
      technicianName: (json['technicianName'] ?? json['providerName'] ?? json['technician_name'] ?? '').toString(),
      scheduledAt: DateTime.tryParse(
            (json['scheduledAt'] ?? json['scheduledStart'] ?? json['scheduled_start'] ?? '').toString(),
          ) ??
          DateTime.now(),
      completedAt: json['completedAt'] != null ? DateTime.tryParse(json['completedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'bookingReference': bookingReference,
      'serviceTitle': serviceTitle,
      'category': category,
      'basePrice': basePrice,
      'extraPartsTotal': extraPartsTotal,
      'platformFee': platformFee,
      'netTechPayout': netTechPayout,
      'totalAuthorized': totalAuthorized,
      'status': status.name,
      'customerAddress': customerAddress,
      'safetyPin': safetyPin,
      'technicianId': technicianId,
      'technicianName': technicianName,
      'scheduledAt': scheduledAt.toIso8601String(),
      'completedAt': completedAt?.toIso8601String(),
    };
  }
}
