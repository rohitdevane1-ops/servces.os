import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// ServiceOS — Unified Fastify REST API Client (Dio)
/// Handles JWT token lifecycle, refresh rotation, and tenant isolation
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

  String? _tenantId = const String.fromEnvironment('TENANT_ID', defaultValue: '');

  ApiClient._() {
    _dio = Dio(
      BaseOptions(
        baseUrl: _defaultBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-client-platform': 'flutter',
          if (_tenantId != null && _tenantId!.isNotEmpty && _tenantId != '00000000-0000-0000-0000-000000000001')
            'x-tenant-id': _tenantId!,
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.headers['x-client-platform'] = 'flutter';
          final token = await _storage.read(key: 'serviceos_access_token');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401) {
            final refreshToken = await _storage.read(key: 'serviceos_refresh_token');
            if (refreshToken != null && refreshToken.isNotEmpty) {
              try {
                final refreshResponse = await _dio.post(
                  '/auth/refresh',
                  data: {'refreshToken': refreshToken},
                );

                if (refreshResponse.statusCode == 200 &&
                    refreshResponse.data['success'] == true) {
                  final newAccess = refreshResponse.data['data']['accessToken'];
                  final newRefresh = refreshResponse.data['data']['refreshToken'];

                  await _storage.write(key: 'serviceos_access_token', value: newAccess);
                  await _storage.write(key: 'serviceos_refresh_token', value: newRefresh);

                  // Retry original request with new token
                  final opts = error.requestOptions;
                  opts.headers['Authorization'] = 'Bearer $newAccess';
                  final cloneReq = await _dio.request(
                    opts.path,
                    options: Options(method: opts.method, headers: opts.headers),
                    data: opts.data,
                    queryParameters: opts.queryParameters,
                  );
                  return handler.resolve(cloneReq);
                }
              } catch (_) {
                await _storage.delete(key: 'serviceos_access_token');
                await _storage.delete(key: 'serviceos_refresh_token');
              }
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  void setTenantId(String? tenantId) {
    _tenantId = tenantId;
    if (tenantId != null && tenantId.isNotEmpty && tenantId != '00000000-0000-0000-0000-000000000001') {
      _dio.options.headers['x-tenant-id'] = tenantId;
    } else {
      _dio.options.headers.remove('x-tenant-id');
    }
  }

  Future<String?> getAccessToken() => _storage.read(key: 'serviceos_access_token');
  Future<String?> getRefreshToken() => _storage.read(key: 'serviceos_refresh_token');
  Future<void> logout() => _storage.deleteAll();

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================
  Future<Map<String, dynamic>> login(String email, String password, {String? mfaCode}) async {
    final response = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
      if (mfaCode != null) 'mfaCode': mfaCode,
    });

    if (response.data['success'] == true) {
      final data = response.data['data'] as Map<String, dynamic>?;
      if (data != null) {
        final accessToken = data['accessToken'] ?? data['tokens']?['accessToken'];
        final refreshToken = data['refreshToken'] ?? data['tokens']?['refreshToken'];
        if (accessToken != null) {
          await _storage.write(key: 'serviceos_access_token', value: accessToken.toString());
        }
        if (refreshToken != null) {
          await _storage.write(key: 'serviceos_refresh_token', value: refreshToken.toString());
        }
      }
    }
    return response.data;
  }

  Future<Map<String, dynamic>> verifyMfa(String mfaSessionToken, String totpCode) async {
    final response = await _dio.post('/auth/mfa/verify', data: {
      'mfaSessionToken': mfaSessionToken,
      'totpCode': totpCode,
    });

    if (response.data['success'] == true) {
      final data = response.data['data'] as Map<String, dynamic>?;
      if (data != null) {
        final accessToken = data['accessToken'] ?? data['tokens']?['accessToken'];
        final refreshToken = data['refreshToken'] ?? data['tokens']?['refreshToken'];
        if (accessToken != null) {
          await _storage.write(key: 'serviceos_access_token', value: accessToken.toString());
        }
        if (refreshToken != null) {
          await _storage.write(key: 'serviceos_refresh_token', value: refreshToken.toString());
        }
      }
    }
    return response.data;
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
  }

  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get('/auth/me');
    return response.data;
  }

  /// Refreshes the active session using the persisted refresh token.
  Future<Map<String, dynamic>> refreshToken() async {
    final token = await getRefreshToken();
    if (token == null || token.trim().isEmpty) {
      return {'success': false, 'error': 'No refresh token available'};
    }

    try {
      final response = await _dio.post('/auth/refresh', data: {'refreshToken': token.trim()});
      if (response.data['success'] == true) {
        final data = response.data['data'];
        final newAccess = data['accessToken'] ?? data['tokens']?['accessToken'];
        final newRefresh = data['refreshToken'] ?? data['tokens']?['refreshToken'];
        if (newAccess != null) {
          await _storage.write(key: 'serviceos_access_token', value: newAccess.toString());
        }
        if (newRefresh != null) {
          await _storage.write(key: 'serviceos_refresh_token', value: newRefresh.toString());
        }
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
        return me['data']['user'] as Map<String, dynamic>;
      }
    } catch (_) {
      try {
        final refreshed = await refreshToken();
        if (refreshed['success'] == true) {
          final me = await getMe();
          if (me['success'] == true && me['data']?['user'] != null) {
            return me['data']['user'] as Map<String, dynamic>;
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
    return response.data['data'] ?? [];
  }

  Future<List<dynamic>> fetchServices({String? categoryId, String? search}) async {
    final response = await _dio.get(
      '/services',
      queryParameters: {
        if (categoryId != null) 'categoryId': categoryId,
        if (search != null) 'search': search,
      },
    );
    return response.data['data'] ?? [];
  }

  // ==========================================================================
  // BOOKINGS & DISPATCH
  // ==========================================================================
  Future<Map<String, dynamic>> createBooking(Map<String, dynamic> bookingData) async {
    final response = await _dio.post('/bookings', data: bookingData);
    return response.data['data'] ?? {};
  }

  Future<Map<String, dynamic>> fetchBookingPaymentIntent(String bookingId) async {
    final response = await _dio.get('/bookings/$bookingId/payment-intent');
    return response.data['data'] ?? {};
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
    return response.data['data'] ?? [];
  }

  Future<Map<String, dynamic>> fetchBookingDetails(String bookingId) async {
    final response = await _dio.get('/bookings/$bookingId');
    return response.data['data'] ?? {};
  }

  Future<Map<String, dynamic>> cancelBooking(String bookingId, String reason) async {
    final response = await _dio.post('/bookings/$bookingId/cancel', data: {'reason': reason});
    return response.data['data'] ?? {};
  }

  Future<Map<String, dynamic>> verifyArrivalPin(String bookingId, String safetyPin) async {
    final response = await _dio.post(
      '/bookings/$bookingId/verify-arrival',
      data: {'safetyPin': safetyPin},
    );
    return response.data['data'] ?? {};
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
    return response.data['data'] ?? {};
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
    return response.data['data'] ?? [];
  }

  Future<List<dynamic>> fetchPendingBroadcasts() async {
    final response = await _dio.get('/dispatch/broadcasts/pending');
    return response.data['data'] ?? [];
  }

  Future<Map<String, dynamic>> acceptBroadcast(String broadcastId) async {
    final response = await _dio.post(
      '/dispatch/broadcasts/accept',
      data: {'broadcastId': broadcastId},
    );
    return response.data['data'] ?? {};
  }

  Future<Map<String, dynamic>> declineBroadcast(String broadcastId, {String? reason}) async {
    final response = await _dio.post(
      '/dispatch/broadcasts/decline',
      data: {
        'broadcastId': broadcastId,
        if (reason != null) 'reason': reason,
      },
    );
    return response.data['data'] ?? {};
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
    return response.data['data'] ?? {};
  }

  Future<List<dynamic>> fetchTickets() async {
    final response = await _dio.get('/support/tickets');
    return response.data['data'] ?? [];
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
    return response.data['data'] ?? {};
  }
}
