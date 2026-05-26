# ARCHITECTURE MAP — DebugBundle

> Module boundary map for agent navigation.
> If this file conflicts with `/spec/architecture.md` or `/contracts/*`, those win.

---

## Module Dependency Graph

```
                    ┌──────────────┐
                    │ shared-types │  (Zod schemas, TS types, constants)
                    └──────┬───────┘
                           │ imported by everything
          ┌────────────────┼────────────────────────────┐
          │                │                            │
    ┌─────▼─────┐    ┌─────▼──────┐              ┌──────▼─────┐
    │ redaction │    │    auth    │              │   email    │
    └─────┬─────┘    └─────┬──────┘              └──────┬─────┘
          │                │                            │
    ┌─────▼──────────┐     │                            │
    │event-normalizer│     │                            │
    └─────┬──────────┘     │                            │
          │                │                            │
    ┌─────▼──────────┐     │                            │
    │retrieval-client│     │                            │
    └─────┬──────────┘     │                            │
          │                │                            │
    ┌─────▼─────────┐      │                            │
    │ bundle-engine │      │                            │
    └─────┬─────────┘      │                            │
          │                │                            │
    ┌─────▼─────────┐      │                            │
    │ repro-engine  │      │                            │
    └─────┬─────────┘      │                            │
          │                │                            │
          └───────┬────────┘────────────────────────────┘
                  │
    ┌─────────────▼──────────────────────────┐
    │              Apps Layer                │
    │ api  │  worker  │  cli  │  mcp  │ web  │
    └────────────────────────────────────────┘
```

**Hard rule:** Apps import packages. Packages never import apps. Packages never import each other circularly.

---

## Package Boundaries

> **Note:** `shared-types`, `redaction`, `sdk-node`, and `sdk-browser` have moved to the separate JS SDK monorepo (`github.com/debugbundle/debugbundle-js`). Their package boundaries are documented below for reference since core monorepo packages (`event-normalizer`, `bundle-engine`, etc.) still depend on the published npm packages. See the "JavaScript SDK Monorepo" section for the full repo layout.

### `packages/shared-types` _(lives in `debugbundle-js` repo)_

- **Owns:** All Zod schemas, TypeScript type exports, enums, constants, **tier capabilities config**, **event class enum**, **capture policy types**, **improvement settings types**, and the canonical preset-aware plus project-override-aware request-failure classifier used by ingestion, workers, and SDKs
- **Exports:** `BundleV1Schema`, `BundleV1`, `EventEnvelopeSchema`, `EventEnvelope`, `createEventEnvelope`, `TIER_CAPABILITIES`, `getTierCapabilities`, `TierName`, `TierCapabilities`, `EventClass`, `CapturePreset`, `CapturePolicy`, event payload schemas, `DeviceInfoSchema`, `ContextDeviceSchema`, DB row types, API request/response types, webhook payload types, profile schema, severity enum, signal type enum, all context-block sub-schemas
- **Depends on:** nothing (leaf package)
- **Test fixtures:** `__fixtures__/` for canonical schema samples

### `packages/redaction` _(lives in `debugbundle-js` repo)_

- **Owns:** Sensitive data detection and scrubbing logic
- **Exports:** `redact(payload, rules)`, default rules, custom rule builder
- **Depends on:** `shared-types`
- **Invariant:** Must redact passwords, auth headers, cookies, card numbers, SSN, custom patterns

### `packages/auth`

- **Owns:** Password hashing, session issuance/revocation, verification flows, token generation, hashing, validation, middleware factories
- **Exports:** `generateProjectToken()`, `generateMemberToken()`, `hashToken()`, `validateProjectToken()`, `validateMemberToken()`, session helpers, password helpers, verification helpers, auth middleware for Fastify
- **Depends on:** `shared-types`
- **Invariant:** Member/project tokens stored as SHA-256 hashes. Plaintext returned once at creation. Project tokens may carry optional `allowed_origins` for direct/static browser ingestion abuse reduction, enforced by project-token API routes after token authentication. SPA auth uses first-party cookie sessions rather than browser-stored bearer auth.

### `packages/event-normalizer`

- **Owns:** Raw event validation, normalization to canonical form, fingerprinting, **event class classification**
- **Exports:** `validateEvent()`, `normalizeEvent()`, `fingerprint()`, `classifyEvent()`
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** Fingerprint is deterministic. Same failure → same fingerprint. `event_class` assignment is deterministic and immutable after normalization (INV-15), including preset-aware request-event classification when worker jobs carry the resolved capture preset from ingestion.

### `packages/bundle-engine`

- **Owns:** Deterministic bundle assembly from normalized events + incident context
- **Exports:** `buildBundle(incident, events, context): BundleV1`
- **Depends on:** `shared-types`, `storage`
- **Invariant:** Same inputs → byte-identical output. No random IDs, no wall-clock timestamps.
- **Runtime wiring:** Consumed by `apps/worker` `build-bundle` stage for persisted bundle artifacts.

### `packages/repro-engine`

- **Owns:** Reproduction artifact generation from bundles
- **Exports:** `buildReproduction(bundle): ReproductionArtifact`
- **Depends on:** `shared-types`, `bundle-engine`
- **Invariant:** Confidence field always explicit (`high`/`medium`/`low`).

### `packages/email`

- **Owns:** Email template rendering and sending abstraction
- **Exports:** Weekly report email rendering, billing lifecycle email rendering (purchase confirmation, renewal, payment failure, entitlement downgrade, plan/capacity changes), operational email rendering (webhook auto-disable, allowance thresholds, retention rotation), plus transport adapters
- **Depends on:** `shared-types`
- **Adapter:** Transport adapters remain behind the same abstraction; provider choice is intentionally outside this public map

### `packages/runtime-logger`

- **Owns:** Shared structured runtime logging substrate for `apps/api` and `apps/worker`
- **Exports:** Runtime logger creation helpers, log-level/env/service resolution, safe error-message extraction
- **Depends on:** external `pino` only
- **Invariant:** Internal operability only. This package must not grow into product-facing log storage/search/dashboard behavior.

### `packages/retrieval-client`

- **Owns:** Shared HTTP client helpers for retrieval parity surfaces consumed by CLI and MCP
- **Exports:** `createRetrievalApi()`, `RetrievalApiError`
- **Depends on:** no internal packages
- **Invariant:** CLI and MCP remain thin adapters over shared retrieval API client behavior

### `packages/log-parser`

- **Owns:** Shared CLI log parser registry, canonical `debugbundle-ndjson` handling, and first-party parsers for existing server log formats
- **Exports:** `CANONICAL_LOG_FORMAT`, `ACCEPTED_LOG_FORMATS`, `formatAcceptedLogFormats()`, `parseAcceptedLogFormat()`, `parseLogFile()`, `buildProjectId()`
- **Depends on:** `shared-types`
- **Invariant:** Parsers are package-owned and registry-driven; command modules do not embed parser-specific regex logic. `debugbundle-ndjson` remains the canonical structured interchange format for zero-install capture across unsupported languages.

### `packages/sdk-node` _(lives in `debugbundle-js` repo)_

