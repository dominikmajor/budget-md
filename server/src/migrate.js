import { pool } from './db.js';
import { runMigrations } from './migrations.js';

const client = await pool.connect();
try {
  console.log('Migrációk futtatása…');
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(424242)");
  const n = await runMigrations(client);
  await client.query('COMMIT');
  console.log(n ? `Kész, ${n} migráció alkalmazva.` : 'Az adatbázis naprakész.');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Migráció hiba:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
