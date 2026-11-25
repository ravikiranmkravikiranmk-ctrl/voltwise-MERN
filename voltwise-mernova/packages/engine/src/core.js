/**
 * Core electrical calculations: load schedule, current, cable sizing,
 * transformer sizing.
 *
 * Direct port of the original Python `loadcalc.core` module. The maths and the
 * validation rules are identical; only the language changed.
 */
import {
  CATEGORY_KEYS,
  CONDUCTORS,
  COPPER_XLPE_ARMOURED_AIR,
  DEFAULT_SETTINGS,
  STANDARD_TRANSFORMER_KVA,
  cableSizes,
  cableTableFor,
  guessCategory,
} from './tables.js';

export const SQRT3 = Math.sqrt(3);

/** Raised for bad user input; the API maps this to HTTP 400. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- loads ----
/**
 * One line of a load schedule, e.g. "4 x 7.5 kW pumps".
 */
export class Load {
  constructor({
    name = 'Load',
    quantity = 1,
    ratedKw,
    powerFactor = 0.85,
    demandFactor = 1.0,
    phases = 3,
    category,
    panel = '',
    lengthM = null,
  } = {}) {
    const label = name || 'Load';
    const qty = Number(quantity);
    const kw = Number(ratedKw);
    const pf = Number(powerFactor);
    const df = Number(demandFactor);
    const ph = Number(phases);

    if (!Number.isInteger(qty) || qty < 1) {
      throw new ValidationError(`${label}: quantity must be at least 1`);
    }
    if (!isNum(kw) || kw <= 0) {
      throw new ValidationError(`${label}: rated kW must be positive`);
    }
    if (!isNum(pf) || !(pf > 0 && pf <= 1)) {
      throw new ValidationError(`${label}: power factor must be between 0 and 1`);
    }
    if (!isNum(df) || !(df > 0 && df <= 1)) {
      throw new ValidationError(`${label}: demand factor must be between 0 and 1`);
    }
    if (ph !== 1 && ph !== 3) {
      throw new ValidationError(`${label}: phases must be 1 or 3`);
    }

    this.name = String(label);
    this.quantity = qty;
    this.ratedKw = kw;
    this.powerFactor = pf;
    this.demandFactor = df;
    this.phases = ph;
    this.category = CATEGORY_KEYS.includes(category) ? category : guessCategory(label);
    this.panel = panel == null ? '' : String(panel).slice(0, 60);
    const len = lengthM === '' || lengthM === null || lengthM === undefined ? null : Number(lengthM);
    if (len !== null && (!isNum(len) || len <= 0 || len > 5000)) {
      throw new ValidationError(`${label}: branch length must be between 0 and 5000 m`);
    }
    this.lengthM = len;
  }

  get connectedKw() {
    return this.quantity * this.ratedKw;
  }

  get demandKw() {
    return this.connectedKw * this.demandFactor;
  }

  /** Q = P * tan(phi) */
  get demandKvar() {
    return this.demandKw * Math.tan(Math.acos(this.powerFactor));
  }

  toJSON() {
    return {
      name: this.name,
      quantity: this.quantity,
      ratedKw: this.ratedKw,
      powerFactor: this.powerFactor,
      demandFactor: this.demandFactor,
      phases: this.phases,
      category: this.category,
      panel: this.panel,
      lengthM: this.lengthM,
      connectedKw: round(this.connectedKw, 3),
      demandKw: round(this.demandKw, 3),
      demandKvar: round(this.demandKvar, 3),
    };
  }
}

/** Coerce plain objects (from JSON or Mongo) into Load instances. */
export function toLoads(rows = []) {
  if (!Array.isArray(rows)) throw new ValidationError('loads must be an array');
  return rows.map((row, i) => {
    try {
      return row instanceof Load ? row : new Load({ ...row, name: row?.name || `Load ${i + 1}` });
    } catch (err) {
      if (err instanceof ValidationError && !/^Load \d+: /.test(err.message)) {
        throw new ValidationError(`Load ${i + 1}: ${err.message}`);
      }
      throw err;
    }
  });
}

