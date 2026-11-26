import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { childrenMap, isActive, pathOf } from '@budget/shared/categories';
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

/** group: gombcsoportot (választót) tartalmazó mező – div, hogy a címkére kattintás ne „nyomja meg” az első gombot */
export function Field({ label, children, hint, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="field" role={group ? 'group' : undefined}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
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

/**
 * Lépcsőzetes kategóriaválasztó a kategóriafához: felül a főkategóriák, a kiválasztott ág alatt
 * soronként az alkategóriák (korlátlan mélységig). A kiválasztott chipre újra koppintva egy szinttel feljebb lép.
 *  - kind: 'expense' | 'income' | undefined (mindkettő)
 *  - exclude: kizárt id-k (pl. szülőválasztásnál a saját ág)
 *  - noneLabel: ha meg van adva, egy „semmi” chip is megjelenik (value = null)
 */
export function CategoryPicker({ kind, value, onChange, includeSystem = false, exclude, noneLabel }) {
  const { state, categoriesById } = useApp();
  const visible = state.categories.filter((c) =>
    (!kind || c.kind === kind) && (includeSystem || !c.isSystem) && isActive(c, categoriesById));
  // A kizárt kategóriák a helyükön maradnak a fában (csak nem jelennek meg), így a gyerekeik sem „ugranak” feljebb
  const all = childrenMap(visible);
  const kids = new Map([...all].map(([k, list]) => [k, exclude ? list.filter((c) => !exclude.has(c.id)) : list]));
  const path = value != null && categoriesById[value] ? pathOf(value, categoriesById).map((c) => c.id) : [];
  const levels = [{ parent: null, items: kids.get('root') || [] }];
  for (const id of path) {
    const items = kids.get(id);
    if (items?.length) levels.push({ parent: id, items });
  }
  const pick = (c) => onChange(value === c.id ? (c.parentId ?? null) : c.id);
  const suffix = (c) => (c.isSystem && !kind ? (c.kind === 'income' ? ' +' : ' −') : '');
  return (
    <div className="cat-picker">
      {levels.map((lvl, i) => (
        <div key={lvl.parent ?? 'root'} className={`picker ${i ? 'sub' : ''}`}>
          {i === 0 && noneLabel && <Chip active={value == null} onClick={() => onChange(null)}>{noneLabel}</Chip>}
          {i > 0 && <span className="sub-label">{categoriesById[lvl.parent]?.name} <ChevronRight size={12} /></span>}
          {lvl.items.map((c) => (
            <Chip key={c.id} active={path.includes(c.id)} color={c.color} onClick={() => pick(c)}
              className={path.includes(c.id) && c.id !== value ? 'ancestor' : ''}>
              <span>{c.icon}</span> {c.name}{suffix(c)}
              {kids.get(c.id)?.length ? <ChevronRight size={13} className="chev" /> : null}
            </Chip>
          ))}
        </div>
      ))}
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
