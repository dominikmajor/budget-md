import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, TrendingUp, Table2, BarChart3, ChevronRight } from 'lucide-react';
import { childrenMap, pathOf, rollup } from '@budget/shared/categories';
import { useApp } from '../store.jsx';
import { api, qs } from '../api.js';
import { Card, Chip, Empty, Money, Progress, SectionTitle } from '../components/ui.jsx';
import { dateKey, formatHUF } from '../lib/util.js';
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
  const { version, hidden } = useApp();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(presetRange('month'));
  const [stats, setStats] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const isTablet = useMediaQuery(BP.tablet);

  const range = preset === 'custom' ? custom : presetRange(preset);

  useEffect(() => {
    setStats(null);
    api.get('/stats' + qs(range)).then(setStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, version]);

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
              <SectionTitle>Bevételek kategóriánként</SectionTitle>
              <CategoryBreakdown type="income" stats={stats}>
                <div className="mini-stats">
                  <div><span>Átlag / tranzakció</span><Money value={stats.incomeFrequency.avgPerTransaction} /></div>
                  <div><span>Átlag / hét</span><Money value={stats.incomeFrequency.avgPerWeek} /></div>
                  <div><span>Gyakoriság</span><b>{stats.incomeFrequency.avgGapDays == null ? '—' : stats.incomeFrequency.avgGapDays < 1 ? 'naponta többször' : `${String(stats.incomeFrequency.avgGapDays).replace('.', ',')} naponta`}</b></div>
                </div>
              </CategoryBreakdown>
            </section>

            <section className="stack">
              <SectionTitle>Kiadások kategóriánként</SectionTitle>
              <CategoryBreakdown type="expense" stats={stats} donut />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Kategóriafa szerinti bontás: a főkategóriák az alkategóriáik összegét is tartalmazzák,
 * egy sorra koppintva lefúrhatsz a következő szintre (alkategória nélkülinél a tételekhez ugrik).
 */
function CategoryBreakdown({ type, stats, donut, children }) {
  const { state, categoriesById, hidden } = useApp();
  const navigate = useNavigate();
  const isTablet = useMediaQuery(BP.tablet);
  const [focus, setFocus] = useState(null);

  const data = useMemo(() => {
    const cats = state.categories.filter((c) => c.kind === type);
    const direct = new Map();
    const count = new Map();
    let none = 0;
    let noneCount = 0;
    for (const r of stats.categoryTotals) {
      if (r.type !== type) continue;
      if (r.id == null || !categoriesById[r.id]) { none += r.amount; noneCount += r.count; continue; }
      direct.set(r.id, r.amount);
      count.set(r.id, r.count);
    }
    const prevDirect = new Map(stats.previousTotals.filter((r) => r.type === type && r.id != null).map((r) => [r.id, r.amount]));
    return {
      cats,
      direct,
      kids: childrenMap(cats),
      rolled: rollup(cats, direct),
      rolledCount: rollup(cats, count),
      prev: rollup(cats, prevDirect),
      none,
      noneCount,
    };
  }, [state.categories, categoriesById, stats, type]);

  // Ha a kiválasztott ág eltűnik (pl. másik időszak), vissza a tetejére
  const focusCat = focus != null && (data.rolled.get(focus) || 0) > 0 ? categoriesById[focus] : null;
  const base = focusCat ? (data.kids.get(focusCat.id) || []) : (data.kids.get('root') || []);
  const items = base
    .map((c) => ({
      key: c.id, id: c.id, name: c.name, icon: c.icon, color: c.color,
      amount: data.rolled.get(c.id) || 0,
      count: data.rolledCount.get(c.id) || 0,
      previous: data.prev.get(c.id) || 0,
      drill: (data.kids.get(c.id) || []).some((k) => (data.rolled.get(k.id) || 0) > 0),
    }))
    .filter((x) => x.amount > 0);
  if (focusCat && data.direct.get(focusCat.id)) {
    items.push({ key: 'self', id: focusCat.id, name: `${focusCat.name} (közvetlenül)`, icon: focusCat.icon, color: focusCat.color,
      amount: data.direct.get(focusCat.id), count: 0, previous: null, drill: false, self: true });
  }
  if (!focusCat && data.none) {
    items.push({ key: 'none', id: null, name: 'Kategória nélkül', icon: '❔', color: '#64748b', amount: data.none, count: data.noneCount, previous: null, drill: false });
  }
  items.sort((a, b) => b.amount - a.amount);
  // Az alkategóriák gyakran a szülő színét öröklik – az azonos színűeket árnyalatokkal különítjük el
  const seen = new Map();
  for (const x of items) {
    const k = seen.get(x.color) || 0;
    seen.set(x.color, k + 1);
    if (k) x.color = mixHex(x.color, k % 2 ? '#ffffff' : '#000000', Math.min(0.6, 0.22 * Math.ceil(k / 2) + 0.1));
  }
  const total = focusCat ? (data.rolled.get(focusCat.id) || 0) : items.reduce((s, x) => s + x.amount, 0);
  const crumbs = focusCat ? pathOf(focusCat.id, categoriesById) : [];

  const open = (x) => {
    if (x.drill) setFocus(x.id);
    else if (x.key === 'none') navigate(`/tranzakciok?kategoria=none&tipus=${type}`);
    else if (x.id != null) navigate(`/tranzakciok?kategoria=${x.id}`);
  };

  if (!total) {
    return (
      <Card>
        <Empty icon={type === 'income' ? '💼' : '🧾'} title={type === 'income' ? 'Nincs bevétel ebben az időszakban' : 'Nincs kiadás ebben az időszakban'} />
      </Card>
    );
  }

  return (
    <Card>
      {crumbs.length > 0 && (
        <div className="crumbs">
          <button className="link-btn" onClick={() => setFocus(null)}>Összes</button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="crumb">
              <ChevronRight size={14} className="muted" />
              {i < crumbs.length - 1
                ? <button className="link-btn" onClick={() => setFocus(c.id)}>{c.name}</button>
                : <b>{c.icon} {c.name}</b>}
            </span>
          ))}
        </div>
      )}
      {donut && (
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height={isTablet ? 230 : 190}>
            <PieChart>
              <Pie data={items.map((x) => ({ ...x, share: x.amount / total }))} dataKey="amount" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} cornerRadius={4}>
                {items.map((x) => <Cell key={x.key} fill={x.color} />)}
              </Pie>
              <Tooltip content={<PieTip hidden={hidden} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center"><span>{focusCat ? focusCat.name : 'Összesen'}</span><Money value={total} /></div>
        </div>
      )}
      {!donut && focusCat && <div className="row between breakdown-total"><span className="muted">{focusCat.name} összesen</span><Money value={total} /></div>}
      <div className="rank">
        {items.map((x) => {
          const change = x.previous ? (x.amount - x.previous) / x.previous : null;
          const clickable = x.drill || x.id != null || x.key === 'none';
          return (
            <button key={x.key} type="button" className={`rank-row ${clickable ? 'clickable' : ''}`} onClick={() => open(x)} disabled={!clickable}>
              <span className="rank-icon" style={{ '--c': x.color }}>{x.icon}</span>
              <span className="grow rank-main">
                <span>{x.name}<small className="muted"> {Math.round((x.amount / total) * 100)}%{x.count ? ` · ${x.count} db` : ''}</small></span>
                {!donut && <Progress value={x.amount} max={items[0].amount} tone={type === 'income' ? 'pos' : 'neg'} thin />}
              </span>
              {change != null && (
                <span className={`change ${(change > 0) === (type === 'expense') ? 'neg' : 'pos'}`}>
                  {change > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {change > 0 ? '+' : ''}{Math.round(change * 100)}%
                </span>
              )}
              <Money value={x.amount} />
              {x.drill ? <ChevronRight size={16} className="muted" /> : <span className="chev-space" />}
            </button>
          );
        })}
      </div>
      {children && !focusCat && children}
      <p className="muted small">A főkategóriák az alkategóriáik összegét is tartalmazzák – koppints egy sorra a lefúráshoz. A változás az előző, azonos hosszú időszakhoz képest.</p>
    </Card>
  );
}

/** Két #rrggbb szín keverése (t = a második aránya) */
function mixHex(a, b, t) {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const x = p(a); const y = p(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
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
