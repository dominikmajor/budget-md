import { normalize } from '@budget/shared/text';
import { TZ, all } from '../db.js';
import { bad, notFound } from './errors.js';

const LIQUID = new Set(['account', 'cash']);
const SAVED = new Set(['reserve', 'envelope']);

// ───────────────────────── Beállítások ─────────────────────────

export async function getSettings(db) {
  const { rows } = await db.query('SELECT * FROM settings WHERE id = 1');
  return rows[0];
}

export function publicSettings(s) {
  return {
    pinLength: s.pin_length,
    autolockMinutes: s.autolock_minutes,
    reserveTarget: s.reserve_target,
    spendingEnabled: s.spending_enabled,
    spendingPeriod: s.spending_period,
    spendingAmount: s.spending_amount,
    spendingWalletId: s.spending_wallet_id,
  };
}

export async function updateSettings(db, input) {
  const map = {
    autolockMinutes: 'autolock_minutes',
    reserveTarget: 'reserve_target',
    spendingEnabled: 'spending_enabled',
    spendingPeriod: 'spending_period',
    spendingAmount: 'spending_amount',
    spendingWalletId: 'spending_wallet_id',
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (input[k] === undefined) continue;
    let v = input[k];
    if (['autolockMinutes', 'reserveTarget', 'spendingAmount'].includes(k)) {
      v = Math.round(Number(v));
      if (!Number.isFinite(v) || v < 0) throw bad('Érvénytelen szám: ' + k);
    }
    if (k === 'spendingPeriod' && !['day', 'week'].includes(v)) throw bad('Érvénytelen keret-időszak');
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (sets.length) await db.query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, vals);
  return publicSettings(await getSettings(db));
}

// ───────────────────────── Tárcák és egyenlegek ─────────────────────────

export async function getWallets(db) {
  const { rows } = await db.query(
    `SELECT w.*, b.balance,
       COALESCE(m.month_in, 0)  AS month_in,
       COALESCE(m.month_out, 0) AS month_out
     FROM wallets w
     JOIN wallet_balances b ON b.wallet_id = w.id
     LEFT JOIN LATERAL (
       SELECT
         SUM(CASE WHEN (t.type = 'income' AND t.wallet_id = w.id)
                    OR (t.type = 'transfer' AND t.to_wallet_id = w.id) THEN t.amount ELSE 0 END) AS month_in,
         SUM(CASE WHEN (t.type = 'expense' AND t.wallet_id = w.id)
                    OR (t.type = 'transfer' AND t.wallet_id = w.id AND t.to_wallet_id IS NOT NULL) THEN t.amount ELSE 0 END) AS month_out
       FROM transactions t
       WHERE (t.wallet_id = w.id OR t.to_wallet_id = w.id)
         AND t.occurred_at >= (date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1)
     ) m ON TRUE
     ORDER BY w.archived, w.sort_order, w.id`,
    [TZ],
  );
  return rows.map(toWallet);
}

function toWallet(r) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    icon: r.icon,
    color: r.color,
    initialBalance: r.initial_balance,
    targetAmount: r.target_amount,
    targetDate: r.target_date ? toDateStr(r.target_date) : null,
    keywords: r.keywords,
    featured: r.featured,
    archived: r.archived,
    sortOrder: r.sort_order,
    balance: r.balance,
    monthIn: r.month_in,
    monthOut: r.month_out,
    liquid: LIQUID.has(r.kind),
  };
}

