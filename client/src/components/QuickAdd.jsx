import { useMemo, useState } from 'react';
import { Sparkles, SlidersHorizontal, Hourglass, Check } from 'lucide-react';
import { parseQuickEntry } from '@budget/shared/parser';
import Sheet from './Sheet.jsx';
import TxForm from './TxForm.jsx';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { formatHUF, TYPE_META, haptic } from '../lib/util.js';

/** Globális gyorsrögzítő: szabadszöveges bevitel, villám-piszkozat, sablonok, részletes űrlap. */
export default function QuickAdd({ onClose, mode: initialMode = 'text', initial }) {
  const { state, walletsById, categoriesById, categoryLabel, mutate } = useApp();
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => parseQuickEntry(text, { wallets: state.wallets, categories: state.categories, memory: state.memory }),
    [text, state],
  );

  const save = async (payload, { asDraft = false, message } = {}) => {
    setBusy(true);
    try {
      await mutate(() => api.post('/transactions', { ...payload, status: asDraft ? 'draft' : 'final' }),
        message || (asDraft ? 'Piszkozat mentve – este rendszerezheted' : 'Mentve ✓'));
      haptic(15);
      onClose();
    } catch { /* toast már jelezte */ } finally { setBusy(false); }
  };

  const fromParsed = () => ({
    type: parsed.type, amount: parsed.amount, walletId: parsed.walletId, toWalletId: parsed.toWalletId,
    name: parsed.name, categoryId: parsed.categoryId,
  });

  const useTemplate = (t) =>
    save({ type: t.type, amount: t.amount, walletId: t.walletId, categoryId: t.categoryId, name: t.name },
      { asDraft: !t.walletId, message: `${t.emoji} ${t.name} mentve` });

  if (mode === 'form') {
    return (
      <Sheet title="Új tétel" onClose={onClose} tall>
        <TxForm initial={initial || fromParsed()} onSubmit={(p, o) => save(p, o)} allowDraft busy={busy} />
      </Sheet>
    );
  }

  const meta = TYPE_META[parsed.type];
  const w = walletsById[parsed.walletId];
  const w2 = walletsById[parsed.toWalletId];
  const cat = categoriesById[parsed.categoryId];

  return (
    <Sheet title="Gyorsrögzítő" onClose={onClose}>
      {state.templates.length > 0 && (
        <div className="templates">
          {state.templates.map((t) => (
            <button key={t.id} className="template" onClick={() => useTemplate(t)} disabled={busy}>
              <span className="template-emoji">{t.emoji}</span>
              <span className="template-text">
                <b>{t.name}</b>
                <small>{formatHUF(t.amount)}{walletsById[t.walletId] ? ` · ${walletsById[t.walletId].name}` : ''}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (parsed.valid) save(fromParsed()); }}>
        <div className="smart-input">
          <Sparkles size={18} className="smart-icon" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Írd be röviden, pl.: fagyi 1500 költős"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="off"
          />
        </div>

        <div className="hint-row">
          <span><code>+</code> bevétel</span>
          <span><code>-&gt;</code> átcsoportosítás</span>
          <span><code>otp</code> <code>revo</code> <code>kp</code></span>
        </div>

        {text.trim() && (
          <div className={`preview ${meta.cls}`}>
            <span className={`pill ${meta.cls}`}>{meta.label}</span>
            <div className="preview-main">
              <b>{parsed.name || (parsed.type === 'transfer' ? 'Átcsoportosítás' : '—')}</b>
              <span className={`money ${meta.cls}`}>
                {parsed.amount ? (parsed.type === 'transfer' ? `⇄ ${formatHUF(parsed.amount)}` : formatHUF(parsed.type === 'expense' ? -parsed.amount : parsed.amount, { sign: true })) : '? Ft'}
              </span>
            </div>
            <div className="preview-meta">
              {parsed.type === 'transfer' ? (
                <span>{w ? `${w.icon} ${w.name}` : <em>forrás?</em>} → {w2 ? `${w2.icon} ${w2.name}` : <em>cél?</em>}</span>
              ) : (
                <span>Tárca: {w ? `${w.icon} ${w.name}` : <em>nincs megadva</em>}</span>
              )}
              {parsed.type !== 'transfer' && <span>Kategória: {cat ? `${cat.icon} ${categoryLabel(cat.id)}` : <em>—</em>}</span>}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn warn-ghost" disabled={!parsed.amount || busy}
            onClick={() => save(fromParsed(), { asDraft: true })}>
            <Hourglass size={16} /> Piszkozatként
          </button>
          <button type="submit" className={`btn primary grow ${meta.cls}`} disabled={!parsed.valid || busy}>
            <Check size={18} /> Mentés
          </button>
        </div>
      </form>

      <button className="link-btn center" onClick={() => setMode('form')}>
        <SlidersHorizontal size={16} /> Részletes űrlap
      </button>
    </Sheet>
  );
}
