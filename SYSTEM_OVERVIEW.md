# SYSTEM OVERVIEW — DebugBundle

> Context-compression file for agent session recovery.
> If this file conflicts with `/spec/*`, `/contracts/*`, or `/rules/*`, those win.

---

## What Is DebugBundle?

The core artifact is the **Debug Bundle** — a deterministic, versioned (`bundle_version: 1`), privacy-aware package of debugging context for a single incident. The bundle schema includes per-context block versioning (`version: 1` on each context block) to enable independent evolution. Context blocks include `error`, `request`, `response`, `logs`, `frontend`, `environment`, `deploy`, `runtime`, `git`, `dependencies`, `probe_data`, and `device` (browser-only: UA, browser, OS, device type, screen, viewport, touch, locale, connection, color scheme). The AnalyticsBundle foundation defines a second artifact family for opt-in browser product analytics: aggregate usage metrics, journeys, funnels, friction patterns, incident impact, and improvement recommendations without creating incidents or storing long-term raw analytics streams. Browser debug and analytics capture should share sanitized frontend primitives where practical, but debug bundles must never depend on analytics being enabled or healthy.

### Canonical Primitives

The system is built around three current primitives: **bundle** (versioned debugging artifact with `bundle_version: 1`, `captured_at`, `sdk`, expanded `summary`, `context.runtime`, `context.git`, wrapped array blocks), **incident** (fingerprint-grouped event container), and **profile.json** (project configuration). All current features operate on these primitives. Hosted improvement automation now also has a project-scoped settings surface that controls whether deterministic improvement generation is enabled and which sensitivity mode (`high_confidence`, `balanced`, `verbose`) applies on eligible paid tiers, plus first-class `improvement_opportunities` rows. Request/log improvement opportunities can produce `bundle_type: "improvement"` artifacts stored separately from incident failure bundles; below-threshold request/log candidates remain internal counting state until a bundle is attempted/generated. Incident-derived opportunities carry `related_incident_ids`, point agents at the existing failure bundles instead of duplicating that context, and auto-resolve once all related incidents are resolved. AnalyticsBundle adds the foundation for a fourth primitive, **analytics opportunity / analytics bundle**, backed by aggregate rollups and short-lived journey samples rather than incident event rows.

---

## System Shape

DebugBundle supports two runtime modes: **local-only** (no cloud account required, SDK writes to filesystem, CLI processes where those files live) and **connected** (cloud ingestion, team features, alerts). Local-only is the default starting point and can run on a developer machine or self-managed server with persistent storage and CLI access; connected is the recommended production path for team visibility, ephemeral infrastructure, alerts, webhooks, and hosted automation. See `/spec/local-first-onboarding.md`.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SDK Layer                                │
│  JS SDK monorepo (debugbundle/debugbundle-js):                  │
│    @debugbundle/sdk-node, @debugbundle/sdk-browser              │
│  JS packages still published from core today:                   │
│    @debugbundle/shared-types, @debugbundle/redaction            │
│  Completed non-TS/integration launch scope:                     │
│    debugbundle-python, debugbundle/sdk-php,                     │
│    debugbundle-wordpress, com.debugbundle Java SDK,             │
│    debugbundle Ruby SDK, github.com/debugbundle/debugbundle-go  │
│  Published native/runtime surface:                              │
│    .NET 1.3.0 and coordinated Android/Swift/RN 1.2.0 releases.  │
│    Android/Swift emit canonical mobile envelopes, parse indexed │
│    acknowledgements, own durable delivery, and expose additive  │
│    RN external-event/probe/policy bridge APIs.                   │
│  Future expansion: Kotlin server, Rust, and Dart/Flutter        │
│  See spec/sdk-language-targets.md for full rollout plan         │
│  Universal interface: init, captureException, captureError,     │
│  captureLog, captureRequest, captureMessage, setContext, flush, │
│  probe, status, lastEventAt                                     │
│  Vanilla hooks + stdlib/structlog/loguru logger auto-detection  │
│  + framework integrations                                       │
│  Always-on probe ring buffer; config polling (paid tiers, 60s)  │
│  Transport: file (local-only/current machine) or HTTP           │
│  (staging/prod connected)                                       │
│  Browser relay: POST to user's backend relay handler            │
└────────────┬───────┬─────────────────┬──────────────────────────┘
             │       │ Browser relay   │ POST /v1/events (batched)
  File tpt   │       │ (same-origin)   │ (staging/prod connected)
  (local/dev)│       │                 │
     ┌───────▼───────▼──────┐          │
     │ .debugbundle/local/  │          │
     │   events/            │          │
     │   browser-relay-spool│          │
     │ CLI: process/ingest  │          │
     │ normalize→bundle→    │          │
     │ repro→write bundles  │          │
     └──────────────────────┘          │
┌──────────────────────────────────────▼──────────────────────────┐
│                     Ingestion API (Fastify)                     │
│   Validate → Persist raw to S3 → Enqueue processing             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Redis/BullMQ
┌──────────────────────────▼──────────────────────────────────────┐
│                    Processing Worker                            │
│   normalize → classify (event_class) → group/fingerprint →      │
│   aggregate analytics events → hosted improvement evaluation     │
│   (warnings + request patterns) →                               │
│   build-bundle → build-reproduction → evaluate-alerts →         │
│   deliver-alert-email-digest → deliver-webhook →                │
│   deliver-operational-email → generate-weekly-report →          │
│   cleanup-retention                                             │
└──────────┬─────────────────┬────────────────────────────────────┘
           │                 │
    ┌──────▼──────┐  ┌───────▼───────┐
    │ PostgreSQL  │  │ S3-compatible │
    │ (metadata)  │  │ storage       │
    └──────┬──────┘  └───────┬───────┘
           │                 │
┌──────────▼─────────────────▼────────────────────────────────────┐
│                    Retrieval Layer                              │
│   HTTP API    │    CLI    │    MCP Server                       │
│   (same domain services underneath — interface parity)          │
└─────────────────────────────────────────────────────────────────┘
```

The approved official OpenAI Plugin adds one isolated read-only retrieval path without changing the diagram's existing stdio MCP/CLI surface:

```text
ChatGPT / Codex
  → Streamable HTTP + OAuth access token
  → https://mcp.debugbundle.com/mcp
  → route-scoped empty-binary discovery compatibility + OAuth challenge
  → trusted-host/surface validation in the existing Fastify API process
  → exact twenty-three-tool OpenAI projection
  → dedicated zero-mutation hosted readers, including nine aggregate-only analytics readers
  → PostgreSQL/S3 existing records and artifacts only

Browser session
  → https://api.debugbundle.com/oauth/*
  → oidc-provider + project-owned Postgres adapter
  → grant/code/rotating refresh-family state

Browser consent/review
  → https://app.debugbundle.com/oauth/consent or /oauth/reviewer
  → existing AuthLayout + server-authoritative no-store interaction JSON
  → CSRF-safe allow/deny or POST-only synthetic credential
  → API-origin provider continuation

Explicit local development review
  → make dev-openai-plugin-preview
  → http://localhost:5291/__dev/openai-plugin
  → production UI components + deterministic browser-only fixtures
  → zero OAuth/reviewer/grant/revocation requests; route absent from production

Signed-in Settings
  → exact-user/current-organization OpenAI connection inventory
  → confirmed POST-body revocation of grant + refresh family
