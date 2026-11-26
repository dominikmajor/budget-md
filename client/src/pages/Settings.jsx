import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Pencil, Archive, ArchiveRestore, Plus, Trash2, Download, Upload, KeyRound, ScanFace, ChevronRight, CornerDownRight } from 'lucide-react';
import { childrenMap, descendantIds, flattenTree } from '@budget/shared/categories';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import Sheet from '../components/Sheet.jsx';
import PinPad from '../components/PinPad.jsx';
import { AmountInput, Card, Field, Segmented, WalletPicker, CategoryPicker } from '../components/ui.jsx';
import { formatHUF, downloadUrl } from '../lib/util.js';
import { biometricLabel, biometricRegister, isCancel, platformAuthAvailable } from '../lib/biometric.js';

const EMOJIS = ['🏷️', '💻', '🎨', '📷', '🧾', '🍝', '🍦', '🧴', '🎓', '🚌', '🎉', '📦', '💼', '🎁', '✨', '☕', '🍺', '🛒', '👕', '💊', '🏋️', '📚', '🎮', '🏠', '📱', '💡', '🐶', '✂️', '🚕'];
const COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#eab308', '#64748b', '#22c55e', '#f43f5e', '#0ea5e9', '#84cc16', '#a855f7'];

export default function Settings() {
  const [open, setOpen] = useState(null);
  const sections = [
    ['categories', '🏷️', 'Kategóriák kezelése', 'Kategóriák és alkategóriák tetszőleges mélységben'],
    ['templates', '⚡', 'Gyorsrögzítő sablonok', '1 kattintásos tételek a + gombnál'],
    ['reserve', '🗂️', 'Irattartó célszint', 'Figyelmeztetés a Főoldalon, ha ez alá csökken'],
    ['security', '🔐', 'Biztonság', 'PIN-kód, Face ID, automatikus zárolás'],
    ['data', '💾', 'Adatok exportálása és mentés', 'CSV, JSON mentés és visszatöltés'],
  ];
  return (
    <div className="stack">
      <Card className="list-card settings-list">
        {sections.map(([id, icon, title, sub]) => (
          <button key={id} className="settings-row" onClick={() => setOpen(id)}>
            <span className="settings-icon">{icon}</span>
            <span className="grow"><b>{title}</b><small>{sub}</small></span>
            <ChevronRight size={18} className="muted" />
          </button>
        ))}
      </Card>
      <p className="muted small center">budget.md · egyfelhasználós, PIN-védett · adataid a saját adatbázisodban</p>
      {open === 'categories' && <CategoriesSheet onClose={() => setOpen(null)} />}
      {open === 'templates' && <TemplatesSheet onClose={() => setOpen(null)} />}
      {open === 'reserve' && <ReserveSheet onClose={() => setOpen(null)} />}
      {open === 'security' && <SecuritySheet onClose={() => setOpen(null)} />}
      {open === 'data' && <DataSheet onClose={() => setOpen(null)} />}
    </div>
  );
}

