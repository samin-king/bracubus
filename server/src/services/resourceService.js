import { HttpError } from '../middleware/errors.js';
const specs={
 bus:{table:'buses',fields:['bus_number','registration_number','capacity','status','standing_capacity']},
 route:{table:'routes',fields:['route_name','origin','destination','stops']},
 trip:{table:'trips',fields:['route_id','bus_id','travel_date','departure_time','status']}
};
export const select = kind => kind==='trip' ? "SELECT t.id,t.route_id,t.bus_id,t.driver_id,t.started_at,t.completed_at,CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id',d.id,'name',d.name,'status',d.status) END AS driver,to_char(t.travel_date,'YYYY-MM-DD') AS travel_date,to_char(t.departure_time,'HH24:MI:SS') AS departure_time,t.status,t.created_at,t.updated_at,json_build_object('id',b.id,'bus_number',b.bus_number,'capacity',b.capacity,'status',b.status) AS bus,json_build_object('id',r.id,'route_name',r.route_name,'origin',r.origin,'destination',r.destination,'stops',r.stops) AS route FROM trips t JOIN buses b ON b.id=t.bus_id JOIN routes r ON r.id=t.route_id LEFT JOIN drivers d ON d.id=t.driver_id" : 'SELECT t.* FROM '+specs[kind].table+' t';
export function resourceService(db,kind) {
 const {table,fields}=specs[kind];
 const get=async id=>{
  const result=await db.query(select(kind)+' WHERE t.id=$1',[id]);
  if(!result.rows.length) throw new HttpError(404,kind+' not found');
  return result.rows[0];
 };
 return {
  list:async()=> (await db.query(select(kind)+' ORDER BY t.id DESC')).rows,
  get,
  listForDriver:async driverId=>(await db.query(select(kind)+' WHERE t.driver_id=$1 ORDER BY t.travel_date,t.departure_time,t.id',[driverId])).rows,
  create:async data=>{
   if(kind==='trip') {
    for(const [table,field] of [['buses','bus_id'],['routes','route_id']]) {
     const reference=await db.query('SELECT id FROM '+table+' WHERE id=$1',[data[field]]);
     if(!reference.rows.length) throw new HttpError(400,'Referenced bus or route does not exist');
    }
   }
   const result=await db.query('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+fields.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING id',fields.map(f=>kind==='bus'&&f==='standing_capacity'?(data[f]??0):data[f]));
   return get(result.rows[0].id);
  },
  update:async(id,data)=>{
   const result=await db.query('UPDATE '+table+' SET '+fields.map((f,i)=>f+'='+(kind==='bus'&&f==='standing_capacity'?'COALESCE($'+(i+1)+',standing_capacity)':'$'+(i+1))).join(',')+' WHERE id=$'+(fields.length+1)+(kind==='trip'?" AND (driver_id IS NULL OR status=$5) AND (driver_id IS NULL OR status NOT IN ('ACTIVE','COMPLETED','STOPPED') OR (route_id=$1 AND bus_id=$2 AND travel_date=$3::date AND departure_time=$4::time))":'')+' RETURNING id',[...fields.map(f=>data[f]),id]);
   if(!result.rows.length) { await get(id); throw new HttpError(409,'Assigned trip state must use driver controls; active and historical schedules cannot be changed'); }
   return get(id);
  }
 };
}
