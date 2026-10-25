import {isLoopbackLoginRequest, localDirectLoginEnabled} from '../config/devEmailLogin.js';
import {json} from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createAuthController } from '../controllers/authController.js';
import { requireAuth, requireSameOrigin } from '../middleware/authMiddleware.js';
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function authRoutes(service, config) {
  const router = Router();
  const controller = createAuthController(service, config);
  const limiter = rateLimit({ windowMs: 600000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'too_many_attempts', message: 'Too many sign-in attempts. Try again later.' } });
  if (config.devDirectLogin && config.nodeEnv==='development' && localDirectLoginEnabled({DEV_DIRECT_LOGIN:'true',NODE_ENV:config.nodeEnv,DATABASE_URL:config.databaseUrl,FRONTEND_URL:config.frontendUrl})) {
    router.post('/development/email-login', (req,res,next)=>isLoopbackLoginRequest(req)?next():res.status(403).json({error:'loopback_required'}),
      limiter,requireSameOrigin(config),json({limit:'16kb'}),wrap(controller.developmentLogin));
  }
  // A disabled development endpoint must never fall through to another login flow.
  router.all('/development/email-login',(req,res)=>res.status(404).json({error:'not_found'}));
  router.post('/email',limiter,requireSameOrigin(config),json({limit:'16kb'}),wrap(controller.email));
  router.post('/email/verify',limiter,requireSameOrigin(config),json({limit:'16kb'}),wrap(controller.verifyEmail));
  router.get('/google', limiter, wrap(controller.google));
  router.get('/google/callback', limiter, wrap(controller.callback));
  router.get('/me', requireAuth(service), controller.me);
  router.post('/logout', requireSameOrigin(config), wrap(controller.logout));
  return router;
}