function toDateStr(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Teljes vagyon, likvid és félretett összegek – a specifikáció 1.2 pontja szerint. */
export function summarize(wallets) {
  let liquid = 0;
  let saved = 0;
  for (const w of wallets) {
    if (LIQUID.has(w.kind)) liquid += w.balance;
    else if (SAVED.has(w.kind)) saved += w.balance;
  }
  return { liquid, saved, total: liquid + saved };
}

const WALLET_KINDS = ['account', 'cash', 'reserve', 'envelope'];

export async function createWallet(db, input) {
  const name = String(input.name || '').trim();
  if (!name) throw bad('Adj nevet a tárcának');
  if (!WALLET_KINDS.includes(input.kind)) throw bad('Érvénytelen tárcatípus');
  const { rows } = await db.query(
    `INSERT INTO wallets (name, kind, icon, color, initial_balance, target_amount, target_date, keywords, featured, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE((SELECT MAX(sort_order) + 1 FROM wallets), 1))
     RETURNING id`,
    [
      name,
      input.kind,
      input.icon || defaultIcon(input.kind),
      input.color || '#7c5cff',
      int(input.initialBalance) || 0,
      int(input.targetAmount) || null,
      input.targetDate || null,
      cleanKeywords(input.keywords, name),
      !!input.featured,
    ],
  );
  return rows[0].id;
}

export async function updateWallet(db, id, input) {
  const fields = {
    name: (v) => { const s = String(v).trim(); if (!s) throw bad('Adj nevet a tárcának'); return s; },
    icon: String,
    color: String,
    targetAmount: (v) => int(v) || null,
    targetDate: (v) => v || null,
    keywords: (v) => cleanKeywords(v),
    featured: Boolean,
    archived: Boolean,
    sortOrder: int,
    initialBalance: (v) => int(v) || 0,
  };
  const cols = { targetAmount: 'target_amount', targetDate: 'target_date', sortOrder: 'sort_order', initialBalance: 'initial_balance' };
  const sets = [];
  const vals = [];
  for (const [k, conv] of Object.entries(fields)) {
    if (input[k] === undefined) continue;
    vals.push(conv(input[k]));
    sets.push(`${cols[k] || k} = $${vals.length}`);
  }
  if (!sets.length) return;
  vals.push(id);
  const r = await db.query(`UPDATE wallets SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  if (!r.rowCount) throw notFound('A tárca nem található');
}

function defaultIcon(kind) {
  return { account: '🏦', cash: '👛', reserve: '🗂️', envelope: '✉️' }[kind] || '💳';
}

function cleanKeywords(v, name) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  const out = arr.map((k) => normalize(k)).filter(Boolean);
  if (name && !out.length) out.push(normalize(name));
  return [...new Set(out)];
}

/** Készpénz leltár: a tényleges és a nyilvántartott egyenleg különbségét korrekciós tételként rögzíti. */
export async function reconcileWallet(db, walletId, actual) {
  const target = int(actual);
  if (!Number.isFinite(target)) throw bad('Add meg a tényleges összeget');
  const { rows } = await db.query('SELECT balance FROM wallet_balances WHERE wallet_id = $1', [walletId]);
  if (!rows[0]) throw notFound('A tárca nem található');
  const diff = target - rows[0].balance;
  if (diff === 0) return { diff: 0, transactionId: null };
  const type = diff > 0 ? 'income' : 'expense';
  const cat = await db.query(
    `SELECT id FROM categories WHERE is_system AND kind = $1 ORDER BY id LIMIT 1`,
    [type],
  );
  const id = await createTransaction(db, {
    type,
    amount: Math.abs(diff),
    walletId,
    categoryId: cat.rows[0]?.id ?? null,
    name: 'Egyenleg korrekció',
    note: `Leltár: nyilvántartott ${rows[0].balance} Ft, tényleges ${target} Ft`,
    isCorrection: true,
  });
  return { diff, transactionId: id };
}

// ───────────────────────── Tranzakciók ─────────────────────────

const TYPES = ['income', 'expense', 'transfer'];

function int(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(String(v).replace(/\s/g, '')));
  return Number.isFinite(n) ? n : null;
}

function parseDataUrl(s) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(s || '');
  if (!m) throw bad('Érvénytelen kép');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw bad('A kép túl nagy (max. 6 MB)');
  return { mime: m[1], data: buf };
}

function normalizeInput(input, existing = null) {
  const merged = { ...(existing || {}), ...stripUndefined(input) };
  const type = merged.type || 'expense';
  if (!TYPES.includes(type)) throw bad('Érvénytelen típus');
  const status = merged.status === 'draft' ? 'draft' : 'final';
  const amount = int(merged.amount);
  if (!amount || amount <= 0) throw bad('Adj meg egy pozitív összeget');
  const walletId = int(merged.walletId);
  const toWalletId = type === 'transfer' ? int(merged.toWalletId) : null;
  if (status === 'final') {
    if (!walletId) throw bad(type === 'transfer' ? 'Válaszd ki a forrás tárcát' : 'Válassz tárcát');
    if (type === 'transfer' && !toWalletId) throw bad('Válaszd ki a cél tárcát');
  }
  if (type === 'transfer' && walletId && toWalletId && walletId === toWalletId) {
    throw bad('A forrás és a cél nem lehet ugyanaz');
  }
  return {
    type,
    status,
    amount,
    walletId,
    toWalletId,
    categoryId: type === 'transfer' ? null : int(merged.categoryId),
    projectId: type === 'income' ? int(merged.projectId) : null,
    name: String(merged.name || '').trim().slice(0, 200),
    note: String(merged.note || '').slice(0, 2000),
    isCorrection: !!merged.isCorrection,
    occurredAt: merged.occurredAt ? new Date(merged.occurredAt) : new Date(),
    tags: Array.isArray(merged.tags) ? merged.tags : [],
  };
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

async function setTags(db, txId, tags) {
  await db.query('DELETE FROM transaction_tags WHERE transaction_id = $1', [txId]);
  const names = [...new Set(tags.map((t) => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))];
  for (const name of names) {
    const { rows } = await db.query(
      `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name],
    );
    await db.query('INSERT INTO transaction_tags VALUES ($1, $2) ON CONFLICT DO NOTHING', [txId, rows[0].id]);
  }
}

