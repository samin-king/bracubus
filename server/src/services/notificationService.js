import {HttpError} from '../middleware/errors.js';
import {text} from '../utils/member4Validation.js';
export function notificationService(db) {
 return {
  async create({user_id,type,title,message,reference_type=null,reference_id=null}) {
   const values=[text(String(user_id??''),'user_id',250),text(type,'type',100),text(title,'title',250),text(message,'message'),
    reference_type==null?null:text(reference_type,'reference_type',100),reference_id==null?null:text(String(reference_id),'reference_id',250)];
   return (await db.query('INSERT INTO notifications(user_id,type,title,message,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',values)).rows[0];
  },
  async list(userId,limit=50,offset=0) {
   return (await db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[userId,limit,offset])).rows;
  },
  async unreadCount(userId) {
   return Number((await db.query('SELECT count(*) AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL',[userId])).rows[0].count);
  },
  async markRead(userId,id) {
   const result=await db.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *',[id,userId]);
   if(!result.rows.length)throw new HttpError(404,'Notification not found');
   return result.rows[0];
  },
  async markAllRead(userId) {
   const result=await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL RETURNING id',[userId]);
   return {updated:result.rowCount};
  }
 };
}
