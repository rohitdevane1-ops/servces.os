import '../models/service_model.dart';
import '../datasources/supabase_remote_datasource.dart';
import '../datasources/local_fixture_datasource.dart';
import '../../core/network/supabase_service.dart';

abstract class IServiceRepository {
  Future<List<CategoryItemModel>> getCategories();
  Future<List<ServiceItemModel>> getPopularServices();
  Future<List<ServiceItemModel>> getServicesByCategory(String categorySlug);
  Future<List<ServiceItemModel>> searchServices(String query);
}

/// ServiceRepository implementation with dual-mode architecture:
/// 1. Queries Free Cloud Supabase when live credentials are provided.
/// 2. Falls back to standard offline service catalogue with zero internal hardcoding when offline or previewing.
class ServiceRepository implements IServiceRepository {
  final ISupabaseRemoteDataSource _remoteDataSource;
  final ILocalFixtureDataSource _fixtureDataSource;
  final SupabaseService _supabaseService;

  ServiceRepository({
    ISupabaseRemoteDataSource? remoteDataSource,
    ILocalFixtureDataSource? fixtureDataSource,
    SupabaseService? supabaseService,
  })  : _remoteDataSource = remoteDataSource ?? SupabaseRemoteDataSource(),
        _fixtureDataSource = fixtureDataSource ?? LocalFixtureDataSource(),
        _supabaseService = supabaseService ?? SupabaseService.instance;

  List<CategoryItemModel>? _cachedCategories;

  @override
  Future<List<CategoryItemModel>> getCategories() async {
    if (_cachedCategories != null && _cachedCategories!.isNotEmpty) {
      return _cachedCategories!;
    }

    // Try Supabase if live connected
    if (_supabaseService.isLiveConnected) {
      try {
        final remote = await _remoteDataSource.fetchCategories();
        if (remote.isNotEmpty) {
          // Map remote rows to CategoryItemModel
          _cachedCategories = remote.map((row) {
            final titleStr = row['title'] as String? ?? (row['name'] as String? ?? 'Category');
            return CategoryItemModel(
              id: row['id'] as String? ?? '',
              title: titleStr,
              shortTitle: row['short_title'] as String? ?? titleStr,
              slug: row['slug'] as String? ?? '',
              priority: row['priority_rank'] as int? ?? (row['display_order'] as int? ?? 1),
              iconName: row['icon_name'] as String? ?? 'wrench',
              image: row['image_url'] as String? ?? 'assets/images/banner_woman.png',
              totalServices: 0,
              services: [], // Populated on drill-down
            );
          }).toList();
          return _cachedCategories!;
        }
      } catch (_) {}
    }

    // Fallback to external demo fixture
    _cachedCategories = await _fixtureDataSource.loadCategories();
    return _cachedCategories!;
  }

  @override
  Future<List<ServiceItemModel>> getPopularServices() async {
    // Try Supabase if live connected
    if (_supabaseService.isLiveConnected) {
      try {
        final remote = await _remoteDataSource.fetchServices();
        if (remote.isNotEmpty) {
          final mapped = remote.map((r) => ServiceItemModel.fromJson(r)).toList();
          final popular = mapped.where((s) => s.popular).toList();
          if (popular.isNotEmpty) return popular;
          return mapped.take(12).toList();
        }
      } catch (_) {}
    }

    final categories = await getCategories();
    final List<ServiceItemModel> popular = [];

    for (final cat in categories) {
      for (final service in cat.services) {
        if (service.popular) {
          popular.add(service);
        }
      }
    }

    if (popular.isNotEmpty) return popular;
    return categories.expand((c) => c.services).take(12).toList();
  }

  @override
  Future<List<ServiceItemModel>> getServicesByCategory(String categorySlug) async {
    if (_supabaseService.isLiveConnected) {
      try {
        final remote = await _remoteDataSource.fetchServices(
          categoryId: categorySlug.toLowerCase() == 'all' ? null : categorySlug,
        );
        if (remote.isNotEmpty) {
          return remote.map((r) => ServiceItemModel.fromJson(r)).toList();
        }
      } catch (_) {}
    }

    final categories = await getCategories();
    if (categories.isEmpty) return [];
    if (categorySlug.toLowerCase() == 'all') {
      return categories.expand((c) => c.services).toList();
    }

    final matched = categories.where(
      (c) => c.slug.toLowerCase() == categorySlug.toLowerCase(),
    );
    if (matched.isEmpty) return [];
    return matched.first.services;
  }

  @override
  Future<List<ServiceItemModel>> searchServices(String query) async {
    final cleanQuery = query.toLowerCase().trim();
    if (_supabaseService.isLiveConnected) {
      try {
        final remote = await _remoteDataSource.fetchServices(search: cleanQuery.isEmpty ? null : cleanQuery);
        if (remote.isNotEmpty) {
          return remote.map((r) => ServiceItemModel.fromJson(r)).toList();
        }
      } catch (_) {}
    }

    final categories = await getCategories();
    final allServices = categories.expand((c) => c.services).toList();

    if (cleanQuery.isEmpty) return allServices;

    return allServices.where((s) {
      return s.name.toLowerCase().contains(cleanQuery) ||
          s.category.toLowerCase().contains(cleanQuery) ||
          s.description.toLowerCase().contains(cleanQuery);
    }).toList();
  }
}
