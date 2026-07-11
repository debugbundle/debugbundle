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

- **Owns:** All Zod schemas, TypeScript type exports, enums, constants, **tier capabilities config**, **event class enum**, **capture policy types**, **capture rule types and suggestion logic**, **improvement settings types**, **AnalyticsEventEnvelope** and **AnalyticsBundleV1** schemas, and the canonical preset-aware plus status/path-override-aware request-failure classifier used by ingestion, workers, and SDKs
- **Exports:** `BundleV1Schema`, `BundleV1`, `EventEnvelopeSchema`, `EventEnvelope`, `AnalyticsEventEnvelopeSchema`, `AnalyticsBundleV1Schema`, `createEventEnvelope`, `TIER_CAPABILITIES`, `getTierCapabilities`, `TierName`, `TierCapabilities`, `EventClass`, `CapturePreset`, `CapturePolicy`, capture-rule schemas and evaluators, event payload schemas, `DeviceInfoSchema`, `ContextDeviceSchema`, DB row types, API request/response types, webhook payload types, profile schema, severity enum, signal type enum, all context-block sub-schemas
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

### `packages/analytics-bundle-engine`

- **Owns:** Deterministic AnalyticsBundle artifact shaping from already-selected aggregate metrics, opportunity evidence, journey patterns, explicitly ranked representative journeys, linked incidents/deploys, and recommendations
- **Exports:** `buildAnalyticsBundle(input): AnalyticsBundleV1`, `stableSerializeAnalyticsBundle(value)`
- **Depends on:** `shared-types`
- **Invariant:** Same normalized analytics inputs → byte-identical output. Explicit representative-journey ranks are ordered before lexical ties; no random IDs, wall-clock generation timestamps, or raw analytics event storage.
- **Runtime wiring:** Planned worker generation will call this package after storage/domain services select bounded aggregate/sample inputs, then persist the gzipped artifact to S3-compatible storage.

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

- **Owns:** Node.js SDK core capture client, framework/logger adapters, in-memory buffering, failure isolation, vanilla runtime hooks, always-on probe ring buffers, request-scoped trigger-token probe activation, duplicate suppression, ingestion-backoff handling, remote config polling for capture policy plus project capture rules, file transport for local-only mode, and browser relay handler (receives browser events from same-origin or explicitly allowed split-host frontends, answers CORS preflight, validates/sanitizes, and writes to local events or spool for durable delivery)
- **Exports:** `debugbundle`, `createDebugBundleSdk()`, universal capture methods, `captureExceptions()`, `captureRejections()`, `captureConsole()`, `express()`, `fastify()`, `nextjs()`
- **Subpath exports (relay):** `@debugbundle/sdk-node/relay` (core relay handler factory), `@debugbundle/sdk-node/relay/express` (Express middleware), `@debugbundle/sdk-node/relay/fastify` (Fastify plugin), `@debugbundle/sdk-node/relay/nextjs` (Next.js API route handler)
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host code; failed or throttled flushes keep buffered events in memory, honor retry backoff, suppress duplicate/looping failures locally, keep remote probe directives process-local, and resolve trigger-token activations from request-local state only. The optional synchronous `beforeSend` hook runs after SDK event construction/redaction and before buffering; `null` drops locally, invalid returns keep the original event, and hook failures emit diagnostics without throwing. Capture policy and project capture rules remain server-owned; the Node runtime currently enforces local `drop` plus sampled-out `sample` outcomes before buffering while leaving `demote` to ingestion/worker backstop enforcement until a backend-local context downgrade path exists. Relay handler must validate Origin, answer allowed `OPTIONS` preflights, enforce body size limits, strip/override protected fields, and never expose server-side credentials to browser clients (INV-17, INV-18, INV-19).
- **Transport selection:** File transport for local-only server SDKs on the current machine (writes to `.debugbundle/local/events/` and requires persistent storage plus CLI access for processing), file transport for connected `local`/`development`, and HTTP transport for connected `staging`/`production`. Browser relay writes to `.debugbundle/local/events/` (local-only) or `.debugbundle/local/browser-relay-spool/` (connected durable).
- **Internal structure:** `core.ts` owns transport/buffering/runtime state plus request-context lookup; `before-send.ts` owns local hook validation/failure isolation; `file-transport.ts` owns atomic file-write transport for local events; `framework-integrations.ts` owns Express/Fastify/Next.js wrappers; `logger-integrations.ts` owns logger detection and method patching; `suppression.ts` owns duplicate suppression and loop-protection state; `remote-probes.ts` owns config parsing and directive matching; `trigger-token.ts` owns request token extraction/validation; `relay.ts` owns core relay handler logic (validation, sanitization, field override, write/forward, durable spool management); `relay-express.ts`, `relay-fastify.ts`, `relay-nextjs.ts` own framework-specific relay adapters; `utils.ts` and `types.ts` hold shared helpers/contracts

### `packages/sdk-browser` _(lives in `debugbundle-js` repo)_

- **Owns:** Browser SDK core capture client, browser-native auto-capture hooks, opaque `window` error and resource-load metadata capture, bounded `unhandledrejection` reason summaries, breadcrumb buffering and standalone breadcrumb shipping, preset-aware first-party network response promotion to `request_event`, always-on probe ring buffers, zero-poll remote probe directive intake, page-load trigger-token probe activation, session-governance controls, network filtering, cross-context trace-header injection for browser requests, privacy-default frontend event capture, shared sanitized frontend primitives for debug breadcrumbs and opt-in AnalyticsBundle signals, opt-in AnalyticsBundle session/page/route/semantic-action/structural-action/funnel/conversion/friction-marker capture, unload-safe flushing, device-context collection, duplicate suppression, and transport backoff
- **Exports:** `createDebugBundleBrowserSdk()`, universal browser capture methods, `init()`, `captureException()`, `captureError()`, `captureLog()`, `captureRequest()`, `captureMessage()`, `setContext()`, `probe()`, `flush()`, `dispose()`
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host pages; breadcrumbs default to local ring-buffer-only capture until a `frontend_exception`, except first-party network failures in the current preset's immediate request-failure set or explicit status/path client-error incident rules, which also emit standalone `request_event` incident signals; unpromoted `4xx` responses such as generic 404s remain non-incident telemetry/context; breadcrumbs can be batched as standalone `frontend_breadcrumb` events when configured; always-on probe buffers stay local until exception flush; duplicate exception/log/request storms are suppressed locally with periodic `error_suppressed` checkpoints and in-memory recovery after silence; failed or throttled flushes keep buffered events in memory and retry after backoff; unload paths prefer `navigator.sendBeacon()` with `fetch(keepalive)` fallback. Direct browser SDKs may explicitly request a bounded project analytics block through the existing project-token SDK config request, preserving legacy config responses for other clients; it can only restrict local analytics opt-in and never affects debug capture; relay mode never includes browser-side project tokens. Browser SDK trace injection is scoped to same-origin or explicit `tracePropagationTargets`, must preserve native `fetch` input and `HeadersInit` semantics, never drops caller auth headers while adding `X-DebugBundle-Trace-Id`, never possesses cloud credentials, exposes an optional synchronous `beforeSend` hook for app-owned local filtering/final redaction, and still relies on server-owned capture rules plus local rule enforcement for known operational noise — events ship through a backend relay handler or directly to cloud (static-only mode).
- **Analytics separation invariant:** Debug breadcrumbs and analytics events may be derived from the same sanitized route/session/device/action primitives, but debug capture must keep working when analytics is disabled, unavailable, consent-blocked, sampled out, quota-blocked, or internally failing. Direct-browser `standard` mode may persist only an opaque first-party visitor value under a project-token-hash-derived storage key and emit only a separate SHA-256-derived visitor hash; strict mode, consent withdrawal, and remote strict settings must leave no persistent visitor value. Friction markers may use only ephemeral target-object identity and timing, emit fixed marker keys, and never serialize target-derived fields. Credential-free relay mode remains session-only until it can obtain an authenticated project scope. Emitted debug and analytics envelopes remain separate and follow separate retention, quota, consent, and processing paths.
- **Invariant:** Bundle consumers must treat the inline `frontend_exception.payload.breadcrumbs[]` payload as the canonical browser error-context path, merge it deterministically with any standalone `frontend_breadcrumb` events when both exist, preserve optional enriched `frontend_exception.payload.browser_event` metadata for opaque browser-native failures, and avoid inferring application frames from known SDK listener assets for opaque browser-native `window_error` signals.
- **Transport selection:** Relay POST to the user's backend is the default and recommended transport. Same-origin relay paths such as `/debugbundle/browser` are inferred automatically; split frontend/backend relay URLs use explicit `init({ transportMode: "relay", endpoint: "https://api.example.com/debugbundle/browser" })`. Static-only direct POST to cloud remains available when no backend exists and requires a dedicated public write-only project token.
- **Internal structure:** `index.ts` owns transport/buffering state plus public capture APIs and pending trigger-token state; `before-send.ts` owns local hook validation/failure isolation; `types.ts` owns browser SDK contracts/constants; `runtime.ts` owns browser environment accessors, normalization, filter helpers, trace-id generation, and probe-directive parsing; `hooks.ts` owns console/network hook installation plus one-time device snapshot capture; `suppression.ts` owns duplicate suppression and loop-protection state; `trigger-token.ts` owns `_debug_probe` token validation

