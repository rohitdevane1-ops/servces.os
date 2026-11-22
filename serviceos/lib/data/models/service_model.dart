class ServiceItemModel {
  final String id;
  final String categoryId;
  final String name;
  final String category;
  final double price;
  final int durationMinutes;
  final double rating;
  final int reviewCount;
  final bool popular;
  final String description;

  const ServiceItemModel({
    required this.id,
    this.categoryId = '',
    required this.name,
    required this.category,
    required this.price,
    required this.durationMinutes,
    required this.rating,
    required this.reviewCount,
    required this.popular,
    required this.description,
  });

  static double _parseNum(dynamic value, [double fallback = 0.0]) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  static int _parseInt(dynamic value, [int fallback = 0]) {
    if (value == null) return fallback;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? fallback;
  }

  factory ServiceItemModel.fromJson(Map<String, dynamic> json) {
    final centsRaw = json['basePriceCents'] ?? json['base_price_cents'];
    final double resolvedPrice = json['price'] != null
        ? _parseNum(json['price'])
        : (centsRaw != null ? _parseNum(centsRaw) / 100.0 : 0.0);

    final String resolvedCategory = (json['categoryName'] ??
            json['category_name'] ??
            json['category'] ??
            (json['service_categories'] is Map ? json['service_categories']['name'] : null) ??
            'General')
        .toString();

    return ServiceItemModel(
      id: (json['id'] ?? '').toString(),
      categoryId: (json['categoryId'] ?? json['category_id'] ?? '').toString(),
      name: (json['name'] ?? json['title'] ?? 'Home Service').toString(),
      category: resolvedCategory,
      price: resolvedPrice,
      durationMinutes: _parseInt(
        json['estimatedDurationMinutes'] ??
            json['estimated_duration_minutes'] ??
            json['durationMinutes'],
        60,
      ),
      rating: _parseNum(json['rating'] ?? json['averageRating'], 4.9),
      reviewCount: _parseInt(json['reviewCount'] ?? json['reviewsCount'], 0),
      popular: (json['popular'] ?? json['isPopular'] ?? json['is_popular']) == true,
      description: (json['description'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'categoryId': categoryId,
      'name': name,
      'category': category,
      'price': price,
      'durationMinutes': durationMinutes,
      'rating': rating,
      'reviewCount': reviewCount,
      'popular': popular,
      'description': description,
    };
  }
}

class CategoryItemModel {
  final String id;
  final String slug;
  final String title;
  final String shortTitle;
  final int priority;
  final String iconName;
  final String image;
  final int totalServices;
  final List<ServiceItemModel> services;

  const CategoryItemModel({
    required this.id,
    required this.slug,
    required this.title,
    required this.shortTitle,
    required this.priority,
    required this.iconName,
    required this.image,
    required this.totalServices,
    required this.services,
  });

  String get name => title;
  String get icon => iconName;
  String get bannerUrl => image;

  factory CategoryItemModel.fromJson(Map<String, dynamic> json) {
    final rawServices = json['services'] as List<dynamic>? ?? [];
    final parsedServices = rawServices
        .map((s) => s is Map<String, dynamic>
            ? ServiceItemModel.fromJson(s)
            : ServiceItemModel.fromJson(Map<String, dynamic>.from(s as Map)))
        .toList();

    final titleVal = (json['title'] ?? json['name'] ?? 'Service Category').toString();
    final shortTitleVal = (json['shortTitle'] ?? json['short_title'] ?? titleVal).toString();

    return CategoryItemModel(
      id: (json['id'] ?? '').toString(),
      slug: (json['slug'] ?? '').toString(),
      title: titleVal,
      shortTitle: shortTitleVal,
      priority: ServiceItemModel._parseInt(
        json['priority'] ?? json['displayOrder'] ?? json['display_order'] ?? json['priority_rank'],
        1,
      ),
      iconName: (json['iconName'] ?? json['iconSvg'] ?? json['icon_name'] ?? 'Wrench').toString(),
      image: (json['image'] ?? json['bannerImageUrl'] ?? json['image_url'] ?? 'assets/images/banner_woman.png')
          .toString(),
      totalServices: ServiceItemModel._parseInt(
        json['totalServices'] ?? json['activeServicesCount'],
        parsedServices.length,
      ),
      services: parsedServices,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'slug': slug,
      'title': title,
      'shortTitle': shortTitle,
      'priority': priority,
      'iconName': iconName,
      'image': image,
      'totalServices': totalServices,
      'services': services.map((s) => s.toJson()).toList(),
    };
  }
}
