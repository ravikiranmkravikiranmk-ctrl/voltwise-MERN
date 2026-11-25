import { Component, useEffect } from 'react';

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h4>{title}</h4>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} role="status">
          <span className="toast-dot" />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon = '∅', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {children ? <div className="caption">{children}</div> : null}
    </div>
  );
}

/** Keeps one broken view from blanking the whole app. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[voltwise] view crashed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <div className="alert alert-error">
            Something went wrong in this view: {String(this.state.error.message || this.state.error)}
          </div>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Field({ label, error, hint, children, inline }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${inline ? 'inline' : ''}`}>
      {label ? <label>{label}</label> : null}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="caption">{hint}</div> : null}
    </div>
  );
}

export function NumberInput({ value, onChange, ...rest }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      {...rest}
    />
  );
}

export function Slider({ label, value, onChange, min, max, step, format }) {
  return (
    <div className="field">
      <div className="slider-head">
        <label>{label}</label>
        <span className="slider-value">{format(Number(value))}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