export async function createTransaction(db, input) {
  const t = normalizeInput(input);
  let receipt = null;
  if (input.receipt) receipt = parseDataUrl(input.receipt);
  const { rows } = await db.query(
    `INSERT INTO transactions
       (type, status, amount, wallet_id, to_wallet_id, category_id, project_id, name, note,
        is_correction, occurred_at, receipt_mime, receipt_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [t.type, t.status, t.amount, t.walletId, t.toWalletId, t.categoryId, t.projectId, t.name, t.note,
      t.isCorrection, t.occurredAt, receipt?.mime ?? null, receipt?.data ?? null],
  );
  await setTags(db, rows[0].id, t.tags);
  return rows[0].id;
}

export async function updateTransaction(db, id, input) {
  const current = await getTransaction(db, id);
  const t = normalizeInput(input, current);
  const vals = [t.type, t.status, t.amount, t.walletId, t.toWalletId, t.categoryId, t.projectId, t.name,
    t.note, t.isCorrection, t.occurredAt, id];
  let receiptSql = '';
  if (input.receipt === null) {
    receiptSql = ', receipt_mime = NULL, receipt_data = NULL';
  } else if (input.receipt) {
    const r = parseDataUrl(input.receipt);
    vals.push(r.mime, r.data);
    receiptSql = `, receipt_mime = $${vals.length - 1}, receipt_data = $${vals.length}`;
  }
  await db.query(
    `UPDATE transactions SET type=$1, status=$2, amount=$3, wallet_id=$4, to_wallet_id=$5, category_id=$6,
       project_id=$7, name=$8, note=$9, is_correction=$10, occurred_at=$11, updated_at=now() ${receiptSql}
     WHERE id=$12`,
    vals,
  );
  if (input.tags !== undefined) await setTags(db, id, t.tags);
}

export async function deleteTransaction(db, id) {
  const r = await db.query('DELETE FROM transactions WHERE id = $1', [id]);
  if (!r.rowCount) throw notFound('A tétel nem található');
}

/** Piszkozatok véglegesítése. Hiányzó tárca esetén hibát dob (az egész művelet visszagörgetődik). */
export async function approveTransactions(db, ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(int).filter(Boolean);
  if (!list.length) return 0;
  const { rows } = await db.query(
    `SELECT id, name, type, wallet_id, to_wallet_id FROM transactions WHERE id = ANY($1) AND status = 'draft'`,
    [list],
  );
  for (const r of rows) {
    if (!r.wallet_id || (r.type === 'transfer' && !r.to_wallet_id)) {
      throw bad(`„${r.name || 'Névtelen tétel'}” tételnél hiányzik a tárca`);
    }
  }
  await db.query(`UPDATE transactions SET status = 'final', updated_at = now() WHERE id = ANY($1)`, [rows.map((r) => r.id)]);
  return rows.length;
}

const TX_SELECT = `
  SELECT t.id, t.type, t.status, t.amount, t.wallet_id, t.to_wallet_id, t.category_id, t.project_id,
         t.name, t.note, t.is_correction, t.occurred_at, t.created_at, t.updated_at,
         (t.receipt_data IS NOT NULL) AS has_receipt,
         COALESCE(ARRAY(SELECT g.name FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
                        WHERE tt.transaction_id = t.id ORDER BY g.name), '{}') AS tags
  FROM transactions t`;

function toTx(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    amount: r.amount,
    walletId: r.wallet_id,
    toWalletId: r.to_wallet_id,
    categoryId: r.category_id,
    projectId: r.project_id,
    name: r.name,
    note: r.note,
    isCorrection: r.is_correction,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasReceipt: r.has_receipt,
    tags: r.tags,
  };
}

export async function getTransaction(db, id) {
  const { rows } = await db.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw notFound('A tétel nem található');
  return toTx(rows[0]);
}

export async function getReceipt(db, id) {
  const { rows } = await db.query('SELECT receipt_mime, receipt_data FROM transactions WHERE id = $1', [id]);
  if (!rows[0]?.receipt_data) throw notFound('Nincs csatolt kép');
  return { mime: rows[0].receipt_mime, data: rows[0].receipt_data };
}

export async function listTransactions(db, f = {}) {
  const where = [];
  const vals = [];
  const add = (sql, v) => { vals.push(v); where.push(sql.replaceAll('?', `$${vals.length}`)); };

  if (f.status) add('t.status = ?', f.status);
  if (f.q) add(`(t.name ILIKE ? OR t.note ILIKE ?)`, `%${f.q}%`);
  if (f.wallet === 'envelopes') where.push(`(t.wallet_id IN (SELECT id FROM wallets WHERE kind = 'envelope') OR t.to_wallet_id IN (SELECT id FROM wallets WHERE kind = 'envelope'))`);
  else if (f.wallet) add('(t.wallet_id = ? OR t.to_wallet_id = ?)', int(f.wallet));
  if (f.type) add('t.type = ?', f.type);
  if (f.category) add('t.category_id = ?', int(f.category));
  if (f.project) add('t.project_id = ?', int(f.project));
  if (f.tag) add('EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id AND g.name = ?)', String(f.tag).replace(/^#/, '').toLowerCase());
  if (f.receipt === 'true' || f.receipt === true) where.push('t.receipt_data IS NOT NULL');
  if (f.from) add(`t.occurred_at >= (?::date AT TIME ZONE '${TZ}')`, f.from);
  if (f.to) add(`t.occurred_at < ((?::date + 1) AT TIME ZONE '${TZ}')`, f.to);

  const limit = Math.min(int(f.limit) || 200, 1000);
  const offset = int(f.offset) || 0;
  const sql = `${TX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.occurred_at DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}`;
  const { rows } = await db.query(sql, vals);
  return rows.map(toTx);
}

// ───────────────────────── Költős keret ─────────────────────────

export async function getSpending(db, settings) {
  if (!settings.spending_enabled || !settings.spending_wallet_id) return null;
  const period = settings.spending_period;
  const { rows } = await db.query(
    `WITH bounds AS (
       SELECT (date_trunc($2, now() AT TIME ZONE $1) AT TIME ZONE $1) AS start_at,
              ((date_trunc($2, now() AT TIME ZONE $1) + ('1 ' || $2)::interval) AT TIME ZONE $1) AS end_at
     )
     SELECT COALESCE(SUM(t.amount), 0) AS spent, b.start_at, b.end_at
     FROM bounds b
     LEFT JOIN transactions t ON t.type = 'expense' AND NOT t.is_correction
       AND t.wallet_id = $3 AND t.occurred_at >= b.start_at AND t.occurred_at < b.end_at
     GROUP BY b.start_at, b.end_at`,
    [TZ, period, settings.spending_wallet_id],
  );
  const spent = rows[0].spent;
  const limit = settings.spending_amount;
  return {
    period,
    walletId: settings.spending_wallet_id,
    limit,
    spent,
    remaining: limit - spent,
    ratio: limit > 0 ? spent / limit : 0,
    periodStart: rows[0].start_at,
    periodEnd: rows[0].end_at,
  };
}

// ───────────────────────── Teljes állapot (egy hívás az egész UI-nak) ─────────────────────────

export async function getCategoryMemory(db) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (lower(name)) lower(name) AS name, category_id
     FROM transactions
     WHERE category_id IS NOT NULL AND name <> '' AND NOT is_correction
     ORDER BY lower(name), occurred_at DESC`,
  );
  const memory = {};
  for (const r of rows) memory[normalize(r.name)] = r.category_id;
  return memory;
}

