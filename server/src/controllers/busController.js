import { busService } from '../services/busService.js';
import { id,validate } from '../utils/validation.js';
export function busController(db) {
 const service=busService(db);
 return {
 list:async(req,res)=>res.json(await service.list()),
 get:async(req,res)=>res.json(await service.get(id(req.params.id))),
 create:async(req,res)=>{const data=await service.create(validate('bus',req.body));res.location('/api/buses/'+data.id).status(201).json(data);},
 update:async(req,res)=>res.json(await service.update(id(req.params.id),validate('bus',req.body)))
 };
}
