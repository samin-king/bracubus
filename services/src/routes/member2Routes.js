import express from 'express';
import { requireAuth, requireSameOrigin } from '../middleware/authMiddleware.js';
export function member2Routes(service, authService, config) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth(authService));
  router.use((req,res,next)=>req.user.role==='student'?next():res.status(403).json({error:'forbidden'}));
  router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : requireSameOrigin(config)(req, res, next));
  router.use(express.json({ limit: '16kb' }));
  const run = (fn, status = 200) => async (req, res, next) => {
    try { res.status(status).json(await fn(req)); } catch (error) { next(error); }
  };
  router.get('/profile',run(r=>service.profile(r.user.id)));
  router.patch('/profile',run(r=>service.saveProfile(r.user.id,r.body)));
  router.get('/trips', run(r => service.trips(r.query.date)));
  router.get('/trips/:id/seats', run(r => service.seats(r.user.id, r.params.id, r.query.date)));
  router.post('/bookings', run(r => service.book(r.user.id, r.body || {}), 201));
  router.get('/bookings', run(r => service.bookings(r.user.id)));
  router.get('/bookings/:id', run(r => service.booking(r.user.id, r.params.id)));
  router.post('/bookings/:id/cancel', run(r => service.cancel(r.user.id, r.params.id)));
  router.post('/complaints', run(r => service.complain(r.user.id, r.body || {}), 201));
  router.get('/complaints', run(r => service.complaints(r.user.id)));
  router.get('/complaints/:id', run(r => service.complaint(r.user.id, r.params.id)));
  return router;
}