```

The resource origin is permanent; OAuth issuer is exactly `https://api.debugbundle.com`, with frozen JWKS path `/oauth/jwks.json`. `get_incident_context` requires incident and artifact scopes and excludes raw logs. Health URLs are sanitized before projection. The same Lightsail API image/process is protected by a Redis-coordinated, database-aware MCP bulkhead, atomic dual-host Caddy promotion, and an independently operable MCP-only no-deploy Caddy gate. The runtime, forward migration, projection, owner-approved existing-app consent/reviewer/revocation UI, opt-in development-only synthetic UI preview, package, private-cloud deployment source, and automated local evidence are implemented. Production migration, managed Caddy, DNS/TLS, OAuth/reviewer configuration, and MCP activation are deployed for owner-approved Developer Mode validation; the observed empty binary ChatGPT discovery probe has a bounded compatibility parser and live `401` challenge evidence. The owner reconnect, Developer Mode connection mapping, two bounded ChatGPT cases, and a fresh-thread Codex aggregate-analytics case are captured. The remaining live-client corpus, manual accessibility, reviewer outside-network proof, representative load/rollback evidence, portal review, publication, and directory evidence remain separate gates.

Incident retrieval now supports an additive `attention_after` lower-bound filter across API, CLI, MCP, and local retrieval so operators can page through incidents first opened or regressed after a chosen timestamp without client-side truncation.

---

## Core Lifecycle

1. **Capture** — SDKs intercept errors, exceptions, HTTP requests/responses, logs (in-process via logger handlers), console, DOM, navigation events. SDKs respect the server-side capture policy and project capture rules (fetched via `GET /v1/sdk/config`) which control what event types are captured, incident-eligible, demoted, sampled, or dropped. Browser SDKs locally enforce `demote`, `sample`, and `drop`, collect device/browser metadata (UA, OS, screen, viewport, touch, locale, connection type) on `init()`, preserve browser-native `window` error metadata for opaque global and resource-load failures, preserve bounded `unhandledrejection` reason summaries, add optional sanitized page lifecycle context plus technical resource-target attributes when available, keep breadcrumbs local by default for exception attachment, optionally ship standalone `frontend_breadcrumb` events, and treat the inline `frontend_exception.payload.breadcrumbs[]` flush path as the canonical browser error-context payload even when standalone breadcrumb events are disabled. Browser capture also applies local network filters plus per-event `sampleRate` / `logLevel` controls to independent browser events, captures rejected `fetch()` calls as failed network breadcrumbs, promotes first-party `fetch`/XHR responses that match the current preset's immediate request-failure set, the resolved status-wide client-error incident override, or a path-scoped client-error incident rule to standalone `request_event` incident signals while retaining the network breadcrumb (5xx under every preset; `balanced`/`investigative` also 408/423/424/425/429; `investigative` also 409; projects may additionally promote selected `4xx` such as 401/403/422 or narrow rules such as 404 under `/checkout/*`). Capture rules can match opaque browser metadata and user-agent-derived client kind/bot family for scoped operational demotion or sampling. Every current SDK exposes an optional synchronous `beforeSend` hook for app-owned local filtering or final redaction after canonical event construction/redaction and before policy/rules, sampling, suppression, persistence, or buffering; `null` drops locally, invalid returns keep the isolated SDK-owned original, and hook failures never throw into host code. Unsafe hard-crash/fatal handlers may document that they skip user hook execution. Unpromoted `4xx` responses, including generic 404 traffic, remain non-incident telemetry/context when captured and do not open incidents solely by repetition. SDKs locally suppress repeated exception/log/request storms with `error_suppressed` checkpoints, and browser SDKs inject `X-DebugBundle-Trace-Id` only into same-origin or explicitly allowlisted first-party browser requests while preserving native `fetch` input and header semantics. Node SDKs now also locally enforce `drop` and sampled-out `sample` decisions before buffering, while `demote` remains a server-side backstop for backend runtimes until a richer local context-preservation path exists. `probe()` calls buffer redacted object data locally in per-label ring buffers (always-on, all tiers); scalar, null, and list values are wrapped under `value`. New WordPress plugin installs load the bundled browser SDK in the document head for earlier page-load capture, while upgraded installs that predate the setting preserve footer loading until an administrator changes it.
2. **Ship** — SDK batches events, deduplicates, redacts sensitive data. Connected transports submit canonical `{events}` batches and reconcile each indexed ingestion acknowledgement: accepted events leave the queue exactly once, only quota/rate-limited indices retry, terminally rejected indices are removed with bounded diagnostics, malformed acknowledgements retain the submitted batch, and all-rejected responses never advance `lastEventAt`. In local-only mode: server-side SDKs write events to `.debugbundle/local/events/` via file transport (atomic temp-file + rename). Browser SDKs ship events through a backend relay handler (`POST /debugbundle/browser`) hosted on the user's backend; same-origin relay paths are inferred automatically, while split frontend/backend deployments use explicit browser `transportMode: "relay"` with an absolute backend relay URL plus relay-provided CORS preflight handling and relay `allowedOrigins`. The relay validates, sanitizes, and writes events to `.debugbundle/local/events/` (local-only mode) or spools them to `.debugbundle/local/browser-relay-spool/` for durable forwarding (connected mode). Static-only browser deployments may use direct cloud ingestion with a public write-only project token and optional per-token `allowed_origins` enforcement on `/v1/events` and `/v1/sdk/config`; this reduces browser copy/paste abuse but is not a secret boundary because non-browser clients can spoof `Origin`. V1 full relay handlers are implemented across Node.js (Express, Fastify, Next.js), Python (Django, Flask, FastAPI), PHP (Laravel, Symfony), WordPress REST relay integration, Java Spring Boot, Java servlet/JAX-RS app-server adapters, Go net/http, and Ruby Rack/Rails. All relay-compatible surfaces use the same canonical `application/json` + `batch` request shape, allowed `OPTIONS` preflight response shape, credential isolation, correlation passthrough, local file format, durable spool contract, and connected forwarding model. Log-based capture (`debugbundle ingest`/`watch`) is an alternative input path that parses existing log files through the shared `packages/log-parser` registry into the same event format; `debugbundle-ndjson` is the canonical structured interchange format for any runtime that can already emit JSON lines, while the accepted first-party adapter formats currently include selected existing server log formats such as PHP and Apache. Local watch writes deterministic local event batches, while connected `debugbundle watch --cloud` ships appended batches directly to `POST /v1/events`.
3. **Ingest** — (Connected mode) API rejects declared request bodies over the shared small-request limit before auth or parsing, then validates, enforces capture policy, evaluates capture rules (`capture_rule_dropped` / `capture_rule_sampled_out` when applicable), redacts, persists accepted raw events to object storage, and enqueues processing with the resolved capture preset plus resolved status-wide and path-scoped client-error incident rules so worker-side request classification stays deterministic. Before closed-schema validation, the shared normalizer applies only authenticated, SDK-identity- and exact-shape-gated compatibility conversions for known installed mobile envelopes and the legacy Java runtime-memory object; unrelated or extended malformed shapes remain rejected. If an active capture rule uses an exact fingerprint, ingestion derives the versioned fingerprint with the same canonical normalizer used by the worker; this extra work is skipped for projects without active fingerprint rules and no client-supplied fingerprint is trusted. Accepted billable events also increment durable organization and project monthly usage counters so billing and active-project dashboard usage do not depend only on retained `incident_events`. The same ingestion/account/project/incident/improvement/notification/billing transitions now also feed a deletion-safe account analytics ledger (`account_analytics_accounts`, `account_metric_periods`, `account_metric_events`) that keeps aggregate month/year/lifetime metrics after retention cleanup, project deletion, and account deletion without preserving raw payloads or customer identifiers. Demotion is enforced again in processing as a backstop. No synchronous incident/grouping persistence in request path. (Local mode) `debugbundle process` reads events from `.debugbundle/local/events/` and composes the same pure-function packages (event-normalizer, bundle-engine, repro-engine) to produce bundles locally.
   3a. **Analytics Ingest And Aggregation** — Shared analytics event, AnalyticsBundle, and metrics response schemas, forward migrations/bootstrap, settings, durable usage/unique ledgers, aggregate rollups, journey samples, opportunities, and generation metadata form the implemented analytics runtime. `/v1/events` splits mixed debug/analytics batches after project-token auth: debug events keep the existing incident path, while enabled analytics events are validated against server settings/privacy/custom-dimension caps, partially claimed against analytics-specific allowances, persisted as short-lived objects, and queued. The idempotent worker updates hourly/daily session, route, transition, action/conversion/marker, and ordered funnel rollups only for newly ledgered subjects; unique subjects prevent metric and dimension overcount. Bounded journey artifacts are stored separately and remain hidden until complete. Deterministic opportunity evaluators cover funnel dropoff, route loops/fixed friction markers, route-exit regression, deploy conversion regression, and correlation-backed incident reach, with stable upsert/reopen/snooze/stale-resolution lifecycle. Direct, CLI, MCP, and web metric reads share the same bounded route/device/browser/OS/language/country/auth/referrer/UTM/custom-dimension filters. Browser analytics is opt-in and uses isolated analytics/debug transport lanes with independent buffering, backoff, auth rejection, consent, sampling, and caps; direct mode can hydrate only restrictive server settings, while credential-free relay mode sends `{batch}` and relies on the strict origin-authorized relay to attach its configured write token upstream. AnalyticsBundle requests validate focused-kind context or derive exact scope/evidence/relationships from an authorized `opportunity_id`; deterministic duplicates reuse their generation and failed duplicates can be retried. The bounded worker preserves baseline/current opportunity evidence, full incident/deploy links, ranked redacted journeys, recommendations, and deterministic object keys. Retention independently expires raw inputs, journey artifacts, hourly rollups, daily rollups, and bundle artifacts/metadata according to their configured windows. Analytics events never receive debug `event_class` values or create incident automation, and analytics failures remain isolated from debug ingestion.
   Fixed browser friction-marker opportunities retain only marker key, normalized route, analysis window, and aggregate counts; no target-derived interaction data is retained. Route/deploy opportunities retain bounded current/baseline aggregate evidence, and incident opportunities retain only correlation-backed reach.

