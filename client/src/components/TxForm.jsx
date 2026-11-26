import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, ArrowDown } from 'lucide-react';
import { AmountInput, CategoryPicker, Field, Segmented, WalletPicker } from './ui.jsx';
import { compressImage, toLocalInput } from '../lib/util.js';

const TABS = [
  { value: 'expense', label: 'Kiadás', tone: 'neg' },
  { value: 'income', label: 'Bevétel', tone: 'pos' },
  { value: 'transfer', label: 'Átcsoportosítás', tone: 'xfer' },
];

/**
 * Részletes űrlap – új tétel, szerkesztés és piszkozat kiegészítése is ezt használja.
 * onSubmit(payload, { asDraft })
 * allowTransfer={false}: az Átcsoportosítás fül rejtve (a gyorsrögzítőben); szerkesztésnél marad.
 */
export default function TxForm({ initial = {}, onSubmit, submitLabel = 'Mentés', allowDraft, allowTransfer = true, existingReceiptUrl, busy }) {
  const tabs = allowTransfer ? TABS : TABS.filter((t) => t.value !== 'transfer');
  const [type, setType] = useState(!allowTransfer && initial.type === 'transfer' ? 'expense' : initial.type || 'expense');
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const [walletId, setWalletId] = useState(initial.walletId ?? null);
  const [toWalletId, setToWalletId] = useState(initial.toWalletId ?? null);
  const [name, setName] = useState(initial.name || '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? null);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(initial.occurredAt || new Date()));
  const [note, setNote] = useState(initial.note || '');
  const [receipt, setReceipt] = useState(undefined); // undefined = változatlan, null = törlés, string = új
  const [error, setError] = useState('');
  const camRef = useRef();
  const fileRef = useRef();

  const changeType = (t) => {
    setType(t);
    if (t !== type) setCategoryId(null);
  };

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setReceipt(await compressImage(f)); } catch { setError('A képet nem sikerült beolvasni'); }
  };

  const submit = (asDraft = false) => {
    setError('');
    const amt = Number(amount);
    if (!amt) return setError('Add meg az összeget');
    if (!asDraft) {
      if (!walletId) return setError(type === 'transfer' ? 'Válaszd ki, honnan' : 'Válassz tárcát');
      if (type === 'transfer' && !toWalletId) return setError('Válaszd ki, hová');
    }
    const payload = {
      type, amount: amt, walletId, toWalletId: type === 'transfer' ? toWalletId : null,
      name: name.trim(), categoryId: type === 'transfer' ? null : categoryId,
      occurredAt: new Date(occurredAt).toISOString(), note,
    };
    if (receipt !== undefined) payload.receipt = receipt;
    onSubmit(payload, { asDraft });
  };

  const tone = type === 'income' ? 'pos' : type === 'expense' ? 'neg' : 'xfer';
  const previewSrc = receipt || (receipt === undefined ? existingReceiptUrl : null);

  return (
    <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <Segmented options={tabs} value={type} onChange={changeType} />
      <AmountInput value={amount} onChange={setAmount} tone={tone} />

      {type === 'transfer' ? (
        <>
          <Field group label="Honnan (forrás)"><WalletPicker value={walletId} onChange={setWalletId} exclude={toWalletId} /></Field>
          <div className="xfer-arrow"><ArrowDown size={18} /></div>
          <Field group label="Hová (cél)"><WalletPicker value={toWalletId} onChange={setToWalletId} exclude={walletId} /></Field>
        </>
      ) : (
        <Field group label="Tárca"><WalletPicker value={walletId} onChange={setWalletId} /></Field>
      )}

      <Field label={type === 'transfer' ? 'Megjegyzés / megnevezés' : 'Megnevezés'}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={type === 'transfer' ? 'pl. ATM kp felvétel' : type === 'income' ? 'pl. Korrepetálás' : 'pl. Fagyi'} />
      </Field>

      {type !== 'transfer' && (
        <Field group label="Kategória" hint="Az alkategóriák a főkategória kiválasztása után jelennek meg">
          <CategoryPicker kind={type} value={categoryId} onChange={setCategoryId} />
        </Field>
      )}

      <Field label="Dátum és idő">
        <div className="row gap">
          <input className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <button type="button" className="btn ghost small" onClick={() => setOccurredAt(toLocalInput(new Date()))}>Most</button>
        </div>
      </Field>

      <Field label="Megjegyzés">
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcionális" />
      </Field>

      <Field label="Blokk fotó">
        <div className="receipt-row">
          {previewSrc ? (
            <div className="receipt-thumb">
              <img src={previewSrc} alt="Blokk" />
              <button type="button" className="icon-btn danger" onClick={() => setReceipt(null)} aria-label="Kép törlése"><Trash2 size={16} /></button>
            </div>
          ) : null}
          <button type="button" className="btn ghost small" onClick={() => camRef.current.click()}><Camera size={16} /> Fotó</button>
          <button type="button" className="btn ghost small" onClick={() => fileRef.current.click()}><ImagePlus size={16} /> Feltöltés</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        </div>
      </Field>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions sticky">
        {allowDraft && (
          <button type="button" className="btn warn-ghost" onClick={() => submit(true)} disabled={busy}>Piszkozatként</button>
        )}
        <button type="submit" className={`btn primary grow ${tone}`} disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
