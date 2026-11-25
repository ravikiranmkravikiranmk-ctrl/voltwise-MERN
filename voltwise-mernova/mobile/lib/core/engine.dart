/// Electrical load, cable and transformer sizing.
///
/// Line-for-line port of packages/engine/src/core.js so the Flutter app can
/// calculate offline with exactly the same numbers as the MERN API.
library;

import 'dart:math' as math;

import 'tables.dart';

const double sqrt3 = 1.7320508075688772;

/// Raised for bad user input.
class ValidationException implements Exception {
  ValidationException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// One line of a load schedule, e.g. "4 x 7.5 kW pumps".
class LoadSpec {
  const LoadSpec({
    required this.name,
    this.quantity = 1,
    required this.ratedKw,
    this.powerFactor = 0.85,
    this.demandFactor = 1.0,
    this.phases = 3,
  });

  factory LoadSpec.fromJson(Map<String, dynamic> json) => LoadSpec(
        name: (json['name'] ?? 'Load').toString(),
        quantity: _toInt(json['quantity'], 1),
        ratedKw: _toDouble(json['ratedKw'] ?? json['rated_kw'], 0),
        powerFactor: _toDouble(json['powerFactor'] ?? json['power_factor'], 0.85),
        demandFactor: _toDouble(json['demandFactor'] ?? json['demand_factor'], 1.0),
        phases: _toInt(json['phases'], 3),
      );

  final String name;
  final int quantity;
  final double ratedKw;
  final double powerFactor;
  final double demandFactor;
  final int phases;

  double get connectedKw => quantity * ratedKw;
  double get demandKw => connectedKw * demandFactor;

  /// Q = P * tan(phi)
  double get demandKvar => demandKw * math.tan(math.acos(powerFactor.clamp(0.01, 1.0)));

  /// Validate against the same rules as the API engine.
  void validate() {
    if (quantity < 1) throw ValidationException('$name: quantity must be at least 1');
    if (ratedKw <= 0) throw ValidationException('$name: rated kW must be positive');
    if (powerFactor <= 0 || powerFactor > 1) {
      throw ValidationException('$name: power factor must be between 0 and 1');
    }
    if (demandFactor <= 0 || demandFactor > 1) {
      throw ValidationException('$name: demand factor must be between 0 and 1');
    }
    if (phases != 1 && phases != 3) throw ValidationException('$name: phases must be 1 or 3');
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'quantity': quantity,
        'ratedKw': ratedKw,
        'powerFactor': powerFactor,
        'demandFactor': demandFactor,
        'phases': phases,
      };

  LoadSpec copyWith({
    String? name,
    int? quantity,
    double? ratedKw,
    double? powerFactor,
    double? demandFactor,
    int? phases,
  }) =>
      LoadSpec(
        name: name ?? this.name,
        quantity: quantity ?? this.quantity,
        ratedKw: ratedKw ?? this.ratedKw,
        powerFactor: powerFactor ?? this.powerFactor,
        demandFactor: demandFactor ?? this.demandFactor,
        phases: phases ?? this.phases,
      );
}

double _toDouble(dynamic value, double fallback) {
  if (value == null) return fallback;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString()) ?? fallback;
}

int _toInt(dynamic value, int fallback) {
  if (value == null) return fallback;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString()) ?? fallback;
}

/// System settings for a study.
class EstimatorSettings {
  const EstimatorSettings({
    this.voltage = 415,
    this.phases = 3,
    this.diversityFactor = 1.0,
    this.derating = 1.0,
    this.maxVdPct = 3.0,
    this.cableLengthM = 50,
    this.maxRuns = 4,
    this.maxLoading = 0.8,
    this.futureMargin = 0.2,
  });

