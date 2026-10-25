import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {localDirectLoginEnabled} from '../../../services/src/config/devEmailLogin.js';
import { pool } from '../config/db.js';
const root = new URL('../../../database/', import.meta.url);
export async function migrate(db) {
 await db.query('BEGIN');
 try {
  await db.query('SELECT pg_advisory_xact_lock(376301)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir(new URL('migrations/',root))).filter(n=>n.endsWith('.sql')).sort()) {
   const applied = await db.query('SELECT name FROM schema_migrations WHERE name=$1',[name]);
   if (!applied.rowCount) {
    await db.query(await readFile(new URL('migrations/'+name,root),'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
   }
  }
  await db.query('COMMIT');
 } catch(e) { await db.query('ROLLBACK'); throw e; }
}
export async function seed(db,{env=process.env}={}) {
 await db.query('BEGIN');
 try { for(const name of ['development.sql','drivers.sql']) await db.query(await readFile(new URL('seeds/'+name,root),'utf8'));
  if(env.NODE_ENV==='development'&&localDirectLoginEnabled(env)) for(const name of ['driver-accounts.sql','booking-profiles.sql']) await db.query(await readFile(new URL('seeds/'+name,root),'utf8'));
  await db.query('COMMIT'); }
 catch(e) { await db.query('ROLLBACK'); throw e; }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 let db;
 try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  db = await pool.connect();
  if (process.argv[2]==='migrate') await migrate(db);
  else if (process.argv[2]==='seed') await seed(db);
  else throw new Error('Expected migrate or seed');
  console.log(process.argv[2]+' completed');
 } catch(e) { console.error(e.code ? e.code+': '+(e.message || 'Database connection failed') : e.message); process.exitCode=1; }
 finally { db?.release(); await pool.end(); }
}
