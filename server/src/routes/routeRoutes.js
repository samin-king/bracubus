import { Router } from 'express';
import { routeController } from '../controllers/routeController.js';
export function routeRoutes(db,authorizeManagement=(req,res,next)=>next()) {
 const router=Router(), c=routeController(db);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 router.get('/',wrap(c.list));router.get('/:id',wrap(c.get));router.post('/',authorizeManagement,wrap(c.create));router.put('/:id',authorizeManagement,wrap(c.update));
 return router;
}
