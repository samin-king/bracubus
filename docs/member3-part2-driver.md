# Member 3 Part 2: Driver module

Latest local run: Parts 1 and 2 are running against native PostgreSQL. See [local verification](local-verification.md) for current results; it supersedes earlier database-unavailable notes below.

## Overview
Extends the Part 1 Express routes -> controllers -> services -> PostgreSQL architecture. Existing buses, routes and trips are reused. The original 001 migration and existing database configuration are unchanged. Existing services/ and Client/pages/ placeholder trees remain untouched; runnable modules live in server/src and Client/src.

## Database
Migration: Database/migrations/002_driver.sql.
Drivers have identity id, name, unique license_number, ACTIVE/INACTIVE status, and created_at/updated_at timestamptz. No unnecessary contact or personal information is stored. The existing timestamp trigger function maintains updated_at.
The migration drops only trips_driver_id_check and replaces it with a nullable FK referencing drivers(id) ON DELETE RESTRICT. Null assignments and old trip records are preserved. It adds started_at and completed_at. Driver 1 -> many trips; every assigned trip references one driver, bus and route. Unassigned trips remain supported.
Indexes cover driver_id, unique non-cancelled driver/date/time, and unique ACTIVE trip per driver. Journey duration overlap checking is not implemented because duration is not modeled. Existing STOPPED status is preserved.
Assignment and lifecycle services use a transaction with trip and driver row locks. Inactive drivers cannot be newly assigned or operate trips. Only scheduled trips can change assignment or be unassigned. Drivers are not deleted.

## APIs
All payload and response fields follow existing snake_case conventions.

| Method | Endpoint | Access / purpose |
| --- | --- | --- |
| GET | /api/drivers | Management list |
| GET | /api/drivers/:id | Management detail |
| POST | /api/drivers | Management create |
| PUT | /api/drivers/:id | Management replace |
| GET | /api/drivers/me | Authenticated driver profile |
| GET | /api/drivers/:id/trips | Authenticated driver, own ID only |
| GET | /api/drivers/me/trips | Authenticated driver assigned trips |
| PUT | /api/trips/:id/driver | Management assignment/change/unassign |
| POST | /api/trips/:id/start | Assigned authenticated driver only |
| POST | /api/trips/:id/stop | Assigned authenticated driver only |

POST driver example:
~~~json
{"name":"Development Driver Three","license_number":"DEV-DL-003","status":"ACTIVE"}
~~~
Assignment payload: {"driver_id":1}; unassign: {"driver_id":null}. Missing driver_id is rejected. Generic trip create/update does not accept assignment; use the dedicated endpoint.
Start and stop need no body. Body driver_id and x-driver-id headers do not establish identity. Trip GET/list and assigned trip responses include driver_id, nested driver (id/name/status) or null, existing bus and route objects, started_at and completed_at.

Errors are JSON {"error":"message"}. 400 invalid payload/ID; 401 missing identity; 403 another driver's trip or inactive driver; 404 missing driver/trip; 409 inactive assignment, conflicting schedule or invalid transition; 500 unexpected database failure. Database stack traces are not sent to clients.

## Workflow and transitions
Member 1 login -> authenticated driver session -> Driver Dashboard -> assigned trip -> Start Trip -> ACTIVE -> Stop Trip -> COMPLETED.
No fake login system was created. Development mode supplies identity from explicit server configuration.
Allowed transitions: SCHEDULED -> ACTIVE through start; ACTIVE -> COMPLETED through stop.
Rejected: ACTIVE -> ACTIVE; COMPLETED/CANCELLED/STOPPED -> ACTIVE; SCHEDULED/COMPLETED/CANCELLED/STOPPED -> COMPLETED.
Only the assigned ACTIVE driver can operate the trip. Start stores started_at; stop stores completed_at. Buttons are absent on completed/cancelled/stopped trips. All trip controls disable while a request is pending, with inline errors and success feedback.
Generic Part 1 PUT cannot change an assigned trip's status, bypass driver controls, or modify the bus/route/date/time of an assigned ACTIVE/COMPLETED/STOPPED trip. The API still supports Part 1 edits for unassigned trips. Production must protect existing management APIs when authorization integration is added.

## Authentication integration: Member 1
createApp(db,{authenticateDriver,authorizeManagement}) accepts trusted Express middleware. Member 1 must validate the session/token server-side, map the verified account to drivers.id, and set req.auth.driver_id before calling next(). The requireDriver middleware reads only this verified identity. Do not populate it directly from a body, query parameter, or unverified header.
A default developmentIdentity middleware activates only when NODE_ENV=development AND ENABLE_DEV_DRIVER_AUTH=true. DEV_DRIVER_ID is configured server-side. Production ignores these development flags. The default .env.example leaves the development mechanism disabled. This is an isolated local development facility, never production login.
Use same-origin session cookies or an authenticated reverse proxy as appropriate for Member 1's actual integration; no token storage or credential UI has been introduced here.

## Authorization integration: Member 4
Supply authorizeManagement middleware to permit management driver CRUD and trip assignment only to authorized management accounts. The default denies these routes with 403 unless explicit development mode is enabled. The frontend navigation does not confer permission. Member 4 must also secure existing Part 1 management routes; no separate RBAC implementation has been built.
Driver identity checks and trip ownership stay in this module even when role checks are added.

