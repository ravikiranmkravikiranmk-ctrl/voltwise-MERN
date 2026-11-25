/**
 * Report exports: a professional multi-page PDF (pdfkit) and an Excel
 * workbook with live formulas (exceljs). Both are built from the same
 * analysed report the API and the web dashboard use.
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { LOAD_CATEGORIES } from '@voltwise/engine';

import { ENGINE_VERSION, buildReport } from './estimateService.js';

const BRAND = '#0f6e73';
const INK = '#14202e';
const MUTED = '#5b6b7e';
const LINE = '#d6dee8';
const SOFT = '#eef4f7';
const GOOD = '#1f8a4c';
const WARN = '#b7791f';
const BAD = '#c53030';

/** Standard PDF fonts are WinAnsi only — map the few symbols we use. */
const t = (v) => String(v ?? '')
  .replace(/≥/g, '>=')
  .replace(/≤/g, '<=')
  .replace(/φ/g, 'phi')
  .replace(/√/g, 'sqrt')
  .replace(/[‘’]/g, "'")
  .replace(/→/g, '->')
  .replace(/⚠/g, '!')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—“”•…]/g, '');

const n = (v, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v))
  ? '—'
  : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));

const catLabel = (k) => LOAD_CATEGORIES[k]?.label || k || 'Other';

