import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../data/models/service_model.dart';

class BookingWizardScreen extends StatefulWidget {
  final ServiceItemModel service;
  final String? selectedTierTitle;
  final double? selectedPackagePrice;
  final void Function(Map<String, dynamic> createdBooking)? onBookingCreated;
  final VoidCallback onBookingConfirmed;
  final VoidCallback onBack;

  const BookingWizardScreen({
    super.key,
    required this.service,
    this.selectedTierTitle,
    this.selectedPackagePrice,
    this.onBookingCreated,
    required this.onBookingConfirmed,
    required this.onBack,
  });

  @override
  State<BookingWizardScreen> createState() => _BookingWizardScreenState();
}

class _BookingWizardScreenState extends State<BookingWizardScreen> {
  int _currentStep = 1; // 1: Problem, 2: Address, 3: Schedule, 4: Cost & Escrow
  late String _selectedProblemLocation;
  bool _isEmergencySurge = false;
  String _selectedTimeWindow = 'Morning (08:00 AM – 12:00 PM)';

  bool _isSubmitting = false;

  final TextEditingController _notesController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  DateTime _resolveScheduledStart() {
    final now = DateTime.now();
    if (_isEmergencySurge) {
      return now.add(const Duration(minutes: 45));
    }
    int targetHour = 9;
    if (_selectedTimeWindow.contains('Afternoon')) {
      targetHour = 13;
    } else if (_selectedTimeWindow.contains('Evening')) {
      targetHour = 17;
    }
    var candidate = DateTime(now.year, now.month, now.day, targetHour);
    if (!candidate.isAfter(now.add(const Duration(minutes: 30)))) {
      candidate = candidate.add(const Duration(days: 1));
    }
    return candidate;
  }

