# Member 2: student bookings and complaints

Scope: student booking, availability, history/details, cancellation and complaints.
Member 1 authentication is reused without a second login or authentication bypass.
No fleet management, tracking, Redis, complaint administration or RBAC is added.

## File inventory

Created:

- `database/migrations/002_member2.sql`
- `services/src/services/tripCatalog.js`
- `services/src/services/bookingRules.js`
- `services/src/services/member2Service.js`
- `services/src/routes/member2Routes.js`
- `services/test/member2.test.js`
- `Client/src/services/member2Api.js`
- `Client/src/pages/Member2.jsx`
- `Client/src/pages/member2.css`
- `Client/src/test/member2.test.jsx`
- `docs/member2-booking.md`

Modified: `.env.example`, `services/src/app.js`, `services/src/server.js`,
`services/scripts/migrate.js`, `Client/src/App.jsx`. No commits or pushes.

## Integration boundaries

`createApp` accepts a `tripCatalog` with async `list(travelDate)` returning trusted
trip records: `{ id, bus, route, departureTime, capacity, standingCapacity?, dates? }`.
IDs are stable strings, bus and route are display names, departureTime is Dhaka
`HH:mm`, capacity is the seat count, and standingCapacity defaults to zero.
An omitted dates array means the configured trip repeats daily. A present array
limits it to those ISO dates. Capacity is supplied by the backend, never the UI.

There are no existing buses/routes/trips tables in this checkout. Accordingly no
competing fleet schema was created. `tripCatalog.js` is a read-only adapter, not
a trip management module. Replace/inject it with Member 3's repository when merged.
Until then, `server.js` accepts an optional `MEMBER2_TRIPS_JSON` environment value.
Default `[]` intentionally shows an empty state; production contains no mock trips.
Example local configuration (use actual approved trip data):

```dotenv
MEMBER2_TRIPS_JSON=[{"id":"approved-trip-id","bus":"Bus A","route":"Campus to City","departureTime":"14:00","capacity":37,"standingCapacity":0}]
```

Bookings preserve a server-generated trip snapshot, stable external trip ID,
departure instant and travel date so historical receipts survive catalog changes.
They reference `users.id`; complaints reference `users.id` and optionally a booking.
There are no trip/bus/route foreign keys because those target tables do not exist.
Add those relationships in the integration migration after Member 3's schema and
ID types are agreed; do not assume these external identifiers are numeric.

Gender was absent from `users`. Migration 002 adds nullable `users.gender`, checked
as `male`/`female`. Populate it only through a trusted existing student registry or
profile provisioning process. No Member 2 request can set it. Unknown gender may
book ordinary seats, but cannot book seats 1–18 or standing. Member 1's `/me`
contract and Google authentication implementation remain unchanged.

## Rules and transaction safety

All times use Asia/Dhaka (+06:00). Booking windows are half-open:

| Departure | Opens | Closes |
|---|---|---|
| 14:00 | same day 10:50 | same day 11:15 |
| 17:00 | same day 15:20 | same day 15:40 |
| 06:30 | previous day 20:00 | departure |
| 08:30 | previous day 21:00 | departure |

The morning rules specify opening times only. Closing at departure is an explicit
implementation assumption pending confirmation of an earlier business cutoff.
Other departure times are rejected by the configuration adapter.

Bookings lock the existing user row, then a transaction-scoped advisory lock for
the trip/date. Counts are re-read after locking. This serializes daily limits for
the same student and standing capacity for the same trip/date. A partial unique
index additionally prevents two confirmed bookings for the same seat; another
prevents a student booking the same trip twice. PostgreSQL unique violations return
409. A database trigger also enforces the four-confirmed-bookings limit on writes.
Cancelled records remain in history, leave both unique indexes and daily counts,
and release their seat. Standing has a finite backend capacity and is male-only.
No holds are needed: selecting a seat does not reserve it; confirmation is atomic.

Cancellation is permitted only before departure. It reuses the same student lock
and enforces ownership; repeat cancellation and departed trips return 409.
Complaints are always created Pending, irrespective of submitted status. A related
booking must belong to the current student. Trip-only complaints must reference
one of the student's bookings. Status modification has no student endpoint.

