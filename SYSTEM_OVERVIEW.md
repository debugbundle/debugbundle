# SYSTEM OVERVIEW — DebugBundle

> Context-compression file for agent session recovery.
> If this file conflicts with `/spec/*`, `/contracts/*`, or `/rules/*`, those win.

---

## What Is DebugBundle?

The core artifact is the **Debug Bundle** — a deterministic, versioned (`bundle_version: 1`), privacy-aware package of debugging context for a single incident. The bundle schema includes per-context block versioning (`version: 1` on each context block) to enable independent evolution. Context blocks include `error`, `request`, `response`, `logs`, `frontend`, `environment`, `deploy`, `runtime`, `git`, `dependencies`, `probe_data`, and `device` (browser-only: UA, browser, OS, device type, screen, viewport, touch, locale, connection, color scheme).

### Canonical Primitives

The system is built around three primitives: **bundle** (versioned debugging artifact with `bundle_version: 1`, `captured_at`, `sdk`, expanded `summary`, `context.runtime`, `context.git`, wrapped array blocks), **incident** (fingerprint-grouped event container), and **profile.json** (project configuration). All features operate on these primitives. Hosted improvement automation now also has a project-scoped settings surface that controls whether deterministic improvement generation is enabled and which sensitivity mode (`high_confidence`, `balanced`, `verbose`) applies on eligible paid tiers, plus first-class `improvement_opportunities` rows. Request/log improvement opportunities can produce `bundle_type: "improvement"` artifacts stored separately from incident failure bundles; below-threshold request/log candidates remain internal counting state until a bundle is attempted/generated. Incident-derived opportunities carry `related_incident_ids`, point agents at the existing failure bundles instead of duplicating that context, and auto-resolve once all related incidents are resolved.

---

## System Shape