  factory EstimatorSettings.fromJson(Map<String, dynamic> json) => EstimatorSettings(
        voltage: _toDouble(json['voltage'], 415),
        phases: _toInt(json['phases'], 3),
        diversityFactor: _toDouble(json['diversityFactor'], 1.0),
        derating: _toDouble(json['derating'], 1.0),
        maxVdPct: _toDouble(json['maxVdPct'], 3.0),
        cableLengthM: _toDouble(json['cableLengthM'], 50),
        maxRuns: _toInt(json['maxRuns'], 4),
        maxLoading: _toDouble(json['maxLoading'], 0.8),
        futureMargin: _toDouble(json['futureMargin'], 0.2),
      );

  final double voltage;
  final int phases;
  final double diversityFactor;
  final double derating;
  final double maxVdPct;
  final double cableLengthM;
  final int maxRuns;
  final double maxLoading;
  final double futureMargin;

  EstimatorSettings copyWith({
    double? voltage,
    int? phases,
    double? diversityFactor,
    double? derating,
    double? maxVdPct,
    double? cableLengthM,
    int? maxRuns,
    double? maxLoading,
    double? futureMargin,
  }) =>
      EstimatorSettings(
        voltage: voltage ?? this.voltage,
        phases: phases ?? this.phases,
        diversityFactor: diversityFactor ?? this.diversityFactor,
        derating: derating ?? this.derating,
        maxVdPct: maxVdPct ?? this.maxVdPct,
        cableLengthM: cableLengthM ?? this.cableLengthM,
        maxRuns: maxRuns ?? this.maxRuns,
        maxLoading: maxLoading ?? this.maxLoading,
        futureMargin: futureMargin ?? this.futureMargin,
      );

  Map<String, dynamic> toJson() => {
        'voltage': voltage,
        'phases': phases,
        'diversityFactor': diversityFactor,
        'derating': derating,
        'maxVdPct': maxVdPct,
        'cableLengthM': cableLengthM,
        'maxRuns': maxRuns,
        'maxLoading': maxLoading,
        'futureMargin': futureMargin,
      };
}

/// Totals for a load schedule.
class ScheduleSummary {
  const ScheduleSummary({
    required this.connectedKw,
    required this.demandKw,
    required this.demandKvar,
    required this.demandKva,
    required this.overallPf,
    required this.maxDemandKva,
  });

  final double connectedKw;
  final double demandKw;
  final double demandKvar;
  final double demandKva;
  final double overallPf;
  final double maxDemandKva;
}

class CableChoice {
  const CableChoice({
    required this.sizeSqmm,
    required this.runs,
    required this.deratedCapacityA,
    required this.voltageDropPct,
    required this.limitedBy,
  });

  final double sizeSqmm;
  final int runs;
  final double deratedCapacityA;
  final double voltageDropPct;
  final String limitedBy;

  String get label {
    final prefix = runs > 1 ? '$runs parallel runs of ' : '';
    return '${prefix}3.5-core x ${sizeSqmm.toStringAsFixed(sizeSqmm % 1 == 0 ? 0 : 1)} mm²';
  }
}

class TransformerChoice {
  const TransformerChoice({
    required this.kva,
    required this.requiredKva,
    required this.loadingPct,
  });

  final double kva;
  final double requiredKva;
  final double loadingPct;
}

class BreakdownRow {
  const BreakdownRow({
    required this.load,
    required this.shareOfDemandPct,
  });

  final LoadSpec load;
  final double shareOfDemandPct;
}

/// The full result of a study.
class EstimateReport {
  const EstimateReport({
    required this.summary,
    required this.feederCurrent,
    required this.cable,
    required this.transformer,
    required this.breakdown,
    required this.settings,
    required this.warnings,
  });

  final ScheduleSummary summary;
  final double feederCurrent;
  final CableChoice? cable;
  final TransformerChoice? transformer;
  final List<BreakdownRow> breakdown;
  final EstimatorSettings settings;
  final List<String> warnings;
}

