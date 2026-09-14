# Durable worker processing

Status: local implementation candidate, 2026-09-13. Production rollout and live proof are separate. Maps to FR-PROC-07, NFR-REL-02/03/06/08, INV-4 and the worker durability acceptance checks.

## Ownership and transactions

The existing worker process consumes a Postgres job journal using the existing shared database pool. Redis remains the compatible ingress for API and existing producers. The worker persists an ingress job before acknowledging its Redis claim; a crash before or after that acknowledgement leaves the durable job or a safely repeatable adoption. API ingestion itself remains an S3-plus-Redis handoff.

Normalization commits its `processed_events` marker, grouping job and eligible optional-improvement job in one database transaction. Grouping commits incident creation/counting, event references, retention metadata, analytics correlation and all required follow-up jobs in one transaction. A transaction-scoped advisory lock serializes one project/service/environment/fingerprint. Domain transactions on that connection use savepoints, preventing an inner retention or analytics operation from committing the outer handoff. Redis frequency counters remain event-ID-deduplicated and reconstructible; scoped snapshot writes share the transaction connection.

Analytics rollups acquire their correlation locks in a separate statement before writing route/session evidence. A lock buried inside a matching-row CTE can be optimized away when no match is visible, or retain a snapshot from before a competing commit; the explicit lock makes the subsequent reads observe the completed incident transaction.

A job is claimed before the transaction acquires its connection, so a one-connection pool can process a transactional stage. SQL statements have a local 30-second limit and idle transactions a 60-second limit. An event read failure rolls the stage back. Raw-event object deletion happens through an explicit post-commit job, restricted to the owning project's raw-event prefix.

Artifact generation and external delivery execute outside the incident transaction. Follow-ups are durably inserted before their job is completed. Deterministic generation, source-event accounting and delivery receipts remain the domain's idempotency boundaries; this is at-least-once execution, not exactly-once external effects. Lifecycle publication that accompanies a build depends on that build completing successfully. A quota-skipped build suppresses its dependent publication; an exhausted build leaves dependent work failed and visible.

Reproduction input reported as `bundle_missing` or `bundle_invalid` is not successful completion. The durable adapter retains that intent and applies the same eight-attempt backoff and failed-job inspection/recovery as a thrown storage error. The processor's existing result shape remains compatible; a temporary read failure cannot silently discard the reproduction job.

Incident and improvement context loaders omit explicitly missing retained objects, but propagate other storage errors to the existing build retry path. The shared object-absence classifier also serves read-only artifact readers. Temporary storage failure must not publish an empty or thinner bundle in place of retained evidence; malformed source events remain excluded by schema validation.

## Identity, retry and retention

- Stable SHA-256 job identities include the job name, canonical JSON payload, optional parent identity and explicit dedupe scope. Retries reuse the same row. Child work is scoped to its source job when necessary. A later explicit regeneration is a new request even with the same source event; it also schedules a fresh reproduction attempt. A stale legacy Redis regeneration claim can repeat a build, so existing generation/accounting idempotency remains mandatory.
- Claims use `FOR UPDATE SKIP LOCKED`, a random ownership token and a five-minute lease. Active jobs renew every minute; token checks fence a replaced owner. Each worker lane owns at most one active claim.
- Automatic attempts stop at eight. Failures wait exponentially (2, 4, 8, 16, 32, 64, 128 seconds between the eight attempts); unavailable storage leaves an owned job recoverable after lease expiry. Fixed error codes are persisted, without exception messages or payloads in inspection output. Quota, missing incident and invalid-event outcomes are terminal skips where the processor reports that outcome.
- Pending/failed payloads expire seven days after enqueue; retry does not extend that evidence window. Successful/skipped jobs clear their payload immediately and retain a seven-day dedupe receipt. Expired failed payloads are cleared and leave a further seven-day metadata receipt. Active leases are not expired by cleanup. Dependency receipts are retained until their children are removed. Project deletion cascades to scoped jobs.
- Payloads are capped at 2 MiB and contain existing redacted worker evidence. Optional event improvement jobs contain a scoped S3 reference, source event ID and classification; evaluation re-reads and validates the retained event, including its identity. The queue never keeps a second copy of that raw event or extends its object retention. This adds a bounded source read for eligible optional work; no unredacted raw log surface is introduced. Maintenance performs three bounded batches of at most 500 rows per pass. It checks once per minute when caught up and resumes at most once per second after a full batch, so cleanup can drain a burst without an unbounded loop. Backlog logging stays limited to once per minute. Active backlog counts and oldest pending age are logged every minute.

## Scheduling and resources

The main lane gives normalization, analytics, grouping, artifact generation, reproduction and optional improvement evaluation a turn on each pass. A busy pass yields to the event loop and continues without the idle delay. A second serial lane handles alerts, webhooks, GitHub dispatch, email/report scheduling and retention; a stalled provider therefore does not block the incident loop. Availability checks retain their existing bounded lane. All lanes share existing clients/pools; no new service or replica is required.

