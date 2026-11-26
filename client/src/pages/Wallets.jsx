import { useState } from 'react';
import { ArrowLeftRight, Plus, MoreHorizontal, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle, Scale, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';
import { Card, Money, Progress, SectionTitle, Empty } from '../components/ui.jsx';
import { formatHUF, weeklySuggestion, monthName, monthBy, WALLET_KIND } from '../lib/util.js';
import { spendTone } from './Dashboard.jsx';

export default function Wallets() {
  const { state, openSheet } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const pockets = state.wallets.filter((w) => w.kind !== 'envelope' && (showArchived || !w.archived));
  const envelopes = state.wallets.filter((w) => w.kind === 'envelope' && (showArchived || !w.archived));
  const archivedCount = state.wallets.filter((w) => w.archived).length;
  const firstLiquid = state.wallets.find((w) => w.keywords?.includes('otp')) || state.wallets.find((w) => w.kind === 'account');

  return (
    <div className="stack">
      <button className="big-action" onClick={() => openSheet('transfer')}>
        <span className="big-action-icon"><ArrowLeftRight size={22} /></span>
        <span><b>Pénz mozgatása</b><small>Átcsoportosítás tárcák és borítékok között</small></span>
      </button>

      <div className="totals-row">
        <div><span>Likvid</span><Money value={state.summary.liquid} /></div>
        <div><span>Félretett</span><Money value={state.summary.saved} /></div>
        <div><span>Összesen</span><Money value={state.summary.total} /></div>
      </div>

      <SectionTitle action={<button className="link-btn" onClick={() => openSheet('wallet', { kind: 'account' })}><Plus size={16} /> Új tárca</button>}>
        Számlák és készpénz
      </SectionTitle>
      <div className="stack-sm">
        {pockets.map((w) => <PocketCard key={w.id} w={w} />)}
      </div>

      <SectionTitle action={<button className="link-btn" onClick={() => openSheet('wallet', { kind: 'envelope' })}><Plus size={16} /> Új boríték</button>}>
        Borítékok
      </SectionTitle>
      {envelopes.length ? (
        <div className="env-grid">
          {envelopes.map((e) => <EnvelopeCard key={e.id} e={e} defaultSource={firstLiquid} />)}
        </div>
      ) : (
        <Empty icon="✉️" title="Még nincs boríték" text="Hozz létre egyet egy megtakarítási célhoz." />
      )}

      {archivedCount > 0 && (
        <button className="link-btn center" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? 'Archiváltak elrejtése' : `Archivált elemek mutatása (${archivedCount})`}
        </button>
      )}
    </div>
  );
}

function PocketCard({ w }) {
  const { state, openSheet } = useApp();
  const navigate = useNavigate();
  const target = state.settings.reserveTarget;
  const spending = state.spending?.walletId === w.id ? state.spending : null;

  return (
    <Card className={`pocket-card ${w.archived ? 'archived' : ''}`} style={{ '--c': w.color }}>
      <div className="pocket-card-head" onClick={() => navigate(`/tranzakciok?tarca=${w.id}`)}>
        <span className="pocket-icon lg">{w.icon}</span>
        <div className="grow">
          <div className="pocket-name">{w.name}{w.archived && <span className="badge">Archivált</span>}</div>
          <div className="muted small">{WALLET_KIND[w.kind]}</div>
        </div>
        <Money value={w.balance} className="lg" />
      </div>

      {w.kind === 'reserve' && (
        <div className="reserve">
          <Progress value={w.balance} max={target} tone={w.balance >= target ? 'green' : 'yellow'} />
          <div className="row between small">
            {w.balance >= target
              ? <span className="pos"><CheckCircle2 size={14} /> Célszint teljesítve</span>
              : <span className="warn"><AlertTriangle size={14} /> Hiányzik: {formatHUF(w.balance - target)}</span>}
            <span className="muted">Cél: {formatHUF(target)}</span>
          </div>
        </div>
      )}

      {spending && (
        <div className="reserve">
          <Progress value={spending.spent} max={spending.limit} tone={spendTone(spending.ratio)} />
          <div className="row between small">
            <span>{spending.period === 'week' ? 'Heti' : 'Napi'} keret: {formatHUF(spending.spent)} / {formatHUF(spending.limit)}</span>
            <span className="muted">Maradt: {formatHUF(spending.remaining)}</span>
          </div>
        </div>
      )}

      <div className="pocket-card-foot">
        <span className="muted small">E hónap:</span>
        <span className="small"><ArrowDownLeft size={14} className="pos" /> <Money value={w.monthIn} /></span>
        <span className="small"><ArrowUpRight size={14} className="neg" /> <Money value={w.monthOut} /></span>
        <span className="grow" />
        <button className="icon-btn" onClick={() => openSheet('reconcile', { id: w.id })} aria-label="Egyenleg igazítása"><Scale size={17} /></button>
        <button className="icon-btn" onClick={() => openSheet('transfer', { from: w.id })} aria-label="Átcsoportosítás"><ArrowLeftRight size={17} /></button>
        <button className="icon-btn" onClick={() => openSheet('wallet', { id: w.id })} aria-label="Szerkesztés"><MoreHorizontal size={18} /></button>
      </div>
    </Card>
  );
}

function EnvelopeCard({ e, defaultSource }) {
  const { openSheet } = useApp();
  const pct = e.targetAmount ? Math.round((e.balance / e.targetAmount) * 100) : null;
  const sug = weeklySuggestion(e);
  const reached = e.targetAmount && e.balance >= e.targetAmount;
  return (
    <Card className={`env-card ${e.archived ? 'archived' : ''}`} style={{ '--c': e.color }}>
      <div className="env-head">
        <span className="env-icon">{e.icon}</span>
        <div className="grow">
          <div className="pocket-name">{e.name}</div>
          {e.targetDate && <div className="muted small">Céldátum: {new Date(e.targetDate).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
        </div>
        <button className="icon-btn" onClick={() => openSheet('wallet', { id: e.id })} aria-label="Szerkesztés"><MoreHorizontal size={18} /></button>
      </div>
      <div className="env-amount">
        <Money value={e.balance} className="lg" />
        {e.targetAmount ? <span className="muted"> / <Money value={e.targetAmount} /></span> : <span className="muted small"> · szabad gyűjtőboríték</span>}
      </div>
      {e.targetAmount ? (
        <>
          <Progress value={e.balance} max={e.targetAmount} tone={reached ? 'green' : 'accent'} />
          <div className="row between small">
            <span>{pct}%</span>
            {reached ? <span className="pos">🎉 Cél elérve – archiválhatod</span>
              : sug ? <span className="muted">Heti {formatHUF(sug.perWeek)}-tal eléred {monthBy(new Date(e.targetDate).getMonth())}</span> : null}
          </div>
        </>
      ) : null}
      <div className="row gap">
        <button className="btn small ghost grow" onClick={() => openSheet('transfer', { from: defaultSource?.id, to: e.id, note: `Félretétel: ${e.name}` })}>
          <Plus size={15} /> Befizetés
        </button>
        <button className="btn small ghost grow" onClick={() => openSheet('transfer', { from: e.id, to: defaultSource?.id, note: `Kivétel: ${e.name}` })}>
          <Minus size={15} /> Kivétel
        </button>
      </div>
    </Card>
  );
}