The idle worker scheduler also performs a leased scheduled analytics opportunity pass every six hours by default. It selects only enabled projects with recent daily aggregate activity in bounded UUID-cursor batches, reuses the existing deterministic evaluator, and never scans raw analytics objects; event-triggered evaluation remains the low-latency path.

Analytics incident/deploy correlation now uses project-scoped hashed session subjects, hashed trace identifiers, bounded deploy dimensions, and idempotent incident-to-route-session links. Links reconcile whether analytics or the incident arrives first, update each aggregate route session once, expire with aggregate retention, and remain fail-open so debug incident processing never depends on analytics availability.

4. **Normalize & Classify** — Worker parses raw events into canonical form and assigns `event_class` (`incident_signal`, `context_signal`, `operational_signal`). Classification is immutable after normalization. Exceptions, `error`/`fatal`/`critical` logs, request events in the preset-specific immediate request-failure set, resolved status-wide client-error incidents, and matching path-scoped client-error incidents are incident signals; other request events remain context. Repeated contextual `4xx` request telemetry does not open normal request incidents. Free-tier billing counts only `incident_signal` events.
5. **Evaluate Improvements** — During normalization and incident grouping, eligible Solo/Team/self-host projects with automated improvements enabled run deterministic hosted improvement evaluation. V1 promotes repeated `warning`-level `log_event` patterns, repeated `request_event` slow-request and contextual request-failure patterns, recurring incidents, and post-deploy incident regressions into first-class `improvement_opportunities`. Request/log candidates below their configured sensitivity threshold remain internal counting state and are excluded from default improvement lists; common low-value external-probe 404 routes are skipped. Request/log opportunities sample representative source events where available, emit a hosted `BundleV1` artifact with `bundle_type: "improvement"` when the configured sensitivity threshold is crossed, and apply the same retained-bundle cap pruning as failure bundles so hosted improvement artifacts share one account-wide retained inventory. Incident-derived opportunities are priority/navigation records with `related_incident_ids`; agents should fetch those incident failure bundles for debugging context, and incident lifecycle resolution auto-resolves the related improvement once all linked incidents are resolved.
6. **Group** — Worker `group-incident` jobs fingerprint and assign incident-driving events to incidents, persist incident/event linkage, infer severity from signal confidence (backend exceptions, non-opaque frontend exceptions, and immediate request-failure incident signals infer `high`; opaque browser-native `window_error` infers `low`; opaque browser-native `resource_error` infers `medium`; `error_suppressed` infers `medium`; other events infer `low`), keep full-detail raw-event retention bounded (first occurrence, latest occurrence, first occurrence after each deploy, highest-severity occurrence, plus deploy metadata) while demoting other occurrences to summary-only metadata, track rolling frequency counters in Redis (1m/5m/1h/24h), detect spikes (5m/1h ratio ≥ 3.0), and detect regressions (event on resolved incident). Incident states: open → resolved → regressed.
7. **Availability Checks** — A dedicated bounded worker lane batch-claims due hosted health checks, executes guarded external `GET`/`HEAD` requests concurrently within the single worker process, stores 30-day raw results plus daily rollups, opens or regresses one linked availability incident when failures cross `failure_threshold`, and auto-resolves that incident when recoveries cross `recovery_threshold`. The lane is controlled by `AVAILABILITY_CHECK_LOOP_INTERVAL_MS`, `AVAILABILITY_CHECK_CLAIM_BATCH_SIZE`, and `AVAILABILITY_CHECK_CONCURRENCY`, logs lag/backlog metrics, and emits rate-limited worker dogfood warnings when due-check lag indicates saturation. These checks are project-scoped hosted infrastructure, not SDK behavior, and are managed through API, CLI, MCP, and the project Health tab.
8. **Bundle** — Worker assembles deterministic debug bundle from incident context via `packages/bundle-engine`
9. **Reproduce** — Worker generates reproduction artifacts (steps, commands, curl)
10. **Notify** — Worker resolves matching enabled webhook endpoints (`agent_webhooks`) by event + filters (including `bundle_type` and `is_verification` filter evaluation), gates new lifecycle webhook intents against the owning organization's shared `monthly_webhook_deliveries` allowance, persists delivery intents, claims due deliveries by `next_attempt_at`, executes real HTTP `deliver-webhook` attempts with per-delivery HMAC-SHA256 signatures, and tracks retry-state transitions (`pending` -> `retrying` -> `delivered`/`failed`/`disabled`) with observability fields (`last_response_code`, `last_attempted_at`, `last_error`). After 50 consecutive final delivery failures for a webhook, the webhook is automatically disabled by setting `agent_webhooks.is_enabled = false` so repeated failures stop consuming worker capacity until an operator re-enables it; that transition now queues a durable operational email delivery instead of sending inline. Allowance threshold notifications (80% warning / 100% reached), retention-rotation notices, and no-card trial lifecycle emails (started, 7-day reminder, 1-day reminder, expired, converted) all use the same `operational_email_deliveries` ledger with retry state and the `trial_lifecycle_events` idempotency ledger, so ingestion, billing, bundle generation, alerts, probes, availability incidents, and webhook fanout can enqueue notifications without blocking their primary path. Trial reminders and expiry are worker-scheduled from organization billing state, and conversion-vs-expiry races stay safe because the expiry path re-checks persisted entitlement state before downgrading. Lower-tier downgrades preserve paid-feature setup for later reactivation while terminalizing in-flight paid-feature deliveries and relying on current-tier checks to pause Slack, GitHub, remote probes, hosted improvement generation/retrieval, and collaborator access until the organization returns to an eligible plan. Failed/disabled deliveries can be manually retried via `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` (API), `webhook retry` (CLI), or `retry_webhook_delivery` (MCP). The lifecycle webhook publisher emits `bundle.created` on first occurrence (occurrence_count === 1), `bundle.updated` on subsequent threshold occurrences, `bundle.reopened` on regressions, `bundle.resolved` on explicit incident resolution, and now `improvement_bundle.created` when a hosted improvement bundle is first persisted, with enriched payloads containing event, service, links, summary, bundle_type, and verification fields. The worker also enqueues `evaluate-alerts` jobs from real incident transitions, matches enabled `alert_rules`, persists idempotent immediate-delivery `alert_deliveries` rows for non-email channels, and aggregates email alerts into fixed 10-second `alert_email_digests` plus `alert_email_digest_items` queues so bursty incidents ship as one digest email per project+recipient. Alert rules may optionally define a per-rule `cooldown_seconds` window; when non-zero, repeated notifications for the same computed notification key are suppressed without changing incident grouping, with opaque browser-native `window_error` signals intentionally using a broader key than exact incident fingerprinting so low-information noise does not repeatedly page operators. Severity-threshold alert rules also carry a lifecycle scope (`new_incident`, `incident_regressed`, or default `both`); regression delivery dedupe keys include stable source-transition identity so replays remain idempotent without permanently suppressing a later regression of the same incident, while the separate notification key continues to enforce configured cooldown. Non-email alert delivery still executes across `slack` (either direct webhook POST with Block Kit or reusable connected-destination resolution via encrypted `slack_destinations`), `discord` (webhook POST with embeds), and `webhook` (raw JSON POST to target URL), while digest email delivery uses the shared `packages/email` transport abstraction. Weekly reporting now shares that worker lane end-to-end: project creation seeds one enabled owner-recipient email `weekly_report_channels` row by default (browser-created projects use the browser timezone, other creation paths fall back to UTC), project settings can edit or disable that email report, runtime scheduler evaluates each enabled channel in its configured timezone/day/hour, only active projects are enqueued, idempotent `weekly_report_deliveries` rows gate duplicate sends per channel window, email deliveries due for the same recipient set and weekly window are combined into one email with per-project sections, and the worker renders/sends through channel-specific transports (`packages/email` for email and Slack delivery that can resolve either `config.webhook_url` or a saved encrypted `config.slack_destination_id`). **GitHub dispatch automation** (Solo+ only): the worker evaluates matching `github_dispatch_rules` for incident lifecycle events and hosted `improvement_bundle.created` events using the shared filter evaluation function, enforces per-target cooldown, persists delivery records that target either an incident or an improvement opportunity, obtains GitHub App installation access tokens (cached in Redis, 50m TTL), and sends `repository_dispatch` events to the project's assigned GitHub repository with `event_type: "debugbundle.incident"` and a summary-only `client_payload`. Hosted improvement dispatches set `bundle_type: "improvement"`, carry `improvement_id`, and link to the improvement bundle route with no reproduction link. Retry strategy: 1s → 5s → 30s → 2min → 10min (5 attempts). DebugBundle-side hourly limits are 100 dispatches/project/hour and 4,000/installation/hour; suppressed matches persist non-retryable `skipped` delivery history rows.
11. **Retrieve** — Agents/developers fetch and mutate incidents, failure bundles, hosted improvement opportunities, improvement bundles, reproductions, logs, project lifecycle, project collaborator management, billing, probe activation, capture-policy configuration, webhook configuration, webhook delivery status, synthetic webhook-test delivery, delivery retry, alert-rule configuration, reusable Slack alert destinations, weekly-report channel configuration, and GitHub automation management via API, CLI, or MCP. Improvement retrieval includes `related_incident_ids`; the improvement bundle route returns `bundle_not_generated_yet` for directly fetched below-threshold opportunities and `covered_by_incident_bundle` for incident-derived opportunities that intentionally do not have a duplicate improvement artifact. The browser account surface also supports first-party cached avatars: GitHub sign-in may import a profile image server-side on login, account settings can explicitly import Gravatar, and member/avatar URLs always resolve back through DebugBundle-owned routes instead of hotlinking third-party image hosts. Project visibility is now intended to be project-scoped: owned projects are visible to their owner, shared projects are visible only to explicit `project_members`, project-member rosters are readable to any authorized collaborator, pending invite management remains owner/admin-only, and collaborators can leave a shared project explicitly through API/CLI/MCP/web so removal takes effect immediately across browser sessions, member tokens, CLI, and MCP. Customer-facing account analytics are not exposed yet, but the internal admin-only `/analytics` SPA route now reads aggregate-only product KPIs through a browser-session-only `GET /v1/admin/analytics/summary` API gate that requires verified email auth plus an `ADMIN_ANALYTICS_ACCESS_EMAILS` allowlist and returns `404` for every unauthorized or unavailable state.
    10a. **Retrieve Analytics** — Humans and agents fetch aggregate project metrics through project-authorized summary, route, journey-pattern, device, referrer, action, funnel, and incident-impact API routes with matching CLI/MCP tools and web views. Metric responses stay aggregate-only and every adapter forwards the same bounded filters. Retained sample, opportunity, saved-funnel, settings, and AnalyticsBundle generation/list/detail capabilities have API/CLI/MCP/web parity; generated OpenAPI includes each public operation. Organization inventory reads use stable cursors and explicit all-projects intent outside matching MCP list tools. Opportunity detail can generate a bundle directly from its ID, preserving exact evidence and relationships; completed generations return validated artifacts while pending/failed records return explicit state. Tier, disabled, unavailable, and analytics-lane failure states do not break incident debugging.
    Incident-impact journey sample IDs and hydrated representative journeys now require an exact internal project-scoped affected-session subject match, matching service/environment, transition, bounded window, and a completed unexpired artifact. This hash is not exposed through public journey-sample surfaces; legacy samples without it remain readable but cannot be selected for incident-impact replay.

