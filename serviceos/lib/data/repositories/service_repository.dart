import '../models/service_model.dart';
import '../../core/network/api_client.dart';

abstract class IServiceRepository {
  Future<List<CategoryItemModel>> getCategories({bool forceRefresh = false});
  Future<List<ServiceItemModel>> getPopularServices();
  Future<List<ServiceItemModel>> getServicesByCategory(String categorySlugOrName);
  Future<List<ServiceItemModel>> searchServices(String query);
}

/// ServiceRepository backed 100% by the authoritative Fastify REST API (/api/v1/services).
class ServiceRepository implements IServiceRepository {
  List<CategoryItemModel>? _cachedCategories;
  List<ServiceItemModel>? _cachedServices;

  @override
  Future<List<CategoryItemModel>> getCategories({bool forceRefresh = false}) async {
    if (!forceRefresh && _cachedCategories != null && _cachedCategories!.isNotEmpty) {
      return _cachedCategories!;
    }

    try {
      final results = await Future.wait([
        ApiClient.instance.fetchCategories(),
        ApiClient.instance.fetchServices(),
      ]);
      final rawCats = results[0];
      final rawSvcs = results[1];

      final allServices = rawSvcs
          .map((r) => ServiceItemModel.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList();
      _cachedServices = allServices;

      if (rawCats.isNotEmpty) {
        _cachedCategories = rawCats.map((row) {
          final m = Map<String, dynamic>.from(row as Map);
          final catId = (m['id'] ?? '').toString();
          final titleStr = (m['name'] ?? m['title'] ?? 'Category').toString();
          final catServices = allServices
              .where((s) =>
                  s.categoryId == catId ||
                  s.category.toLowerCase() == titleStr.toLowerCase())
              .toList();
          return CategoryItemModel(
            id: catId,
            title: titleStr,
            shortTitle: (m['shortTitle'] ?? m['short_title'] ?? titleStr).toString(),
            slug: (m['slug'] ?? '').toString(),
            priority: int.tryParse((m['displayOrder'] ?? m['display_order'] ?? 1).toString()) ?? 1,
            iconName: (m['iconSvg'] ?? m['icon_name'] ?? 'wrench').toString(),
            image: (m['bannerImageUrl'] ?? m['image_url'] ?? 'assets/images/banner_woman.png').toString(),
            totalServices: catServices.isNotEmpty
                ? catServices.length
                : (int.tryParse((m['activeServicesCount'] ?? 0).toString()) ?? 0),
            services: catServices,
          );
        }).toList();
        return _cachedCategories!;
      }
    } catch (_) {}

    return _cachedCategories ?? const [];
  }

  @override
  Future<List<ServiceItemModel>> getPopularServices() async {
    try {
      final apiServices = await ApiClient.instance.fetchServices();
      if (apiServices.isNotEmpty) {
        final mapped = apiServices
            .map((r) => ServiceItemModel.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList();
        _cachedServices = mapped;
        return mapped.take(12).toList();
      }
    } catch (_) {}

    final categories = await getCategories();
    return categories.expand((c) => c.services).take(12).toList();
  }

  @override
  Future<List<ServiceItemModel>> getServicesByCategory(String categorySlugOrName) async {
    final normalized = categorySlugOrName.trim().toLowerCase();
    if (normalized.isEmpty || normalized == 'all') {
      return getPopularServices();
    }

    final categories = await getCategories();
    final matchedCat = categories.where((c) =>
        c.id.toLowerCase() == normalized ||
        c.slug.toLowerCase() == normalized ||
        c.title.toLowerCase() == normalized ||
        c.shortTitle.toLowerCase() == normalized);

    if (matchedCat.isNotEmpty) {
      final cat = matchedCat.first;
      if (cat.services.isNotEmpty) {
        return cat.services;
      }
      try {
        final raw = await ApiClient.instance.fetchServices(categoryId: cat.id);
        return raw
            .map((r) => ServiceItemModel.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList();
      } catch (_) {}
    }

    final services = _cachedServices ?? await getPopularServices();
    return services
        .where((s) => s.category.toLowerCase().contains(normalized))
        .toList();
  }

  @override
  Future<List<ServiceItemModel>> searchServices(String query) async {
    final cleanQuery = query.trim();
    try {
      final remote = await ApiClient.instance.fetchServices(
        search: cleanQuery.isEmpty ? null : cleanQuery,
      );
      if (remote.isNotEmpty) {
        return remote
            .map((r) => ServiceItemModel.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList();
      }
    } catch (_) {}

    final allServices = _cachedServices ?? await getPopularServices();
    if (cleanQuery.isEmpty) return allServices;
    final lower = cleanQuery.toLowerCase();
    return allServices.where((s) {
      return s.name.toLowerCase().contains(lower) ||
          s.category.toLowerCase().contains(lower) ||
          s.description.toLowerCase().contains(lower);
    }).toList();
  }
}