This adds database writes, retained job storage and bounded polling. It does not establish a throughput entitlement or require a larger VM by itself. Keep hosted MCP limits and one active incident worker initially. Measure full-path latency, backlog drain, pool waits, CPU, memory, Redis persistence and database/storage latency before changing limits or worker replica count. Four concurrent queue/group claimers and a 1,000-job drain test prove ownership/counting properties, not thousands of HTTP requests per second or concurrent artifact publication safety.

## Internal operator recovery

Use the deployment's existing database environment inside its worker container. The repository Make target targets the local/self-host Compose worker:

```sh
WORKER_JOB_PROJECT_ID=<project-uuid> make worker-jobs
WORKER_JOB_PROJECT_ID=<project-uuid> WORKER_JOB_ID=<64-character-job-id> make worker-jobs
```

The default is read-only inspection of at most 25 metadata rows, newest first. It exposes status, attempts, dependency, fixed error code, timestamps and `can_retry`, never payloads or lease tokens. Use the explicit selector `WORKER_JOB_PROJECT_ID=global` for internal scheduling/delivery jobs without a project FK; an ordinary project selector cannot inspect or retry these rows. Their owning domain delivery records remain authoritative. For hosted operation, run `node --import tsx scripts/worker-jobs.ts` in the active compatible worker with the same explicitly scoped environment variables; do not copy credentials to the host command line.

After fixing the cause and reviewing this exact job, retry retained failed work:

```sh
WORKER_JOB_PROJECT_ID=<project-uuid> WORKER_JOB_ID=<64-character-job-id> WORKER_JOB_RETRY=1 make worker-jobs
```

The atomic retry requires the exact project (or explicit global selector) and job, failed status, unexpired retained payload and a completed dependency. It resets the eight-attempt budget, records `operator_retries`, keeps the original expiry and reports whether anything changed. Pending/running/completed/skipped/expired jobs cannot be reset. Repair the parent first, wait for completion, then explicitly retry a failed child. Never clear dedupe markers, change quota skips into successful builds, or bulk-reset failures to hide them. Capture bounded metadata before and after recovery, and verify the resulting artifact/delivery through its normal project interface.

## Migration, activation and rollback

`202609130001_add_durable_worker_jobs` is an additive forward migration with ledger/checksum validation. Empty-schema bootstrap includes the table; existing installations must use `db:migrate`. API/worker readiness verifies required migrations before runtime is allowed to consume the schema. Do not delete the migration ledger or use bootstrap as an upgrade mechanism.

The worker advertises `worker_job_protocol: postgres-v1` and `processing_enabled` on its internal readiness response. `WORKER_START_PAUSED=1` checks dependencies but waits for `/tmp/debugbundle-worker-activated` before starting any processing lane. Default `0` preserves normal/self-host startup. Hosted image builds verify the source protocol constant and label the image; rollout scripts reject an incompatible worker, validate the candidate's paused state, commit promotion and release metadata, then activate and verify processing. Pre-promotion cleanup can safely discard a paused candidate.

Once any Postgres-owned jobs exist, a Redis-only worker rollback would strand work. Retain a `postgres-v1` worker when rolling an API image back, or ship a reviewed compatible worker fix. An additive table may remain when an older API runs; removing it or replaying its payloads into Redis is not a rollback procedure. If activation fails after promotion, keep the promoted compatible release, diagnose it and retry activation; do not restore a worker that cannot consume the journal. The private hosted runbook owns concrete release paths and image selection.

## Verification and launch evidence

Local integration tests exercise transaction rollback at normalization/grouping follow-ups, stale-owner fencing, Redis acknowledgement failure and replay, restart recovery through bundle/reproduction, manual regeneration, a one-connection pool, concurrent same-fingerprint counts and chronological bounds, optional-improvement failure isolation, dependency completion/skip/retention, scoped operator retries, payload expiry and a 1,000-job four-consumer drain. Migration tests reconstruct the predecessor schema with retained events, reject readiness before migration, verify the forward ledger/checksum and repeat safely. Unit tests cover fair scheduling, independent delivery, staged activation, quota/build failure states and existing consumers after module splits.

Before public promotion, retain passing local validation and deployment script checks, deploy reviewed immutable versions with migration first, verify the active worker protocol and processing state, run a bounded end-to-end capture and inspect backlog/failure metrics. Define and measure a concrete traffic target and soak duration before claiming capacity. Historical incident/artifact repair follows `spec/incident-reliability.md` and is a separate reviewed production action.

## Evidence-quality promotion gate

Include the browser/error, improvement timestamp, v1 capture-rule compatibility and workload deployment checks in `spec/incident-reliability.md` before promoting this candidate. Publish and install the independently versioned JS SDK where browser capture is needed; the hosted core release alone does not update installed browser assets. Verify one new native application error through the project's real relay and one new improvement through generation after deployment. Reconcile historical artifacts only with the separately bounded, project-owned repair inventory, preserving original evidence and side-effect controls. Customer-specific findings are retained in the ignored local promotion review.
