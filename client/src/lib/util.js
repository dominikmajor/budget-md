export { formatHUF, formatNumber } from '@budget/shared/format';

export const TYPE_META = {
  income: { label: 'Bevétel', sign: '+', cls: 'pos' },
  expense: { label: 'Kiadás', sign: '-', cls: 'neg' },
  transfer: { label: 'Átcsoportosítás', sign: '⇄', cls: 'xfer' },
};

export const WALLET_KIND = {
  account: 'Bankszámla / digitális',
  cash: 'Készpénz zseb',
  reserve: 'Tartalék',
  envelope: 'Boríték',
  vault: 'Széf',
};

export { isGoalKind, isLiquidKind, isSavedKind, GOAL_KINDS } from '@budget/shared/wallets';

/** Az alapértelmezett likvid tárca (OTP vagy az első bankszámla). */
export const mainWallet = (wallets = []) =>
  wallets.find((w) => w.keywords?.includes('otp') && !w.archived) || wallets.find((w) => w.kind === 'account' && !w.archived);

/** Széfek forrása: a Revolut tárca, ha van, különben a fő tárca. */
export const vaultSource = (wallets = []) =>
  wallets.find((w) => w.kind === 'account' && !w.archived && (w.keywords?.some((k) => k.startsWith('revo')) || /revolut/i.test(w.name)))
  || mainWallet(wallets);

export const byId = (list = []) => Object.fromEntries(list.map((x) => [x.id, x]));

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const todayKey = () => dateKey(new Date());

const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

export function dayLabel(key) {
  const d = new Date(key + 'T12:00:00');
  const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  const base = `${capital(MONTHS[d.getMonth()])} ${d.getDate()}.`;
  if (key === dateKey(t)) return `Ma – ${base}`;
  if (key === dateKey(y)) return `Tegnap – ${base}`;
  const yearPart = d.getFullYear() !== t.getFullYear() ? `${d.getFullYear()}. ` : '';
  return `${yearPart}${base} ${DAYS[d.getDay()]}`;
}
export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const timeLabel = (d) => new Date(d).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
export const shortDate = (d) => new Date(d).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
export const fullDateTime = (d) =>
  new Date(d).toLocaleString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const monthName = (i) => MONTHS[i];
/** "júliusra", "decemberre" */
export const monthBy = (i) => MONTHS[i] + (i >= 8 ? 're' : 'ra');

/** <input type="datetime-local"> értéke helyi időben */
export const toLocalInput = (d) => {
  const x = new Date(d);
  return `${dateKey(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

/** Előjeles hatás a "nettó" napi összeghez (átcsoportosítás 0) */
export const signedAmount = (t) => (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);

/** Blokk fotó tömörítése (max 1600px, JPEG), hogy kis méretben menjen az adatbázisba */
export function compressImage(file, maxSize = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function haptic(pattern = 10) {
  try { navigator.vibrate?.(pattern); } catch { /* nem támogatott */ }
}

/** Javasolt heti félretétel a céldátumig */
export function weeklySuggestion(w) {
  if (!w.targetAmount || !w.targetDate) return null;
  const missing = w.targetAmount - w.balance;
  if (missing <= 0) return null;
  const weeks = Math.max(1, Math.ceil((new Date(w.targetDate) - new Date()) / (7 * 86400000)));
  return { perWeek: Math.ceil(missing / weeks / 100) * 100, weeks };
}

export function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
