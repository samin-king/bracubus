import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newDb } from 'pg-mem';
import session from 'express-session';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { validateIdentity, createGoogleProvider } from '../src/services/authService.js';
import { loadAuthConfig } from '../src/config/auth.js';
const config = { clientId: 'test', clientSecret: 'test', callbackUrl: 'http://localhost:3000/api/auth/google/callback',
  frontendUrl: 'http://localhost:5173', domain: 'g.bracu.ac.bd', secret: 'test-secret-for-automated-tests-only-1234', ttlMs: 3600000, secure: false, cookieName: 'bracu.sid' };
const identity = { sub: 'google-stable-id', name: 'Test Student', email: 'samin.saeeb@g.bracu.ac.bd', email_verified: true, hd: 'g.bracu.ac.bd' };
async function setup({ claims = {}, verifyFails = false, postgresEngine = false } = {}) {
  const sql = await readFile(new URL('../../database/migrations/001_authentication.sql', import.meta.url), 'utf8');
  let pool;
  if (postgresEngine) {
    const { PGlite } = await import('@electric-sql/pglite');
    pool = new PGlite();
    await pool.exec(sql);
  } else {
    const db = newDb();
    db.public.none(sql);
    const { Pool } = db.adapters.createPg();
    pool = new Pool();
  }
  let flow;
  let calls = 0;
  const provider = {
    authorizationUrl(value) { flow = value; return `https://accounts.google.com/o/oauth2/v2/auth?state=${value.state}`; },
    async verify() { calls++; if (verifyFails) throw new Error('provider secret'); return { ...identity, nonce: flow.nonce, ...claims }; }
  };
  const store = new session.MemoryStore();
  const app = createApp({ config, pool, provider, store });
  const agent = request.agent(app);
  const login = async (extra = '') => {
    await agent.get('/api/auth/google').expect(302);
    return agent.get(`/api/auth/google/callback?code=test-code&state=${flow.state}${extra}`).expect(302);
  };
  return { pool, agent, login, store, get flow() { return flow; }, get calls() { return calls; }, provider };
}
test('accepts valid institutional identity', () => assert.equal(validateIdentity(identity, config).email, identity.email));
for (const email of ['student@gmail.com', 'student@yahoo.com', 'student@outlook.com', 'x@other.edu', 'x@g.bracu.ac.bd.evil.com']) {
  test(`rejects ${email}`, () => assert.throws(() => validateIdentity({ ...identity, email }, config), /invalid_institution/));
}
test('requires verified Workspace domain', () => {
  for (const claims of [{ email_verified: false }, { hd: undefined }, { hd: 'evil.edu' }]) assert.throws(() => validateIdentity({ ...identity, ...claims }, config));
});
test('supports stricter configured full-email pattern', () => {
  assert.throws(() => validateIdentity(identity, { ...config, emailPattern: /^[0-9]+@g\.bracu\.ac\.bd$/ }));
});
test('Google authorization uses code flow, nonce, state, and PKCE', () => {
  const url = new URL(createGoogleProvider(config).authorizationUrl({ state: 'state', nonce: 'nonce', verifier: 'verifier' }));
  assert.equal(url.origin, 'https://accounts.google.com');
  for (const [key, value] of Object.entries({ response_type: 'code', state: 'state', nonce: 'nonce', code_challenge_method: 'S256', hd: config.domain })) assert.equal(url.searchParams.get(key), value);
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('client_secret'), null);
});
test('creates student record, ignores client role, returns only public fields', async () => {
  const s = await setup(); await s.login('&role=authority');
  const me = await s.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.role, 'student');
  assert.deepEqual(Object.keys(me.body).sort(), ['email', 'id', 'name', 'role']);
  const rows = (await s.pool.query('SELECT * FROM users')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].google_subject, identity.sub);
});
test('existing Google identity is not duplicated', async () => {
  const s = await setup(); await s.login(); await s.login();
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 1);
});
test('me rejects unauthenticated and forged identity', async () => {
  const s = await setup(); await s.agent.get('/api/auth/me?userId=1&role=student').expect(401);
});
test('logout invalidates session and captured cookie', async () => {
  const s = await setup(); const login = await s.login();
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await s.agent.post('/api/auth/logout').set('Origin', config.frontendUrl).expect(204);
  await s.agent.get('/api/auth/me').expect(401);
  await request(createApp({ config, pool: s.pool, provider: s.provider, store: s.store })).get('/api/auth/me').set('Cookie', cookie).expect(401);
});
test('logout rejects cross-origin requests', async () => {
  const s = await setup(); await s.login();
  await s.agent.post('/api/auth/logout').set('Origin', 'https://evil.com').expect(403);
  await s.agent.get('/api/auth/me').expect(200);
});
test('invalid state cannot authenticate', async () => {
  const s = await setup(); await s.agent.get('/api/auth/google');
  const res = await s.agent.get('/api/auth/google/callback?state=bad&code=x').expect(302);
  assert.match(res.headers.location, /invalid_callback/); assert.equal(s.calls, 0);
});
test('state cannot be replayed after callback', async () => {
  const s = await setup(); await s.login();
  const result = await s.agent.get(`/api/auth/google/callback?state=${s.flow.state}&code=test-code`);
  assert.match(result.headers.location, /invalid_callback/); assert.equal(s.calls, 1);
});
test('invalid nonce creates no user', async () => {
  const s = await setup({ claims: { nonce: 'wrong' } });
  assert.match((await s.login()).headers.location, /invalid_callback/);
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 0);
});
test('noninstitutional login creates no account', async () => {
  const s = await setup({ claims: { email: 'x@gmail.com' } });
  assert.match((await s.login()).headers.location, /invalid_institution/);
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 0);
});
test('provider verification failure hides secrets', async () => {
  const s = await setup({ verifyFails: true });
  assert.match((await s.login()).headers.location, /google_failed/);
});
test('expired session is rejected', async () => {
  const s = await setup(); await s.login();
  const sessions = await new Promise((resolve, reject) => s.store.all((err, result) => err ? reject(err) : resolve(result)));
  for (const [sid, value] of Object.entries(sessions)) {
    value.authExpiresAt = Date.now() - 1;
    await new Promise((resolve, reject) => s.store.set(sid, value, err => err ? reject(err) : resolve()));
  }
  await s.agent.get('/api/auth/me').expect(401);
});
test('database failure returns generic 500', async () => {
  const s = await setup(); await s.login();
  s.pool.query = async () => { throw new Error('private connection string'); };
  const result = await s.agent.get('/api/auth/me').expect(500);
  assert.equal(result.body.error, 'server_error'); assert.doesNotMatch(result.text, /connection string/);
});
test('production rejects insecure URLs and missing secrets', () => {
  assert.throws(() => loadAuthConfig({}), /Missing configuration/);
  assert.throws(() => loadAuthConfig({ NODE_ENV: 'production', DATABASE_URL: 'test', GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', GOOGLE_CALLBACK_URL: config.callbackUrl, FRONTEND_URL: config.frontendUrl, SESSION_SECRET: config.secret }), /Invalid URL/);
});

test('missing callback state or code is rejected', async () => {
  const s = await setup();
  assert.match((await s.agent.get('/api/auth/google/callback')).headers.location, /invalid_callback/);
  await s.agent.get('/api/auth/google');
  assert.match((await s.agent.get(`/api/auth/google/callback?state=${s.flow.state}`)).headers.location, /invalid_callback/);
  assert.equal(s.calls, 0);
});
test('Google cancellation is presented clearly', async () => {
  const s = await setup(); await s.agent.get('/api/auth/google');
  assert.match((await s.agent.get(`/api/auth/google/callback?error=access_denied&state=${s.flow.state}`)).headers.location, /google_denied/);
});
test('expired OAuth flow is rejected before provider exchange', async () => {
  const s = await setup(); await s.agent.get('/api/auth/google');
  const sessions = await new Promise(resolve => s.store.all((err, result) => resolve(result)));
  for (const [sid, value] of Object.entries(sessions)) {
    value.oauth.createdAt = Date.now() - 600001;
    await new Promise(resolve => s.store.set(sid, value, resolve));
  }
  assert.match((await s.agent.get(`/api/auth/google/callback?code=x&state=${s.flow.state}`)).headers.location, /invalid_callback/);
  assert.equal(s.calls, 0);
});
test('unique email does not link a different Google subject', async () => {
  const s = await setup(); await s.login();
  const other = await setup();
  const provider = { authorizationUrl: value => { other.current = value; return 'https://accounts.google.com'; }, verify: async () => ({ ...identity, sub: 'different-subject', nonce: other.current.nonce }) };
  const agent = request.agent(createApp({ config, pool: s.pool, provider, store: new session.MemoryStore() }));
  await agent.get('/api/auth/google');
  const result = await agent.get(`/api/auth/google/callback?code=x&state=${other.current.state}`);
  assert.match(result.headers.location, /account_conflict/);
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 1);
});
test('PostgreSQL store persists authentication and deletes session on logout', async () => {
  const { default: connectPgSimple } = await import('connect-pg-simple');
  const s = await setup({ postgresEngine: true });
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool: s.pool, tableName: 'auth_sessions', pruneSessionInterval: false });
  const agent = request.agent(createApp({ config, pool: s.pool, provider: s.provider, store }));
  try {
    await agent.get('/api/auth/google').expect(302);
    await agent.get(`/api/auth/google/callback?code=x&state=${s.flow.state}`).expect(302);
    await agent.get('/api/auth/me').expect(200);
    const rows = (await s.pool.query('SELECT * FROM auth_sessions')).rows;
    assert.equal(rows.length, 1); assert.ok(rows[0].sess.userId);
    await agent.post('/api/auth/logout').set('Origin', config.frontendUrl).expect(204);
    assert.equal((await s.pool.query('SELECT * FROM auth_sessions')).rows.length, 0);
  } finally { store.close(); await s.pool.close(); }
});
test('absent OAuth credentials are optional; partial configuration is rejected', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/bracu', GOOGLE_CALLBACK_URL: config.callbackUrl, FRONTEND_URL: config.frontendUrl, SESSION_SECRET: config.secret };
  const development = loadAuthConfig(env);
  assert.equal(development.clientId, undefined);
  assert.throws(() => loadAuthConfig({ ...env, GOOGLE_CLIENT_ID: 'only-one-field' }), /both be configured/);
  assert.equal(loadAuthConfig({...env,NODE_ENV:'production',FRONTEND_URL:'https://transport.example',GOOGLE_CALLBACK_URL:'https://transport.example/api/auth/google/callback'}).clientId,undefined);
});
test('unconfigured Google OAuth fails closed while anonymous me and logout remain available', async () => {
  const s = await setup();
  const local = { ...config, clientId: '', clientSecret: '' };
  const agent = request.agent(createApp({ config: local, pool: s.pool, store: new session.MemoryStore() }));
  const result = await agent.get('/api/auth/google').expect(503);
  assert.equal(result.body.error, 'oauth_not_configured');
  await agent.get('/api/auth/me').expect(401);
  await agent.post('/api/auth/logout').set('Origin', config.frontendUrl).expect(204);
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 0);
});
for (const email of [
  'saeeb.rahman.samin@g.bracu.ac.bd', 'tasnim.alam.lisan@g.bracu.ac.bd',
  'tasnim.rosa@g.bracu.ac.bd', 'rahim.hasan@g.bracu.ac.bd',
  'alpha.beta.gamma.delta.epsilon.zeta.eta.theta@g.bracu.ac.bd'
]) {
  test('accepts dotted student name: ' + email, () => {
    assert.equal(validateIdentity({ ...identity, email }, config).email, email);
  });
}

