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
import { rollup, pathLabel } from '@budget/shared/categories';
import { exportJson, importJson, upgradeBackup } from '../src/services/backup.js';
import fs from 'node:fs/promises';

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

  // Az alapkategóriák törölve vannak (004) – csak a rejtett rendszer-kategóriák maradnak
  {
    const { rows } = await db.query('SELECT name, is_system FROM categories');
    check('Nincs előre feltöltött kategória (csak a rejtett Egyenleg korrekció)', () =>
      assert.deepEqual(rows.filter((r) => !r.is_system), []));
  }
  // A forgatókönyvhöz szükséges saját kategóriák – ahogy a felhasználó felvenné őket
  {
    const mk = (name, kind, keywords, parentId) => F.createCategory(db, { name, kind, keywords, parentId, icon: '🏷️' });
    await mk('Család / Ajándék', 'income', 'mama, papa');
    const sh = await mk('Side-hustle', 'income', 'munka');
    await mk('Side-hustle #1', 'income', '', sh);
    await mk('Korrepetálás', 'income', 'korrep', sh);
    await mk('Ösztöndíj', 'income', 'osztondij');
    await mk('Kaja', 'expense', 'kaja, spar');
    await mk('Nasi', 'expense', 'fagyi, kave');
    await mk('Drogéria', 'expense', 'dm, rossmann');
    await mk('Egyéb kiadás', 'expense', 'egyeb');
  }

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
    check('Nincs költési keret az állapotban (tisztán nyilvántartás)', () => assert.equal('spending' in s, false));
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

  console.log('\n4. Munkából 16 000 Ft OTP-re — részletes űrlap, kategória: Side-hustle › Side-hustle #1');
  {
    const s0 = await state();
    const sub = s0.categories.find((c) => c.name === 'Side-hustle #1');
    const root = s0.categories.find((c) => c.name === 'Side-hustle' && c.kind === 'income');
    check('Side-hustle #1 a Side-hustle alkategóriája, bevétel típusú', () => {
      assert.equal(sub?.parentId, root.id);
      assert.equal(sub.kind, 'income');
    });
    await F.createTransaction(db, {
      type: 'income', amount: 16000, walletId: await wid('OTP Számla'), categoryId: sub.id, name: 'Munka',
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
    const cats = s.categories;
    const incomeById = Object.fromEntries(st.categoryTotals.filter((x) => x.type === 'income').map((x) => [x.id, x.amount]));
    const rolled = rollup(cats, incomeById);
    const shRoot = cats.find((c) => c.name === 'Side-hustle' && c.kind === 'income');
    const sh1 = cats.find((c) => c.name === 'Side-hustle #1');
    check('Side-hustle #1 alkategória 16 000 Ft, a Side-hustle főkategória összesítve 16 000 Ft', () => {
      assert.equal(rolled.get(sh1.id), 16000);
      assert.equal(rolled.get(shRoot.id), 16000);
    });

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

  console.log('\nKategóriafa: létrehozás, mozgatás, törlés');
  {
    const sp = async (name) => { await db.query(`SAVEPOINT ${name}`); };
    const expectFail = async (label, fn, re) => {
      await sp('x');
      try {
        await fn();
        failures++;
        console.log(`  ❌ ${label}\n     nem dobott hibát`);
      } catch (e) {
        await db.query('ROLLBACK TO SAVEPOINT x');
        check(label, () => assert.match(e.message, re));
      }
    };
    const kaja = await cid('Kaja', 'expense');
    const bolt = await F.createCategory(db, { name: 'Bolt', parentId: kaja, kind: 'income' });
    const lidl = await F.createCategory(db, { name: 'Lidl', parentId: bolt, keywords: 'lidl' });
    const akcio = await F.createCategory(db, { name: 'Akciós', parentId: lidl });
    let s = await state();
    const byId = Object.fromEntries(s.categories.map((c) => [c.id, c]));
    check('3 szint mély alkategória, a típust a szülőtől örökli', () => {
      assert.equal(pathLabel(akcio, byId), 'Kaja › Bolt › Lidl › Akciós');
      assert.equal(byId[bolt].kind, 'expense');
    });
    const p = parseQuickEntry('lidl 4200 otp', { wallets: s.wallets, categories: s.categories, memory: {} });
    check('Gyorsbevitel: "lidl" → a specifikusabb Kaja › Bolt › Lidl alkategória', () => assert.equal(p.categoryId, lidl));
    const tx1 = await F.createTransaction(db, p);
    await F.createTransaction(db, { type: 'expense', amount: 800, walletId: await wid('OTP Számla'), categoryId: akcio, name: 'Akciós kifli' });
    const filtered = await F.listTransactions(db, { category: kaja });
    check('Szűrés a Kaja főkategóriára az alkategóriák tételeit is mutatja', () => assert.equal(filtered.length, 2));

    await expectFail('Nem mozgatható a saját alkategóriája alá', () => F.updateCategory(db, bolt, { parentId: akcio }), /saját alkategóriája/);
    await expectFail('Kiadás-kategória nem kerülhet bevétel-kategória alá', async () => F.updateCategory(db, bolt, { parentId: await cid('Ösztöndíj', 'income') }), /csak kiadás/);
    const egyeb = await cid('Egyéb kiadás', 'expense');
    await F.updateCategory(db, lidl, { parentId: egyeb, name: 'Lidl áruház' });
    s = await state();
    const byId2 = Object.fromEntries(s.categories.map((c) => [c.id, c]));
    check('Áthelyezés és átnevezés: Egyéb kiadás › Lidl áruház › Akciós', () => assert.equal(pathLabel(akcio, byId2), 'Egyéb kiadás › Lidl áruház › Akciós'));

    await expectFail('Tételekkel rendelkező kategória nem törölhető cél megadása nélkül', () => F.deleteCategory(db, lidl), /tétel tartozik/);
    await F.deleteCategory(db, lidl, { moveTo: kaja });
    s = await state();
    const tx = await F.getTransaction(db, tx1);
    check('Törléskor a tételek a választott kategóriába kerülnek, az alkategória feljebb lép', () => {
      assert.equal(tx.categoryId, kaja);
      assert.equal(s.categories.find((c) => c.id === akcio).parentId, egyeb);
    });
    await F.deleteCategory(db, bolt);
    const afterDel = await state();
    check('Üres kategória cél nélkül is törölhető', () => assert.equal(afterDel.categories.some((c) => c.id === bolt), false));
    await expectFail('A rendszer-kategória nem törölhető', () => F.deleteCategory(db, s.categories.find((c) => c.isSystem).id, { moveTo: 'none' }), /rendszer/);
  }

  console.log('\nMentés és visszatöltés');
  {
    const before = await state();
    const backup = JSON.parse(JSON.stringify(await exportJson(db)));
    await importJson(db, backup);
    const after = await state();
    check('JSON mentés → visszatöltés után azonosak az egyenlegek és a kategóriafa', () => {
      assert.deepEqual(after.summary, before.summary);
      assert.deepEqual(after.categories.map((c) => [c.id, c.parentId, c.name]), before.categories.map((c) => [c.id, c.parentId, c.name]));
    });
    const old = upgradeBackup({
      app: 'budget-app', version: 1,
      tables: {
        categories: [{ id: 1, name: 'Side-hustle', kind: 'income', is_system: false }],
        projects: [{ id: 7, name: 'Korrepetálás', color: '#3b82f6' }],
        tags: [{ id: 3, name: 'egyetem' }],
        transactions: [{ id: 5, type: 'income', amount: 100, category_id: 1, project_id: 7, note: '' }],
        transaction_tags: [{ transaction_id: 5, tag_id: 3 }],
      },
    });
    const sub = old.tables.categories.find((c) => c.name === 'Korrepetálás');
    check('Régi (projektes, címkés) mentés átalakítása: projekt → alkategória, címke → megjegyzés', () => {
      assert.equal(sub.parent_id, 1);
      assert.equal(old.tables.transactions[0].category_id, sub.id);
      assert.equal(old.tables.transactions[0].note, '#egyetem');
      assert.equal('project_id' in old.tables.transactions[0], false);
    });
  }

  console.log('\nMigráció meglévő (projektes, címkés, keretes) adatbázison');
  {
    const legacy = `${schema}_legacy`;
    await db.query(`CREATE SCHEMA ${legacy}`);
    await db.query(`SET LOCAL search_path TO ${legacy}`);
    const dir = new URL('../migrations/', import.meta.url);
    for (const f of ['001_schema.sql', '002_seed.sql']) await db.query(await fs.readFile(new URL(f, dir), 'utf8'));
    await db.query(`INSERT INTO categories (name, kind, icon) VALUES ('Saját', 'income', '⭐')`);
    const { rows: [tx] } = await db.query(
      `INSERT INTO transactions (type, amount, wallet_id, category_id, project_id, name, note)
       VALUES ('income', 9000, (SELECT id FROM wallets LIMIT 1), (SELECT id FROM categories WHERE name = 'Side-hustle'),
               (SELECT id FROM projects WHERE name = 'Korrepetálás'), 'Óra', 'Matek') RETURNING id`);
    await db.query(`INSERT INTO tags (name) VALUES ('egyetem'), ('matek')`);
    await db.query(`INSERT INTO transaction_tags SELECT $1, id FROM tags`, [tx.id]);
    await db.query(await fs.readFile(new URL('003_category_tree.sql', dir), 'utf8'));
    const { rows: [m] } = await db.query(
      `SELECT t.note, c.name, p.name AS parent FROM transactions t
       JOIN categories c ON c.id = t.category_id JOIN categories p ON p.id = c.parent_id WHERE t.id = $1`, [tx.id]);
    const gone = await db.query(`SELECT to_regclass('${legacy}.projects') AS p, to_regclass('${legacy}.tags') AS t`);
    check('A projekthez rendelt tétel a Side-hustle › Korrepetálás kategóriába került', () => assert.deepEqual([m.parent, m.name], ['Side-hustle', 'Korrepetálás']));
    check('A címkék a megjegyzés végére kerültek', () => assert.equal(m.note, 'Matek\n#egyetem #matek'));
    check('A projektek és címkék táblái megszűntek', () => assert.deepEqual([gone.rows[0].p, gone.rows[0].t], [null, null]));

    // 004: az alapkategóriák törlése; a saját kategória és a saját alkategória megmarad
    await db.query(`INSERT INTO categories (name, kind, icon, parent_id)
                    VALUES ('Saját alkategória', 'expense', '🌟', (SELECT id FROM categories WHERE name = 'Kaja'))`);
    await db.query(await fs.readFile(new URL('004_remove_default_categories.sql', dir), 'utf8'));
    const left = (await db.query('SELECT name, parent_id FROM categories WHERE NOT is_system ORDER BY name')).rows;
    const { rows: [t2] } = await db.query('SELECT category_id FROM transactions WHERE id = $1', [tx.id]);
    const tpl = (await db.query('SELECT COUNT(*)::int AS n FROM templates WHERE category_id IS NOT NULL')).rows[0].n;
    check('Migráció: csak a felhasználó saját kategóriái maradnak, a saját alkategória főkategória lett', () =>
      assert.deepEqual(left, [{ name: 'Saját', parent_id: null }, { name: 'Saját alkategória', parent_id: null }]));
    check('Migráció: az alapkategóriás tétel és a sablonok kategória nélkül maradtak', () => {
      assert.equal(t2.category_id, null);
      assert.equal(tpl, 0);
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
