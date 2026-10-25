import { attachDatabasePool } from '@vercel/functions';
import { loadAuthConfig } from './config/auth.js';
import { createPool } from './config/db.js';
import { createApp } from './app.js';
import { createDatabaseTripCatalog } from './services/tripCatalog.js';

export function createVercelHandler({ env = process.env, poolFactory = createPool,
  appFactory = createApp, managePool = attachDatabasePool } = {}) {
  let app;
  return function handler(req, res) {
    if (!app) {
      try {
        for (const flag of ['DEV_DIRECT_LOGIN', 'DEV_EMAIL_LOGIN', 'ENABLE_DEV_DRIVER_AUTH']) {
          if (env[flag] === 'true') throw new Error('Development authentication is forbidden on Vercel');
        }
        const config = loadAuthConfig({ ...env, NODE_ENV: 'production', VERCEL: '1' });
        const pool = poolFactory(config);
        managePool(pool);
        app = appFactory({ config, pool, tripCatalog: createDatabaseTripCatalog(pool) });
      } catch {
        // Configuration errors must not expose credentials or produce a platform HTML error.
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ error: 'service_not_configured', message: 'The API is not configured. Check DATABASE_URL, SESSION_SECRET and the deployment origin.' }));
        return;
      }
    }
    return app(req, res);
  };
}

// Reuse the app and its bounded pool across warm and concurrent invocations.
export default createVercelHandler();
