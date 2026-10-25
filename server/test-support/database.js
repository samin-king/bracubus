import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
export async function testPool() {
 if(process.env.TEST_DATABASE_URL) {
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:5000});
  return {
   async connect(){
    const client=await pool.connect();let queue=Promise.resolve();
    return {
     query(...args){const result=queue.then(()=>client.query(...args));queue=result.catch(()=>{});return result;},
     release:()=>client.release()
    };
   },
   end:()=>pool.end()
  };
 }
 const engine=new PGlite();
 await engine.waitReady;
 const client={
  async query(sql,params){
   const result=params?await engine.query(sql,params):(await engine.exec(sql)).at(-1);
   return {rows:result?.rows||[],rowCount:result?.rows?.length||result?.affectedRows||0};
  },
  release(){}
 };
 return {connect:async()=>client,end:()=>engine.close()};
}
