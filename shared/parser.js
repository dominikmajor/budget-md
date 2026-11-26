import { normalize, capitalize } from './text.js';
import { depthOf, isActive } from './categories.js';

/**
 * Szabadszöveges gyorsbevitel értelmezése.
 *
 *   "fagyi 1500 költős"        -> Kiadás 1500, Költős
 *   "+4000 mama költős"        -> Bevétel 4000, Költős
 *   "10000 otp -> költős"      -> Átcsoportosítás OTP -> Költős
 *   "5000 otp > irattartó"     -> Átcsoportosítás OTP -> Irattartó
 *
 * @param {string} text
 * @param {object} ctx
 * @param {Array<{id:number,name:string,keywords?:string[],archived?:boolean}>} ctx.wallets
 * @param {Array<{id:number,name:string,kind:string,parentId?:number|null,keywords?:string[],archived?:boolean}>} [ctx.categories]
 * @param {Record<string, number>} [ctx.memory]  normalizált megnevezés -> kategória id (korábbi használat)
 */
export function parseQuickEntry(text, { wallets = [], categories = [], memory = {} } = {}) {
  const result = {
    type: 'expense',
    amount: null,
    walletId: null,
    toWalletId: null,
    name: '',
    categoryId: null,
    valid: false,
  };
  if (!text || !text.trim()) return result;

  // "->", "→" és ">" egységesítése önálló tokenné
  const prepared = text.replace(/\s*(?:->|→|=>|>)\s*/g, ' > ');
  const rawTokens = prepared.split(/\s+/).filter(Boolean);

  const walletIndex = buildWalletIndex(wallets.filter((w) => !w.archived));
  const isTransfer = rawTokens.includes('>');

  const nameTokens = [];
  const leftWallets = [];
  const rightWallets = [];
  let side = 'left';
  let sign = null;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    if (tok === '>') { side = 'right'; continue; }

    // Összeg felismerése: 1500, +4000, -2500, 16.000, 16k, 1,5k
    if (result.amount == null) {
      const m = tok.match(/^([+-])?(\d+(?:[.,]\d+)*)(k|e|ft)?$/i);
      if (m) {
        let numStr = m[2];
        const suffix = (m[3] || '').toLowerCase();
        let value;
        if (suffix === 'k' || suffix === 'e') {
          value = parseFloat(numStr.replace(',', '.')) * 1000;
        } else {
          value = parseInt(numStr.replace(/[.,]/g, ''), 10);
        }
        if (Number.isFinite(value) && value > 0) {
          result.amount = Math.round(value);
          sign = m[1] || null;
          continue;
        }
      }
    }
    if (/^ft$/i.test(tok)) continue;

    // Tárca kulcsszó (egy- vagy kétszavas egyezés)
    const two = i + 1 < rawTokens.length && rawTokens[i + 1] !== '>' ? normalize(tok + ' ' + rawTokens[i + 1]) : null;
    if (two && walletIndex.has(two)) {
      (side === 'left' ? leftWallets : rightWallets).push(walletIndex.get(two));
      i++;
      continue;
    }
    const one = normalize(tok);
    if (one && walletIndex.has(one)) {
      (side === 'left' ? leftWallets : rightWallets).push(walletIndex.get(one));
      continue;
    }
    nameTokens.push(tok);
  }

  if (isTransfer) {
    result.type = 'transfer';
    result.walletId = leftWallets[0] ?? null;
    result.toWalletId = rightWallets[0] ?? null;
  } else {
    result.type = sign === '+' ? 'income' : 'expense';
    result.walletId = leftWallets[0] ?? rightWallets[0] ?? null;
  }

  result.name = capitalize(nameTokens.join(' '));

  if (result.type !== 'transfer') {
    result.categoryId = guessCategory(result.name, result.type, { categories, memory });
  }

  result.valid =
    result.amount != null &&
    (result.type === 'transfer'
      ? result.walletId != null && result.toWalletId != null && result.walletId !== result.toWalletId
      : result.walletId != null);
  return result;
}

function buildWalletIndex(wallets) {
  const idx = new Map();
  // 1. kör: explicit kulcsszavak és teljes név (ezek az erősebbek)
  for (const w of wallets) {
    for (const k of w.keywords || []) {
      const n = normalize(k);
      if (n) idx.set(n, w.id);
    }
    const full = normalize(w.name);
    if (full) idx.set(full, w.id);
  }
  // 2. kör: a név egyes szavai (≥3 betű), ha még nem foglaltak
  for (const w of wallets) {
    for (const word of normalize(w.name).split(' ')) {
      if (word.length >= 3 && !idx.has(word)) idx.set(word, w.id);
    }
  }
  return idx;
}

/** Kategória-tipp: előbb a korábbi használat, aztán a kategóriák kulcsszavai / neve. */
export function guessCategory(name, type, { categories = [], memory = {} } = {}) {
  const n = normalize(name);
  if (!n) return null;
  // Archivált kategória (vagy archivált ős alatti) nem jöhet szóba; kulcsszó-egyezésnél
  // a mélyebb (specifikusabb) alkategória nyer.
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  const pool = categories
    .filter((c) => c.kind === type && !c.isSystem && isActive(c, byId))
    .map((c) => ({ c, d: depthOf(c.id, byId) }))
    .sort((a, b) => b.d - a.d)
    .map((x) => x.c);
  const poolIds = new Set(pool.map((c) => c.id));

  if (memory[n] != null && poolIds.has(memory[n])) return memory[n];
  const words = n.split(' ');
  for (const w of words) {
    if (memory[w] != null && poolIds.has(memory[w])) return memory[w];
  }
  for (const c of pool) {
    const keys = [normalize(c.name), ...(c.keywords || []).map(normalize)].filter(Boolean);
    for (const w of words) {
      if (keys.includes(w)) return c.id;
    }
  }
  return null;
}
