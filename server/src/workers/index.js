import { createQueueWorker } from './queueWorker.js';
// TODO Member 2: import the real booking service and pass { bookingService } here.
const runtime=createQueueWorker();
console.log('Transport queue worker started; booking adapter is not configured');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
 const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();
 await runtime.close();clearTimeout(timeout);
});
