import { fmt } from '../lib/format.js';

export function MetricCard({ label, value, unit, foot, tone = '', icon }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-top">
        <div className="metric-label">{label}</div>
        {icon ? <span className="metric-icon" aria-hidden>{icon}</span> : null}
      </div>
      <div className="metric-value">
        {value}
        {unit ? <span className="metric-unit">{unit}</span> : null}
      </div>
      {foot ? <div className="metric-foot">{foot}</div> : null}
    </div>
  );
}

export function SectionHead({ number, title, sub, right }) {
  return (
    <div className="section-head">
      {number ? <div className="section-num">{number}</div> : null}
      <div className="section-title">{title}</div>
      {sub ? <div className="section-sub">{sub}</div> : null}
      {right ? <div className="section-right">{right}</div> : null}
    </div>
  );
}

export function MiniMetric({ label, value, tone = '' }) {
  return (
    <div className="mini">
      <div className="metric-label">{label}</div>
      <div className={`mini-value ${tone}`}>{value}</div>
    </div>
  );
}

export function Panel({ title, sub, right, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title || right ? (
        <div className="panel-head">
          <div>
            {title ? <h4>{title}</h4> : null}
            {sub ? <div className="caption">{sub}</div> : null}
          </div>
          {right ? <div className="panel-right">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Semicircle gauge for utilisation (0..max%), with a limit marker. */
export function Gauge({ value = 0, limit = 80, max = 125, label = 'Loading', sub }) {
  const clamped = Math.max(0, Math.min(value, max));
  const angle = (v) => Math.PI * (1 - v / max);
  const pt = (v, r) => [100 + r * Math.cos(angle(v)), 100 - r * Math.sin(angle(v))];
  const arc = (from, to, r) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > max / 2 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const color = value <= limit ? 'var(--lime)' : value <= 100 ? 'var(--amber)' : 'var(--danger)';
  const [lx1, ly1] = pt(limit, 64);
  const [lx2, ly2] = pt(limit, 92);
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 116" role="img" aria-label={`${label} ${fmt(value, 1)}%`}>
        <path d={arc(0, max, 78)} stroke="rgba(164,190,220,0.14)" strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d={arc(limit, Math.min(100, max), 78)} stroke="rgba(255,190,92,0.22)" strokeWidth="16" fill="none" />
        <path d={arc(100, max, 78)} stroke="rgba(255,143,143,0.22)" strokeWidth="16" fill="none" />
        {clamped > 0.5 ? <path d={arc(0, clamped, 78)} stroke={color} strokeWidth="16" fill="none" strokeLinecap="round" /> : null}
        <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#eaf1fb" strokeWidth="2" strokeDasharray="3 2" />
        <text x="100" y="92" textAnchor="middle" className="gauge-value" fill={color}>{fmt(value, 1)}%</text>
        <text x="100" y="110" textAnchor="middle" className="gauge-label">{label}</text>
      </svg>
      {sub ? <div className="caption center">{sub}</div> : null}
    </div>
  );
}

/** Horizontal progress bar with a limit tick. */
export function UtilBar({ value, limit = 80, label, right }) {
  const tone = value <= limit ? 'good' : value <= 100 ? 'warn' : 'bad';
  return (
    <div className="utilbar">
      <div className="utilbar-head"><span>{label}</span><span className={`tone-${tone}`}>{right ?? `${fmt(value, 1)}%`}</span></div>
      <div className="utilbar-track">
        <div className={`utilbar-fill ${tone}`} style={{ width: `${Math.min(value, 125) / 1.25}%` }} />
        <div className="utilbar-limit" style={{ left: `${limit / 1.25}%` }} title={`Limit ${limit}%`} />
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  const map = { ok: ['OK', 'good'], warn: ['Check', 'warn'], fail: ['Fail', 'bad'], healthy: ['Healthy', 'good'], high: ['High', 'warn'], overloaded: ['Overloaded', 'bad'], pass: ['Pass', 'good'] };
  const [text, tone] = map[status] || [status, ''];
  return <span className={`status-pill ${tone}`}>{text}</span>;
}
