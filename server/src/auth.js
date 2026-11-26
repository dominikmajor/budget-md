import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const COOKIE = 'budget_sid';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 nap; a gyors zárolást a kliens intézi
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s === 'change-me-to-a-long-random-string') {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET nincs beállítva');
    return 'dev-only-insecure-secret';
  }
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueSession(res, pinVersion) {
  const token = sign({ exp: Date.now() + MAX_AGE_MS, v: pinVersion });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** A PIN hash első 12 karaktere: PIN-csere után a régi munkamenetek érvénytelenek. */
export function pinVersion(hash) {
  return hash ? crypto.createHash('sha256').update(hash).digest('hex').slice(0, 12) : null;
}

export function readSession(req) {
  return verify(req.cookies?.[COOKIE]);
}

export const hashPin = (pin) => bcrypt.hash(pin, 10);
export const checkPin = (pin, hash) => bcrypt.compare(pin, hash);
export const isValidPin = (pin) => typeof pin === 'string' && /^(\d{4}|\d{6})$/.test(pin);
