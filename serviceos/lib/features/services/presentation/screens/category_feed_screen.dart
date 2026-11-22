import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../data/models/service_model.dart';
import '../../../../data/repositories/service_repository.dart';

class CategoryFeedScreen extends StatefulWidget {
  final String categorySlug;
  final ValueChanged<ServiceItemModel> onSelectService;
  final VoidCallback onBack;

  const CategoryFeedScreen({
    super.key,
    required this.categorySlug,
    required this.onSelectService,
    required this.onBack,
  });

  @override
  State<CategoryFeedScreen> createState() => _CategoryFeedScreenState();
}

class _CategoryFeedScreenState extends State<CategoryFeedScreen> {
  final ServiceRepository _repository = ServiceRepository();
  List<ServiceItemModel> _services = [];
  bool _isLoading = true;
  String _selectedSubFilter = 'All';

  final List<String> _subFilters = ['All', 'Emergency', 'Repairs', 'Maintenance', 'Installations'];

  @override
  void initState() {
    super.initState();
    _loadCategoryServices();
  }

  void _loadCategoryServices() async {
    setState(() => _isLoading = true);
    final list = await _repository.getServicesByCategory(widget.categorySlug);
    if (mounted) {
      setState(() {
        _services = list;
        _isLoading = false;
      });
    }
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
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
        title: Text(
          '${widget.categorySlug.toUpperCase()} SERVICES',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Horizontal Subcategory Filters
            Container(
              height: 46,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _subFilters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final filter = _subFilters[index];
                  final isSelected = filter == _selectedSubFilter;

                  return GestureDetector(
                    onTap: () => setState(() => _selectedSubFilter = filter),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected ? primaryBrand : surfaceColor,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isSelected ? primaryBrand : (isDark ? AppColors.nightBorder : AppColors.dayBorder),
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        filter,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected ? Colors.white : textSecondary,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

            const Divider(height: 1),

            // Service Grid List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(
                      builder: (context) {
                        final visibleServices = _selectedSubFilter == 'All'
                            ? _services
                            : _services.where((s) {
                                final q = _selectedSubFilter.toLowerCase();
                                return s.name.toLowerCase().contains(q) ||
                                    s.category.toLowerCase().contains(q) ||
                                    s.description.toLowerCase().contains(q);
                              }).toList();
                        return ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: visibleServices.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final service = visibleServices[index];
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: surfaceColor,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: isDark ? AppColors.nightBorder : AppColors.dayBorder),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          service.name,
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: textPrimary),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          service.description,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 12, color: textSecondary, height: 1.3),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: AppColors.ratingAmber.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(Icons.star, size: 12, color: AppColors.ratingAmber),
                                        const SizedBox(width: 2),
                                        Text(
                                          service.rating.toStringAsFixed(1),
                                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.ratingAmber),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Estimated Rate', style: TextStyle(fontSize: 10, color: textSecondary)),
                                      Text(
                                        '\$${service.price.toStringAsFixed(0)}',
                                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary),
                                      ),
                                    ],
                                  ),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: primaryBrand,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                    ),
                                    onPressed: () => widget.onSelectService(service),
                                    child: const Text('Book Pro →', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