### JavaScript SDK Monorepo

The TypeScript/JavaScript SDKs live in a separate JS SDK repo: `github.com/debugbundle/debugbundle-js`. This follows the industry convention used by other established services — the product-facing JS SDK packages live together in one dedicated repo while shared cross-product libraries can remain core-owned when source coupling still exists.

**`debugbundle-js` repo contents:**

- `packages/sdk-node` (`@debugbundle/sdk-node`) — Node.js backend SDK
- `packages/sdk-browser` (`@debugbundle/sdk-browser`) — Browser SDK

The `debugbundle-js` repo now consumes published `@debugbundle/shared-types` and `@debugbundle/redaction` packages from npm. The core monorepo (`debugbundle/debugbundle`) continues to own the maintained source for those two packages and now owns only their shared-package release workflow, while the dedicated `debugbundle/debugbundle-js` repo owns release automation for `@debugbundle/sdk-node` and `@debugbundle/sdk-browser`.

**Migration note:** The public `debugbundle/debugbundle-js` repo is live, its dedicated release workflow now stages and publishes the SDK packages from that repository, and core dogfooding in `apps/api` and `apps/web` continues to resolve published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. Shared-package publication remains a core responsibility because `shared-types` and `redaction` still have direct source coupling in the main product repo. The production release train publishes dependency roots before dependent packages: shared packages first, then the JS SDK family, then dependent wrappers such as WordPress. After registry publish, bump the pinned versions in the root app, hosted SPA, and public-site manifests before hosted validation or deploy.

**Current ownership note:** `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` are the packages intended to move cleanly with `debugbundle-js`. By contrast, `@debugbundle/shared-types` and `@debugbundle/redaction` remain core-owned source in the current workspace even though they are published as standalone npm packages and consumed by the JS SDK. Core still has meaningful direct source-path coupling to both packages, especially `shared-types`, across product code, tests, and build-time artifact generation. Treat them as externally distributed core libraries for the current Phase 22 repo split; moving their maintained source into `debugbundle-js` would be a later deliberate extraction slice rather than an already-complete ownership transfer.

**Working rule in this workspace:** Edit `packages/shared-types` and `packages/redaction` here in the core repo. Edit JS SDK source in the standalone `debugbundle-js` repo itself or in a local clone bootstrapped into `sdks/debugbundle-js`; do not recreate `shared-types` or `redaction` as source-of-truth inside that SDK clone.

### Non-TypeScript SDKs

All non-TS SDKs implement the same universal SDK interface (`init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`, `probe`) with language-idiomatic naming. See `contracts/sdk-interface.md` for the full contract and `spec/sdk-language-targets.md` for the rollout plan. V1 relay parity is implemented for Python, PHP, WordPress, Java Spring Boot, Java servlet/JAX-RS app-server adapters, Go net/http, and Ruby Rack/Rails. Each full relay-compatible surface validates and sanitizes browser batches, answers allowed `OPTIONS` preflight requests for split frontend/backend deployments, preserves correlation, isolates credentials, writes local-only event files, writes connected durable spool files, and forwards connected events with server-side credentials using the shared relay contract. Mobile SDKs (Kotlin Android, Swift iOS, and React Native) are client SDKs, not relay handlers; they use the mobile correlation contract, target-scoped trace injection, offline queueing through native foundations, remote probe directives, trigger-token activation, and direct connected ingestion.

All non-TypeScript SDKs live in separate repositories under `github.com/debugbundle/`, each with its own language-native toolchain, CI pipeline, and independent release cycle.

**Local workspace convention:** Separate SDK repos live as independent clones or active scaffolds under `sdks/` for single-workspace development. The core repo now ships `sdks.json` plus `scripts/bootstrap-sdks.sh`, root workspace/test/typecheck wiring no longer hardcodes the staged JS SDK tree, and the legacy tracked SDK snapshot directories have been removed from the core repo index. The public site repo lives as a real local clone at the root `site/` path for day-to-day work, while lower-touch companion repos such as `debugbundle/action` live under ignored `.local-repos/` clones. Temporary operator notes and local execution checklists live under ignored `.local-notes/`. On an older long-lived checkout, remove any pre-cutover `sdks/debugbundle-js`, `sdks/debugbundle-python`, or `sdks/debugbundle-php` directories from disk before the first bootstrap run so those paths can be recloned cleanly.
The current local SDK repo set includes `debugbundle-js`, `debugbundle-python`, `debugbundle-php`, `debugbundle-wordpress`, `debugbundle-java`, `debugbundle-go`, `debugbundle-ruby`, `debugbundle-android`, `debugbundle-swift`, the published `debugbundle-react-native` SDK repo, and the published `debugbundle-dotnet` SDK repo.

**Published V1 backend SDK scope:**

| SDK       | Repository                                     | Package Registry                       | Frameworks                                                |
| --------- | ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Python    | `github.com/debugbundle/debugbundle-python`    | PyPI (`debugbundle-python`)            | Django, Flask, FastAPI                                    |
| PHP       | `github.com/debugbundle/debugbundle-php`       | Packagist (`debugbundle/sdk-php`)      | Laravel, Symfony                                          |
| WordPress | `github.com/debugbundle/debugbundle-wordpress` | WordPress.org plugin + GitHub releases | WordPress plugin wrapper over PHP SDK + browser SDK relay |
| Java      | `github.com/debugbundle/debugbundle-java`      | Maven Central                          | Spring Boot, Servlet/JAX-RS app servers, javaagent bootstrap |
| Ruby      | `github.com/debugbundle/debugbundle-ruby`      | RubyGems (`debugbundle`)               | Rails, Rack, Sidekiq                                     |
| Go        | `github.com/debugbundle/debugbundle-go`        | pkg.go.dev                             | net/http, Gin, Echo                                      |

