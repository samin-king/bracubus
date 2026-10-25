import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {testPool} from '../test-support/database.js';
import {migrate,seed} from '../src/utils/database.js';
import {createApp} from '../src/app.js';
import {notificationService} from '../src/services/notificationService.js';
import {complaintService} from '../src/services/complaintService.js';

test('Member 4 defaults closed and ignores forged browser identity',async()=>{
 const app=createApp({query:async()=>{throw new Error('Should not reach database');}});
 for(const url of ['/api/complaints','/api/feedback','/api/notifications','/api/notifications/unread-count','/api/authority/complaints'])
  await request(app).get(url).set('x-user-id','1').set('x-role','authority').query({user_id:'1',role:'authority'}).expect(401);
 await request(app).post('/api/complaints').send({user_id:'1',role:'authority',category:'service',description:'Forged'}).expect(401);
 await request(app).patch('/api/notifications/read-all').expect(401);
 await request(app).patch('/api/notifications/1/read').expect(401);
});

test('Member 4 PostgreSQL workflows, ownership and integration',async t=>{
 const pool=await testPool(),db=await pool.connect(),schema='member4_'+Date.now();
 let identity={user_id:'1',role:'student'};
 const app=createApp(db,{authenticateUser:(req,res,next)=>{req.auth=identity;next();}});
 const get=url=>request(app).get(url);
 const post=(url,body)=>request(app).post(url).send(body);
 const patch=(url,body)=>request(app).patch(url).send(body);
 let complaintId,otherId;
 try {
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);await seed(db);await db.query("INSERT INTO users(google_subject,name,email,role) VALUES ('s1','One','one@g.bracu.ac.bd','student'),('s2','Two','two@g.bracu.ac.bd','student'),('a1','Authority','authority@g.bracu.ac.bd','authority'),('a2','Admin','admin@g.bracu.ac.bd','admin')");
  const trip=(await db.query('SELECT id,bus_id,route_id FROM trips LIMIT 1')).rows[0];
  await t.test('create complaint uses verified owner and ignores privileged input',async()=>{
   const result=(await post('/api/complaints',{category:'safety',description:'Unsafe driving',trip_id:trip.id,route_id:trip.route_id,user_id:'victim',status:'resolved',response:'Forged',role:'authority'}).expect(201)).body;
   complaintId=result.id;assert.equal(result.user_id,'1');assert.equal(result.status,'pending');assert.equal(result.response,null);
   assert.equal(result.trip_id,String(trip.id));
  });
  await t.test('complaint validation and actual foreign keys',async()=>{
   for(const body of [{},{category:'bad',description:'x'},{category:'service',description:' '},{category:'service',description:'x',trip_id:0},{category:'service',description:'x',route_id:999999}])
    await post('/api/complaints',body).expect(400);
   await get('/api/complaints/nope').expect(400);
   await get('/api/complaints/999999').expect(404);
  });
  await t.test('students only see their complaints and cannot change status',async()=>{
   identity={user_id:'2',role:'student'};
   otherId=(await post('/api/complaints',{category:'schedule',description:'Late departure'}).expect(201)).body.id;
   assert.deepEqual((await get('/api/complaints').expect(200)).body.map(x=>x.id),[otherId]);
   await get('/api/complaints/'+complaintId).expect(404);
   await patch('/api/authority/complaints/'+complaintId,{status:'resolved',role:'authority'}).expect(403);
   await get('/api/authority/complaints').expect(403);
   identity={user_id:'driver-1',role:'driver',driver_id:1};
   await get('/api/complaints').expect(403);await post('/api/feedback',{target:'service',rating:5}).expect(403);
   await get('/api/authority/complaints').expect(403);
  });
  await t.test('authority can filter, search and inspect all complaints',async()=>{
   identity={user_id:'3',role:'authority'};
   assert.equal((await get('/api/authority/complaints').expect(200)).body.length,2);
   const results=(await get('/api/authority/complaints?category=safety&status=pending&search=Unsafe').expect(200)).body;
   assert.deepEqual(results.map(x=>x.id),[complaintId]);
   assert.equal((await get('/api/authority/complaints/'+complaintId).expect(200)).body.description,'Unsafe driving');
   assert.equal((await get('/api/authority/complaints?limit=1&offset=1').expect(200)).body.length,1);
   for(const query of ['status=BAD','category=BAD','limit=0','limit=101','offset=-1','search[x]=y'])
    await get('/api/authority/complaints?'+query).expect(400);
  });
  await t.test('status and response updates create notifications atomically',async()=>{
   const result=(await patch('/api/authority/complaints/'+complaintId,{status:'in_review',response:'We are investigating.'}).expect(200)).body;
   assert.equal(result.status,'in_review');assert.equal(result.updated_by,'3');
   assert.equal(await notificationService(db).unreadCount('1'),2);
   await patch('/api/authority/complaints/'+complaintId,{status:'in_review',response:'We are investigating.'}).expect(200);
   assert.equal(await notificationService(db).unreadCount('1'),2);
   await patch('/api/authority/complaints/'+complaintId,{status:'resolved'}).expect(200);
   await patch('/api/authority/complaints/'+otherId,{status:'rejected'}).expect(200);
  });
  await t.test('invalid status and empty updates do not mutate records',async()=>{
   for(const body of [{status:'BAD'},{},{response:' '}])await patch('/api/authority/complaints/'+complaintId,body).expect(400);
   await patch('/api/authority/complaints/999999',{status:'resolved'}).expect(404);
   assert.equal((await get('/api/authority/complaints/'+complaintId)).body.status,'resolved');
  });
  await t.test('notification failures roll back complaint changes',async()=>{
   const failing={query(sql,params){if(sql.startsWith('INSERT INTO notifications'))throw new Error('notification failure');return db.query(sql,params);}};
   await assert.rejects(complaintService(failing).update(complaintId,'3',{status:'rejected'}),/notification failure/);
   assert.equal((await complaintService(db).get(complaintId)).status,'resolved');
  });
  await t.test('admin role is accepted by complaint management',async()=>{
   identity={user_id:'4',role:'admin'};
   await get('/api/authority/complaints').expect(200);
  });
  await t.test('feedback supports service and existing bus, trip, route relationships',async()=>{
   identity={user_id:'1',role:'student'};
   for(const target of ['service','bus','trip','route']) {
    const body={target,rating:4,comment:'Useful service',user_id:'2'};
    if(target!=='service')body[target+'_id']=target==='trip'?trip.id:trip[target+'_id'];
    const result=(await post('/api/feedback',body).expect(201)).body;
    assert.equal(result.user_id,'1');assert.equal(result.rating,4);
   }
   assert.equal((await get('/api/feedback').expect(200)).body.length,4);
   identity={user_id:'2',role:'student'};
   assert.deepEqual((await get('/api/feedback').expect(200)).body,[]);
  });
  await t.test('feedback validates ratings, target and references',async()=>{
   for(const rating of [0,6,1.5,'5',null])await post('/api/feedback',{target:'service',rating}).expect(400);
   for(const body of [{target:'bad',rating:5},{target:'trip',rating:5},{target:'service',bus_id:trip.bus_id,rating:5},{target:'bus',bus_id:999999,rating:5}])
    await post('/api/feedback',body).expect(400);
  });
  await t.test('reusable notification service validates content and creates no simulated events',async()=>{
   const n=await notificationService(db).create({user_id:'1',type:'transport_announcement',title:'Schedule notice',message:'Check your trip time.'});
   assert.equal(n.read_at,null);assert.ok(n.created_at);
   await assert.rejects(notificationService(db).create({user_id:'1',type:'x',title:'',message:'x'}),{status:400});
  });
  await t.test('notifications and unread counts are scoped to verified user',async()=>{
   identity={user_id:'1',role:'student'};
   const list=(await get('/api/notifications').expect(200)).body;
   assert.equal(list.length,4);assert.ok(list.every(x=>x.user_id==='1'));
   assert.equal((await get('/api/notifications/unread-count').expect(200)).body.count,4);
   const n=list[0];
   const first=(await patch('/api/notifications/'+n.id+'/read').expect(200)).body;
   assert.ok(first.read_at);
   assert.equal((await patch('/api/notifications/'+n.id+'/read').expect(200)).body.read_at,first.read_at);
   assert.equal((await get('/api/notifications/unread-count')).body.count,3);
   identity={user_id:'2',role:'student'};
   await patch('/api/notifications/'+n.id+'/read',{user_id:'1'}).expect(404);
   assert.equal((await get('/api/notifications/unread-count')).body.count,1);
   identity={user_id:'1',role:'student'};
   assert.equal((await patch('/api/notifications/read-all').expect(200)).body.updated,3);
   assert.equal((await patch('/api/notifications/read-all').expect(200)).body.updated,0);
   assert.equal((await get('/api/notifications/unread-count')).body.count,0);
   identity={user_id:'2',role:'student'};
   assert.equal((await get('/api/notifications/unread-count')).body.count,1);
  });
  await t.test('migration is repeatable and database constraints enforce rating/status',async()=>{
   await migrate(db);
   await assert.rejects(db.query("UPDATE complaints SET status='bad' WHERE id=$1",[complaintId]),{code:'23514'});
   await assert.rejects(db.query("INSERT INTO feedback(user_id,target,rating) VALUES('1','service',6)"),{code:'23514'});
   assert.equal(Number((await db.query("SELECT count(*) FROM schema_migrations")).rows[0].count),8);
  });
 } finally {
  await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();
 }
});
