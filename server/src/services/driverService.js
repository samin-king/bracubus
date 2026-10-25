import { HttpError } from '../middleware/errors.js';
import { resourceService } from './resourceService.js';
import { transaction } from '../utils/transaction.js';
export function validateDriver(body) {
 if(!body || typeof body!=='object' || Array.isArray(body)) throw new HttpError(400,'JSON object required');
 const data={};
 for(const field of ['name','license_number']) {
  if(typeof body[field]!=='string'||!body[field].trim()||body[field].trim().length>250) throw new HttpError(400,field+' is required (maximum 250 characters)');
  data[field]=body[field].trim();
 }
 data.status=body.status??'ACTIVE';
 if(!['ACTIVE','INACTIVE'].includes(data.status)) throw new HttpError(400,'Invalid driver status');
 return data;
}
const columns='id,name,license_number,status,created_at,updated_at';
export function driverService(db) {
 const get=async(driverId,client=db)=>{
  const {rows}=await client.query('SELECT '+columns+' FROM drivers WHERE id=$1',[driverId]);
  if(!rows.length) throw new HttpError(404,'Driver not found');
  return rows[0];
 };
 return {
  get,
  list:async()=> (await db.query('SELECT '+columns+' FROM drivers ORDER BY id')).rows,
  create:async data=>(await db.query('INSERT INTO drivers(name,license_number,status) VALUES($1,$2,$3) RETURNING '+columns,[data.name,data.license_number,data.status])).rows[0],
  update:async(driverId,data)=>{
   const result=await db.query('UPDATE drivers SET name=$1,license_number=$2,status=$3 WHERE id=$4 RETURNING '+columns,[data.name,data.license_number,data.status,driverId]);
   if(!result.rows.length) throw new HttpError(404,'Driver not found');
   return result.rows[0];
  },
  trips:async driverId=>{
   await get(driverId);
   return resourceService(db,'trip').listForDriver(driverId);
  },
  assign:async(tripId,driverId)=>transaction(db,async client=>{
   const {rows}=await client.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE',[tripId]);
   if(!rows.length) throw new HttpError(404,'Trip not found');
   if(rows[0].status!=='SCHEDULED') throw new HttpError(409,'Only scheduled trips can be reassigned');
   if(driverId!==null) {
    const driver=await client.query('SELECT status FROM drivers WHERE id=$1 FOR UPDATE',[driverId]);
    if(!driver.rows.length) throw new HttpError(404,'Driver not found');
    if(driver.rows[0].status!=='ACTIVE') throw new HttpError(409,'Inactive driver cannot be assigned');
   }
   await client.query('UPDATE trips SET driver_id=$1 WHERE id=$2',[driverId,tripId]);
   return resourceService(client,'trip').get(tripId);
  }),
  transition:async(tripId,driverId,action)=>transaction(db,async client=>{
   const {rows}=await client.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE',[tripId]);
   if(!rows.length) throw new HttpError(404,'Trip not found');
   const trip=rows[0];
   if(trip.driver_id!==driverId) throw new HttpError(403,'Trip is not assigned to this driver');
   const driver=await client.query('SELECT status FROM drivers WHERE id=$1 FOR UPDATE',[driverId]);
   if(!driver.rows.length) throw new HttpError(404,'Driver not found');
   if(driver.rows[0].status!=='ACTIVE') throw new HttpError(403,'Driver is inactive');
   const expected=action==='start'?'SCHEDULED':'ACTIVE';
   if(trip.status!==expected) throw new HttpError(409,'Cannot '+action+' a '+trip.status+' trip');
   const sql=action==='start'?"UPDATE trips SET status='ACTIVE',started_at=now() WHERE id=$1":"UPDATE trips SET status='COMPLETED',completed_at=now() WHERE id=$1";
   await client.query(sql,[tripId]);
   return resourceService(client,'trip').get(tripId);
  })
 };
}
