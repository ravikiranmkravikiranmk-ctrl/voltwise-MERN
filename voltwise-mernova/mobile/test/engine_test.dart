import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:voltwise_mobile/core/engine.dart';

void main() {
  group('current', () {
    test('three phase textbook value', () {
      // 100 kW, 415 V, pf 0.8 -> 100000 / (1.732 * 415 * 0.8) ~ 173.9 A
      final i = lineCurrent(kw: 100, voltage: 415, powerFactor: 0.8);
      expect(i, closeTo(173.9, 0.1));
      expect(i, closeTo(173.9007, 0.001));
    });

    test('single phase', () {
      expect(lineCurrent(kw: 2.3, voltage: 230, powerFactor: 1.0, phases: 1), closeTo(10.0, 1e-9));
    });

    test('rejects a bad power factor', () {
      expect(() => lineCurrent(kw: 10, voltage: 415, powerFactor: 1.4),
          throwsA(isA<ValidationException>()));
    });
  });

  group('loads', () {
    test('demand and kVAr', () {
      const pump = LoadSpec(name: 'Pump', quantity: 2, ratedKw: 10, powerFactor: 0.8, demandFactor: 0.5);
      expect(pump.connectedKw, 20);
      expect(pump.demandKw, 10);
      expect(pump.demandKvar, closeTo(7.5, 1e-9)); // tan(acos 0.8) = 0.75
    });

    test('summary adds kW and kVAr vectorially', () {
      final s = summarise(const [
        LoadSpec(name: 'Heater', ratedKw: 30, powerFactor: 1.0),
        LoadSpec(name: 'Motor', ratedKw: 40, powerFactor: 0.8),
      ]);
      expect(s.demandKw, closeTo(70, 1e-9));
      expect(s.demandKvar, closeTo(30, 1e-9));
      expect(s.demandKva, closeTo(math.sqrt(70 * 70 + 30 * 30), 1e-9));
      expect(s.overallPf, closeTo(70 / math.sqrt(70 * 70 + 30 * 30), 1e-9));
    });

    test('diversity factor reduces max demand', () {
      final s = summarise(const [LoadSpec(name: 'Lights', ratedKw: 100, powerFactor: 1.0)],
          diversityFactor: 1.25);
      expect(s.maxDemandKva, closeTo(80, 1e-9));
    });

    test('invalid inputs rejected', () {
      expect(() => const LoadSpec(name: 'Bad', ratedKw: 10, powerFactor: 1.2).validate(),
          throwsA(isA<ValidationException>()));
      expect(() => const LoadSpec(name: 'Bad', quantity: 0, ratedKw: 10).validate(),
          throwsA(isA<ValidationException>()));
      expect(() => summarise(const [], diversityFactor: 0.5), throwsA(isA<ValidationException>()));
    });
  });

  group('voltage drop', () {
    test('grows with length', () {
      final short = voltageDropPercent(
          current: 100, lengthM: 50, sizeSqmm: 35, voltage: 415, powerFactor: 0.85);
      final long = voltageDropPercent(
          current: 100, lengthM: 200, sizeSqmm: 35, voltage: 415, powerFactor: 0.85);
      expect(long, closeTo(short * 4, 1e-9));
      expect(short, closeTo(1.2761, 0.001));
    });

    test('one phase drops more than three phase', () {
      final single = voltageDropPercent(
          current: 100, lengthM: 50, sizeSqmm: 35, voltage: 415, powerFactor: 0.85, phases: 1);
      expect(single, closeTo(1.4735, 0.001));
    });
  });

  group('cable sizing', () {
    test('chosen by current for a short run', () {
      final c = selectCable(current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85);
      expect(c.sizeSqmm, 25); // 120 A >= 100 A
      expect(c.limitedBy, 'current');
      expect(c.runs, 1);
    });

    test('upsized for voltage drop on a long run', () {
      final c = selectCable(
          current: 100, lengthM: 400, voltage: 415, powerFactor: 0.85, maxVdPct: 3);
      expect(c.sizeSqmm, 150);
      expect(c.limitedBy, 'voltage drop');
      expect(c.voltageDropPct, lessThanOrEqualTo(3));
    });

    test('derating increases size', () {
      final normal = selectCable(current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85);
      final derated = selectCable(
          current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85, derating: 0.7);
      expect(derated.sizeSqmm, greaterThan(normal.sizeSqmm));
    });

    test('parallel runs for a large current', () {
      final c = selectCable(current: 900, lengthM: 30, voltage: 415, powerFactor: 0.9);
      expect(c.sizeSqmm, 240);
      expect(c.runs, 2);
      expect(c.deratedCapacityA, greaterThanOrEqualTo(900));
    });
  });

  group('transformer sizing', () {
    test('picks the next standard rating', () {
      expect(selectTransformer(maxDemandKva: 300), 500); // 300*1.2/0.8 = 450
      expect(selectTransformer(maxDemandKva: 630, maxLoading: 1.0, futureMargin: 0), 630);
    });
  });

  group('full estimate', () {
    test('sample schedule matches the Python reference', () {
      const settings = EstimatorSettings(
        diversityFactor: 1.15,
        derating: 0.9,
        cableLengthM: 60,
      );
      final report = estimate(loads: sampleLoads, settings: settings);

      expect(report.summary.connectedKw, closeTo(134.0, 0.01));
      expect(report.summary.demandKw, closeTo(87.7, 0.01));
      expect(report.summary.demandKva, closeTo(102.88, 0.01));
      expect(report.summary.overallPf, closeTo(0.852, 0.001));
      expect(report.feederCurrent, closeTo(124.46, 0.2));
      expect(report.cable!.sizeSqmm, 35);
      expect(report.cable!.limitedBy, 'current');
      expect(report.transformer!.kva, 160);
      expect(report.breakdown.length, sampleLoads.length);
    });

    test('empty schedule returns zeroes, not NaN', () {
      final report = estimate(loads: const []);
      expect(report.summary.demandKva, 0);
      expect(report.feederCurrent, 0);
      expect(report.cable, isNull);
      expect(report.transformer, isNull);
    });

    test('warns about a low power factor', () {
      final report = estimate(loads: const [LoadSpec(name: 'Motor', ratedKw: 50, powerFactor: 0.7)]);
      expect(report.warnings.any((w) => w.contains('power factor')), isTrue);
    });
  });
}
