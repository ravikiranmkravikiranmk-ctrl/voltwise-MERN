/**
 * Advanced analytics on top of the core estimate:
 *   - row-level validation that never throws (for live UI feedback)
 *   - category breakdown and an indicative 24-hour load profile
 *   - demand analysis (demand factor, coincidence, load factor, energy)
 *   - transformer utilisation, alternatives and LV fault level
 *   - branch-circuit schedule: cable + protective device per load line
 *   - power-factor correction sizing
 *   - short-circuit withstand check of the main feeder cable
 *
 * Everything here is pure and dependency-free, like the rest of the engine.
 */
import {
  Load,
  SQRT3,
  ValidationError,
  estimate,
  lineCurrent,
  round,
  selectCable,
} from './core.js';
import {
  CATEGORY_KEYS,
  CONDUCTORS,
  DEFAULT_SETTINGS,
  LOAD_CATEGORIES,
  STANDARD_BREAKER_A,
  STANDARD_CAPACITOR_KVAR,
  STANDARD_TRANSFORMER_KVA,
  cableTableFor,
  typicalImpedancePct,
} from './tables.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ------------------------------------------------------------ validation --
/**
 * Validate one schedule row without throwing.
 * @returns {Record<string,string>} field -> message (empty object when valid)
 */
export function validateLoadRow(row = {}) {
  const errors = {};
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  // Same defaults as the Load constructor for fields that are simply absent.
  const opt = (v, d) => (v === undefined ? d : num(v));
  if (!String(row.name ?? '').trim()) errors.name = 'Name is required';
  else if (String(row.name).length > 120) errors.name = 'Max 120 characters';

  const qty = opt(row.quantity, 1);
  if (!Number.isInteger(qty) || qty < 1) errors.quantity = 'Whole number ≥ 1';
  else if (qty > 10000) errors.quantity = 'Max 10,000';

  const kw = num(row.ratedKw);
  if (!isNum(kw) || kw <= 0) errors.ratedKw = 'Must be > 0';
  else if (kw > 20000) errors.ratedKw = 'Max 20,000 kW per unit';

  const pf = opt(row.powerFactor, 0.85);
  if (!isNum(pf) || pf <= 0 || pf > 1) errors.powerFactor = 'Between 0 and 1';
  else if (pf < 0.3) errors.powerFactor = 'Unrealistically low (< 0.3)';

  const df = opt(row.demandFactor, 1);
  if (!isNum(df) || df <= 0 || df > 1) errors.demandFactor = 'Between 0 and 1';

  const ph = opt(row.phases, 3);
  if (ph !== 1 && ph !== 3) errors.phases = '1 or 3';

  if (row.lengthM !== undefined && row.lengthM !== null && row.lengthM !== '') {
    const len = num(row.lengthM);
    if (!isNum(len) || len <= 0 || len > 5000) errors.lengthM = '0–5000 m';
  }
  if (row.category && !CATEGORY_KEYS.includes(row.category)) errors.category = 'Unknown category';
  return errors;
}

/**
 * Validate a whole schedule.
 * @returns {{ valid: object[], invalid: {index:number, row:object, errors:object}[], warnings: string[] }}
 */
export function validateSchedule(rows = []) {
  const valid = [];
  const invalid = [];
  const warnings = [];
  const seen = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const errors = validateLoadRow(row);
    if (Object.keys(errors).length) invalid.push({ index, row, errors });
    else valid.push(row);
    const key = String(row?.name ?? '').trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) || 0) + 1);
  });
  for (const [name, count] of seen) {
    if (count > 1) warnings.push(`“${name}” appears ${count} times — merge or rename duplicates.`);
  }
  return { valid, invalid, warnings };
}

