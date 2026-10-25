import { Worker } from 'bullmq';
import { createRedis,queueConfig } from '../config/redis.js';
import { createJobProcessor } from '../queue/jobProcessor.js';
export function createQueueWorker({config=queueConfig(),connection=createRedis({worker:true,config}),bookingService,WorkerClass=Worker}={}) {
 const worker=new WorkerClass(config.name,createJobProcessor({bookingService}),{connection,concurrency:1,maxStalledCount:1});
 worker.on('error',()=>console.error('Queue worker connection or processing infrastructure error'));
 worker.on('failed',job=>console.error('Queue job failed',job?.id));
 return {worker,async close(){try{await worker.close();}finally{connection.disconnect();}}};
}
