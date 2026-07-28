# Acceptance Criteria — DebugBundle

Version: v1
Last updated: 2026-07-04

---

## 1. SDK Acceptance

### AC-SDK-01: Node SDK Basic Capture
- **Given** a Node.js Express app with `@debugbundle/sdk-node` installed and initialized
- **When** an unhandled exception occurs during a request
- **Then** the SDK captures the exception with request metadata, stack trace, and service identity
- **And** batches and ships the event to the ingestion API without blocking the request

### AC-SDK-02: Node SDK Safe Failure
- **Given** a running Node.js application with the SDK
- **When** the DebugBundle SDK encounters an internal error
- **Then** the host application continues running without disruption
- **And** the SDK logs an internal diagnostic

### AC-SDK-03: Browser SDK Capture
- **Given** a browser app with `@debugbundle/sdk-browser` initialized
- **When** a frontend exception occurs
- **Then** the SDK captures the exception with breadcrumbs from the ring buffer (recent clicks, route changes, network summaries, console entries — up to `maxBreadcrumbs`)
- **And** breadcrumbs are attached to the exception event, not shipped independently (default `breadcrumbsOnErrorOnly: true`)
- **And** the combined payload is batched and shipped before the page unloads

### AC-SDK-04: Duplicate Suppression
- **Given** the same error occurring 100 times in 5 seconds
- **Then** the SDK sends the first 3 events normally
- **And** suppresses duplicates in a 30-second window
- **And** emits an aggregate summary event with the suppressed count

### AC-SDK-05: Redaction Defaults
- **Given** a request with an `authorization` header and a `password` body field
- **When** the SDK captures the event
- **Then** the authorization header is redacted before transmission
- **And** the password field is redacted before transmission

### AC-SDK-06: Node.js Vanilla Hooks
- **Given** a vanilla Node.js application (no framework) with `@debugbundle/sdk-node` initialized
- **When** `captureExceptions()` and `captureRejections()` are called
- **Then** uncaught exceptions via `process.on('uncaughtException')` are captured
- **And** unhandled promise rejections via `process.on('unhandledRejection')` are captured
- **And** `captureConsole()` wraps `console.error` and `console.warn` when opt-in enabled

### AC-SDK-07: PHP Vanilla Hooks
- **Given** a vanilla PHP application (no framework) with `DebugBundle::init()` called
- **When** `captureErrors()`, `captureExceptions()`, `captureShutdown()` are called
- **Then** PHP errors via `set_error_handler()` are captured
- **And** uncaught exceptions via `set_exception_handler()` are captured
- **And** fatal errors via `register_shutdown_function()` are captured
- **And** all events flush at request termination

### AC-SDK-08: Python Vanilla Hooks
- **Given** a vanilla Python application (no framework) with `debugbundle.init()` called
- **When** `capture_exceptions()` and `capture_logging()` are called
- **Then** uncaught exceptions via `sys.excepthook` are captured
- **And** log records via the `logging` module handler are captured at the configured level
- **And** asyncio loop exceptions are captured when asyncio is detected

### AC-SDK-09: Log Capture In-Process
- **Given** any SDK with log capture enabled
- **When** the application emits a log at or above the configured `logLevel`
- **Then** the log is captured as a structured `log_event` (level, message, context, timestamp)
- **And** the log record is captured in-process via logging library handler (not by reading log files)
- **And** redaction is applied before the log enters the batch buffer
- **And** logs below the configured level are silently discarded

### AC-SDK-10: Logger Auto-Detection
- **Given** a Node.js application with pino or winston installed
- **When** `debugbundle.init()` is called
- **Then** the SDK auto-detects the installed logger and registers a DebugBundle transport
- **And** the same auto-detection applies to Python (structlog/loguru) and PHP (Monolog)

### AC-SDK-11: Universal Interface Consistency
- **Given** any language SDK (Node, PHP, Python, Browser)
- **Then** the SDK exposes: `init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`
- **And** method names follow language-idiomatic conventions (camelCase/snake_case/PascalCase)
- **And** all methods have identical semantic behavior across languages

### AC-SDK-12: Cross-Context Trace Correlation
- **Given** a browser SDK and Node.js backend SDK both initialized
- **When** the browser makes a same-origin `fetch` request to the backend, or a cross-origin first-party `fetch` request whose URL matches `tracePropagationTargets`
- **Then** the browser SDK injects `X-DebugBundle-Trace-Id` (UUID v4) into the request
- **And** existing application headers are preserved when `RequestInit.headers` is a `Headers` instance, header tuple array, or header record
- **And** existing application headers are preserved when the caller passes a `Request` object with headers
- **And** the backend SDK reads the header and tags all events from that request with the trace ID
- **And** the generated bundle links frontend breadcrumbs to backend exceptions via the shared trace ID
- **And** absolute third-party URLs that do not match `tracePropagationTargets` do not receive the trace header

### AC-SDK-13: Loop Protection Recovery
- **Given** SDK in suppression mode (>10 identical errors in 2s)
- **When** no matching errors occur for 60 seconds
- **Then** suppression resets and normal capture resumes
- **And** during sustained suppression, a checkpoint aggregate is emitted every 30 seconds
- **And** on process restart, all suppression state resets (in-memory only)

### AC-SDK-13a: Local beforeSend Hook
- **Given** an SDK initialized with a `beforeSend` hook
- **When** the SDK captures an event
- **Then** the hook receives the fully built event before buffering and transport
- **And** default redaction has already run
- **And** local capture-policy evaluation, capture rules, sampling, duplicate suppression, and persistence have not yet run
- **And** returning a valid event ships that event
- **And** returning `null` drops the event locally
- **And** hook exceptions or invalid returned events keep the original event and never throw into host code
- **And** mutating the hook input cannot mutate the SDK-owned original unless that valid returned event is selected
- **And** a runtime may skip application hook execution only on an unsafe fatal/crash/shutdown path, and documents that restriction

### AC-SDK-14: Browser Device Context Capture
- **Given** a browser app with `@debugbundle/sdk-browser` initialized
- **When** a `frontend_exception` occurs
- **Then** the exception event payload includes a `device` field containing: raw user agent string, parsed browser name/version, parsed OS name/version, device type (`desktop`/`mobile`/`tablet`/`unknown`), screen resolution, viewport size, device pixel ratio, touch capability, language/locale, connection type (when available), and color scheme preference
- **And** device data is collected once on `init()` and reused for all events in the session
- **And** the generated bundle's `context.device` block is populated from this data
- **And** `context.device.browser` agrees with `frontend_exception.browser` on the same event
- **And** unavailable fields (e.g. `connection_type` on browsers without Network Information API) are set to `null`
- **And** no fine-grained hardware identifiers (GPU model, serial numbers) are collected

### AC-SDK-15: Mobile Trace Injection
- **Given** a Kotlin Android app with the DebugBundle OkHttp interceptor or a Swift iOS app with DebugBundle URLSession instrumentation
- **When** the app sends a first-party request to a configured trace propagation target
- **Then** the SDK injects `X-DebugBundle-Trace-Id` (UUID v4) into the outgoing request
- **And** the mobile event envelope includes the same trace ID in `correlation.trace_id`
- **And** backend SDK events captured during the request can be linked to the mobile event through that trace ID
- **And** the SDK does not inject the trace header into unrelated third-party URLs by default

### AC-SDK-16: Mobile Offline Queue
- **Given** a Kotlin Android or Swift iOS app initialized while the device is offline
- **When** the SDK captures a frontend exception, log, breadcrumb, request event, or probe event allowed by capture policy
- **Then** the event is redacted and persisted to a bounded app-private offline queue with its original `occurred_at` timestamp
- **And** the queue survives app restart
- **And** queued events are delivered with retry and backoff when connectivity resumes
- **And** events older than the configured queue TTL are discarded on delivery attempt

### AC-SDK-17: Mobile Device Context Capture
- **Given** a Kotlin Android or Swift iOS app with the SDK initialized
- **When** a mobile client event is captured
- **Then** the event payload includes mobile device context containing app version, build number, release channel, OS name/version, device model/manufacturer where available, screen resolution, locale, timezone, network connection type, battery level where available, charging state where available, and available storage where available
- **And** unavailable fields are set to `null`
- **And** mobile context extends the existing device schema without introducing mobile-only event types
- **And** no fine-grained hardware identifiers, advertising identifiers, contacts, clipboard, photos, precise location, screenshots, or keychain/keystore values are collected by default

### AC-SDK-18: Android Lifecycle And Crash Capture
- **Given** a Kotlin Android app with the DebugBundle SDK initialized in `Application.onCreate`
- **When** the user navigates between activities, Jetpack Navigation destinations, or Navigation Compose screens
- **Then** the SDK records sanitized screen breadcrumbs without view text or form values
- **When** a handled `Throwable` or uncaught JVM/Kotlin exception is captured
- **Then** the SDK emits a `frontend_exception` event with breadcrumbs, device context, app version, release channel, and probe buffers when enabled
- **And** fatal exception handling preserves Android's normal crash behavior and uploads bounded crash evidence on next launch

### AC-SDK-19: iOS Lifecycle And Crash Capture
- **Given** a Swift iOS app with the DebugBundle SDK initialized through SwiftUI or UIKit setup
- **When** the user navigates between SwiftUI screens or UIKit view controllers
- **Then** the SDK records sanitized screen breadcrumbs without view text or form values
- **When** a handled `Error`, `NSError`, Objective-C `NSException`, or supported fatal crash evidence is captured
- **Then** the SDK emits a `frontend_exception` event with breadcrumbs, device context, app version, release channel, and probe buffers when enabled
- **And** fatal crash handling, if enabled, persists only bounded crash evidence and uploads it on next launch without attempting network work in the crashing process

### AC-SDK-20: Mobile Privacy Defaults
- **Given** a Kotlin Android or Swift iOS app using default SDK configuration
- **When** the SDK captures lifecycle, action, network, log, error, or probe data
- **Then** request bodies, response bodies, screenshots, raw view hierarchy, text content, form values, precise coordinates, precise location, advertising identifiers, contacts, clipboard, photos, and keychain/keystore values are not captured
- **And** sensitive fields are redacted before queue persistence and network transport
- **And** project tokens are used only for write-only ingestion and never for retrieval or management APIs

### AC-SDK-21: React Native iOS And Android Parity
- **Given** a React Native app with `@debugbundle/sdk-react-native` initialized on iOS and Android through the supported native module path
- **When** the app records a React error-boundary exception, a React Navigation screen transition, a first-party `fetch`/`XMLHttpRequest` failure, a log, or a probe
- **Then** the SDK emits canonical mobile client events with `sdk_name: "@debugbundle/sdk-react-native"`, mobile device context, app version/build/release channel, and sanitized React Native runtime metadata
- **And** trace IDs are injected only into configured first-party requests and are preserved in `correlation.trace_id`
- **And** events are redacted before native queue persistence, survive app restart while offline, and flush with retry/backoff when connectivity returns
- **And** the SDK reuses the native Android and Swift SDK foundations for queueing, transport, capture policy, probes, and native crash evidence where practical
- **And** Expo Go reports degraded status rather than claiming full native parity

---

## 2. Ingestion Acceptance

### AC-ING-01: Event Acceptance
- **Given** a valid batched event payload with a valid project token
- **When** `POST /v1/events` is called
- **Then** the API accepts the events, returns `{"accepted": N, "rejected": 0}`
- **And** raw events are persisted to object storage
- **And** processing work is enqueued

### AC-ING-02: Invalid Payload Rejection
- **Given** a malformed or oversized event payload
- **When** `POST /v1/events` is called
- **Then** the API returns an explicit error response with error details
- **And** a declared oversized body returns `413` before project-token lookup, raw-event persistence, or queueing

### AC-ING-03: Invalid Token Rejection
- **Given** an invalid or revoked project token
- **When** `POST /v1/events` is called
- **Then** the API returns a 401 unauthorized response

---

## 2a. Availability Check Acceptance

### AC-AVC-01: Create And Execute Hosted Health Check
- **Given** an owner or admin configures a project health check with a valid external URL
- **When** the hosted worker executes the check on schedule
- **Then** DebugBundle stores the raw result and updates the check's latest status fields
- **And** the result is readable through API, CLI, MCP, and web project views

### AC-AVC-02: Failure Threshold Opens Incident And Recovery Resolves It
- **Given** a health check with `failure_threshold: 3` and `recovery_threshold: 2`
- **When** three consecutive executions fail
- **Then** DebugBundle opens or regresses one linked availability incident for that check using the normal incident lifecycle
- **And** bundle generation, alerts, and webhook delivery behave the same as other incident sources
- **When** two consecutive executions later succeed
- **Then** DebugBundle auto-resolves the linked availability incident

### AC-AVC-03: Tier Limits Pause But Do Not Hide Preserved Checks
- **Given** a project that previously configured health checks on a higher plan
- **When** the project downgrades below the configured count or interval allowance
- **Then** existing checks remain readable through API, CLI, MCP, and web
- **And** out-of-policy checks show paused state and stop executing
- **And** create/update attempts that violate current tier limits return explicit limit errors
- **And** per-project count caps are 1 on Free, 3 on Solo, and 8 on Team

### AC-AVC-04: Health Check Test Is Side-Effect-Free
- **Given** an owner or admin runs a one-off health-check test against a valid target
- **When** the test endpoint completes
- **Then** DebugBundle returns the execution result using the same target validation and request guardrails as saved checks
- **And** no incident is opened, no retained history row is written, and no counters are advanced

