import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useApp } from '../store.jsx';
import { formatHUF, TYPE_META } from '../lib/util.js';

export function Money({ value, type, sign, className = '', hideable = true }) {
  const { hidden } = useApp();
  let text;
  if (type === 'transfer') text = `⇄ ${formatHUF(value, { hidden: hidden && hideable })}`;
  else if (type) text = formatHUF(type === 'expense' ? -value : value, { sign: true, hidden: hidden && hideable });
  else text = formatHUF(value, { sign, hidden: hidden && hideable });
  const cls = type ? TYPE_META[type].cls : '';
  return <span className={`money ${cls} ${className}`}>{text}</span>;
}

export function Progress({ value, max, tone, thin }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${tone || ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented({ options, value, onChange, small }) {
  return (
    <div className={`seg ${small ? 'small' : ''}`}>
      {options.map((o) => (
        <button type="button" key={o.value} className={value === o.value ? `on ${o.tone || ''}` : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, color, className = '' }) {
  return (
    <button type="button" className={`chip ${active ? 'on' : ''} ${className}`} onClick={onClick}
      style={active && color ? { '--chip': color } : undefined}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function AmountInput({ value, onChange, autoFocus, tone }) {
  const display = value ? Number(value).toLocaleString('hu-HU') : '';
  return (
    <div className={`amount-input ${tone || ''}`}>
      <input
        inputMode="numeric"
        placeholder="0"
        autoFocus={autoFocus}
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
      />
      <span>Ft</span>
    </div>
  );
}

export function WalletPicker({ value, onChange, exclude, includeEnvelopes = true, allowNone }) {
  const { state } = useApp();
  const list = state.wallets.filter((w) => !w.archived && w.id !== exclude && (includeEnvelopes || w.kind !== 'envelope'));
  return (
    <div className="picker">
      {allowNone && <Chip active={!value} onClick={() => onChange(null)}>Nincs</Chip>}
      {list.map((w) => (
        <Chip key={w.id} active={value === w.id} color={w.color} onClick={() => onChange(value === w.id && allowNone ? null : w.id)}>
          <span>{w.icon}</span> {w.name}
        </Chip>
      ))}
    </div>
  );
}

export function CategoryPicker({ kind, value, onChange }) {
  const { state } = useApp();
  const list = state.categories.filter((c) => c.kind === kind && !c.archived && !c.isSystem);
  return (
    <div className="picker">
      {list.map((c) => (
        <Chip key={c.id} active={value === c.id} color={c.color} onClick={() => onChange(value === c.id ? null : c.id)}>
          <span>{c.icon}</span> {c.name}
        </Chip>
      ))}
    </div>
  );
}

export function ProjectPicker({ value, onChange }) {
  const { state } = useApp();
  const list = state.projects.filter((p) => !p.archived);
  return (
    <div className="picker">
      {list.map((p) => (
        <Chip key={p.id} active={value === p.id} color={p.color} onClick={() => onChange(value === p.id ? null : p.id)}>
          {p.name}
        </Chip>
      ))}
    </div>
  );
}

export function TagInput({ value = [], onChange }) {
  const { state } = useApp();
  const [text, setText] = useState('');
  const add = (t) => {
    const n = t.replace(/^#/, '').trim().toLowerCase();
    if (n && !value.includes(n)) onChange([...value, n]);
    setText('');
  };
  const suggestions = state.tags.map((t) => t.name).filter((t) => !value.includes(t) && (!text || t.includes(text.replace(/^#/, '').toLowerCase()))).slice(0, 8);
  return (
    <div className="tags">
      <div className="picker">
        {value.map((t) => (
          <button type="button" key={t} className="chip on tag" onClick={() => onChange(value.filter((x) => x !== t))}>
            #{t} <X size={14} />
          </button>
        ))}
        <input
          className="tag-input"
          placeholder="#új címke"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); add(text); }
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="picker muted">
          {suggestions.map((t) => (
            <button type="button" key={t} className="chip ghost" onClick={() => add(t)}><Plus size={12} /> #{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Toast() {
  const { toast } = useApp();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!!toast); }, [toast]);
  if (!toast) return null;
  return <div className={`toast ${toast.kind} ${show ? 'show' : ''}`} key={toast.id}>{toast.message}</div>;
}

export function Card({ children, className = '', onClick, style }) {
  return <div className={`card ${className} ${onClick ? 'tappable' : ''}`} onClick={onClick} style={style}>{children}</div>;
}

export function SectionTitle({ children, action }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}
