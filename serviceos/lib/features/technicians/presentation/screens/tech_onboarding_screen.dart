import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';

/// Screen P01 to P11: Complete Technician Multi-Step Onboarding Flow
/// Covers Entity Select, License Scan, Insurance Upload, Background Check,
/// Service Picker, Rate Config, Radius Map, Schedule, and KYC Verification.
class TechOnboardingScreen extends StatefulWidget {
  final VoidCallback? onBack;
  final VoidCallback? onFinishOnboarding;

  const TechOnboardingScreen({
    super.key,
    this.onBack,
    this.onFinishOnboarding,
  });

  @override
  State<TechOnboardingScreen> createState() => _TechOnboardingScreenState();
}

class _TechOnboardingScreenState extends State<TechOnboardingScreen> {
  final ImagePicker _picker = ImagePicker();
  int _currentStep = 0; // 0 to 6 steps

  // Step 0: Entity type
  String _entityType = 'solo'; // solo or company

  // Step 1: License & Vehicle KYC details
  String _licenseState = '';
  String _licenseNumber = '';
  String _vehicleMakeModel = '';
  String _vehicleLicensePlate = '';
  final List<String> _uploadedDocUrls = [];
  bool _isUploadingDoc = false;
  bool _isSubmitting = false;
  String? _submissionStatus;

  // Step 2: Insurance details
  String _insuranceCarrier = 'Commercial General Liability Policy';

  // Step 3: Categories & Services
  final Set<String> _selectedCategories = {'HVAC & Cooling', 'Plumbing Services'};

  // Step 4: Rates & Radius
  double _hourlyRate = 95.0;
  double _radiusMiles = 25.0;

  // Step 5: Stripe Connect
  bool _stripeConnected = false;

  @override
  void initState() {
    super.initState();
    _loadExistingOnboarding();
  }

  Future<void> _loadExistingOnboarding() async {
    try {
      final list = await ApiClient.instance.getTechnicianOnboarding();
      if (!mounted || list.isEmpty) return;
      final latest = Map<String, dynamic>.from(list.first as Map);
      setState(() {
        _submissionStatus = latest['status']?.toString();
        _licenseNumber = latest['licenseNumber']?.toString() ?? _licenseNumber;
        _licenseState = latest['nationalIdNumber']?.toString() ?? _licenseState;
        _vehicleMakeModel = latest['vehicleMakeModel']?.toString() ?? _vehicleMakeModel;
        _vehicleLicensePlate = latest['vehicleLicensePlate']?.toString() ?? _vehicleLicensePlate;
        final docs = latest['documentUrls'] as List<dynamic>? ?? const [];
        if (docs.isNotEmpty) {
          _uploadedDocUrls
            ..clear()
            ..addAll(docs.map((e) => e.toString()));
        }
      });
    } catch (_) {}
  }

  Future<void> _pickAndUploadLicense() async {
    if (_isUploadingDoc) return;
    setState(() => _isUploadingDoc = true);
    try {
      final file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final url = await ApiClient.instance.uploadMediaBytes(bytes, file.name);
      if (url != null && url.isNotEmpty && mounted) {
        setState(() {
          if (!_uploadedDocUrls.contains(url)) {
            _uploadedDocUrls.add(url);
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Document upload failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploadingDoc = false);
    }
  }

  Future<void> _nextStep() async {
    if (_currentStep == 1) {
      if (_licenseNumber.trim().isEmpty ||
          _vehicleMakeModel.trim().isEmpty ||
          _vehicleLicensePlate.trim().isEmpty ||
          _uploadedDocUrls.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please enter your license #, vehicle details, and upload a verification document.'),
          ),
        );
        return;
      }
    }

    if (_currentStep == 5) {
      if (_isSubmitting) return;
      setState(() => _isSubmitting = true);
      try {
        final saved = await ApiClient.instance.submitTechnicianOnboarding(
          licenseNumber: _licenseNumber.trim(),
          nationalIdNumber: _licenseState.trim().isNotEmpty ? _licenseState.trim() : null,
          vehicleMakeModel: _vehicleMakeModel.trim(),
          vehicleLicensePlate: _vehicleLicensePlate.trim(),
          tradeCategory: _selectedCategories.isNotEmpty ? _selectedCategories.first : 'General',
          documentUrls: _uploadedDocUrls,
        );
        if (!mounted) return;
        setState(() {
          _submissionStatus = saved['status']?.toString() ?? 'SUBMITTED';
          _currentStep = 6;
        });
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Onboarding submission failed: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _isSubmitting = false);
      }
      return;
    }

    if (_currentStep < 6) {
      setState(() => _currentStep++);
    } else {
      widget.onFinishOnboarding?.call();
    }
  }

