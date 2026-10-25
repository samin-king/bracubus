# Member 3 Part 3: Redis queue and background worker

## Scope and architecture

BullMQ and ioredis provide durable queue infrastructure. Redis owns queue state; PostgreSQL remains the source of truth for permanent business data. No PostgreSQL tables, migrations, frontend pages, or existing application services were changed. The old services/ directory contains empty queue route/controller placeholders; the active application is server/src.

Client/API -> Queue service -> Redis -> Worker -> Application service -> PostgreSQL

The API and worker are separate processes. The API remains independent of Redis until Member 2 explicitly initializes a producer. No public queue endpoints are mounted: the current application has no student authentication or booking module. This avoids exposing job execution or another student's job status. Member 2 must enforce authenticated identity, ownership, authorization and request limits in its API before using the internal queue service.

## Configuration and connections

- REDIS_URL: defaults to redis://localhost:6379; supports rediss:// and credentials supplied by the deployment environment. Never log the URL.
- QUEUE_MAX_ATTEMPTS: default 3; integer 1-20, total execution attempts (including the initial attempt).
- QUEUE_BACKOFF_MS: default 1000; integer 1-60000, base exponential retry delay.
- TEST_REDIS_URL: explicit dedicated Redis instance for integration tests; never point tests at production.

Create one queue service per producer process and reuse it. Call connect() during producer initialization; catch its HTTP 503 error if queue availability is optional. Producer operations fail promptly when Redis is unavailable, never claim successful enqueue, and sanitize Redis errors. A network interruption after Redis accepts a job can leave acceptance uncertain: retry with the SAME jobId.

Producer connections use bounded request retries, command timeouts and disabled offline queuing. Worker connections use unlimited connection retries so workers recover after Redis returns. BullMQ creates a necessary dedicated blocking connection in addition to the worker's regular connection. Close the producer service during application shutdown. The worker entry point handles SIGINT/SIGTERM and allows ten seconds for shutdown before exiting unsuccessfully.

## Queue contract and validation

Queue name: bracu-background. Supported type: BOOKING_REQUEST only.

Example input (a future booking request contract, not seat allocation):

    { "jobId": "BOOKING-2026-0001", "type": "BOOKING_REQUEST",
      "payload": { "studentId": 25, "tripId": 10, "seatId": 18 } }

studentId and tripId must be positive safe integers. seatId is optional and must be a positive safe integer if supplied. Extra payload and top-level fields are rejected. Callers cannot supply processing functions, retry options, timestamps or executable code. No capacity, seat, booking or payment operation is implemented.

The service generates a UUID-based JOB-... identifier if none is supplied and validates every identifier: 8-128 characters, initial letter, then letters, digits, underscores or hyphens. Stored jobs contain jobId, type, payload, server-created createdAt and an internal submission token.

Member 2 should assign and persist a stable server-controlled request ID BEFORE enqueueing, especially for network retries. Generating a new ID for each attempt represents a new job and cannot detect the same logical booking. A queue ID alone is not proof of ownership.

## Lifecycle, retries and failures

QUEUED -> PROCESSING -> COMPLETED

PROCESSING -> RETRY (delayed) -> PROCESSING -> COMPLETED or FAILED

The processor validates the job again and calls the booking adapter. BullMQ performs locked consumption, acknowledgement, delayed retries and stalled-job recovery. Concurrency is one per worker; multiple worker processes may run. A stalled job is recovered with a maximum stalled count of one. Redis disconnection does not turn application failures into fake successes.

Member 2 must throw RetryableJobError for an explicitly transient failure. With three attempts and a 1000ms base delay, retries wait approximately 1000ms then 2000ms. PermanentJobError, invalid contracts, missing integration and unclassified errors become BullMQ UnrecoverableError and fail without repeated business execution. Unclassified errors fail closed; Member 2 must classify transient failures deliberately.

Exhausted and permanently invalid jobs remain in BullMQ's failed set (the dead-letter state). Workers continue to subsequent jobs. Raw application exception messages and business return values are not stored. The failed record has job ID, type, attempt count, sanitized reason, creation time and failed time. Payloads remain inside Redis for processing, so restrict Redis access and configure deployment encryption/access controls as appropriate.

Development inspection, limited to the latest 20 failed jobs by default:

    npm.cmd run queue:failed --workspace server

The internal service also exposes failed(limit), bounded to 1-100; no public failed-job endpoint exists. Inspection outputs metadata without job payloads or stack traces.

## Idempotency and recovery boundary

BullMQ atomically inserts by validated jobId. Repeated submissions with the same ID and payload return duplicate:true and existing status; reusing an ID with different content returns HTTP 409. All completed and failed jobs are retained, so duplicate IDs remain recognized after completion, failure and normal process restarts. Concurrent submissions are distinguished using an internal submission token and the stored Redis job. Redis persistence must remain intact.