export function round(value, digits = 2) {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Add up a load schedule.
 *
 * Active (kW) and reactive (kVAr) power are summed separately and then
 * combined, because kVA values with different power factors cannot be added
 * directly. Diversity factor (>= 1) reflects that not all loads peak together.
 */
export function summarise(loads = [], diversityFactor = 1.0) {
  const df = Number(diversityFactor);
  if (!isNum(df) || df < 1) {
    throw new ValidationError('Diversity factor must be 1 or more');
  }
  const list = toLoads(loads);
  if (list.length === 0) {
    return {
      connectedKw: 0,
      demandKw: 0,
      demandKvar: 0,
      demandKva: 0,
      overallPf: 1,
      maxDemandKva: 0,
    };
  }
  const kw = list.reduce((s, l) => s + l.demandKw, 0);
  const kvar = list.reduce((s, l) => s + l.demandKvar, 0);
  const kva = Math.hypot(kw, kvar);
  return {
    connectedKw: list.reduce((s, l) => s + l.connectedKw, 0),
    demandKw: kw,
    demandKvar: kvar,
    demandKva: kva,
    overallPf: kva ? kw / kva : 1,
    maxDemandKva: kva / df,
  };
}

// -------------------------------------------------------------- current ----
/**
 * Full-load current in amps.
 *
 *   3-phase: I = P / (sqrt(3) * V_LL * pf)
 *   1-phase: I = P / (V_LN * pf)
 */
export function lineCurrent({ kw, voltage, powerFactor, phases = 3 } = {}) {
  const p = Number(kw);
  const v = Number(voltage);
  const pf = Number(powerFactor);
  const ph = Number(phases);
  if (!isNum(v) || v <= 0 || !isNum(pf) || !(pf > 0 && pf <= 1)) {
    throw new ValidationError('Voltage must be positive and pf between 0 and 1');
  }
  if (!isNum(p)) throw new ValidationError('kW must be a number');
  const watts = p * 1000;
  if (ph === 3) return watts / (SQRT3 * v * pf);
  if (ph === 1) return watts / (v * pf);
  throw new ValidationError('phases must be 1 or 3');
}

// ---------------------------------------------------------- voltage drop ---
/**
 * Voltage drop as % of supply voltage.
 *
 *   3-phase: Vd = sqrt(3) * I * L * (R cos(phi) + X sin(phi))
 *   1-phase: Vd = 2 * I * L * (R cos(phi) + X sin(phi))
 *
 * R and X are in ohm/km, so L is converted to km. Parallel runs share current.
 */
export function voltageDropPercent({
  current,
  lengthM,
  sizeSqmm,
  voltage,
  powerFactor,
  phases = 3,
  runs = 1,
  table = COPPER_XLPE_ARMOURED_AIR,
} = {}) {
  const entry = table[sizeSqmm];
  if (!entry) throw new ValidationError(`${sizeSqmm} sq.mm is not in the cable table`);
  const { r, x } = entry;
  const phi = Math.acos(Number(powerFactor));
  const impedance = r * Math.cos(phi) + x * Math.sin(phi);
  const k = Number(phases) === 3 ? SQRT3 : 2;
  const vd = k * (Number(current) / Number(runs)) * (Number(lengthM) / 1000) * impedance;
  return (vd / Number(voltage)) * 100;
}

// ---------------------------------------------------------- cable sizing ---
/**
 * Pick the smallest cable that passes BOTH checks:
 *   1) derated current capacity >= load current
 *   2) voltage drop <= allowed limit
 * If no single cable works, try 2, 3 ... parallel runs.
 */
export function selectCable({
  current,
  lengthM,
  voltage,
  powerFactor,
  phases = 3,
  derating = 1.0,
  maxVdPct = 3.0,
  maxRuns = 4,
  table = COPPER_XLPE_ARMOURED_AIR,
  vdCurrent,
} = {}) {
  const vdI = vdCurrent === undefined ? current : vdCurrent;
  const dr = Number(derating);
  if (!isNum(dr) || !(dr > 0 && dr <= 1)) {
    throw new ValidationError('Derating factor must be between 0 and 1');
  }
  const sizes = cableSizes(table);
  for (let runs = 1; runs <= maxRuns; runs += 1) {
    for (const size of sizes) {
      const capacity = table[size].ampacity * dr * runs;
      if (capacity < current) continue;
      const vd = voltageDropPercent({
        current: vdI, lengthM, sizeSqmm: size, voltage, powerFactor, phases, runs, table,
      });
      if (vd <= maxVdPct) {
        const firstOkForCurrent = sizes.find((s) => table[s].ampacity * dr * runs >= current);
        return {
          sizeSqmm: size,
          runs,
          deratedCapacityA: capacity,
          voltageDropPct: vd,
          limitedBy: size === firstOkForCurrent ? 'current' : 'voltage drop',
        };
      }
    }
  }
  throw new ValidationError(
    `No cable up to ${maxRuns} parallel runs of ${sizes[sizes.length - 1]} sq.mm meets the requirement. ` +
      'Consider a higher voltage or shorter route.',
  );
}

// --------------------------------------------------- transformer sizing ---
/**
 * Next standard transformer rating.
 *
 *   Required kVA = max demand * (1 + future margin) / max loading
 * Defaults: plan for 20% load growth, keep the transformer at most 80% loaded.
 */
export function selectTransformer({
  maxDemandKva,
  maxLoading = 0.8,
  futureMargin = 0.2,
} = {}) {
  const loading = Number(maxLoading);
  if (!isNum(loading) || !(loading > 0 && loading <= 1)) {
    throw new ValidationError('Max loading must be between 0 and 1');
  }
  const demand = Number(maxDemandKva);
  if (!isNum(demand) || demand < 0) throw new ValidationError('Max demand must be 0 or more');
  const required = (demand * (1 + Number(futureMargin))) / loading;
  const rating = STANDARD_TRANSFORMER_KVA.find((r) => r >= required);
  if (rating === undefined) {
    throw new ValidationError(
      `Required ${Math.round(required)} kVA exceeds the largest standard rating; split into multiple transformers`,
    );
  }
  return rating;
}

// ------------------------------------------------------- full estimate ----
/**
 * Run the whole workflow for a load schedule and system settings.
 * This is what the API returns and what the web and Flutter clients render.
 */
export function estimate({ loads = [], settings = {}, strict = true } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!CONDUCTORS[s.conductor]) s.conductor = 'cu';
  const table = cableTableFor(s.conductor);
  const list = toLoads(loads);

  const summary = summarise(list, s.diversityFactor);
  const maxDemandKw = summary.demandKw / Number(s.diversityFactor);

  const feederCurrent = summary.maxDemandKva > 0
    ? lineCurrent({
      kw: maxDemandKw,
      voltage: s.voltage,
      powerFactor: summary.overallPf,
      phases: s.phases,
    })
    : 0;

  let cable = null;
  let transformerKva = null;
  const warnings = [];

  if (feederCurrent > 0) {
    try {
    cable = selectCable({
      current: feederCurrent,
      lengthM: s.cableLengthM,
      voltage: s.voltage,
      powerFactor: summary.overallPf,
      phases: s.phases,
      derating: s.derating,
      maxVdPct: s.maxVdPct,
      maxRuns: s.maxRuns,
      table,
    });
    } catch (err) {
      if (strict || !(err instanceof ValidationError)) throw err;
      warnings.push(err.message);
    }
    try {
      transformerKva = selectTransformer({
        maxDemandKva: summary.maxDemandKva,
        maxLoading: s.maxLoading,
        futureMargin: s.futureMargin,
      });
    } catch (err) {
      if (strict || !(err instanceof ValidationError)) throw err;
      warnings.push(err.message);
    }
    if (cable && cable.voltageDropPct > s.maxVdPct * 0.9) {
      warnings.push(
        `Voltage drop ${round(cable.voltageDropPct, 2)}% is close to the ${s.maxVdPct}% limit — ` +
          'consider a shorter route or a larger cable.',
      );
    }
    if (summary.overallPf < 0.85) {
      warnings.push(
        `Overall power factor is ${round(summary.overallPf, 2)}; utilities usually want 0.85 or better — ` +
          'add power factor correction capacitors.',
      );
    }
  }

  const totalDemandKw = summary.demandKw || 0;
  const breakdown = list.map((l) => ({
    ...l.toJSON(),
    shareOfDemandPct: totalDemandKw ? (l.demandKw / totalDemandKw) * 100 : 0,
  }));

  return {
    summary: {
      connectedKw: round(summary.connectedKw, 2),
      demandKw: round(summary.demandKw, 2),
      demandKvar: round(summary.demandKvar, 2),
      demandKva: round(summary.demandKva, 2),
      overallPf: round(summary.overallPf, 3),
      maxDemandKva: round(summary.maxDemandKva, 2),
    },
    feeder: {
      current: round(feederCurrent, 1),
      voltage: Number(s.voltage),
      phases: Number(s.phases),
    },
    cable: cable && {
      sizeSqmm: cable.sizeSqmm,
      runs: cable.runs,
      deratedCapacityA: round(cable.deratedCapacityA, 1),
      voltageDropPct: round(cable.voltageDropPct, 2),
      limitedBy: cable.limitedBy,
      lengthM: Number(s.cableLengthM),
      conductor: s.conductor,
    },
    transformer: transformerKva && {
      kva: transformerKva,
      requiredKva: round(
        (summary.maxDemandKva * (1 + Number(s.futureMargin))) / Number(s.maxLoading),
        1,
      ),
      loadingPct: round((summary.maxDemandKva / transformerKva) * 100, 1),
    },
    breakdown: breakdown.map((b) => ({
      ...b,
      shareOfDemandPct: round(b.shareOfDemandPct, 1),
    })),
    settings: s,
    warnings,
  };
}