### AC-AVC-05: Thirty-Day Retention Keeps Status History Ready
- **Given** a project with health-check executions across more than 30 days
- **When** retention cleanup runs
- **Then** raw results and daily rollups older than 30 days are purged
- **And** at least one retained daily state row remains available for each in-window day that had health-check activity

### AC-AVC-06: Workspace Health Status Page
- **Given** a signed-in member with access to projects that have hosted health checks
- **When** the member opens the authenticated Health Status page
- **Then** DebugBundle shows project-grouped health-check rows with a compact 30-day daily status strip
- **And** projects with multiple health checks can expand to show each check's retained status strip, current state, and uptime percentage
- **And** projects without health checks do not appear in the status list
- **And** the existing project Health tab remains the management surface for creating, editing, testing, and deleting checks

---

## 3. Bundle Generation Acceptance

### AC-BND-01: Deterministic Bundle
- **Given** the same set of normalized events for an incident
- **When** the bundle generator runs twice
- **Then** both runs produce identical `bundle.json` output

### AC-BND-02: Complete Bundle
- **Given** a standard HTTP exception incident with backend + frontend context
- **When** the bundle is generated
- **Then** the bundle contains: signal metadata, summary (title, description, likely_cause, confidence), impact, context (error, request, response, logs, frontend, environment, deploy, dependencies), reproduction, verification, links, redaction, and metadata

### AC-BND-03: Bundle Retrieval
- **Given** a generated bundle for incident `inc_42`
- **When** `GET /v1/incidents/inc_42/bundle` is called
- **Then** the full bundle JSON is returned with all required fields

### AC-BND-04: Pending Bundle Status
- **Given** a bundle still being processed
- **When** `GET /v1/incidents/{id}/bundle` is called
- **Then** the API returns `{"status": "pending"}`

### AC-BND-05: Bundle Regeneration
- **Given** an incident with an existing bundle (v1)
- **When** significant new events arrive for the same incident
- **Then** the bundle is regenerated with a new version (v2)
- **And** `bundle.updated` webhook fires
- **And** only the latest bundle version is retained (no historical snapshots)

### AC-BND-06: Bundle Retention Cleanup
- **Given** an incident past its retention period
- **When** the retention cleanup job runs
- **Then** the incident, all associated bundles, and reproduction artifacts are deleted atomically

---

## 4. Reproduction Acceptance

### AC-REP-01: Reproduction Generation
- **Given** an incident with a complete request snapshot
- **When** the reproduction engine runs
- **Then** reproduction artifacts include curl, HTTPie, and JSON spec
- **And** confidence is > 0.5
- **And** reason explains the confidence

### AC-REP-02: Low-Confidence Reproduction
- **Given** an incident without a request snapshot (e.g., background job failure)
- **When** the reproduction engine runs
- **Then** `possible` is `false` and confidence is explicit
- **And** the bundle is still generated and available

---

## 5. Incident Grouping Acceptance

### AC-GRP-01: Same Failure Grouping
- **Given** the same TypeError with the same stack trace on the same route
- **When** it occurs 238 times
- **Then** all occurrences land in the same incident
- **And** `occurrence_count` reflects the total

### AC-GRP-02: Different Failure Separation
- **Given** a TypeError on `/checkout` and a different TypeError on `/login`
- **When** grouping runs
- **Then** they produce separate incidents

### AC-GRP-03: Normalization Stability
- **Given** a route `/users/550e8400-e29b-41d4-a716-446655440000/orders` and a route `/users/123/orders`
- **When** the normalization pipeline runs
- **Then** both routes normalize to `/users/{param}/orders`
- **And** error messages with embedded UUIDs, emails, or timestamps have those values stripped
- **And** the resulting fingerprint is identical for structurally equivalent failures

### AC-GRP-04: Spike Detection
- **Given** an incident with a 1-hour baseline of 10 occurrences per 5-minute window
- **When** 35 occurrences arrive in a 5-minute window (ratio ≥ 3.0)
- **Then** the incident is flagged as spiking with `spike_detected_at` set
- **And** the `incident.spike_detected` webhook fires

### AC-GRP-05: Regression Detection
- **Given** a resolved incident with fingerprint `fp_abc123`
- **When** a new event with matching fingerprint arrives
- **Then** the incident transitions to `regressed` status
- **And** the bundle is regenerated
- **And** `bundle.reopened` webhook fires
- **And** if the regression occurs within 24 hours of a deploy, the deploy is correlated

### AC-GRP-06: Bundle Refresh Thresholds
- **Given** a new incident
- **When** the 1st, 3rd, and 10th occurrences arrive
- **Then** the bundle is regenerated at each threshold

### AC-GRP-07: Occurrence Sampling
- **Given** an incident with repeated occurrences of the same grouped failure
- **When** the 1st, 2nd, and 3rd occurrences are processed without a new deploy or severity increase
- **Then** the 1st occurrence remains stored with full raw detail as the canonical first sample
- **And** the 3rd occurrence remains stored with full raw detail as the current latest sample
- **And** the displaced 2nd occurrence is retained as summary-only metadata (`is_sampled = false`) without a remaining raw-event object in object storage
- **And** when a later occurrence is the first one after a deploy or raises the incident's highest observed severity, that occurrence is also retained with full raw detail
- **And** the bundle is also regenerated when new deploy metadata or a new context type is added

### AC-GRP-07: Occurrence Sampling
- **Given** an incident with 500 occurrences
- **Then** full event detail is stored for: first occurrence, most recent, first after each deploy, highest severity
- **And** remaining occurrences are stored as summary-only records

### AC-GRP-08: Explainability
- **Given** an event assigned to an incident
- **Then** the grouping response includes `matched_fields` listing which fields contributed to the fingerprint match

---

## 6. Retrieval Acceptance

### AC-RET-01: Incident List Filtering
- **Given** a project with incidents across multiple environments and severities
- **When** `GET /v1/incidents?environment=production&severity=high&status=open` is called
- **Then** only matching incidents are returned
- **And** `first_seen_after` limits results to incidents first seen on or after the supplied timestamp
- **And** `attention_after` limits results to incidents first seen on or after the supplied timestamp or regressed on or after the supplied timestamp
- **And** results are paginated with cursor-based pagination
- **And** the response includes `project_name`, `service_name`, `fingerprint_version`, `spike_detected_at`, `resolved_at`, `regressed_at`, `matched_fields`, and `occurrence_count`

### AC-RET-02: Incident Resolve Mutation
- **Given** an authenticated caller with access to an `open` incident's project
- **When** `POST /v1/incidents/{id}/resolve` is called for that incident
- **Then** the incident transitions to `resolved`
- **And** `resolved_at` is persisted and returned in the response
- **And** the resolution is idempotent for repeated requests against the same incident
- **And** the `bundle.resolved` webhook is emitted for matching webhook subscriptions

### AC-RET-03: Bundle Pending Status
- **Given** an incident whose bundle is still being processed
- **When** `GET /v1/incidents/{id}/bundle` is called
- **Then** the response is `{"status": "pending"}`
- **And** the client can poll until it transitions to the full bundle or a failed status

### AC-RET-04: Response Format Consistency
- **Given** any retrieval API endpoint
- **When** a valid request is made
- **Then** the response is JSON with explicit nulls (no omitted fields), ISO 8601 timestamps, stable field names, and redaction markers where applicable

---

## 7. CLI Acceptance

### AC-CLI-01: Incident Listing
- **Given** an authenticated CLI session
- **When** `debugbundle incidents --recent` is run
- **Then** recent incidents are displayed in human-readable format

### AC-CLI-02: JSON Output
- **Given** an authenticated CLI session
- **When** `debugbundle bundle inc_42 --json` is run
- **Then** the full bundle is output as stable JSON suitable for agent consumption

### AC-CLI-03: Incident Resolution
- **Given** an authenticated CLI session
- **When** `debugbundle resolve inc_42` is run
- **Then** the CLI resolves the incident through the same lifecycle service used by the HTTP API
- **And** the returned output includes the updated status and `resolved_at` timestamp

### AC-CLI-04: Doctor Command
- **Given** a project with SDK installed and project token configured
- **When** `debugbundle doctor` is run
- **Then** a structured status report is returned with check-by-check results
- **And** `debugbundle doctor --json` returns machine-readable JSON

### AC-CLI-05: Local Verification
- **Given** a correctly configured local development environment
- **When** `debugbundle verify local` is run
- **Then** a synthetic event is sent, ingestion is confirmed, bundle generation is confirmed, and retrieval is confirmed

### AC-CLI-06: Production Verification
- **Given** a deployed application with SDK instrumentation
- **When** `debugbundle verify cloud` is run
- **Then** the system confirms that production traffic is reaching DebugBundle

### AC-CLI-06a: Active Cloud 5xx Verification
- **Given** an authenticated CLI session with access to a hosted project
- **When** `debugbundle verify cloud --trigger-5xx --project-id <id>` is run
- **Then** the CLI creates a short-lived verification project token, sends a synthetic `request_event` with `response_status >= 500` through `POST /v1/events`, and revokes the temporary token
- **And** the synthetic event is clearly marked as verification data while still flowing through the normal ingestion, normalization, grouping, bundle, and retrieval path
- **And** the command reports accepted event count, incident id, bundle status, the 5xx request classification reason, and a suggested next command
- **And** MCP `verify_cloud` supports the same behavior with `trigger5xx: true`

### AC-CLI-06b: Active Cloud Configured 4xx Verification
- **Given** an authenticated CLI session with access to a hosted project whose capture policy promotes `403` into immediate incident creation
- **When** `debugbundle verify cloud --trigger-4xx 403 --project-id <id>` is run
- **Then** the CLI creates a short-lived verification project token, sends a synthetic `request_event` with `response_status: 403` through `POST /v1/events`, and revokes the temporary token
- **And** the synthetic event is clearly marked as verification data while still flowing through the normal ingestion, normalization, grouping, bundle, and retrieval path
- **And** the command reports accepted event count, incident id, bundle status, the request classification reason, and a suggested next command
- **And** MCP `verify_cloud` supports the same behavior with `trigger4xxStatus: 403`
- **And** the command fails validation when the provided status is outside `400..499`

### AC-CLI-07: Ingest Command
- **Given** a local-only or connected project with a file containing newline-delimited JSON events
- **When** `debugbundle ingest <source-file>` is run
- **Then** events are parsed from the source file and forwarded for processing (local or cloud)
- **And** human-readable output summarizes the count of ingested events
- **And** `--json` returns a machine-readable result
- **And** exit code is 4 when no valid events are found in the source file

### AC-CLI-08: Watch Command
- **Given** a local-only or connected project with a configured events directory
- **When** `debugbundle watch` is run
- **Then** the CLI polls for new events in the events directory at a configured interval
- **And** partial lines are buffered across poll cycles until a complete newline-terminated line arrives
- **And** cloud mode forwards events to the API; local mode delegates to local processing
- **And** human-readable output displays ingestion progress
- **And** `--json` returns machine-readable results

### AC-CLI-09: Process Command
- **Given** a local-only project with raw events in `.debugbundle/local/events/`
- **When** `debugbundle process` is run
- **Then** events are processed locally: normalized, fingerprinted, grouped, and bundles generated
- **And** results are stored in `.debugbundle/bundles/local/`
- **And** `debugbundle process --preset <minimal|balanced|investigative>` reprocesses the local event set under the requested request-failure policy so immediate request failures and repeated request anomalies match that preset's classification rules

### AC-CLI-10: Clean Command
- **Given** a project with local state and artifacts in `.debugbundle/`
- **When** `debugbundle clean` is run
- **Then** local events, state, and bundle artifacts are removed
- **And** `profile.json`, `connection.json`, and agent skill files are preserved

### AC-CLI-11: Reopen Command
- **Given** a resolved incident
- **When** `debugbundle reopen <incident-id>` is run
- **Then** the incident transitions back to `open` status
- **And** human-readable and `--json` output confirm the state change

### AC-CLI-12: Setup Non-Interactive Mode
- **Given** an environment where interactive prompts are unavailable (CI, agent)
- **When** `debugbundle setup --non-interactive` is run
- **Then** static detection proceeds without prompting for user input
- **And** `.debugbundle/` scaffold is created with profile and connection config
- **And** the command exits with a clear summary of what was generated

### AC-CLI-13: Canonical NDJSON Ingestion
- **Given** a service in any language that can emit newline-delimited DebugBundle event envelopes
- **When** `debugbundle ingest <file> --format debugbundle-ndjson` or `debugbundle watch --format debugbundle-ndjson` is run
- **Then** the CLI accepts the file without language-specific parsing rules
- **And** the resulting events feed into the same local/cloud processing pipeline as SDK-generated events

### AC-CLI-14: Shared Parser Registry
- **Given** the built-in CLI log formats
- **When** `debugbundle ingest` or `debugbundle watch` validates `--format`
- **Then** format resolution occurs through a shared parser registry package
- **And** the CLI command modules do not embed parser-specific regex logic or format dispatch beyond registry selection

### AC-CLI-15: Zero-Install Backend Coverage Policy
- **Given** a newly supported backend ecosystem
- **When** the zero-install CLI path is documented for that ecosystem
- **Then** the documentation identifies either a first-party parser for a common native log format or a supported transformation into `debugbundle-ndjson`

