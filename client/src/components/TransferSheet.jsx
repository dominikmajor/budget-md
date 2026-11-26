import { useMemo, useState } from 'react';
import { ArrowDown, FolderInput, Banknote, PiggyBank, Lock } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { AmountInput, Field, WalletPicker } from './ui.jsx';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { formatHUF, mainWallet, vaultSource } from '../lib/util.js';

/** Átcsoportosítási panel gyors-forgatókönyvekkel. */
export default function TransferSheet({ onClose, from, to, amount: initialAmount, note: initialNote }) {
  const { state, mutate } = useApp();
  const [walletId, setWalletId] = useState(from ?? null);
  const [toWalletId, setToWalletId] = useState(to ?? null);
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [note, setNote] = useState(initialNote || '');
  const [busy, setBusy] = useState(false);

  const find = (kind) => state.wallets.filter((w) => w.kind === kind && !w.archived);
  const reserve = find('reserve')[0];
  const otp = mainWallet(state.wallets);
  const cash = find('cash')[0];
  const envelopes = find('envelope');
  const vaults = find('vault');
  const revo = vaultSource(state.wallets);
  const fromWallet = state.wallets.find((w) => w.id === walletId);

  const scenarios = useMemo(() => {
    const list = [];
    if (reserve) {
      const missing = state.settings.reserveTarget - reserve.balance;
      list.push({
        icon: <FolderInput size={18} />, label: `Irattartó feltöltése ${formatHUF(state.settings.reserveTarget)}-ra`,
        sub: missing > 0 ? `${formatHUF(missing)} hiányzik` : 'Célszint teljesítve',
        disabled: missing <= 0,
        apply: () => { setWalletId(otp?.id ?? null); setToWalletId(reserve.id); setAmount(String(missing)); setNote('Irattartó pótlása'); },
      });
    }
    if (otp && cash) {
      list.push({
        icon: <Banknote size={18} />, label: 'Készpénz felvétel', sub: `${otp.name} → ${cash.name}`,
        apply: () => { setWalletId(otp.id); setToWalletId(cash.id); setNote('ATM kp felvétel'); },
      });
    }
    if (envelopes.length) {
      list.push({
        icon: <PiggyBank size={18} />, label: 'Félretétel borítékba', sub: envelopes.map((e) => e.name).join(', '),
        apply: () => { setWalletId(otp?.id ?? null); setToWalletId(envelopes[0].id); setNote('Félretétel'); },
      });
    }
    if (vaults.length) {
      list.push({
        icon: <Lock size={18} />, label: 'Félretétel széfbe', sub: vaults.map((v) => v.name).join(', '),
        apply: () => { setWalletId(revo?.id ?? null); setToWalletId(vaults[0].id); setNote('Széfbe'); },
      });
    }
    return list;
  }, [state, reserve, otp, cash, envelopes, vaults, revo]);

  const submit = async () => {
    setBusy(true);
    try {
      await mutate(() => api.post('/transactions', { type: 'transfer', amount: Number(amount), walletId, toWalletId, name: note }), 'Átcsoportosítva ⇄');
      onClose();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const valid = Number(amount) > 0 && walletId && toWalletId && walletId !== toWalletId;

  return (
    <Sheet title="Pénz mozgatása" onClose={onClose} tall>
      <div className="scenarios">
        {scenarios.map((s) => (
          <button key={s.label} className="scenario" onClick={s.apply} disabled={s.disabled}>
            <span className="scenario-icon">{s.icon}</span>
            <span><b>{s.label}</b><small>{s.sub}</small></span>
          </button>
        ))}
      </div>
      <AmountInput value={amount} onChange={setAmount} tone="xfer" />
      <Field label="Honnan" hint={fromWallet ? `Elérhető: ${formatHUF(fromWallet.balance)}` : undefined}>
        <WalletPicker value={walletId} onChange={setWalletId} exclude={toWalletId} />
      </Field>
      <div className="xfer-arrow"><ArrowDown size={18} /></div>
      <Field group label="Hová"><WalletPicker value={toWalletId} onChange={setToWalletId} exclude={walletId} /></Field>
      <Field label="Megjegyzés">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Heti félretétel nyaralásra" />
      </Field>
      <div className="form-actions sticky">
        <button className="btn primary grow xfer" disabled={!valid || busy} onClick={submit}>Átcsoportosítás</button>
      </div>
    </Sheet>
  );
}
