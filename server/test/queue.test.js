import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { queueConfig,createRedis } from '../src/config/redis.js';
import { jobContract } from '../src/queue/jobContract.js';
import { createQueueService } from '../src/queue/queueService.js';
import { createJobProcessor } from '../src/queue/jobProcessor.js';
import { createQueueWorker } from '../src/workers/queueWorker.js';
import { RetryableJobError,PermanentJobError } from '../src/queue/jobErrors.js';
import { UnrecoverableError,Queue,Worker } from 'bullmq';
const input=(jobId)=>({...(jobId?{jobId}:{}),type:'BOOKING_REQUEST',payload:{studentId:25,tripId:10,seatId:18}});
class FakeRedis extends EventEmitter {
 constructor(url,options){super();this.url=url;this.options=options;this.status='wait';}
 async connect(){this.status='ready';this.emit('ready');}async ping(){return 'PONG';}disconnect(){this.status='end';}
}
class FakeQueue extends EventEmitter {
 constructor(name,options){super();this.name=name;this.options=options;this.jobs=new Map();}
 async add(name,data,options){if(!this.jobs.has(options.jobId))this.jobs.set(options.jobId,{id:options.jobId,name,data,attemptsMade:0,state:'waiting',async getState(){return this.state;}});return this.jobs.get(options.jobId);}
 async getJob(id){return this.jobs.get(id);}async getFailed(start,end){return [...this.jobs.values()].filter(j=>j.state==='failed').slice(start,end+1);}async close(){}
}
function fixture(){const connection=createRedis({RedisClass:FakeRedis,logger:{error(){}}});let queue;class Capture extends FakeQueue{constructor(...args){super(...args);queue=this;}}const service=createQueueService({connection,QueueClass:Capture});return {service,connection,get queue(){return queue;}};}
test('Redis configuration defaults, overrides, and validation',()=>{
 assert.equal(queueConfig({}).attempts,3);assert.equal(queueConfig({REDIS_URL:'rediss://localhost:6380',QUEUE_MAX_ATTEMPTS:'5'}).attempts,5);
 for(const env of [{QUEUE_MAX_ATTEMPTS:'0'},{QUEUE_MAX_ATTEMPTS:'x'},{QUEUE_BACKOFF_MS:'-1'},{REDIS_URL:'https://localhost'}])assert.throws(()=>queueConfig(env));
});
test('Redis connects, sanitizes errors, recovers, and uses worker options',async()=>{
 const messages=[];const r=createRedis({RedisClass:FakeRedis,logger:{error:m=>messages.push(m)}});
 assert.equal(r.options.enableOfflineQueue,false);assert.equal(r.options.maxRetriesPerRequest,1);
 r.emit('error',new Error('password=secret'));r.emit('error',new Error('secret'));assert.equal(messages.length,1);assert.ok(!messages[0].includes('secret'));
 await r.connect();assert.equal(r.status,'ready');r.emit('error',new Error('secret'));assert.equal(messages.length,2);
 const w=createRedis({worker:true,RedisClass:FakeRedis});assert.equal(w.options.maxRetriesPerRequest,null);assert.equal(w.options.enableOfflineQueue,true);
});
test('Job contract generates unique IDs and validates supported fields',()=>{
 assert.notEqual(jobContract(input()).jobId,jobContract(input()).jobId);
 for(const bad of [{...input(),jobId:'123'},{...input(),jobId:'BAD:REQUEST'},{...input(),type:'deleteDatabase'},{...input(),attempts:100},{...input(),payload:{studentId:0,tripId:1}}])assert.throws(()=>jobContract(bad));
});
test('Queue creates queued job, returns status, identifies duplicates and conflicts atomically',async()=>{
 const f=fixture();await f.service.connect();
 const first=await f.service.submit(input('BOOKING-2026-0001'));assert.equal(first.status,'QUEUED');assert.equal(first.duplicate,false);
 const results=await Promise.all(Array.from({length:10},()=>f.service.submit(input('BOOKING-2026-0001'))));assert.ok(results.every(r=>r.duplicate));assert.equal(f.queue.jobs.size,1);
 assert.equal((await f.service.status(first.jobId)).type,'BOOKING_REQUEST');
 await assert.rejects(f.service.submit({...input(first.jobId),payload:{studentId:99,tripId:1}}),{status:409});
 const j=await f.queue.getJob(first.jobId);j.state='completed';assert.equal((await f.service.submit(input(first.jobId))).duplicate,true);assert.equal((await f.service.status(first.jobId)).status,'COMPLETED');
 await assert.rejects(f.service.status('MISSING-0001'),{status:404});await f.service.close();assert.equal(f.connection.status,'end');
});
test('Unavailable Redis rejects operations with a clear 503',async()=>{
 const f=fixture();await assert.rejects(f.service.submit(input()),{status:503});await assert.rejects(f.service.status('MISSING-0001'),{status:503});await f.service.close();
});
test('Failed metadata and retry state omit payloads',async()=>{
 const f=fixture();await f.service.connect();const r=await f.service.submit(input());const j=await f.queue.getJob(r.jobId);
 j.state='delayed';assert.equal((await f.service.status(r.jobId)).status,'RETRY');j.state='failed';j.attemptsMade=3;j.failedReason='Temporary service failure';j.finishedOn=Date.now();
 const [failed]=await f.service.failed();assert.equal(failed.attempts,3);assert.ok(failed.failedAt);assert.equal(failed.payload,undefined);await assert.rejects(f.service.failed(101),{status:400});await f.service.close();
});
const job=()=>({id:'BOOKING-2026-0001',name:'BOOKING_REQUEST',data:{payload:input().payload}});
test('Processor calls Member 2 adapter with payload and idempotency key, discards business result',async()=>{
 let args;const process=createJobProcessor({bookingService:{async processBooking(...a){args=a;return {secret:'business data'};}}});assert.equal(await process(job()),undefined);assert.deepEqual(args,[input().payload,{jobId:job().id}]);
});
test('Processor distinguishes retryable, permanent, invalid and missing integration failures',async()=>{
 await assert.rejects(createJobProcessor()(job()),UnrecoverableError);
 for(const error of [new PermanentJobError('secret'),new Error('secret')])await assert.rejects(createJobProcessor({bookingService:{processBooking:async()=>{throw error;}}})(job()),e=>e instanceof UnrecoverableError&&!e.message.includes('secret'));
 await assert.rejects(createJobProcessor({bookingService:{processBooking:async()=>{throw new RetryableJobError('secret');}}})(job()),e=>!(e instanceof UnrecoverableError)&&e.message==='Temporary service failure');
 await assert.rejects(createJobProcessor()({...job(),name:'UNKNOWN'}),UnrecoverableError);
});
test('Worker wiring uses configured queue and recovery; closes its connection',async()=>{
 class FakeWorker extends EventEmitter{constructor(name,processor,options){super();Object.assign(this,{name,processor,options});}async close(){this.closed=true;}}
 const connection=new FakeRedis();const runtime=createQueueWorker({WorkerClass:FakeWorker,connection});assert.equal(runtime.worker.name,'bracu-background');assert.equal(runtime.worker.options.maxStalledCount,1);assert.equal(runtime.worker.options.concurrency,1);await runtime.close();assert.ok(runtime.worker.closed);assert.equal(connection.status,'end');
});
// Run explicitly against a dedicated Redis instance; each test uses a unique queue.
test('Real Redis: atomic duplicates, worker consumption, retries, permanent failure and continuation',{skip:!process.env.TEST_REDIS_URL,timeout:30000},async()=>{
 const config={...queueConfig({REDIS_URL:process.env.TEST_REDIS_URL}),name:'bracu-test-'+Date.now(),backoff:20};
 const connection=createRedis({config});const service=createQueueService({config,connection});let runtime;const calls=new Map();
 try {
  await service.connect();
  runtime=createQueueWorker({config,bookingService:{async processBooking(payload,{jobId}){const n=(calls.get(jobId)||0)+1;calls.set(jobId,n);if(payload.studentId===2&&n<3)throw new RetryableJobError('temporary');if(payload.studentId===3)throw new RetryableJobError('secret');if(payload.studentId===4)throw new PermanentJobError('secret');}}});
  await runtime.worker.waitUntilReady();
  const submit=(id,studentId)=>service.submit({...input(id),payload:{studentId,tripId:10}});
  const dupe=await Promise.all(Array.from({length:10},()=>submit('BOOKING-DUPLICATE',1)));assert.equal(dupe.filter(r=>!r.duplicate).length,1);
  await submit('BOOKING-RETRY',2);await submit('BOOKING-EXHAUSTED',3);await submit('BOOKING-PERMANENT',4);await submit('BOOKING-AFTERFAIL',5);
  async function wait(id,state){const deadline=Date.now()+15000;while(Date.now()<deadline){const s=await service.status(id);if(s.status===state)return s;await new Promise(r=>setTimeout(r,25));}assert.fail('Timed out '+id+' '+state);}
  await wait('BOOKING-DUPLICATE','COMPLETED');const retried=await wait('BOOKING-RETRY','COMPLETED');assert.equal(retried.attempts,3);
  const failed=await wait('BOOKING-EXHAUSTED','FAILED');assert.equal(failed.attempts,3);assert.equal(failed.error,'Temporary service failure');
  await wait('BOOKING-PERMANENT','FAILED');assert.equal(calls.get('BOOKING-PERMANENT'),1);await wait('BOOKING-AFTERFAIL','COMPLETED');
  await submit('BOOKING-DUPLICATE',1);assert.equal(calls.get('BOOKING-DUPLICATE'),1);assert.equal((await service.failed()).length,2);
 }finally{if(runtime)await runtime.close();const cleanup=new Queue(config.name,{connection});try{await cleanup.obliterate({force:true});}finally{await cleanup.close();await service.close();}}
});

test('Queue waits for an in-progress Redis connection and reports connection failures',async()=>{
 const f=fixture();f.connection.status='connecting';const pending=f.service.connect();queueMicrotask(()=>{f.connection.status='ready';f.connection.emit('ready');});await pending;
 f.connection.status='connecting';const failed=f.service.connect();queueMicrotask(()=>f.connection.emit('error',new Error('secret')));await assert.rejects(failed,{status:503});await f.service.close();
});