---

## 8. Webhook Acceptance

### AC-WHK-01: Bundle Created Webhook
- **Given** a project with a webhook configured for `bundle.created`
- **When** a new failure bundle is generated
- **Then** the webhook endpoint receives a signed payload with event details, bundle reference, and summary
- **And** the payload does not embed the full bundle

### AC-WHK-02: Webhook Filtering
- **Given** a webhook filtered to `severity_min: high` and `environment: production`
- **When** a low-severity staging bundle is created
- **Then** the webhook is NOT triggered

### AC-WHK-03: Webhook Retry
- **Given** a webhook endpoint that returns 500
- **When** a webhook delivery is attempted
- **Then** the system retries 5 times with exponential backoff (1s → 5s → 30s → 2min → 10min)
- **And** marks the delivery as `failed` after the 5th retry
- **And** the delivery status is inspectable via API/CLI/MCP

### AC-WHK-04: Webhook Auto-Disable
- **Given** a webhook endpoint that consistently fails
- **When** 50 consecutive delivery failures occur (across any deliveries)
- **Then** the webhook status is set to `disabled`
- **And** the owner is notified via email

### AC-WHK-05: Lifecycle Webhook Delivery Allowance
- **Given** an organization has exhausted its `monthly_webhook_deliveries` allowance
- **When** a lifecycle event matches a project webhook
- **Then** no new webhook delivery intent is created
- **And** incidents, bundles, webhook configuration, and existing delivery history remain visible
- **When** the user sends a synthetic test webhook through the API
- **Then** the API returns `429 monthly_quota_exceeded` with `Retry-After`

### AC-WHK-06: Member Webhook Ownership
- **Given** a shared project where one member created a webhook
- **When** a different non-admin member attempts to update, test, or delete that webhook
- **Then** the request is rejected with a permissions error
- **And** owner and admin can still manage the same webhook

---

## 9. MCP Acceptance

### AC-MCP-01: Interface Parity
- **Given** an incident with a generated bundle
- **When** retrieved via API, CLI (`--json`), and MCP
- **Then** all three return equivalent data structures

### AC-MCP-02: Granular Parity Tests
Each MCP tool must produce results that match its API/CLI equivalent:
- Incident list parity (`debugbundle_list_incidents` = `GET /v1/incidents` = `debugbundle incidents --json`)
- Incident resolve parity (`resolve_incident` = `POST /v1/incidents/{id}/resolve` = `debugbundle resolve <id> --json`) and bulk resolve parity (`resolve_incidents` = `POST /v1/incidents/resolve` = `debugbundle resolve <id> <id> --json`)
- Bundle parity (`debugbundle_get_bundle` = `GET /v1/incidents/{id}/bundle` = `debugbundle bundle <id> --json`)
- Reproduction parity (`debugbundle_get_reproduction` = `GET /v1/incidents/{id}/reproduction` = `debugbundle reproduce <id> --json`)
- Doctor parity (`debugbundle_doctor` = `debugbundle doctor --json`)
- Verification parity (`debugbundle_verify_local` / `debugbundle_verify_cloud` = CLI verify equivalents)
- Capture policy parity (`get_capture_policy` / `update_capture_policy` = `debugbundle capture-policy get/set --json`)
- Probe parity (`activate_probe` / `list_active_probes` / `deactivate_probe` = `debugbundle probe activate/list/deactivate --json`)
- Project parity (`list_projects` / `create_project` / `update_project` / `delete_project` = `debugbundle project list/create/update/delete --json`)
- Billing parity (`get_billing_summary` / `increase_capacity` / `schedule_capacity_reduction` / `cancel_capacity_reduction` = `debugbundle billing get/capacity increase/capacity schedule-reduction/capacity cancel-reduction --json`)
- Project-member parity (`list_project_members` / `list_project_member_invites` / `invite_project_member` / `cancel_project_member_invite` / `update_project_member_role` / `remove_project_member` = `debugbundle project members list/invites/invite/cancel-invite/update-role/remove --project-id <id> --json`)

If CLI says something is healthy and MCP says something different, that is a product bug.

---

## 9a. OpenClaw Plugin Acceptance

### AC-OPENCLAW-01: MCP Catalog Projection
- **Given** a DebugBundle MCP tool catalog entry
- **When** the OpenClaw plugin is built
- **Then** the plugin exposes an equivalent tool named `debugbundle_<mcp_tool_name>`
- **And** the OpenClaw tool description and input schema are generated from the MCP catalog
- **And** the OpenClaw handler delegates to the MCP tool implementation without separate business logic

### AC-OPENCLAW-02: Mutation Safety
- **Given** a DebugBundle tool that changes incident lifecycle, probes, projects, tokens, billing, members, capture policy/rules, alerts, Slack destinations, webhooks, weekly reports, GitHub automation, or improvement lifecycle state
- **When** the OpenClaw plugin manifest is generated
- **Then** the tool is marked optional so operators must explicitly allow it before the model can see it
- **And** production-impacting mutation tools must add OpenClaw per-call approval gates before public publish

### AC-OPENCLAW-03: Package Validation
- **Given** the OpenClaw plugin package
- **When** the release train prepares MCP ecosystem follow-through
- **Then** the plugin builds to `dist/index.js`
- **And** `openclaw.plugin.json` declares `contracts.tools`, `configSchema`, activation, and OpenClaw compatibility metadata
- **And** package and manifest descriptions use the same truthful capability-first positioning as the shared DebugBundle skill
- **And** ClawHub package validation and dry-run publish pass before the package is published

---

## 10. Auth Acceptance

### AC-AUTH-01: Agent-Assisted Signup
- **Given** an AI agent initiating signup
- **When** the agent guides the flow and the human completes email-code verification
- **Then** an account and project are created
- **And** the agent can proceed with SDK installation and verification

### AC-AUTH-02: Token Isolation
- **Given** a project token
- **When** used to call `GET /v1/incidents`
- **Then** the request is rejected (project tokens are write-only for ingestion)

### AC-AUTH-03: Email Verification Gating
- **Given** a user identity that has not completed email verification
- **When** the user attempts to create a member token in the web app
- **Then** the request is rejected with a verification-required error
- **And** after completing email verification, member token creation succeeds

### AC-AUTH-04: Member Token Full Access
- **Given** a valid member token (email was verified before or during its creation)
- **When** the token bearer creates a project token via API
- **Then** the project token is created successfully (no additional email verification required)

### AC-AUTH-05: Project Collaboration Role Permissions
- **Given** a project collaborator with role `member`
- **When** the user attempts to invite another collaborator, cancel an invite, update a collaborator role, or remove a collaborator for that project
- **Then** the request is rejected with a permissions error
- **And** the user cannot access the project members-management surface
- **And** the user can still read project incidents and bundles and perform normal project-scoped operational actions

- **Given** a project collaborator with role `admin`
- **When** the user manages collaborators for that same project
- **Then** the request succeeds
- **And** deleting the project itself still remains forbidden

- **Given** a project collaborator with role `member`
- **When** the user attempts to update or delete an alert rule, webhook, or GitHub dispatch rule created by another collaborator
- **Then** the request is rejected with a permissions error

- **Given** a project collaborator with role `member`
- **When** the user updates or deletes one of their own alert rules, webhooks, or GitHub dispatch rules
- **Then** the request succeeds

### AC-AUTH-05a: Project Sharing State Metadata
- **Given** an owner who has shared one of their projects with collaborators
- **And** a collaborator who can access that shared project
- **When** each user lists visible projects
- **Then** the owner's response marks that project with `sharing_state: "shared_by_you"`
- **And** the collaborator's response marks the same project with `sharing_state: "shared_with_you"`
- **And** a private owned project returns `sharing_state: "private"`

### AC-AUTH-06: Session And Member-Token Parity
- **Given** the same verified user identity
- **When** the user calls a member-authorized route once through the web session and once through a member token
- **Then** both requests resolve to the same authorization outcome
- **And** both execute the same underlying domain behavior

### AC-AUTH-06a: Token Last-Used Metadata
- **Given** an active project token or member token whose `last_used_at` is `null`
- **When** the token is accepted for authentication on one of its token-scoped routes
- **Then** its persisted `last_used_at` becomes a non-null timestamp and is returned by the matching token-list API
- **And** unknown, revoked, or expired token attempts do not update `last_used_at`

### AC-AUTH-07: Browser Auth Storage Boundary
- **Given** a normal web-app login flow
- **When** the SPA authenticates the user
- **Then** the browser receives a secure session cookie
- **And** the SPA does not require a browser-stored member token for routine interactive use

### AC-AUTH-08: GitHub Device Bootstrap
- **Given** a user runs `debugbundle login --github`
- **When** the CLI shows a GitHub device URL and code, the user approves the OAuth app in a browser, and the CLI continues polling
- **Then** DebugBundle issues a normal member token
- **And** the CLI stores it in `~/.debugbundle/auth.json`
- **And** later CLI and MCP commands reuse that same stored member-token auth state

### AC-AUTH-09: GitHub CLI Fast Path
- **Given** `gh` is already authenticated on the machine
- **When** the user or agent runs `debugbundle login --github-cli`
- **Then** DebugBundle verifies the GitHub identity from that access token
- **And** DebugBundle issues a normal member token without additional browser interaction
- **And** the existing browser and email-code flows remain unchanged

### AC-AUTH-10: Interactive Login Chooser
- **Given** a user runs `debugbundle login` in an interactive terminal with no explicit auth flags
- **When** the CLI prompts for an auth method and the user chooses GitHub auto mode, GitHub device flow, or manual member-token entry
- **Then** the CLI completes the chosen bootstrap path
- **And** it persists the resulting member-token auth state to `~/.debugbundle/auth.json`
- **And** `--json` mode does not prompt and instead returns a validation error when no auth mode was supplied

### AC-AUTH-11: Account Deletion Requires Phrase And OTP
- **Given** an owner is signed into the web app
- **When** they request account deletion
- **Then** the server rejects the request unless the body contains the exact phrase `Delete my account`
- **And** after the phrase is accepted, the server sends a six-digit email OTP to the signed-in account address before any deletion occurs
- **And** the final delete request succeeds only when that OTP is valid and unexpired
- **And** the delete flow fails closed when email delivery is unavailable, the phrase is wrong, or the OTP is wrong or expired
- **And** on success the user is removed from every remaining organization membership and shared-project collaboration
- **And** the delete remains blocked if that user is still the sole owner of a different organization
- **And** the delete remains blocked if that user still owns any project in a different organization

### AC-AUTH-11a: Account Deletion Preserves Deletion-Safe Analytics And Payment Retention
- **Given** an owner account with retained usage history, billing sync history, and project/debugging data
- **When** account deletion succeeds
- **Then** the user, project, incident, bundle, reproduction, token, and retained debugging payload data are deleted as before
- **And** anonymized aggregate account metrics remain stored without a join path back to deleted users or projects
- **And** required payment/provider retention records remain stored outside the normal user export surface

---

## 11. Self-Host Acceptance

### AC-SH-01: Self-Host Boot
- **Given** the `deploy/selfhost/` directory
- **When** `docker compose up` is run
- **Then** all services start (web, API, worker, Postgres, Redis, LocalStack S3)
- **And** `/health` returns healthy status

### AC-SH-02: Self-Host Verification
- **Given** a running self-hosted instance
- **When** `debugbundle verify local` is run against it
- **Then** the full verification flow passes

### AC-SH-03: Self-Host Unlimited
- **Given** a self-hosted instance
- **When** more than 1 project, more than 1 member, or more than 1 webhook is configured
- **Then** all features work without restriction (no plan enforcement, no billing integration)

---

## 12. Billing Failure Acceptance

### AC-BILL-01: Billing Isolation
- **Given** an active project with existing bundles
- **When** the billing provider (Stripe) is unreachable
- **Then** bundle retrieval via API/CLI/MCP continues to work
- **And** existing debugging workflows are not interrupted
- **And** billing-related operations return explicit errors without affecting core debugging access

---

## 13. Alert Acceptance

### AC-ALT-01: Alert on New Incident
- **Given** an alert rule configured for "new incident" on a project
- **When** a new incident is created
- **Then** the alert fires to the configured channel (email, Slack, Discord, or webhook)
- **And** the alert payload includes incident title, severity, service, and a link to the bundle

### AC-ALT-02: Alert on Spike
- **Given** an alert rule configured for "error spike"
- **When** an incident's spike condition triggers (FR-GRP-03)
- **Then** the alert fires with spike details (current rate, baseline rate, ratio)

### AC-ALT-03: Alert on Regression After Deploy
- **Given** an alert rule configured for "regression after deploy"
- **When** an incident transitions to `regressed` and a deploy is correlated (FR-GRP-04)
- **Then** the alert fires with regression details (incident title, deploy version, time since deploy)

### AC-ALT-04: Alert CRUD
- **Given** an authenticated user
- **When** creating, listing, or deleting alert rules via API or CLI
- **Then** the operations succeed and the rules take effect immediately

### AC-ALT-05: Member Alert Ownership
- **Given** a shared project where one member created an alert rule
- **When** a different non-admin member attempts to update or delete that alert rule
- **Then** the request is rejected with a permissions error
- **And** owner and admin can still manage the same alert rule

