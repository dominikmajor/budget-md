import pg from 'pg';

// BIGINT (int8) és NUMERIC visszaadása számként – forintösszegek bőven elférnek
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const TZ = process.env.APP_TIMEZONE || 'Europe/Budapest';

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    console.error('\n❌ Hiányzik a DATABASE_URL. Másold a .env.example fájlt .env néven és töltsd ki.\n');
    process.exit(1);
  }
  const url = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.hostname === '';
  const sslEnv = process.env.DATABASE_SSL;
  const useSsl = sslEnv ? sslEnv === 'true' : !isLocal;
  // Az sslmode paramétert mi kezeljük, hogy a pg ne írja felül az ssl beállítást
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

export const pool = createPool();

/** Tranzakcióban futtat egy függvényt; hiba esetén ROLLBACK. */
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Pool esetén párhuzamosan, egyetlen kliensnél (tranzakcióban) sorban futtatja a lekérdezéseket. */
export async function all(db, thunks) {
  if (db instanceof pg.Pool) return Promise.all(thunks.map((f) => f()));
  const out = [];
  for (const f of thunks) out.push(await f());
  return out;
}