This is an at-least-once queue. Redis job deduplication cannot guarantee exactly-once PostgreSQL business effects if a worker crashes after the database commits but before BullMQ acknowledges completion. Member 2 MUST transactionally claim the supplied jobId and commit the claim with its business changes, returning the existing outcome on replay. Do not perform external payment side effects without the payment provider's idempotency mechanism. This module intentionally does not create a second booking system or an auditing table.

Do not delete retained jobs or flush Redis without considering the loss of deduplication history. Retention is currently unbounded; production needs a retention policy coordinated with Member 2's durable idempotency records and storage monitoring. Docker AOF defaults can lose recent writes after a host crash; business-level durable idempotency remains necessary. There is no atomic PostgreSQL-to-Redis transaction; Member 2 must handle any required durable publication/reconciliation in its own integration.

## Member 2 integration

No booking service exists. bookingAdapter.js provides the isolated integration contract:

    bookingService.processBooking(payload, { jobId })

The service must throw for failure; resolving means success. It owns validation of business rules, booking writes, transaction-level idempotency, capacity, payment and related state. RetryableJobError and PermanentJobError are exported from queue/jobErrors.js. Business results stay in PostgreSQL; the worker discards return values.

Producer example from a trusted application service (not a public queue route):

    const queue = createQueueService();
    await queue.connect();
    const result = await queue.submit({
      jobId: stableServerRequestId,
      type: 'BOOKING_REQUEST',
      payload: { studentId: authenticatedStudentId, tripId }
    });
    const status = await queue.status(result.jobId);
    // On process shutdown: await queue.close();

Import createQueueService from server/src/queue/queueService.js. Reuse the instance instead of constructing one for each request. Before returning status to a student, verify ownership in Member 2's authenticated application layer; snapshots deliberately do not disclose student or seat data.

Worker integration: import Member 2's real service into server/src/workers/index.js and call createQueueWorker({ bookingService }). The exported worker factory supports injection for testing. Until then, BOOKING_REQUEST fails permanently with 'Booking integration is not configured'. There is no fake booking confirmation or successful no-op booking.

## Run locally

From D:/Bracubus, copy the Redis variables from .env.example into your existing .env as needed. Keep your PostgreSQL configuration.

1. Start Redis with Docker if installed: docker compose up -d redis
2. Start backend: npm.cmd run dev
3. Start worker in a separate terminal: npm.cmd run worker --workspace server
4. Start frontend: npm.cmd run dev --workspace transport-client
5. Run backend tests: npm.cmd test
6. Build frontend: npm.cmd run build
7. Run existing frontend workflow tests after build: npm.cmd run test:frontend --workspace server

On non-Windows shells, npm can be used instead of npm.cmd. Docker is optional: any compatible Redis server reachable by REDIS_URL works. Compose adds an independent Redis 7 service with AOF, noeviction, a data volume and a localhost-only port; PostgreSQL is unchanged.

Real Redis integration test in PowerShell, after starting Redis:

    $env:TEST_REDIS_URL='redis://localhost:6379'
    npm.cmd test
    Remove-Item Env:TEST_REDIS_URL

The integration test creates a unique queue and removes ONLY that queue after completion. It checks concurrent duplicate submissions, consumption, completion, transient success on attempt three, exhaustion at three, permanent failure without retry, and processing after failures. Crash/restart and Redis outage recovery under load still need deployment integration testing.

## Verification and known limitations

The backend suite uses in-memory Redis/queue doubles for configuration, connectivity, unavailable errors, generated IDs, contract validation, status, duplicates, conflicting requests, sanitized failed metadata, processor error classification, worker configuration and the mocked booking integration. The actual BullMQ execution/retry integration test is conditional on TEST_REDIS_URL.

Final backend run: 57 passed, 0 failed, 1 skipped, including the Redis startup connection race regression test. Existing Part 1 and Part 2 tests passed using PGlite's PostgreSQL-compatible engine; external PostgreSQL was not required. Existing frontend workflow tests: 8 passed, 0 failed, 0 skipped. Frontend production build: successful, 44 modules transformed.

Real Redis was unavailable on localhost:6379. Redis and Docker executables were not found; Docker integration was not run. The failed-job CLI was exercised without Redis and exited with a clear sanitized error and nonzero status. Actual Redis consumption, retry scheduling and recovery remain integration verification pending; mocked tests do not establish those runtime behaviors.

Not implemented: live tracking, GPS, simulator, booking business logic, payment, QR, Authority Dashboard, student authentication/UI, seat allocation or cancellation logic. No existing Part 1/2 business logic was modified.

## Library references

- https://docs.bullmq.io/guide/connections
- https://docs.bullmq.io/patterns/idempotent-jobs
- https://docs.bullmq.io/guide/going-to-production
