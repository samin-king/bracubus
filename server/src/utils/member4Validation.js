import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
export const categories=['service','driver','safety','schedule','other'];
export const statuses=['pending','in_review','resolved','rejected'];
export function text(value,name,max=5000) {
 if(typeof value!=='string'||!value.trim()||value.length>max) throw new HttpError(400,name+' must contain 1–'+max+' characters');
 return value.trim();
}
export function object(body) {
 if(!body||typeof body!=='object'||Array.isArray(body)) throw new HttpError(400,'JSON object required');
 return body;
}
export function choice(value,options,name) {
 if(!options.includes(value)) throw new HttpError(400,'Invalid '+name);
 return value;
}
export function complaint(body) {
 object(body);
 return {category:choice(body.category,categories,'category'),description:text(body.description,'description'),
 trip_id:body.trip_id==null?null:id(body.trip_id),route_id:body.route_id==null?null:id(body.route_id)};
}
export function feedback(body) {
 object(body);
 const target=choice(body.target,['service','bus','trip','route'],'target');
 if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5) throw new HttpError(400,'rating must be an integer from 1 to 5');
 const references={bus_id:null,trip_id:null,route_id:null};
 if(target!=='service') references[target+'_id']=id(body[target+'_id']);
 for(const key of Object.keys(references)) if(body[key]!=null&&references[key]===null) throw new HttpError(400,'Unexpected target reference');
 return {target,...references,rating:body.rating,comment:body.comment==null||body.comment===''?null:text(body.comment,'comment')};
}
export function paging(query) {
 const parse=(value,fallback,max)=>{
  if(value===undefined)return fallback;
  if(typeof value!=='string'||!/^\d+$/.test(value)||Number(value)>max)throw new HttpError(400,'Invalid pagination');
  return Number(value);
 };
 const limit=parse(query.limit,50,100),offset=parse(query.offset,0,2147483647);
 if(limit<1)throw new HttpError(400,'Invalid pagination');
 return [limit,offset];
}
