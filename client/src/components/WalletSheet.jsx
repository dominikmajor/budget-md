import { useState } from 'react';
import { Archive, ArchiveRestore, Scale } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { AmountInput, Field, Segmented } from './ui.jsx';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { formatHUF, WALLET_KIND, isGoalKind, isLiquidKind } from '../lib/util.js';
import { DEFAULT_WALLET_ICON } from '@budget/shared/wallets';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#ef4444', '#84cc16', '#f97316', '#64748b'];
const ICONS = ['🏦', '💳', '👛', '🗂️', '✉️', '🔐', '🏖️', '🛡️', '💻', '🎓', '🚗', '🎁', '🏠', '📱', '✈️', '💰'];

/** Tárca, boríték vagy széf létrehozása / szerkesztése. */
export default function WalletSheet({ onClose, id, kind: initialKind = 'account' }) {
  const { walletsById, mutate, openSheet } = useApp();
  const existing = id ? walletsById[id] : null;
  const [kind, setKind] = useState(existing?.kind || initialKind);
  const [name, setName] = useState(existing?.name || '');
  const [icon, setIcon] = useState(existing?.icon || DEFAULT_WALLET_ICON[initialKind] || '🏦');
  const [color, setColor] = useState(existing?.color || COLORS[4]);
  const [initialBalance, setInitialBalance] = useState(existing ? String(existing.initialBalance || '') : '');
  const [targetAmount, setTargetAmount] = useState(existing?.targetAmount ? String(existing.targetAmount) : '');
  const [targetDate, setTargetDate] = useState(existing?.targetDate || '');
  const [keywords, setKeywords] = useState(existing?.keywords?.join(', ') || '');
  const [featured, setFeatured] = useState(existing?.featured ?? isGoalKind(kind));
  const [busy, setBusy] = useState(false);

  const isGoal = isGoalKind(kind); // boríték vagy széf: célösszeg, kiemelés
  const isVault = kind === 'vault';
  const noun = isVault ? 'széf' : kind === 'envelope' ? 'boríték' : 'tárca';

  const save = async () => {
    setBusy(true);
    const body = {
      name, kind, icon, color, keywords,
      targetAmount: isGoal ? Number(targetAmount) || null : null,
      targetDate: isGoal ? targetDate || null : null,
      featured: isGoal ? featured : false,
    };
    try {
      if (existing) await mutate(() => api.put(`/wallets/${id}`, body), 'Mentve');
      else await mutate(() => api.post('/wallets', { ...body, initialBalance: Number(initialBalance) || 0 }), `${noun[0].toUpperCase()}${noun.slice(1)} létrehozva`);
      onClose();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const toggleArchive = async () => {
    await mutate(() => api.put(`/wallets/${id}`, { archived: !existing.archived }), existing.archived ? 'Visszaállítva' : 'Archiválva');
    onClose();
  };

  return (
    <Sheet title={existing ? `${existing.name} szerkesztése` : `Új ${noun}`} onClose={onClose} tall>
      <div className="form">
        {!existing && !isGoal && (
          <Segmented small value={kind} onChange={setKind}
            options={[{ value: 'account', label: 'Bankszámla' }, { value: 'cash', label: 'Készpénz' }, { value: 'reserve', label: 'Tartalék' }]} />
        )}
        <Field label="Név"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={isVault ? 'pl. Utazás' : isGoal ? 'pl. Új laptop' : 'pl. Erste'} autoFocus={!existing} /></Field>
        <Field label="Ikon">
          <div className="icon-grid">{ICONS.map((i) => <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)}>{i}</button>)}</div>
        </Field>
        <Field label="Szín">
          <div className="color-grid">{COLORS.map((c) => <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        </Field>
        {!existing && <Field label="Kezdőegyenleg"><AmountInput value={initialBalance} onChange={setInitialBalance} /></Field>}
        {isGoal && (
          <>
            <Field label="Célösszeg (opcionális)" hint={isVault ? 'Üresen hagyva cél nélküli széf' : 'Üresen hagyva szabad gyűjtőboríték'}><AmountInput value={targetAmount} onChange={setTargetAmount} /></Field>
            <Field label="Céldátum (opcionális)"><input className="input" type="date" value={targetDate || ''} onChange={(e) => setTargetDate(e.target.value)} /></Field>
            <label className="switch-row">
              <span>Kiemelt a Főoldalon</span>
              <input type="checkbox" className="switch" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            </label>
          </>
        )}
        <Field label="Gyorsbeviteli kulcsszavak" hint={isVault ? 'Vesszővel elválasztva. Gyorsbevitelben „széf <név>” is működik, pl.: 10000 revo > széf utazás' : 'Vesszővel elválasztva, pl.: otp, bank'}>
          <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
        {existing && (
          <div className="row gap wrap">
            <button type="button" className="btn ghost small" onClick={() => openSheet('reconcile', { id })}><Scale size={16} /> Egyenleg igazítása</button>
            <button type="button" className="btn ghost small" onClick={toggleArchive}>
              {existing.archived ? <><ArchiveRestore size={16} /> Visszaállítás</> : <><Archive size={16} /> Archiválás</>}
            </button>
          </div>
        )}
        <p className="muted small">{WALLET_KIND[kind]}{isLiquidKind(kind) ? ' · beleszámít az azonnal elkölthető egyenlegbe' : ' · félretett pénz, nem számít a likvid egyenlegbe'}</p>
        <div className="form-actions sticky">
          <button className="btn primary grow" disabled={!name.trim() || busy} onClick={save}>Mentés</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Készpénz leltár: tényleges összeg megadása, a különbözet korrekciós tételként rögzül. */
export function ReconcileSheet({ onClose, id }) {
  const { walletsById, mutate } = useApp();
  const w = walletsById[id];
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  if (!w) return null;
  const diff = actual === '' ? null : Number(actual) - w.balance;

  const save = async () => {
    setBusy(true);
    try {
      const r = await mutate(() => api.post(`/wallets/${id}/reconcile`, { actual: Number(actual) }));
      onClose();
      return r;
    } catch { /* toast */ } finally { setBusy(false); }
  };

  return (
    <Sheet title={`Egyenleg igazítása – ${w.name}`} onClose={onClose}>
      <p className="muted">Nyilvántartott egyenleg: <b>{formatHUF(w.balance)}</b>. Írd be, mennyi van ténylegesen nálad.</p>
      <AmountInput value={actual} onChange={setActual} autoFocus />
      {diff !== null && (
        <div className={`callout ${diff === 0 ? 'ok' : 'warn'}`}>
          {diff === 0 ? 'Pontosan egyezik, nincs teendő.' : `Egy ${formatHUF(diff, { sign: true })}-os „Egyenleg korrekció” tétel kerül rögzítésre.`}
        </div>
      )}
      <div className="form-actions">
        <button className="btn primary grow" disabled={actual === '' || diff === 0 || busy} onClick={save}>Igazítás</button>
      </div>
    </Sheet>
  );
}