### AC-ALT-06: Severity Threshold Lifecycle Scope
- **Given** a severity-threshold alert rule with `severity_min: high`
- **When** the rule is created without an explicit lifecycle scope
- **Then** the rule defaults to notifying for both new incidents and incident regressions
- **And** API, CLI, and MCP callers can set the scope to `new_incident`, `incident_regressed`, or `both`
- **And** the worker dedupes severity-threshold alert deliveries separately for the matching lifecycle event

---

## 14. Email Acceptance

### AC-EMAIL-01: Email Code Delivery
- **Given** a user requests a browser sign-in code
- **When** the request is accepted
- **Then** an email sign-in code is sent from `noreply@debugbundle.com`
- **And** the email has both HTML and plain-text versions
- **And** the code is valid for 10 minutes

### AC-EMAIL-02: Email Anti-Spam
- **Given** an event that would trigger repeated system email notifications
- **When** multiple equivalent notifications would fire within the same dedupe window
- **Then** repeated sends are suppressed by durable dedupe rather than sent individually
- **And** user-configured alert emails are batched into digests instead of sent as bursty individual messages
- **And** critical emails (email sign-in codes and security alerts) are never suppressed

### AC-EMAIL-03: Operational Owner Notifications
- **Given** a webhook is auto-disabled, an allowance reaches 80%, an allowance reaches 100%, or retained bundles are rotated out
- **When** the triggering product event is processed
- **Then** an operational email delivery is queued for the owning organization owner
- **And** the delivery has both HTML and plain-text versions
- **And** transient email transport failures are retried without blocking the primary product workflow

### AC-EMAIL-04: Email Provider Abstraction
- **Given** the email system configured
- **When** the transport implementation is refactored behind the same provider abstraction
- **Then** no email-sending code outside the email package needs to change

---

## 15. Profile Acceptance

### AC-PROF-01: Static Profile Detection
- **Given** a repository with `package.json`, `pyproject.toml`, `docker-compose.yml`, and CI configs
- **When** `debugbundle setup` runs
- **Then** `profile.json` is auto-populated with detected languages, frameworks, services, infrastructure, and build commands
- **And** profile carries `"validation_status": "static-analysis-only"`
- **And** no AI agent or network access is required for this step

### AC-PROF-02: Profile Validation
- **Given** a `.debugbundle/profile.json` with missing required fields
- **When** `debugbundle profile validate` is run
- **Then** specific validation errors are reported with field paths
- **And** `--json` mode outputs machine-readable validation results

### AC-PROF-03: Profile Staleness Warning
- **Given** a `profile.json` with `last_reviewed_at` older than the staleness threshold
- **When** `debugbundle doctor` runs
- **Then** the doctor report includes a warning about stale profile

### AC-PROF-04: Skill File Generation
- **Given** a repository where `debugbundle setup` has run
- **Then** `.agents/skills/debugbundle/SKILL.md` exists per agentskills.io spec and teaches agents to use DebugBundle
- **And** SKILL.md has YAML frontmatter with `name: debugbundle`
- **And** `references/` directory contains `cli.md`, `mcp.md`, `bundle-schema.md`
- **And** the skill includes high-level noise-management guidance for capture-rule suggestions and path-scoped client-error capture policy without duplicating the full matcher reference
- **And** the file does not require manual editing to be functional
- **And** old locations (`.debugbundle/skill/`, `skills/debugbundle/`) are not created

---

## 16. Documentation Acceptance

### AC-DOC-01: API Documentation
- **Given** a new or changed API route
- **Then** matching OpenAPI documentation exists with request/response schemas and examples

### AC-DOC-02: CLI Documentation
- **Given** a new or changed CLI command
- **Then** help text, usage examples, and docs page exist

### AC-DOC-03: SDK Documentation
- **Given** a new or changed SDK method
- **Then** JSDoc/TSDoc (or language-equivalent docstrings), README example, and docs page exist

### AC-DOC-04: Webhook Documentation
- **Given** a new or changed webhook event type
- **Then** JSON schema, payload example, and docs page exist

### AC-DOC-05: MCP Tool Documentation
- **Given** a new or changed MCP tool
- **Then** the tool schema includes an accurate description, typed parameters with descriptions, and a structured return shape
- **And** the tool description matches the behavior of its API/CLI equivalent
- **And** an entry exists in the MCP tool reference documentation

### AC-DOC-06: LLM/Agent Discovery via llms.txt
- **Given** the production deployment at `debugbundle.com`
- **When** an LLM agent or crawler requests `GET /llms.txt`
- **Then** a well-formed `llms.txt` file is returned with: project name, primary documentation URL, and links to core concepts, API reference, CLI reference, webhook events, bundle schema, machine-readable schemas (OpenAPI JSON, bundle JSON schema, webhook events JSON schema), example bundles, and agent workflows documentation
- **And** the response has `Content-Type: text/plain`
- **And** all URLs in the file resolve to valid documentation pages or JSON artifacts

### AC-DOC-07: Machine-Readable Artifacts Published
- **Given** the production deployment
- **When** an agent requests the machine-readable schema endpoints
- **Then** `GET /openapi.json` returns a valid OpenAPI 3.x specification covering all public API routes
- **And** `GET /schemas/bundle.json` returns a valid JSON Schema for the bundle format
- **And** `GET /schemas/webhook-events.json` returns a valid JSON Schema for webhook event payloads
- **And** each schema validates against its meta-schema (OpenAPI, JSON Schema Draft 2020-12)

### AC-DOC-08: Documentation Versioning
- **Given** the documentation site
- **Then** documentation is served under versioned paths (`/docs/v1/`, future `/docs/v2/`)
- **And** the current version is the default when accessing `/docs/`
- **And** schema URLs include version identifiers (`/schemas/bundle.json`)

### AC-DOC-09: Documentation Generated From Source
- **Given** a new or changed API route, webhook payload, or CLI command
- **When** the documentation generation pipeline runs
- **Then** API routes produce matching OpenAPI spec entries
- **And** webhook payloads produce matching JSON schema entries
- **And** CLI commands produce matching command reference entries
- **And** no manual documentation-only updates are required for interface changes

### AC-DOC-10: Documentation Examples Validated
- **Given** example payloads in documentation (API examples, webhook examples, bundle examples)
- **When** the CI validation pipeline runs
- **Then** API examples validate against the OpenAPI spec
- **And** webhook examples validate against the webhook JSON schema
- **And** bundle examples validate against the bundle JSON schema
- **And** CLI examples execute successfully (or are syntax-checked)

### AC-DOC-11: Example Bundle Artifacts
- **Given** the repository `examples/` directory
- **Then** `examples/bundle.failure.json` exists and validates against the bundle JSON schema
- **And** `examples/bundle.improvement.json` exists and validates against the bundle JSON schema
- **And** both examples are referenced in documentation and in `llms.txt`
- **And** CI validates these artifacts on every commit

### AC-DOC-12: Agent Workflows Documentation
- **Given** the documentation site
- **Then** a dedicated agent workflows section exists at `/docs/agent-workflows`
- **And** it covers: webhook-triggered bundle fetch and analysis, support ticket probe activation with trigger tokens, CLI/MCP-driven incident investigation, and automated PR creation from bundle analysis
- **And** each workflow includes concrete examples with actual API/CLI/MCP invocations

### AC-DOC-13: Static Public Site Export
- **Given** the public marketing/docs/blog build pipeline
- **When** the public site is built for production
- **Then** the output is a fully static export that can be uploaded to S3 and served through CloudFront
- **And** no Node.js server runtime is required to serve marketing pages, blog content, docs pages, sitemap, robots, or machine-readable documentation artifacts

### AC-DOC-14: Shared Public Site Route Layouts
- **Given** the public site at `debugbundle.com`
- **When** a user navigates between marketing pages, docs, and blog content
- **Then** marketing and legal pages use the standard site layout
- **And** `/docs` uses the Fumadocs docs layout
- **And** `/blog` uses the blog/content layout
- **And** all three route groups are served from the same statically exported Next.js application

### AC-DOC-15: Static SEO Surfaces
- **Given** the production public site deployment
- **Then** sitemap and robots files are published as static assets
- **And** key marketing, docs, and blog routes expose stable metadata and canonical URLs through standard Next.js metadata generation

---

## 17. End-to-End Agent Workflow Acceptance

### AC-E2E-01: Full Agent Loop
- **Given** a deployed application with DebugBundle configured
- **When** a production exception occurs
- **Then** a bundle is generated
- **And** a `bundle.created` webhook is delivered
- **And** an AI agent can fetch the bundle via API/CLI/MCP
- **And** the bundle contains sufficient context for the agent to propose a fix

---

## 18. Local Analysis Acceptance

### AC-ANA-01: Local Improvement Analysis
- **Given** a project with local bundles in `.debugbundle/bundles/local/` and a valid `profile.json`
- **When** a user or agent runs `debugbundle analyze --type improvement --local`
- **Then** the command reads local bundles, profile, and relevant source code
- **And** outputs a bundle JSON with `bundle_type: "improvement"`
- **And** follows the analysis recipe schemas from `.agents/skills/debugbundle/assets/schemas/`
- **And** no cloud credentials are required

### AC-ANA-02: Free vs Paid Tier Analysis
- **Given** a Free-tier user running local analysis
- **Then** analysis uses only local bundles and the user’s own agent/LLM
- **And** Solo and Team projects with automated improvements enabled receive deterministic cloud-generated improvement bundles only when bundle-producing telemetry crosses configured thresholds and dedupe gates
- **And** below-threshold request/log candidates remain internal counting state and do not appear in default hosted improvement lists
- **And** incident-derived improvement opportunities link to related incident bundles instead of creating duplicate improvement bundle artifacts
- **And** resolving all incidents linked by an incident-derived opportunity automatically resolves that opportunity

---

## 19. Onboarding Acceptance

### AC-ONB-01: Agent-Driven Installation
- **Given** a user provides their AI agent with the DebugBundle installation prompt from docs
- **When** the agent executes the prompt
- **Then** the SDK package is installed
- **And** `debugbundle setup` is run (the single entrypoint, not `init`)
- **And** `.debugbundle/` directory is created with `profile.json`, `local/connection.json`
- **And** `.agents/skills/debugbundle/SKILL.md` is created per agentskills.io spec
- **And** the agent reads the skill and understands how to use DebugBundle
- **And** local-only mode works without a cloud account

### AC-ONB-02: Skill Discovery
- **Given** `debugbundle setup` has run
- **Then** `.agents/skills/debugbundle/SKILL.md` exists per agentskills.io spec and is structured for agent discovery
- **And** its description explicitly covers runtime error reporting, crash reporting, incident reporting and response, live-app/production monitoring, health checks, debug bundles, and product analytics
- **And** monitoring and observability language is scoped to runtime failures, customer-facing incidents, and endpoint health rather than claiming a generic infrastructure-monitoring platform
- **And** the skill teaches agents to: check incidents for qualifying runtime, production, health-check, notification, webhook, or captured-artifact issues; inspect source and tests first for deterministic local UI, layout, copy, calculation, refactor, or test-only issues unless runtime evidence is needed; fetch/analyze bundles; validate the profile; evaluate repeated low-value incidents for scoped capture-rule or path-scoped client-error capture-policy handling; and resolve incidents after a fix is verified or after intentional verification incidents have served their purpose

### AC-ONB-03: Two-Phase Profile Generation
- **Given** a repository with `package.json`, `docker-compose.yml`, and `.github/workflows/`
- **When** `debugbundle setup` runs
- **Then** `profile.json` is auto-populated with detected languages, frameworks, services, infrastructure, and build commands via static file analysis
- **And** no AI agent is required for this initial profile
- **And** the skill layer provides a "Profile Validation" task for deeper agent-driven analysis later
- **And** `profile.json` carries `"validation_status": "static-analysis-only"`

### AC-ONB-04: AGENTS.md Integration
- **Given** `debugbundle setup` runs in a repo that has an `AGENTS.md`
- **Then** a DebugBundle section is appended to `AGENTS.md`
- **And** the section gives a lightweight trigger rule for when DebugBundle is appropriate, tells agents to inspect source/tests first for deterministic local UI, layout, copy, calculation, refactor, or test-only issues, and points to `.agents/skills/debugbundle/SKILL.md` for the full DebugBundle workflow

### AC-ONB-05: Local-Only Setup
- **Given** a developer running `debugbundle setup` and choosing local-only mode
- **Then** no cloud account, member token, or project token is required
- **And** `.debugbundle/local/connection.json` shows `"mode": "local-only"`
- **And** the SDK is configured with file transport for `local`/`development` environments
- **And** `debugbundle process` can produce bundles from locally captured events

### AC-ONB-06: Cloud Upgrade
- **Given** a local-only project
- **When** `debugbundle connect` is run
- **Then** connection config is updated without uploading existing local events
- **And** cloud transport is enabled for selected environments
- **And** existing local incidents remain untouched in `state.json`

### AC-ONB-06a: Missing-Auth Connect Recovery
- **Given** a local-only project and no `~/.debugbundle/auth.json`
- **When** `debugbundle connect` is run in an interactive terminal
- **Then** the CLI prompts for login first
- **And** after successful authentication it resumes the connection workflow automatically
- **And** in `--json` or non-interactive mode it does not prompt and instead returns actionable auth guidance

