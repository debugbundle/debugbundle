# SDK Testing Strategy — DebugBundle

Version: v1
Last updated: 2026-05-28

---

## 1. Principle

Each SDK is tested **independently in its own repository**. SDKs do not depend on the core monorepo's Docker services (Postgres, Redis, S3) because they only communicate over HTTP to the ingestion endpoint.

---

## 2. Test Tiers

### Tier 1 — Unit Tests (mandatory, runs on every commit)

Every SDK must unit-test the following behaviors by **mocking the HTTP transport** (no real network calls):

| Category | What to test |
|----------|-------------|
| Initialization | Valid config initializes; invalid/missing config degrades silently (no crash) |
| Universal interface | All 9 methods present and callable: `init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`, `probe` |
| Batching | Events accumulate up to `batchSize`; flush triggers on interval or explicit `flush()` |
| Deduplication | Same error within suppression window is not sent twice |
| Loop protection | SDK errors do not trigger recursive capture |
| Redaction | Default and custom sensitive fields are scrubbed before send |
| Retry + backoff | 429/5xx → bounded retry with exponential backoff; 4xx (non-429) → drop |
| Safe degradation | Network timeout → buffer, no crash; invalid server response → ignore |
| Event envelope shape | Emitted payloads conform to the `EventEnvelope` schema from `contracts/data-schemas.md` |
| Vanilla hooks | Language-native error/exception hooks capture correctly |
| Log capture | Logger integration captures at configured level; auto-detection works |
| Framework integrations | Middleware/handlers capture request metadata, unhandled errors, response status |
| Browser relay handlers | Server SDK relay handlers validate origin, content type, body size, event type, trust fields, rate limits, local-only file writes, connected durable spool, connected cloud forwarding, and credential isolation per `contracts/sdk-interface.md` §13 |
| Mobile lifecycle and trace | Android/iOS SDKs capture lifecycle breadcrumbs, inject `X-DebugBundle-Trace-Id` only through explicit native HTTP instrumentation, and preserve trace IDs in event envelopes per `contracts/sdk-interface.md` §10.1 |
| Mobile offline queue | Android/iOS SDKs redact before queue persistence, preserve original capture timestamps, enforce queue size/TTL bounds, survive app restart, and retry on connectivity restoration |
| Probes | Always-on probe buffers in ring buffer, flushes with errors; heavy probe dormant until remote activation |
| Config refresh (paid tiers) | Backend SDKs poll `/v1/sdk/config`; browser/mobile SDKs use session-start checks plus ingestion-response piggybacking; all cache with ETag/304 where applicable and deactivate expired remote probes |
| Capture policy | Respects `GET /v1/sdk/config` capture-policy directives (mode, overrides) per `contracts/sdk-interface.md` §12 |

**Transport mock pattern:** Each SDK should provide a test utility that intercepts outbound HTTP calls and captures the payloads for assertion. Examples:
- **JS:** Replace `fetch`/`http.request` with a spy
- **Python:** `unittest.mock.patch` on `requests.Session.post` or `httpx.Client.post`
- **PHP:** Guzzle mock handler stack
- **Go:** `httptest.NewServer` with a recording handler
- **Ruby:** WebMock or VCR
- **Kotlin Android:** MockWebServer or fake transport plus Robolectric/instrumented storage fixtures
- **Swift iOS:** Custom `URLProtocol` fake transport or local mock server plus simulator storage fixtures

### Tier 2 — Contract Compliance Tests (mandatory)

Each SDK must include a test suite that validates compliance against `contracts/sdk-interface.md`:

1. **Envelope schema validation** — Serialize a captured event and validate against the JSON Schema derived from `EventEnvelopeSchema` (available at the public site: `/schemas/bundle.json`).
2. **Universal interface existence** — Assert all 9 core methods exist and accept the documented parameter signatures.
3. **Safety invariants** — Assert `INV-2` (SDK never crashes host): invalid config, null inputs, network failures, and malformed server responses all result in silent degradation.
4. **Redaction contract** — Default sensitive fields list matches `contracts/sdk-interface.md` §6.
5. **Relay parity contract** — Server SDKs with backend framework integrations must pass the shared browser relay compliance fixtures for all supported V1 adapters. Foundation-only callback handlers must not be marked full relay-compatible.

### Relay Compliance Fixtures

All V1 server SDKs that expose browser relay handlers must share a fixture suite covering:

- valid browser batch,
- mixed valid and invalid browser events,
- credential-smuggling payloads containing browser-supplied `project_token`, `organization_id`, and auth headers,
- wrong-origin and missing-origin requests,
- unsupported content type,
- oversized body,
- per-IP rate limiting,
- local-only file write shape,
- connected durable spool write and retained-undelivered behavior,
- connected cloud forwarding with server-side project credentials only,
- framework adapter routing for each V1 framework in `spec/sdk-language-targets.md`.

The expected local file and spool shape must be language-neutral so `debugbundle process` and `debugbundle doctor --check-relay` can consume relay artifacts without knowing which SDK wrote them.

### Tier 3 — App-Driven Integration Tests (mandatory before release)

Every SDK release must include at least one minimal application-level smoke test that exercises the published installation path, not only the internal client API. This test may run in CI against a mock ingestion endpoint, and release validation may additionally run against a hosted staging project when credentials are available.

- The smoke app installs the SDK the same way a consumer would install it from the built package artifact.
- The smoke app initializes the SDK with documented config, triggers one application-owned event through the public capture API, calls `flush()` or the language-equivalent bounded flush, and asserts the mock or hosted ingestion endpoint received the event.
- The assertion must include event envelope shape, `service`, `environment`, SDK name/version, and correlation fields when the smoke path includes an HTTP request.
- For server SDKs with browser relay handlers, at least one smoke path must submit a browser relay batch through the framework route and prove credential isolation plus delivery through the same transport path used by server events.
- A lightweight `docker-compose.yml`, in-process test server, or language-native test host in the SDK repo may provide a **mock ingestion server** that validates `POST /v1/events` payloads and stores them in memory.
- This does **not** require the full DebugBundle stack (no Postgres, Redis, S3).

