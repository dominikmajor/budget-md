import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { byId } from './lib/util.js';
import { pathLabel } from '@budget/shared/categories';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children, onLock }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem('budget.hidden') === '1');
  const [sheet, setSheet] = useState(null); // { type, props }
  const [toast, setToast] = useState(null);
  const [version, setVersion] = useState(0); // listák újratöltéséhez
  const toastTimer = useRef();

  const refresh = useCallback(async () => {
    try {
      const s = await api.get('/state');
      setState(s);
      setError(null);
      setVersion((v) => v + 1);
      return s;
    } catch (e) {
      setError(e);
      throw e;
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  useEffect(() => { localStorage.setItem('budget.hidden', hidden ? '1' : '0'); }, [hidden]);

  const notify = useCallback((message, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo(() => {
    const categoriesById = state ? byId(state.categories) : {};
    const maps = state
      ? {
          walletsById: byId(state.wallets),
          categoriesById,
          /** „Side-hustle › Korrepetálás” */
          categoryLabel: (id) => pathLabel(id, categoriesById),
        }
      : {};
    return {
      state,
      ...maps,
      error,
      refresh,
      version,
      hidden,
      toggleHidden: () => setHidden((h) => !h),
      sheet,
      openSheet: (type, props = {}) => setSheet({ type, props, key: Date.now() }),
      closeSheet: () => setSheet(null),
      toast,
      notify,
      lock: onLock,
      /** Mutáció + újratöltés + visszajelzés egy lépésben */
      async mutate(fn, okMessage) {
        try {
          const res = await fn();
          await refresh();
          if (okMessage) notify(okMessage);
          return res;
        } catch (e) {
          notify(e.message, 'error');
          throw e;
        }
      },
    };
  }, [state, error, refresh, version, hidden, sheet, toast, notify, onLock]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
