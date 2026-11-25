import { useMemo, useRef, useState } from 'react';
import { importScheduleCsv, toScheduleCsv, validateLoadRow } from '@voltwise/engine';

import { Panel } from '../components/MetricCard.jsx';
import { Empty, Field, Modal, NumberInput } from '../components/Ui.jsx';
import { useDebounced } from '../hooks/useDebounced.js';
import { CATEGORY_COLORS, CATEGORY_OPTIONS, categoryLabel, download, fmt, slug } from '../lib/format.js';

const BLANK = { name: '', quantity: 1, ratedKw: 5, powerFactor: 0.85, demandFactor: 1, phases: 3, category: 'other', panel: '', lengthM: '' };

const COLS = [
  { key: 'name', label: 'Equipment', sort: 'text' },
  { key: 'category', label: 'Category', sort: 'text' },
  { key: 'panel', label: 'Panel', sort: 'text' },
  { key: 'quantity', label: 'Qty', sort: 'num', num: { min: 1, step: 1 } },
  { key: 'ratedKw', label: 'kW / unit', sort: 'num', num: { min: 0.01, step: 'any' } },
  { key: 'powerFactor', label: 'PF', sort: 'num', num: { min: 0.3, max: 1, step: 0.01 } },
  { key: 'demandFactor', label: 'DF', sort: 'num', num: { min: 0.05, max: 1, step: 0.05 } },
  { key: 'phases', label: 'Phase', sort: 'num' },
  { key: 'lengthM', label: 'Len m', sort: 'num', num: { min: 1, step: 5 } },
];

const connected = (l) => (Number(l.quantity) || 0) * (Number(l.ratedKw) || 0);
const demand = (l) => connected(l) * (Number(l.demandFactor) || 0);

function LoadForm({ initial, onSubmit, onClose, title }) {
  const [row, setRow] = useState({ ...BLANK, ...initial });
  const [touched, setTouched] = useState(false);
  const errors = validateLoadRow(row);
  const set = (patch) => setRow((r) => ({ ...r, ...patch }));
  const submit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSubmit({ ...row, lengthM: row.lengthM === '' ? null : row.lengthM });
  };
  const err = (k) => (touched ? errors[k] : undefined);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <span className="caption grow">
            {connected(row) > 0 ? `${fmt(connected(row), 2)} kW connected · ${fmt(demand(row), 2)} kW demand` : ''}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="load-form" className="btn">Save equipment</button>
        </>
      )}
    >
      <form id="load-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Equipment name" error={err('name')}>
          <input autoFocus value={row.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Fire pump" />
        </Field>
        <Field label="Category" error={err('category')}>
          <select value={row.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Quantity" error={err('quantity')}><NumberInput value={row.quantity} min={1} step={1} onChange={(v) => set({ quantity: v })} /></Field>
        <Field label="Rated power per unit (kW)" error={err('ratedKw')}><NumberInput value={row.ratedKw} min={0.01} step="any" onChange={(v) => set({ ratedKw: v })} /></Field>
        <Field label="Power factor" error={err('powerFactor')} hint="Typical: motors 0.8, LED 0.95"><NumberInput value={row.powerFactor} min={0.3} max={1} step={0.01} onChange={(v) => set({ powerFactor: v })} /></Field>
        <Field label="Demand factor" error={err('demandFactor')} hint="Share of connected load in use at peak"><NumberInput value={row.demandFactor} min={0.05} max={1} step={0.05} onChange={(v) => set({ demandFactor: v })} /></Field>
        <Field label="Supply" error={err('phases')}>
          <select value={row.phases} onChange={(e) => set({ phases: Number(e.target.value) })}>
            <option value={3}>3-phase</option>
            <option value={1}>1-phase</option>
          </select>
        </Field>
        <Field label="Panel / DB" hint="Optional — groups the branch schedule"><input value={row.panel} onChange={(e) => set({ panel: e.target.value })} placeholder="e.g. MCC-1" /></Field>
        <Field label="Branch cable length (m)" error={err('lengthM')} hint="Blank = project default"><NumberInput value={row.lengthM} min={1} step={5} onChange={(v) => set({ lengthM: v })} /></Field>
      </form>
    </Modal>
  );
}

