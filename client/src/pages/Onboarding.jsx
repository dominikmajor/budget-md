import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { AmountInput } from '../components/ui.jsx';
import { formatHUF } from '../lib/util.js';

/** Első indítás után: kezdőegyenlegek megadása az alapértelmezett tárcákhoz. */
export default function Onboarding() {
  const { state, refresh } = useApp();
  const navigate = useNavigate();
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) setValues(Object.fromEntries(state.wallets.map((w) => [w.id, w.initialBalance ? String(w.initialBalance) : ''])));
  }, [state]);

  if (!state) return <div className="splash"><div className="splash-logo" /></div>;
  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);

  const save = async () => {
    setBusy(true);
    for (const w of state.wallets) {
      const v = Number(values[w.id]) || 0;
      if (v !== w.initialBalance) await api.put(`/wallets/${w.id}`, { initialBalance: v });
    }
    await refresh();
    navigate('/', { replace: true });
  };

  return (
    <div className="onboarding">
      <div className="login-glow" />
      <h1>Mennyi pénzed van most?</h1>
      <p className="muted">Add meg a kezdőegyenlegeket. Később bármikor igazíthatod őket a Tárcák oldalon.</p>
      <div className="stack-sm">
        {state.wallets.filter((w) => !w.archived).map((w) => (
          <div key={w.id} className="onb-row" style={{ '--c': w.color }}>
            <span className="pocket-icon">{w.icon}</span>
            <span className="grow"><b>{w.name}</b></span>
            <AmountInput value={values[w.id] || ''} onChange={(v) => setValues((s) => ({ ...s, [w.id]: v }))} />
          </div>
        ))}
      </div>
      <div className="onb-total">Teljes vagyon: <b>{formatHUF(total)}</b></div>
      <button className="btn primary full" onClick={save} disabled={busy}>Kezdjük!</button>
      <button className="link-btn center" onClick={() => navigate('/', { replace: true })}>Kihagyom</button>
    </div>
  );
}