Detailed implementation plans live in `spec/sdks/java-sdk.md`, `spec/sdks/go-sdk.md`, `spec/sdks/ruby-sdk.md`, `spec/sdks/csharp-sdk.md`, `spec/sdks/kotlin-sdk.md`, `spec/sdks/swift-sdk.md`, and `spec/sdks/react-native-sdk.md`; Java, Ruby, and Go now follow their plans in local standalone repos, the Kotlin Android repo now has its core/runtime, offline queue, crash/ANR replay, native HTTP instrumentation, UI/logging adapters, and probe-directive slice implemented locally against its plan, the Swift iOS repo now has bundle/runtime config resolution, configurable queue file protection, connectivity-aware deferred delivery, automatic batch/interval/background flushing, bounded UIKit background-flush execution windows, capped per-send batch sizing, bounded retry windows, bounded remote-config refresh, internal diagnostics for terminal `4xx` queue drops, explicit async operation and task capture helpers, its core client, durable queue, HTTP transport, UIKit app/scene/view-controller/navigation helpers, SwiftUI scene/navigation/action helpers, explicit URLSession request capture (wrapper plus URLProtocol/configuration paths), optional Alamofire adapter, SwiftLog adapter, capture-policy enforcement, remote probes, Objective-C exception bridging, next-launch crash replay helpers, queue/mock-ingestion/fixture test support, and CocoaPods `DebugBundle@0.1.1` published, React Native now has a published npm SDK with TypeScript public API, safe degraded native-module behavior, JS redaction, fetch/XHR trace propagation, React/React Navigation helpers, Expo plugin, Android/iOS wrapper glue that delegates to native SDK foundations, packed clean-install smoke, Android Docker clean RN app smoke, iOS CocoaPods/Xcode clean RN app smoke, and tag-triggered npm release, and C#/.NET now has the planned NuGet package family published at `0.1.1` with core capture/redaction/suppression/probes/transports/vanilla hooks, ASP.NET Core middleware/browser relay/Blazor Server, Microsoft.Extensions.Logging, Serilog, NLog, log4net, gRPC, Worker, Hangfire, Azure Functions isolated worker, CI, pack, staged-package clean-install smoke, and published-package clean-install smoke across .NET 8 and .NET 10 consumer lanes.

**Future backend expansion:**

| SDK             | Repository                                  | Package Registry          | Frameworks      |
| --------------- | ------------------------------------------- | ------------------------- | --------------- |
| C#              | `github.com/debugbundle/debugbundle-dotnet` | NuGet (`DebugBundle.Sdk` + `DebugBundle.*`) | ASP.NET Core / .NET |
| Kotlin (server) | `github.com/debugbundle/debugbundle-kotlin` | Maven Central             | Ktor            |
| Rust            | `github.com/debugbundle/debugbundle-rust`   | crates.io (`debugbundle`) | Axum, Actix Web |

**Future mobile expansion, follows Mobile Correlation Contract:**

| SDK              | Repository                                        | Package Registry        | Frameworks        |
| ---------------- | ------------------------------------------------- | ----------------------- | ----------------- |
| Kotlin (Android) | `github.com/debugbundle/debugbundle-android`      | Maven Central           | Android lifecycle |
| Swift (iOS)      | `github.com/debugbundle/debugbundle-swift`        | Swift Package Manager / CocoaPods | UIKit / SwiftUI   |
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
- **Key constraint:** Ingestion (`POST /v1/events`) must be lightweight: reject declared oversized bodies before auth/parsing, authenticate project token, enforce optional token `allowed_origins` when configured, validate, rate-limit, enforce capture policy, apply project capture rules, persist accepted raw events, enqueue only, increment durable monthly organization/project counters for accepted billable events, and include the resolved capture preset plus resolved `immediate_client_error_statuses` and `immediate_client_error_path_rules` on normalize jobs so request-event classification stays stable in the worker.
- **Retrieval note:** `GET /v1/incidents` supports additive time-window filters including `first_seen_after` and `attention_after`; the latter matches incidents first opened or regressed at or after the supplied timestamp and is shared with CLI/MCP/local retrieval.
- **Dogfooding note:** Dogfooding is now re-enabled against the published `@debugbundle/sdk-node` prerelease. `server.ts` optionally initializes the npm-published SDK during bootstrap when `DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, the manual dev-only backend trigger route `GET /__dogfood/backend-error` remains gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`, and the hosted owner-authenticated verification route `POST /v1/internal/dogfooding/backend-error` is separately gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER=true`.
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now publishes the API on host port `3003`, so the backend dogfood trigger is reachable directly at `http://localhost:3003/__dogfood/backend-error`
- **Internal structure:**
  - `server.ts` — route composition (delegates to route modules)
  - `dogfooding.ts` — env-gated API SDK bootstrap and manual backend trigger registration
  - `audit-logging.ts` — fail-open audit log recording with actor-type resolution (browser session vs member token) and request IP hashing
  - `routes/account.ts` — owner-scoped browser-session account export, cached-avatar retrieval/import, and destructive account deletion with exact confirmation phrase, email OTP verification, collaborator-membership teardown, external sole-owner/project-owner guards, and audit logging
  - `routes/admin-analytics.ts` — internal browser-session-only aggregate product analytics summary route for the hosted `/analytics` page, gated by verified email auth plus `ADMIN_ANALYTICS_ACCESS_EMAILS` and returning `404` on all denial paths
  - `routes/health.ts` — health/ready/live probes
  - `routes/auth.ts` — signup/login/logout/session plus invite-acceptance, GitHub start/callback browser-auth flows, GitHub device bootstrap, GitHub access-token exchange, session auth-method disclosure, and best-effort GitHub avatar caching after browser OAuth completion
  - `routes/ingestion.ts` — event ingestion; splits accepted `analytics_event` inputs into a separate analytics lane after project-token auth, validates analytics enablement/custom dimensions, persists short-lived raw analytics objects, and avoids incident grouping for analytics events
  - `routes/incidents.ts` — incident retrieval, bundle, reproduction, logs
  - `routes/analytics-settings.ts` — project AnalyticsBundle settings read/update surface over shared analytics settings schemas, member preview, owner/admin mutation, Solo+ analytics availability gating, and Team-only controlled custom dimensions
  - `routes/analytics.ts` — AnalyticsBundle aggregate metrics read routes for summary, routes, journey patterns, devices, referrers, actions, funnel summaries, and funnel analysis over rollups; retained redacted journey sample list/detail reads; project or caller-organization analytics opportunity/bundle inventory reads with stable cursor pagination; on-demand AnalyticsBundle generation request reservation/enqueueing; and AnalyticsBundle artifact/status retrieval for generation records
  - `routes/project-members.ts` — project-scoped collaborator listing for any authorized member, cached member-avatar reads, pending-invite lifecycle, invite creation with transactional invite email delivery, role updates, member removal, and collaborator self-leave with removed-member automation cleanup
  - `routes/billing.ts` — owner-scoped billing summary and allowance-capacity management for browser sessions or member tokens, plus browser-only Stripe checkout and customer-portal handoff
  - `routes/stripe-webhook.ts` — Stripe webhook ingestion with raw-body signature verification, idempotent event processing, and entitlement recomputation for checkout.session.completed, subscription.created/updated/deleted, invoice.paid, and invoice.payment_failed events, including synced Stripe billing-period boundaries used by billing summaries
  - `routes/projects.ts` — organization-scoped project list/create/update/delete with owner-only destructive enforcement and optional project color-tag metadata
  - `routes/services.ts` — project-scoped service retrieval
  - `routes/alerts.ts` — alert rule CRUD, severity-threshold lifecycle scope handling, plus reusable Slack destination ID validation for connected Slack alerts
  - `routes/slack.ts` — Slack OAuth connect flow plus reusable Slack destination list/test/delete routes shared by web, CLI, and MCP
  - `routes/probes.ts` — remote probe activation/deactivation and trigger-token issuance, scoped through per-project access resolution so shared collaborators act against the owner organization
  - `routes/availability-checks.ts` — hosted health-check CRUD, retained result/history reads, and side-effect-free target testing
  - `routes/capture-policy.ts` — per-project capture policy GET/PATCH
  - `routes/capture-rules.ts` — per-project capture-rule CRUD plus incident-derived suggestion/create-from-suggestion flows; suggestions annotate matching existing rules and create-from-suggestion is idempotent
  - `routes/tokens.ts` — token lifecycle CRUD
  - `routes/webhooks.ts` — webhook CRUD, synthetic test delivery, delivery history retrieval, and manual delivery retry
  - `routes/weekly-report-channels.ts` — per-project weekly report channel CRUD
  - `routes/github.ts` — GitHub App installation listing, project-scoped repo connection/disconnection, dispatch rule CRUD, dispatch delivery history/retry, installation callback handling, and GitHub App webhook ingestion endpoint
  - `routes/github-marketplace-webhook.ts` — GitHub Marketplace listing webhook ingestion for purchase/subscription tracking keyed by GitHub delivery IDs
  - `api-types.ts` — shared type definitions
  - `api-analytics-types.ts` — analytics-specific API dependency contracts split out of `api-types.ts` to keep type boundaries under the source-file size limit
  - `api-helpers.ts` — auth guards, response builders, browser-session/member-token convergence, owner-role principal checks
  - `schemas.ts` — Zod request/response schemas
  - `slack-app.ts` — Slack OAuth state cookie, redirect-path validation, and code exchange helpers
  - `openapi.ts` — API-owned OpenAPI 3.1 generator built from request schemas plus shared client response schemas for public artifact publication
  - `stripe-config.ts` — Stripe client factory, price-to-plan mapping, billing state derivation, entitlement eligibility checks
  - `billing-slot-management.ts` — Stripe subscription state loading, projected billing summary computation, subscription-item quantity building for immediate allowance-capacity increases, and subscription-schedule phase building for deferred allowance-capacity reductions
  - `billing-links.ts` — env-based static billing URL fallback when Stripe API is not configured
  - `default-dependencies.ts` — dependency composition including account export artifact hydration for retained raw events, failure bundles, improvement bundles, and reproductions; admin-only aggregate analytics gating through `ADMIN_ANALYTICS_ACCESS_EMAILS`; project AnalyticsBundle settings management; internal analytics usage metering for event/session and bundle-generation quotas; project-object cleanup on account deletion; dynamic Stripe checkout session; customer portal creation; projected billing summaries; and Stripe-backed allowance-capacity mutations
  - shared client packages under `packages/*-client` — thin typed HTTP adapters reused by CLI and MCP parity flows; billing allowance-capacity management uses `packages/billing-client`
  - `runtime.ts` — server bootstrap, graceful shutdown, and conditional Stripe webhook wiring (creates separate connection pool for billing sync)

