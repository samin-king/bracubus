# Local verification: Member 3 Parts 1 and 2

Verified on 18 October 2026 (Asia/Dhaka), workspace D:/Bracubus.

## Project status: RUNNING
Frontend: http://localhost:5173 (Vite, port 5173).
Backend: http://localhost:3000/api (Express, port 3000).
Database: native PostgreSQL 17.11, localhost:5432, bracu_transport. Docker is not installed, so container status is unavailable. PostgreSQL is a separate native server process with persistent data in ignored .local/pgdata; embedded PostgreSQL is not the development database.

## Investigation, fixes and retries
1. Verified Client/, server/, Database/, docs/, package.json and compose.yaml in the requested workspace. npm.cmd ls --depth=0 confirmed dependencies were installed; no workspace reinstall was needed.
2. docker --version, docker compose version, and docker ps failed because docker was not recognized. No Docker Desktop/PostgreSQL process or service was present, no usual Docker/PostgreSQL installation directory existed, and localhost:5432 returned ECONNREFUSED.
3. Inspected DATABASE_URL without logging its password: postgres protocol, localhost, port 5432, database bracu_transport, username bracu, password present. It matches Compose configuration. There was no server to authenticate against, rather than an observed bad-password error.
4. Downloaded the official EDB native PostgreSQL 17.11 Windows binaries linked from https://www.postgresql.org/download/windows/ into ignored .local storage. Initialized an UTF-8 cluster using existing .env credentials with SCRAM authentication, listening on localhost only. Created bracu_transport. pg_isready confirmed accepting connections, and authenticated SQL confirmed PostgreSQL 17.11.
5. npm.cmd run migrate and npm.cmd run seed both succeeded. Applied 001_bus_route_trip.sql and 002_driver.sql. Verified all three trips foreign keys (bus, route, driver) with ON DELETE RESTRICT. Initial seed counts: 3 buses, 2 routes, 15 trips, 2 fictional drivers.
6. Enabled the isolated development identity only in ignored .env: NODE_ENV=development, ENABLE_DEV_DRIVER_AUTH=true, DEV_DRIVER_ID points to the fictional DEV-DL-001 profile. Started existing backend and frontend commands as hidden background processes.
7. Live Chrome verification found a favicon 404. Added Client/public/favicon.svg and its HTML link. Also replaced corrupted question-mark separators in the header and bus cards. Retry showed zero console or page errors during normal operation.
8. Native PostgreSQL tests exposed 'Client has already been connected. You cannot reuse a client.' The transaction helper treated every object with connect() as a Pool, but an already-connected pg.Client also has that method. It now acquires/releases a client only for a pg.Pool. A regression test verifies reuse, commit and rollback. Native test fixture queries are serialized to remove the pg concurrent-query deprecation warning. Both complete suites passed after retry.
9. Added npm.cmd run local using scripts/start-local.cjs. It reuses running ports, starts the native cluster (or Compose when the local cluster is absent), runs migrations/seeds, starts missing application processes, and checks HTTP readiness. Ran it successfully without creating duplicate servers.

## Live APIs and browser
HTTP 200 with real database data: /api/buses, /api/routes, /api/trips, /api/drivers, /api/drivers/1, /api/drivers/me, /api/drivers/1/trips. Assignment PUT passed assign, change-to-unassigned and reassign checks.
Actual Chrome loaded Buses, Routes, Trips, Drivers and Driver Dashboard. Verified data, no blank pages, loading feedback, successful start/stop feedback, inline API error handling and retry recovery. A controlled 503 was deliberately injected to verify the error state; it was removed and the page recovered. Mobile dashboard fit a 390px viewport.
Real browser workflow: fictional trip 33 moved SCHEDULED -> ACTIVE -> COMPLETED. started_at=2026-10-18T04:54:31.282Z, completed_at=2026-10-18T04:54:31.659Z. UI and subsequent API GET agreed. Scheduled stop, duplicate start, completed restart and duplicate stop returned 409.
Final browser run: 13 checks passed. Normal-operation console errors: 0; page errors: 0. Raw results and screenshots are in ignored .local/live-verification.json and .local/*.png.
Final data counts: 3 buses, 2 routes, 18 trips, 2 drivers. The three additional trips (16,17,33) are fictional verification journeys, all completed. All 15 original seeded trips remain. Sequence gaps result from repeatable ON CONFLICT seeds consuming identity values, not missing trip records. No leftover isolated test schemas remained.

## Automated tests against native PostgreSQL
Set TEST_DATABASE_URL from the existing .env URL, without printing credentials.
- npm.cmd test: 47 passed, 0 failed, 0 skipped; duration 987.1967 ms.
- npm.cmd run test:frontend: 8 passed, 0 failed, 0 skipped; duration 2004.2522 ms.
- Total: 55 passed, 0 failed, 0 skipped (Node counts include parent test groups).
- The database tests used native PostgreSQL 17.11, not the embedded fallback. Test schemas were isolated from application tables and cleaned up.
- No lint/format command is configured in the project package scripts.

## Build
npm.cmd run test:frontend also ran the existing production build:
Vite 6.4.4, 44 modules transformed, built in 818 ms.
HTML 0.43 kB (gzip 0.30), CSS 10.46 kB (gzip 2.85), JavaScript 156.64 kB (gzip 50.32).

## Start next time (PowerShell)
~~~powershell
Set-Location D:\Bracubus
npm.cmd run local
~~~
Then open http://localhost:5173. The command leaves processes running in the background and logs to .local/backend.stdout.log, .local/backend.stderr.log, .local/frontend.stdout.log and .local/frontend.stderr.log. Native PostgreSQL logs are .local/postgresql.log. The native binaries/data are local to this workspace and are not committed.

For separate foreground terminals after the database is running, existing commands remain:
~~~powershell
npm.cmd run dev
~~~
~~~powershell
npm.cmd run dev --workspace transport-client
~~~

## Files changed during verification
Created: scripts/start-local.cjs, server/test/transaction.test.js, Client/public/favicon.svg, docs/local-verification.md.
Modified: .gitignore, ignored .env, package.json, Client/index.html, Client/src/main.jsx, Client/src/components/BusCard.jsx, server/src/utils/transaction.js, server/test-support/database.js. Added links in the existing Part 1/2 docs to this current report. Generated build files and downloaded native/browser tools remain ignored.

## Scope
No Redis, queue, worker, live tracking, GPS, simulator or future modules were implemented. No production authentication/RBAC was added. Driver verification used the existing isolated development mechanism with fictional profiles.
