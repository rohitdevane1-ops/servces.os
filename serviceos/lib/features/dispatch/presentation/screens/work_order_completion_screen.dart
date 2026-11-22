import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';

class WorkOrderCompletionScreen extends StatefulWidget {
  final String? bookingId;
  final VoidCallback onSignOffComplete;
  final VoidCallback onBack;

  const WorkOrderCompletionScreen({
    super.key,
    this.bookingId,
    required this.onSignOffComplete,
    required this.onBack,
  });

  @override
  State<WorkOrderCompletionScreen> createState() => _WorkOrderCompletionScreenState();
}

class _WorkOrderCompletionScreenState extends State<WorkOrderCompletionScreen> {
  bool _hasSigned = false;
  int _rating = 5;

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
        title: const Text('Review & Sign-Off', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Job Completed: Field Service Order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
              const SizedBox(height: 4),
              Text('The technician has finished the service. Inspect photo proof and sign below to release escrow payment.', style: TextStyle(fontSize: 12, color: textSecondary, height: 1.4)),

              const SizedBox(height: 18),

              // Dual Photo Proof Review
              Text('DUAL PHOTO VERIFICATION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: textSecondary, letterSpacing: 0.5)),
              const SizedBox(height: 8),

              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Before Repair', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Container(
                          height: 100,
                          decoration: BoxDecoration(
                            color: Colors.grey.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(Icons.image, size: 32, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('After Repair ✓', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF10B981))),
                        const SizedBox(height: 4),
                        Container(
                          height: 100,
                          decoration: BoxDecoration(
                            color: Colors.grey.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF10B981)),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(Icons.check_circle_outline, size: 32, color: Color(0xFF10B981)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              // Digital Sign-on-Glass Canvas Simulation
              Text('CUSTOMER SIGNATURE (ON GLASS)', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: textSecondary, letterSpacing: 0.5)),
              const SizedBox(height: 8),

              GestureDetector(
                onTap: () => setState(() => _hasSigned = true),
                child: Container(
                  height: 140,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: surfaceColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: _hasSigned ? primaryBrand : (isDark ? AppColors.nightBorder : AppColors.dayBorder), width: 2),
                  ),
                  child: Center(
                    child: _hasSigned
                        ? Text('Customer Authorized', style: TextStyle(fontStyle: FontStyle.italic, fontSize: 26, fontWeight: FontWeight.w600, color: primaryBrand))
                        : Text('Tap here to simulate finger signature', style: TextStyle(fontSize: 12, color: textSecondary)),
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 5-Star Rating & Tip
              Text('RATE YOUR PRO', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: textSecondary, letterSpacing: 0.5)),
              const SizedBox(height: 8),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (index) {
                  return IconButton(
                    icon: Icon(
                      index < _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                      size: 34,
                      color: AppColors.ratingAmber,
                    ),
                    onPressed: () => setState(() => _rating = index + 1),
                  );
                }),
              ),

              const SizedBox(height: 30),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _hasSigned
                      ? () async {
                          try {
                            String bid = (widget.bookingId ?? '').trim();
                            if (bid.isEmpty) {
                              final list = await ApiClient.instance.fetchBookings();
                              if (list.isNotEmpty && list.first is Map) {
                                bid = (list.first as Map)['id']?.toString() ?? '';
                              }
                            }
                            if (bid.isNotEmpty) {
                              await ApiClient.instance.submitReview(
                                bookingId: bid,
                                rating: _rating,
                                comment: 'Verified completion sign-off via Customer App',
                              );
                            }
                          } catch (_) {}
                          widget.onSignOffComplete();
                        }
                      : () => setState(() => _hasSigned = true),
                  child: Text(
                    _hasSigned ? 'Approve & Release Escrow ✓' : 'Tap to Sign First',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
