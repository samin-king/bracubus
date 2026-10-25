# Member 1: local development student login

This opt-in flow substitutes local delivery for SMTP for exactly one test student:
`saeeb.rahman.samin@g.bracu.ac.bd`. It still uses the normal request endpoint,
random verification token, hashed token table, expiry, atomic consumption, existing
controller session creation, PostgreSQL session store, AuthProvider and ProtectedRoute.
The existing protected identity page at `/` proves sign-in; no dashboard was added.

## Enable locally

In the ignored project-root `.env` use `NODE_ENV=development` and
`DEV_EMAIL_LOGIN=true`. Both DATABASE_URL and FRONTEND_URL must point to loopback
hosts. The development backend binds only to `127.0.0.1`. No SMTP or Google
credentials are needed for this test. Never enable this option for deployment.

From the project root:

```powershell
node scripts/start-local-postgres.mjs
npm.cmd run migrate
node scripts/seed-dev-student.mjs
npm.cmd run dev:server
```

In another terminal, run the existing frontend (`npm.cmd run dev` inside Client).
The seed inserts a clearly named `Member 1 Local Test Student` with an explicitly
local development subject identifier (not a real or fake Google credential). It
uses the existing users schema; an existing email is left untouched. Repeated seed
runs do not create duplicates. The seed refuses production or remote configuration.

## Verify in the browser

1. Visit http://localhost:5173/login and enter the exact test student email.
2. Press Enter or Login. This generates a fresh ten-minute verification token;
   it does not authenticate you.
3. Run `node scripts/inspect-dev-email-login.mjs` from the project root. This
   explicit development CLI displays the one-time verification URL stored in
   ignored `.local/member1-email-login.json`. Treat that URL as a temporary secret;
   do not share it or add it to Git. Ordinary server logs and HTTP request responses
   do not contain it. A later login request overwrites the captured message.
4. Open the URL, then press **Verify email and sign in**. The normal verifier
   consumes the token and the existing controller regenerates the session.
5. The existing protected page at `/` displays the student name/email. Reload to
   verify session persistence, then sign out to verify that protected access ends.

The browser also recognizes a link opened in the already-loaded login tab and
removes the token fragment from the address bar. Token replay is rejected.

Other BRACU addresses cannot use this delivery substitute, even if they have a user
record. Unknown addresses are not created or authenticated. Invalid, expired, and
reused tokens fail the same verification logic as normal email login.

## Production safeguards

The example environment defaults DEV_EMAIL_LOGIN to false. Enabling it requires
exact NODE_ENV=development and loopback database/frontend URLs. A production startup
with the flag enabled fails configuration validation; the sender independently
rechecks these conditions. No token retrieval HTTP endpoint exists. With the flag
off, the existing real SMTP sender is used, and missing SMTP still fails closed.
The normal production verification step, Google provider, middleware, cookie flags,
and session expiry remain intact. To return to SMTP locally, set DEV_EMAIL_LOGIN
to false, configure SMTP and restart the backend.

Validation includes backend security/integration tests, a frontend test using the
real AuthProvider/ProtectedRoute, and a live Chrome check against the local Vite,
backend, and PostgreSQL services. Browser proof artifacts are ignored under `.local/`.