/// Add up a load schedule.
///
/// kW and kVAr are summed separately and then combined, because kVA values
/// with different power factors cannot be added directly.
ScheduleSummary summarise(List<LoadSpec> loads, {double diversityFactor = 1.0}) {
  if (diversityFactor < 1) {
    throw ValidationException('Diversity factor must be 1 or more');
  }
  for (final load in loads) {
    load.validate();
  }
  if (loads.isEmpty) {
    return const ScheduleSummary(
      connectedKw: 0,
      demandKw: 0,
      demandKvar: 0,
      demandKva: 0,
      overallPf: 1,
      maxDemandKva: 0,
    );
  }
  var kw = 0.0;
  var kvar = 0.0;
  var connected = 0.0;
  for (final load in loads) {
    kw += load.demandKw;
    kvar += load.demandKvar;
    connected += load.connectedKw;
  }
  final kva = math.sqrt(kw * kw + kvar * kvar);
  return ScheduleSummary(
    connectedKw: connected,
    demandKw: kw,
    demandKvar: kvar,
    demandKva: kva,
    overallPf: kva == 0 ? 1 : kw / kva,
    maxDemandKva: kva / diversityFactor,
  );
}

/// Full-load current in amps.
double lineCurrent({
  required double kw,
  required double voltage,
  required double powerFactor,
  int phases = 3,
}) {
  if (voltage <= 0 || powerFactor <= 0 || powerFactor > 1) {
    throw ValidationException('Voltage must be positive and pf between 0 and 1');
  }
  final watts = kw * 1000;
  if (phases == 3) return watts / (sqrt3 * voltage * powerFactor);
  if (phases == 1) return watts / (voltage * powerFactor);
  throw ValidationException('phases must be 1 or 3');
}

/// Voltage drop as % of supply voltage.
double voltageDropPercent({
  required double current,
  required double lengthM,
  required double sizeSqmm,
  required double voltage,
  required double powerFactor,
  int phases = 3,
  int runs = 1,
}) {
  final entry = copperXlpeArmouredAir[sizeSqmm];
  if (entry == null) {
    throw ValidationException('$sizeSqmm sq.mm is not in the cable table');
  }
  final phi = math.acos(powerFactor.clamp(0.01, 1.0));
  final impedance = entry.r * math.cos(phi) + entry.x * math.sin(phi);
  final k = phases == 3 ? sqrt3 : 2.0;
  final vd = k * (current / runs) * (lengthM / 1000) * impedance;
  return vd / voltage * 100;
}

/// Smallest cable that passes both the current and the voltage-drop check.
CableChoice selectCable({
  required double current,
  required double lengthM,
  required double voltage,
  required double powerFactor,
  int phases = 3,
  double derating = 1.0,
  double maxVdPct = 3.0,
  int maxRuns = 4,
}) {
  if (derating <= 0 || derating > 1) {
    throw ValidationException('Derating factor must be between 0 and 1');
  }
  final sizes = cableSizes();
  for (var runs = 1; runs <= maxRuns; runs++) {
    for (final size in sizes) {
      final entry = copperXlpeArmouredAir[size]!;
      final capacity = entry.ampacity * derating * runs;
      if (capacity < current) continue;
      final vd = voltageDropPercent(
        current: current,
        lengthM: lengthM,
        sizeSqmm: size,
        voltage: voltage,
        powerFactor: powerFactor,
        phases: phases,
        runs: runs,
      );
      if (vd <= maxVdPct) {
        final firstOkForCurrent = sizes.firstWhere(
          (s) => copperXlpeArmouredAir[s]!.ampacity * derating * runs >= current,
        );
        return CableChoice(
          sizeSqmm: size,
          runs: runs,
          deratedCapacityA: capacity,
          voltageDropPct: vd,
          limitedBy: size == firstOkForCurrent ? 'current' : 'voltage drop',
        );
      }
    }
  }
  throw ValidationException(
    'No cable up to $maxRuns parallel runs of ${sizes.last} sq.mm meets the requirement. '
    'Consider a higher voltage or shorter route.',
  );
}

