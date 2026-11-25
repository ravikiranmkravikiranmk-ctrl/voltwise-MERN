import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configure the app for the file store BEFORE it is imported (env is read at
// import time), so the tests never need a running MongoDB.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
const dataDir = await mkdtemp(join(tmpdir(), 'voltwise-test-'));
process.env.DATA_DIR = dataDir;

const { createApp } = await import('../src/app.js');

let server;
let base;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const api = async (path, options = {}) => {
  const res = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const sampleLoads = [
  { name: 'Borewell pumps', quantity: 4, ratedKw: 7.5, powerFactor: 0.82, demandFactor: 0.75, phases: 3 },
  { name: 'Air conditioners', quantity: 10, ratedKw: 2.2, powerFactor: 0.9, demandFactor: 0.8, phases: 1 },
  { name: 'Lighting', quantity: 1, ratedKw: 12, powerFactor: 0.95, demandFactor: 0.9, phases: 1 },
  { name: 'Lift', quantity: 2, ratedKw: 11, powerFactor: 0.8, demandFactor: 0.5, phases: 3 },
  { name: 'Workshop machines', quantity: 6, ratedKw: 5.5, powerFactor: 0.8, demandFactor: 0.6, phases: 3 },
  { name: 'Socket outlets', quantity: 1, ratedKw: 15, powerFactor: 0.9, demandFactor: 0.4, phases: 1 },
];

test('GET /api/health reports the active store', async () => {
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.store, 'file');
});

test('GET /api/reference returns the cable table', async () => {
  const { status, body } = await api('/api/reference');
  assert.equal(status, 200);
  assert.equal(body.cableTable.length, 15);
  assert.equal(body.cableTable[0].sizeSqmm, 2.5);
  assert.ok(body.transformerRatings.includes(160));
});

test('POST /api/estimate matches the reference Python result', async () => {
  const { status, body } = await api('/api/estimate', {
    method: 'POST',
    body: JSON.stringify({
      loads: sampleLoads,
      settings: { voltage: 415, diversityFactor: 1.15, derating: 0.9, cableLengthM: 60 },
    }),
  });
  assert.equal(status, 200);
  assert.equal(body.summary.demandKw, 87.7);
  assert.equal(body.summary.demandKva, 102.88);
  assert.ok(Math.abs(body.feeder.current - 124.5) < 0.2);
  assert.equal(body.cable.sizeSqmm, 35);
  assert.equal(body.transformer.kva, 160);
  assert.equal(body.breakdown.length, 6);
  assert.equal(body.meta.loadCount, 6);
});

test('POST /api/estimate rejects a bad power factor', async () => {
  const { status, body } = await api('/api/estimate', {
    method: 'POST',
    body: JSON.stringify({ loads: [{ name: 'Bad', quantity: 1, ratedKw: 5, powerFactor: 1.4 }] }),
  });
  assert.equal(status, 400);
  assert.match(body.error, /power factor/i);
});

test('POST /api/import/csv parses JSON and text/csv bodies', async () => {
  const csv = 'name,quantity,rated_kw,power_factor,demand_factor,phases\nPumps,2,7.5,0.82,0.75,3\n';

  const asJson = await api('/api/import/csv', { method: 'POST', body: JSON.stringify({ csv }) });
  assert.equal(asJson.status, 200);
  assert.equal(asJson.body.count, 1);
  assert.equal(asJson.body.loads[0].ratedKw, 7.5);

  const res = await fetch(`${base}/api/import/csv`, {
    method: 'POST',
    headers: { 'content-type': 'text/csv' },
    body: csv,
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).count, 1);
});

test('project lifecycle: create, read, update, estimate, delete', async () => {
  const created = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sample apartment block', client: 'Voltwise', loads: sampleLoads }),
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.ok(id);
  assert.equal(created.body.lastReport.cable.sizeSqmm, 35);

  const list = await api('/api/projects');
  assert.equal(list.body.count, 1);

  const fetched = await api(`/api/projects/${id}`);
  assert.equal(fetched.body.name, 'Sample apartment block');

  const updated = await api(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ settings: { diversityFactor: 1.4, cableLengthM: 120 } }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.settings.diversityFactor, 1.4);
  assert.ok(updated.body.lastReport.summary.maxDemandKva < 100);

  const reEstimated = await api(`/api/projects/${id}/estimate`, {
    method: 'POST',
    body: JSON.stringify({ settings: { cableLengthM: 400 } }),
  });
  assert.equal(reEstimated.status, 200);
  assert.equal(reEstimated.body.cable.limitedBy, 'voltage drop');

  const removed = await fetch(`${base}/api/projects/${id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);

  const gone = await api(`/api/projects/${id}`);
  assert.equal(gone.status, 404);
});

test('unknown routes return a JSON 404', async () => {
  const { status, body } = await api('/api/nope');
  assert.equal(status, 404);
  assert.match(body.error, /No route/);
});

test('GET /api lists the endpoints', async () => {
  const { status, body } = await api('/api');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.endpoints));
  assert.ok(body.endpoints.includes('POST /api/estimate'));
});

test('GET / serves the UI when built, otherwise explains how to get it', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  if (type.includes('text/html')) {
    assert.match(text, /<div id="root">/);
  } else {
    assert.match(text, /web app is not built|Voltwise API/);
  }
});

// ---- v2: history, autosave, duplicate, search, export ---------------------

test('POST /api/analyse returns the advanced analysis', async () => {
  const { status, body } = await api('/api/analyse', {
    method: 'POST',
    body: JSON.stringify({ loads: sampleLoads, settings: { diversityFactor: 1.1, conductor: 'al' } }),
  });
  assert.equal(status, 200);
  assert.equal(body.cable.conductor, 'al');
  assert.equal(body.analysis.profile.points.length, 24);
  assert.equal(body.analysis.branches.length, 6);
  assert.ok(body.analysis.pfc.requiredKvar >= 0);
  assert.ok(body.analysis.transformer.alternatives.length >= 3);
});

test('manual saves add revisions, autosaves do not, and restore works', async () => {
  const created = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'History test', client: 'PCPL', engineer: 'Dinesh', loads: sampleLoads }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.revision, 1);
  const id = created.body.id;

  const auto = await api(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ autosave: true, loads: sampleLoads.slice(0, 2) }),
  });
  assert.equal(auto.body.revision, 1);
  assert.ok(auto.body.lastAutosaveAt);

  const manual = await api(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ loads: sampleLoads.slice(0, 3), revisionNote: 'Three loads', status: 'review' }),
  });
  assert.equal(manual.body.revision, 2);
  assert.equal(manual.body.status, 'review');

  const history = await api(`/api/projects/${id}/revisions`);
  assert.equal(history.body.revisions.length, 2);
  assert.equal(history.body.revisions[0].rev, 2);
  assert.equal(history.body.revisions[0].loadCount, 3);

  const restored = await api(`/api/projects/${id}/revisions/1/restore`, { method: 'POST' });
  assert.equal(restored.body.revision, 3);
  assert.equal(restored.body.loads.length, 6);
});

test('duplicate and search projects', async () => {
  const created = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Hospital block', site: 'Ranebennur', loads: sampleLoads }),
  });
  const dup = await api(`/api/projects/${created.body.id}/duplicate`, { method: 'POST' });
  assert.equal(dup.status, 201);
  assert.equal(dup.body.name, 'Hospital block (copy)');
  assert.equal(dup.body.loads.length, 6);

  const found = await api('/api/projects?q=ranebennur');
  assert.equal(found.body.count, 2);
  assert.ok(found.body.projects[0].digest);
  assert.equal(found.body.projects[0].revisions, undefined);
});

test('PDF and Excel exports are valid files', async () => {
  const payload = JSON.stringify({ project: { name: 'Export test', client: 'ACME' }, loads: sampleLoads, settings: { diversityFactor: 1.1 } });
  const pdf = await fetch(`${base}/api/export/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');

  const xlsx = await fetch(`${base}/api/export/xlsx`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
  assert.equal(xlsx.status, 200);
  const xBytes = Buffer.from(await xlsx.arrayBuffer());
  assert.equal(xBytes.subarray(0, 2).toString(), 'PK');

  const created = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Saved export', loads: sampleLoads }) });
  const saved = await fetch(`${base}/api/projects/${created.body.id}/export.pdf`);
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get('content-disposition'), /saved-export-report\.pdf/);
});

test('invalid conductor and status are rejected', async () => {
  const bad = await api('/api/analyse', { method: 'POST', body: JSON.stringify({ loads: sampleLoads, settings: { conductor: 'gold' } }) });
  assert.equal(bad.status, 400);
  const badStatus = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x', status: 'shipped' }) });
  assert.equal(badStatus.status, 400);
});
