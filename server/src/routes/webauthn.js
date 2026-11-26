import { Router } from 'express';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { pool } from '../db.js';
import { issueSession, pinVersion, signShortLived, verifyShortLived } from '../auth.js';
import { getSettings } from '../services/finance.js';

// Face ID / Touch ID / Windows Hello belépés WebAuthn passkey-kkel.
// A PIN marad a tartalék: passkey csak érvényes (PIN-nel nyitott) munkamenetből regisztrálható.

const CHALLENGE_COOKIE = 'budget_wa';
const CHALLENGE_TTL_MS = 5 * 60_000;
const USER_ID = new TextEncoder().encode('budget-md-owner'); // egyfelhasználós app

/**
 * RP ID és origin: WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN env-ből; ha nincs megadva, a böngésző Origin
 * fejlécéből (fejlesztéskor a Vite proxy mögött is helyes), végül a kérés hosztjából.
 * Az RP ID a domain (pl. budget.vercel.app), az origin séma + hoszt (+ port), pl. https://budget.vercel.app.
 * Idegen Origin-nel nem lehet visszaélni: a passkey a böngészőben az RP ID-hoz kötött.
 */
export function relyingParty(req) {
  let fallback = req.get('origin');
  if (!fallback) {
    const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    fallback = `${proto}://${host}`;
  }
  const origin = process.env.WEBAUTHN_ORIGIN
    ? process.env.WEBAUTHN_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : [fallback];
  let rpID = process.env.WEBAUTHN_RP_ID;
  if (!rpID) {
    try { rpID = new URL(origin[0]).hostname; } catch { rpID = 'localhost'; }
  }
  return { rpID, origin };
}

function setChallenge(res, type, challenge) {
  res.cookie(CHALLENGE_COOKIE, signShortLived({ t: type, c: challenge }, CHALLENGE_TTL_MS), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MS,
    path: '/api/auth/webauthn',
  });
}

function takeChallenge(req, res, type) {
  const p = verifyShortLived(req.cookies?.[CHALLENGE_COOKIE]);
  res.clearCookie(CHALLENGE_COOKIE, { path: '/api/auth/webauthn' });
  return p && p.t === type ? p.c : null;
}

const bad = (res, status, error) => res.status(status).json({ error });

async function listCredentials() {
  const { rows } = await pool.query('SELECT * FROM webauthn_credentials ORDER BY created_at');
  return rows;
}

export async function hasCredentials() {
  const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM webauthn_credentials) AS x');
  return rows[0].x;
}

/** Nyilvános végpontok (belépés) – requireAuth nélkül. */
export const publicRoutes = Router();

publicRoutes.post('/login/options', async (req, res) => {
  const creds = await listCredentials();
  if (!creds.length) return bad(res, 404, 'Nincs beállítva Face ID ehhez az apphoz');
  const { rpID } = relyingParty(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
  });
  setChallenge(res, 'auth', options.challenge);
  res.json(options);
});

publicRoutes.post('/login/verify', async (req, res) => {
  const response = req.body?.response;
  const challenge = takeChallenge(req, res, 'auth');
  if (!challenge) return bad(res, 400, 'Lejárt a kérés, próbáld újra');
  if (!response?.id) return bad(res, 400, 'Hiányzó válasz');
  const { rows } = await pool.query('SELECT * FROM webauthn_credentials WHERE id = $1', [response.id]);
  const cred = rows[0];
  if (!cred) return bad(res, 401, 'Ez az eszköz nincs regisztrálva – lépj be PIN-nel');
  const { rpID, origin } = relyingParty(req);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: Number(cred.counter), transports: cred.transports },
    });
  } catch (e) {
    return bad(res, 401, `Sikertelen azonosítás: ${e.message}`);
  }
  if (!result.verified) return bad(res, 401, 'Sikertelen azonosítás');
  await pool.query('UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE id = $1',
    [cred.id, result.authenticationInfo.newCounter]);
  const s = await getSettings(pool);
  if (!s.pin_hash) return bad(res, 409, 'Előbb állíts be PIN-kódot');
  await pool.query('UPDATE settings SET failed_attempts = 0, locked_until = NULL WHERE id = 1');
  issueSession(res, pinVersion(s.pin_hash));
  res.json({ ok: true });
});

/** Védett végpontok (regisztráció, kezelés) – csak belépett munkamenettel. */
export const protectedRoutes = Router();

protectedRoutes.get('/credentials', async (req, res) => {
  const creds = await listCredentials();
  res.json(creds.map((c) => ({ id: c.id, name: c.device_name, createdAt: c.created_at, lastUsedAt: c.last_used_at })));
});

protectedRoutes.delete('/credentials/:id', async (req, res) => {
  await pool.query('DELETE FROM webauthn_credentials WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

protectedRoutes.post('/register/options', async (req, res) => {
  const creds = await listCredentials();
  const { rpID } = relyingParty(req);
  const options = await generateRegistrationOptions({
    rpName: 'budget.md',
    rpID,
    userID: USER_ID,
    userName: 'budget.md',
    userDisplayName: 'budget.md',
    attestationType: 'none',
    excludeCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
  });
  setChallenge(res, 'reg', options.challenge);
  res.json(options);
});

protectedRoutes.post('/register/verify', async (req, res) => {
  const { response, name } = req.body || {};
  const challenge = takeChallenge(req, res, 'reg');
  if (!challenge) return bad(res, 400, 'Lejárt a kérés, próbáld újra');
  const { rpID, origin } = relyingParty(req);
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    return bad(res, 400, `Sikertelen regisztráció: ${e.message}`);
  }
  if (!result.verified) return bad(res, 400, 'Sikertelen regisztráció');
  const { credential } = result.registrationInfo;
  await pool.query(
    `INSERT INTO webauthn_credentials (id, public_key, counter, transports, device_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, counter = EXCLUDED.counter`,
    [credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports || [],
      String(name || 'Eszköz').slice(0, 60)],
  );
  res.json({ ok: true });
});
