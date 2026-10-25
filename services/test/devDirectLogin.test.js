import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import request from 'supertest';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../src/app.js';
import {loadAuthConfig} from '../src/config/auth.js';
import {isLoopbackLoginRequest} from '../src/config/devEmailLogin.js';
const env={NODE_ENV:'development',DEV_DIRECT_LOGIN:'true',DATABASE_URL:'postgresql://localhost/bracu',FRONTEND_URL:'http://localhost:5173',GOOGLE_CALLBACK_URL:'http://localhost:3000/api/auth/google/callback',SESSION_SECRET:'development-login-test-secret-over-32-characters'};

test('direct login requires explicit development flag and loopback configuration',()=>{
 assert.equal(loadAuthConfig(env).devDirectLogin,true);
 assert.equal(loadAuthConfig({...env,DEV_DIRECT_LOGIN:'false'}).devDirectLogin,false);
 for(const NODE_ENV of ['production','test',undefined])assert.throws(()=>loadAuthConfig({...env,NODE_ENV}),/NODE_ENV=development/);
 for(const values of [{DATABASE_URL:'postgresql://remote.example/bracu'},{FRONTEND_URL:'https://remote.example'}])assert.throws(()=>loadAuthConfig({...env,...values}),/loopback/);
 assert.equal(isLoopbackLoginRequest({socket:{remoteAddress:'192.168.1.5'},hostname:'localhost',ip:'127.0.0.1'}),false);
 assert.equal(isLoopbackLoginRequest({socket:{remoteAddress:'127.0.0.1'},hostname:'evil.example'}),false);
});

test('production and non-development configurations never mount direct authentication',async()=>{
 for(const config of [loadAuthConfig({...env,NODE_ENV:'production',DEV_DIRECT_LOGIN:'false',FRONTEND_URL:'https://transport.example',GOOGLE_CALLBACK_URL:'https://transport.example/api/auth/google/callback'}),{...loadAuthConfig(env),nodeEnv:'production',devDirectLogin:true},{...loadAuthConfig(env),nodeEnv:'test'}]){
  const app=createApp({config,pool:{query(){throw new Error('No database access allowed');}},store:new session.MemoryStore()});
  await request(app).post('/api/auth/development/email-login').set('Origin',config.frontendUrl).send({email:'lisan.taslim@g.bracu.ac.bd'}).expect(404);
  await request(app).get('/api/auth/me').expect(401);
 }
});

test('direct development login reuses student account, session rotation, expiry and logout',async()=>{
 const pool=new PGlite(),config=loadAuthConfig(env),store=new session.MemoryStore();
 try{
  for(const name of ['001_authentication.sql','002_email_login.sql'])await pool.exec(await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8'));
  await pool.exec("ALTER TABLE users DROP CONSTRAINT users_role_check; INSERT INTO users(google_subject,name,email,role) VALUES('authority','Authority','authority@g.bracu.ac.bd','authority')");
  const app=createApp({config,pool,store}),agent=request.agent(app);
  const login=(email,client=agent)=>client.post('/api/auth/development/email-login').set('Origin',config.frontendUrl).send({email,role:'authority',userId:1});
  await request(app).post('/api/auth/development/email-login').set('Origin','https://evil.example').send({email:'lisan.taslim@g.bracu.ac.bd'}).expect(403);
  await request(app).post('/api/auth/development/email-login').set('Host','evil.example').set('Origin',config.frontendUrl).send({email:'lisan.taslim@g.bracu.ac.bd'}).expect(403);
  for(const email of ['wrong@gmail.com','a..b@g.bracu.ac.bd','lisan@g.bracu.ac.bd.evil.com',' lisan@g.bracu.ac.bd'])await login(email).expect(400);
  assert.equal((await login('authority@g.bracu.ac.bd').expect(200)).body.user.role,'authority');
  const first=await login('lisan.taslim@g.bracu.ac.bd').expect(200);
  assert.equal(first.body.authenticated,true);assert.equal(first.body.user.role,'student');
  assert.equal((await pool.query('SELECT * FROM email_login_tokens')).rows.length,0);
  assert.equal((await agent.get('/api/auth/me').expect(200)).body.email,'lisan.taslim@g.bracu.ac.bd');
  const oldCookie=first.headers['set-cookie'][0].split(';')[0];
  const second=await login('LISAN.TASLIM@G.BRACU.AC.BD').expect(200);
  assert.equal(second.body.user.id,first.body.user.id);
  assert.notEqual(second.headers['set-cookie'][0].split(';')[0],oldCookie);
  await request(app).get('/api/auth/me').set('Cookie',oldCookie).expect(401);
  const stored=await new Promise((resolve,reject)=>store.all((error,sessions)=>error?reject(error):resolve(sessions)));
  assert.ok(Object.values(stored).some(s=>s.userId===first.body.user.id&&s.authExpiresAt>Date.now()));
  await agent.post('/api/auth/logout').set('Origin',config.frontendUrl).expect(204);
  await agent.get('/api/auth/me').expect(401);
  await login('another.student@g.bracu.ac.bd').expect(200);
  assert.equal((await pool.query("SELECT count(*) AS n FROM users WHERE role='student'")).rows[0].n,2);
  // Normal email requests still require verification, even with direct login enabled.
  const messages=[];const secureAgent=request.agent(createApp({config,pool,store:new session.MemoryStore(),sendEmail:async value=>messages.push(value)}));
  await secureAgent.post('/api/auth/email').set('Origin',config.frontendUrl).send({email:'lisan.taslim@g.bracu.ac.bd'}).expect(202);
  assert.equal(messages.length,1);await secureAgent.get('/api/auth/me').expect(401);
 }finally{await pool.close();}
});
