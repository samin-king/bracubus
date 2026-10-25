import {localEmailLoginEnabled, localDirectLoginEnabled} from './devEmailLogin.js';
export function loadAuthConfig(env = process.env) {
  const vercel = env.VERCEL === '1';
  const deploymentHost = env.VERCEL_ENV === 'preview' ? env.VERCEL_URL :
    (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL);
  const frontendUrl = env.FRONTEND_URL || (vercel && deploymentHost ? `https://${deploymentHost}` : undefined);
  const devDirectLogin=localDirectLoginEnabled(env);
  const devEmailLogin=localEmailLoginEnabled(env);
  const smtpPort=Number(env.SMTP_PORT || 587);
  if(!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535) throw new Error('Invalid SMTP_PORT');
  if(Boolean(env.SMTP_USER)!==Boolean(env.SMTP_PASSWORD)) throw new Error('SMTP_USER and SMTP_PASSWORD must both be configured');
  for (const key of ['DATABASE_URL', 'SESSION_SECRET']) {
    if (!env[key]?.trim()) throw new Error(`Missing configuration: ${key}`);
  }
  if (!frontendUrl?.trim()) throw new Error('Missing configuration: FRONTEND_URL');
  if (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-')) throw new Error('SESSION_SECRET must be random and at least 32 characters');
  const production = env.NODE_ENV === 'production';
  const hasClientId = Boolean(env.GOOGLE_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET?.trim());
  if (hasClientId !== hasClientSecret) throw new Error('Google OAuth credentials must both be configured');
  if (hasClientId && !env.GOOGLE_CALLBACK_URL?.trim()) throw new Error('Missing configuration: GOOGLE_CALLBACK_URL');
  for (const [key, value] of [['FRONTEND_URL', frontendUrl], ...(hasClientId ? [['GOOGLE_CALLBACK_URL', env.GOOGLE_CALLBACK_URL]] : [])]) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (production && url.protocol !== 'https:')) throw new Error(`Invalid URL: ${key}`);
  }
  const domain = (env.BRACU_STUDENT_EMAIL_DOMAIN || 'g.bracu.ac.bd').toLowerCase();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(domain)) throw new Error('Invalid institutional domain');
  const ttlHours = Number(env.SESSION_TTL_HOURS || 8);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 24) throw new Error('SESSION_TTL_HOURS must be greater than zero and at most 24');
  const secure = env.SESSION_COOKIE_SECURE === 'true' || production;
  return {
    devDirectLogin,devEmailLogin,nodeEnv:env.NODE_ENV,smtpHost:env.SMTP_HOST,smtpPort,smtpSecure:env.SMTP_SECURE==='true',smtpUser:env.SMTP_USER,smtpPassword:env.SMTP_PASSWORD,emailFrom:env.EMAIL_FROM,
    databaseUrl: env.DATABASE_URL, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: hasClientId ? env.GOOGLE_CALLBACK_URL : undefined, frontendUrl: new URL(frontendUrl).origin,
    domain, emailPattern: env.BRACU_STUDENT_EMAIL_PATTERN ? new RegExp(`^(?:${env.BRACU_STUDENT_EMAIL_PATTERN})$`, 'i') : null,
    secret: env.SESSION_SECRET, ttlMs: ttlHours * 3600000, secure, trustProxy: env.TRUST_PROXY === 'true' || vercel,
    serverless: vercel,
    cookieName: secure ? '__Host-bracu.sid' : 'bracu.sid'
  };
}
