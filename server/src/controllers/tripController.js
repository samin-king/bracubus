import {HttpError} from '../middleware/errors.js';
import { tripService } from '../services/tripService.js';
import { id,validate } from '../utils/validation.js';
export function tripController(db) {
 const service=tripService(db);
 return {
 list:async(req,res)=>res.json(await (req.auth?.role==='driver'?service.listForDriver(id(req.auth.driver_id)):service.list())),
 get:async(req,res)=>{
  const trip=await service.get(id(req.params.id));
  if(req.auth?.role==='driver'&&trip.driver_id!==id(req.auth.driver_id))throw new HttpError(403,'Trip is not assigned to this driver');
  res.json(trip);
 },
 create:async(req,res)=>{const data=await service.create(validate('trip',req.body));res.location('/api/trips/'+data.id).status(201).json(data);},
 update:async(req,res)=>res.json(await service.update(id(req.params.id),validate('trip',req.body)))
 };
}
