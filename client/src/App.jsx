import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import { AppProvider, useApp } from './store.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import Wallets from './pages/Wallets.jsx';
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
import Settings from './pages/Settings.jsx';
import Onboarding from './pages/Onboarding.jsx';

export default function App() {
  const [auth, setAuth] = useState(null); // null = betöltés, objektum = státusz
  const navigate = useNavigate();

  const loadStatus = useCallback(async () => {
    try {
      setAuth(await api.get('/auth/status'));
    } catch {
      setAuth({ offline: true });
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const lock = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setAuth((a) => ({ ...a, authenticated: false }));
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth((a) => (a ? { ...a, authenticated: false } : a)));
  }, []);

  if (!auth) return <div className="splash"><div className="splash-logo" /></div>;
  if (auth.offline) {
    return (
      <div className="splash">
        <div className="offline">
          <h2>Nem érem el a szervert</h2>
          <p>Fut az API? (<code>npm run dev</code>) Ellenőrizd a <code>DATABASE_URL</code>-t a .env fájlban.</p>
          <button className="btn primary" onClick={loadStatus}>Újra</button>
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login status={auth} onSuccess={(isNew) => {
          setAuth((a) => ({ ...a, authenticated: true, hasPin: true }));
          navigate(isNew ? '/kezdes' : '/', { replace: true });
        }} onStatus={loadStatus} />} />
      </Routes>
    );
  }

  return (
    <AppProvider onLock={lock}>
      <AutoLock lock={lock} />
      <Routes>
        <Route path="/kezdes" element={<Onboarding />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tranzakciok" element={<Transactions />} />
          <Route path="/tarcak" element={<Wallets />} />
          <Route path="/statisztika" element={<Suspense fallback={<div className="loading" />}><Analytics /></Suspense>} />
          <Route path="/beallitasok" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

/** Automatikus zárolás: háttérbe kerülés vagy inaktivitás után a beállított idő elteltével. */
function AutoLock({ lock }) {
  const { state } = useApp();
  const minutes = state?.settings?.autolockMinutes ?? 2;
  const lastActive = useRef(Date.now());
  const hiddenAt = useRef(null);

  useEffect(() => {
    const limit = minutes * 60_000;
    const touch = () => { lastActive.current = Date.now(); };
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current != null) {
        if (Date.now() - hiddenAt.current >= limit) lock();
        hiddenAt.current = null;
        touch();
      }
    };
    const timer = setInterval(() => {
      if (limit > 0 && document.visibilityState === 'visible' && Date.now() - lastActive.current > limit) lock();
    }, 10_000);
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [minutes, lock]);
  return null;
}
