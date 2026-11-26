import { Router } from 'express';
import { pool } from '../db.js';
import {
  issueSession, clearSession, readSession, pinVersion, hashPin, checkPin, isValidPin,
  MAX_ATTEMPTS, LOCKOUT_SECONDS,
} from '../auth.js';
import { getSettings } from '../services/finance.js';
import { publicRoutes as webauthnPublic, protectedRoutes as webauthnProtected, hasCredentials } from './webauthn.js';

const r = Router();

r.get('/status', async (req, res) => {
  const s = await getSettings(pool);
  const session = readSession(req);
  res.json({
    hasPin: !!s.pin_hash,
    pinLength: s.pin_length,
    authenticated: !!session && session.v === pinVersion(s.pin_hash),
    lockedUntil: s.locked_until && new Date(s.locked_until) > new Date() ? s.locked_until : null,
    webauthn: s.pin_hash ? await hasCredentials() : false,
  });
});

// Face ID / biometrikus belépés (WebAuthn)
r.use('/webauthn', webauthnPublic);
r.use('/webauthn', requireAuth, webauthnProtected);

// Első indítás: PIN beállítása (csak ha még nincs)
r.post('/setup', async (req, res) => {
  const { pin } = req.body || {};
  if (!isValidPin(pin)) return res.status(400).json({ error: 'A PIN 4 vagy 6 számjegy legyen' });
  const hash = await hashPin(pin);
  const { rowCount } = await pool.query(
    'UPDATE settings SET pin_hash = $1, pin_length = $2 WHERE id = 1 AND pin_hash IS NULL',
    [hash, pin.length],
  );
  if (!rowCount) return res.status(409).json({ error: 'A PIN már be van állítva' });
  issueSession(res, pinVersion(hash));
  res.json({ ok: true });
});

r.post('/login', async (req, res) => {
  const { pin } = req.body || {};
  const s = await getSettings(pool);
  if (!s.pin_hash) return res.status(409).json({ error: 'Előbb állíts be PIN-kódot' });
  if (s.locked_until && new Date(s.locked_until) > new Date()) {
    return res.status(429).json({ error: 'Túl sok próbálkozás', lockedUntil: s.locked_until });
  }
  if (typeof pin === 'string' && (await checkPin(pin, s.pin_hash))) {
    await pool.query('UPDATE settings SET failed_attempts = 0, locked_until = NULL WHERE id = 1');
    issueSession(res, pinVersion(s.pin_hash));
    return res.json({ ok: true });
  }
  const attempts = s.failed_attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const { rows } = await pool.query(
      `UPDATE settings SET failed_attempts = 0, locked_until = now() + ($1 || ' seconds')::interval
       WHERE id = 1 RETURNING locked_until`,
      [LOCKOUT_SECONDS],
    );
    return res.status(429).json({ error: 'Túl sok próbálkozás', lockedUntil: rows[0].locked_until });
  }
  await pool.query('UPDATE settings SET failed_attempts = $1 WHERE id = 1', [attempts]);
  res.status(401).json({ error: 'Hibás PIN', attemptsLeft: MAX_ATTEMPTS - attempts });
});

r.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

export default r;

/** Middleware: csak érvényes munkamenettel engedi tovább. */
export async function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Lejárt munkamenet' });
  const s = await getSettings(pool);
  if (session.v !== pinVersion(s.pin_hash)) return res.status(401).json({ error: 'Lejárt munkamenet' });
  next();
}

export async function changePin(req, res) {
  const { oldPin, newPin } = req.body || {};
  const s = await getSettings(pool);
  if (!(await checkPin(String(oldPin || ''), s.pin_hash))) return res.status(400).json({ error: 'A régi PIN hibás' });
  if (!isValidPin(newPin)) return res.status(400).json({ error: 'Az új PIN 4 vagy 6 számjegy legyen' });
  const hash = await hashPin(newPin);
  await pool.query('UPDATE settings SET pin_hash = $1, pin_length = $2 WHERE id = 1', [hash, newPin.length]);
  issueSession(res, pinVersion(hash));
  res.json({ ok: true });
}
