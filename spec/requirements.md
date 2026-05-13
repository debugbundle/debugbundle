# Requirements — DebugBundle

Version: v1
Last updated: 2026-03-27

---

## 1. Functional Requirements

### 1.1 SDK Capture

> **Repo note:** Node.js and Browser SDK packages (`@debugbundle/sdk-node`, `@debugbundle/sdk-browser`) along with `@debugbundle/shared-types` and `@debugbundle/redaction` live in the JS SDK monorepo: `github.com/debugbundle/debugbundle-js`.

**FR-SDK-01:** Provide a Node.js backend SDK (`@debugbundle/sdk-node`) supporting Express, Fastify, and Next.js API routes.

**FR-SDK-02:** Provide a browser SDK (`@debugbundle/sdk-browser`) supporting vanilla browser apps and remaining compatible with popular frontend frameworks and routing models, including React, Next.js client-side, Vue, Angular, Svelte, and SPA route change capture.

**FR-SDK-14:** Provide a Python backend SDK (`debugbundle-python`) supporting Django, Flask, and FastAPI.

**FR-SDK-15:** Provide a PHP backend SDK (`debugbundle/sdk-php`) supporting Laravel (middleware) and Symfony (event subscriber).

**FR-SDK-03:** Backend SDK must capture: unhandled exceptions, explicitly captured exceptions, request metadata (method, path, route template, headers sanitized, body sanitized/truncated), response status/duration, correlation/trace/request IDs, structured logs, service identity, deploy/version metadata.

**FR-SDK-04:** Browser SDK must capture: route changes, clicks, sanitized form submissions, console logs, network request summaries, frontend exceptions, lightweight DOM context near the error. Non-exception captures (route changes, clicks, console logs, network summaries) are breadcrumbs — by default they are held in a local ring buffer and only shipped alongside a `frontend_exception` (see FR-SDK-24).

**FR-SDK-05:** SDKs must emit eight normalized event types: `backend_exception`, `request_event`, `log_event`, `frontend_breadcrumb`, `frontend_exception`, `deploy_metadata`, `error_suppressed` (aggregate), `probe_event` (diagnostic). The first six are signal events; `error_suppressed` is an operational aggregate emitted by duplicate suppression (see FR-SDK-09); `probe_event` is a diagnostic event emitted by activated probes (see FR-PRB-01).

**FR-SDK-06:** SDKs must implement local buffering with batched delivery (browser: ≥10 events or 3s; Node: ≥50 events or 2s).

**FR-SDK-07:** Browser SDK must flush on `pagehide`, `visibilitychange` using `navigator.sendBeacon()` with `fetch(keepalive)` fallback.

**FR-SDK-08:** Node SDK must flush on `SIGINT`, `SIGTERM`, `beforeExit`.

**FR-SDK-09:** SDKs must implement local duplicate suppression: send first 3 identical events normally, suppress duplicates in 30s window, emit aggregate summary events.

**FR-SDK-10:** SDKs must implement loop protection (>10 identical errors in 2s → immediate suppression mode). Recovery: suppression resets after 60 seconds of silence (no matching errors). During sustained suppression, emit a checkpoint aggregate every 30 seconds. All suppression state is in-memory only — resets on process restart.

**FR-SDK-11:** SDKs must auto-detect environment details: language, framework, runtime version, environment name, deployment target.

**FR-SDK-12:** SDK minimal initialization must be short enough for both humans and AI agents to add safely.

**FR-SDK-13:** SDKs must support configurable sampling (0.0–1.0) to control the fraction of events captured. Default: 1.0 (capture all). Sampling applies before network transmission to reduce overhead.

**FR-SDK-22:** Browser SDK must inject `X-DebugBundle-Trace-Id` header (UUID v4) into all outgoing `fetch`/`XMLHttpRequest` requests. Backend SDKs must read this header and attach the trace ID to all events from that request. If header is absent, backend events are ungrouped from frontend — no failure.

**FR-SDK-16:** All backend SDKs must implement the universal SDK interface: `init`, `captureException`, `captureError` (alias), `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`. Method names must follow language-idiomatic conventions (camelCase for Node/PHP, snake_case for Python).

**FR-SDK-17:** All backend SDKs must support vanilla language hooks — hooking into the language’s native error, exception, and logging mechanisms with zero framework dependency:
- **Node.js:** `captureExceptions()` (process uncaughtException), `captureRejections()` (process unhandledRejection), `captureConsole()` (console.error/warn wrapping, opt-in).
- **PHP:** `captureErrors()` (set_error_handler), `captureExceptions()` (set_exception_handler), `captureShutdown()` (register_shutdown_function for fatal errors).
- **Python:** `capture_exceptions()` (sys.excepthook), `capture_logging()` (logging module handler, opt-in), `capture_async()` (asyncio loop exception handler).
- **Browser:** Global error listener (window error event), promise rejection listener (unhandledrejection), optional console wrapping.

**FR-SDK-18:** Log capture must be in-process via logging library handler/transport plugins — never by reading log files. The DebugBundle handler sits alongside existing handlers (file, stdout). Logs are captured as structured records (level, message, context, timestamp), not raw text.

**FR-SDK-19:** SDKs must support configurable log level filtering via `logLevel` init config (default: `"warning"`). Events below the configured level are silently discarded.

**FR-SDK-20:** SDKs must auto-detect installed logging libraries on `init()` and offer to register DebugBundle handlers automatically:
- **Node.js:** Detect pino, winston, bunyan via `require.resolve`.
- **PHP:** Detect Monolog via Composer autoload.
- **Python:** Detect structlog, loguru via import check.

**FR-SDK-21:** Framework integrations must auto-register log capture alongside error/request capture. A single `init()` call (or service provider registration) should be sufficient — zero explicit log configuration required for the default case.

**FR-SDK-23:** Browser SDK must maintain a fixed-size ring buffer for breadcrumbs (clicks, route changes, network summaries, console entries). Default capacity: 10 entries. When the buffer is full, the oldest entry is discarded. The ring buffer is local memory only — never persisted independently.

**FR-SDK-24:** Browser SDK must operate in breadcrumbs-on-error-only mode by default. Breadcrumbs accumulate in the ring buffer continuously but are only flushed to the ingestion API when a `frontend_exception` is captured. Breadcrumbs are shipped as context alongside the error event, not as standalone `frontend_breadcrumb` events. Configurable via `breadcrumbsOnErrorOnly` init option (default: `true`). When set to `false`, breadcrumbs are batched and shipped independently (existing batching rules apply).

**FR-SDK-25:** Browser SDK must support per-event-type capture toggles: `captureNetwork`, `captureClicks`, `captureRouteChanges`, `captureConsole`. Each toggle independently enables/disables its breadcrumb type. Defaults: `captureNetwork: true`, `captureClicks: true`, `captureRouteChanges: true`, `captureConsole: false` (opt-in).

**FR-SDK-26:** Browser SDK must support network request filtering via `networkFilter` init option. Configurable dimensions: URL pattern allow/deny list (string or regex), status code filter (default: only capture 4xx/5xx responses), response time threshold (only capture requests slower than N ms). Requests not matching the filter are silently excluded from the breadcrumb ring buffer.

**FR-SDK-27:** Browser SDK must support session-based sampling via `sessionSampleRate` (0.0–1.0, default: `1.0`). The sampling decision is made once per session (on session start) and applies to the entire session — either the full user journey is captured or nothing is. This is independent of the global `sampleRate` (which applies per-event). Both rates must pass for an event to be captured.

**FR-SDK-28:** Browser SDK must enforce a max events per session cap via `maxEventsPerSession` (default: `100`). After the cap is reached, only `frontend_exception` events are still captured and shipped (breadcrumbs stop accumulating). The cap resets on new session. This prevents runaway browser tabs from consuming ingestion quota.

