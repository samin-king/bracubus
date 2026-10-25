import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';
const root = fileURLToPath(new URL('../', import.meta.url));
const local = join(root, '.local');
const data = join(local, 'postgres-data');
const bin = join(local, 'postgresql17', 'pgsql', 'bin');
const adminFile = join(local, 'postgres-admin-password');
const env = dotenv.parse(readFileSync(join(root, '.env')));
const target = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '5432' || target.username !== 'bracu' || target.pathname !== '/bracu') {
  throw new Error('This helper only manages the project-local bracu database at localhost:5432. Use your configured external database directly.');
}
if (!existsSync(join(bin, 'initdb.exe'))) throw new Error('Official PostgreSQL binaries are not yet extracted into .local/postgresql17.');
mkdirSync(local, { recursive: true });
function run(exe, args, allowFailure = false) {
  const result = spawnSync(join(bin, exe), args, { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (result.status !== 0 && !allowFailure) {
    // Do not echo command arguments or credentials.
    throw new Error(`${exe} failed. Check the local PostgreSQL log and Windows runtime prerequisites. Exit: ${result.status}`);
  }
  return result.status;
}
if (!existsSync(join(data, 'PG_VERSION'))) {
  if (!existsSync(adminFile)) writeFileSync(adminFile, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
  run('initdb.exe', ['-D', data, '-U', 'postgres', '--pwfile', adminFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
  console.log('Initialized project-local PostgreSQL cluster with password authentication.');
}
if (run('pg_ctl.exe', ['-D', data, 'status'], true) !== 0) {
  run('pg_ctl.exe', ['-D', data, '-l', join(local, 'postgres.log'), '-o', '-h 127.0.0.1 -p 5432', '-w', '-t', '30', 'start']);
}
const admin = new pg.Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: readFileSync(adminFile, 'utf8').trim(), database: 'postgres', connectionTimeoutMillis: 5000 });
const literal = value => "'" + value.replaceAll("'", "''") + "'";
try {
  await admin.connect();
  const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'bracu'");
  if (!role.rowCount) await admin.query(`CREATE ROLE bracu LOGIN PASSWORD ${literal(decodeURIComponent(target.password))}`);
  const database = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'bracu'");
  if (!database.rowCount) await admin.query('CREATE DATABASE bracu OWNER bracu');
} finally { await admin.end(); }
const app = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try { await app.connect(); await app.query('SELECT 1'); }
finally { await app.end(); }
console.log('PostgreSQL ready on localhost:5432; bracu application role is not a superuser.');
console.log('Next: npm run migrate, then npm run dev:server after configuring Google credentials.');
