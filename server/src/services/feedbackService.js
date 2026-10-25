export function feedbackService(db) {
 return {
  async create(userId,data) {
   return (await db.query('INSERT INTO feedback(user_id,target,bus_id,trip_id,route_id,rating,comment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[userId,data.target,data.bus_id,data.trip_id,data.route_id,data.rating,data.comment])).rows[0];
  },
  async list(userId,limit=50,offset=0) {
   return (await db.query('SELECT * FROM feedback WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[userId,limit,offset])).rows;
  }
 };
}
