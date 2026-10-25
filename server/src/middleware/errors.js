export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
export function errorHandler(err,req,res,next) {
 const codes = {23001:[409,'Referenced historical records prevent this change'],23505:[409,'A record with these unique values already exists'],23503:[400,'Referenced bus or route does not exist'],23514:[400,'Database constraint rejected the values'],22007:[400,'Invalid date or time'],22008:[400,'Invalid date or time'],'22P02':[400,'Invalid value'],22003:[400,'Number out of range']};
 const [status,message] = codes[err.code] || [err.status || 500,err.type==='entity.parse.failed'?'Invalid JSON':err.status?err.message:'Internal server error'];
 if(status===500) console.error(err);
 res.status(status).json({error:message});
}
