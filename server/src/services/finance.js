import { normalize } from '@budget/shared/text';
import { TZ, all } from '../db.js';
import { WALLET_KINDS, LIQUID_KINDS, SAVED_KINDS, DEFAULT_WALLET_ICON } from '@budget/shared/wallets';
import { bad, notFound } from './errors.js';

const LIQUID = new Set(LIQUID_KINDS);
const SAVED = new Set(SAVED_KINDS);

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
  };
}

export async function updateSettings(db, input) {
  const map = {
    autolockMinutes: 'autolock_minutes',
    reserveTarget: 'reserve_target',
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (input[k] === undefined) continue;
    let v = input[k];
    v = Math.round(Number(v));
    if (!Number.isFinite(v) || v < 0) throw bad('Érvénytelen szám: ' + k);
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
  return DEFAULT_WALLET_ICON[kind] || '💳';
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
    name: String(merged.name || '').trim().slice(0, 200),
    note: String(merged.note || '').slice(0, 2000),
    isCorrection: !!merged.isCorrection,
    occurredAt: merged.occurredAt ? new Date(merged.occurredAt) : new Date(),
  };
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export async function createTransaction(db, input) {
  const t = normalizeInput(input);
  let receipt = null;
  if (input.receipt) receipt = parseDataUrl(input.receipt);
  const { rows } = await db.query(
    `INSERT INTO transactions
       (type, status, amount, wallet_id, to_wallet_id, category_id, name, note,
        is_correction, occurred_at, receipt_mime, receipt_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [t.type, t.status, t.amount, t.walletId, t.toWalletId, t.categoryId, t.name, t.note,
      t.isCorrection, t.occurredAt, receipt?.mime ?? null, receipt?.data ?? null],
  );
  return rows[0].id;
}

export async function updateTransaction(db, id, input) {
  const current = await getTransaction(db, id);
  const t = normalizeInput(input, current);
  const vals = [t.type, t.status, t.amount, t.walletId, t.toWalletId, t.categoryId, t.name,
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
       name=$7, note=$8, is_correction=$9, occurred_at=$10, updated_at=now() ${receiptSql}
     WHERE id=$11`,
    vals,
  );
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
  SELECT t.id, t.type, t.status, t.amount, t.wallet_id, t.to_wallet_id, t.category_id,
         t.name, t.note, t.is_correction, t.occurred_at, t.created_at, t.updated_at,
         (t.receipt_data IS NOT NULL) AS has_receipt
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
    name: r.name,
    note: r.note,
    isCorrection: r.is_correction,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasReceipt: r.has_receipt,
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
  // Csoportszűrők: az összes boríték / széf egyszerre
  const groupKind = { envelopes: 'envelope', vaults: 'vault' }[f.wallet];
  if (groupKind) add(`(t.wallet_id IN (SELECT id FROM wallets WHERE kind = ?) OR t.to_wallet_id IN (SELECT id FROM wallets WHERE kind = ?))`, groupKind);
  else if (f.wallet) add('(t.wallet_id = ? OR t.to_wallet_id = ?)', int(f.wallet));
  if (f.type) add('t.type = ?', f.type);
  // A kategória-szűrő az összes alkategóriát is tartalmazza
  if (f.category) {
    add(`t.category_id IN (
      WITH RECURSIVE sub AS (
        SELECT id FROM categories WHERE id = ?
        UNION SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
      ) SELECT id FROM sub)`, int(f.category));
  }
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
  const [wallets, categories, templates, drafts, recent, memory] = await all(db, [
    () => getWallets(db),
    () => getCategories(db),
    () => db.query('SELECT * FROM templates ORDER BY sort_order, id').then((r) => r.rows.map((t) => ({
      id: t.id, name: t.name, emoji: t.emoji, type: t.type, amount: t.amount,
      walletId: t.wallet_id, categoryId: t.category_id, sortOrder: t.sort_order,
    }))),
    () => db.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE status = 'draft'`).then((r) => r.rows[0].n),
    () => listTransactions(db, { limit: 8 }),
    () => getCategoryMemory(db),
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
    templates,
    draftCount: drafts,
    recent,
    memory,
    alerts,
  };
}

// ───────────────────────── Kategóriafa ─────────────────────────

export async function getCategories(db) {
  const { rows } = await db.query(
    `SELECT c.*, COALESCE(u.n, 0)::int AS tx_count
     FROM categories c
     LEFT JOIN (SELECT category_id, COUNT(*) AS n FROM transactions GROUP BY category_id) u ON u.category_id = c.id
     ORDER BY c.kind, c.sort_order, c.id`,
  );
  return rows.map((c) => ({
    id: c.id, name: c.name, kind: c.kind, parentId: c.parent_id, icon: c.icon, color: c.color,
    keywords: c.keywords, isSystem: c.is_system, archived: c.archived, sortOrder: c.sort_order,
    txCount: c.tx_count,
  }));
}

async function loadCategory(db, id) {
  const { rows } = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('A kategória nem található');
  return rows[0];
}

/** A szülő ellenőrzése: létezik, azonos típusú, nem rendszer-kategória, és nem a saját leszármazottja. */
async function checkParent(db, parentId, kind, selfId = null) {
  if (parentId == null) return null;
  const parent = await loadCategory(db, parentId);
  if (parent.is_system) throw bad('Rendszer-kategória alá nem tehető alkategória');
  if (parent.kind !== kind) throw bad('Kiadás-kategória csak kiadás-, bevétel-kategória csak bevétel-kategória alá kerülhet');
  if (selfId != null) {
    const { rows } = await db.query(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id FROM categories WHERE id = $1
         UNION SELECT c.id, c.parent_id FROM categories c JOIN up ON c.id = up.parent_id
       ) SELECT 1 FROM up WHERE id = $2`,
      [parentId, selfId],
    );
    if (rows.length) throw bad('Egy kategória nem kerülhet a saját alkategóriája alá');
  }
  return parent;
}

const nextSort = async (db, parentId, kind) =>
  (await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE parent_id IS NOT DISTINCT FROM $1 AND kind = $2',
    [parentId, kind],
  )).rows[0].n;

