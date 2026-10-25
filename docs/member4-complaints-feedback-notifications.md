# Member 4: complaints, feedback and notifications

## Scope and integration

Implemented on the existing `m3-driver-tracking` branch in `D:\Bracubus-Git`. Member 3's controllers, services, routes, migrations, queue, driver controls and database connection remain unchanged. The only edits to existing source files mount the new router in `server/src/app.js` and add navigation entries in `Client/src/main.jsx`.

There is no Member 1 login, user table, AuthProvider or ProtectedRoute in this branch. There was no Member 2 complaint implementation to extend. New endpoints fail closed by default: no fake login, browser identity header, hardcoded account or localStorage role is accepted.

### Trusted authentication contract

`createApp(db, {authenticateUser})` accepts existing server-side authentication middleware. It must verify the actual session/token and populate:

```js
req.auth = {
  ...req.auth,                 // preserve Member 3's verified driver_id if applicable
  user_id: verifiedAccount.id, // stable account ID, string or positive safe integer
  role: verifiedAccount.role  // student, driver, authority, or admin
};
next();
```

Do not copy these values from request bodies, query strings or unverified headers. Install Member 1's real verifier at the composition root (`server/src/index.js`) when integrating; this module does not implement credentials, sessions or JWTs. An existing verifier can also run on the parent Express application before this application. The existing `authenticateDriver` and `authorizeManagement` hooks retain their previous behavior. Member 3's explicit development driver identity has no user_id or role and cannot access Member 4.

`requireUser` and the single `requireRole(...roles)` factory live in `server/src/middleware/member4Access.js`. Missing authenticated user gives 401; a verified user with insufficient role gives 403. Foreign-owner complaint/notification IDs return 404 to avoid disclosing another student's records.

| Capability | Student | Driver | Authority/admin |
|---|---|---|---|
| Submit/list/detail own complaints | Allow | Deny | Deny |
| Submit/list own feedback | Allow | Deny | Deny |
| Manage all complaints | Deny | Deny | Allow |
| List/count/read own notifications | Allow | Allow | Allow |

Frontend navigation is not authorization. Member 4 pages display inline permission errors until real authentication is connected. No role selector, duplicate auth provider or credential UI was introduced. Integrate these pages into Member 1's route guard when that branch is available.

## Database

Only new migration `Database/migrations/003_member4.sql` is added. Run `npm.cmd run migrate` against the configured DATABASE_URL. Existing migration tracking/transactions apply it once.

* `complaints`: verified user_id, category, description, optional existing trip/route FKs, status, latest authority response, updated_by, timestamps.
* `feedback`: verified user_id, service/bus/trip/route target, appropriate existing transport FK, rating 1–5, optional comment, timestamp. Exactly the selected target can be referenced.
* `notifications`: recipient user_id, type, title, message, read_at (NULL means unread), optional reference_type/reference_id, timestamp.
* Indexes cover complaint owner/status plus timestamps, feedback owner plus timestamp, and notification recipient/time and unread recipient/time.
* Existing `set_updated_at()` is reused. Existing bus/route/trip FKs use RESTRICT to preserve references.
* No users, students, bookings, buses, routes, trips or drivers tables are created.

User IDs are text references because the Member 1 account table and its key type are absent. On integration, map existing user_id and updated_by values to the actual account key, validate all existing references, convert column types if necessary, then add foreign keys in a NEW migration. Do not invent a second user table. A user FK cannot currently enforce recipient existence; internal notification callers must use verified account IDs. Notification references are intentionally polymorphic metadata, not transport/user substitutes.

## APIs

All JSON errors follow the existing `{error: message}` convention. Lists return arrays ordered newest first. All list endpoints accept `limit` (default 50, maximum 100) and `offset` (default 0). The UI pages 50 items at a time.

| Method | Path | Access |
|---|---|---|
| POST | /api/complaints | Student |
| GET | /api/complaints | Student, own only |
| GET | /api/complaints/:id | Student, own only |
| GET | /api/authority/complaints | Authority/admin |
| GET | /api/authority/complaints/:id | Authority/admin |
| PATCH | /api/authority/complaints/:id | Authority/admin |
| POST | /api/feedback | Student |
| GET | /api/feedback | Student, own only |
| GET | /api/notifications | Authenticated user, own only |
| GET | /api/notifications/unread-count | Authenticated user, own only |
| PATCH | /api/notifications/:id/read | Authenticated user, own only |
| PATCH | /api/notifications/read-all | Authenticated user, own only |

Complaint list filters: `status`, `category`, and `search` (case-insensitive literal substring of description/latest response). SQL values are parameterized.

### Examples

POST /api/complaints:

```json
{"category":"schedule","description":"The bus departed late.","trip_id":1}
```

201 response includes:

```json
{"id":1,"user_id":"verified-account-id","category":"schedule","description":"The bus departed late.","trip_id":1,"route_id":null,"status":"pending","response":null,"updated_by":null,"created_at":"2026-10-25T06:00:00.000Z","updated_at":"2026-10-25T06:00:00.000Z"}
```

Categories: service, driver, safety, schedule, other. Description required, at most 5000 characters. Ownership/status/response supplied to the student submission endpoint cannot override server-controlled fields.

PATCH /api/authority/complaints/1:

```json
{"status":"in_review","response":"We are investigating."}
```

200 returns updated complaint. At least status or nonempty response is required. Status values: pending, in_review, resolved, rejected. Updates preserve unspecified fields and record the verified actor. The response field stores the latest response, not a conversation thread. An unchanged status/response does not produce duplicate notifications. Reopening/changing between valid statuses is allowed; this module imposes no additional workflow transitions.

