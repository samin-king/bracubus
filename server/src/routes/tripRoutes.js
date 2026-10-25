import { driverController } from '../controllers/driverController.js';
import { requireDriver } from '../middleware/driverIdentity.js';
import { Router } from 'express';
import { tripController } from '../controllers/tripController.js';
export function tripRoutes(db,authorizeManagement) {
 const router=Router(), c=tripController(db);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 router.get('/',wrap(c.list));router.get('/:id',wrap(c.get));router.post('/',authorizeManagement,wrap(c.create));router.put('/:id',authorizeManagement,wrap(c.update));
 const driver=driverController(db);
 router.put('/:id/driver',authorizeManagement,wrap(driver.assign));
 router.post('/:id/start',requireDriver,wrap(driver.start));
 router.post('/:id/stop',requireDriver,wrap(driver.stop));
 return router;
}