### AC-ONB-07: Gitignore Management
- **Given** `debugbundle setup` runs
- **Then** `.gitignore` contains entries for `.debugbundle/local/events/`, `.debugbundle/local/state.json`, `.debugbundle/bundles/`
- **And** `.debugbundle/profile.json`, `.debugbundle/local/connection.json`, and `.agents/skills/debugbundle/` are NOT gitignored

---

## 20. Browser Volume Control Acceptance

### AC-BRW-01: Breadcrumbs-On-Error-Only Default
- **Given** a browser app with `@debugbundle/sdk-browser` initialized with default config
- **When** the user navigates pages, clicks buttons, and triggers network requests — but no exception occurs
- **Then** zero `frontend_breadcrumb` events are shipped to the ingestion API
- **And** breadcrumbs accumulate in the local ring buffer only

### AC-BRW-02: Breadcrumbs Shipped With Exception
- **Given** a browser SDK with `breadcrumbsOnErrorOnly: true` (default)
- **And** the ring buffer contains 7 breadcrumbs (3 clicks, 2 route changes, 2 network)
- **When** a `frontend_exception` occurs
- **Then** the exception event is shipped with all 7 breadcrumbs attached as `breadcrumbs[]`
- **And** the ring buffer is cleared after flush
- **And** no standalone `frontend_breadcrumb` events are emitted

### AC-BRW-03: Ring Buffer Cap
- **Given** a browser SDK with `maxBreadcrumbs: 10` (default)
- **When** 15 breadcrumb-worthy interactions occur before an exception
- **Then** only the 10 most recent breadcrumbs are attached to the exception event
- **And** the 5 oldest breadcrumbs were discarded from the ring buffer

### AC-BRW-04: Per-Event-Type Toggles
- **Given** a browser SDK initialized with `captureNetwork: false` and `captureClicks: true`
- **When** the user clicks a button and a network request fires
- **Then** the click is added to the ring buffer
- **And** the network request is not captured

### AC-BRW-05: Network Request Filtering
- **Given** a browser SDK with `networkFilter: { statusCodes: [400, 599] }` (default)
- **When** a `200 OK` response, a `404 Not Found`, and a `500 Internal Server Error` occur
- **Then** only the 404 and 500 responses are added to the breadcrumb ring buffer
- **And** the 200 response is silently excluded
- **And** if the 500 response is first-party, the browser SDK also emits a standalone `request_event`
- **And** if the 500 response is third-party and not trace-allowlisted, it remains breadcrumb-only context

### AC-BRW-06: Session Sampling Coherence
- **Given** a browser SDK with `sessionSampleRate: 0.5`
- **When** a new session starts
- **Then** a single random decision determines whether the entire session is captured or skipped
- **And** if sampled out, zero breadcrumbs and zero non-exception events are captured for the entire session
- **And** `frontend_exception` events are still captured regardless of session sampling

### AC-BRW-07: Max Events Per Session Cap
- **Given** a browser SDK with `maxEventsPerSession: 100`
- **When** 100 events have been captured in the current session
- **And** additional clicks and route changes occur
- **Then** breadcrumbs stop accumulating in the ring buffer
- **And** `frontend_exception` events are still captured and shipped
- **And** the cap resets on page reload (new session)

### AC-BRW-08: High-Volume Scenario
- **Given** a production app with 1,000 concurrent browser users and `breadcrumbsOnErrorOnly: true`
- **When** each user generates ~50 breadcrumbs/min but only 2% trigger exceptions
- **Then** ingestion receives ~20 exception events/min (each with ≤10 breadcrumbs) — not 50,000 standalone breadcrumbs/min
- **And** the Free-tier rate limit (1,000 events/min per project token) is not exceeded

---

## 21. Probe Acceptance

### AC-PRB-01: Always-On Probe Buffers Locally
- **Given** a backend or browser SDK with `probe()` calls in application code and no remote activations
- **When** application code calls `debugbundle.probe('checkout.pricing.tax', { cart, total })`
- **Then** the data is serialized, redacted, and stored in the per-label ring buffer for `checkout.pricing.tax`
- **And** no `probe_event` is shipped to ingestion (data only sits in local memory)
- **And** the ring buffer evicts the oldest entry when capacity (`maxProbeEntriesPerLabel`, default 10) is exceeded

### AC-PRB-02: Always-On Probe Flushes on Error
- **Given** a backend SDK with probe ring buffers containing data for labels `checkout.pricing.tax` and `auth.rbac`
- **When** an error occurs (`backend_exception` or `frontend_exception`)
- **Then** all probe ring buffers are flushed alongside the error event batch to `POST /v1/events`
- **And** the flushed probe events have `activation_id: null` (indicating always-on flush)
- **And** probe data flows through the standard pipeline and attaches to the incident's bundle as `context.probe_data[]`
- **And** the ring buffers are cleared after flush

### AC-PRB-03: Remote Activation Triggers Independent Shipping (Solo+)
- **Given** a running application with `probe('checkout.pricing.tax', data)` calls in the code
- **And** a member activates probes with pattern `checkout.*` via `POST /v1/projects/{id}/probes/activate` with TTL 300s
- **When** the SDK's next config poll completes (within `probesPollInterval`)
- **Then** subsequent `probe('checkout.pricing.tax', data)` calls emit `probe_event` events immediately (standard batching)
- **And** each `probe_event` contains the label, serialized + redacted data, and `activation_id`
- **And** the ring buffer continues to operate normally in parallel (data is both buffered and shipped)

### AC-PRB-04: TTL Expiry Deactivates Remote Probes
- **Given** a remote probe activation with `ttl_seconds: 60`
- **When** 60 seconds have elapsed since activation
- **Then** the SDK stops emitting `probe_event` independently for that activation (local TTL enforcement)
- **And** always-on ring buffer behavior continues unchanged
- **And** the server returns the activation as expired on the next `GET /v1/projects/{id}/probes` call

### AC-PRB-05: Probe Events Attach to Bundles
- **Given** a `probe_event` with `trace_id: "abc-123"` captured during an error flush or remote activation
- **And** an incident whose events contain the same `trace_id: "abc-123"`
- **When** the bundle is generated for that incident
- **Then** the bundle's `context.probe_data[]` includes the probe event data (label, data, timestamp, activation_id)
- **And** probe data is also matched by time window + service when `trace_id` is absent

### AC-PRB-06: Probe Events Are NOT Fingerprinted
- **Given** 100 `probe_event` events with label `checkout.pricing.tax`
- **When** the processing worker normalizes and fingerprints events
- **Then** no incident is created from probe events alone
- **And** probe events are stored but not grouped

### AC-PRB-07: Lazy Probe Variant (Backend)
- **Given** a backend SDK in always-on mode (no remote activations)
- **When** application code calls `debugbundle.probe('checkout.pricing.tax', () => expensiveComputation())`
- **Then** the callback IS invoked (data is needed for the ring buffer)
- **And** the result is serialized, redacted, and stored in the ring buffer
- **Given** a backend SDK with a heavy probe `debugbundle.probe('db-plan', () => data, { heavy: true })`
- **And** no remote activation matching `db-plan`
- **When** the heavy probe is called
- **Then** the callback is NOT invoked (heavy probes are dormant in always-on mode)
- **And** no data is buffered for that label

### AC-PRB-08: Browser Probe Always-On Behavior
- **Given** a browser SDK with probe ring buffers containing data
- **When** a `frontend_exception` occurs
- **Then** all probe ring buffers flush alongside the error (same as backend behavior)
- **And** probe data ships via standard batching
- **And** probe ring buffers are separate from the breadcrumb ring buffer

### AC-PRB-09: Browser Probe Remote Activation (Solo+)
- **Given** a browser SDK for a paid-tier project with an active remote probe matching `checkout.ui.*`
- **When** application code calls `debugbundle.probe('checkout.ui.cart-render', { renderTime: 42 })`
- **Then** a `probe_event` is emitted and shipped directly (independent of error occurrence)
- **And** the probe event does NOT count toward `maxEventsPerSession`
- **And** the probe event respects `sessionSampleRate`

### AC-PRB-10: Free-Tier Always-On Probes
- **Given** a Free-tier project token used to initialize any SDK
- **When** application code calls `debugbundle.probe('checkout.pricing', { total: 42 })`
- **Then** the data is buffered in the per-label ring buffer (always-on mode works on Free tier)
- **When** an error occurs
- **Then** probe ring buffers flush alongside the error event
- **And** the SDK does NOT poll `GET /v1/sdk/config` (no remote activation on Free tier)
- **And** `POST /v1/projects/{id}/probes/activate` returns 403 for Free-tier projects

### AC-PRB-11: Backend Config Polling Efficiency (Solo+)
- **Given** a backend SDK polling `GET /v1/sdk/config` with no remote activations (paid tier)
- **When** the server responds with an empty `active_probes` array and ETag `"abc"`
- **And** the SDK polls again with `If-None-Match: "abc"`
- **Then** the server returns 304 Not Modified with no body
- **And** the SDK maintains its cached (empty) remote activation state

### AC-PRB-12: Browser Probe Delivery — Zero Polling (Solo+)
- **Given** a browser SDK for a paid-tier project initialized with `debugbundle.init()`
- **Then** the SDK makes exactly ONE `GET /v1/sdk/config` request (CDN-cached)
- **And** the SDK does NOT set up any periodic polling interval
- **When** the browser SDK sends events via `POST /v1/events`
- **Then** it reads the `probe_directives` field from the response body
- **And** updates its local remote activation state accordingly

### AC-PRB-13: CDN Edge-Caching
- **Given** 1,000 browser SDKs calling `GET /v1/sdk/config` within a 30-second window for the same project
- **Then** at most 1 request reaches the Cloudflare Worker (origin)
- **And** the remaining requests are served from CDN edge cache
- **And** the response includes `Cache-Control: public, s-maxage=30`

### AC-PRB-14: Trigger Token Returned on Activation (Solo+)
- **Given** a paid-tier project with a valid member token
- **When** `POST /v1/projects/{id}/probes/activate` succeeds
- **Then** the response includes a `trigger_token` field prefixed with `dbundle_probe_`
- **And** the response includes a `trigger_expires_at` field
- **And** the token is HMAC-SHA256 signed, scoped to the activation's labels, service, and environment
- **And** `trigger_expires_at` defaults to `expires_at` when `trigger_ttl_seconds` is not provided

### AC-PRB-15: Trigger Token via Query Parameter (Backend)
- **Given** a backend SDK initialized for a paid-tier project
- **And** a valid trigger token `dbundle_probe_abc...`
- **When** an HTTP request arrives with query parameter `_debug_probe=dbundle_probe_abc...`
- **Then** the SDK validates the trigger token locally (signature + expiry)
- **And** matching probes ship independently for that single request only (in addition to always-on ring buffer)
- **And** no additional API call is made to validate the token

### AC-PRB-16: Trigger Token via Header (Backend)
- **Given** a backend SDK initialized for a paid-tier project
- **And** a valid trigger token
- **When** an HTTP request arrives with header `X-DebugBundle-Probe-Trigger: dbundle_probe_abc...`
- **Then** the SDK validates the trigger token locally and activates matching probes for that request
- **And** the header is consumed silently (not forwarded or logged)

### AC-PRB-17: Trigger Token via Query Parameter (Browser)
- **Given** a browser SDK initialized for a paid-tier project
- **When** a page loads with `?_debug_probe=dbundle_probe_abc...` in the URL
- **Then** the SDK reads the trigger token from the query parameter
- **And** strips `_debug_probe` from the URL bar via `history.replaceState`
- **And** activates matching probes for independent shipping for that session/page load only

### AC-PRB-18: Expired Trigger Token Rejected
- **Given** a trigger token whose TTL has elapsed
- **When** the token is presented via query param or header
- **Then** the SDK rejects the token silently (no error to the user)
- **And** no independently-shipped probe events are emitted for that request
- **And** always-on ring buffer behavior is unaffected

### AC-PRB-19: Trigger Token Does Not Persist
- **Given** a valid trigger token used on request N
- **When** request N+1 arrives without the trigger token
- **Then** probes return to their polling-derived state (independent shipping only if a matching remote activation exists via normal config)
- **And** always-on ring buffer continues operating regardless

### AC-PRB-20: Independent Trigger Token TTL
- **Given** an activation created with `ttl_seconds: 300` and `trigger_ttl_seconds: 86400`
- **When** the passive activation expires after 5 minutes
- **Then** the trigger token remains valid for 24 hours
- **And** a request arriving at hour 12 with the trigger token still activates matching probes for independent shipping
- **And** the passive polling path shows no active probes (activation expired)

### AC-PRB-21: Support-Ticket Trigger Token Workflow
- **Given** an agent investigating a user-reported issue
- **When** the agent activates probes with `trigger_ttl_seconds: 86400`
- **And** sends the trigger token link to the user (e.g., `https://app.example.com/checkout?_debug_probe=dbundle_probe_...`)
- **And** the user clicks the link hours later
- **Then** the browser SDK reads and strips the token from the URL
- **And** matching probes activate for independent shipping for that user's session
- **And** diagnostic data is captured and attached to the incident bundle

### AC-PRB-22: Ring Buffer Configuration
- **Given** an SDK initialized with `maxProbeLabels: 5` and `maxProbeEntriesPerLabel: 3`
- **When** `probe()` is called with 6 distinct labels
- **Then** the 6th label is silently dropped
- **When** `probe()` is called 4 times for the same label
- **Then** only the 3 most recent entries remain in the ring buffer

