import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import session from 'express-session';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { createEmailSender } from '../src/services/emailSender.js';
import { DEV_STUDENT_EMAIL, DEV_STUDENT_SUBJECT } from '../src/config/devEmailLogin.js';

const env = { NODE_ENV: 'development', DEV_EMAIL_LOGIN: 'true', DATABASE_URL: 'postgresql://localhost/bracu',
  FRONTEND_URL: 'http://localhost:5173', GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback', SESSION_SECRET: 'automated-test-secret-at-least-32-characters' };
test('local delivery requires an explicit flag, explicit development mode and local URLs', () => {
  assert.equal(loadAuthConfig(env).devEmailLogin, true);
  assert.equal(loadAuthConfig({ ...env, DEV_EMAIL_LOGIN: 'false' }).devEmailLogin, false);
  for (const NODE_ENV of ['production', 'test', undefined]) assert.throws(() => loadAuthConfig({ ...env, NODE_ENV }), /explicit NODE_ENV/);
  for (const values of [{ DATABASE_URL: 'postgresql://remote.example/bracu' }, { FRONTEND_URL: 'https://remote.example' }]) {
    assert.throws(() => loadAuthConfig({ ...env, ...values }), /loopback/);
  }
  assert.throws(() => createEmailSender({ ...loadAuthConfig(env), nodeEnv: 'production' }), /NODE_ENV/);
  assert.equal(createEmailSender(loadAuthConfig({ ...env, DEV_EMAIL_LOGIN: 'false' })), null);
});

test('local captured link uses the existing verification, user lookup, and session flow', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bracu-dev-email-'));
  const localFile = pathToFileURL(join(directory, 'email.json'));
  const pool = new PGlite();
  try {
    for (const name of ['001_authentication.sql', '002_email_login.sql']) await pool.exec(await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8'));
    await pool.query("INSERT INTO users (google_subject, name, email) VALUES ($1, 'Member 1 Local Test Student', $2)", [DEV_STUDENT_SUBJECT, DEV_STUDENT_EMAIL]);
    await pool.query("INSERT INTO users (google_subject, name, email) VALUES ('other-subject', 'Other Student', 'other.student@g.bracu.ac.bd')");
    const config = loadAuthConfig(env);
    const sendEmail = createEmailSender(config, { localFile });
    const app = createApp({ config, pool, sendEmail, store: new session.MemoryStore() });
    const agent = request.agent(app);
    const post = (path, body) => agent.post('/api/auth' + path).set('Origin', config.frontendUrl).send(body);
    await post('/email', { email: 'other.student@g.bracu.ac.bd' }).expect(202);
    await assert.rejects(readFile(localFile), { code: 'ENOENT' });
    assert.equal((await pool.query('SELECT * FROM email_login_tokens')).rows.length, 0);
    await post('/email', { email: 'not.a.student@gmail.com' }).expect(400);
    const response = await post('/email', { email: DEV_STUDENT_EMAIL }).expect(202);
    assert.ok(!response.body.token && !response.body.url);
    await agent.get('/api/auth/me').expect(401);
    const captured = JSON.parse(await readFile(localFile, 'utf8'));
    assert.equal(captured.email, DEV_STUDENT_EMAIL);
    const token = new URLSearchParams(new URL(captured.url).hash.slice(1)).get('email_token');
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    await post('/email/verify', { token: 'invalid' }).expect(401);
    const result = await post('/email/verify', { token }).expect(200);
    assert.ok(result.headers['set-cookie'].some(value => value.includes('HttpOnly')));
    assert.equal((await agent.get('/api/auth/me').expect(200)).body.email, DEV_STUDENT_EMAIL);
    await post('/email/verify', { token }).expect(401);
    await post('/logout', {}).expect(204);
    await agent.get('/api/auth/me').expect(401);
    await post('/email', { email: DEV_STUDENT_EMAIL }).expect(202);
    const expired = JSON.parse(await readFile(localFile, 'utf8'));
    await pool.query('UPDATE email_login_tokens SET expires_at = $1', [new Date(Date.now() - 1000)]);
    await post('/email/verify', { token: new URLSearchParams(new URL(expired.url).hash.slice(1)).get('email_token') }).expect(401);
    await assert.rejects(sendEmail({ email: 'other.student@g.bracu.ac.bd', url: captured.url }), /development_email_not_allowed/);
    await agent.get('/api/auth/me').expect(401);
  } finally { await pool.close(); await rm(directory, { recursive: true, force: true }); }
});
