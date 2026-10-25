import {HttpError} from '../middleware/errors.js';
import {transaction} from '../utils/transaction.js';
import {notificationService} from './notificationService.js';
export function complaintService(db) {
 const get=async(id,userId)=>{
  const result=await db.query('SELECT * FROM complaints WHERE id=$1'+(userId===undefined?'':' AND user_id=$2'),userId===undefined?[id]:[id,userId]);
  if(!result.rows.length)throw new HttpError(404,'Complaint not found');
  return result.rows[0];
 };
 return {
  get,
  async create(userId,data) {
   return (await db.query('INSERT INTO complaints(student_id,category,description,trip_id,route_id,subject) VALUES($1::bigint,$2,$3,$4,$5,$2) RETURNING *',[userId,data.category,data.description,data.trip_id,data.route_id])).rows[0];
  },
  async list({userId=null,status=null,category=null,search='',limit=50,offset=0}) {
   return (await db.query(`SELECT * FROM complaints WHERE ($1::text IS NULL OR user_id=$1)
    AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR category=$3)
    AND ($4='' OR strpos(lower(description),lower($4))>0 OR strpos(lower(COALESCE(response,'')),lower($4))>0)
    ORDER BY created_at DESC,id DESC LIMIT $5 OFFSET $6`,[userId,status,category,search,limit,offset])).rows;
  },
  async update(id,actor,{status,response}) {
   return transaction(db,async client=>{
    const result=await client.query('SELECT * FROM complaints WHERE id=$1 FOR UPDATE',[id]);
    if(!result.rows.length)throw new HttpError(404,'Complaint not found');
    const old=result.rows[0];
    const updated=(await client.query('UPDATE complaints SET status=$2,response=$3,updated_by=$4 WHERE id=$1 RETURNING *',[id,status??old.status,response??old.response,actor])).rows[0];
    const notifications=notificationService(client);
    const base={user_id:old.user_id,reference_type:'complaint',reference_id:id};
    if(status&&status!==old.status)await notifications.create({...base,type:'complaint_status_changed',title:'Complaint status updated',message:'Complaint #'+id+' is now '+status+'.'});
    if(response&&response!==old.response)await notifications.create({...base,type:'complaint_response',title:'Response to your complaint',message:response});
    return updated;
   });
  }
 };
}
