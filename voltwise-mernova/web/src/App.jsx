import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, analyse, validateLoadRow } from '@voltwise/engine';

import { api, cleanLoads } from './api/client.js';
import { Nav, VIEWS } from './components/Nav.jsx';
import { ErrorBoundary, Toasts } from './components/Ui.jsx';
import { useToasts } from './hooks/useToasts.js';
import { withUids } from './lib/format.js';
import { Dashboard } from './pages/Dashboard.jsx';
import { Schedule } from './pages/Schedule.jsx';
import { Calculations } from './pages/Calculations.jsx';
import { Projects } from './pages/Projects.jsx';
import { Reports } from './pages/Reports.jsx';

const SAMPLE_LOADS = [
  { name: 'Borewell pumps', quantity: 4, ratedKw: 7.5, powerFactor: 0.82, demandFactor: 0.75, phases: 3, category: 'motor', panel: 'MCC-1', lengthM: 80 },
  { name: 'Air conditioners', quantity: 10, ratedKw: 2.2, powerFactor: 0.9, demandFactor: 0.8, phases: 1, category: 'hvac', panel: 'DB-2', lengthM: null },
  { name: 'Lighting', quantity: 1, ratedKw: 12, powerFactor: 0.95, demandFactor: 0.9, phases: 1, category: 'lighting', panel: 'LDB', lengthM: null },
  { name: 'Lift', quantity: 2, ratedKw: 11, powerFactor: 0.8, demandFactor: 0.5, phases: 3, category: 'lift', panel: 'MCC-1', lengthM: 45 },
  { name: 'Workshop machines', quantity: 6, ratedKw: 5.5, powerFactor: 0.8, demandFactor: 0.6, phases: 3, category: 'process', panel: 'PDB-1', lengthM: null },
  { name: 'Socket outlets', quantity: 1, ratedKw: 15, powerFactor: 0.9, demandFactor: 0.4, phases: 1, category: 'sockets', panel: 'DB-2', lengthM: null },
];

const INITIAL_SETTINGS = { ...DEFAULT_SETTINGS, diversityFactor: 1.1, derating: 0.8, cableLengthM: 120 };
const BLANK_META = { name: '', client: '', site: '', engineer: '', status: 'draft', notes: '' };

/** Client-side bounds — mirror the API so bad input never reaches the engine. */
const SETTING_RULES = {
  voltage: [100, 11000], diversityFactor: [1, 5], derating: [0.1, 1], maxVdPct: [0.5, 10], cableLengthM: [1, 5000],
  maxRuns: [1, 8], maxLoading: [0.2, 1], futureMargin: [0, 1], targetPf: [0.8, 1], branchLengthM: [1, 5000], faultKa: [0, 200], faultTimeS: [0.01, 5],
};

function checkSettings(settings) {
  const errors = {};
  const effective = { ...settings };
  for (const [key, [lo, hi]] of Object.entries(SETTING_RULES)) {
    const v = Number(settings[key]);
    if (settings[key] === '' || !Number.isFinite(v) || v < lo || v > hi) {
      errors[key] = `Between ${lo} and ${hi}`;
      effective[key] = INITIAL_SETTINGS[key];
    } else effective[key] = v;
  }
  if (!errors.maxRuns && !Number.isInteger(Number(settings.maxRuns))) {
    errors.maxRuns = 'Whole number';
    effective.maxRuns = INITIAL_SETTINGS.maxRuns;
  }
  if (!['cu', 'al'].includes(settings.conductor)) effective.conductor = 'cu';
  return { errors, effective };
}

const DRAFT_KEY = 'voltwise.draft.v2';
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
};
const snapshotOf = (meta, loads, settings) => JSON.stringify({ meta, loads: cleanLoads(loads), settings });

