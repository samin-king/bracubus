# Direct BRACU email login

The Member 1 auth service, controller, users table, PostgreSQL session store,
middleware, AuthProvider, and ProtectedRoute remain the authentication system.
Google OAuth remains an optional identity provider. Direct email login does not
need Google credentials, including in production when email delivery is configured.

## Flow

1. Submit a complete student email with the Login button or Enter.
2. POST `/api/auth/email` validates the address on the server. For an existing
   student account it sends a one-time verification link. Unknown accounts receive
   the same response, with no new user created. Contact the university administrator
   if an account has not been registered. There was no standalone registration
   endpoint in this project; the existing verified Google account creation flow
   is preserved. No synthetic Google subjects or demo accounts are inserted.
3. Open the emailed `/login#email_token=...` link and confirm sign-in.
   The page removes the token from the browser URL and submits it in a POST body
   to `/api/auth/email/verify`. Merely submitting an email never authenticates.
4. The backend atomically consumes the 256-bit token, stored as a SHA-256 hash
   with a ten-minute expiry, and loads the existing student. It regenerates the
   existing session and sets the same `userId` and `authExpiresAt` fields as OAuth.
5. The existing auth provider refreshes `/api/auth/me`; protected routes and logout
   continue to use the same cookie and middleware.

Both POST endpoints require the configured frontend Origin and share the existing
sign-in rate limiter. Expired, forged, and reused links fail closed. Tokens and mail
credentials are never returned from the email request endpoint or logged.

## Address rule

Direct email input is lowercased and must match:

```regex
^[a-z]+(?:\.[a-z]+){0,7}@g\.bracu\.ac\.bd$
```

The input must be a string, have no surrounding whitespace, and have a local part
of at most 64 characters (total address at most 254). One to eight alphabetic name
components are accepted, including all requested one-, two-, and three-name
examples. The optional existing `BRACU_STUDENT_EMAIL_PATTERN` can restrict this
further. Partial names and undelimited names are not converted into guessed emails.
The legacy Google verified-claims validator retains its existing eligibility rule.

## Server configuration

Set these fields privately in the project-root `.env` and restart the backend:

| Field | Meaning |
| --- | --- |
| `SMTP_HOST` | Real mail provider SMTP hostname |
| `SMTP_PORT` | Provider port, normally 587 or 465 |
| `SMTP_SECURE` | `true` for implicit TLS, typically port 465; otherwise STARTTLS is required |
| `SMTP_USER` | Provider username, if authentication is required |
| `SMTP_PASSWORD` | Provider password/app password; configure together with SMTP_USER |
| `EMAIL_FROM` | Provider-authorized sender address |

SMTP_HOST and EMAIL_FROM must both be set. An internal authenticated-by-network
relay can omit SMTP_USER and SMTP_PASSWORD; otherwise both are required together.
Delivery uses Nodemailer's SMTP transport with TLS certificate verification and
without SMTP debug logging. Reference: https://nodemailer.com/smtp

Empty SMTP settings yield `503 email_not_configured`; no verification link is
printed or replaced with a development bypass. Delivery failures yield a generic
503 and remove the newly issued token. Unknown accounts are never registered by
email submission. No mail credentials or shared secrets belong in Vite variables.

Run `npm.cmd run migrate` to apply `002_email_login.sql`; the runner keeps its
existing advisory lock and transaction and now processes both auth migrations.