Complaint update, status notification and response notification commit together on the existing transaction utility. A failure rolls them all back. Responses are plain text; React escapes rendered content.

POST /api/feedback:

```json
{"target":"bus","bus_id":1,"rating":4,"comment":"Comfortable ride."}
```

201 returns the saved feedback including verified user_id and timestamp. For overall service use `{"target":"service","rating":5}`. For trip/route, use the matching `trip_id`/`route_id`. Rating must be an integer 1–5. Comment optional, up to 5000 characters. Missing/nonexistent/mismatched target references fail with 400. No booking history restriction is invented before Member 2 is integrated.

GET /api/notifications/unread-count returns `{"count":2}`. Mark one read returns the notification with read_at; repeating it preserves the original read timestamp. Mark all returns `{"updated":2}` and touches only unread notifications belonging to that user.

## Notification integration for Members 1/2/3

Reuse `notificationService(db).create(data)` from `server/src/services/notificationService.js`. Pass the existing connection/pool; do not construct a new connection layer.

```js
import {notificationService} from './services/notificationService.js';

// Only invoke after a real event, with recipient from verified account/business data.
await notificationService(db).create({
  user_id: recipientAccountId,
  type: 'booking_confirmed',
  title: 'Booking confirmed',
  message: 'Your booking is confirmed.',
  reference_type: 'booking',
  reference_id: booking.id
});
```

When an event and notification must be atomic, pass the client from the existing `transaction(db, async client => ...)` callback. Validate recipient eligibility at the business boundary. This is an internal service, not a public endpoint to send arbitrary notifications. No booking/tracking/announcement events are simulated. Only actual complaint status/response changes emit notifications now. Booking delivery, outbox/retries, email/push and event deduplication should be designed by the integrating module if needed.

## Merge guidance for Member 2

Use the single `complaints` table and `/api/complaints` contract for Member 2 submission. Do not add another complaint table/router or run two competing migration sets. If Member 2 already has a complaint table on its branch, compare schema/data before merge: select the canonical table, map category/status/ownership fields with a new migration, move existing rows with preserved ownership and references, and route student submission through the shared service. Do not drop historical data or modify Member 3 migrations. This branch cannot validate another branch's unavailable schema.

## Frontend

New pages: Complaints (form/list/details), Feedback (form/history), Complaint Management (search/status/category filtering, detail, response/status update), Notifications (list/unread count/mark one/all). Existing styling and inline role=alert/role=status messages are reused. Loading, empty, disabled-submit and error states are included; no browser alert/confirm. Existing Member 3 pages and default Trips view remain intact.

## Verification

Commands from `D:\Bracubus-Git`:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd test
npm.cmd run build
npm.cmd run test:frontend --workspace server
```

The test suite uses existing isolated PGlite databases unless TEST_DATABASE_URL is provided; it does not require a production database or a fake login. Identity fixtures exist only inside tests as trusted injected middleware. Backend tests cover authentication failures, role checks, forged owner/status input, ownership, complaint CRUD/filters/status validation, feedback target/rating validation, notification creation/count/ownership/read operations, database constraints, repeatable migration and transactional rollback. Built-UI tests use JSDOM, the actual compiled client, actual Express APIs and isolated databases for submission, management, feedback, notifications and permission errors. Existing Member 3 backend/frontend suites are also run.

## Recorded results (25 October 2026)

* Locked dependencies installed successfully on retry. The initial download failed with ECONNRESET; the first backend run against incomplete PGlite files failed. After installation completed, the full backend suite passed.
* `npm.cmd test`: 73 tests reported, 72 passed, 0 failed, 1 skipped. The existing real-Redis integration test is skipped because REDIS_TEST_URL is not configured. Existing Member 3 tests passed.
* `npm.cmd run build`: passed, Vite 6.4.4, 50 modules transformed.
* `npm.cmd run test:frontend --workspace server`: 15 passed, 0 failed, including the existing Driver Dashboard suite. The first UI run found a test timing race after filtering; the test now yields for React's pending render before opening details.
* Syntax checks and `git diff --check`: passed.
* No Member 1/2 test suites or authentication/booking implementations exist in this branch, so compatibility with their future implementations is an integration dependency, not a verified result.
* Tests used isolated PGlite databases through the existing test helper, not a production PostgreSQL server. No live login/session flow was fabricated.
* Branch remains `m3-driver-tracking`. No commit, push, checkout, reset, or migration against a deployment database was performed.

## File inventory

Created:

* `Database/migrations/003_member4.sql`
* `server/src/middleware/member4Access.js`
* `server/src/utils/member4Validation.js`
* `server/src/services/notificationService.js`
* `server/src/services/complaintService.js`
* `server/src/services/feedbackService.js`
* `server/src/controllers/member4Controller.js`
* `server/src/routes/member4Routes.js`
* `Client/src/services/member4Api.js`
* `Client/src/components/Member4State.jsx`
* `Client/src/pages/Complaints.jsx`
* `Client/src/pages/Feedback.jsx`
* `Client/src/pages/ComplaintManagement.jsx`
* `Client/src/pages/Notifications.jsx`
* `server/test/member4.test.js`
* `server/frontend-test/member4-ui.test.js`
* `docs/member4-complaints-feedback-notifications.md`

Modified:

* `server/src/app.js` — mount Member 4 router and expose the trusted authentication middleware hook.
* `Client/src/main.jsx` — add four Member 4 pages to the existing navigation.

Reused without edits: existing database pool, migration runner, transaction utility, error handler, ID validator, frontend request helper, styles, test database helper and Member 3 backend/frontend test suites.
