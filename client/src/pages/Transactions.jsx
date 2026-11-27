import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Check, CheckCheck, X, Pencil } from 'lucide-react';
import { useApp } from '../store.jsx';
import { api, qs } from '../api.js';
import { CategoryPicker, Card, Chip, Empty, Money, Segmented } from '../components/ui.jsx';
import TxRow from '../components/TxRow.jsx';
import { dateKey, dayLabel, signedAmount, haptic, isGoalKind } from '../lib/util.js';
import { BP, useMediaQuery } from '../lib/useMediaQuery.js';

export default function Transactions() {
  const { state } = useApp();
  const [params, setParams] = useSearchParams();
  const view = params.get('nezet') === 'rendszerezes' ? 'drafts' : 'all';
  const setView = (v) => {
    const p = new URLSearchParams(params);
    if (v === 'drafts') p.set('nezet', 'rendszerezes'); else p.delete('nezet');
    setParams(p, { replace: true });
  };
  return (
    <div className="stack">
      <div className="tx-tabs">
      <Segmented value={view} onChange={setView} options={[
        { value: 'drafts', label: `Rendszerezésre vár${state.draftCount ? ` (${state.draftCount})` : ''}` },
        { value: 'all', label: 'Összes pénzforgalom' },
      ]} />
      </div>
      {view === 'drafts' ? <Drafts /> : <Journal />}
    </div>
  );
}

// ───────────────────────── Esti rendszerező ─────────────────────────

function Drafts() {
  const { version, mutate } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => { api.get('/transactions?status=draft&limit=500').then(setItems); }, [version]);

  if (!items) return <div className="loading" />;
  if (!items.length) {
    return <Empty icon="🌙" title="Minden rendszerezve" text="A napközben piszkozatként mentett tételek itt jelennek meg esténként." />;
  }
  const ready = items.filter((t) => t.walletId && (t.type !== 'transfer' || t.toWalletId));

  return (
    <div className="drafts">
      <div className="row between drafts-head">
        <span className="muted">{items.length} tétel · {ready.length} kész a jóváhagyásra</span>
        <button className="btn small primary pos" disabled={!ready.length}
          onClick={() => mutate(() => api.post('/transactions/approve', { ids: ready.map((t) => t.id) }), `${ready.length} tétel véglegesítve`)}>
          <CheckCheck size={16} /> Összes jóváhagyása
        </button>
      </div>
      {items.map((t) => <DraftCard key={t.id} tx={t} />)}
    </div>
  );
}