function useReorder(path) {
  const { mutate } = useApp();
  return (list, index, dir) => {
    const ids = list.map((x) => x.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    mutate(() => api.post(`/${path}/reorder`, { ids }));
  };
}

function RowActions({ onUp, onDown, onAdd, onEdit, onArchive, archived, onDelete }) {
  return (
    <div className="row-actions">
      {onUp !== undefined && <button className="icon-btn" onClick={onUp || undefined} disabled={!onUp} aria-label="Fel"><ChevronUp size={16} /></button>}
      {onDown !== undefined && <button className="icon-btn" onClick={onDown || undefined} disabled={!onDown} aria-label="Le"><ChevronDown size={16} /></button>}
      {onAdd && <button className="icon-btn" onClick={onAdd} aria-label="Alkategória hozzáadása" title="Alkategória hozzáadása"><Plus size={16} /></button>}
      {onEdit && <button className="icon-btn" onClick={onEdit} aria-label="Szerkesztés"><Pencil size={15} /></button>}
      {onArchive && <button className="icon-btn" onClick={onArchive} aria-label={archived ? 'Visszaállítás' : 'Archiválás'}>{archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>}
      {onDelete && <button className="icon-btn danger-text" onClick={onDelete} aria-label="Törlés"><Trash2 size={15} /></button>}
    </div>
  );
}

// ── Kategóriafa
function CategoriesSheet({ onClose }) {
  const { state } = useApp();
  const [kind, setKind] = useState('expense');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const reorder = useReorder('categories');
  const own = state.categories.filter((c) => c.kind === kind && !c.isSystem);
  const rows = flattenTree(own);
  const kids = childrenMap(own);
  const siblingsOf = (c) => kids.get(c.parentId != null && own.some((x) => x.id === c.parentId) ? c.parentId : 'root') || [];
  return (
    <Sheet title="Kategóriák" onClose={onClose} tall>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Kiadás' }, { value: 'income', label: 'Bevétel' }]} />
      <p className="muted small">Bármelyik kategória alá tehetsz alkategóriát, azok alá újabbakat, tetszőleges mélységig. A statisztika a főkategóriákba összesít, onnan lefúrhatsz.</p>
      <div className="edit-list tree">
        {rows.map(({ cat: c, depth }) => {
          const sib = siblingsOf(c);
          const i = sib.findIndex((x) => x.id === c.id);
          return (
            <div key={c.id} className={`edit-row ${c.archived ? 'archived' : ''}`} style={{ '--depth': depth }}>
              {depth > 0 && <CornerDownRight size={14} className="muted tree-elbow" />}
              <span className="rank-icon" style={{ '--c': c.color }}>{c.icon}</span>
              <span className="grow tree-name">{c.name}{c.archived ? <small className="muted"> · archivált</small> : null}{c.txCount ? <small className="muted"> · {c.txCount} tétel</small> : null}</span>
              <RowActions
                onUp={i > 0 ? () => reorder(sib, i, -1) : null}
                onDown={i < sib.length - 1 ? () => reorder(sib, i, 1) : null}
                onAdd={() => setEditing({ kind, parentId: c.id, icon: c.icon, color: c.color })}
                onEdit={() => setEditing(c)} />
            </div>
          );
        })}
        {!rows.length && <p className="muted">Még nincs kategória.</p>}
      </div>
      <button className="btn ghost full" onClick={() => setEditing({ kind, parentId: null })}><Plus size={16} /> Új főkategória</button>
      {editing && <CategoryEditor item={editing} onClose={() => setEditing(null)}
        onDelete={() => { setDeleting(editing); setEditing(null); }} />}
      {deleting && <CategoryDelete item={deleting} onClose={() => setDeleting(null)} />}
    </Sheet>
  );
}

function CategoryEditor({ item, onClose, onDelete }) {
  const { state, mutate, categoriesById } = useApp();
  const [name, setName] = useState(item.name || '');
  const [parentId, setParentId] = useState(item.parentId ?? null);
  const [icon, setIcon] = useState(item.icon || EMOJIS[0]);
  const [color, setColor] = useState(item.color || COLORS[0]);
  const [keywords, setKeywords] = useState((item.keywords || []).join(', '));
  // A saját ága alá nem mozgatható
  const exclude = item.id ? descendantIds(item.id, state.categories) : undefined;
  const save = async () => {
    const body = { name, icon, color, keywords, parentId, kind: item.kind };
    await mutate(() => (item.id ? api.put(`/categories/${item.id}`, body) : api.post('/categories', body)), 'Mentve');
    onClose();
  };
  const parent = categoriesById[item.parentId];
  const title = item.id ? 'Kategória szerkesztése' : parent ? `Új alkategória: ${parent.name} alá` : 'Új főkategória';
  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="form">
        <Field label="Név"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field group label="Hová tartozik" hint="Válaszd a Főkategóriát, vagy bármelyik kategóriát (alkategóriát is), ami alá kerüljön">
          <CategoryPicker kind={item.kind} value={parentId} onChange={setParentId} exclude={exclude} noneLabel="⬆️ Főkategória" />
        </Field>
        <Field label="Ikon"><div className="icon-grid">{EMOJIS.map((e) => <button type="button" key={e} className={icon === e ? 'on' : ''} onClick={() => setIcon(e)}>{e}</button>)}</div></Field>
        <Field label="Szín"><div className="color-grid">{COLORS.map((c) => <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div></Field>
        <Field label="Gyorsbeviteli kulcsszavak" hint="Pl. „lidl, spar” – ezekre a szavakra automatikusan ez a kategória lesz kitöltve">
          <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
        <button className="btn primary full" disabled={!name.trim()} onClick={save}>Mentés</button>
        {item.id && (
          <div className="row gap">
            <button className="btn ghost grow" onClick={async () => {
              await mutate(() => api.put(`/categories/${item.id}`, { archived: !item.archived }), item.archived ? 'Visszaállítva' : 'Archiválva – az alkategóriáival együtt rejtve marad a választókban');
              onClose();
            }}>{item.archived ? <><ArchiveRestore size={16} /> Visszaállítás</> : <><Archive size={16} /> Archiválás</>}</button>
            <button className="btn ghost danger-text grow" onClick={onDelete}><Trash2 size={16} /> Törlés</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Törlés: az alkategóriák egy szinttel feljebb lépnek; a tételeket át kell tenni máshová (vagy kategória nélkül hagyni). */
function CategoryDelete({ item, onClose }) {
  const { state, mutate, categoriesById, categoryLabel } = useApp();
  const [target, setTarget] = useState(item.txCount ? (item.parentId ?? undefined) : 'none');
  const [busy, setBusy] = useState(false);
  const children = state.categories.filter((c) => c.parentId === item.id);
  const parent = categoriesById[item.parentId];
  const remove = async () => {
    setBusy(true);
    try {
      await mutate(() => api.del(`/categories/${item.id}?moveTo=${target}`), 'Kategória törölve');
      onClose();
    } catch { /* toast */ } finally { setBusy(false); }
  };
  return (
    <Sheet title={`„${item.name}” törlése`} onClose={onClose} tall>
      <div className="form">
        {children.length > 0 && (
          <div className="callout">
            <span>
              {children.length} alkategóriája ({children.map((c) => c.name).join(', ')}) megmarad, és{' '}
              {parent ? <>a(z) <b>{categoryLabel(parent.id)}</b> alá kerül.</> : 'főkategória lesz.'}
            </span>
          </div>
        )}
        {item.txCount > 0 ? (
          <Field group label={`${item.txCount} tétel tartozik ide – hová kerüljenek?`}>
            <CategoryPicker kind={item.kind} value={target === 'none' ? null : (target ?? -1)}
              onChange={(id) => setTarget(id == null ? 'none' : id)} exclude={new Set([item.id])} noneLabel="Kategória nélkül" />
          </Field>
        ) : <p className="muted">Ehhez a kategóriához nem tartozik tétel.</p>}
        <div className="row gap">
          <button className="btn ghost" onClick={onClose}>Mégse</button>
          <button className="btn danger grow" disabled={busy || target === undefined} onClick={remove}><Trash2 size={16} /> Törlés</button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Sablonok
function TemplatesSheet({ onClose }) {
  const { state, walletsById, mutate } = useApp();
  const [editing, setEditing] = useState(null);
  const reorder = useReorder('templates');
  const list = state.templates;
  return (
    <Sheet title="Gyorsrögzítő sablonok" onClose={onClose} tall>
      <div className="edit-list">
        {list.map((t, i) => (
          <div key={t.id} className="edit-row">
            <span className="rank-icon">{t.emoji}</span>
            <span className="grow">{t.name}<small className="muted"> · {formatHUF(t.amount)}{walletsById[t.walletId] ? ` · ${walletsById[t.walletId].name}` : ''}</small></span>
            <RowActions onUp={() => reorder(list, i, -1)} onDown={() => reorder(list, i, 1)} onEdit={() => setEditing(t)}
              onDelete={() => mutate(() => api.del(`/templates/${t.id}`), 'Sablon törölve')} />
          </div>
        ))}
      </div>
      <button className="btn ghost full" onClick={() => setEditing({ type: 'expense' })}><Plus size={16} /> Új sablon</button>
      {editing && <TemplateEditor item={editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

function TemplateEditor({ item, onClose }) {
  const { mutate } = useApp();
  const [name, setName] = useState(item.name || '');
  const [emoji, setEmoji] = useState(item.emoji || '⚡');
  const [type, setType] = useState(item.type || 'expense');
  const [amount, setAmount] = useState(item.amount ? String(item.amount) : '');
  const [walletId, setWalletId] = useState(item.walletId ?? null);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? null);
  const save = async () => {
    const body = { name, emoji, type, amount: Number(amount), walletId, categoryId };
    await mutate(() => (item.id ? api.put(`/templates/${item.id}`, body) : api.post('/templates', body)), 'Sablon mentve');
    onClose();
  };
  return (
    <Sheet title={item.id ? 'Sablon szerkesztése' : 'Új sablon'} onClose={onClose} tall>
      <div className="form">
        <Segmented value={type} onChange={(t) => { setType(t); setCategoryId(null); }} options={[{ value: 'expense', label: 'Kiadás', tone: 'neg' }, { value: 'income', label: 'Bevétel', tone: 'pos' }]} />
        <Field label="Név"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="pl. Kávé" /></Field>
        <Field label="Ikon"><div className="icon-grid">{['☕', '🍦', '🚌', '🍕', '🥐', '🍺', '🛒', '🧴', '🎬', '💼', '⚡', '🚕'].map((e) => <button type="button" key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>)}</div></Field>
        <Field label="Összeg"><AmountInput value={amount} onChange={setAmount} /></Field>
        <Field group label="Alapértelmezett tárca" hint="Tárca nélkül a sablon piszkozatként ment"><WalletPicker value={walletId} onChange={setWalletId} allowNone /></Field>
        <Field group label="Kategória"><CategoryPicker kind={type} value={categoryId} onChange={setCategoryId} /></Field>
        <button className="btn primary full" disabled={!name.trim() || !Number(amount)} onClick={save}>Mentés</button>
      </div>
    </Sheet>
  );
}

// ── Irattartó célszint
function ReserveSheet({ onClose }) {
  const { state, mutate } = useApp();
  const [reserveTarget, setReserveTarget] = useState(String(state.settings.reserveTarget));
  const save = async () => {
    await mutate(() => api.put('/settings', { reserveTarget: Number(reserveTarget) }), 'Beállítások mentve');
    onClose();
  };
  return (
    <Sheet title="Irattartó célszint" onClose={onClose}>
      <div className="form">
        <Field label="Irattartó minimum célösszeg" hint="Ez alatt figyelmeztetés jelenik meg a Főoldalon"><AmountInput value={reserveTarget} onChange={setReserveTarget} /></Field>
        <button className="btn primary full" onClick={save}>Mentés</button>
      </div>
    </Sheet>
  );
}

// ── Biztonság
function SecuritySheet({ onClose }) {
  const { state, mutate, notify } = useApp();
  const [step, setStep] = useState(null); // null | 'old' | 'new' | 'confirm'
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState('');
  const [len, setLen] = useState(state.settings.pinLength);
  const [err, setErr] = useState(false);

  const onPin = async (v) => {
    setPin(v);
    const target = step === 'old' ? state.settings.pinLength : len;
    if (v.length !== target) return;
    if (step === 'old') { setOldPin(v); setPin(''); setStep('new'); return; }
    if (step === 'new') { setNewPin(v); setPin(''); setStep('confirm'); return; }
    if (v !== newPin) { setErr(true); setTimeout(() => { setErr(false); setPin(''); setStep('new'); }, 450); return; }
    try {
      await api.post('/settings/pin', { oldPin, newPin: v });
      notify('PIN-kód módosítva');
      setStep(null); setPin('');
    } catch (e) {
      notify(e.message, 'error');
      setStep('old'); setPin('');
    }
  };

  const options = [[0, 'Azonnal'], [1, '1 perc'], [2, '2 perc'], [5, '5 perc'], [15, '15 perc']];

  return (
    <Sheet title="Biztonság" onClose={onClose} tall>
      {step ? (
        <div className="stack">
          <p className="center lead">{step === 'old' ? 'Add meg a jelenlegi PIN-t' : step === 'new' ? 'Add meg az új PIN-t' : 'Ismételd meg az új PIN-t'}</p>
          {step === 'new' && (
            <Segmented small value={len} onChange={(l) => { setLen(l); setPin(''); }} options={[{ value: 4, label: '4 jegyű' }, { value: 6, label: '6 jegyű' }]} />
          )}
          <PinPad value={pin} length={step === 'old' ? state.settings.pinLength : len} onChange={onPin} error={err} />
          <button className="link-btn center" onClick={() => { setStep(null); setPin(''); }}>Mégse</button>
        </div>
      ) : (
        <div className="form">
          <button className="btn ghost full" onClick={() => setStep('old')}><KeyRound size={16} /> PIN-kód módosítása</button>
          <BiometricSettings />
          <Field label="Automatikus zárolás" hint="Ennyi inaktivitás vagy háttérben töltött idő után újra PIN-t kér">
            <div className="picker">
              {options.map(([v, l]) => (
                <button key={v} className={`chip ${state.settings.autolockMinutes === v ? 'on' : ''}`}
                  onClick={() => mutate(() => api.put('/settings', { autolockMinutes: v }), `Automatikus zárolás: ${l}`)}>{l}</button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Sheet>
  );
}

/** Face ID / Touch ID / Windows Hello: eszközönként kapcsolható be, a PIN mindig tartalék marad. */
function BiometricSettings() {
  const { notify } = useApp();
  const [available, setAvailable] = useState(null);
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState(false);
  const label = biometricLabel();

  const load = () => api.get('/auth/webauthn/credentials').then(setCreds).catch(() => setCreds([]));
  useEffect(() => {
    platformAuthAvailable().then(setAvailable);
    load();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await biometricRegister();
      notify(`${label} bekapcsolva ezen az eszközön`);
      await load();
    } catch (e) {
      if (e?.name === 'InvalidStateError') notify('Ez az eszköz már be van állítva');
      else if (!isCancel(e)) notify(e.message, 'error');
    } finally { setBusy(false); }
  };
  const remove = async (c) => {
    try {
      await api.del(`/auth/webauthn/credentials/${encodeURIComponent(c.id)}`);
      notify('Eszköz eltávolítva');
      await load();
    } catch (e) { notify(e.message, 'error'); }
  };

  const date = (d) => new Date(d).toLocaleDateString('hu-HU');
  return (
    <Field group label="Face ID / biometrikus belépés"
      hint={available === false
        ? 'Ezen az eszközön vagy böngészőben nem érhető el (HTTPS és beépített Face ID / Touch ID / Windows Hello kell).'
        : 'Belépéskor a PIN helyett az arcod vagy ujjlenyomatod azonosít. A PIN-kód tartaléknak megmarad.'}>
      <div className="stack">
        {creds?.length > 0 && (
          <div className="edit-list">
            {creds.map((c) => (
              <div key={c.id} className="edit-row">
                <span className="rank-icon"><ScanFace size={16} /></span>
                <span className="grow">{c.name}<small className="muted"> · hozzáadva {date(c.createdAt)}{c.lastUsedAt ? ` · utoljára ${date(c.lastUsedAt)}` : ''}</small></span>
                <div className="row-actions">
                  <button className="icon-btn danger-text" onClick={() => remove(c)} aria-label="Eltávolítás"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {available && (
          <button className="btn ghost full" disabled={busy} onClick={enable}>
            <ScanFace size={16} /> {label} bekapcsolása ezen az eszközön
          </button>
        )}
      </div>
    </Field>
  );
}

// ── Adatok
function DataSheet({ onClose }) {
  const { refresh, notify } = useApp();
  const fileRef = useRef();
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'budget-app') throw new Error();
      setPending({ data, name: f.name, count: data.tables?.transactions?.length || 0 });
    } catch {
      notify('Ez nem érvényes mentésfájl', 'error');
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      await api.post('/import', pending.data);
      await refresh();
      notify('Mentés visszatöltve');
      setPending(null);
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Adatok és mentés" onClose={onClose}>
      <div className="form">
        <button className="btn ghost full" onClick={() => downloadUrl('/api/export.csv')}><Download size={16} /> Tranzakciók letöltése (CSV, Excelhez)</button>
        <button className="btn ghost full" onClick={() => downloadUrl('/api/export.json')}><Download size={16} /> Teljes mentés letöltése (JSON)</button>
        <button className="btn ghost full" onClick={() => fileRef.current.click()}><Upload size={16} /> Mentés visszatöltése</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pick} />
        {pending && (
          <div className="callout warn">
            <p><b>{pending.name}</b> – {pending.count} tranzakció. A visszatöltés <b>lecseréli az összes jelenlegi adatot</b> (a PIN-kód marad).</p>
            <div className="row gap">
              <button className="btn ghost" onClick={() => setPending(null)}>Mégse</button>
              <button className="btn danger grow" disabled={busy} onClick={restore}>Igen, visszatöltöm</button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