Browser AnalyticsBundle capture exposes explicit bounded `analytics.marker()` calls, emits one `session_summary` before non-persisted page exit, and can opt into structural click actions through `analytics.trackActions`. Direct browser SDKs request a bounded project analytics block that can only restrict a local opt-in. Structural actions retain only a fixed key and safe route. Relay-mode SDKs remain credential-free; the relay accepts strict analytics envelopes and adds credentials only upstream. Back-forward-cache transitions do not count as exits. DebugBundle dogfoods this path in production with separate Site and App projects, `standard` first-party visitor mode, no consent gate, exact-origin browser tokens, and disabled automatic app route capture; the app router emits explicit stable templates and drops unknown identifier-shaped paths before analytics ingestion.

11. **Probe** — Always-on: probe ring-buffer data flushes alongside errors and attaches to bundles as `context.probe_data[]` (all tiers). Remote activation (paid tiers with `remote_probes` capability): agents activate probes via API/CLI/MCP or the project Probes web tab; backend SDKs poll config, browser/mobile SDKs use startup/lifecycle config checks plus ingestion-response `probe_directives`, and matching labels emit independent `probe_event` records; authenticated `GET /v1/sdk/config` supplies a per-project `trigger_token_key`; trigger tokens (`dbundle_probe_`) enable single-request/session activation via `_debug_probe` or `X-DebugBundle-Probe-Trigger` without waiting for passive directive refresh. Shared-project probe reads and activations must scope to the target project's owning organization rather than the acting collaborator's home organization.
12. **Act** — Repository-owned automation fetches the full bundle/reproduction (for example through the public `debugbundle/action@v1` GitHub Action), then analyzes the incident, proposes a patch, opens an issue, or creates a PR

---

## Tech Stack

