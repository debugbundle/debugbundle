# Requirements — DebugBundle

Version: v1
Last updated: 2026-07-04

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

**FR-SDK-13a:** SDKs must support an optional synchronous `beforeSend` init hook where the runtime can safely inspect a fully built event before buffering. Returning `null` drops the event locally. Hook failures or invalid returned events must not throw into host code and must preserve the original event. The hook is for app-owned local policy such as final redaction or tenant-specific suppression; project capture rules remain the preferred operational noise-control surface.

**FR-SDK-22:** Browser SDK must inject `X-DebugBundle-Trace-Id` header (UUID v4) into same-origin `fetch`/`XMLHttpRequest` requests and cross-origin first-party requests that match explicit `tracePropagationTargets`. It must not inject trace headers into arbitrary third-party requests by default. Backend SDKs must read this header and attach the trace ID to all events from that request. If header is absent, backend events are ungrouped from frontend — no failure. The browser fetch wrapper must preserve native fetch behavior, including `Request` inputs and all valid `HeadersInit` shapes (`Headers`, header tuple arrays, and header records), so trace injection never drops application headers such as `Authorization`.

**FR-SDK-16:** All backend SDKs must implement the universal SDK interface: `init`, `captureException`, `captureError` (alias), `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`. Method names must follow language-idiomatic conventions (camelCase for Node/PHP, snake_case for Python).

**FR-SDK-17:** All backend SDKs must support vanilla language hooks — hooking into the language’s native error, exception, and logging mechanisms with zero framework dependency:
- **Node.js:** `captureExceptions()` (process uncaughtException), `captureRejections()` (process unhandledRejection), `captureConsole()` (console.error/warn wrapping, opt-in).
- **PHP:** `captureErrors()` (set_error_handler), `captureExceptions()` (set_exception_handler), `captureShutdown()` (register_shutdown_function for fatal errors).
- **Python:** `capture_exceptions()` (sys.excepthook), `capture_logging()` (logging module handler, opt-in), `capture_async()` (asyncio loop exception handler).
- **Browser:** Global error listener (window error event), promise rejection listener (unhandledrejection with bounded `rejection_reason` preservation when the browser exposes a reason), optional console wrapping.

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

**FR-SDK-30:** Provide a Go backend SDK (`github.com/debugbundle/debugbundle-go`) supporting net/http middleware, Gin middleware, and Echo middleware. Must implement the universal SDK interface with Go-idiomatic naming (`Init`, `CaptureException`, `CaptureError`, `CaptureLog`, `CaptureRequest`, `CaptureMessage`, `SetContext`, `Flush`, `Probe`). Must use `context.Context` for per-request correlation, support panic recovery via `recover()`, keep performance overhead low with minimal allocations, and follow the detailed implementation plan in `spec/sdks/go-sdk.md`.

**FR-SDK-31:** Provide a Ruby backend SDK (`debugbundle` on RubyGems) supporting Rails (Railtie + middleware), Rack middleware, and Sidekiq server middleware. Must implement the universal SDK interface with Ruby-idiomatic naming (`init`, `capture_exception`, `capture_error`, `capture_log`, `capture_request`, `capture_message`, `set_context`, `flush`, `probe`). Must support background job context capture alongside web request capture and follow the detailed implementation plan in `spec/sdks/ruby-sdk.md`.

**FR-SDK-32:** Mobile SDKs (Kotlin Android, Swift iOS, React Native) must inject `X-DebugBundle-Trace-Id` into configured first-party outgoing HTTP requests using platform-native mechanisms: OkHttp interceptor for Kotlin, `URLSession` delegate or `URLProtocol` subclass for Swift, fetch wrapper for React Native. Trace IDs must correlate mobile client events with backend events captured by backend SDKs. SDKs must not inject DebugBundle trace headers into arbitrary third-party requests by default.

**FR-SDK-33:** Mobile SDKs must support offline event queueing with deferred delivery. Events captured while the device is offline must be persisted to local storage, timestamped at capture time, and delivered with retry and backoff when connectivity resumes. Offline-captured events must correlate correctly with backend events via shared trace IDs where applicable.

**FR-SDK-34:** Mobile SDKs must collect extended device context on `init()` and attach it to all outgoing event payloads. Collected data must include: app version, build number, release channel, OS name/version, device model, device manufacturer, screen resolution, locale, timezone, network connection type, battery level (where available), and available storage (where available). Collection extends the browser SDK's `device` schema with mobile-specific fields rather than introducing new event types.

