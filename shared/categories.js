/**
 * Kategóriafa segédfüggvények (kliens és szerver közös).
 * A kategóriák lapos listában érkeznek: { id, name, kind, parentId, archived, sortOrder, ... }
 */

const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;

/** parentId -> gyerekek (rendezve); a gyökerek kulcsa: 'root' */
export function childrenMap(categories = []) {
  const ids = new Set(categories.map((c) => c.id));
  const map = new Map();
  for (const c of categories) {
    const key = c.parentId != null && ids.has(c.parentId) ? c.parentId : 'root';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  for (const list of map.values()) list.sort(bySort);
  return map;
}

/** Ősök listája a gyökértől a kategóriáig (a kategóriát is beleértve). */
export function pathOf(id, byId) {
  const out = [];
  const seen = new Set();
  let cur = byId[id];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId != null ? byId[cur.parentId] : null;
  }
  return out;
}

/** „Side-hustle › Korrepetálás” */
export function pathLabel(id, byId, sep = ' › ') {
  return pathOf(id, byId).map((c) => c.name).join(sep);
}

/** A kategória és összes leszármazottja id-halmaza. */
export function descendantIds(id, categories = []) {
  const kids = childrenMap(categories);
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    if (out.has(cur)) continue;
    out.add(cur);
    for (const k of kids.get(cur) || []) stack.push(k.id);
  }
  return out;
}

/** Mélység (gyökér = 0). */
export function depthOf(id, byId) {
  return Math.max(0, pathOf(id, byId).length - 1);
}

/** Akkor aktív, ha sem ő, sem egyik őse nincs archiválva. */
export function isActive(c, byId) {
  return !pathOf(c.id, byId).some((x) => x.archived);
}

/** Fa bejárása mélységi sorrendben: [{ cat, depth }] */
export function flattenTree(categories = [], { kind, filter } = {}) {
  const kids = childrenMap(categories);
  const out = [];
  const walk = (list, depth) => {
    for (const c of list) {
      if (kind && c.kind !== kind) continue;
      if (filter && !filter(c)) continue;
      out.push({ cat: c, depth });
      walk(kids.get(c.id) || [], depth + 1);
    }
  };
  walk(kids.get('root') || [], 0);
  return out;
}

/**
 * Összesítés felgörgetése a fában.
 * totals: Map/obj id -> szám (a közvetlenül az adott kategóriára rögzített összeg)
 * Visszaad: Map id -> a kategória + leszármazottai összege
 */
export function rollup(categories = [], totals = {}) {
  const get = (id) => (totals instanceof Map ? totals.get(id) : totals[id]) || 0;
  const kids = childrenMap(categories);
  const out = new Map();
  const visit = (c, seen) => {
    if (out.has(c.id)) return out.get(c.id);
    if (seen.has(c.id)) return 0;
    seen.add(c.id);
    let sum = get(c.id);
    for (const k of kids.get(c.id) || []) sum += visit(k, seen);
    out.set(c.id, sum);
    return sum;
  };
  for (const c of categories) visit(c, new Set());
  return out;
}
