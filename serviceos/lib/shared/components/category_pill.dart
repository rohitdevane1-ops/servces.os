import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class CategoryPillSelector extends StatelessWidget {
  final List<String> categories;
  final String selectedCategory;
  final ValueChanged<String> onSelect;

  const CategoryPillSelector({
    super.key,
    required this.categories,
    required this.selectedCategory,
    required this.onSelect,
  });

  IconData _iconForCategory(String label) {
    final s = label.toLowerCase();
    if (s == 'all') return Icons.grid_view_rounded;
    if (s.contains('ac') || s.contains('hvac') || s.contains('cool')) return Icons.ac_unit_rounded;
    if (s.contains('plumb')) return Icons.plumbing_rounded;
    if (s.contains('electr')) return Icons.bolt_rounded;
    if (s.contains('clean')) return Icons.cleaning_services_rounded;
    if (s.contains('paint')) return Icons.format_paint_rounded;
    if (s.contains('car') || s.contains('auto')) return Icons.directions_car_rounded;
    if (s.contains('tech') || s.contains('laptop') || s.contains('it')) return Icons.laptop_mac_rounded;
    if (s.contains('move') || s.contains('mov')) return Icons.local_shipping_rounded;
    if (s.contains('beauty') || s.contains('salon')) return Icons.spa_rounded;
    if (s.contains('fit')) return Icons.fitness_center_rounded;
    if (s.contains('tutor')) return Icons.school_rounded;
    return Icons.home_repair_service_rounded;
  }

  Color _tintForIndex(int index) {
    const palette = [
      Color(0xFF0EA5E9),
      Color(0xFF6366F1),
      Color(0xFFF59E0B),
      Color(0xFF10B981),
      Color(0xFF7C3AED),
    ];
    return palette[index % palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final activeColor = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.24 : 0.04),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: SizedBox(
        height: 82,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          itemCount: categories.length,
          separatorBuilder: (_, __) => const SizedBox(width: 14),
          itemBuilder: (context, index) {
            final cat = categories[index];
            final isSelected = cat.toLowerCase() == selectedCategory.toLowerCase();
            final tint = _tintForIndex(index);

            return GestureDetector(
              onTap: () => onSelect(cat),
              child: SizedBox(
                width: 64,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOutCubic,
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: isSelected ? activeColor : tint.withOpacity(isDark ? 0.18 : 0.12),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isSelected ? activeColor : Colors.transparent,
                          width: 2,
                        ),
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: activeColor.withOpacity(0.32),
                                  blurRadius: 10,
                                  offset: const Offset(0, 3),
                                ),
                              ]
                            : null,
                      ),
                      child: Icon(
                        _iconForCategory(cat),
                        size: 22,
                        color: isSelected ? Colors.white : tint,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      cat,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: isSelected
                            ? activeColor
                            : (isDark ? textPrimary : textSecondary),
                        fontSize: 11,
                        fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
