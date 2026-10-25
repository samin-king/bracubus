import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import session from 'express-session';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { validateBracuEmail } from '../src/services/authService.js';
import { loadAuthConfig } from '../src/config/auth.js';

const config = { frontendUrl: 'http://localhost:5173', domain: 'g.bracu.ac.bd', secret: 'test-session-secret-with-sufficient-length', ttlMs: 3600000, cookieName: 'bracu.sid', secure: false };
for (const email of ['saeeb.rahman.samin@g.bracu.ac.bd', 'saeeb.rahman@g.bracu.ac.bd', 'saeeb@g.bracu.ac.bd']) {
  test(`direct email accepts ${email}`, () => assert.equal(validateBracuEmail(email), email));
}
for (const email of ['saeebrahman@gmail.com', 'saeeb@bracu.ac.bd', 'saeeb@g.bracu.com', 'malformed', 'saeeb..rahman@g.bracu.ac.bd', 'a@g.bracu.ac.bd.evil.com', 'a@g.bracu.ac.bd\n', '.a@g.bracu.ac.bd', 'a.@g.bracu.ac.bd', 'a b@g.bracu.ac.bd', 'a'.repeat(65) + '@g.bracu.ac.bd', null, { email: 'a@g.bracu.ac.bd' }]) {
  test(`direct email rejects ${JSON.stringify(email)}`, () => assert.throws(() => validateBracuEmail(email), /invalid_email/));
}
test('complete emails are normalized without guessing name boundaries', () => {
  assert.equal(validateBracuEmail('Saeeb.Rahman@G.BRACU.AC.BD'), 'saeeb.rahman@g.bracu.ac.bd');
  assert.throws(() => validateBracuEmail('saeebrahman'), /invalid_email/);
});
test('production permits email delivery independently of Google credentials', () => {
  const env = { NODE_ENV: 'production', DATABASE_URL: 'test', FRONTEND_URL: 'https://transport.example', GOOGLE_CALLBACK_URL: 'https://transport.example/api/auth/google/callback', SESSION_SECRET: config.secret, SMTP_HOST: 'smtp.example', EMAIL_FROM: 'transport@example.org' };
  assert.equal(loadAuthConfig(env).clientId, undefined);
  assert.throws(() => loadAuthConfig({ ...env, SMTP_PORT: '-1' }), /SMTP_PORT/);
  assert.throws(() => loadAuthConfig({ ...env, SMTP_USER: 'user' }), /SMTP_USER/);
});

test('email authentication integrates with existing users and sessions', async t => {
  const pool = new PGlite();
  for (const file of ['001_authentication.sql', '002_email_login.sql']) await pool.exec(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'));
  const messages = [];
  const store = new session.MemoryStore();
  let deliveryFails = false;
  const app = createApp({ config, pool, store, provider: { authorizationUrl: () => 'https://accounts.google.com' }, sendEmail: async value => { if (deliveryFails) throw new Error('smtp private credential'); messages.push(value); } });
  const agent = request.agent(app);
  const post = (path, body, client = agent) => client.post('/api/auth' + path).set('Origin', config.frontendUrl).send(body);
  const email = 'saeeb@g.bracu.ac.bd';
  const token = () => new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('email_token');
  try {
    await pool.query("INSERT INTO users (google_subject, name, email) VALUES ('existing-verified-subject', 'Saeeb', $1)", [email]);
    await t.test('email alone never authenticates; unknown accounts are not created', async () => {
      const unknown = await post('/email', { email: 'unknown@g.bracu.ac.bd' }).expect(202);
      const known = await post('/email', { email }).expect(202);
      assert.deepEqual(known.body, unknown.body);
      assert.equal(messages.length, 1);
      assert.equal((await pool.query('SELECT * FROM users')).rows.length, 1);
      await agent.get('/api/auth/me').expect(401);
      const hashes = (await pool.query('SELECT token_hash FROM email_login_tokens')).rows;
      assert.equal(hashes[0].token_hash, createHash('sha256').update(token()).digest('hex'));
      assert.ok(!known.text.includes(token()));
    });
    await t.test('rejects invalid emails and cross-origin initiation', async () => {
      for (const invalid of ['saeebrahman@gmail.com', 'saeeb@bracu.ac.bd', 'saeeb@g.bracu.com', 'malformed']) await post('/email', { email: invalid }).expect(400);
      await agent.post('/api/auth/email').set('Origin', 'https://evil.example').send({ email }).expect(403);
    });
    await t.test('invalid or expired tokens never authenticate', async () => {
      await post('/email/verify', { token: 'forged' }).expect(401);
      await pool.query('UPDATE email_login_tokens SET expires_at = $1', [new Date(Date.now() - 1000)]);
      await post('/email/verify', { token: token() }).expect(401);
    });
    await t.test('valid link rotates the session and replay is rejected', async () => {
      await agent.post('/api/auth/logout').set('Origin', config.frontendUrl).expect(204);
      await post('/email', { email }).expect(202);
      const value = token();
      await post('/email/verify', { token: value }, request.agent(app)).expect(200);
      await post('/email/verify', { token: value }).expect(401);
      await post('/email', { email }).expect(202);
      const before = await agent.get('/api/auth/google').expect(302);
      const oldCookie = before.headers['set-cookie'][0].split(';')[0];
      const result = await post('/email/verify', { token: token() }).expect(200);
      assert.notEqual(result.headers['set-cookie'][0].split(';')[0], oldCookie);
      await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
      assert.deepEqual(Object.keys(result.body).sort(), ['email', 'id', 'name', 'role']);
      await agent.get('/api/auth/me').expect(200);
      await post('/logout', {}).expect(204);
      await agent.get('/api/auth/me').expect(401);
    });
    await t.test('concurrent consumption succeeds exactly once', async () => {
      await post('/email', { email }).expect(202);
      const value = token();
      const results = await Promise.all([post('/email/verify', { token: value }, request.agent(app)), post('/email/verify', { token: value }, request.agent(app))]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    });
    await t.test('failed delivery removes the token and hides transport details', async () => {
      await pool.query('DELETE FROM email_login_tokens');
      deliveryFails = true;
      const result = await post('/email', { email }).expect(503);
      assert.equal(result.body.error, 'email_delivery_failed');
      assert.doesNotMatch(result.text, /private credential/);
      assert.equal((await pool.query('SELECT * FROM email_login_tokens')).rows.length, 0);
    });
    await t.test('missing SMTP fails closed without Google configuration', async () => {
      const local = request.agent(createApp({ config, pool, store: new session.MemoryStore() }));
      assert.equal((await post('/email', { email }, local).expect(503)).body.error, 'email_not_configured');
      await local.get('/api/auth/me').expect(401);
    });
  } finally { await pool.close(); }
});
