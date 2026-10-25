import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadAuthConfig } from './config/auth.js';
import { createPool } from './config/db.js';
import { createApp } from './app.js';
import { createDatabaseTripCatalog } from './services/tripCatalog.js';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const config = loadAuthConfig();

const pool = createPool(config);
await pool.query('SELECT 1 FROM users LIMIT 1');
await pool.query('SELECT 1 FROM auth_sessions LIMIT 1');
const tripCatalog = createDatabaseTripCatalog(pool);
const server = createApp({ config, pool, tripCatalog }).listen(Number(process.env.PORT || 3000), config.devDirectLogin ? '127.0.0.1' : undefined, () => console.log('BRACU API listening'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
