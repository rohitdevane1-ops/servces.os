class AssetConstants {
  // Brand Assets
  static const String womanBanner = 'assets/images/banner_woman.png';

  // Category & Service Card Photography
  static const String cardPlumbing = 'assets/images/card_plumbing.jpg';
  static const String cardHomeCleaning = 'assets/images/card_home_cleaning.jpg';
  static const String cardLaptop = 'assets/images/card_laptop.jpg';
  static const String cardCarRepair = 'assets/images/card_car_repair.jpg';
  static const String cardBeauty = 'assets/images/card_beauty.jpg';
  static const String cardFitness = 'assets/images/card_fitness.jpg';
  static const String cardMoving = 'assets/images/card_moving.jpg';
  static const String cardTutoring = 'assets/images/card_tutoring.jpg';

  // Fallback Category Mapping
  static String getCategoryImage(String categorySlug) {
    switch (categorySlug.toLowerCase()) {
      case 'plumbing':
        return cardPlumbing;
      case 'cleaning':
      case 'home-cleaning':
        return cardHomeCleaning;
      case 'tech-support':
      case 'computer-repair':
        return cardLaptop;
      case 'car-repair':
      case 'auto-maintenance':
        return cardCarRepair;
      case 'beauty':
      case 'personal-care':
        return cardBeauty;
      case 'fitness':
      case 'personal-training':
        return cardFitness;
      case 'moving':
      case 'relocation':
        return cardMoving;
      case 'tutoring':
      case 'education':
        return cardTutoring;
      default:
        return cardPlumbing;
    }
  }
}
