import {createEmailSender} from './services/emailSender.js';
import express from 'express';
import {createApp as createTransportApp} from '../../server/src/app.js';
import {requireAuth,requireSameOrigin} from './middleware/authMiddleware.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { createAuthService, createGoogleProvider, AuthError } from './services/authService.js';
import { authRoutes } from './routes/authRoutes.js';
import { member2Routes } from './routes/member2Routes.js';
import { createMember2Service } from './services/member2Service.js';
import { createTripCatalog } from './services/tripCatalog.js';
import { Member2Error } from './services/bookingRules.js';
export function createApp({ config, pool, provider = createGoogleProvider(config), store, sendEmail = createEmailSender(config), tripCatalog = createTripCatalog(), clock }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache'); next(); });
  const PgStore = connectPgSimple(session);
  app.use(session({ name: config.cookieName, secret: config.secret,
    store: store || new PgStore({ pool, tableName: 'auth_sessions', createTableIfMissing: false,
      ...(config.serverless ? { pruneSessionInterval: false } : {}) }),
    resave: false, saveUninitialized: false, rolling: false,
    cookie: { httpOnly: true, secure: config.secure, sameSite: 'lax', maxAge: config.ttlMs, path: '/' } }));
  app.use('/api/auth', authRoutes(createAuthService({ config, pool, provider, sendEmail }), config));
  app.use('/api/student', member2Routes(createMember2Service({ pool, tripCatalog, clock }), createAuthService({ config, pool, provider, sendEmail }), config));
  const authenticate = requireAuth(createAuthService({config,pool,provider}));
  app.use('/api', authenticate, (req,res,next)=>{
    req.auth={user_id:req.user.id,role:req.user.role,driver_id:req.user.driver_id};
    if(!['GET','HEAD'].includes(req.method)) return requireSameOrigin(config)(req,res,next);
    next();
  });
  app.use(createTransportApp(pool,{
    authenticateDriver:(req,res,next)=>next(),
    authorizeManagement:(req,res,next)=>['admin','authority'].includes(req.auth?.role)?next():res.status(403).json({error:'forbidden'})
  }));
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.code });
    if (error instanceof Member2Error) return res.status(error.status).json({ error: error.code });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' });
    console.error('Authentication request failed', { type: error.constructor.name, code: error.code });
    res.status(500).json({ error: 'server_error', message: 'Authentication is temporarily unavailable. Please try again.' });
  });
  return app;
}