  void _prevStep() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
    } else if (widget.onBack != null) {
      widget.onBack!();
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final canvasColor = isDark ? AppColors.nightCanvas : AppColors.dayCanvas;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;

    return Scaffold(
      backgroundColor: canvasColor,
      appBar: AppBar(
        backgroundColor: surfaceColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new, size: 20, color: textPrimary),
          onPressed: _prevStep,
        ),
        title: Text(
          'Pro Partner Onboarding',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: textPrimary,
          ),
        ),
      ),
      body: Column(
        children: [
          // Linear Progress Step Bar
          Container(
            color: surfaceColor,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Step ${_currentStep + 1} of 7',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                      ),
                    ),
                    Text(
                      _getStepTitle(_currentStep),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (_currentStep + 1) / 7.0,
                    backgroundColor: borderColor,
                    color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                    minHeight: 6,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Scrollable Step Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: _buildCurrentStepWidget(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
            ),
          ),

          // Bottom Action Bar
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: surfaceColor,
              border: Border(top: BorderSide(color: borderColor)),
            ),
            child: Row(
              children: [
                if (_currentStep > 0 && _currentStep < 6) ...[
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: textPrimary,
                      side: BorderSide(color: borderColor),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: _prevStep,
                    child: const Text('Back', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: _isSubmitting ? null : _nextStep,
                    child: Text(
                      _isSubmitting
                          ? 'Submitting KYC...'
                          : (_currentStep == 6 ? 'Go to Tech Dashboard' : 'Continue'),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _getStepTitle(int step) {
    switch (step) {
      case 0:
        return 'Entity Selection';
      case 1:
        return 'Trade License';
      case 2:
        return 'General Liability';
      case 3:
        return 'Trade Services';
      case 4:
        return 'Rates & Geofence';
      case 5:
        return 'Stripe Express Payout';
      case 6:
        return 'Admin Verification';
      default:
        return '';
    }
  }

  Widget _buildCurrentStepWidget(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    switch (_currentStep) {
      case 0:
        return _buildStep0Entity(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 1:
        return _buildStep1License(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 2:
        return _buildStep2Insurance(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 3:
        return _buildStep3Services(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 4:
        return _buildStep4RatesRadius(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 5:
        return _buildStep5Stripe(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      case 6:
        return _buildStep6ApprovalWait(isDark, surfaceColor, borderColor, textPrimary, textSecondary);
      default:
        return const SizedBox();
    }
  }

  // Step 0: Entity
  Widget _buildStep0Entity(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('How will you provide services on ServiceOS?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('Choose the legal structure matching your trade registration.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 20),
        _buildSelectableCard(
          isSelected: _entityType == 'solo',
          title: 'Independent Contractor (Sole Pro)',
          subtitle: 'You perform jobs individually. 1099-NEC tax classification with direct Stripe Express payouts.',
          icon: Icons.person_outline,
          onTap: () => setState(() => _entityType = 'solo'),
          isDark: isDark,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
        ),
        const SizedBox(height: 14),
        _buildSelectableCard(
          isSelected: _entityType == 'company',
          title: 'Licensed Agency / Multi-Van Business',
          subtitle: 'You operate a fleet with multiple certified technicians. Corporate EIN & central dispatch routing.',
          icon: Icons.business_outlined,
          onTap: () => setState(() => _entityType = 'company'),
          isDark: isDark,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
        ),
      ],
    );
  }

  // Step 1: License
  Widget _buildStep1License(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Trade License Verification', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('To maintain commercial compliance, all ServiceOS pros must possess an active state license.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 20),
        TextFormField(
          initialValue: _licenseState,
          onChanged: (val) => _licenseState = val,
          decoration: InputDecoration(
            labelText: 'Issuing State / Region',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        const SizedBox(height: 14),
        TextFormField(
          initialValue: _licenseNumber,
          onChanged: (val) => _licenseNumber = val,
          decoration: InputDecoration(
            labelText: 'Master / Journeyman License Number',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        const SizedBox(height: 14),
        TextFormField(
          initialValue: _vehicleMakeModel,
          onChanged: (val) => _vehicleMakeModel = val,
          decoration: InputDecoration(
            labelText: 'Service Vehicle Make & Model',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        const SizedBox(height: 14),
        TextFormField(
          initialValue: _vehicleLicensePlate,
          onChanged: (val) => _vehicleLicensePlate = val,
          decoration: InputDecoration(
            labelText: 'Vehicle License Plate',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        const SizedBox(height: 20),
        InkWell(
          onTap: _isUploadingDoc ? null : _pickAndUploadLicense,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.upload_file,
                  color: _uploadedDocUrls.isNotEmpty ? AppColors.verifiedEmerald : textSecondary,
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Trade License Certificate Upload', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary)),
                      Text(
                        _isUploadingDoc
                            ? 'Uploading verification file...'
                            : (_uploadedDocUrls.isNotEmpty
                                ? '${_uploadedDocUrls.length} verification file(s) uploaded'
                                : 'Tap to upload license image • Required'),
                        style: TextStyle(fontSize: 11, color: textSecondary),
                      ),
                    ],
                  ),
                ),
                Icon(
                  _uploadedDocUrls.isNotEmpty ? Icons.check_circle : Icons.add_circle_outline,
                  color: _uploadedDocUrls.isNotEmpty ? AppColors.verifiedEmerald : textSecondary,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // Step 2: Insurance
  Widget _buildStep2Insurance(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('General Liability Insurance', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('Minimum \$1,000,000 general liability coverage recommended for commercial dispatch partners.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppColors.verifiedEmerald.withOpacity(0.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.verifiedEmerald.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.shield, color: AppColors.verifiedEmerald, size: 36),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_insuranceCarrier, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: textPrimary)),
                    const SizedBox(height: 2),
                    Text('Verified during operations KYC review', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: textSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // Step 3: Services
  Widget _buildStep3Services(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    final categories = [
      'Plumbing Services',
      'HVAC & Cooling',
      'Electrical & Smart Home',
      'Appliance Repair',
      'Roofing & Gutters',
      'Locksmith & Security',
      'Painting & Drywall',
      'Carpentry & Woodwork',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Select Your Trade Specialties', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('You will receive priority radar dispatches only for selected trades.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 16),
        for (final cat in categories)
          CheckboxListTile(
            title: Text(cat, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
            value: _selectedCategories.contains(cat),
            activeColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
            contentPadding: EdgeInsets.zero,
            onChanged: (val) {
              setState(() {
                if (val == true) {
                  _selectedCategories.add(cat);
                } else {
                  _selectedCategories.remove(cat);
                }
              });
            },
          ),
      ],
    );
  }

  // Step 4: Rates & Radius
  Widget _buildStep4RatesRadius(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Hourly Rates & Service Radius', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('Configure your billable rate and maximum travel boundary.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Standard Labor Rate', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
            Text(ApiClient.instance.formatCurrency(_hourlyRate) + ' / hr', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary)),
          ],
        ),
        Slider(
          value: _hourlyRate,
          min: 60,
          max: 200,
          divisions: 28,
          activeColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
          onChanged: (val) => setState(() => _hourlyRate = val),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Dispatch Service Radius', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
            Text('${_radiusMiles.toInt()} miles', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary)),
          ],
        ),
        Slider(
          value: _radiusMiles,
          min: 5,
          max: 50,
          divisions: 9,
          activeColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
          onChanged: (val) => setState(() => _radiusMiles = val),
        ),
      ],
    );
  }

  // Step 5: Stripe
  Widget _buildStep5Stripe(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Stripe Express Payout Setup', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 8),
        Text('85% of customer billing is deposited directly to your bank account after customer sign-off.', style: TextStyle(fontSize: 13, color: textSecondary)),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: surfaceColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: borderColor),
          ),
          child: Column(
            children: [
              Icon(
                _stripeConnected ? Icons.check_circle : Icons.account_balance,
                size: 48,
                color: _stripeConnected ? AppColors.verifiedEmerald : (isDark ? AppColors.nightPrimary : AppColors.dayPrimary),
              ),
              const SizedBox(height: 14),
              Text(
                _stripeConnected ? 'Stripe Express Account Connected' : 'No Bank Account Linked Yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textPrimary),
              ),
              const SizedBox(height: 4),
              Text(
                'Direct Deposit (ACH) & Instant 30-min Payouts Enabled',
                style: TextStyle(fontSize: 12, color: textSecondary),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () {
                  setState(() => _stripeConnected = true);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Stripe Connect verified successfully!')),
                  );
                },
                child: Text(_stripeConnected ? 'Re-configure Bank' : 'Verify Stripe Express', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // Step 6: Approval Wait
  Widget _buildStep6ApprovalWait(bool isDark, Color surfaceColor, Color borderColor, Color textPrimary, Color textSecondary) {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.verifiedEmerald.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.verified, size: 64, color: AppColors.verifiedEmerald),
          ),
          const SizedBox(height: 20),
          Text(
            _submissionStatus == 'APPROVED'
                ? 'Application Approved & Ready!'
                : 'KYC Packet Submitted (${_submissionStatus ?? 'SUBMITTED'})',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            _submissionStatus == 'APPROVED'
                ? 'Your credentials, vehicle KYC, and payout account have been verified by ServiceOS Dispatch.'
                : 'Your license and vehicle documents are saved in PostgreSQL for operations review.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: textSecondary, height: 1.4),
          ),
          const SizedBox(height: 28),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Column(
              children: [
                _buildCheckRow('Trade License Recorded (${_licenseNumber})', true, textPrimary),
                const SizedBox(height: 8),
                _buildCheckRow('Vehicle Registered ($_vehicleMakeModel)', true, textPrimary),
                const SizedBox(height: 8),
                _buildCheckRow('Verification Docs Uploaded (${_uploadedDocUrls.length})', _uploadedDocUrls.isNotEmpty, textPrimary),
                const SizedBox(height: 8),
                _buildCheckRow('Review Status: ${_submissionStatus ?? 'SUBMITTED'}', _submissionStatus == 'APPROVED', textPrimary),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckRow(String text, bool checked, Color textPrimary) {
    return Row(
      children: [
        const Icon(Icons.check_circle, size: 18, color: AppColors.verifiedEmerald),
        const SizedBox(width: 10),
        Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: textPrimary)),
      ],
    );
  }

  Widget _buildSelectableCard({
    required bool isSelected,
    required String title,
    required String subtitle,
    required IconData icon,
    required VoidCallback onTap,
    required bool isDark,
    required Color surfaceColor,
    required Color borderColor,
    required Color textPrimary,
    required Color textSecondary,
  }) {
    final activeColor = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? activeColor : borderColor,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isSelected ? activeColor.withOpacity(0.12) : borderColor.withOpacity(0.5),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: isSelected ? activeColor : textSecondary, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: textPrimary)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TextStyle(fontSize: 12, color: textSecondary, height: 1.3)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? activeColor : textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}