### AC-PRB-23: Heavy Probe Fires on Remote Activation (Solo+)
- **Given** a backend SDK with `probe('db-plan', () => db.explain(query), { heavy: true })`
- **And** a remote activation matching `db-plan` on a paid-tier project
- **When** the probe is called
- **Then** the callback IS invoked and the result ships as a `probe_event` with the `activation_id`

---

## 22. Weekly Reporting Acceptance

### AC-RPT-01: Weekly Report Delivery
- **Given** a project with incidents generated during the past week
- **When** the weekly reporting schedule fires
- **Then** a summary report is delivered via the configured channel (email or Slack)
- **And** the report includes: total bundles generated (by type), new incidents, regressions, top spiking incidents
- **And** projects with zero activity receive no report (no noise)
- **And** the report includes resolved incident counts and a plain-language outcome sentence for incidents opened during the week
- **And** email reports due for the same recipient set and weekly window are combined into one email with per-project sections
- **And** project owners/admins can enable or disable the project email report from project settings
- **And** weekly email report channels are limited to 3 recipients
- **And** new projects create one enabled owner-recipient email weekly report by default
- **And** a second email weekly report channel cannot be created for the same project

---

## 23. Event Classification & Capture Policy Acceptance

### AC-EVT-01: Event Classification Correctness
- **Given** events of each canonical type processed through the normalization pipeline
- **When** the worker classifies each event
- **Then** `backend_exception` → `incident_signal`
- **And** `frontend_exception` → `incident_signal`
- **And** `log_event` with `level` in (`error`, `fatal`, `critical`) → `incident_signal`
- **And** `log_event` with `level` below `error` → `context_signal`
- **And** `request_event` with `response_status >= 500` → `incident_signal` under every preset
- **And** `request_event` with `response_status: 429` → `incident_signal` for `balanced` and `investigative`, but `context_signal` for `minimal`
- **And** `request_event` with `response_status: 409` → `incident_signal` for `investigative`, but `context_signal` for `minimal` and `balanced`
- **And** `request_event` with a `4xx` status listed in `immediate_client_error_statuses` → `incident_signal` for that project regardless of whether the preset would otherwise keep it contextual
- **And** `request_event` with a `4xx` status, path, and optional method matched by `immediate_client_error_path_rules` → `incident_signal` for that project regardless of whether broader status promotion is disabled
- **And** `request_event` outside the preset's immediate request-failure set → `context_signal`
- **And** `frontend_breadcrumb` → `context_signal`
- **And** `deploy_metadata` → `context_signal`
- **And** `error_suppressed` → `operational_signal`
- **And** `probe_event` without `activation_id` (error-flush) → `context_signal`
- **And** `probe_event` with `activation_id` (standalone) → `operational_signal`

### AC-EVT-02: Event Class Persisted
- **Given** a normalized event processed by the worker
- **When** the event is stored in `incident_events`
- **Then** the `event_class` column contains the correct classification
- **And** `event_class` is never null

### AC-EVT-03: Free Tier Billing Excludes Non-Incident Events
- **Given** a Free-tier project with 100 `incident_signal` events and 500 `context_signal` events and 200 `operational_signal` events in a billing period
- **When** the billing query counts usage against the 750/month quota
- **Then** only the 100 `incident_signal` events are counted
- **And** the project is not over quota

### AC-EVT-04: Capture Policy Defaults
- **Given** a new project is created
- **When** the capture policy is queried via `GET /v1/projects/{id}/capture-policy`
- **Then** Free-tier projects default to preset `balanced`
- **And** paid-tier projects default to preset `balanced`
- **And** existing projects retain any explicitly persisted preset when the software is upgraded
- **And** `policy.immediate_client_error_statuses` resolves to `[]` for `balanced`
- **And** `policy.immediate_client_error_statuses` resolves to `[401,403,409,422]` for `investigative`
- **And** `policy.immediate_client_error_path_rules` resolves to `[]` for every preset
- **And** all override fields are `null` (preset controls apply)
- **And** a plain member viewer receives only the resolved preview payload, not raw override provenance

### AC-EVT-05: Capture Policy CRUD
- **Given** a project owner or admin with member-token auth
- **When** `PATCH /v1/projects/{id}/capture-policy` is called with `{ "preset": "investigative" }`
- **Then** the policy updates to the `investigative` preset
- **And** `GET /v1/projects/{id}/capture-policy` returns the new preset with resolved control values and raw override state

### AC-EVT-05a: Capture Policy Member Preview
- **Given** a project collaborator with role `member`
- **When** `GET /v1/projects/{id}/capture-policy` is called
- **Then** the response includes only the resolved policy preview needed for read-only display
- **And** the response omits raw override state and preset-origin adornment data
- **When** the same collaborator calls `PATCH /v1/projects/{id}/capture-policy`
- **Then** the request is rejected with a permissions error

### AC-EVT-06: Capture Policy Advanced Overrides
- **Given** a project with preset `balanced`
- **When** `PATCH /v1/projects/{id}/capture-policy` is called with `{ "capture_logs": "info" }`
- **Then** the `capture_logs` override is stored as `info`
- **And** the resolved policy shows `capture_logs: "info"` (override) with all other controls resolved from the `balanced` preset

### AC-EVT-06a: Capture Policy Client Error Incident Overrides
- **Given** a project with preset `balanced`
- **When** `PATCH /v1/projects/{id}/capture-policy` is called with `{ "immediate_client_error_statuses": [422,403,422] }`
- **Then** the override is stored as `[403,422]`
- **And** the resolved policy shows `immediate_client_error_statuses: [403,422]`
- **And** `GET /v1/projects/{id}/capture-policy` returns `overrides.immediate_client_error_statuses: [403,422]`
- **When** the same route is called with `{ "immediate_client_error_statuses": [] }`
- **Then** the project uses explicit `none`
- **And** `GET /v1/projects/{id}/capture-policy` returns `overrides.immediate_client_error_statuses: []` rather than `null`
- **When** the route is called with `{ "immediate_client_error_path_rules": [{ "status_code": 404, "path_pattern": "/checkout/*", "methods": ["GET", "POST"] }] }`
- **Then** the override is stored with normalized method names
- **And** only matching `404` requests under `/checkout/` for those methods are promoted into request incidents
- **And** unrelated `404` paths remain contextual telemetry

### AC-EVT-07: SDK Config Includes Capture Policy
- **Given** a project with a capture policy set
- **When** an SDK calls `GET /v1/sdk/config` with a valid project token
- **Then** the response includes a `capture_policy` object with all resolved control values
- **And** the SDK uses these controls to filter events before sending

### AC-EVT-07a: SDK Config Includes Active Capture Rules
- **Given** a project with enabled, unexpired capture rules
- **When** an SDK calls `GET /v1/sdk/config` with a valid project token
- **Then** the response includes `capture_rules`
- **And** expired or disabled rules are omitted
- **And** Browser SDK applies local `demote`, `sample`, and `drop` outcomes where possible
- **And** Node SDK applies local `drop` and sampled-out `sample` outcomes before buffering

### AC-EVT-08: Ingestion Enforces Capture Policy Server-Side
- **Given** a project with preset `minimal` (which sets `capture_request_events: "failures_only"`)
- **When** an SDK sends a `request_event` with `response_status: 200` to `POST /v1/events`
- **Then** the event is rejected with reason `capture_policy_rejected`
- **And** the accepted count does not include rejected events
- **And** rejected events are not persisted to S3

### AC-EVT-08e: Ingestion Enforces Capture Rules Server-Side
- **Given** a project with an active `drop` capture rule matching a valid event
- **When** the SDK sends the event to `POST /v1/events`
- **Then** the event is rejected with reason `capture_rule_dropped`
- **And** the raw event is not persisted
- **Given** the same project has an active `sample` capture rule with a deterministic sampled-out decision
- **When** the SDK sends a matching event
- **Then** the event is rejected with reason `capture_rule_sampled_out`
- **And** the raw event is not persisted

### AC-EVT-08f: Capture Rule Demotion Cannot Drive Incidents
- **Given** a project with an active `demote` capture rule matching an incident-eligible event
- **When** a matching event is accepted and processed
- **Then** worker normalization stores the event as `context_signal`
- **And** no incident is created, reopened, regressed, alerted, or dispatched from that event

### AC-EVT-08g: Capture Rule Suggestions Are Interface-Portable
- **Given** an incident with a ready bundle
- **When** capture-rule suggestions are requested via API, CLI, MCP, or web
- **Then** each interface exposes deterministic suggestions derived from the incident and bundle
- **And** owner/admin users can create a selected rule from the suggestion
- **And** suggestions indicate when a matching rule already exists and expose the existing rule id
- **And** creating the same suggestion again returns the existing rule instead of creating a duplicate
- **And** plain members can preview rules but cannot create, update, or delete them
- **And** browser-noise suggestions can use structured fields such as `browser_event_opaque`, `client_kind`, and `bot_family` without requiring an exact-fingerprint-only fallback when bundle evidence is sufficient

### AC-EVT-08a: Ingestion Always Accepts 5xx Request Failures
- **Given** a project with any capture preset or `capture_request_events` override
- **When** an SDK sends a `request_event` with `response_status >= 500` to `POST /v1/events`
- **Then** the event is accepted
- **And** worker normalization classifies it as `incident_signal`
- **And** the incident bundle primary signal can be `request_failure`

### AC-EVT-08b: Ingestion Accepts Preset-Specific Immediate Request Failures
- **Given** a project with preset `balanced`
- **When** an SDK sends a `request_event` with `response_status: 429` to `POST /v1/events`
- **Then** the event is accepted
- **And** worker normalization classifies it as `incident_signal`
- **Given** a project with preset `investigative`
- **When** an SDK sends a `request_event` with `response_status: 409` to `POST /v1/events`
- **Then** the event is accepted even if `capture_request_events` is otherwise narrowed
- **And** worker normalization classifies it as `incident_signal`

### AC-EVT-08d: Ingestion Accepts Configured Client Error Incidents
- **Given** a project with preset `minimal`, `capture_request_events: "off"`, and `immediate_client_error_statuses: [403]`
- **When** an SDK sends a `request_event` with `response_status: 403` to `POST /v1/events`
- **Then** the event is accepted
- **And** worker normalization classifies it as `incident_signal`
- **And** the same request would be rejected with `capture_policy_rejected` if the override were `[]` or `null`
- **Given** the same project instead has `immediate_client_error_path_rules: [{ "status_code": 404, "path_pattern": "/checkout/*", "methods": ["GET"] }]`
- **When** an SDK sends a `GET` `request_event` for `/checkout/order-missing` with `response_status: 404`
- **Then** the event is accepted and classified as `incident_signal`
- **When** an SDK sends a `GET` `request_event` for `/robots.txt` with `response_status: 404`
- **Then** the event is rejected when `capture_request_events` is `off`, or stored as `context_signal` when request telemetry is otherwise enabled

### AC-EVT-08c: Repeated Contextual 4xx Request Failures Do Not Open Incidents
- **Given** a project with preset `balanced`
- **And** repeated first-party `request_event` payloads for the same normalized route, method, service, environment, and `response_status: 404`
- **When** the worker observes at least `20` such events in `5` minutes and the `5m/1h` ratio is at least `3.0`
- **Then** the stored `request_event` rows remain `context_signal`
- **And** the worker does not enqueue a request incident solely from repetition
- **Given** a project with preset `investigative`
- **And** repeated scanner-style `GET` `404` request events for low-value external-probe paths such as `/wp-config.php_old2024` or `/autodiscover/autodiscover.json`
- **When** the same count and ratio thresholds are crossed
- **Then** the stored `request_event` rows remain contextual telemetry only
- **And** the worker does not enqueue a request incident for those low-value probe paths unless an explicit status or path rule promotes them

### AC-EVT-09: SDK Local Capture Policy Enforcement
- **Given** an SDK initialized with a project whose capture policy sets `capture_logs: "error"`
- **When** the application emits a `warning`-level log
- **Then** the SDK suppresses the log event locally (does not send it)

### AC-EVT-09a: SDK Local Request Failure Promotion Uses Capture Preset
- **Given** an SDK that has loaded `capture_policy` from `GET /v1/sdk/config`
- **When** the effective preset is `balanced` and it observes a first-party request failure with `response_status: 429`
- **Then** the SDK emits a standalone `request_event`
- **And** if the effective preset is `balanced`, `capture_request_events` is `failures_only`, and the response status is an unpromoted `404`, the SDK does not emit a standalone request incident signal
- **And** if the effective preset is `investigative` and the response status is `409`, the SDK emits a standalone `request_event`
- **And** if `immediate_client_error_statuses` includes `403`, the SDK emits a standalone `request_event` for a first-party `403` even when `capture_request_events` is `off`
- **And** if `immediate_client_error_path_rules` includes `404 /checkout/* GET`, the SDK emits a standalone `request_event` for a matching first-party `GET /checkout/*` `404` even when `capture_request_events` is `off`
- **And** no network request is made for the suppressed event

### AC-EVT-10: Capture Policy Interface Parity
- **Given** the capture-policy management feature
- **Then** `GET /v1/projects/{id}/capture-policy` is available via API
- **And** `debugbundle capture-policy get --project <id>` is available via CLI
- **And** `get_capture_policy` is available via MCP
- **And** all three return identical policy data for the same project

