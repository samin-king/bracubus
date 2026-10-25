# Student Gender Profile

Added to the existing student portal without replacing authentication, sessions, users, booking APIs or booking-window logic. Open Profile in student navigation, or use the link from the unverified-gender notice on Book a Seat.

## Database and migration

`database/migrations/005_student_profile.sql` adds `users.gender_verified boolean NOT NULL DEFAULT false`. It reuses the existing nullable `users.gender` column and its male/female constraint. A constraint prevents a verified profile with NULL gender.

Existing non-null male/female values were already trusted by booking and are explicitly preserved as verified by the migration. Missing values remain NULL/unverified; no email or name is used to infer gender. Newly created accounts remain NULL/false until a valid profile is saved. The migration and existing development seed command were executed successfully against the local database.

## API and ownership

- GET `/api/student/profile`: returns the authenticated student's id, name, email, gender and gender_verified.
- PATCH `/api/student/profile`: accepts only `{"gender":"male"}` or `{"gender":"female"}`.

Both endpoints reuse Member 1 session authentication and the existing student-only router. Writes require the configured frontend Origin. The authenticated user ID determines the row; submitted IDs, roles and verification flags are rejected rather than used. Name/email stay read-only in this feature. Driver and authority/admin accounts cannot use these student endpoints.

Saving sets gender_verified=true after server-side validation of the authenticated student's declaration. In this feature, **verified means a saved, server-validated profile choice, not independent university/identity certification**. No administrative approval flow was introduced. Profile updates persist in the same users table; authentication/session formats remain unchanged.

## Booking behavior

Booking reads gender and gender_verified directly from the authenticated user's database row, under the existing user-row lock. Unverified gender is treated as unknown for eligibility. Neither gender nor gender_verified in a booking request can override the stored profile.

- Verified male: normal seats allowed, female-reserved seats denied, standing allowed only when capacity exists.
- Verified female: available female-reserved and normal seats allowed, standing denied.
- Unverified: available normal seats allowed, female-reserved seats and standing denied.

The existing 1..min(18, capacity) female reservation, male-only standing, standing capacity counts, server-time booking windows, daily four-confirmed-trip limit, cancellation behavior and concurrency locks are preserved. Profile updates and booking serialize on the same users row. Existing bookings are not retroactively changed when a profile is edited.

The seats response includes profileGender/genderVerified alongside compatible genderKnown and eligibility fields. The booking page links to Profile for unverified students and shows the saved male/female status when verified. It continues to use the backend's selectable and standing fields, not frontend gender state.

## UI and development data

`/profile` is student-only, with read-only Name/BRACU Email, exactly two Male/Female radio cards, Save Profile, verification feedback, loading/error/retry states and responsive maroon styling. Navigating back to booking fetches current database eligibility. Refreshing Profile reloads saved data from the authenticated endpoint.

The guarded development seed now provides:

- male.student@g.bracu.ac.bd: male / verified.
- female.student@g.bracu.ac.bd: female / verified.
- unverified.student@g.bracu.ac.bd: NULL / unverified.

Existing accounts are not overwritten by the seed. These accounts use the existing development direct login. Production retains its existing secure login flow; the profile endpoint still requires the normal authenticated student session.

## Verification

- Backend: 195 passed, zero failed; four optional external-service checks skipped in the default run.
- Additional real PostgreSQL run: 84 passed, none skipped. Includes profile persistence with the existing session, booking/standing races and daily limits.
- Frontend: 60 passed.
- Built driver/Member 4 frontend tests: 15 passed.
- Production build: passed.
- Chrome: all 10 checks passed, covering Male/Female Save Profile, refresh persistence, eligible/blocked booking choices, request-gender spoof rejection, unverified warning and normal-seat access, mobile layout, first-time profile completion, another-user-ID rejection, driver route/API denial and logout/session continuity.
- Migration tests verify preservation of existing trusted gender, NULL defaults, valid-value constraints and repeatable migration execution through the standard runner.

Limitations: this is a validated self-declaration, not external identity verification. Name/email remain managed by the existing account system. Availability, standing capacity and booking-window requirements still apply; changing profile does not override them. Live Redis was not tested because this feature uses the existing synchronous APIs.

## Exact files changed for this request

- database/migrations/005_student_profile.sql (new)
- database/seeds/booking-profiles.sql
- services/src/services/member2Service.js
- services/src/routes/member2Routes.js
- Client/src/services/member2Api.js
- Client/src/pages/StudentProfile.jsx (new)
- Client/src/App.jsx
- Client/src/pages/Member2.jsx
- Client/src/pages/member2.css
- services/test/member2.test.js
- services/test/integration.test.js
- services/test/driverLogin.test.js
- server/test/member4.test.js
- Client/src/test/studentProfile.test.jsx (new)
- Client/src/test/roleLogin.test.jsx
- README.md
- docs/local-direct-login.md
- docs/booking-priority-standing.md
- docs/student-gender-profile.md (new)

Ignored evidence: `.local/profile-all-backend.log`, `.local/profile-real-postgres.log`, `.local/profile-frontend.log`, `.local/profile-built-ui.log`, `.local/profile-build.log`, `.local/student-profile-browser.log`, `.local/student-profile-browser-report.json`, `.local/student-profile-male-desktop.png`, `.local/student-profile-female-desktop.png`, `.local/student-profile-unverified-mobile.png`.

The normal app remains running. No commit or push was made; previous uncommitted integration work is retained.
