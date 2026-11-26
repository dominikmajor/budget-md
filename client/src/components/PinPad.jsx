import { useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { haptic } from '../lib/util.js';

export default function PinPad({ value, length, onChange, disabled, error, extra }) {
  const press = (d) => {
    if (disabled || value.length >= length) return;
    haptic(8);
    onChange(value + d);
  };
  const back = () => !disabled && onChange(value.slice(0, -1));

  // Fizikai billentyűzet (asztali gép): számjegyek és Backspace
  const latest = useRef({});
  latest.current = { press, back };
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); latest.current.press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); latest.current.back(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="pin">
      <div className={`pin-dots ${error ? 'error shake' : ''}`} aria-label={`${value.length} / ${length} számjegy`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={i < value.length ? 'filled' : ''} />
        ))}
      </div>
      <div className="pin-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="pin-key" onClick={() => press(d)} disabled={disabled}>{d}</button>
        ))}
        <div className="pin-key ghost">{extra}</div>
        <button type="button" className="pin-key" onClick={() => press('0')} disabled={disabled}>0</button>
        <button type="button" className="pin-key ghost" onClick={back} aria-label="Törlés" disabled={disabled}>
          <Delete size={26} />
        </button>
      </div>
    </div>
  );
}