**FR-SDK-35:** Wave 2 backend SDKs (Java, C#, Kotlin server, Rust) must implement the universal SDK interface with language-idiomatic naming conventions and at minimum one first-class framework integration each: Spring Boot (Java), ASP.NET Core (C#), Ktor (Kotlin server), Axum + Actix Web (Rust). See `spec/sdk-language-targets.md` for per-language guidance and `contracts/sdk-interface.md` for the full interface contract.

**FR-SDK-36:** Provide a Kotlin Android SDK (`com.debugbundle:debugbundle-android`) supporting Android application/activity/process lifecycle capture, Jetpack Navigation and Navigation Compose breadcrumbs, OkHttp trace injection, offline queueing, WorkManager deferred delivery, Timber log capture, mobile device context, capture policy, probes, and the universal SDK interface with Kotlin-idiomatic naming. The SDK must follow the detailed implementation plan in `spec/sdks/kotlin-sdk.md`.

**FR-SDK-37:** Provide a Swift iOS SDK (`DebugBundle` via Swift Package Manager) supporting UIKit and SwiftUI lifecycle capture, navigation breadcrumbs, URLSession trace injection, offline queueing, SwiftLog capture, mobile device context, capture policy, probes, and the universal SDK interface with Swift-idiomatic naming. The SDK must follow the detailed implementation plan in `spec/sdks/swift-sdk.md`.

**FR-SDK-38:** Provide a React Native SDK (`@debugbundle/sdk-react-native`) targeting iOS and Android with a TypeScript/JavaScript API, Turbo Native Module plus legacy bridge compatibility where needed, React error-boundary capture, React Navigation breadcrumbs, fetch/XMLHttpRequest trace injection, native offline queueing, mobile device context, capture policy, probes, and the universal SDK interface with camelCase naming. The SDK must reuse the native Android and Swift SDK foundations where practical and follow the detailed implementation plan in `spec/sdks/react-native-sdk.md`.

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

### 1.1b Availability Checks

**FR-AVC-01:** DebugBundle must support project-scoped hosted availability checks executed by DebugBundle infrastructure, not by customer SDKs. V1 availability checks support only `GET` and `HEAD` requests against validated external `http`/`https` targets.

**FR-AVC-02:** Availability checks must reuse the existing incident lifecycle, bundle generation, alerting, webhook delivery, CLI, MCP, and project navigation surfaces. When consecutive failures reach `failure_threshold`, DebugBundle opens or regresses one active availability incident for that check. When consecutive successes reach `recovery_threshold`, DebugBundle auto-resolves the linked availability incident.

**FR-AVC-03:** Availability checks must be manageable through API, CLI, MCP, and web using the same domain services. Authorized project members may read checks and retained results. Owner/admin callers may create, update, delete, enable/disable, and test checks. Test execution must be side-effect-free in V1 and must not create incidents or retained history rows.

**FR-AVC-04:** Hosted availability checks must enforce tier limits per project: Free `1` check with minimum `300` second interval, Solo `3` checks with minimum `60` second interval, Team `8` checks with minimum `30` second interval. Checks that exceed current plan limits after downgrade remain visible but pause execution until the project is eligible again.

**FR-AVC-05:** DebugBundle must retain availability-check raw execution results and per-day rollups for at least 30 days, then purge older records. The retained daily rollups must be sufficient to back a future project status-history surface without a schema redesign.

**FR-AVC-06:** The authenticated web app must provide a workspace Health Status page that summarizes retained availability-check status across projects the signed-in member can access. The page must group checks by project, show one compact daily status block for each retained day, expose per-check detail through progressive disclosure, and reuse the existing project Health tab for check management.

### 1.2 Ingestion API

**FR-ING-01:** `POST /v1/events` — accept batched event payloads, authenticate project token, validate event envelope, apply schema checks.

**FR-ING-02:** Reject oversized or malformed payloads with explicit error responses. Requests that declare a body larger than the shared API limit must be rejected before project-token authentication, persistence, or queueing.

**FR-ING-03:** Persist raw event payloads to object storage (path: `raw-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz`).

**FR-ING-04:** Enqueue processing work (normalization, grouping, bundle generation) asynchronously.

**FR-ING-05:** The ingestion API must remain lightweight — no heavy synchronous processing in the request path.

**FR-ING-06:** Support frontend-only deployments (browser SDK → ingestion API directly). Requires SDK-route CORS headers, public write-only project token model, per-token rate limiting, and optional per-token origin restrictions. Origin restrictions are an abuse-reduction control for browsers, not a secret boundary, because non-browser clients can spoof `Origin`.

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

**FR-GRP-10:** Severity inference must preserve high severity for backend exceptions, non-opaque frontend exceptions, and immediate request-failure incident signals. Low-confidence opaque browser-native `frontend_exception` captures must not be stamped high by default: opaque `window_error` signals infer `low`, and opaque `resource_error` signals infer `medium`. `error_suppressed` events infer `medium`; other events infer `low` unless explicitly escalated by a later operator-controlled path.

### 1.5 Bundle System

**FR-BND-01:** Bundles must follow the bundle schema (see `/contracts/data-schemas.md`).

**FR-BND-02:** Support two bundle types: `failure` and `improvement`.

**FR-BND-03:** Bundle generation must be deterministic for the same source data.

**FR-BND-04:** Bundles must be stored as compressed artifacts in object storage (`bundles/{project_id}/{incident_id}/bundle.json.gz`).

**FR-BND-05:** Reproduction artifacts stored at `reproductions/{project_id}/{incident_id}/reproduction.json.gz`.

**FR-BND-06:** Reproduction must include `possible`, `confidence` (0-1), `reason`, and `artifacts` fields.

**FR-BND-07:** Reproduction confidence must always be explicit. Never imply guaranteed reproducibility when confidence is low.

**FR-BND-10:** One active bundle per incident. When significant new events arrive for an existing incident, the bundle is regenerated (not appended). A version counter increments on each regeneration (v1, v2, v3). `bundle.updated` webhook fires on regeneration. Retention cleanup deletes the incident + all associated bundles + reproduction artifacts atomically. No historical bundle snapshots in V1 — only the latest bundle is kept.

**FR-BND-08:** Improvement bundle generation is available at all tiers. Free tier: user/agent triggers local analysis via `debugbundle analyze` using local bundles + profile + codebase (agent uses own LLM). Solo and Team tiers: hosted cloud automation is available for deterministic improvement analysis, controlled by per-project improvement settings and backed by the shared bundle allowance.

**FR-BND-09:** `debugbundle analyze [--type failure|improvement|performance] [--local]` generates analysis bundles locally by reading `.debugbundle/bundles/local/`, `profile.json`, and relevant source code. Output follows the standard bundle schema. The skill layer provides structured analysis recipes (schemas + examples) that any AI agent can follow.

### 1.6 Retrieval API

**FR-RET-01:** `GET /v1/incidents` — list/filter incidents (project_id, environment, service, status [active/open/resolved/regressed], severity, `first_seen_after`, `attention_after`, limit, cursor). `active` means open or regressed incidents. `attention_after` means first opened at or after the supplied timestamp or regressed at or after the supplied timestamp.

Project list/detail metrics must include `attention_incidents_today`, counting incidents first opened today or regressed today, while preserving `opened_incidents_today` as first-opened-only.

`debugbundle incidents` and MCP `list_incidents` must default to the `active` filter. `--status all` / `status: "all"` must remain available to list resolved incidents together with open and regressed incidents.

**FR-RET-02:** `GET /v1/incidents/{id}` — incident metadata.

**FR-RET-03:** `POST /v1/incidents/{id}/resolve` and `POST /v1/incidents/{id}/reopen` — explicitly update one incident lifecycle state for an authenticated caller with access to that project, persist resolver attribution on resolve, clear it on reopen, and return the updated incident record.

**FR-RET-03a:** `POST /v1/incidents/resolve` and `POST /v1/incidents/reopen` — explicitly update multiple incident lifecycle states in one hosted API request. The request body accepts `incident_ids`, rejects empty lists, caps the list at 1000 ids, ignores duplicate ids before execution, returns updated incident records in request order, and preserves the same access checks and side effects as the single-incident routes.

**FR-RET-04:** `GET /v1/incidents/{id}/bundle` — full debug bundle. Return `{"status": "pending"}` if still processing, `{"status": "failed", "reason": "..."}` if generation failed.

**FR-RET-05:** `GET /v1/incidents/{id}/reproduction` — reproduction artifact.

**FR-RET-06:** `GET /v1/services` — list services for a project.

**FR-RET-07:** `GET /v1/improvements` — list/filter hosted improvement opportunities (project_id, environment, service, status [open/resolved/snoozed], severity, kind, limit, cursor). Open request/log candidates that have not crossed their configured generation threshold remain internal counting state and must not appear in default retrieval lists. Common external-probe `GET`/`404` request paths must be excluded from hosted improvement lists. Recurring-incident opportunities appear after their configured incident recurrence threshold is met, while post-deploy regression opportunities may appear immediately.

**FR-RET-08:** `GET /v1/improvements/{id}` plus `POST /v1/improvements/{id}/resolve|reopen` — hosted improvement metadata and lifecycle mutations.

**FR-RET-09:** `GET /v1/projects/{projectId}/improvements/{improvementId}/bundle` — hosted improvement bundle artifact. Return `{"status": "pending"}` if still processing and `{"status": "failed", "reason": "bundle_not_generated_yet"}` when a directly fetched opportunity exists only as below-threshold counting state. Return `{"status": "failed", "reason": "..."}` if generation failed or no artifact is available. Incident-derived improvement opportunities that are covered by existing failure bundles must return `{"status": "failed", "reason": "covered_by_incident_bundle", "related_incident_ids": [...]}` when no standalone improvement artifact exists.

**FR-RET-10:** Incident and improvement retrieval responses must include denormalized `project_name` and `service_name` values so API/CLI/MCP/web clients do not need follow-up lookups to render list or detail views.

**FR-RET-11:** All API responses must be JSON, versioned, with explicit nulls, stable field names, ISO timestamps, redaction markers.

### 1.7 Webhook System

**FR-WHK-01:** Support multiple webhooks per project with independent filters.

**FR-WHK-02:** Webhook event types: `bundle.created`, `bundle.updated`, `bundle.reopened`, `bundle.resolved`, `verification.passed`, `verification.failed`, `improvement_bundle.created`, `incident.spike_detected`.

**FR-WHK-03:** Webhook filters must support: event type, bundle type, severity, service, environment, verification vs non-verification.

**FR-WHK-04:** Webhook payloads must be signed (shared secret, HMAC).

**FR-WHK-05:** Retry on transient failures: 5 retries with exponential backoff (1s → 5s → 30s → 2min → 10min). After final failure: delivery status = `failed`. Auto-disable webhook after 50 consecutive failures (status = `disabled`, owner notified via email). Manual retry available via API and CLI.

**FR-WHK-06:** Delivery states: pending, delivered, retrying, failed, disabled.

**FR-WHK-07:** Webhook CRUD via API (`POST/GET/PATCH/DELETE /v1/webhooks`), CLI (`debugbundle webhook list/create/update/delete/test/deliveries`), and MCP.

**FR-WHK-08:** Test delivery support (synthetic payload, event replay, verification event).

**FR-WHK-09:** Lifecycle webhook deliveries must enforce the shared `monthly_webhook_deliveries` allowance for the owning organization. When exhausted, new lifecycle webhook and synthetic test delivery intents are not created, existing incidents/bundles/history remain accessible, and API-triggered synthetic tests return `429 monthly_quota_exceeded` with `Retry-After`.

### 1.8 Alert System

**FR-ALT-01:** Alert channels: email, Slack, Discord, webhook.

**FR-ALT-02:** Alert conditions: new incident, incident regressed, error spike (FR-GRP-03), severity threshold, regression after deploy (FR-GRP-04).

**FR-ALT-03:** Configurable via API, CLI, and MCP.

**FR-ALT-04:** Severity-threshold alert rules must be able to notify for new incidents, incident regressions, or both. New severity-threshold alert rules default to both lifecycle events.

### 1.9 CLI

**FR-CLI-01:** Core commands: `login`, `whoami`, `setup`, `connect`, `ingest`, `watch`, `process`, `clean`, `incidents`, `inspect`, `resolve`, `reopen`, `bundle`, `reproduce`, `logs`, `services`, `analyze`, `token project list/create/revoke`, `token member list/create/revoke`, `webhook list/create/update/delete/test/deliveries/retry`, `alert list/create/update/delete`, `weekly-report list/create/update/delete`, `capture-policy get/set`, `improvements list/get/bundle/resolve/reopen/snooze`, `improvements settings get/set`, `project list/create/update/delete`, `project members list/invites/invite/cancel-invite/update-role/remove`, `probe activate/list/deactivate`, `billing get/capacity increase/capacity schedule-reduction/capacity cancel-reduction`.

**FR-CLI-02:** Setup commands: `doctor`, `validate`, `validate --fix`, `verify local`, `verify cloud`, `smoke`. `verify cloud --trigger-5xx` must actively prove hosted ingestion by sending a synthetic 5xx `request_event` through the real ingestion endpoint, confirming incident visibility, and reporting bundle status. `verify cloud --trigger-4xx <status>` must run the same hosted proof path for a specific `4xx` status, validate that the status is in `400..499`, and only succeed when the target project configuration promotes that status into immediate incident creation.

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

**FR-MCP-01:** Expose tools: `list_incidents`, `get_incident`, `resolve_incident`, `resolve_incidents`, `reopen_incident`, `reopen_incidents`, `get_bundle`, `get_reproduction`, `get_logs`, `doctor`, `validate`, `verify_local`, `verify_cloud`, `smoke`, `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`, `list_webhook_deliveries`, `retry_webhook_delivery`, `list_project_tokens`, `create_project_token`, `revoke_project_token`, `list_member_tokens`, `create_member_token`, `revoke_member_token`, `list_alerts`, `create_alert`, `update_alert`, `delete_alert`, `list_weekly_report_channels`, `create_weekly_report_channel`, `update_weekly_report_channel`, `delete_weekly_report_channel`, `list_services`, `analyze`, `get_capture_policy`, `update_capture_policy`, `get_improvement_settings`, `update_improvement_settings`, `activate_probe`, `list_active_probes`, `deactivate_probe`, `list_projects`, `create_project`, `update_project`, `delete_project`, `get_billing_summary`, `increase_capacity`, `schedule_capacity_reduction`, `cancel_capacity_reduction`, `list_project_members`, `list_project_member_invites`, `invite_project_member`, `cancel_project_member_invite`, `update_project_member_role`, `remove_project_member`.

**FR-MCP-02:** MCP must be a thin adapter over the same domain services used by CLI/API.

**FR-MCP-03:** MCP responses must be deterministic, compact, machine-readable, redaction-aware, and consistent with CLI/API results. `verify_cloud` must accept `trigger5xx` and `trigger4xxStatus` so agents can run the same active hosted 5xx proof path as `debugbundle verify cloud --trigger-5xx` and the same configured-client-error proof path as `debugbundle verify cloud --trigger-4xx <status>`.

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

**FR-WEB-07:** Project navigation and detail surfaces must expose sharing state clearly for both sides of collaboration. Shared-with-you projects and owner-owned projects that have active collaborators must both render a shared indicator, backed by project payload metadata that distinguishes `private`, `shared_by_you`, and `shared_with_you`.

**FR-WEB-08:** In project settings and collaboration surfaces, role-based visibility must match server authorization: plain members do not see the members-management tab, receive only the resolved capture-policy preview, and do not see destructive settings sections; owner/admin callers receive the corresponding management affordances allowed by their role.

### 1.12 Auth & Identity

**FR-AUTH-01:** Account → Projects → Members hierarchy. Account is billing/ownership unit.

**FR-AUTH-02:** Three identity classes: human users, agent members, project runtime identities.

**FR-AUTH-03:** Three auth artifacts: User Sessions (web interactive use), Project Tokens (SDK write, project-scoped), and Member Tokens (CLI/API/MCP read/manage).

**FR-AUTH-04:** Browser auth: first-party passwordless email-code flow for both signup and login, plus GitHub OAuth. Redeeming a valid email code creates the account when needed, creates the browser session, and marks the email as verified. Verified email is required before first member token creation in the web app and before enabling billing or inviting members.

**FR-AUTH-04a:** Owner-scoped browser account deletion must require two explicit confirmations before any destructive work begins: the exact phrase `Delete my account`, followed by a six-digit email OTP sent to the signed-in account email address. Deletion must fail closed when the phrase is wrong, the OTP is wrong or expired, or email delivery for the OTP is unavailable.
On success, account deletion removes the user identity from every remaining organization membership and shared-project collaboration as part of deleting the user account. If the same user is still the sole owner of a different organization, or still owns any project in a different organization, the delete must be blocked until ownership is transferred or that organization/project is deleted.
DebugBundle must preserve anonymized account-level aggregate usage metrics and required payment/provider-retention records after account deletion while still deleting product/debugging payload data on schedule.

**FR-AUTH-05:** Agent-assisted signup flow supported (agent orchestrates, human completes trust step).

**FR-AUTH-06:** Three effective project roles exist in V1: **Owner** (billing owner, delete project, manage all project resources), **Admin** (manage collaborators, capture policy, shared integrations, and all project-scoped automation resources except project deletion/billing takeover), and **Member** (all project data access plus normal project-scoped writes, but no collaborator management, no capture-policy edits, no shared integration management, and no mutation of another collaborator's project-scoped automation resources). Fine-grained RBAC beyond these role semantics is deferred to Enterprise.

**FR-AUTH-07:** Agents modeled as project members (no separate permissions model).

**FR-AUTH-08:** Anti-abuse: email-code verification (see FR-AUTH-04), rate limiting (see NFR-RATE-*), signup throttling, and CAPTCHA on browser email-code requests.

**FR-AUTH-09:** Project-sharing invite model: project owners and project admins can invite collaborators to a specific project by email. Invited identity accepts via link into their own DebugBundle account. Collaborator roles are `admin` and `member`. Agent members may still be added through direct member-token generation without email invite.

**FR-AUTH-10:** V1 project access is explicit and project-scoped. A user may access a project only when they own it or have an active `project_members` row for it. Shared access must never imply visibility into other projects owned by the same billing account.

**FR-AUTH-10a:** Collaborator-management surfaces are admin-only. Plain members must not be able to list pending invites, invite collaborators, cancel invites, change collaborator roles, remove collaborators, or see the members-management surface in the web app.

**FR-AUTH-10b:** For project-scoped automation resources that members may create in shared projects, including alert rules, webhooks, and GitHub dispatch rules, owner and admin may manage every resource while member-role collaborators may mutate only the resources they created themselves.
When a collaborator is removed from a project or leaves a shared project, DebugBundle must remove only that collaborator's project-scoped automation resources for that project, including alert rules, webhooks, and GitHub dispatch rules. Project resources owned by other collaborators or the project owner must remain.

**FR-AUTH-11:** Member-authorized API operations must accept either a valid browser session or a valid member token. After principal resolution, both auth paths must run through the same authorization and domain logic.

**FR-AUTH-12:** CLI and MCP must reuse member-token auth through the API. The SPA must use cookie-backed sessions. SDK ingestion must use project tokens only.

**FR-AUTH-12a:** Optional project-token browser origin allowlists must be available from the dashboard, API, CLI, and MCP creation surfaces. The allowlist is abuse reduction for direct/static browser ingestion only, rejects requests without a matching `Origin`, and must not be documented or treated as a secret boundary.

**FR-AUTH-13:** GitHub CLI bootstrap must be additive, not a replacement for browser auth. The existing email-code and browser GitHub session flows remain the primary interactive path for humans without GitHub accounts or without local CLI access.

**FR-AUTH-14:** GitHub device flow must be server-mediated: the CLI talks to DebugBundle, DebugBundle talks to GitHub, and successful approval must result in a normal DebugBundle member token issuance rather than a separate credential type.

**FR-AUTH-15:** Successful authentication with an active project token or member token must advance that token's `last_used_at` metadata. Implementations may coalesce writes for frequently used tokens, but a token whose `last_used_at` is `NULL` must be updated on its first successful authentication. Unknown, revoked, and expired tokens must not be marked as used.

### 1.13 Email System

**FR-EMAIL-01:** Transactional and product-critical lifecycle emails only: email sign-in codes, account-deletion OTPs, security alerts, billing events, invites, weekly reports, and mandatory operational owner notifications listed in `/spec/system-emails.md`.

**FR-EMAIL-02:** Provider abstraction (interface) with AWS SES as the default provider and support for alternate transports behind the same interface.

**FR-EMAIL-03:** Sender addresses: `noreply@`, `notifications@`, `security@` at debugbundle.com.

**FR-EMAIL-04:** DNS: SPF, DKIM, DMARC required.

**FR-EMAIL-05:** User-configured operational alert email should stay low-noise: Free uses minimal alert email, and paid plans (Solo+) may add configurable operational alerts. Mandatory system emails from `/spec/system-emails.md`, including allowance and retention notices, apply across tiers.

**FR-EMAIL-06:** Email templates must use simple HTML with plain-text fallback. React email optional for future enhancement. No marketing template systems.

**FR-EMAIL-07:** Anti-spam guardrails: throttle or dedupe repeated system notifications, use digest emails instead of frequent sends for bursty user-configured alert emails, and prioritize webhook/Slack over email for configurable operational alerts. Critical emails (email sign-in codes and security alerts) must not silently fail.

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

**FR-PROF-10:** `debugbundle setup` must generate `.agents/skills/debugbundle/SKILL.md` per the agentskills.io specification that teaches AI agents how to: use the DebugBundle CLI/MCP, fetch and analyze bundles, run reproduction artifacts, validate the project profile, evaluate repeated low-value incidents for scoped capture-rule or path-scoped client-error capture-policy handling, and auto-trigger DebugBundle workflows when the user reports a bug or issue.

**FR-PROF-11:** The agent skill is placed at `.agents/skills/debugbundle/` following the agentskills.io specification. Old locations (`.debugbundle/skill/`, `skills/debugbundle/`) are removed.

**FR-PROF-12:** The AGENTS.md section written by `debugbundle setup` must instruct agents to: (a) check DebugBundle for existing incidents before investigating bugs, (b) read `.agents/skills/debugbundle/SKILL.md` for the full debugging workflow, (c) use `debugbundle inspect` / MCP `get_bundle` when a user reports an issue, (d) run reproduction artifacts from `.debugbundle/bundles/local/reproductions/` before proposing a fix, (e) invoke `debugbundle doctor` to validate local setup when debugging connectivity issues.

**FR-PROF-13:** Generated and portable DebugBundle skills plus MCP/OpenClaw publication metadata must use truthful, capability-first discovery language for runtime error reporting, crash reporting, incident reporting and response, live-app/production monitoring, health checks, debug bundles, and product analytics. Monitoring and observability language must be explicitly scoped to runtime failures, customer-facing incidents, and endpoint health; DebugBundle must not be represented as a generic infrastructure-monitoring platform. The portable source under `apps/mcp/clawhub/debugbundle/` remains shared by ClawHub and Smithery Skills, while MCP package/registry metadata remains suitable for Claude and other MCP clients.

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

**FR-ONB-03:** After setup (either path), documentation must include a "Step 2" ready-made prompt that teaches the agent to read `.agents/skills/debugbundle/SKILL.md`, understand the project profile, and activate DebugBundle workflows when runtime or captured operational evidence is relevant (check incidents for qualifying runtime/production issues, use bundles for debugging, and inspect source/tests first for deterministic local UI, layout, copy, calculation, refactor, or test-only issues).

**FR-ONB-04:** The `.agents/skills/debugbundle/SKILL.md` must follow the agentskills.io specification with YAML frontmatter and progressive disclosure. Must be discoverable by all major AI agent frameworks (GitHub Copilot, Cursor, Cline, Claude Code, custom MCP clients). No protocol coupling — skill files are plain Markdown with structured sections.

**FR-ONB-05:** `debugbundle setup` must support local-only mode (no cloud account required) as the default starting point. Cloud connection via `debugbundle connect` is an upgrade path. See `/spec/local-first-onboarding.md` for the full onboarding flow.

**FR-ONB-06:** `debugbundle setup` must manage `.gitignore` entries for `.debugbundle/local/events/`, `.debugbundle/local/state.json`, and `.debugbundle/bundles/`.

### 1.17 Weekly Reporting

**FR-RPT-01:** Weekly email/Slack report of bundles generated (by type), new incidents, resolved incidents, regressions, and top spiking incidents.

**FR-RPT-02:** Weekly report enablement is project-scoped. Project owner/admin settings must be able to enable or disable email weekly reporting for a project, configure up to 3 recipients, and choose day/hour/timezone.

**FR-RPT-03:** Email weekly reports due for the same recipient set and weekly window should be combined into one email with per-project sections. Slack weekly reports remain project/channel scoped.

**FR-RPT-04:** New projects must create one enabled default email weekly report for the project owner. Browser-created projects use the browser timezone for that default schedule; non-browser creation paths fall back to UTC. A project may have at most one email weekly report channel.

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

**FR-EVT-03:** The worker must only create or materially update incidents directly from Class A events. Class B events attach as context to existing incidents (via `trace_id` or time-window correlation), but unpromoted contextual `request_event` records, including repeated `4xx` responses, must not open or update a normal `request_failure` incident. Class C events are stored for operational visibility but never create incidents.

#### Capture Presets

**FR-EVT-04:** Each project must have a `capture_preset` field with one of three values: `minimal`, `balanced`, or `investigative`. The preset determines default capture behavior per event type.

| Preset | Goal | Exceptions | Logs | Request Events | Breadcrumbs | Probe Events |
|---|---|---|---|---|---|---|
| `minimal` | Protect quota, capture only real failures | On | Error+ only | Immediate failures: 5xx only | Local ring buffer + exception flush only | Buffer-only |
| `balanced` | Default hosted behavior | On | Warning+ | Immediate failures: 5xx plus 408/423/424/425/429 | Local ring buffer + exception flush only | Paid-tier only |
| `investigative` | Short-term deep debugging | On | Info+ | Immediate failures: balanced set plus 409, with optional broader request capture via overrides | Optional standalone | Paid-tier only |

**FR-EVT-05:** New Free, Solo, and Team projects must default to the `balanced` preset. Presets are changeable by the project owner via API, CLI, MCP, and web app (interface parity per INV-5). Existing projects retain their persisted preset across upgrades; changing this default must never rewrite an installed project's policy implicitly.

**FR-EVT-06:** Each project may override individual capture dimensions beyond the preset via advanced controls:
- `capture_logs`: `off | warning | error | info`
- `capture_request_events`: `off | failures_only | filtered | all`
- `capture_breadcrumbs`: `local_only | exception_only | standalone`
- `capture_probe_events`: `buffer_only | standalone_when_activated`
- `immediate_client_error_statuses`: `number[] | null` where `null` means `use preset default`, `[]` means explicit `none`, and values are deduped ascending HTTP `4xx` statuses limited to 12 entries
- `immediate_client_error_path_rules`: `{ status_code: number, path_pattern: string, methods?: string[] }[] | null` where `null` means `use preset default`, `[]` means explicit `none`, values are limited to 25 rules, `status_code` must be `4xx`, `path_pattern` must start with `/` and may use only a terminal `*` wildcard, and `methods` is an optional deduped HTTP method allowlist

Advanced controls are optional. When unset, the preset's defaults apply. The initial preset defaults for `immediate_client_error_statuses` are `[]` for `minimal` and `balanced`, and `[401,403,409,422]` for `investigative`. The initial preset default for `immediate_client_error_path_rules` is `[]` for every preset. The `capture_preset` field and advanced controls together form the **project capture policy**.

**FR-EVT-07:** SDKs must respect the project capture policy. The `GET /v1/sdk/config` response must include the resolved capture policy so SDKs can gate event emission client-side. For interactive management, `GET /v1/projects/{id}/capture-policy` must return the resolved policy to any authorized project viewer, but raw override state is returned only to owner/admin edit flows so plain members receive a preview-only view without edit provenance. When the SDK's local config conflicts with the server-side policy, the more restrictive setting wins.

**FR-EVT-07a:** Projects may define manual capture rules that match structured event evidence and apply one of three actions: `demote`, `sample`, or `drop`. Capture rules are project-owned, durable, audit-worthy decisions and must be available through API, CLI, MCP, and web. SDK config (`GET /v1/sdk/config`) must include active, unexpired rules so SDKs can enforce locally when supported. Browser SDKs must apply `demote`, `sample`, and `drop` locally when possible. Node SDKs must apply local `drop` and sampled-out `sample` outcomes before buffering. Other SDKs may rely on server-side enforcement until local parity is implemented.

**FR-EVT-08:** The ingestion API must enforce plan-level capture rules server-side. If a project sends event types disallowed by its capture policy (e.g., standalone `request_event` with `response_status: 200` on a `minimal` Free project), the API must reject those events with a structured reason (`capture_policy_rejected`) rather than silently accepting and billing them. First-party request events in the preset-specific immediate request-failure set, the project's resolved `immediate_client_error_statuses` set, or a matching `immediate_client_error_path_rules` rule are incident-critical and must be accepted even when `capture_request_events` is narrowed; 5xx request failures are immediate under every preset.

**FR-EVT-08d:** The ingestion API and worker must enforce active capture rules server-side as a backstop. Matching `drop` rules reject events before persistence with `capture_rule_dropped`. Matching sampled-out `sample` rules reject events before persistence with `capture_rule_sampled_out`. Matching `demote` rules and sampled-in rules with `sample_event_class: "context"` must store the event as `context_signal` so it cannot create, reopen, regress, alert, dispatch webhooks, or dispatch GitHub automation.

**FR-EVT-08a:** Browser SDK network capture must promote first-party `fetch`/`XMLHttpRequest` responses that match the preset-specific immediate request-failure set, the resolved `immediate_client_error_statuses` set, or a matching `immediate_client_error_path_rules` rule to standalone `request_event` payloads while still retaining the corresponding `network_request` breadcrumb for timeline context. First-party means same-origin/relative URL or a URL matched by trace-propagation allowlist. Under `minimal`, the preset contributes 5xx only; under `balanced`, it adds 408/423/424/425/429; under `investigative`, it further adds 409. Other first-party browser responses outside the current immediate set remain breadcrumb/context captures unless separately reported through an explicit request-event API.

**FR-EVT-08b:** The worker must not create request incidents from repeated contextual `4xx` request telemetry. Non-promoted `4xx` responses may be stored as context when capture policy allows them, but they remain telemetry only and do not cross an anomaly threshold into normal incidents. Operators who want a specific client-error route to open incidents must promote it through `immediate_client_error_statuses` or the narrower `immediate_client_error_path_rules` policy.

**FR-EVT-08c:** When a promoted request failure is accepted, the worker must enqueue a deterministic incident-grouping path keyed by project, service, environment, normalized route template, HTTP method, and response status. The resulting incident must surface as `request_failure` through existing retrieval, bundle, CLI, MCP, and web incident flows.

**FR-EVT-08e:** Common internet scanner routes such as WordPress, OWA, RDWeb, VPN, `/.env`, and autodiscover probes may remain stored as contextual request telemetry when accepted by capture policy, but must not open normal incidents as unpromoted `404` traffic. They can open incidents only when an operator explicitly promotes the exact status or a narrower status+path rule.

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

### 1.18b AnalyticsBundle & Agent-Native Product Analytics

> AnalyticsBundle is a second product pillar under the DebugBundle brand. It is opt-in, browser-SDK-first, agent-native product analytics that helps humans and agents understand usage, journeys, funnels, friction, and incident impact without turning DebugBundle into a generic analytics warehouse.

#### Analytics Event Lane

**FR-ANL-01:** Analytics capture must be disabled by default. Existing SDK installs must not begin collecting analytics after upgrade unless the project/browser SDK explicitly enables analytics.

**FR-ANL-02:** The first supported analytics capture surface is the browser SDK. Browser analytics must support sessions, page views, route changes, semantic actions, opt-in structural actions, funnel steps, conversions, journey markers, session summaries, device/browser/OS/language context, referrer/UTM context, auth state, and controlled custom dimensions.

**FR-ANL-03:** Analytics events are a separate ingestion lane from the eight debug event types in FR-SDK-05. Analytics events must never create, reopen, regress, or materially update incidents; must never dispatch incident alerts/webhooks/GitHub automation; and must not be assigned `event_class` values used by debug event billing and incident eligibility.

**FR-ANL-04:** The existing `/v1/events` ingestion endpoint may accept mixed debug and analytics batches for transport simplicity, but ingestion must split the batch by event family. Debug events continue through capture-policy enforcement, debug raw-event persistence, normalization, event classification, and incident processing. Analytics events continue through analytics enablement checks, analytics quota checks, short-lived raw analytics persistence, analytics queueing, and aggregate rollup processing.

**FR-ANL-04a:** Browser debug capture and AnalyticsBundle capture should share privacy-safe frontend primitives where possible, including session identity, route normalization, device/browser context collection, referrer parsing, action/click sanitization, and structured journey formatting. Sharing implementation primitives must not merge the debug and analytics event lanes: a browser signal may produce a debug breadcrumb, an analytics event, or both depending on independent debug and analytics settings, consent, sampling, and caps.

**FR-ANL-04b:** DebugBundle incident/debug capture must not depend on AnalyticsBundle being enabled. Existing frontend exceptions, breadcrumbs, route changes, request events, and debug bundles must continue to work when analytics is disabled, unavailable on the current tier, blocked by consent, sampled out, or failing internally.

**FR-ANL-05:** Analytics events must have separate usage accounting from debug incident ingestion. Analytics event/session allowances, retained journey samples, saved funnels, custom dimensions, and AnalyticsBundle generations must be meterable independently from existing incident event and failure bundle allowances. Hosted Free includes a bounded monthly preview of 5,000 analytics events, 1,000 sessions, 100 retained journey samples, 3 AnalyticsBundle generations, and 1 active saved funnel. Hosted monthly analytics event, session, retained-journey-sample, and AnalyticsBundle-generation allowances on paid tiers must scale with the organization's total included plus purchased capacity units. Hosted analytics event/session ingestion and on-demand AnalyticsBundle generation quota checks use durable analytics-specific internal counters and must not require adding analytics keys to the public billing summary `allowances` response until public billing clients are migrated to a compatible shape. Saved funnels and custom dimensions are fixed tier capabilities rather than capacity-unit multipliers: active saved-funnel caps are 1 on Free, 10 on Solo, and 50 on Team, while controlled custom-dimension caps are 1 on Free, 3 on Solo, and 8 on Team; self-host supports up to 100 saved funnels and 20 custom dimensions. Project settings may deliberately lower a tier cap, and settings plus ingestion boundaries must reject values above the current tier capability.

**FR-ANL-06:** Analytics ingestion must remain lightweight: authenticate, validate, apply analytics enablement/quota checks, persist short-lived raw input when accepted, enqueue analytics processing, and return. No aggregation, bundle generation, or heavy analysis may run synchronously in the API request path.

**FR-ANL-07:** Analytics processing must be idempotent. Reprocessing the same analytics event must not double-count rollups, duplicate journey samples, duplicate opportunities, or create duplicate bundle-generation records.

#### Privacy And Capture Controls

**FR-ANL-08:** Analytics SDK configuration must support privacy modes:
- `strict`: session-only analytics, no persistent visitor identifier.
- `standard`: first-party anonymous visitor identifier scoped to the project and represented server-side as a hash for returning-visitor and active-user metrics.
- `custom`: customer-owned consent/identity integration, still bounded by DebugBundle schemas, redaction, and server enforcement.

**FR-ANL-09:** Browser analytics must expose consent controls. If a project or SDK config requires consent and consent is absent or false, analytics capture must be disabled locally without affecting debug incident capture.

**FR-ANL-09a:** Direct browser SDKs using a project token must explicitly opt into and hydrate the bounded project analytics capture block from `GET /v1/sdk/config` on initialization. The existing SDK-config response must remain unchanged for clients that do not opt in. Project settings may disable or narrow locally opted-in analytics capture, require explicit consent, or force `strict` privacy, but may never opt an SDK into analytics or widen its local capture configuration. Relay-mode browser SDKs must remain credential-free and rely on their local configuration plus server-side ingestion enforcement.

**FR-ANL-10:** Analytics must not collect form values, raw click text, raw DOM snapshots, screenshots, video replay, precise coordinates, precise location, raw IP addresses, emails, names, phone numbers, addresses, tokens, payment data, or customer secrets by default.

**FR-ANL-10a:** When `analytics.trackActions` is enabled, browser auto-capture may emit only fixed, privacy-safe structural action keys for a bounded allowlist of interactive element or ARIA-role categories. It must not retain DOM selectors, element IDs, URLs, raw attributes, input values, or user-visible text, and it must remain independently configurable from debug click breadcrumbs.

**FR-ANL-10b:** When `analytics.trackFrictionSignals` is enabled, browser auto-capture may emit only fixed `journey_marker` keys for bounded local heuristics: rapid repeated clicks on the same in-memory interactive target, rapid repeated clicks on the same eligible non-interactive target, and a quick safe route reversal. The SDK must use only ephemeral in-memory target identity and timing to make that decision; it must not emit selectors, IDs, text, URLs, attributes, input values, or any target-derived dimensions. Project settings may disable friction capture through the restrictive analytics SDK-config block.

**FR-ANL-11:** Analytics paths and routes must strip query strings by default before long-term aggregation. Raw URLs with query strings may not be stored in long-term analytics tables.

**FR-ANL-12:** Coarse geography is optional. When enabled, geography must be derived server-side and retained only as coarse country/region fields. Raw IP addresses must not be stored in analytics rollups or AnalyticsBundle artifacts.

**FR-ANL-13:** Custom analytics data must use controlled custom dimensions, not arbitrary retained JSON payloads. Allowed custom dimensions must be low-cardinality, bounded, redacted, allowlisted per project, and limited by the current tier capability. Sensitive or high-cardinality fields such as raw user IDs, emails, order IDs, workspace IDs, ticket IDs, URLs with tokens, and free-form user text must be rejected, dropped, or redacted before aggregation.

#### Metrics And Rollups

**FR-ANL-14:** The analytics worker must write aggregate rollups for sessions, page views, active users, routes, route transitions, actions, funnels, conversions, devices, browsers, OS, language/locale, referrer/UTM, auth state, approved custom dimensions, and incident/deploy correlation. Rollups are precomputed bounded aggregate rows keyed by time bucket and dimensions; they are not raw event logs, arbitrary event search indexes, or long-term per-visit timelines.

**FR-ANL-15:** Analytics rollups must support direct metrics retrieval for humans and agents. Required metric families include usage summary, route/page metrics, device/browser/OS/language breakdown, referrer/UTM metrics, funnel conversion/dropoff, journey patterns, feature/custom-event usage, deploy comparison inputs, and incident impact inputs.

**FR-ANL-16:** Long-term analytics storage must be aggregate-first. Raw analytics event objects and representative journey samples must have bounded retention; hourly detail must expire independently through a bounded project setting (hosted defaults/caps: 7 days Free, 30 Solo, 90 Team; self-host up to 365); daily and longer-horizon visits must remain aggregates governed by the longer aggregate-retention window.

**FR-ANL-17:** Journey replay for AnalyticsBundle must be structured timeline replay, not video replay. Representative journeys may include route changes, semantic actions, funnel steps, conversion markers, friction markers, linked debug incidents, and timing/click counts, but must exclude raw user text and sensitive payload data.

**FR-ANL-17a:** Incident-impact journey replay selection must require an exact match between a retained sample's internal project-scoped session subject and an affected incident-session link, plus the affected route-transition tag and bounded analysis window. Route, service, environment, or time overlap alone must never qualify a retained journey sample for an incident-impact response or artifact. Internal correlation hashes must not be exposed through public journey-sample interfaces; samples captured before this correlation field exists remain ineligible rather than being backfilled from raw session identifiers.

#### AnalyticsBundle Artifacts

**FR-ANL-18:** AnalyticsBundle must be a first-class generated artifact type with its own versioned schema (`AnalyticsBundleV1`). It must not be represented as a failure bundle and must not require one bundle per visit.

**FR-ANL-19:** AnalyticsBundles are generated for analysis units such as usage summary, route health, funnel dropoff, journey friction, feature usage, incident impact, deploy comparison, and conversion path analysis. Focused kinds must reject ambiguous requests: route health requires a normalized route, funnel dropoff requires a funnel, incident impact requires an accessible project incident, deploy comparison requires a deploy, and conversion path requires a route or funnel. A request linked by `opportunity_id` must derive its kind, analysis window, scope, focus, aggregate evidence, and complete related incident/deploy sets from that authorized project opportunity; conflicting caller input must be rejected. Deterministic duplicate requests reuse the existing generation, while an identical failed generation may be reset and retried without consuming a second durable quota claim.

**FR-ANL-20:** AnalyticsBundle generation must be deterministic for the same analysis specification and same aggregate/sample inputs. Arrays must be sorted deterministically. Representative journeys must rank incident-impact evidence by correlation-backed affected-session reach and other evidence by unique-session reach, transition count, transition share, route transition, and sample ID; the artifact must expose the resulting rank and aggregate selection basis. Wall-clock generation time must not appear in deterministic evidence sections.

**FR-ANL-21:** AnalyticsBundles must include summary, confidence, severity, analysis window, aggregate metrics, affected segments, journey patterns, representative redacted journeys, linked incidents, linked deploys, recommendations, redaction metadata, and input fingerprint where applicable.

**FR-ANL-22:** Analytics opportunities must be created from deterministic aggregate thresholds such as funnel dropoff, route exit/backtrack increases, fixed browser friction-marker counts for repeated/dead clicks and backtracks, conversion decreases after deploy, and incidents affecting a material share of sessions. Route and deploy regressions compare the current seven-day window with a bounded prior baseline; incident impact requires correlation-backed affected sessions. Event-triggered evaluation may be supplemented by a leased, bounded scheduled pass over enabled projects with recent aggregate activity. Evaluators must upsert stable fingerprints, refresh complete related incident/deploy IDs, reopen a previously resolved signal when it recurs, leave snoozed opportunities untouched, and resolve open opportunities not detected during a complete evaluation window. Friction evidence must retain only the fixed marker key, safe route, and aggregate counts. Tiny-sample opportunities must either be suppressed or clearly marked low confidence.

#### Public Interfaces And UI

**FR-ANL-23:** Analytics metrics, opportunities, and AnalyticsBundles must be available through API, CLI, MCP, and web using the same domain services. Analytics must not be dashboard-only.

**FR-ANL-24:** Analytics read/manage routes must require browser session or member token authorization. Project tokens remain write-only and may only submit analytics events through SDK/relay/direct ingestion paths.

**FR-ANL-25:** The web app must include a main sidebar Analytics surface similar to Incidents and Improvements. It must show cross-project analytics opportunities and generated AnalyticsBundles for accessible projects, including pending/failed bundle states. Its two cross-project inventory reads must be backed by additive organization-scoped API/domain reads rather than browser fanout; CLI must require explicit `--all-projects`, and only the matching MCP list tools may omit `projectId`.

**FR-ANL-26:** Each project must have one Analytics tab. Routes, funnels, devices, referrers, opportunities, and generated AnalyticsBundles must live as internal sub-tabs or sections inside that single project Analytics tab rather than adding more top-level project tabs.

**FR-ANL-27:** Incident detail views must expose analytics impact when analytics is enabled and data exists, including affected sessions, affected route/funnel, conversion delta, top device/browser segments, linked journey patterns, and an action to generate or view an incident-impact AnalyticsBundle.

**FR-ANL-28:** Project analytics settings must support enable/disable, privacy mode, consent requirement, sampling, retention, saved funnels, and tier-bounded controlled custom dimensions.

**FR-ANL-29:** Analytics UI implementation must follow `/rules/design-discipline.md`: reuse existing app patterns and components, prefer tables for comparable records, avoid decorative dashboard card sprawl, include loading/empty/error/disabled/quota/partial-data states, and keep analytics opportunities and bundles visible in both sidebar-level Analytics and project-level Analytics surfaces.

---

### 1.12 Browser Relay

**FR-REL-01:** Every V1 server SDK or integration surface with backend framework support must provide a full browser relay handler that accepts browser-originated events via a `POST /debugbundle/browser` endpoint on the user's own backend. Same-origin relay is the default recommendation; split frontend/backend deployments may expose the relay on a separate backend origin when explicit origin allowlisting is configured. Full relay handlers must answer allowed `OPTIONS /debugbundle/browser` CORS preflight requests and include matching CORS response headers on allowed relay POST responses. V1 required surfaces are Node.js (Express, Fastify, Next.js), Python (Django, Flask, FastAPI), PHP (Laravel, Symfony), and the WordPress plugin REST relay. Node.js must expose the relay as subpath exports (`@debugbundle/sdk-node/relay`, `@debugbundle/sdk-node/relay/express`, `@debugbundle/sdk-node/relay/fastify`, `@debugbundle/sdk-node/relay/nextjs`). Other SDKs must expose equivalent language-idiomatic handlers and framework adapters.

**FR-REL-02:** The relay handler must validate incoming payloads against a strict schema, accepting only known browser event types: `frontend_exception`, `error_suppressed`, `frontend_breadcrumb`, `request_event`, `probe_event`, and opt-in `analytics_event`. Analytics relay events use the same versioned analytics envelope and privacy-safe field constraints as direct browser ingestion; the credential-free browser request must not carry a project token, and the authenticated relay attaches its configured write-only project token only when forwarding accepted events. Unknown event types and unknown fields must be rejected/stripped.

**FR-REL-03:** The relay handler must enforce origin validation by checking the `Origin` header (fallback: `Referer`) against a configurable allowlist. Default: same-origin derived from the request's `Host` header. Requests with missing or non-matching origins must be rejected with `403`.

**FR-REL-04:** The relay handler must enforce `Content-Type: application/json` on all requests. Requests without this content type must be rejected to ensure browsers trigger CORS preflight, preventing simple cross-origin form submissions.

**FR-REL-05:** The relay handler must enforce a hard 256 KB limit on request body size. Requests exceeding this limit must be rejected with `413`.

**FR-REL-06:** The relay handler must strip or override trust-sensitive fields from browser payloads: `project_token` (never trust from browser), `sdk_name` (forced to `@debugbundle/sdk-browser`), `organization_id` (never accept from browser). Browser-owned fields must be preserved: `correlation.trace_id`, `service`, `environment` (unless relay has explicit overrides), `occurred_at`, `payload`.

**FR-REL-07:** The relay handler must apply per-IP rate limiting. Default: 60 requests per minute per IP. Configurable via `rateLimitPerMinute` option. Requests exceeding the limit must return `429`.

**FR-REL-08:** In local-only mode, every full relay handler must write validated browser events to `.debugbundle/local/events/` using the same atomic file transport and naming convention as the Node SDK file transport (`<timestamp>-<sequence>-<service>.events.json`).

**FR-REL-09:** In connected mode, every full relay handler must default to durable delivery: write browser events to `.debugbundle/local/browser-relay-spool/` before forwarding to DebugBundle cloud. Spool files survive cloud failures for retry/manual recovery. A `durableWrite: false` option, or language-idiomatic equivalent, enables low-latency forwarding without local spool.

**FR-REL-10:** Every relay handler must implement credential isolation: the browser must never send DebugBundle cloud credentials. The relay attaches `project_token` and auth headers server-side when forwarding to cloud. For local-only relay, no cloud credentials are needed.

**FR-REL-11:** The browser SDK must support explicit `transportMode: "relay" | "direct"` selection. Relay mode accepts either a relative relay path (for same-origin deployments) or an absolute `http`/`https` backend relay URL (for split frontend/backend deployments), sends the relay batch wire shape, and never includes an `Authorization` header or browser-side `projectToken`. Direct mode requires a `projectToken` and an absolute ingestion endpoint, defaulting to DebugBundle cloud when the endpoint is omitted. For compatibility when `transportMode` is omitted, a relative endpoint still infers relay mode, an absolute endpoint still infers direct mode with `projectToken`, `projectToken` alone defaults to direct cloud, and no usable relay or direct configuration disables the SDK.

**FR-REL-12:** `debugbundle process` must handle browser-originated event files in `.debugbundle/local/events/` identically to backend-originated files. Cross-context `trace_id` correlation must link browser and backend events into the same incident bundle.

**FR-REL-13:** Connected relay spool retention: delivered spool files pruned after 24 hours (default). Undelivered spool files retained for 7 days (default, configurable). `debugbundle doctor --check-relay` must report undelivered spool file counts and ages.

**FR-REL-14:** `debugbundle setup` must detect supported backend frameworks and scaffold or print exact relay-route instructions when the user's project includes both backend and browser SDKs. Auto-scaffolding must be limited to deterministic insertion points with test coverage and must not imply that one runtime family is the product default. For every shipped relay-capable runtime that the CLI cannot safely patch yet, setup must still provide exact runtime-specific relay instructions through CLI output and generated agent guidance. Relay guidance must cover credential isolation, origin allowlisting, content type and body-size validation, schema validation, rate limiting, auth/CSRF exemptions, local versus connected delivery, and split frontend/backend endpoint selection.

### 1.19 GitHub Repository Automation

**FR-GHA-01:** Support connecting a DebugBundle organization to a GitHub App installation. The GitHub App model (not OAuth token reuse) is the only supported connection method for repository automation.

**FR-GHA-02:** Store GitHub App installation records with `installation_id`, `account_login`, `account_type`, and lifecycle status (`active`, `suspended`, `removed`). Each installation is scoped to one DebugBundle organization.

**FR-GHA-03:** Handle GitHub App installation lifecycle callbacks (`installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`) at `POST /v1/github/app/webhook`, verified by HMAC-SHA256 using the App webhook secret.

**FR-GHA-04:** Allow each DebugBundle project to assign exactly one primary GitHub repository from the repositories available to the organization's GitHub App installation. Enforce `UNIQUE` on `project_id`.

**FR-GHA-05:** Support CRUD operations for GitHub dispatch automation rules per project. Each rule specifies: `name`, `enabled`, `event_types` (array of lifecycle event types), `environments`, `services`, `severity_min`, `bundle_type`, `incident_status` (`new_only`, `reopened_only`, `new_or_reopened`), and `cooldown_seconds` (default 300, minimum 60).

**FR-GHA-06:** Reuse the existing webhook filter evaluation pipeline for GitHub dispatch rule matching. The shared filter evaluation function must be used by both webhook delivery and GitHub dispatch rules to prevent filter behavior divergence.

**FR-GHA-07:** On supported lifecycle events, including incident lifecycle events and hosted `improvement_bundle.created` events, the worker must evaluate matching GitHub dispatch rules, enforce cooldown per `target_fingerprint + rule_id`, persist a delivery record, and enqueue a `github-dispatch` job.

**FR-GHA-08:** The worker must obtain GitHub App installation access tokens by signing a JWT with the App private key, exchanging it via `POST /app/installations/{id}/access_tokens`, and caching the token in Redis with a 50-minute TTL.

**FR-GHA-09:** The worker must send `repository_dispatch` events to the project's assigned repository via `POST /repos/{owner}/{repo}/dispatches` with `event_type: "debugbundle.incident"` and a `client_payload` containing summary fields and API links (no full bundle data).

**FR-GHA-10:** The dispatch `client_payload` must follow the stable payload contract: `debugbundle_event`, `incident_id`, `improvement_id`, `project_id`, `bundle_type`, `bundle_version`, `severity`, `service`, `environment`, `title`, `occurrence_count`, `first_seen_at`, `links` (bundle, reproduction, dashboard), `dispatch_id`, `dispatched_at`. Incident dispatches set `incident_id`; hosted improvement dispatches set `improvement_id`, set `incident_id` to `null`, use `bundle_type: "improvement"`, and set `links.reproduction` to `null`. Fields may be added but never removed or renamed without a major version bump.

**FR-GHA-11:** Persist dispatch delivery history with: `rule_id`, `project_id`, exactly one target reference (`incident_id` or `improvement_opportunity_id`), `target_fingerprint`, `dedupe_key`, `status` (`pending`, `delivered`, `failed`, `retrying`, `skipped`), `attempt_count`, `last_error`, `github_status_code`, and `dispatch_payload`.

**FR-GHA-12:** Implement retry strategy for failed dispatches: 1s → 5s → 30s → 2min → 10min (5 attempts). After 5 failed attempts, mark delivery as `failed`. Do not auto-disable rules.

**FR-GHA-13:** Enforce rate limits: maximum 100 dispatches per project per hour, maximum 4,000 dispatches per installation per hour. Respect GitHub `429`/`503` responses with `Retry-After` or exponential backoff. DebugBundle-side hourly rate-limit drops must persist non-retryable `skipped` delivery history records so operators can see why dispatches were suppressed.

**FR-GHA-14:** When a user connects a repo for the first time, offer a default automation rule preset: `event_types: [bundle.created, bundle.reopened]`, `severity_min: high`, `incident_status: new_or_reopened`, `cooldown_seconds: 300`.

**FR-GHA-15:** Provide delivery history UI in the web app's project GitHub tab, including rule name, target title, timestamp, status, attempt count, last error, and a "Retry" button for failed deliveries. The target title is an incident title for failure dispatches and an improvement title for hosted improvement dispatches.

**FR-GHA-16:** If the GitHub installation becomes suspended or removed, show a "GitHub connection lost" banner in the project GitHub tab with a "Reconnect" action.

**FR-GHA-17:** Enforce tier gating from the target project's owner plan: GitHub automation use (App connection, repo assignment, dispatch rule creation/update, dispatch publishing, and manual retry) is available on Solo and Team tiers only. After a downgrade, preserved GitHub setup and delivery history remain readable and delete-only cleanup remains available, but Free-tier projects see an upgrade prompt for new use even when the acting collaborator personally pays for a higher plan. Shared projects owned by Solo/Team accounts remain eligible even when the acting collaborator's own account is Free.

**FR-GHA-18:** All GitHub automation management operations must be available through API, CLI, and MCP (INV-5 interface parity). Member token or browser session required; project tokens rejected.

**FR-GHA-18a:** On an eligible shared project, owner/admin manage the GitHub connection and repository assignment. Plain members may view GitHub automation status and create project dispatch rules, but they may not mutate the shared connection/repository configuration or mutate dispatch rules created by other collaborators.

**FR-GHA-19:** Self-hosted deployments must support custom GitHub App configuration via environment variables (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`).

**FR-GHM-01:** Support a dedicated GitHub Marketplace webhook at `POST /v1/github/marketplace/webhook`, verified by HMAC-SHA256 using a separate Marketplace webhook secret and keyed idempotently by the GitHub delivery ID.

**FR-GHM-02:** Persist the latest GitHub Marketplace purchase snapshot per GitHub Marketplace account, including account identity, plan identity, current purchase status/action, effective date, optional installation ID, and the last processed delivery ID.

**FR-GHM-03:** Marketplace purchase tracking must remain separate from GitHub App installation tracking and from Stripe billing entitlements. In the current billing model, Marketplace webhook processing must not directly mutate `organizations.plan`, `stripe_customer_id`, or other Stripe-derived entitlement fields.

**FR-GHM-04:** When a GitHub App installation is later linked to a DebugBundle organization, any stored Marketplace purchase snapshot with the same GitHub installation ID must be linked to that organization for attribution and account export.

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

**NFR-SCALE-01a:** AnalyticsBundle must use aggregate-first storage and bounded journey samples. Analytics implementation must not introduce Kafka, ClickHouse, OpenSearch, tracing backends, arbitrary query engines, or long-term raw analytics event tables before product volume proves the need and the architecture is explicitly approved.

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

**NFR-RET-05:** Analytics raw event objects and representative journey samples must have short, tier-configurable retention. Hourly/daily/monthly/yearly analytics rollups may retain longer, but they must not preserve raw payloads, raw IPs, raw URLs with query strings, or high-cardinality customer identifiers.

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
