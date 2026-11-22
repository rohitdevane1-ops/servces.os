import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/network/api_client.dart';

class LoginScreen extends StatefulWidget {
  final VoidCallback? onLoginSuccess;
  final VoidCallback? onSelectRole;

  const LoginScreen({
    super.key,
    this.onLoginSuccess,
    this.onSelectRole,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final List<TextEditingController> _totpControllers = List.generate(6, (i) => TextEditingController());
  final List<FocusNode> _totpFocusNodes = List.generate(6, (i) => FocusNode());

  bool _obscurePassword = true;
  bool _isLoading = false;
  bool _isMfaStep = false;
  String? _mfaSessionToken;
  String? _errorMessage;

  bool _isDemoMode = ApiClient.instance.isDemoMode;

  @override
  void initState() {
    super.initState();
    ApiClient.instance.fetchSystemConfig().then((_) {
      if (mounted) {
        setState(() => _isDemoMode = ApiClient.instance.isDemoMode);
      }
    });
  }

  Future<void> _handleDemoLogin(String role) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final res = await ApiClient.instance.demoLogin(role);
      if (!mounted) return;
      if (res['success'] == true) {
        widget.onLoginSuccess?.call();
      } else {
        setState(() {
          _errorMessage = res['error']?['message']?.toString() ?? 'Demo login unavailable';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Demo sandbox login unavailable on this server.';
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    for (var c in _totpControllers) {
      c.dispose();
    }
    for (var f in _totpFocusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || !email.contains('@')) {
      setState(() => _errorMessage = 'Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setState(() => _errorMessage = 'Password must be at least 8 characters');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await ApiClient.instance.login(email, password);
      if (!mounted) return;

                if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>? ?? {};
        if (data['status'] == 'MFA_REQUIRED') {
          setState(() {
            _isMfaStep = true;
            _mfaSessionToken = data['mfaSessionToken']?.toString();
            _isLoading = false;
          });
          _totpFocusNodes[0].requestFocus();
          return;
        }

        final userRole = (data['user']?['role'] ?? '').toString().toUpperCase();
        if (userRole != 'CUSTOMER' && userRole != 'TECHNICIAN') {
          await ApiClient.instance.logout();
          if (!mounted) return;
          setState(() {
            _errorMessage = 'Mobile app supports Customer and Technician accounts only. Please use the Admin Web Portal.';
            _isLoading = false;
          });
          return;
        }

        widget.onLoginSuccess?.call();
      } else {
        setState(() {
          _errorMessage = res['error']?['message']?.toString() ?? 'Invalid credentials';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Authentication failed. Please check your credentials and try again.';
        _isLoading = false;
      });
    }
  }

  Future<void> _handleVerifyMfa() async {
    final code = _totpControllers.map((c) => c.text.trim()).join();
    if (code.length != 6) {
      setState(() => _errorMessage = 'Please enter the complete 6-digit TOTP code');
      return;
    }

    if (_mfaSessionToken == null || _mfaSessionToken!.isEmpty) {
      setState(() => _errorMessage = 'MFA challenge expired. Please sign in again.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await ApiClient.instance.verifyMfa(_mfaSessionToken!, code);
      if (!mounted) return;

      if (res['success'] == true) {
        widget.onLoginSuccess?.call();
      } else {
        setState(() {
          _errorMessage = res['error']?['message']?.toString() ?? 'Verification code invalid or expired';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Verification failed. Please check the code and try again.';
        _isLoading = false;
      });
    }
  }

  Future<void> _handleRestoreSavedSession() async {
    final refresh = await ApiClient.instance.getRefreshToken();
    if (!mounted) return;
    if (refresh == null || refresh.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No saved session found. Please sign in with email and password first.')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await ApiClient.instance.refreshToken();
      if (!mounted) return;

      if (res['success'] == true) {
        widget.onLoginSuccess?.call();
      } else {
        setState(() {
          _errorMessage = 'Saved session expired. Please enter password.';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Session restoration unavailable. Please enter password.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.nightSurface : AppColors.daySurface;
    final textPrimary = isDark ? AppColors.nightTextPrimary : AppColors.dayTextPrimary;
    final textSecondary = isDark ? AppColors.nightTextSecondary : AppColors.dayTextSecondary;
    final primaryBrand = isDark ? AppColors.nightPrimary : AppColors.dayPrimary;
    final accentBrand = isDark ? AppColors.nightAccent : AppColors.dayAccent;
    final borderColor = isDark ? AppColors.nightBorder : AppColors.dayBorder;

    return Scaffold(
      backgroundColor: isDark ? AppColors.nightCanvas : AppColors.dayCanvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          _isMfaStep ? 'Two-Factor Authentication' : 'Sign In',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: textPrimary,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Brand Avatar / Logo Badge
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [primaryBrand, accentBrand],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: primaryBrand.withOpacity(0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(Icons.shield_rounded, color: Colors.white, size: 32),
                  ),
                ),
              ),

              const SizedBox(height: 20),

              Center(
                child: Text(
                  _isMfaStep ? 'Verify 6-Digit Code' : 'Welcome to ServiceOS',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: textPrimary,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  _isMfaStep
                      ? 'Enter the 6-digit TOTP code from your authenticator app'
                      : 'Sign in to access your international home services account',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),

              const SizedBox(height: 24),

              if (_errorMessage != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.red.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.red, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Colors.red, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              if (!_isMfaStep) ...[
                // Email Field
                Text(
                  'EMAIL ADDRESS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: textSecondary,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: surfaceColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderColor),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textPrimary),
                    decoration: InputDecoration(
                      hintText: 'name@example.com',
                      hintStyle: TextStyle(color: textSecondary.withOpacity(0.5), fontSize: 14),
                      icon: Icon(Icons.email_outlined, color: primaryBrand, size: 20),
                      border: InputBorder.none,
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Password Field
                Text(
                  'PASSWORD',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: textSecondary,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: surfaceColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderColor),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: TextField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textPrimary),
                    decoration: InputDecoration(
                      hintText: 'Enter account password',
                      hintStyle: TextStyle(color: textSecondary.withOpacity(0.5), fontSize: 14),
                      icon: Icon(Icons.lock_outline, color: primaryBrand, size: 20),
                      border: InputBorder.none,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          color: textSecondary,
                          size: 18,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                // Saved Session Shortcut
                InkWell(
                  onTap: _handleRestoreSavedSession,
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: primaryBrand.withOpacity(isDark ? 0.12 : 0.06),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: primaryBrand.withOpacity(0.2)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.lock_reset_rounded, color: primaryBrand, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'Quick Sign-In with Saved Session',
                          style: TextStyle(
                            color: primaryBrand,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ] else ...[
                // 6-Digit TOTP Fields
                Text(
                  'AUTHENTICATOR CODE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: textSecondary,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: List.generate(6, (index) {
                    return Container(
                      width: 46,
                      height: 54,
                      decoration: BoxDecoration(
                        color: surfaceColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _totpControllers[index].text.isNotEmpty ? primaryBrand : borderColor,
                          width: _totpControllers[index].text.isNotEmpty ? 2 : 1,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: TextField(
                        controller: _totpControllers[index],
                        focusNode: _totpFocusNodes[index],
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        maxLength: 1,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: primaryBrand,
                        ),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          counterText: '',
                        ),
                        onChanged: (val) {
                          setState(() {});
                          if (val.isNotEmpty && index < 5) {
                            _totpFocusNodes[index + 1].requestFocus();
                          } else if (val.isEmpty && index > 0) {
                            _totpFocusNodes[index - 1].requestFocus();
                          }
                        },
                      ),
                    );
                  }),
                ),

                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {
                      setState(() {
                        _isMfaStep = false;
                        _mfaSessionToken = null;
                        for (var c in _totpControllers) {
                          c.clear();
                        }
                      });
                    },
                    child: Text('← Back to Password', style: TextStyle(color: primaryBrand, fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],

              const SizedBox(height: 28),

              // Submit Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryBrand,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  onPressed: _isLoading ? null : (_isMfaStep ? _handleVerifyMfa : _handleLogin),
                  child: _isLoading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : Text(
                          _isMfaStep ? 'Verify TOTP & Sign In →' : 'Sign In to ServiceOS →',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                        ),
                ),
              ),

              const SizedBox(height: 16),

              if (_isDemoMode && !_isMfaStep) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF10B981).withOpacity(0.35)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'DEMO SANDBOX QUICK ACCESS',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF10B981),
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _isLoading ? null : () => _handleDemoLogin('CUSTOMER'),
                              child: const Text('Demo Customer', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _isLoading ? null : () => _handleDemoLogin('TECHNICIAN'),
                              child: const Text('Demo Technician', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              Center(
                child: TextButton(
                  onPressed: widget.onSelectRole ?? () {},
                  child: Text(
                    'Switch Role: Join as Service Technician Pro',
                    style: TextStyle(
                      color: primaryBrand,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              Center(
                child: Text(
                  'Authoritative Backend Authentication • Encrypted Token Storage',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: textSecondary.withOpacity(0.6),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
