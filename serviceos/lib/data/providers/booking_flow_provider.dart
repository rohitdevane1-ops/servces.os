import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/booking_model.dart';
import '../models/service_model.dart';
import '../repositories/booking_repository.dart';

final bookingRepositoryProvider = Provider<IBookingRepository>((ref) {
  return BookingRepository();
});

enum PricingTier { standard, fullRepair, heavyDuty }

class BookingFlowState {
  final ServiceItemModel? selectedService;
  final PricingTier pricingTier;
  final String address;
  final DateTime scheduledDate;
  final String timeWindow;
  final bool isEmergencySurge;
  final double basePrice;
  final double extraPartsTotal;
  final double surgeFee;
  final double platformFee;
  final double totalEscrowAuthorized;
  final List<BookingModel> customerBookings;
  final BookingModel? activeWorkOrder;
  final bool isLoading;

  BookingFlowState({
    this.selectedService,
    this.pricingTier = PricingTier.standard,
    this.address = '',
    DateTime? scheduledDate,
    this.timeWindow = '',
    this.isEmergencySurge = false,
    this.basePrice = 0.00,
    this.extraPartsTotal = 0.00,
    this.surgeFee = 0.00,
    this.platformFee = 0.00,
    this.totalEscrowAuthorized = 0.00,
    this.customerBookings = const [],
    this.activeWorkOrder,
    this.isLoading = false,
  }) : scheduledDate = scheduledDate ?? DateTime.now();

  BookingFlowState copyWith({
    ServiceItemModel? selectedService,
    PricingTier? pricingTier,
    String? address,
    DateTime? scheduledDate,
    String? timeWindow,
    bool? isEmergencySurge,
    double? basePrice,
    double? extraPartsTotal,
    double? surgeFee,
    double? platformFee,
    double? totalEscrowAuthorized,
    List<BookingModel>? customerBookings,
    BookingModel? activeWorkOrder,
    bool? isLoading,
  }) {
    return BookingFlowState(
      selectedService: selectedService ?? this.selectedService,
      pricingTier: pricingTier ?? this.pricingTier,
      address: address ?? this.address,
      scheduledDate: scheduledDate ?? this.scheduledDate,
      timeWindow: timeWindow ?? this.timeWindow,
      isEmergencySurge: isEmergencySurge ?? this.isEmergencySurge,
      basePrice: basePrice ?? this.basePrice,
      extraPartsTotal: extraPartsTotal ?? this.extraPartsTotal,
      surgeFee: surgeFee ?? this.surgeFee,
      platformFee: platformFee ?? this.platformFee,
      totalEscrowAuthorized: totalEscrowAuthorized ?? this.totalEscrowAuthorized,
      customerBookings: customerBookings ?? this.customerBookings,
      activeWorkOrder: activeWorkOrder ?? this.activeWorkOrder,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class BookingFlowNotifier extends StateNotifier<BookingFlowState> {
  final IBookingRepository _repository;

  BookingFlowNotifier(this._repository) : super(BookingFlowState()) {
    loadBookings();
  }

  Future<void> loadBookings() async {
    state = state.copyWith(isLoading: true);
    final bookings = await _repository.getCustomerBookings();
    final active = await _repository.getActiveWorkOrder();
    state = state.copyWith(
      customerBookings: bookings,
      activeWorkOrder: active,
      isLoading: false,
    );
  }

  void selectService(ServiceItemModel service) {
    state = state.copyWith(
      selectedService: service,
      basePrice: service.price,
      totalEscrowAuthorized: service.price + state.extraPartsTotal + state.surgeFee,
      platformFee: (service.price + state.extraPartsTotal + state.surgeFee) * 0.15,
    );
  }

  void selectPricingTier(PricingTier tier) {
    double multiplier = 1.0;
    if (tier == PricingTier.fullRepair) multiplier = 1.35;
    if (tier == PricingTier.heavyDuty) multiplier = 1.75;

    final base = (state.selectedService?.price ?? 149.00) * multiplier;
    final total = base + state.extraPartsTotal + state.surgeFee;
    state = state.copyWith(
      pricingTier: tier,
      basePrice: base,
      totalEscrowAuthorized: total,
      platformFee: total * 0.15,
    );
  }

  void toggleEmergencySurge(bool enable) {
    final surge = enable ? 49.00 : 0.00;
    final total = state.basePrice + state.extraPartsTotal + surge;
    state = state.copyWith(
      isEmergencySurge: enable,
      surgeFee: surge,
      totalEscrowAuthorized: total,
      platformFee: total * 0.15,
    );
  }

  void updateAddress(String newAddress) {
    state = state.copyWith(address: newAddress);
  }

  Future<BookingModel?> confirmBookingAndLockEscrow() async {
    state = state.copyWith(isLoading: true);
    final newOrder = await _repository.createBookingRequest(
      serviceTitle: state.selectedService?.name ?? 'Home Service Request',
      category: state.selectedService?.category ?? 'Plumbing Services',
      basePrice: state.basePrice,
      extraPartsTotal: state.extraPartsTotal,
      customerAddress: state.address,
      scheduledAt: state.scheduledDate,
      isEmergencyRush: state.isEmergencySurge,
    );

    await loadBookings();
    state = state.copyWith(
      activeWorkOrder: newOrder,
      isLoading: false,
    );
    return newOrder;
  }

  void resetFlow() {
    state = BookingFlowState(
      customerBookings: state.customerBookings,
    );
  }
}

final bookingFlowProvider = StateNotifierProvider<BookingFlowNotifier, BookingFlowState>((ref) {
  final repo = ref.watch(bookingRepositoryProvider);
  return BookingFlowNotifier(repo);
});
