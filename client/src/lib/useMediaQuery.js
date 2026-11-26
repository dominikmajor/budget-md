import { useSyncExternalStore } from 'react';

/** Töréspontok – a styles.css @media szabályaival összhangban. */
export const BP = {
  tablet: '(min-width: 768px)',
  desktop: '(min-width: 1100px)',
};

/** Reaktív media query: igaz, ha a feltétel teljesül (átméretezéskor frissül). */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
