import { TZ, all } from '../db.js';
import { bad } from './errors.js';
import { getSettings } from './finance.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASE = `t.status = 'final' AND NOT t.is_correction
  AND t.occurred_at >= ($1::date AT TIME ZONE '${TZ}')
  AND t.occurred_at < (($2::date + 1) AT TIME ZONE '${TZ}')`;

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getStats(db, { from, to }) {
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw bad('Érvénytelen időszak');
  if (from > to) [from, to] = [to, from];
  const days = daysBetween(from, to);
  const bucket = days <= 14 ? 'day' : days <= 92 ? 'week' : 'month';
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(from, -days);

  const [cashflow, totals, sources, freq, cats, prevCats, tags, limit] = await all(db, [
    () => db.query(
      `WITH b AS (
         SELECT generate_series(date_trunc($3, $1::date), $2::date, ('1 ' || $3)::interval)::date AS bucket
       )
       SELECT b.bucket,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)  AS income,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS expense
       FROM b
       LEFT JOIN transactions t ON ${BASE} AND t.type IN ('income','expense')
         AND date_trunc($3, t.occurred_at AT TIME ZONE '${TZ}')::date = b.bucket
       GROUP BY b.bucket ORDER BY b.bucket`,
      [from, to, bucket],
    ),
    () => db.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS income,
              COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense
       FROM transactions t WHERE ${BASE}`,
      [from, to],
    ),
    () => db.query(
      `SELECT COALESCE(p.name, c.name, 'Egyéb') AS name,
              COALESCE(p.color, c.color, '#64748b') AS color,
              (p.id IS NOT NULL) AS is_project,
              SUM(t.amount) AS amount, COUNT(*)::int AS count
       FROM transactions t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${BASE} AND t.type = 'income'
       GROUP BY 1, 2, 3 ORDER BY amount DESC`,
      [from, to],
    ),
    () => db.query(
      `SELECT COUNT(*)::int AS n, MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
       FROM transactions t WHERE ${BASE} AND t.type = 'income'`,
      [from, to],
    ),
    () => db.query(
      `SELECT c.id, COALESCE(c.name, 'Kategória nélkül') AS name, COALESCE(c.icon, '❔') AS icon,
              COALESCE(c.color, '#64748b') AS color, SUM(t.amount) AS amount
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${BASE} AND t.type = 'expense'
       GROUP BY c.id, c.name, c.icon, c.color ORDER BY amount DESC`,
      [from, to],
    ),
    () => db.query(
      `SELECT t.category_id AS id, SUM(t.amount) AS amount
       FROM transactions t WHERE ${BASE} AND t.type = 'expense' GROUP BY t.category_id`,
      [prevFrom, prevTo],
    ),
    () => db.query(
      `SELECT g.name,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)  AS income,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS expense,
              COUNT(*)::int AS count
       FROM transactions t
       JOIN transaction_tags tt ON tt.transaction_id = t.id
       JOIN tags g ON g.id = tt.tag_id
       WHERE ${BASE}
       GROUP BY g.name ORDER BY (COALESCE(SUM(t.amount), 0)) DESC`,
      [from, to],
    ),
    () => getLimitPerformance(db),
  ]);

  const income = totals.rows[0].income;
  const expense = totals.rows[0].expense;
  const prevMap = new Map(prevCats.rows.map((r) => [r.id, r.amount]));
  const f = freq.rows[0];
  const avgGapDays = f.n > 1 ? (new Date(f.last_at) - new Date(f.first_at)) / 86_400_000 / (f.n - 1) : null;

  return {
    from,
    to,
    bucket,
    totals: { income, expense, net: income - expense },
    cashflow: cashflow.rows.map((r) => ({ bucket: r.bucket instanceof Date ? isoDate(r.bucket) : r.bucket, income: r.income, expense: r.expense })),
    incomeSources: sources.rows.map((r) => ({ name: r.name, color: r.color, isProject: r.is_project, amount: r.amount, count: r.count })),
    incomeFrequency: {
      count: f.n,
      avgPerTransaction: f.n ? Math.round(income / f.n) : 0,
      avgPerWeek: Math.round(income / (days / 7)),
      avgGapDays: avgGapDays != null ? Math.round(avgGapDays * 10) / 10 : null,
    },
    categories: cats.rows.map((r) => {
      const prev = prevMap.get(r.id) ?? 0;
      return {
        id: r.id, name: r.name, icon: r.icon, color: r.color, amount: r.amount,
        share: expense ? r.amount / expense : 0,
        previous: prev,
        change: prev ? (r.amount - prev) / prev : null,
      };
    }),
    tags: tags.rows,
    limit,
  };
}

function isoDate(d) {
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Az elmúlt 4 hét (heti keretnél) vagy 7 nap (napi keretnél) keret-teljesítése. */
async function getLimitPerformance(db) {
  const s = await getSettings(db);
  if (!s.spending_enabled || !s.spending_wallet_id) return null;
  const period = s.spending_period;
  const count = period === 'week' ? 4 : 7;
  const { rows } = await db.query(
    `WITH p AS (
       SELECT generate_series(
         date_trunc($2, now() AT TIME ZONE $1) - (($4 - 1) || ' ' || $2)::interval,
         date_trunc($2, now() AT TIME ZONE $1),
         ('1 ' || $2)::interval) AS start_local
     )
     SELECT p.start_local::date AS start, COALESCE(SUM(t.amount), 0) AS spent
     FROM p
     LEFT JOIN transactions t ON t.type = 'expense' AND NOT t.is_correction AND t.wallet_id = $3
       AND t.occurred_at >= (p.start_local AT TIME ZONE $1)
       AND t.occurred_at < ((p.start_local + ('1 ' || $2)::interval) AT TIME ZONE $1)
     GROUP BY p.start_local ORDER BY p.start_local`,
    [TZ, period, s.spending_wallet_id, count],
  );
  const periods = rows.map((r) => ({
    start: r.start instanceof Date ? isoDate(r.start) : r.start,
    spent: r.spent,
    within: r.spent <= s.spending_amount,
  }));
  // Az aktuális (még folyamatban lévő) időszakot nem számítjuk a "kereten belül" arányba, ha nem lépte túl
  const closed = periods.slice(0, -1);
  return {
    period,
    limit: s.spending_amount,
    periods,
    withinCount: closed.filter((x) => x.within).length,
    closedCount: closed.length,
  };
}
