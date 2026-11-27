import { Router } from 'express';
import { pool, withTx } from '../db.js';
import * as F from '../services/finance.js';
import { getStats } from '../services/stats.js';
import { bad } from '../services/errors.js';
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
r.delete('/wallets/:id', async (req, res) => {
  const q = { ...(req.body || {}), ...req.query };
  res.json(await withTx((db) => F.deleteWallet(db, id(req), { mode: q.mode, moveTo: q.moveTo })));
});
r.post('/wallets/:id/reconcile', async (req, res) => {
  res.json(await withTx((db) => F.reconcileWallet(db, id(req), req.body?.actual)));
});

// ── Kategóriafa: létrehozás, szerkesztés/mozgatás, törlés (tételek áthelyezésével)
r.post('/categories', async (req, res) => {
  const newId = await withTx((db) => F.createCategory(db, req.body || {}));
  res.status(201).json({ id: newId });
});
r.put('/categories/:id', async (req, res) => {
  await withTx((db) => F.updateCategory(db, id(req), req.body || {}));
  res.json({ ok: true });
});
r.delete('/categories/:id', async (req, res) => {
  res.json(await withTx((db) => F.deleteCategory(db, id(req), { moveTo: req.query.moveTo ?? req.body?.moveTo })));
});
r.post('/categories/reorder', async (req, res) => {
  const ids = req.body?.ids || [];
  await withTx(async (db) => {
    for (let i = 0; i < ids.length; i++) await db.query('UPDATE categories SET sort_order = $1 WHERE id = $2', [i + 1, ids[i]]);
  });
  res.json({ ok: true });
});

r.post('/wallets/reorder', async (req, res) => {
  const ids = req.body?.ids || [];
  await withTx(async (db) => {
    for (let i = 0; i < ids.length; i++) await db.query('UPDATE wallets SET sort_order = $1 WHERE id = $2', [i + 1, ids[i]]);
  });
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
