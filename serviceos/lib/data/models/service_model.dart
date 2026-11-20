class ServiceItemModel {
  final String id;
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
    required this.name,
    required this.category,
    required this.price,
    required this.durationMinutes,
    required this.rating,
    required this.reviewCount,
    required this.popular,
    required this.description,
  });

  factory ServiceItemModel.fromJson(Map<String, dynamic> json) {
    return ServiceItemModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Home Service',
      category: json['category'] as String? ?? (json['service_categories'] != null && json['service_categories'] is Map ? (json['service_categories']['name'] as String? ?? 'General') : 'General'),
      price: json['price'] != null ? (json['price'] as num).toDouble() : (json['base_price_cents'] != null ? (json['base_price_cents'] as num).toDouble() / 100.0 : 0.0),
      durationMinutes: json['durationMinutes'] as int? ?? (json['estimated_duration_minutes'] as int? ?? 60),
      rating: (json['rating'] as num?)?.toDouble() ?? 4.8,
      reviewCount: json['reviewCount'] as int? ?? 120,
      popular: json['popular'] as bool? ?? (json['is_popular'] as bool? ?? false),
      description: json['description'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
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

  // Backward compatibility getters
  String get name => title;
  String get icon => iconName;
  String get bannerUrl => image;

  factory CategoryItemModel.fromJson(Map<String, dynamic> json) {
    var rawServices = json['services'] as List<dynamic>? ?? [];
    List<ServiceItemModel> parsedServices = rawServices
        .map((s) => s is Map<String, dynamic> ? ServiceItemModel.fromJson(s) : ServiceItemModel.fromJson(Map<String, dynamic>.from(s as Map)))
        .toList();

    final titleVal = json['title'] as String? ?? (json['name'] as String? ?? 'Service Category');
    final shortTitleVal = json['shortTitle'] as String? ?? (json['short_title'] as String? ?? titleVal);

    return CategoryItemModel(
      id: json['id'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      title: titleVal,
      shortTitle: shortTitleVal,
      priority: json['priority'] as int? ?? (json['display_order'] as int? ?? (json['priority_rank'] as int? ?? 1)),
      iconName: json['iconName'] as String? ?? (json['icon_name'] as String? ?? 'Wrench'),
      image: json['image'] as String? ?? (json['image_url'] as String? ?? 'assets/images/banner_woman.png'),
      totalServices: json['totalServices'] as int? ?? parsedServices.length,
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
