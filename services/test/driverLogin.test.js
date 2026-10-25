import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import request from 'supertest';
import session from 'express-session';
import {migrate,seed} from '../../server/src/utils/database.js';
import {createApp} from '../src/app.js';
import {loadAuthConfig} from '../src/config/auth.js';
const env={NODE_ENV:'development',DEV_DIRECT_LOGIN:'true',DATABASE_URL:'postgresql://localhost/bracu',FRONTEND_URL:'http://localhost:5173',GOOGLE_CALLBACK_URL:'http://localhost:3000/api/auth/google/callback',SESSION_SECRET:'driver-role-tests-with-more-than-32-characters'};

test('registered driver uses Member 1 session and Member 3 ownership/status authorization',async t=>{
 const engine=new PGlite();
 const client={async query(sql,params){const r=params?await engine.query(sql,params):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.rows?.length||r?.affectedRows||0};},release(){}};
 const pool={query:client.query,connect:async()=>client};
 try{
  await migrate(client);await seed(client,{env:{...env,NODE_ENV:'production'}});
  assert.equal((await client.query("SELECT * FROM users WHERE role='driver'")).rows.length,0);
  await seed(client,{env});await seed(client,{env});
  assert.equal((await client.query("SELECT * FROM users WHERE role='driver'")).rows.length,2);
  const config=loadAuthConfig(env),store=new session.MemoryStore(),app=createApp({config,pool,store}),driver=request.agent(app),student=request.agent(app);
  const post=(agent,path,body)=>agent.post(path).set('Origin',config.frontendUrl).send(body);
  const login=(agent,email)=>post(agent,'/api/auth/development/email-login',{email,role:'admin',driver_id:999999});
  const account=(await client.query("SELECT * FROM users WHERE email='driver.one@g.bracu.ac.bd'")).rows[0];
  const other=(await client.query("SELECT * FROM users WHERE email='driver.two@g.bracu.ac.bd'")).rows[0];
  let tripId,otherTrip;
  await t.test('role and driver mapping come from database, not request fields',async()=>{
   const result=(await login(driver,account.email).expect(200)).body;
   assert.equal(result.user.role,'driver');assert.equal(result.user.driver_id,account.driver_id);
   const stored=await new Promise((resolve,reject)=>store.all((e,s)=>e?reject(e):resolve(s)));
   assert.ok(Object.values(stored).some(s=>s.userId===account.id&&s.user.email===account.email&&s.user.role==='driver'&&s.user.driver_id===account.driver_id));
  });
  await t.test('fresh requests preserve driver identity and expose only assigned trips',async()=>{
   const me=(await driver.get('/api/auth/me').expect(200)).body;assert.equal(me.role,'driver');assert.equal(me.driver_id,account.driver_id);
   const profile=(await driver.get('/api/drivers/me').expect(200)).body;assert.equal(profile.id,account.driver_id);
   const own=(await driver.get('/api/drivers/me/trips').expect(200)).body;assert.ok(own.length);assert.ok(own.every(t=>t.driver_id===account.driver_id));tripId=own.find(t=>t.status==='SCHEDULED').id;
   assert.ok((await driver.get('/api/trips').expect(200)).body.every(t=>t.driver_id===account.driver_id));
  });
  await t.test('other driver trip/profile changes are denied even with forged identity',async()=>{
   otherTrip=(await client.query('SELECT id FROM trips WHERE driver_id=$1 LIMIT 1',[other.driver_id])).rows[0].id;
   await driver.get('/api/drivers/'+other.driver_id+'/trips').set('x-driver-id',String(other.driver_id)).expect(403);
   await driver.get('/api/trips/'+otherTrip).expect(403);
   await post(driver,'/api/trips/'+otherTrip+'/start',{driver_id:other.driver_id}).expect(403);
   await post(driver,'/api/trips/'+otherTrip+'/stop',{}).expect(403);
   await driver.get('/api/student/bookings').expect(403);
   await driver.get('/api/student/profile').expect(403);
   await driver.patch('/api/student/profile').set('Origin',config.frontendUrl).send({gender:'female'}).expect(403);
   await post(driver,'/api/student/bookings',{}).expect(403);
   await driver.get('/api/complaints').expect(403);
   await post(driver,'/api/drivers',{name:'Forged',license_number:'FORGED'}).expect(403);
  });
  await t.test('driver starts and stops only their own permitted trip',async()=>{
   assert.equal((await post(driver,'/api/trips/'+tripId+'/start',{}).expect(200)).body.status,'ACTIVE');
   await post(driver,'/api/trips/'+tripId+'/start',{}).expect(409);
   assert.equal((await post(driver,'/api/trips/'+tripId+'/stop',{}).expect(200)).body.status,'COMPLETED');
  });
  await t.test('student login is unchanged and cannot invoke driver controls',async()=>{
   assert.equal((await login(student,'student.test@g.bracu.ac.bd').expect(200)).body.user.role,'student');
   await student.get('/api/student/bookings').expect(200);
   await student.get('/api/drivers/me').expect(401);
   await student.get('/api/drivers/'+account.driver_id+'/trips').expect(401);
   await post(student,'/api/trips/'+tripId+'/start',{driver_id:account.driver_id}).expect(401);
   assert.equal((await student.get('/api/auth/me').expect(200)).body.role,'student');
  });
  await t.test('a driver link on a student account cannot grant driver privileges',async()=>{
   const guard=(await client.query("INSERT INTO drivers(name,license_number) VALUES('Guard Driver','ROLE-GUARD') RETURNING id")).rows[0];
   await client.query("UPDATE users SET driver_id=$1 WHERE email='student.test@g.bracu.ac.bd'",[guard.id]);
   await student.get('/api/drivers/me').expect(403);await post(student,'/api/trips/'+tripId+'/start',{}).expect(403);
   await client.query("UPDATE users SET driver_id=NULL WHERE email='student.test@g.bracu.ac.bd'");
  });
  await t.test('inactive or unlinked driver accounts fail closed, including existing sessions',async()=>{
   await client.query("UPDATE drivers SET status='INACTIVE' WHERE id=$1",[account.driver_id]);
   await driver.get('/api/auth/me').expect(401);await login(request.agent(app),account.email).expect(403);
   await client.query("UPDATE drivers SET status='ACTIVE' WHERE id=$1",[account.driver_id]);
   await client.query('UPDATE users SET driver_id=NULL WHERE id=$1',[account.id]);
   await driver.get('/api/auth/me').expect(401);await login(request.agent(app),account.email).expect(403);
   await client.query('UPDATE users SET driver_id=$2 WHERE id=$1',[account.id,account.driver_id]);
  });
  await t.test('logout invalidates driver session',async()=>{
   await login(driver,account.email).expect(200);await post(driver,'/api/auth/logout',{}).expect(204);await driver.get('/api/auth/me').expect(401);await driver.get('/api/drivers/me').expect(401);
  });
  await t.test('normal email verification also resolves the existing driver role',async()=>{
   const messages=[],mail=request.agent(createApp({config,pool,store:new session.MemoryStore(),sendEmail:async m=>messages.push(m)}));
   await post(mail,'/api/auth/email',{email:account.email}).expect(202);await mail.get('/api/auth/me').expect(401);
   const token=new URLSearchParams(new URL(messages[0].url).hash.slice(1)).get('email_token');
   assert.equal((await post(mail,'/api/auth/email/verify',{token}).expect(200)).body.role,'driver');
   await mail.get('/api/drivers/me').expect(200);await post(mail,'/api/auth/email/verify',{token}).expect(401);
  });
 }finally{await engine.close();}
});
