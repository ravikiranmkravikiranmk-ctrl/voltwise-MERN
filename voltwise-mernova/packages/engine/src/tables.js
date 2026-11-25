/**
 * Reference data.
 *
 * IMPORTANT: Values are INDICATIVE, typical of 1.1 kV copper XLPE multi-core
 * armoured cables laid in air at ~40 degC ambient. Real projects must use the
 * cable manufacturer's datasheet and the applicable standard (e.g. IS 3961 /
 * IEC 60364-5-52). Keep all data here so it can be swapped in one place.
 */

/**
 * size (sq.mm) -> { ampacity: current rating in A, r: AC resistance ohm/km at 90 degC, x: reactance ohm/km }
 */
export const COPPER_XLPE_ARMOURED_AIR = {
  2.5: { ampacity: 30, r: 9.45, x: 0.11 },
  4: { ampacity: 40, r: 5.88, x: 0.107 },
  6: { ampacity: 51, r: 3.93, x: 0.1 },
  10: { ampacity: 70, r: 2.33, x: 0.094 },
  16: { ampacity: 94, r: 1.47, x: 0.09 },
  25: { ampacity: 120, r: 0.927, x: 0.086 },
  35: { ampacity: 147, r: 0.668, x: 0.083 },
  50: { ampacity: 180, r: 0.494, x: 0.083 },
  70: { ampacity: 226, r: 0.342, x: 0.082 },
  95: { ampacity: 275, r: 0.247, x: 0.082 },
  120: { ampacity: 317, r: 0.196, x: 0.08 },
  150: { ampacity: 358, r: 0.159, x: 0.08 },
  185: { ampacity: 410, r: 0.128, x: 0.08 },
  240: { ampacity: 483, r: 0.0977, x: 0.079 },
  300: { ampacity: 552, r: 0.079, x: 0.079 },
};

/**
 * Indicative 1.1 kV ALUMINIUM XLPE armoured multi-core cable in air (~40 degC).
 * Common in Indian LT distribution. Same caveats as the copper table.
 */
export const ALUMINIUM_XLPE_ARMOURED_AIR = {
  16: { ampacity: 73, r: 2.44, x: 0.09 },
  25: { ampacity: 95, r: 1.54, x: 0.086 },
  35: { ampacity: 117, r: 1.11, x: 0.083 },
  50: { ampacity: 141, r: 0.822, x: 0.083 },
  70: { ampacity: 179, r: 0.568, x: 0.082 },
  95: { ampacity: 216, r: 0.411, x: 0.082 },
  120: { ampacity: 249, r: 0.325, x: 0.08 },
  150: { ampacity: 285, r: 0.265, x: 0.08 },
  185: { ampacity: 324, r: 0.211, x: 0.08 },
  240: { ampacity: 380, r: 0.161, x: 0.079 },
  300: { ampacity: 435, r: 0.13, x: 0.079 },
  400: { ampacity: 501, r: 0.102, x: 0.078 },
};

/** Conductor key -> table + short-circuit k factor (XLPE, 90 -> 250 degC). */
export const CONDUCTORS = {
  cu: { label: 'Copper', table: COPPER_XLPE_ARMOURED_AIR, k: 143 },
  al: { label: 'Aluminium', table: ALUMINIUM_XLPE_ARMOURED_AIR, k: 94 },
};

export function cableTableFor(conductor = 'cu') {
  return (CONDUCTORS[conductor] || CONDUCTORS.cu).table;
}

/** Standard protective device ratings (A): MCB up to 63, MCCB to 800, ACB above. */
export const STANDARD_BREAKER_A = [
  6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250,
  315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000,
];

/** Standard LT capacitor bank sizes (kVAr). */
export const STANDARD_CAPACITOR_KVAR = [
  5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150,
  175, 200, 250, 300, 350, 400, 500, 600, 750, 1000,
];

/**
 * Typical transformer impedance (%) by rating, used to estimate the
 * prospective LV fault level when the user does not give one (IS 1180 ballpark).
 */
export function typicalImpedancePct(kva) {
  if (kva <= 630) return 4.5;
  if (kva <= 1250) return 5;
  if (kva <= 2500) return 6.25;
  return 7;
}

/**
 * Load categories. `profile` is an indicative 24-hour usage curve
 * (fraction of the category's demand kW in each hour, 00:00 -> 23:00).
 */
