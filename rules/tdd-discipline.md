# TDD Discipline — DebugBundle

Version: v1
Last updated: 2026-03-09

---

## 1. Red/Green Discipline

Every feature and bug fix must follow the cycle:

1. **Red** — Write a failing test that captures the requirement or bug.
2. **Green** — Implement the minimal code that makes the test pass.
3. **Refactor** — Clean up without changing behavior (tests remain green).

No production code without a corresponding test. No tests that don't assert meaningful behavior.

When an existing test fails, the failure must be treated as a behavior investigation, not as permission to rewrite the test until green. The engineer must determine whether the failing assertion reflects the intended requirement, a real product defect, a stale test, or stale documentation/contracts. Changing a failing test is allowed only after the intended behavior has been revalidated against source-of-truth requirements/contracts and the exercised implementation path.

If the test is correct, fix production code. If the test is stale, update the test and any stale docs/contracts in the same change.

---

## 2. Testing Layers

| Layer | Scope | Runner | Purpose |
|-------|-------|--------|---------|
| Unit | Single function/module | Vitest | Logic correctness, edge cases |
| Integration | Service ↔ DB, Service ↔ S3, Service ↔ Redis | Vitest + test containers | Data flow, persistence correctness |
| Contract | Schema validation, API shape, webhook payloads | Vitest | Ensure interfaces match contracts |
| E2E | Full request cycle (SDK → API → Worker → Retrieval) | Vitest or Playwright (web) | System-level acceptance |
| Failure Injection | SDK under hostile conditions, worker under queue failures | Vitest | Reliability under failure |

---

## 3. Coverage Priorities

Ranked by blast radius if broken:

### Tier 1 — Critical (must have 100% path coverage)
- Auth: token validation, token scope enforcement, token hashing
- Redaction: all PII/secret detection and scrubbing
- Bundle generation: deterministic output, schema compliance
- Event normalization: all event types, validation, rejection of bad input

### Tier 2 — High (must have comprehensive happy-path + major error paths)
- Incident grouping / fingerprinting
- Reproduction generation
- Webhook delivery + signing
- SDK batching, flush, loop protection, duplicate suppression
- Retention cleanup

### Tier 3 — Standard (happy-path coverage required)
- CLI commands (input parsing, output formatting, exit codes)
- MCP tool surface
- API route handlers
- Alert rule evaluation
- Email delivery

### Tier 4 — Basic (smoke tests)
- Web app pages (render without crash)
- Health endpoints
- Configuration parsing

---

## 4. Golden Fixtures

Maintain canonical input/output fixtures for deterministic components:

| Fixture Set | Location | Purpose |
|-------------|----------|---------|
| Bundle generation | `packages/bundle-engine/__fixtures__/` | Known events → known bundle output |
| Event normalization | `packages/event-normalizer/__fixtures__/` | Raw events → normalized events |
| Fingerprinting | `packages/event-normalizer/__fixtures__/` | Known events → known fingerprints |
| Webhook payloads | `packages/shared-types/__fixtures__/` | Known incidents → known webhook shapes |
| CLI output | `apps/cli/__fixtures__/` | Known commands → known stdout |
| MCP responses | `apps/mcp/__fixtures__/` | Known tool calls → known responses |
| Reproduction | `packages/repro-engine/__fixtures__/` | Known bundles → known reproduction steps |

Golden fixtures must be committed to the repo. Any fixture change requires explicit review.

---

## 5. Schema Validation Tests

Every Zod schema in `shared-types` must have:
- A test with valid data (passes validation)
- A test with each required field removed (rejects)
- A test with malformed field types (rejects)
- A test round-tripping: `schema.parse(input)` → serialize → `schema.parse(deserialized)` produces identical output

---

## 6. SDK Failure-Isolation Tests

The SDK test suite must include failure scenarios:

- `init()` with invalid/missing API key → SDK degrades silently, host continues
- Network timeout during flush → events buffered, no crash
- Server returns 500 → retry with backoff, no crash
- Server returns 429 → backoff, respect Retry-After, no crash
- Queue full → oldest events dropped, no OOM
- Concurrent flush calls → no double-send, no data corruption
- Browser unload during flush → `sendBeacon` fallback
- Malformed user-supplied metadata → sanitized, not crash

---

## 7. Idempotency Tests

Every worker job type must have a test that:
1. Runs the job with known input
2. Runs the job again with the same input
3. Asserts the output/state is identical after both runs

---

## 8. Interface Parity Tests

Maintain a parity matrix that enumerates all operations and verifies each is available in API, CLI, and MCP:

```
Operation                  | API | CLI | MCP
---------------------------|-----|-----|----
List incidents             | ✓   | ✓   | ✓
Get incident               | ✓   | ✓   | ✓
Get bundle                 | ✓   | ✓   | ✓
Get reproduction           | ✓   | ✓   | ✓
Create alert               | ✓   | ✓   | ✓
...
```

This matrix should be generated from code, not maintained manually.

---

## 9. CI Pipeline Expectations

Every CI run must:

1. **Lint** — ESLint (no warnings allowed)
2. **Typecheck** — `tsc --noEmit` across all packages
3. **Unit tests** — `vitest run` across all packages
4. **Integration tests** — with test containers (Postgres, Redis, LocalStack S3)
5. **Schema validation** — validate all Zod schemas against golden fixtures
6. **Build** — `turbo build` succeeds

CI must pass before any merge to `main`.

---

## 10. Test Naming Convention

```
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // ...
    });
  });
});
```

Test files: `*.test.ts` co-located with source or in `__tests__/` directory.

---

## 11. Test Data Factories

Create factory functions for test data rather than inline object literals:

```typescript
// packages/shared-types/src/test-factories.ts
export function createTestEvent(overrides?: Partial<EventEnvelope>): EventEnvelope { ... }
export function createTestBundle(overrides?: Partial<BundleV1>): BundleV1 { ... }
export function createTestIncident(overrides?: Partial<Incident>): Incident { ... }
```

Use explicit overrides rather than random/faker data for deterministic tests.

---

## 12. What NOT to Test

- Framework internals (Fastify routing, Next.js rendering)
- Third-party library behavior (Zod parsing, pg-pool connections)
- Simple type aliases or re-exports
- Configuration constants

Focus test effort on business logic, data transformations, and system boundaries.
