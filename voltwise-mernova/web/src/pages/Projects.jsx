import { useEffect, useState } from 'react';

import { Panel, SectionHead } from '../components/MetricCard.jsx';
import { Empty, Field } from '../components/Ui.jsx';
import { useDebounced } from '../hooks/useDebounced.js';
import { api } from '../api/client.js';
import { fmt } from '../lib/format.js';

const STATUS = { draft: 'Draft', review: 'In review', final: 'Final' };

const when = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

function History({ projectId, onRestore, refreshKey, push }) {
  const [state, setState] = useState({ loading: true, revisions: [], current: 1 });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api.revisions(projectId)
      .then((r) => alive && setState({ loading: false, revisions: r.revisions, current: r.current }))
      .catch((err) => { if (alive) { setState({ loading: false, revisions: [], current: 1 }); push(`History unavailable: ${err.message}`, 'bad'); } });
    return () => { alive = false; };
  }, [projectId, refreshKey, push]);

  if (state.loading) return <div className="skeleton" style={{ height: 120 }} />;
  if (!state.revisions.length) return <Empty title="No history yet" />;
  return (
    <ol className="timeline">
      {state.revisions.map((r) => (
        <li key={r.rev} className={r.rev === state.current ? 'current' : ''}>
          <div className="tl-dot" />
          <div className="tl-body">
            <div className="tl-head">
              <b>Rev {r.rev}</b>
              <span className="muted">{when(r.savedAt)}</span>
              {r.rev === state.current ? <span className="tag">current</span> : (
                <button type="button" className="link" onClick={() => onRestore(r.rev)}>Restore</button>
              )}
            </div>
            {r.note ? <div className="tl-note">{r.note}</div> : null}
            <div className="caption mono">
              {r.loadCount} loads
              {r.summary ? ` · ${fmt(r.summary.maxDemandKva, 1)} kVA MD · ${r.summary.transformerKva ?? '—'} kVA TX · ${r.summary.cable ?? '—'}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Projects({
  meta, setMeta, currentId, apiOnline, onSave, saving, onNew, onOpen, push, autosave, setAutosave, lastSavedAt, historyKey, onRestore, invalidCount,
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [listKey, setListKey] = useState(0);
  const dq = useDebounced(q, 250);

  useEffect(() => {
    if (!apiOnline) return undefined;
    let alive = true;
    setLoading(true);
    api.listProjects({ q: dq, status })
      .then((r) => alive && setProjects(r.projects))
      .catch((err) => alive && push(`Could not load projects: ${err.message}`, 'bad'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [apiOnline, dq, status, listKey, historyKey, push]);

  const del = async (p) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete “${p.name}” and its ${p.revisionCount} revision(s)? This cannot be undone.`)) return;
    try {
      await api.deleteProject(p.id);
      push(`Deleted “${p.name}”`);
      if (p.id === currentId) onNew(true);
      setListKey((k) => k + 1);
    } catch (err) { push(`Delete failed: ${err.message}`, 'bad'); }
  };

  const dup = async (p) => {
    try {
      const copy = await api.duplicateProject(p.id);
      push(`Created “${copy.name}”`, 'good');
      setListKey((k) => k + 1);
    } catch (err) { push(`Duplicate failed: ${err.message}`, 'bad'); }
  };

  const save = async () => {
    await onSave(note.trim());
    setNote('');
  };

  const set = (k) => (e) => setMeta((m) => ({ ...m, [k]: e.target.value }));

  return (
    <>
      <div className="grid-2-wide">
        <Panel
          title={currentId ? 'Project details' : 'New project'}
          sub={currentId ? `Stored in the database · last saved ${when(lastSavedAt)}` : 'Not saved yet — give it a name and save'}
          right={<button type="button" className="btn btn-ghost btn-sm" onClick={() => onNew(false)}>+ New project</button>}
        >
          <div className="form-grid two">
            <Field label="Project name"><input value={meta.name} onChange={set('name')} placeholder="e.g. Apartment block — Phase 2" /></Field>
            <Field label="Client"><input value={meta.client} onChange={set('client')} placeholder="Client / owner" /></Field>
            <Field label="Site / location"><input value={meta.site} onChange={set('site')} placeholder="City, plot, substation…" /></Field>
            <Field label="Prepared by"><input value={meta.engineer} onChange={set('engineer')} placeholder="Engineer name" /></Field>
            <Field label="Status">
              <select value={meta.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Revision note" hint="Saved with this revision in the history">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added lift loads" />
            </Field>
          </div>
          <Field label="Notes"><textarea rows={3} value={meta.notes} onChange={set('notes')} placeholder="Assumptions, references, open points…" /></Field>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button type="button" className="btn" onClick={save} disabled={saving || !apiOnline || invalidCount > 0}>
              {saving ? 'Saving…' : currentId ? 'Save new revision' : 'Save project'}
            </button>
            <label className={`chip ${autosave ? 'on' : ''}`}>
              <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} />
              Autosave every few seconds
            </label>
            {!apiOnline ? <span className="caption tone-warn">API offline — your work is kept as a browser draft.</span> : null}
            {invalidCount ? <span className="caption tone-bad">{invalidCount} schedule row(s) have errors — fix them to save.</span> : null}
          </div>
        </Panel>

        <Panel title="Revision history" sub={currentId ? 'Manual saves create revisions; autosave updates the working copy' : ''}>
          {currentId && apiOnline
            ? <History projectId={currentId} refreshKey={historyKey} onRestore={onRestore} push={push} />
            : <Empty icon="↺" title="Save the project to start its history" />}
        </Panel>
      </div>

      <SectionHead
        number="▤"
        title="Saved projects"
        sub={apiOnline ? `${projects.length} found` : 'Start the API to list saved projects'}
        right={(
          <div className="toolbar tight">
            <div className="search">
              <span aria-hidden>⌕</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, client, site…" aria-label="Search projects" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        )}
      />
      {!apiOnline ? (
        <Panel><Empty icon="⚠" title="API offline">Run <span className="mono">npm run dev:all</span> from the project folder, then reload.</Empty></Panel>
      ) : loading && !projects.length ? (
        <div className="project-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>
      ) : !projects.length ? (
        <Panel><Empty icon="▤" title={q || status ? 'No projects match' : 'No saved projects yet'} /></Panel>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.id} className={`project-card ${p.id === currentId ? 'active' : ''}`}>
              <div className="pc-head">
                <span className={`status-pill ${p.status === 'final' ? 'good' : p.status === 'review' ? 'warn' : ''}`}>{STATUS[p.status] || 'Draft'}</span>
                <span className="caption">rev {p.revision || 1} · {when(p.updatedAt)}</span>
              </div>
              <button type="button" className="pc-title" onClick={() => onOpen(p.id)}>{p.name}</button>
              <div className="caption">{[p.client, p.site].filter(Boolean).join(' · ') || 'No client / site'}</div>
              <div className="pc-stats">
                <div><b>{p.loads?.length ?? 0}</b><span>loads</span></div>
                <div><b>{fmt(p.digest?.maxDemandKva, 0)}</b><span>kVA MD</span></div>
                <div><b>{p.digest?.transformerKva ?? '—'}</b><span>kVA TX</span></div>
                <div><b>{p.digest?.cable?.split(' ')[0] ?? '—'}</b><span>mm²</span></div>
              </div>
              <div className="pc-actions">
                <button type="button" className="btn btn-sm" onClick={() => onOpen(p.id)}>{p.id === currentId ? 'Reopen' : 'Open'}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => dup(p)}>Duplicate</button>
                <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => del(p)}>Delete</button>
                {p.digest?.warnings ? <span className="tone-warn caption" title="Design checks to review">⚠ {p.digest.warnings}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