test('normalizes verified mixed-case email and Workspace domain', () => {
  assert.equal(validateIdentity({ ...identity, email: 'Alpha.Beta@G.BRACU.AC.BD', hd: 'G.BRACU.AC.BD' }, config).email, 'alpha.beta@g.bracu.ac.bd');
});

for (const email of [
  'tasnim@gmail.com', 'alpha.beta@other.edu', 'tasnim@g.bracu.com',
  '', '@g.bracu.ac.bd', 'tasnim@g.bracu.ac.bd', 'tasnim..rosa@g.bracu.ac.bd',
  'tasnim rosa@g.bracu.ac.bd', '.alpha.beta@g.bracu.ac.bd', 'alpha.beta.@g.bracu.ac.bd',
  'alpha1.beta@g.bracu.ac.bd', 'alpha-beta.gamma@g.bracu.ac.bd',
  'alpha_beta.gamma@g.bracu.ac.bd', 'alpha.beta+tag@g.bracu.ac.bd',
  'alpha.beta@g.bracu.ac.bd.evil.com', ' alpha.beta@g.bracu.ac.bd',
  'alpha.beta@g.bracu.ac.bd ', 'alpha.beta@g.bracu.ac.bd\n',
  'a.b.c.d.e.f.g.h.i@g.bracu.ac.bd', 'a'.repeat(63) + '.b@g.bracu.ac.bd',
  undefined, null, 123
]) {
  test('rejects malformed or ineligible student email: ' + JSON.stringify(email), () => {
    assert.throws(() => validateIdentity({ ...identity, email }, config), /invalid_institution/);
  });
}

