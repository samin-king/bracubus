# Member 1, Part 1: Authentication

Implemented scope: BRACU Google Workspace authentication only. The protected root view displays the current identity and a sign-out button; it is not a Student Dashboard. No booking, payment, fleet, tracking, authority, Redis, or reporting module is included.

## Architecture and Google flow

React/Vite/Tailwind -> Express routes -> controllers -> authentication service -> Google/PostgreSQL.

1. Login calls authApi.login(), navigating to GET /api/auth/google.
2. Backend regenerates the anonymous session and saves random state, nonce, PKCE verifier and creation time in PostgreSQL before redirecting to Google. Scopes: openid email profile. No offline access or refresh tokens are requested.
3. Google redirects an authorization code to the configured callback. Backend consumes the stored flow and requires matching state within ten minutes. Cancelled, malformed, expired and replayed callbacks are rejected.
4. google-auth-library exchanges the code using the PKCE verifier and server-only client secret. verifyIdToken verifies Google's signature, issuer, audience and expiration. The service also checks nonce, email_verified and the Workspace hd claim.
5. Only the exact configured email domain and Workspace domain are accepted. An optional anchored full-email regex provides a stricter rule. The local part must contain 2-8 alphabetic name components separated by single dots, with a maximum of 64 characters (254 characters for the full email). Verified emails are normalized to lowercase; digits, whitespace, empty components and punctuation other than separating dots are rejected. This authenticates membership in the configured student Workspace; it does not independently verify current enrollment against university records.
6. User is atomically inserted/upserted by Google's stable sub. Email is unique; a conflicting identity is rejected rather than automatically linked. Role is always student, enforced in SQL and backend. Client roles are ignored.
7. Backend regenerates the session ID again to prevent fixation and saves userId and an absolute expiry. Browser receives only an opaque signed session cookie, then redirects to the frontend root.
8. AuthProvider calls /me, shares in-flight calls, and supplies useAuth. It rechecks on window focus and every minute while signed in. ProtectedRoute waits for authentication and redirects missing authentication to /login. Every protected API must also use requireAuth.
9. Logout requires the configured frontend Origin, destroys the server session and clears the cookie. The old cookie cannot authenticate again. This signs out of this application, not the entire Google account.

Google reference: https://developers.google.com/identity/openid-connect/openid-connect

## Database

Migration: database/migrations/001_authentication.sql.

- users: id BIGSERIAL primary key; google_subject unique, not null; name; lowercase unique email; role constrained to student; created_at; updated_at. Upsert updates updated_at. Unique constraints create indexes automatically.
- auth_sessions: sid primary key; sess JSON; expire timestamp with expiry index. connect-pg-simple persists and prunes sessions. sess contains userId after authentication, OAuth state before authentication. The library's JSON session format has no SQL foreign key; requireAuth resolves userId against users on every request, rejecting deleted users.
- schema_migrations: migration runner bookkeeping, name primary key and applied_at. Runner uses a transaction and advisory lock; re-running skips applied migrations.

No Google passwords, access tokens, refresh tokens or ID tokens are stored.

## APIs

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /api/auth/google | Starts real Google authorization; 302 |
| GET | /api/auth/google/callback | Validates code/state/identity; 302 to root or login with allowlisted error code |
| GET | /api/auth/me | 200 {id,name,email,role}; 401 if missing/expired authentication |
| POST | /api/auth/logout | Requires matching Origin; destroys session; 204 |

Auth errors use 400 for malformed callbacks, 401 for missing authentication or failed provider verification, 403 for institutional/identity/origin rejection. Browser callbacks present expected failures via a safe 302 to Login, rather than a raw JSON error. Database/session failures return generic 500 JSON; unknown routes return 404; OAuth endpoints have rate limiting (429). No stack traces or provider responses are returned.

## Environment

Copy the root .env.example to .env; do not commit .env. No real credentials are included.

