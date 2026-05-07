# Test Organization — DebugBundle

Version: v1
Last updated: 2026-03-17

---

## 1. Directory Structure

All tests live under the root `tests/` directory, organized into subdirectories that mirror the source they exercise:

> **SDK tests** (sdk-node, sdk-browser) live in `sdks/debugbundle-js/tests/packages/` — they moved with the JS SDK monorepo.

```
tests/
  vitest.setup.ts            # Global test setup (jsdom matchers, cleanup)
  helpers/                   # Shared test utilities (fake PG errors, integration harness, fixtures)
  fixtures/                  # Golden fixture files (CLI output, bundle snapshots, repro-engine)
  apps/
    api/                     # Tests for apps/api (routes, runtime, helpers, dependencies)
    cli/                     # Tests for apps/cli (commands, routing, auth, workspace)
    mcp/                     # Tests for apps/mcp (tool surfaces)
    web/                     # Tests for apps/web (React SPA, jsdom)
    worker/                  # Tests for apps/worker (processor, runtime, scheduling)
  packages/
    alert-client/            # Tests for packages/alert-client
    auth/                    # Tests for packages/auth (service logic, Postgres auth store)
    bundle-engine/           # Tests for packages/bundle-engine
    email/                   # Tests for packages/email
    event-normalizer/        # Tests for packages/event-normalizer
    redaction/               # Tests for packages/redaction
    repro-engine/            # Tests for packages/repro-engine
    retrieval-client/        # Tests for packages/retrieval-client
    shared-types/            # Tests for packages/shared-types (schemas, tier capabilities)
    storage/                 # Tests for packages/storage (stores, adapters, migrations)
    token-management/        # Tests for packages/token-management
    webhook-client/          # Tests for packages/webhook-client
    weekly-report-client/    # Tests for packages/weekly-report-client
  integration/               # Docker-backed end-to-end integration tests (ingestion flows)
  contracts/                 # Cross-cutting contract and parity tests
  infrastructure/            # CI wiring, migration script, and scaffolding smoke tests
```

---

## 2. Placement Rules

1. **App tests** go under `tests/apps/<app-name>/`. The `<app-name>` matches the directory name in `apps/` (e.g., `api`, `cli`, `mcp`, `web`, `worker`).
2. **Package tests** go under `tests/packages/<package-name>/`. The `<package-name>` matches the directory name in `packages/` (e.g., `auth`, `storage`, `sdk-node`).
3. **Integration tests** that require Docker infrastructure (Postgres, Redis, S3) go under `tests/integration/`.
4. **Contract/parity tests** that validate cross-cutting interface compliance, schema contracts, or example fixture validity go under `tests/contracts/`.
5. **Infrastructure tests** for CI wiring, migration scripts, or placeholder smoke checks go under `tests/infrastructure/`.
6. **Shared test helpers** go under `tests/helpers/`.
7. **Golden fixtures** go under `tests/fixtures/`.

---

## 3. Naming Conventions

- Test files use `kebab-case` and end with `.test.ts` (or `.test.tsx` for JSX/React tests).
- File names carry a prefix matching their parent module (e.g., `api-auth.test.ts` for the API auth route tests). This prefix is kept even inside the subdirectory to allow unambiguous file identification in search results, editor tabs, and CI output.
- Integration tests use the `.integration.test.ts` suffix.
- Behavioral/golden/redaction sub-suites use dot-separated qualifiers (e.g., `repro-engine.golden.test.ts`).

---

## 4. When Adding a New Test

1. Identify which app or package the test exercises.
2. Place the test in the matching `tests/apps/<app>/` or `tests/packages/<pkg>/` subdirectory.
3. If no subdirectory exists for a new package or app, create one following the naming convention.
4. If the test requires Docker-backed infrastructure, place it in `tests/integration/`.
5. If the test validates cross-cutting contracts or interface parity, place it in `tests/contracts/`.
6. Import source modules via relative paths from the test file's location (e.g., `../../../packages/auth/src/index.js`).
7. Import shared helpers via relative paths to `tests/helpers/` (e.g., `../../helpers/fake-pg-error.ts`).

---

## 5. What Not to Do

- **Do not** place test files directly in the `tests/` root directory. Every test belongs in a subdirectory.
- **Do not** create phase-named or slice-named test files or directories.
- **Do not** duplicate test helpers — extract shared setup into `tests/helpers/`.
- **Do not** create a new subdirectory for a one-off cross-cutting test. Use `tests/contracts/` or `tests/infrastructure/` instead.
