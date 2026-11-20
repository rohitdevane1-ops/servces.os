import '../models/service_model.dart';
import '../models/booking_model.dart';
import '../models/technician_model.dart';

abstract class ILocalFixtureDataSource {
  Future<List<CategoryItemModel>> loadCategories();
  Future<List<BookingModel>> loadBookings();
  Future<List<TechnicianModel>> loadTechnicians();
  Future<List<Map<String, dynamic>>> loadInventory();
}

class LocalFixtureDataSource implements ILocalFixtureDataSource {
  @override
  Future<List<CategoryItemModel>> loadCategories() async {
    return [
      CategoryItemModel(
        id: 'cat-plumbing',
        slug: 'plumbing',
        title: 'Plumbing Services',
        shortTitle: 'Plumbing',
        priority: 1,
        iconName: 'Wrench',
        image: 'assets/images/banner_woman.png',
        totalServices: 3,
        services: const [
          ServiceItemModel(
            id: 'svc-pipe-leak',
            name: 'Emergency Pipe Leak Repair',
            category: 'Plumbing Services',
            price: 149.00,
            durationMinutes: 60,
            rating: 4.9,
            reviewCount: 342,
            popular: true,
            description: 'Rapid diagnostic and pipe solder repair with electronic pressure testing.',
          ),
          ServiceItemModel(
            id: 'svc-drain-clean',
            name: 'Hydro-Jet Drain Clearing',
            category: 'Plumbing Services',
            price: 189.00,
            durationMinutes: 90,
            rating: 4.8,
            reviewCount: 215,
            popular: true,
            description: 'Commercial grade snake & hydro jetting for main lines and stubborn blockages.',
          ),
          ServiceItemModel(
            id: 'svc-water-heater',
            name: 'Tankless Water Heater Diagnostic',
            category: 'Plumbing Services',
            price: 129.00,
            durationMinutes: 45,
            rating: 4.7,
            reviewCount: 98,
            popular: false,
            description: 'Comprehensive burner inspection, descaling flush, and temperature calibration.',
          ),
        ],
      ),
      CategoryItemModel(
        id: 'cat-electrical',
        slug: 'electrical',
        title: 'Electrical & Power',
        shortTitle: 'Electrical',
        priority: 2,
        iconName: 'Zap',
        image: 'assets/images/banner_woman.png',
        totalServices: 2,
        services: const [
          ServiceItemModel(
            id: 'svc-panel-diag',
            name: 'Circuit Breaker Panel Inspection',
            category: 'Electrical & Power',
            price: 169.00,
            durationMinutes: 75,
            rating: 4.9,
            reviewCount: 180,
            popular: true,
            description: 'Thermal infrared scanning and load balancing by master licensed electrician.',
          ),
          ServiceItemModel(
            id: 'svc-outlet-install',
            name: 'EV Charger / 240V Outlet Install',
            category: 'Electrical & Power',
            price: 299.00,
            durationMinutes: 120,
            rating: 4.9,
            reviewCount: 144,
            popular: false,
            description: 'Level 2 EV charging circuit with dedicated 50A breaker and code permit filing.',
          ),
        ],
      ),
      CategoryItemModel(
        id: 'cat-hvac',
        slug: 'hvac',
        title: 'HVAC & Climate Control',
        shortTitle: 'HVAC',
        priority: 3,
        iconName: 'Wind',
        image: 'assets/images/banner_woman.png',
        totalServices: 2,
        services: const [
          ServiceItemModel(
            id: 'svc-ac-tuneup',
            name: 'Seasonal AC Multi-Point Tune-up',
            category: 'HVAC & Climate Control',
            price: 119.00,
            durationMinutes: 60,
            rating: 4.8,
            reviewCount: 512,
            popular: true,
            description: 'Refrigerant check, coil cleaning, electrical contact inspection, and airflow check.',
          ),
          ServiceItemModel(
            id: 'svc-thermostat',
            name: 'Smart Thermostat Installation',
            category: 'HVAC & Climate Control',
            price: 89.00,
            durationMinutes: 45,
            rating: 4.7,
            reviewCount: 120,
            popular: false,
            description: 'Nest/Ecobee C-wire installation, multi-zone pairing, and mobile app integration.',
          ),
        ],
      ),
      CategoryItemModel(
        id: 'cat-cleaning',
        slug: 'cleaning',
        title: 'Home Deep Cleaning',
        shortTitle: 'Cleaning',
        priority: 4,
        iconName: 'Sparkles',
        image: 'assets/images/banner_woman.png',
        totalServices: 2,
        services: const [
          ServiceItemModel(
            id: 'svc-deep-clean',
            name: 'Whole Home Sanitization Deep Clean',
            category: 'Home Deep Cleaning',
            price: 219.00,
            durationMinutes: 180,
            rating: 4.9,
            reviewCount: 620,
            popular: true,
            description: 'Eco-certified disinfectants, inside appliances, baseboards, and interior windows.',
          ),
          ServiceItemModel(
            id: 'svc-carpet-clean',
            name: 'Steam Carpet Restoration',
            category: 'Home Deep Cleaning',
            price: 149.00,
            durationMinutes: 90,
            rating: 4.8,
            reviewCount: 310,
            popular: false,
            description: 'High-temperature industrial steam extraction removing heavy allergens and stains.',
          ),
        ],
      ),
    ];
  }