### `apps/worker`

- **Owns:** Background job processing via BullMQ
- **Jobs:** `normalize-events`, `aggregate-analytics-events`, `group-incident`, `build-bundle`, `build-analytics-bundle`, `build-reproduction`, `evaluate-alerts`, `deliver-alert-email-digest`, `deliver-operational-email`, `deliver-webhook`, `generate-weekly-report`, `cleanup-retention`, `dispatch-github`
- **Imports:** `bundle-engine`, `repro-engine`, `event-normalizer`, `shared-types`, `redaction`, `email`
- **Key constraint:** All jobs must be idempotent; worker-owned severity inference must distinguish high-confidence failures from low-confidence opaque browser-native captures before alert filters run; lifecycle webhooks gate new intents against `monthly_webhook_deliveries` before queue insertion, alert evaluation achieves this by persisting one internal `alert_deliveries` row per alert/incident/dedupe key before immediate non-email delivery plus an `alert_email_digests` / `alert_email_digest_items` queue for fixed 10-second email batching, optional per-rule alert `cooldown_seconds` suppression checks recent `(alert_id, notification_key)` history without changing incident grouping, operational owner notifications are persisted in `operational_email_deliveries` before email transport attempts so webhook auto-disable, allowance, retention, and no-card trial lifecycle notices can retry independently, trial reminder/expiry scheduling uses `trial_lifecycle_events` as the cross-poll idempotency ledger after durable email queueing or expiry succeeds and re-checks billing state before downgrading expired trials, lower-tier downgrades preserve paid-feature setup while terminalizing in-flight paid-feature deliveries and depending on current-tier checks to pause Slack/GitHub/probes/hosted improvements/collaboration until re-upgrade, resolving reusable Slack destinations only after the claim row is written, weekly reporting now relies on persisted `bundle_generations` history plus `weekly_report_deliveries` claim rows before email or Slack transport is attempted, request/log hosted improvement bundles share the same retained-bundle-cap pruning path as failure bundles across one combined incident/improvement inventory while below-threshold candidates stay internal and incident-derived improvement opportunities only link to related failure bundles, GitHub dispatch achieves idempotency via `github_dispatch_deliveries` claim rows with cooldown enforcement before `repository_dispatch` API calls and non-retryable `skipped` rows for DebugBundle-side hourly suppressions, and worker-triggered lifecycle transitions may record deletion-safe account analytics counters without retaining payload data or deleted account joins
- **Availability lane:** Hosted health checks run in a bounded in-process lane separate from the serialized Redis job priority chain. The lane batch-claims due checks, executes them concurrently under `AVAILABILITY_CHECK_CONCURRENCY`, uses `AVAILABILITY_CHECK_CLAIM_BATCH_SIZE` and `AVAILABILITY_CHECK_LOOP_INTERVAL_MS` for cost-friendly tuning, records lag/backlog metrics, and emits rate-limited worker dogfood warnings when due-check lag indicates saturation.
- **Analytics lane:** `aggregate-analytics-events` validates short-lived raw analytics objects and calls the Postgres rollup store. It inserts the analytics ingestion ledger before updating hourly/daily session, route, route-transition, action/conversion/marker, and funnel rollups, with `analytics_rollup_uniques` preserving exact unique-session counters. When a rollup event is newly recorded, the worker can also append a safe bounded step to one deterministic retained journey sample per project/session/UTC day, gated by project `journey_sample_rate` and `sample_retention_days`. Rollups are bounded aggregate query rows, not long-term per-visit raw event storage. Relevant rollup writes now trigger initial deterministic opportunity evaluators inside the same background transaction: funnel rollups can upsert `funnel_dropoff` opportunities, route-transition rollups can upsert bidirectional `journey_friction` opportunities, and only the three fixed browser friction-marker action rollups can upsert marker-based `journey_friction` opportunities. All use stable fingerprints and aggregate-only evidence; marker opportunities retain only fixed marker keys, safe routes, and aggregate counts. Summary, route, journey-pattern, device, referrer, action, funnel, retained journey sample, stored opportunity, AnalyticsBundle generation request, generation inventory, and generated-bundle retrieval now read or reserve these aggregates/samples/opportunities/generation records through API/CLI/MCP; journey-pattern reads attach bounded retained sample IDs by transition tag and requested time window when matching unexpired samples exist. The shared cleanup-retention lane removes expired raw analytics objects, retained journey sample objects/metadata, generated AnalyticsBundle artifacts/metadata, and aggregate rollups older than each project's configured aggregate retention window. The storage layer now owns retained journey sample metadata writes/list/detail reads plus internal AnalyticsBundle generation metadata reservation, list pagination, exact queued-generation claiming, and completed/failed state propagation to linked analytics opportunities, the Redis queue exposes an internal `build-analytics-bundle` job contract, `packages/analytics-bundle-engine` owns deterministic `AnalyticsBundleV1` artifact shaping for selected aggregate/sample inputs, and the worker runtime polls `build-analytics-bundle` so `analytics-bundle-processor.ts` can rank existing retained sample references from aggregate reach/counts and stable ties before building and persisting gzipped artifacts with up to five redacted representative journey timelines. Public on-demand generation requests reserve a deterministic generation and enqueue the build job; broader scheduled opportunity evaluation remains planned. The lane stays separate from incident grouping so analytics events never create or update incidents.
- **Browser analytics capture:** the external `debugbundle-js` browser SDK adds explicit bounded journey markers and one unload-safe session summary on non-persisted `pagehide`, while preserving separate analytics/debug paths and treating back-forward-cache transitions as non-exits.
- **Scheduled analytics opportunity evaluation:** the idle worker scheduler takes a six-hour Redis lease by default and enqueues `evaluate-analytics-opportunities`. Its processor scans enabled projects with recent daily session rollups in stable UUID cursor batches of 25, reuses the deterministic aggregate evaluator with one scheduled timestamp, and enqueues one continuation only for a full batch. It never reads raw analytics objects, and queued work remains below incident, aggregation, and bundle-build lanes.
- **Incident-impact replay constraint:** retained sample IDs and hydrated journeys require an exact internal project-scoped affected-session subject match, matching service/environment, transition tag, bounded window, and a completed unexpired artifact. The correlation hash is never public; legacy samples without it are not selected.
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now starts the worker alongside API and web so local dogfooding can exercise the full ingestion-to-bundle path without a separate manual worker launch