  Future<void> _submitBooking() async {
    if (_isSubmitting) return;
    final address = _addressController.text.trim();
    if (address.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid service address (at least 5 characters).')),
      );
      return;
    }
    setState(() => _isSubmitting = true);
    try {
      final tierPrefix = (widget.selectedTierTitle != null && widget.selectedTierTitle!.isNotEmpty)
          ? '[${widget.selectedTierTitle}] '
          : '';
      final noteText = _notesController.text.trim();
      final scheduledAt = _resolveScheduledStart();
      final res = await ApiClient.instance.createBooking({
        'serviceId': widget.service.id,
        'addressText': address,
        'latitude': 25.1972,
        'longitude': 55.2744,
        'scheduledStart': scheduledAt.toUtc().toIso8601String(),
        'priority': _isEmergencySurge ? 'EMERGENCY' : 'STANDARD',
        'accessInstructions': '$tierPrefix$_selectedProblemLocation${noteText.isNotEmpty ? ': $noteText' : ''}',
      });
      final bookingId = (res['bookingId'] ?? res['id'])?.toString();
      if (bookingId != null && bookingId.isNotEmpty) {
        Map<String, dynamic> paymentConfirm = const {};
        try {
          paymentConfirm = await ApiClient.instance.waitForPaymentIntentAndConfirm(bookingId);
        } catch (payErr) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Booking created; escrow verification pending: $payErr')),
            );
          }
        }
        final confirmData = paymentConfirm['data'] is Map
            ? Map<String, dynamic>.from(paymentConfirm['data'] as Map)
            : paymentConfirm;
        final requiresClientAction = confirmData['requiresClientAction'] == true;
        final checkoutRedirectUrl = confirmData['checkoutRedirectUrl']?.toString();
        if (requiresClientAction && checkoutRedirectUrl != null && checkoutRedirectUrl.isNotEmpty && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Complete gateway authorization in browser: $checkoutRedirectUrl')),
          );
        }
        widget.onBookingCreated?.({
          ...res,
          'bookingId': bookingId,
          'serviceTitle': widget.service.name,
          'customerAddress': address,
          'basePrice': widget.selectedPackagePrice ?? widget.service.price,
          'diagnosticFee': _isEmergencySurge ? 49.00 : 20.00,
          'requiresClientAction': requiresClientAction,
          if (checkoutRedirectUrl != null && checkoutRedirectUrl.isNotEmpty)
            'checkoutRedirectUrl': checkoutRedirectUrl,
        });
        if (mounted) widget.onBookingConfirmed();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not create booking. Please check your details and try again.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Booking failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  List<String> get _problemLocations {
    final cat = widget.service.category.toLowerCase();
    if (cat.contains('plumb')) {
      return ['Under Sink', 'Behind Wall', 'Main Shut-off Valve', 'Ceiling Drip'];
    } else if (cat.contains('electr')) {
      return ['Breaker Panel', 'Wall Outlet / Switch', 'Lighting Fixture', 'Appliance Circuit'];
    } else if (cat.contains('hvac') || cat.contains('air') || cat.contains('heat')) {
      return ['AC Compressor', 'Smart Thermostat', 'Air Ducts / Vents', 'Furnace Unit'];
    } else if (cat.contains('clean')) {
      return ['Kitchen Deep Clean', 'Bathroom Sanitization', 'Full Living Area', 'Carpet & Upholstery'];
    }
    return ['Primary Fixture', 'Secondary Room', 'Exterior Unit', 'Full Diagnostic'];
  }

  @override
  void initState() {
    super.initState();
    _selectedProblemLocation = _problemLocations.first;
  }

  @override
  void dispose() {
    _notesController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;

    return Scaffold(
      backgroundColor: isDark ? AppColors.nightCanvas : AppColors.dayCanvas,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _currentStep > 1 ? () => setState(() => _currentStep--) : widget.onBack,
        ),
        title: Text('Booking Step $_currentStep of 4', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Progress Bar
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _currentStep / 4.0,
                  backgroundColor: isDark ? Colors.white10 : Colors.black12,
                  valueColor: AlwaysStoppedAnimation(primaryBrand),
                  minHeight: 6,
                ),
              ),

              const SizedBox(height: 20),

              // Step Content with Smooth Animated Transition
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 260),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  child: KeyedSubtree(
                    key: ValueKey<int>(_currentStep),
                    child: _buildStepContent(surfaceColor, textPrimary, textSecondary, primaryBrand, isDark),
                  ),
                ),
              ),

              // Bottom Navigation
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _currentStep == 4 ? const Color(0xFF10B981) : primaryBrand,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _isSubmitting
                      ? null
                      : () {
                          if (_currentStep < 4) {
                            setState(() => _currentStep++);
                          } else {
                            _submitBooking();
                          }
                        },
                  child: Text(
                    _isSubmitting
                        ? 'Authorizing Escrow...'
                        : (_currentStep == 4 ? 'Confirm & Pre-Authorize Escrow 🔒' : 'Next Step →'),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepContent(Color surfaceColor, Color textPrimary, Color textSecondary, Color primaryBrand, bool isDark) {
    switch (_currentStep) {
      case 1:
        return SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.service.category.toLowerCase().contains('plumb')
                    ? 'Where is the leak located?'
                    : 'Select Specific Work Area or Problem',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: _problemLocations.map((loc) {
                  final isSelected = loc == _selectedProblemLocation;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedProblemLocation = loc),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: isSelected ? primaryBrand.withOpacity(0.1) : surfaceColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: isSelected ? primaryBrand : (isDark ? AppColors.nightBorder : AppColors.dayBorder), width: isSelected ? 2 : 1),
                      ),
                      child: Text(loc, style: TextStyle(fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600, color: isSelected ? primaryBrand : textPrimary)),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
              Text('Attach Photos of Issue (Optional)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                height: 120,
                decoration: BoxDecoration(
                  color: primaryBrand.withOpacity(0.04),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: primaryBrand.withOpacity(0.4), style: BorderStyle.solid),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.camera_alt_outlined, size: 32, color: primaryBrand),
                    const SizedBox(height: 6),
                    Text('Tap to take photo or select from gallery', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: primaryBrand)),
                  ],
                ),
              ),
            ],
          ),
        );

      case 2:
        return SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Confirm Service Address', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: primaryBrand, width: 2),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.home_rounded, color: AppColors.dayPrimary, size: 28),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Service Delivery Address', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: textPrimary)),
                          const SizedBox(height: 4),
                          TextField(
                            controller: _addressController,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: textPrimary),
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.zero,
                              border: InputBorder.none,
                              hintText: 'Enter street address, city, state, zip',
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.check_circle_rounded, color: AppColors.verifiedEmerald),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Text('Gate Code & Access Notes', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                ),
                child: TextField(
                  controller: _notesController,
                  decoration: const InputDecoration(
                    hintText: 'Gate or buzzer code, parking instructions...',
                    border: InputBorder.none,
                  ),
                ),
              ),
            ],
          ),
        );

      case 3:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Select Date & Dispatch Urgency', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
            const SizedBox(height: 14),
            // Emergency Surge Mode
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withOpacity(0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.bolt, color: Color(0xFFEF4444), size: 24),
                      SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('60-Min Emergency Arrival', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFFEF4444))),
                          Text('Instant radar broadcast to nearest pros', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        ],
                      ),
                    ],
                  ),
                  Switch(
                    value: _isEmergencySurge,
                    activeColor: const Color(0xFFEF4444),
                    onChanged: (val) => setState(() => _isEmergencySurge = val),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text('Preferred Arrival Window', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textSecondary)),
            const SizedBox(height: 8),
            _buildWindowOption('Morning (08:00 AM – 12:00 PM)', _selectedTimeWindow == 'Morning (08:00 AM – 12:00 PM)', primaryBrand, surfaceColor, textPrimary, isDark),
            const SizedBox(height: 8),
            _buildWindowOption('Afternoon (12:00 PM – 04:00 PM)', _selectedTimeWindow == 'Afternoon (12:00 PM – 04:00 PM)', primaryBrand, surfaceColor, textPrimary, isDark),
            const SizedBox(height: 8),
            _buildWindowOption('Evening (04:00 PM – 08:00 PM)', _selectedTimeWindow == 'Evening (04:00 PM – 08:00 PM)', primaryBrand, surfaceColor, textPrimary, isDark),
          ],
        );

      case 4:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Stripe Escrow Pre-Authorization', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
            const SizedBox(height: 8),
            Text('Your card is pre-authorized now. Funds are held safely in escrow and only captured after you sign off on completed work.', style: TextStyle(fontSize: 12, color: textSecondary, height: 1.4)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: surfaceColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
              ),
              child: Builder(
                builder: (context) {
                  final basePrice = widget.selectedPackagePrice ?? widget.service.price;
                  final diagnosticFee = _isEmergencySurge ? 49.00 : 20.00;
                  final subtotal = basePrice + diagnosticFee;
                  final uaeVat = subtotal * 0.05; // 5% UAE VAT (matches server-side calculation)
                  final total = subtotal + uaeVat;
                  final serviceLabel = widget.service.name.isNotEmpty ? widget.service.name : 'Service Package';
                  final packageLabel = widget.selectedTierTitle != null ? '$serviceLabel (${widget.selectedTierTitle})' : serviceLabel;
                  return Column(
                    children: [
                      _buildCostRow(packageLabel, ApiClient.instance.formatCurrency(basePrice), textSecondary, textPrimary),
                      _buildCostRow(_isEmergencySurge ? 'Emergency 60-Min Dispatch Fee' : 'Standard Dispatch Callout', ApiClient.instance.formatCurrency(diagnosticFee), textSecondary, textPrimary),
                      _buildCostRow('UAE VAT (5%)', ApiClient.instance.formatCurrency(uaeVat), textSecondary, textPrimary),
                      const Divider(height: 20),
                      _buildCostRow('Total Pre-Authorized', ApiClient.instance.formatCurrency(total), textPrimary, primaryBrand, isBold: true),
                    ],
                  );
                },
              ),
            ),
          ],
        );

      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildWindowOption(String title, bool isSelected, Color primaryBrand, Color surfaceColor, Color textPrimary, bool isDark) {
    return GestureDetector(
      onTap: () => setState(() => _selectedTimeWindow = title),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? primaryBrand.withOpacity(0.08) : surfaceColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? primaryBrand : (isDark ? AppColors.nightBorder : AppColors.dayBorder)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: TextStyle(fontSize: 13, fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600, color: isSelected ? primaryBrand : textPrimary)),
            if (isSelected) Icon(Icons.check_circle, size: 18, color: primaryBrand),
          ],
        ),
      ),
    );
  }

  Widget _buildCostRow(String title, String val, Color labelColor, Color valColor, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: TextStyle(fontSize: isBold ? 14 : 12, fontWeight: isBold ? FontWeight.w800 : FontWeight.w500, color: labelColor)),
          Text(val, style: TextStyle(fontSize: isBold ? 17 : 12, fontWeight: isBold ? FontWeight.w900 : FontWeight.w700, color: valColor)),
        ],
      ),
    );
  }
}
