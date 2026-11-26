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
test('alkategória: a specifikusabb kulcsszó nyer, archivált ős alatti nem', () => {
  const cats = [
    { id: 30, name: 'Side-hustle', kind: 'income', keywords: ['munka'] },
    { id: 31, name: 'Korrepetálás', kind: 'income', parentId: 30, keywords: ['korrep'] },
    { id: 32, name: 'Grafika', kind: 'income', parentId: 30, keywords: ['logo', 'munka'] },
    { id: 40, name: 'Régi', kind: 'income', archived: true },
    { id: 41, name: 'Fordítás', kind: 'income', parentId: 40, keywords: ['forditas'] },
  ];
  const c = { wallets, categories: cats };
  assert.equal(parseQuickEntry('+8000 korrep otp', c).categoryId, 31);
  assert.equal(parseQuickEntry('+8000 munka otp', c).categoryId, 32);
  assert.equal(parseQuickEntry('+8000 korrepetálás otp', c).categoryId, 31);
  assert.equal(parseQuickEntry('+8000 forditas otp', c).categoryId, null);
});
test('széfek: „széf <név>”, név, egyetlen széfnél a „széf” szó', () => {
  const w = [
    ...wallets,
    { id: 6, name: 'Utazás', kind: 'vault', keywords: ['utazas'] },
    { id: 7, name: 'Új laptop', kind: 'vault', keywords: ['laptop'] },
    { id: 8, name: 'Régi széf', kind: 'vault', keywords: ['regi'], archived: true },
  ];
  const c = { wallets: w, categories };
  let r = parseQuickEntry('8000 revo > széf utazás', c);
  assert.deepEqual([r.type, r.walletId, r.toWalletId, r.name, r.valid], ['transfer', 2, 6, '', true]);
  r = parseQuickEntry('5000 széf laptop -> otp', c);
  assert.deepEqual([r.walletId, r.toWalletId, r.name], [7, 1, '']);
  r = parseQuickEntry('3000 revo > széf új laptop', c);
  assert.deepEqual([r.toWalletId, r.name], [7, '']);
  r = parseQuickEntry('2000 revo > laptop', c);
  assert.equal(r.toWalletId, 7);
  // több széf mellett a puszta „széf” nem dönt
  assert.equal(parseQuickEntry('2000 revo > széf', c).toWalletId, null);
  // archivált széf nem jöhet szóba
  assert.equal(parseQuickEntry('2000 revo > regi', c).toWalletId, null);
  // egyetlen aktív széf esetén a „széf” elég
  const one = { wallets: [...wallets, { id: 6, name: 'Utazás', kind: 'vault', keywords: [] }], categories };
  r = parseQuickEntry('10k revo > széfbe', one);
  assert.deepEqual([r.amount, r.walletId, r.toWalletId, r.valid], [10000, 2, 6, true]);
});
test('formázás', () => {
  assert.equal(formatHUF(-1500), '-1 500 Ft');
  assert.equal(formatHUF(16000, { sign: true }), '+16 000 Ft');
});
