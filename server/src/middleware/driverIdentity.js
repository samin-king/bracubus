import { HttpError } from './errors.js';
import { id } from '../utils/validation.js';
// Member 1 supplies req.auth.driver_id through verified authentication middleware.
export function developmentIdentity(req,res,next) {
 if(process.env.NODE_ENV==='development' && process.env.ENABLE_DEV_DRIVER_AUTH==='true') {
  try { req.auth={role:'driver',driver_id:id(process.env.DEV_DRIVER_ID)}; } catch { return next(new HttpError(401,'Configure DEV_DRIVER_ID on the server')); }
 }
 next();
}
export function requireDriver(req,res,next) {
 try {
  if(req.auth?.driver_id==null) throw new HttpError(401,'Authenticated driver identity required');
  if(req.auth.role!=='driver') throw new HttpError(403,'Driver role required');
  req.driverId=id(req.auth.driver_id); next();
 } catch(error) { next(error); }
}
// Member 4 supplies management authorization. Default is closed outside explicit local development.
export function developmentManagement(req,res,next) {
 if(process.env.NODE_ENV==='development' && process.env.ENABLE_DEV_DRIVER_AUTH==='true') return next();
 next(new HttpError(403,'Management authorization integration required'));
}