function DraftCard({ tx }) {
  const { state, mutate, openSheet } = useApp();
  const [local, setLocal] = useState(tx);
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  useEffect(() => setLocal(tx), [tx]);

  const patch = async (changes) => {
    const next = { ...local, ...changes };
    setLocal(next);
    try { await api.put(`/transactions/${tx.id}`, changes); } catch (e) { setLocal(local); throw e; }
  };
  const ready = local.walletId && (local.type !== 'transfer' || local.toWalletId);
  const approve = async () => {
    if (!ready) return;
    haptic(15);
    await mutate(() => api.post('/transactions/approve', { ids: [tx.id] }), 'Véglegesítve ✓');
  };
  const remove = () => mutate(() => api.del(`/transactions/${tx.id}`), 'Piszkozat törölve');

  const wallets = state.wallets.filter((w) => !w.archived && !isGoalKind(w.kind));

  return (
    <div className="draft-wrap">
      <div className={`draft-swipe-bg ${dx > 60 && ready ? 'armed' : ''}`}><Check size={22} /> Jóváhagyás</div>
      <Card className="draft-card" style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}>
        <div className="draft-top"
          onTouchStart={(e) => { start.current = e.touches[0].clientX; }}
          onTouchMove={(e) => { if (start.current != null) setDx(Math.max(0, Math.min(160, e.touches[0].clientX - start.current))); }}
          onTouchEnd={() => { if (dx > 100 && ready) approve(); setDx(0); start.current = null; }}>
          <div className="draft-title">
            <b>{local.name || 'Névtelen tétel'}</b>
            <Money value={local.amount} type={local.type} />
          </div>
          <div className="draft-actions">
            <button className="icon-btn" onClick={() => openSheet('tx', { id: tx.id, edit: true })} aria-label="Szerkesztés"><Pencil size={16} /></button>
            <button className="icon-btn" onClick={remove} aria-label="Törlés"><X size={18} /></button>
            <button className={`approve-btn ${ready ? '' : 'disabled'}`} onClick={approve} disabled={!ready} aria-label="Jóváhagyás"><Check size={22} /></button>
          </div>
        </div>
        <div className="draft-row-label">Tárca</div>
        <div className="picker scroll">
          {wallets.map((w) => (
            <Chip key={w.id} active={local.walletId === w.id} color={w.color} onClick={() => patch({ walletId: w.id })}>{w.icon} {w.name}</Chip>
          ))}
        </div>
        {local.type !== 'transfer' && (
          <>
            <div className="draft-row-label">Kategória</div>
            <CategoryPicker kind={local.type} value={local.categoryId} onChange={(categoryId) => patch({ categoryId })} noneLabel="Kategória nélkül" />
          </>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Napló ─────────────────────────

function Journal() {
  const { state, version } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filtersOpen, setShowFilters] = useState(false);
  const [items, setItems] = useState(null);
  const isDesktop = useMediaQuery(BP.desktop);
  const showFilters = filtersOpen || isDesktop; // asztalon a szűrők állandóan látszanak

  const filters = {
    wallet: params.get('tarca') || '',
    type: params.get('tipus') || '',
    category: params.get('kategoria') || '',
    receipt: params.get('blokk') === '1',
  };
  const setFilter = (key, value) => {
    const names = { wallet: 'tarca', type: 'tipus', category: 'kategoria', receipt: 'blokk' };
    const p = new URLSearchParams(params);
    const current = p.get(names[key]);
    if (!value || String(current) === String(value)) p.delete(names[key]); else p.set(names[key], value);
    setParams(p, { replace: true });
  };
  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const query = qs({ status: 'final', q: debounced, ...filters, receipt: filters.receipt ? 'true' : '', limit: 500 });
  useEffect(() => { setItems(null); api.get('/transactions' + query).then(setItems); }, [query, version]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const t of items || []) {
      const k = dateKey(t.occurredAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return [...map.entries()];
  }, [items]);

  const activeWallets = state.wallets.filter((w) => !w.archived && !isGoalKind(w.kind));
  const hasEnvelopes = state.wallets.some((w) => w.kind === 'envelope');
  const hasVaults = state.wallets.some((w) => w.kind === 'vault');

  return (
    <div className="journal">
      <div className="journal-filters">
      <div className="search-row">
        <div className="search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keresés névben, megjegyzésben" />
          {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Törlés"><X size={16} /></button>}
        </div>
        <button className={`icon-btn boxed mobile-only-flex ${showFilters || activeCount ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-label="Szűrők">
          <SlidersHorizontal size={18} />
          {activeCount > 0 && <span className="dot-count">{activeCount}</span>}
        </button>
      </div>

      <div className="picker scroll">
        {activeWallets.map((w) => (
          <Chip key={w.id} active={filters.wallet === String(w.id)} color={w.color} onClick={() => setFilter('wallet', w.id)}>{w.name}</Chip>
        ))}
        {hasEnvelopes && <Chip active={filters.wallet === 'envelopes'} onClick={() => setFilter('wallet', 'envelopes')}>Borítékok</Chip>}
        {hasVaults && <Chip active={filters.wallet === 'vaults'} onClick={() => setFilter('wallet', 'vaults')}>Széfek</Chip>}
      </div>

      {showFilters && (
        <Card className="filters">
          <div className="filter-label">Típus</div>
          <div className="picker">
            {[['income', 'Bevétel'], ['expense', 'Kiadás'], ['transfer', 'Átcsoportosítás']].map(([v, l]) => (
              <Chip key={v} active={filters.type === v} onClick={() => setFilter('type', v)}>{l}</Chip>
            ))}
            <Chip active={filters.receipt} onClick={() => setFilter('receipt', filters.receipt ? '' : '1')}>📎 Csak blokk fotóval</Chip>
          </div>
          <div className="filter-label">Kategória <span className="muted small">· az alkategóriák tételeivel együtt</span></div>
          <div className="picker">
            <Chip active={filters.category === 'none'} onClick={() => setFilter('category', 'none')}>❔ Kategória nélkül</Chip>
          </div>
          <CategoryPicker includeSystem value={filters.category && filters.category !== 'none' ? Number(filters.category) : null}
            onChange={(id) => {
              const p = new URLSearchParams(params);
              if (id == null) p.delete('kategoria'); else p.set('kategoria', id);
              setParams(p, { replace: true });
            }} />
          {activeCount > 0 && <button className="link-btn" onClick={() => setParams({}, { replace: true })}>Szűrők törlése</button>}
        </Card>
      )}
      </div>

      <div className="journal-list">

      {!items ? <div className="loading" /> : !items.length ? (
        <Empty icon="🔍" title="Nincs találat" text={activeCount || q ? 'Próbálj más szűrőt.' : 'Még nincs véglegesített tétel.'} />
      ) : (
        groups.map(([day, list]) => {
          const net = list.reduce((s, t) => s + signedAmount(t), 0);
          return (
            <section key={day} className="day">
              <div className="day-head">
                <span>{dayLabel(day)}</span>
                <span className={net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted'}>Napi egyenleg: <Money value={net} sign /></span>
              </div>
              <Card className="list-card">{list.map((t) => <TxRow key={t.id} tx={t} />)}</Card>
            </section>
          );
        })
      )}
      </div>
    </div>
  );
}
