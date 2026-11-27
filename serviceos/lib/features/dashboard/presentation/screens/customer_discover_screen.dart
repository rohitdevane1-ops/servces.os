import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/motion_primitives.dart';
import '../../../../data/models/service_model.dart';
import '../../../../data/repositories/service_repository.dart';
import '../../../../shared/components/app_header.dart';
import '../../../../shared/components/hero_banner.dart';
import '../../../../shared/components/category_pill.dart';
import '../../../../shared/components/service_card.dart';
import '../../../../shared/components/trust_strip.dart';

class CustomerDiscoverScreen extends StatefulWidget {
  final VoidCallback onThemeToggle;
  final bool isDarkMode;

  const CustomerDiscoverScreen({
    super.key,
    required this.onThemeToggle,
    required this.isDarkMode,
  });

  @override
  State<CustomerDiscoverScreen> createState() => _CustomerDiscoverScreenState();
}

class _CustomerDiscoverScreenState extends State<CustomerDiscoverScreen> {
  final ServiceRepository _repository = ServiceRepository();
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  List<CategoryItemModel> _categories = [];
  List<ServiceItemModel> _displayedServices = [];
  String _selectedCategorySlug = 'all';
  bool _isLoading = true;
  double _scrollOffset = 0.0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadInitialData();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final nextOffset = _scrollController.offset.clamp(0.0, 160.0);
    if ((nextOffset - _scrollOffset).abs() >= 1.5) {
      setState(() => _scrollOffset = nextOffset);
    }
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    final categories = await _repository.getCategories();
    final popularServices = await _repository.getPopularServices();

