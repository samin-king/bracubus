import pg from 'pg';
export function createPool(config) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl,
    max: config.serverless ? 3 : 10, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000, allowExitOnIdle: Boolean(config.serverless) });
  pool.on('error', () => console.error('An idle PostgreSQL connection failed'));
  return pool;
}