export async function getState(db) {
  const settings = await getSettings(db);
  const [wallets, categories, projects, tags, templates, drafts, recent, memory, spending] = await all(db, [
    () => getWallets(db),
    () => db.query('SELECT * FROM categories ORDER BY kind, archived, sort_order, id').then((r) => r.rows.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, keywords: c.keywords,
      isSystem: c.is_system, archived: c.archived, sortOrder: c.sort_order,
    }))),
    () => db.query('SELECT * FROM projects ORDER BY archived, sort_order, id').then((r) => r.rows.map((p) => ({
      id: p.id, name: p.name, color: p.color, archived: p.archived, sortOrder: p.sort_order,
    }))),
    () => db.query(`SELECT g.id, g.name, COUNT(tt.transaction_id)::int AS uses
              FROM tags g LEFT JOIN transaction_tags tt ON tt.tag_id = g.id
              GROUP BY g.id ORDER BY uses DESC, g.name`).then((r) => r.rows),
    () => db.query('SELECT * FROM templates ORDER BY sort_order, id').then((r) => r.rows.map((t) => ({
      id: t.id, name: t.name, emoji: t.emoji, type: t.type, amount: t.amount,
      walletId: t.wallet_id, categoryId: t.category_id, sortOrder: t.sort_order,
    }))),
    () => db.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE status = 'draft'`).then((r) => r.rows[0].n),
    () => listTransactions(db, { limit: 8 }),
    () => getCategoryMemory(db),
    () => getSpending(db, settings),
  ]);
  const active = wallets.filter((w) => !w.archived || w.balance !== 0);
  const reserveTarget = settings.reserve_target;
  const alerts = [];
  for (const w of wallets) {
    if (w.kind === 'reserve' && !w.archived && w.balance < reserveTarget) {
      alerts.push({ type: 'reserve', walletId: w.id, balance: w.balance, target: reserveTarget, missing: reserveTarget - w.balance });
    }
  }
  if (drafts > 0) alerts.push({ type: 'drafts', count: drafts });
  return {
    settings: publicSettings(settings),
    wallets,
    summary: summarize(active),
    categories,
    projects,
    tags,
    templates,
    draftCount: drafts,
    recent,
    memory,
    spending,
    alerts,
  };
}
