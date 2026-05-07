# SDK Testing Strategy — DebugBundle

Version: v1
Last updated: 2026-03-30

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
| Probes | Always-on probe buffers in ring buffer, flushes with errors; heavy probe dormant until remote activation |
| Config polling (paid tiers) | Polls `/v1/sdk/config` at configured interval; caches with ETag/304; deactivates expired remote probes |
| Capture policy | Respects `GET /v1/sdk/config` capture-policy directives (mode, overrides) per `contracts/sdk-interface.md` §12 |

**Transport mock pattern:** Each SDK should provide a test utility that intercepts outbound HTTP calls and captures the payloads for assertion. Examples:
- **JS:** Replace `fetch`/`http.request` with a spy
- **Python:** `unittest.mock.patch` on `requests.Session.post` or `httpx.Client.post`
- **PHP:** Guzzle mock handler stack
- **Go:** `httptest.NewServer` with a recording handler
- **Ruby:** WebMock or VCR

### Tier 2 — Contract Compliance Tests (mandatory)

Each SDK must include a test suite that validates compliance against `contracts/sdk-interface.md`:

1. **Envelope schema validation** — Serialize a captured event and validate against the JSON Schema derived from `EventEnvelopeSchema` (available at the public site: `/schemas/bundle.json`).
2. **Universal interface existence** — Assert all 9 core methods exist and accept the documented parameter signatures.
3. **Safety invariants** — Assert `INV-2` (SDK never crashes host): invalid config, null inputs, network failures, and malformed server responses all result in silent degradation.
4. **Redaction contract** — Default sensitive fields list matches `contracts/sdk-interface.md` §6.

### Tier 3 — Integration Tests (optional, CI-only)

For SDKs that want end-to-end validation against a real ingestion endpoint:

- A lightweight `docker-compose.yml` in the SDK repo spins up a **mock ingestion server** (a simple HTTP server that validates `POST /v1/events` payloads and stores them in memory).
- Tests init the SDK, trigger events, call `flush()`, and assert the mock server received correctly shaped payloads.
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

---

## 4. CI Pipeline Per SDK Repo

Each SDK repo runs its own GitHub Actions CI with these gates:

1. **Lint** — Language-specific linter (eslint, ruff/flake8, phpstan, golangci-lint, rubocop)
2. **Typecheck** — Where applicable (tsc, mypy, phpstan, go vet)
3. **Unit tests** — Tier 1 + Tier 2 tests pass
4. **Coverage** — 80% per-file minimum (matching core monorepo standard)
5. **Build/package** — Validates the publishable artifact builds (npm pack, python build, etc.)

---

## 5. Shared Test Fixtures

The core monorepo publishes golden fixtures that SDK repos can consume:

| Fixture | Location | Purpose |
|---------|----------|---------|
| Example event envelopes | `examples/bundle.failure.json`, `examples/bundle.improvement.json` | Reference payloads for schema validation |
| Event envelope JSON Schema | Published at `/schemas/bundle.json` on the public site | Machine-readable schema for envelope validation |
| Webhook event payloads | Published at `/schemas/webhook-events.json` | Reference for SDK-generated events that trigger webhooks |

SDK repos can fetch these from the public site URL or vendor them as test fixtures.

---

## 6. JS SDK (debugbundle-js) — Current Setup

The JS SDK tests run as part of the core monorepo's Vitest suite during the workspace-bridge period:

- **Test location:** `sdks/debugbundle-js/tests/packages/sdk-node/` and `sdks/debugbundle-js/tests/packages/sdk-browser/`
- **Included by:** Root `vitest.config.ts` includes `sdks/debugbundle-js/tests/**/*.test.ts`
- **TypeScript:** Root `tsconfig.json` includes `sdks/debugbundle-js/**/*.ts`
- **Dependencies:** `@debugbundle/shared-types`, `@debugbundle/redaction`, `@debugbundle/auth` resolved via `workspace:*` through `pnpm-workspace.yaml`

When the JS SDK repo becomes standalone, it will have its own `vitest.config.ts` and the workspace deps will become published npm packages.
