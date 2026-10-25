import { Router } from 'express';
import { driverController } from '../controllers/driverController.js';
import { requireDriver } from '../middleware/driverIdentity.js';
export const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export function driverRoutes(db,authorizeManagement) {
 const router=Router(),c=driverController(db);
 router.get('/me',requireDriver,wrap(c.me));
 router.get('/:id/trips',requireDriver,wrap(c.trips));
 router.get('/',authorizeManagement,wrap(c.list));
 router.get('/:id',authorizeManagement,wrap(c.get));
 router.post('/',authorizeManagement,wrap(c.create));
 router.put('/:id',authorizeManagement,wrap(c.update));
 return router;
}