  @override
  Future<List<BookingModel>> loadBookings() async {
    return [
      BookingModel(
        id: 'b-mock-01',
        serviceTitle: 'Emergency Pipe Leak Repair',
        category: 'Plumbing Services',
        basePrice: 149.00,
        extraPartsTotal: 25.00,
        platformFee: 26.10,
        netTechPayout: 147.90,
        totalAuthorized: 174.00,
        status: BookingStatus.inProgress,
        customerAddress: '742 Evergreen Terrace, Springfield',
        safetyPin: '4829',
        technicianId: 'tech-001',
        technicianName: 'Marcus Vance',
        scheduledAt: DateTime.now().subtract(const Duration(hours: 1)),
      ),
      BookingModel(
        id: 'b-mock-02',
        serviceTitle: 'Seasonal AC Multi-Point Tune-up',
        category: 'HVAC & Climate Control',
        basePrice: 119.00,
        extraPartsTotal: 0.00,
        platformFee: 17.85,
        netTechPayout: 101.15,
        totalAuthorized: 119.00,
        status: BookingStatus.completed,
        customerAddress: '104 Ocean Drive, Miami FL',
        safetyPin: '1105',
        technicianId: 'tech-002',
        technicianName: 'Elena Rostova',
        scheduledAt: DateTime.now().subtract(const Duration(days: 2)),
        completedAt: DateTime.now().subtract(const Duration(days: 2, hours: -1)),
      ),
    ];
  }

  @override
  Future<List<TechnicianModel>> loadTechnicians() async {
    return const [
      TechnicianModel(
        id: 'tech-001',
        name: 'Marcus Vance',
        tradeTitle: 'Master Plumber (License #PL-9021)',
        licenseNumber: 'PL-902144',
        photoUrl: 'assets/images/banner_woman.png',
        rating: 4.95,
        reviewCount: 312,
        completedJobs: 489,
        isOnline: true,
        isVerified: true,
        distanceMiles: 2.4,
        vehicleModel: 'Ford Transit 250 Service Van',
        licensePlate: 'FL-PRO49',
        hourlyRate: 85.00,
        emergencySurgeRate: 49.00,
        phone: '+1 (555) 304-9821',
      ),
      TechnicianModel(
        id: 'tech-002',
        name: 'Elena Rostova',
        tradeTitle: 'Certified EPA Universal HVAC Pro',
        licenseNumber: 'HVAC-77182',
        photoUrl: 'assets/images/banner_woman.png',
        rating: 4.92,
        reviewCount: 284,
        completedJobs: 376,
        isOnline: true,
        isVerified: true,
        distanceMiles: 3.8,
        vehicleModel: 'Mercedes Sprinter Service Tech',
        licensePlate: 'FL-AIR11',
        hourlyRate: 95.00,
        emergencySurgeRate: 59.00,
        phone: '+1 (555) 441-2094',
      ),
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> loadInventory() async {
    return [
      {'sku': 'PIPE-COP-05', 'name': '1/2" Copper Pipe Segment (10ft)', 'priceCents': 1850, 'qty': 24},
      {'sku': 'VALV-BALL-05', 'name': '1/2" Quarter-Turn Brass Ball Valve', 'priceCents': 1200, 'qty': 45},
      {'sku': 'CAP-DUAL-45', 'name': 'Dual Run Capacitor 45/5 MFD 440V', 'priceCents': 2400, 'qty': 18},
    ];
  }
}