// ------------------------------------------------- categories & profile --
export function categoryBreakdown(loads = []) {
  const totals = {};
  for (const l of loads) {
    const key = l.category || 'other';
    totals[key] ??= { category: key, label: LOAD_CATEGORIES[key]?.label || key, connectedKw: 0, demandKw: 0, demandKvar: 0, count: 0 };
    totals[key].connectedKw += l.connectedKw;
    totals[key].demandKw += l.demandKw;
    totals[key].demandKvar += l.demandKvar;
    totals[key].count += 1;
  }
  const totalDemand = Object.values(totals).reduce((s, t) => s + t.demandKw, 0);
  return Object.values(totals)
    .map((t) => ({
      ...t,
      connectedKw: round(t.connectedKw, 2),
      demandKw: round(t.demandKw, 2),
      demandKvar: round(t.demandKvar, 2),
      sharePct: totalDemand ? round((t.demandKw / totalDemand) * 100, 1) : 0,
    }))
    .sort((a, b) => b.demandKw - a.demandKw);
}

/**
 * Indicative 24-hour profile: each load's demand kW shaped by its category
 * curve. Real coincidence emerges from the curves, so the profile peak is
 * normally below the arithmetic sum of demands.
 */
export function loadProfile(loads = []) {
  const hours = Array.from({ length: 24 }, (_, h) => {
    const point = { hour: h, label: `${String(h).padStart(2, '0')}:00`, kw: 0, kvar: 0 };
    for (const key of CATEGORY_KEYS) point[key] = 0;
    return point;
  });
  for (const l of loads) {
    const curve = LOAD_CATEGORIES[l.category]?.profile || LOAD_CATEGORIES.other.profile;
    curve.forEach((f, h) => {
      hours[h][l.category] += l.demandKw * f;
      hours[h].kw += l.demandKw * f;
      hours[h].kvar += l.demandKvar * f;
    });
  }
  const out = hours.map((p) => {
    const rounded = { ...p };
    for (const key of [...CATEGORY_KEYS, 'kw', 'kvar']) rounded[key] = round(p[key], 2);
    rounded.kva = round(Math.hypot(p.kw, p.kvar), 2);
    return rounded;
  });
  const peak = out.reduce((m, p) => (p.kw > m.kw ? p : m), out[0]);
  const energyKwh = out.reduce((s, p) => s + p.kw, 0);
  const avg = energyKwh / 24;
  const used = CATEGORY_KEYS.filter((k) => out.some((p) => p[k] > 0));
  return {
    points: out,
    categories: used.map((k) => ({ key: k, label: LOAD_CATEGORIES[k].label })),
    peakKw: round(peak.kw, 2),
    peakKva: round(peak.kva, 2),
    peakHour: peak.label,
    averageKw: round(avg, 2),
    dailyEnergyKwh: round(energyKwh, 1),
    monthlyEnergyKwh: round(energyKwh * 30, 0),
    loadFactor: peak.kw ? round(avg / peak.kw, 3) : 0,
  };
}

// ------------------------------------------------------- protection --
export function nextBreaker(amps) {
  const rating = STANDARD_BREAKER_A.find((r) => r >= amps);
  if (rating === undefined) return { ratingA: null, type: 'Split feeder', note: 'Exceeds 4000 A' };
  const type = rating <= 63 ? 'MCB' : rating <= 800 ? 'MCCB' : 'ACB';
  return { ratingA: rating, type };
}

// ------------------------------------------------- branch circuits --
/**
 * Size a cable and protective device for every schedule line.
 *   Ib = design current of the line (all units at connected kW)
 *   In = next breaker >= Ib (x1.25 for motor/lift starting)
 *   Iz = derated cable capacity >= In, voltage drop checked with Ib
 */
