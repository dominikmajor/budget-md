# budget.md – személyes pénzügyi és budget webalkalmazás

Egyfelhasználós, PIN-kóddal védett pénzügyi nyilvántartó, minden képernyőméretre optimalizálva:
mobilon alsó navigációs sáv és alulról felúszó panelek, tableten ikonos oldalsáv, asztali gépen
teljes oldalsáv, többoszlopos oldalak és középre nyíló párbeszédablakok (gyorsrögzítő: **N** billentyű,
a PIN billentyűzetről is beírható).
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
a kategóriákat (a „Side-hustle” bevételi kategória alatt 3 alkategóriával) és 3 gyorsrögzítő sablont.

## Ellenőrzés

```bash
npm test          # parser unit tesztek + a specifikáció 4. fejezetének végigjátszása
npm run verify    # csak a 4. fejezet példája
```

A `verify` egy **ideiglenes sémában, egyetlen tranzakcióban** játssza végig a teljes forgatókönyvet
(kezdőállapot → mama 4 000 → fagyi piszkozat → DM blokkal → munka 16 000 → Irattartó kivét → két átcsoportosítás),
ellenőrzi az összes egyenleget, a riasztásokat, a statisztikát, a kategóriafa műveleteit (mozgatás, törlés áthelyezéssel), a mentés/visszatöltést és a régi adatbázis migrációját, majd **ROLLBACK** – a valódi adataidhoz nem nyúl,
akár a Vercel adatbázison is biztonságosan futtatható. Várt zárás: Likvid 61 000 · Félretett 90 000 · Teljes 151 000 Ft.

## Éles futtatás egy szerveren

```bash
npm run build     # lebuildeli a React appot (client/dist)
NODE_ENV=production npm start   # az API kiszolgálja a buildelt frontendet is a 4000-es porton
```

## Funkciók (a specifikáció szerint)

| Oldal | Tartalom |
|---|---|
| **PIN képernyő** | 4/6 jegyű PIN, Face ID / Touch ID / Windows Hello belépés (passkey, automatikusan felajánlva, a PIN tartalék), automatikus beléptetés, rázkódás + piros pontok hibánál, 5 hiba után 30 mp várakozás (szerveroldalon), automatikus zárolás háttérbe kerülés / inaktivitás után |
| **Főoldal** | Irattartó riasztás „Feltöltés 30k-ra” gombbal, piszkozat-emlékeztető, hero kártya (likvid / félretett / teljes vagyon), szem ikonos elrejtés, tárca-kártyák, kiemelt borítékok, utolsó 8 tétel |
| **Gyorsrögzítő (+)** | Szabadszöveges parser élő előnézettel (`fagyi 1500 költős`, `+4000 mama kp`, `10000 otp -> költős`), villám-piszkozat, 1 kattintásos sablonok, részletes űrlap (lépcsőzetes kategóriaválasztó alkategóriákkal, dátum, megjegyzés, blokk fotó kamerából) |
| **Tranzakciók** | Esti rendszerező (kártyán helyben tárca/kategória, zöld pipa vagy jobbra húzás, „Összes jóváhagyása”), napló keresővel és szűrőkkel (a kategória-szűrő az alkategóriák tételeit is mutatja), napi csoportosítás napi nettóval, részletnézet, szerkesztés/törlés pontos visszaszámolással |
| **Tárcák** | Pénz mozgatása gyors-forgatókönyvekkel, havi be/ki forgalom, Irattartó célszint-csík, új tárca/boríték, archiválás, borítékok célösszeggel, céldátummal és javasolt heti félretétellel, Befizetés/Kivétel, egyenleg-igazítás (készpénz leltár → korrekciós tétel) |
| **Statisztika** | Időszakválasztó, cash-flow oszlopdiagram (táblázat nézettel), bevételek és kiadások kategóriafa szerint (a főkategóriák összesítik az alkategóriákat, koppintással lefúrható), bevételi gyakoriság, kiadások fánkdiagramon előző időszakhoz mért változással |
| **Beállítások** | Kategóriafa korlátlan mélységű alkategóriákkal (létrehozás, átnevezés, áthelyezés, sorrend, ikon, szín, archiválás, törlés, gyorsbeviteli kulcsszavak), sablonok, Irattartó célösszeg, PIN-csere, Face ID bekapcsolása / eszközök eltávolítása, zárolási idő, CSV/JSON export, JSON visszatöltés |

## Kategóriák

- Nincsenek külön címkék és side-hustle projektek: minden kategória. Bármelyik kategória alá tehető alkategória, azok alá újabbak, korlátlan mélységig. Az alkategória a szülő típusát (kiadás/bevétel) örökli.
- Áthelyezés: bármelyik azonos típusú kategória alá (a saját ága alá nem).
- Törlés: az alkategóriák egy szinttel feljebb lépnek. Ha tételek tartoznak a kategóriához, meg kell adni, hová kerüljenek (másik kategória vagy „Kategória nélkül”) – enélkül a szerver nem engedi a törlést.
- A 003-as migráció a régi adatokat átalakítja: a projektek a „Side-hustle” kategória alkategóriái lettek (a tételeik oda kerültek), a #címkék a tételek megjegyzésének végére íródtak. Régi JSON mentés visszatöltésekor ugyanez automatikusan megtörténik.
- Az app tisztán nyilvántartó: nincs költési keret. Az egyetlen célszint az Irattartó minimuma (figyelmeztetés a Főoldalon).

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
- A JSON mentés nem tartalmazza a PIN hash-t és a Face ID passkey-ket (visszatöltéskor sem törlődnek).

## Face ID belépés (WebAuthn / passkey)

- Bekapcsolás: belépés PIN-nel → **Beállítások → Biztonság → „Face ID bekapcsolása ezen az eszközön”**. Eszközönként kell bekapcsolni (iPhone-on Face ID, Macen Touch ID, Windowson Windows Hello, Androidon ujjlenyomat/arc). Ugyanitt látszanak és törölhetők a regisztrált eszközök.
- Ezután a PIN képernyő megnyitásakor az app magától felajánlja a Face ID-t; ha a böngésző ezt nem engedi (pl. Safari zárolás után), a billentyűzet bal alsó sarkában lévő arc ikonnal indítható. A PIN mindig működik tartalékként.
- A passkey nyilvános kulcsa a `webauthn_credentials` táblában van (004-es migráció, automatikusan lefut). A titkos kulcs sosem hagyja el az eszközt.
- Csak **HTTPS**-en vagy `localhost`-on működik (helyi hálózati IP-n, pl. `http://192.168.x.x:5173`, nem).
- **RP ID / origin:** alapból a böngésző címéből számolódik, így a Vercel domainen beállítás nélkül is működik. Éles környezetben érdemes rögzíteni (Vercel → Settings → Environment Variables):
  - `WEBAUTHN_RP_ID=budget-md.vercel.app` – a domain, séma és port nélkül
  - `WEBAUTHN_ORIGIN=https://budget-md.vercel.app` – vesszővel több is megadható (pl. saját domain is)
- A passkey a domainhez kötött: ha domaint váltasz (vagy előnézeti/preview URL-ről nyitod), ott újra be kell kapcsolni a Face ID-t.