- **Owns:** Node.js SDK core capture client, framework/logger adapters, in-memory buffering, failure isolation, vanilla runtime hooks, always-on probe ring buffers, request-scoped trigger-token probe activation, duplicate suppression, ingestion-backoff handling, file transport for local-only mode, and browser relay handler (same-origin endpoint that receives browser events, validates/sanitizes, and writes to local events or spool for durable delivery)
- **Exports:** `debugbundle`, `createDebugBundleSdk()`, universal capture methods, `captureExceptions()`, `captureRejections()`, `captureConsole()`, `express()`, `fastify()`, `nextjs()`
- **Subpath exports (relay):** `@debugbundle/sdk-node/relay` (core relay handler factory), `@debugbundle/sdk-node/relay/express` (Express middleware), `@debugbundle/sdk-node/relay/fastify` (Fastify plugin), `@debugbundle/sdk-node/relay/nextjs` (Next.js API route handler)
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host code; failed or throttled flushes keep buffered events in memory, honor retry backoff, suppress duplicate/looping failures locally, keep remote probe directives process-local, and resolve trigger-token activations from request-local state only. Relay handler must validate Origin, enforce body size limits, strip/override protected fields, and never expose server-side credentials to browser clients (INV-17, INV-18, INV-19).
- **Transport selection:** File transport for `local`/`development` environments (writes to `.debugbundle/local/events/`), HTTP transport for `staging`/`production` in connected mode. Warns on staging/production without cloud connection. Browser relay writes to `.debugbundle/local/events/` (local-only) or `.debugbundle/local/browser-relay-spool/` (connected durable).
- **Internal structure:** `core.ts` owns transport/buffering/runtime state plus request-context lookup; `file-transport.ts` owns atomic file-write transport for local events; `framework-integrations.ts` owns Express/Fastify/Next.js wrappers; `logger-integrations.ts` owns logger detection and method patching; `suppression.ts` owns duplicate suppression and loop-protection state; `remote-probes.ts` owns config parsing and directive matching; `trigger-token.ts` owns request token extraction/validation; `relay.ts` owns core relay handler logic (validation, sanitization, field override, write/forward, durable spool management); `relay-express.ts`, `relay-fastify.ts`, `relay-nextjs.ts` own framework-specific relay adapters; `utils.ts` and `types.ts` hold shared helpers/contracts

### `packages/sdk-browser` _(lives in `debugbundle-js` repo)_

