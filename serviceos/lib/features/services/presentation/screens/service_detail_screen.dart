import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/constants/asset_constants.dart';
import '../../../../core/widgets/motion_primitives.dart';
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
  bool _isFavorite = false;
  DateTime? _selectedDate;
  String? _selectedTimeWindow;

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (picked != null && mounted) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _pickTimeWindow() async {
    const slots = [
      'Morning (08:00 AM – 12:00 PM)',
      'Afternoon (12:00 PM – 04:00 PM)',
      'Evening (04:00 PM – 08:00 PM)',
    ];
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: slots
              .map(
                (slot) => ListTile(
                  leading: const Icon(Icons.schedule_rounded),
                  title: Text(slot, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  onTap: () => Navigator.pop(ctx, slot),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (choice != null && mounted) {
      setState(() => _selectedTimeWindow = choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final canvasColor = isDark ? AppColors.nightCanvas : AppColors.dayCanvas;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;
    final accentBrand = isDark ? AppColors.nightAccent : AppColors.dayAccent;

    final base = widget.service.price;
    final tiers = [
      {
        'title': 'Repair',
        'fullTitle': 'Standard Repair',
        'price': base,
        'icon': Icons.build_rounded,
      },
      {
        'title': 'Installation',
        'fullTitle': 'Full Installation',
        'price': (base * 1.5).roundToDouble(),
        'icon': Icons.settings_suggest_rounded,
      },
      {
        'title': 'Maintenance',
        'fullTitle': 'Deep Maintenance',
        'price': (base * 1.25).roundToDouble(),
        'icon': Icons.verified_rounded,
      },
    ];

    final addOnPrice = (base * 0.15).roundToDouble();
    final currentTierPrice = tiers[_selectedTierIndex]['price'] as double;
    final totalPrice = currentTierPrice + (_includeAddon ? addOnPrice : 0.0);

    return Scaffold(
      backgroundColor: canvasColor,
      body: CustomScrollView(
        slivers: [
          // Full-Bleed Hero Header with Floating Circular Controls & Rating Pill
          SliverAppBar(
            expandedHeight: 245,
            pinned: true,
            backgroundColor: surfaceColor,
            leadingWidth: 64,
            leading: Padding(
              padding: const EdgeInsets.only(left: 16, top: 8, bottom: 8),
              child: GestureDetector(
                onTap: widget.onBack,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.94),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.14),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A), size: 20),
                ),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 8, right: 8),
                child: IconButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Sharing ${widget.service.name}')),
                    );
                  },
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black.withOpacity(0.32),
                  ),
                  icon: const Icon(Icons.share_outlined, color: Colors.white, size: 19),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 8, right: 16),
                child: IconButton(
                  onPressed: () => setState(() => _isFavorite = !_isFavorite),
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black.withOpacity(0.32),
                  ),
                  icon: Icon(
                    _isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    color: _isFavorite ? AppColors.errorRed : Colors.white,
                    size: 19,
                  ),
                ),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: 'service-hero-${widget.service.id}',
                    child: Image.asset(
                      AssetConstants.getCategoryImage(widget.service.category),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(color: primaryBrand),
                    ),
                  ),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.black.withOpacity(0.25),
                          Colors.transparent,
                          Colors.black.withOpacity(0.42),
                        ],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 24,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.96),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.14),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.star_rounded, size: 16, color: AppColors.ratingAmber),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.service.rating.toStringAsFixed(1)} (${widget.service.reviewCount} reviews)',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Rounded-Top Overlapping Detail Sheet
          SliverToBoxAdapter(
            child: Transform.translate(
              offset: const Offset(0, -14),
              child: Container(
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                ),
                padding: const EdgeInsets.fromLTRB(18, 22, 18, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ScrollRevealItem(
                      index: 0,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.service.name,
                            style: TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.w800,
                              color: textPrimary,
                              letterSpacing: -0.4,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.service.description,
                            style: TextStyle(
                              fontSize: 13.5,
                              color: textSecondary,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 18),

                    // 3-Pill Horizontal Trust Strip
                    ScrollRevealItem(
                      index: 1,
                      child: Row(
                        children: [
                          _buildTrustPill(
                            icon: Icons.verified_user_rounded,
                            iconColor: AppColors.verifiedEmerald,
                            label: 'Verified\nPro',
                            surfaceColor: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                            borderColor: borderColor,
                            textColor: textPrimary,
                          ),
                          const SizedBox(width: 10),
                          _buildTrustPill(
                            icon: Icons.schedule_rounded,
                            iconColor: primaryBrand,
                            label: 'On-Time\nService',
                            surfaceColor: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                            borderColor: borderColor,
                            textColor: textPrimary,
                          ),
                          const SizedBox(width: 10),
                          _buildTrustPill(
                            icon: Icons.support_agent_rounded,
                            iconColor: primaryBrand,
                            label: '24/7\nSupport',
                            surfaceColor: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                            borderColor: borderColor,
                            textColor: textPrimary,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Starting From Price Callout
                    ScrollRevealItem(
                      index: 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Starting from',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: textSecondary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Text(
                                ApiClient.instance.formatCurrency(totalPrice),
                                style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                  color: textPrimary,
                                  letterSpacing: -0.6,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppColors.verifiedEmerald.withOpacity(0.14),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Text(
                                  'Escrow Protected',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.verifiedEmerald,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 22),

                    // Horizontal Select Service Type Grid (3 Cards)
                    ScrollRevealItem(
                      index: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Select Service Type',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: textPrimary,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: List.generate(tiers.length, (index) {
                              final tier = tiers[index];
                              final isSelected = _selectedTierIndex == index;
                              final tierPrice = tier['price'] as double;
                              return Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(right: index < tiers.length - 1 ? 10 : 0),
                                  child: GestureDetector(
                                    onTap: () => setState(() => _selectedTierIndex = index),
                                    child: AnimatedContainer(
                                      duration: const Duration(milliseconds: 200),
                                      curve: Curves.easeOutCubic,
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                                      decoration: BoxDecoration(
                                        color: isSelected
                                            ? primaryBrand.withOpacity(isDark ? 0.16 : 0.07)
                                            : surfaceColor,
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(
                                          color: isSelected ? primaryBrand : borderColor,
                                          width: isSelected ? 2 : 1,
                                        ),
                                      ),
                                      child: Stack(
                                        clipBehavior: Clip.none,
                                        children: [
                                          Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              Icon(
                                                tier['icon'] as IconData,
                                                size: 22,
                                                color: isSelected ? primaryBrand : textSecondary,
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                tier['title'] as String,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontSize: 12.5,
                                                  fontWeight: FontWeight.w800,
                                                  color: textPrimary,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                'From ${ApiClient.instance.formatCurrency(tierPrice)}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w600,
                                                  color: isSelected ? primaryBrand : textSecondary,
                                                ),
                                              ),
                                            ],
                                          ),
                                          if (isSelected)
                                            Positioned(
                                              right: -4,
                                              bottom: -6,
                                              child: Container(
                                                width: 18,
                                                height: 18,
                                                decoration: BoxDecoration(
                                                  color: primaryBrand,
                                                  shape: BoxShape.circle,
                                                ),
                                                child: const Icon(
                                                  Icons.check_rounded,
                                                  size: 12,
                                                  color: Colors.white,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 22),

                    // Book Your Service Schedule Rows
                    ScrollRevealItem(
                      index: 4,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Book Your Service',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: textPrimary,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _buildSelectorRow(
                            icon: Icons.calendar_today_rounded,
                            label: _selectedDate == null
                                ? 'Select Date'
                                : '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}',
                            onTap: _pickDate,
                            surfaceColor: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                            borderColor: borderColor,
                            textColor: textPrimary,
                            iconColor: primaryBrand,
                          ),
                          const SizedBox(height: 10),
                          _buildSelectorRow(
                            icon: Icons.access_time_rounded,
                            label: _selectedTimeWindow ?? 'Select Time',
                            onTap: _pickTimeWindow,
                            surfaceColor: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                            borderColor: borderColor,
                            textColor: textPrimary,
                            iconColor: primaryBrand,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Comprehensive Add-on Selector
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.nightCanvas : const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: borderColor),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Preventative Protection Add-on',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary),
                                ),
                                Text(
                                  '+${ApiClient.instance.formatCurrency(addOnPrice)}',
                                  style: TextStyle(fontSize: 11, color: textSecondary),
                                ),
                              ],
                            ),
                          ),
                          Checkbox(
                            value: _includeAddon,
                            activeColor: primaryBrand,
                            onChanged: (val) => setState(() => _includeAddon = val ?? false),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 22),

                    // Full-Width Royal Purple Proceed to Book CTA
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [primaryBrand, accentBrand],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: primaryBrand.withOpacity(0.32),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          onPressed: () {
                            if (widget.onConfigureBooking != null) {
                              final tierTitle = (tiers[_selectedTierIndex]['fullTitle'] as String) +
                                  (_includeAddon ? ' + Preventative Add-on' : '');
                              widget.onConfigureBooking!(totalPrice, tierTitle);
                            } else {
                              widget.onProceedToBooking();
                            }
                          },
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                'Proceed to Book',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                              ),
                              SizedBox(width: 8),
                              Icon(Icons.arrow_forward_rounded, size: 18),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrustPill({
    required IconData icon,
    required Color iconColor,
    required String label,
    required Color surfaceColor,
    required Color borderColor,
    required Color textColor,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.2,
                  fontWeight: FontWeight.w700,
                  color: textColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectorRow({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    required Color surfaceColor,
    required Color borderColor,
    required Color textColor,
    required Color iconColor,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: textColor),
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 20, color: textColor.withOpacity(0.55)),
          ],
        ),
      ),
    );
  }
}
