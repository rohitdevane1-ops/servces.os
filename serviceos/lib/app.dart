import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';

class ServiceOSApp extends StatefulWidget {
  const ServiceOSApp({super.key});

  @override
  State<ServiceOSApp> createState() => _ServiceOSAppState();
}

class _ServiceOSAppState extends State<ServiceOSApp> {
  bool _isDarkMode = false;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = AppRouter.createRouter(
      onThemeToggle: _toggleTheme,
      isDarkModeGetter: () => _isDarkMode,
    );
  }

  void _toggleTheme() {
    setState(() {
      _isDarkMode = !_isDarkMode;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ServiceOS',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dayTheme,
      darkTheme: AppTheme.nightTheme,
      themeMode: _isDarkMode ? ThemeMode.dark : ThemeMode.light,
      routerConfig: _router,
    );
  }
}
