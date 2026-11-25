import { useMemo, useState } from 'react';
import { powerFactorCorrection } from '@voltwise/engine';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { MiniMetric, Panel, SectionHead, StatusPill, UtilBar } from '../components/MetricCard.jsx';
import { Empty, Field, NumberInput, Slider } from '../components/Ui.jsx';
import { cableLabel, fmt } from '../lib/format.js';

const AXIS = { stroke: '#5d6f86', fontSize: 11, tickLine: false, axisLine: false };

const PRESETS = {
  'LT 415 V · 3-φ': { voltage: 415, phases: 3 },
  'LT 433 V · 3-φ (DT secondary)': { voltage: 433, phases: 3 },
  '230 V · 1-φ': { voltage: 230, phases: 1 },
};

function Settings({ settings, setSetting, errors }) {
  return (
    <Panel title="Design inputs" sub="Changes apply instantly to every result">
      <div className="settings-group">
        <div className="eyebrow">Supply</div>
        <div className="chips">
          {Object.entries(PRESETS).map(([label, p]) => (
            <button
              key={label}
              type="button"
              className={`chip ${settings.voltage === p.voltage && settings.phases === p.phases ? 'on' : ''}`}
              onClick={() => { setSetting('voltage', p.voltage); setSetting('phases', p.phases); }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="form-grid two">
          <Field label="Line voltage (V)" error={errors.voltage}><NumberInput value={settings.voltage} min={100} max={11000} step={5} onChange={(v) => setSetting('voltage', v)} /></Field>
          <Field label="System">
            <select value={settings.phases} onChange={(e) => setSetting('phases', Number(e.target.value))}>
              <option value={3}>3-phase</option>
              <option value={1}>1-phase</option>
            </select>
          </Field>
          <Field label="Diversity factor" error={errors.diversityFactor} hint="≥ 1 · typical 1.1–1.5"><NumberInput value={settings.diversityFactor} min={1} max={5} step={0.05} onChange={(v) => setSetting('diversityFactor', v)} /></Field>
          <Field label="Target power factor" error={errors.targetPf}><NumberInput value={settings.targetPf} min={0.8} max={1} step={0.01} onChange={(v) => setSetting('targetPf', v)} /></Field>
        </div>
      </div>

      <div className="settings-group">
        <div className="eyebrow">Cables</div>
        <div className="seg full">
          {[['cu', 'Copper'], ['al', 'Aluminium']].map(([k, l]) => (
            <button key={k} type="button" className={settings.conductor === k ? 'on' : ''} onClick={() => setSetting('conductor', k)}>{l} XLPE</button>
          ))}
        </div>
        <div className="form-grid two">
          <Field label="Main feeder length (m)" error={errors.cableLengthM}><NumberInput value={settings.cableLengthM} min={1} max={5000} step={10} onChange={(v) => setSetting('cableLengthM', v)} /></Field>
          <Field label="Default branch length (m)" error={errors.branchLengthM}><NumberInput value={settings.branchLengthM} min={1} max={5000} step={5} onChange={(v) => setSetting('branchLengthM', v)} /></Field>
          <Field label="Max parallel runs" error={errors.maxRuns}><NumberInput value={settings.maxRuns} min={1} max={8} step={1} onChange={(v) => setSetting('maxRuns', v)} /></Field>
        </div>
        <Slider label="Overall derating" value={settings.derating} min={0.4} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setSetting('derating', v)} />
        <Slider label="Maximum voltage drop" value={settings.maxVdPct} min={1} max={8} step={0.5} format={(v) => `${v.toFixed(1)}%`} onChange={(v) => setSetting('maxVdPct', v)} />
      </div>

      <div className="settings-group">
        <div className="eyebrow">Transformer</div>
        <Slider label="Maximum loading" value={settings.maxLoading} min={0.5} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setSetting('maxLoading', v)} />
        <Slider label="Future load allowance" value={settings.futureMargin} min={0} max={0.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setSetting('futureMargin', v)} />
      </div>

      <div className="settings-group">
        <div className="eyebrow">Short circuit</div>
        <div className="form-grid two">
          <Field label="Fault level (kA)" error={errors.faultKa} hint="0 = estimate from transformer"><NumberInput value={settings.faultKa} min={0} max={200} step={1} onChange={(v) => setSetting('faultKa', v)} /></Field>
          <Field label="Clearing time (s)" error={errors.faultTimeS}><NumberInput value={settings.faultTimeS} min={0.01} max={5} step={0.05} onChange={(v) => setSetting('faultTimeS', v)} /></Field>
        </div>
      </div>
    </Panel>
  );
}

function PfcCard({ report, settings }) {
  const base = report.analysis.pfc;
  const [target, setTarget] = useState(null);
  const tgt = target ?? settings.targetPf;
  const pfc = useMemo(() => (base ? powerFactorCorrection({
    kw: report.analysis.demand.maxDemandKw, currentPf: report.summary.overallPf, targetPf: tgt, voltage: settings.voltage, phases: settings.phases,
  }) : null), [base, report, tgt, settings.voltage, settings.phases]);
  if (!pfc) return null;
  const curve = [0.9, 0.92, 0.95, 0.97, 0.99, 1].map((t) => {
    const r = powerFactorCorrection({ kw: report.analysis.demand.maxDemandKw, currentPf: report.summary.overallPf, targetPf: t });
    return { target: t.toFixed(2), kvar: r.requiredKvar };
  });
  return (
    <Panel title="Power factor correction" sub="Q = P × (tan φ₁ − tan φ₂)" right={<StatusPill status={pfc.needed ? 'warn' : 'ok'} />}>
      <Slider label="What-if target PF" value={tgt} min={0.85} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={setTarget} />
      <div className="result-good">
        <div className="eyebrow">Recommended APFC bank</div>
        <div className="headline">{pfc.needed ? `${pfc.recommendedBankKvar} kVAr` : 'Not required'}</div>
        <div className="sub">{pfc.needed ? `${fmt(pfc.requiredKvar, 1)} kVAr calculated → next standard bank` : `Existing PF ${fmt(pfc.currentPf, 3)} already meets ${fmt(tgt, 2)}`}</div>
      </div>
      <div className="mini-metrics">
        <MiniMetric label="PF achieved" value={fmt(pfc.achievedPf, 3)} tone="good" />
        <MiniMetric label="kVA released" value={`${fmt(pfc.kvaReleased, 1)} kVA`} />
        <MiniMetric label="Current" value={`${fmt(pfc.currentBeforeA, 0)} → ${fmt(pfc.currentAfterA, 0)} A`} />
        <MiniMetric label="Reduction" value={`${fmt(pfc.currentReductionPct, 1)}%`} tone="good" />
      </div>
      <div className="chart-box short">
        <ResponsiveContainer>
          <BarChart data={curve} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="rgba(164,190,220,0.08)" vertical={false} />
            <XAxis dataKey="target" {...AXIS} />
            <YAxis {...AXIS} />
            <Tooltip formatter={(v) => [`${fmt(v, 1)} kVAr`, 'Required']} labelFormatter={(l) => `Target PF ${l}`} contentStyle={{ background: '#0f1c2c', border: '1px solid rgba(164,190,220,0.2)', borderRadius: 10 }} />
            <Bar dataKey="kvar" radius={[4, 4, 0, 0]}>
              {curve.map((c) => <Cell key={c.target} fill={Number(c.target) === Number(tgt.toFixed(2)) ? '#b8ef75' : '#56d6d0'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="caption">kVAr needed for each target PF</div>
    </Panel>
  );
}

export function Calculations({ report, settings, setSetting, settingErrors }) {
  const [branchFilter, setBranchFilter] = useState('all');
  if (!report) return <Panel><Empty title="Fix the inputs to see results" /></Panel>;
  const a = report.analysis;
  const tr = a.transformer;
  const sc = a.shortCircuit;
  const d = a.demand;
  const branches = a.branches.filter((b) => branchFilter === 'all' || b.status !== 'ok');
  const cableChart = a.cableCandidates.map((c) => ({ ...c, label: `${c.sizeSqmm}` }));

  return (
    <div className="calc-layout">
      <aside className="calc-side">
        <Settings settings={settings} setSetting={setSetting} errors={settingErrors} />
      </aside>

      <div className="calc-main">
        {!report.breakdown.length ? <Panel><Empty title="Add loads to the schedule to calculate" /></Panel> : (
          <>
            <SectionHead number="01" title="Demand analysis" sub="From connected load to the maximum demand the supply must carry" />
            <Panel>
              <table className="calc-table">
                <tbody>
                  <tr><td>Connected load</td><td className="formula">Σ qty × kW</td><td className="num">{fmt(d.connectedKw, 2)} kW</td></tr>
                  <tr><td>Demand load</td><td className="formula">Σ connected × DF</td><td className="num">{fmt(d.demandKw, 2)} kW</td></tr>
                  <tr><td>Overall demand factor</td><td className="formula">demand ÷ connected</td><td className="num">{fmt(d.overallDemandFactor, 3)}</td></tr>
                  <tr><td>Reactive demand</td><td className="formula">Σ kW × tan φ ÷ diversity</td><td className="num">{fmt(d.maxDemandKvar, 2)} kVAr</td></tr>
                  <tr><td>Overall power factor</td><td className="formula">kW ÷ √(kW² + kVAr²)</td><td className="num">{fmt(report.summary.overallPf, 3)}</td></tr>
                  <tr className="strong"><td>Maximum demand</td><td className="formula">√(kW² + kVAr²) ÷ {fmt(d.diversityFactor, 2)}</td><td className="num">{fmt(d.maxDemandKw, 2)} kW · {fmt(d.maxDemandKva, 2)} kVA</td></tr>
                  <tr><td>Feeder current</td><td className="formula">{settings.phases === 3 ? 'P ÷ (√3 · V · cos φ)' : 'P ÷ (V · cos φ)'}</td><td className="num">{fmt(report.feeder.current, 1)} A</td></tr>
                  <tr><td>Coincidence factor</td><td className="formula">1 ÷ diversity</td><td className="num">{fmt(d.coincidenceFactor, 3)}</td></tr>
                  <tr><td>Load factor (profile)</td><td className="formula">average ÷ peak</td><td className="num">{fmt(d.loadFactor, 3)}</td></tr>
                  <tr><td>Suggested contract demand</td><td className="formula">MD × (1 + growth), round up to 5</td><td className="num">{d.contractDemandKva} kVA</td></tr>
                </tbody>
              </table>
            </Panel>

            <SectionHead number="02" title="Main feeder cable" sub={`${a.conductorLabel} XLPE · ${settings.cableLengthM} m · derating ${fmt(settings.derating, 2)} · Vd ≤ ${fmt(settings.maxVdPct, 1)}%`} />
            <div className="grid-2-wide">
              <Panel title="Recommendation" right={report.cable ? <StatusPill status={sc && !sc.pass ? 'fail' : 'ok'} /> : <StatusPill status="fail" />}>
                {report.cable ? (
                  <>
                    <div className="result-good">
                      <div className="eyebrow">Recommended cable</div>
                      <div className="headline">{cableLabel(report.cable, report.feeder.phases)}</div>
                      <div className="sub">{a.conductorLabel} · XLPE · armoured · governed by {report.cable.limitedBy}</div>
                    </div>
                    <UtilBar label="Current vs derated capacity" value={(report.feeder.current / report.cable.deratedCapacityA) * 100} limit={100} right={`${fmt(report.feeder.current, 0)} / ${fmt(report.cable.deratedCapacityA, 0)} A`} />
                    <UtilBar label="Voltage drop vs limit" value={(report.cable.voltageDropPct / settings.maxVdPct) * 100} limit={90} right={`${fmt(report.cable.voltageDropPct, 2)}% of ${fmt(settings.maxVdPct, 1)}%`} />
                    {sc ? (
                      <div className={`check-row ${sc.pass ? 'good' : 'bad'}`}>
                        <b>Short-circuit withstand {sc.pass ? 'PASS' : 'FAIL'}</b>
                        <span>S<sub>min</sub> = I·√t ÷ k = {fmt(sc.faultKa, 2)} kA·√{sc.timeS} ÷ {sc.k} = {fmt(sc.minSqmm, 1)} mm² {sc.runs > 1 ? 'per run' : ''}{Number(settings.faultKa) > 0 ? '' : ' (fault estimated from transformer)'}</span>
                      </div>
                    ) : null}
                    <div className="mini-metrics three">
                      <MiniMetric label="Incomer" value={tr?.incomer?.ratingA ? `${tr.incomer.ratingA} A ${tr.incomer.type}` : '—'} />
                      <MiniMetric label="Loss at MD" value={`${fmt(a.cableCandidates.find((c) => c.sizeSqmm === report.cable.sizeSqmm)?.lossKw, 2)} kW`} />
                      <MiniMetric label="Runs" value={report.cable.runs} />
                    </div>
                  </>
                ) : <div className="alert alert-error">No cable within {settings.maxRuns} parallel runs meets both checks. Shorten the route, raise the derating or split the feeder.</div>}
              </Panel>
              <Panel title="Every size checked" sub="Single run — green bars pass both current and voltage drop">
                <div className="chart-box">
                  <ResponsiveContainer>
                    <BarChart data={cableChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(164,190,220,0.08)" vertical={false} />
                      <XAxis dataKey="label" {...AXIS} />
                      <YAxis {...AXIS} domain={[0, Math.ceil(settings.maxVdPct * 3)]} allowDataOverflow />
                      <Tooltip
                        contentStyle={{ background: '#0f1c2c', border: '1px solid rgba(164,190,220,0.2)', borderRadius: 10 }}
                        labelFormatter={(l) => `${l} mm²`}
                        formatter={(v, n, p) => [`${fmt(v, 2)}% (${fmt(p.payload.deratedCapacityA, 0)} A)`, 'Voltage drop']}
                      />
                      <ReferenceLine y={settings.maxVdPct} stroke="#ff8f8f" strokeDasharray="4 4" />
                      <Bar dataKey="voltageDropPct" radius={[4, 4, 0, 0]}>
                        {cableChart.map((c) => <Cell key={c.label} fill={c.currentOk && c.vdOk ? (report.cable?.sizeSqmm === c.sizeSqmm ? '#b8ef75' : '#56d6d0') : 'rgba(255,143,143,0.55)'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="caption">Voltage drop % per size (red line = limit). Red bars fail current or Vd.</div>
              </Panel>
            </div>

            <SectionHead number="03" title="Transformer capacity" sub="Required kVA = MD × (1 + growth) ÷ max loading" />
            <div className="grid-2-wide">
              <Panel title="Rating options" right={tr ? <StatusPill status={tr.status} /> : null}>
                {tr ? (
                  <table className="result-table">
                    <thead><tr><th>Rating</th><th>Loading now</th><th>With growth</th><th /></tr></thead>
                    <tbody>
                      {tr.alternatives.map((x) => (
                        <tr key={x.kva} className={x.recommended ? 'row-pick' : ''}>
                          <td><b>{x.kva} kVA</b>{x.recommended ? <span className="tag">recommended</span> : null}</td>
                          <td style={{ width: '34%' }}><UtilBar value={x.loadingPct} limit={tr.limitPct} label="" /></td>
                          <td className={x.ok ? 'tone-good' : 'tone-bad'}>{fmt(x.futureLoadingPct, 1)}%</td>
                          <td>{x.ok ? '✓' : '✕'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <Empty title="No transformer" />}
              </Panel>
              {tr ? (
                <Panel title="Capacity estimate">
                  <div className="result-good">
                    <div className="eyebrow">Next standard rating</div>
                    <div className="headline">{tr.kva} kVA</div>
                    <div className="sub">needs {fmt(report.transformer.requiredKva, 1)} kVA for {Math.round(settings.futureMargin * 100)}% growth at {Math.round(settings.maxLoading * 100)}% loading</div>
                  </div>
                  <div className="mini-metrics">
                    <MiniMetric label="Headroom" value={`${fmt(tr.headroomKva, 1)} kVA`} tone={tr.headroomKva < 0 ? 'bad' : 'good'} />
                    <MiniMetric label="Growth possible" value={`${fmt(tr.spareForGrowthPct, 0)}%`} />
                    <MiniMetric label="LV full-load current" value={`${fmt(tr.lvFullLoadA, 0)} A`} />
                    <MiniMetric label={`Est. LV fault (Z≈${tr.impedancePct}%)`} value={`${fmt(tr.lvFaultKa, 1)} kA`} />
                  </div>
                </Panel>
              ) : null}
            </div>

            <SectionHead number="04" title="Power factor & protection" />
            <div className="grid-2-wide">
              <PfcCard report={report} settings={settings} />
              <Panel title="Load balance & energy">
                <UtilBar label="3-phase demand share" value={(d.phaseSplit.threePhaseKw / (d.demandKw || 1)) * 100} limit={100} right={`${fmt(d.phaseSplit.threePhaseKw, 1)} kW`} />
                <UtilBar label="1-phase demand share" value={(d.phaseSplit.singlePhaseKw / (d.demandKw || 1)) * 100} limit={33} right={`${fmt(d.phaseSplit.singlePhaseKw, 1)} kW`} />
                <div className="caption">Keep single-phase loads spread evenly over R, Y and B. Above ~33% of demand, plan the phase allocation explicitly.</div>
                <div className="mini-metrics">
                  <MiniMetric label="Daily energy" value={`${fmt(d.dailyEnergyKwh, 0)} kWh`} />
                  <MiniMetric label="Monthly energy" value={`${fmt(d.monthlyEnergyKwh, 0)} kWh`} />
                  <MiniMetric label="Profile peak" value={`${fmt(a.profile.peakKw, 1)} kW @ ${a.profile.peakHour}`} />
                  <MiniMetric label="Load factor" value={fmt(d.loadFactor, 2)} />
                </div>
              </Panel>
            </div>

            <SectionHead
              number="05"
              title="Branch circuit schedule"
              sub="Ib ≤ In ≤ Iz · each line on its own circuit · motors & lifts at 125%"
              right={(
                <div className="seg">
                  {[['all', `All (${a.branches.length})`], ['issues', `Needs review (${a.branches.filter((b) => b.status !== 'ok').length})`]].map(([k, l]) => (
                    <button key={k} type="button" className={branchFilter === k ? 'on' : ''} onClick={() => setBranchFilter(k)}>{l}</button>
                  ))}
                </div>
              )}
            />
            <Panel>
              <div className="scroll-x">
                <table className="result-table">
                  <thead>
                    <tr><th>Equipment</th><th>Panel</th><th>Ph</th><th className="num">Ib (A)</th><th>Protection</th><th>Cable</th><th className="num">Iz (A)</th><th className="num">Length</th><th className="num">Vd</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={`${b.index}-${b.name}`}>
                        <td>{b.name}{b.note ? <div className="caption">{b.note}</div> : null}</td>
                        <td>{b.panel || '—'}</td>
                        <td>{b.phases}-φ</td>
                        <td className="num mono">{fmt(b.designCurrentA, 1)}</td>
                        <td>{b.breaker.ratingA ? <><b>{b.breaker.ratingA} A</b> <span className="muted">{b.breaker.type}</span></> : b.breaker.type}</td>
                        <td>{b.cable ? `${b.cable.runs > 1 ? `${b.cable.runs} × ` : ''}${b.cable.cores} × ${b.cable.sizeSqmm} mm²` : '—'}</td>
                        <td className="num mono">{b.cable ? fmt(b.cable.deratedCapacityA, 0) : '—'}</td>
                        <td className="num mono">{b.lengthM} m</td>
                        <td className="num mono">{b.cable ? `${fmt(b.cable.voltageDropPct, 2)}%` : '—'}</td>
                        <td><StatusPill status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!branches.length ? <Empty icon="✓" title="Every branch circuit passes" /> : null}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