    if (mounted) {
      setState(() {
        _categories = categories;
        _displayedServices = popularServices.isNotEmpty
            ? popularServices
            : categories.expand((c) => c.services).take(12).toList();
        _isLoading = false;
      });
    }
  }

  void _onCategorySelect(String categoryName) async {
    setState(() {
      _selectedCategorySlug = categoryName;
      _isLoading = true;
    });

    List<ServiceItemModel> services;
    if (categoryName.toLowerCase() == 'all') {
      services = await _repository.getPopularServices();
    } else {
      services = await _repository.getServicesByCategory(categoryName);
    }

    if (mounted) {
      setState(() {
        _displayedServices = services;
        _isLoading = false;
      });
    }
  }

  void _onSearch(String query) async {
    if (query.trim().isEmpty) {
      _onCategorySelect(_selectedCategorySlug);
      return;
    }

    final results = await _repository.searchServices(query);
    if (mounted) {
      setState(() {
        _displayedServices = results;
      });
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDarkMode;
    final canvasColor = isDark ? AppColors.nightCanvas : AppColors.dayCanvas;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;

    // Responsive columns calculation (2-col on mobile matching mockup, up to 4-col on desktop)
    final screenWidth = MediaQuery.of(context).size.width;
    int crossAxisCount = 2;
    if (screenWidth >= 1024) {
      crossAxisCount = 4;
    } else if (screenWidth >= 680) {
      crossAxisCount = 3;
    }

    final categoryNames = ['All', ..._categories.map((c) => c.shortTitle)];

    return Scaffold(
      backgroundColor: canvasColor,
      appBar: ServiceOSAppHeader(
        onThemeToggle: widget.onThemeToggle,
        isDarkMode: widget.isDarkMode,
      ),
      body: _isLoading
          ? _buildLoadingSkeleton(isDark, crossAxisCount)
          : RefreshIndicator(
              onRefresh: _loadInitialData,
              child: SingleChildScrollView(
                controller: _scrollController,
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Hero Discovery Banner with Scroll-Linked Parallax
                    HeroDiscoveryBanner(
                      searchController: _searchController,
                      onSearch: _onSearch,
                      onFilterTap: () {},
                      scrollOffset: _scrollOffset,
                    ),

                    const SizedBox(height: 12),

                    // 17-Category Horizontal Filter Pill Bar
                    CategoryPillSelector(
                      categories: categoryNames,
                      selectedCategory: _selectedCategorySlug,
                      onSelect: _onCategorySelect,
                    ),

                    const SizedBox(height: 24),

                    // Section Title & View All Action
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: AnimatedSectionHeader(
                        title: _selectedCategorySlug.toLowerCase() == 'all'
                            ? 'Popular Services'
                            : '$_selectedCategorySlug Services',
                        actionLabel: 'View All',
                        onActionTap: () => _onCategorySelect('all'),
                        titleColor: textPrimary,
                        actionColor: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Responsive Grid of Curated Service Cards with Staggered Reveal
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          crossAxisSpacing: 14,
                          mainAxisSpacing: 14,
                          childAspectRatio: crossAxisCount == 2 ? 0.72 : 0.82,
                        ),
                        itemCount: _displayedServices.length,
                        itemBuilder: (context, index) {
                          final service = _displayedServices[index];
                          return ScrollRevealItem(
                            index: index,
                            child: ServiceCuratedCard(
                              service: service,
                              onBookTap: () {
                                _showBookingSheet(context, service);
                              },
                            ),
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Bottom Trust Verification Strip
                    TrustVerificationStrip(
                      onViewAllTap: () {
                        _onCategorySelect('all');
                      },
                    ),

                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ),
      bottomNavigationBar: _buildBottomNav(isDark),
    );
  }

  Widget _buildLoadingSkeleton(bool isDark, int crossAxisCount) {
    final baseColor = isDark ? AppColors.nightSurface : const Color(0xFFE2E8F0);
    final cardColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 205,
            decoration: BoxDecoration(
              color: baseColor.withOpacity(isDark ? 0.9 : 0.6),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: borderColor),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            height: 98,
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderColor),
            ),
          ),
          const SizedBox(height: 24),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: crossAxisCount,
              crossAxisSpacing: 14,
              mainAxisSpacing: 14,
              childAspectRatio: crossAxisCount == 2 ? 0.72 : 0.82,
            ),
            itemCount: crossAxisCount * 2,
            itemBuilder: (_, __) => Container(
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AspectRatio(
                    aspectRatio: 16 / 10,
                    child: Container(
                      decoration: BoxDecoration(
                        color: baseColor.withOpacity(isDark ? 0.8 : 0.6),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(height: 14, width: 120, color: baseColor.withOpacity(0.5)),
                        const SizedBox(height: 8),
                        Container(height: 11, width: double.infinity, color: baseColor.withOpacity(0.35)),
                        const SizedBox(height: 6),
                        Container(height: 11, width: 80, color: baseColor.withOpacity(0.35)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav(bool isDark) {
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;
    final accentBrand = isDark ? AppColors.nightAccent : AppColors.dayAccent;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;

    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        border: Border(top: BorderSide(color: borderColor, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.35 : 0.05),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(Icons.home_rounded, 'Home', true, primaryBrand, textSecondary, () {}),
              _buildNavItem(Icons.calendar_month_rounded, 'Bookings', false, primaryBrand, textSecondary, () => context.push('/customer/my-bookings')),
              // Center Elevated Search FAB
              GestureDetector(
                onTap: () => context.push('/customer/search'),
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [primaryBrand, accentBrand],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: primaryBrand.withOpacity(0.38),
                        blurRadius: 14,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.search_rounded, color: Colors.white, size: 22),
                ),
              ),
              _buildNavItem(Icons.notifications_none_rounded, 'Messages', false, primaryBrand, textSecondary, () => context.push('/common/chat')),
              _buildNavItem(Icons.person_outline_rounded, 'Profile', false, primaryBrand, textSecondary, () => context.push('/customer/profile')),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(IconData icon, String label, bool isActive, Color activeColor, Color inactiveColor, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 22, color: isActive ? activeColor : inactiveColor),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive ? activeColor : inactiveColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showBookingSheet(BuildContext context, ServiceItemModel service) {
    // Interactive bottom sheet preview
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final isDark = widget.isDarkMode;
        final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
        final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;

        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                service.name,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Starting at \$${service.price.toStringAsFixed(0)} • Upfront Escrow Protection',
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.dayPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                service.description,
                style: TextStyle(
                  fontSize: 13,
                  color: isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.dayPrimary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: () {
                    Navigator.pop(ctx);
                    context.push('/customer/booking-wizard', extra: service);
                  },
                  child: const Text(
                    'Proceed to Scheduling & Dispatch',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