DebugBundle supports two runtime modes: **local-only** (no cloud account required, SDK writes to filesystem, CLI processes locally) and **connected** (cloud ingestion, team features, alerts). Local-only is the default starting point; connected is an upgrade path. See `/spec/local-first-onboarding.md`.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SDK Layer                                │
│  JS SDK monorepo (debugbundle/debugbundle-js):                  │
│    @debugbundle/sdk-node, @debugbundle/sdk-browser              │
│  JS packages still published from core today:                   │
│    @debugbundle/shared-types, @debugbundle/redaction            │
│  Completed non-TS/integration pre-launch scope:                 │
│    debugbundle-python, debugbundle/sdk-php,                     │
│    debugbundle-wordpress, com.debugbundle Java SDK,             │
│    debugbundle Ruby SDK, github.com/debugbundle/debugbundle-go  │
│  Published mobile SDK surface:                                  │
│    github.com/debugbundle/debugbundle-android is on Maven       │
│    Central at 0.1.2 with core/runtime, OkHttp/Ktor, Navigation, │
│    Compose, Timber, offline queueing, crash/ANR replay, and     │
│    remote probes;                                               │
│  Wave 2 (post-launch; C# published): C#, Kotlin                │
│    server, Rust                                                │
│  Wave 3 (post-launch; remaining mobile expansion):             │
│    Swift iOS now has a local standalone repo with core         │
│    capture, bundle/runtime config resolution, offline          │
│    queueing, HTTP transport, lifecycle breadcrumbs, explicit   │
│    URLSession instrumentation (wrapper +                       │
│    URLProtocol/configuration paths), SwiftLog integration,     │
│    capture-policy enforcement, remote probes, Objective-C      │
│    exception bridging, bounded next-launch crash replay, and   │
│    CocoaPods `DebugBundle@0.1.1`;                             │
│    React Native now has a published npm SDK with               │
│    TypeScript facade, network/navigation/React helpers, Expo   │
│    plugin, Android + iOS native wrapper glue, and clean RN     │
│    app smoke coverage;                                        │
│    Dart/Flutter follows later                                  │
│  See spec/sdk-language-targets.md for full rollout plan         │
│  Universal interface: init, captureException, captureError,     │
│  captureLog, captureRequest, captureMessage, setContext, flush,  │
│  probe, status, lastEventAt                                     │
│  Vanilla hooks + stdlib/structlog/loguru logger auto-detection  │
│  + framework integrations                                       │
│  Always-on probe ring buffer; config polling (paid tiers, 60s)  │
│  Transport: file (local/dev) or HTTP (staging/prod connected)   │
│  Browser relay: POST to user's backend relay handler             │
└────────────┬───────┬─────────────────┬──────────────────────────┘
             │       │ Browser relay    │ POST /v1/events (batched)
  File tpt   │       │ (same-origin)    │ (staging/prod connected)
  (local/dev)│       │                  │
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
│   normalize → classify (event_class) → group/fingerprint →     │
│   hosted improvement evaluation (warnings + request patterns) →│
│   build-bundle → build-reproduction → evaluate-alerts →         │
│   deliver-alert-email-digest → deliver-webhook →                │
│   deliver-operational-email → generate-weekly-report →          │
│   cleanup-retention                                             │
└──────────┬───────────────┬──────────────────────────────────────┘
           │               │
    ┌──────▼──────┐  ┌─────▼──────┐
    │ PostgreSQL  │  │ S3-compatible│
    │ (metadata)  │  │ storage    │
    └──────┬──────┘  └─────┬──────┘
           │               │
┌──────────▼───────────────▼──────────────────────────────────────┐
│                    Retrieval Layer                              │
│   HTTP API    │    CLI    │    MCP Server                       │
│   (same domain services underneath — interface parity)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Lifecycle

1. **Capture** — SDKs intercept errors, exceptions, HTTP requests/responses, logs (in-process via logger handlers), console, DOM, navigation events. SDKs respect the server-side capture policy and project capture rules (fetched via `GET /v1/sdk/config`) which control what event types are captured, incident-eligible, demoted, sampled, or dropped. Browser SDKs locally enforce `demote`, `sample`, and `drop`, collect device/browser metadata (UA, OS, screen, viewport, touch, locale, connection type) on `init()`, preserve browser-native `window` error metadata for opaque global and resource-load failures, keep breadcrumbs local by default for exception attachment, optionally ship standalone `frontend_breadcrumb` events, apply local network filters plus per-event `sampleRate` / `logLevel` controls to independent browser events, capture rejected `fetch()` calls as failed network breadcrumbs, promote first-party `fetch`/XHR responses that match the current preset's immediate request-failure set or the resolved client-error incident override to standalone `request_event` incident signals while retaining the network breadcrumb (5xx under every preset; `balanced`/`investigative` also 408/423/424/425/429; `investigative` also 409; projects may additionally promote selected `4xx` such as 401/403/422), preserve preset-enabled request-anomaly candidates as contextual `request_event` signals when request failure context is enabled, locally suppress repeated exception/log/request storms with `error_suppressed` checkpoints, and inject `X-DebugBundle-Trace-Id` into wrapped browser requests for frontend/backend correlation. Node SDKs now also locally enforce `drop` and sampled-out `sample` decisions before buffering, while `demote` remains a server-side backstop for backend runtimes until a richer local context-preservation path exists. `probe()` calls buffer data locally in per-label ring buffers (always-on, all tiers).
2. **Ship** — SDK batches events, deduplicates, redacts sensitive data. In connected mode: sends to cloud ingestion API. In local-only mode: server-side SDKs write events to `.debugbundle/local/events/` via file transport (atomic temp-file + rename). Browser SDKs ship events through a backend relay handler (`POST /debugbundle/browser`) hosted on the user's backend; same-origin relay paths are inferred automatically, while split frontend/backend deployments use explicit browser `transportMode: "relay"` with an absolute backend relay URL plus relay-provided CORS preflight handling and relay `allowedOrigins`. The relay validates, sanitizes, and writes events to `.debugbundle/local/events/` (local-only mode) or spools them to `.debugbundle/local/browser-relay-spool/` for durable forwarding (connected mode). Static-only browser deployments may use direct cloud ingestion with a public write-only project token and optional per-token `allowed_origins` enforcement on `/v1/events` and `/v1/sdk/config`; this reduces browser copy/paste abuse but is not a secret boundary because non-browser clients can spoof `Origin`. V1 full relay handlers are implemented across Node.js (Express, Fastify, Next.js), Python (Django, Flask, FastAPI), PHP (Laravel, Symfony), WordPress REST relay integration, Java Spring Boot, Java servlet/JAX-RS app-server adapters, Go net/http, and Ruby Rack/Rails. All relay-compatible surfaces use the same canonical `application/json` + `batch` request shape, allowed `OPTIONS` preflight response shape, credential isolation, correlation passthrough, local file format, durable spool contract, and connected forwarding model. Log-based capture (`debugbundle ingest`/`watch`) is an alternative input path that parses existing log files through the shared `packages/log-parser` registry into the same event format; `debugbundle-ndjson` is the canonical structured interchange format for any runtime that can already emit JSON lines, while the accepted first-party adapter formats currently include selected existing server log formats such as PHP and Apache. Local watch writes deterministic local event batches, while connected `debugbundle watch --cloud` ships appended batches directly to `POST /v1/events`.
3. **Ingest** — (Connected mode) API validates, enforces capture policy, evaluates capture rules (`capture_rule_dropped` / `capture_rule_sampled_out` when applicable), redacts, persists accepted raw events to object storage, and enqueues processing with the resolved capture preset plus resolved client-error incident statuses so worker-side request classification stays deterministic. Demotion is enforced again in processing as a backstop. No synchronous incident/grouping persistence in request path. (Local mode) `debugbundle process` reads events from `.debugbundle/local/events/` and composes the same pure-function packages (event-normalizer, bundle-engine, repro-engine) to produce bundles locally; when operators pass `--preset`, the CLI reprocesses the full local event set under the requested request-failure policy and synthesizes local request-anomaly incidents with the same thresholds as the cloud path.
4. **Normalize & Classify** — Worker parses raw events into canonical form and assigns `event_class` (`incident_signal`, `context_signal`, `operational_signal`). Classification is immutable after normalization. Exceptions, `error`/`fatal`/`critical` logs, and request events in the preset-specific immediate request-failure set are incident signals; other request events remain context. A separate request-anomaly evaluator may open a `request_failure` incident from repeated contextual request failures, but it does so without mutating the normalized event's `event_class`. Free-tier billing counts only `incident_signal` events.
5. **Evaluate Improvements** — During normalization and incident grouping, eligible Solo/Team/self-host projects with automated improvements enabled run deterministic hosted improvement evaluation. V1 promotes repeated `warning`-level `log_event` patterns, repeated `request_event` slow-request and contextual request-failure patterns, recurring incidents, and post-deploy incident regressions into first-class `improvement_opportunities`. Request/log candidates below their configured sensitivity threshold remain internal counting state and are excluded from default improvement lists; common low-value external-probe 404 routes are skipped. Request/log opportunities sample representative source events where available, emit a hosted `BundleV1` artifact with `bundle_type: "improvement"` when the configured sensitivity threshold is crossed, and apply the same retained-bundle cap pruning as failure bundles so hosted improvement artifacts share one account-wide retained inventory. Incident-derived opportunities are priority/navigation records with `related_incident_ids`; agents should fetch those incident failure bundles for debugging context, and incident lifecycle resolution auto-resolves the related improvement once all linked incidents are resolved.
6. **Group** — Worker `group-incident` jobs fingerprint and assign incident-driving events to incidents, persist incident/event linkage, keep full-detail raw-event retention bounded (first occurrence, latest occurrence, first occurrence after each deploy, highest-severity occurrence, plus deploy metadata) while demoting other occurrences to summary-only metadata, track rolling frequency counters in Redis (1m/5m/1h/24h), detect spikes (5m/1h ratio ≥ 3.0), detect preset-aware request anomalies from repeated contextual request failures, and detect regressions (event on resolved incident). Incident states: open → resolved → regressed.
7. **Bundle** — Worker assembles deterministic debug bundle from incident context via `packages/bundle-engine`
8. **Reproduce** — Worker generates reproduction artifacts (steps, commands, curl)
9. **Notify** — Worker resolves matching enabled webhook endpoints (`agent_webhooks`) by event + filters (including `bundle_type` and `is_verification` filter evaluation), gates new lifecycle webhook intents against the owning organization's shared `monthly_webhook_deliveries` allowance, persists delivery intents, claims due deliveries by `next_attempt_at`, executes real HTTP `deliver-webhook` attempts with per-delivery HMAC-SHA256 signatures, and tracks retry-state transitions (`pending` -> `retrying` -> `delivered`/`failed`/`disabled`) with observability fields (`last_response_code`, `last_attempted_at`, `last_error`). After 50 consecutive final delivery failures for a webhook, the webhook is automatically disabled by setting `agent_webhooks.is_enabled = false` so repeated failures stop consuming worker capacity until an operator re-enables it; that transition now queues a durable operational email delivery instead of sending inline. Allowance threshold notifications (80% warning / 100% reached) and retention-rotation notices also use the same `operational_email_deliveries` ledger with dedupe and retry semantics, so ingestion, bundle generation, alerts, probes, and webhook fanout can enqueue notifications without blocking their primary path. Failed/disabled deliveries can be manually retried via `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` (API), `webhook retry` (CLI), or `retry_webhook_delivery` (MCP). The lifecycle webhook publisher emits `bundle.created` on first occurrence (occurrence_count === 1), `bundle.updated` on subsequent threshold occurrences, `bundle.reopened` on regressions, `bundle.resolved` on explicit incident resolution, and now `improvement_bundle.created` when a hosted improvement bundle is first persisted, with enriched payloads containing event, service, links, summary, bundle_type, and verification fields. The worker also enqueues `evaluate-alerts` jobs from real incident transitions, matches enabled `alert_rules`, persists idempotent immediate-delivery `alert_deliveries` rows for non-email channels, and aggregates email alerts into fixed 10-second `alert_email_digests` plus `alert_email_digest_items` queues so bursty incidents ship as one digest email per project+recipient. Non-email alert delivery still executes across `slack` (either direct webhook POST with Block Kit or reusable connected-destination resolution via encrypted `slack_destinations`), `discord` (webhook POST with embeds), and `webhook` (raw JSON POST to target URL), while digest email delivery uses the shared `packages/email` transport abstraction. Weekly reporting now shares that worker lane end-to-end: project creation seeds one enabled owner-recipient email `weekly_report_channels` row by default (browser-created projects use the browser timezone, other creation paths fall back to UTC), project settings can edit or disable that email report, runtime scheduler evaluates each enabled channel in its configured timezone/day/hour, only active projects are enqueued, idempotent `weekly_report_deliveries` rows gate duplicate sends per channel window, email deliveries due for the same recipient set and weekly window are combined into one email with per-project sections, and the worker renders/sends through channel-specific transports (`packages/email` for email and Slack delivery that can resolve either `config.webhook_url` or a saved encrypted `config.slack_destination_id`). **GitHub dispatch automation** (Solo+ only): the worker evaluates matching `github_dispatch_rules` for incident lifecycle events and hosted `improvement_bundle.created` events using the shared filter evaluation function, enforces per-target cooldown, persists delivery records that target either an incident or an improvement opportunity, obtains GitHub App installation access tokens (cached in Redis, 50m TTL), and sends `repository_dispatch` events to the project's assigned GitHub repository with `event_type: "debugbundle.incident"` and a summary-only `client_payload`. Hosted improvement dispatches set `bundle_type: "improvement"`, carry `improvement_id`, and link to the improvement bundle route with no reproduction link. Retry strategy: 1s → 5s → 30s → 2min → 10min (5 attempts). DebugBundle-side hourly limits are 100 dispatches/project/hour and 4,000/installation/hour; suppressed matches persist non-retryable `skipped` delivery history rows.
10. **Retrieve** — Agents/developers fetch and mutate incidents, failure bundles, hosted improvement opportunities, improvement bundles, reproductions, logs, project lifecycle, project collaborator management, billing, probe activation, capture-policy configuration, webhook configuration, webhook delivery status, synthetic webhook-test delivery, delivery retry, alert-rule configuration, reusable Slack alert destinations, weekly-report channel configuration, and GitHub automation management via API, CLI, or MCP. Improvement retrieval includes `related_incident_ids`; the improvement bundle route returns `bundle_not_generated_yet` for directly fetched below-threshold opportunities and `covered_by_incident_bundle` for incident-derived opportunities that intentionally do not have a duplicate improvement artifact. The browser account surface also supports first-party cached avatars: GitHub sign-in may import a profile image server-side on login, account settings can explicitly import Gravatar, and member/avatar URLs always resolve back through DebugBundle-owned routes instead of hotlinking third-party image hosts. Project visibility is now intended to be project-scoped: owned projects are visible to their owner, shared projects are visible only to explicit `project_members`, and all project-scoped routes must re-check access on every request so collaborator removal takes effect immediately across browser sessions, member tokens, CLI, and MCP.
11. **Probe** — Always-on: probe ring-buffer data flushes alongside errors and attaches to bundles as `context.probe_data[]` (all tiers). Remote activation (paid tiers with `remote_probes` capability): agents activate probes via API/CLI/MCP or the project Probes web tab; backend SDKs poll config, browser/mobile SDKs use startup/lifecycle config checks plus ingestion-response `probe_directives`, and matching labels emit independent `probe_event` records; authenticated `GET /v1/sdk/config` supplies a per-project `trigger_token_key`; trigger tokens (`dbundle_probe_`) enable single-request/session activation via `_debug_probe` or `X-DebugBundle-Probe-Trigger` without waiting for passive directive refresh.
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
| Frontend        | React + Vite SPA on `app.debugbundle.com` (implemented auth/account + project-settings + projects/project-members + project-tokens + project-probes + project-webhooks + project-alerts + billing slices)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
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
        account.ts           — Owner-scoped browser-session account export, cached-avatar retrieval/import, and destructive account deletion routes
        auth.ts              — Web-auth signup, login, session, verification, password-reset, auth-method disclosure, and best-effort GitHub avatar import
        ingestion.ts         — POST /v1/events (with capture-policy enforcement)
        incidents.ts         — GET /v1/incidents, /v1/incidents/{id}, resolve/reopen, bundle, reproduction, logs
        services.ts          — GET /v1/services
        alerts.ts            — Alert rule CRUD
        slack.ts             — Slack OAuth connect flow plus reusable destination list/delete routes for project alerts
        billing.ts           — Owner-scoped billing summary and allowance-capacity management (browser session or member token), plus browser-only checkout/portal entry points
        projects.ts          — Project list/create/update/delete and owner-only destructive operations
        probes.ts            — Probe activation/deactivation/listing
        capture-policy.ts    — GET/PATCH /v1/projects/{id}/capture-policy
        github.ts            — GitHub App callback, webhook intake, installation status, project repo assignment, dispatch-rule CRUD, and dispatch-delivery history/retry routes
        tokens.ts            — Token lifecycle CRUD (project + member)
        webhooks.ts          — Webhook CRUD, synthetic test delivery, and delivery history retrieval
        weekly-report-channels.ts — Weekly report channel CRUD
        stripe-webhook.ts    — Stripe webhook ingestion (POST /v1/billing/stripe-webhook, signature verification, idempotency, entitlement recompute, and Stripe-period sync)
      api-types.ts           — Shared API type definitions
      schemas.ts             — Zod request/response schemas
      slack-app.ts           — Slack OAuth state/cookie, redirect handling, and code exchange helpers
      openapi.ts             — API-owned OpenAPI 3.1 generator reused by the site/ artifact pipeline
      stripe-config.ts       — Stripe client factory, price-to-plan mapping, billing state derivation
      default-dependencies.ts — Dependency composition (wires storage/auth/queue, including account export artifact assembly for retained raw events, failure bundles, improvement bundles, and reproductions; project-object cleanup on account deletion; queued webhook tests; dynamic Stripe checkout/portal sessions; and Stripe-backed capacity mutations)
      audit-logging.ts       — Fail-open audit log recording with actor-type resolution and request IP hashing
      runtime.ts             — Server bootstrap and graceful shutdown (conditionally wires Stripe webhook when env vars present)
      main.ts                — Entry point
  worker/        — BullMQ job processor (startup preflight validates DB/Redis/S3; internal health server on WORKER_HEALTH_PORT exposes /ready for Compose probes)
  cli/           — CLI tool (login, setup with mixed-runtime service discovery/target selection/runtime-specific relay guidance, connect, ingest, watch, process, verify local/cloud including active synthetic triggers and app-event verification via `verify cloud --expect-app-event`, inspect, resolve, reopen, bundle, reproduce, project list/create/update/delete, project members list/invites/invite/cancel-invite/update-role/remove, probe activate/list/deactivate, alerts, slack destination management, webhooks, weekly-report, capture-policy, billing, github status/repos/repo set/repo remove/rules create/update/delete/deliveries)
  mcp/           — MCP server (publishable `@debugbundle/mcp` stdio package with `debugbundle-mcp` bin; thin adapter over shared clients and local CLI modules, including local incident lifecycle, project CRUD, project collaborator management, billing, probe activation, capture-policy, Slack destination management, and GitHub installation/repo-assignment/dispatch-rule/delivery tools; source-of-truth tool catalog in `tool-catalog.ts`)
  web/           — React + Vite SPA on app.debugbundle.com (implemented auth/account + project-settings + projects/project-members + project-tokens + project-probes + project-webhooks + project-alerts + billing slices, reusable shadcn-based UI)
  public-site/   — [MOVED TO site/ at repo root] Next.js static-exported public site for debugbundle.com
packages/
  log-parser/    — Shared log-parser registry with canonical `debugbundle-ndjson` handling plus first-party adapter parsers (`php-error`, `apache-error`) that convert input text into `EventEnvelope[]`
    src/
      app.tsx                — Route composition for `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/settings`, `/member-tokens`, `/projects`, `/projects/:projectId/settings`, `/projects/:projectId/members`, `/projects/:projectId/tokens`, `/projects/:projectId/webhooks`, `/projects/:projectId/alerts`, `/invite`, and `/billing`
      main.tsx               — Browser entry point
      lib/api.ts             — Cookie-backed browser API client for auth/session/member-token/project/project-member/project-token/project-webhook/project-alert/billing/account flows, including session auth-method metadata, cached avatar import, account export/deletion, project deletion from project settings, and project-settings details derived from existing project/member/invite/billing responses
      lib/slack-api.ts       — Browser Slack connect/install-url helper plus reusable destination listing for the alerts UI
      lib/session.tsx        — Session bootstrap, refresh, and context state
      lib/theme.tsx          — Light/dark/system theme state and DOM synchronization
      components/ui/         — shadcn-based UI primitives used across the app
      pages/settings-page.tsx — Account settings page with auth-method-aware password management, explicit Gravatar import, account export, and destructive account deletion controls
      components/system/     — App shell, page headers, callout cards, theme toggle, reusable user-avatar primitive, reusable plaintext secret reveal, and billing display primitives

packages/
  storage/       — Storage adapters and domain persistence
    src/
      index.ts               — Barrel re-export (public API)
      types.ts               — All storage type definitions and interfaces
      helpers.ts             — Object key builders, token hashing
      auth-store.ts          — Postgres auth persistence (account creation, passwords, sessions, verification/reset tokens, and session auth-method flags)
      account-store.ts       — Postgres account export aggregation for retained organization/project records and account-deletion lifecycle persistence
      integration-secret-crypto.ts — Shared encryption/decryption helpers for stored integration secrets such as Slack webhook URLs
      metadata-store.ts      — Postgres metadata store (incidents, projects, tokens, probes, alerts)
      slack-destination-store.ts — Postgres reusable Slack destination CRUD and worker delivery-secret lookup
      billing-store.ts       — Postgres billing summary queries and allowance aggregation
      billing-sync-store.ts  — Postgres billing sync persistence (Stripe webhook idempotency, entitlement writes, customer-org linking)
      alert-delivery-store.ts — Postgres alert evaluation and delivery-intent persistence
      webhook-delivery-store.ts — Postgres webhook delivery persistence
      weekly-report-channel-store.ts — Postgres weekly-report channel CRUD + scheduler lookup
      weekly-report-delivery-store.ts — Postgres weekly-report delivery-intent persistence
      audit-log-store.ts     — Postgres audit log persistence (create, query by organization/action/time range)
      retention-store.ts     — Postgres tier-aware retention cleanup service (sampled event expiry by organization tier)
      frequency-counter.ts   — Redis rolling frequency counter (1m/5m/1h/24h)
      ingestion-rate-limiter.ts — Redis-backed per-token ingestion admission control
      ingestion-services.ts  — Ingestion metadata, member auth, persistence services
      s3-client.ts           — S3-compatible object store adapter
      redis-queue.ts         — Redis queue client (enqueue/dequeue)
      migrations.ts          — Authoritative bootstrap schema + required-table manifests
        schema-migrations.ts   — Ordered forward migrations + ledger/checksum readiness assertions for existing databases
  sdk-node/      — [MOVED to debugbundle-js repo] Node.js SDK (vanilla hooks + pino/winston/bunyan + Express/Fastify/Next.js), browser relay handler (subpath exports: /relay, /relay/express, /relay/fastify, /relay/nextjs)
  sdk-browser/   — [MOVED to debugbundle-js repo] Browser SDK (global errors, standalone/error-only breadcrumbs, preset-aware first-party request_event promotion, probes, session controls, config fetch, network filters, trace headers, unload-safe flush, retained-buffer retry/backoff)
  — All SDK repos (separate repositories under github.com/debugbundle/):
  — debugbundle-js     → github.com/debugbundle/debugbundle-js (JS SDK repo now live: sdk-node + sdk-browser; shared-types/redaction remain core-owned published dependencies for now)
  — debugbundle-python → github.com/debugbundle/debugbundle-python (Python SDK: Django + Flask + FastAPI + optional structlog/loguru capture)
  — debugbundle-php    → github.com/debugbundle/debugbundle-php (PHP SDK: Laravel + Symfony + remote config / capture policy)
  — debugbundle-java   → github.com/debugbundle/debugbundle-java (Java SDK: core SDK + servlet/JAX-RS app-server adapters + Spring Boot MVC starter + javaagent bootstrap)
  — debugbundle-ruby   → github.com/debugbundle/debugbundle-ruby (Ruby SDK: Rails + Rack + Sidekiq; release-ready local standalone repo)
  — debugbundle-go     → github.com/debugbundle/debugbundle-go (published Go SDK with core, secure transports, relay, net/http, Gin, Echo, slog, zap, zerolog, remote config, probes, examples, CI, and release workflow)
  — site               → github.com/debugbundle/site (public docs/blog/marketing site)
  — Wave 2/3 SDKs (C#, Kotlin, Swift, Rust, Dart, React Native) → separate repos per spec/sdk-language-targets.md; `sdks/debugbundle-dotnet/` is the local C#/.NET SDK repo published on NuGet at `0.1.1` with the NuGet package family implemented (`DebugBundle.Sdk`, ASP.NET Core middleware/browser relay/Blazor Server, Microsoft.Extensions.Logging, Serilog, NLog, log4net, gRPC, Worker, Hangfire, and Azure Functions isolated worker) across .NET 8 and .NET 10 consumer lanes, `sdks/debugbundle-android/` is the published Maven Central Kotlin Android repo with implemented core/runtime modules (`debugbundle-android-core`, `debugbundle-android`, `debugbundle-android-okhttp`, `debugbundle-android-ktor-client`, `debugbundle-android-navigation`, `debugbundle-android-compose`, `debugbundle-android-timber`, `debugbundle-android-testkit`, `debugbundle-android-bom`), `sdks/debugbundle-swift/` now ships the standalone Swift package with bundle/runtime config resolution, configurable queue file protection, connectivity-aware deferred delivery, automatic batch/interval/background flushing, bounded UIKit background-flush execution windows, capped per-send batch sizing, bounded retry windows, bounded remote-config refresh, internal diagnostics for terminal `4xx` queue drops, explicit async operation and task capture helpers, core capture, durable queueing, explicit URLSession instrumentation, optional Alamofire request capture, URLProtocol/configuration-based request capture, UIKit app/scene/view-controller/navigation helpers, SwiftUI scene/navigation/action helpers, SwiftLog integration, capture-policy enforcement, remote-probe activation, Objective-C exception bridging, next-launch crash replay helpers, queue/mock-ingestion/fixture test support, and CocoaPods `DebugBundle@0.1.1`, and `sdks/debugbundle-react-native/` is the published npm React Native SDK with TypeScript facade, safe degraded native-module behavior, target-scoped fetch/XHR trace instrumentation, React Navigation breadcrumbs, React error boundary support, Expo config plugin, Android/iOS wrapper glue that delegates to the native SDK foundations, packed clean-install smoke, Android Docker clean RN app smoke, and iOS CocoaPods/Xcode clean RN app smoke; detailed plans currently live in spec/sdks/csharp-sdk.md, spec/sdks/kotlin-sdk.md (Kotlin Android), spec/sdks/swift-sdk.md (Swift iOS), and spec/sdks/react-native-sdk.md (React Native iOS/Android)

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

  bundle-engine/ — Deterministic bundle assembly
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

**Repo strategy:** This workspace is now the public `debugbundle/debugbundle` core checkout. The public `debugbundle-js`, `debugbundle-python`, and `debugbundle-php` repos exist as separate org repos and are pulled into `sdks/` only as real local clones when needed. The public site repo now lives as a real local clone at the root `site/` path, while lower-touch companion repos such as `debugbundle/action` stay under ignored `.local-repos/` clones. `shared-types` and `redaction` remain core-owned published libraries because product code still has meaningful direct source coupling to them here, and core now owns only their stable release workflow. `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` now publish from the dedicated `debugbundle/debugbundle-js` repo workflow instead of the core workspace, while the core workspace continues to dogfood published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. The intended pre-launch release order is shared packages first, JS SDK family second, then dependent wrappers such as WordPress; after registry publish, bump the dogfooding manifests in the root app, hosted SPA, and public site before hosted validation or deploy. Environment-specific deployment and operations details are intentionally outside this public overview. Older long-lived local checkouts may still need one manual cleanup of pre-cutover `sdks/` directories before first bootstrap.

---

## Key Invariants (Quick Reference)

1. **Bundle determinism** — same events → same bundle output, always
2. **SDK never crashes host** — all SDK failures caught internally
3. **Redaction before storage** — sensitive data scrubbed before persistence
4. **Processing idempotency** — all worker jobs safely re-runnable
5. **Interface parity** — API = CLI = MCP capabilities
6. **Tokens hashed at rest** — plaintext shown once, stored as SHA-256
7. **Webhook signing** — HMAC-SHA256 on all outgoing payloads
8. **Auth split by client type** — SPA uses cookie sessions, CLI/MCP use member tokens, SDKs use project tokens; member-authorized routes may accept either browser sessions or member tokens, but project-scoped actions must converge on the same explicit per-project access checks. Project invite acceptance is browser-session-authenticated against the signed-in user's email and creates `project_members` access without adding the invitee to the owner's billing/account container. GitHub auth now has two additive tracks: browser redirect auth through `GET /v1/auth/github/start` and `GET /v1/auth/github/callback`, plus CLI bootstrap through `POST /v1/auth/github/device/start|poll|claim` and `POST /v1/auth/github/token/exchange`, both of which ultimately issue the same member-token auth state used by CLI and MCP. Google sign-in remains deferred (see `/spec/auth-architecture.md`)
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

Event billing uses the event class model: Free meters only `incident_signal` events (Class A — exceptions, qualifying logs, and immediate request failures), paid tiers meter `incident_signal` + `context_signal` (Class A + B), and `operational_signal` (Class C) is excluded from billing across all tiers. Each project has a capture policy (preset: `minimal`/`balanced`/`investigative`) that controls what the SDK captures and the ingestion API accepts, plus project-scoped capture rules that can manually `demote`, `sample`, or `drop` known noisy patterns after they appear in real incidents. The capture policy still defines the default request-failure behavior, including the `immediate_client_error_statuses` override that can promote selected `4xx` responses into normal incident-opening request failures. All current tiers default to `balanced`, which treats 408/423/424/425/429 request failures as immediate incident signals; `investigative` additionally defaults the client-error incident override to `401/403/409/422`.

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

**Pre-production.** No backwards compatibility required. Break freely when improving.
