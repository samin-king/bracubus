import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { createRedis,queueConfig } from '../config/redis.js';
import { jobContract,validateJobId } from './jobContract.js';
import { HttpError } from '../middleware/errors.js';
export function createQueueService({config=queueConfig(),connection=createRedis({config}),QueueClass=Queue}={}) {
 const queue=new QueueClass(config.name,{connection,defaultJobOptions:{attempts:config.attempts,backoff:{type:'exponential',delay:config.backoff},removeOnComplete:false,removeOnFail:false}});
 queue.on('error',()=>{}); // Connection emits a sanitized operational diagnostic.
 async function available(fn){try{if(connection.status!=='ready')throw new Error('Unavailable');return await fn();}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(503,'Queue unavailable; retry with the same jobId');}}
 const snapshot=async job=>{
  const state=await job.getState();
  return {jobId:job.id,type:job.name,status:({waiting:'QUEUED','waiting-children':'QUEUED',active:'PROCESSING',delayed:'RETRY',completed:'COMPLETED',failed:'FAILED'})[state]||'QUEUED',attempts:job.attemptsMade,createdAt:job.data.createdAt,failedAt:state==='failed'&&job.finishedOn?new Date(job.finishedOn).toISOString():null,error:state==='failed'?job.failedReason:null};
 };
 return {
  async connect(){
   try {
    if(connection.status==='wait')await connection.connect();
    if(connection.status!=='ready')await new Promise((resolve,reject)=>{
     const finish=error=>{clearTimeout(timer);connection.off('ready',ready);connection.off('error',failed);error?reject(error):resolve();};
     const ready=()=>finish(),failed=()=>finish(new Error('Unavailable'));
     const timer=setTimeout(failed,2500);
     connection.once('ready',ready);connection.once('error',failed);
    });
    await connection.ping();
   }catch{throw new HttpError(503,'Queue unavailable; Redis connection failed');}
  },
  async submit(input){const data=jobContract(input),submissionId=randomUUID();return available(async()=>{
   await queue.add(data.type,{...data,submissionId},{jobId:data.jobId});
   const stored=await queue.getJob(data.jobId);
   if(stored.name!==data.type||JSON.stringify(stored.data.payload)!==JSON.stringify(data.payload))throw new HttpError(409,'jobId already belongs to a different request');
   return {...await snapshot(stored),duplicate:stored.data.submissionId!==submissionId};
  });},
  async status(id){validateJobId(id);return available(async()=>{const job=await queue.getJob(id);if(!job)throw new HttpError(404,'Job not found');return snapshot(job);});},
  async failed(limit=20){if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'limit must be 1-100');return available(async()=>Promise.all((await queue.getFailed(0,limit-1)).map(snapshot)));},
  async close(){try{await queue.close();}finally{connection.disconnect();}}
 };
}
