import { bad } from './errors.js';

const TABLES = ['wallets', 'categories', 'projects', 'tags', 'transactions', 'transaction_tags', 'templates'];
const SETTINGS_COLS = ['autolock_minutes', 'reserve_target', 'spending_enabled', 'spending_period', 'spending_amount', 'spending_wallet_id'];

/** Teljes, visszaállítható mentés (a PIN hash nélkül). */
export async function exportJson(db) {
  const out = { app: 'budget-app', version: 1, exportedAt: new Date().toISOString(), tables: {} };
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

/** Mentés visszatöltése: a meglévő adatokat lecseréli (tranzakcióban, hiba esetén semmi nem változik). */
export async function importJson(db, data) {
  if (!data || data.app !== 'budget-app' || !data.tables) throw bad('Ez nem érvényes budget mentésfájl');
  await db.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  const counts = {};
  for (const t of TABLES) {
    const rows = data.tables[t] || [];
    counts[t] = rows.length;
    for (const row of rows) {
      const r = { ...row };
      if (t === 'transactions' && r.receipt_data) r.receipt_data = Buffer.from(r.receipt_data, 'base64');
      const cols = Object.keys(r).filter((c) => /^[a-z_]+$/.test(c));
      await db.query(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
        cols.map((c) => r[c]),
      );
    }
    if (t !== 'transaction_tags') {
      await db.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    }
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

/** Excelben megnyitható CSV (pontosvessző elválasztó, UTF-8 BOM). */
export async function exportCsv(db) {
  const { rows } = await db.query(`
    SELECT t.id, to_char(t.occurred_at AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') AS datum,
      CASE t.type WHEN 'income' THEN 'Bevétel' WHEN 'expense' THEN 'Kiadás' ELSE 'Átcsoportosítás' END AS tipus,
      CASE t.status WHEN 'draft' THEN 'Piszkozat' ELSE 'Végleges' END AS allapot,
      CASE WHEN t.type = 'expense' THEN -t.amount ELSE t.amount END AS osszeg,
      t.name AS megnevezes, w.name AS tarca, w2.name AS cel_tarca, c.name AS kategoria, p.name AS projekt,
      COALESCE((SELECT string_agg('#' || g.name, ' ') FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id), '') AS cimkek,
      t.note AS megjegyzes, CASE WHEN t.receipt_data IS NOT NULL THEN 'igen' ELSE '' END AS blokk
    FROM transactions t
    LEFT JOIN wallets w ON w.id = t.wallet_id
    LEFT JOIN wallets w2 ON w2.id = t.to_wallet_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN projects p ON p.id = t.project_id
    ORDER BY t.occurred_at, t.id`);
  const header = ['Azonosító', 'Dátum', 'Típus', 'Állapot', 'Összeg (Ft)', 'Megnevezés', 'Tárca', 'Cél tárca', 'Kategória', 'Projekt', 'Címkék', 'Megjegyzés', 'Blokk fotó'];
  const lines = [header.join(';')];
  for (const r of rows) lines.push(Object.values(r).map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n');
}