| Layer           | Technology                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript (strict mode everywhere)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| API Framework   | Fastify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Database        | PostgreSQL (raw SQL + Zod typed parsing, no ORM)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| DB Bootstrap    | Authoritative clean-slate SQL bootstrap in `packages/storage/src/migrations.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DB Migrations   | Ordered forward schema evolution in `packages/storage/src/schema-migrations.ts`; deploys must migrate before API/worker consume new schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Object Storage  | S3-compatible object storage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Queue           | Redis + BullMQ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Monorepo        | pnpm + turborepo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Frontend        | React + Vite SPA on `app.debugbundle.com` (implemented auth/account + workspace Health Status + project-settings + projects/project-members + project-tokens + project-probes + project-webhooks + project-alerts + billing slices)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Public Site     | Static-exported Next.js + Fumadocs on `debugbundle.com` for marketing, MDX-backed `/docs` and `/blog`, `llms.txt`, `openapi.json`, schemas, and example artifacts. Marketing content authored: real landing page (hero, how-it-works, value props, interfaces overview, terminal example, OpenGraph), pricing page (Free/Solo/Team with tier features and shared-allowance model from `spec/tiers.md`), 4 blog posts, and substantive legal/informational pages (about, contact, privacy, terms, security, changelog). Documentation content authored per `spec/documentation.md` (65-page surface with Orama static search: getting started, SDKs, CLI, API, MCP, webhooks, probes, bundles, security, self-hosting, agent workflows). |
| Email           | Provider-backed transport via `packages/email` abstraction (auth, billing lifecycle, alert digest, weekly report, and operational owner-notification templates)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Runtime logging | Pino-backed structured JSON logs for API and worker internal operability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Billing         | Stripe SDK v20.4.1 (API version 2026-02-25.clover), webhook-driven sync, dynamic checkout/portal sessions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Domain          | app.debugbundle.com (SPA); api.debugbundle.com (API); debugbundle.com (static public site with marketing, docs under `/docs`, and blog under `/blog`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Hosting         | Environment-specific infrastructure is intentionally omitted from this public overview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Self-host       | Docker Compose (Web on localhost:5291, API on localhost:3004, Postgres on localhost:5434, Redis on localhost:6380, LocalStack S3 on localhost:4567, plus Worker) with hosted-parity auth/service boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Repository Structure

```
apps/
  api/           — Fastify HTTP API (ingestion + retrieval + first-party auth)
    src/
      server.ts              — Route composition (delegates to route modules)
      routes/
        health.ts            — GET /health, /ready (503 when dependencies degraded), /live
        account.ts           — Owner-scoped browser-session account export, cached-avatar retrieval/import, and destructive account deletion routes with phrase + email-OTP verification, collaborator-membership teardown on user deletion, and guards for external sole-owner/project-owner state
        auth.ts              — Web-auth signup, login, session, verification, password-reset, auth-method disclosure, and best-effort GitHub avatar import
        ingestion.ts         — POST /v1/events (with capture-policy enforcement)
        incidents.ts         — GET /v1/incidents, /v1/incidents/{id}, single + bulk resolve/reopen, bundle, reproduction, logs
        services.ts          — GET /v1/services
        alerts.ts            — Alert rule CRUD
        slack.ts             — Slack OAuth connect flow plus reusable destination list/delete routes for project alerts
        billing.ts           — Owner-scoped billing summary and allowance-capacity management (browser session or member token), plus browser-only checkout/portal entry points
        projects.ts          — Project list/create/update/delete, optional color-tag metadata, and owner-only destructive operations
        probes.ts            — Probe activation/deactivation/listing
        availability-checks.ts — Hosted health-check CRUD, retained results/rollups, and side-effect-free target tests
        admin-analytics.ts   — Internal browser-session-only aggregate product analytics summary route for the hosted `/analytics` page
        capture-policy.ts    — GET/PATCH /v1/projects/{id}/capture-policy
        analytics-settings.ts — GET/PATCH /v1/projects/{id}/analytics-settings for opt-in AnalyticsBundle capture/privacy/retention/custom-dimension settings
        github.ts            — GitHub App callback, installation webhook intake, installation status, project repo assignment, dispatch-rule CRUD, and dispatch-delivery history/retry routes
        github-marketplace-webhook.ts — GitHub Marketplace webhook intake for listing purchase/subscription tracking and install attribution
        tokens.ts            — Token lifecycle CRUD (project + member)
        webhooks.ts          — Webhook CRUD, synthetic test delivery, and delivery history retrieval
        weekly-report-channels.ts — Weekly report channel CRUD
        stripe-webhook.ts    — Stripe webhook ingestion (POST /v1/billing/stripe-webhook, signature verification, idempotency, entitlement recompute, and Stripe-period sync)
      ingestion-request-compatibility.ts — bounded authenticated-ingestion adapter for the exact installed Swift batch wrapper
      api-types.ts           — Shared API type definitions
      schemas.ts             — Zod request/response schemas
      slack-app.ts           — Slack OAuth state/cookie, redirect handling, and code exchange helpers
      openapi.ts             — API-owned OpenAPI 3.1 generator reused by the site/ artifact pipeline
      stripe-config.ts       — Stripe client factory, price-to-plan mapping, billing state derivation
      default-dependencies.ts — Dependency composition (wires storage/auth/queue, including account export artifact assembly for retained raw events, failure bundles, improvement bundles, and reproductions; deletion-safe account analytics + payment-retention wiring for account/billing/project/capture/GitHub flows; admin-only aggregate analytics gating via `ADMIN_ANALYTICS_ACCESS_EMAILS`; project AnalyticsBundle settings management; project-object cleanup on account deletion; queued webhook tests; dynamic Stripe checkout/portal sessions; and Stripe-backed capacity mutations)
      audit-logging.ts       — Fail-open audit log recording with actor-type resolution and request IP hashing
      runtime.ts             — Server bootstrap and graceful shutdown (conditionally wires Stripe webhook when env vars present)
      main.ts                — Entry point
  worker/        — BullMQ job processor (startup preflight validates DB/Redis/S3; internal health server on WORKER_HEALTH_PORT exposes /ready for Compose probes; also runs hosted availability-check scheduling/execution, analytics aggregation, incident bridging, and bounded OpenAI OAuth credential-retention maintenance when explicitly enabled)
  cli/           — CLI tool (login, setup with mixed-runtime service discovery/target selection/runtime-specific relay guidance, connect, ingest, watch, process, verify local/cloud including active synthetic triggers and app-event verification via `verify cloud --expect-app-event`, inspect, resolve, reopen, bundle, reproduce, project list/create/update/delete with optional color tags, project members list/invites/invite/cancel-invite/update-role/remove/leave, probe activate/list/deactivate, health checks list/get/create/update/delete/test/results, alerts, slack destination management, webhooks, weekly-report, capture-policy, analytics settings, analytics saved-funnel management, analytics summary/routes/devices/referrers/actions/funnel metrics, analytics journey sample reads, analytics opportunity reads, analytics bundle list/create/get, billing, github status/repos/repo set/repo remove/rules create/update/delete/deliveries)
  mcp/           — MCP server (publishable `@debugbundle/mcp` stdio package with `debugbundle-mcp` bin, MCP Registry `server.json`, capability-first ClawHub/Smithery skill metadata, and a repo-owned post-npm ecosystem release manifest for MCPB/official-registry/Smithery MCP + skill/ClawHub skill/OpenClaw plugin follow-through with bounded ClawHub discovery-query verification; thin adapter over shared clients and local CLI modules, including local incident lifecycle, project CRUD with optional color tags, project collaborator management including self-leave, billing, probe activation, hosted health-check management, capture-policy, analytics settings, saved-funnel management, analytics summary/routes/devices/referrers/actions/funnel metrics, analytics journey sample reads, analytics opportunity reads, analytics bundle list/create/get, Slack destination management, and GitHub installation/repo-assignment/dispatch-rule/delivery tools; source-of-truth stdio/OpenClaw tool catalog in split `tool-catalog*` modules; independently versioned OpenAI package/submission/release evidence under `apps/mcp/openai/`)
  openclaw-plugin/ — OpenClaw tool plugin package (`@debugbundle/openclaw-plugin`) that projects the MCP tool catalog as `debugbundle_*` OpenClaw tools, converts MCP Zod schemas to TypeBox-compatible metadata, delegates execution to the MCP default tool registry, and marks mutation tools optional for OpenClaw allowlist safety
  web/           — React + Vite SPA on app.debugbundle.com (implemented auth/account + workspace Health Status + project Analytics overview/routes/funnels/audiences/journeys/opportunities/bundles with retained journey, aggregate opportunity, and privacy-bounded AnalyticsBundle detail + project-settings, including owner/admin AnalyticsBundle capture/privacy/retention/custom-dimension and saved-funnel controls with member preview + projects/project-members with collaborator self-leave + project-tokens + project-probes + project-webhooks + project-alerts + billing slices; reusable shadcn-based UI; explicit local-only OpenAI UI preview harness)
  public-site/   — [MOVED TO site/ at repo root] Next.js static-exported public site for debugbundle.com
