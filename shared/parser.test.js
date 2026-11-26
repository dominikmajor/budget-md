import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickEntry } from './parser.js';
import { formatHUF } from './format.js';

const wallets = [
  { id: 1, name: 'OTP Számla', keywords: ['otp', 'bank'] },
  { id: 2, name: 'Revolut', keywords: ['revo', 'revolut'] },
  { id: 3, name: 'Költős', keywords: ['koltos', 'kp'] },
  { id: 4, name: 'Irattartó', keywords: ['irattarto'] },
  { id: 5, name: 'Nyaralás', keywords: [] },
];
const categories = [
  { id: 10, name: 'Nasi', kind: 'expense', keywords: ['fagyi'] },
  { id: 11, name: 'Drogéria', kind: 'expense', keywords: ['dm'] },
  { id: 20, name: 'Család / Ajándék', kind: 'income', keywords: ['mama'] },
];
const ctx = { wallets, categories };

test('kiadás alapértelmezett', () => {
  const r = parseQuickEntry('fagyi 1500 költős', ctx);
  assert.deepEqual([r.type, r.amount, r.walletId, r.name, r.categoryId, r.valid], ['expense', 1500, 3, 'Fagyi', 10, true]);
});
test('bevétel + jellel', () => {
  const r = parseQuickEntry('+4000 mama költős', ctx);
  assert.deepEqual([r.type, r.amount, r.walletId, r.categoryId], ['income', 4000, 3, 20]);
});
test('revo rövidítés', () => {
  const r = parseQuickEntry('dm 2500 revo', ctx);
  assert.deepEqual([r.type, r.amount, r.walletId, r.categoryId], ['expense', 2500, 2, 11]);
});
test('átcsoportosítás ->', () => {
  const r = parseQuickEntry('10000 otp -> költős', ctx);
  assert.deepEqual([r.type, r.amount, r.walletId, r.toWalletId, r.valid], ['transfer', 10000, 1, 3, true]);
});
test('átcsoportosítás > szóköz nélkül, borítékba', () => {
  const r = parseQuickEntry('10000 otp>nyaralás', ctx);
  assert.deepEqual([r.type, r.walletId, r.toWalletId], ['transfer', 1, 5]);
});
test('tárca nélkül piszkozatnak való', () => {
  const r = parseQuickEntry('2500 dm', ctx);
  assert.equal(r.valid, false);
  assert.equal(r.amount, 2500);
});
test('k rövidítés', () => {
  assert.equal(parseQuickEntry('+16k otp munka', ctx).amount, 16000);
});
test('memória felülírja a kulcsszót', () => {
  const r = parseQuickEntry('fagyi 900 kp', { ...ctx, memory: { fagyi: 11 } });
  assert.equal(r.categoryId, 11);
});
test('formázás', () => {
  assert.equal(formatHUF(-1500), '-1 500 Ft');
  assert.equal(formatHUF(16000, { sign: true }), '+16 000 Ft');
});
