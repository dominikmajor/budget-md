import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp, Table2, BarChart3 } from 'lucide-react';
import { useApp } from '../store.jsx';
import { api, qs } from '../api.js';
import { Card, Chip, Empty, Money, Progress, SectionTitle } from '../components/ui.jsx';
import TxRow from '../components/TxRow.jsx';
import { dateKey, formatHUF, formatNumber } from '../lib/util.js';
import { BP, useMediaQuery } from '../lib/useMediaQuery.js';

const PRESETS = [
  { id: 'week', label: 'Ez a hét' },
  { id: 'month', label: 'Ez a hónap' },
  { id: 'prev', label: 'Előző hónap' },
  { id: 'half', label: 'Félév (6 hó)' },
  { id: 'custom', label: 'Egyéni' },
];

function presetRange(id) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (id === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: dateKey(d), to: dateKey(now) };
  }
  if (id === 'prev') return { from: dateKey(new Date(y, m - 1, 1)), to: dateKey(new Date(y, m, 0)) };
  if (id === 'half') return { from: dateKey(new Date(y, m - 5, 1)), to: dateKey(now) };
  return { from: dateKey(new Date(y, m, 1)), to: dateKey(now) };
}

const SHORT_MONTHS = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'];
function bucketLabel(key, bucket) {
  const d = new Date(key + 'T12:00:00');
  if (bucket === 'month') return SHORT_MONTHS[d.getMonth()];
  if (bucket === 'day') return `${d.getMonth() + 1}.${d.getDate()}.`;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}.`;
}
const kFormat = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}e` : v);

