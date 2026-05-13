# SYSTEM OVERVIEW — DebugBundle

> Context-compression file for agent session recovery.
> If this file conflicts with `/spec/*`, `/contracts/*`, or `/rules/*`, those win.

---

## What Is DebugBundle?

DebugBundle is an AI-agent-first runtime debugging platform. It captures production failures from backend and browser applications, packages them into structured **debug bundles**, and makes them available to AI agents and developers through API, CLI, and MCP.

The core artifact is the **Debug Bundle** — a deterministic, versioned (`bundle_version: 1`), privacy-aware package of debugging context for a single incident. The bundle schema includes per-context block versioning (`version: 1` on each context block) to enable independent evolution. Context blocks include `error`, `request`, `response`, `logs`, `frontend`, `environment`, `deploy`, `runtime`, `git`, `dependencies`, `probe_data`, and `device` (browser-only: UA, browser, OS, device type, screen, viewport, touch, locale, connection, color scheme).

### Canonical Primitives

The system is built around three primitives: **bundle** (versioned debugging artifact with `bundle_version: 1`, `captured_at`, `sdk`, expanded `summary`, `context.runtime`, `context.git`, wrapped array blocks), **incident** (fingerprint-grouped event container), and **profile.json** (project configuration). All features operate on these primitives.

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
│  Active non-TS pre-launch scope:                                │
│    debugbundle-python, debugbundle/sdk-php                      │
│  Deferred until after v1 hardening:                             │
│    github.com/debugbundle/debugbundle-go, debugbundle (RubyGems)│
│  Wave 2 (post-launch): Java, C#, Kotlin server, Rust           │
│  Wave 3 (post-launch): Kotlin Android, Swift iOS, React Native,│
│    Dart/Flutter                                                 │
│  See spec/sdk-language-targets.md for full rollout plan         │
│  Universal interface: init, captureException, captureError,     │
│  captureLog, captureRequest, captureMessage, setContext, flush,  │
│  probe, status, lastEventAt                                     │
│  Vanilla hooks + stdlib/structlog/loguru logger auto-detection  │
│  + framework integrations                                       │
│  Always-on probe ring buffer; config polling (paid tiers, 60s)  │
│  Transport: file (local/dev) or HTTP (staging/prod connected)   │
│  Browser relay: same-origin POST to user's backend relay handler│
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
│   build-bundle → build-reproduction → evaluate-alerts →         │
│   deliver-webhooks → generate-weekly-report →                   │
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

