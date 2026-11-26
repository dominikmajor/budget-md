import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, List, Plus, Wallet, BarChart3, Lock, Settings, Hourglass } from 'lucide-react';
import { useApp } from '../store.jsx';
import { Toast } from './ui.jsx';
import QuickAdd from './QuickAdd.jsx';
import TransferSheet from './TransferSheet.jsx';
import TxDetail from './TxDetail.jsx';
import WalletSheet, { ReconcileSheet } from './WalletSheet.jsx';

const TITLES = {
  '/': 'Főoldal',
  '/tranzakciok': 'Tranzakciók',
  '/tarcak': 'Tárcák',
  '/statisztika': 'Statisztika',
  '/beallitasok': 'Beállítások',
};

export default function Layout() {
  const { state, error, refresh, lock, openSheet } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!state) {
    return (
      <div className="splash">
        {error ? (
          <div className="offline">
            <h2>Nem sikerült betölteni</h2>
            <p>{error.message}</p>
            <button className="btn primary" onClick={() => refresh()}>Újra</button>
          </div>
        ) : <div className="splash-logo" />}
      </div>
    );
  }

  const showGear = pathname === '/' || pathname === '/tarcak';

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLES[pathname] || 'Budget'}</h1>
        <div className="topbar-actions">
          {state.draftCount > 0 && (
            <button className="draft-badge" onClick={() => navigate('/tranzakciok?nezet=rendszerezes')} aria-label={`${state.draftCount} tétel vár rendszerezésre`}>
              <Hourglass size={15} /> {state.draftCount}
            </button>
          )}
          {showGear && (
            <button className="icon-btn" onClick={() => navigate('/beallitasok')} aria-label="Beállítások"><Settings size={20} /></button>
          )}
          <button className="icon-btn" onClick={lock} aria-label="Zárolás"><Lock size={20} /></button>
        </div>
      </header>

      <main className="page" key={pathname}>
        <Outlet />
      </main>

      <nav className="bottombar">
        <NavLink to="/" end><Home size={22} /><span>Főoldal</span></NavLink>
        <NavLink to="/tranzakciok"><List size={22} /><span>Tranzakciók</span></NavLink>
        <button className="fab" onClick={() => openSheet('quick')} aria-label="Gyorsrögzítő"><Plus size={30} strokeWidth={2.5} /></button>
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
    default: return null;
  }
}
