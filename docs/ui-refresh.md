# BRACU Smart Transport UI refresh

Updated the existing app in place. Authentication, token verification, development direct login, sessions and Member 2/3/4 APIs remain in use. No database migration or new authentication/data system was added. No commit or push was made.

## Interface

Maroon/white navigation and workspace shell, responsive mobile navigation, shared icons, consistent typography, forms, cards, status badges, empty/loading states and keyboard focus. Student navigation exposes dashboard, live tracking, booking, history, complaints, feedback and notifications. Transport pages are selected using the authenticated role; authority and driver screens are hidden from students, including after a role change.

The dashboard reads actual bookings and notifications. Upcoming journey, recent booking and update cards show API data or empty states. Credit is explicitly unavailable because no credit API exists.

Tracking reads actual trip, route, bus and assigned-driver data every 30 seconds. It shows ACTIVE/STOPPED/COMPLETED and stale-update badges. The route illustration and active-bus animation are clearly labeled demo; GPS coordinates are not implemented by the supplied backend.

## Seats and standing

The bus layout has two left seats, a center aisle and two right seats per row. Labels A1-A4, B1-B4, etc. derive from actual numeric seat IDs and capacity; partially filled final rows remain supported. Numeric seat IDs are still sent to booking APIs. Female-reserved, booked, available and selected states remain distinct. Booking windows and selectable flags come from the backend.

Standing is separate, with availability, selected, full and disabled states. The only production backend change is additive standingEligible/standingCapacity metadata on the existing seats response. Eligibility comes from stored profile data; booking rules did not change. New local accounts with unverified gender cannot access women-reserved seats or standing.

## Complaints and feedback

Structured options include Speeding, Rash / Reckless Driving, Bad Behaviour, Harassment, Misconduct, Driver Behaviour, Bus Cleanliness, Overcrowding, Seat Issue, Standing Issue, Route Issue, Bus Delay, Bus Not Available and Other. Existing Member 2 category values remain available.

The Member 2 form maps these choices to its existing category, subject and description fields. The Member 4 form maps to its supported generic category and retains the specific choice as a bracketed description prefix. Additional details are optional; the selected issue supplies valid descriptive text. No schema change is needed. Existing booking ownership checks remain in force.

Authority cards show category, student account ID, date, linked trip/route, details, status, response and management controls. Existing status values remain unchanged.

Feedback has an accessible star rating and categories Driver/Bus/Route/Schedule/Booking/Tracking/General. Specific categories are retained safely in the existing comment field; supported transport targets remain available. Notifications show actual unread counts, titles, messages, timestamps, read state and individual/all-read actions.

## Verification

- Backend: 177 passed, zero failed, two optional external-service checks skipped.
- Additional standing metadata/eligibility test passed.
- Frontend: 44 passed, zero failed.
- Built frontend against real API modules: 15 passed, zero failed. Includes driver start/stop and Member 4 workflows.
- Production build passed.
- Live Chrome: 18 checks passed, including email-only direct login, session refresh, protected routes/logout, dashboard, desktop/mobile seat layout, complaint category submission without free text, star feedback, notifications/read action, demo tracking, authority updates and student navigation restrictions.
- Live booking windows were closed; successful seat/standing selection and booking payloads were verified in automated tests without changing the window rules.
- Temporary authority role on the local test account was restored. The local complaint and feedback verification records remain in development data.
- Backend remains at http://localhost:3000; frontend remains at http://localhost:5173.

Ignored screenshots: `.local/ui-dashboard-desktop.png`, `.local/ui-booking-desktop.png`, `.local/ui-booking-mobile.png`, `.local/ui-tracking-desktop.png`, `.local/ui-complaints-mobile.png`, `.local/ui-feedback-mobile.png`, `.local/ui-notifications-mobile.png`, `.local/ui-authority-desktop.png`.

## Files changed for this UI request

- Client/src/App.jsx
- Client/src/Transport.jsx
- Client/src/components/Ui.jsx (new)
- Client/src/components/SeatMap.jsx (new)
- Client/src/pages/LiveTracking.jsx (new)
- Client/src/pages/Member2.jsx
- Client/src/pages/member2.css
- Client/src/pages/Complaints.jsx
- Client/src/pages/ComplaintManagement.jsx
- Client/src/pages/Feedback.jsx
- Client/src/pages/Notifications.jsx
- Client/src/services/complaintOptions.js (new)
- Client/src/style.css
- Client/src/test/member2.test.jsx
- Client/src/test/studentFlow.test.jsx
- Client/src/test/uiRefresh.test.jsx (new)
- server/frontend-test/driver-ui.test.js
- server/frontend-test/member4-ui.test.js
- services/src/services/member2Service.js
- services/test/member2.test.js
- docs/ui-refresh.md (new)

Prior authentication/integration changes are retained separately in the existing uncommitted merge state.