function cleanCatKeywords(v) {
  return [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

export async function createCategory(db, input) {
  const name = String(input.name || '').trim();
  if (!name) throw bad('Adj nevet a kategóriának');
  const parentId = int(input.parentId);
  let kind = input.kind;
  if (parentId != null) kind = (await loadCategory(db, parentId)).kind; // alkategória örökli a típust
  if (!['expense', 'income'].includes(kind)) throw bad('Érvénytelen kategória-típus');
  const parent = await checkParent(db, parentId, kind);
  const { rows } = await db.query(
    `INSERT INTO categories (name, kind, icon, color, keywords, parent_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name, kind, input.icon || parent?.icon || '🏷️', input.color || parent?.color || '#8b8fa3',
      cleanCatKeywords(input.keywords), parentId, await nextSort(db, parentId, kind)],
  );
  return rows[0].id;
}

export async function updateCategory(db, id, input) {
  const cur = await loadCategory(db, id);
  const sets = [];
  const vals = [];
  const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw bad('Adj nevet a kategóriának');
    set('name', name);
  }
  if (input.icon !== undefined) set('icon', String(input.icon));
  if (input.color !== undefined) set('color', String(input.color));
  if (input.keywords !== undefined) set('keywords', cleanCatKeywords(input.keywords));
  if (input.archived !== undefined) set('archived', !!input.archived);
  if (input.parentId !== undefined) {
    const parentId = int(input.parentId);
    if (parentId !== cur.parent_id) {
      if (cur.is_system) throw bad('A rendszer-kategória nem mozgatható');
      await checkParent(db, parentId, cur.kind, id);
      set('parent_id', parentId);
      set('sort_order', await nextSort(db, parentId, cur.kind));
    }
  }
  if (!sets.length) return;
  vals.push(id);
  await db.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
}

/**
 * Kategória törlése.
 *  - Az alkategóriái egy szinttel feljebb kerülnek (a törölt kategória szülője alá), nem vesznek el.
 *  - Ha tételek tartoznak hozzá, kötelező megmondani, hová kerüljenek:
 *    moveTo = másik (azonos típusú) kategória id-ja, vagy 'none' = kategória nélkül.
 *    Enélkül a törlés hibát ad, így véletlenül nem „tűnhet el” a besorolás.
 *  - A sablonok hivatkozása ugyanígy átkerül (vagy kiürül).
 */
export async function deleteCategory(db, id, { moveTo } = {}) {
  const cur = await loadCategory(db, id);
  if (cur.is_system) throw bad('A rendszer-kategória nem törölhető');
  const used = (await db.query('SELECT COUNT(*)::int AS n FROM transactions WHERE category_id = $1', [id])).rows[0].n;
  let target = null;
  if (moveTo !== undefined && moveTo !== null && moveTo !== '' && moveTo !== 'none') {
    target = int(moveTo);
    if (target === id) throw bad('Válassz másik kategóriát');
    const t = await loadCategory(db, target);
    if (t.kind !== cur.kind) throw bad('A tételek csak azonos típusú kategóriába kerülhetnek át');
  } else if (used > 0 && moveTo !== 'none') {
    const e = bad(`${used} tétel tartozik ehhez a kategóriához – válaszd ki, hová kerüljenek`);
    e.status = 409;
    throw e;
  }
  await db.query('UPDATE transactions SET category_id = $1 WHERE category_id = $2', [target, id]);
  await db.query('UPDATE templates SET category_id = $1 WHERE category_id = $2', [target, id]);
  await db.query('UPDATE categories SET parent_id = $1 WHERE parent_id = $2', [cur.parent_id, id]);
  await db.query('DELETE FROM categories WHERE id = $1', [id]);
  return { moved: used, target };
}