- DATABASE_URL: PostgreSQL connection string. Production should use the database provider's authenticated TLS configuration.
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: OAuth Web application credentials, backend only.
- GOOGLE_CALLBACK_URL: exact registered callback, initially http://localhost:3000/api/auth/google/callback.
- FRONTEND_URL: browser origin, initially http://localhost:5173. Logout checks this Origin.
- BRACU_STUDENT_EMAIL_DOMAIN: g.bracu.ac.bd by default. Both email suffix and hd must match exactly.
- BRACU_STUDENT_EMAIL_PATTERN: optional full-email regex, automatically anchored, case-insensitive. Set only an agreed rule. No user-specific allowlist.
- SESSION_SECRET: at least 32 unpredictable characters; placeholder is rejected at startup. Generate with Node crypto.
- SESSION_TTL_HOURS: absolute lifetime, default 8, maximum 24.
- SESSION_COOKIE_SECURE: true for HTTPS; production forces true and requires HTTPS URLs. HttpOnly, SameSite=Lax, host-only, Path=/; production uses __Host-bracu.sid.
- TRUST_PROXY: true only behind one trusted reverse proxy. Proxy must strip incoming forwarded headers. Default false.
- PORT: backend default 3000. NODE_ENV: production in production.
- POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD: local Compose database configuration.

## Local setup (PowerShell, from A:\Bracubus)

Prerequisites: Node.js 22.19+, npm, and PostgreSQL (or Docker Desktop with Compose). This checkout had Node/npm installed outside PATH, but no detected Docker/PostgreSQL tooling. Add Node to PATH in the current terminal when needed:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated secret into SESSION_SECRET in .env, and provide the Google credentials. Change local database credentials if desired; DATABASE_URL must match them. Then:

```powershell
docker compose up -d postgres
npm run migrate
npm test
npm run build
npm run dev:server
```

In a second terminal:

```powershell
npm run dev:client
```

Visit http://localhost:5173 using localhost consistently (not 127.0.0.1). Vite proxies /api to port 3000. Existing PostgreSQL can be reused instead of Compose by changing DATABASE_URL. The migration command only requires DATABASE_URL, not Google credentials.

Production must serve Client/dist and proxy /api on the same HTTPS origin, preserving Set-Cookie. Configure SPA fallback to index.html. Set FRONTEND_URL and GOOGLE_CALLBACK_URL to that origin and register the exact production callback. Do not use the Vite development server as production hosting. Session cookies intentionally use SameSite=Lax; unrelated frontend/backend sites are not supported by this configuration.

## Google Cloud configuration required

1. Use a Google Cloud project authorized for BRACU Workspace sign-in. Configure the OAuth consent screen / Google Auth Platform application.
2. Choose Internal only if the project belongs to the correct Workspace organization; otherwise use the organization's approved External configuration and add BRACU test users while in testing mode. Workspace administrators may need to approve the app.
3. Create an OAuth client of type Web application. Register the exact authorized redirect URI http://localhost:3000/api/auth/google/callback. Add the exact HTTPS production URI when deployed. The backend authorization-code flow does not require a frontend client secret or a JavaScript-origin-based SDK.
4. Provide the issued Client ID and Client Secret in the backend .env, and set GOOGLE_CALLBACK_URL to the matching URI. Request only openid, email, profile.
5. Confirm the institution's Google token hd is g.bracu.ac.bd. If the institution uses a different canonical Workspace domain, review the policy with the team before changing configuration; this implementation intentionally requires an exact match.

Actual browser authentication requires valid Google Cloud OAuth credentials and an authorized BRACU Workspace account. Automated tests mock the provider, not application authentication.

## Tests and validation

Backend: Node test runner, Supertest, pg-mem for fast unit tests and PGlite (embedded PostgreSQL) for the migration and real connect-pg-simple integration test. PGlite is a test-only dependency and requires no database daemon. Tests cover email/Workspace/pattern checks, server-assigned role, persistence/deduplication, public response fields, protected /me, logout/cookie replay, CSRF origin, OAuth state/replay/nonce, provider errors, expired sessions, database errors and configuration. The production code always uses the Google verifier and PostgreSQL session store; the memory session store is injected only in unit tests; the integration test uses the actual PostgreSQL session store.

