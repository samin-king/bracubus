import { routeService } from '../services/routeService.js';
import { id,validate } from '../utils/validation.js';
export function routeController(db) {
 const service=routeService(db);
 return {
 list:async(req,res)=>res.json(await service.list()),
 get:async(req,res)=>res.json(await service.get(id(req.params.id))),
 create:async(req,res)=>{const data=await service.create(validate('route',req.body));res.location('/api/routes/'+data.id).status(201).json(data);},
 update:async(req,res)=>res.json(await service.update(id(req.params.id),validate('route',req.body)))
 };
}