packages/
  mcp-core/      — Transport-neutral exact twenty-three-tool OpenAI catalog, strict schemas, output projection/sanitization, and injected read-only handler factory
  log-parser/    — Shared log-parser registry with canonical `debugbundle-ndjson` handling plus first-party adapter parsers (`php-error`, `apache-error`) that convert input text into `EventEnvelope[]`
    src/
      app.tsx                — Protected shell and non-project route composition; delegates the shared browser/test project route tree to `app-project-routes.tsx`
      main.tsx               — Browser entry point
      lib/api.ts             — Compatibility barrel for cookie-backed browser API functions; focused Analytics and artifact/lifecycle adapters live in `lib/api-analytics.ts` and `lib/api-artifacts.ts`, with shared additive-field normalization in `lib/api-record-normalizers.ts`
      lib/slack-api.ts       — Browser Slack connect/install-url helper plus reusable destination listing for the alerts UI
      lib/session.tsx        — Session bootstrap, refresh, and context state
      lib/theme.tsx          — Light/dark/system theme state and DOM synchronization
      components/ui/         — shadcn-based UI primitives used across the app
      pages/settings-page.tsx — Account settings page with auth-method-aware password management, explicit Gravatar import, account export, and destructive account deletion controls gated by an exact confirmation phrase plus email OTP
      components/system/     — App shell, page headers, callout cards, theme toggle, reusable user-avatar primitive, reusable plaintext secret reveal, and billing display primitives

packages/
  storage/       — Storage adapters and domain persistence
    src/
      index.ts               — Barrel re-export (public API)
      types.ts               — Shared storage type definitions plus compatibility re-exports
      queue-types.ts         — Redis queue client interfaces and typed job payload contracts
      alert-types.ts         — Alert management, retention sampling, and alert-delivery contracts
      operations-types.ts    — Weekly report, operational email, account/project/GitHub/webhook contracts
      helpers.ts             — Object key builders, token hashing
      auth-store.ts          — Postgres auth persistence (account creation, passwords, sessions, verification/reset tokens, linked auth-method disclosure, and per-session login-method tracking for security-sensitive gates)
      account-store.ts       — Postgres account export aggregation for retained organization/project records and account-deletion lifecycle persistence, including deletion-safe analytics/payment-retention handoff before destructive cleanup
      account-analytics-store.ts — Postgres deletion-safe account analytics ledger, internal month/year/lifetime query helpers, aggregate admin analytics summary reads, best-effort retained-row backfill, and payment/provider retention snapshot persistence for deleted accounts
      integration-secret-crypto.ts — Shared encryption/decryption helpers for stored integration secrets such as Slack webhook URLs
      metadata-store.ts      — Postgres metadata store (incidents, projects, tokens, probes, alerts, capture-policy/rule and GitHub rule mutation flows, remote probes, and project dashboard metrics that floor monthly raw ingestion against durable project counters)
      availability-check-store.ts — Postgres availability-check CRUD, execution claiming/recording, incident linking, and 30-day result/rollup retention
      slack-destination-store.ts — Postgres reusable Slack destination CRUD and worker delivery-secret lookup
      billing-store.ts       — Postgres billing summary queries, allowance aggregation, and durable organization/project monthly usage counter writes
      billing-sync-store.ts  — Postgres billing sync persistence (Stripe webhook idempotency, entitlement writes, customer-org linking)
      alert-delivery-store.ts — Postgres alert evaluation and delivery-intent persistence
      webhook-delivery-store.ts — Postgres webhook delivery persistence
      weekly-report-channel-store.ts — Postgres weekly-report channel CRUD + scheduler lookup
      weekly-report-delivery-store.ts — Postgres weekly-report delivery-intent persistence
      audit-log-store.ts     — Postgres audit log persistence (create, query by organization/action/time range)
      retention-store.ts     — Postgres tier-aware retention cleanup service (sampled debug event expiry by organization tier plus analytics raw/journey sample/AnalyticsBundle artifact/aggregate expiry)
      frequency-counter.ts   — Redis rolling frequency counter (1m/5m/1h/24h)
      ingestion-rate-limiter.ts — Redis-backed per-token ingestion admission control
      ingestion-services.ts  — Ingestion metadata, member auth, persistence services
      analytics-rollup-store.ts — Postgres analytics ingestion ledger and idempotent hourly/daily session, route, action/conversion/marker, and funnel rollup writes
      analytics-usage-store.ts — Durable internal analytics allowance counters with atomic claim/release for hosted event/session, retained journey sample, and AnalyticsBundle generation quota checks
      analytics-settings-store.ts — Postgres AnalyticsBundle settings reads and merge-upserts for project opt-in/privacy/retention/custom-dimension settings
      analytics-saved-funnel-store.ts — Postgres saved-funnel definition lifecycle with project-scoped reads, soft archival, and transactionally enforced active-definition limits
      s3-client.ts           — S3-compatible object store adapter
      redis-queue.ts         — Redis queue client (enqueue/dequeue)
      migrations.ts          — Authoritative bootstrap schema + required-table manifests
        schema-migrations.ts   — Ordered forward migrations + ledger/checksum readiness assertions for existing databases
  sdk-node/      — [MOVED to debugbundle-js repo] Node.js SDK (vanilla hooks + pino/winston/bunyan + Express/Fastify/Next.js), browser relay handler (subpath exports: /relay, /relay/express, /relay/fastify, /relay/nextjs)
  sdk-browser/   — [MOVED to debugbundle-js repo] Browser SDK (global errors, standalone/error-only breadcrumbs, preset-aware first-party request_event promotion, probes, session controls, config fetch, network filters, trace headers, unload-safe flush, retained-buffer retry/backoff, and opt-in AnalyticsBundle session/page/route/action/funnel/conversion capture)
  — All SDK repos (separate repositories under github.com/debugbundle/):
  — debugbundle-js     → github.com/debugbundle/debugbundle-js (JS SDK repo now live: sdk-node + sdk-browser; shared-types/redaction remain core-owned published dependencies for now)
  — debugbundle-python → github.com/debugbundle/debugbundle-python (Python SDK: Django + Flask + FastAPI + optional structlog/loguru capture)
  — debugbundle-php    → github.com/debugbundle/debugbundle-php (PHP SDK: Laravel + Symfony + remote config / capture policy)
  — debugbundle-java   → github.com/debugbundle/debugbundle-java (Java SDK: core SDK + servlet/JAX-RS app-server adapters + Spring Boot MVC starter + javaagent bootstrap)
  — debugbundle-ruby   → github.com/debugbundle/debugbundle-ruby (Ruby SDK: Rails + Rack + Sidekiq; release-ready local standalone repo)
  — debugbundle-go     → github.com/debugbundle/debugbundle-go (published Go SDK with core, secure transports, relay, net/http, Gin, Echo, slog, zap, zerolog, remote config, probes, examples, CI, and release workflow)
  — site               → github.com/debugbundle/site (public docs/blog/marketing site)
  — Wave 2/3 SDKs → separate repos per `spec/sdk-language-targets.md`; .NET 1.3.0 and the coordinated Android, Swift, and React Native 1.2.0 line are published. These releases implement canonical connected delivery, per-event acknowledgements, universal `beforeSend`, object-wrapped probes, and the native RN event/policy/probe/config boundary. Kotlin server, Rust, and Dart/Flutter remain future work.