- **Owns:** Browser SDK core capture client, browser-native auto-capture hooks, opaque `window` error and resource-load metadata capture, breadcrumb buffering and standalone breadcrumb shipping, preset-aware first-party network response promotion to `request_event`, always-on probe ring buffers, zero-poll remote probe directive intake, page-load trigger-token probe activation, session-governance controls, network filtering, cross-context trace-header injection for browser requests, privacy-default frontend event capture, unload-safe flushing, device-context collection, duplicate suppression, and transport backoff
- **Exports:** `createDebugBundleBrowserSdk()`, universal browser capture methods, `init()`, `captureException()`, `captureError()`, `captureLog()`, `captureRequest()`, `captureMessage()`, `setContext()`, `probe()`, `flush()`, `dispose()`
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host pages; breadcrumbs default to local ring-buffer-only capture until a `frontend_exception`, except first-party network failures in the current preset's immediate request-failure set, which also emit standalone `request_event` incident signals, and preset-enabled request-anomaly candidates, which emit contextual `request_event` signals when request failure context is enabled; breadcrumbs can be batched as standalone `frontend_breadcrumb` events when configured; always-on probe buffers stay local until exception flush; duplicate exception/log/request storms are suppressed locally with periodic `error_suppressed` checkpoints and in-memory recovery after silence; failed or throttled flushes keep buffered events in memory and retry after backoff; unload paths prefer `navigator.sendBeacon()` with `fetch(keepalive)` fallback. Browser SDK never possesses cloud credentials — events ship through the same-origin relay handler or directly to cloud (static-only mode) but never with project tokens.
- **Transport selection:** Relay (same-origin POST to user's backend) is the default and recommended transport. Static-only (direct POST to cloud) is available when no backend exists. Transport mode is configured via `init({ transport: 'relay' | 'static' })`.
- **Internal structure:** `index.ts` owns transport/buffering state plus public capture APIs and pending trigger-token state; `types.ts` owns browser SDK contracts/constants; `runtime.ts` owns browser environment accessors, normalization, filter helpers, trace-id generation, and probe-directive parsing; `hooks.ts` owns console/network hook installation plus one-time device snapshot capture; `suppression.ts` owns duplicate suppression and loop-protection state; `trigger-token.ts` owns `_debug_probe` token validation

### JavaScript SDK Monorepo

The TypeScript/JavaScript SDKs live in a separate JS SDK repo: `github.com/debugbundle/debugbundle-js`. This follows the industry convention used by other established services — the product-facing JS SDK packages live together in one dedicated repo while shared cross-product libraries can remain core-owned when source coupling still exists.

**`debugbundle-js` repo contents:**

- `packages/sdk-node` (`@debugbundle/sdk-node`) — Node.js backend SDK
- `packages/sdk-browser` (`@debugbundle/sdk-browser`) — Browser SDK

The `debugbundle-js` repo now consumes published `@debugbundle/shared-types` and `@debugbundle/redaction` packages from npm. The core monorepo (`debugbundle/debugbundle`) continues to own the maintained source for those two packages and now owns only their shared-package release workflow, while the dedicated `debugbundle/debugbundle-js` repo owns release automation for `@debugbundle/sdk-node` and `@debugbundle/sdk-browser`.

**Migration note:** The public `debugbundle/debugbundle-js` repo is live, its dedicated release workflow now stages and publishes the SDK packages from that repository, and core dogfooding in `apps/api` and `apps/web` continues to resolve published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. Shared-package publication remains a core responsibility because `shared-types` and `redaction` still have direct source coupling in the main product repo.

**Current ownership note:** `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` are the packages intended to move cleanly with `debugbundle-js`. By contrast, `@debugbundle/shared-types` and `@debugbundle/redaction` remain core-owned source in the current workspace even though they are published as standalone npm packages and consumed by the JS SDK. Core still has meaningful direct source-path coupling to both packages, especially `shared-types`, across product code, tests, and build-time artifact generation. Treat them as externally distributed core libraries for the current Phase 22 repo split; moving their maintained source into `debugbundle-js` would be a later deliberate extraction slice rather than an already-complete ownership transfer.

**Working rule in this workspace:** Edit `packages/shared-types` and `packages/redaction` here in the core repo. Edit JS SDK source in the standalone `debugbundle-js` repo itself or in a local clone bootstrapped into `sdks/debugbundle-js`; do not recreate `shared-types` or `redaction` as source-of-truth inside that SDK clone.

### Non-TypeScript SDKs

All non-TS SDKs implement the same universal SDK interface (`init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`, `probe`) with language-idiomatic naming. See `contracts/sdk-interface.md` for the full contract and `spec/sdk-language-targets.md` for the rollout plan. V1 relay parity is implemented for Python, PHP, WordPress, Java Spring Boot, Java servlet/JAX-RS app-server adapters, Go net/http, and Ruby Rack/Rails. Each full relay-compatible surface validates and sanitizes browser batches, preserves correlation, isolates credentials, writes local-only event files, writes connected durable spool files, and forwards connected events with server-side credentials using the shared relay contract.

All non-TypeScript SDKs live in separate repositories under `github.com/debugbundle/`, each with its own language-native toolchain, CI pipeline, and independent release cycle.

**Local workspace convention:** Separate SDK repos live as independent clones under `sdks/` for single-workspace development. The core repo now ships `sdks.json` plus `scripts/bootstrap-sdks.sh`, root workspace/test/typecheck wiring no longer hardcodes the staged JS SDK tree, and the legacy tracked SDK snapshot directories have been removed from the core repo index. The public site repo lives as a real local clone at the root `site/` path for day-to-day work, while lower-touch companion repos such as `debugbundle/action` live under ignored `.local-repos/` clones. Temporary operator notes and local execution checklists live under ignored `.local-notes/`. On an older long-lived checkout, remove any pre-cutover `sdks/debugbundle-js`, `sdks/debugbundle-python`, or `sdks/debugbundle-php` directories from disk before the first bootstrap run so those paths can be recloned cleanly.
The current local SDK clone set includes `debugbundle-js`, `debugbundle-python`, `debugbundle-php`, `debugbundle-wordpress`, `debugbundle-java`, `debugbundle-go`, and `debugbundle-ruby`.

**Wave 1 (active pre-launch scope):**

| SDK       | Repository                                     | Package Registry                       | Frameworks                                                |
| --------- | ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Python    | `github.com/debugbundle/debugbundle-python`    | PyPI (`debugbundle-python`)            | Django, Flask, FastAPI                                    |
| PHP       | `github.com/debugbundle/debugbundle-php`       | Packagist (`debugbundle/sdk-php`)      | Laravel, Symfony                                          |
| WordPress | `github.com/debugbundle/debugbundle-wordpress` | WordPress.org plugin + GitHub releases | WordPress plugin wrapper over PHP SDK + browser SDK relay |
| Java      | `github.com/debugbundle/debugbundle-java`      | Maven Central                          | Spring Boot, Servlet/JAX-RS app servers, javaagent bootstrap |
| Ruby      | `github.com/debugbundle/debugbundle-ruby`      | RubyGems (`debugbundle`)               | Rails, Rack, Sidekiq                                     |
| Go        | `github.com/debugbundle/debugbundle-go`        | pkg.go.dev                             | net/http, Gin, Echo                                      |

Detailed implementation plans live in `spec/sdks/java-sdk.md`, `spec/sdks/go-sdk.md`, `spec/sdks/ruby-sdk.md`, and `spec/sdks/csharp-sdk.md`; Java, Ruby, and Go now follow their plans in local standalone repos, while C#/.NET is planned as the next Wave 2 SDK repository.

**Wave 2 (post-launch):**

| SDK             | Repository                                  | Package Registry          | Frameworks      |
| --------------- | ------------------------------------------- | ------------------------- | --------------- |
| C#              | `github.com/debugbundle/debugbundle-dotnet` | NuGet (`DebugBundle.Sdk` + `DebugBundle.*`) | ASP.NET Core / .NET |
| Kotlin (server) | `github.com/debugbundle/debugbundle-kotlin` | Maven Central             | Ktor            |
| Rust            | `github.com/debugbundle/debugbundle-rust`   | crates.io (`debugbundle`) | Axum, Actix Web |

**Wave 3 (post-launch, requires Mobile Correlation Contract):**

| SDK              | Repository                                        | Package Registry        | Frameworks        |
| ---------------- | ------------------------------------------------- | ----------------------- | ----------------- |
| Kotlin (Android) | `github.com/debugbundle/debugbundle-android`      | Maven Central           | Android lifecycle |
| Swift (iOS)      | `github.com/debugbundle/debugbundle-swift`        | Swift Package Manager   | UIKit / SwiftUI   |
| React Native     | `github.com/debugbundle/debugbundle-react-native` | npm                     | React Navigation  |
| Dart / Flutter   | `github.com/debugbundle/debugbundle-flutter`      | pub.dev (`debugbundle`) | Flutter           |

### Public Site

The public documentation/marketing/blog site lives in the standalone public repo `github.com/debugbundle/site` and is cloned locally at the root `site/` path when documentation work is needed.

**Build-time boundary:** The standalone site repo no longer imports core apps/packages. Core now owns `scripts/public-site-artifacts.ts`, which generates vendorable static JSON artifacts into `site/public/` before the site build runs. The site-owned `generate:artifacts` script is limited to search-index generation. At runtime (after `next build`), the site has zero workspace dependencies — it's a fully static Next.js export.

**Core-owned artifact inputs (build-time only):**

- `apps/api/src/openapi.ts` — OpenAPI 3.1 spec
- `apps/cli/src/profile-validation.ts` — ProfileSchema
- `apps/cli/src/usage.ts` — CLI usage lines for reference docs
- `apps/mcp/src/tool-catalog.ts` — MCP tool catalog
- `packages/shared-types/src/index.ts` — BundleV1Schema
- `packages/webhook-client/src/index.ts` — WebhookEventPayloadSchema, WebhookEventTypeSchema

**Generated artifact boundary:** `scripts/public-site-artifacts.ts` is the core-owned generator entrypoint. It writes the vendorable output set to the local `site/public/`: `llms.txt`, `openapi.json`, `reference-data.json`, `schemas/bundle.json`, `schemas/profile.json`, `schemas/webhook-events.json`, `schemas/mcp-tools.json`, and the two example bundle JSON files. `site/scripts/generate-public-artifacts.ts` now writes only `search-index.json`.

**Extraction status:** The site repo is already decoupled from core imports, the public `debugbundle/site` repository exists with green dedicated-repo CI, and the public core repo `debugbundle/debugbundle` is now live with green CI as well. Local multi-repo development now uses the real `site/` clone directly instead of keeping a tracked export snapshot in core.

---

## App Boundaries

### `apps/api`

- **Owns:** HTTP route handlers, request/response lifecycle, ingestion endpoint
- **Routes:** See `/contracts/public-interfaces.md`
- **Imports:** `auth`, `shared-types`, `event-normalizer`, `redaction`, `storage`
- **Does NOT own:** Bundle generation, reproduction, webhook delivery (those are worker)
- **Key constraint:** Ingestion (`POST /v1/events`) must be lightweight — validate, rate-limit, enforce capture policy, persist raw, and enqueue only
- **Key constraint:** Ingestion (`POST /v1/events`) must be lightweight — authenticate project token, enforce optional token `allowed_origins` when configured, validate, rate-limit, enforce capture policy, persist raw, enqueue only, and include the resolved capture preset plus resolved `immediate_client_error_statuses` on normalize jobs so request-event classification stays stable in the worker
- **Dogfooding note:** Dogfooding is now re-enabled against the published `@debugbundle/sdk-node` prerelease. `server.ts` optionally initializes the npm-published SDK during bootstrap when `DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, the manual dev-only backend trigger route `GET /__dogfood/backend-error` remains gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`, and the hosted owner-authenticated verification route `POST /v1/internal/dogfooding/backend-error` is separately gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER=true`.
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now publishes the API on host port `3003`, so the backend dogfood trigger is reachable directly at `http://localhost:3003/__dogfood/backend-error`
- **Internal structure:**
  - `server.ts` — route composition (delegates to route modules)
  - `dogfooding.ts` — env-gated API SDK bootstrap and manual backend trigger registration
  - `audit-logging.ts` — fail-open audit log recording with actor-type resolution (browser session vs member token) and request IP hashing
  - `routes/account.ts` — owner-scoped browser-session account export, cached-avatar retrieval/import, and destructive account deletion with confirmation + audit logging
  - `routes/health.ts` — health/ready/live probes
  - `routes/auth.ts` — signup/login/logout/session plus invite-acceptance, GitHub start/callback browser-auth flows, GitHub device bootstrap, GitHub access-token exchange, session auth-method disclosure, and best-effort GitHub avatar caching after browser OAuth completion
  - `routes/ingestion.ts` — event ingestion
  - `routes/incidents.ts` — incident retrieval, bundle, reproduction, logs
  - `routes/project-members.ts` — project-scoped collaborator listing, cached member-avatar reads, pending-invite lifecycle, invite creation with transactional invite email delivery, role updates, and member removal
  - `routes/billing.ts` — owner-scoped billing summary and allowance-capacity management for browser sessions or member tokens, plus browser-only Stripe checkout and customer-portal handoff
  - `routes/stripe-webhook.ts` — Stripe webhook ingestion with raw-body signature verification, idempotent event processing, and entitlement recomputation for checkout.session.completed, subscription.created/updated/deleted, invoice.paid, and invoice.payment_failed events, including synced Stripe billing-period boundaries used by billing summaries
  - `routes/projects.ts` — organization-scoped project list/create/update/delete with owner-only destructive enforcement
  - `routes/services.ts` — project-scoped service retrieval
  - `routes/alerts.ts` — alert rule CRUD plus reusable Slack destination ID validation for connected Slack alerts
  - `routes/slack.ts` — Slack OAuth connect flow plus reusable Slack destination list/test/delete routes shared by web, CLI, and MCP
  - `routes/probes.ts` — remote probe activation/deactivation and trigger-token issuance
  - `routes/capture-policy.ts` — per-project capture policy GET/PATCH
  - `routes/tokens.ts` — token lifecycle CRUD
  - `routes/webhooks.ts` — webhook CRUD, synthetic test delivery, delivery history retrieval, and manual delivery retry
  - `routes/weekly-report-channels.ts` — per-project weekly report channel CRUD
  - `routes/github.ts` — GitHub App installation listing, project-scoped repo connection/disconnection, dispatch rule CRUD, dispatch delivery history/retry, installation callback handling, and GitHub App webhook ingestion endpoint
  - `api-types.ts` — shared type definitions
  - `api-helpers.ts` — auth guards, response builders, browser-session/member-token convergence, owner-role principal checks
  - `schemas.ts` — Zod request/response schemas
  - `slack-app.ts` — Slack OAuth state cookie, redirect-path validation, and code exchange helpers
  - `openapi.ts` — API-owned OpenAPI 3.1 generator built from request schemas plus shared client response schemas for public artifact publication
  - `stripe-config.ts` — Stripe client factory, price-to-plan mapping, billing state derivation, entitlement eligibility checks
  - `billing-slot-management.ts` — Stripe subscription state loading, projected billing summary computation, subscription-item quantity building for immediate allowance-capacity increases, and subscription-schedule phase building for deferred allowance-capacity reductions
  - `billing-links.ts` — env-based static billing URL fallback when Stripe API is not configured
  - `default-dependencies.ts` — dependency composition including account export artifact hydration for retained raw events, failure bundles, improvement bundles, and reproductions; project-object cleanup on account deletion; dynamic Stripe checkout session; customer portal creation; projected billing summaries; and Stripe-backed allowance-capacity mutations
  - shared client packages under `packages/*-client` — thin typed HTTP adapters reused by CLI and MCP parity flows; billing allowance-capacity management uses `packages/billing-client`
  - `runtime.ts` — server bootstrap, graceful shutdown, and conditional Stripe webhook wiring (creates separate connection pool for billing sync)

### `apps/worker`

- **Owns:** Background job processing via BullMQ
- **Jobs:** `normalize-events`, `group-incident`, `build-bundle`, `build-reproduction`, `evaluate-alerts`, `deliver-alert-email-digest`, `deliver-operational-email`, `deliver-webhook`, `generate-weekly-report`, `cleanup-retention`, `dispatch-github`
- **Imports:** `bundle-engine`, `repro-engine`, `event-normalizer`, `shared-types`, `redaction`, `email`
- **Key constraint:** All jobs must be idempotent; lifecycle webhooks gate new intents against `monthly_webhook_deliveries` before queue insertion, alert evaluation achieves this by persisting one internal `alert_deliveries` row per alert/incident/dedupe key before immediate non-email delivery plus an `alert_email_digests` / `alert_email_digest_items` queue for fixed 10-second email batching, operational owner notifications are persisted in `operational_email_deliveries` before email transport attempts so webhook auto-disable, allowance, and retention notices can retry independently, resolving reusable Slack destinations only after the claim row is written, weekly reporting now relies on persisted `bundle_generations` history plus `weekly_report_deliveries` claim rows before email or Slack transport is attempted, request/log hosted improvement bundles share the same retained-bundle-cap pruning path as failure bundles across one combined incident/improvement inventory while incident-derived improvement opportunities only link to related failure bundles, and GitHub dispatch achieves idempotency via `github_dispatch_deliveries` claim rows with cooldown enforcement before `repository_dispatch` API calls and non-retryable `skipped` rows for DebugBundle-side hourly suppressions
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now starts the worker alongside API and web so local dogfooding can exercise the full ingestion-to-bundle path without a separate manual worker launch

### `apps/cli`

- **Owns:** CLI command parsing, terminal I/O, interactive flows, local processing pipeline
- **Commands:** See `/contracts/public-interfaces.md` and `/spec/local-first-onboarding.md` §11
- **Imports:** `shared-types`, `auth`, `event-normalizer`, `bundle-engine`, `repro-engine` (for local processing), `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads/writes `.debugbundle/` for local operations.
- **Key constraint:** Exit codes must follow contract (0/1/2/3/4, with existing management-command conflict/forbidden mappings still using 5 where already established)
- **Local-first commands:** `setup` (guided onboarding with mixed-runtime service discovery, interactive target selection in TTY sessions, JSON `selected_targets` / `relay_guidance`, and optional relay-route scaffold for Fastify, Express, and Next.js App Router projects when both DebugBundle SDKs are present), `doctor`, `validate`, `profile validate`, `verify local`, `verify cloud` including active synthetic `--trigger-5xx` / `--trigger-4xx` plus app-event verification via `--expect-app-event`, `process` (local event → bundle pipeline), `analyze`, `ingest`/`watch` (log-based capture), `connect` (upgrade to cloud), `resolve`/`reopen` (incident lifecycle), `clean` (retention)
- **Internal structure:** `main.ts` owns top-level argv routing; `argv-helpers.ts` owns shared CLI parsing and option coercion; `login-command.ts` now owns all bootstrap login paths including direct member-token persistence, GitHub device flow polling, and `gh auth token` exchange; `cli-fs-helpers.ts` owns shared filesystem utility helpers (`isRecord`, `isMissingPathError`, `resolveWorkspacePath`) used across CLI command modules; `management-command-handlers.ts` owns token/project/alert/slack/webhook/weekly-report/capture-policy/billing/probe/project-members/github/improvements subcommand routing; `auth-context.ts` owns stored-auth HTTP client creation for shared API clients including `createAuthenticatedBillingApi`, `createAuthenticatedSlackApi`, and `createAuthenticatedGitHubManagementApi`; `billing-commands.ts` owns billing summary retrieval and capacity-management commands (get, capacity increase, capacity schedule-reduction, capacity cancel-reduction) via `packages/billing-client`; `slack-commands.ts` owns connected Slack destination list/connect-url/test/delete flows via `packages/slack-client`; `improvement-commands.ts` owns hosted improvement list/get/bundle/resolve/reopen flows while `improvement-settings-commands.ts` owns project-scoped hosted-improvement automation settings; `setup-command.ts` owns the public `setup` scaffold flow, with `setup-service-discovery.ts` handling mixed-runtime service inference, `setup-target-selection.ts` handling TTY target selection defaults, and `setup-relay-guidance.ts` handling runtime-specific relay scaffolding/instructions; `connect-command.ts` owns the local-only to connected-mode upgrade flow (profile validation, cloud project selection/creation, project-token minting, and connection-config rewrite); `verify-command.ts` owns local proof generation plus passive cloud verification, active synthetic cloud verification through temporary project-token creation and real `/v1/events` ingestion, and app-event verification that waits for hosted incident visibility using service/environment plus optional trace/request correlation hints; `project-commands.ts` owns project lifecycle mutations (list, create, update, delete) exposed through the CLI via `packages/project-management-client`; `github-commands.ts` owns GitHub installation-status, repository-listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry commands via `packages/github-client`; `probe-commands.ts` owns remote probe activation/deactivation/listing exposed through the CLI with inline API client; `member-commands.ts` owns project collaborator management (list, invites, invite, cancel-invite, update-role, remove) with inline API client; `ingest-command.ts` owns one-shot local event-batch writes plus handoff into the existing process pipeline while delegating format parsing to `packages/log-parser`; `watch-command.ts` owns incremental log tailing from EOF, rewrite/truncation detection, repeated registry-backed parsing, and the mode-specific fanout between local event-batch writes plus `process` handoff and connected-mode direct shipment to `POST /v1/events`; `local-scaffold.ts` owns generated scaffold templates plus cleanup of older DebugBundle-generated scaffold paths required by onboarding spec; `local-retrieval-store.ts` owns local incident/bundle/reproduction reads plus local resolve/reopen state mutations against `.debugbundle/local/state.json` and `.debugbundle/bundles/local/`; `retrieval-source.ts` owns shared source-tagging plus merged incident pagination helpers used by CLI and MCP retrieval; `cloud-artifact-cache.ts` owns persistence of explicit cloud bundle/reproduction fetches into `.debugbundle/bundles/cloud/`, cache-status sync for cloud resolve, and opportunistic 30-day expiry pruning; `clean-command.ts` owns the operator-facing local retention surface for processed local events, local incident-cap trimming with resolved-first eviction, explicit cloud-cache pruning, and scaffold-preserving `--all` runtime reset; `doctor-command.ts`, `validate-command.ts`, `profile-command.ts`, and `analyze-command.ts` own local-first validation and analysis workflows; `process-command.ts` owns the local file-transport pipeline, preset-aware full reprocessing, local request-anomaly synthesis, and state/bundle writing; `retrieval-commands.ts`, `token-commands.ts`, `project-commands.ts`, `services-command.ts`, `alert-commands.ts`, `slack-commands.ts`, `webhook-commands.ts`, `weekly-report-commands.ts`, `capture-policy-commands.ts`, `probe-commands.ts`, `member-commands.ts`, `github-commands.ts`, `improvement-commands.ts`, and `improvement-settings-commands.ts` are thin command adapters over shared clients or local orchestration modules, including explicit `source` routing, default merged local/cloud retrieval behavior in connected mode, and cloud artifact cache refresh on explicit fetch

### `apps/mcp`

- **Owns:** MCP protocol adapter (stdio transport)
- **Tools:** See `/contracts/public-interfaces.md`
- **Imports:** `shared-types`, `auth`, `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads `.debugbundle/` for local-store queries and local lifecycle updates when unconnected, when `source: "local"` is explicitly requested, or when connected-mode detail/lifecycle retrieval probes local state before falling back to cloud.
- **Key constraint:** Thin adapter only — no unique business logic. Must support local-store reads when cloud is unavailable.
- **Internal structure:** `main.ts` owns the external stdio entrypoint for the publishable `@debugbundle/mcp` package; `server.ts` owns MCP JSON-RPC request handling for initialize, tool listing, and tool calls; `default-tools.ts` composes the default runtime tool registry over shared HTTP clients, CLI auth state, and local CLI modules; `retrieval-tools.ts`, `token-tools.ts`, `project-tools.ts`, `services-tools.ts`, `setup-tools.ts`, `analyze-tools.ts`, `alert-tools.ts`, `slack-tools.ts`, `webhook-tools.ts`, `weekly-report-tools.ts`, `billing-tools.ts`, `capture-policy-tools.ts`, `probe-tools.ts`, `member-tools.ts`, `github-tools.ts`, `improvement-tools.ts`, and `improvement-settings-tools.ts` expose thin MCP tool factories over shared clients or existing CLI modules; GitHub MCP coverage now includes installation status, repository listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry. `tool-catalog.ts` owns the source-of-truth MCP tool catalog with Zod input schemas for all shipped tools, used by the public-site artifact pipeline to generate `/schemas/mcp-tools.json`; retrieval tools now reuse the CLI local-store reader plus `retrieval-source.ts` helpers for merged connected-mode incident listing, local-first detail/artifact/lifecycle lookup, explicit source tagging, and `cloud-artifact-cache.ts` persistence so cloud bundle/reproduction fetches refresh `.debugbundle/bundles/cloud/`, cloud resolve updates cached status snapshots, and stale cloud-cache files are pruned during explicit cache activity

### `apps/web`

- **Owns:** Implemented first seven web management slices plus hosted improvement management: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/settings`, `/member-tokens`, `/projects`, `/improvements`, `/projects/:projectId/improvements`, `/projects/:projectId/improvements/:improvementId`, `/projects/:projectId/settings`, `/projects/:projectId/members`, `/projects/:projectId/tokens`, `/projects/:projectId/probes`, `/projects/:projectId/webhooks`, `/projects/:projectId/alerts`, `/projects/:projectId/github`, `/invite`, and `/billing`
- **Framework:** React + Vite SPA deployed to `app.debugbundle.com`
- **Imports:** `shared-types`
- **Communication:** Calls HTTP API at `api.debugbundle.com` (cross-origin, same-site)
- **Key constraint:** Web is NOT the product core. Agent/CLI/API are primary interfaces. UI must stay reusable, shadcn-based, theme-capable, and use cookie-backed session auth. The public site remains a separate static-exported Next.js + Fumadocs deployment on `debugbundle.com` with marketing pages, `/docs`, and `/blog`. Focused frontend validation runs through `make web-check`.
- **Dogfooding note:** Dogfooding is now re-enabled against the published `@debugbundle/sdk-browser` prerelease. `src/main.tsx` optionally initializes the npm-published browser SDK during startup when `VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, and the manual dev-only console bridge `window.__DEBUGBUNDLE_DOGFOOD__.triggerFrontendException()` remains gated by `VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`.
- **Internal structure:** `src/app.tsx` owns route composition and protected-page gating for the auth, projects, improvements, project-settings, project-token, project-probe, project-webhook, project-alert, organization-member, billing, and incidents surfaces; `src/pages/management-pages.tsx` owns the general management-route page implementations; `src/pages/settings-page.tsx` owns account settings including auth-method-aware password controls, account export, and destructive account deletion; `src/pages/organization-overview-page.tsx` remains a dormant future-facing page component that is not currently routed in the app shell; `src/pages/project-settings-page.tsx` owns the project-scoped settings page including destructive deletion and hosted improvement automation controls; `src/pages/improvements-page.tsx`, `src/pages/project-improvements-page.tsx`, and `src/pages/improvement-detail-page.tsx` own the hosted improvement queue and detail workflows; `src/pages/project-probes-page.tsx` owns paid-tier remote probe activation/listing/deactivation and one-time trigger token display; `src/pages/project-webhooks-page.tsx` owns the project-scoped webhook management page; `src/pages/project-alerts-page.tsx` owns the project-scoped alert management page including Team-tier Slack connected-destination setup and selection; `src/pages/incidents-page.tsx` owns the incidents inventory page; `src/pages/incident-detail-page.tsx` owns the incident detail workflow including explicit resolve actions and scoped back-navigation; `src/lib/api.ts` owns cookie-backed auth/session/member-token/project/project-token/project-probe/project-webhook/project-alert/organization-member/billing/account/incident/improvement requests, including session auth-method metadata, account export/deletion, resolve-incident mutation, project deletion, improvement lifecycle mutations, and incident payload denormalization fields (`project_name`, `service_name`, `resolved_at`), with project-settings details currently resolved from existing project/member/invite/billing responses; `src/lib/slack-api.ts` owns the browser Slack connect/install-url helper plus reusable destination listing for the alerts UI; `src/lib/dogfooding.ts` owns env-gated browser SDK bootstrap and the manual trigger bridge; `src/lib/session.tsx` owns session bootstrap and refresh state; `src/lib/theme.tsx` owns theme state and DOM synchronization; `src/components/ui/*` holds shadcn-based primitives; `src/components/system/*` holds the reusable app shell, page header, callout, theme-toggle, one-time plaintext-secret reveal, and billing presentation components.

### `site/` (public-site)

- **Owns:** The static public-site surface for `debugbundle.com`, including route-group boundaries for marketing pages (landing with product hero/how-it-works/value-props/SEO, pricing with full Free/Solo/Team tier data, legal/informational pages), MDX-backed `/docs` and `/blog` routes (4 authored blog posts: launch announcement, product thesis, agent-first debugging, local-first development), build-time publication of machine-readable public artifacts, and the generated `/docs/v1/reference/*` subtree. Documentation content authored per `spec/documentation.md` (65-page surface with `meta.json` navigation, P0/P1/P2 priority slices, Orama static search).
- **Framework:** Next.js App Router with static export and a live Fumadocs-backed MDX docs/blog content pipeline
- **Imports:** Internal site config and site-owned presentation components only
- **Communication:** No runtime dependency on the product API for page rendering; machine-readable artifacts and generated reference content are emitted as static assets or build-time outputs, with `/openapi.json` sourced from the API-owned generator in `apps/api/src/openapi.ts` through the core-owned `scripts/public-site-artifacts.ts` pipeline and the page-facing reference subtree hydrated from a locally generated `public/reference-data.json` snapshot
- **Key constraint:** Must remain deployable as a static export suitable for standard static hosting, with token-driven light/dark theming and minimal ownership of Fumadocs internals in the first pass.
- **Internal structure:** `app/layout.tsx` owns shared metadata and theme-provider wiring; `app/(site)/*` owns marketing and legal routes; `app/(docs)/docs/*` owns the versioned docs entry tree including the MDX catch-all docs route and `/docs/v1/reference/*`; `app/(blog)/blog/*` owns the blog index and dynamic post routes; `app/sitemap.ts` and `app/robots.ts` own static SEO outputs; `source.config.ts` owns the Fumadocs collection declarations; `content/docs/*.mdx` and `content/blog/*.mdx` own authored docs/blog content; `src/content-source.ts` owns the static-export-safe Fumadocs source wiring; `src/content-components.tsx` owns the shared MDX component map; `src/site-config.ts` owns route, nav, and theme constants; repo-root `scripts/public-site-artifacts.ts` owns build-time publication of `llms.txt`, `openapi.json`, schemas, example artifacts, and `reference-data.json`; `site/scripts/generate-public-artifacts.ts` owns search-index publication; `src/reference-data.ts` now carries the reference-data type contract used by page-time readers; `src/reference-content.ts` owns page-time loading of that generated reference snapshot; `src/components/*` owns reusable site, docs, blog, theming, and reference-table shells

---

### `packages/storage`

- **Owns:** All storage adapters: Postgres metadata, hosted improvement opportunity persistence, S3 object store, Redis queue, Redis frequency counters
- **Exports (via barrel `index.ts`):** All types, adapters, and service factories
- **Depends on:** `shared-types`, `auth`
- **Internal structure:**
  - `types.ts` — all storage type definitions and interfaces
  - `helpers.ts` — object key builders, token hashing
  - `auth-store.ts` — Postgres account creation, password credential, session, one-time token persistence, and session auth-method flags
  - `account-store.ts` — Postgres account export aggregation for retained organization/project records and destructive account-deletion lifecycle persistence
  - `integration-secret-crypto.ts` — shared encryption/decryption helpers for stored integration secrets such as Slack webhook URLs
  - `metadata-store.ts` — Postgres metadata store (account membership, explicit project ownership + `project_members`, invite-token-backed `project_invites`, invite cancellation/acceptance, project list/create + tokens, incidents, probes, deployments, alerts, weekly-report aggregation, incident-event retention reasons)
  - `improvement-opportunity-store.ts` — Postgres hosted improvement automation persistence (project execution settings lookup, deterministic warning-hotspot/slow-request/request-failure opportunity storage, incident-derived opportunity storage with `related_incident_ids`, improvement-event sampling, improvement bundle generation reservation/failure tracking, retained-bundle-cap pruning for improvement/incident owners)
  - `improvement-opportunity-recording.ts` — shared hosted-improvement recording helpers (fingerprinting plus generic opportunity upsert/event-sampling SQL reused by multiple deterministic rules)
  - `slack-destination-store.ts` — Postgres reusable Slack destination CRUD plus worker-side encrypted-secret lookup
  - `billing-store.ts` — Postgres billing summary queries derived from organization plan, active-project counts, shared allowance-capacity units, and monthly usage counters
  - `alert-delivery-store.ts` — Postgres alert evaluation queries, immediate alert delivery-intent persistence, and queued email-digest persistence/claiming
  - `operational-email-delivery-store.ts` — Postgres operational email delivery ledger with dedupe and retry state for system-triggered owner notifications
  - `webhook-delivery-store.ts` — Postgres webhook delivery persistence
  - `weekly-report-channel-store.ts` — Postgres weekly-report channel CRUD and scheduler lookup
  - `frequency-counter.ts` — Redis rolling frequency counter (1m/5m/1h/24h buckets)
  - `ingestion-rate-limiter.ts` — Redis-backed per-token ingestion rate limiting
  - `ingestion-services.ts` — ingestion metadata, member auth, persistence services
  - `s3-client.ts` — S3-compatible object store adapter
  - `redis-queue.ts` — Redis queue client (enqueue/dequeue typed jobs)
  - `billing-sync-store.ts` — Postgres billing sync for Stripe webhooks (idempotent event dedup, entitlement updates, Stripe customer linking, entitlement revocation)
  - `github-store.ts` — Postgres GitHub automation persistence for installations, project repo connections, dispatch-rule CRUD, worker-side dispatch matching/cooldown/rate-limit counters, and project-scoped dispatch-delivery claim/history/retry state
  - `audit-log-store.ts` — Postgres audit log persistence (create, query by organization/action/time range)
  - `retention-store.ts` — Postgres tier-aware retention cleanup service (sampled event expiry by organization tier)
  - `migrations.ts` — authoritative bootstrap schema and required-table manifests (not re-exported from barrel)
  - `schema-migrations.ts` — ordered forward migrations, migration ledger/checksum enforcement, and runtime readiness assertions for existing databases
- **Key constraint:** All external consumers import only from `index.ts` barrel

**Production DB rule:** After first public release, schema changes must never rely on bootstrap SQL or restart ordering alone. Use forward migrations, run them before API/worker consume the schema, and ship destructive cleanup only after compatible code has already been live.

### `packages/retrieval-client`

- **Owns:** Authenticated retrieval HTTP client shared by CLI and MCP
- **Exports:** `createRetrievalApi()`, response/error contracts
- **Key constraint:** Owns all retrieval path/query construction and response-shape validation

### `packages/token-management`

- **Owns:** Authenticated token lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createTokenManagementApi()`, response/error contracts
- **Key constraint:** Owns all token-management path construction and response-shape validation

### `packages/project-management-client`

- **Owns:** Authenticated project list/create HTTP client used by CLI connect flows
- **Exports:** `createProjectManagementApi()`, response/error contracts
- **Key constraint:** Owns project-management path construction and response-shape validation so connect logic stays out of raw HTTP route strings

### `packages/alert-client`

- **Owns:** Authenticated alert lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createAlertApi()`, alert response contracts, structured API errors
- **Key constraint:** Owns alert path/query construction, delete success mapping, and response-shape validation for list/create/update/delete alert-rule surfaces

### `packages/webhook-client`

- **Owns:** Authenticated webhook lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createWebhookApi()`, webhook/delivery response contracts, structured API errors
- **Key constraint:** Owns webhook path/query construction, delete success mapping, synthetic test-delivery request shaping, and response-shape validation for list/create/get/update/delete/test/delivery-history surfaces

### `packages/billing-client`

- **Owns:** Authenticated billing HTTP client shared by CLI and MCP parity flows
- **Exports:** `createBillingApi()`, `BillingApiError`, `expectBilling()`, billing summary Zod schemas
- **Key constraint:** Owns billing path construction, response-shape validation, and error mapping for billing summary retrieval and allowance-capacity management (increase, schedule reduction, cancel reduction). Does not expose checkout/portal (browser-session-only surfaces).

### `packages/github-client`

- **Owns:** Authenticated GitHub automation HTTP client shared by CLI and MCP for managing GitHub App installations, repository connections, dispatch rules, and dispatch delivery history/retry
- **Exports:** `createGitHubManagementApi()`, `GitHubManagementApiError`, response/error contracts, GitHub automation Zod schemas
- **Depends on:** none (internal packages)
- **Key constraint:** Owns all GitHub automation path/query construction and response-shape validation for installation listing, repo connection/disconnection, dispatch-rule CRUD, delivery history retrieval, and manual delivery retry. Does not own GitHub App credential management or dispatch execution (those are API/worker-owned).

## Storage Boundaries

| Store      | Owned By                                              | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `apps/api`, `apps/worker`                             | 37 relational tables (users, organizations, organization_members, projects, project_tokens, member_tokens, services, incidents, incident_events, processed_events, improvement_opportunities, improvement_opportunity_events, bundle_generations, alert_rules, alert_deliveries, alert_email_digests, alert_email_digest_items, agent_webhooks, webhook_deliveries, weekly_report_channels, weekly_report_deliveries, probe_activations, deployments, org_usage_counters, capture_policies, github_installations, project_github_repos, github_dispatch_rules, github_dispatch_deliveries, audit_logs, password_credentials, sessions, email_verification_tokens, password_reset_tokens, invites, oauth_identities, processed_billing_events) |
| Amazon S3  | `apps/api` (write), `apps/worker` (read/write/delete) | Raw events (`raw/{project_id}/{date}/{event_id}.json`) for retained sampled occurrences, bundles (`bundles/{project_id}/{incident_id}/bundle.json.gz`), reproductions (`reproductions/{project_id}/{incident_id}/reproduction.json.gz`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Redis      | `apps/api`, `apps/worker`                             | BullMQ job queues, incident frequency counters, ingestion rate-limit counters, GitHub App installation token cache (50m TTL), optional caches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## Data Flow Summary

### Ingestion Flow

```
SDK → POST /v1/events → API validates → enforce capture policy (reject policy-violating events) → S3 (raw) → Redis queue → Worker processes

Current execution detail: API request path does not persist incident metadata synchronously; worker-owned `normalize-events` and `group-incident` jobs perform normalization, event_class classification, grouping lifecycle persistence, sampled-occurrence retention decisions, raw-object pruning for demoted summary-only events, and transition evaluation. Exceptions, `error`/`fatal`/`critical` logs, and request events in the preset-specific immediate request-failure set classify as `incident_signal`; other request events remain `context_signal`. A dedicated request-anomaly counter in Redis can enqueue a deterministic anomaly-triggered `group-incident` job for repeated contextual request failures without changing the stored `event_class`. Free-tier billing counts only `incident_signal` events (INV-15).
```

### Retrieval Flow

```
CLI/API/MCP → GET /v1/incidents/{id}/bundle → API reads Postgres metadata → S3 (bundle artifact) → response

Webhook delivery status retrieval follows the same API/domain-store path (e.g., `GET /v1/webhooks/{id}/deliveries` reads Postgres delivery metadata).

Incident list/detail retrieval follows the same API/domain-store path and scope checks (e.g., `GET /v1/incidents` and `GET /v1/incidents/{id}` resolve member identity from `member_tokens` and enforce organization-scoped metadata queries).

Retrieval authorization is member-token based and metadata-backed: API resolves token hash from `member_tokens` and enforces organization scoping before returning retrieval payloads.

Current retrieval implementation includes scoped artifact and log surfaces: `GET /v1/incidents/{id}/bundle` (artifact or pending), `GET /v1/incidents/{id}/reproduction` (artifact), and `GET /v1/logs?incident_id=...` (incident-event log rows).
```

### Webhook Flow

```
Worker lifecycle event (bundle.reopened / incident.spike_detected) → match enabled `agent_webhooks` by event + filters (environment/service/severity) → persist delivery intent (Postgres) → claim due deliveries by `next_attempt_at` → enqueue `deliver-webhook` jobs → real HTTP delivery attempt with HMAC signature + retry-state/observability updates → after 50 consecutive final failures auto-disable the webhook (`is_enabled = false`)

API test delivery (`POST /v1/webhooks/{id}/test`) → scope webhook to member organization → persist synthetic delivery intent already claimed for attempt 1 → enqueue `deliver-webhook` immediately → reuse the same signed worker transport + retry bookkeeping

CLI/MCP parity for synthetic tests stays thin: `debugbundle webhook test` and `test_webhook` both delegate to `packages/webhook-client`, which owns the shared `POST /v1/webhooks/{id}/test` request/response contract.
```

### Weekly Reporting Flow

```
build-bundle reservation → append deterministic `bundle_generations` history row → project creation seeds one enabled owner-recipient email `weekly_report_channels` row using browser timezone when available, otherwise UTC → API/CLI/MCP/web project settings manage explicit per-project `weekly_report_channels` with at most one email channel per project → runtime scheduler evaluates enabled channels in their configured timezone/day/hour → aggregate weekly bundle counts + new incidents + resolved incidents + regressions + top spikes for the computed 7-day window → suppress zero-activity projects → claim idempotent `weekly_report_deliveries` row per channel window → combine due email deliveries for the same recipient set and weekly window into one email with per-project sections while Slack remains project/channel scoped → render/send email via `packages/email` or post Slack webhook text → mark each delivery `delivered` or `failed`
```

### GitHub Dispatch Flow

```
Worker lifecycle event (bundle.created / bundle.reopened / incident.spike_detected / improvement_bundle.created) → match enabled `github_dispatch_rules` by event + filters (environment/service/severity/bundle_type and incident_status when applicable) + target cooldown check → enforce DebugBundle hourly dispatch caps (100/project/hour, 4000/installation/hour) and persist non-retryable `skipped` history rows for suppressed matches → persist delivery intent targeting either an incident or improvement opportunity (Postgres `github_dispatch_deliveries`) → claim due deliveries by `next_attempt_at` → acquire GitHub App installation token (Redis cache, 50m TTL) → POST `repository_dispatch` with event_type "debugbundle.incident" and client_payload (summary fields + API links, including `improvement_id` for hosted improvements) → update delivery status/retry state → retry on failure (1s → 5s → 30s → 2m → 10m, 5 attempts max)
```

### Agent Automation Flow

```
Webhook (bundle.created) → Agent receives → GET bundle → GET reproduction → analyze repo → propose patch → open PR
GitHub dispatch (debugbundle.incident) → GitHub Actions workflow triggers → public `debugbundle/action@v1` can fetch incident failure-bundle context when `incident_id` is present, while hosted improvement workflows can use `links.bundle` and a member token to fetch the improvement bundle when `improvement_id` is present → repository-owned automation analyzes → proposes fix / opens issue / creates PR

The action now lives in its own public repository, `debugbundle/action`. This core workspace keeps the workflow examples under `examples/github-actions/`, while local action-source work happens in the standalone clone at `.local-repos/action`.
```

---

## Local Project Files (`.debugbundle/` and `.agents/`)

```
.debugbundle/
  profile.json                — Project description (committed, validation_status tracked)
  local/
    events/                    — Raw SDK file-transport events (gitignored)
    browser-relay-spool/       — Browser relay durable delivery spool plus `.delivered` sidecars (gitignored, connected mode)
    state.json                 — Processing watermark, incident index (gitignored)
    connection.json            — Delivery policy per environment (committed)
  bundles/
    local/                     — Locally processed bundles (gitignored)
    cloud/                     — Cloud-fetched artifact cache (gitignored)

.agents/
  skills/
    debugbundle/
      SKILL.md                 — Agent skill per agentskills.io spec (committed)
      references/              — CLI, MCP, bundle-schema, profile-enrichment docs
      assets/                  — Analysis schemas and examples
      evals/                   — Evaluation fixtures
```

`debugbundle validate --fix` owns drift repair for generated skill content: it recreates missing files and refreshes stale managed skill references, schemas, and evals to the current CLI templates while preserving the reviewed profile.

See `/spec/local-first-onboarding.md` for the full layout rationale, gitignore policy, and artifact lifecycle.

---

## Self-Host Topology

```
docker-compose.yml
  ├── api        (Node.js / Fastify)        — startup preflight (DB schema + Redis + S3), GET /ready returns 503 on degradation
  ├── worker     (Node.js / BullMQ)          — startup preflight (DB schema + Redis + S3), internal health server on WORKER_HEALTH_PORT
  ├── web        (React + Vite SPA)
  ├── postgres   (PostgreSQL 17+)
  ├── redis      (Redis 7+)
  └── localstack (S3-compatible, replaces hosted S3)
```

Same core services as cloud. No feature differences except billing integration.

Both API and worker fail-fast at startup if any dependency check fails (missing DB tables, Redis unreachable, S3 bucket missing). The API `/ready` endpoint re-runs these checks on each request and returns `503 {status: "not_ready", reason}` when the stack is degraded. The worker exposes an internal HTTP health server (env `WORKER_HEALTH_PORT`, default disabled) whose `/ready` endpoint is used by the Compose health check instead of `pidof node`.

---

## Test Organization

```
tests/
  vitest.setup.ts              — Global test setup (jsdom matchers, cleanup)
  helpers/                     — Shared test utilities
  fixtures/                    — Golden fixture files
  apps/
    api/                       — API route, runtime, and dependency tests
    cli/                       — CLI command, routing, and auth tests
    mcp/                       — MCP tool surface tests
    web/                       — React SPA tests (jsdom)
    worker/                    — Worker processor, runtime, and scheduling tests
  packages/
    alert-client/              — Alert client tests
    auth/                      — Auth service and Postgres auth store tests
    bundle-engine/             — Bundle generation tests
    email/                     — Email rendering and transport tests
    event-normalizer/          — Event normalization tests
    redaction/                 — Redaction tests (moved to debugbundle-js repo)
    repro-engine/              — Reproduction engine tests (behavior, golden, redaction)
    retrieval-client/          — Retrieval client tests
    sdk-browser/               — Browser SDK tests (moved to debugbundle-js repo)
    sdk-node/                  — Node SDK tests (moved to debugbundle-js repo)
    shared-types/              — Shared type/schema tests (moved to debugbundle-js repo)
    storage/                   — Storage adapter, store, and migration tests
    token-management/          — Token management client tests
    webhook-client/            — Webhook client tests
    weekly-report-client/      — Weekly report client tests
    github-client/             — GitHub automation client tests
  integration/                 — Docker-backed ingestion integration tests
  contracts/                   — Cross-cutting contract and parity tests
  infrastructure/              — CI wiring and migration script tests
```

Test placement rules are defined in `rules/test-organization.md`.

Integration tests run serially (`--no-file-parallelism --maxWorkers=1`) to avoid cross-file state interference from shared DB/Redis.

---

## Repository Strategy

**This workspace** = the public core repo checkout plus local convenience clones. Core apps, packages, self-host assets, docs, and tests live here, while the public site repo lives at `debugbundle/site`. The real local `site/` clone now lives at the repo root, lower-touch companion repos live under ignored `.local-repos/`, and standalone SDK clones live under `sdks/`.

`/post-v1` is reserved for deferred planning artifacts and future feature candidates. It is intentionally non-authoritative and must not override the active V1 spec layer in `/spec`, `/contracts`, or `/rules`.

Environment-specific deployment configuration, operations runbooks, and other private infrastructure concerns are intentionally outside this public architecture map.

---

## Key Contract & Rule Files

| File                                  | Governs                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec/local-first-onboarding.md`     | Local-first product model, onboarding flow, SDK transport strategy, log-based capture, local processing pipeline, agent skill structure |
| `/spec/auth-architecture.md`          | First-party auth model: sessions, member tokens, project tokens, auth surfaces, credential flows, data model, API contract shape        |
| `/spec/tech-stack.md`                 | Frontend framework, UI system, hosted cloud direction, deployment shape, sizing, operational baseline                                   |
| `/contracts/public-interfaces.md`     | API, CLI, MCP, webhook, SDK interface definitions + parity matrix                                                                       |
| `/contracts/data-schemas.md`          | Database tables, event envelope, bundle schema                                                                                          |
| `/contracts/sdk-interface.md`         | Universal SDK interface: core methods, vanilla hooks, log capture, framework integration                                                |
| `/rules/coding-standards.md`          | Code style, documentation style, environment detection, git conventions                                                                 |
| `/rules/design-discipline.md`         | Frontend/UI/UX, accessibility, layout, interaction, and design-system rules                                                             |
| `/rules/domain-invariants.md`         | Hard business rules (23 invariants)                                                                                                     |
| `/rules/architectural-constraints.md` | Module boundaries, Docker-first, open-source rules                                                                                      |
| `/rules/package-standards.md`         | Multi-registry naming (npm/PyPI/Packagist), semver, CHANGELOG, error codes, type safety                                                 |
| `/rules/release-governance.md`        | Governance files, CI/CD spec, breaking change policy, test coverage targets                                                             |
| `/rules/sdk-testing-strategy.md`      | Cross-SDK testing tiers, transport mocking, contract compliance, CI pipeline per language                                               |
| `/rules/tdd-discipline.md`            | Red/green TDD protocol, test-before-code mandate, verification workflow                                                                 |
| `/rules/test-organization.md`         | Test directory layout, placement rules, naming conventions                                                                              |