**FR-SDK-29:** Browser SDK must collect device and browser metadata on `init()` and attach it to all outgoing frontend event payloads as a `device` field. Collected data: raw user agent string (`navigator.userAgent`), parsed browser name/version (prefer `navigator.userAgentData` with `navigator.userAgent` fallback), parsed client OS name/version, device type classification (`desktop`/`mobile`/`tablet`/`unknown`), screen resolution (`screen.width` × `screen.height`), viewport size (`window.innerWidth` × `window.innerHeight`), device pixel ratio (`window.devicePixelRatio`), touch capability (`navigator.maxTouchPoints`), language/locale (`navigator.language`), network connection type (`navigator.connection.effectiveType` when available), and color scheme preference (`prefers-color-scheme` media query). Collection is a one-time snapshot on `init()` — values are not live-updated. Unavailable fields are set to `null`. No fine-grained hardware identifiers (GPU model, serial numbers) are collected. Device context is subject to the same redaction rules as all other captured data. The bundle generation pipeline populates `context.device` from `frontend_exception` device data.

**FR-SDK-30:** Deferred until further notice. After v1 hardening and validation are complete, provide a Go backend SDK (`github.com/debugbundle/debugbundle-go`) supporting net/http middleware, Gin middleware, and Echo middleware. Must implement the universal SDK interface with Go-idiomatic naming (`Init`, `CaptureException`, `CaptureError`, `CaptureLog`, `CaptureRequest`, `CaptureMessage`, `SetContext`, `Flush`, `Probe`). Must use `context.Context` for per-request correlation, support panic recovery via `recover()`, and keep performance overhead low with minimal allocations.

**FR-SDK-31:** Deferred until further notice. After v1 hardening and validation are complete, provide a Ruby backend SDK (`debugbundle` on RubyGems) supporting Rails (Railtie + middleware), Rack middleware, and Sidekiq server middleware. Must implement the universal SDK interface with Ruby-idiomatic naming (`init`, `capture_exception`, `capture_error`, `capture_log`, `capture_request`, `capture_message`, `set_context`, `flush`, `probe`). Must support background job context capture alongside web request capture.

**FR-SDK-32:** Mobile SDKs (Kotlin Android, Swift iOS, React Native) must inject `X-DebugBundle-Trace-Id` into outgoing HTTP requests using platform-native mechanisms: OkHttp interceptor for Kotlin, `URLSession` delegate or `URLProtocol` subclass for Swift, fetch wrapper for React Native. Trace IDs must correlate mobile client events with backend events captured by backend SDKs.

**FR-SDK-33:** Mobile SDKs must support offline event queueing with deferred delivery. Events captured while the device is offline must be persisted to local storage, timestamped at capture time, and delivered with retry and backoff when connectivity resumes. Offline-captured events must correlate correctly with backend events via shared trace IDs where applicable.

**FR-SDK-34:** Mobile SDKs must collect extended device context on `init()` and attach it to all outgoing event payloads. Collected data must include: app version, build number, release channel, OS name/version, device model, device manufacturer, screen resolution, locale, timezone, network connection type, battery level (where available), and available storage (where available). Collection extends the browser SDK's `device` schema with mobile-specific fields rather than introducing new event types.

