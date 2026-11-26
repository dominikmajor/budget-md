import { ArrowLeftRight, Hourglass, Paperclip } from 'lucide-react';
import { useApp } from '../store.jsx';
import { Money } from './ui.jsx';
import { timeLabel } from '../lib/util.js';

export function TxIcon({ tx }) {
  const { categoriesById } = useApp();
  const cat = categoriesById[tx.categoryId];
  if (tx.status === 'draft') return <div className="tx-icon draft"><Hourglass size={18} /></div>;
  if (tx.type === 'transfer') return <div className="tx-icon xfer"><ArrowLeftRight size={18} /></div>;
  return (
    <div className="tx-icon" style={{ '--c': cat?.color || (tx.type === 'income' ? '#22c55e' : '#64748b') }}>
      {cat?.icon || (tx.type === 'income' ? '💰' : '💸')}
    </div>
  );
}

export function WalletBadge({ id }) {
  const { walletsById } = useApp();
  const w = walletsById[id];
  if (!w) return <span className="badge missing">Nincs tárca</span>;
  return <span className="badge" style={{ '--c': w.color }}>{w.name}</span>;
}

export default function TxRow({ tx, showDate, onClick }) {
  const { openSheet, categoriesById } = useApp();
  const cat = categoriesById[tx.categoryId];
  const title = tx.name || cat?.name || (tx.type === 'transfer' ? 'Átcsoportosítás' : 'Névtelen tétel');
  return (
    <button className={`tx-row ${tx.status === 'draft' ? 'is-draft' : ''}`} onClick={onClick || (() => openSheet('tx', { id: tx.id }))}>
      <TxIcon tx={tx} />
      <div className="tx-main">
        <div className="tx-title">
          {title}
          {tx.hasReceipt && <Paperclip size={13} className="muted" />}
        </div>
        <div className="tx-meta">
          {tx.type === 'transfer' ? (
            <><WalletBadge id={tx.walletId} /> <span className="muted">→</span> <WalletBadge id={tx.toWalletId} /></>
          ) : (
            <WalletBadge id={tx.walletId} />
          )}
          <span className="muted">{showDate ? new Date(tx.occurredAt).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }) + ' ' : ''}{timeLabel(tx.occurredAt)}</span>
        </div>
      </div>
      <Money value={tx.amount} type={tx.type} className={tx.status === 'draft' ? 'draft' : ''} />
    </button>
  );
}
