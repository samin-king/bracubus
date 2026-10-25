# One Vercel deployment: frontend and integrated API

Connect `samin-king/Bracu-Bus-Management-System`, branch `main`, to one Vercel
project. Set **Root Directory to the repository root** (leave the field empty).
Do not use `Client` or `services`. Root `vercel.json` configures the deployment:

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `Client/dist` |
| Node.js | 22.x or a newer supported LTS |

Remove conflicting previous dashboard overrides. Enable Vercel system environment
variables (the default). There is no separate backend host, proxy placeholder,
database-provider-specific dependency or Redis requirement. Frontend requests stay
same-origin `/api/...`.

## Minimum environment

Enter real secrets only in Vercel Environment settings, never Git or frontend code:

- `DATABASE_URL`: actual hosted PostgreSQL connection string, accessible from
  Vercel, including provider-required TLS options. A private/internal provider URL
  is not reachable from Vercel. Use a public endpoint, with a provider pooler if
  available and compatible with PostgreSQL transactions and transaction-scoped
  advisory locks. No particular database provider is required.
- `SESSION_SECRET`: stable random value of at least 32 characters. Generate it
  securely using a password manager or Node crypto; keep it stable across instances
  and redeploys to preserve valid sessions.

Vercel supplies NODE_ENV=production and its system variables. The API derives its
HTTPS origin from VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL; previews use their
own VERCEL_URL. Optional FRONTEND_URL overrides it for a canonical/custom domain.
Use the exact browser origin. Do not reuse a production override in previews.
Origin checks remain strict; client Host headers are not used for email links.

Keep DEV_DIRECT_LOGIN=false, DEV_EMAIL_LOGIN=false and ENABLE_DEV_DRIVER_AUTH=false.
The function rejects enabled bypass flags. Secure cookies and proxy trust are
automatic on Vercel; explicit SESSION_COOKIE_SECURE=true and TRUST_PROXY=true are
supported. Session lifetime defaults to eight hours. See .env.production.example.

## Email login and accounts

The API starts without SMTP or Google credentials. Missing email delivery returns
JSON 503 email_not_configured, displayed clearly by the login page. Missing Google
credentials return oauth_not_configured. GOOGLE_CALLBACK_URL is required only
when both Google credentials enable the optional OAuth endpoints.

**Real public email login still needs delivery:** set SMTP_HOST, EMAIL_FROM, the
provider's port/TLS mode and usually both SMTP_USER and SMTP_PASSWORD. Port 587
normally uses SMTP_SECURE=false for required STARTTLS; implicit TLS uses
SMTP_SECURE=true. Vercel does not create an SMTP account or inbox. A login bypass
cannot safely replace missing delivery.

Existing registered-account policy is preserved: unknown valid emails receive a
generic acknowledgment without an email or session. Import/register legitimate
users through trusted administration. Drivers need an active linked drivers row;
roles never come from browser input. A fresh database needs real accounts and
fleet/trip data before a full demonstration.

Demo seeding is **not part of deployment/startup**. The optional
services/scripts/seed-demo.js remains available for explicit operator use with
three approved distinct inboxes in DEMO_STUDENT_EMAIL, DEMO_DRIVER_EMAIL and
DEMO_AUTHORITY_EMAIL. These are not required to deploy or run the normal API.
Its preflight validates BRACU name formats, optional BRACU_STUDENT_EMAIL_PATTERN
and duplicate inboxes, and reports variable names without values. No fake default
accounts, login tokens, sessions or development bypasses are created.

## Migrations

On Vercel production/preview builds, `npm run build:vercel` runs the existing
migration script before the Vite build. DATABASE_URL is required at build time
and runtime. Migration failure stops publication. No demo seed runs. No migration
runs on API requests or cold starts. The transaction, migration ledger and advisory
lock serialize concurrent builds and avoid reapplying existing migrations.

Use a separate Preview database or disable previews until one is configured.
Never attach arbitrary pull-request builds to the production database. Schema
changes happen before promotion; future migrations must be compatible with the
currently running application. Preserve schema_migrations when importing a database.
Back up existing data before schema changes.

Outside Vercel, build:vercel builds without touching the database. `npm run migrate`
remains available explicitly against the intended database. For `vercel build`,
first load the intended project environment using the Vercel CLI.

## Serverless routing and sessions

api/index.mjs delegates to services/src/vercel.js, reusing the integrated Express
app and database trip catalog. One bounded pool (three connections per warm
instance) is managed with @vercel/functions for Fluid compute. The function does
not call listen, run workers, migrate, seed or write runtime files. The standalone
services/src/server.js remains for local development.

Root rewrites send /api/:path* to /api/index and frontend routes to /index.html.
The SPA fallback excludes /api and /api/...; API failures cannot return index.html.
Static assets come from Client/dist. No CORS or cross-origin cookies are needed.

Sessions stay in PostgreSQL auth_sessions across cold starts. Cookies are host-only
__Host-bracu.sid, Secure, HttpOnly, SameSite=Lax, Path=/, with no Domain attribute.
Expiration is checked on authenticated requests. Background pruning is disabled
for serverless; expired session/token rows can be removed by database maintenance
independently of authentication validity. Provider connection quotas and Vercel
function-duration limits still apply. Standalone queue workers are not deployed;
all existing synchronous feature APIs are retained.

## Verification

Run npm test, npm run build and then npm run test:frontend. Serverless tests cover
the actual function adapter, persistent PostgreSQL sessions, secure cookies,
email verification/replay, origin checks, optional services and integrated APIs.
Migration build gating and routing configuration are checked separately.

Run vercel dev from the repository root with the intended local project environment
for platform routing checks. Actual Vercel builds/public verification require
deployment account access. After deploying, /api/auth/me should return JSON 401
anonymously, /login should serve the SPA, and direct-login routes must return 404.
Use a real inbox to verify login, refresh persistence, logout and protected routes.
Booking confirmations still obey server-time windows, stored gender, capacity,
daily limits and concurrency restrictions.
