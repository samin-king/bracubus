import Redis from 'ioredis';
export function queueConfig(env=process.env) {
 const integer=(name,fallback,max)=>{const n=Number(env[name]??fallback);if(!Number.isInteger(n)||n<1||n>max)throw new Error('Invalid '+name);return n;};
 const url=env.REDIS_URL||'redis://localhost:6379';
 if(!['redis:','rediss:'].includes(new URL(url).protocol))throw new Error('Invalid REDIS_URL');
 return {url,name:'bracu-background',attempts:integer('QUEUE_MAX_ATTEMPTS',3,20),backoff:integer('QUEUE_BACKOFF_MS',1000,60000)};
}
export function createRedis({worker=false,config=queueConfig(),RedisClass=Redis,logger=console}={}) {
 const client=new RedisClass(config.url,{lazyConnect:true,enableOfflineQueue:worker,maxRetriesPerRequest:worker?null:1,connectTimeout:2000,commandTimeout:worker?undefined:3000,retryStrategy:n=>Math.min(n*200,2000)});
 let reported=false;
 client.on('error',()=>{if(!reported){logger.error('Redis unavailable; queue operations require Redis');reported=true;}});
 client.on('ready',()=>{reported=false;});
 return client;
}
