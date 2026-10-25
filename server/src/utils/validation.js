import { HttpError } from '../middleware/errors.js';
const fail = message => { throw new HttpError(400,message); };
export function id(value) {
 if(!/^[1-9]\d*$/.test(String(value)) || Number(value)>2147483647) fail('Invalid ID');
 return Number(value);
}
const text = (v,k) => { if(typeof v!=='string'||!v.trim()||v.length>250) fail(k+' must be a nonempty string of at most 250 characters'); return v.trim(); };
export function validate(kind,body) {
 if(!body || typeof body!=='object'||Array.isArray(body)) fail('JSON object required');
 if(kind==='bus') {
  if(!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>2147483647) fail('capacity must be a positive integer');
  if(body.standing_capacity!=null&&(!Number.isInteger(body.standing_capacity)||body.standing_capacity<0||body.standing_capacity>2147483647)) fail('standing_capacity must be a nonnegative integer');
  const status=body.status??'ACTIVE';
  if(!['ACTIVE','INACTIVE','MAINTENANCE'].includes(status)) fail('Invalid bus status');
  return {bus_number:text(body.bus_number,'bus_number'),registration_number:body.registration_number==null?null:text(body.registration_number,'registration_number'),capacity:body.capacity,status,standing_capacity:body.standing_capacity??null};
 }
 if(kind==='route') {
  if(!Array.isArray(body.stops)||body.stops.length>100) fail('stops must be an array with at most 100 entries');
  return {route_name:text(body.route_name,'route_name'),origin:text(body.origin,'origin'),destination:text(body.destination,'destination'),stops:body.stops.map(s=>text(s,'stop'))};
 }
 const date=body.travel_date;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000')||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) fail('Invalid travel_date; use YYYY-MM-DD');
 if(typeof body.departure_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.departure_time)) fail('Invalid departure_time; use HH:mm or HH:mm:ss');
 const status=body.status??'SCHEDULED';
 if(!['SCHEDULED','ACTIVE','STOPPED','COMPLETED','CANCELLED'].includes(status)) fail('Invalid trip status');
 if(body.driver_id!=null) fail('Assign drivers through PUT /api/trips/:id/driver');
 return {route_id:id(body.route_id),bus_id:id(body.bus_id),travel_date:date,departure_time:body.departure_time,status};
}
