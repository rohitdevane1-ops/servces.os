import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/network/api_client.dart';

class TechDashboardScreen extends StatefulWidget {
  final VoidCallback onSimulateBroadcast;
  final VoidCallback onOpenWallet;
  final VoidCallback onThemeToggle;
  final bool isDarkMode;

  const TechDashboardScreen({
    super.key,
    required this.onSimulateBroadcast,
    required this.onOpenWallet,
    required this.onThemeToggle,
    required this.isDarkMode,
  });

  @override
  State<TechDashboardScreen> createState() => _TechDashboardScreenState();
}

class _TechDashboardScreenState extends State<TechDashboardScreen> {
  bool _isOnline = true;
  double _todayEarnings = 0.0;
  int _completedToday = 0;

  @override
  void initState() {
    super.initState();
    _loadDashboardStats();
  }

  Future<void> _loadDashboardStats() async {
    try {
      final earnings = await ApiClient.instance.fetchTechnicianEarnings();
      if (earnings.isNotEmpty) {
        final netCents = double.tryParse((earnings['totalEarnedCents'] ?? earnings['unpaidBalanceCents'] ?? earnings['totalNetEarnedCents'] ?? earnings['availableBalanceCents'] ?? 0).toString()) ?? 0.0;
        final jobsCount = int.tryParse((earnings['completedJobsCount'] ?? earnings['completedJobs'] ?? 0).toString()) ?? 0;
        if (mounted) {
          setState(() {
            _todayEarnings = netCents / 100.0;
            _completedToday = jobsCount;
          });
        }
        return;
      }
    } catch (_) {}

    try {
      final list = await ApiClient.instance.fetchBookings();
      double netSum = 0.0;
      int completedCount = 0;
      for (final item in list) {
        if (item is Map) {
          final status = (item['status'] ?? '').toString().toUpperCase();
          if (status == 'COMPLETED' || status == 'SETTLED') {
            completedCount++;
            final payoutRaw = double.tryParse((item['providerPayoutCents'] ?? 0).toString()) ?? 0.0;
            if (payoutRaw > 0) {
              netSum += payoutRaw / 100.0;
            } else {
              final totalRaw = double.tryParse((item['totalAmountCents'] ?? item['quotedPriceCents'] ?? 0).toString()) ?? 0.0;
              netSum += (totalRaw / 100.0) * 0.85;
            }
          }
        }
      }
      if (mounted) {
        setState(() {
          _todayEarnings = netSum;
          _completedToday = completedCount;
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDarkMode;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;

    return Scaffold(
      backgroundColor: isDark ? AppColors.nightCanvas : AppColors.dayCanvas,
      appBar: AppBar(
        title: const Text('Technician Portal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            onPressed: widget.onThemeToggle,
            icon: Icon(isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded),
          ),
          IconButton(
            onPressed: widget.onOpenWallet,
            icon: const Icon(Icons.account_balance_wallet_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Online / Offline Toggle Banner
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _isOnline ? const Color(0xFF10B981).withOpacity(0.12) : Colors.grey.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _isOnline ? const Color(0xFF10B981).withOpacity(0.4) : Colors.grey.withOpacity(0.3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: _isOnline ? const Color(0xFF10B981) : Colors.grey,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isOnline ? 'You are ONLINE' : 'You are OFFLINE',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: _isOnline ? const Color(0xFF10B981) : textSecondary,
                              ),
                            ),
                            Text(
                              _isOnline ? 'Active on live GPS dispatch radar (5 mi radius)' : 'Not receiving dispatch broadcasts',
                              style: TextStyle(fontSize: 11, color: textSecondary),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Switch(
                      value: _isOnline,
                      activeColor: const Color(0xFF10B981),
                      onChanged: (val) async {
                        setState(() => _isOnline = val);
                        try {
                          await ApiClient.instance.updateDutyStatus(val ? 'ONLINE' : 'OFFLINE');
                        } catch (_) {}
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Earnings Summary Card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('TODAY\'S NET EARNINGS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: textSecondary, letterSpacing: 0.5)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text('85% Escrow Split', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF10B981))),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      ApiClient.instance.formatCurrency(_todayEarnings),
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: textPrimary, letterSpacing: -0.5),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _buildMetricPill('$_completedToday Jobs Completed', Icons.check_circle_outline, textSecondary),
                        const SizedBox(width: 12),
                        _buildMetricPill('Verified Pro ★', Icons.star_outline, AppColors.ratingAmber),
                        const SizedBox(width: 12),
                        _buildMetricPill('Ready for Dispatch', Icons.speed, AppColors.verifiedEmerald),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Active Dispatch Alert Simulator Button
              Text(
                'DISPATCH RADAR ENGINE',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: textSecondary, letterSpacing: 0.5),
              ),
              const SizedBox(height: 10),

              GestureDetector(
                onTap: widget.onSimulateBroadcast,
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEF4444).withOpacity(0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.notifications_active_rounded, color: Color(0xFFEF4444), size: 26),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Test 60-Second Broadcast Alert',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFFEF4444)),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Simulate incoming emergency job order dispatch alert',
                              style: TextStyle(fontSize: 12, color: textSecondary),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.arrow_forward_ios_rounded, size: 16, color: Color(0xFFEF4444)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricPill(String text, IconData icon, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
      ],
    );
  }
}
