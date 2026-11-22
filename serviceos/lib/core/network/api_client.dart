import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// ServiceOS — Unified Fastify REST API Client (Dio)
/// Handles JWT token lifecycle, refresh rotation, tenant config, and demo sandbox isolation.
class ApiClient {
  static ApiClient? _instance;
  static ApiClient get instance => _instance ??= ApiClient._();

  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const String _defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: kIsWeb
        ? 'http://localhost:3000/api/v1'
        : 'http://10.0.2.2:3000/api/v1',
  );

  static const bool _compiledDemoMode = bool.fromEnvironment('DEMO_MODE', defaultValue: false);

  String? _tenantId = const String.fromEnvironment('TENANT_ID', defaultValue: '');
  Future<String?>? _refreshInFlight;

  bool _isDemoMode = _compiledDemoMode;
  String _currencyCode = 'AED';
  String _currencySymbol = 'AED ';
  String _distanceUnit = 'km';
  double _vatPercent = 5.0;
  String _taxName = 'VAT';

  bool get isDemoMode => _isDemoMode;
  String get currencyCode => _currencyCode;
  String get currencySymbol => _currencySymbol;
  String get distanceUnit => _distanceUnit;
  double get vatPercent => _vatPercent;
  String get taxName => _taxName;

  String formatCurrency(num amount) {
    final safe = amount.isFinite ? amount.toDouble() : 0.0;
    final symbol = _currencySymbol.trim();
    if (symbol == '\$' || symbol == '€' || symbol == '£' || symbol == '₹') {
      return '$symbol${safe.toStringAsFixed(2)}';
    }
    return '${_currencyCode.trim()} ${safe.toStringAsFixed(2)}';
  }

  ApiClient._() {
    if (kReleaseMode && !_defaultBaseUrl.startsWith('https://')) {
      throw StateError('API_BASE_URL must use HTTPS in release builds (got: $_defaultBaseUrl)');
    }
    _dio = Dio(
      BaseOptions(
        baseUrl: _defaultBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Accept': 'application/json',
          'x-client-platform': 'flutter',
          if (_tenantId != null && _tenantId!.isNotEmpty)
            'x-tenant-id': _tenantId!,
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.headers['x-client-platform'] = 'flutter';
          if (options.data != null && options.data is! FormData) {
            options.headers['Content-Type'] = 'application/json';
          } else {
            options.headers.remove('Content-Type');
          }
          final token = await _storage.read(key: 'serviceos_access_token');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final reqPath = error.requestOptions.path;
          final alreadyRetried = error.requestOptions.extra['_retried'] == true;
          if (error.response?.statusCode == 401 &&
              !alreadyRetried &&
              reqPath != '/auth/refresh' &&
              reqPath != '/auth/login' &&
              reqPath != '/auth/demo-login') {
            final newAccess = await (_refreshInFlight ??= _performSingleFlightRefresh());
            _refreshInFlight = null;
            if (newAccess != null && newAccess.isNotEmpty) {
              final opts = error.requestOptions;
              opts.headers['Authorization'] = 'Bearer $newAccess';
              opts.extra['_retried'] = true;
              final cloneReq = await _dio.request(
                opts.path,
                options: Options(method: opts.method, headers: opts.headers, extra: opts.extra),
                data: opts.data,
                queryParameters: opts.queryParameters,
              );
              return handler.resolve(cloneReq);
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<String?> _performSingleFlightRefresh() async {
    final refreshToken = await _storage.read(key: 'serviceos_refresh_token');
    if (refreshToken == null || refreshToken.isEmpty) return null;
    try {
      final refreshResponse = await _dio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'_retried': true}),
      );
      final respData = refreshResponse.data is Map ? refreshResponse.data['data'] : null;
      final tokensObj = respData is Map && respData['tokens'] is Map ? respData['tokens'] : respData;
      final newAccess = tokensObj is Map ? tokensObj['accessToken']?.toString() : null;
      final newRefresh = tokensObj is Map ? tokensObj['refreshToken']?.toString() : null;
      if (refreshResponse.statusCode == 200 &&
          refreshResponse.data['success'] == true &&
          newAccess != null &&
          newAccess.isNotEmpty) {
        await _storage.write(key: 'serviceos_access_token', value: newAccess);
        if (newRefresh != null && newRefresh.isNotEmpty) {
          await _storage.write(key: 'serviceos_refresh_token', value: newRefresh);
        }
        return newAccess;
      }
    } catch (_) {
      await _storage.delete(key: 'serviceos_access_token');
      await _storage.delete(key: 'serviceos_refresh_token');
      await _storage.delete(key: 'serviceos_user_role');
    }
    return null;
  }

  void setTenantId(String? tenantId) {
    _tenantId = tenantId;
    if (tenantId != null && tenantId.isNotEmpty) {
      _dio.options.headers['x-tenant-id'] = tenantId;
    } else {
      _dio.options.headers.remove('x-tenant-id');
    }
  }

  Future<String?> getAccessToken() => _storage.read(key: 'serviceos_access_token');
  Future<String?> getRefreshToken() => _storage.read(key: 'serviceos_refresh_token');
  Future<String?> getSavedUserRole() => _storage.read(key: 'serviceos_user_role');

  Future<void> _saveAuthPayload(Map<String, dynamic>? data) async {
    if (data == null) return;
    final accessToken = data['accessToken'] ?? (data['tokens'] is Map ? data['tokens']['accessToken'] : null);
    final refreshToken = data['refreshToken'] ?? (data['tokens'] is Map ? data['tokens']['refreshToken'] : null);
    final userObj = data['user'] is Map ? data['user'] as Map : null;
    final role = userObj?['role']?.toString();
    final tenant = userObj?['tenantId']?.toString() ?? data['tenantId']?.toString();

    if (accessToken != null) {
      await _storage.write(key: 'serviceos_access_token', value: accessToken.toString());
    }
    if (refreshToken != null) {
      await _storage.write(key: 'serviceos_refresh_token', value: refreshToken.toString());
    }
    if (role != null && role.isNotEmpty) {
      await _storage.write(key: 'serviceos_user_role', value: role.toUpperCase());
    }
    if (tenant != null && tenant.isNotEmpty) {
      setTenantId(tenant);
    }
  }

  // ==========================================================================
  // SYSTEM RUNTIME & TENANT CONFIG
  // ==========================================================================
  Future<Map<String, dynamic>> fetchSystemConfig() async {
    try {
      final response = await _dio.get('/system/config');
      if (response.data is Map && response.data['success'] == true) {
        final data = Map<String, dynamic>.from(response.data['data'] as Map? ?? {});
        if (data['demoMode'] is bool) {
          _isDemoMode = _compiledDemoMode || (data['demoMode'] as bool);
        }
        final tenant = data['tenant'] is Map ? Map<String, dynamic>.from(data['tenant'] as Map) : null;
        if (tenant != null) {
          _currencyCode = (tenant['currencyCode'] ?? data['defaultCurrency'] ?? 'AED').toString();
          _currencySymbol = (tenant['currencySymbol'] ?? '$_currencyCode ').toString();
          _distanceUnit = (tenant['distanceUnit'] ?? data['defaultDistanceUnit'] ?? 'km').toString();
          _taxName = (tenant['taxName'] ?? data['defaultTaxName'] ?? 'VAT').toString();
          final vatVal = tenant['vatPercent'] ?? data['defaultVatPercent'];
          if (vatVal != null) {
            _vatPercent = double.tryParse(vatVal.toString()) ?? 5.0;
          }
        }
        return data;
      }
    } catch (_) {}
    return {};
  }

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================
  Future<Map<String, dynamic>> login(String email, String password, {String? mfaCode}) async {
    final response = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
      if (mfaCode != null) 'mfaCode': mfaCode,
    });

    if (response.data is Map && response.data['success'] == true) {
      final data = response.data['data'] is Map
          ? Map<String, dynamic>.from(response.data['data'] as Map)
          : null;
      await _saveAuthPayload(data);
    }
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> demoLogin(String role) async {
    final normalizedRole = role.toUpperCase() == 'TECHNICIAN' ? 'TECHNICIAN' : 'CUSTOMER';
    final response = await _dio.post('/auth/demo-login', data: {
      'role': normalizedRole,
    });
    if (response.data is Map && response.data['success'] == true) {
      final data = response.data['data'] is Map
          ? Map<String, dynamic>.from(response.data['data'] as Map)
          : null;
      await _saveAuthPayload(data);
    }
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> verifyMfa(String mfaSessionToken, String totpCode) async {
    final response = await _dio.post('/auth/mfa/verify', data: {
      'mfaSessionToken': mfaSessionToken,
      'totpCode': totpCode,
    });

    if (response.data is Map && response.data['success'] == true) {
      final data = response.data['data'] is Map
          ? Map<String, dynamic>.from(response.data['data'] as Map)
          : null;
      await _saveAuthPayload(data);
    }
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> verifyMfaRecovery(String mfaSessionToken, String backupCode) async {
    final response = await _dio.post('/auth/mfa/recovery', data: {
      'mfaSessionToken': mfaSessionToken,
      'backupCode': backupCode,
    });

    if (response.data is Map && response.data['success'] == true) {
      final data = response.data['data'] is Map
          ? Map<String, dynamic>.from(response.data['data'] as Map)
          : null;
      await _saveAuthPayload(data);
    }
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> logout() async {
    final refreshToken = await _storage.read(key: 'serviceos_refresh_token');
    if (refreshToken != null) {
      try {
        await _dio.post('/auth/logout', data: {'refreshToken': refreshToken});
      } catch (_) {}
    }
    await _storage.delete(key: 'serviceos_access_token');
    await _storage.delete(key: 'serviceos_refresh_token');
    await _storage.delete(key: 'serviceos_user_role');
  }

  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get('/auth/me');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> getPaymentIntent(String bookingId) async {
    final response = await _dio.get('/bookings/$bookingId/payment-intent');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> confirmPayment(String bookingId) async {
    final response = await _dio.post('/bookings/$bookingId/confirm-payment', data: {});
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> refreshToken() async {
    final token = await getRefreshToken();
    if (token == null || token.trim().isEmpty) {
      return {'success': false, 'error': 'No refresh token available'};
    }

    try {
      final response = await _dio.post('/auth/refresh', data: {'refreshToken': token.trim()});
      if (response.data is Map && response.data['success'] == true) {
        final data = response.data['data'] is Map
            ? Map<String, dynamic>.from(response.data['data'] as Map)
            : null;
        await _saveAuthPayload(data);
        return {'success': true, 'data': data};
      }
      return {'success': false, 'error': response.data['error']};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> validateSession() async {
    final token = await getAccessToken();
    if (token == null || token.isEmpty) {
      final refresh = await getRefreshToken();
      if (refresh != null && refresh.isNotEmpty) {
        final refreshed = await refreshToken();
        if (refreshed['success'] != true) {
          await logout();
          return null;
        }
      } else {
        return null;
      }
    }

    try {
      final me = await getMe();
      if (me['success'] == true && me['data']?['user'] != null) {
        final userMap = Map<String, dynamic>.from(me['data']['user'] as Map);
        final role = (userMap['role'] ?? '').toString().toUpperCase();
        // GEMINI.md Rule 1: Strictly 2 Mobile Personas (CUSTOMER & TECHNICIAN only).
        if (role != 'CUSTOMER' && role != 'TECHNICIAN') {
          await logout();
          return null;
        }
        await _storage.write(key: 'serviceos_user_role', value: role);
        return userMap;
      }
    } catch (_) {
      try {
        final refreshed = await refreshToken();
        if (refreshed['success'] == true) {
          final me = await getMe();
          if (me['success'] == true && me['data']?['user'] != null) {
            final userMap = Map<String, dynamic>.from(me['data']['user'] as Map);
            final role = (userMap['role'] ?? '').toString().toUpperCase();
            if (role != 'CUSTOMER' && role != 'TECHNICIAN') {
              await logout();
              return null;
            }
            await _storage.write(key: 'serviceos_user_role', value: role);
            return userMap;
          }
        }
      } catch (_) {}
      await logout();
    }
    return null;
  }

  // ==========================================================================
  // CATALOG & SERVICES
  // ==========================================================================
  Future<List<dynamic>> fetchCategories() async {
    final response = await _dio.get('/services/categories');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<List<dynamic>> fetchServices({String? categoryId, String? search}) async {
    final response = await _dio.get(
      '/services',
      queryParameters: {
        if (categoryId != null && categoryId.isNotEmpty && categoryId.toLowerCase() != 'all')
          'categoryId': categoryId,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      },
    );
    return response.data['data'] as List<dynamic>? ?? [];
  }

  // ==========================================================================
  // BOOKINGS & DISPATCH
  // ==========================================================================
  Future<Map<String, dynamic>> createBooking(Map<String, dynamic> bookingData) async {
    final response = await _dio.post('/bookings', data: bookingData);
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> fetchBookingPaymentIntent(String bookingId) async {
    final response = await _dio.get('/bookings/$bookingId/payment-intent');
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> waitForPaymentIntentAndConfirm(
    String bookingId, {
    int maxAttempts = 10,
    Duration pollDelay = const Duration(milliseconds: 500),
  }) async {
    for (int i = 0; i < maxAttempts; i++) {
      try {
        final intent = await fetchBookingPaymentIntent(bookingId);
        final outboxStatus = (intent['outboxStatus'] ?? '').toString().toUpperCase();
        final piId = intent['paymentIntentId']?.toString() ?? '';
        if (piId.isNotEmpty || outboxStatus == 'COMPLETED') {
          break;
        }
        if (outboxStatus == 'FAILED' || (intent['status']?.toString().toUpperCase() == 'FAILED')) {
          throw Exception(intent['error']?.toString() ?? 'Payment pre-authorization failed');
        }
      } catch (_) {
        if (i == maxAttempts - 1) rethrow;
      }
      await Future.delayed(pollDelay);
    }
    return confirmPayment(bookingId);
  }

  Future<List<dynamic>> fetchBookings({String? status, int page = 1, int limit = 20}) async {
    final response = await _dio.get(
      '/bookings',
      queryParameters: {
        if (status != null) 'status': status,
        'page': page,
        'limit': limit,
      },
    );
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<Map<String, dynamic>> fetchBookingDetails(String bookingId) async {
    final response = await _dio.get('/bookings/$bookingId');
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> cancelBooking(String bookingId, String reason) async {
    final response = await _dio.post('/bookings/$bookingId/cancel', data: {'reason': reason});
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> verifyArrivalPin(String bookingId, String safetyPin) async {
    final response = await _dio.post(
      '/bookings/$bookingId/verify-arrival',
      data: {'safetyPin': safetyPin},
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> completeWorkOrder(
    String bookingId, {
    List<String> beforePhotos = const [],
    List<String> afterPhotos = const [],
    String? customerSignatureUrl,
    String? workSummaryNotes,
  }) async {
    final response = await _dio.post(
      '/bookings/$bookingId/complete',
      data: {
        'beforePhotos': beforePhotos,
        'afterPhotos': afterPhotos,
        if (customerSignatureUrl != null) 'customerSignatureUrl': customerSignatureUrl,
        if (workSummaryNotes != null) 'workSummaryNotes': workSummaryNotes,
      },
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  // ==========================================================================
  // MEDIA UPLOAD (BEFORE/AFTER PHOTOS & SIGNATURES)
  // ==========================================================================
  Future<String?> uploadMediaBytes(Uint8List bytes, String filename, {String mimeType = 'image/png'}) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
      ),
    });
    final response = await _dio.post('/uploads', data: formData);
    if (response.data is Map && response.data['success'] == true) {
      final data = response.data['data'] as Map?;
      return data?['url']?.toString();
    }
    return null;
  }

  // ==========================================================================
  // DISPATCH RADAR & BROADCASTS (TECHNICIAN ROLE)
  // ==========================================================================
  Future<List<dynamic>> fetchRadarTechnicians({
    required double latitude,
    required double longitude,
    double radiusKm = 25.0,
    String? tradeCategory,
  }) async {
    final response = await _dio.get(
      '/dispatch/radar',
      queryParameters: {
        'latitude': latitude,
        'longitude': longitude,
        'radiusKm': radiusKm,
        if (tradeCategory != null) 'tradeCategory': tradeCategory,
      },
    );
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<List<dynamic>> fetchPendingBroadcasts() async {
    final response = await _dio.get('/dispatch/broadcasts/pending');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<Map<String, dynamic>> acceptBroadcast(String broadcastId) async {
    final response = await _dio.post(
      '/dispatch/broadcasts/accept',
      data: {'broadcastId': broadcastId},
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<Map<String, dynamic>> declineBroadcast(String broadcastId, {String? reason}) async {
    final response = await _dio.post(
      '/dispatch/broadcasts/decline',
      data: {
        'broadcastId': broadcastId,
        if (reason != null) 'reason': reason,
      },
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  // ==========================================================================
  // TELEMETRY & LOCATION (TECHNICIAN MOBILE GPS)
  // ==========================================================================
  Future<void> sendLocationPing({
    required double latitude,
    required double longitude,
    double? headingDegrees,
    String? dutyStatus,
  }) async {
    await _dio.post(
      '/crm/technicians/location-ping',
      data: {
        'latitude': latitude,
        'longitude': longitude,
        if (headingDegrees != null) 'headingDegrees': headingDegrees,
        if (dutyStatus != null) 'dutyStatus': dutyStatus,
      },
    );
  }

  Future<void> updateDutyStatus(String dutyStatus) async {
    await _dio.put(
      '/crm/technicians/duty-status',
      data: {'dutyStatus': dutyStatus},
    );
  }

  Future<Map<String, dynamic>> fetchTechnicianEarnings() async {
    final response = await _dio.get('/crm/technicians/me/earnings');
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  // ==========================================================================
  // REVIEWS & SUPPORT
  // ==========================================================================
  Future<Map<String, dynamic>> submitReview({
    required String bookingId,
    required int rating,
    String? comment,
  }) async {
    final response = await _dio.post(
      '/support/reviews',
      data: {
        'bookingId': bookingId,
        'rating': rating,
        if (comment != null) 'comment': comment,
      },
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }

  Future<List<dynamic>> fetchTickets() async {
    final response = await _dio.get('/support/tickets');
    return response.data['data'] as List<dynamic>? ?? [];
  }

  Future<Map<String, dynamic>> openSupportTicket({
    required String subject,
    required String initialMessage,
    String category = 'General Support',
    String priority = 'NORMAL',
    String? bookingId,
  }) async {
    final response = await _dio.post(
      '/support/tickets',
      data: {
        'subject': subject,
        'category': category,
        'priority': priority,
        'initialMessage': initialMessage,
        if (bookingId != null) 'bookingId': bookingId,
      },
    );
    return Map<String, dynamic>.from((response.data['data'] ?? {}) as Map);
  }
}