### AC-PROJ-01: Project Deletion Parity
- **Given** an owner in an organization with project `proj_123`
- **When** `DELETE /v1/projects/proj_123` succeeds
- **Then** the API returns the deleted project identity payload
- **And** `debugbundle project delete proj_123` is available via CLI
- **And** `delete_project` is available via MCP
- **And** the web project settings destructive action deletes the same project and returns the operator to the projects inventory

### AC-PROJ-02: Project Deletion Authorization and Missing State
- **Given** a non-owner member in the same organization
- **When** that member calls `DELETE /v1/projects/proj_123`
- **Then** the server returns `403 { "error": "forbidden" }`
- **When** an owner deletes a project that is not visible in their organization
- **Then** the server returns `404 { "error": "project_not_found" }`

---

## 24. AnalyticsBundle & Product Analytics Acceptance

### AC-ANL-01: Analytics Disabled By Default
- **Given** an existing browser SDK install that upgrades to a version with analytics support
- **When** the SDK initializes without `analytics.enabled: true`
- **Then** no analytics events are captured or shipped
- **And** existing debug capture behavior is unchanged

### AC-ANL-02: Browser Analytics Capture
- **Given** a browser SDK initialized with analytics enabled
- **When** a user starts a session, views pages, changes routes, triggers semantic actions, advances funnel steps, and converts
- **Then** the SDK emits analytics events for session, page, route, action, funnel, and conversion signals
- **And** each analytics event includes session correlation, service/environment, device type, browser, OS, language/locale, viewport bucket, referrer/UTM context when available, and configured privacy-safe identity fields
- **And** direct-browser `standard` privacy mode reuses a project-scoped anonymous visitor hash across SDK instances without persisting or emitting the project token or raw visitor value; `strict` remains session-only and consent withdrawal removes the stored anonymous visitor value
- **And** when friction capture is enabled, three rapid clicks on the same in-memory interactive or eligible non-interactive target emit only `friction.repeated_click` or `friction.dead_click`, and a quick safe `A -> B -> A` route reversal emits only `friction.backtrack`; no target-derived data is retained or shipped

### AC-ANL-03: Consent Gating
- **Given** analytics is enabled with consent required
- **When** consent is absent or explicitly false
- **Then** the browser SDK does not capture or ship analytics events
- **And** `frontend_exception`, `request_event`, probe, breadcrumb, and other debug capture behavior remains governed by existing debug capture settings

### AC-ANL-03a: Remote Capture Settings Are Restrictive
- **Given** a direct browser SDK initializes with a valid project token and local analytics opt-in
- **When** the SDK explicitly opts into the analytics block and `GET /v1/sdk/config` returns project analytics settings
- **Then** remote settings can disable or narrow page, route, action, friction, consent, and strict-privacy capture without changing debug capture
- **And** remote settings cannot enable analytics for a locally analytics-disabled SDK or widen a local capture setting
- **And** a remote consent requirement blocks capture until `analytics.setConsent(true)` is explicitly called
- **And** relay-mode browser SDKs do not fetch SDK config with browser credentials
- **And** SDK-config responses remain unchanged for legacy clients that do not request the analytics block

### AC-ANL-04: Analytics Events Do Not Create Incidents
- **Given** a valid analytics event batch is accepted
- **When** ingestion and worker processing complete
- **Then** no incident is created, reopened, regressed, alerted, webhooked, or GitHub-dispatched solely from those analytics events
- **And** the events are not assigned `incident_signal`, `context_signal`, or `operational_signal` debug event classes

### AC-ANL-05: Mixed Batch Split
- **Given** a `/v1/events` request contains both debug events and analytics events
- **When** ingestion accepts the batch
- **Then** debug events follow the existing debug validation, capture-policy, persistence, queue, classification, and incident paths
- **And** analytics events follow analytics enablement, analytics quota, short-lived analytics persistence, and analytics aggregation queue paths
- **And** analytics quota failure does not reject otherwise-valid debug events unless a shared request-level limit is exceeded

### AC-ANL-05a: Shared Frontend Primitives Without Coupled Capture
- **Given** the browser SDK captures route changes, clicks/actions, device context, and session context for debug breadcrumbs and optional analytics events
- **When** analytics is disabled, unavailable for the project tier, missing consent, sampled out, or internally failing
- **Then** existing debug capture still records eligible frontend exceptions, breadcrumbs, route-change context, and request events according to debug settings
- **And** no analytics event, quota path, rollup write, or analytics failure is required for DebugBundle incident bundles to include frontend context
- **And** when both debug and analytics capture are enabled, shared SDK helpers may normalize the same route/action/session/device primitives, but emitted debug and analytics envelopes remain separate and follow their own retention, quota, consent, and processing rules

### AC-ANL-06: Privacy Defaults
- **Given** analytics capture is enabled with default privacy settings
- **When** the SDK captures route, action, funnel, and session signals
- **Then** form values, raw click text, raw DOM snapshots, screenshots, video replay, precise coordinates, precise location, raw query strings, emails, names, tokens, payment fields, and secrets are not captured
- **And** server-side processing does not store raw IP addresses in analytics rollups or AnalyticsBundle artifacts

### AC-ANL-07: Controlled Custom Dimensions
- **Given** a project has approved custom dimensions within its fixed tier cap of 1 on Free, 3 on Solo, 8 on Team, or 20 on self-host
- **When** the browser SDK sends analytics events with those fields plus unapproved or sensitive fields
- **Then** approved low-cardinality fields are retained for aggregation
- **And** unapproved, sensitive, overlong, or high-cardinality fields are rejected, dropped, or redacted before aggregation

### AC-ANL-08: Aggregate Metrics
- **Given** accepted analytics events across sessions, routes, devices, referrers, funnels, and conversions
- **When** the analytics worker processes them
- **Then** hourly/daily rollups are updated for usage summary, routes, transitions, actions, funnels, conversions, devices, browsers, OS, language/locale, referrers, UTM, auth state, and approved custom dimensions
- **And** reprocessing the same analytics events does not double-count
- **And** metric reads use aggregate rollup rows rather than long-term raw analytics event scans

### AC-ANL-09: Direct Metrics Interface Parity
- **Given** an authorized member requests project analytics summary, route metrics, device breakdown, referrer metrics, action metrics, funnel summaries, funnel analysis, or journey patterns
- **When** the request is made through API, CLI, or MCP
- **Then** all three interfaces return equivalent data from the same domain services
- **And** a project token cannot read analytics metrics

### AC-ANL-10: Journey Replay Is Structured
- **Given** a retained representative analytics journey sample
- **When** a human or agent views it
- **Then** the journey is represented as a privacy-safe structured timeline of routes, semantic actions, funnel steps, conversions, friction markers, timing, and linked debug incidents
- **And** it does not include video, screenshots, raw DOM snapshots, form values, or raw user text
- **And** explicit browser journey markers use bounded semantic marker keys and sanitized low-cardinality dimensions, while a session summary is emitted once on a non-persisted page exit without treating a back-forward-cache transition as an exit
- **And** opt-in structural browser actions use only fixed allowlisted keys such as `click.button`, remain independent from debug click-breadcrumb settings, and retain no selectors, IDs, input values, URLs, attributes, or visible text

### AC-ANL-11: AnalyticsBundle Generation Unit
- **Given** analytics data exists for many visits
- **When** AnalyticsBundle generation runs
- **Then** bundles are generated for analysis units such as funnel dropoff, route health, incident impact, deploy comparison, feature usage, or journey friction
- **And** no AnalyticsBundle is generated per visit/session by default
- **And** focused analysis kinds reject missing or conflicting route, funnel, incident, deploy, or conversion-path context
- **And** an authorized `opportunity_id` request preserves the opportunity analysis window, aggregate evidence, and complete related incident/deploy sets in the deterministic artifact
- **And** retrying an identical failed generation resets that generation to pending without creating a duplicate record or quota charge

### AC-ANL-12: AnalyticsBundle Determinism
- **Given** the same analysis specification, rollups, representative journey samples, linked incidents, and deploy inputs
- **When** AnalyticsBundle generation runs twice
- **Then** both generated artifact evidence sections are byte-identical after stable serialization
- **And** representative journey selection and array ordering are deterministic
- **And** incident-impact replay remains correlation-gated and ranks by affected-session reach, while other replay ranks by unique-session reach, transition count/share, and stable route/sample ties before at most five retained samples are hydrated

### AC-ANL-13: Incident Impact Analytics
- **Given** a DebugBundle incident and analytics rollups with matching session, route, device, deploy, or time-window correlation
- **When** incident impact is requested
- **Then** the response includes affected sessions, affected route/funnel, conversion delta where available, top device/browser segments, linked journey patterns, and a generated or pending incident-impact AnalyticsBundle state
- **And** any returned retained journey sample ID and hydrated representative journey matches the affected project-scoped session subject, service/environment, transition tag, and analysis window, with an unexpired completed artifact
- **And** no replay is selected from route or time overlap alone, and samples without the internal correlation subject remain unavailable for incident-impact replay

### AC-ANL-14: Analytics Opportunities
- **Given** analytics rollups cross deterministic thresholds for funnel dropoff, route exit/backtrack increase, fixed repeated-click/dead-click/backtrack marker counts, conversion decrease after deploy, or incident impact
- **When** the evaluator runs from a relevant aggregate write or its leased, bounded scheduled pass
- **Then** an analytics opportunity is created or updated with kind, status, severity, confidence, title, summary, evidence, related incidents/deploys, and bundle state
- **And** friction-marker evidence contains only the fixed marker key, normalized route, analysis window, and aggregate event/session counts, never target-derived data
- **And** tiny-sample opportunities are suppressed or marked low confidence
- **And** route/deploy regressions compare bounded current and baseline windows, while incident-impact opportunities use correlation-backed affected sessions
- **And** recurring resolved signals reopen, snoozed signals remain snoozed, and open signals absent for a complete evaluation window resolve automatically

### AC-ANL-15: Web Main Analytics Surface
- **Given** a signed-in member with access to projects that have analytics opportunities or generated AnalyticsBundles
- **When** the member opens the main sidebar Analytics view
- **Then** the page shows a cross-project table/list similar to Incidents and Improvements
- **And** it includes filters for project, environment, service, status, kind, severity, date range, and bundle state
- **And** pending, ready, and failed bundle states are visible

### AC-ANL-15a: Cross-Project Analytics Inventory Parity
- **Given** an authorized browser session or member token
- **When** it lists analytics opportunities or AnalyticsBundle generations without `project_id`
- **Then** it receives only records from projects in the caller's organization with cursor pagination stable across projects
- **And** bundle rows include project identity metadata for workspace inventory rendering
- **And** CLI callers must use `--all-projects`, while only the matching MCP list tools may omit `projectId`
- **And** existing project-scoped list, detail, metrics, journey-sample, settings, and generation behavior remains unchanged

### AC-ANL-16: Project Analytics Tab
- **Given** a signed-in member opens a project
- **When** the member selects the project Analytics tab
- **Then** the tab shows project-scoped summary, routes, funnels, devices, referrers, opportunities, and generated AnalyticsBundles as internal sub-tabs or same-page sections
- **And** no additional top-level project tabs are created for routes, funnels, devices, referrers, opportunities, or bundles

### AC-ANL-17: Analytics Settings
- **Given** a project owner or admin opens project analytics settings
- **When** they configure analytics
- **Then** they can enable/disable analytics, choose privacy mode, require consent, configure sampling/retention, define saved funnels, and manage controlled custom dimensions within the current tier cap
- **And** projects without a deliberately stored saved-funnel override receive the current fixed tier capacity of 1 on Free, 10 on Solo, or 50 on Team without requiring a user-managed numeric limit
- **And** Free projects can opt into the bounded hosted preview without beginning a paid trial, while analytics capture remains disabled until explicitly enabled for both the project and browser SDK
- **And** purchased capacity units increase monthly analytics event, session, retained-journey-sample, and generated-bundle allowances without multiplying saved funnels or custom dimensions
- **And** controlled custom-dimension caps are fixed at 1 on Free, 3 on Solo, 8 on Team, and 20 on self-host
- **And** plain project members can view permitted analytics state but cannot mutate analytics settings

### AC-ANL-18: Analytics Retention
- **Given** analytics raw inputs, journey samples, hourly rollups, daily rollups, and generated AnalyticsBundles exist beyond their configured retention windows
- **When** retention cleanup runs
- **Then** expired raw inputs and samples are deleted
- **And** hourly rollups expire at the project's tier-bounded `hourly_retention_days` while daily rollups remain available for `aggregate_retention_months`
- **And** configured aggregate metrics and retained bundle metadata remain available for their longer retention windows

### AC-ANL-19: Separate Allowance Accounting
- **Given** a project exhausts its analytics event/session or AnalyticsBundle generation allowance
- **When** new analytics events or bundle-generation requests arrive
- **Then** analytics-specific quota errors are returned with `Retry-After` when the API rejects the request synchronously
- **And** otherwise-valid debug events in the same ingestion batch are still accepted unless the shared request-level ingestion rate limit is exceeded
- **And** existing debug incident ingestion and failure bundle retrieval remain governed by their own allowances