### `apps/cli`

- **Owns:** CLI command parsing, terminal I/O, interactive flows, local processing pipeline
- **Commands:** See `/contracts/public-interfaces.md` and `/spec/local-first-onboarding.md` §11
- **Imports:** `shared-types`, `auth`, `event-normalizer`, `bundle-engine`, `repro-engine` (for local processing), `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads/writes `.debugbundle/` for local operations.
- **Key constraint:** Exit codes must follow contract (0/1/2/3/4, with existing management-command conflict/forbidden mappings still using 5 where already established)
- **Local-first commands:** `setup` (guided onboarding with mixed-runtime service discovery, interactive target selection in TTY sessions, JSON `selected_targets` / `relay_guidance`, and optional relay-route scaffold for Fastify, Express, and Next.js App Router projects when both DebugBundle SDKs are present), `doctor`, `validate`, `profile validate`, `verify local`, `verify cloud` including active synthetic `--trigger-5xx` / `--trigger-4xx` plus app-event verification via `--expect-app-event`, `process` (local event → bundle pipeline), `analyze`, `ingest`/`watch` (log-based capture), `connect` (upgrade to cloud), `resolve`/`reopen` (incident lifecycle), `clean` (retention)
- **Internal structure:** `main.ts` owns top-level argv routing; `argv-helpers.ts` owns shared CLI parsing and option coercion; `login-command.ts` now owns all bootstrap login paths including direct member-token persistence, GitHub device flow polling, and `gh auth token` exchange; `cli-fs-helpers.ts` owns shared filesystem utility helpers (`isRecord`, `isMissingPathError`, `resolveWorkspacePath`) used across CLI command modules; `management-command-handlers.ts` owns token/project/alert/slack/webhook/weekly-report/capture-policy/billing/probe/project-members/github/improvements/analytics settings subcommand routing; `management-analytics-command-handlers.ts` owns `debugbundle analytics settings get|set`; `auth-context.ts` owns stored-auth HTTP client creation for shared API clients including `createAuthenticatedBillingApi`, `createAuthenticatedSlackApi`, and `createAuthenticatedGitHubManagementApi`; `billing-commands.ts` owns billing summary retrieval and capacity-management commands (get, capacity increase, capacity schedule-reduction, capacity cancel-reduction) via `packages/billing-client`; `slack-commands.ts` owns connected Slack destination list/connect-url/test/delete flows via `packages/slack-client`; `improvement-commands.ts` owns hosted improvement list/get/bundle/resolve/reopen flows while `improvement-settings-commands.ts` owns project-scoped hosted-improvement automation settings; `analytics-settings-commands.ts` owns the analytics settings API client and CLI rendering; `setup-command.ts` owns the public `setup` scaffold flow, with `setup-service-discovery.ts` handling mixed-runtime service inference, `setup-target-selection.ts` handling TTY target selection defaults, and `setup-relay-guidance.ts` handling runtime-specific relay scaffolding/instructions; `connect-command.ts` owns the local-only to connected-mode upgrade flow (profile validation, cloud project selection/creation, project-token minting, and connection-config rewrite); `verify-command.ts` owns local proof generation plus passive cloud verification, active synthetic cloud verification through temporary project-token creation and real `/v1/events` ingestion, and app-event verification that waits for hosted incident visibility using service/environment plus optional trace/request correlation hints; `project-commands.ts` owns project lifecycle mutations (list, create, update, delete) exposed through the CLI via `packages/project-management-client`; `github-commands.ts` owns GitHub installation-status, repository-listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry commands via `packages/github-client`; `probe-commands.ts` owns remote probe activation/deactivation/listing exposed through the CLI with inline API client; `member-commands.ts` owns project collaborator management (list, invites, invite, cancel-invite, update-role, remove, leave) with inline API client; `ingest-command.ts` owns one-shot local event-batch writes plus handoff into the existing process pipeline while delegating format parsing to `packages/log-parser`; `watch-command.ts` owns incremental log tailing from EOF, rewrite/truncation detection, repeated registry-backed parsing, and the mode-specific fanout between local event-batch writes plus `process` handoff and connected-mode direct shipment to `POST /v1/events`; `local-scaffold.ts` owns generated scaffold templates plus cleanup of older DebugBundle-generated scaffold paths required by onboarding spec; `local-retrieval-store.ts` owns local incident/bundle/reproduction reads plus local resolve/reopen state mutations against `.debugbundle/local/state.json` and `.debugbundle/bundles/local/`; `retrieval-source.ts` owns shared source-tagging plus merged incident pagination helpers used by CLI and MCP retrieval; `cloud-artifact-cache.ts` owns persistence of explicit cloud bundle/reproduction fetches into `.debugbundle/bundles/cloud/`, cache-status sync for cloud resolve, and opportunistic 30-day expiry pruning; `clean-command.ts` owns the operator-facing local retention surface for processed local events, local incident-cap trimming with resolved-first eviction, explicit cloud-cache pruning, and scaffold-preserving `--all` runtime reset; `doctor-command.ts`, `validate-command.ts`, `profile-command.ts`, and `analyze-command.ts` own local-first validation and analysis workflows; `process-command.ts` owns the local file-transport pipeline, preset-aware full reprocessing, promoted request-failure incident processing, and state/bundle writing; `retrieval-commands.ts`, `token-commands.ts`, `project-commands.ts`, `services-command.ts`, `alert-commands.ts`, `slack-commands.ts`, `webhook-commands.ts`, `weekly-report-commands.ts`, `capture-policy-commands.ts`, `probe-commands.ts`, `member-commands.ts`, `github-commands.ts`, `improvement-commands.ts`, `improvement-settings-commands.ts`, and `analytics-settings-commands.ts` are thin command adapters over shared clients or local orchestration modules, including explicit `source` routing, default merged local/cloud retrieval behavior in connected mode, collapse of multi-id cloud incident resolve/reopen into hosted bulk routes, and cloud artifact cache refresh on explicit fetch
- **Analytics CLI ownership:** `management-analytics-command-handlers.ts` now routes `debugbundle analytics summary|routes|journeys|devices|referrers|actions|funnels|funnel|opportunities|opportunity get|bundle get` and `debugbundle analytics settings get|set`; `analytics-metrics-commands.ts` owns the aggregate metrics, opportunity reads, and generated-bundle read API client/rendering, while `analytics-settings-commands.ts` owns settings.
- **Analytics web settings ownership:** `apps/web/src/components/system/project-analytics-settings-card.tsx` owns the project Settings card over the existing analytics-settings API, including loading/error retry, Free upgrade guidance, owner/admin capture/privacy/sampling/retention controls, member preview, and Team-only controlled custom-dimension allowlists. `apps/web/src/lib/api.ts` remains the thin cookie/CSRF browser adapter; authorization and tier enforcement stay API-owned.

### `apps/mcp`

- **Owns:** MCP protocol adapter (stdio transport)
- **Tools:** See `/contracts/public-interfaces.md`
- **Imports:** `shared-types`, `auth`, `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads `.debugbundle/` for local-store queries and local lifecycle updates when unconnected, when `source: "local"` is explicitly requested, or when connected-mode detail/lifecycle retrieval probes local state before falling back to cloud.
- **Key constraint:** Thin adapter only — no unique business logic. Must support local-store reads when cloud is unavailable.
- **Internal structure:** `main.ts` owns the external stdio entrypoint for the publishable `@debugbundle/mcp` package; `server.ts` owns MCP JSON-RPC request handling for initialize, tool listing, and tool calls; `default-tools.ts` composes the default runtime tool registry over shared HTTP clients, environment-provided `DEBUGBUNDLE_MEMBER_TOKEN` / `DEBUGBUNDLE_API_URL`, CLI auth state, and local CLI modules; `server.json` owns MCP Registry metadata for the npm package; `ecosystem-release-manifest.json` plus `scripts/release-mcp-ecosystem.mjs` own the host-side post-npm ecosystem release workflow that rebuilds the MCPB bundle from the published npm artifact, smoke-tests the staged stdio server, publishes official-registry/Smithery MCP/Smithery skill/ClawHub skill metadata, builds/validates/publishes the OpenClaw plugin package, and emits Glama/LobeHub discovery follow-up checks; `retrieval-tools.ts`, `token-tools.ts`, `project-tools.ts`, `services-tools.ts`, `setup-tools.ts`, `analyze-tools.ts`, `alert-tools.ts`, `slack-tools.ts`, `webhook-tools.ts`, `weekly-report-tools.ts`, `billing-tools.ts`, `capture-policy-tools.ts`, `probe-tools.ts`, `health-check-tools.ts`, `member-tools.ts`, `github-tools.ts`, `improvement-tools.ts`, `improvement-settings-tools.ts`, and `analytics-settings-tools.ts` expose thin MCP tool factories over shared clients or existing CLI modules; `analytics-settings-tool-catalog.ts` owns the catalog entries for `get_analytics_settings` and `update_analytics_settings`. GitHub MCP coverage now includes installation status, repository listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry. `tool-catalog.ts` owns the source-of-truth MCP tool catalog with Zod input schemas for all shipped tools, used by the public-site artifact pipeline to generate `/schemas/mcp-tools.json` and by `apps/openclaw-plugin` to generate OpenClaw `debugbundle_*` tool metadata; retrieval tools now reuse the CLI local-store reader plus `retrieval-source.ts` helpers for merged connected-mode incident listing, local-first detail/artifact/lifecycle lookup, explicit source tagging, collapse of multi-id cloud resolve/reopen into hosted bulk mutation routes, and `cloud-artifact-cache.ts` persistence so cloud bundle/reproduction fetches refresh `.debugbundle/bundles/cloud/`, cloud resolve updates cached status snapshots, and stale cloud-cache files are pruned during explicit cache activity
- **Analytics MCP ownership:** `analytics-metrics-tools.ts` exposes `get_usage_summary`, `get_route_metrics`, `get_journey_patterns`, `get_device_breakdown`, `get_referrer_metrics`, `get_action_metrics`, `list_funnel_metrics`, `get_funnel_analysis`, `list_analytics_opportunities`, and `get_analytics_opportunity` over the shared CLI HTTP client, and `analytics-metrics-tool-catalog.ts` owns their published tool metadata. Settings remain in `analytics-settings-tools.ts` / `analytics-settings-tool-catalog.ts`.

