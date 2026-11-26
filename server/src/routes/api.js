import { Router } from 'express';
import { pool, withTx } from '../db.js';
import * as F from '../services/finance.js';
import { getStats } from '../services/stats.js';
import { bad, notFound } from '../services/errors.js';
import { changePin } from './auth.js';
import { exportJson, exportCsv, importJson } from '../services/backup.js';

const r = Router();
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n)) throw bad('Érvénytelen azonosító');
  return n;
};

r.get('/state', async (req, res) => res.json(await F.getState(pool)));

// ── Tranzakciók
r.get('/transactions', async (req, res) => res.json(await F.listTransactions(pool, req.query)));
r.get('/transactions/:id', async (req, res) => res.json(await F.getTransaction(pool, id(req))));
r.get('/transactions/:id/receipt', async (req, res) => {
  const { mime, data } = await F.getReceipt(pool, id(req));
  res.set('Content-Type', mime).set('Cache-Control', 'private, max-age=3600').send(data);
});
r.post('/transactions', async (req, res) => {
  const newId = await withTx((db) => F.createTransaction(db, req.body || {}));
  res.status(201).json(await F.getTransaction(pool, newId));
});
r.put('/transactions/:id', async (req, res) => {
  await withTx((db) => F.updateTransaction(db, id(req), req.body || {}));
  res.json(await F.getTransaction(pool, id(req)));
});
r.delete('/transactions/:id', async (req, res) => {
  await F.deleteTransaction(pool, id(req));
  res.json({ ok: true });
});
r.post('/transactions/approve', async (req, res) => {
  const n = await withTx((db) => F.approveTransactions(db, req.body?.ids));
  res.json({ approved: n });
});

// ── Tárcák
r.post('/wallets', async (req, res) => {
  const newId = await F.createWallet(pool, req.body || {});
  res.status(201).json({ id: newId });
});
r.put('/wallets/:id', async (req, res) => {
  await F.updateWallet(pool, id(req), req.body || {});
  res.json({ ok: true });
});
r.post('/wallets/:id/reconcile', async (req, res) => {
  res.json(await withTx((db) => F.reconcileWallet(db, id(req), req.body?.actual)));
});

// ── Egyszerű törzsadatok: kategóriák, projektek, sablonok
const simple = {
  categories: {
    cols: { name: 'name', kind: 'kind', icon: 'icon', color: 'color', keywords: 'keywords', archived: 'archived', sortOrder: 'sort_order' },
    required: ['name', 'kind'],
  },
  projects: {
    cols: { name: 'name', color: 'color', archived: 'archived', sortOrder: 'sort_order' },
    required: ['name'],
  },
  templates: {
    cols: { name: 'name', emoji: 'emoji', type: 'type', amount: 'amount', walletId: 'wallet_id', categoryId: 'category_id', sortOrder: 'sort_order' },
    required: ['name', 'type', 'amount'],
  },
};

for (const [table, def] of Object.entries(simple)) {
  const pick = (body) => {
    const cols = [];
    const vals = [];
    for (const [k, col] of Object.entries(def.cols)) {
      if (body[k] === undefined) continue;
      let v = body[k];
      if (k === 'keywords') v = (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (typeof v === 'string') v = v.trim();
      if (v === '') v = null;
      cols.push(col);
      vals.push(v);
    }
    return { cols, vals };
  };
  r.post(`/${table}`, async (req, res) => {
    const body = req.body || {};
    for (const k of def.required) if (body[k] === undefined || body[k] === '') throw bad('Hiányzó mező: ' + k);
    const { cols, vals } = pick(body);
    if (!cols.includes('sort_order')) {
      cols.push('sort_order');
      vals.push((await pool.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ${table}`)).rows[0].n);
    }
    const { rows } = await pool.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
      vals,
    );
    res.status(201).json({ id: rows[0].id });
  });
  r.put(`/${table}/:id`, async (req, res) => {
    const { cols, vals } = pick(req.body || {});
    if (!cols.length) return res.json({ ok: true });
    vals.push(id(req));
    const { rowCount } = await pool.query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${vals.length}`,
      vals,
    );
    if (!rowCount) throw notFound();
    res.json({ ok: true });
  });
  r.post(`/${table}/reorder`, async (req, res) => {
    const ids = req.body?.ids || [];
    await withTx(async (db) => {
      for (let i = 0; i < ids.length; i++) await db.query(`UPDATE ${table} SET sort_order = $1 WHERE id = $2`, [i + 1, ids[i]]);
    });
    res.json({ ok: true });
  });
}
r.delete('/templates/:id', async (req, res) => {
  await pool.query('DELETE FROM templates WHERE id = $1', [id(req)]);
  res.json({ ok: true });
});
r.post('/wallets/reorder', async (req, res) => {
  const ids = req.body?.ids || [];
  await withTx(async (db) => {
    for (let i = 0; i < ids.length; i++) await db.query('UPDATE wallets SET sort_order = $1 WHERE id = $2', [i + 1, ids[i]]);
  });
  res.json({ ok: true });
});

// ── Címkék: átnevezés (ha már létezik ilyen nevű, összevonás), törlés
r.put('/tags/:id', async (req, res) => {
  const name = String(req.body?.name || '').replace(/^#/, '').trim().toLowerCase();
  if (!name) throw bad('Adj nevet a címkének');
  await withTx(async (db) => {
    const existing = await db.query('SELECT id FROM tags WHERE name = $1 AND id <> $2', [name, id(req)]);
    if (existing.rows[0]) {
      const target = existing.rows[0].id;
      await db.query(
        `INSERT INTO transaction_tags (transaction_id, tag_id)
         SELECT transaction_id, $1 FROM transaction_tags WHERE tag_id = $2 ON CONFLICT DO NOTHING`,
        [target, id(req)],
      );
      await db.query('DELETE FROM tags WHERE id = $1', [id(req)]);
    } else {
      await db.query('UPDATE tags SET name = $1 WHERE id = $2', [name, id(req)]);
    }
  });
  res.json({ ok: true });
});
r.delete('/tags/:id', async (req, res) => {
  await pool.query('DELETE FROM tags WHERE id = $1', [id(req)]);
  res.json({ ok: true });
});

// ── Beállítások
r.put('/settings', async (req, res) => res.json(await F.updateSettings(pool, req.body || {})));
r.post('/settings/pin', changePin);

// ── Statisztika
r.get('/stats', async (req, res) => res.json(await getStats(pool, req.query)));

// ── Export / import
r.get('/export.json', async (req, res) => {
  const data = await exportJson(pool);
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="budget-mentes-${stamp}.json"`);
  res.json(data);
});
r.get('/export.csv', async (req, res) => {
  const csv = await exportCsv(pool);
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="budget-tranzakciok-${stamp}.csv"`);
  res.send(csv);
});
r.post('/import', async (req, res) => {
  const counts = await withTx((db) => importJson(db, req.body));
  res.json({ ok: true, counts });
});

export default r;
