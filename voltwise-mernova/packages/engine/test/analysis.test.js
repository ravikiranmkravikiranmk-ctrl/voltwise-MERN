import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyse,
  branchCircuits,
  estimate,
  guessCategory,
  importScheduleCsv,
  Load,
  loadProfile,
  nextBreaker,
  powerFactorCorrection,
  shortCircuitCheck,
  validateLoadRow,
  validateSchedule,
} from '../src/index.js';

const close = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b}`);

const sample = [
  { name: 'Borewell pumps', quantity: 4, ratedKw: 7.5, powerFactor: 0.82, demandFactor: 0.75, phases: 3 },
  { name: 'Air conditioners', quantity: 10, ratedKw: 2.2, powerFactor: 0.9, demandFactor: 0.8, phases: 1 },
  { name: 'Lighting', quantity: 1, ratedKw: 12, powerFactor: 0.95, demandFactor: 0.9, phases: 1 },
];

test('row validation reports every bad field without throwing', () => {
  const errors = validateLoadRow({ name: '', quantity: 0, ratedKw: -1, powerFactor: 1.2, demandFactor: 0, phases: 2 });
  assert.deepEqual(Object.keys(errors).sort(), ['demandFactor', 'name', 'phases', 'powerFactor', 'quantity', 'ratedKw']);
  assert.deepEqual(validateLoadRow(sample[0]), {});
});

test('schedule validation splits valid/invalid rows and flags duplicates', () => {
  const res = validateSchedule([...sample, { name: 'Lighting', quantity: 1, ratedKw: 1 }, { name: 'x', quantity: 0, ratedKw: 1 }]);
  assert.equal(res.valid.length, 4);
  assert.equal(res.invalid.length, 1);
  assert.equal(res.invalid[0].index, 4);
  assert.match(res.warnings[0], /lighting/);
});

test('category is guessed from the name', () => {
  assert.equal(guessCategory('Borewell pumps'), 'motor');
  assert.equal(guessCategory('LED street lights'), 'lighting');
  assert.equal(guessCategory('Misc'), 'other');
  assert.equal(new Load({ name: 'Lift', ratedKw: 11 }).category, 'lift');
});

test('PF correction: textbook capacitor sizing', () => {
  // 100 kW from 0.8 to 0.95: 100*(0.75-0.3287) = 42.13 kVAr -> 50 kVAr bank
  const r = powerFactorCorrection({ kw: 100, currentPf: 0.8, targetPf: 0.95 });
  close(r.requiredKvar, 42.1, 0.1);
  assert.equal(r.recommendedBankKvar, 50);
  assert.ok(r.achievedPf >= 0.95);
  assert.ok(r.currentAfterA < r.currentBeforeA);
});

test('breakers step through MCB, MCCB, ACB', () => {
  assert.deepEqual(nextBreaker(14), { ratingA: 16, type: 'MCB' });
  assert.deepEqual(nextBreaker(170), { ratingA: 200, type: 'MCCB' });
  assert.equal(nextBreaker(900).type, 'ACB');
});

test('short-circuit withstand uses S = I*sqrt(t)/k', () => {
  // 10 kA, 1 s, Cu k=143 -> 69.9 mm2
  const r = shortCircuitCheck({ sizeSqmm: 70, faultKa: 10, timeS: 1 });
  close(r.minSqmm, 69.9, 0.1);
  assert.equal(r.pass, true);
  assert.equal(shortCircuitCheck({ sizeSqmm: 50, faultKa: 10, timeS: 1, conductor: 'al' }).pass, false);
});

test('profile peak never exceeds the sum of demands', () => {
  const loads = sample.map((r) => new Load(r));
  const p = loadProfile(loads);
  const sum = loads.reduce((s, l) => s + l.demandKw, 0);
  assert.equal(p.points.length, 24);
  assert.ok(p.peakKw <= sum + 1e-9);
  assert.ok(p.loadFactor > 0 && p.loadFactor <= 1);
});

test('branch circuits size a breaker and cable for every line', () => {
  const rows = branchCircuits(sample.map((r) => new Load(r)), { voltage: 415, derating: 0.8 });
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.ok(r.breaker.ratingA >= r.designCurrentA);
    assert.ok(r.cable.deratedCapacityA >= r.breaker.ratingA);
  }
});

test('analyse keeps the core estimate identical and skips bad rows', () => {
  const base = estimate({ loads: sample, settings: { diversityFactor: 1.1 } });
  const full = analyse({ loads: [...sample, { name: 'oops', quantity: 0, ratedKw: 1 }], settings: { diversityFactor: 1.1 } });
  assert.deepEqual(full.summary, base.summary);
  assert.equal(full.analysis.validation.invalidCount, 1);
  assert.ok(full.analysis.transformer.kva >= base.summary.maxDemandKva);
  assert.ok(full.analysis.cableCandidates.length > 5);
});

test('aluminium conductor needs a bigger cable than copper', () => {
  const cu = estimate({ loads: sample, settings: { conductor: 'cu', cableLengthM: 80 } });
  const al = estimate({ loads: sample, settings: { conductor: 'al', cableLengthM: 80 } });
  assert.ok(al.cable.sizeSqmm > cu.cable.sizeSqmm);
});

test('lenient CSV import reports bad lines by number', () => {
  const csv = 'name,qty,kw,pf,category\nPumps,2,5,0.8,motor\nBad,0,5,0.8,\nLights,1,3,0.95,Lighting\n';
  const { accepted, rejected } = importScheduleCsv(csv, validateLoadRow);
  assert.equal(accepted.length, 2);
  assert.equal(accepted[1].category, 'lighting');
  assert.equal(rejected[0].line, 3);
});

test('non-strict estimate turns impossible sizing into a warning', () => {
  const huge = [{ name: 'Smelter', quantity: 1, ratedKw: 5000, powerFactor: 0.9, demandFactor: 1, phases: 3 }];
  assert.throws(() => estimate({ loads: huge }));
  const r = analyse({ loads: huge });
  assert.equal(r.cable, null);
  assert.ok(r.warnings.length >= 1);
});
