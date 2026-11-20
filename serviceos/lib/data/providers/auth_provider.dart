import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

enum UserRole { customer, technician }

class AuthState {
  final bool isAuthenticated;
  final UserRole role;
  final String phoneNumber;
  final String displayName;
  final bool biometricEnabled;
  final bool isLoading;

  const AuthState({
    this.isAuthenticated = false,
    this.role = UserRole.customer,
    this.phoneNumber = '',
    this.displayName = '',
    this.biometricEnabled = true,
    this.isLoading = false,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    UserRole? role,
    String? phoneNumber,
    String? displayName,
    bool? biometricEnabled,
    bool? isLoading,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      role: role ?? this.role,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      displayName: displayName ?? this.displayName,
      biometricEnabled: biometricEnabled ?? this.biometricEnabled,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  void setRole(UserRole role) {
    state = state.copyWith(
      role: role,
    );
  }

  void setDisplayName(String name) {
    state = state.copyWith(displayName: name);
  }

  void updatePhoneNumber(String phone) {
    state = state.copyWith(phoneNumber: phone);
  }

  /// Verifies a 6-digit TOTP code against the authoritative backend server.
  /// Requires a valid [mfaSessionToken]. Local-only bypass is strictly prohibited.
  Future<bool> verifyOtp(String code, {required String mfaSessionToken}) async {
    final trimmed = code.trim();
    if (trimmed.length != 6 || int.tryParse(trimmed) == null) {
      return false;
    }

    if (mfaSessionToken.trim().isEmpty) {
      return false;
    }

    state = state.copyWith(isLoading: true);
    try {
      final res = await ApiClient.instance.verifyMfa(mfaSessionToken.trim(), trimmed);
      final success = res['success'] == true;
      state = state.copyWith(
        isAuthenticated: success,
        isLoading: false,
      );
      return success;
    } catch (_) {
      state = state.copyWith(
        isAuthenticated: false,
        isLoading: false,
      );
      return false;
    }
  }

  void toggleBiometrics() {
    state = state.copyWith(biometricEnabled: !state.biometricEnabled);
  }

  /// Secure logout: Revokes active session on Fastify backend and wipes all tokens from FlutterSecureStorage
  Future<void> logout() async {
    try {
      await ApiClient.instance.logout();
    } catch (_) {}
    state = state.copyWith(isAuthenticated: false, phoneNumber: '', displayName: '');
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});