---

## 3. Test Runner Per Language

| Language | Runner | Coverage tool |
|----------|--------|--------------|
| TypeScript (JS SDK monorepo) | Vitest | V8 via vitest |
| Python | pytest | coverage.py / pytest-cov |
| PHP | PHPUnit | Xdebug / PCOV |
| Go | `go test` | `go test -cover` |
| Ruby | RSpec | SimpleCov |
| Kotlin Android | JUnit, Robolectric, Android instrumented tests | JaCoCo / Gradle coverage |
| Swift iOS | XCTest or Swift Testing plus simulator tests | Xcode coverage / SwiftPM coverage where available |

---

## 4. CI Pipeline Per SDK Repo

Each SDK repo runs its own GitHub Actions CI with these gates:

1. **Lint** — Language-specific linter (eslint, ruff/flake8, phpstan, golangci-lint, rubocop)
2. **Typecheck** — Where applicable (tsc, mypy, phpstan, go vet)
3. **Unit tests** — Tier 1 + Tier 2 tests pass
4. **Coverage** — 80% per-file minimum (matching core monorepo standard)
5. **Build/package** — Validates the publishable artifact builds (npm pack, python build, etc.)
6. **Clean install smoke** — Installs the built artifact into a fresh fixture and runs the Tier 3 app-driven smoke path.

Each SDK CI matrix must also encode the version support policy from `spec/sdk-language-targets.md`: test the minimum compatibility runtime, important intermediate installed-base lanes, current stable, and previous stable or LTS where applicable. Framework adapters must include version lanes for the framework versions claimed by the SDK plan. When a tested runtime or framework is upstream EOL but intentionally supported for installed-base reach, mark it as compatibility coverage and keep the public docs clear that it is not the recommended production posture.

---

## 5. Release Documentation Gates

Every SDK release must ship docs that remove first-install ambiguity across the surfaces the SDK claims to support.

Required documentation gates:

1. **Configuration reference** — List every supported config option, environment variable, system property, framework-native setting, and package-manager-specific source where applicable. Include defaults, accepted values, and source precedence. State that capture-policy fields are server-owned and are not accepted from local SDK config.
2. **Install examples for claimed modes** — Provide minimal examples for each first-class framework, vanilla/manual capture path, logger integration, local-only mode, connected mode, and zero-install fallback where the SDK plan includes one.
3. **Runtime and framework support labels** — Use the same labels from `spec/sdk-language-targets.md`: minimum compatibility version, recommended production version, installed-base compatibility lane, rolling CI lane, and out of scope. EOL lanes must be named as compatibility support, not secure production recommendations.
4. **Dependency alignment guidance** — Multi-package SDK families must provide package-manager-native alignment guidance, such as an npm package family version rule, Maven BOM, Gradle platform, NuGet package version table, Composer constraint guidance, or equivalent. Public snippets must not mix SDK package versions.
5. **Relay documentation** — Server SDKs with full relay handlers must document same-origin defaults, explicit allowed-origin configuration for split frontend/backend hosts, content-type enforcement, payload-size limits, rate limiting, credential isolation, local-only delivery, connected durable spool behavior, connected forwarding, disabled mode, and missing-token behavior.
6. **Service naming guidance** — Docs must explain how to name services in multi-surface systems, including browser frontend plus backend relay and multiple backend deployables sharing one project.
7. **Safe startup behavior** — Docs must describe what happens when connected mode is configured without a usable project token. SDKs must not crash the host, must expose degraded or disabled status through the public status API, and must not silently report healthy connected capture.
8. **First-event verification** — Docs must include a language-idiomatic pattern that initializes the SDK, captures an explicit test exception or message, flushes, and confirms receipt through a mock endpoint, CLI/cloud verification command, or hosted staging project.

These gates are cross-SDK requirements. Language-specific plans may add stricter docs or smoke paths, but they should not weaken these release floors.

---

## 6. Shared Test Fixtures

The core monorepo publishes golden fixtures that SDK repos can consume:

| Fixture | Location | Purpose |
|---------|----------|---------|
| Example event envelopes | `examples/bundle.failure.json`, `examples/bundle.improvement.json` | Reference payloads for schema validation |
| Event envelope JSON Schema | Published at `/schemas/bundle.json` on the public site | Machine-readable schema for envelope validation |
| Webhook event payloads | Published at `/schemas/webhook-events.json` | Reference for SDK-generated events that trigger webhooks |

SDK repos can fetch these from the public site URL or vendor them as test fixtures.

---

## 7. JS SDK (debugbundle-js) — Current Setup

The JS SDK tests run as part of the core monorepo's Vitest suite during the workspace-bridge period:

- **Test location:** `sdks/debugbundle-js/tests/packages/sdk-node/` and `sdks/debugbundle-js/tests/packages/sdk-browser/`
- **Included by:** Root `vitest.config.ts` includes `sdks/debugbundle-js/tests/**/*.test.ts`
- **TypeScript:** Root `tsconfig.json` includes `sdks/debugbundle-js/**/*.ts`
- **Dependencies:** `@debugbundle/shared-types`, `@debugbundle/redaction`, `@debugbundle/auth` resolved via `workspace:*` through `pnpm-workspace.yaml`

When the JS SDK repo becomes standalone, it will have its own `vitest.config.ts` and the workspace deps will become published npm packages.
