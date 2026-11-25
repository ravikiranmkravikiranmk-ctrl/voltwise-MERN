import { LOAD_CATEGORIES } from '@voltwise/engine';

export const fmt = (value, digits = 1) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const pct = (fraction, digits = 0) => `${fmt(fraction * 100, digits)}%`;

export const cableLabel = (cable, phases = 3) => {
  if (!cable) return '—';
  const runs = cable.runs > 1 ? `${cable.runs} × ` : '';
  return `${runs}${phases === 1 ? '2C' : '3.5C'} × ${cable.sizeSqmm} mm²`;
};

/** Stable colours per load category (dark-theme friendly). */
export const CATEGORY_COLORS = {
  lighting: '#f6c85f',
  hvac: '#56d6d0',
  motor: '#6f9cff',
  lift: '#c58cff',
  process: '#ff9f6b',
  sockets: '#b8ef75',
  it: '#5ec2ff',
  heating: '#ff7a8a',
  ev: '#4be3a0',
  other: '#93a4b9',
};

export const CATEGORY_OPTIONS = Object.entries(LOAD_CATEGORIES).map(([key, c]) => ({ key, label: c.label }));
export const categoryLabel = (key) => LOAD_CATEGORIES[key]?.label || 'Other';

let uidCounter = 0;
export const newUid = () => `l${Date.now().toString(36)}${(uidCounter += 1).toString(36)}`;
export const withUids = (loads = []) => loads.map((l) => ({ ...l, uid: l.uid || newUid() }));

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const slug = (name) => (name || 'load-schedule').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'load-schedule';

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Results CSV: per-load breakdown, branch circuits and the summary. */
export function resultsCsv(report) {
  const a = report.analysis;
  const lines = ['Equipment,Category,Panel,Qty,Rated kW,PF,DF,Phases,Connected kW,Demand kW,kVAr,Share %,Ib A,Breaker,Cable,Vd %'];
  report.breakdown.forEach((l, i) => {
    const b = a.branches[i];
    lines.push([
      q(l.name), q(categoryLabel(l.category)), q(l.panel), l.quantity, l.ratedKw, l.powerFactor, l.demandFactor, l.phases,
      l.connectedKw, l.demandKw, l.demandKvar, l.shareOfDemandPct,
      b?.designCurrentA ?? '', b?.breaker?.ratingA ? q(`${b.breaker.ratingA} A ${b.breaker.type}`) : '',
      b?.cable ? q(`${b.cable.runs > 1 ? `${b.cable.runs}x ` : ''}${b.cable.cores} x ${b.cable.sizeSqmm} mm2`) : '',
      b?.cable?.voltageDropPct ?? '',
    ].join(','));
  });
  lines.push('', 'Summary,Value,Unit');
  const rows = [
    ['Connected load', report.summary.connectedKw, 'kW'],
    ['Demand load', report.summary.demandKw, 'kW'],
    ['Maximum demand', report.summary.maxDemandKva, 'kVA'],
    ['Overall power factor', report.summary.overallPf, ''],
    ['Feeder current', report.feeder.current, 'A'],
    ['Main cable', report.cable ? `${report.cable.runs} run(s) x ${report.cable.sizeSqmm} mm2 ${report.cable.conductor}` : '', ''],
    ['Voltage drop', report.cable?.voltageDropPct ?? '', '%'],
    ['Transformer', report.transformer?.kva ?? '', 'kVA'],
    ['Transformer loading', report.transformer?.loadingPct ?? '', '%'],
    ['APFC bank', a.pfc?.needed ? a.pfc.recommendedBankKvar : 0, 'kVAr'],
    ['Contract demand (suggested)', a.demand.contractDemandKva, 'kVA'],
  ];
  rows.forEach((r) => lines.push(r.map(q).join(',')));
  return lines.join('\n');
}
