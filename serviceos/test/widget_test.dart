import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serviceos/app.dart';
import 'package:serviceos/data/models/booking_model.dart';
import 'package:serviceos/data/models/service_model.dart';
import 'package:serviceos/data/models/technician_model.dart';

void main() {
  group('ServiceOS Fastify DTO & BIGINT String Parsing Tests', () {
    test('ServiceItemModel parses BIGINT basePriceCents returned as String from PostgreSQL/Fastify', () {
      final json = {
        'id': 'svc-101',
        'categoryId': 'cat-01',
        'name': 'Emergency Pipe Leak Repair',
        'categoryName': 'Plumbing Services',
        'basePriceCents': '14900',
        'estimatedDurationMinutes': '60',
        'isPopular': true,
        'description': 'Rapid diagnostic and pipe solder repair.',
      };

      final model = ServiceItemModel.fromJson(json);
      expect(model.id, 'svc-101');
      expect(model.categoryId, 'cat-01');
      expect(model.category, 'Plumbing Services');
      expect(model.price, 149.00);
      expect(model.durationMinutes, 60);
      expect(model.popular, isTrue);
    });

    test('BookingModel parses BIGINT cents returned as Strings and normalizes statuses', () {
      final json = {
        'id': 'b-501',
        'bookingReference': 'SO-50100',
        'serviceName': 'Seasonal AC Multi-Point Tune-up',
        'categoryName': 'HVAC & Climate Control',
        'quotedPriceCents': '25000',
        'finalPriceCents': '26250',
        'status': 'EN_ROUTE',
        'addressText': 'Downtown Dubai, Boulevard Plaza',
        'customerSafetyPin': '4821',
        'assignedProviderId': 'tech-09',
        'providerName': 'Tariq Al-Mansoor',
        'scheduledStart': '2026-11-22T09:00:00.000Z',
      };

      final booking = BookingModel.fromJson(json);
      expect(booking.id, 'b-501');
      expect(booking.bookingReference, 'SO-50100');
      expect(booking.basePrice, 250.00);
      expect(booking.totalAuthorized, 262.50);
      expect(booking.status, BookingStatus.enRoute);
      expect(booking.safetyPin, '4821');
      expect(booking.technicianName, 'Tariq Al-Mansoor');
    });

    test('TechnicianModel parses BIGINT hourlyRateCents and distanceKm strings cleanly', () {
      final json = {
        'providerId': 'tech-09',
        'fullName': 'Tariq Al-Mansoor',
        'tradeCategory': 'HVAC & Refrigeration',
        'licenseNumber': 'DXB-HVAC-401',
        'averageRating': '4.95',
        'completedJobsCount': '142',
        'dutyStatus': 'ONLINE',
        'isVerified': true,
        'distanceKm': '3.4',
        'hourlyRateCents': '15000',
        'vehicleMakeModel': 'Toyota HiAce Service Van',
        'vehicleLicensePlate': 'DXB A-41892',
      };

      final tech = TechnicianModel.fromJson(json);
      expect(tech.id, 'tech-09');
      expect(tech.name, 'Tariq Al-Mansoor');
      expect(tech.rating, 4.95);
      expect(tech.completedJobs, 142);
      expect(tech.isOnline, isTrue);
      expect(tech.hourlyRate, 150.00);
      expect(tech.distanceMiles, 3.4);
    });
  });

  testWidgets('ServiceOSApp renders SplashScreen cleanly on startup', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: ServiceOSApp(),
      ),
    );
    await tester.pump();

    expect(find.text('ServiceOS'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}