test('accepts the local-part length boundary', () => {
  const email = 'a'.repeat(62) + '.b@g.bracu.ac.bd';
  assert.equal(validateIdentity({ ...identity, email }, config).email, email);
});

test('validation is generic across generated alphabetic student names', () => {
  for (let index = 0; index < 26; index++) {
    const component = String.fromCharCode(97 + index).repeat(3);
    const email = component + '.example@g.bracu.ac.bd';
    assert.equal(validateIdentity({ ...identity, email }, config).email, email);
  }
});

test('frontend email cannot override a rejected verified Google identity', async () => {
  const s = await setup({ claims: { email: 'single@g.bracu.ac.bd' } });
  const result = await s.login('&email=alpha.beta%40g.bracu.ac.bd');
  assert.match(result.headers.location, /invalid_institution/);
  assert.equal(s.calls, 1);
  assert.equal((await s.pool.query('SELECT * FROM users')).rows.length, 0);
});

test('normalized email from Google is persisted instead of frontend email', async () => {
  const s = await setup({ claims: { email: 'Alpha.Beta@G.BRACU.AC.BD' } });
  await s.login('&email=other.person%40g.bracu.ac.bd');
  const me = await s.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.email, 'alpha.beta@g.bracu.ac.bd');
  assert.equal(me.body.role, 'student');
});
