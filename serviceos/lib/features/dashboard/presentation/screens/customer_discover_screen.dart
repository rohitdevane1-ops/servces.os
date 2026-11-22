import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_theme.dart';
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

  List<CategoryItemModel> _categories = [];
  List<ServiceItemModel> _displayedServices = [];
  String _selectedCategorySlug = 'all';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
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
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDarkMode;
    final canvasColor = isDark ? AppColors.nightCanvas : AppColors.dayCanvas;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;

    // Responsive columns calculation
    final screenWidth = MediaQuery.of(context).size.width;
    int crossAxisCount = 1;
    if (screenWidth >= 1024) {
      crossAxisCount = 4; // Desktop matching master mockup
    } else if (screenWidth >= 640) {
      crossAxisCount = 2; // Tablet
    }

    final categoryNames = ['All', ..._categories.map((c) => c.shortTitle)];

    return Scaffold(
      backgroundColor: canvasColor,
      appBar: ServiceOSAppHeader(
        onThemeToggle: widget.onThemeToggle,
        isDarkMode: widget.isDarkMode,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadInitialData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Hero Discovery Banner
                    HeroDiscoveryBanner(
                      searchController: _searchController,
                      onSearch: _onSearch,
                      onFilterTap: () {},
                    ),

                    const SizedBox(height: 12),

                    // 17-Category Horizontal Filter Pill Bar
                    CategoryPillSelector(
                      categories: categoryNames,
                      selectedCategory: _selectedCategorySlug,
                      onSelect: _onCategorySelect,
                    ),

                    const SizedBox(height: 24),

                    // Section Title & Counter
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Text(
                                _selectedCategorySlug.toLowerCase() == 'all'
                                    ? 'Popular Home Services'
                                    : '$_selectedCategorySlug Services',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: textPrimary,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: (isDark ? AppColors.nightPrimary : AppColors.dayPrimary).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '${_displayedServices.length} Pros Available',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: isDark ? AppColors.nightPrimary : AppColors.dayPrimary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            'All Service Zones Active',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Responsive Grid of Curated Service Cards
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          crossAxisSpacing: 16,
                          mainAxisSpacing: 16,
                          childAspectRatio: crossAxisCount == 1 ? 0.95 : 0.85,
                        ),
                        itemCount: _displayedServices.length,
                        itemBuilder: (context, index) {
                          final service = _displayedServices[index];
                          return ServiceCuratedCard(
                            service: service,
                            onBookTap: () {
                              _showBookingSheet(context, service);
                            },
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

  Widget _buildBottomNav(bool isDark) {
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;

    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        border: Border(top: BorderSide(color: borderColor, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(Icons.explore_rounded, 'Discover', true, primaryBrand, textSecondary, () {}),
              _buildNavItem(Icons.calendar_month_rounded, 'Bookings', false, primaryBrand, textSecondary, () => context.push('/customer/my-bookings')),
              _buildNavItem(Icons.chat_bubble_outline_rounded, 'Messages', false, primaryBrand, textSecondary, () => context.push('/common/chat')),
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
