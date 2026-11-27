import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/motion_primitives.dart';

class LiveDispatchRadarScreen extends StatefulWidget {
  final VoidCallback onBack;
  final VoidCallback? onArrivalConfirmed;
  final VoidCallback? onChatWithTech;
  final VoidCallback? onCompleteJob;
  final String? safetyPin;

  const LiveDispatchRadarScreen({
    super.key,
    required this.onBack,
    this.onArrivalConfirmed,
    this.onChatWithTech,
    this.onCompleteJob,
    this.safetyPin,
  });

  @override
  State<LiveDispatchRadarScreen> createState() => _LiveDispatchRadarScreenState();
}

class _LiveDispatchRadarScreenState extends State<LiveDispatchRadarScreen> with SingleTickerProviderStateMixin {
  late AnimationController _radarController;
  bool _isMatched = true; // Simulating match found

  @override
  void initState() {
    super.initState();
    _radarController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _radarController.dispose();
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
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            PulsingStatusDot(color: AppColors.verifiedEmerald, size: 8, isActive: _isMatched),
            const SizedBox(width: 8),
            const Text('Live Dispatch Radar', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          ],
        ),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Map / Radar Simulation
            Expanded(
              flex: 5,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: double.infinity,
                    color: isDark ? const Color(0xFF0F172A) : const Color(0xFFE2E8F0),
                    child: Center(
                      child: Text(
                        '📍 Service Delivery Location • GPS Active',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: textSecondary),
                      ),
                    ),
                  ),

                  // Concentric Pulsing Radar Rings
                  AnimatedBuilder(
                    animation: _radarController,
                    builder: (context, child) {
                      return Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: 180 * _radarController.value,
                            height: 180 * _radarController.value,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: primaryBrand.withOpacity(1.0 - _radarController.value),
                                width: 2,
                              ),
                            ),
                          ),
                          Container(
                            width: 260 * _radarController.value,
                            height: 260 * _radarController.value,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: primaryBrand.withOpacity((1.0 - _radarController.value) * 0.6),
                                width: 2,
                              ),
                            ),
                          ),
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: primaryBrand,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 3),
                              boxShadow: [
                                BoxShadow(
                                  color: primaryBrand.withOpacity(0.5),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),

            // Bottom Matched Sheet
            Expanded(
              flex: 5,
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.4 : 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'PRO EN ROUTE',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.verifiedEmerald, letterSpacing: 0.5),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: primaryBrand.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                'ETA: 12 mins (1.8 mi)',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: primaryBrand),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        // Tech Profile Row
                        Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.verifiedEmerald.withOpacity(0.12),
                                border: Border.all(color: AppColors.verifiedEmerald, width: 2),
                              ),
                              child: const Icon(Icons.engineering_rounded, color: AppColors.verifiedEmerald, size: 26),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Assigned Service Specialist', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textPrimary)),
                                  Text('Certified Pro • Fleet Vehicle Dispatched', style: TextStyle(fontSize: 12, color: textSecondary)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.ratingAmber.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Row(
                                children: [
                                  Icon(Icons.star, size: 13, color: AppColors.ratingAmber),
                                  SizedBox(width: 3),
                                  Text('4.9', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.ratingAmber)),
                                ],
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 16),

                        // Safety PIN Box
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: primaryBrand.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: primaryBrand.withOpacity(0.2)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('YOUR SAFETY VERIFICATION PIN', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: primaryBrand)),
                                  const SizedBox(height: 2),
                                  Text('Ask technician for this code on arrival', style: TextStyle(fontSize: 11, color: textSecondary)),
                                ],
                              ),
                              Text(
                                (widget.safetyPin != null && widget.safetyPin!.isNotEmpty) ? widget.safetyPin! : '----',
                                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 2),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Connecting masked VoIP relay to assigned technician...'),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            },
                            child: const Text('Call Pro 📞', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: widget.onArrivalConfirmed,
                            child: const Text('Pro Arrived ✓', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
