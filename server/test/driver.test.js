import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {testPool} from '../test-support/database.js';
import {migrate,seed} from '../src/utils/database.js';
import {createApp} from '../src/app.js';
import {developmentIdentity} from '../src/middleware/driverIdentity.js';

test('Driver authorization rejects browser identity and defaults closed',async()=>{
 const app=createApp({query:async()=>({rows:[]})},{authenticateDriver:(req,res,next)=>next()});
 await request(app).post('/api/trips/1/start').set('x-driver-id','1').send({driver_id:1}).expect(401);
 await request(app).post('/api/trips/1/stop').expect(401);
 await request(app).get('/api/drivers/me').expect(401);
 await request(app).get('/api/drivers/1/trips').expect(401);
 const old={node:process.env.NODE_ENV,flag:process.env.ENABLE_DEV_DRIVER_AUTH,id:process.env.DEV_DRIVER_ID};
 try {
  process.env.NODE_ENV='production';process.env.ENABLE_DEV_DRIVER_AUTH='true';process.env.DEV_DRIVER_ID='1';
  let req={};developmentIdentity(req,{},()=>{});assert.equal(req.auth,undefined);
  await request(app).post('/api/drivers').send({name:'x',license_number:'x'}).expect(403);
  process.env.NODE_ENV='development';req={};developmentIdentity(req,{},()=>{});assert.equal(req.auth.driver_id,1);
 } finally {
  for(const [name,value] of Object.entries({NODE_ENV:old.node,ENABLE_DEV_DRIVER_AUTH:old.flag,DEV_DRIVER_ID:old.id})) {if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});

test('Driver PostgreSQL workflow and relationships',async t=>{
 const pool=await testPool(),db=await pool.connect();
 const schema='driver_test_'+Date.now();
 try {
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);
  let identity=1;
  const app=createApp(db,{authenticateDriver:(req,res,next)=>{req.auth={role:'driver',driver_id:identity};next();},authorizeManagement:(req,res,next)=>next()});
  const post=(url,body)=>request(app).post(url).send(body);
  let driver,other,inactive;
  await t.test('create driver',async()=>{driver=(await post('/api/drivers',{name:'Development One',license_number:'TEST-DL-001'}).expect(201)).body;identity=driver.id;});
  await t.test('get drivers',async()=>{assert.equal((await request(app).get('/api/drivers').expect(200)).body.length,1);});
  await t.test('get driver and authenticated profile',async()=>{assert.equal((await request(app).get('/api/drivers/'+driver.id).expect(200)).body.name,driver.name);assert.equal((await request(app).get('/api/drivers/me').expect(200)).body.id,driver.id);});
  await t.test('duplicate license rejected',async()=>{await post('/api/drivers',{name:'Duplicate',license_number:driver.license_number}).expect(409);});
  await t.test('invalid driver payload rejected',async()=>{for(const body of [{},{name:'x',license_number:'x',status:'BAD'},{name:' ',license_number:'x'}]) await post('/api/drivers',body).expect(400);});
  other=(await post('/api/drivers',{name:'Development Two',license_number:'TEST-DL-002'})).body;
  inactive=(await post('/api/drivers',{name:'Development Inactive',license_number:'TEST-DL-003',status:'INACTIVE'})).body;
  const bus=(await post('/api/buses',{bus_number:'DRIVER-BUS-1',capacity:37})).body;
  const bus2=(await post('/api/buses',{bus_number:'DRIVER-BUS-2',capacity:28})).body;
  const route=(await post('/api/routes',{route_name:'Driver route',origin:'Mirpur',destination:'BRACU',stops:['Mirpur','BRACU']})).body;
  let counter=0;
  const makeTrip=async(status='SCHEDULED',assigned=null,busId=bus.id,time=null)=>{
   const departure=time||'08:'+String(counter++).padStart(2,'0');
   return (await db.query('INSERT INTO trips(bus_id,route_id,driver_id,travel_date,departure_time,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[busId,route.id,assigned,'2026-10-25',departure,status])).rows[0].id;
  };
  let tripId=await makeTrip();
  const assign=(tripId,driverId)=>request(app).put('/api/trips/'+tripId+'/driver').send({driver_id:driverId});
  await t.test('inactive driver cannot be assigned',async()=>{await assign(tripId,inactive.id).expect(409);});
  await t.test('invalid and nonexistent drivers rejected',async()=>{await assign(tripId,99999).expect(404);await assign(tripId,'bad').expect(400);await request(app).put('/api/trips/'+tripId+'/driver').send({}).expect(400);});
  await t.test('assign driver and return driver bus route relationships',async()=>{const trip=(await assign(tripId,driver.id).expect(200)).body;assert.equal(trip.driver.id,driver.id);assert.equal(trip.bus.id,bus.id);assert.equal(trip.route.id,route.id);});
  await t.test('change assigned driver and unassign',async()=>{assert.equal((await assign(tripId,other.id).expect(200)).body.driver.id,other.id);assert.equal((await assign(tripId,null).expect(200)).body.driver,null);await assign(tripId,driver.id).expect(200);});
  await t.test('assigned trips are scoped to authenticated driver',async()=>{const trips=(await request(app).get('/api/drivers/'+driver.id+'/trips').expect(200)).body;assert.equal(trips.length,1);assert.equal(trips[0].bus.id,bus.id);await request(app).get('/api/drivers/'+other.id+'/trips').expect(403);});
  await t.test('same driver departure conflict rejected by database',async()=>{const conflict=await makeTrip('SCHEDULED',null,bus2.id,'08:00');await assign(conflict,driver.id).expect(409);});
  await t.test('driver cannot start another driver trip even with forged body',async()=>{identity=other.id;await post('/api/trips/'+tripId+'/start',{driver_id:driver.id}).expect(403);identity=driver.id;});
  await t.test('unassigned trip cannot start',async()=>{const unassigned=await makeTrip();await post('/api/trips/'+unassigned+'/start',{}).expect(403);});
  await t.test('scheduled trip cannot stop directly',async()=>{await post('/api/trips/'+tripId+'/stop',{}).expect(409);});
  await t.test('assigned driver starts trip and stores timestamp',async()=>{const trip=(await post('/api/trips/'+tripId+'/start',{}).expect(200)).body;assert.equal(trip.status,'ACTIVE');assert.ok(trip.started_at);assert.equal(trip.completed_at,null);});
  await t.test('active trip cannot start twice',async()=>{await post('/api/trips/'+tripId+'/start',{}).expect(409);});
  await t.test('driver cannot operate two active trips',async()=>{const second=await makeTrip('SCHEDULED',driver.id);await post('/api/trips/'+second+'/start',{}).expect(409);});
  await t.test('active trip cannot be reassigned',async()=>{await assign(tripId,other.id).expect(409);});
  await t.test('generic PUT cannot bypass driver state controls',async()=>{await request(app).put('/api/trips/'+tripId).send({bus_id:bus.id,route_id:route.id,travel_date:'2026-10-25',departure_time:'08:00',status:'COMPLETED'}).expect(409);});
  await t.test('driver cannot stop another driver trip',async()=>{identity=other.id;await post('/api/trips/'+tripId+'/stop',{}).expect(403);identity=driver.id;});
  await t.test('assigned driver stops trip and stores completion timestamp',async()=>{const trip=(await post('/api/trips/'+tripId+'/stop',{}).expect(200)).body;assert.equal(trip.status,'COMPLETED');assert.ok(trip.completed_at);assert.ok(Date.parse(trip.completed_at)>=Date.parse(trip.started_at));});
  await t.test('completed trip cannot restart or stop twice',async()=>{await post('/api/trips/'+tripId+'/start',{}).expect(409);await post('/api/trips/'+tripId+'/stop',{}).expect(409);});
  await t.test('cancelled and stopped trips reject start and stop',async()=>{for(const status of ['CANCELLED','STOPPED']){const id=await makeTrip(status,driver.id);await post('/api/trips/'+id+'/start',{}).expect(409);await post('/api/trips/'+id+'/stop',{}).expect(409);}});
  await t.test('inactive driver cannot operate assigned trip',async()=>{const id=await makeTrip('SCHEDULED',inactive.id);identity=inactive.id;await post('/api/trips/'+id+'/start',{}).expect(403);identity=driver.id;});
  await t.test('driver update and missing resources',async()=>{await request(app).put('/api/drivers/'+other.id).send({...other,name:'Updated Development'}).expect(200);await request(app).get('/api/drivers/99999').expect(404);await assign(99999,driver.id).expect(404);await post('/api/trips/99999/start',{}).expect(404);});
  await t.test('driver FK and historical deletion protected',async()=>{await assert.rejects(db.query('DELETE FROM drivers WHERE id=$1',[driver.id]),error=>['23503','23001'].includes(error.code));await assert.rejects(db.query('UPDATE trips SET driver_id=99999 WHERE id=$1',[tripId]),{code:'23503'});});
  await t.test('migration and driver seed preserve existing trips and are repeatable',async()=>{await migrate(db);await seed(db);let count=(await db.query('SELECT count(*) FROM trips')).rows[0].count;await seed(db);assert.equal((await db.query('SELECT count(*) FROM trips')).rows[0].count,count);assert.equal((await db.query('SELECT status FROM trips WHERE id=$1',[tripId])).rows[0].status,'COMPLETED');assert.ok((await db.query('SELECT id FROM trips WHERE driver_id IS NOT NULL')).rows.length>1);});
 } finally {await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();}
});


test('Migration 002 preserves Part 1 trips and null driver assignments',async()=>{
 const pool=await testPool(),db=await pool.connect(),schema='upgrade_driver_'+Date.now();
 try{
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);
  await db.query(await readFile(new URL('../../database/migrations/001_bus_route_trip.sql',import.meta.url),'utf8'));
  await db.query("CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(name) VALUES ('001_bus_route_trip.sql'); INSERT INTO buses(bus_number,capacity) VALUES ('OLD-BUS',37); INSERT INTO routes(route_name,origin,destination) VALUES ('Old route','A','B'); INSERT INTO trips(bus_id,route_id,travel_date,departure_time) VALUES (1,1,'2026-10-25','06:30')");
  await migrate(db);
  const trip=(await db.query('SELECT * FROM trips WHERE id=1')).rows[0];
  assert.equal(trip.bus_id,1);assert.equal(trip.route_id,1);assert.equal(trip.driver_id,null);assert.equal(trip.status,'SCHEDULED');assert.equal(trip.started_at,null);assert.equal(trip.completed_at,null);
  await assert.rejects(db.query('UPDATE trips SET driver_id=99999 WHERE id=1'),{code:'23503'});
 }finally{await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();}
});
