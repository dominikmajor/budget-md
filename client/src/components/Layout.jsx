import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, List, Plus, Wallet, BarChart3, Lock, Settings, Hourglass, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../store.jsx';
import { Toast } from './ui.jsx';
import { BrandMark, Wordmark } from './Brand.jsx';
import QuickAdd from './QuickAdd.jsx';
import TransferSheet from './TransferSheet.jsx';
import TxDetail from './TxDetail.jsx';
import WalletSheet, { ReconcileSheet, WalletDeleteSheet } from './WalletSheet.jsx';

const TITLES = {
  '/': 'Főoldal',
  '/tranzakciok': 'Tranzakciók',
  '/tarcak': 'Tárcák',
  '/statisztika': 'Statisztika',
  '/beallitasok': 'Beállítások',
};

export default function Layout() {
  const { state, error, refresh, lock, openSheet, hidden, toggleHidden } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Billentyűparancs (asztali gépen): N vagy + → Gyorsrögzítő
  useEffect(() => {
    const onKey = (e) => {
      if (document.body.classList.contains('no-scroll') || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'n' || e.key === 'N' || e.key === '+') {
        e.preventDefault();
        openSheet('quick');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openSheet]);

  if (!state) {
    return (
      <div className="splash">
        {error ? (
          <div className="offline">
            <h2>Nem sikerült betölteni</h2>
            <p>{error.message}</p>
            <button className="btn primary" onClick={() => refresh()}>Újra</button>
          </div>
        ) : <BrandMark className="splash-logo" />}
      </div>
    );
  }

  const showGear = pathname === '/' || pathname === '/tarcak';

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Fő navigáció">
        <div className="sb-brand">
          <BrandMark />
          <Wordmark className="sb-label" />
        </div>
        <button className="sb-new" onClick={() => openSheet('quick')} title="Új tétel (N)">
          <Plus size={20} strokeWidth={2.5} />
          <span className="sb-label">Új tétel</span>
          <kbd className="sb-label">N</kbd>
        </button>
        <nav className="sb-nav">
          <NavLink to="/" end title="Főoldal"><Home size={20} /><span className="sb-label">Főoldal</span></NavLink>
          <NavLink to="/tranzakciok" title="Tranzakciók">
            <List size={20} /><span className="sb-label">Tranzakciók</span>
            {state.draftCount > 0 && <span className="sb-count">{state.draftCount}</span>}
          </NavLink>
          <NavLink to="/tarcak" title="Tárcák"><Wallet size={20} /><span className="sb-label">Tárcák</span></NavLink>
          <NavLink to="/statisztika" title="Statisztika"><BarChart3 size={20} /><span className="sb-label">Statisztika</span></NavLink>
          <NavLink to="/beallitasok" title="Beállítások"><Settings size={20} /><span className="sb-label">Beállítások</span></NavLink>
        </nav>
        <div className="sb-foot">
          <button onClick={toggleHidden} title={hidden ? 'Egyenlegek mutatása' : 'Egyenlegek elrejtése'}>
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
            <span className="sb-label">{hidden ? 'Egyenlegek mutatása' : 'Egyenlegek elrejtése'}</span>
          </button>
          <button onClick={lock} title="Zárolás"><Lock size={20} /><span className="sb-label">Zárolás</span></button>
        </div>
      </aside>

      <div className="app-main">
      <header className="topbar">
        <h1>{TITLES[pathname] || 'budget.md'}</h1>
        <div className="topbar-actions">
          {state.draftCount > 0 && (
            <button className="draft-badge" onClick={() => navigate('/tranzakciok?nezet=rendszerezes')} aria-label={`${state.draftCount} tétel vár rendszerezésre`}>
              <Hourglass size={15} /> {state.draftCount}
            </button>
          )}
          {showGear && (
            <button className="icon-btn mobile-only" onClick={() => navigate('/beallitasok')} aria-label="Beállítások"><Settings size={20} /></button>
          )}
          <button className="icon-btn mobile-only" onClick={lock} aria-label="Zárolás"><Lock size={20} /></button>
        </div>
      </header>

      <main className="page" key={pathname}>
        <Outlet />
      </main>
      </div>

      <nav className="bottombar">
        <NavLink to="/" end><Home size={22} /><span>Főoldal</span></NavLink>
        <NavLink to="/tranzakciok"><List size={22} /><span>Tranzakciók</span></NavLink>
        <button className="fab" onClick={() => openSheet('quick')} aria-label="Gyorsrögzítő"><Plus strokeWidth={2.25} /></button>
        <NavLink to="/tarcak"><Wallet size={22} /><span>Tárcák</span></NavLink>
        <NavLink to="/statisztika"><BarChart3 size={22} /><span>Statisztika</span></NavLink>
      </nav>

      <SheetHost />
      <Toast />
    </div>
  );
}

function SheetHost() {
  const { sheet, closeSheet } = useApp();
  if (!sheet) return null;
  const p = { ...sheet.props, onClose: closeSheet, key: sheet.key };
  switch (sheet.type) {
    case 'quick': return <QuickAdd {...p} />;
    case 'transfer': return <TransferSheet {...p} />;
    case 'tx': return <TxDetail {...p} />;
    case 'wallet': return <WalletSheet {...p} />;
    case 'reconcile': return <ReconcileSheet {...p} />;
    case 'walletDelete': return <WalletDeleteSheet {...p} />;
    default: return null;
  }
}
