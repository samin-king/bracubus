import { driverService, validateDriver } from '../services/driverService.js';
import { id } from '../utils/validation.js';
import { HttpError } from '../middleware/errors.js';
export function driverController(db) {
 const service=driverService(db);
 return {
  list:async(req,res)=>res.json(await service.list()),
  get:async(req,res)=>res.json(await service.get(id(req.params.id))),
  me:async(req,res)=>res.json(await service.get(req.driverId)),
  create:async(req,res)=>{const driver=await service.create(validateDriver(req.body));res.location('/api/drivers/'+driver.id).status(201).json(driver);},
  update:async(req,res)=>res.json(await service.update(id(req.params.id),validateDriver(req.body))),
  trips:async(req,res)=>{
   const driverId=req.params.id==='me'?req.driverId:id(req.params.id);
   if(driverId!==req.driverId) throw new HttpError(403,'Cannot retrieve another driver trips');
   res.json(await service.trips(driverId));
  },
  assign:async(req,res)=>{
   if(!req.body || !Object.hasOwn(req.body,'driver_id')) throw new HttpError(400,'driver_id is required; use null to unassign');
   res.json(await service.assign(id(req.params.id),req.body.driver_id===null?null:id(req.body.driver_id)));
  },
  start:async(req,res)=>res.json(await service.transition(id(req.params.id),req.driverId,'start')),
  stop:async(req,res)=>res.json(await service.transition(id(req.params.id),req.driverId,'stop'))
 };
}