### `apps/openclaw-plugin`

- **Owns:** Publishable OpenClaw tool plugin package for ClawHub package distribution
- **Tools:** One `debugbundle_<mcp_tool_name>` projection per MCP catalog entry
- **Imports:** `apps/mcp/src/tool-catalog.ts`, `apps/mcp/src/default-tools.ts`
- **Communication:** Delegates to the MCP default tool registry, so cloud/local behavior, auth precedence, and result shapes remain MCP-aligned
- **Key constraint:** No product business logic. OpenClaw code may translate host metadata and safety declarations only.
- **Internal structure:** `src/index.ts` maps the MCP catalog to OpenClaw `defineToolPlugin` metadata, converts Zod schemas to JSON Schema and TypeBox unsafe schemas, delegates execution to `createDefaultMcpTools`, and marks state-changing tools optional; `openclaw.plugin.json` is generated from the built entry; `package.json` owns OpenClaw compatibility metadata and ClawHub install hints.

### `apps/web`

- **Owns:** Implemented first seven web management slices plus hosted improvement management, project product-analytics overview/routes/funnels/audiences, customer workspace Analytics inventory, and internal operator analytics: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/analytics`, `/analytics/workspace`, `/analytics/workspace/bundles`, `/settings`, `/member-tokens`, `/projects`, `/improvements`, `/projects/:projectId/improvements`, `/projects/:projectId/improvements/:improvementId`, `/projects/:projectId/analytics`, `/projects/:projectId/analytics/routes`, `/projects/:projectId/analytics/funnels`, `/projects/:projectId/analytics/audiences`, `/projects/:projectId/settings`, `/projects/:projectId/members`, `/projects/:projectId/tokens`, `/projects/:projectId/probes`, `/projects/:projectId/webhooks`, `/projects/:projectId/alerts`, `/projects/:projectId/github`, `/invite`, and `/billing`
- **Framework:** React + Vite SPA deployed to `app.debugbundle.com`
- **Imports:** `shared-types`
- **Communication:** Calls HTTP API at `api.debugbundle.com` (cross-origin, same-site)
- **Key constraint:** Web is NOT the product core. Agent/CLI/API are primary interfaces. UI must stay reusable, shadcn-based, theme-capable, and use cookie-backed session auth. The public site remains a separate static-exported Next.js + Fumadocs deployment on `debugbundle.com` with marketing pages, `/docs`, and `/blog`. Focused frontend validation runs through `make web-check`.
- **Dogfooding note:** Dogfooding is now re-enabled against the published `@debugbundle/sdk-browser` prerelease. `src/main.tsx` optionally initializes the npm-published browser SDK during startup when `VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, and the manual dev-only console bridge `window.__DEBUGBUNDLE_DOGFOOD__.triggerFrontendException()` remains gated by `VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`.
- **Internal structure:** `src/app.tsx` owns route composition and protected-page gating for the auth, admin analytics, customer workspace analytics, projects, improvements, workspace health-status, project-settings, project-token, project-probe, project-health, project-webhook, project-alert, organization-member, billing, incidents, and project product-analytics surfaces; `src/pages/workspace-analytics-page.tsx` owns the `/analytics/workspace` opportunity and bundle inventory tabs while preserving exact `/analytics` for the internal operator dashboard; reusable workspace filters and inventory tables live under `src/components/system/workspace-analytics-*`; `src/pages/project-analytics-layout.tsx` owns project Analytics settings/tier gating, internal Overview/Routes/Funnels/Audiences navigation, and the shared bounded time/service/environment query context; `src/pages/project-analytics-page.tsx` owns aggregate summary cards plus route/device/opportunity previews; `src/pages/project-analytics-routes-page.tsx` owns the full aggregate route comparison; `src/pages/project-analytics-funnels-page.tsx` owns funnel summary comparison plus lazy inline step analysis; and `src/pages/project-analytics-audiences-page.tsx` owns device/browser/OS/language and referrer/UTM tables with independent partial-read preservation. Project journeys, opportunity detail, and bundle generation/detail remain planned; `src/pages/management-pages.tsx` owns the general management-route page implementations; `src/pages/admin-analytics-page.tsx` owns the internal aggregate-only `/analytics` dashboard and mirrors API `404` denial semantics in the SPA, so it must not be silently replaced by the customer workspace inventory; `src/pages/not-found-page.tsx` owns the shared not-found surface used for unknown or unavailable routes; `src/pages/settings-page.tsx` owns account settings including auth-method-aware password controls, account export, and destructive account deletion gated by an exact confirmation phrase plus email OTP; `src/pages/organization-overview-page.tsx` remains a dormant future-facing page component that is not currently routed in the app shell; `src/pages/health-status-page.tsx` owns the workspace Health Status page that groups existing project health checks and retained daily rollups by project; `src/pages/project-settings-page.tsx` owns the project-scoped settings page including destructive deletion, capture policy/rule management, hosted improvement automation, and product-analytics controls; `src/pages/improvements-page.tsx`, `src/pages/project-improvements-page.tsx`, and `src/pages/improvement-detail-page.tsx` own the hosted improvement queue and detail workflows; `src/pages/project-probes-page.tsx` owns paid-tier remote probe activation/listing/deactivation and one-time trigger token display; `src/pages/project-health-page.tsx` owns hosted health-check creation/edit/delete, side-effect-free testing, recent execution history, and retained daily rollups; `src/pages/project-webhooks-page.tsx` owns the project-scoped webhook management page; `src/pages/project-alerts-page.tsx` owns the project-scoped alert management page including Team-tier Slack connected-destination setup and selection; `src/pages/project-members-page.tsx` owns the collaborator roster, invite management, owner/admin removal flows, and collaborator self-leave flow; `src/pages/incidents-page.tsx` owns the incidents inventory page; `src/pages/incident-detail-page.tsx` owns the incident detail workflow including explicit resolve actions, persisted capture-rule suggestion state, scoped back-navigation, and planned analytics impact panel; `src/lib/api.ts` is the compatibility barrel for cookie-backed browser requests, `src/lib/api-analytics.ts` owns project metrics/settings and project/organization analytics inventory transport, `src/lib/api-artifacts.ts` owns incident/improvement lifecycle and artifact/detail transport, and `src/lib/api-record-normalizers.ts` owns additive-field normalization shared across those adapters; `src/lib/api-analytics-types.ts` owns the browser-local Analytics API response contracts while `src/lib/api-types.ts` re-exports them to preserve existing imports; `src/lib/capture-rules-api.ts` owns browser capture-rule CRUD and incident-suggestion calls; `src/lib/slack-api.ts` owns the browser Slack connect/install-url helper plus reusable destination listing for the alerts UI; `src/lib/dogfooding.ts` owns env-gated browser SDK bootstrap and the manual trigger bridge; `src/lib/session.tsx` owns session bootstrap and refresh state; `src/lib/theme.tsx` owns theme state and DOM synchronization; `src/components/ui/*` holds shadcn-based primitives; `src/components/system/*` holds the reusable app shell, page header, capture-rule forms, callout, theme-toggle, one-time plaintext-secret reveal, and billing presentation components.

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
  - `types.ts` — shared storage type definitions plus compatibility re-exports for split type modules
  - `queue-types.ts` — Redis queue client interfaces and typed job payload contracts
  - `alert-types.ts` — alert management, retention sampling, and alert-delivery type contracts
  - `operations-types.ts` — weekly report, operational email, token/project/account lifecycle, GitHub, collaboration, and webhook-delivery type contracts
  - `helpers.ts` — object key builders, token hashing
  - `auth-store.ts` — Postgres account creation, password credential, session, one-time token persistence, linked auth-method disclosure, and per-session login-method tracking
  - `account-store.ts` — Postgres account export aggregation for retained organization/project records and destructive account-deletion lifecycle persistence, including analytics/payment-retention handoff before org cleanup
  - `account-analytics-store.ts` — Postgres deletion-safe account analytics ledger, internal month/year/lifetime query helpers, aggregate admin analytics summary reads, retained-row backfill, and payment/provider retention snapshot persistence for deleted accounts
  - `integration-secret-crypto.ts` — shared encryption/decryption helpers for stored integration secrets such as Slack webhook URLs
  - `metadata-store.ts` — Postgres metadata store (account membership, explicit project ownership + `project_members`, invite-token-backed `project_invites`, invite cancellation/acceptance, collaborator self-leave/removal with member-owned automation cleanup, project list/create + tokens + color tags, project dashboard metrics, incidents, probes, capture-policy/rule and GitHub-rule mutation flows, deployments, alerts including severity-threshold lifecycle scope, weekly-report aggregation, incident-event retention reasons)
  - `analytics-schema-migrations.ts` / `analytics-bootstrap-statements.ts` — production migration and clean-bootstrap SQL for project analytics settings, analytics ingestion ledgers, durable analytics usage counters including retained journey samples, aggregate rollups, journey sample indexes, analytics opportunities, and AnalyticsBundle generation metadata
  - `analytics-ingestion-jobs.ts` — narrow analytics aggregation job and persistence contracts kept outside oversized shared storage type files
  - `analytics-bundle-jobs.ts` — internal AnalyticsBundle build job contract used by the Redis queue lane for on-demand and scheduled generation work
  - `analytics-metrics-store.ts` / `analytics-incident-impact-metrics.ts` — Postgres aggregate AnalyticsBundle summary, route, journey-pattern, device, referrer, action, funnel, and incident-impact queries for API/CLI/MCP retrieval; incident impact reads only hashed incident/session links and aggregate ledgers, and reports unavailable conversion deltas explicitly
  - `analytics-journey-sample-store.ts` — retained redacted journey sample metadata reservation, internal project-scoped correlation subject persistence, artifact-complete marking, list/detail reads, and project-scoped cleanup helpers; public reads only expose rows after artifact persistence completes
  - `analytics-opportunity-evaluator.ts` — Postgres deterministic analytics opportunity evaluation over aggregate rollups, creating/updating `funnel_dropoff` opportunities from bounded funnel evidence and `journey_friction` opportunities from bidirectional transitions or the fixed browser friction-marker action rollups
  - `analytics-opportunity-scheduler-store.ts` — bounded cursor scan of enabled projects with recent aggregate session activity for scheduled opportunity evaluation
  - `analytics-opportunity-store.ts` — Postgres project and organization analytics-opportunity list/detail reads with project metadata, stable timestamp/record-ID cursors, and latest AnalyticsBundle generation status for API/CLI/MCP retrieval
  - `analytics-bundle-generation-store.ts` — Postgres internal AnalyticsBundle generation metadata lifecycle plus project and organization inventory reads with project metadata, deterministic input fingerprinting, idempotent reservation, pending-generation and exact queued-generation claiming, artifact-key completion, failure recording, and linked opportunity bundle-state sync
  - `analytics-rollup-store.ts` — Postgres analytics event ledger and idempotent hourly/daily session, route, route-transition, action/conversion/marker, and funnel rollup writes using hashed session subjects for unique counters
  - `analytics-correlation-store.ts` — privacy-safe incident/session correlation hashing and bidirectional idempotent reconciliation between grouped debug incidents and aggregate analytics route sessions; updates linked-session counters without coupling incident success to analytics availability
  - `analytics-usage-store.ts` — durable internal analytics allowance counters with atomic claim/release for hosted event/session, retained journey sample, and AnalyticsBundle generation quota enforcement without expanding the public billing summary response
  - `analytics-settings-store.ts` — Postgres project analytics settings reads with analytics-off defaults for existing projects and merge-upsert persistence for opt-in capture/retention/custom-dimension settings, preserving the approved-custom-dimensions cap invariant
  - `availability-check-store.ts` / helpers / executor — hosted health-check CRUD, secure target validation, single and batched due-check claiming, execution recording, incident linkage, and 30-day result/rollup retention
  - `ingestion-analytics.ts` — shared ingestion-side aggregation helpers that translate accepted/rejected batch outcomes into account analytics metric deltas
  - `improvement-opportunity-store.ts` — Postgres hosted improvement automation persistence (project execution settings lookup, deterministic warning-hotspot/slow-request/request-failure opportunity storage with below-threshold list suppression, incident-derived opportunity storage with `related_incident_ids`, auto-resolution when all related incidents are resolved, improvement-event sampling, improvement bundle generation reservation/failure tracking, retained-bundle-cap pruning for improvement/incident owners)
  - `improvement-opportunity-recording.ts` — shared hosted-improvement recording helpers (fingerprinting plus generic opportunity upsert/event-sampling SQL reused by multiple deterministic rules)
  - `slack-destination-store.ts` — Postgres reusable Slack destination CRUD plus worker-side encrypted-secret lookup
  - `alert-lifecycle.ts` — shared severity-threshold lifecycle scope defaults, matching, and dedupe key helpers
  - `billing-store.ts` — Postgres billing summary queries derived from organization plan, active-project counts, shared allowance-capacity units, and durable organization/project monthly usage counters
  - `alert-delivery-store.ts` — Postgres alert evaluation queries, immediate alert delivery-intent persistence, and queued email-digest persistence/claiming
  - `operational-email-delivery-store.ts` — Postgres operational email delivery ledger with dedupe and retry state for system-triggered owner notifications
  - `plan-cleanup-task-store.ts` — Postgres durable cleanup-task persistence for external cleanup side effects; downgrade cleanup currently preserves hosted improvement bundle objects rather than queuing object deletion
  - `webhook-delivery-store.ts` — Postgres webhook delivery persistence
  - `weekly-report-channel-store.ts` — Postgres weekly-report channel CRUD and scheduler lookup
  - `frequency-counter.ts` — Redis rolling frequency counter (1m/5m/1h/24h buckets)
  - `ingestion-rate-limiter.ts` — Redis-backed per-token ingestion rate limiting
  - `ingestion-services.ts` — ingestion metadata, member auth, persistence services
  - `s3-client.ts` — S3-compatible object store adapter
  - `redis-queue.ts` — Redis queue client (enqueue/dequeue typed jobs)
  - `billing-sync-store.ts` — Postgres billing sync for Stripe webhooks (idempotent event dedup, entitlement updates, Stripe customer linking, entitlement revocation)