sdks/                    — Local standalone SDK clone roots managed by `sdks.json` and `scripts/bootstrap-sdks.sh`
  debugbundle-js/        — github.com/debugbundle/debugbundle-js (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-python/    — github.com/debugbundle/debugbundle-python (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-php/       — github.com/debugbundle/debugbundle-php (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-wordpress/ — github.com/debugbundle/debugbundle-wordpress (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-java/      — github.com/debugbundle/debugbundle-java (public standalone repo; Java core SDK, servlet/JAX-RS app-server adapters, Spring Boot starter, and javaagent bootstrap)
  debugbundle-go/        — github.com/debugbundle/debugbundle-go (local standalone repo; net/http, Gin, Echo, logging integrations, relay, probes, and Go release prep)
  debugbundle-ruby/      — github.com/debugbundle/debugbundle-ruby (local standalone repo; Rails, Rack, Sidekiq, Logger, relay, probes, and RubyGems release prep)
  debugbundle-android/   — github.com/debugbundle/debugbundle-android (local standalone repo; Android runtime/module slice implemented and green under Docker-backed `make test`)
  debugbundle-swift/     — github.com/debugbundle/debugbundle-swift (local standalone repo; Swift iOS SDK foundation, SwiftPM package products, and CocoaPods `DebugBundle` pod publishing)
  debugbundle-react-native/ — github.com/debugbundle/debugbundle-react-native (published npm SDK; RN TypeScript facade plus Android/iOS native wrapper glue and clean RN app smoke lanes)
  (older local checkouts may still carry pre-cutover `sdks/` directories on disk until they are manually removed and re-bootstrapped)

.local-repos/            — Ignored companion clones for less-frequent non-core repos when working from the core root
  action/                — github.com/debugbundle/action (real standalone repo clone for direct repo work)
  other companion repos/ — ignored local clones used only when needed outside the core product workspace

.local-notes/            — Ignored local operator notes and temporary workspace-only checklists

site/                    — Real standalone clone of github.com/debugbundle/site kept at the repo root
                           for day-to-day documentation and marketing work. The core repo ignores this
                           path locally and can still refresh vendorable artifacts into `site/public/`
                           through `scripts/public-site-artifacts.ts` before running site-local commands.
                           AnalyticsBundle public guidance lives here across concept/privacy/self-hosting,
                           browser SDK, CLI, API, MCP, navigation, search, and agent-discovery surfaces.

  bundle-engine/ — Deterministic bundle assembly
  analytics-bundle-engine/ — Deterministic AnalyticsBundle artifact shaping
  repro-engine/  — Reproduction artifact generation
  runtime-logger/ — Shared Pino-backed structured logger for API and worker runtime surfaces
  event-normalizer/ — Event validation, normalization, fingerprinting
  shared-types/  — Zod schemas, TypeScript types, constants, tier capabilities
  auth/          — Sessions, passwords, verification, token validation/generation, auth middleware
  redaction/     — Sensitive data scrubbing
  token-management/ — HTTP client for token lifecycle (shared by CLI/MCP)
  project-management-client/ — HTTP client for project lifecycle selection/creation/deletion used by CLI and MCP parity flows
  billing-client/ — HTTP client for billing summary and allowance-capacity management shared by CLI and MCP parity flows
  retrieval-client/ — HTTP client for retrieval parity surfaces shared by CLI/MCP
  weekly-report-client/ — HTTP client for weekly-report channel parity surfaces shared by CLI/MCP
  alert-client/    — HTTP client for alert-rule parity surfaces shared by CLI/MCP
  webhook-client/ — HTTP client for webhook lifecycle + synthetic test-delivery parity surfaces shared by CLI/MCP
  github-client/   — HTTP client for GitHub automation management (installation status, repo assignment, dispatch-rule CRUD, delivery history, and delivery retry) shared by CLI/MCP
  email/         — Email template rendering + provider transport adapter

tests/
  vitest.setup.ts              — Global test setup
  helpers/                     — Shared test utilities
  fixtures/                    — Golden fixture files
  apps/{api,cli,mcp,web,worker}/ — Per-app test suites
  packages/{auth,storage,sdk-node,...}/ — Per-package test suites
  integration/                 — Docker-backed ingestion integration tests
  contracts/                   — Cross-cutting contract and parity tests
  infrastructure/              — CI wiring and migration script tests

infra/
  docker/        — Local dev Docker setup
  migrations/    — DB migrations (product code)

deploy/
  selfhost/      — Docker Compose + env template for self-hosting and local hosted-parity setup

github-actions/  — Reference GitHub Action scaffolds for repository_dispatch automation (`action`)
examples/        — Example applications plus checked-in GitHub Actions workflow examples (`github-actions/basic.yml`, `agent-capable.yml`, `issue-creation.yml`)
.agents/         — Agent skill definitions and reusable agent tooling (`skills/debugbundle/`, `skills/design-discipline/`, `skills/shadcn/`, `skills/pre-ship-review/`, `skills/post-phase-reconciliation/`, `skills/session-handoff/`)
docs/            — Public documentation
post-v1/         — Deferred future-planning artifacts kept separate from active V1 specs
scripts/         — Dev/CI utility scripts
```

### User Project Structure (created by `debugbundle setup`)

```
.debugbundle/
  profile.json                — Committed — project description (static detection + agent enrichment, validation_status)
  local/
    events/                    — Gitignored — raw SDK file-transport events
    browser-relay-spool/       — Gitignored — browser relay durable delivery spool plus `.delivered` sidecars for successful cloud forwards (connected mode)
    state.json                 — Gitignored — processing watermark, incident index
    connection.json            — Committed — delivery policy per environment, cloud connection config
  bundles/
    local/                     — Gitignored — locally captured and processed bundles
    cloud/                     — Gitignored — cloud-fetched artifact cache

.agents/
  skills/
    debugbundle/
      SKILL.md                 — Committed — agent skill (agentskills.io spec)
      references/
        cli.md                 — Committed — CLI command reference
        mcp.md                 — Committed — MCP tool reference
        bundle-schema.md       — Committed — bundle contract reference
        profile-enrichment.md  — Committed — agent profile validation workflow
      assets/
        schemas/               — Committed — local analysis recipe schemas
      evals/
        evals.json             — Committed — evaluation fixtures
```

`debugbundle setup` is the single public onboarding entrypoint. `debugbundle validate --fix` restores missing generated scaffold files and refreshes stale managed skill/reference/schema/eval files to match the current CLI templates without overwriting `.debugbundle/profile.json`. When setup detects both DebugBundle browser and node SDKs alongside a supported backend framework, it scaffolds the browser relay route (`debugbundle/browser`) into the user's Fastify or Express server entrypoint or creates a Next.js App Router relay route file; same-origin remains the simplest default, and split frontend/backend deployments must route both `OPTIONS` and `POST` to the relay with explicit allowed origins. Python, PHP, and WordPress relay setup must stay aligned through SDK docs or setup helpers until CLI detection covers those ecosystems. The `debugbundle init` scaffold helper remains an internal implementation detail and is no longer part of the public CLI contract.

See `/spec/local-first-onboarding.md` for the full artifact layout rationale.

**Repo strategy:** This workspace is now the public `debugbundle/debugbundle` core checkout. The public `debugbundle-js`, `debugbundle-python`, and `debugbundle-php` repos exist as separate org repos and are pulled into `sdks/` only as real local clones when needed. The public site repo now lives as a real local clone at the root `site/` path, while lower-touch companion repos such as `debugbundle/action` stay under ignored `.local-repos/` clones. `shared-types` and `redaction` remain core-owned published libraries because product code still has meaningful direct source coupling to them here, and core now owns only their stable release workflow. `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` now publish from the dedicated `debugbundle/debugbundle-js` repo workflow instead of the core workspace, while the core workspace continues to dogfood published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. The production release train publishes dependency roots before dependent packages: shared packages first, JS SDK family second, then dependent wrappers such as WordPress. After registry publish, bump the dogfooding manifests in the root app, hosted SPA, and public site before hosted validation or deploy. The independently versioned OpenAI plugin is source-owned under `apps/mcp/openai/` and cannot be coupled to npm MCP publication. Environment-specific deployment and operations details remain in ignored `.local-repos/debugbundle-cloud`: that companion owns production env rendering, Caddy/two-slot rollout, image publication, monitoring, and retention, including the implemented dual-host atomic promotion and MCP-only route-gate source. Core owns product routes, domain readers, OAuth contracts/storage migrations, fixtures, and package source. The owner-approved production activation is recorded as deployment evidence, while portal submission/publication remain outside repository automation. Older long-lived local checkouts may still need one manual cleanup of pre-cutover `sdks/` directories before first bootstrap.

---

## Key Invariants (Quick Reference)

1. **Bundle determinism** — same events → same bundle output, always
2. **SDK never crashes host** — all SDK failures caught internally
3. **Redaction before storage** — sensitive data scrubbed before persistence
4. **Processing idempotency** — all worker jobs safely re-runnable
5. **Interface parity** — API = CLI = MCP capabilities
6. **Tokens hashed at rest** — plaintext shown once, stored as SHA-256
7. **Webhook signing** — HMAC-SHA256 on all outgoing payloads
8. **Auth split by client type** — SPA uses cookie sessions, CLI/stdio MCP/OpenClaw use member tokens, SDKs use project tokens, and the official OpenAI-hosted MCP resource uses audience-bound OAuth access tokens; none are interchangeable. Member-authorized routes may accept either browser sessions or member tokens, but project-scoped actions must converge on the same explicit per-project access checks. Project invite acceptance is browser-session-authenticated against the signed-in user's email and creates `project_members` access without adding the invitee to the owner's billing/account container. GitHub auth now has two additive tracks: browser redirect auth through `GET /v1/auth/github/start` and `GET /v1/auth/github/callback`, plus CLI bootstrap through `POST /v1/auth/github/device/start|poll|claim` and `POST /v1/auth/github/token/exchange`, both of which ultimately issue the same member-token auth state used by CLI and stdio MCP. Google sign-in remains deferred (see `/spec/auth-architecture.md`)
9. **Event class billing integrity** — Free counts only `incident_signal`, paid counts `incident_signal` + `context_signal`, `operational_signal` excluded all tiers; `event_class` immutable after normalization (INV-15)
10. **Capture policy and capture-rule server-side enforcement** — ingestion API rejects events violating project capture policy with `capture_policy_rejected`, and applies project capture rules before persistence so matching events can be dropped, sampled out, or demoted deterministically (INV-16)
11. **Relay wire format alignment** — browser relay output uses the same file format as server SDK file transport; `debugbundle process` consumes relay-written files without special-casing (INV-17)
12. **Relay credential isolation** — browser SDK never possesses cloud credentials; relay handler attaches server-side project token before forwarding (INV-18)
13. **Relay origin validation** — all relay handlers validate Origin header against developer-configured allowlist before processing (INV-19)
14. **GitHub credential separation** — GitHub OAuth tokens for identity only; repository automation uses App installation tokens exclusively; App private key is env-var-only, never in DB (INV-20)
15. **Dispatch payload data minimization** — repository_dispatch payloads contain summary fields and API links only; no full bundles, raw events, or sensitive data (INV-21)
16. **Dispatch cooldown enforcement** — per-fingerprint cooldown per rule prevents noise amplification; minimum 60s floor (INV-22)
17. **GitHub App webhook verification** — all incoming GitHub App events verified with HMAC-SHA256 before processing (INV-23)

---

## Pricing

See `/spec/tiers.md` for the finalized source-of-truth. Three tiers: **Free → Solo → Team**.

Event billing uses the event class model: Free meters only `incident_signal` events (Class A — exceptions, qualifying logs, and immediate request failures), paid tiers meter `incident_signal` + `context_signal` (Class A + B), and `operational_signal` (Class C) is excluded from billing across all tiers. Each project has a capture policy (preset: `minimal`/`balanced`/`investigative`) that controls what the SDK captures and the ingestion API accepts, plus project-scoped capture rules that can manually `demote`, `sample`, or `drop` known noisy patterns after they appear in real incidents. Capture rules are managed through API, CLI, MCP, and web project settings; incident-derived suggestions report matching existing rules and create-from-suggestion is idempotent so repeated applies return the existing rule instead of duplicating it. The capture policy still defines the default request-failure behavior, including `immediate_client_error_statuses` for status-wide `4xx` promotion and `immediate_client_error_path_rules` for narrow status+path+method promotion. All current tiers default to `balanced`, which treats 408/423/424/425/429 request failures as immediate incident signals; `investigative` additionally defaults the client-error incident override to `401/403/409/422`. Unpromoted `4xx` responses such as generic 404s remain non-incident telemetry/context when captured.

|                     | Free                                  | Solo ($2.99/mo)                    | Team ($19/mo)                      |
| ------------------- | ------------------------------------- | ---------------------------------- | ---------------------------------- |
| Projects            | Unlimited                             | Unlimited (+$0.99/capacity unit)   | Unlimited (+$1.99/capacity unit)   |
| Members             | 1 (owner only)                        | 1 (solo only)                      | 5                                  |
| Bundle retention    | 7 days                                | 30 days                            | 90 days                            |
| Raw event retention | 7 days                                | 14 days                            | 30 days                            |
| Bundle types        | Failure + local analysis              | Failure + Improvement (cloud)      | Failure + Improvement (cloud)      |
| Improvement engine  | Local (user's LLM via skill-layer)    | Cloud (automated) + local analysis | Cloud (automated) + local analysis |
| Probes              | Always-on (ring buffer + error-flush) | Always-on + remote activation      | Always-on + remote activation      |
| Shared dashboards   | —                                     | —                                  | ✅                                 |
| GitHub automation   | —                                     | ✅ (3 rules/project, 7d history)   | ✅ (20 rules/project, 30d history) |
| Member invites      | —                                     | —                                  | ✅                                 |
| Slack integration   | —                                     | —                                  | ✅                                 |

---

## License

AGPLv3 — open-core model. Same code for cloud and self-host. Trademark protected.

This working tree is now the public core repo checkout. Local multi-repo convenience comes from a root-level `site/` clone, ignored `.local-repos/` and `.local-notes/` workspace areas, plus bootstrap-managed SDK clones under `sdks/`.

---

## Status

**Production.** DebugBundle is live with installed projects. Backwards compatibility, forward migrations, deprecation discipline, and documented major-version upgrade paths are mandatory for public interfaces and persisted data.
