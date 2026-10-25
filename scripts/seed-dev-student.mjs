import dotenv from 'dotenv';
import pg from 'pg';
import { localEmailLoginEnabled, DEV_STUDENT_EMAIL, DEV_STUDENT_SUBJECT } from '../services/src/config/devEmailLogin.js';
dotenv.config({ path: new URL('../.env', import.meta.url) });
if (!localEmailLoginEnabled(process.env)) throw new Error('Enable DEV_EMAIL_LOGIN=true and NODE_ENV=development for the local seed');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`INSERT INTO users (google_subject, name, email, role)
    VALUES ($1, 'Member 1 Local Test Student', $2, 'student')
    ON CONFLICT (email) DO NOTHING RETURNING id`, [DEV_STUDENT_SUBJECT, DEV_STUDENT_EMAIL]);
  console.log(result.rowCount ? 'Created the clearly labeled Member 1 local test student.' : 'Test email already exists; existing account was left unchanged.');
} finally { await pool.end(); }
