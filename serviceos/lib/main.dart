import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/network/api_client.dart';
import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize runtime tenant & demo configuration from authoritative Fastify server
  await ApiClient.instance.fetchSystemConfig();

  runApp(
    const ProviderScope(
      child: ServiceOSApp(),
    ),
  );
}