## API and UI

All APIs below are prefixed `/api/student`, use Member 1 `requireAuth`, derive
identity from the session and return no-store responses. Writes also require
the existing `requireSameOrigin` protection. Anonymous calls return 401;
ownership violations return 403; missing records 404; conflicts 409.

| Method | Path | Input |
|---|---|---|
| GET | /trips | `?date=YYYY-MM-DD` |
| GET | /trips/:id/seats | `?date=YYYY-MM-DD` |
| POST | /bookings | `{tripId, travelDate, seatNumber, standing?}` |
| GET | /bookings | current student's history |
| GET | /bookings/:id | current student's details |
| POST | /bookings/:id/cancel | empty body |
| POST | /complaints | `{category, subject, description, bookingId?, tripId?}` |
| GET | /complaints | current student's complaints |
| GET | /complaints/:id | current student's complaint details |

Student pages use the existing AuthProvider and ProtectedRoute:
`/` dashboard, `/book`, `/bookings`, `/bookings/:id`, `/complaints`,
`/complaints/:id`. Logout still uses the original provider. Pages include
loading/error/empty states, retry, inline success receipts, seat state text and
an in-app cancellation confirmation. They do not use alert or confirm.

## Running and verification

Install the locked dependencies with `npm ci`. Configure the existing local `.env`
as documented for Member 1; no secrets are included in this change. Run:

```powershell
npm.cmd run migrate
npm.cmd test
npm.cmd run build
npm.cmd run dev:server
npm.cmd run dev:client
```

The migration runner now discovers ordered SQL migrations while retaining its
existing transaction, advisory migration lock and schema_migrations ledger.
Migration `002_member2.sql` adds gender, bookings, complaints, indexes and trigger;
001 is unchanged. Back up an existing database before applying schema changes.

Tests use an isolated embedded PostgreSQL engine, applying both real SQL migrations.
The test session fixtures exist only in test code. A mocked Google provider test
also completes Member 1's real callback/session flow and immediately creates a
Member 2 booking without another login.

PGlite has one connection, so its transaction adapter serializes full transactions.
The simultaneous-request test confirms conflicting HTTP results and the unique
constraint, but does not establish independent-connection MVCC behavior. To run
the additional live PostgreSQL seat race and five-trip race, set
`TEST_DATABASE_URL` to a disposable local test database and rerun backend tests.
That test creates and drops only its own random schema. It is skipped if the URL
is absent. Do not point it at production.

This checkout arrived without `.env`, PostgreSQL runtime or a running Docker engine.
The normal migration command and backend startup cannot run without DATABASE_URL.
Real Google login also requires private OAuth configuration and an authorized
BRACU account. An authenticated browser walkthrough must be performed after those
prerequisites and approved trip/profile data are supplied. No login bypass was added.

## Results from this implementation session

- `npm ci`: passed using Node's system certificate store and a workspace-local cache.
- Backend: 73 tests total, 72 passed, 0 failed, 1 skipped (the independent-connection
  PostgreSQL test requires TEST_DATABASE_URL). Existing Member 1 tests passed.
- Frontend: 21 tests passed across 4 files, 0 failed, including the existing tests.
- Production build passed: 31 modules, JavaScript 198.84 kB (gzip 65.21 kB).
- Both SQL migrations executed successfully in the embedded PostgreSQL tests,
  including the limit trigger and seat uniqueness constraints.
- `npm run migrate` and backend startup were attempted and failed because
  DATABASE_URL is absent. No migration was applied to a live database.
- Frontend started on http://127.0.0.1:5173; `/book` and the transformed Member 2
  module returned HTTP 200. This verifies serving, not an authenticated browser flow.
- Real Google login, live database races and the full browser walkthrough remain
  unverified. Test providers and signed-session fixtures are confined to tests.
- `git diff --check` passed. No commit, push, branch switch or Git reset was run.

Embedded migration success is not a live deployment claim.
