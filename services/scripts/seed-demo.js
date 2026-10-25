import pg from 'pg';
import { demoEmails, seedDemo } from './demoData.js';

// Do not read local .env: this command uses only explicitly supplied host settings.
if (process.env.NODE_ENV !== 'production') throw new Error('Demo provisioning requires NODE_ENV=production');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
let client;
try {
  demoEmails(process.env);
  client = await pool.connect();
  await seedDemo(client, process.env);
  console.log('Demo accounts, fleet, trips and sample messages provisioned; email verification remains required.');
} catch (error) {
  console.error('Demo provisioning failed', {type:error.constructor.name, code:error.code});
  if (error.name === 'DemoConfigurationError') {
    console.error('Invalid demo configuration fields', error.fields);
    console.error('Set three distinct real BRACU inboxes using letters and dot-separated name parts at @g.bracu.ac.bd. No digits or underscores; optional BRACU_STUDENT_EMAIL_PATTERN also applies. No placeholder accounts are created.');
  }
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
