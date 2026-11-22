import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/constants/asset_constants.dart';
import '../../../../data/models/service_model.dart';

class ServiceDetailScreen extends StatefulWidget {
  final ServiceItemModel service;
  final VoidCallback onProceedToBooking;
  final void Function(double totalPrice, String tierTitle)? onConfigureBooking;
  final VoidCallback onBack;

  const ServiceDetailScreen({
    super.key,
    required this.service,
    required this.onProceedToBooking,
    this.onConfigureBooking,
    required this.onBack,
  });

  @override
  State<ServiceDetailScreen> createState() => _ServiceDetailScreenState();
}

class _ServiceDetailScreenState extends State<ServiceDetailScreen> {
  int _selectedTierIndex = 0;
  bool _includeAddon = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;

    final base = widget.service.price;
    final tiers = [
      {'title': 'Standard Service', 'price': base, 'desc': 'Standard service execution with verified warranty.'},
      {'title': 'Comprehensive Package', 'price': (base * 1.35).roundToDouble(), 'desc': 'Complete diagnosis, precision calibration & extended warranty.'},
      {'title': 'Heavy-Duty Pro Overhaul', 'price': (base * 1.75).roundToDouble(), 'desc': 'Heavy-duty overhaul, full fitting rebuild & 90-day warranty.'},
    ];

    final addOnPrice = (base * 0.15).roundToDouble();
    final currentTierPrice = tiers[_selectedTierIndex]['price'] as double;
    final totalPrice = currentTierPrice + (_includeAddon ? addOnPrice : 0.0);

    return Scaffold(
      backgroundColor: isDark ? AppColors.nightCanvas : AppColors.dayCanvas,
      body: CustomScrollView(
        slivers: [
          // Photography Header App Bar
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            leading: CircleAvatar(
              backgroundColor: Colors.black.withOpacity(0.5),
              child: IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
                onPressed: widget.onBack,
              ),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    AssetConstants.getCategoryImage(widget.service.category),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(color: primaryBrand),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Colors.black.withOpacity(0.7)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 16,
                    left: 16,
                    right: 16,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.verifiedEmerald,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text('Verified Licensed Trade Pro', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.star, size: 14, color: AppColors.ratingAmber),
                              const SizedBox(width: 4),
                              Text(widget.service.rating.toStringAsFixed(1), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.black)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Body Content
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.service.name,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: textPrimary, letterSpacing: -0.4),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    widget.service.description,
                    style: TextStyle(fontSize: 13, color: textSecondary, height: 1.45),
                  ),

                  const SizedBox(height: 20),

                  // 3-Tier Package Selection (Urban Company pattern)
                  Text(
                    'SELECT PACKAGE TIER',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: textSecondary, letterSpacing: 0.5),
                  ),
                  const SizedBox(height: 10),

                  Column(
                    children: List.generate(tiers.length, (index) {
                      final tier = tiers[index];
                      final isSelected = _selectedTierIndex == index;
                      final isPopular = index == 1;

                      return GestureDetector(
                        onTap: () => setState(() => _selectedTierIndex = index),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: isSelected ? primaryBrand.withOpacity(0.06) : surfaceColor,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isSelected ? primaryBrand : (isDark ? AppColors.nightBorder : AppColors.dayBorder),
                              width: isSelected ? 2 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              Radio<int>(
                                value: index,
                                groupValue: _selectedTierIndex,
                                activeColor: primaryBrand,
                                onChanged: (val) => setState(() => _selectedTierIndex = val!),
                              ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          tier['title'] as String,
                                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: textPrimary),
                                        ),
                                        if (isPopular) ...[
                                          const SizedBox(width: 8),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: primaryBrand,
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: const Text('POPULAR', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
                                          ),
                                        ],
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Text(tier['desc'] as String, style: TextStyle(fontSize: 11, color: textSecondary)),
                                  ],
                                ),
                              ),
                              Text(
                                '\$${(tier['price'] as double).toStringAsFixed(0)}',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: primaryBrand),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ),

                  const SizedBox(height: 16),

                  // Inclusions vs Exclusions Accordion
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: surfaceColor,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('What is Included:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: textPrimary)),
                        const SizedBox(height: 6),
                        _buildCheckItem(Icons.check, AppColors.verifiedEmerald, 'Certified on-site labor & diagnostic inspection'),
                        _buildCheckItem(Icons.check, AppColors.verifiedEmerald, 'Standard replacement seals, gaskets & hardware'),
                        _buildCheckItem(Icons.check, AppColors.verifiedEmerald, 'Complete clean-up after service completion'),
                        const SizedBox(height: 8),
                        Text('What is Excluded:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: textPrimary)),
                        const SizedBox(height: 6),
                        _buildCheckItem(Icons.close, AppColors.errorRed, 'Structural drywall cutting or building modification'),
                        _buildCheckItem(Icons.close, AppColors.errorRed, 'City municipal line permits and utility fees'),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Add-on Selector
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: surfaceColor,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Comprehensive Service Add-on', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary)),
                            Text('Protective preventative treatment (+\$${addOnPrice.toStringAsFixed(2)})', style: TextStyle(fontSize: 11, color: textSecondary)),
                          ],
                        ),
                        Checkbox(
                          value: _includeAddon,
                          activeColor: primaryBrand,
                          onChanged: (val) => setState(() => _includeAddon = val ?? false),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: surfaceColor,
          border: Border(top: BorderSide(color: isDark ? AppColors.nightBorder : AppColors.dayBorder)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Pre-Authorized Total', style: TextStyle(fontSize: 11, color: textSecondary)),
                  Text(ApiClient.instance.formatCurrency(totalPrice), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: textPrimary)),
                ],
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryBrand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () {
                  if (widget.onConfigureBooking != null) {
                    final tierTitle = (tiers[_selectedTierIndex]['title'] as String) +
                        (_includeAddon ? ' + Preventative Add-on' : '');
                    widget.onConfigureBooking!(totalPrice, tierTitle);
                  } else {
                    widget.onProceedToBooking();
                  }
                },
                child: const Row(
                  children: [
                    Text('Configure Booking', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                    SizedBox(width: 6),
                    Icon(Icons.arrow_forward_rounded, size: 18),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCheckItem(IconData icon, Color color, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 11, color: Theme.of(context).brightness == Brightness.dark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary))),
        ],
      ),
    );
  }
}
