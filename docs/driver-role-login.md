# Driver role login

Use the existing single email-login form at http://localhost:5173/login. No role selector or Google flow is needed. Student email eligibility rules are retained; the documented development driver emails use the same BRACU email format.

## Local development

The existing `DEV_DIRECT_LOGIN=true` and `NODE_ENV=development` configuration applies to both students and registered staff. Database/frontend URLs, the actual request peer, Host and Origin must be local/allowed. Production cannot use the direct endpoint. Normal secure email-link verification remains available and also resolves registered driver roles.

Run the existing `npm run seed` after migrations. When the local direct-login configuration is enabled, it additionally loads `database/seeds/driver-accounts.sql`:

| Email | Driver record |
| --- | --- |
| driver.one@g.bracu.ac.bd | DEV-DL-001 / Development Driver One |
| driver.two@g.bracu.ac.bd | DEV-DL-002 / Development Driver Two |

These are explicitly local development identities, not credentials. No email or driver ID is hardcoded into React. The seed does not overwrite existing account roles or driver links, and does not create driver login accounts in production. New unknown valid emails continue to create student accounts, never staff accounts. Staff roles must already be assigned in the database.

## Identity and redirect

The existing users table already has a role and a unique driver_id FK. Login loads the database account, rejects an inactive/unlinked driver, regenerates the existing session ID, and saves userId, authExpiresAt and a sanitized user snapshot containing id/name/email/role/driver_id when applicable. Authorization still reloads the database account on requests; the session snapshot and browser fields do not override the database.

AuthProvider continues to refresh `/api/auth/me`. The authenticated role determines the destination:

- Student: `/` (Student Dashboard).
- Driver: `/driver` (the existing Member 3 DriverDashboard component).
- Authority/admin: `/transport` (the existing authority transport management portal; no duplicate authority dashboard is introduced).

ProtectedRoute retains its anonymous/loading/error behavior and adds an optional role allowlist. Student booking/history/complaints/feedback routes are student-only. The driver route is driver-only. Existing transport navigation continues to follow the authenticated role.

The Driver Dashboard is reused unchanged. It requests `/api/drivers/me` and `/api/drivers/me/trips`, using the server-linked driver identity. It does not accept a driver ID from query strings, localStorage or the login form. Driver APIs require role=driver and a server-supplied driver_id. Existing assignment checks remain on status changes. Generic trip list/detail reads are also scoped to the driver's assigned trips. Authority/admin management access remains available through the existing role rules.

## Verification

- Student and driver browser logins both passed, including their correct dashboard destinations.
- Driver session fields were checked in PostgreSQL; reload retained the correct role and identity.
- Student access to the driver URL/API was denied; driver access to student booking URL/API was denied.
- Cross-driver trip reads and forged-ID status changes were rejected.
- Existing Start/Stop UI controls were exercised on a disposable trip; the trip and route were removed afterward.
- Driver status/demo tracking remained available; logout invalidated the session and protected route.
- Driver account seed repeatability, production seed exclusion, production endpoint rejection, missing/inactive driver linkage, and normal verified-email driver login are covered by automated tests.
- All existing Member 2 booking/history/cancellation, Member 3 transport and Member 4 complaint/feedback/notification tests remain in the full suites.

Existing limitations remain: tracking positions are illustrative/demo because no GPS backend exists; live Redis is not part of this verification. SMTP must be configured for production email delivery.

## Files changed for this request

- services/src/services/authService.js
- services/src/controllers/authController.js
- server/src/middleware/driverIdentity.js
- server/src/controllers/tripController.js
- server/src/utils/database.js
- database/seeds/driver-accounts.sql (new)
- Client/src/services/roleHome.js (new)
- Client/src/components/ProtectedRoute.jsx
- Client/src/pages/Login.jsx
- Client/src/App.jsx
- Client/src/pages/Member2.jsx
- Client/src/test/auth.test.jsx
- Client/src/test/emailLogin.test.jsx
- Client/src/test/studentFlow.test.jsx
- Client/src/test/roleLogin.test.jsx (new)
- server/test/driver.test.js
- server/frontend-test/driver-ui.test.js
- services/test/devDirectLogin.test.js
- services/test/driverLogin.test.js (new)
- README.md
- docs/local-direct-login.md
- docs/driver-role-login.md (new)

No commit or push was made. Prior uncommitted integration/UI work is retained.
## Final results

- Backend suites: 187 passed, zero failed, two optional external-service tests skipped.
- Frontend: 49 passed, zero failed.
- Built driver/Member 4 UI tests: 15 passed, zero failed.
- Production build: passed.
- Chrome: all 13 checks passed against the running app.
- `npm run seed`: completed and installed the two guarded local driver accounts.
- No migration was required; existing role and driver-link columns were reused.
- No unresolved Git conflicts, commits or pushes.

Ignored verification artifacts: `.local/driver-role-all-backend.log`, `.local/driver-role-frontend.log`, `.local/driver-role-built-ui.log`, `.local/driver-role-build.log`, `.local/driver-role-browser.log`, `.local/driver-role-browser-report.json`, `.local/driver-role-dashboard.png`.