export default function Analytics() {
  const { version, hidden, state } = useApp();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(presetRange('month'));
  const [stats, setStats] = useState(null);
  const [tag, setTag] = useState(null);
  const [tagTx, setTagTx] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const isTablet = useMediaQuery(BP.tablet);

  const range = preset === 'custom' ? custom : presetRange(preset);

  useEffect(() => {
    setStats(null);
    api.get('/stats' + qs(range)).then(setStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, version]);

  useEffect(() => {
    if (!tag) return setTagTx(null);
    api.get('/transactions' + qs({ ...range, tag, status: 'final' })).then(setTagTx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, range.from, range.to, version]);

  const chartData = useMemo(
    () => (stats?.cashflow || []).map((r) => ({ ...r, label: bucketLabel(r.bucket < stats.from ? stats.from : r.bucket, stats.bucket) })),
    [stats],
  );

  return (
    <div className="stack">
      <div className="picker scroll">
        {PRESETS.map((p) => <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Chip>)}
      </div>
      {preset === 'custom' && (
        <div className="row gap">
          <input className="input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <input className="input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      )}

      {!stats ? <div className="loading" /> : (
        <>
          <div className="kpis">
            <div className="kpi"><span>Bevétel</span><Money value={stats.totals.income} className="pos" /></div>
            <div className="kpi"><span>Kiadás</span><Money value={stats.totals.expense} className="neg" /></div>
            <div className="kpi"><span>Nettó</span><Money value={stats.totals.net} sign className={stats.totals.net >= 0 ? 'pos' : 'neg'} /></div>
          </div>

          <Card>
            <div className="card-head">
              <h3>Cash-flow</h3>
              <div className="row gap-sm">
                <span className="legend"><i className="lg-pos" /> Bevétel</span>
                <span className="legend"><i className="lg-neg" /> Kiadás</span>
                <button className="icon-btn" onClick={() => setAsTable((t) => !t)} aria-label={asTable ? 'Grafikon nézet' : 'Táblázat nézet'}>
                  {asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}
                </button>
              </div>
            </div>
            {asTable ? (
              <table className="table">
                <thead><tr><th>Időszak</th><th>Bevétel</th><th>Kiadás</th></tr></thead>
                <tbody>{chartData.map((r) => <tr key={r.bucket}><td>{r.label}</td><td className="pos">{formatHUF(r.income, { hidden })}</td><td className="neg">{formatHUF(r.expense, { hidden })}</td></tr>)}</tbody>
              </table>
            ) : (
              <div className="chart">
                <ResponsiveContainer width="100%" height={isTablet ? 280 : 210}>
                  <BarChart data={chartData} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} tickFormatter={hidden ? () => '•' : kFormat} width={44} />
                    <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTip hidden={hidden} />} />
                    <Bar dataKey="income" name="Bevétel" fill="var(--pos)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expense" name="Kiadás" fill="var(--neg)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="stats-grid">
          <section className="stack">
          <SectionTitle>Side-hustle és bevételi források</SectionTitle>
          <Card>
            {stats.incomeSources.length ? (
              <>
                <div className="bars">
                  {stats.incomeSources.map((s) => (
                    <div key={s.name} className="bar-row">
                      <div className="row between"><span><i className="dot" style={{ background: s.color }} /> {s.name} <span className="muted small">· {s.count} db</span></span><Money value={s.amount} /></div>
                      <Progress value={s.amount} max={stats.incomeSources[0].amount} tone="pos" thin />
                    </div>
                  ))}
                </div>
                <div className="mini-stats">
                  <div><span>Átlag / tranzakció</span><Money value={stats.incomeFrequency.avgPerTransaction} /></div>
                  <div><span>Átlag / hét</span><Money value={stats.incomeFrequency.avgPerWeek} /></div>
                  <div><span>Gyakoriság</span><b>{stats.incomeFrequency.avgGapDays == null ? '—' : stats.incomeFrequency.avgGapDays < 1 ? 'naponta többször' : `${String(stats.incomeFrequency.avgGapDays).replace('.', ',')} naponta`}</b></div>
                </div>
              </>
            ) : <Empty icon="💼" title="Nincs bevétel ebben az időszakban" />}
          </Card>
          </section>

          <section className="stack">
          <SectionTitle>Kiadások kategóriánként</SectionTitle>
          <Card>
            {stats.categories.length ? (
              <>
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height={isTablet ? 230 : 190}>
                    <PieChart>
                      <Pie data={stats.categories} dataKey="amount" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} cornerRadius={4}>
                        {stats.categories.map((c) => <Cell key={c.name} fill={c.color} />)}
                      </Pie>
                      <Tooltip content={<PieTip hidden={hidden} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><span>Összesen</span><Money value={stats.totals.expense} /></div>
                </div>
                <div className="rank">
                  {stats.categories.map((c) => (
                    <div key={c.name} className="rank-row">
                      <span className="rank-icon" style={{ '--c': c.color }}>{c.icon}</span>
                      <span className="grow">{c.name}<small className="muted"> {Math.round(c.share * 100)}%</small></span>
                      {c.change != null && (
                        <span className={`change ${c.change > 0 ? 'neg' : 'pos'}`}>
                          {c.change > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {c.change > 0 ? '+' : ''}{Math.round(c.change * 100)}%
                        </span>
                      )}
                      <Money value={c.amount} />
                    </div>
                  ))}
                </div>
                <p className="muted small">A változás az előző, azonos hosszú időszakhoz képest.</p>
              </>
            ) : <Empty icon="🧾" title="Nincs kiadás ebben az időszakban" />}
          </Card>
          </section>

          {(stats.tags.length > 0 || state.tags.length > 0) && (
            <section className="stack">
              <SectionTitle>Címkék</SectionTitle>
              <Card>
                <div className="picker">
                  {stats.tags.map((t) => (
                    <Chip key={t.name} active={tag === t.name} onClick={() => setTag(tag === t.name ? null : t.name)}>
                      #{t.name} <small className="muted">{t.count}</small>
                    </Chip>
                  ))}
                  {!stats.tags.length && <span className="muted small">Ebben az időszakban nincs címkézett tétel.</span>}
                </div>
                {tag && (() => {
                  const t = stats.tags.find((x) => x.name === tag);
                  return (
                    <>
                      <div className="mini-stats">
                        <div><span>Bevétel</span><Money value={t?.income || 0} className="pos" /></div>
                        <div><span>Kiadás</span><Money value={t?.expense || 0} className="neg" /></div>
                      </div>
                      <div className="list-card flat">{tagTx ? tagTx.map((x) => <TxRow key={x.id} tx={x} showDate />) : <div className="loading" />}</div>
                    </>
                  );
                })()}
              </Card>
            </section>
          )}

          {stats.limit && (
            <section className="stack">
              <SectionTitle>Költős keret teljesítmény</SectionTitle>
              <Card>
                <p className="lead">
                  {stats.limit.closedCount
                    ? `Az elmúlt ${stats.limit.closedCount} ${stats.limit.period === 'week' ? 'hétből' : 'napból'} ${stats.limit.withinCount} ${stats.limit.period === 'week' ? 'héten' : 'napon'} kereten belül maradtál.`
                    : 'Még nincs lezárt időszak.'}
                </p>
                <div className="limit-bars">
                  {stats.limit.periods.map((p, i) => {
                    const last = i === stats.limit.periods.length - 1;
                    const h = Math.min(100, (p.spent / Math.max(stats.limit.limit, 1)) * 100);
                    return (
                      <div key={p.start} className="limit-col" title={`${p.start}: ${formatHUF(p.spent)}`}>
                        <div className="limit-track">
                          <div className={`limit-fill ${p.within ? 'ok' : 'over'} ${last ? 'current' : ''}`} style={{ height: `${Math.max(h, 3)}%` }} />
                        </div>
                        <span className="small muted">{last ? 'most' : bucketLabel(p.start, stats.limit.period === 'week' ? 'week' : 'day')}</span>
                        <span className="small">{hidden ? '•••' : formatNumber(p.spent)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="muted small">Keret: {formatHUF(stats.limit.limit)} / {stats.limit.period === 'week' ? 'hét' : 'nap'}</p>
              </Card>
            </section>
          )}
          </div>
        </>
      )}
    </div>
  );
}

function ChartTip({ active, payload, label, hidden }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <b>{label}</b>
      {payload.map((p) => (
        <div key={p.dataKey} className="row between gap"><span><i className={p.dataKey === 'income' ? 'lg-pos' : 'lg-neg'} /> {p.name}</span><span>{formatHUF(p.value, { hidden })}</span></div>
      ))}
    </div>
  );
}

function PieTip({ active, payload, hidden }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <b>{p.icon} {p.name}</b>
      <div>{formatHUF(p.amount, { hidden })} · {Math.round(p.share * 100)}%</div>
    </div>
  );
}
