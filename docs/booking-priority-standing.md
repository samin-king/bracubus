# Female-priority seating and standing tickets

Updated the existing booking service and bus UI in place. No authentication system, capacity table, booking API or migration was added. Booking windows, server-clock checks, per-date limits and transaction locking remain unchanged. No commit or push was made.

## Server rules

- The authenticated student is resolved by Member 1 middleware. Booking reads and locks that user's trusted `users.gender` profile data. Gender, capacity, reserved flags and bookingOpen values from the request cannot override it.
- One shared `femaleReservedSeatCount(capacity)` rule returns `min(18, capacity)` for valid bus capacity. Seat numbers outside the actual capacity are rejected before the reservation check. Female students may book available reserved seats; male/unverified profiles cannot.
- Male-only standing validation remains in the server booking path. Capacity comes from the existing `buses.standing_capacity` column through the database trip catalog. The service counts only confirmed standing bookings while holding the existing trip/date advisory lock.
- The seats response adds the bounded femaleReservedSeats range and actual standingRemaining count. Existing standingAvailable, standingEligible and standingCapacity fields stay compatible. A non-eligible profile may see physical remaining capacity but cannot select or book standing.
- Standing uses the same travel date, booking window and four-confirmed-trips limit. Cancellation remains excluded from that limit and releases standing capacity because only confirmed records count. Standing history uses the existing standing flag and null seat number.

## Why standing was unavailable

Existing buses defaulted to zero standing capacity, and newly created local students have no verified gender. These are legitimate server restrictions. Standing capacity is now editable in the existing authority Buses form, with nonnegative integer validation and zero supported. Legacy clients omitting the field preserve the existing value on updates. No seating capacity was changed.

The guarded local seed additionally supplies:

- female.student@g.bracu.ac.bd: trusted female development profile.
- male.student@g.bracu.ac.bd: trusted male development profile.
- male.second@g.bracu.ac.bd: second trusted male development profile for last-slot tests.
- DEV-BOOKING-01: development bus with 37 seated places and 2 standing places, plus a tomorrow 06:30 trip on the development route.

These values are explicit local fixture data in the database, not React availability constants. The seed requires the existing loopback-only direct-login development configuration and does not overwrite existing accounts/profiles or existing bus configuration. `npm run seed` completed successfully. Students can now complete [Student Profile](student-gender-profile.md) through an authenticated profile endpoint. The booking service uses the saved server-side gender and verification status; login and booking requests cannot change gender.

## Window verification

The bookingWindow/windowOpen functions were not changed. Existing opening/closing boundary tests passed for all four departure times. The real running app correctly rejected booking during its current closed window, even with bookingOpen=true supplied by the request.

Positive Chrome verification used the same app/backend and normal PostgreSQL sessions in a disposable schema, with the existing test-only injectable server clock fixed at 2030-01-02 11:00 Asia/Dhaka, inside the unchanged 14:00 trip window. Moving that isolated clock to exactly 11:15 rejected both seated and standing bookings. No clock override, endpoint or window change was added to the running application. The temporary frontend/backend and database schema were removed afterward.

## Results

- Backend suites: 192 passed, zero failed; three optional external-service checks skipped in the default run.
- Real PostgreSQL verification: 80 passed, none skipped. Includes seat races, four-trip races, standing last-slot races, cancellation release, bus capacity configuration and legacy update compatibility.
- Frontend: 50 passed, zero failed.
- Built transport/Member 4 UI: 15 passed, zero failed.
- Production build: passed.
- Chrome: female reserved-seat booking, male normal-seat booking, male standing, female standing rejection, full standing disabled, standing history/cancellation/rebooking and outside-window rejection all passed.
- The actual running application also returned correct male/female profile eligibility and actual capacities from its local development database. Both servers remain running at their normal URLs.

Remaining limitations: unknown/unverified profile gender still blocks reserved seating and standing. Buses must have an approved nonzero standing capacity configured; zero continues to mean no standing tickets. Positive Chrome actions were tested with an isolated controlled clock because the normal app's window was closed. Live Redis is unrelated to the synchronous booking path and was not tested.

## Exact files changed for this request

- services/src/services/bookingRules.js
- services/src/services/member2Service.js
- server/src/utils/validation.js
- server/src/services/resourceService.js
- server/src/utils/database.js
- Client/src/components/ManagementPage.jsx
- Client/src/pages/Buses.jsx
- Client/src/components/BusCard.jsx
- Client/src/components/SeatMap.jsx
- Client/src/pages/Member2.jsx
- database/seeds/booking-profiles.sql (new)
- services/test/member2.test.js
- server/test/api.test.js
- Client/src/test/uiRefresh.test.jsx
- README.md
- docs/booking-priority-standing.md (new)

Ignored evidence: `.local/booking-all-backend.log`, `.local/booking-real-postgres.log`, `.local/booking-all-frontend.log`, `.local/booking-built-ui.log`, `.local/booking-build.log`, `.local/booking-browser.log`, `.local/booking-browser-report.json`, `.local/booking-female-reserved.png`, `.local/booking-standing-full.png`, `.local/booking-standing-history.png`.
