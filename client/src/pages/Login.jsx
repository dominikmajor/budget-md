import { useEffect, useState } from 'react';
import PinPad from '../components/PinPad.jsx';
import { BrandMark, Wordmark } from '../components/Brand.jsx';
import { api } from '../api.js';
import { haptic } from '../lib/util.js';

export default function Login({ status, onSuccess, onStatus }) {
  const setup = !status.hasPin;
  const [length, setLength] = useState(status.pinLength || 4);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState(null); // setup: első beírás
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const [lockedUntil, setLockedUntil] = useState(status.lockedUntil ? new Date(status.lockedUntil) : null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil.getTime()) { setLockedUntil(null); setMessage(''); }
    }, 250);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const fail = (msg) => {
    setError(true);
    setMessage(msg);
    haptic([40, 40, 40]);
    setTimeout(() => { setPin(''); setError(false); }, 450);
  };

  useEffect(() => {
    if (pin.length !== length) return;
    (async () => {
      if (setup) {
        if (!first) { setFirst(pin); setPin(''); setMessage('Írd be még egyszer a megerősítéshez'); return; }
        if (first !== pin) { setFirst(null); fail('Nem egyezik – kezdjük újra'); return; }
        try { await api.post('/auth/setup', { pin }); onSuccess(true); } catch (e) { fail(e.message); onStatus(); }
        return;
      }
      try {
        await api.post('/auth/login', { pin });
        onSuccess(false);
      } catch (e) {
        if (e.body?.lockedUntil) {
          setLockedUntil(new Date(e.body.lockedUntil));
          fail('Túl sok hibás próbálkozás');
        } else {
          fail(e.body?.attemptsLeft != null ? `Hibás PIN · még ${e.body.attemptsLeft} próbálkozás` : e.message);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const wait = lockedUntil ? Math.max(0, Math.ceil((lockedUntil.getTime() - now) / 1000)) : 0;

  return (
    <div className="login">
      <div className="login-head">
        <div className="login-brand"><BrandMark /><Wordmark /></div>
        <h1>{setup ? (first ? 'PIN megerősítése' : 'Hozd létre a PIN-kódod') : 'Üdv újra!'}</h1>
        <p className={`login-msg ${error ? 'err' : ''}`}>
          {wait > 0 ? `Várj ${wait} másodpercet…` : message || (setup ? 'Ezzel védjük a pénzügyeidet' : 'Add meg a PIN-kódod')}
        </p>
        {setup && !first && (
          <div className="seg small">
            {[4, 6].map((n) => (
              <button key={n} className={length === n ? 'on' : ''} onClick={() => { setLength(n); setPin(''); }}>{n} jegyű</button>
            ))}
          </div>
        )}
      </div>
      <PinPad value={pin} length={length} onChange={setPin} disabled={wait > 0} error={error} />
    </div>
  );
}