1. **Capture** — SDKs intercept errors, exceptions, HTTP requests/responses, logs (in-process via logger handlers), console, DOM, navigation events. SDKs respect the server-side capture policy (fetched via `GET /v1/sdk/config`) which controls what event types are captured and shipped (presets: `minimal`, `balanced`, `investigative`). Browser SDKs also collect device/browser metadata (UA, OS, screen, viewport, touch, locale, connection type) on `init()`, keep breadcrumbs local by default for exception attachment, optionally ship standalone `frontend_breadcrumb` events, apply local network filters plus per-event `sampleRate` / `logLevel` controls to independent browser events, promote first-party `fetch`/XHR responses that match the current preset's immediate request-failure set to standalone `request_event` incident signals while retaining the network breadcrumb (5xx under every preset; `balanced`/`investigative` also 408/423/424/425/429; `investigative` also 409), preserve preset-enabled request-anomaly candidates as contextual `request_event` signals when request failure context is enabled, locally suppress repeated exception/log/request storms with `error_suppressed` checkpoints, and inject `X-DebugBundle-Trace-Id` into wrapped browser requests for frontend/backend correlation. `probe()` calls buffer data locally in per-label ring buffers (always-on, all tiers).
2. **Ship** — SDK batches events, deduplicates, redacts sensitive data. In connected mode: sends to cloud ingestion API. In local-only mode: server-side SDKs write events to `.debugbundle/local/events/` via file transport (atomic temp-file + rename). Browser SDKs ship events through a same-origin relay handler (`POST /debugbundle/browser`) hosted on the user's backend; the relay validates, sanitizes, and writes events to `.debugbundle/local/events/` (local-only mode) or spools them to `.debugbundle/local/browser-relay-spool/` for durable forwarding (connected mode). The relay handler is packaged as subpath exports of `@debugbundle/sdk-node` (`/relay`, `/relay/express`, `/relay/fastify`, `/relay/nextjs`). Log-based capture (`debugbundle ingest`/`watch`) is an alternative input path that parses existing log files through the shared `packages/log-parser` registry into the same event format; `debugbundle-ndjson` is the canonical structured interchange format for any runtime that can already emit JSON lines, while the accepted first-party adapter formats currently include selected existing server log formats such as PHP and Apache. Local watch writes deterministic local event batches, while connected `debugbundle watch --cloud` ships appended batches directly to `POST /v1/events`.
3. **Ingest** — (Connected mode) API validates, enforces capture policy (rejects policy-violating events with `capture_policy_rejected`), redacts, persists raw to object storage, and enqueues processing with the resolved capture preset so worker-side request classification stays deterministic. No synchronous incident/grouping persistence in request path. (Local mode) `debugbundle process` reads events from `.debugbundle/local/events/` and composes the same pure-function packages (event-normalizer, bundle-engine, repro-engine) to produce bundles locally; when operators pass `--preset`, the CLI reprocesses the full local event set under the requested request-failure policy and synthesizes local request-anomaly incidents with the same thresholds as the cloud path.
4. **Normalize & Classify** — Worker parses raw events into canonical form and assigns `event_class` (`incident_signal`, `context_signal`, `operational_signal`). Classification is immutable after normalization. Exceptions, `error`/`fatal`/`critical` logs, and request events in the preset-specific immediate request-failure set are incident signals; other request events remain context. A separate request-anomaly evaluator may open a `request_failure` incident from repeated contextual request failures, but it does so without mutating the normalized event's `event_class`. Free-tier billing counts only `incident_signal` events.
5. **Group** — Worker `group-incident` jobs fingerprint and assign incident-driving events to incidents, persist incident/event linkage, keep full-detail raw-event retention bounded (first occurrence, latest occurrence, first occurrence after each deploy, highest-severity occurrence, plus deploy metadata) while demoting other occurrences to summary-only metadata, track rolling frequency counters in Redis (1m/5m/1h/24h), detect spikes (5m/1h ratio ≥ 3.0), detect preset-aware request anomalies from repeated contextual request failures, and detect regressions (event on resolved incident). Incident states: open → resolved → regressed.
6. **Bundle** — Worker assembles deterministic debug bundle from incident context via `packages/bundle-engine`
7. **Reproduce** — Worker generates reproduction artifacts (steps, commands, curl)
8. **Notify** — Worker resolves matching enabled webhook endpoints (`agent_webhooks`) by event + filters (including `bundle_type` and `is_verification` filter evaluation), persists delivery intents, claims due deliveries by `next_attempt_at`, executes real HTTP `deliver-webhook` attempts with per-delivery HMAC-SHA256 signatures, and tracks retry-state transitions (`pending` -> `retrying` -> `delivered`/`failed`/`disabled`) with observability fields (`last_response_code`, `last_attempted_at`, `last_error`). After 50 consecutive final delivery failures for a webhook, the webhook is automatically disabled by setting `agent_webhooks.is_enabled = false` so repeated failures stop consuming worker capacity until an operator re-enables it; when auto-disabled the project owner receives an email notification. Failed/disabled deliveries can be manually retried via `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` (API), `webhook retry` (CLI), or `retry_webhook_delivery` (MCP). The lifecycle webhook publisher emits `bundle.created` on first occurrence (occurrence_count === 1), `bundle.updated` on subsequent threshold occurrences, `bundle.reopened` on regressions, and `bundle.resolved` on explicit incident resolution, with enriched payloads containing event, service, links, summary, bundle_type, and verification fields. The worker also enqueues `evaluate-alerts` jobs from real incident transitions, matches enabled `alert_rules`, persists idempotent `alert_deliveries` rows, and performs real delivery for all four alert channels: `email` (via the shared `packages/email` transport abstraction), `slack` (webhook POST with Block Kit), `discord` (webhook POST with embeds), and `webhook` (raw JSON POST to target URL). Weekly reporting now shares that worker lane end-to-end: projects opt into explicit `weekly_report_channels`, runtime scheduler evaluates each enabled channel in its configured timezone/day/hour, only active projects are enqueued, idempotent `weekly_report_deliveries` rows gate duplicate sends per channel window, and the worker renders/sends through channel-specific transports (`packages/email` for email, direct Slack webhook posts for Slack). **GitHub dispatch automation** (Solo+ only): the worker evaluates matching `github_dispatch_rules` using the shared filter evaluation function, enforces per-fingerprint cooldown, persists delivery records, obtains GitHub App installation access tokens (cached in Redis, 50m TTL), and sends `repository_dispatch` events to the project's assigned GitHub repository with `event_type: "debugbundle.incident"` and a summary-only `client_payload`. Retry strategy: 1s → 5s → 30s → 2min → 10min (5 attempts). Rate limited to 100 dispatches/project/hour and 4,000/installation/hour.
9. **Retrieve** — Agents/developers fetch and mutate incidents, bundles, reproductions, logs, project lifecycle, organization member management, billing, probe activation, capture-policy configuration, webhook configuration, webhook delivery status, synthetic webhook-test delivery, delivery retry, alert-rule configuration, weekly-report channel configuration, and GitHub automation management (installation status, repo assignment, dispatch rule CRUD, delivery history, delivery retry) via API, CLI, or MCP with member-token metadata resolution and organization-scoped authorization on retrieval and management routes (including `GET /v1/incidents`, `GET /v1/incidents/{id}`, `POST /v1/incidents/{id}/resolve`, `POST /v1/incidents/{id}/reopen`, `GET /v1/incidents/{id}/bundle`, `GET /v1/incidents/{id}/reproduction`, `GET /v1/logs`, `GET/POST/PATCH/DELETE /v1/projects`, `GET/POST/PATCH/DELETE /v1/organization/members`, `GET /v1/billing`, `POST/DELETE /v1/billing/capacity/*`, `POST/GET/POST /v1/projects/{id}/probes`, `GET/PATCH /v1/projects/{id}/capture-policy`, `GET /v1/webhooks`, `GET /v1/webhooks/{id}`, `GET /v1/webhooks/{id}/deliveries`, `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry`, `POST /v1/webhooks/{id}/test`, `GET /v1/alerts`, `GET /v1/weekly-report-channels`, `GET/DELETE /v1/github/installation`, `GET /v1/github/repositories`, `GET/PUT/DELETE /v1/projects/{id}/github/repo`, `GET/POST/PATCH/DELETE /v1/projects/{id}/github/rules`, and `GET/POST /v1/projects/{id}/github/deliveries`). Full interface parity (API = CLI = MCP) is now achieved for all shipped capabilities. In local-only mode, CLI and MCP retrieval plus local incident lifecycle (`resolve`, `reopen`) operate directly on `.debugbundle/local/state.json` and `.debugbundle/bundles/local/` without requiring stored member auth or MCP bearer tokens. In connected mode, CLI and MCP now default incident retrieval to a merged local-plus-cloud view, preserve explicit narrowing through `--source local|cloud` / `source: "local"|"cloud"`, and annotate cloud-backed payloads with `source: "cloud"` so callers can distinguish origin explicitly; detail, bundle, reproduction, resolve, and reopen flows probe the local store first and then fall back to cloud, explicit cloud bundle/reproduction fetches now refresh the local cache under `.debugbundle/bundles/cloud/`, cloud resolve and cloud reopen update any cached cloud artifact snapshot that carries incident status, opportunistic cache maintenance prunes cloud-cache entries older than 30 days since last access, and `debugbundle clean` now covers the full documented local retention/reset surface: processed-event cleanup, local incident trimming to the latest 50 with resolved-first eviction, explicit cloud-cache pruning, and scaffold-preserving `--all` runtime reset. Incident retrieval payloads include denormalized `project_name` and `service_name` fields so clients render stable names without extra lookups. Billing summaries now report active project counts separately from shared allowance-capacity units; project creation is not hard-gated by purchased capacity units. Alert CRUD parity now flows through a shared `packages/alert-client` seam consumed by thin CLI and MCP adapters, project lifecycle parity now flows through `packages/project-management-client`, member management parity flows through inline CLI API clients re-used by MCP member tools, billing parity flows through `packages/billing-client`, webhook lifecycle parity including `webhook test` / `test_webhook` / `webhook retry` / `retry_webhook_delivery` flows through `packages/webhook-client`, and weekly report channel parity flows through `packages/weekly-report-client`.
10. **Probe** — Always-on: probe ring-buffer data flushes alongside errors and attaches to bundles as `context.probe_data[]` (all tiers). Remote activation (paid tiers with `remote_probes` capability): agents activate probes via API/CLI/MCP; SDKs poll config and emit independent `probe_event` when labels match; authenticated `GET /v1/sdk/config` supplies a per-project `trigger_token_key`; trigger tokens (`dbundle_probe_`) enable single-request Node activation via `_debug_probe` / `x-debugbundle-probe-trigger` and current-page browser activation via `_debug_probe` without waiting for poll
11. **Act** — Repository-owned automation fetches the full bundle/reproduction (for example through the public `debugbundle/action@v1` GitHub Action), then analyzes the incident, proposes a patch, opens an issue, or creates a PR

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode everywhere) |
| API Framework | Fastify |
| Database | PostgreSQL (raw SQL + Zod typed parsing, no ORM) |
| DB Bootstrap | Authoritative clean-slate SQL bootstrap in `packages/storage/src/migrations.ts` |
| DB Migrations | Ordered forward schema evolution in `packages/storage/src/schema-migrations.ts`; deploys must migrate before API/worker consume new schema |
| Object Storage | S3-compatible object storage |
| Queue | Redis + BullMQ |
| Monorepo | pnpm + turborepo |
| Frontend | React + Vite SPA on `app.debugbundle.com` (implemented auth/account + project-settings + projects/project-tokens + project-webhooks + project-alerts + organization-overview/organization-members + billing slices) |
| Public Site | Static-exported Next.js + Fumadocs on `debugbundle.com` for marketing, MDX-backed `/docs` and `/blog`, `llms.txt`, `openapi.json`, schemas, and example artifacts. Marketing content authored: real landing page (hero, how-it-works, value props, interfaces overview, terminal example, OpenGraph), pricing page (Free/Solo/Team with tier features and shared-allowance model from `spec/tiers.md`), 4 blog posts, and substantive legal/informational pages (about, contact, privacy, terms, security, changelog). Documentation content authored per `spec/documentation.md` (65-page surface with Orama static search: getting started, SDKs, CLI, API, MCP, webhooks, probes, bundles, security, self-hosting, agent workflows). |
| Email | Provider-backed transport via `packages/email` abstraction (auth + billing lifecycle + weekly report templates) |
| Runtime logging | Pino-backed structured JSON logs for API and worker internal operability |
| Billing | Stripe SDK v20.4.1 (API version 2026-02-25.clover), webhook-driven sync, dynamic checkout/portal sessions |
| Domain | app.debugbundle.com (SPA); api.debugbundle.com (API); debugbundle.com (static public site with marketing, docs under `/docs`, and blog under `/blog`) |
| Hosting | Environment-specific infrastructure is intentionally omitted from this public overview |
| Self-host | Docker Compose (Web on localhost:5291, API on localhost:3004, Postgres on localhost:5434, Redis on localhost:6380, LocalStack S3 on localhost:4567, plus Worker) with hosted-parity auth/service boundaries |


