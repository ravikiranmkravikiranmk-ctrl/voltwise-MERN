import { useState } from 'react';
import { toScheduleCsv } from '@voltwise/engine';

import { Panel, SectionHead } from '../components/MetricCard.jsx';
import { Empty } from '../components/Ui.jsx';
import { api, cleanLoads, saveBlob } from '../api/client.js';
import { download, fmt, resultsCsv, slug } from '../lib/format.js';

const PDF_SECTIONS = [
  'Cover with project details and six headline results',
  'Design checks (warnings) box',
  'Full load schedule with totals',
  'Demand analysis + 24-hour profile chart + category table',
  'Main feeder cable with size comparison and short-circuit check',
  'Transformer capacity with rating alternatives',
  'Power factor correction (APFC sizing)',
  'Branch circuit schedule — breaker + cable per load',
  'Design basis, notes and disclaimer, page numbers',
];

const XLSX_SHEETS = [
  ['Summary', 'headline results and design checks'],
  ['Load Schedule', 'yellow input cells with live formulas — edit in Excel and totals update'],
  ['Branch Circuits', 'Ib, breaker, cable, Iz, Vd per load'],
  ['Main Cable Options', 'every size with pass/fail'],
  ['Transformer', 'rating alternatives and loading'],
  ['Load Profile', 'hourly kW by category'],
  ['Settings', 'all design inputs'],
];

export function Reports({ report, loads, settings, meta, apiOnline, push, invalidCount, revision }) {
  const [busy, setBusy] = useState('');
  const name = meta.name || 'Untitled project';

  const exportServer = async (kind) => {
    setBusy(kind);
    try {
      const file = await api.exportFile(kind, { project: { ...meta, name, revision }, loads: cleanLoads(loads).filter((_, i) => !report.analysis.validation.invalid.some((x) => x.index === i)), settings });
      saveBlob(file);
      push(`${kind === 'pdf' ? 'PDF report' : 'Excel workbook'} downloaded`, 'good');
    } catch (err) {
      push(`Export failed: ${err.message}`, 'bad', 7000);
    } finally {
      setBusy('');
    }
  };

  if (!report || !report.breakdown.length) return <Panel><Empty icon="⇩" title="Nothing to export yet">Add loads first.</Empty></Panel>;

  return (
    <>
      {invalidCount ? <div className="alert alert-warn">⚠ {invalidCount} row(s) with errors are left out of every export.</div> : null}
      <div className="export-grid">
        <div className="export-card">
          <div className="export-icon pdf">PDF</div>
          <h4>Professional PDF report</h4>
          <p className="caption">A4, branded, ready to attach to a DPR, tender or client submission.</p>
          <ul className="ticks">{PDF_SECTIONS.map((s) => <li key={s}>{s}</li>)}</ul>
          <button type="button" className="btn" disabled={!apiOnline || busy === 'pdf'} onClick={() => exportServer('pdf')}>
            {busy === 'pdf' ? 'Building PDF…' : '↓ Download PDF report'}
          </button>
          {!apiOnline ? <div className="caption tone-warn">Needs the API running.</div> : null}
        </div>

        <div className="export-card">
          <div className="export-icon xls">XLSX</div>
          <h4>Excel calculation workbook</h4>
          <p className="caption">Seven sheets — the load schedule keeps working formulas so you can keep editing in Excel.</p>
          <ul className="ticks">{XLSX_SHEETS.map(([s, d]) => <li key={s}><b>{s}</b> — {d}</li>)}</ul>
          <button type="button" className="btn" disabled={!apiOnline || busy === 'xlsx'} onClick={() => exportServer('xlsx')}>
            {busy === 'xlsx' ? 'Building workbook…' : '↓ Download Excel workbook'}
          </button>
          {!apiOnline ? <div className="caption tone-warn">Needs the API running.</div> : null}
        </div>

        <div className="export-card">
          <div className="export-icon csv">CSV</div>
          <h4>Quick CSV & data exports</h4>
          <p className="caption">Generated in the browser — work even when offline.</p>
          <div className="btn-col">
            <button type="button" className="btn btn-ghost" onClick={() => download(`${slug(name)}-results.csv`, resultsCsv(report))}>↓ Results + branch schedule (CSV)</button>
            <button type="button" className="btn btn-ghost" onClick={() => download(`${slug(name)}-schedule.csv`, toScheduleCsv(cleanLoads(loads)))}>↓ Load schedule (CSV, re-importable)</button>
            <button type="button" className="btn btn-ghost" onClick={() => download(`${slug(name)}-profile.csv`, ['hour,kW,kVAr,kVA', ...report.analysis.profile.points.map((p) => `${p.label},${p.kw},${p.kvar},${p.kva}`)].join('\n'))}>↓ 24-h load profile (CSV)</button>
            <button type="button" className="btn btn-ghost" onClick={() => download(`${slug(name)}.voltwise.json`, JSON.stringify({ project: meta, loads: cleanLoads(loads), settings }, null, 2), 'application/json')}>↓ Project file (JSON)</button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                try { await navigator.clipboard.writeText(JSON.stringify({ loads: cleanLoads(loads), settings }, null, 2)); push('Schedule JSON copied — paste into the Flutter app', 'good'); } catch { push('Clipboard not available', 'bad'); }
              }}
            >⧉ Copy JSON for mobile app</button>
          </div>
        </div>
      </div>

      <SectionHead number="✓" title="What will be in the report" sub={`${name} · ${report.breakdown.length} loads`} />
      <Panel>
        <table className="calc-table">
          <tbody>
            <tr><td>Maximum demand</td><td className="num">{fmt(report.summary.maxDemandKva, 1)} kVA</td></tr>
            <tr><td>Main cable</td><td className="num">{report.cable ? `${report.cable.runs > 1 ? `${report.cable.runs} × ` : ''}${report.cable.sizeSqmm} mm² ${report.analysis.conductorLabel}` : '—'}</td></tr>
            <tr><td>Transformer</td><td className="num">{report.transformer ? `${report.transformer.kva} kVA (${fmt(report.transformer.loadingPct, 1)}%)` : '—'}</td></tr>
            <tr><td>APFC</td><td className="num">{report.analysis.pfc?.needed ? `${report.analysis.pfc.recommendedBankKvar} kVAr` : 'Not required'}</td></tr>
            <tr><td>Design checks</td><td className="num">{report.warnings.length ? `${report.warnings.length} to review` : 'All pass'}</td></tr>
          </tbody>
        </table>
      </Panel>
    </>
  );
}