export function branchCircuits(loads = [], settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const table = cableTableFor(s.conductor);
  const vLL = Number(s.voltage);
  const vLN = Number(s.phases) === 3 ? vLL / SQRT3 : vLL;
  return loads.map((l, index) => {
    const v = l.phases === 3 ? vLL : vLN;
    const ib = lineCurrent({ kw: l.connectedKw, voltage: v, powerFactor: l.powerFactor, phases: l.phases });
    const motorLike = l.category === 'motor' || l.category === 'lift';
    const breaker = nextBreaker(ib * (motorLike ? 1.25 : 1));
    const lengthM = l.lengthM ?? s.branchLengthM;
    const row = {
      index,
      name: l.name,
      panel: l.panel,
      category: l.category,
      phases: l.phases,
      voltage: round(v, 0),
      lengthM,
      designCurrentA: round(ib, 1),
      breaker,
      cable: null,
      status: 'ok',
      note: '',
    };
    try {
      const cable = selectCable({
        current: breaker.ratingA ?? ib,
        vdCurrent: ib,
        lengthM,
        voltage: v,
        powerFactor: l.powerFactor,
        phases: l.phases,
        derating: s.derating,
        maxVdPct: s.maxVdPct,
        maxRuns: s.maxRuns,
        table,
      });
      row.cable = {
        sizeSqmm: cable.sizeSqmm,
        runs: cable.runs,
        cores: l.phases === 3 ? '3.5C' : '2C',
        deratedCapacityA: round(cable.deratedCapacityA, 1),
        voltageDropPct: round(cable.voltageDropPct, 2),
        limitedBy: cable.limitedBy,
      };
      if (cable.voltageDropPct > s.maxVdPct * 0.9) {
        row.status = 'warn';
        row.note = 'Voltage drop near limit';
      }
      if (cable.runs > 1) {
        row.status = 'warn';
        row.note = `${cable.runs} parallel runs — consider a sub-distribution board`;
      }
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      row.status = 'fail';
      row.note = 'No cable fits — shorten the route or split the load';
    }
    return row;
  });
}

// ----------------------------------------------- power factor correction --
export function powerFactorCorrection({ kw, currentPf, targetPf = 0.95, voltage = 415, phases = 3 } = {}) {
  const p = Number(kw);
  const pf1 = Number(currentPf);
  const pf2 = Number(targetPf);
  if (!isNum(p) || p < 0) throw new ValidationError('kW must be 0 or more');
  if (!(pf1 > 0 && pf1 <= 1) || !(pf2 > 0 && pf2 <= 1)) {
    throw new ValidationError('Power factors must be between 0 and 1');
  }
  const tan1 = Math.tan(Math.acos(pf1));
  const tan2 = Math.tan(Math.acos(pf2));
  const required = Math.max(0, p * (tan1 - tan2));
  const bank = required > 0 ? (STANDARD_CAPACITOR_KVAR.find((k) => k >= required) ?? null) : 0;
  const kvaBefore = p / pf1;
  const qAfter = Math.max(0, p * tan1 - (bank ?? required));
  const kvaAfter = Math.hypot(p, qAfter);
  const pfAfter = kvaAfter ? p / kvaAfter : 1;
  const iBefore = p ? lineCurrent({ kw: p, voltage, powerFactor: pf1, phases }) : 0;
  const iAfter = p ? lineCurrent({ kw: p, voltage, powerFactor: pfAfter, phases }) : 0;
  return {
    currentPf: round(pf1, 3),
    targetPf: round(pf2, 3),
    requiredKvar: round(required, 1),
    recommendedBankKvar: bank,
    achievedPf: round(pfAfter, 3),
    kvaBefore: round(kvaBefore, 1),
    kvaAfter: round(kvaAfter, 1),
    kvaReleased: round(kvaBefore - kvaAfter, 1),
    currentBeforeA: round(iBefore, 1),
    currentAfterA: round(iAfter, 1),
    currentReductionPct: iBefore ? round(((iBefore - iAfter) / iBefore) * 100, 1) : 0,
    needed: pf1 < pf2,
  };
}

