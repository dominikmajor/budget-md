import { TZ, all } from '../db.js';
import { bad } from './errors.js';

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

  const [cashflow, totals, freq, cats, prevCats] = await all(db, [
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
      `SELECT COUNT(*)::int AS n, MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
       FROM transactions t WHERE ${BASE} AND t.type = 'income'`,
      [from, to],
    ),
    // Közvetlenül az adott kategóriára rögzített összegek – a fa szerinti felgörgetés a kliensen történik
    () => db.query(
      `SELECT t.category_id AS id, t.type, SUM(t.amount) AS amount, COUNT(*)::int AS count
       FROM transactions t WHERE ${BASE} AND t.type IN ('income','expense')
       GROUP BY t.category_id, t.type`,
      [from, to],
    ),
    () => db.query(
      `SELECT t.category_id AS id, t.type, SUM(t.amount) AS amount
       FROM transactions t WHERE ${BASE} AND t.type IN ('income','expense')
       GROUP BY t.category_id, t.type`,
      [prevFrom, prevTo],
    ),
  ]);

  const income = totals.rows[0].income;
  const expense = totals.rows[0].expense;
  const f = freq.rows[0];
  const avgGapDays = f.n > 1 ? (new Date(f.last_at) - new Date(f.first_at)) / 86_400_000 / (f.n - 1) : null;

  return {
    from,
    to,
    bucket,
    totals: { income, expense, net: income - expense },
    cashflow: cashflow.rows.map((r) => ({ bucket: r.bucket instanceof Date ? isoDate(r.bucket) : r.bucket, income: r.income, expense: r.expense })),
    incomeFrequency: {
      count: f.n,
      avgPerTransaction: f.n ? Math.round(income / f.n) : 0,
      avgPerWeek: Math.round(income / (days / 7)),
      avgGapDays: avgGapDays != null ? Math.round(avgGapDays * 10) / 10 : null,
    },
    categoryTotals: cats.rows.map((r) => ({ id: r.id, type: r.type, amount: r.amount, count: r.count })),
    previousTotals: prevCats.rows.map((r) => ({ id: r.id, type: r.type, amount: r.amount })),
  };
}

function isoDate(d) {
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