export function slugify(name) {
  return (String(name || 'voltwise-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'voltwise-report');
}

export function prepare({ project = {}, loads = [], settings = {} }) {
  const report = buildReport({ loads, settings });
  return {
    project: {
      name: project.name || 'Untitled project',
      client: project.client || '',
      site: project.site || '',
      engineer: project.engineer || '',
      notes: project.notes || '',
      status: project.status || 'draft',
      revision: project.revision || null,
    },
    report,
    settings: report.settings,
    loads,
  };
}

// =========================================================== PDF ==========
export function renderPdf(input) {
  const { project, report, settings } = prepare(input);
  const a = report.analysis;
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: `${project.name} — Load & Cable Sizing Report`, Author: project.engineer || 'Voltwise', Creator: ENGINE_VERSION } });
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 24;

  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

  const heading = (num, title, sub) => {
    ensure(60);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.roundedRect(L, y, 22, 16, 3).fill(BRAND);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(num, L, y + 4, { width: 22, align: 'center' });
    doc.fillColor(INK).fontSize(13).text(t(title), L + 30, y + 1);
    if (sub) doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(t(sub), L + 30, doc.y + 1);
    doc.moveDown(0.5);
    doc.x = L;
  };

  /** Simple table with header repeat on page break. cols: [{ label, width, align, get, color }] */
  const table = (cols, rows, { fontSize = 8, zebra = true } = {}) => {
    const totalW = cols.reduce((s, c) => s + c.width, 0);
    const scale = W / totalW;
    const widths = cols.map((c) => c.width * scale);
    const rowH = fontSize + 8;
    ensure(rowH * Math.min(rows.length + 1, 4) + 4);
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(L, y, W, rowH + 2).fill(INK);
      let x = L;
      doc.font('Helvetica-Bold').fontSize(fontSize - 0.5).fillColor('#fff');
      cols.forEach((c, i) => {
        doc.text(t(c.label), x + 4, y + 5, { width: widths[i] - 8, height: fontSize + 2, align: c.align || 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + rowH + 2;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      if (doc.y + rowH > bottom()) { doc.addPage(); drawHeader(); }
      const y = doc.y;
      if (zebra && ri % 2 === 1) doc.rect(L, y, W, rowH).fill(SOFT);
      let x = L;
      doc.font(row.__bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      cols.forEach((c, i) => {
        doc.fillColor(c.color ? c.color(row) : INK)
          .text(t(c.get(row)), x + 4, y + 4.5, { width: widths[i] - 8, height: fontSize + 2, align: c.align || 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.moveTo(L, y + rowH).lineTo(L + W, y + rowH).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.y = y + rowH;
    });
    doc.x = L;
    doc.moveDown(0.6);
  };

  const kv = (pairs, cols = 2) => {
    const colW = W / cols;
    const rows = Math.ceil(pairs.length / cols);
    ensure(rows * 16 + 6);
    const y0 = doc.y;
    pairs.forEach(([k, v], i) => {
      const cx = L + (i % cols) * colW;
      const cy = y0 + Math.floor(i / cols) * 16;
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(t(k), cx, cy, { width: colW * 0.5, height: 11, lineBreak: false, ellipsis: true });
      doc.font('Helvetica-Bold').fillColor(INK).text(t(v), cx + colW * 0.5, cy, { width: colW * 0.48, height: 11, lineBreak: false, ellipsis: true });
    });
    doc.y = y0 + rows * 16 + 4;
    doc.x = L;
  };

  // ---------------------------------------------------------- cover band
  doc.rect(0, 0, doc.page.width, 118).fill(INK);
  doc.rect(0, 118, doc.page.width, 4).fill(BRAND);
  doc.fillColor('#7fd8d3').font('Helvetica-Bold').fontSize(8).text('VOLTWISE  ·  LOAD STUDIO', L, 30, { characterSpacing: 2 });
  doc.fillColor('#fff').fontSize(20).text('Electrical Load & Cable Sizing Report', L, 46);
  doc.fillColor('#b9c7d6').font('Helvetica').fontSize(10).text(t(project.name), L, 74);
  doc.fontSize(8).text(
    `Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}  ·  ${project.status.toUpperCase()}${project.revision ? `  ·  Rev ${project.revision}` : ''}`,
    L, 92,
  );
  doc.y = 140;
  doc.x = L;

  kv([
    ['Project', project.name],
    ['Client', project.client || '—'],
    ['Site / location', project.site || '—'],
    ['Prepared by', project.engineer || '—'],
    ['Supply', `${settings.voltage} V, ${settings.phases}-phase`],
    ['Conductor', `${a.conductorLabel} XLPE armoured`],
  ]);

  // ---------------------------------------------------------- KPI tiles
  const tiles = [
    ['Connected load', `${n(report.summary.connectedKw, 1)} kW`],
    ['Maximum demand', `${n(report.summary.maxDemandKva, 1)} kVA`],
    ['Feeder current', `${n(report.feeder.current, 1)} A`],
    ['Power factor', n(report.summary.overallPf, 3)],
    ['Main cable', report.cable ? `${report.cable.runs > 1 ? `${report.cable.runs}x ` : ''}${report.cable.sizeSqmm} mm²` : '—'],
    ['Transformer', report.transformer ? `${report.transformer.kva} kVA` : '—'],
  ];
  ensure(70);
  const tw = (W - 5 * 8) / 6;
  const ty = doc.y + 6;
  tiles.forEach(([k, v], i) => {
    const x = L + i * (tw + 8);
    doc.roundedRect(x, ty, tw, 54, 5).fillAndStroke(SOFT, LINE);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(t(k).toUpperCase(), x + 7, ty + 9, { width: tw - 14, characterSpacing: 0.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(t(v), x + 7, ty + 26, { width: tw - 14 });
  });
  doc.y = ty + 66;
  doc.x = L;

  if (report.warnings.length) {
    ensure(20 + report.warnings.length * 13);
    const wy = doc.y;
    const h = 14 + report.warnings.length * 12;
    doc.roundedRect(L, wy, W, h, 4).fillAndStroke('#fff8e6', '#f0d28a');
    doc.fillColor(WARN).font('Helvetica-Bold').fontSize(8.5).text('Design checks to review', L + 8, wy + 6);
    doc.font('Helvetica').fillColor(INK).fontSize(8);
    report.warnings.forEach((w, i) => doc.text(`•  ${t(w)}`, L + 8, wy + 19 + i * 12, { width: W - 16, lineBreak: false, ellipsis: true }));
    doc.y = wy + h + 6;
    doc.x = L;
  }

  // ---------------------------------------------------------- 01 schedule
  heading('01', 'Load schedule', `${report.breakdown.length} lines · demand factors applied per line`);
  table([
    { label: '#', width: 18, align: 'right', get: (r) => r.__i },
    { label: 'Equipment', width: 120, get: (r) => r.name },
    { label: 'Category', width: 70, get: (r) => (r.__bold ? '' : catLabel(r.category)) },
    { label: 'Panel', width: 40, get: (r) => r.panel || '—' },
    { label: 'Qty', width: 28, align: 'right', get: (r) => r.quantity },
    { label: 'kW/unit', width: 42, align: 'right', get: (r) => n(r.ratedKw, 2) },
    { label: 'PF', width: 30, align: 'right', get: (r) => n(r.powerFactor, 2) },
    { label: 'DF', width: 30, align: 'right', get: (r) => n(r.demandFactor, 2) },
    { label: 'Ph', width: 22, align: 'right', get: (r) => r.phases },
    { label: 'Conn. kW', width: 48, align: 'right', get: (r) => n(r.connectedKw, 2) },
    { label: 'Dem. kW', width: 48, align: 'right', get: (r) => n(r.demandKw, 2) },
    { label: 'kVAr', width: 40, align: 'right', get: (r) => n(r.demandKvar, 2) },
    { label: 'Share', width: 44, align: 'right', get: (r) => `${n(r.shareOfDemandPct, 1)}%` },
  ], [
    ...report.breakdown.map((r, i) => ({ ...r, __i: i + 1 })),
    {
      __bold: true, __i: '', name: 'TOTAL', category: '', panel: ' ', quantity: '', ratedKw: null, powerFactor: null, demandFactor: null, phases: '',
      connectedKw: report.summary.connectedKw, demandKw: report.summary.demandKw, demandKvar: report.summary.demandKvar, shareOfDemandPct: 100,
    },
  ], { fontSize: 7.5 });

  // ---------------------------------------------------------- 02 demand
  heading('02', 'Demand analysis', 'Connected load → demand → maximum demand after diversity');
  const d = a.demand;
  kv([
    ['Connected load', `${n(d.connectedKw, 2)} kW`],
    ['Demand (after DF)', `${n(d.demandKw, 2)} kW`],
    ['Overall demand factor', n(d.overallDemandFactor, 3)],
    ['Diversity factor', n(d.diversityFactor, 2)],
    ['Maximum demand', `${n(d.maxDemandKw, 2)} kW / ${n(d.maxDemandKva, 2)} kVA`],
    ['Reactive demand', `${n(d.maxDemandKvar, 2)} kVAr`],
    ['Overall power factor', n(report.summary.overallPf, 3)],
    ['Suggested contract demand', `${d.contractDemandKva} kVA`],
    ['Load factor (profile)', n(d.loadFactor, 3)],
    ['Profile peak hour', d.peakHour],
    ['Est. daily energy', `${n(d.dailyEnergyKwh, 0)} kWh`],
    ['Est. monthly energy', `${n(d.monthlyEnergyKwh, 0)} kWh`],
    ['3-phase demand', `${n(d.phaseSplit.threePhaseKw, 2)} kW`],
    ['1-phase demand', `${n(d.phaseSplit.singlePhaseKw, 2)} kW`],
  ]);

  // profile bar chart
  ensure(150);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Indicative 24-hour load profile (kW)', L, doc.y + 4);
  const cy = doc.y + 6;
  const ch = 100;
  const pts = a.profile.points;
  const maxKw = Math.max(...pts.map((p) => p.kw), 1);
  const bw = W / 24;
  doc.moveTo(L, cy + ch).lineTo(L + W, cy + ch).lineWidth(0.6).strokeColor(LINE).stroke();
  pts.forEach((p, i) => {
    const h = (p.kw / maxKw) * (ch - 10);
    const peak = p.label === a.profile.peakHour;
    doc.rect(L + i * bw + 2, cy + ch - h, bw - 4, h).fill(peak ? '#d0632b' : BRAND);
    if (i % 3 === 0) doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(p.label, L + i * bw, cy + ch + 3, { width: bw * 2 });
  });
  doc.fillColor(MUTED).fontSize(6.5).text(`peak ${n(a.profile.peakKw, 1)} kW at ${a.profile.peakHour}`, L, cy - 2, { width: W, align: 'right' });
  doc.y = cy + ch + 16;
  doc.x = L;

  table([
    { label: 'Category', width: 140, get: (r) => r.label },
    { label: 'Lines', width: 40, align: 'right', get: (r) => r.count },
    { label: 'Connected kW', width: 80, align: 'right', get: (r) => n(r.connectedKw, 2) },
    { label: 'Demand kW', width: 80, align: 'right', get: (r) => n(r.demandKw, 2) },
    { label: 'kVAr', width: 70, align: 'right', get: (r) => n(r.demandKvar, 2) },
    { label: 'Share', width: 60, align: 'right', get: (r) => `${n(r.sharePct, 1)}%` },
  ], a.categories);

  // ---------------------------------------------------------- 03 main feeder
  heading('03', 'Main feeder cable', `${a.conductorLabel} XLPE armoured · ${settings.cableLengthM} m · derating ${settings.derating} · Vd limit ${settings.maxVdPct}%`);
  if (report.cable) {
    kv([
      ['Recommended cable', `${report.cable.runs > 1 ? `${report.cable.runs} runs × ` : ''}${settings.phases === 3 ? '3.5C' : '2C'} × ${report.cable.sizeSqmm} mm² ${a.conductorLabel}`],
      ['Governing check', report.cable.limitedBy],
      ['Design current', `${n(report.feeder.current, 1)} A`],
      ['Derated capacity', `${n(report.cable.deratedCapacityA, 1)} A`],
      ['Voltage drop', `${n(report.cable.voltageDropPct, 2)} %`],
      ['Incomer protection', a.transformer?.incomer?.ratingA ? `${a.transformer.incomer.ratingA} A ${a.transformer.incomer.type}` : '—'],
    ]);
    if (a.shortCircuit) {
      kv([
        ['Prospective fault (Isc)', `${n(a.shortCircuit.faultKa, 2)} kA for ${a.shortCircuit.timeS} s${Number(settings.faultKa) > 0 ? '' : ' (est.)'}`],
        ['Min. size for withstand', `${n(a.shortCircuit.minSqmm, 1)} mm² (k = ${a.shortCircuit.k})`],
        ['Short-circuit check', a.shortCircuit.pass ? `PASS (+${a.shortCircuit.marginPct}% margin)` : 'FAIL'],
      ]);
    }
    const pick = a.cableCandidates.findIndex((c) => c.sizeSqmm === report.cable.sizeSqmm);
    const slice = a.cableCandidates.slice(Math.max(0, pick - 3), pick + 3);
    table([
      { label: 'Size mm²', width: 60, align: 'right', get: (r) => r.sizeSqmm },
      { label: 'Derated A (1 run)', width: 90, align: 'right', get: (r) => n(r.deratedCapacityA, 1) },
      { label: 'Current check', width: 80, get: (r) => (r.currentOk ? 'OK' : 'Too small'), color: (r) => (r.currentOk ? GOOD : BAD) },
      { label: 'Vd %', width: 60, align: 'right', get: (r) => n(r.voltageDropPct, 2) },
      { label: 'Vd check', width: 70, get: (r) => (r.vdOk ? 'OK' : 'Exceeds'), color: (r) => (r.vdOk ? GOOD : BAD) },
      { label: 'Loss kW', width: 60, align: 'right', get: (r) => n(r.lossKw, 2) },
      { label: '', width: 70, get: (r) => (r.sizeSqmm === report.cable.sizeSqmm ? '◄ selected'.replace('◄', '<') : ''), color: () => BRAND },
    ], slice);
  } else {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No main cable could be sized — see design checks.');
  }

  // ---------------------------------------------------------- 04 transformer
  heading('04', 'Transformer capacity', `Future allowance ${Math.round(settings.futureMargin * 100)}% · max loading ${Math.round(settings.maxLoading * 100)}%`);
  if (a.transformer) {
    const tr = a.transformer;
    kv([
      ['Recommended rating', `${tr.kva} kVA`],
      ['Status', tr.status.toUpperCase()],
      ['Loading at max demand', `${n(tr.loadingPct, 1)} %`],
      ['Loading with growth', `${n(tr.futureLoadingPct, 1)} %`],
      ['Headroom to loading limit', `${n(tr.headroomKva, 1)} kVA`],
      ['LV full-load current', `${n(tr.lvFullLoadA, 0)} A`],
      ['Typical impedance', `${tr.impedancePct} %`],
      ['Est. LV fault level', `${n(tr.lvFaultKa, 1)} kA`],
    ]);
    table([
      { label: 'Rating kVA', width: 80, align: 'right', get: (r) => r.kva },
      { label: 'Loading now %', width: 90, align: 'right', get: (r) => n(r.loadingPct, 1) },
      { label: 'With growth %', width: 90, align: 'right', get: (r) => n(r.futureLoadingPct, 1) },
      { label: 'Within limit', width: 80, get: (r) => (r.ok ? 'Yes' : 'No'), color: (r) => (r.ok ? GOOD : BAD) },
      { label: '', width: 80, get: (r) => (r.recommended ? '< recommended' : ''), color: () => BRAND },
    ], tr.alternatives);
  }

  // ---------------------------------------------------------- 05 PF
  if (a.pfc) {
    heading('05', 'Power factor correction', `Target ${settings.targetPf}`);
    const p = a.pfc;
    kv([
      ['Existing PF', n(p.currentPf, 3)],
      ['Target PF', n(p.targetPf, 3)],
      ['Required compensation', `${n(p.requiredKvar, 1)} kVAr`],
      ['Recommended APFC bank', p.needed ? `${p.recommendedBankKvar} kVAr` : 'Not required'],
      ['PF achieved', n(p.achievedPf, 3)],
      ['kVA released', `${n(p.kvaReleased, 1)} kVA`],
      ['Current before / after', `${n(p.currentBeforeA, 1)} A / ${n(p.currentAfterA, 1)} A`],
      ['Current reduction', `${n(p.currentReductionPct, 1)} %`],
    ]);
  }

  // ---------------------------------------------------------- 06 branches
  heading('06', 'Branch circuit schedule', `Each line on its own circuit · default length ${settings.branchLengthM} m · motors/lifts at 125%`);
  table([
    { label: 'Equipment', width: 120, get: (r) => r.name },
    { label: 'Panel', width: 40, get: (r) => r.panel || '—' },
    { label: 'Ph', width: 22, align: 'right', get: (r) => r.phases },
    { label: 'Ib A', width: 44, align: 'right', get: (r) => n(r.designCurrentA, 1) },
    { label: 'Protection', width: 70, get: (r) => (r.breaker.ratingA ? `${r.breaker.ratingA} A ${r.breaker.type}` : r.breaker.type) },
    { label: 'Cable', width: 100, get: (r) => (r.cable ? `${r.cable.runs > 1 ? `${r.cable.runs}x ` : ''}${r.cable.cores} × ${r.cable.sizeSqmm} mm²` : '—') },
    { label: 'Iz A', width: 44, align: 'right', get: (r) => (r.cable ? n(r.cable.deratedCapacityA, 0) : '—') },
    { label: 'Len m', width: 38, align: 'right', get: (r) => r.lengthM },
    { label: 'Vd %', width: 38, align: 'right', get: (r) => (r.cable ? n(r.cable.voltageDropPct, 2) : '—') },
    { label: 'Status', width: 50, get: (r) => r.status.toUpperCase(), color: (r) => ({ ok: GOOD, warn: WARN, fail: BAD }[r.status]) },
  ], a.branches, { fontSize: 7.5 });

  // ---------------------------------------------------------- 07 assumptions
  heading('07', 'Design basis & assumptions');
  kv([
    ['Line voltage', `${settings.voltage} V`],
    ['System', `${settings.phases}-phase`],
    ['Diversity factor', settings.diversityFactor],
    ['Cable derating', settings.derating],
    ['Max voltage drop', `${settings.maxVdPct} %`],
    ['Max parallel runs', settings.maxRuns],
    ['Transformer max loading', `${Math.round(settings.maxLoading * 100)} %`],
    ['Future growth allowance', `${Math.round(settings.futureMargin * 100)} %`],
    ['Fault clearing time', `${settings.faultTimeS} s`],
    ['Engine', ENGINE_VERSION],
  ]);
  if (project.notes) {
    ensure(40);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Notes', L, doc.y + 4);
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(t(project.notes), { width: W });
    doc.moveDown(0.5);
  }
  ensure(60);
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED).text(
    'Preliminary engineering estimate using indicative 1.1 kV XLPE cable data (in air, ~40 °C) and typical category load profiles. '
    + 'Confirm installation method, ambient temperature, grouping, short-circuit withstand, protection coordination, earthing and the '
    + 'applicable IS / IEC requirements (IS 732, IS 3961, IS 7098, IEC 60364-5-52) with a qualified electrical engineer before construction.',
    L, doc.y + 6, { width: W },
  );

  // ---------------------------------------------------------- footer
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const fy = doc.page.height - 30;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not add a page
    doc.moveTo(L, fy - 6).lineTo(L + W, fy - 6).lineWidth(0.4).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      .text(t(`Voltwise · ${project.name}`), L, fy, { width: W / 2, lineBreak: false, ellipsis: true })
      .text(`Page ${i + 1} of ${range.count}`, L + W / 2, fy, { width: W / 2, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
  return doc;
}

export function pdfBuffer(input) {
  return new Promise((resolve, reject) => {
    const doc = renderPdf(input);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ========================================================= Excel ==========
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14202E' } };
const IN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
const thin = { style: 'thin', color: { argb: 'FFD6DEE8' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row) {
  row.eachCell((c) => {
    c.fill = HEAD_FILL;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = border;
  });
  row.height = 22;
}

function sheetTable(ws, columns, rows) {
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  styleHeader(ws.getRow(1));
  rows.forEach((r) => ws.addRow(r).eachCell((c) => { c.border = border; }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function xlsxBuffer(input) {
  const { project, report, settings } = prepare(input);
  const a = report.analysis;
  const wb = new ExcelJS.Workbook();
  wb.creator = project.engineer || 'Voltwise';
  wb.created = new Date();
  wb.title = `${project.name} — Load & Cable Sizing`;

  // -------- Summary
  const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF0F6E73' } } });
  sum.columns = [{ width: 34 }, { width: 26 }, { width: 14 }];
  sum.mergeCells('A1:C1');
  sum.getCell('A1').value = 'VOLTWISE — Electrical Load & Cable Sizing Report';
  sum.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  sum.getCell('A1').fill = HEAD_FILL;
  sum.getRow(1).height = 28;
  const lines = [
    ['Project', project.name], ['Client', project.client], ['Site', project.site], ['Prepared by', project.engineer],
    ['Status', project.status], ['Generated', new Date().toLocaleString('en-IN')], [],
    ['RESULTS'],
    ['Connected load', report.summary.connectedKw, 'kW'],
    ['Demand load', report.summary.demandKw, 'kW'],
    ['Maximum demand', report.summary.maxDemandKva, 'kVA'],
    ['Overall power factor', report.summary.overallPf, ''],
    ['Feeder current', report.feeder.current, 'A'],
    ['Main cable', report.cable ? `${report.cable.runs > 1 ? `${report.cable.runs} × ` : ''}${report.cable.sizeSqmm} mm² ${a.conductorLabel}` : '—'],
    ['Cable voltage drop', report.cable?.voltageDropPct ?? '—', '%'],
    ['Transformer', report.transformer?.kva ?? '—', 'kVA'],
    ['Transformer loading', report.transformer?.loadingPct ?? '—', '%'],
    ['Transformer status', a.transformer?.status ?? '—'],
    ['APFC bank', a.pfc?.needed ? a.pfc.recommendedBankKvar : 0, 'kVAr'],
    ['Contract demand (suggested)', a.demand.contractDemandKva, 'kVA'],
    ['Load factor', a.demand.loadFactor, ''],
    ['Daily energy (est.)', a.demand.dailyEnergyKwh, 'kWh'],
    ['Short-circuit check', a.shortCircuit ? (a.shortCircuit.pass ? 'PASS' : 'FAIL') : '—'],
    [],
    ['DESIGN CHECKS'],
    ...(report.warnings.length ? report.warnings.map((w) => ['', w]) : [['', 'No issues found']]),
  ];
  lines.forEach((l) => {
    const row = sum.addRow(l);
    if (l.length === 1 && l[0]) { row.font = { bold: true, color: { argb: 'FF0F6E73' } }; }
    else if (l.length) row.getCell(1).font = { color: { argb: 'FF5B6B7E' } };
    if (typeof l[1] === 'number') row.getCell(2).font = { bold: true };
  });

  // -------- Load schedule with live formulas
  const ls = wb.addWorksheet('Load Schedule');
  ls.columns = [
    { header: '#', key: 'i', width: 5 },
    { header: 'Equipment', key: 'name', width: 28 },
    { header: 'Category', key: 'cat', width: 18 },
    { header: 'Panel', key: 'panel', width: 10 },
    { header: 'Qty', key: 'qty', width: 7 },
    { header: 'Rated kW / unit', key: 'kw', width: 12 },
    { header: 'Power factor', key: 'pf', width: 10 },
    { header: 'Demand factor', key: 'df', width: 10 },
    { header: 'Phases', key: 'ph', width: 8 },
    { header: 'Branch length m', key: 'len', width: 10 },
    { header: 'Connected kW', key: 'ckw', width: 13 },
    { header: 'Demand kW', key: 'dkw', width: 12 },
    { header: 'Demand kVAr', key: 'kvar', width: 12 },
    { header: 'Demand kVA', key: 'kva', width: 12 },
  ];
  styleHeader(ls.getRow(1));
  report.breakdown.forEach((r, i) => {
    const x = i + 2;
    const row = ls.addRow({
      i: i + 1, name: r.name, cat: catLabel(r.category), panel: r.panel, qty: r.quantity, kw: r.ratedKw,
      pf: r.powerFactor, df: r.demandFactor, ph: r.phases, len: r.lengthM ?? settings.branchLengthM,
      ckw: { formula: `E${x}*F${x}`, result: r.connectedKw },
      dkw: { formula: `K${x}*H${x}`, result: r.demandKw },
      kvar: { formula: `L${x}*TAN(ACOS(G${x}))`, result: r.demandKvar },
      kva: { formula: `IFERROR(L${x}/G${x},0)`, result: r.demandKw / r.powerFactor },
    });
    row.eachCell((c, col) => {
      c.border = border;
      if (col >= 5 && col <= 10) c.fill = IN_FILL;
      if (col >= 6) c.numFmt = '0.00';
      if (col === 5 || col === 9) c.numFmt = '0';
    });
  });
  const last = report.breakdown.length + 1;
  const tr = last + 1;
  const sumOf = (col) => ({ formula: `SUM(${col}2:${col}${last})` });
  const totals = ls.addRow({ name: 'TOTAL', ckw: sumOf('K'), dkw: sumOf('L'), kvar: sumOf('M') });
  totals.font = { bold: true };
  totals.eachCell((c) => { c.border = border; c.numFmt = '0.00'; });
  const calc = [
    ['Demand kVA (vector sum)', { formula: `SQRT(L${tr}^2+M${tr}^2)` }, 'kVA'],
    ['Overall power factor', { formula: `IFERROR(L${tr}/SQRT(L${tr}^2+M${tr}^2),1)` }, ''],
    ['Diversity factor', settings.diversityFactor, '← input'],
    ['Maximum demand', { formula: `SQRT(L${tr}^2+M${tr}^2)/L${tr + 4}` }, 'kVA'],
    ['Line voltage', settings.voltage, 'V'],
    ['Feeder current (3-phase)', { formula: `L${tr}/L${tr + 4}*1000/(SQRT(3)*L${tr + 6}*L${tr + 3})` }, 'A'],
  ];
  ls.addRow([]);
  calc.forEach(([label, value, unit]) => {
    const row = ls.addRow({ name: label, dkw: value, kvar: unit });
    row.getCell('name').font = { bold: true };
    row.getCell('dkw').numFmt = '0.000';
    row.getCell('dkw').border = border;
    if (typeof value === 'number') row.getCell('dkw').fill = IN_FILL;
  });
  ls.addRow([]);
  ls.addRow({ name: 'Yellow cells are inputs — totals and demand recalculate in Excel.' }).font = { italic: true, color: { argb: 'FF5B6B7E' } };
  ls.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

  // -------- Branch circuits
  sheetTable(wb.addWorksheet('Branch Circuits'), [
    { header: 'Equipment', key: 'name', width: 28 },
    { header: 'Panel', key: 'panel', width: 10 },
    { header: 'Phases', key: 'ph', width: 8 },
    { header: 'Voltage V', key: 'v', width: 10 },
    { header: 'Design current Ib A', key: 'ib', width: 14, numFmt: '0.0' },
    { header: 'Protection A', key: 'br', width: 12 },
    { header: 'Device', key: 'type', width: 9 },
    { header: 'Cable', key: 'cable', width: 22 },
    { header: 'Iz derated A', key: 'iz', width: 12, numFmt: '0.0' },
    { header: 'Length m', key: 'len', width: 10 },
    { header: 'Vd %', key: 'vd', width: 9, numFmt: '0.00' },
    { header: 'Status', key: 'status', width: 9 },
    { header: 'Note', key: 'note', width: 40 },
  ], a.branches.map((b) => ({
    name: b.name, panel: b.panel, ph: b.phases, v: b.voltage, ib: b.designCurrentA, br: b.breaker.ratingA, type: b.breaker.type,
    cable: b.cable ? `${b.cable.runs > 1 ? `${b.cable.runs} × ` : ''}${b.cable.cores} × ${b.cable.sizeSqmm} mm² ${a.conductorLabel}` : '—',
    iz: b.cable?.deratedCapacityA, len: b.lengthM, vd: b.cable?.voltageDropPct, status: b.status.toUpperCase(), note: b.note,
  })));

  // -------- Cable candidates
  sheetTable(wb.addWorksheet('Main Cable Options'), [
    { header: 'Size mm²', key: 's', width: 10 },
    { header: 'Derated capacity A', key: 'a', width: 16, numFmt: '0.0' },
    { header: 'Current OK', key: 'c', width: 11 },
    { header: 'Voltage drop %', key: 'v', width: 14, numFmt: '0.00' },
    { header: 'Vd OK', key: 'vo', width: 9 },
    { header: 'I²R loss kW', key: 'l', width: 12, numFmt: '0.00' },
    { header: 'Selected', key: 'sel', width: 10 },
  ], a.cableCandidates.map((c) => ({
    s: c.sizeSqmm, a: c.deratedCapacityA, c: c.currentOk ? 'Yes' : 'No', v: c.voltageDropPct, vo: c.vdOk ? 'Yes' : 'No', l: c.lossKw,
    sel: report.cable?.sizeSqmm === c.sizeSqmm ? '✔' : '',
  })));

  // -------- Transformer
  if (a.transformer) {
    sheetTable(wb.addWorksheet('Transformer'), [
      { header: 'Rating kVA', key: 'kva', width: 12 },
      { header: 'Loading now %', key: 'l', width: 14, numFmt: '0.0' },
      { header: 'Loading with growth %', key: 'f', width: 20, numFmt: '0.0' },
      { header: 'Within limit', key: 'ok', width: 12 },
      { header: 'Recommended', key: 'r', width: 13 },
    ], a.transformer.alternatives.map((x) => ({ kva: x.kva, l: x.loadingPct, f: x.futureLoadingPct, ok: x.ok ? 'Yes' : 'No', r: x.recommended ? '✔' : '' })));
  }

  // -------- Profile
  const cats = a.profile.categories;
  sheetTable(wb.addWorksheet('Load Profile'), [
    { header: 'Hour', key: 'label', width: 8 },
    ...cats.map((c) => ({ header: `${c.label} kW`, key: c.key, width: 14, numFmt: '0.00' })),
    { header: 'Total kW', key: 'kw', width: 11, numFmt: '0.00' },
    { header: 'Total kVA', key: 'kva', width: 11, numFmt: '0.00' },
  ], a.profile.points);

  // -------- Settings
  sheetTable(wb.addWorksheet('Settings'), [
    { header: 'Parameter', key: 'k', width: 30 },
    { header: 'Value', key: 'v', width: 16 },
  ], Object.entries(settings).map(([k, v]) => ({ k, v })));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
