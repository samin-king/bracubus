import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import session from 'express-session';
import request from 'supertest';
import {migrate} from '../../server/src/utils/database.js';
import {createApp} from '../src/app.js';
import {createDatabaseTripCatalog} from '../src/services/tripCatalog.js';

test('all four members share verified sessions, transport trips and complaints',async()=>{
 const engine=new PGlite();
 const client={async query(sql,params){const r=params?await engine.query(sql,params):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.rows?.length||r?.affectedRows||0};},release(){}};
 const pool={query:client.query,connect:async()=>client};
 const config={frontendUrl:'http://localhost:5173',domain:'g.bracu.ac.bd',secret:'integration-test-secret-at-least-32-characters',cookieName:'sid',ttlMs:3600000,secure:false};
 const messages=[];
 try {
  await migrate(client);await migrate(client);
  await client.query("INSERT INTO users(google_subject,name,email,gender,gender_verified) VALUES('integration','Student','student@g.bracu.ac.bd','female',true)");
  await client.query("INSERT INTO users(google_subject,name,email,role) VALUES('authority','Authority','authority@g.bracu.ac.bd','authority')");
  await client.query("INSERT INTO buses(bus_number,capacity) VALUES('INT-01',37)");
  await client.query("INSERT INTO routes(route_name,origin,destination) VALUES('Campus route','City','Campus')");
  await client.query("INSERT INTO trips(bus_id,route_id,travel_date,departure_time) VALUES(1,1,'2030-01-02','14:00')");
  const app=createApp({config,pool,store:new session.MemoryStore(),tripCatalog:createDatabaseTripCatalog(pool),clock:()=>new Date('2030-01-02T05:00:00Z'),sendEmail:async m=>messages.push(m)});
  const student=request.agent(app),authority=request.agent(app);
  const post=(agent,url,body)=>agent.post(url).set('Origin',config.frontendUrl).send(body);
  async function login(agent,email){await post(agent,'/api/auth/email',{email}).expect(202);const token=new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('email_token');await post(agent,'/api/auth/email/verify',{token}).expect(200);}
  await request(app).get('/api/trips').expect(401);
  await login(student,'student@g.bracu.ac.bd');
  const trips=(await student.get('/api/student/trips?date=2030-01-02').expect(200)).body;
  assert.equal(trips[0].bus,'INT-01');assert.equal(trips[0].bookingOpen,true);
  const booking=(await post(student,'/api/student/bookings',{tripId:trips[0].id,travelDate:'2030-01-02',seatNumber:1}).expect(201)).body;
  const complaint=(await post(student,'/api/student/complaints',{category:'Late bus',subject:'Delay',description:'Bus was delayed',bookingId:booking.id}).expect(201)).body;
  assert.equal((await student.get('/api/complaints').expect(200)).body[0].id,Number(complaint.id));
  await post(student,'/api/feedback',{target:'trip',trip_id:1,rating:4}).expect(201);
  await post(student,'/api/buses',{bus_number:'FORGED',capacity:37}).expect(403);
  await student.patch('/api/notifications/read-all').set('Origin','https://evil.example').expect(403);
  await login(authority,'authority@g.bracu.ac.bd');
  await authority.patch('/api/authority/complaints/'+complaint.id).set('Origin',config.frontendUrl).send({status:'resolved',response:'Reviewed'}).expect(200);
  const detail=(await student.get('/api/student/complaints/'+complaint.id).expect(200)).body;
  assert.equal(detail.status,'Resolved');assert.equal(detail.response,'Reviewed');
  assert.equal((await student.get('/api/notifications/unread-count').expect(200)).body.count,2);
  await student.patch('/api/notifications/read-all').set('Origin',config.frontendUrl).expect(200);
  assert.equal((await student.get('/api/notifications/unread-count').expect(200)).body.count,0);
  await post(student,'/api/student/bookings/'+booking.id+'/cancel',{}).expect(200);
  await post(student,'/api/auth/logout',{}).expect(204);
  await student.get('/api/student/bookings').expect(401);
 }finally{await engine.close();}
});
import {readFile} from 'node:fs/promises';
test('migration upgrades existing Member 1/2 records without replacing complaints',async()=>{
 const engine=new PGlite();
 const client={async query(sql,params){const r=params?await engine.query(sql,params):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.rows?.length||r?.affectedRows||0};}};
 try{
  for(const name of ['001_authentication.sql','002_email_login.sql','002_member2.sql'])await engine.exec(await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8'));
  await engine.exec("CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(name) VALUES('001_authentication.sql'),('002_email_login.sql'),('002_member2.sql'); INSERT INTO users(google_subject,name,email) VALUES('legacy','Legacy Student','legacy@g.bracu.ac.bd'); INSERT INTO complaints(student_id,category,subject,description,trip_id) VALUES(1,'Late bus','Original subject','Original description','legacy-trip');");
  await migrate(client);await migrate(client);
  const {rows}=await client.query('SELECT * FROM complaints');
  assert.equal(rows.length,1);assert.equal(rows[0].description,'Original description');assert.equal(rows[0].trip_id,'legacy-trip');assert.equal(rows[0].user_id,'1');assert.equal(rows[0].status,'pending');
 }finally{await engine.close();}
});
