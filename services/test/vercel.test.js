import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { createVercelHandler } from '../src/vercel.js';
import defaultHandler from '../../api/index.mjs';
import { createApp } from '../src/app.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { migrate } from '../../server/src/utils/database.js';

const env={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',
  VERCEL_PROJECT_PRODUCTION_URL:'transport.example',DATABASE_URL:'unused-test-setting',
  SESSION_SECRET:'automated-test-session-secret-at-least-32-characters'};

test('Vercel config needs no Google or SMTP; origin comes only from platform settings', () => {
  const c=loadAuthConfig(env);
  assert.equal(c.frontendUrl,'https://transport.example');
  assert.equal(c.callbackUrl,undefined);assert.equal(c.secure,true);assert.equal(c.trustProxy,true);
  assert.equal(c.cookieName,'__Host-bracu.sid');assert.equal(c.devDirectLogin,false);
  assert.equal(loadAuthConfig({...env,VERCEL_ENV:'preview',VERCEL_URL:'preview.example'}).frontendUrl,'https://preview.example');
  assert.throws(()=>loadAuthConfig({...env,GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'}),/GOOGLE_CALLBACK_URL/);
  assert.throws(()=>loadAuthConfig({...env,DEV_DIRECT_LOGIN:'true'}),/requires explicit NODE_ENV=development/);
});

test('actual function entrypoint imports without startup secrets; config failures return safe JSON', async () => {
  assert.equal(typeof defaultHandler,'function');
  const handler=createVercelHandler({env:{}});
  const result=await request(handler).get('/api/auth/me').expect(503);
  assert.equal(result.body.error,'service_not_configured');
  for(const flag of ['DEV_DIRECT_LOGIN','DEV_EMAIL_LOGIN','ENABLE_DEV_DRIVER_AUTH']) {
    await request(createVercelHandler({env:{...env,[flag]:'true'}})).get('/api/auth/me').expect(503);
  }
});

test('serverless integrated routes retain persistent sessions, secure cookies and one-time tokens', async () => {
  const engine=new PGlite();
  const db={async query(sql,params){const r=params?await engine.query(sql,params):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.rows?.length||r?.affectedRows||0};},release(){}};
  const pool={query:db.query,connect:async()=>db};
  const messages=[];let pools=0;let managed=0;
  const make=delivery=>createVercelHandler({env,poolFactory:()=>{pools++;return pool;},managePool:()=>{managed++;},
    appFactory:options=>createApp({...options,...(delivery?{sendEmail:async m=>messages.push(m)}:{})})});
  const origin='https://transport.example';
  const post=(handler,path,body,cookie)=>request(handler).post(path).set('Origin',origin)
    .set('X-Forwarded-Proto','https').set('Cookie',cookie||'').send(body);
  try {
    await migrate(db);await migrate(db);
    await db.query("INSERT INTO users(google_subject,name,email) VALUES('test','Test','student@g.bracu.ac.bd')");
    const missing=make(false);
    await request(missing).get('/api/auth/me').expect(401);
    const unavailable=await post(missing,'/api/auth/email',{email:'student@g.bracu.ac.bd'}).expect(503);
    assert.equal(unavailable.body.error,'email_not_configured');
    assert.equal((await request(missing).get('/api/auth/google').expect(503)).body.error,'oauth_not_configured');
    const handler=make(true);
    for(const path of ['/api/student/profile','/api/buses','/api/routes','/api/trips','/api/drivers/me','/api/complaints','/api/feedback','/api/notifications','/api/authority/complaints']) {
      await request(handler).get(path).expect(401);
    }
    await post(handler,'/api/auth/development/email-login',{email:'student@g.bracu.ac.bd'}).expect(404);
    await request(handler).post('/api/auth/email').set('Origin','https://other.example').send({email:'student@g.bracu.ac.bd'}).expect(403);
    await post(handler,'/api/auth/email',{email:'student@g.bracu.ac.bd'}).expect(202);
    const token=new URLSearchParams(new URL(messages[0].url).hash.slice(1)).get('email_token');
    const verified=await post(handler,'/api/auth/email/verify',{token}).expect(200);
    const cookie=verified.headers['set-cookie'][0];
    for(const marker of ['__Host-bracu.sid=','Secure','HttpOnly','SameSite=Lax','Path=/']) assert.ok(cookie.includes(marker));
    assert.ok(!cookie.includes('Domain='));const credential=cookie.split(';')[0];
    await post(handler,'/api/auth/email/verify',{token}).expect(401);
    const cold=make(true);
    assert.equal((await request(cold).get('/api/auth/me').set('Cookie',credential).expect(200)).body.email,'student@g.bracu.ac.bd');
    await request(cold).get('/api/student/profile').set('Cookie',credential).expect(200);
    for(const path of ['/api/buses','/api/routes','/api/trips','/api/complaints','/api/feedback','/api/notifications']) {
      await request(cold).get(path).set('Cookie',credential).expect(200);
    }
    await request(cold).get('/api/authority/complaints').set('Cookie',credential).expect(403);
    assert.equal(pools,3);assert.equal(managed,3);
    await post(cold,'/api/auth/logout',{},credential).expect(204);
    await request(handler).get('/api/auth/me').set('Cookie',credential).expect(401);
  } finally {await engine.close();}
});

test('root routing and lockfile paths are Vercel/Linux compatible', async () => {
  const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.rewrites[0].source,'/api/:path*');
  assert.equal(config.rewrites[0].destination,'/api/index');
  const fallback=new RegExp('^'+config.rewrites[1].source+'$');
  for(const path of ['/api','/api/','/api/auth/me','/api/student/trips']) assert.equal(fallback.test(path),false);
  for(const path of ['/login','/driver','/book','/profile']) assert.equal(fallback.test(path),true);
  assert.equal(config.outputDirectory,'Client/dist');
  const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
  assert.ok(lock.packages.Client);assert.equal(lock.packages['node_modules/transport-client'].resolved,'Client');
  assert.ok(!Object.keys(lock.packages).some(p=>p==='client'||p.startsWith('client/')));
});

test('deployment build fails before publication when migration database configuration is missing', () => {
  const child=spawnSync(process.execPath,['scripts/build-vercel.mjs'],{
    cwd:fileURLToPath(new URL('../../',import.meta.url)),
    env:{...process.env,VERCEL_ENV:'production',DATABASE_URL:''},encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,1);assert.match(child.stderr,/DATABASE_URL is required/);
});