/// Next standard transformer rating.
double selectTransformer({
  required double maxDemandKva,
  double maxLoading = 0.8,
  double futureMargin = 0.2,
}) {
  if (maxLoading <= 0 || maxLoading > 1) {
    throw ValidationException('Max loading must be between 0 and 1');
  }
  if (maxDemandKva < 0) throw ValidationException('Max demand must be 0 or more');
  final required = maxDemandKva * (1 + futureMargin) / maxLoading;
  for (final rating in standardTransformerKva) {
    if (rating >= required) return rating;
  }
  throw ValidationException(
    'Required ${required.toStringAsFixed(0)} kVA exceeds the largest standard rating; '
    'split into multiple transformers',
  );
}

/// Run the whole workflow for a load schedule and system settings.
EstimateReport estimate({
  required List<LoadSpec> loads,
  EstimatorSettings settings = const EstimatorSettings(),
}) {
  final summary = summarise(loads, diversityFactor: settings.diversityFactor);
  final maxDemandKw = summary.demandKw / settings.diversityFactor;

  final feederCurrent = summary.maxDemandKva > 0
      ? lineCurrent(
          kw: maxDemandKw,
          voltage: settings.voltage,
          powerFactor: summary.overallPf,
          phases: settings.phases,
        )
      : 0.0;

  CableChoice? cable;
  TransformerChoice? transformer;
  final warnings = <String>[];

  if (feederCurrent > 0) {
    final cableChoice = selectCable(
      current: feederCurrent,
      lengthM: settings.cableLengthM,
      voltage: settings.voltage,
      powerFactor: summary.overallPf,
      phases: settings.phases,
      derating: settings.derating,
      maxVdPct: settings.maxVdPct,
      maxRuns: settings.maxRuns,
    );
    cable = cableChoice;

    final rating = selectTransformer(
      maxDemandKva: summary.maxDemandKva,
      maxLoading: settings.maxLoading,
      futureMargin: settings.futureMargin,
    );
    transformer = TransformerChoice(
      kva: rating,
      requiredKva: summary.maxDemandKva * (1 + settings.futureMargin) / settings.maxLoading,
      loadingPct: summary.maxDemandKva / rating * 100,
    );

    if (cableChoice.voltageDropPct > settings.maxVdPct * 0.9) {
      warnings.add(
        'Voltage drop ${cableChoice.voltageDropPct.toStringAsFixed(2)}% is close to the '
        '${settings.maxVdPct}% limit — consider a shorter route or a larger cable.',
      );
    }
    if (summary.overallPf < 0.85) {
      warnings.add(
        'Overall power factor is ${summary.overallPf.toStringAsFixed(2)}; utilities usually '
        'want 0.85 or better — add power factor correction capacitors.',
      );
    }
  }

  final totalDemandKw = summary.demandKw;
  final breakdown = loads
      .map((load) => BreakdownRow(
            load: load,
            shareOfDemandPct: totalDemandKw == 0 ? 0 : load.demandKw / totalDemandKw * 100,
          ))
      .toList();

  return EstimateReport(
    summary: summary,
    feederCurrent: feederCurrent,
    cable: cable,
    transformer: transformer,
    breakdown: breakdown,
    settings: settings,
    warnings: warnings,
  );
}

/// Sample schedule shipped with the app (same rows as samples/sample_loads.csv).
const List<LoadSpec> sampleLoads = [
  LoadSpec(name: 'Borewell pumps', quantity: 4, ratedKw: 7.5, powerFactor: 0.82, demandFactor: 0.75),
  LoadSpec(name: 'Air conditioners', quantity: 10, ratedKw: 2.2, powerFactor: 0.9, demandFactor: 0.8, phases: 1),
  LoadSpec(name: 'Lighting', quantity: 1, ratedKw: 12, powerFactor: 0.95, demandFactor: 0.9, phases: 1),
  LoadSpec(name: 'Lift', quantity: 2, ratedKw: 11, powerFactor: 0.8, demandFactor: 0.5),
  LoadSpec(name: 'Workshop machines', quantity: 6, ratedKw: 5.5, powerFactor: 0.8, demandFactor: 0.6),
  LoadSpec(name: 'Socket outlets', quantity: 1, ratedKw: 15, powerFactor: 0.9, demandFactor: 0.4, phases: 1),
];
