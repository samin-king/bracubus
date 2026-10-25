# Local development direct student login

Set `NODE_ENV=development` and `DEV_DIRECT_LOGIN=true` in the ignored root `.env`, then run the existing backend and Vite development server. This option has been enabled in the local workspace. `.env.example` defaults it to false.

On localhost/127.0.0.1, Login submits the email to `POST /api/auth/development/email-login`. The backend applies the existing BRACU student address validation, creates or reuses a student, or loads an existing registered staff account, in the existing users table, regenerates the existing session, and saves its normal userId and authExpiresAt. AuthProvider reloads `/api/auth/me` and ProtectedRoute permits the Student Dashboard. Refresh and logout use the existing PostgreSQL session mechanism.

Any address accepted by the existing student validator works; no particular email is hardcoded. New local accounts use an explicitly local subject identifier in the existing schema. Existing names, roles and profile fields are preserved. Registered driver/authority/admin accounts keep their database roles. Drivers must have an active linked driver record; no request field or email-name convention can grant a staff role. New accounts start with NULL/unverified gender. Students can complete [Student Profile](student-gender-profile.md); reserved seats and standing then follow the saved server-side profile and existing rules.

Safeguards:

- The flag is explicit and rejected outside `NODE_ENV=development`.
- Database and frontend URLs must be loopback URLs.
- The API binds to 127.0.0.1 with this option enabled.
- The endpoint checks the actual socket peer and Host, requires the configured frontend Origin, and uses the existing sign-in rate limit.
- Disabled or production configurations return 404 for direct login.
- Production frontend bundles omit the direct-login request. They use the normal email-link request and token verification.
- The existing `/email` and `/email/verify` endpoints remain unchanged. The older opt-in captured-email mechanism remains available independently via `DEV_EMAIL_LOGIN`.

To disable direct login locally, set `DEV_DIRECT_LOGIN=false` and restart the backend. The development client then uses the secure email-link flow. No Google fallback is used. For role redirects and development driver seeds, see [driver role login](driver-role-login.md).

Verification: backend guard/session tests, existing token and replay tests, frontend tests, built transport UI tests, production build, and live Chrome direct login with lisan.taslim@g.bracu.ac.bd, refresh persistence and logout. Ignored evidence is under `.local/direct-login-*`.
