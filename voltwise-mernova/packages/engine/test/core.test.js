import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  Load,
  ValidationError,
  estimate,
  lineCurrent,
  parseScheduleCsv,
  selectCable,
  selectTransformer,
  summarise,
  toScheduleCsv,
  voltageDropPercent,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));

const close = (actual, expected, tol = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} to be within ${tol} of ${expected}`,
  );

// ---- the twelve tests ported from tests/test_core.py ---------------------

test('three phase current textbook value', () => {
  // 100 kW, 415 V, pf 0.8 -> 100000 / (1.732 * 415 * 0.8) ~ 173.9 A
  close(lineCurrent({ kw: 100, voltage: 415, powerFactor: 0.8 }), 173.9, 0.1);
});

test('single phase current', () => {
  close(lineCurrent({ kw: 2.3, voltage: 230, powerFactor: 1.0, phases: 1 }), 10.0, 1e-9);
});

test('load demand and kvar', () => {
  const pump = new Load({ name: 'Pump', quantity: 2, ratedKw: 10, powerFactor: 0.8, demandFactor: 0.5 });
  assert.equal(pump.connectedKw, 20);
  assert.equal(pump.demandKw, 10);
  close(pump.demandKvar, 7.5); // tan(acos 0.8) = 0.75
});

test('summary adds kW and kVAr vectorially', () => {
  const s = summarise([
    { name: 'Heater', quantity: 1, ratedKw: 30, powerFactor: 1.0 }, // 30 kW, 0 kVAr
    { name: 'Motor', quantity: 1, ratedKw: 40, powerFactor: 0.8 },  // 40 kW, 30 kVAr
  ]);
  close(s.demandKw, 70);
  close(s.demandKvar, 30);
  close(s.demandKva, Math.hypot(70, 30));
  close(s.overallPf, 70 / Math.hypot(70, 30));
});

test('diversity factor reduces max demand', () => {
  const s = summarise([{ name: 'Lights', quantity: 1, ratedKw: 100, powerFactor: 1.0 }], 1.25);
  close(s.maxDemandKva, 80);
});

test('invalid inputs rejected', () => {
  assert.throws(() => new Load({ name: 'Bad', quantity: 1, ratedKw: 10, powerFactor: 1.2 }), ValidationError);
  assert.throws(() => new Load({ name: 'Bad', quantity: 0, ratedKw: 10 }), ValidationError);
  assert.throws(() => summarise([], 0.5), ValidationError);
});

test('voltage drop grows with length', () => {
  const short = voltageDropPercent({ current: 100, lengthM: 50, sizeSqmm: 35, voltage: 415, powerFactor: 0.85 });
  const long = voltageDropPercent({ current: 100, lengthM: 200, sizeSqmm: 35, voltage: 415, powerFactor: 0.85 });
  close(long, short * 4);
});

test('cable chosen by current for short run', () => {
  const c = selectCable({ current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85 });
  assert.equal(c.sizeSqmm, 25); // 120 A >= 100 A
  assert.equal(c.limitedBy, 'current');
  assert.equal(c.runs, 1);
});

test('cable upsized for voltage drop on long run', () => {
  const c = selectCable({ current: 100, lengthM: 400, voltage: 415, powerFactor: 0.85, maxVdPct: 3 });
  assert.ok(c.sizeSqmm > 25);
  assert.equal(c.limitedBy, 'voltage drop');
  assert.ok(c.voltageDropPct <= 3);
});

test('derating increases cable size', () => {
  const normal = selectCable({ current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85, derating: 1.0 });
  const derated = selectCable({ current: 100, lengthM: 20, voltage: 415, powerFactor: 0.85, derating: 0.7 });
  assert.ok(derated.sizeSqmm > normal.sizeSqmm);
});

test('parallel runs for large current', () => {
  const c = selectCable({ current: 900, lengthM: 30, voltage: 415, powerFactor: 0.9 });
  assert.ok(c.runs >= 2);
  assert.ok(c.deratedCapacityA >= 900);
});

test('transformer picks next standard rating', () => {
  // 300 kVA * 1.2 / 0.8 = 450 -> 500 kVA
  assert.equal(selectTransformer({ maxDemandKva: 300 }), 500);
  // no margin, 100% loading -> exact match allowed
  assert.equal(selectTransformer({ maxDemandKva: 630, maxLoading: 1.0, futureMargin: 0 }), 630);
});

// ---- new behaviour added with the port -----------------------------------

test('CSV round trip keeps the schedule intact', () => {
  const csv = 'name,quantity,rated_kw,power_factor,demand_factor,phases\nBorewell pumps,4,7.5,0.82,0.75,3\nLighting,1,12,0.95,0.9,1\n';
  const loads = parseScheduleCsv(csv);
  assert.equal(loads.length, 2);
  assert.equal(loads[0].ratedKw, 7.5);
  assert.equal(loads[1].phases, 1);
  const again = parseScheduleCsv(toScheduleCsv(loads));
  assert.deepEqual(again, loads);
});

test('CSV accepts camelCase headers and rejects a missing column', () => {
  const loads = parseScheduleCsv('Name,Qty,ratedKw,pf\nPumps,2,5,0.8\n');
  assert.equal(loads[0].quantity, 2);
  assert.equal(loads[0].powerFactor, 0.8);
  assert.throws(() => parseScheduleCsv('name,qty\nA,1\n'), ValidationError);
});

test('estimate produces the full report for the sample schedule', () => {
  const loads = parseScheduleCsv(golden.sampleCsv);
  const report = estimate({ loads, settings: golden.sampleSettings });
  assert.equal(report.breakdown.length, loads.length);
  assert.ok(report.feeder.current > 0);
  assert.ok(report.cable.sizeSqmm > 0);
  assert.ok(report.transformer.kva > 0);
  close(report.summary.demandKw, golden.expected.summary.demandKw, 0.01);
  close(report.summary.demandKva, golden.expected.summary.demandKva, 0.01);
  close(report.feeder.current, golden.expected.feederCurrent, 0.2);
  assert.equal(report.cable.sizeSqmm, golden.expected.cableSizeSqmm);
  assert.equal(report.transformer.kva, golden.expected.transformerKva);
});

test('estimate on an empty schedule returns zeroes, not NaN', () => {
  const report = estimate({ loads: [] });
  assert.equal(report.summary.demandKva, 0);
  assert.equal(report.feeder.current, 0);
  assert.equal(report.cable, null);
  assert.equal(report.transformer, null);
});
