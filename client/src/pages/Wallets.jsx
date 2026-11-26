import { useState } from 'react';
import { ArrowLeftRight, Plus, MoreHorizontal, ArrowDownLeft, ArrowUpRight, Scale, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';
import { Card, Money, Progress, SectionTitle, Empty } from '../components/ui.jsx';
import { formatHUF, weeklySuggestion, monthName, monthBy, WALLET_KIND, isGoalKind, mainWallet, vaultSource } from '../lib/util.js';

export default function Wallets() {
  const { state, openSheet } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const visible = state.wallets.filter((w) => showArchived || !w.archived);
  const pockets = visible.filter((w) => !isGoalKind(w.kind));
  const envelopes = visible.filter((w) => w.kind === 'envelope');
  const vaults = visible.filter((w) => w.kind === 'vault');
  const archivedCount = state.wallets.filter((w) => w.archived).length;
  const firstLiquid = mainWallet(state.wallets);
  const vaultFrom = vaultSource(state.wallets);

  return (
    <div className="stack">
      <div className="wallets-top">
      <button className="big-action" onClick={() => openSheet('transfer')}>
        <span className="big-action-icon"><ArrowLeftRight size={22} /></span>
        <span><b>Pénz mozgatása</b><small>Átcsoportosítás tárcák, borítékok és széfek között</small></span>
      </button>

      <div className="totals-row">
        <div><span>Likvid</span><Money value={state.summary.liquid} /></div>
        <div><span>Félretett</span><Money value={state.summary.saved} /></div>
        <div><span>Összesen</span><Money value={state.summary.total} /></div>
      </div>
      </div>

      <SectionTitle action={<button className="link-btn" onClick={() => openSheet('wallet', { kind: 'account' })}><Plus size={16} /> Új tárca</button>}>
        Számlák és készpénz
      </SectionTitle>
      <div className="stack-sm pocket-list">
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

      <SectionTitle action={<button className="link-btn" onClick={() => openSheet('wallet', { kind: 'vault' })}><Plus size={16} /> Új széf</button>}>
        Széfek
      </SectionTitle>
      {vaults.length ? (
        <div className="env-grid">
          {vaults.map((e) => <EnvelopeCard key={e.id} e={e} defaultSource={vaultFrom} />)}
        </div>
      ) : (
        <Empty icon="🔐" title="Még nincs széf" text="A Revolutban külön zsebekben (Vaults) tartott pénzedet itt követheted." />
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
  const { openSheet } = useApp();
  const navigate = useNavigate();

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

/** Boríték vagy széf kártyája: egyenleg, opcionális cél és haladás, befizetés / kivétel. */
function EnvelopeCard({ e, defaultSource }) {
  const { openSheet } = useApp();
  const isVault = e.kind === 'vault';
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
        {e.targetAmount ? <span className="muted"> / <Money value={e.targetAmount} /></span> : <span className="muted small"> · {isVault ? 'cél nélküli széf' : 'szabad gyűjtőboríték'}</span>}
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
        <button className="btn small ghost grow" onClick={() => openSheet('transfer', { from: defaultSource?.id, to: e.id, note: `${isVault ? 'Széfbe' : 'Félretétel'}: ${e.name}` })}>
          <Plus size={15} /> Befizetés
        </button>
        <button className="btn small ghost grow" onClick={() => openSheet('transfer', { from: e.id, to: defaultSource?.id, note: `${isVault ? 'Széfből' : 'Kivétel'}: ${e.name}` })}>
          <Minus size={15} /> Kivétel
        </button>
      </div>
    </Card>
  );
}
