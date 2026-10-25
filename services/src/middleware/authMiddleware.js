import { AuthError } from '../services/authService.js';
export function requireAuth(service) {
  return async (req, res, next) => {
    try {
      if (!req.session?.userId || !req.session.authExpiresAt || req.session.authExpiresAt <= Date.now()) throw new AuthError('unauthenticated');
      const user = await service.findUser(req.session.userId);
      if (!user) throw new AuthError('unauthenticated');
      req.user = user;
      next();
    } catch (error) { next(error); }
  };
}
export function requireSameOrigin(config) {
  return (req, res, next) => {
    if (req.get('origin') !== config.frontendUrl) return next(new AuthError('invalid_origin', 403));
    next();
  };
}
