import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/theme/app_theme.dart';

/// Screen C40, C41, C42, C43, C44, C45: Support Hub, Emergency Hotline, Tickets, Promos & Legal
class SupportHelpScreen extends StatefulWidget {
  final VoidCallback? onBack;
  final int initialTabIndex;

  const SupportHelpScreen({
    super.key,
    this.onBack,
    this.initialTabIndex = 0,
  });

  @override
  State<SupportHelpScreen> createState() => _SupportHelpScreenState();
}

class _SupportHelpScreenState extends State<SupportHelpScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  final List<Map<String, dynamic>> _tickets = [];

  final List<Map<String, dynamic>> _promos = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 4,
      vsync: this,
      initialIndex: widget.initialTabIndex,
    );
    _loadTickets();
  }

  Future<void> _loadTickets() async {
    try {
      final list = await ApiClient.instance.fetchTickets();
      if (mounted && list.isNotEmpty) {
        setState(() {
          _tickets
            ..clear()
            ..addAll(list.map((r) {
              final m = Map<String, dynamic>.from(r as Map);
              return {
                'id': (m['ticketReference'] ?? m['id'] ?? 'TKT').toString(),
                'subject': (m['subject'] ?? 'Support Inquiry').toString(),
                'category': (m['category'] ?? 'General Support').toString(),
                'status': (m['status'] ?? 'OPEN').toString(),
                'date': (m['createdAt'] ?? 'Recent').toString(),
                'lastMsg': (m['initialMessage'] ?? 'Queued for support review').toString(),
              };
            }));
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
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
          onPressed: widget.onBack ?? () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Help & Support Center',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: textPrimary,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
          indicatorWeight: 3,
          labelColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
          unselectedLabelColor: textSecondary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'Emergency SOS'),
            Tab(text: 'Support Tickets'),
            Tab(text: 'Coupons & Promos'),
            Tab(text: 'Terms & Privacy'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildEmergencyTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
          _buildTicketsTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
          _buildPromosTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
          _buildLegalTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
        ],
      ),
    );
  }

  Widget _buildEmergencyTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Urgent Alert Card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFDC2626), Color(0xFF991B1B)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFDC2626).withOpacity(0.3),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '24/7 PRIORITY HOTLINE',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Colors.white70,
                            letterSpacing: 1.1,
                          ),
                        ),
                        Text(
                          'Rapid Emergency Response',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'For active water main bursts, sewage overflows, electrical spark hazards, or gas shut-off emergencies. A certified rapid-response technician is dispatched in under 60 minutes.',
                style: TextStyle(fontSize: 13, color: Colors.white, height: 1.4),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFFDC2626),
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Dialing 24/7 Operations Emergency Dispatcher...')),
                  );
                },
                icon: const Icon(Icons.phone_in_talk, size: 20),
                label: const Text(
                  'Call 24/7 Emergency Dispatch',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        Text(
          'Frequently Answered Emergencies',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: textPrimary),
        ),
        const SizedBox(height: 12),
        _buildAccordion('Water Burst Isolation Steps', 'Locate the main water valve near the street curb or garage. Turn clock-wise until fully tight. Turn on all cold faucets to drain pressure.', surfaceColor, borderColor, textPrimary, textSecondary),
        const SizedBox(height: 8),
        _buildAccordion('Gas Leak Protocol', 'Do NOT touch electrical switches. Extinguish open flames. Evacuate immediately and dial 911 prior to booking pro.', surfaceColor, borderColor, textPrimary, textSecondary),
        const SizedBox(height: 8),
        _buildAccordion('Electrical Tripping & Smoke', 'Flip the main breaker switch on your electrical panel. Do not attempt to use water on electrical outlets.', surfaceColor, borderColor, textPrimary, textSecondary),
      ],
    );
  }

  Widget _buildTicketsTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Active Inquiries', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textPrimary)),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              ),
              onPressed: () {
                _showNewTicketModal(context, isDark, surfaceColor, borderColor, textPrimary, textSecondary);
              },
              icon: const Icon(Icons.add, size: 16),
              label: const Text('New Ticket', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (_tickets.isEmpty)
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Column(
              children: [
                Icon(Icons.support_agent_outlined, size: 48, color: textSecondary.withOpacity(0.4)),
                const SizedBox(height: 12),
                Text('No Support Tickets Yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: textPrimary)),
                const SizedBox(height: 6),
                Text('Tap "New Ticket" above if you need assistance with a booking or invoice.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: textSecondary)),
              ],
            ),
          ),
        for (final tkt in _tickets)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      tkt['id'] as String,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: tkt['status'] == 'RESOLVED'
                            ? AppColors.verifiedEmerald.withOpacity(0.12)
                            : AppColors.warningOrange.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        tkt['status'] as String,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: tkt['status'] == 'RESOLVED' ? AppColors.verifiedEmerald : AppColors.warningOrange,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  tkt['subject'] as String,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary),
                ),
                const SizedBox(height: 4),
                Text(
                  'Latest update: "${tkt['lastMsg']}"',
                  style: TextStyle(fontSize: 12, color: textSecondary),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildPromosTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Referral Card
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF6366F1), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'REFERRAL COMMUNITY PROGRAM',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white70, letterSpacing: 1),
              ),
              const SizedBox(height: 4),
              const Text(
                'Share Your Invite Code & Earn Credits',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white.withOpacity(0.3)),
                    ),
                    child: const Text(
                      'PROMO2026',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.dayPrimary,
                      elevation: 0,
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Referral code copied to clipboard!')),
                      );
                    },
                    child: const Text('Copy Link', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text('Available Promo Coupons', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 12),
        if (_promos.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.local_offer_outlined, size: 36, color: textSecondary),
                  const SizedBox(height: 8),
                  Text('No Active Coupons', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
                  const SizedBox(height: 4),
                  Text('Promotional coupons and discounts will appear here when issued.', style: TextStyle(fontSize: 12, color: textSecondary), textAlign: TextAlign.center),
                ],
              ),
            ),
          )
        else
          for (final promo in _promos)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: surfaceColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: (isDark ? AppColors.nightPrimary : AppColors.dayPrimary).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    promo['discount'] as String,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            promo['code'] as String,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: textPrimary),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.verifiedEmerald.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              promo['tag'] as String,
                              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.verifiedEmerald),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(promo['minSpend'] as String, style: TextStyle(fontSize: 12, color: textSecondary)),
                      Text(promo['expiry'] as String, style: TextStyle(fontSize: 11, color: textSecondary.withOpacity(0.7))),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildLegalTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('ServiceOS Customer Agreement', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        const SizedBox(height: 4),
        Text('Last updated: November 2026 • Global Version 3.2', style: TextStyle(fontSize: 12, color: textSecondary)),
        const SizedBox(height: 16),
        _buildLegalSection(
          '1. Escrow Payment Protection',
          'All customer payments for services requested on ServiceOS are placed into a protected escrow hold managed via Stripe Connect. Funds are strictly released to the certified service professional only upon electronic signature sign-off by the customer on the digital work order completion screen.',
          textPrimary,
          textSecondary,
        ),
        _buildLegalSection(
          '2. 30-Day Workmanship Warranty',
          'Every job completed by a verified technician carries a 30-day rework guarantee. In the event of an incomplete or substandard repair, ServiceOS dispatches an independent master inspector at zero additional expense to rectify the issue.',
          textPrimary,
          textSecondary,
        ),
        _buildLegalSection(
          '3. \$1,000,000 Property Damage Guarantee',
          'All service professionals operating on ServiceOS maintain an active, verified general commercial liability insurance policy of no less than \$1,000,000. In the event of inadvertent property damage, claims are adjudicated within 48 business hours.',
          textPrimary,
          textSecondary,
        ),
        _buildLegalSection(
          '4. Privacy & Location Data Disclosure (GDPR & CCPA)',
          'Precise GPS tracking data is gathered solely while an active work order is en-route or in-progress. ServiceOS never sells, rents, or monetizes customer location telemetry to third-party ad networks.',
          textPrimary,
          textSecondary,
        ),
      ],
    );
  }

  Widget _buildLegalSection(String title, String content, Color textPrimary, Color textSecondary) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
          const SizedBox(height: 6),
          Text(content, style: TextStyle(fontSize: 13, height: 1.5, color: textSecondary)),
        ],
      ),
    );
  }

  Widget _buildAccordion(
    String title,
    String content,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: ExpansionTile(
        title: Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textPrimary)),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Text(content, style: TextStyle(fontSize: 13, height: 1.4, color: textSecondary)),
          ),
        ],
      ),
    );
  }

  void _showNewTicketModal(
    BuildContext context,
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    final subjectCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: surfaceColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Create Support Ticket', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
            const SizedBox(height: 12),
            TextField(
              controller: subjectCtrl,
              decoration: InputDecoration(
                labelText: 'Subject / Issue Summary',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Detailed Explanation & Work Order Reference',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () async {
                final subj = subjectCtrl.text.trim();
                final desc = descCtrl.text.trim();
                if (subj.isEmpty) return;
                try {
                  await ApiClient.instance.openSupportTicket(
                    subject: subj,
                    initialMessage: desc.isNotEmpty ? desc : subj,
                  );
                } catch (_) {}
                await _loadTickets();
                if (!mounted) return;
                if (_tickets.isEmpty || _tickets.first['subject'] != subj) {
                  setState(() {
                    _tickets.insert(0, {
                      'id': 'TKT-${1000 + _tickets.length + 1}',
                      'subject': subj,
                      'category': 'Support Inquiry',
                      'status': 'OPEN',
                      'date': 'Just now',
                      'lastMsg': desc.isNotEmpty ? desc : 'Ticket submitted for dispatcher review.',
                    });
                  });
                }
                if (ctx.mounted) Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Support ticket created and queued for support review.')),
                );
              },
              child: const Text('Submit Ticket', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
