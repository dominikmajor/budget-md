/**
 * A specifikáció 4. fejezetének (Konkrét működési példa) automatikus ellenőrzése.
 *
 * A teljes forgatókönyv egy ideiglenes sémában, egyetlen adatbázis-tranzakcióban fut,
 * a végén ROLLBACK – így a valódi adataidhoz nem nyúl, akár az éles (Vercel) adatbázison is futtatható.
 *
 *   npm run verify
 */
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as F from '../src/services/finance.js';
import { getStats } from '../src/services/stats.js';
import { parseQuickEntry } from '@budget/shared/parser';
import { formatHUF } from '@budget/shared/format';

const db = await pool.connect();
let failures = 0;
const ok = (label) => console.log(`  ✅ ${label}`);

function check(label, fn) {
  try {
    fn();
    ok(label);
  } catch (e) {
    failures++;
    console.log(`  ❌ ${label}\n     ${e.message.split('\n').join('\n     ')}`);
  }
}

try {
  await db.query('BEGIN');
  const schema = `verify_${Date.now()}`;
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET LOCAL search_path TO ${schema}`);
  await runMigrations(db, { log: () => {} });

  // Kezdőállapot a specifikáció szerint
  const start = { 'OTP Számla': 45000, Revolut: 12000, 'Költős': 3000, 'Irattartó': 30000, 'Nyaralás': 50000 };
  for (const [name, amount] of Object.entries(start)) {
    await db.query('UPDATE wallets SET initial_balance = $1 WHERE name = $2', [amount, name]);
  }

  const state = () => F.getState(db);
  const balances = async () => {
    const s = await state();
    return Object.fromEntries(s.wallets.map((w) => [w.name, w.balance]));
  };
  const ctx = async () => {
    const s = await state();
    return { wallets: s.wallets, categories: s.categories, memory: s.memory, s };
  };
  const wid = async (name) => (await state()).wallets.find((w) => w.name === name).id;
  const cid = async (name, kind) => (await state()).categories.find((c) => c.name === name && c.kind === kind).id;

  console.log('\nKezdőállapot');
  {
    const s = await state();
    check('Likvid 60 000 | Félretett 80 000 | Teljes 140 000', () =>
      assert.deepEqual(s.summary, { liquid: 60000, saved: 80000, total: 140000 }));
  }

  console.log('\n1. Mamától 4 000 Ft kp — gyorsbevitel: "+4000 mama költős"');
  {
    const c = await ctx();
    const p = parseQuickEntry('+4000 mama költős', c);
    const koltos = await wid('Költős');
    const csalad = await cid('Család / Ajándék', 'income');
    check('Értelmezés: Bevétel, 4 000, Költős, Család / Ajándék', () =>
      assert.deepEqual([p.type, p.amount, p.walletId, p.categoryId], ['income', 4000, koltos, csalad]));
    await F.createTransaction(db, { ...p });
    const b = await balances();
    const s = await state();
    check('Költős: 3 000 → 7 000', () => assert.equal(b['Költős'], 7000));
    check('Likvid egyenleg 64 000', () => assert.equal(s.summary.liquid, 64000));
  }

  console.log('\n2. Fagyi 1 500 — napközben piszkozat "fagyi 1500", este rendszerezve');
  {
    const c = await ctx();
    const p = parseQuickEntry('fagyi 1500', c);
    check('Tárca nélkül nem menthető véglegesként (piszkozat kell)', () => assert.equal(p.valid, false));
    const draftId = await F.createTransaction(db, { ...p, status: 'draft' });
    let s = await state();
    check('Fejléc jelvény: 1 rendszerezésre váró tétel', () => assert.equal(s.draftCount, 1));
    check('Tárca nélküli piszkozat még nem módosít egyenleget (Költős 7 000)', () =>
      assert.equal(s.wallets.find((w) => w.name === 'Költős').balance, 7000));
    await F.updateTransaction(db, draftId, { walletId: await wid('Költős'), categoryId: await cid('Nasi', 'expense') });
    await F.approveTransactions(db, [draftId]);
    s = await state();
    check('Jóváhagyás után 0 piszkozat', () => assert.equal(s.draftCount, 0));
    check('Költős: 7 000 → 5 500', () => assert.equal(s.wallets.find((w) => w.name === 'Költős').balance, 5500));
    check('Heti Költős keretből 1 500 levonva', () => assert.equal(s.spending.spent, 1500));
  }

  console.log('\n3. DM 2 500 Revolutról — "dm 2500 revo"');
  {
    const c = await ctx();
    const p = parseQuickEntry('dm 2500 revo', c);
    assert.equal(p.walletId, await wid('Revolut'));
    assert.equal(p.categoryId, await cid('Drogéria', 'expense'));
    // kis blokk "fotó" (1x1 px PNG)
    const receipt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const id = await F.createTransaction(db, { ...p, receipt });
    const tx = await F.getTransaction(db, id);
    const b = await balances();
    check('Értelmezés: Kiadás, Revolut, Drogéria', () => assert.equal(tx.type, 'expense'));
    check('Blokk fotó csatolva', () => assert.equal(tx.hasReceipt, true));
    check('Revolut: 12 000 → 9 500', () => assert.equal(b.Revolut, 9500));
  }

  console.log('\n4. Munkából 16 000 Ft OTP-re — részletes űrlap, Projekt: Side-hustle #1, #munka');
  {
    const s0 = await state();
    const project = s0.projects.find((p) => p.name === 'Side-hustle #1');
    await F.createTransaction(db, {
      type: 'income', amount: 16000, walletId: await wid('OTP Számla'), projectId: project.id,
      categoryId: await cid('Side-hustle', 'income'), name: 'Munka', tags: ['#munka'],
    });
    const s = await state();
    check('OTP: 45 000 → 61 000', () => assert.equal(s.wallets.find((w) => w.name === 'OTP Számla').balance, 61000));
    check('Likvid egyenleg 76 000', () => assert.equal(s.summary.liquid, 76000));
  }

  console.log('\n5. Kivét az Irattartóból (-5 000) váratlan kp-s kiadásra');
  {
    await F.createTransaction(db, { type: 'expense', amount: 5000, walletId: await wid('Irattartó'), name: 'Váratlan kiadás' });
    const s = await state();
    const alert = s.alerts.find((a) => a.type === 'reserve');
    check('Irattartó: 30 000 → 25 000', () => assert.equal(s.wallets.find((w) => w.name === 'Irattartó').balance, 25000));
    check('Riasztás aktív: 5 000 Ft hiányzik a 30 000 Ft-os célhoz', () => assert.equal(alert?.missing, 5000));
  }

  console.log('\n6. Irattartó pótlása és félretétel — "5000 otp -> irattartó", "10000 otp -> nyaralás"');
  {
    const statsBefore = await getStats(db, today());
    for (const text of ['5000 otp -> irattartó', '10000 otp -> nyaralás']) {
      const p = parseQuickEntry(text, await ctx());
      assert.equal(p.type, 'transfer');
      assert.equal(p.valid, true, `nem értelmezhető: ${text}`);
      await F.createTransaction(db, p);
    }
    const s = await state();
    const b = Object.fromEntries(s.wallets.map((w) => [w.name, w.balance]));
    const nyaralas = s.wallets.find((w) => w.name === 'Nyaralás');
    const statsAfter = await getStats(db, today());
    check('OTP: 61 000 → 46 000', () => assert.equal(b['OTP Számla'], 46000));
    check('Irattartó: 25 000 → 30 000', () => assert.equal(b['Irattartó'], 30000));
    check('Nyaralás: 50 000 → 60 000', () => assert.equal(b['Nyaralás'], 60000));
    check('Irattartó riasztás eltűnt', () => assert.equal(s.alerts.some((a) => a.type === 'reserve'), false));
    check('Nyaralás boríték 20% (60 000 / 300 000)', () => assert.equal(Math.round((nyaralas.balance / nyaralas.targetAmount) * 100), 20));
    check('A havi kiadás nem változott az átcsoportosítástól', () =>
      assert.equal(statsAfter.totals.expense, statsBefore.totals.expense));
  }

  console.log('\nZáróállapot');
  {
    const s = await state();
    const b = Object.fromEntries(s.wallets.map((w) => [w.name, w.balance]));
    check('OTP 46 000 | Revolut 9 500 | Költős 5 500 | Irattartó 30 000 | Nyaralás 60 000', () =>
      assert.deepEqual(b, { 'OTP Számla': 46000, Revolut: 9500, 'Költős': 5500, 'Irattartó': 30000, 'Nyaralás': 60000 }));
    check('Likvid 61 000 | Félretett 90 000 | Teljes 151 000', () =>
      assert.deepEqual(s.summary, { liquid: 61000, saved: 90000, total: 151000 }));
    const st = await getStats(db, today());
    check(`Statisztika: bevétel ${formatHUF(st.totals.income)}, kiadás ${formatHUF(st.totals.expense)} (átcsoportosítás nélkül)`, () => {
      assert.equal(st.totals.income, 20000);
      assert.equal(st.totals.expense, 9000);
    });
    check('Side-hustle #1 forrásként 16 000 Ft', () =>
      assert.equal(st.incomeSources.find((x) => x.name === 'Side-hustle #1')?.amount, 16000));

    // Szerkesztés/törlés pontos visszaszámolása
    const dm = (await F.listTransactions(db, { q: 'dm' }))[0];
    await F.updateTransaction(db, dm.id, { amount: 3000 });
    let rev = (await state()).wallets.find((w) => w.name === 'Revolut').balance;
    check('Szerkesztés: DM 2 500 → 3 000 után Revolut 9 000', () => assert.equal(rev, 9000));
    await F.deleteTransaction(db, dm.id);
    rev = (await state()).wallets.find((w) => w.name === 'Revolut').balance;
    check('Törlés után Revolut 12 000', () => assert.equal(rev, 12000));

    // Készpénz leltár
    const r = await F.reconcileWallet(db, await wid('Költős'), 5300);
    const kolt = (await state()).wallets.find((w) => w.name === 'Költős').balance;
    check('Leltár: Költős 5 500 → 5 300, -200 Ft korrekció', () => {
      assert.equal(r.diff, -200);
      assert.equal(kolt, 5300);
    });
  }

  await db.query('ROLLBACK');
} catch (e) {
  failures++;
  console.error('\n❌ Váratlan hiba:', e);
  await db.query('ROLLBACK').catch(() => {});
} finally {
  db.release();
  await pool.end();
}

console.log(failures ? `\n${failures} ellenőrzés sikertelen.\n` : '\n🎉 Minden ellenőrzés sikeres – a 4. fejezet példája reprodukálható.\n');
process.exit(failures ? 1 : 0);

function today() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Europe/Budapest' }).format(new Date());
  return { from: d.slice(0, 8) + '01', to: d };
}