// --------------------------------------------------------- transformer --
export function transformerUtilisation(report, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!report?.transformer) return null;
  const md = report.summary.maxDemandKva;
  const kva = report.transformer.kva;
  const future = md * (1 + Number(s.futureMargin));
  const loadingPct = (md / kva) * 100;
  const futurePct = (future / kva) * 100;
  const limitPct = Number(s.maxLoading) * 100;
  const status = futurePct <= limitPct ? 'healthy' : futurePct <= 100 ? 'high' : 'overloaded';
  const idx = STANDARD_TRANSFORMER_KVA.indexOf(kva);
  const alternatives = STANDARD_TRANSFORMER_KVA
    .slice(Math.max(0, idx - 2), idx + 3)
    .map((r) => ({
      kva: r,
      loadingPct: round((md / r) * 100, 1),
      futureLoadingPct: round((future / r) * 100, 1),
      ok: (future / r) * 100 <= limitPct,
      recommended: r === kva,
    }));
  const vLL = Number(s.voltage);
  const fullLoadA = (kva * 1000) / (SQRT3 * vLL);
  const zPct = typicalImpedancePct(kva);
  const faultKa = fullLoadA / (zPct / 100) / 1000;
  return {
    kva,
    maxDemandKva: md,
    futureDemandKva: round(future, 1),
    loadingPct: round(loadingPct, 1),
    futureLoadingPct: round(futurePct, 1),
    limitPct: round(limitPct, 0),
    headroomKva: round(kva * Number(s.maxLoading) - md, 1),
    spareForGrowthPct: md ? round(((kva * Number(s.maxLoading)) / md - 1) * 100, 0) : 0,
    status,
    alternatives,
    lvFullLoadA: round(fullLoadA, 0),
    incomer: nextBreaker(fullLoadA),
    impedancePct: zPct,
    lvFaultKa: round(faultKa, 1),
  };
}

// ------------------------------------------------------- short circuit --
/**
 * Adiabatic withstand: S_min = I * sqrt(t) / k. Parallel runs share the fault.
 */
export function shortCircuitCheck({ sizeSqmm, runs = 1, faultKa, timeS = 0.2, conductor = 'cu' } = {}) {
  const k = (CONDUCTORS[conductor] || CONDUCTORS.cu).k;
  const ifA = Number(faultKa) * 1000;
  if (!isNum(ifA) || ifA <= 0 || !sizeSqmm) return null;
  const minSqmm = (ifA / Number(runs) * Math.sqrt(Number(timeS))) / k;
  return {
    faultKa: round(Number(faultKa), 2),
    timeS: Number(timeS),
    k,
    minSqmm: round(minSqmm, 1),
    actualSqmm: sizeSqmm,
    runs,
    pass: sizeSqmm >= minSqmm,
    marginPct: round(((sizeSqmm - minSqmm) / minSqmm) * 100, 0),
  };
}

/** How each candidate size performs for the main feeder (for the comparison table). */
export function cableCandidates({ current, settings, powerFactor }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const table = cableTableFor(s.conductor);
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const k = Number(s.phases) === 3 ? SQRT3 : 2;
  const phi = Math.acos(powerFactor);
  return sizes.map((size) => {
    const { ampacity, r, x } = table[size];
    const capacity = ampacity * Number(s.derating);
    const vd = ((k * current * (Number(s.cableLengthM) / 1000) * (r * Math.cos(phi) + x * Math.sin(phi))) / Number(s.voltage)) * 100;
    return {
      sizeSqmm: size,
      deratedCapacityA: round(capacity, 1),
      voltageDropPct: round(vd, 2),
      currentOk: capacity >= current,
      vdOk: vd <= Number(s.maxVdPct),
      lossKw: round((Number(s.phases) === 3 ? 3 : 2) * current ** 2 * r * (Number(s.cableLengthM) / 1000) / 1000, 2),
    };
  });
}

// ---------------------------------------------------------- full report --
/**
 * The estimate plus every advanced analysis. Invalid rows are skipped (and
 * reported) instead of failing the whole calculation, so the dashboard keeps
 * working while a user is half-way through typing.
 */
