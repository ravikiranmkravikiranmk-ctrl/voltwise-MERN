// Standalone verification of the Dart engine against the Python golden values.
// Run: dart tool/verify_engine.dart   (no packages required)
import 'dart:math' as math;

import '../lib/core/engine.dart';
import '../lib/core/format.dart';

int failures = 0;

void check(String label, Object? actual, Object? expected, {double tol = 1e-9}) {
  bool ok;
  if (actual is num && expected is num) {
    ok = (actual - expected).abs() <= tol;
  } else {
    ok = actual == expected;
  }
  if (!ok) {
    failures++;
    print('FAIL $label: got $actual, expected $expected');
  } else {
    print('ok   $label');
  }
}

void main() {
  // current
  check('3ph current', lineCurrent(kw: 100, voltage: 415, powerFactor: 0.8), 173.9007, tol: 0.001);
  check('1ph current', lineCurrent(kw: 2.3, voltage: 230, powerFactor: 1.0, phases: 1), 10.0);

  // loads
  const pump = LoadSpec(name: 'Pump', quantity: 2, ratedKw: 10, powerFactor: 0.8, demandFactor: 0.5);
  check('connected', pump.connectedKw, 20);
  check('demand', pump.demandKw, 10);
  check('kvar', pump.demandKvar, 7.5);

  final s = summarise(const [
    LoadSpec(name: 'Heater', ratedKw: 30, powerFactor: 1.0),
    LoadSpec(name: 'Motor', ratedKw: 40, powerFactor: 0.8),
  ]);
  check('summary kw', s.demandKw, 70);
  check('summary kvar', s.demandKvar, 30);
  check('summary kva', s.demandKva, math.sqrt(70 * 70 + 30 * 30));
  check('summary pf', s.overallPf, 70 / math.sqrt(70 * 70 + 30 * 30));

  final div = summarise(const [LoadSpec(name: 'Lights', ratedKw: 100, powerFactor: 1.0)],
      diversityFactor: 1.25);
  check('diversity', div.maxDemandKva, 80);

  // voltage drop
  final vd = voltageDropPercent(
      current: 100, lengthM: 50, sizeSqmm: 35, voltage: 415, powerFactor: 0.85);
  check('vd 3ph', vd, 1.2761, tol: 0.001);
  final vd1 = voltageDropPercent(
      current: 100, lengthM: 50, sizeSqmm: 35, voltage: 415, powerFactor: 0.85, phases: 1);
  check('vd 1ph', vd1, 1.4735, tol: 0.001);

  // cable
  final c1 = selectCable(current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85);
  check('cable short size', c1.sizeSqmm, 25);
  check('cable short limitedBy', c1.limitedBy, 'current');
  check('cable short runs', c1.runs, 1);

  final c2 = selectCable(current: 100, lengthM: 400, voltage: 415, powerFactor: 0.85, maxVdPct: 3);
  check('cable long size', c2.sizeSqmm, 150);
  check('cable long limitedBy', c2.limitedBy, 'voltage drop');

  final c3 = selectCable(current: 900, lengthM: 30, voltage: 415, powerFactor: 0.9);
  check('cable parallel size', c3.sizeSqmm, 240);
  check('cable parallel runs', c3.runs, 2);

  // transformer
  check('tx 300', selectTransformer(maxDemandKva: 300), 500);
  check('tx exact', selectTransformer(maxDemandKva: 630, maxLoading: 1.0, futureMargin: 0), 630);

  // full estimate on the sample schedule
  const settings = EstimatorSettings(diversityFactor: 1.15, derating: 0.9, cableLengthM: 60);
  final report = estimate(loads: sampleLoads, settings: settings);
  check('report connected', report.summary.connectedKw, 134.0, tol: 0.01);
  check('report demandKw', report.summary.demandKw, 87.7, tol: 0.01);
  check('report demandKva', report.summary.demandKva, 102.88, tol: 0.01);
  check('report pf', report.summary.overallPf, 0.852, tol: 0.001);
  check('report current', report.feederCurrent, 124.46, tol: 0.2);
  check('report cable', report.cable?.sizeSqmm, 35);
  check('report cable vd', report.cable?.voltageDropPct, 1.91, tol: 0.02);
  check('report tx', report.transformer?.kva, 160);
  check('report rows', report.breakdown.length, sampleLoads.length);
  check('report label', report.cable?.label, '3.5-core x 35 mm²');

  // empty schedule
  final empty = estimate(loads: const []);
  check('empty kva', empty.summary.demandKva, 0);
  check('empty cable', empty.cable, null);
  check('empty current', empty.feederCurrent, 0);

  // warnings
  final lowPf = estimate(loads: const [LoadSpec(name: 'Motor', ratedKw: 50, powerFactor: 0.7)]);
  check('low pf warning', lowPf.warnings.any((w) => w.contains('power factor')), true);

  // json round trip
  final json = pump.toJson();
  final back = LoadSpec.fromJson(json);
  check('json name', back.name, pump.name);
  check('json kw', back.ratedKw, pump.ratedKw);
  final settingsBack = EstimatorSettings.fromJson(settings.toJson());
  check('settings round trip', settingsBack.derating, 0.9);

  // formatting
  check('fmt 12,34,567', fmtNum(1234567, digits: 0), '12,34,567');
  check('fmt 134.0', fmtNum(134.0, digits: 1), '134.0');
  check('fmt negative', fmtNum(-1234.5, digits: 1), '-1,234.5');
  check('fmt pct', fmtPct(2.18, digits: 2), '2.18%');

  print(failures == 0 ? '\nALL CHECKS PASSED' : '\n$failures CHECK(S) FAILED');
  if (failures > 0) throw StateError('engine mismatch');
}
