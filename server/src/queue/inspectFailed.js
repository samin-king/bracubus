import { createQueueService } from './queueService.js';
const service=createQueueService();
try{await service.connect();console.log(JSON.stringify(await service.failed(),null,2));}
catch{console.error('Cannot inspect jobs: Redis unavailable or configuration invalid');process.exitCode=1;}
finally{await service.close();}