## Repository Structure

```
apps/
  api/           — Fastify HTTP API (ingestion + retrieval + first-party auth)
    src/
      server.ts              — Route composition (delegates to route modules)
      routes/
        health.ts            — GET /health, /ready (503 when dependencies degraded), /live
        account.ts           — Owner-scoped browser-session account export and destructive account deletion routes
        auth.ts              — Web-auth signup, login, session, verification, password-reset, and auth-method disclosure routes
        ingestion.ts         — POST /v1/events (with capture-policy enforcement)
        incidents.ts         — GET /v1/incidents, /v1/incidents/{id}, resolve/reopen, bundle, reproduction, logs
        services.ts          — GET /v1/services
        alerts.ts            — Alert rule CRUD
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
      openapi.ts             — API-owned OpenAPI 3.1 generator reused by the site/ artifact pipeline
      stripe-config.ts       — Stripe client factory, price-to-plan mapping, billing state derivation
      default-dependencies.ts — Dependency composition (wires storage/auth/queue, including account export artifact assembly + project-object cleanup on account deletion, queued webhook tests, dynamic Stripe checkout/portal sessions, and Stripe-backed capacity mutations)
      audit-logging.ts       — Fail-open audit log recording with actor-type resolution and request IP hashing
      runtime.ts             — Server bootstrap and graceful shutdown (conditionally wires Stripe webhook when env vars present)
      main.ts                — Entry point
  worker/        — BullMQ job processor (startup preflight validates DB/Redis/S3; internal health server on WORKER_HEALTH_PORT exposes /ready for Compose probes)
  cli/           — CLI tool (login, setup, connect, ingest, watch, process, verify local/cloud including active `verify cloud --trigger-5xx`, inspect, resolve, reopen, bundle, reproduce, project list/create/update/delete, probe activate/list/deactivate, member list/invites/invite/cancel-invite/update-role/remove, alerts, webhooks, weekly-report, capture-policy, billing, github status/repos/repo set/repo remove/rules create/update/delete/deliveries)
  mcp/           — MCP server (publishable `@debugbundle/mcp` stdio package with `debugbundle-mcp` bin; thin adapter over shared clients and local CLI modules, including local incident lifecycle, project CRUD, member management, billing, probe activation, capture-policy, and GitHub installation/repo-assignment/dispatch-rule/delivery tools; source-of-truth tool catalog in `tool-catalog.ts`)
  web/           — React + Vite SPA on app.debugbundle.com (implemented auth/account + project-settings + projects/project-tokens + project-webhooks + project-alerts + organization-overview/organization-members + billing slices, reusable shadcn-based UI)
  public-site/   — [MOVED TO site/ at repo root] Next.js static-exported public site for debugbundle.com
packages/
  log-parser/    — Shared log-parser registry with canonical `debugbundle-ndjson` handling plus first-party adapter parsers (`php-error`, `apache-error`) that convert input text into `EventEnvelope[]`
    src/
      app.tsx                — Route composition for `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/settings`, `/member-tokens`, `/projects`, `/projects/:projectId/settings`, `/projects/:projectId/tokens`, `/projects/:projectId/webhooks`, `/projects/:projectId/alerts`, `/organization`, `/organization/members`, and `/billing`
      main.tsx               — Browser entry point
      lib/api.ts             — Cookie-backed browser API client for auth/session/member-token/project/project-token/project-webhook/project-alert/organization-member/billing/account flows, including session auth-method metadata, account export/deletion, project deletion from project settings, and project-settings/organization-overview details derived from existing project/member/invite/billing responses
      lib/session.tsx        — Session bootstrap, refresh, and context state
      lib/theme.tsx          — Light/dark/system theme state and DOM synchronization
      components/ui/         — shadcn-based UI primitives used across the app
      pages/settings-page.tsx — Account settings page with auth-method-aware password management, account export, and destructive account deletion controls
      components/system/     — App shell, page headers, callout cards, theme toggle, reusable plaintext secret reveal, and billing display primitives

packages/
  storage/       — Storage adapters and domain persistence
    src/
      index.ts               — Barrel re-export (public API)
      types.ts               — All storage type definitions and interfaces
      helpers.ts             — Object key builders, token hashing
      auth-store.ts          — Postgres auth persistence (account creation, passwords, sessions, verification/reset tokens, and session auth-method flags)
      account-store.ts       — Postgres account export and account-deletion lifecycle persistence
      metadata-store.ts      — Postgres metadata store (incidents, projects, tokens, probes, alerts)
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
  — debugbundle-go     → github.com/debugbundle/debugbundle-go (Go SDK: net/http + Gin + Echo; postponed until further notice)
  — debugbundle-ruby   → github.com/debugbundle/debugbundle-ruby (Ruby SDK: Rails + Rack + Sidekiq; postponed until further notice)
  — site               → github.com/debugbundle/site (public docs/blog/marketing site)
  — Wave 2/3 SDKs (Java, C#, Kotlin, Swift, Rust, Dart, React Native) → separate repos per spec/sdk-language-targets.md

sdks/                    — Local standalone SDK clone roots managed by `sdks.json` and `scripts/bootstrap-sdks.sh`
  debugbundle-js/        — github.com/debugbundle/debugbundle-js (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-python/    — github.com/debugbundle/debugbundle-python (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-php/       — github.com/debugbundle/debugbundle-php (public standalone repo; cloned on demand for single-workspace development)
  debugbundle-go/        — github.com/debugbundle/debugbundle-go (when built; postponed until further notice)
  debugbundle-ruby/      — github.com/debugbundle/debugbundle-ruby (when built; postponed until further notice)
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

`debugbundle setup` is the single public onboarding entrypoint. When setup detects both DebugBundle browser and node SDKs alongside a supported backend framework, it also scaffolds the same-origin browser relay route (`debugbundle/browser`) into the user's Fastify or Express server entrypoint or creates a Next.js App Router relay route file. The `debugbundle init` scaffold helper remains an internal implementation detail and is no longer part of the public CLI contract.

See `/spec/local-first-onboarding.md` for the full artifact layout rationale.

**Repo strategy:** This workspace is now the public `debugbundle/debugbundle` core checkout. The public `debugbundle-js`, `debugbundle-python`, and `debugbundle-php` repos exist as separate org repos and are pulled into `sdks/` only as real local clones when needed. The public site repo now lives as a real local clone at the root `site/` path, while lower-touch companion repos such as `debugbundle/action` stay under ignored `.local-repos/` clones. `shared-types` and `redaction` remain core-owned published libraries because product code still has meaningful direct source coupling to them here, and core now owns only their stable release workflow. `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` now publish from the dedicated `debugbundle/debugbundle-js` repo workflow instead of the core workspace, while the core workspace continues to dogfood published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. Environment-specific deployment and operations details are intentionally outside this public overview. Older long-lived local checkouts may still need one manual cleanup of pre-cutover `sdks/` directories before first bootstrap.

---

## Key Invariants (Quick Reference)

1. **Bundle determinism** — same events → same bundle output, always
2. **SDK never crashes host** — all SDK failures caught internally
3. **Redaction before storage** — sensitive data scrubbed before persistence
4. **Processing idempotency** — all worker jobs safely re-runnable
5. **Interface parity** — API = CLI = MCP capabilities
6. **Tokens hashed at rest** — plaintext shown once, stored as SHA-256
7. **Webhook signing** — HMAC-SHA256 on all outgoing payloads
8. **Auth split by client type** — SPA uses cookie sessions, CLI/MCP use member tokens, SDKs use project tokens; member-authorized routes may accept either browser sessions or member tokens, but they must converge on the same organization-scoped principal and role checks. Owner-only organization membership actions now include invite lifecycle plus role updates, invite creation honors organization-plan capability gates, invite create/cancel retains the narrow browser-session verification gate, role changes preserve at least one owner, and invite acceptance remains browser-session-authenticated against the signed-in user's email. GitHub auth now has two additive tracks: browser redirect auth through `GET /v1/auth/github/start` and `GET /v1/auth/github/callback`, plus CLI bootstrap through `POST /v1/auth/github/device/start|poll|claim` and `POST /v1/auth/github/token/exchange`, both of which ultimately issue the same member-token auth state used by CLI and MCP. Google sign-in remains deferred (see `/spec/auth-architecture.md`)
9. **Event class billing integrity** — Free counts only `incident_signal`, paid counts `incident_signal` + `context_signal`, `operational_signal` excluded all tiers; `event_class` immutable after normalization (INV-15)
10. **Capture policy server-side enforcement** — ingestion API rejects events violating project capture policy with `capture_policy_rejected` (INV-16)
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

Event billing uses the event class model: Free meters only `incident_signal` events (Class A — exceptions, qualifying logs, and immediate request failures), paid tiers meter `incident_signal` + `context_signal` (Class A + B), and `operational_signal` (Class C) is excluded from billing across all tiers. Each project has a capture policy (preset: `minimal`/`balanced`/`investigative`) that controls what the SDK captures and the ingestion API accepts. Free defaults to `minimal` (failure-first, including 5xx request failures); paid defaults to `balanced`, which also treats 408/423/424/425/429 request failures as immediate incident signals.

| | Free | Solo ($2.99/mo) | Team ($49/mo) |
|---|---|---|---|
| Projects | 1 | Unlimited (+$1.99/capacity unit) | Unlimited (+$4.99/capacity unit) |
| Members | 1 (owner only) | 1 (solo only) | 5 |
| Bundle retention | 7 days | 30 days | 90 days |
| Raw event retention | 7 days | 14 days | 30 days |
| Bundle types | Failure + local analysis | Failure + local analysis | Failure + Improvement (cloud) |
| Improvement engine | Local (user's LLM via skill-layer) | Local (user's LLM) | Cloud (automated) |
| Probes | Always-on (ring buffer + error-flush) | Always-on + remote activation | Always-on + remote activation |
| Shared dashboards | — | — | ✅ |
| GitHub automation | — | ✅ (3 rules/project, 7d history) | ✅ (20 rules/project, 30d history) |
| Member invites | — | — | ✅ |
| Slack integration | — | — | ✅ |

---

## License

AGPLv3 — open-core model. Same code for cloud and self-host. Trademark protected.

This working tree is now the public core repo checkout. Local multi-repo convenience comes from a root-level `site/` clone, ignored `.local-repos/` and `.local-notes/` workspace areas, plus bootstrap-managed SDK clones under `sdks/`.

---

## Status

**Pre-production.** No backwards compatibility required. Break freely when improving.
