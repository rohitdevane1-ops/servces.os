import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';

class TechWalletScreen extends StatefulWidget {
  final VoidCallback onBack;
  final double availableBalance;
  final List<Map<String, dynamic>> ledgerEntries;

  const TechWalletScreen({
    super.key,
    required this.onBack,
    this.availableBalance = 0.00,
    this.ledgerEntries = const [],
  });

  @override
  State<TechWalletScreen> createState() => _TechWalletScreenState();
}

class _TechWalletScreenState extends State<TechWalletScreen> {
  late double _availableBalance;
  late List<Map<String, dynamic>> _ledgerEntries;

  @override
  void initState() {
    super.initState();
    _availableBalance = widget.availableBalance;
    _ledgerEntries = List<Map<String, dynamic>>.from(widget.ledgerEntries);
    _loadEarnings();
  }

  Future<void> _loadEarnings() async {
    try {
      final data = await ApiClient.instance.fetchTechnicianEarnings();
      if (!mounted || data.isEmpty) return;
      final cents = double.tryParse((data['unpaidBalanceCents'] ?? data['totalEarnedCents'] ?? data['availableBalanceCents'] ?? data['totalNetEarnedCents'] ?? 0).toString()) ?? 0.0;
      final rawEntries = (data['recentCompletedBookings'] ?? data['recentPayouts'] ?? data['recentJobs'] ?? data['ledger'] ?? data['payouts'] ?? []) as List<dynamic>;
      final mapped = rawEntries.whereType<Map>().map((e) {
        final itemCents = double.tryParse((e['netEarningCents'] ?? e['netPayoutCents'] ?? e['amountCents'] ?? 0).toString()) ?? 0.0;
        return {
          'title': (e['serviceName'] ?? e['bookingReference'] ?? e['status'] ?? 'Job Settlement').toString(),
          'amount': '+${ApiClient.instance.formatCurrency(itemCents / 100.0)}',
          'date': (e['completedAt'] ?? e['createdAt'] ?? '').toString().split('T').first,
        };
      }).toList();
      setState(() {
        _availableBalance = cents / 100.0;
        if (mapped.isNotEmpty) {
          _ledgerEntries = mapped;
        }
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final availableBalance = _availableBalance;
    final ledgerEntries = _ledgerEntries;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;

    return Scaffold(
      backgroundColor: isDark ? AppColors.nightCanvas : AppColors.dayCanvas,
      appBar: AppBar(
        title: const Text('Earnings & Wallet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Available Balance Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6366F1), Color(0xFF4F46E5)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF6366F1).withOpacity(0.35),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('AVAILABLE FOR CASHOUT', style: TextStyle(color: Color(0xFFC7D2FE), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    Text(ApiClient.instance.formatCurrency(availableBalance), style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: const Color(0xFF4F46E5),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: () {
                              if (availableBalance <= 0) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('No available balance for instant cashout.')),
                                );
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Verify Stripe Express payout configuration to initiate transfer.')),
                                );
                              }
                            },
                            child: const Text('Instant Cashout ⚡', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              Text('WEEKLY DIRECT DEPOSITS (STRIPE EXPRESS)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: textSecondary, letterSpacing: 0.5)),
              const SizedBox(height: 12),

              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                ),
                child: ledgerEntries.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Center(
                          child: Text(
                            'No completed job payouts recorded yet.',
                            style: TextStyle(fontSize: 13, color: textSecondary),
                          ),
                        ),
                      )
                    : Column(
                        children: [
                          for (int i = 0; i < ledgerEntries.length; i++) ...[
                            _buildLedgerRow(
                              ledgerEntries[i]['title'] as String,
                              ledgerEntries[i]['amount'] as String,
                              ledgerEntries[i]['date'] as String,
                              const Color(0xFF10B981),
                              textPrimary,
                              textSecondary,
                            ),
                            if (i < ledgerEntries.length - 1) const Divider(height: 20),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLedgerRow(String title, String amount, String date, Color amountColor, Color textPrimary, Color textSecondary) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary)),
            const SizedBox(height: 2),
            Text(date, style: TextStyle(fontSize: 10, color: textSecondary)),
          ],
        ),
        Text(amount, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: amountColor)),
      ],
    );
  }
}
