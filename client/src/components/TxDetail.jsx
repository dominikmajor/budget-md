import { useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import Sheet from './Sheet.jsx';
import TxForm from './TxForm.jsx';
import { Money } from './ui.jsx';
import { TxIcon, WalletBadge } from './TxRow.jsx';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { TYPE_META, fullDateTime } from '../lib/util.js';

export default function TxDetail({ id, onClose, edit: startEdit = false }) {
  const { categoriesById, projectsById, mutate } = useApp();
  const [tx, setTx] = useState(null);
  const [edit, setEdit] = useState(startEdit);
  const [confirmDel, setConfirmDel] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get(`/transactions/${id}`).then(setTx).catch(() => onClose()); }, [id, onClose]);

  if (!tx) return <Sheet title="Tétel" onClose={onClose}><div className="loading" /></Sheet>;

  const receiptUrl = tx.hasReceipt ? `/api/transactions/${tx.id}/receipt?v=${encodeURIComponent(tx.updatedAt)}` : null;
  const cat = categoriesById[tx.categoryId];
  const project = projectsById[tx.projectId];

  const save = async (payload) => {
    setBusy(true);
    try {
      await mutate(() => api.put(`/transactions/${tx.id}`, payload), 'Módosítva – egyenlegek újraszámolva');
      onClose();
    } catch { /* toast */ } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await mutate(() => api.del(`/transactions/${tx.id}`), 'Törölve – egyenlegek újraszámolva');
      onClose();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  if (edit) {
    return (
      <Sheet title="Tétel szerkesztése" onClose={onClose} tall>
        <TxForm initial={tx} existingReceiptUrl={receiptUrl} onSubmit={save} busy={busy} submitLabel="Változások mentése" />
      </Sheet>
    );
  }

  return (
    <Sheet title={TYPE_META[tx.type].label + (tx.status === 'draft' ? ' · piszkozat' : '')} onClose={onClose}>
      <div className="detail-hero">
        <TxIcon tx={tx} />
        <h2>{tx.name || cat?.name || 'Névtelen tétel'}</h2>
        <Money value={tx.amount} type={tx.type} className="xl" />
      </div>

      <dl className="detail-list">
        <div><dt>{tx.type === 'transfer' ? 'Honnan → Hová' : 'Tárca'}</dt>
          <dd>{tx.type === 'transfer' ? <><WalletBadge id={tx.walletId} /> → <WalletBadge id={tx.toWalletId} /></> : <WalletBadge id={tx.walletId} />}</dd></div>
        {tx.type !== 'transfer' && <div><dt>Kategória</dt><dd>{cat ? `${cat.icon} ${cat.name}` : '—'}</dd></div>}
        {tx.type === 'income' && <div><dt>Projekt</dt><dd>{project?.name || '—'}</dd></div>}
        <div><dt>Időpont</dt><dd>{fullDateTime(tx.occurredAt)}</dd></div>
        {tx.tags.length > 0 && <div><dt>Címkék</dt><dd className="picker">{tx.tags.map((t) => <span key={t} className="chip on tag">#{t}</span>)}</dd></div>}
        {tx.note && <div><dt>Megjegyzés</dt><dd className="pre">{tx.note}</dd></div>}
        <div><dt>Rögzítve</dt><dd className="muted">{fullDateTime(tx.createdAt)}</dd></div>
      </dl>

      {receiptUrl && (
        <button className="receipt-full" onClick={() => setZoom(true)}>
          <img src={receiptUrl} alt="Blokk fotó" />
          <span>Koppints a nagyításhoz</span>
        </button>
      )}

      <div className="form-actions">
        {confirmDel ? (
          <>
            <button className="btn ghost" onClick={() => setConfirmDel(false)}>Mégse</button>
            <button className="btn danger grow" onClick={remove} disabled={busy}><Trash2 size={16} /> Biztosan törlöm</button>
          </>
        ) : (
          <>
            <button className="btn ghost danger-text" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Törlés</button>
            <button className="btn primary grow" onClick={() => setEdit(true)}><Pencil size={16} /> Szerkesztés</button>
          </>
        )}
      </div>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img src={receiptUrl} alt="Blokk fotó" />
          <button className="icon-btn" aria-label="Bezárás"><X /></button>
        </div>
      )}
    </Sheet>
  );
}