Frontend: Vitest, jsdom, Testing Library; login branding/button, protected redirect/allow/loading/error, institutional failure, shared auth state, API credential handling, successful/failed logout and pending-refresh regression coverage. No real Google credentials needed.

Run npm test and npm run build from the root. See validation results appended below for this environment. pg-mem is not a substitute for applying the migration against a real PostgreSQL server. A complete real Google/browser test remains pending credentials and PostgreSQL availability.

## Security and limitations

Secrets stay on the backend. No JWT or localStorage authentication is used. Cookies carry only session IDs; all identities are fetched server-side. SQL is parameterized; unique constraints prevent duplicate provider identities. HTTPS, HttpOnly, SameSite, OAuth state/nonce/PKCE, session regeneration, absolute expiration, origin protection, no-store auth responses and Helmet are enabled. Safe errors do not echo callback input or tokens. Role management is outside this task.

The OAuth limiter is per process and resets on restart; a shared perimeter limiter is needed if later deployed across multiple replicas. Session cleanup is handled by connect-pg-simple. Logout requires a browser Origin; non-browser clients must explicitly provide the configured Origin. Enrollment verification and operational hosting are outside this authentication foundation.

## Integration for the later Student module

Wrap new student pages with ProtectedRoute under the existing AuthProvider. useAuth() provides user, authenticated, loading, error, refresh and logout. authApi centralizes credentialed current-user and logout requests and login initiation. Backend integration uses requireAuth(service); read req.user.id and req.user.role, never a body/query identity or client-selected role. /me exposes only id, name, email, role. Use users.id as the future foreign key; do not couple business records to mutable email. No business tables are included here.

## Files

Original empty files now forward to the canonical modules; no duplicate auth endpoints are mounted. Existing services and Client roots are retained, with conventional routes/controllers/services/middleware under services/src. The database folder and Login filename have normalized casing for Linux portability.

## Validation results (18 October 2026)

- npm test: backend 27 passed, 0 failed; frontend 13 passed, 0 failed across 3 files.
- npm run build: Vite 8.3.4, 28 modules transformed; production build successful. Output: dist/index.html 0.37 kB, CSS 9.45 kB, JavaScript 186.37 kB (gzip 61.88 kB).
- Dependency installation/audit: 0 known vulnerabilities after updating frontend tooling/router and google-auth-library.
- SQL migration applied successfully in embedded PostgreSQL during the session-store integration test. This test also verified authentication persistence, /me, logout, and session deletion with connect-pg-simple.
- npm run migrate against the documented localhost PostgreSQL address: failed with ECONNREFUSED on ::1:5432 and 127.0.0.1:5432. No live PostgreSQL migration was applied; start PostgreSQL and rerun the command.
- Legacy backend compatibility exports imported successfully.
- Real Google OAuth browser login: not run, because no Google OAuth credentials or authorized account were supplied. Configure Google Cloud and the backend environment before browser verification.

## Complete file inventory

Created:
- .env.example
- .gitignore
- Client/index.html
- Client/package.json
- Client/postcss.config.js
- Client/src/App.jsx
- Client/src/components/AuthProvider.jsx
- Client/src/components/ProtectedRoute.jsx
- Client/src/hooks/useAuth.js
- Client/src/main.jsx
- Client/src/services/authApi.js
- Client/src/styles.css
- Client/src/test/auth.test.jsx
- Client/src/test/authApi.test.js
- Client/src/test/authProvider.test.jsx
- Client/src/test/setup.js
- Client/tailwind.config.js
- Client/vite.config.js
- compose.yaml
- database/migrations/001_authentication.sql
- docs/member1-part1-authentication.md
- package.json
- package-lock.json
- services/package.json
- services/scripts/migrate.js
- services/src/app.js
- services/src/config/auth.js
- services/src/config/db.js
- services/src/controllers/authController.js
- services/src/middleware/authMiddleware.js
- services/src/routes/authRoutes.js
- services/src/server.js
- services/src/services/authService.js
- services/test/auth.test.js

