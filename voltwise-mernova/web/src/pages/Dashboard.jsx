import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';

import { Gauge, MetricCard, MiniMetric, Panel, SectionHead, StatusPill, UtilBar } from '../components/MetricCard.jsx';
import { Empty } from '../components/Ui.jsx';
import { CATEGORY_COLORS, cableLabel, fmt } from '../lib/format.js';

const AXIS = { stroke: '#5d6f86', fontSize: 11, tickLine: false, axisLine: false };
const GRID = { stroke: 'rgba(164,190,220,0.08)', vertical: false };

function ChartTip({ active, payload, label, unit = 'kW' }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{label}</div>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <span className="sw" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <b>{fmt(p.value, 1)} {unit}</b>
        </div>
      ))}
      {payload.length > 1 ? <div className="chart-tip-total">Total <b>{fmt(total, 1)} {unit}</b></div> : null}
    </div>
  );
}

export function Dashboard({ report, settings, goTo }) {
  const [profileMode, setProfileMode] = useState('stacked');
  const [barMode, setBarMode] = useState('load');

  const a = report?.analysis;
  const loadBars = useMemo(() => (report?.breakdown || [])
    .map((l) => ({ name: l.name, connected: l.connectedKw, demand: l.demandKw, kvar: l.demandKvar, category: l.category }))
    .sort((x, y) => y.connected - x.connected)
    .slice(0, 14), [report]);

  if (!report || !report.breakdown.length) {
    return (
      <Panel>
        <Empty icon="⚡" title="No loads yet">
          Add equipment in the <button type="button" className="link" onClick={() => goTo('schedule')}>load schedule</button> to see the dashboard.
        </Empty>
      </Panel>
    );
  }

  const tr = a.transformer;
  const d = a.demand;
  const flow = [
    { stage: 'Connected', kw: d.connectedKw },
    { stage: 'After demand factors', kw: d.demandKw },
    { stage: 'Max demand (diversity)', kw: d.maxDemandKw },
    { stage: 'Profile peak', kw: a.profile.peakKw },
  ];

  return (
    <>
      <div className="metric-row six">
        <MetricCard label="Connected load" value={fmt(report.summary.connectedKw, 1)} unit="kW" foot={`${report.breakdown.length} schedule lines`} icon="⏻" />
        <MetricCard label="Maximum demand" value={fmt(report.summary.maxDemandKva, 1)} unit="kVA" foot={`${fmt(d.maxDemandKw, 1)} kW after diversity`} icon="▲" tone="accent" />
        <MetricCard
          label="Power factor"
          value={fmt(report.summary.overallPf, 3)}
          foot={a.pfc?.needed ? `${a.pfc.recommendedBankKvar} kVAr APFC → ${fmt(a.pfc.achievedPf, 2)}` : 'Meets target'}
          tone={report.summary.overallPf < 0.85 ? 'warn' : ''}
          icon="φ"
        />
        <MetricCard label="Feeder current" value={fmt(report.feeder.current, 1)} unit="A" foot={`${report.feeder.phases}-phase · ${report.feeder.voltage} V`} icon="∿" />
        <MetricCard
          label="Main cable"
          value={report.cable ? `${report.cable.sizeSqmm}` : '—'}
          unit={report.cable ? `mm² ${report.cable.conductor === 'al' ? 'Al' : 'Cu'}` : ''}
          foot={report.cable ? `${report.cable.runs > 1 ? `${report.cable.runs} runs · ` : ''}Vd ${fmt(report.cable.voltageDropPct, 2)}%` : 'Not sized'}
          tone={!report.cable ? 'bad' : ''}
          icon="≡"
        />
        <MetricCard
          label="Transformer"
          value={tr ? tr.kva : '—'}
          unit={tr ? 'kVA' : ''}
          foot={tr ? `${fmt(tr.loadingPct, 1)}% loaded now` : 'Not sized'}
          tone={tr?.status === 'overloaded' ? 'bad' : tr?.status === 'high' ? 'warn' : ''}
          icon="⧉"
        />
      </div>

      {report.warnings.length ? (
        <div className="warn-strip">
          {report.warnings.map((w) => <div key={w} className="alert alert-warn">⚠ {w}</div>)}
        </div>
      ) : (
        <div className="alert alert-good">✓ All design checks pass for the current schedule.</div>
      )}

      <div className="grid-dash">
        <Panel
          className="span-2"
          title="Power consumption — 24-hour profile"
          sub={`Peak ${fmt(a.profile.peakKw, 1)} kW at ${a.profile.peakHour} · ${fmt(a.profile.dailyEnergyKwh, 0)} kWh/day · load factor ${fmt(a.profile.loadFactor, 2)}`}
          right={(
            <div className="seg">
              {[['stacked', 'By category'], ['total', 'kW / kVA']].map(([k, l]) => (
                <button key={k} type="button" className={profileMode === k ? 'on' : ''} onClick={() => setProfileMode(k)}>{l}</button>
              ))}
            </div>
          )}
        >
          <div className="chart-box tall">
            <ResponsiveContainer>
              {profileMode === 'stacked' ? (
                <AreaChart data={a.profile.points} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    {a.profile.categories.map((c) => (
                      <linearGradient key={c.key} id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CATEGORY_COLORS[c.key]} stopOpacity={0.75} />
                        <stop offset="100%" stopColor={CATEGORY_COLORS[c.key]} stopOpacity={0.15} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="label" {...AXIS} interval={2} />
                  <YAxis {...AXIS} />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceLine y={d.maxDemandKw} stroke="#ff8f8f" strokeDasharray="4 4" label={{ value: 'MD', fill: '#ff8f8f', fontSize: 10, position: 'right' }} />
                  {a.profile.categories.map((c) => (
                    <Area key={c.key} type="monotone" dataKey={c.key} name={c.label} stackId="1" stroke={CATEGORY_COLORS[c.key]} fill={`url(#g-${c.key})`} strokeWidth={1.4} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                </AreaChart>
              ) : (
                <AreaChart data={a.profile.points} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-kw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#56d6d0" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#56d6d0" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="label" {...AXIS} interval={2} />
                  <YAxis {...AXIS} />
                  <Tooltip content={<ChartTip unit="" />} />
                  {tr ? <ReferenceLine y={tr.kva * settings.maxLoading} stroke="#ffbe5c" strokeDasharray="4 4" label={{ value: `${Math.round(settings.maxLoading * 100)}% of ${tr.kva} kVA`, fill: '#ffbe5c', fontSize: 10, position: 'insideTopRight' }} /> : null}
                  <Area type="monotone" dataKey="kw" name="kW" stroke="#56d6d0" fill="url(#g-kw)" strokeWidth={2} />
                  <Line type="monotone" dataKey="kva" name="kVA" stroke="#b8ef75" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="kvar" name="kVAr" stroke="#c58cff" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="caption">Indicative profile from typical usage curves per category — hover for hourly values.</div>
        </Panel>

        <Panel title="Transformer utilisation" sub={tr ? `${tr.kva} kVA recommended` : ''} right={tr ? <StatusPill status={tr.status} /> : null}>
          {tr ? (
            <>
              <Gauge value={tr.loadingPct} limit={tr.limitPct} label="loading at max demand" />
              <UtilBar label="With future growth" value={tr.futureLoadingPct} limit={tr.limitPct} />
              <div className="mini-metrics three">
                <MiniMetric label="Headroom" value={`${fmt(tr.headroomKva, 1)} kVA`} tone={tr.headroomKva < 0 ? 'bad' : ''} />
                <MiniMetric label="LV current" value={`${fmt(tr.lvFullLoadA, 0)} A`} />
                <MiniMetric label="LV fault" value={`${fmt(tr.lvFaultKa, 1)} kA`} />
              </div>
            </>
          ) : <Empty title="Not sized">Add loads to size the transformer.</Empty>}
        </Panel>

        <Panel title="Load by category" sub="Share of demand kW">
          <div className="chart-box">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={a.categories} dataKey="demandKw" nameKey="label" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="none">
                  {a.categories.map((c) => <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend-list">
            {a.categories.map((c) => (
              <div key={c.category} className="legend-row">
                <span className="sw" style={{ background: CATEGORY_COLORS[c.category] }} />
                <span className="grow">{c.label}</span>
                <span className="mono">{fmt(c.demandKw, 1)} kW</span>
                <span className="mono muted">{fmt(c.sharePct, 0)}%</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          className="span-2"
          title="Connected load vs demand"
          sub="Top equipment lines — the gap is what demand factors remove"
          right={(
            <div className="seg">
              {[['load', 'kW'], ['kvar', 'kVAr']].map(([k, l]) => (
                <button key={k} type="button" className={barMode === k ? 'on' : ''} onClick={() => setBarMode(k)}>{l}</button>
              ))}
            </div>
          )}
        >
          <div className="chart-box tall">
            <ResponsiveContainer>
              <BarChart data={loadBars} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={2}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="name" {...AXIS} interval={0} tick={{ fontSize: 10, fill: '#8da2b9' }} tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                <YAxis {...AXIS} />
                <Tooltip content={<ChartTip unit={barMode === 'kvar' ? 'kVAr' : 'kW'} />} cursor={{ fill: 'rgba(86,214,208,0.06)' }} />
                {barMode === 'load' ? (
                  <>
                    <Bar dataKey="connected" name="Connected" fill="rgba(141,162,185,0.35)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="demand" name="Demand" radius={[4, 4, 0, 0]}>
                      {loadBars.map((b) => <Cell key={b.name} fill={CATEGORY_COLORS[b.category]} />)}
                    </Bar>
                  </>
                ) : (
                  <Bar dataKey="kvar" name="Reactive" fill="#c58cff" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

      </div>

      <SectionHead number="→" title="Quick sizing" sub="Open Calculations for the full working" right={<button type="button" className="btn btn-ghost" onClick={() => goTo('calc')}>Open calculations</button>} />
      <div className="grid-4">
        <Panel title="Connected → max demand" sub={`Demand factor ${fmt(d.overallDemandFactor, 2)} · diversity ${fmt(d.diversityFactor, 2)}`}>
          <div className="flow">
            {flow.map((f, i) => (
              <div key={f.stage} className="flow-row">
                <div className="flow-label">{f.stage}</div>
                <div className="flow-track">
                  <div className="flow-fill" style={{ width: `${(f.kw / (d.connectedKw || 1)) * 100}%`, opacity: 1 - i * 0.15 }} />
                </div>
                <div className="flow-val mono">{fmt(f.kw, 1)} kW</div>
              </div>
            ))}
          </div>
          <div className="mini-metrics">
            <MiniMetric label="Contract demand" value={`${d.contractDemandKva} kVA`} />
            <MiniMetric label="Monthly energy" value={`${fmt(d.monthlyEnergyKwh, 0)} kWh`} />
            <MiniMetric label="3-φ / 1-φ demand" value={`${fmt(d.phaseSplit.threePhaseKw, 0)} / ${fmt(d.phaseSplit.singlePhaseKw, 0)} kW`} />
          </div>
        </Panel>
        <Panel title="Main feeder cable">
          <div className="result-good">
            <div className="headline">{report.cable ? cableLabel(report.cable, report.feeder.phases) : '—'}</div>
            <div className="sub">{a.conductorLabel} · XLPE · armoured · {report.cable?.lengthM} m</div>
          </div>
          {report.cable ? (
            <div className="mini-metrics">
              <MiniMetric label="Derated capacity" value={`${fmt(report.cable.deratedCapacityA, 0)} A`} />
              <MiniMetric label="Governed by" value={report.cable.limitedBy} />
            </div>
          ) : null}
        </Panel>
        <Panel title="Power factor correction">
          <div className="result-good">
            <div className="headline">{a.pfc?.needed ? `${a.pfc.recommendedBankKvar} kVAr` : 'Not needed'}</div>
            <div className="sub">APFC panel to reach PF {fmt(settings.targetPf, 2)}</div>
          </div>
          {a.pfc?.needed ? (
            <div className="mini-metrics">
              <MiniMetric label="kVA released" value={`${fmt(a.pfc.kvaReleased, 1)} kVA`} />
              <MiniMetric label="Current cut" value={`${fmt(a.pfc.currentReductionPct, 1)}%`} tone="good" />
            </div>
          ) : null}
        </Panel>
        <Panel title="Branch circuits">
          <div className="result-good">
            <div className="headline">{a.branches.filter((b) => b.status === 'ok').length} / {a.branches.length}</div>
            <div className="sub">circuits pass without notes</div>
          </div>
          <div className="mini-metrics">
            <MiniMetric label="Need review" value={a.branches.filter((b) => b.status === 'warn').length} tone={a.branches.some((b) => b.status === 'warn') ? 'warn' : ''} />
            <MiniMetric label="Failed" value={a.branches.filter((b) => b.status === 'fail').length} tone={a.branches.some((b) => b.status === 'fail') ? 'bad' : ''} />
          </div>
        </Panel>
      </div>
    </>
  );
}
