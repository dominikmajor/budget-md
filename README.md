# Budget – személyes pénzügyi és budget webalkalmazás

Mobilközpontú, egyfelhasználós, PIN-kóddal védett pénzügyi nyilvántartó.
**Stack:** React 19 + Vite (frontend) · Node.js + Express 5 (API) · PostgreSQL (Vercel Postgres / Neon).

## Gyors indítás (helyi fejlesztés)

```bash
# 1. Függőségek (Node 20+ kell)
npm install

# 2. Környezeti változók
cp .env.example .env
#    → írd be a DATABASE_URL-t (Vercel Dashboard → Storage → az adatbázisod → .env.local fül,
#      a POSTGRES_URL / DATABASE_URL értéke), és egy véletlen SESSION_SECRET-et:
#      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Indítás (API: 4000-es port, web: 5173-as port)
npm run dev
```

Nyisd meg: **http://localhost:5173**. Első indításkor PIN-kódot állítasz be (4 vagy 6 jegyű),
utána megadod a kezdőegyenlegeket.

> **Telefonról**: a Vite a helyi hálózaton is elérhető (`http://<géped-IP-je>:5173`), így a
> telefon böngészőjéből is kipróbálhatod. A „Kezdőképernyőhöz adás” után teljes képernyős appként fut.

A migrációk az API indulásakor **automatikusan lefutnak** (külön is: `npm run db:migrate`).
A seed létrehozza az 5 alapértelmezett tárolót (OTP Számla, Revolut, Költős, Irattartó, Nyaralás boríték),
a kategóriákat, 3 side-hustle projektet és 3 gyorsrögzítő sablont.

## Ellenőrzés

```bash
npm test          # parser unit tesztek + a specifikáció 4. fejezetének végigjátszása
npm run verify    # csak a 4. fejezet példája
```

A `verify` egy **ideiglenes sémában, egyetlen tranzakcióban** játssza végig a teljes forgatókönyvet
(kezdőállapot → mama 4 000 → fagyi piszkozat → DM blokkal → munka 16 000 → Irattartó kivét → két átcsoportosítás),
ellenőrzi az összes egyenleget, a riasztásokat, a statisztikát, majd **ROLLBACK** – a valódi adataidhoz nem nyúl,
akár a Vercel adatbázison is biztonságosan futtatható. Várt zárás: Likvid 61 000 · Félretett 90 000 · Teljes 151 000 Ft.

## Éles futtatás egy szerveren

```bash
npm run build     # lebuildeli a React appot (client/dist)
NODE_ENV=production npm start   # az API kiszolgálja a buildelt frontendet is a 4000-es porton
```

## Funkciók (a specifikáció szerint)

| Oldal | Tartalom |
|---|---|
| **PIN képernyő** | 4/6 jegyű PIN, automatikus beléptetés, rázkódás + piros pontok hibánál, 5 hiba után 30 mp várakozás (szerveroldalon), automatikus zárolás háttérbe kerülés / inaktivitás után |
| **Főoldal** | Irattartó riasztás „Feltöltés 30k-ra” gombbal, piszkozat-emlékeztető, hero kártya (likvid / félretett / teljes vagyon), szem ikonos elrejtés, tárca-kártyák, Költős keret mérő (zöld/sárga/piros), kiemelt borítékok, utolsó 8 tétel |
| **Gyorsrögzítő (+)** | Szabadszöveges parser élő előnézettel (`fagyi 1500 költős`, `+4000 mama kp`, `10000 otp -> költős`), villám-piszkozat, 1 kattintásos sablonok, részletes űrlap (kategória, projekt, #címkék, dátum, megjegyzés, blokk fotó kamerából) |
| **Tranzakciók** | Esti rendszerező (kártyán helyben tárca/kategória/címke, zöld pipa vagy jobbra húzás, „Összes jóváhagyása”), napló keresővel és szűrőkkel, napi csoportosítás napi nettóval, részletnézet, szerkesztés/törlés pontos visszaszámolással |
| **Tárcák** | Pénz mozgatása gyors-forgatókönyvekkel, havi be/ki forgalom, Irattartó célszint-csík, új tárca/boríték, archiválás, borítékok célösszeggel, céldátummal és javasolt heti félretétellel, Befizetés/Kivétel, egyenleg-igazítás (készpénz leltár → korrekciós tétel) |
| **Statisztika** | Időszakválasztó, cash-flow oszlopdiagram (táblázat nézettel), side-hustle források, bevételi gyakoriság, kiadások fánkdiagramon előző időszakhoz mért változással, címke-szűrő, Költős keret teljesítmény |
| **Beállítások** | Kategóriák (ikon, szín, sorrend, archiválás, gyorsbeviteli kulcsszavak), projektek, címkék átnevezése/összevonása, sablonok, Irattartó célösszeg, napi/heti keret, PIN-csere, zárolási idő, CSV/JSON export, JSON visszatöltés |

## Pénzügyi logika

- Az egyenleg mindig a tranzakciókból számolódik (`wallet_balances` nézet): kezdőegyenleg + bevételek − kiadások ± átcsoportosítások. Szerkesztés vagy törlés után így nincs mit „visszaírni”, mindig pontos.
- **Likvid** = bankszámla/digitális + készpénz zseb típusú tárcák; **Félretett** = tartalék (Irattartó) + borítékok.
- Átcsoportosítás nem számít a bevétel/kiadás statisztikába; a korrekciós tételek sem.
- Piszkozat: ha van tárcája, már lefoglalja az összeget; ha nincs, csak jóváhagyáskor hat. A statisztikába csak véglegesítés után kerül.

## Mappastruktúra

```
shared/    közös kód: gyorsbevitel-parser (+ tesztek), Ft formázás
server/    Express API, SQL migrációk (migrations/), 4. fejezet ellenőrző (scripts/verify-example.js)
client/    React app (pages/, components/, styles.css)
```

## Biztonság

- A `.env` a `.gitignore`-ban van, soha ne commitold. A PIN bcrypttel hash-elve tárolódik.
- A munkamenet httpOnly, aláírt cookie; PIN-csere után a régi munkamenetek érvénytelenek.
- A JSON mentés nem tartalmazza a PIN hash-t.