Modified (original empty placeholders; login.jsx renamed to Login.jsx):

- Client/src/pages/Login.jsx
- Client/src/pages/compoments/ProtectedRoute.jsx
- Client/src/pages/compoments/services/authApi.js
- services/src/pages/middleware/authMiddleware.js
- services/src/pages/routes/authController.js
- services/src/pages/routes/Controllers/authController.js
- services/src/pages/routes/Controllers/services/authService.js

## Local setup verification after missing-environment repair

Status: PARTIALLY WORKING. Existing authentication code reused; no alternative login or replacement server added.

Changes in this repair:
- Created root .env from .env.example, with locally generated random session secret and database password. DATABASE_URL and Compose password match. Google credential fields intentionally remain empty. Values are not included in this documentation. .env is excluded by the existing .gitignore.
- Updated this documentation only; no authentication implementation rewrite was needed.

Verified:
- Frontend running at http://localhost:5173/login; HTTP 200. Served Login module contains Continue with BRACU Google.
- Frontend uses relative /api/auth requests; Vite proxies /api to localhost:3000. No route/base-URL mismatch found, and separate CORS configuration is unnecessary for this same-origin proxy arrangement.
- Existing OAuth endpoints: GET /api/auth/google, GET /api/auth/google/callback, GET /api/auth/me, POST /api/auth/logout.
- Existing state/nonce/PKCE flow and identity verification retained. Required scopes: openid email profile. Exact email and Workspace domain: g.bracu.ac.bd, plus optional configured stricter pattern.
- npm test: 27 backend passed, 13 frontend passed; 0 failed, 0 skipped. Routes, unauthenticated 401, logout, invalid identities, student role, deduplication and protected redirects verified through automated tests. PostgreSQL session integration and SQL migration pass against embedded PostgreSQL in tests.
- npm run build: exit 0, Vite 8.3.4, 28 modules, built in 741 ms. HTML 0.37 kB, CSS 9.45 kB, JavaScript 186.37 kB (gzip 61.88 kB).
- No lint/format scripts are configured in the existing package manifests.

Remaining environment blockers:
- docker compose up -d failed: PowerShell reports that docker is not recognized. Docker executable also absent at its usual Docker Desktop installation path. psql and the standard PostgreSQL installation directory were not found.
- npm run migrate failed with ECONNREFUSED for ::1:5432 and 127.0.0.1:5432. No live users table could be verified because no server is listening. The existing migration includes all required user fields and constraints; do not create another table.
- npm run dev:server was attempted; startup stopped with Missing configuration: GOOGLE_CLIENT_ID. Both OAuth credential fields are empty. The failed watch process was stopped. Backend is not listening on port 3000, so live /me and logout checks remain blocked; their automated tests pass.
- REAL GOOGLE OAUTH TEST = BLOCKED BY MISSING CREDENTIALS.

Next local setup steps:
1. Install/start Docker Desktop with Compose, or provide a running PostgreSQL server through DATABASE_URL. Existing PostgreSQL architecture and Compose configuration are preserved.
2. Create a Google Cloud OAuth client of type Web application for the approved BRACU consent configuration. Put its client ID into GOOGLE_CLIENT_ID and client secret into GOOGLE_CLIENT_SECRET in A:\Bracubus\.env using a local editor. Never send the secret through chat or commit .env.
3. Register exactly http://localhost:3000/api/auth/google/callback as the authorized redirect URI. Keep GOOGLE_CALLBACK_URL equal to it. Keep FRONTEND_URL=http://localhost:5173 and BRACU_STUDENT_EMAIL_DOMAIN=g.bracu.ac.bd. Session secret is already generated locally.
4. Run from A:\Bracubus (Node.js may need adding to PATH):

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
docker compose up -d postgres
npm.cmd run migrate
npm.cmd run dev:server
```

In another terminal, if the frontend is not already running:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm.cmd run dev:client
```

