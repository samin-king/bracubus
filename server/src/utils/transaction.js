import pg from 'pg';
export async function transaction(db,operation) {
 // A connected pg.Client also has connect(); only a Pool should acquire another client.
 const ownsClient=db instanceof pg.Pool;
 const client=ownsClient?await db.connect():db;
 try {
  await client.query('BEGIN');
  const result=await operation(client);
  await client.query('COMMIT');
  return result;
 } catch(error) { await client.query('ROLLBACK'); throw error; }
 finally { if(ownsClient) client.release(); }
}