- `github-store.ts` — Postgres GitHub automation persistence for installations, project repo connections, dispatch-rule CRUD, worker-side dispatch matching/cooldown/rate-limit counters, and project-scoped dispatch-delivery claim/history/retry state
- `github-marketplace-store.ts` — Postgres GitHub Marketplace purchase snapshot persistence and webhook idempotency ledger, bridged to organizations by GitHub installation ID when available
  - `audit-log-store.ts` — Postgres audit log persistence (create, query by organization/action/time range)
  - `retention-store.ts` — Postgres tier-aware retention cleanup service (sampled debug event expiry by organization tier plus analytics raw/journey sample/AnalyticsBundle artifact/aggregate expiry)
  - `migrations.ts` — authoritative bootstrap schema and required-table manifests (not re-exported from barrel)
  - `schema-migrations.ts` — ordered forward migrations, migration ledger/checksum enforcement, and runtime readiness assertions for existing databases
- **Key constraint:** All external consumers import only from `index.ts` barrel

**Production DB rule:** Schema changes must never rely on bootstrap SQL or restart ordering alone. Use forward migrations, run them before API/worker consume the schema, and ship destructive cleanup only after compatible code has already been live.

### `packages/retrieval-client`

- **Owns:** Authenticated retrieval HTTP client shared by CLI and MCP
- **Exports:** `createRetrievalApi()`, response/error contracts
- **Key constraint:** Owns all retrieval path/query construction and response-shape validation

