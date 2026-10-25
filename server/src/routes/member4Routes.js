import {Router} from 'express';
import {member4Controller} from '../controllers/member4Controller.js';
import {requireUser,requireRole} from '../middleware/member4Access.js';
export function member4Routes(db) {
 const router=Router(),c=member4Controller(db);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 const student=requireRole('student'),management=requireRole('authority','admin');
 router.get('/complaints',student,wrap(c.listComplaints));
 router.post('/complaints',student,wrap(c.createComplaint));
 router.get('/complaints/:id',student,wrap(c.getComplaint));
 router.use('/authority/complaints',management,(req,res,next)=>{req.management=true;next();});
 router.get('/authority/complaints',wrap(c.listComplaints));
 router.get('/authority/complaints/:id',wrap(c.getComplaint));
 router.patch('/authority/complaints/:id',wrap(c.updateComplaint));
 router.get('/feedback',student,wrap(c.listFeedback));
 router.post('/feedback',student,wrap(c.createFeedback));
 router.get('/notifications',requireUser,wrap(c.listNotifications));
 router.get('/notifications/unread-count',requireUser,wrap(c.unreadCount));
 router.patch('/notifications/read-all',requireUser,wrap(c.markAllRead));
 router.patch('/notifications/:id/read',requireUser,wrap(c.markRead));
 return router;
}
