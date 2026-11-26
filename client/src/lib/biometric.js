import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from '../api.js';

/** Az eszközön elérhető biometrikus azonosítás megnevezése. */
export function biometricLabel() {
  const ua = navigator.userAgent || '';
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS asztali UA-val
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'Face ID';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Biometrikus belépés';
}

export function deviceName() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Eszköz';
}

/** Van-e beépített (platform) hitelesítő: Face ID, Touch ID, Windows Hello, Android ujjlenyomat. */
export async function platformAuthAvailable() {
  try {
    if (!window.isSecureContext || !browserSupportsWebAuthn()) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** A felhasználó megszakította / lejárt az ablak – ezt nem kell hibaként mutatni. */
export const isCancel = (e) => e?.name === 'NotAllowedError' || e?.name === 'AbortError';

export async function biometricLogin() {
  const optionsJSON = await api.post('/auth/webauthn/login/options');
  const response = await startAuthentication({ optionsJSON });
  await api.post('/auth/webauthn/login/verify', { response });
}

export async function biometricRegister() {
  const optionsJSON = await api.post('/auth/webauthn/register/options');
  const response = await startRegistration({ optionsJSON });
  await api.post('/auth/webauthn/register/verify', { response, name: deviceName() });
}
