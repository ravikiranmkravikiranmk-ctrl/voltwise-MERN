/// Reference data — mirror of packages/engine/src/tables.js.
///
/// Values are INDICATIVE, typical of 1.1 kV copper XLPE multi-core armoured
/// cables laid in air at ~40 degC ambient. Real projects must use the cable
/// manufacturer's datasheet and the applicable standard (IS 3961 / IEC 60364-5-52).
library;

class CableEntry {
  const CableEntry({required this.ampacity, required this.r, required this.x});

  /// Current rating in amps.
  final double ampacity;

  /// AC resistance in ohm/km at 90 degC.
  final double r;

  /// Reactance in ohm/km.
  final double x;
}

/// size (sq.mm) -> rating data.
final Map<double, CableEntry> copperXlpeArmouredAir = {
  2.5: const CableEntry(ampacity: 30, r: 9.45, x: 0.110),
  4: const CableEntry(ampacity: 40, r: 5.88, x: 0.107),
  6: const CableEntry(ampacity: 51, r: 3.93, x: 0.100),
  10: const CableEntry(ampacity: 70, r: 2.33, x: 0.094),
  16: const CableEntry(ampacity: 94, r: 1.47, x: 0.090),
  25: const CableEntry(ampacity: 120, r: 0.927, x: 0.086),
  35: const CableEntry(ampacity: 147, r: 0.668, x: 0.083),
  50: const CableEntry(ampacity: 180, r: 0.494, x: 0.083),
  70: const CableEntry(ampacity: 226, r: 0.342, x: 0.082),
  95: const CableEntry(ampacity: 275, r: 0.247, x: 0.082),
  120: const CableEntry(ampacity: 317, r: 0.196, x: 0.080),
  150: const CableEntry(ampacity: 358, r: 0.159, x: 0.080),
  185: const CableEntry(ampacity: 410, r: 0.128, x: 0.080),
  240: const CableEntry(ampacity: 483, r: 0.0977, x: 0.079),
  300: const CableEntry(ampacity: 552, r: 0.0790, x: 0.079),
};

/// Common distribution transformer ratings (kVA).
const List<double> standardTransformerKva = [
  25, 63, 100, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500,
];

/// Cable sizes in ascending order.
List<double> cableSizes() => copperXlpeArmouredAir.keys.toList()..sort();