**FR-SDK-35:** Wave 2 backend SDKs (Java, C#, Kotlin server, Rust) must implement the universal SDK interface with language-idiomatic naming conventions and at minimum one first-class framework integration each: Spring Boot (Java), ASP.NET Core (C#), Ktor (Kotlin server), Axum + Actix Web (Rust). See `spec/sdk-language-targets.md` for per-language guidance and `contracts/sdk-interface.md` for the full interface contract.

### 1.1a Probes (Always-On Diagnostic Context + Remote Investigation)

**FR-PRB-01:** All SDKs must expose a `probe(label, data)` method. In always-on mode (default, all tiers), the call serializes, redacts, and stores the data in a per-label ring buffer in SDK memory. When an error occurs (`backend_exception`, `frontend_exception`), all probe ring buffers are flushed alongside the error event to ingestion. When a remote activation matches the label (paid tiers only), the data is also emitted as a `probe_event` immediately (standard batching). Ring buffer defaults: max 50 labels, max 10 entries per label. New labels beyond `maxProbeLabels` are silently dropped. Oldest entries discarded when buffer is full.

**FR-PRB-02:** Backend SDKs must support a lazy variant: `probe(label, () => data)`. In always-on mode, the callback IS invoked (data is needed for the ring buffer). Backend SDKs must also support a `heavy` option: `probe(label, () => data, { heavy: true })`. Heavy probes are dormant in always-on mode (zero cost) and only fire when remotely activated (paid tiers). Browser SDKs do not support lazy or heavy variants.

**FR-PRB-03:** Probe labels support dot-notation hierarchy (e.g., `checkout.pricing.tax`). All labeled probes buffer in always-on mode regardless of label pattern. Remote activation (Solo+) can target a specific label, a prefix wildcard (`checkout.*`), or all probes (`*`).

**FR-PRB-04:** Backend SDKs must poll `GET /v1/sdk/config` to discover active remote probe directives (paid tiers only). Default poll interval: 60 seconds. When probes are remotely activated, the server reduces the interval to 15 seconds. SDKs must use `ETag`/`If-None-Match` for efficient polling (304 on no change). On poll failure, cached config stands. On `expires_at` reached, SDK deactivates locally without waiting for next poll. Browser SDKs must NOT poll periodically — they receive remote probe directives via: (a) a single `GET /v1/sdk/config` request on `init()` (CDN-edge-cached), and (b) `probe_directives` field piggybacked on `POST /v1/events` responses. Free-tier SDKs never poll (no remote activation available).

**FR-PRB-05:** Always-on probes (ring buffer + error-flush) are available on all tiers. Remote activation is a paid-tier feature (Solo+): activation API returns 403 for Free-tier projects, `probe()` on Free tier buffers locally and flushes on error but never ships independently. Probe remote activations are created via `POST /v1/projects/{id}/probes/activate` (member token required, paid plan required). Each activation has a mandatory TTL (max 3600 seconds). Activations can be scoped by service and/or environment. Max 5 concurrent activations per project.

**FR-PRB-06:** Probe events are NOT fingerprinted or grouped into incidents. They are diagnostic context. If a probe event shares a `trace_id` or falls within the same time window + service as an incident's events, it is attached to the bundle as `context.probe_data[]`. The `activation_id` field is `null` for always-on flushes and contains the activation ID for remote-activated events.

**FR-PRB-07:** Probe events are subject to the same rate limits (NFR-SCALE-02), redaction rules, and retention policies as all other events.

**FR-PRB-08:** Browser SDK probe ring buffers are separate from the breadcrumb ring buffer. Both flush on error. When remotely activated (paid tiers), browser probe events bypass `maxEventsPerSession` cap (same exception as `frontend_exception`). Probe events respect `sessionSampleRate`.

**FR-PRB-09:** The `GET /v1/sdk/config` response must be CDN-edge-cacheable with `Cache-Control: public, s-maxage=30`. The response is project-scoped (identical for all SDK instances in the same project + service + environment). Probe activate/deactivate API calls must purge the CDN cache for the affected project. The `POST /v1/events` response must include a `probe_directives` field for paid-tier projects with active remote probes (omitted otherwise).

**FR-PRB-10:** Remote probe activations must support an optional **trigger token** mechanism for direct, single-request probe activation (paid tiers only). When a probe is remotely activated, the API response includes a `trigger_token` (prefixed `dbundle_probe_`). The token is HMAC-SHA256 signed, scoped to the activation's labels, service, and environment, and has its own independent TTL. The activation request accepts an optional `trigger_ttl_seconds` (max 86400 / 24 hours, defaults to `ttl_seconds` when omitted). This allows the trigger token to remain valid long after the passive activation expires — critical when sharing a diagnostic link with an end user who may not click it immediately. The trigger token can be attached to a specific HTTP request via query parameter `_debug_probe` or header `X-DebugBundle-Probe-Trigger`. The SDK validates the trigger token locally (signature + expiry check) without making an additional API call. When a valid trigger token is present, the SDK activates matching probes for that single request/session only (independent shipping), in addition to normal always-on ring buffer behavior.

**FR-PRB-11:** Browser SDKs must strip the `_debug_probe` query parameter from the URL bar after reading (via `history.replaceState`). Trigger tokens delivered via header are consumed silently. Trigger tokens are single-use per request context — they do not persist across requests or page navigations.

**FR-PRB-12:** SDKs must expose ring buffer configuration options: `maxProbeLabels` (default: 50), `maxProbeEntriesPerLabel` (default: 10), `probeFlushOnError` (default: true).

### 1.2 Ingestion API

**FR-ING-01:** `POST /v1/events` — accept batched event payloads, authenticate project token, validate event envelope, apply schema checks.

**FR-ING-02:** Reject oversized or malformed payloads with explicit error responses.

**FR-ING-03:** Persist raw event payloads to object storage (path: `raw-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz`).

**FR-ING-04:** Enqueue processing work (normalization, grouping, bundle generation) asynchronously.

**FR-ING-05:** The ingestion API must remain lightweight — no heavy synchronous processing in the request path.

**FR-ING-06:** Support frontend-only deployments (browser SDK → ingestion API directly). Requires CORS headers, public project token model, per-token rate limiting, and optional origin restrictions.

### 1.3 Processing Pipeline

**FR-PROC-01:** Normalize incoming events: standardize field names, normalize runtime/framework names, trim noisy stack frames, redact unsafe fields, coerce missing fields to `null`, map to canonical event types.

**FR-PROC-02:** Group events into incidents using fingerprint: SHA-256 of canonical JSON (stable key ordering) composed of normalized error class, canonicalized message, top N application stack frames, route template, HTTP method/status, and environment. See FR-GRP-01 through FR-GRP-09 for full grouping requirements.

**FR-PROC-03:** Fingerprinting must avoid including dynamic IDs.

**FR-PROC-04:** Generate deterministic debug bundles for the same underlying dataset.

**FR-PROC-05:** Generate best-effort reproduction artifacts: curl, HTTPie, JSON spec.

**FR-PROC-06:** Process jobs: `group-incident`, `build-bundle`, `build-reproduction`, `deliver-webhook`, `cleanup-retention`.

**FR-PROC-07:** All processing jobs must be idempotent.

### 1.4 Grouping & Incident Lifecycle

**FR-GRP-01:** Normalization pipeline must apply: (a) route template normalization — replace dynamic path segments (UUIDs, numeric IDs, encoded tokens) with `{param}` placeholders, (b) message canonicalization — strip volatile values (UUIDs, emails, timestamps, IP addresses, hex strings) from error messages before fingerprinting, (c) stack frame selection — extract top N application frames (skip library/vendor frames), (d) path normalization — strip `node_modules/`, `vendor/`, `site-packages/`, `.venv/` and similar from frame paths.

**FR-GRP-02:** Rolling frequency counters must track incident occurrence rates across 1-minute, 5-minute, 1-hour, and 24-hour sliding windows. Counters are Redis-backed (volatile) with periodic snapshot to Postgres for durability.

**FR-GRP-03:** Spike detection: when `occurrences_5m / max(baseline_1h, 1) >= 3.0`, mark the incident as spiking, set `spike_detected_at`, and trigger `incident.spike_detected` webhook. The 3.0 threshold is a global default for V1.

**FR-GRP-04:** Regression detection: when a new event matches the fingerprint of a `resolved` incident, transition the incident to `regressed` status, set `regressed_at`, regenerate the bundle, and fire `bundle.reopened` webhook. If the regression occurs within 24 hours of a deploy, correlate with the deploy metadata.

**FR-GRP-05:** Incident state transitions — V1 uses three states:
- `open` — created on first event, receiving events
- `resolved` — explicitly resolved by user action
- `regressed` — new event arrived for a resolved incident

**FR-GRP-06:** Bundle refresh thresholds: regenerate the bundle at the 1st, 3rd, and 10th occurrence, when new deploy metadata is attached, when a new context type (e.g., first frontend_breadcrumb for a backend-only incident) is added, or when reproduction confidence changes.

**FR-GRP-07:** Occurrence sampling: store full event detail in S3-compatible object storage for the first occurrence, the most recent occurrence, the first occurrence after each deploy, and the highest-severity occurrence. Store summary-only records for remaining occurrences to bound storage costs.

**FR-GRP-08:** Explainability: the grouping pipeline must return a `matched_fields` list for each event assignment (e.g., `["error_type", "normalized_message", "route_template", "top_3_frames"]`) so operators can understand why events grouped together.

**FR-GRP-09:** Fingerprint versioning: every incident must carry a `fingerprint_version` field indicating which algorithm version produced the fingerprint. When the algorithm changes, new incidents use the new version; existing incidents retain their version until explicitly re-fingerprinted.

### 1.5 Bundle System

**FR-BND-01:** Bundles must follow the bundle schema (see `/contracts/data-schemas.md`).

**FR-BND-02:** Support two bundle types: `failure` and `improvement`.

**FR-BND-03:** Bundle generation must be deterministic for the same source data.

**FR-BND-04:** Bundles must be stored as compressed artifacts in object storage (`bundles/{project_id}/{incident_id}/bundle.json.gz`).

**FR-BND-05:** Reproduction artifacts stored at `reproductions/{project_id}/{incident_id}/reproduction.json.gz`.

**FR-BND-06:** Reproduction must include `possible`, `confidence` (0-1), `reason`, and `artifacts` fields.

**FR-BND-07:** Reproduction confidence must always be explicit. Never imply guaranteed reproducibility when confidence is low.

**FR-BND-10:** One active bundle per incident. When significant new events arrive for an existing incident, the bundle is regenerated (not appended). A version counter increments on each regeneration (v1, v2, v3). `bundle.updated` webhook fires on regeneration. Retention cleanup deletes the incident + all associated bundles + reproduction artifacts atomically. No historical bundle snapshots in V1 — only the latest bundle is kept.

**FR-BND-08:** Improvement bundle generation is available at all tiers. Free tier: user/agent triggers local analysis via `debugbundle analyze` using local bundles + profile + codebase (agent uses own LLM). Team tier: cloud generates improvement bundles automatically on every ingested event with full incident history and cross-deploy trend analysis.

**FR-BND-09:** `debugbundle analyze [--type failure|improvement|performance] [--local]` generates analysis bundles locally by reading `.debugbundle/bundles/local/`, `profile.json`, and relevant source code. Output follows the standard bundle schema. The skill layer provides structured analysis recipes (schemas + examples) that any AI agent can follow.

### 1.6 Retrieval API

**FR-RET-01:** `GET /v1/incidents` — list/filter incidents (project_id, environment, service, status [open/resolved/regressed], severity, limit, cursor).

**FR-RET-02:** `GET /v1/incidents/{id}` — incident metadata.

**FR-RET-03:** `POST /v1/incidents/{id}/resolve` — explicitly resolve an incident for the authenticated organization member, persist `resolved_at` and resolver attribution, and return the updated incident record.

**FR-RET-04:** `GET /v1/incidents/{id}/bundle` — full debug bundle. Return `{"status": "pending"}` if still processing, `{"status": "failed", "reason": "..."}` if generation failed.

**FR-RET-05:** `GET /v1/incidents/{id}/reproduction` — reproduction artifact.

**FR-RET-06:** `GET /v1/services` — list services for a project.

**FR-RET-07:** Incident retrieval responses must include denormalized `project_name` and `service_name` values so API/CLI/MCP/web clients do not need follow-up lookups to render incident lists or detail views.

**FR-RET-08:** All API responses must be JSON, versioned, with explicit nulls, stable field names, ISO timestamps, redaction markers.

### 1.7 Webhook System

**FR-WHK-01:** Support multiple webhooks per project with independent filters.

**FR-WHK-02:** Webhook event types: `bundle.created`, `bundle.updated`, `bundle.reopened`, `bundle.resolved`, `verification.passed`, `verification.failed`, `improvement_bundle.created`, `incident.spike_detected`.

**FR-WHK-03:** Webhook filters must support: event type, bundle type, severity, service, environment, verification vs non-verification.

**FR-WHK-04:** Webhook payloads must be signed (shared secret, HMAC).

**FR-WHK-05:** Retry on transient failures: 5 retries with exponential backoff (1s → 5s → 30s → 2min → 10min). After final failure: delivery status = `failed`. Auto-disable webhook after 50 consecutive failures (status = `disabled`, owner notified via email). Manual retry available via API and CLI.

**FR-WHK-06:** Delivery states: pending, delivered, retrying, failed, disabled.

**FR-WHK-07:** Webhook CRUD via API (`POST/GET/PATCH/DELETE /v1/webhooks`), CLI (`debugbundle webhook list/create/update/delete/test/deliveries`), and MCP.

**FR-WHK-08:** Test delivery support (synthetic payload, event replay, verification event).

### 1.8 Alert System

**FR-ALT-01:** Alert channels: email, Slack, Discord, webhook.

**FR-ALT-02:** Alert conditions: new incident, incident regressed, error spike (FR-GRP-03), severity threshold, regression after deploy (FR-GRP-04).

**FR-ALT-03:** Configurable via CLI and API.

### 1.9 CLI

**FR-CLI-01:** Core commands: `login`, `whoami`, `setup`, `connect`, `ingest`, `watch`, `process`, `clean`, `incidents`, `inspect`, `resolve`, `reopen`, `bundle`, `reproduce`, `logs`, `services`, `analyze`, `token project list/create/revoke`, `token member list/create/revoke`, `webhook list/create/update/delete/test/deliveries/retry`, `alert list/create/update/delete`, `weekly-report list/create/update/delete`, `capture-policy get/set`, `project list/create/update/delete`, `probe activate/list/deactivate`, `member list/invites/invite/cancel-invite/update-role/remove`, `billing get/capacity increase/capacity schedule-reduction/capacity cancel-reduction`.

**FR-CLI-02:** Setup commands: `doctor`, `validate`, `validate --fix`, `verify local`, `verify cloud`, `smoke`. `verify cloud --trigger-5xx` must actively prove hosted ingestion by sending a synthetic 5xx `request_event` through the real ingestion endpoint, confirming incident visibility, and reporting bundle status.

**FR-CLI-03:** Profile commands: `profile validate`, `profile show`, `profile sync`.

**FR-CLI-04:** All commands must support human-readable output and `--json` for machine-readable output.

**FR-CLI-05:** Exit codes: 0 (success), 1 (general failure), 2 (auth/config error), 3 (resource not found), 4 (validation error).

**FR-CLI-06:** CLI auth must support three bootstrap paths that all converge on the same stored member-token state in `~/.debugbundle/auth.json`: (a) direct member-token login, (b) GitHub device flow via `debugbundle login --github` / `--github-device`, and (c) GitHub CLI token bootstrap via `debugbundle login --github-cli` when `gh` is already authenticated. No dashboard dependency for daily operations.

**FR-CLI-06a:** `debugbundle login` with no explicit auth mode must offer an interactive auth chooser in TTY sessions, covering GitHub auto mode, explicit GitHub device flow, and manual member-token entry. When `--json` is used or the terminal is non-interactive, `debugbundle login` must remain explicit and fail with a validation error instead of prompting.

**FR-CLI-06b:** `debugbundle connect` must detect missing local member auth and, in interactive TTY sessions, invoke the same login bootstrap before resuming the connection workflow. In non-interactive or `--json` mode it must not prompt and must fail with actionable auth guidance.

**FR-CLI-07:** `doctor` must detect installed SDKs across project runtimes and report coverage (which runtimes are instrumented, which are missing).

**FR-CLI-08:** Setup follows a four-stage lifecycle: Discover (detect language, framework, deployment target) → Configure (install SDK, add config, register project) → Validate (check local correctness) → Verify (prove end-to-end works).

**FR-CLI-09:** `doctor` checks: detected language/framework, backend SDK installed, browser SDK installed, project token found, required env vars present, ingestion API reachable, sample event sendable, redaction config present.

**FR-CLI-10:** `validate --fix` may safely: add missing config stubs, update example env files, write starter ignore/redaction config, add missing initialization snippets. Must never silently overwrite user code — all changes reported.

**FR-CLI-11:** `debugbundle-ndjson` is the canonical structured interchange format for zero-install CLI log capture. Any runtime, script, sidecar, log shipper, or unsupported language may emit newline-delimited DebugBundle event records in this format for `debugbundle ingest` and `debugbundle watch`.

**FR-CLI-12:** CLI log parsing must be implemented through a shared parser registry package, not embedded directly inside CLI command modules. Each first-party parser must implement the same contract: input text plus project profile in, `EventEnvelope[]` out.

**FR-CLI-13:** Backend language support planning must provide at least one zero-install CLI path per supported ecosystem: either (a) a first-party parser for a common existing server log format, or (b) documented transformation into `debugbundle-ndjson`. This requirement does not apply to browser-only SDK support.

**FR-CLI-14:** First-party CLI parsers must remain packaged, composable, and registry-driven so the CLI can grow format coverage without pushing parser-specific business logic back into `apps/cli`. External plugin loading is deferred until after the parser contract is stable.

### 1.10 MCP Server

**FR-MCP-01:** Expose tools: `list_incidents`, `get_incident`, `resolve_incident`, `reopen_incident`, `get_bundle`, `get_reproduction`, `get_logs`, `doctor`, `validate`, `verify_local`, `verify_cloud`, `smoke`, `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`, `list_webhook_deliveries`, `retry_webhook_delivery`, `list_project_tokens`, `create_project_token`, `revoke_project_token`, `list_member_tokens`, `create_member_token`, `revoke_member_token`, `list_alerts`, `create_alert`, `update_alert`, `delete_alert`, `list_weekly_report_channels`, `create_weekly_report_channel`, `update_weekly_report_channel`, `delete_weekly_report_channel`, `list_services`, `analyze`, `get_capture_policy`, `update_capture_policy`, `activate_probe`, `list_active_probes`, `deactivate_probe`, `list_projects`, `create_project`, `update_project`, `delete_project`, `get_billing_summary`, `increase_capacity`, `schedule_capacity_reduction`, `cancel_capacity_reduction`, `list_members`, `list_member_invites`, `invite_member`, `cancel_member_invite`, `update_member_role`, `remove_member`.

**FR-MCP-02:** MCP must be a thin adapter over the same domain services used by CLI/API.

**FR-MCP-03:** MCP responses must be deterministic, compact, machine-readable, redaction-aware, and consistent with CLI/API results. `verify_cloud` must accept `trigger5xx` so agents can run the same active hosted 5xx proof path as `debugbundle verify cloud --trigger-5xx`.

### 1.11 Web App

**FR-WEB-01:** Signup/login/logout plus session-aware account bootstrap using first-party auth, with passwordless email-code auth and GitHub sign-in in V1.

**FR-WEB-02:** Billing management (Stripe).

**FR-WEB-03:** Project/team settings, token management, webhook settings, and browser email-code verification/trust-gating flows.

**FR-WEB-04:** Intentionally minimal — no heavy dashboard in V1.

**FR-WEB-05:** Web auth must use first-party server-issued session cookies. The SPA must not require browser-stored member-token auth for normal interactive use.

### 1.11a Billing Sync

**FR-BIL-01:** Stripe is the authoritative source of truth for recurring paid entitlements. DebugBundle must persist a derived entitlement snapshot for enforcement without using incremental capacity-credit logic.

**FR-BIL-02:** Extra capacity entitlements must be derived from current valid subscription quantity and status, and persisted as an absolute value on the organization.

**FR-BIL-03:** Billing event processing must be idempotent and safe under retries and out-of-order delivery.

**FR-BIL-04:** Successful renewal, payment failure, downgrade warning, downgrade confirmation, and capacity-change confirmation emails are mandatory billing lifecycle notifications.

**FR-BIL-05:** A dedicated Stripe webhook sync path and a separate support/admin override path must exist; the admin path is for controlled exceptions and must not become the primary recurring-billing source of truth.

See `/spec/billing.md` and `/spec/system-emails.md` for the detailed source-of-truth design.

**FR-WEB-06:** Google sign-in is explicitly deferred until post-V1. Any social-auth expansion after GitHub must preserve the same first-party session-cookie model and must not introduce browser-stored long-lived bearer auth.

**FR-WEB-06:** UI primitives must be shadcn-based, reusable, support dark and light themes from the start, and consume icons through a shared wrapper layer.

### 1.12 Auth & Identity

**FR-AUTH-01:** Account → Projects → Members hierarchy. Account is billing/ownership unit.

**FR-AUTH-02:** Three identity classes: human users, agent members, project runtime identities.

**FR-AUTH-03:** Three auth artifacts: User Sessions (web interactive use), Project Tokens (SDK write, project-scoped), and Member Tokens (CLI/API/MCP read/manage).

**FR-AUTH-04:** Browser auth: first-party passwordless email-code flow for both signup and login, plus GitHub OAuth. Redeeming a valid email code creates the account when needed, creates the browser session, and marks the email as verified. Verified email is required before first member token creation in the web app and before enabling billing or inviting members.

**FR-AUTH-05:** Agent-assisted signup flow supported (agent orchestrates, human completes trust step).

**FR-AUTH-06:** Two roles in V1: **Owner** (billing, invite/remove members, create/delete projects, manage all tokens, all data access) and **Member** (all data access including incidents/bundles/services, manage webhooks/alerts for projects, cannot manage billing or invite members). Fine-grained RBAC deferred to Enterprise.

**FR-AUTH-07:** Agents modeled as project members (no separate permissions model).

**FR-AUTH-08:** Anti-abuse: email-code verification (see FR-AUTH-04), rate limiting (see NFR-RATE-*), signup throttling, and CAPTCHA on browser email-code requests.

**FR-AUTH-09:** Invite model: owners can invite members by email. Invited identity accepts via link. Agent members may be added via direct token generation without email invite.

**FR-AUTH-10:** V1 project access: all organization members have access to all organization projects. Per-project scoping deferred to Enterprise.

**FR-AUTH-11:** Member-authorized API operations must accept either a valid browser session or a valid member token. After principal resolution, both auth paths must run through the same authorization and domain logic.

**FR-AUTH-12:** CLI and MCP must reuse member-token auth through the API. The SPA must use cookie-backed sessions. SDK ingestion must use project tokens only.

**FR-AUTH-13:** GitHub CLI bootstrap must be additive, not a replacement for browser auth. The existing email-code and browser GitHub session flows remain the primary interactive path for humans without GitHub accounts or without local CLI access.

**FR-AUTH-14:** GitHub device flow must be server-mediated: the CLI talks to DebugBundle, DebugBundle talks to GitHub, and successful approval must result in a normal DebugBundle member token issuance rather than a separate credential type.

### 1.13 Email System

**FR-EMAIL-01:** Transactional emails only: email sign-in codes, security alerts, billing events, invites.

**FR-EMAIL-02:** Provider abstraction (interface) with AWS SES as the default provider and support for alternate transports behind the same interface.

**FR-EMAIL-03:** Sender addresses: `noreply@`, `notifications@`, `security@` at debugbundle.com.

**FR-EMAIL-04:** DNS: SPF, DKIM, DMARC required.

**FR-EMAIL-05:** Free plan: minimal operational email (webhook failures → daily digest only). Paid plans (Solo+): configurable operational alerts.

**FR-EMAIL-06:** Email templates must use simple HTML with plain-text fallback. React email optional for future enhancement. No marketing template systems.

**FR-EMAIL-07:** Anti-spam guardrails: throttle repeated notifications, use digest emails instead of frequent sends, prioritize webhook/Slack over email for operational alerts. Critical emails (email sign-in codes, security alerts) must not silently fail.

### 1.14 Project Profile

**FR-PROF-01:** `.debugbundle/profile.json` — structured architectural description (v1 schema: profile_version, project, services, infrastructure, critical_paths, repo, developer_workflows, debugbundle).

**FR-PROF-02:** Generated during `debugbundle setup` via two-phase profile generation: (1) **Static detection** — `setup` scans the repository using deterministic file analysis (package.json, pyproject.toml, composer.json, docker-compose.yml, CI configs, workspace configs) to auto-populate languages, frameworks, services, infrastructure, and build commands. This produces a usable profile immediately without any agent. Profile carries a `validation_status` field (`static-analysis-only` or `agent-validated`). (2) **Agent enrichment** — the `.agents/skills/debugbundle/SKILL.md` includes a "Profile Validation" task that teaches any AI agent to deepen the profile (critical paths, route ownership, service boundaries, architectural context). The agent can run this immediately after setup or at any later time.

**FR-PROF-03:** `.debugbundle/local/connection.json` — delivery policy per environment, cloud connection metadata.

**FR-PROF-04:** `.agents/skills/debugbundle/` — agent skill per agentskills.io spec (SKILL.md with YAML frontmatter, references/, assets/, evals/).

**FR-PROF-05:** `.debugbundle/bundles/` — local bundle artifacts organized by origin (`local/` for locally processed, `cloud/` for cloud-fetched cache). `.debugbundle/local/events/` — raw SDK file-transport events. `.debugbundle/local/state.json` — processing watermark.

**FR-PROF-06:** Profile validation via `debugbundle profile validate`.

**FR-PROF-07:** Profile exists for all tiers; Team tier uses it for deeper cloud-automated analysis.

**FR-PROF-08:** `debugbundle setup` must update or create a DebugBundle-specific section in the repository's `AGENTS.md` if it exists, pointing to `.agents/skills/debugbundle/SKILL.md`.

**FR-PROF-09:** The Project Profile must be updated when relevant architecture changes occur (new service, deployment target change, database change, critical path ownership change, build/test command change). `debugbundle doctor` should warn when `last_reviewed_at` exceeds a staleness threshold and report `validation_status`.

**FR-PROF-10:** `debugbundle setup` must generate `.agents/skills/debugbundle/SKILL.md` per the agentskills.io specification that teaches AI agents how to: use the DebugBundle CLI/MCP, fetch and analyze bundles, run reproduction artifacts, validate the project profile, and auto-trigger DebugBundle workflows when the user reports a bug or issue.

**FR-PROF-11:** The agent skill is placed at `.agents/skills/debugbundle/` following the agentskills.io specification. Old locations (`.debugbundle/skill/`, `skills/debugbundle/`) are removed.

**FR-PROF-12:** The AGENTS.md section written by `debugbundle setup` must instruct agents to: (a) check DebugBundle for existing incidents before investigating bugs, (b) read `.agents/skills/debugbundle/SKILL.md` for the full debugging workflow, (c) use `debugbundle inspect` / MCP `get_bundle` when a user reports an issue, (d) run reproduction artifacts from `.debugbundle/bundles/local/reproductions/` before proposing a fix, (e) invoke `debugbundle doctor` to validate local setup when debugging connectivity issues.

### 1.15 Verification System

**FR-VER-01:** Local verification: send synthetic event → confirm ingestion → confirm bundle generation → confirm CLI retrieval.

**FR-VER-02:** Production verification: confirm deployed instrumentation is alive (synthetic tagged events, passive verification, webhook/alert verification).

**FR-VER-03:** Synthetic events clearly marked with `verification: true`, `verification_type` field.

**FR-VER-04:** `debugbundle smoke` — lightweight end-to-end check for CI/deployment hooks.

### 1.16 Documentation

**FR-DOC-01:** Documentation is a first-class product interface (human and machine-readable).

**FR-DOC-02:** Machine-readable artifacts: OpenAPI spec, JSON schema for bundle/webhooks, CLI JSON output schema, MCP tool schema.

**FR-DOC-03:** Documentation versioned alongside product (docs/v1/, docs/v2/).

**FR-DOC-04:** `llms.txt` for LLM/agent discovery.

**FR-DOC-05:** Documentation types: Concept Docs, API Reference, CLI Reference, Webhook Reference, MCP Reference. Each type must follow its own structural template.

**FR-DOC-06:** Documentation must be generated from source where possible (API routes → OpenAPI, webhook payloads → JSON schema, CLI commands → command definitions). Prevent documentation drift.

**FR-DOC-07:** Documentation examples must be validated automatically against their schemas (API examples match OpenAPI, webhook examples match JSON schema, CLI examples execute successfully).

**FR-DOC-08:** Repository must include example bundle artifacts (`examples/bundle.failure.json`, `examples/bundle.improvement.json`) for agent and developer reference.

**FR-DOC-09:** Documentation must include a dedicated agent workflows section explaining automation patterns (e.g., webhook → fetch bundle → analyze → open PR, support ticket → activate probe with trigger token → share link with user → capture diagnostic data on reproduction).

**FR-DOC-10:** The public marketing, docs, and blog surface must ship as a single statically exported Next.js app. Docs must live under `/docs`, blog must live under `/blog`, Fumadocs must power both content surfaces, and the final build must be deployable to S3 + CloudFront with no Node.js server requirement.

**FR-DOC-11:** The static public site must preserve SEO-friendly behavior via standard Next.js metadata, sitemap, robots, canonical URLs, and clean route structure while allowing distinct layouts for marketing/legal pages, `/docs`, and `/blog`.

### 1.18 Onboarding & Installation

**FR-ONB-01:** Installation documentation must offer two paths: (a) **Agent-driven** — provide a ready-made prompt/instruction the user gives to their AI agent, which then runs `debugbundle setup` to detect runtimes, install SDKs, generate scaffold, create agent skill, and configure transport; (b) **Manual** — traditional step-by-step CLI commands. See `/spec/local-first-onboarding.md`.

**FR-ONB-02:** The agent-driven installation path must result in the agent: installing the SDK package, running `debugbundle setup`, reviewing the generated profile, and optionally validating it — so the agent has full context of what DebugBundle is and how to use it. `debugbundle setup` is the single entrypoint for both humans and agents. `debugbundle init` is an internal function, not a user-facing command.

**FR-ONB-03:** After setup (either path), documentation must include a "Step 2" ready-made prompt that teaches the agent to read `.agents/skills/debugbundle/SKILL.md`, understand the project profile, and activate DebugBundle workflows (auto-check incidents on bug reports, use bundles for debugging).

**FR-ONB-04:** The `.agents/skills/debugbundle/SKILL.md` must follow the agentskills.io specification with YAML frontmatter and progressive disclosure. Must be discoverable by all major AI agent frameworks (GitHub Copilot, Cursor, Cline, Claude Code, custom MCP clients). No protocol coupling — skill files are plain Markdown with structured sections.

**FR-ONB-05:** `debugbundle setup` must support local-only mode (no cloud account required) as the default starting point. Cloud connection via `debugbundle connect` is an upgrade path. See `/spec/local-first-onboarding.md` for the full onboarding flow.

**FR-ONB-06:** `debugbundle setup` must manage `.gitignore` entries for `.debugbundle/local/events/`, `.debugbundle/local/state.json`, and `.debugbundle/bundles/`.

### 1.17 Weekly Reporting

**FR-RPT-01:** Weekly email/Slack report of bundles generated (by type).

### 1.18a Event Classification & Capture Policy

> This section defines the authoritative event classification model, per-tier capture defaults, billing semantics, project-level capture presets, and surfacing rules. It supersedes any prior assumptions about flat per-event billing.

#### Event Classes

All eight canonical event types (FR-SDK-05) are assigned to one of three event classes:

| Event Class | Event Types | Purpose |
|---|---|---|
| **A — Incident Signals** | `backend_exception`, `frontend_exception`, qualifying `log_event` (`error`/`fatal`/`critical`), first-party `request_event` matching the preset-specific immediate request-failure set (`minimal`: 5xx only; `balanced`: 5xx plus 408/423/424/425/429; `investigative`: balanced plus 409) | Events that create or materially update incidents. The primary product value. |
| **B — Context Signals** | `request_event` values outside the preset-specific immediate request-failure set (as request snapshot), `frontend_breadcrumb`, non-incident-eligible `log_event`, `deploy_metadata`, probe data flushed alongside errors | Events that enrich an incident but do not independently create one. Context travels with the incident. |
| **C — Operational Signals** | `error_suppressed`, standalone `probe_event` | Events that exist to operate the platform, not to represent user-facing failures. |

**FR-EVT-01:** Every event persisted through ingestion must carry an `event_class` classification (`incident_signal`, `context_signal`, or `operational_signal`). Classification is determined at the worker normalization stage based on event type and project capture policy.

**FR-EVT-02:** Free tier billing must primarily meter Class A (incident signal) events. Class B and Class C events must not count against the primary `monthly_raw_ingested_events` allowance on Free. On paid tiers (Solo, Team), all remotely ingested events count against the allowance regardless of class.

**FR-EVT-03:** The worker must only create or materially update incidents directly from Class A events, except for the explicit request-anomaly path. Class B events attach as context to existing incidents (via `trace_id` or time-window correlation), but contextual `request_event` records may also open or update a `request_failure` incident when a preset-enabled repeated-request anomaly threshold fires without mutating the stored event's `event_class`. Class C events are stored for operational visibility but never create incidents.

#### Capture Presets

**FR-EVT-04:** Each project must have a `capture_preset` field with one of three values: `minimal`, `balanced`, or `investigative`. The preset determines default capture behavior per event type.

| Preset | Goal | Exceptions | Logs | Request Events | Breadcrumbs | Probe Events |
|---|---|---|---|---|---|---|
| `minimal` | Protect quota, capture only real failures | On | Error+ only | Immediate failures: 5xx only | Local ring buffer + exception flush only | Buffer-only |
| `balanced` | Default hosted behavior | On | Warning+ | Immediate failures: 5xx plus 408/423/424/425/429 | Local ring buffer + exception flush only | Paid-tier only |
| `investigative` | Short-term deep debugging | On | Info+ | Immediate failures: balanced set plus 409, with optional broader request capture via overrides | Optional standalone | Paid-tier only |

**FR-EVT-05:** Free tier projects must default to `minimal` preset. Solo projects default to `balanced`. Team projects default to `balanced`. Presets are changeable by the project owner via API, CLI, MCP, and web app (interface parity per INV-5).

**FR-EVT-06:** Each project may override individual capture dimensions beyond the preset via advanced controls:
- `capture_logs`: `off | warning | error | info`
- `capture_request_events`: `off | failures_only | filtered | all`
- `capture_breadcrumbs`: `local_only | exception_only | standalone`
- `capture_probe_events`: `buffer_only | standalone_when_activated`

Advanced controls are optional. When unset, the preset's defaults apply. The `capture_preset` field and advanced controls together form the **project capture policy**.

**FR-EVT-07:** SDKs must respect the project capture policy. The `GET /v1/sdk/config` response must include the resolved capture policy so SDKs can gate event emission client-side. When the SDK's local config conflicts with the server-side policy, the more restrictive setting wins.

**FR-EVT-08:** The ingestion API must enforce plan-level capture rules server-side. If a project sends event types disallowed by its capture policy (e.g., standalone `request_event` with `response_status: 200` on a `minimal` Free project), the API must reject those events with a structured reason (`capture_policy_rejected`) rather than silently accepting and billing them. First-party request events in the preset-specific immediate request-failure set are incident-critical and must be accepted even when `capture_request_events` is narrowed; 5xx request failures are immediate under every preset.

**FR-EVT-08a:** Browser SDK network capture must promote first-party `fetch`/`XMLHttpRequest` responses that match the preset-specific immediate request-failure set to standalone `request_event` payloads while still retaining the corresponding `network_request` breadcrumb for timeline context. First-party means same-origin/relative URL or a URL matched by trace-propagation allowlist. Under `minimal`, this means 5xx only; under `balanced`, this adds 408/423/424/425/429; under `investigative`, this further adds 409. When the effective `capture_request_events` mode keeps request failure context (`failures_only` or `all`), first-party browser responses in the active preset's request-anomaly set must also emit standalone `request_event` context signals so repeated failures can cross the worker anomaly threshold. Other first-party browser responses outside the current preset's immediate or anomaly set remain breadcrumb/context captures unless separately reported through an explicit request-event API.

**FR-EVT-08b:** The worker must support a thin request-anomaly evaluator for repeated contextual first-party request failures without reclassifying the underlying normalized events. Request anomaly detection is disabled for `minimal`, enabled for selected statuses under `balanced`, and enabled with lower thresholds under `investigative`. The initial thresholds are: `balanced` uses `count >= 20 in 5m` plus `5m/1h ratio >= 3.0` for `401/403/404/409/422`, `count >= 50 in 5m` plus `ratio >= 5.0` for `400/410`; `investigative` uses `count >= 8 in 5m` plus `ratio >= 2.0` for `400/401/403/404/409/410/422`.

**FR-EVT-08c:** When a request anomaly threshold fires, the worker must enqueue a deterministic incident-grouping path keyed by project, service, environment, normalized route template, HTTP method, and response status. The resulting incident must surface as `request_failure` through existing retrieval, bundle, CLI, MCP, and web incident flows while preserving the source `request_event` rows as `context_signal` records.

#### Surfacing Rules

**FR-EVT-09:** Default user-facing surfacing must follow event class:
- **Class A** (incident signals): Always visible in incident list, bundles, and alerts.
- **Class B** (context signals): Visible only as incident context (bundle context blocks, request snapshots, breadcrumb trails). Never shown as standalone primary inventory items by default.
- **Class C** (operational signals): Hidden from normal user inventory. Available in advanced/internal views only.

#### Free Tier Default Policy (Canonical)

**FR-EVT-10:** The canonical Free tier capture policy is:
- Incident creation: `backend_exception`, `frontend_exception`, qualifying `error`/`fatal`/`critical` `log_event`, and first-party 5xx `request_event`.
- Standalone `request_event` ingestion: 5xx failures only by default; non-5xx request snapshots are rejected unless policy is widened.
- Request context capture: Keep request snapshot attached to exception incidents as context.
- Standalone `frontend_breadcrumb` ingestion: Off by default.
- Breadcrumb handling: Local ring buffer only, shipped with `frontend_exception` (existing FR-SDK-24 default).
- `log_event` handling: Error+ only with conservative rate limits.
- `deploy_metadata` handling: On, excluded from primary event billing.
- `error_suppressed` handling: On, excluded from primary event billing.
- `probe_event` handling: Buffer-only on Free; no standalone probe ingestion.

This ensures Free behaves as **failure-first, not telemetry-first**.

---

### 1.12 Browser Relay

**FR-REL-01:** The Node.js SDK must provide a browser relay handler as subpath exports (`@debugbundle/sdk-node/relay`, `@debugbundle/sdk-node/relay/express`, `@debugbundle/sdk-node/relay/fastify`, `@debugbundle/sdk-node/relay/nextjs`) that accepts browser-originated events via a same-origin `POST /debugbundle/browser` endpoint on the user's own backend.

**FR-REL-02:** The relay handler must validate incoming payloads against a strict schema, accepting only known browser event types: `frontend_exception`, `error_suppressed`, `frontend_breadcrumb`, `request_event`, `probe_event`. Unknown event types and unknown fields must be rejected/stripped.

**FR-REL-03:** The relay handler must enforce origin validation by checking the `Origin` header (fallback: `Referer`) against a configurable allowlist. Default: same-origin derived from the request's `Host` header. Requests with missing or non-matching origins must be rejected with `403`.

**FR-REL-04:** The relay handler must enforce `Content-Type: application/json` on all requests. Requests without this content type must be rejected to ensure browsers trigger CORS preflight, preventing simple cross-origin form submissions.

**FR-REL-05:** The relay handler must enforce a hard 256 KB limit on request body size. Requests exceeding this limit must be rejected with `413`.

**FR-REL-06:** The relay handler must strip or override trust-sensitive fields from browser payloads: `project_token` (never trust from browser), `sdk_name` (forced to `@debugbundle/sdk-browser`), `organization_id` (never accept from browser). Browser-owned fields must be preserved: `correlation.trace_id`, `service`, `environment` (unless relay has explicit overrides), `occurred_at`, `payload`.

**FR-REL-07:** The relay handler must apply per-IP rate limiting. Default: 60 requests per minute per IP. Configurable via `rateLimitPerMinute` option. Requests exceeding the limit must return `429`.

**FR-REL-08:** In local-only mode (Node SDK `projectMode: "local-only"`), the relay must write validated browser events to `.debugbundle/local/events/` using the same atomic file transport and naming convention as the Node SDK file transport (`<timestamp>-<sequence>-<service>.events.json`).

**FR-REL-09:** In connected mode, the relay must default to durable delivery: write browser events to `.debugbundle/local/browser-relay-spool/` before forwarding to DebugBundle cloud. Spool files survive cloud failures for retry/manual recovery. A `durableWrite: false` option enables low-latency forwarding without local spool.

**FR-REL-10:** The relay must implement credential isolation: the browser must never send DebugBundle cloud credentials. The relay attaches `project_token` and auth headers server-side when forwarding to cloud. For local-only relay, no cloud credentials are needed.

**FR-REL-11:** The browser SDK must determine its transport mode from the `endpoint` configuration value. A relative path (e.g., `/debugbundle/browser`) triggers relay mode with no `Authorization` header. An absolute URL triggers direct-to-cloud mode with `projectToken`. No `endpoint` + `projectToken` defaults to direct-to-cloud. No `endpoint` + no `projectToken` disables the SDK.

**FR-REL-12:** `debugbundle process` must handle browser-originated event files in `.debugbundle/local/events/` identically to backend-originated files. Cross-context `trace_id` correlation must link browser and backend events into the same incident bundle.

**FR-REL-13:** Connected relay spool retention: delivered spool files pruned after 24 hours (default). Undelivered spool files retained for 7 days (default, configurable). `debugbundle doctor --check-relay` must report undelivered spool file counts and ages.

**FR-REL-14:** `debugbundle setup` must detect backend frameworks (Express, Fastify, Next.js) and scaffold the relay route when the user's project includes both backend and browser SDKs.

### 1.19 GitHub Repository Automation

**FR-GHA-01:** Support connecting a DebugBundle organization to a GitHub App installation. The GitHub App model (not OAuth token reuse) is the only supported connection method for repository automation.

**FR-GHA-02:** Store GitHub App installation records with `installation_id`, `account_login`, `account_type`, and lifecycle status (`active`, `suspended`, `removed`). Each installation is scoped to one DebugBundle organization.

**FR-GHA-03:** Handle GitHub App installation lifecycle callbacks (`installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`) at `POST /v1/github/app/webhook`, verified by HMAC-SHA256 using the App webhook secret.

**FR-GHA-04:** Allow each DebugBundle project to assign exactly one primary GitHub repository from the repositories available to the organization's GitHub App installation. Enforce `UNIQUE` on `project_id`.

**FR-GHA-05:** Support CRUD operations for GitHub dispatch automation rules per project. Each rule specifies: `name`, `enabled`, `event_types` (array of lifecycle event types), `environments`, `services`, `severity_min`, `bundle_type`, `incident_status` (`new_only`, `reopened_only`, `new_or_reopened`), and `cooldown_seconds` (default 300, minimum 60).

**FR-GHA-06:** Reuse the existing webhook filter evaluation pipeline for GitHub dispatch rule matching. The shared filter evaluation function must be used by both webhook delivery and GitHub dispatch rules to prevent filter behavior divergence.

**FR-GHA-07:** On incident lifecycle events, the worker must evaluate matching GitHub dispatch rules, enforce cooldown per `incident_fingerprint + rule_id`, persist a delivery record, and enqueue a `github-dispatch` job.

**FR-GHA-08:** The worker must obtain GitHub App installation access tokens by signing a JWT with the App private key, exchanging it via `POST /app/installations/{id}/access_tokens`, and caching the token in Redis with a 50-minute TTL.

**FR-GHA-09:** The worker must send `repository_dispatch` events to the project's assigned repository via `POST /repos/{owner}/{repo}/dispatches` with `event_type: "debugbundle.incident"` and a `client_payload` containing summary fields and API links (no full bundle data).

**FR-GHA-10:** The dispatch `client_payload` must follow the stable payload contract: `debugbundle_event`, `incident_id`, `project_id`, `bundle_type`, `bundle_version`, `severity`, `service`, `environment`, `title`, `occurrence_count`, `first_seen_at`, `links` (bundle, reproduction, dashboard), `dispatch_id`, `dispatched_at`. Fields may be added but never removed or renamed without a major version bump.

**FR-GHA-11:** Persist dispatch delivery history with: `rule_id`, `project_id`, `incident_id`, `incident_fingerprint`, `status` (`pending`, `delivered`, `failed`, `retrying`), `attempt_count`, `last_error`, `github_status_code`, and `dispatch_payload`.

**FR-GHA-12:** Implement retry strategy for failed dispatches: 1s → 5s → 30s → 2min → 10min (5 attempts). After 5 failed attempts, mark delivery as `failed`. Do not auto-disable rules.

**FR-GHA-13:** Enforce rate limits: maximum 100 dispatches per project per hour, maximum 4,000 dispatches per installation per hour. Respect GitHub `429`/`503` responses with `Retry-After` or exponential backoff.

**FR-GHA-14:** When a user connects a repo for the first time, offer a default automation rule preset: `event_types: [bundle.created, bundle.reopened]`, `severity_min: high`, `incident_status: new_or_reopened`, `cooldown_seconds: 300`.

**FR-GHA-15:** Provide delivery history UI in the web app's project GitHub tab, including rule name, incident title, timestamp, status, attempt count, last error, and a "Retry" button for failed deliveries.

**FR-GHA-16:** If the GitHub installation becomes suspended or removed, show a "GitHub connection lost" banner in the project GitHub tab with a "Reconnect" action.

**FR-GHA-17:** Enforce tier gating: GitHub automation (App connection, repo assignment, dispatch rules, delivery history, manual retry) is available on Solo and Team tiers only. Free-tier projects see an upgrade prompt.

**FR-GHA-18:** All GitHub automation management operations must be available through API, CLI, and MCP (INV-5 interface parity). Member token or browser session required; project tokens rejected.

**FR-GHA-19:** Self-hosted deployments must support custom GitHub App configuration via environment variables (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`).

---

## 2. Non-Functional Requirements

### 2.1 Performance

**NFR-PERF-01:** SDK overhead must be minimal — no synchronous blocking, bounded memory for event queues, graceful drop under backpressure.

**NFR-PERF-02:** Ingestion API must be lightweight and fast — accept, persist, enqueue, return.

**NFR-PERF-03:** Bundle generation should complete within reasonable time for normal incident sizes.

### 2.2 Reliability

**NFR-REL-01:** SDKs must never break the host application. SDK internal failures must be caught and degraded safely.

**NFR-REL-02:** Fail visibly, not silently. Prefer degraded operation over total failure.

**NFR-REL-03:** Processing jobs must be idempotent with bounded retries, deduplication, dead-letter/failed-job visibility.

**NFR-REL-04:** Health endpoints: `/health`, `/ready`, `/live` — machine-readable.

**NFR-REL-05:** Billing provider failures must not break debugging workflows.

**NFR-REL-06:** Email provider failures must not block bundle generation or retrieval.

**NFR-REL-07:** Self-host: strong startup validation, clear log messages, health endpoints, doctor/validate commands.

### 2.3 Security

**NFR-SEC-01:** TLS in transit (HTTPS only). SDKs must reject non-TLS endpoints in production mode.

**NFR-SEC-02:** Encryption at rest for database and object storage.

**NFR-SEC-03:** Automatic redaction of sensitive fields: password, token, secret, api_key, authorization, cookie, card data, personal identifiers.

**NFR-SEC-04:** SDK-level privacy controls: configurable header/body capture, custom redaction fields, form value masking by default.

**NFR-SEC-05:** Tokens: hashed at rest, shown once, rotatable, revocable, scoped, distinguishable by prefix (`dbundle_proj_`, `dbundle_mem_`, `dbundle_probe_`).

**NFR-SEC-06:** Sensitive auth material must never be stored in plaintext.

**NFR-SEC-07:** Login rate limiting, suspicious login monitoring.

**NFR-SEC-08:** Object storage access restricted via signed credentials.

**NFR-SEC-09:** No internal stack traces or secrets exposed to clients.

**NFR-SEC-10:** Config environment-driven; no hard-coded credentials.

**NFR-SEC-11:** Audit logging for security-related events (token creation/revocation, login attempts, config changes).

### 2.4 Scalability

**NFR-SCALE-01:** V1 architecture must scale reasonably without becoming an observability-company architecture. Avoid premature Kafka, ClickHouse, OpenSearch, Kubernetes.

**NFR-SCALE-02:** Rate limiting (Redis sliding window, `429` + `Retry-After`):

| Scope | Free | Solo | Team | Key |
|-------|------|---------|------|-----|
| Ingestion | 1,000 events/min | 5,000 events/min | 10,000 events/min | Per project token |
| Retrieval API | 100 req/min | 300 req/min | 500 req/min | Per member token |
| Auth endpoints | 10 req/min | 10 req/min | 10 req/min | Per IP |
| Unauthenticated | 20 req/min | 20 req/min | 20 req/min | Per IP |

Self-hosted deployments have no enforced rate limits (configurable via environment variables). SDKs must handle `429` responses gracefully with exponential backoff (already covered by SDK safety guarantees).

### 2.5 Data Retention

**NFR-RET-01:** Raw events: 7 days (Free), 14 days (Solo), 30 days (Team).

**NFR-RET-02:** Bundles: 7 days (Free), 30 days (Solo), 90 days (Team).

**NFR-RET-03:** Metadata: longer-lived.

**NFR-RET-04:** Retention cleanup jobs must run automatically.

### 2.6 Portability

**NFR-PORT-01:** Framework choices must not imply provider lock-in.

**NFR-PORT-02:** Frontend (`apps/web`) must remain deployable as a static SPA on standard object storage/CDN hosting and must not require a coupled web-runtime backend.

**NFR-PORT-03:** Cloud version and self-host version run the same core services.

### 2.7 Observability

**NFR-OBS-01:** DebugBundle should instrument itself (dogfooding).

**NFR-OBS-02:** Track: ingestion failures, queue backlog, bundle generation failures, webhook delivery failures, auth anomalies.

### 2.8 Schema Evolution

**NFR-SCHEMA-01:** New required fields require schema version bump.

**NFR-SCHEMA-02:** New optional fields may be added without major version break.

**NFR-SCHEMA-03:** Field meanings must not change silently.

**NFR-SCHEMA-04:** Removed fields require schema version bump.