export default function App() {
  const draft = useRef(readDraft()).current;
  const [view, setView] = useState(() => (VIEWS.some((v) => v.key === window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'dashboard'));
  const [loads, setLoadsRaw] = useState(() => withUids(draft?.loads ?? SAMPLE_LOADS));
  const [settings, setSettings] = useState(() => ({ ...INITIAL_SETTINGS, ...(draft?.settings || {}) }));
  const [meta, setMeta] = useState(() => ({ ...BLANK_META, ...(draft?.meta || { name: 'Sample apartment block' }) }));
  const [currentId, setCurrentId] = useState(draft?.currentId ?? null);
  const [revision, setRevision] = useState(draft?.revision ?? null);
  const [savedSnap, setSavedSnap] = useState(() => draft?.savedSnap ?? null);
  const [lastSavedAt, setLastSavedAt] = useState(draft?.lastSavedAt ?? null);
  const [apiOnline, setApiOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [autosave, setAutosave] = useState(() => localStorage.getItem('voltwise.autosave') !== 'off');
  const [historyKey, setHistoryKey] = useState(0);
  const { toasts, push, dismiss } = useToasts();

  // ------------------------------------------------------------ undo stack
  const undoStack = useRef([]);
  const lastCoalesce = useRef({ key: null, at: 0 });
  const [undoDepth, setUndoDepth] = useState(0);

  const loadsRef = useRef(loads);
  loadsRef.current = loads;

  const setLoads = useCallback((updater, { coalesce } = {}) => {
    const prev = loadsRef.current;
    const next = withUids(typeof updater === 'function' ? updater(prev) : updater);
    const now = Date.now();
    const merge = coalesce && lastCoalesce.current.key === coalesce && now - lastCoalesce.current.at < 1200;
    if (!merge) {
      undoStack.current = [...undoStack.current.slice(-49), prev];
      setUndoDepth(undoStack.current.length);
    }
    lastCoalesce.current = { key: coalesce || null, at: now };
    loadsRef.current = next;
    setLoadsRaw(next);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setUndoDepth(undoStack.current.length);
    lastCoalesce.current = { key: null, at: 0 };
    setLoadsRaw(prev);
    push('Undone', 'info', 1500);
  }, [push]);

  // ------------------------------------------------------- live analysis
  const { errors: settingErrors, effective } = useMemo(() => checkSettings(settings), [settings]);
  const { report, calcError } = useMemo(() => {
    try {
      return { report: analyse({ loads, settings: effective }), calcError: '' };
    } catch (err) {
      return { report: null, calcError: err.message };
    }
  }, [loads, effective]);
  const invalidCount = useMemo(() => loads.filter((l) => Object.keys(validateLoadRow(l)).length).length, [loads]);

  const snap = useMemo(() => snapshotOf(meta, loads, settings), [meta, loads, settings]);
  const dirty = snap !== savedSnap;

  // ------------------------------------------------------------ API health
  useEffect(() => {
    let alive = true;
    const ping = () => api.health().then(() => alive && setApiOnline(true)).catch(() => alive && setApiOnline(false));
    ping();
    const id = setInterval(ping, 20000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => { window.location.hash = view; }, [view]);
  useEffect(() => { localStorage.setItem('voltwise.autosave', autosave ? 'on' : 'off'); }, [autosave]);

  // Browser draft — always kept, so a refresh or a crash never loses work.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, loads: cleanLoads(loads), settings, currentId, revision, savedSnap, lastSavedAt }));
      } catch { /* storage full or blocked */ }
    }, 600);
    return () => clearTimeout(id);
  }, [meta, loads, settings, currentId, revision, savedSnap, lastSavedAt]);

  // --------------------------------------------------------------- saving
  const applyProject = useCallback((p) => {
    const nextMeta = { ...BLANK_META, name: p.name, client: p.client || '', site: p.site || '', engineer: p.engineer || '', status: p.status || 'draft', notes: p.notes || '' };
    const nextLoads = withUids(p.loads || []);
    const nextSettings = { ...INITIAL_SETTINGS, ...(p.settings || {}) };
    setMeta(nextMeta);
    setLoadsRaw(nextLoads);
    setSettings(nextSettings);
    setCurrentId(p.id);
    setRevision(p.revision || 1);
    setLastSavedAt(p.updatedAt);
    setSavedSnap(snapshotOf(nextMeta, nextLoads, nextSettings));
    undoStack.current = [];
    setUndoDepth(0);
  }, []);

  const payload = useCallback(() => ({
    ...meta,
    name: meta.name.trim() || 'Untitled project',
    loads: cleanLoads(loads),
    settings: effective,
  }), [meta, loads, effective]);

  const saveNow = useCallback(async (revisionNote = '') => {
    if (invalidCount) { push(`Fix ${invalidCount} row error(s) before saving`, 'bad'); setView('schedule'); return; }
    if (!apiOnline) { push('API is offline — kept as a browser draft', 'bad'); return; }
    setSaving(true);
    setSaveError('');
    const body = { ...payload(), revisionNote };
    try {
      const saved = currentId ? await api.updateProject(currentId, body) : await api.createProject(body);
      setCurrentId(saved.id);
      setRevision(saved.revision);
      setLastSavedAt(saved.updatedAt);
      setMeta((m) => ({ ...m, name: saved.name }));
      setSavedSnap(snapshotOf({ ...meta, name: saved.name }, loads, settings));
      setHistoryKey((k) => k + 1);
      push(currentId ? `Saved revision ${saved.revision}` : `Created “${saved.name}”`, 'good');
    } catch (err) {
      setSaveError(err.message);
      if (err.offline) setApiOnline(false);
      push(`Could not save: ${err.message}`, 'bad', 7000);
    } finally {
      setSaving(false);
    }
  }, [invalidCount, apiOnline, payload, currentId, meta, loads, settings, push]);

  // Autosave the working copy of a saved project (no new revision).
  useEffect(() => {
    if (!autosave || !currentId || !apiOnline || !dirty || invalidCount || saving) return undefined;
    const id = setTimeout(async () => {
      const body = { ...payload(), autosave: true };
      const snapAtSend = snap;
      try {
        const saved = await api.updateProject(currentId, body);
        setLastSavedAt(saved.updatedAt);
        setSavedSnap(snapAtSend);
        setSaveError('');
      } catch (err) {
        setSaveError(err.message);
        if (err.offline) setApiOnline(false);
      }
    }, 2500);
    return () => clearTimeout(id);
  }, [autosave, currentId, apiOnline, dirty, invalidCount, saving, payload, snap]);

  // Warn before closing with unsaved work on a saved project.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty && currentId) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, currentId]);

  // Keyboard: Ctrl/Cmd+S save, Ctrl/Cmd+Z undo (outside text fields' own undo)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
      if (e.key.toLowerCase() === 'z' && !e.shiftKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, undo]);

  // ------------------------------------------------------------- projects
  const openProject = async (id) => {
    if (dirty && currentId && currentId !== id
      // eslint-disable-next-line no-alert
      && !window.confirm('You have unsaved changes. Open another project anyway?')) return;
    try {
      const p = await api.getProject(id);
      applyProject(p);
      push(`Opened “${p.name}”`, 'good');
      setView('dashboard');
    } catch (err) { push(`Could not open: ${err.message}`, 'bad'); }
  };

  const newProject = (force) => {
    // eslint-disable-next-line no-alert
    if (!force && dirty && !window.confirm('Start a new project? Unsaved changes in the current one will be lost.')) return;
    const m = { ...BLANK_META };
    setMeta(m);
    setLoadsRaw([]);
    setSettings(INITIAL_SETTINGS);
    setCurrentId(null);
    setRevision(null);
    setLastSavedAt(null);
    setSavedSnap(snapshotOf(m, [], INITIAL_SETTINGS));
    undoStack.current = [];
    setUndoDepth(0);
    setView('schedule');
  };

  const restore = async (rev) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Restore revision ${rev}? It becomes a new revision; nothing is deleted.`)) return;
    try {
      const p = await api.restoreRevision(currentId, rev);
      applyProject(p);
      setHistoryKey((k) => k + 1);
      push(`Restored rev ${rev} as rev ${p.revision}`, 'good');
    } catch (err) { push(`Restore failed: ${err.message}`, 'bad'); }
  };

  const setSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const saveState = saving ? 'saving'
    : saveError && currentId ? 'error'
      : !dirty ? (currentId ? 'saved' : 'idle')
        : invalidCount ? 'invalid'
          : currentId ? 'dirty' : 'draft';

  const counts = {
    schedule: { n: loads.length, tone: invalidCount ? 'bad' : '' },
    dashboard: report?.warnings?.length ? { n: report.warnings.length, tone: 'warn' } : null,
  };

  const title = VIEWS.find((v) => v.key === view)?.label;

  return (
    <div className="app">
      <Nav view={view} setView={setView} projectName={meta.name} currentId={currentId} saveState={saveState} apiOnline={apiOnline} counts={counts} revision={revision} />

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Voltwise / {title}</div>
            <h1>{meta.name || 'Untitled project'}</h1>
            <div className="caption">
              {[meta.client, meta.site].filter(Boolean).join(' · ') || 'LT distribution · load, cable & transformer sizing'}
              {currentId && revision ? ` · rev ${revision}` : ''}
            </div>
          </div>
          <div className="btn-row">
            {undoDepth ? <button type="button" className="btn btn-ghost" onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button> : null}
            <button type="button" className="btn btn-ghost" onClick={() => setView('reports')}>⇩ Export</button>
            <button type="button" className="btn" onClick={() => saveNow()} disabled={saving || !apiOnline} title="Ctrl+S">
              {saving ? 'Saving…' : currentId ? 'Save revision' : 'Save project'}
            </button>
          </div>
        </header>

        {calcError ? <div className="alert alert-error">{calcError}</div> : null}
        {!apiOnline ? (
          <div className="alert alert-info">
            Offline mode — calculations run in your browser and your work is kept as a browser draft. Start the API with <span className="mono">npm run dev:all</span> to save projects and export PDF / Excel.
          </div>
        ) : null}

        <ErrorBoundary key={view}>
          {view === 'dashboard' ? <Dashboard report={report} settings={effective} goTo={setView} /> : null}
          {view === 'schedule' ? <Schedule loads={loads} setLoads={setLoads} report={report} projectName={meta.name} push={push} canUndo={undoDepth > 0} onUndo={undo} /> : null}
          {view === 'calc' ? <Calculations report={report} settings={settings} setSetting={setSetting} settingErrors={settingErrors} /> : null}
          {view === 'projects' ? (
            <Projects
              meta={meta}
              setMeta={setMeta}
              currentId={currentId}
              apiOnline={apiOnline}
              onSave={saveNow}
              saving={saving}
              onNew={newProject}
              onOpen={openProject}
              push={push}
              autosave={autosave}
              setAutosave={setAutosave}
              lastSavedAt={lastSavedAt}
              historyKey={historyKey}
              onRestore={restore}
              invalidCount={invalidCount}
            />
          ) : null}
          {view === 'reports' ? <Reports report={report} loads={loads} settings={effective} meta={meta} apiOnline={apiOnline} push={push} invalidCount={invalidCount} revision={revision} /> : null}
        </ErrorBoundary>

        <footer className="footer">
          <span>VOLTWISE · LOAD STUDIO v2</span>
          <span>PRELIMINARY ENGINEERING ESTIMATES · VERIFY AGAINST IS / IEC AND MANUFACTURER DATA BEFORE CONSTRUCTION</span>
        </footer>
      </main>

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