export const LOAD_CATEGORIES = {
  lighting: {
    label: 'Lighting',
    keywords: ['light', 'lamp', 'led', 'lux', 'street'],
    profile: [0.35, 0.3, 0.3, 0.3, 0.3, 0.4, 0.55, 0.45, 0.3, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.3, 0.55, 0.9, 1, 1, 0.9, 0.7, 0.5],
  },
  hvac: {
    label: 'HVAC / AC',
    keywords: ['ac', 'air con', 'aircon', 'hvac', 'chiller', 'ahu', 'fan', 'cooling', 'split', 'vrf', 'ventilat'],
    profile: [0.45, 0.4, 0.35, 0.35, 0.35, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1, 1, 1, 0.95, 0.9, 0.8, 0.75, 0.7, 0.65, 0.55, 0.5],
  },
  motor: {
    label: 'Motors & pumps',
    keywords: ['pump', 'motor', 'borewell', 'compressor', 'blower', 'drive', 'mill', 'conveyor', 'crusher'],
    profile: [0.3, 0.3, 0.3, 0.3, 0.35, 0.6, 0.9, 1, 0.9, 0.8, 0.7, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1, 0.9, 0.7, 0.5, 0.4, 0.35, 0.3],
  },
  lift: {
    label: 'Lifts & hoists',
    keywords: ['lift', 'elevator', 'hoist', 'crane', 'escalator'],
    profile: [0.05, 0.05, 0.05, 0.05, 0.05, 0.15, 0.5, 1, 0.9, 0.6, 0.5, 0.5, 0.6, 0.5, 0.5, 0.5, 0.6, 0.9, 1, 0.7, 0.5, 0.3, 0.15, 0.1],
  },
  process: {
    label: 'Process / workshop',
    keywords: ['workshop', 'machine', 'lathe', 'weld', 'cnc', 'press', 'process', 'plant', 'production'],
    profile: [0.1, 0.1, 0.1, 0.1, 0.1, 0.15, 0.3, 0.6, 0.9, 1, 1, 1, 0.8, 0.9, 1, 1, 0.9, 0.6, 0.3, 0.15, 0.1, 0.1, 0.1, 0.1],
  },
  sockets: {
    label: 'Sockets / small power',
    keywords: ['socket', 'outlet', 'receptacle', 'small power', 'plug', 'raw power'],
    profile: [0.2, 0.15, 0.15, 0.15, 0.15, 0.25, 0.5, 0.7, 0.8, 0.85, 0.85, 0.85, 0.8, 0.85, 0.85, 0.85, 0.8, 0.85, 1, 0.95, 0.8, 0.6, 0.4, 0.3],
  },
  it: {
    label: 'IT & UPS',
    keywords: ['ups', 'server', 'it ', 'computer', 'data', 'network', 'cctv', 'telecom'],
    profile: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.85, 0.9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.95, 0.9, 0.85, 0.85, 0.8, 0.8, 0.8],
  },
  heating: {
    label: 'Heating / kitchen',
    keywords: ['heater', 'geyser', 'kitchen', 'oven', 'boiler', 'cooking', 'water heat', 'furnace'],
    profile: [0.05, 0.05, 0.05, 0.05, 0.2, 0.7, 1, 0.9, 0.5, 0.3, 0.3, 0.5, 0.7, 0.5, 0.3, 0.3, 0.4, 0.6, 0.9, 0.8, 0.5, 0.3, 0.1, 0.05],
  },
  ev: {
    label: 'EV charging',
    keywords: ['ev ', 'charger', 'charging', 'evse'],
    profile: [0.6, 0.6, 0.55, 0.5, 0.4, 0.3, 0.3, 0.4, 0.5, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 0.9, 0.8, 0.7],
  },
  other: {
    label: 'Other',
    keywords: [],
    profile: Array(24).fill(0.7),
  },
};

export const CATEGORY_KEYS = Object.keys(LOAD_CATEGORIES);

/** Best-guess category from a load name (used when none is given). */
export function guessCategory(name = '') {
  const n = ` ${String(name).toLowerCase()} `;
  for (const [key, cat] of Object.entries(LOAD_CATEGORIES)) {
    if (cat.keywords.some((k) => n.includes(k.length <= 3 ? ` ${k.trim()} ` : k) || n.includes(`${k.trim()}s `))) return key;
  }
  return 'other';
}

/** Common distribution transformer ratings (kVA). */
export const STANDARD_TRANSFORMER_KVA = [
  25, 63, 100, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500,
];

/** Default system settings used by the estimator. */
export const DEFAULT_SETTINGS = {
  voltage: 415,          // line-to-line volts for 3-phase systems
  phases: 3,             // 1 or 3
  diversityFactor: 1.0,  // >= 1, applied to the summed demand
  derating: 1.0,         // 0..1 group/ambient derating on the cable ampacity
  maxVdPct: 3.0,         // allowed voltage drop, % of supply voltage
  cableLengthM: 50,      // route length of the feeder
  maxRuns: 4,            // maximum parallel cable runs to consider
  maxLoading: 0.8,       // maximum transformer loading (0..1]
  futureMargin: 0.2,     // load growth allowance
  conductor: 'cu',       // 'cu' | 'al'
  targetPf: 0.95,        // power-factor correction target
  branchLengthM: 30,     // default branch circuit length when a load has none
  faultKa: 0,            // prospective fault at the main board, kA (0 = estimate from transformer)
  faultTimeS: 0.2,       // protection clearing time for the short-circuit check
};

/** Sorted cable sizes available in the reference table. */
export function cableSizes(table = COPPER_XLPE_ARMOURED_AIR) {
  return Object.keys(table).map(Number).sort((a, b) => a - b);
}
