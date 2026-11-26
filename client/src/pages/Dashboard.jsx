import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertTriangle, Hourglass, CheckCircle2, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { useApp } from '../store.jsx';
import { Card, Empty, Money, Progress, SectionTitle } from '../components/ui.jsx';
import TxRow from '../components/TxRow.jsx';
import { formatHUF } from '../lib/util.js';

export default function Dashboard() {
  const { state, hidden, toggleHidden, openSheet, walletsById } = useApp();
  const navigate = useNavigate();
  const { summary, alerts, wallets, recent, settings } = state;
  const pockets = wallets.filter((w) => !w.archived && w.kind !== 'envelope');
  const envelopes = wallets.filter((w) => !w.archived && w.kind === 'envelope');
  const featured = (envelopes.filter((e) => e.featured).length ? envelopes.filter((e) => e.featured) : envelopes).slice(0, 3);
  const otp = wallets.find((w) => w.keywords?.includes('otp')) || wallets.find((w) => w.kind === 'account');

  return (
    <div className="dash">
      {alerts.length > 0 && (
      <div className="dash-alerts">
      {alerts.map((a) =>
        a.type === 'reserve' ? (
          <div key="reserve" className="alert warn">
            <AlertTriangle size={20} />
            <div className="alert-text">
              Az {walletsById[a.walletId]?.name || 'Irattartó'}ban jelenleg <b>{formatHUF(a.balance)}</b> van
              ({formatHUF(a.missing)} hiányzik a {formatHUF(a.target)}-os célhoz).
            </div>
            <button className="btn small solid-warn" onClick={() => openSheet('transfer', { from: otp?.id, to: a.walletId, amount: a.missing, note: 'Irattartó pótlása' })}>
              Feltöltés {Math.round(a.target / 1000)}k-ra
            </button>
          </div>
        ) : (
          <button key="drafts" className="alert draft" onClick={() => navigate('/tranzakciok?nezet=rendszerezes')}>
            <Hourglass size={20} />
            <div className="alert-text"><b>{a.count} rögzített tétel</b> vár rendszerezésre</div>
            <ChevronRight size={18} />
          </button>
        ),
      )}
      </div>
      )}

      <div className="dash-main stack">
      <div className="hero">
        <div className="hero-top">
          <span>Azonnal elkölthető</span>
          <button className="icon-btn glass" onClick={toggleHidden} aria-label={hidden ? 'Egyenleg mutatása' : 'Egyenleg elrejtése'}>
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="hero-amount"><Money value={summary.liquid} /></div>
        <div className="hero-sub">
          <div><span>Borítékok + Irattartó</span><Money value={summary.saved} /></div>
          <div><span>Teljes vagyon</span><Money value={summary.total} /></div>
        </div>
      </div>

      <div className="hscroll pockets-row">
        {pockets.map((w) => {
          const isReserve = w.kind === 'reserve';
          const okReserve = w.balance >= settings.reserveTarget;
          return (
            <Card key={w.id} className="pocket" onClick={() => navigate(`/tranzakciok?tarca=${w.id}`)} style={{ '--c': w.color }}>
              <div className="pocket-head">
                <span className="pocket-icon">{w.icon}</span>
                {isReserve && (okReserve ? <CheckCircle2 size={16} className="ok-ico" /> : <AlertTriangle size={16} className="warn-ico" />)}
              </div>
              <div className="pocket-name">{w.name}</div>
              <Money value={w.balance} className="pocket-amount" />
              <button className="pocket-xfer" aria-label={`Átcsoportosítás innen: ${w.name}`}
                onClick={(e) => { e.stopPropagation(); openSheet('transfer', { from: w.id }); }}>
                <ArrowLeftRight size={14} />
              </button>
            </Card>
          );
        })}
      </div>

      {featured.length > 0 && (
        <>
          <SectionTitle action={<button className="link-btn" onClick={() => navigate('/tarcak')}>Összes</button>}>Borítékok</SectionTitle>
          <div className="envelopes-mini">
            {featured.map((e) => (
              <Card key={e.id} className="env-mini" onClick={() => navigate('/tarcak')} style={{ '--c': e.color }}>
                <div className="env-mini-row">
                  <span>{e.icon} {e.name}</span>
                  {e.targetAmount ? <b>{Math.round((e.balance / e.targetAmount) * 100)}%</b> : null}
                </div>
                <div className="env-mini-amt">
                  <Money value={e.balance} />{e.targetAmount ? <span className="muted"> / <Money value={e.targetAmount} /></span> : null}
                </div>
                {e.targetAmount ? <Progress value={e.balance} max={e.targetAmount} tone="accent" thin /> : null}
              </Card>
            ))}
          </div>
        </>
      )}

      </div>

      <div className="dash-side stack">
      <SectionTitle action={<button className="link-btn" onClick={() => navigate('/tranzakciok')}>Összes</button>}>Legutóbbi pénzmozgások</SectionTitle>
      <Card className="list-card">
        {recent.length ? recent.map((t) => <TxRow key={t.id} tx={t} showDate />) : (
          <Empty icon="🪙" title="Még nincs tétel" text="Nyomd meg a + gombot, és írd be pl.: fagyi 1500 költős"
            action={<button className="btn primary" onClick={() => openSheet('quick')}>Első tétel rögzítése</button>} />
        )}
      </Card>
      </div>
    </div>
  );
}
