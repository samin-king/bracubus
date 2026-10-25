import nodemailer from 'nodemailer';
import { AuthError } from './authService.js';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DEV_STUDENT_EMAIL, localEmailLoginEnabled } from '../config/devEmailLogin.js';

export const devEmailFile = new URL('../../../.local/member1-email-login.json', import.meta.url);

export function createEmailSender(config, { localFile = devEmailFile } = {}) {
  if (config.devEmailLogin) {
    localEmailLoginEnabled({ DEV_EMAIL_LOGIN: 'true', NODE_ENV: config.nodeEnv,
      DATABASE_URL: config.databaseUrl, FRONTEND_URL: config.frontendUrl });
    return async ({ email, url }) => {
      if (email !== DEV_STUDENT_EMAIL) throw new AuthError('development_email_not_allowed', 403);
      await mkdir(new URL('../../../.local/', import.meta.url), { recursive: true });
      const temporary = new URL(localFile.href + '.' + randomUUID() + '.tmp');
      await writeFile(temporary, JSON.stringify({ email, url, expiresAt: new Date(Date.now() + 600000).toISOString() }), { mode: 0o600 });
      await rename(temporary, localFile);
    };
  }
  if (!config.smtpHost || !config.emailFrom) return null;
  const transport = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: !config.smtpSecure,
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true
  });
  return async ({ email, url }) => {
    try {
      await transport.sendMail({ from: config.emailFrom, to: email,
        subject: 'BRACU Smart Transport sign-in',
        text: `Use this one-time link to sign in to BRACU Smart Transport:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.` });
    } catch { throw new AuthError('email_delivery_failed', 503); }
  };
}
