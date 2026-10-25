export const DEV_STUDENT_EMAIL = 'saeeb.rahman.samin@g.bracu.ac.bd';
export const DEV_STUDENT_SUBJECT = 'local-development:member1-test-student';

export function localEmailLoginEnabled(env) {
  if (env.DEV_EMAIL_LOGIN !== 'true') return false;
  if (env.NODE_ENV !== 'development') throw new Error('DEV_EMAIL_LOGIN requires explicit NODE_ENV=development');
  const local = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const database = new URL(env.DATABASE_URL);
  const frontend = new URL(env.FRONTEND_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !local(database.hostname) ||
      !local(frontend.hostname) || !['http:', 'https:'].includes(frontend.protocol)) {
    throw new Error('DEV_EMAIL_LOGIN requires a loopback database and frontend');
  }
  return true;
}

// Independent of the captured-email option: this bypass is explicitly opt-in.
export function localDirectLoginEnabled(env) {
  if (env.DEV_DIRECT_LOGIN !== 'true') return false;
  if (env.NODE_ENV !== 'development') throw new Error('DEV_DIRECT_LOGIN requires explicit NODE_ENV=development');
  const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const database = new URL(env.DATABASE_URL), frontend = new URL(env.FRONTEND_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !loopback(database.hostname) ||
      !['http:', 'https:'].includes(frontend.protocol) || !loopback(frontend.hostname)) {
    throw new Error('DEV_DIRECT_LOGIN requires a loopback database and frontend');
  }
  return true;
}

export function isLoopbackLoginRequest(req) {
  // Inspect the real peer, never client-controlled forwarded headers.
  const peer = req.socket.remoteAddress;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) &&
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(req.hostname);
}