## Frontend
DriverDashboard loads the authenticated profile and own assigned trips through driverApi. AssignedTrip renders driver trip, bus, route, date/time/status and audit times. TripControl displays Start Trip or Stop Trip based on state. Drivers reuses ManagementPage for driver create/edit/list and adds DriverAssignment for selecting a scheduled trip and active driver, changing assignment or unassigning. Refresh choices reloads newly created/updated drivers. Existing TripCard now shows the assigned driver.
No PassengerList component or fake passenger records were created because no booking API exists. Dashboard shows a booking integration message instead.
Loading, empty, error, success, inactive-profile and pending-request states are included. Dates/departures retain the Part 1 Dhaka wall-time convention; audit times display Asia/Dhaka.

## Seeds
Database/seeds/drivers.sql creates fictional Development Driver One and Two (DEV-DL-001 / DEV-DL-002). Future SCHEDULED trips on BRACU-01/02 are assigned when unassigned and nonconflicting; BRACU-03 remains unassigned. Existing assignments and historical records are not overwritten. The existing seed runner now executes development.sql then drivers.sql in the same transaction. Repeated seeding is tested.

## Run (PowerShell, repository root)
Requires Node.js 22.12+ or a newer supported release, npm, and Docker Compose or an accessible PostgreSQL server. Keep existing .env; configure DATABASE_URL/API_PORT if needed.
~~~powershell
npm.cmd install
docker compose up -d --wait
npm.cmd run migrate
npm.cmd run seed
$env:NODE_ENV = 'development'
$env:ENABLE_DEV_DRIVER_AUTH = 'true'
$env:DEV_DRIVER_ID = '1'
npm.cmd run dev
~~~
Use the actual fictional driver's ID in DEV_DRIVER_ID if the database already contained drivers. The management GET /api/drivers lists IDs while development mode is enabled. Never use this mechanism in production.
In another terminal:
~~~powershell
npm.cmd run dev --workspace transport-client
~~~
Open http://localhost:5173. Choose Drivers for assignment, and Driver Dashboard for own trips. Vite retains the existing /api proxy to port 3000.

## Tests
~~~powershell
npm.cmd test
npm.cmd run test:frontend
~~~
Backend tests default to a test-only embedded PostgreSQL engine (PGlite). To use a separate PostgreSQL server instead:
~~~powershell
$env:TEST_DATABASE_URL = 'postgres://bracu:bracu_dev@localhost:5432/bracu_transport'
npm.cmd test
npm.cmd run test:frontend
~~~
Tests create and drop unique isolated schemas. They never truncate application tables. The database user needs schema creation permission. Embedded tests exercise real PostgreSQL SQL, constraints, triggers, transactions, migrations and seeds; they do not validate multi-connection load or deployment/network behavior. jsdom tests execute the built React bundle against the Express API and PostgreSQL fixture. They verify behavior, not visual layout in a full browser.

Final results:
- Backend: 46 passed, 0 failed, 0 skipped (includes Part 1 regression suite); duration 4481.1459 ms.
- Frontend: 8 passed, 0 failed, 0 skipped; duration 3574.3159 ms.
- Total Node test count (including parent test groups): 54 passed, 0 failed, 0 skipped.
- Dashboard checks: profile/assigned data; start/stop with status/timestamps/success; pending loading; disabled buttons; empty state; load errors/retry; action errors and restored controls.
- Driver checks: CRUD/license uniqueness, inactive assignment, assignment/change/unassign, invalid IDs, ownership, forged identity, state transitions, conflict indexes, timestamps, FK deletion protection, Part 1 state bypass protection, seed/migration repeatability and preservation of pre-existing Part 1 trips.
- npm installation audit: 0 vulnerabilities.

## Migration result
Both 001 and 002 migrations passed against embedded PostgreSQL in tests. Dedicated upgrade test confirmed that existing Part 1 bus/route/trip data and null driver assignments survive migration 002.
The requested npm.cmd run migrate against the configured development server was attempted and failed: ECONNREFUSED: Database connection failed. Docker is unavailable on this machine. No migration was applied to that configured database.

## Seed result
Both development and driver seeds passed and were repeatable in embedded PostgreSQL. The configured development-server npm.cmd run seed was attempted and failed: ECONNREFUSED: Database connection failed. No seed was applied to that configured database.

## Build result
Vite 6.4.4: 44 modules transformed, built in 788 ms. HTML 0.37 kB (gzip 0.27), CSS 10.46 kB (gzip 2.85), JS 156.64 kB (gzip 50.32). Generated Client/dist artifacts are ignored.

## Files created
- Database/migrations/002_driver.sql
- Database/seeds/drivers.sql
- server/src/middleware/driverIdentity.js
- server/src/utils/transaction.js
- server/src/services/driverService.js
- server/src/controllers/driverController.js
- server/src/routes/driverRoutes.js
- server/test-support/database.js
- server/test/driver.test.js
- server/frontend-test/driver-ui.test.js
- Client/src/services/driverApi.js
- Client/src/pages/DriverDashboard.jsx
- Client/src/pages/Drivers.jsx
- Client/src/components/AssignedTrip.jsx
- Client/src/components/TripControl.jsx
- Client/src/components/DriverCard.jsx
- Client/src/components/DriverAssignment.jsx
- docs/member3-part2-driver.md

## Files modified
- .env.example
- package.json
- package-lock.json
- server/package.json
- server/src/app.js
- server/src/routes/tripRoutes.js
- server/src/services/resourceService.js
- server/src/utils/validation.js
- server/src/utils/database.js
- server/src/middleware/errors.js
- server/test/api.test.js
- Client/src/main.jsx
- Client/src/components/TripCard.jsx

## Future parts
No Redis, queue, worker, live tracking, GPS, simulator, booking, payment, QR, student module, reports, authority dashboard or RBAC system was implemented.