After editing .env, restart the backend manually; the Node source watcher does not guarantee reloads for .env edits. Then visit http://localhost:5173/login and perform the real Google flow with an authorized BRACU account. Live backend route responses and end-to-end identity/session verification can only be confirmed after these external prerequisites are supplied.
## Latest local run: PostgreSQL and backend now running

This section supersedes the earlier missing-database/backend blockers.

- Installed the official EDB PostgreSQL 17.11 Windows runtime under ignored .local/postgresql17. No Docker/WSL or Windows service installation was required. Source: https://www.postgresql.org/download/windows/ and https://www.enterprisedb.com/download-postgresql-binaries.
- Initialized a private local cluster at .local/postgres-data, listening only on 127.0.0.1:5432 with SCRAM password authentication. Bootstrap admin credentials stay in ignored .local; application credentials stay in ignored .env. No credential values were printed.
- Created database bracu owned by a separate bracu login role. Verified the application role is not a PostgreSQL superuser.
- Ran the existing npm run migrate successfully: Applied 001_authentication.sql. Verified live users columns: id, google_subject, name, email, role, created_at, updated_at. schema_migrations records the applied migration.
- Started the existing npm run dev:server on port 3000. Frontend remains available at http://localhost:5173/login.
- Fixed the development startup dependency on Google credentials: both may be absent locally while the real database, /me and logout remain usable. Partial configuration is rejected. Production still requires both credentials. The unconfigured provider rejects login with 503 oauth_not_configured and never issues an identity/session.

Live checks:

| Check | Result |
| --- | --- |
| Frontend /login | 200 |
| Backend anonymous /api/auth/me | 401 |
| Vite-proxied anonymous /api/auth/me | 401 |
| Google login without credentials | 503 |
| Invalid Google callback | 302 to safe login error |
| Same-origin logout through Vite | 204 |
| Cross-origin logout | 403 |

Regression tests after the development startup fix: 29 backend passed and 13 frontend passed; 0 failed, 0 skipped. The frontend source is unchanged from the successful production build recorded above.

New helper files:
- scripts/start-local-postgres.mjs: initializes/starts only the project-local cluster, creates the least-privilege application role/database if absent, and verifies the app connection.
- scripts/stop-local-postgres.mjs: stops only that project-local cluster.

Modified: .gitignore (.local exclusion), services/src/config/auth.js, services/src/services/authService.js, services/src/server.js, services/test/auth.test.js, and this document.

Local restart commands, from A:\Bracubus:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
node scripts/start-local-postgres.mjs
npm.cmd run migrate
npm.cmd run dev:server
```

In another terminal, only if frontend is stopped:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm.cmd run dev:client
```

Stop the local database when needed:

```powershell
node scripts/stop-local-postgres.mjs
```

Docker Compose remains available as an alternative; stop the native local database first before starting another server on port 5432. The native helper does not install an auto-start service; rerun it after restarting Windows. All local database files, logs and downloaded binaries are excluded by .local/.

Only the Google account configuration step remains: the Google Cloud Clients page and local .env were opened for private entry. Create a Web application OAuth client, register http://localhost:3000/api/auth/google/callback, set the two Google credential fields in local .env and save. Restart the backend after saving. Reference: https://developers.google.com/identity/protocols/oauth2/web-server.

REAL GOOGLE OAUTH TEST = BLOCKED BY MISSING CREDENTIALS. Google identity verification and institutional checks are unchanged; do not substitute fake credentials or a fake login.
## Student email validation update

The generic rule is `[a-z]+(?:\.[a-z]+){1,7}` for the local part, followed by the exact configured institutional domain (default `g.bracu.ac.bd`). Case is normalized before validation and persistence. The optional configured email pattern can further restrict this rule. This validation runs only on the Google provider claims after token and nonce verification; frontend email input cannot override the identity. It does not allow unregistered addresses to log in.

Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET remain empty in the inspected local configuration. Real Google sign-in remains blocked with HTTP 503 and `oauth_not_configured` until valid OAuth credentials are configured and the backend is restarted. No fake login or OAuth flow changes were introduced.
