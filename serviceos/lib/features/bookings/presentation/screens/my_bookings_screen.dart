import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../data/models/booking_model.dart';
import '../../../../data/repositories/booking_repository.dart';

/// Screen C34: My Bookings Ledger
/// Tabs for Active, Scheduled, Completed, and Cancelled jobs with full action workflows.
class MyBookingsScreen extends StatefulWidget {
  final VoidCallback? onBack;
  final Function(BookingModel)? onTrackLive;
  final Function(BookingModel)? onViewInvoice;
  final Function(BookingModel)? onRebook;

  const MyBookingsScreen({
    super.key,
    this.onBack,
    this.onTrackLive,
    this.onViewInvoice,
    this.onRebook,
  });

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final BookingRepository _bookingRepository = BookingRepository();
  List<BookingModel> _allBookings = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadBookings();
  }

  Future<void> _loadBookings() async {
    final list = await _bookingRepository.getCustomerBookings();
    if (mounted) {
      setState(() {
        _allBookings = list;
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<BookingModel> _filterBookings(BookingStatus status) {
    return _allBookings.where((b) {
      final matchesStatus = b.status == status;
      if (_searchQuery.isEmpty) return matchesStatus;
      return matchesStatus &&
          (b.serviceTitle.toLowerCase().contains(_searchQuery.toLowerCase()) ||
              b.technicianName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
              b.id.toLowerCase().contains(_searchQuery.toLowerCase()));
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final canvasColor = isDark ? AppColors.nightCanvas : AppColors.dayCanvas;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;

    final activeCount = _allBookings.where((b) =>
        b.status == BookingStatus.inProgress ||
        b.status == BookingStatus.enRoute ||
        b.status == BookingStatus.arrived ||
        b.status == BookingStatus.assigned).length;
    final scheduledCount = _allBookings.where((b) =>
        b.status == BookingStatus.requested || b.status == BookingStatus.broadcasting).length;
    final completedCount = _allBookings.where((b) =>
        b.status == BookingStatus.completed || b.status == BookingStatus.settled).length;
    final cancelledCount = _allBookings.where((b) => b.status == BookingStatus.cancelled).length;

    return Scaffold(
      backgroundColor: canvasColor,
      appBar: AppBar(
        backgroundColor: surfaceColor,
        elevation: 0,
        leading: widget.onBack != null
            ? IconButton(
                icon: Icon(Icons.arrow_back_ios_new, size: 20, color: textPrimary),
                onPressed: widget.onBack,
              )
            : null,
        title: Text(
          'My Bookings',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: textPrimary,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.help_outline, color: textSecondary),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Support line available 24/7')),
              );
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(104),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: Container(
                  height: 42,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: TextField(
                    onChanged: (val) => setState(() => _searchQuery = val),
                    style: TextStyle(fontSize: 14, color: textPrimary),
                    decoration: InputDecoration(
                      prefixIcon: Icon(Icons.search, size: 20, color: textSecondary),
                      hintText: 'Search by service, pro, or order ID...',
                      hintStyle: TextStyle(fontSize: 13, color: textSecondary),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ),
              TabBar(
                controller: _tabController,
                isScrollable: true,
                indicatorColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                indicatorWeight: 3,
                labelColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                unselectedLabelColor: textSecondary,
                labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
                tabs: [
                  Tab(text: 'Active ($activeCount)'),
                  Tab(text: 'Scheduled ($scheduledCount)'),
                  Tab(text: 'Completed ($completedCount)'),
                  Tab(text: 'Cancelled ($cancelledCount)'),
                ],
              ),
            ],
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildActiveTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
                _buildScheduledTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
                _buildCompletedTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
                _buildCancelledTab(isDark, surfaceColor, borderColor, textPrimary, textSecondary),
              ],
            ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color textPrimary,
    required Color textSecondary,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: textSecondary.withOpacity(0.35)),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    final activeList = _allBookings.where((b) =>
      b.status == BookingStatus.inProgress ||
      b.status == BookingStatus.enRoute ||
      b.status == BookingStatus.assigned
    ).toList();

    if (activeList.isEmpty) {
      return _buildEmptyState(
        icon: Icons.assignment_outlined,
        title: 'No Active Service Bookings',
        subtitle: 'When you book an on-demand service, real-time dispatch and arrival updates appear here.',
        textPrimary: textPrimary,
        textSecondary: textSecondary,
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: activeList.length,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (context, index) {
        final b = activeList[index];
        return _buildBookingCard(
          bookingId: b.id,
          title: b.serviceTitle,
          category: b.category,
          status: b.status.name.toUpperCase(),
          statusColor: AppColors.dayPrimary,
          techName: b.technicianName.isNotEmpty ? b.technicianName : 'Assigned Technician',
          techRating: 5.0,
          techAvatar: 'assets/images/banner_woman.png',
          eta: b.status == BookingStatus.enRoute ? 'Technician En Route' : 'In Progress',
          totalAmount: b.totalAuthorized > 0 ? b.totalAuthorized : b.basePrice,
          dateText: 'Scheduled',
          isLive: true,
          isDark: isDark,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
          primaryActionText: 'Track Live Radar',
          onPrimaryAction: () {
            if (widget.onTrackLive != null) {
              widget.onTrackLive!(b);
            }
          },
        );
      },
    );
  }

  Widget _buildScheduledTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    final scheduledList = _allBookings.where((b) => b.status == BookingStatus.requested).toList();

    if (scheduledList.isEmpty) {
      return _buildEmptyState(
        icon: Icons.calendar_today_outlined,
        title: 'No Scheduled Bookings',
        subtitle: 'Upcoming booked appointments will appear here.',
        textPrimary: textPrimary,
        textSecondary: textSecondary,
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: scheduledList.length,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (context, index) {
        final b = scheduledList[index];
        return _buildBookingCard(
          bookingId: b.id,
          title: b.serviceTitle,
          category: b.category,
          status: 'CONFIRMED',
          statusColor: AppColors.verifiedEmerald,
          techName: b.technicianName.isNotEmpty ? b.technicianName : 'Technician Pending',
          techRating: 5.0,
          techAvatar: 'assets/images/banner_woman.png',
          eta: 'Scheduled',
          totalAmount: b.totalAuthorized > 0 ? b.totalAuthorized : b.basePrice,
          dateText: 'Upcoming',
          isLive: false,
          isDark: isDark,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
          primaryActionText: 'Modify / Reschedule',
          onPrimaryAction: () {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Reschedule window opened for Booking ${b.id}')),
            );
          },
        );
      },
    );
  }

  Widget _buildCompletedTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    final completedList = _allBookings.where((b) => b.status == BookingStatus.completed).toList();

    if (completedList.isEmpty) {
      return _buildEmptyState(
        icon: Icons.check_circle_outline,
        title: 'No Completed Bookings',
        subtitle: 'Completed service receipts, warranties, and invoices will appear here.',
        textPrimary: textPrimary,
        textSecondary: textSecondary,
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: completedList.length,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (context, index) {
        final b = completedList[index];
        return _buildBookingCard(
          bookingId: b.id,
          title: b.serviceTitle,
          category: b.category,
          status: 'COMPLETED',
          statusColor: AppColors.verifiedEmerald,
          techName: b.technicianName.isNotEmpty ? b.technicianName : 'Certified Pro',
          techRating: 5.0,
          techAvatar: 'assets/images/banner_woman.png',
          eta: 'Completed',
          totalAmount: b.totalAuthorized > 0 ? b.totalAuthorized : b.basePrice,
          dateText: 'Completed',
          isLive: false,
          isDark: isDark,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
          primaryActionText: 'View Invoice / PDF',
          secondaryActionText: 'Re-book Service',
          onPrimaryAction: () {
            if (widget.onViewInvoice != null) {
              widget.onViewInvoice!(b);
            }
          },
          onSecondaryAction: () {
            if (widget.onRebook != null) {
              widget.onRebook!(b);
            }
          },
        );
      },
    );
  }

  Widget _buildCancelledTab(
    bool isDark,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return _buildEmptyState(
      icon: Icons.event_busy,
      title: 'No Cancelled Bookings',
      subtitle: 'You have zero cancelled services.',
      textPrimary: textPrimary,
      textSecondary: textSecondary,
    );
  }

  Widget _buildBookingCard({
    required String bookingId,
    required String title,
    required String category,
    required String status,
    required Color statusColor,
    required String techName,
    required double techRating,
    required String techAvatar,
    required String eta,
    required double totalAmount,
    required String dateText,
    required bool isLive,
    required bool isDark,
    required Color surfaceColor,
    required Color borderColor,
    required Color textPrimary,
    required Color textSecondary,
    required String primaryActionText,
    String? secondaryActionText,
    VoidCallback? onPrimaryAction,
    VoidCallback? onSecondaryAction,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        status,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: statusColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      bookingId,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: textSecondary,
                      ),
                    ),
                  ],
                ),
                Text(
                  '\$${totalAmount.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              category,
              style: TextStyle(
                fontSize: 13,
                color: textSecondary,
              ),
            ),
            const SizedBox(height: 14),
            const Divider(height: 1),
            const SizedBox(height: 14),
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundImage: techAvatar.startsWith('assets/')
                      ? AssetImage(techAvatar) as ImageProvider
                      : NetworkImage(techAvatar),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            techName,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: textPrimary,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.star, size: 14, color: AppColors.ratingAmber),
                          Text(
                            techRating.toString(),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ratingAmber,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        eta,
                        style: TextStyle(
                          fontSize: 12,
                          color: isLive ? AppColors.verifiedEmerald : textSecondary,
                          fontWeight: isLive ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                if (secondaryActionText != null) ...[
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                        side: BorderSide(
                          color: (isDark ? AppColors.nightPrimary : AppColors.dayPrimary).withOpacity(0.5),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: onSecondaryAction,
                      child: Text(
                        secondaryActionText,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: onPrimaryAction,
                    child: Text(
                      primaryActionText,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
