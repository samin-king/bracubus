import {HttpError} from './errors.js';
// Only verified server authentication middleware may populate req.auth.
// No body, cookie, query or header is interpreted as identity here.
export function requireUser(req,res,next) {
 const value=req.auth?.user_id;
 if(!['string','number'].includes(typeof value)||!String(value).trim()||String(value).length>250||
    (typeof value==='number'&&(!Number.isSafeInteger(value)||value<1)))
  return next(new HttpError(401,'Authenticated user required'));
 req.userId=String(value);
 next();
}
export function requireRole(...roles) {
 return (req,res,next)=>requireUser(req,res,(error)=>{
  if(error) return next(error);
  if(!roles.includes(req.auth.role)) return next(new HttpError(403,'Insufficient permission'));
  next();
 });
}