### AC-ANL-20: Self-Host Parity
- **Given** a self-hosted DebugBundle deployment with analytics enabled
- **When** browser analytics events are ingested and processed
- **Then** analytics capture, aggregation, retrieval, retention, and AnalyticsBundle behavior match hosted core behavior except for hosted-only billing/provider integrations
- **And** the self-hosted instance never phones home for analytics
- **And** integrated acceptance emits privacy-safe events through the real browser SDK controller and isolated analytics transport lane in both direct and authenticated relay modes before verifying rollups, funnels, retained journeys, and generated bundle retrieval

---

## 25. Browser Relay Acceptance

### AC-REL-01: Local-Only Relay End-to-End
- **Given** a full-stack app with `@debugbundle/sdk-browser` configured in relay mode with `endpoint: '/debugbundle/browser'` and any V1 full relay handler mounted at `POST /debugbundle/browser` in local-only mode
- **When** a `frontend_exception` occurs in the browser
- **Then** the browser SDK sends the event to the same-origin relay endpoint
- **And** the relay writes a valid event file to `.debugbundle/local/events/`
- **And** `debugbundle process` produces a bundle containing the browser error

### AC-REL-01a: Analytics Relay End-to-End
- **Given** opt-in browser analytics is enabled and the browser SDK uses relay mode without a project token
- **When** the SDK sends a mixed analytics journey batch to an origin-authorized relay
- **Then** the relay accepts the versioned `analytics_event` envelopes and rejects unsupported or privacy-invalid fields
- **And** it attaches its configured write-only project token only on the authenticated upstream request
- **And** the analytics lane reaches the same aggregate, funnel, journey-sample, and allowance processing used by direct browser ingestion without changing debug-lane behavior

### AC-REL-02: Full-Stack Cross-Context Bundle
- **Given** a browser `frontend_exception` and a backend `backend_exception` sharing the same `correlation.trace_id`
- **When** both events are written to `.debugbundle/local/events/` (browser via relay, backend via file transport)
- **And** `debugbundle process` runs
- **Then** both events are grouped into the same incident
- **And** the resulting bundle contains both frontend and backend context

### AC-REL-03: Origin Validation
- **Given** a relay handler with default same-origin configuration
- **When** a request arrives with `Origin: https://evil.example.com` to a relay hosted on `app.example.com`
- **Then** the relay responds with `403 Forbidden`
- **And** the payload is not processed

### AC-REL-04: Payload Validation
- **Given** a relay handler
- **When** a request contains an unknown event type `backend_exception` (not a browser type)
- **Then** the event is rejected
- **And** valid browser events in the same batch are still accepted

### AC-REL-05: Field Override Enforcement
- **Given** a browser payload containing `"project_token": "dbundle_proj_stolen"` and `"organization_id": "org_123"`
- **When** the relay processes the payload
- **Then** `project_token` is stripped (relay attaches its own server-side)
- **And** `organization_id` is stripped
- **And** `sdk_name` is forced to `@debugbundle/sdk-browser`

### AC-REL-06: Credential Isolation
- **Given** a browser SDK in relay mode (`transportMode: 'relay'` with a relative relay path or absolute backend relay URL)
- **When** the browser SDK sends an event
- **Then** no `Authorization` header or `projectToken` is included in the request
- **And** the relay attaches credentials server-side when forwarding to cloud

### AC-REL-11: Split Frontend/Backend Relay Preflight
- **Given** a browser SDK in explicit relay mode pointing at an absolute backend relay URL
- **And** the backend relay allowlist includes the frontend origin
- **When** the browser sends `OPTIONS /debugbundle/browser` for CORS preflight
- **Then** the relay responds successfully with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`
- **And** the following allowed POST response includes matching CORS headers while still containing no browser-side DebugBundle credentials

### AC-REL-07: Connected Durable Delivery
- **Given** a relay in connected durable mode (default)
- **When** the relay receives a valid browser event
- **Then** the event is written to `.debugbundle/local/browser-relay-spool/` before cloud forwarding
- **And** if cloud forwarding fails, the spool file is retained for retry

### AC-REL-08: Rate Limiting
- **Given** a relay with default rate limit (60 req/min per IP)
- **When** a single IP sends 61 requests within one minute
- **Then** the 61st request returns `429 Too Many Requests`

### AC-REL-09: Wire Format Alignment
- **Given** a browser event written to `.debugbundle/local/events/` by the relay
- **When** the file is inspected
- **Then** the filename follows `<timestamp>-<sequence>-<service>.events.json` convention
- **And** the file contains a valid JSON array of event envelopes
- **And** the format is identical to files written by the Node SDK file transport

### AC-REL-10: Static-Only Direct Delivery Unchanged
- **Given** a static-only site with `debugbundle.init({ projectToken: '...', service: 'marketing' })`
- **When** a `frontend_exception` occurs
- **Then** the browser SDK sends directly to DebugBundle cloud (no relay involved)
- **And** the `Authorization` header includes the project token

### AC-REL-10a: Static-Only Origin Allowlist
- **Given** a project token created with `allowed_origins: ["https://static.example.com"]`
- **When** the browser SDK sends directly to `POST /v1/events` or calls `GET /v1/sdk/config` with `Origin: https://evil.example.com`
- **Then** the API rejects the request with `403 origin_not_allowed`
- **And** the same request with `Origin: https://static.example.com` is allowed to proceed through normal token, payload, rate-limit, quota, and capture-policy checks
- **And** a request using the same token without an `Origin` header is rejected with `403 origin_not_allowed`
- **And** the dashboard, API, CLI, and MCP project-token creation surfaces can set the same origin allowlist
- **And** the documentation states this is browser abuse reduction only, because non-browser clients can spoof `Origin`

### AC-REL-11: V1 Relay Parity Matrix
- **Given** the shared relay compliance fixtures for a valid browser batch, mixed valid/invalid batch, credential-smuggling payload, wrong-origin request, missing-origin request, oversized body, rate-limit sequence, local-only write, connected durable spool, and connected cloud forwarding
- **When** the Node.js, Python, PHP, and WordPress relay surfaces run their applicable fixture suites
- **Then** all full relay handler surfaces produce equivalent status codes, accepted/rejected counts, sanitized event envelopes, file formats, spool behavior, and cloud-forwarding request shapes
- **And** a server SDK that only exposes callback-based acceptance without built-in local-only, durable spool, and cloud-forwarding delivery is marked as relay foundation rather than full relay handler parity

---

## 26. GitHub Repository Automation Acceptance

### AC-GHA-01: GitHub App Installation
- **Given** a Solo or Team organization owner in the project's GitHub tab
- **When** the owner clicks "Connect GitHub" and completes the GitHub App installation flow
- **Then** a `github_installations` record is created with status `active`
- **And** the available repositories are listed for selection

### AC-GHA-02: Primary Repo Assignment
- **Given** a project with an active GitHub App installation
- **When** the owner selects a repository as the project's primary repo
- **Then** a `project_github_repos` record is created linking the project to that repo
- **And** only one repo can be assigned per project (UNIQUE constraint on `project_id`)

### AC-GHA-03: Dispatch Rule Creation
- **Given** a project with an assigned primary repo
- **When** the owner creates a dispatch rule with event types `[bundle.created]`, severity_min `high`, and cooldown 300s
- **Then** a `github_dispatch_rules` record is persisted
- **And** the rule is returned in the dispatch rules list

### AC-GHA-04: Default Rule Preset
- **Given** a project where a repo is being assigned for the first time
- **When** the repo assignment completes
- **Then** DebugBundle offers a default rule preset: `event_types: [bundle.created, bundle.reopened]`, `severity_min: high`, `incident_status: new_or_reopened`, `cooldown_seconds: 300`

### AC-GHA-05: Dispatch On Incident Lifecycle Event
- **Given** a project with an assigned repo and an enabled dispatch rule matching `bundle.created` with `severity_min: high`
- **When** a new high-severity incident fires `bundle.created`
- **Then** the worker evaluates the matching rule
- **And** a delivery record is persisted with status `pending`
- **And** a `repository_dispatch` is sent to the assigned repo with `event_type: "debugbundle.incident"`
- **And** the `client_payload` contains `debugbundle_event`, `incident_id`, `improvement_id`, `severity`, `title`, `links`, and a nested `debugbundle.dispatch_id`
- **And** the delivery record status is updated to `delivered`
- **And** `delivered` means GitHub accepted the dispatch request, not that a receiving workflow completed

### AC-GHA-06: Cooldown Enforcement
- **Given** a dispatch rule with `cooldown_seconds: 300`
- **When** the same incident fingerprint triggers a dispatch within 300 seconds of the last dispatch
- **Then** the duplicate dispatch is skipped
- **And** no new delivery record is created

### AC-GHA-07: Filter Evaluation Parity
- **Given** a dispatch rule with `environments: ["production"]` and `severity_min: "high"`
- **When** a `bundle.created` event fires for environment `staging` with severity `medium`
- **Then** the rule does not match
- **And** the same filter evaluation function used for webhook delivery produces the same result

### AC-GHA-08: Installation Token Caching
- **Given** a GitHub App installation with a cached access token in Redis (TTL 50 min)
- **When** a dispatch is needed within the cache window
- **Then** the cached token is reused without calling GitHub's token exchange API

### AC-GHA-09: Retry On Failure
- **Given** a dispatch delivery that failed with a transient GitHub error
- **When** the retry schedule fires (1s → 5s → 30s → 2min → 10min)
- **Then** the delivery is retried up to 5 times
- **And** after 5 failed attempts the delivery status is `failed`
- **And** the rule is NOT auto-disabled

### AC-GHA-10: Rate Limiting
- **Given** a project that has sent 100 dispatches in the current hour
- **When** the 101st dispatch is triggered
- **Then** the dispatch is dropped and logged
- **And** the delivery history shows a non-retryable `skipped` rate-limit warning

### AC-GHA-11: Installation Lifecycle — Suspended
- **Given** an active GitHub App installation
- **When** GitHub sends `installation.suspend` to `POST /v1/github/app/webhook`
- **Then** the installation status is updated to `suspended`
- **And** dispatches are paused for all projects using this installation
- **And** the project GitHub tab shows a "GitHub connection lost" warning

### AC-GHA-12: Installation Lifecycle — Removed
- **Given** an active GitHub App installation
- **When** GitHub sends `installation.deleted` to `POST /v1/github/app/webhook`
- **Then** the installation status is updated to `removed`
- **And** automation rules for affected projects are disabled

### AC-GHA-13: Delivery History
- **Given** a project with dispatch deliveries
- **When** an authorized project member views the project GitHub tab → Delivery History
- **Then** each delivery shows rule name, target title, timestamp, status, attempt count, and last error
- **And** failed deliveries show the HTTP status code from GitHub
- **And** a "Retry" button is available on failed deliveries

### AC-GHA-14: Free Tier Gating
- **Given** a Free-tier project
- **When** any collaborator navigates to the project's GitHub tab
- **Then** the integration panel shows an upgrade prompt
- **And** no GitHub App connection, repo assignment, or dispatch rules can be created

### AC-GHA-15: Shared Project Plan Gating
- **Given** a shared project owned by a Solo or Team account
- **And** the acting collaborator's own personal account plan is Free
- **When** the collaborator opens that shared project's GitHub automation surface
- **Then** GitHub automation remains available for the shared project
- **And** the collaborator can create a new dispatch rule when the project already has a connection and assigned repository
- **And** the collaborator cannot change the GitHub connection, change the assigned repository, or edit/delete rules created by someone else

### AC-GHA-16: Interface Parity
- **Given** any GitHub automation management operation (installation status, repo assignment, rule CRUD, delivery history, retry)
- **When** the operation is performed
- **Then** it is available through API, CLI, and MCP
- **And** all three interfaces call the same domain services

### AC-GHA-17: Dispatch Payload Stability
- **Given** a `repository_dispatch` sent by DebugBundle
- **When** the receiving workflow inspects `client_payload`
- **Then** the payload matches the documented stable contract
- **And** `client_payload.debugbundle.dispatch_id` is globally unique per delivery attempt for deduplication

### AC-GHA-18: Self-Host GitHub App
- **Given** a self-hosted DebugBundle deployment with custom `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` environment variables
- **When** the operator completes GitHub App setup
- **Then** dispatch rule evaluation, delivery, and retry logic is identical to cloud
- **And** no code paths differ between cloud and self-host

### AC-GHM-01: Marketplace Purchase Tracking
- **Given** a configured GitHub Marketplace webhook
- **When** GitHub sends a `marketplace_purchase` webhook with action `purchased`
- **Then** DebugBundle verifies the webhook signature
- **And** persists the Marketplace account, plan, action/status, effective date, and installation ID when present
- **And** records the GitHub delivery ID so the webhook is idempotent

### AC-GHM-02: Marketplace Cancellation Does Not Mutate Stripe Entitlements
- **Given** a DebugBundle organization with normal Stripe-backed billing fields
- **When** GitHub sends a `marketplace_purchase` webhook with action `cancelled`
- **Then** the Marketplace purchase snapshot is updated to `cancelled`
- **And** the organization's Stripe-derived billing tier and entitlement fields are not changed by Marketplace webhook processing

### AC-GHM-03: Marketplace Record Links On Installation Connection
- **Given** a stored GitHub Marketplace purchase snapshot with `installation_id = 42`
- **When** that GitHub App installation is later linked to a DebugBundle organization through the normal installation completion flow
- **Then** the stored Marketplace purchase snapshot is linked to that organization for attribution and export