### `packages/token-management`

- **Owns:** Authenticated token lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createTokenManagementApi()`, response/error contracts
- **Key constraint:** Owns all token-management path construction and response-shape validation

### `packages/project-management-client`

- **Owns:** Authenticated project list/create/update HTTP client used by CLI and MCP project-management flows, including optional project color-tag metadata
- **Exports:** `createProjectManagementApi()`, response/error contracts
- **Key constraint:** Owns project-management path construction and response-shape validation so connect logic stays out of raw HTTP route strings

### `packages/alert-client`

- **Owns:** Authenticated alert lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createAlertApi()`, alert response contracts including severity-threshold lifecycle scope, structured API errors
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
| PostgreSQL | `apps/api`, `apps/worker`                             | Core relational tables for auth, projects, incidents, improvements, alerts, webhooks, GitHub automation, billing, account analytics, availability checks, and the AnalyticsBundle foundation. AnalyticsBundle tables cover project settings, ingestion ledger, session/route/action/funnel/transition rollups, hashed incident/session correlation links, saved funnel definitions, journey sample indexes, analytics opportunities, and bundle-generation metadata. |
| Amazon S3  | `apps/api` (write), `apps/worker` (read/write/delete) | Raw events (`raw/{project_id}/{date}/{event_id}.json`) for retained sampled occurrences, failure bundles (`bundles/{project_id}/{incident_id}/bundle.json.gz`), hosted improvement bundles (`improvement-bundles/{project_id}/{opportunity_id}/bundle.json.gz`), reproductions (`reproductions/{project_id}/{incident_id}/reproduction.json.gz`), short-lived raw analytics events, redacted journey samples, and generated AnalyticsBundle artifacts                                                                                                                                                                                                                                                                                                                                               |
| Redis      | `apps/api`, `apps/worker`                             | BullMQ job queues, incident frequency counters, ingestion rate-limit counters, GitHub App installation token cache (50m TTL), optional caches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## Data Flow Summary

### Ingestion Flow

```
SDK → POST /v1/events → API validates → split debug/analytics families → enforce capture policy/capture rules for debug or analytics settings/custom dimensions for analytics → S3 (raw accepted events only) → Redis queue → Worker processes

Current execution detail: API request path does not persist incident metadata synchronously; worker-owned `normalize-events` and `group-incident` jobs perform normalization, event_class classification, grouping lifecycle persistence, sampled-occurrence retention decisions, raw-object pruning for demoted summary-only events, and transition evaluation. Exceptions, `error`/`fatal`/`critical` logs, request events in the preset-specific immediate request-failure set, status-wide client-error incident overrides, and matching path-scoped client-error incident rules classify as `incident_signal`; other request events remain `context_signal` and repeated unpromoted `4xx` telemetry does not open normal incidents. Free-tier billing counts only `incident_signal` events (INV-15).
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
    openclaw-plugin/           — OpenClaw plugin package and manifest tests
    web/                       — React SPA tests (jsdom)
    worker/                    — Worker processor, runtime, and scheduling tests
  packages/
    alert-client/              — Alert client tests
    analytics-bundle-engine/   — AnalyticsBundle artifact builder tests
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

Environment-specific deployment configuration, operations runbooks, and other private infrastructure concerns are intentionally outside this public architecture map. The public hosting contract still requires private hosted deploys to run database migrations before new API/worker runtime, use image-based two-slot API rollouts with healthcheck assertions, keep production env rendering owner-only and redacted, enforce an edge ingestion body limit, and attach bounded automated recovery to sustained external API health-check failure.

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
