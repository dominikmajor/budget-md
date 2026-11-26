import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import authRoutes, { requireAuth } from './routes/auth.js';
import apiRoutes from './routes/api.js';
import { pool } from './db.js';
import { runMigrations } from './migrations.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// A hiányzó migrációk automatikusan lefutnak (helyben indításkor, Vercelen az első kéréskor)
let migrated;
function migrateOnce() {
  migrated ??= (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(424242)');
      await runMigrations(client, { log: (m) => console.log('[migráció]', m.trim()) });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  })().catch((e) => {
    migrated = undefined; // következő kérésnél újrapróbálja
    throw e;
  });
  return migrated;
}
app.use((req, res, next) => migrateOnce().then(() => next(), next));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, apiRoutes);

// Éles módban (npm run build után) a lebuildelt React appot is kiszolgálja
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  const fk = err.code === '23503';
  const status = err.status || (fk ? 409 : 500);
  if (status >= 500) console.error(err);
  const message = fk ? 'Ez az elem használatban van, nem törölhető' : status >= 500 ? 'Szerverhiba' : err.message;
  res.status(status).json({ error: message });
});

// Vercelen (serverless) az app exportálva van, a platform hívja meg; helyben/szerveren saját maga indul.
export default app;

if (!process.env.VERCEL) {
  try {
    await migrateOnce();
  } catch (e) {
    console.error('❌ Migráció hiba:', e.message);
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`✅ Budget API fut: http://localhost:${port}`));
}
