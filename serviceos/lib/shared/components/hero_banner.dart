import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/constants/asset_constants.dart';

class HeroDiscoveryBanner extends StatelessWidget {
  final TextEditingController searchController;
  final ValueChanged<String> onSearch;
  final VoidCallback onFilterTap;
  final double scrollOffset;

  const HeroDiscoveryBanner({
    super.key,
    required this.searchController,
    required this.onSearch,
    required this.onFilterTap,
    this.scrollOffset = 0.0,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;
    final accentBrand = isDark ? AppColors.nightAccent : AppColors.dayAccent;
    final clampedScroll = scrollOffset.clamp(0.0, 140.0);
    final parallaxY = clampedScroll * 0.22;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Main Dark-Indigo Photographic Hero Card
          Container(
            height: 205,
            margin: const EdgeInsets.only(bottom: 24),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(
                colors: [Color(0xFF0B1437), Color(0xFF1E293B), Color(0xFF312E81)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF1E1B4B).withOpacity(isDark ? 0.5 : 0.22),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Right-side Parallax Technician Visual
                  Positioned(
                    right: -8,
                    top: -6,
                    bottom: 0,
                    width: 170,
                    child: Transform.translate(
                      offset: Offset(0, -parallaxY * 0.35),
                      child: Opacity(
                        opacity: 0.92,
                        child: Image.asset(
                          AssetConstants.womanBanner,
                          fit: BoxFit.cover,
                          alignment: Alignment.topCenter,
                          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                        ),
                      ),
                    ),
                  ),

                  // Directional Dark Scrim for High Typography Contrast
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [
                          const Color(0xFF0B1437).withOpacity(0.94),
                          const Color(0xFF0F172A).withOpacity(0.76),
                          Colors.transparent,
                        ],
                        stops: const [0.0, 0.56, 1.0],
                      ),
                    ),
                  ),

                  // Hero Headline & Subtext
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 22, 130, 32),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'Premium\nHome Services',
                          style: TextStyle(
                            fontSize: 25,
                            height: 1.15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Book trusted professionals with confidence',
                          style: TextStyle(
                            fontSize: 12.5,
                            height: 1.35,
                            color: Colors.white.withOpacity(0.84),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Floating Overlapping Pill Search Bar
          Positioned(
            left: 14,
            right: 14,
            bottom: 0,
            child: Container(
              height: 52,
              padding: const EdgeInsets.only(left: 16, right: 6),
              decoration: BoxDecoration(
                color: isDark ? AppColors.nightSurface : Colors.white,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                  color: isDark ? AppColors.nightBorder : AppColors.dayBorder,
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(isDark ? 0.35 : 0.08),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: isDark ? AppColors.nightTextSecondary : const Color(0xFF64748B),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: searchController,
                      onChanged: onSearch,
                      onSubmitted: onSearch,
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search for services...',
                        hintStyle: TextStyle(
                          fontSize: 13,
                          color: isDark ? AppColors.nightTextSecondary : const Color(0xFF94A3B8),
                        ),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => onSearch(searchController.text),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [primaryBrand, accentBrand],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: primaryBrand.withOpacity(0.32),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.arrow_forward_rounded,
                        size: 18,
                        color: Colors.white,
                      ),
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
}