export function analyse({ loads = [], settings = {} } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!CONDUCTORS[s.conductor]) s.conductor = 'cu';
  const check = validateSchedule(loads);
  const validRows = check.valid;
  const base = estimate({ loads: validRows, settings: s, strict: false });
  const list = validRows.map((r, i) => (r instanceof Load ? r : new Load({ ...r, name: r?.name || `Load ${i + 1}` })));

  const profile = loadProfile(list);
  const categories = categoryBreakdown(list);
  const transformer = transformerUtilisation(base, s);
  const branches = branchCircuits(list, s);
  const pfc = base.summary.demandKw > 0
    ? powerFactorCorrection({
      kw: base.summary.demandKw / Number(s.diversityFactor),
      currentPf: base.summary.overallPf,
      targetPf: s.targetPf,
      voltage: s.voltage,
      phases: s.phases,
    })
    : null;
  const faultKa = Number(s.faultKa) > 0 ? Number(s.faultKa) : transformer?.lvFaultKa;
  const shortCircuit = base.cable
    ? shortCircuitCheck({
      sizeSqmm: base.cable.sizeSqmm,
      runs: base.cable.runs,
      faultKa,
      timeS: s.faultTimeS,
      conductor: s.conductor,
    })
    : null;
  const candidates = base.cable
    ? cableCandidates({ current: base.feeder.current, settings: s, powerFactor: base.summary.overallPf })
    : [];

  const connected = base.summary.connectedKw;
  const demand = {
    connectedKw: connected,
    demandKw: base.summary.demandKw,
    maxDemandKw: round(base.summary.demandKw / Number(s.diversityFactor), 2),
    maxDemandKva: base.summary.maxDemandKva,
    maxDemandKvar: round(base.summary.demandKvar / Number(s.diversityFactor), 2),
    overallDemandFactor: connected ? round(base.summary.demandKw / connected, 3) : 0,
    diversityFactor: Number(s.diversityFactor),
    coincidenceFactor: round(1 / Number(s.diversityFactor), 3),
    loadFactor: profile.loadFactor,
    peakHour: profile.peakHour,
    dailyEnergyKwh: profile.dailyEnergyKwh,
    monthlyEnergyKwh: profile.monthlyEnergyKwh,
    contractDemandKva: Math.ceil((base.summary.maxDemandKva * (1 + Number(s.futureMargin))) / 5) * 5,
    phaseSplit: {
      threePhaseKw: round(list.filter((l) => l.phases === 3).reduce((a, l) => a + l.demandKw, 0), 2),
      singlePhaseKw: round(list.filter((l) => l.phases === 1).reduce((a, l) => a + l.demandKw, 0), 2),
    },
  };

  const warnings = [...base.warnings, ...check.warnings];
  if (check.invalid.length) {
    warnings.unshift(`${check.invalid.length} row(s) have errors and are excluded from the calculation.`);
  }
  if (transformer?.status === 'overloaded') {
    warnings.push(`Transformer would be ${transformer.futureLoadingPct}% loaded with future growth — choose a larger rating.`);
  }
  if (shortCircuit && !shortCircuit.pass) {
    warnings.push(
      `Main cable fails short-circuit withstand: needs ≥ ${shortCircuit.minSqmm} mm² per run for ${shortCircuit.faultKa} kA / ${shortCircuit.timeS} s.`,
    );
  }
  const failing = branches.filter((b) => b.status === 'fail').length;
  if (failing) warnings.push(`${failing} branch circuit(s) could not be sized.`);
  if (demand.phaseSplit.singlePhaseKw > 0 && Number(s.phases) === 3) {
    const share = demand.phaseSplit.singlePhaseKw / (base.summary.demandKw || 1);
    if (share > 0.33) {
      warnings.push(`Single-phase loads are ${Math.round(share * 100)}% of demand — balance them across R, Y and B phases.`);
    }
  }

  return {
    ...base,
    warnings,
    analysis: {
      demand,
      profile,
      categories,
      transformer,
      branches,
      pfc,
      shortCircuit,
      cableCandidates: candidates,
      conductorLabel: CONDUCTORS[s.conductor].label,
      validation: { invalidCount: check.invalid.length, invalid: check.invalid.map(({ index, errors }) => ({ index, errors })) },
    },
  };
}
