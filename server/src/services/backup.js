import { bad } from './errors.js';

const TABLES = ['wallets', 'categories', 'transactions'];
const SETTINGS_COLS = ['autolock_minutes', 'reserve_target'];

/** Teljes, visszaállítható mentés (a PIN hash nélkül). */
export async function exportJson(db) {
  const out = { app: 'budget-app', version: 2, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    const { rows } = await db.query(`SELECT * FROM ${t} ORDER BY 1`);
    out.tables[t] = rows.map((r) => {
      if (t === 'transactions' && r.receipt_data) return { ...r, receipt_data: r.receipt_data.toString('base64') };
      return r;
    });
  }
  const s = await db.query(`SELECT ${SETTINGS_COLS.join(',')} FROM settings WHERE id = 1`);
  out.settings = s.rows[0];
  return out;
}

/**
 * Régi (1-es verziójú) mentés átalakítása a kategóriafás formára:
 * projektek → a „Side-hustle” bevételi kategória alkategóriái, címkék → a megjegyzés végére.
 */
export function upgradeBackup(data) {
  const tables = { ...data.tables };
  const categories = (tables.categories || []).map((c) => ({ parent_id: null, ...c }));
  const projects = tables.projects || [];
  let nextId = Math.max(0, ...categories.map((c) => c.id)) + 1;

  const projectMap = new Map();
  if (projects.length) {
    let root = categories.find((c) => c.kind === 'income' && !c.is_system && String(c.name).toLowerCase() === 'side-hustle');
    if (!root) {
      root = { id: nextId++, name: 'Side-hustle', kind: 'income', icon: '💼', color: '#22c55e', keywords: [], is_system: false, archived: false, sort_order: 999, parent_id: null };
      categories.push(root);
    }
    for (const p of projects) {
      const id = nextId++;
      projectMap.set(p.id, id);
      categories.push({ id, name: p.name, kind: 'income', icon: '💼', color: p.color || root.color, keywords: [], is_system: false, archived: !!p.archived, sort_order: p.sort_order ?? 0, parent_id: root.id });
    }
  }

  const tagNames = new Map((tables.tags || []).map((g) => [g.id, g.name]));
  const byTx = new Map();
  for (const tt of tables.transaction_tags || []) {
    const n = tagNames.get(tt.tag_id);
    if (!n) continue;
    if (!byTx.has(tt.transaction_id)) byTx.set(tt.transaction_id, []);
    byTx.get(tt.transaction_id).push('#' + n);
  }

  const transactions = (tables.transactions || []).map(({ project_id: projectId, ...t }) => {
    if (projectId != null && projectMap.has(projectId)) t.category_id = projectMap.get(projectId);
    const tags = byTx.get(t.id);
    if (tags) t.note = [String(t.note || '').trim(), tags.sort().join(' ')].filter(Boolean).join('\n');
    return t;
  });

  return { ...data, version: 2, tables: { wallets: tables.wallets, categories, transactions }, settings: data.settings };
}

/** Mentés visszatöltése: a meglévő adatokat lecseréli (tranzakcióban, hiba esetén semmi nem változik). */
export async function importJson(db, input) {
  if (!input || input.app !== 'budget-app' || !input.tables) throw bad('Ez nem érvényes budget mentésfájl');
  const data = (input.version || 1) < 2 ? upgradeBackup(input) : input;
  await db.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  const counts = {};
  for (const t of TABLES) {
    const rows = data.tables[t] || [];
    counts[t] = rows.length;
    for (const row of rows) {
      const r = { ...row };
      if (t === 'transactions' && r.receipt_data) r.receipt_data = Buffer.from(r.receipt_data, 'base64');
      // A szülő-hivatkozást utólag állítjuk be, mert a szülő később is jöhet a listában
      if (t === 'categories') r.parent_id = null;
      const cols = Object.keys(r).filter((c) => /^[a-z_]+$/.test(c));
      await db.query(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
        cols.map((c) => r[c]),
      );
    }
    if (t === 'categories') {
      for (const row of rows) {
        if (row.parent_id != null) await db.query('UPDATE categories SET parent_id = $1 WHERE id = $2', [row.parent_id, row.id]);
      }
    }
    await db.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  }
  if (data.settings) {
    const cols = SETTINGS_COLS.filter((c) => data.settings[c] !== undefined);
    if (cols.length) {
      await db.query(
        `UPDATE settings SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = 1`,
        cols.map((c) => data.settings[c]),
      );
    }
  }
  return counts;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Excelben megnyitható CSV (pontosvessző elválasztó, UTF-8 BOM). A kategória teljes útvonallal. */
export async function exportCsv(db) {
  const { rows } = await db.query(`
    WITH RECURSIVE tree AS (
      SELECT id, name::text AS path FROM categories WHERE parent_id IS NULL
      UNION ALL
      SELECT c.id, tree.path || ' › ' || c.name FROM categories c JOIN tree ON c.parent_id = tree.id
    )
    SELECT t.id, to_char(t.occurred_at AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') AS datum,
      CASE t.type WHEN 'income' THEN 'Bevétel' WHEN 'expense' THEN 'Kiadás' ELSE 'Átcsoportosítás' END AS tipus,
      CASE t.status WHEN 'draft' THEN 'Piszkozat' ELSE 'Végleges' END AS allapot,
      CASE WHEN t.type = 'expense' THEN -t.amount ELSE t.amount END AS osszeg,
      t.name AS megnevezes, w.name AS tarca, w2.name AS cel_tarca, tree.path AS kategoria,
      t.note AS megjegyzes, CASE WHEN t.receipt_data IS NOT NULL THEN 'igen' ELSE '' END AS blokk
    FROM transactions t
    LEFT JOIN wallets w ON w.id = t.wallet_id
    LEFT JOIN wallets w2 ON w2.id = t.to_wallet_id
    LEFT JOIN tree ON tree.id = t.category_id
    ORDER BY t.occurred_at, t.id`);
  const header = ['Azonosító', 'Dátum', 'Típus', 'Állapot', 'Összeg (Ft)', 'Megnevezés', 'Tárca', 'Cél tárca', 'Kategória', 'Megjegyzés', 'Blokk fotó'];
  const lines = [header.join(';')];
  for (const r of rows) lines.push(Object.values(r).map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n');
}
