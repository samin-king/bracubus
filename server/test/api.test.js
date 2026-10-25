import {testPool} from '../test-support/database.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import {createApp} from '../src/app.js';
import {migrate,seed} from '../src/utils/database.js';
import {validate} from '../src/utils/validation.js';
test('validation rejects invalid capacity, fields, status, dates, times, and driver assignment',()=>{
 for(const body of [{capacity:0,bus_number:'x'},{capacity:1},{capacity:1,bus_number:'x',status:'BAD'}]) assert.throws(()=>validate('bus',body));
 assert.throws(()=>validate('route',{route_name:'x',origin:'x',destination:'x',stops:[null]}));
 const trip={bus_id:1,route_id:1,travel_date:'2026-10-20',departure_time:'06:30'};
 for(const body of [{...trip,bus_id:0},{...trip,route_id:'x'},{...trip,travel_date:'2026-02-30'},{...trip,departure_time:'24:00'},{...trip,status:'BAD'},{...trip,driver_id:1}]) assert.throws(()=>validate('trip',body));
 assert.equal(validate('trip',trip).status,'SCHEDULED');
});
test('API returns JSON 404 and malformed JSON errors',async()=>{
 const app=createApp({query:async()=>({rows:[]})},{authorizeManagement:(req,res,next)=>next()});
 await request(app).get('/api/missing').expect(404);
 await request(app).get('/api/buses/999').expect(404);
 await request(app).get('/api/buses/nope').expect(400);
 await request(app).post('/api/buses').set('Content-Type','application/json').send('{').expect(400);
 await request(app).post('/api/buses').send({capacity:0}).expect(400);
});
test('PostgreSQL integration', {},async t=>{
 const pool=await testPool();
 const db=await pool.connect();
 const schema='test_transport_'+Date.now();
 try {
  await db.query('CREATE SCHEMA '+schema);
  await db.query('SET search_path TO '+schema);
  await migrate(db);
  const app=createApp(db,{authorizeManagement:(req,res,next)=>next()});
  const busData={bus_number:'TEST-01',registration_number:'TEST-REG',capacity:37};
  const routeData={route_name:'Test route',origin:'Mirpur',destination:'BRAC University',stops:['Mirpur','BRAC University']};
  let bus,route,trip;
  await t.test('create bus',async()=>{bus=(await request(app).post('/api/buses').send(busData).expect(201)).body;});
  await t.test('retrieve buses and single bus',async()=>{assert.equal((await request(app).get('/api/buses').expect(200)).body.length,1);assert.equal((await request(app).get('/api/buses/'+bus.id).expect(200)).body.capacity,37);});
  await t.test('duplicate bus number and registration rejected',async()=>{await request(app).post('/api/buses').send({...busData,registration_number:'other'}).expect(409);await request(app).post('/api/buses').send({...busData,bus_number:'other'}).expect(409);});
  await t.test('invalid capacity rejected',async()=>{await request(app).post('/api/buses').send({...busData,capacity:-1}).expect(400);});
  await t.test('create route and retrieve list and single',async()=>{route=(await request(app).post('/api/routes').send(routeData).expect(201)).body;assert.equal((await request(app).get('/api/routes').expect(200)).body.length,1);assert.deepEqual((await request(app).get('/api/routes/'+route.id).expect(200)).body.stops,routeData.stops);});
  await t.test('invalid route rejected',async()=>{await request(app).post('/api/routes').send({...routeData,origin:''}).expect(400);});
  const tripData={bus_id:bus.id,route_id:route.id,travel_date:'2026-10-20',departure_time:'06:30'};
  await t.test('create trip with bus and route relationships',async()=>{trip=(await request(app).post('/api/trips').send(tripData).expect(201)).body;assert.equal(trip.bus.bus_number,busData.bus_number);assert.equal(trip.route.route_name,routeData.route_name);assert.equal(trip.driver_id,null);assert.equal(trip.travel_date,tripData.travel_date);});
  await t.test('retrieve trips and single trip',async()=>{assert.equal((await request(app).get('/api/trips').expect(200)).body.length,1);assert.equal((await request(app).get('/api/trips/'+trip.id).expect(200)).body.bus.id,bus.id);});
  await t.test('invalid bus, route, date, time, status rejected',async()=>{
   for(const change of [{bus_id:99999},{route_id:99999},{travel_date:'2026-02-30'},{departure_time:'25:00'},{status:'BAD'}]) await request(app).post('/api/trips').send({...tripData,...change}).expect(400);
  });
  await t.test('duplicate departure rejected',async()=>{await request(app).post('/api/trips').send(tripData).expect(409);});
  await t.test('PUT bus route and trip; missing records return 404',async()=>{
   await request(app).put('/api/buses/'+bus.id).send({...busData,capacity:28}).expect(200);
   await request(app).put('/api/routes/'+route.id).send({...routeData,origin:'Uttara'}).expect(200);
   await request(app).put('/api/trips/'+trip.id).send({...tripData,status:'CANCELLED'}).expect(200);
   await request(app).post('/api/trips').send(tripData).expect(201);
   for(const resource of ['buses','routes','trips']) await request(app).get('/api/'+resource+'/99999').expect(404);
   await request(app).put('/api/trips/99999').send(tripData).expect(404);
  });
  await t.test('database constraints reject bypassed validation and deletion',async()=>{
   await assert.rejects(db.query("INSERT INTO buses(bus_number,capacity) VALUES ('bad',0)"),{code:'23514'});
   await assert.rejects(db.query("INSERT INTO trips(bus_id,route_id,travel_date,departure_time) VALUES (99999,$1,'2026-10-20','09:00')",[route.id]),{code:'23503'});
   await assert.rejects(db.query("UPDATE trips SET status='BAD' WHERE id=$1",[trip.id]),{code:'23514'});
   await assert.rejects(db.query('DELETE FROM buses WHERE id=$1',[bus.id]),error=>['23503','23001'].includes(error.code));
   await assert.rejects(db.query('DELETE FROM routes WHERE id=$1',[route.id]),error=>['23503','23001'].includes(error.code));
   await assert.rejects(db.query('UPDATE trips SET driver_id=99999 WHERE id=$1',[trip.id]),{code:'23503'});
  });
  await t.test('standing capacity is configurable and legacy bus updates preserve it',async()=>{
   const updated=(await request(app).put('/api/buses/'+bus.id).send({...busData,capacity:28,standing_capacity:3}).expect(200)).body;
   assert.equal(updated.standing_capacity,3);
   const legacy=(await request(app).put('/api/buses/'+bus.id).send({...busData,capacity:28}).expect(200)).body;
   assert.equal(legacy.standing_capacity,3);
   for(const standing_capacity of [-1,1.5,'2',2147483648])await request(app).put('/api/buses/'+bus.id).send({...busData,standing_capacity}).expect(400);
   assert.equal((await request(app).put('/api/buses/'+bus.id).send({...busData,standing_capacity:0}).expect(200)).body.standing_capacity,0);
  });
  await t.test('migration and seed are repeatable',async()=>{await migrate(db);await seed(db);const count=(await db.query('SELECT count(*) FROM trips')).rows[0].count;await seed(db);assert.equal((await db.query('SELECT count(*) FROM trips')).rows[0].count,count);});
 } finally {await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();}
});