function ImportModal({ result, onClose, onApply }) {
  const [mode, setMode] = useState('append');
  return (
    <Modal
      wide
      title={`Import ${result.file}`}
      onClose={onClose}
      footer={(
        <>
          <div className="seg grow-left">
            {[['append', 'Append to schedule'], ['replace', 'Replace schedule']].map(([k, l]) => (
              <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" disabled={!result.accepted.length} onClick={() => onApply(result.accepted, mode)}>
            Import {result.accepted.length} row{result.accepted.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    >
      <div className="import-stats">
        <div><b>{result.total}</b><span>rows read</span></div>
        <div className="good"><b>{result.accepted.length}</b><span>valid</span></div>
        <div className={result.rejected.length ? 'bad' : ''}><b>{result.rejected.length}</b><span>with errors (skipped)</span></div>
      </div>
      {result.rejected.length ? (
        <>
          <h5>Rows that will be skipped</h5>
          <table className="result-table compact">
            <thead><tr><th>Line</th><th>Name</th><th>Problems</th></tr></thead>
            <tbody>
              {result.rejected.map((r) => (
                <tr key={r.line}>
                  <td className="mono">{r.line}</td>
                  <td>{r.name || '—'}</td>
                  <td className="tone-bad">{Object.entries(r.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <h5>Preview</h5>
      <div className="scroll-x">
        <table className="result-table compact">
          <thead><tr><th>Name</th><th>Category</th><th>Panel</th><th>Qty</th><th>kW</th><th>PF</th><th>DF</th><th>Ph</th></tr></thead>
          <tbody>
            {result.accepted.slice(0, 12).map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i}><td>{r.name}</td><td>{categoryLabel(r.category)}</td><td>{r.panel || '—'}</td><td>{r.quantity}</td><td>{r.ratedKw}</td><td>{r.powerFactor}</td><td>{r.demandFactor}</td><td>{r.phases}</td></tr>
            ))}
          </tbody>
        </table>
        {result.accepted.length > 12 ? <div className="caption">…and {result.accepted.length - 12} more</div> : null}
      </div>
    </Modal>
  );
}

export function Schedule({ loads, setLoads, report, projectName, push, canUndo, onUndo }) {
  const fileRef = useRef(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');
  const [phase, setPhase] = useState('');
  const [panel, setPanel] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // { uid } | { new: true }
  const [importResult, setImportResult] = useState(null);
  const q = useDebounced(query, 150);

  const errorsByUid = useMemo(() => Object.fromEntries(loads.map((l) => [l.uid, validateLoadRow(l)])), [loads]);
  const errorCount = Object.values(errorsByUid).filter((e) => Object.keys(e).length).length;
  const panels = useMemo(() => [...new Set(loads.map((l) => l.panel).filter(Boolean))].sort(), [loads]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = loads.filter((l) => (!needle || `${l.name} ${l.panel} ${categoryLabel(l.category)}`.toLowerCase().includes(needle))
      && (!cat || l.category === cat)
      && (!phase || String(l.phases) === phase)
      && (!panel || l.panel === panel)
      && (!onlyErrors || Object.keys(errorsByUid[l.uid] || {}).length));
    if (sort.key) {
      const col = COLS.find((c) => c.key === sort.key);
      rows = [...rows].sort((x, y) => {
        const a = x[sort.key];
        const b = y[sort.key];
        if (col.sort === 'num') return ((Number(a) || 0) - (Number(b) || 0)) * sort.dir;
        return String(a ?? '').localeCompare(String(b ?? '')) * sort.dir;
      });
    }
    return rows;
  }, [loads, q, cat, phase, panel, onlyErrors, sort, errorsByUid]);

  const totals = useMemo(() => visible.reduce((t, l) => ({ c: t.c + connected(l), d: t.d + demand(l), n: t.n + (Number(l.quantity) || 0) }), { c: 0, d: 0, n: 0 }), [visible]);

  const patchRow = (uid, patch) => setLoads((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)), { coalesce: uid });
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.uid));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((l) => l.uid)));
  const toggle = (uid) => setSelected((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  const removeSelected = () => {
    const n = selected.size;
    setLoads((prev) => prev.filter((l) => !selected.has(l.uid)));
    setSelected(new Set());
    push(`Deleted ${n} row${n === 1 ? '' : 's'} — Undo is available`, 'info');
  };
  const duplicateSelected = () => {
    setLoads((prev) => prev.flatMap((l) => (selected.has(l.uid) ? [l, { ...l, uid: undefined, name: `${l.name} (copy)` }] : [l])));
    push(`Duplicated ${selected.size} row(s)`, 'good');
  };
  const bulkCategory = (value) => {
    if (!value) return;
    setLoads((prev) => prev.map((l) => (selected.has(l.uid) ? { ...l, category: value } : l)));
    push(`Set category to ${categoryLabel(value)} for ${selected.size} row(s)`, 'good');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { push('CSV is larger than 2 MB', 'bad'); return; }
    try {
      const text = await file.text();
      setImportResult({ ...importScheduleCsv(text, validateLoadRow), file: file.name });
    } catch (err) {
      push(`Could not read ${file.name}: ${err.message}`, 'bad', 7000);
    }
  };

  const applyImport = (rows, mode) => {
    setLoads((prev) => (mode === 'replace' ? rows : [...prev, ...rows]));
    push(`Imported ${rows.length} row(s) from ${importResult.file}`, 'good');
    setImportResult(null);
  };

  const exportCsv = (onlySel = false) => {
    const rows = onlySel ? loads.filter((l) => selected.has(l.uid)) : loads;
    download(`${slug(projectName)}-schedule.csv`, toScheduleCsv(rows));
  };

  const headerSort = (key) => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }));
  const editingRow = editing?.uid ? loads.find((l) => l.uid === editing.uid) : null;
  const shareByIndex = Object.fromEntries((report?.breakdown || []).map((b) => [b.name, b.shareOfDemandPct]));

  return (
    <>
      <Panel
        title="Equipment & load schedule"
        sub={`${loads.length} lines · ${fmt(loads.reduce((s, l) => s + connected(l), 0), 1)} kW connected${errorCount ? ` · ${errorCount} with errors` : ''}`}
        right={(
          <div className="btn-row">
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="visually-hidden" />
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>↑ Import CSV</button>
            <button type="button" className="btn btn-ghost" onClick={() => exportCsv(false)} disabled={!loads.length}>↓ Export CSV</button>
            <button type="button" className="btn" onClick={() => setEditing({ new: true })}>+ Add equipment</button>
          </div>
        )}
      >
        <div className="toolbar">
          <div className="search">
            <span aria-hidden>⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment, panel, category…" aria-label="Search loads" />
            {query ? <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Clear search">✕</button> : null}
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter category">
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Filter phase">
            <option value="">1 & 3 phase</option>
            <option value="3">3-phase</option>
            <option value="1">1-phase</option>
          </select>
          {panels.length ? (
            <select value={panel} onChange={(e) => setPanel(e.target.value)} aria-label="Filter panel">
              <option value="">All panels</option>
              {panels.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : null}
          <label className={`chip ${onlyErrors ? 'on' : ''} ${errorCount ? '' : 'disabled'}`}>
            <input type="checkbox" checked={onlyErrors} disabled={!errorCount} onChange={(e) => setOnlyErrors(e.target.checked)} />
            Errors only ({errorCount})
          </label>
          {canUndo ? <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo} title="Undo (Ctrl+Z)">↶ Undo</button> : null}
        </div>

        {selected.size ? (
          <div className="bulkbar">
            <b>{selected.size} selected</b>
            <button type="button" className="btn btn-ghost btn-sm" onClick={duplicateSelected}>Duplicate</button>
            <select defaultValue="" onChange={(e) => { bulkCategory(e.target.value); e.target.value = ''; }} aria-label="Set category for selection">
              <option value="">Set category…</option>
              {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(true)}>Export selected</button>
            <button type="button" className="btn btn-danger-solid btn-sm" onClick={removeSelected}>Delete</button>
            <button type="button" className="link" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        ) : null}

        <div className="scroll-x">
          <table className="schedule">
            <thead>
              <tr>
                <th className="w-check"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible" /></th>
                {COLS.map((c) => (
                  <th key={c.key} className={c.num ? 'num' : ''}>
                    <button type="button" className="th-sort" onClick={() => headerSort(c.key)}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                <th className="num">Demand kW</th>
                <th className="num">Share</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const errs = errorsByUid[l.uid] || {};
                const bad = Object.keys(errs).length > 0;
                return (
                  <tr key={l.uid} className={`${bad ? 'row-error' : ''} ${selected.has(l.uid) ? 'row-selected' : ''}`}>
                    <td className="w-check"><input type="checkbox" checked={selected.has(l.uid)} onChange={() => toggle(l.uid)} aria-label={`Select ${l.name}`} /></td>
                    <td className={`name-cell ${errs.name ? 'cell-error' : ''}`} title={errs.name}>
                      <input value={l.name} onChange={(e) => patchRow(l.uid, { name: e.target.value })} aria-label="Equipment name" />
                    </td>
                    <td>
                      <div className="cat-cell">
                        <span className="sw" style={{ background: CATEGORY_COLORS[l.category] || CATEGORY_COLORS.other }} />
                        <select value={l.category || 'other'} onChange={(e) => patchRow(l.uid, { category: e.target.value })} aria-label="Category">
                          {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="w-panel"><input value={l.panel || ''} onChange={(e) => patchRow(l.uid, { panel: e.target.value })} placeholder="—" aria-label="Panel" /></td>
                    {COLS.filter((c) => c.num).map((c) => (
                      c.key === 'lengthM' ? null : (
                        <td key={c.key} className={`num ${errs[c.key] ? 'cell-error' : ''}`} title={errs[c.key]}>
                          <NumberInput value={l[c.key]} {...c.num} onChange={(v) => patchRow(l.uid, { [c.key]: v })} aria-label={c.label} />
                        </td>
                      )
                    ))}
                    <td className={`w-phase ${errs.phases ? 'cell-error' : ''}`}>
                      <select value={l.phases} onChange={(e) => patchRow(l.uid, { phases: Number(e.target.value) })} aria-label="Phases">
                        <option value={3}>3-φ</option>
                        <option value={1}>1-φ</option>
                      </select>
                    </td>
                    <td className={`num ${errs.lengthM ? 'cell-error' : ''}`} title={errs.lengthM}>
                      <NumberInput value={l.lengthM ?? ''} min={1} step={5} placeholder="def." onChange={(v) => patchRow(l.uid, { lengthM: v === '' ? null : v })} aria-label="Branch length" />
                    </td>
                    <td className="num mono">{bad ? <span className="tone-bad" title={Object.values(errs).join(' · ')}>error</span> : fmt(demand(l), 2)}</td>
                    <td className="num mono muted">{bad ? '' : `${fmt(shareByIndex[l.name] ?? 0, 1)}%`}</td>
                    <td className="row-actions">
                      <button type="button" className="icon-btn" title="Edit in form" onClick={() => setEditing({ uid: l.uid })}>✎</button>
                      <button type="button" className="icon-btn danger" title="Delete row" onClick={() => { setLoads((prev) => prev.filter((x) => x.uid !== l.uid)); push(`Deleted “${l.name}” — Undo is available`); }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length ? (
              <tfoot>
                <tr>
                  <td />
                  <td colSpan={3}>{visible.length === loads.length ? 'Total' : `Filtered total (${visible.length} of ${loads.length})`}</td>
                  <td className="num mono">{totals.n}</td>
                  <td colSpan={5} className="num mono muted">{fmt(totals.c, 2)} kW connected</td>
                  <td className="num mono">{fmt(totals.d, 2)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {!loads.length ? (
          <Empty icon="☰" title="No equipment yet">
            Add equipment one by one, or import a CSV (columns: name, quantity, rated_kw, power_factor, demand_factor, phases — optional category, panel, length_m).
          </Empty>
        ) : !visible.length ? <Empty icon="⌕" title="No rows match the filters" /> : null}

        <div className="caption" style={{ marginTop: 10 }}>
          Edit cells directly — everything recalculates instantly. Rows with errors are highlighted and left out of the calculations until fixed.
          Tip: <span className="mono">Ctrl+Z</span> undoes the last change.
        </div>
      </Panel>

      {editing ? (
        <LoadForm
          title={editing.new ? 'Add equipment' : `Edit “${editingRow?.name}”`}
          initial={editing.new ? BLANK : editingRow}
          onClose={() => setEditing(null)}
          onSubmit={(row) => {
            if (editing.new) setLoads((prev) => [...prev, row]);
            else setLoads((prev) => prev.map((l) => (l.uid === editing.uid ? { ...row, uid: l.uid } : l)));
            push(editing.new ? `Added “${row.name}”` : `Updated “${row.name}”`, 'good');
            setEditing(null);
          }}
        />
      ) : null}
      {importResult ? <ImportModal result={importResult} onClose={() => setImportResult(null)} onApply={applyImport} /> : null}
    </>
  );
}
