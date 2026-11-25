export const VIEWS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◧' },
  { key: 'schedule', label: 'Load schedule', icon: '☰' },
  { key: 'calc', label: 'Calculations', icon: '∑' },
  { key: 'projects', label: 'Projects', icon: '▤' },
  { key: 'reports', label: 'Reports', icon: '⇩' },
];

const SAVE_TEXT = {
  idle: 'Not saved yet',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  draft: 'Draft kept in this browser',
  error: 'Autosave failed',
  invalid: 'Fix row errors to save',
};

export function Nav({ view, setView, projectName, currentId, saveState, apiOnline, counts, revision }) {
  return (
    <nav className="nav">
      <div className="brand">
        <div className="brand-mark">⚡</div>
        <div>
          <div className="brand-name">Voltwise</div>
          <div className="brand-sub">Load Studio</div>
        </div>
      </div>

      <div className="nav-project">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Project</div>
        <div className="nav-project-name" title={projectName}>{projectName || 'Untitled project'}</div>
        <div className={`save-state ${saveState}`}>
          <span className="dot" /> {SAVE_TEXT[saveState] || saveState}
          {currentId && revision ? <span className="rev">rev {revision}</span> : null}
        </div>
      </div>

      <ul className="nav-list">
        {VIEWS.map((v) => (
          <li key={v.key}>
            <button
              type="button"
              className={`nav-item ${view === v.key ? 'active' : ''}`}
              onClick={() => setView(v.key)}
              aria-current={view === v.key ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden>{v.icon}</span>
              <span className="nav-label">{v.label}</span>
              {counts?.[v.key] ? <span className={`nav-count ${counts[v.key].tone || ''}`}>{counts[v.key].n}</span> : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="nav-foot">
        <span className="badge" title={apiOnline ? 'API reachable — projects saved to the database' : 'API not reachable — calculations still work offline'}>
          <span className={`dot ${apiOnline ? 'online' : 'offline'}`} />
          {apiOnline ? 'API online' : 'Offline mode'}
        </span>
        <div className="caption" style={{ marginTop: 8 }}>Indicative data · verify before construction</div>
      </div>
    </nav>
  );
}
