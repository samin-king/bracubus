# BRACU Bus Management System

The integrated API starts in `services/src/server.js`. It retains Member 1's verified email/session authentication and Member 2's student APIs, and mounts Member 3/4's transport modules from `server/src`. `server/src/index.js` delegates to the same authenticated entry point.

## Local use

1. Install dependencies with `npm install`.
2. Configure a private `.env` using `.env.example`; supply a random session secret and the existing database credentials.
3. Run `npm run migrate` against the intended application database. This is required before using the integrated transport features.
4. Run `npm run dev` and, in another terminal, `npm run dev --workspace transport-client`.

Student pages include dashboard, profile, booking, history, complaints, feedback and notifications. Students can save Male/Female in [Student Profile](docs/student-gender-profile.md); booking reads the saved gender and verification status from the database. Registered drivers automatically land at `/driver` using the same login form and session; see [driver role login](docs/driver-role-login.md). `/transport` retains bus, route, trip, driver and authority complaint screens. Management mutations require an authority/admin session. Driver controls require a verified account linked by `users.driver_id`. Account roles and driver links are assigned by trusted administration, never browser input.

For immediate local student/registered-staff login, see [local direct login](docs/local-direct-login.md). This requires explicit `DEV_DIRECT_LOGIN=true`, development mode and loopback-only access; production continues to verify email links.

Email sign-in uses existing accounts and one-time links. SMTP settings enable real delivery. The explicit loopback-only `DEV_EMAIL_LOGIN=true` mechanism remains available for the registered local test student; see `docs/local-student-login.md`. Existing optional Google endpoints remain compatible, but email sign-in does not require Google credentials.

## Vercel deployment

The frontend and integrated Express API deploy together from the repository root.
Use [the Vercel deployment guide](docs/demo-deployment.md) for the root configuration,
required DATABASE_URL/SESSION_SECRET, build-time migrations and optional email delivery.
No separate backend service or demo seed is required to start the API.

## Database

All migrations are tracked under lowercase `database/migrations` for Windows/Linux compatibility. Both migration commands use the same transactional runner and migration ledger. The order is authentication, fleet/trips, drivers, email tokens, student booking/complaints, Member 4 extensions, then integration constraints. `003_member4.sql` extends the existing complaints table; it does not create a second complaint system. Member 2's API retains its existing status vocabulary while authority updates and notifications share those records.

Booking uses scheduled database trips at its four supported departure times; other departures remain visible in transport management. Standing capacity defaults to zero and can be configured through the authority Buses form in the existing `buses.standing_capacity` column. Female reservation and standing use trusted server-side profile gender; see [booking priority and standing](docs/booking-priority-standing.md) for the local verification profiles and results. Existing booking snapshots and legacy string trip identifiers remain valid.

## Verification

- `npm test`: authentication, booking, fleet, driver, complaint, notification and queue unit/integration tests.
- `npm run build`: production frontend bundle.
- `npm run test:frontend`: React tests and built-frontend API tests (build first).
- `TEST_DATABASE_URL` enables disposable-schema PostgreSQL checks, including independent-connection booking races.
- `TEST_REDIS_URL` enables the optional live Redis queue test.

The existing BullMQ queue infrastructure is preserved. Its standalone worker still requires an injected `processBooking` implementation; the original worker does not process student bookings by itself. Student bookings use the tested synchronous authenticated API. No new public queue submission endpoint is introduced.
