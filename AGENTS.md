# AGENTS.md — DebugBundle Execution Contract

This file is the mandatory execution contract for AI agents working on DebugBundle.

---

## 0) Critical Rules

### Development Phase Status: PRODUCTION

**This project is live and has installed projects. Therefore:**

1. **Backwards compatibility matters** — Public APIs, SDK behavior, CLI output, MCP tools, bundle schemas, webhook payloads, and persisted data must not be broken casually.
2. **No silent breaking changes** — Breaking changes require an explicit major-version path, migration guidance, changelog coverage, and user-facing documentation.
3. **Installed projects must keep working** — Avoid changes that strand existing SDK installs, project tokens, browser relay routes, profiles, bundles, or self-hosted databases.
4. **Deprecate deliberately** — Public interfaces must be retained through the documented deprecation window before removal unless a source-of-truth security rule requires immediate disablement.
5. **Clean implementations still matter** — Do not add fragile shims or stale comments; when compatibility is required, make the compatibility path explicit, tested, and documented.

### Production Database Change Standard
- Treat every database schema change as a production migration task.
- `db-bootstrap` is for clean empty-schema creation only. It must never be used as a schema-upgrade path for existing environments.
- All schema evolution must ship through ordered forward migrations with ledger/checksum validation.
- Deploys must run required migrations before new API or worker code is allowed to consume the changed schema.
- Database changes must follow expand/contract discipline: additive change first, application code compatible with both shapes when needed, backfill separately when needed, destructive cleanup only in a later deploy.
- Do not merge or ship a schema change unless tests cover the migration path and the deploy/runtime path fails closed when required migrations are missing.

---

## 1) Session Start: Read Order (Mandatory)

Before changing code, read in this order:

1. `/SYSTEM_OVERVIEW.md` — system mental model recovery
2. `/ARCHITECTURE_MAP.md` — module boundary navigation
3. `/spec/requirements.md` — what must be built
4. `/spec/acceptance.md` — how to verify it works
5. Relevant files under `/rules/` — how it must behave
6. Relevant files under `/contracts/` — interface and schema contracts
7. Relevant code/module comments in files being changed

### Authority Rule

If a context-compression file (`SYSTEM_OVERVIEW.md`, `ARCHITECTURE_MAP.md`) conflicts with a source-of-truth file (`/spec/*`, `/contracts/*`, `/rules/*`, `/evals/*`), the source-of-truth file always wins.

### Maintenance Rule

If a change affects architecture, module boundaries, major workflows, public interfaces, bundle/profile paths, or project structure — update `SYSTEM_OVERVIEW.md` and `ARCHITECTURE_MAP.md` in the same change.

### Local Companion Repos

This workspace may include ignored companion repositories under `.local-repos/`. Before declaring a companion repo unavailable, agents must check this directory.

- `.local-repos/debugbundle-cloud` — private hosted deployment, monitoring, environment-template, and operator-runbook repo. Hosted runtime deployment automation, image publishing, two-slot rollout, production env rendering, CloudFront invalidation, CloudWatch alarms, and auto-recovery work belongs here, not in the public core repo.
- `.local-repos/action` — public GitHub Action companion repo.
- `.local-repos/debugbundle-github-profile` — GitHub organization profile companion repo.

---

## 2) Core Operating Principles

- You are the most reliable engineer that sticks to standard conventions.
- Keep changes minimal, modular, and reversible.
- Prefer thin vertical slices over broad scaffolding.
- Do not introduce abstractions without an in-scope consumer.
- Preserve clear boundaries: apps import packages, never reverse.
- All business logic lives in `packages/`, not in `apps/`.

---

## 2a) Engineering Preferences

- Prioritize DRY when feasible; flag meaningful repetition early.
- Treat strong test coverage as non-negotiable; prefer too many tests over too few.
- Aim for "engineered enough": avoid fragile hacks and premature abstraction.
- Handle edge cases thoughtfully; favor correctness over speed.
- Bias toward explicit patterns over implicit or clever behavior.
- Treat phase numbers as planning metadata only. Never encode a phase number into source code, tests, test names, comments, or identifiers.
- When phase-driven work adds tests, place them in the functional test files that own that behavior instead of creating phase-named test files.

---

## 2b) File Size Limits (Mandatory)

- **Target ceiling:** ~800 lines per source file.
- **Hard limit:** 1,000 lines. Files at or above this must be split before adding more code.
- Split at natural boundaries (types, helpers, route groups, test concerns).
- Use barrel `index.ts` re-exports so external import paths remain unchanged.
- Test files: extract shared setup into `tests/helpers/` and split by functional concern.
- After any split: typecheck must pass, all tests must pass, no external imports may break.

---

## 3) Sandboxing Defaults (Mandatory)

- Default to Docker/Compose for local runtime.
- Run core services inside containers (API, Worker, Postgres, Redis, LocalStack S3).
- Require health checks and readiness checks in container orchestration.
- Keep host setup minimal (Docker, git, editor/tooling only).
- Prefer `make <target>` for routine commands (install, lint, typecheck, test, build, infra up/down). Add a Make target before introducing ad-hoc shell commands.
- Prefer Docker-backed Make targets over host package manager commands.

Frontend-specific rule:
- Run `npm`/bundlers in Docker-scoped environments to avoid host/system file exposure.
- If host package management is intentionally used, document it explicitly in `/rules/` with pinned versions.
- For any frontend, UI, UX, interaction, layout, component, accessibility, visual polish, or design-system task, load and follow `/rules/design-discipline.md` and `.agents/skills/design-discipline/SKILL.md`.
- Prefer existing framework, design-system, and component-library patterns before creating custom ones.
- Reuse existing tokens, variables, spacing scale, typography, colors, motion, and primitives.
- Optimize for human clarity, familiarity, accessibility, responsiveness, and strong visual hierarchy.
- Check whether the chosen pattern matches common platform and design-system conventions.
- If a feature requires a novel or unusual interaction, recommend it clearly and ask for approval before implementing it.
- Do not introduce one-off UI patterns when an existing product pattern already solves the problem.
- Use mobile-first responsive implementation by default, but adapt layout and hierarchy for tablet/desktop when the task benefits from denser or more contextual UI.
- Before any UI design/layout/component implementation, first define a design system proposal (tokens, primitives, component inventory, states, accessibility, and usage patterns), get explicit user approval, and only then implement UI.
- All UI components must be built for maximum reuse (composable APIs, variant-driven props, shared primitives, no one-off page-only components unless explicitly approved).

---

## 4) Comment Governance (Mandatory)

- Functional comments explain behavior intent and invariants.
- Inline comments explain non-obvious technical constraints.
- Read existing comments before editing related behavior.
- If behavior changes, update comments in the same change.
- Remove stale comments immediately.

---

## 5) Change Protocol (Mandatory)

For each meaningful change:

1. Map requested change to requirements (`FR-*`, `NFR-*`) and acceptance criteria.
2. Add/update tests or eval fixtures first where behavior changes.
3. Confirm failing state first (Red) when applicable.
4. Implement minimal fix/feature (Green).
5. Refactor without changing behavior.
6. Update docs/contracts if interfaces or behavior changed.
7. Verify documentation: new routes, CLI commands, MCP tools, webhooks, and SDK methods must have matching documentation before the change is considered complete.

Do not alter tests to force passing results.

When a test fails, do not assume the test is wrong. Treat the failure as evidence of one of three cases: incorrect production code, incorrect test expectations, or outdated contracts/docs. Before changing a test, verify the intended behavior against requirements, contracts, and the implementation boundary being exercised. If the product behavior is wrong, fix production code first and keep the test as the executable requirement.

---

## 6) Quality Gates

- Lint/format checks pass (`eslint`, `prettier`).
- Type checks pass (`tsc --noEmit`).
- Unit tests pass (`vitest run`).
- Integration tests pass when applicable.
- Schema validation passes against golden fixtures.
- New or changed paths are covered by tests.
- New or changed public interfaces have matching documentation (API docs, CLI help, MCP tool descriptions).

---

## 7) Security and Reliability Baseline

- Validate all external inputs with Zod at system boundaries.
- Do not expose internal stack traces or secrets to clients.
- Do not log secrets or raw sensitive payloads.
- Redact sensitive data before storage (see `/rules/domain-invariants.md` INV-3).
- Keep config environment-driven; no hard-coded credentials.
- Use shared/pool-based clients for DB and Redis connections.
- Hash tokens at rest (SHA-256 minimum). Show plaintext once at creation.
- Sign all webhook payloads with HMAC-SHA256.
- Follow `/rules/security-hardening.md` (SEC-01 through SEC-26) for all new routes, SDK features, and storage surfaces. When a change touches auth, API routes, SDK transport, redaction, or trust boundaries, review the applicable SEC-* rules and confirm enforcement is present before shipping.

---

## 8) DebugBundle-Specific Rules

### Interface Parity
If a capability matters for automation, it must be available through API, CLI, and MCP. No capability may be dashboard-only. All three interfaces must call the same domain services.

### Bundle Determinism
Given the same normalized events, the bundle generator must produce byte-identical output. No random IDs, no wall-clock timestamps in bundle generation.

### SDK Safety
SDK code must never throw uncaught exceptions into user code, block the request/response cycle, or crash the host process. SDK failures are caught internally and swallowed silently.

### Ingestion Must Be Lightweight
`POST /v1/events` must validate, persist raw events to S3, enqueue processing, and return. No heavy synchronous processing in the ingestion path.

### Processing Must Be Idempotent
All worker jobs must be safely re-runnable without corrupting state or duplicating data.

### Token Scope Separation
Project tokens → SDK write-only (ingestion). Member tokens → CLI/API/MCP read/manage. Never conflate.

---

## 9) Git and Safety Rules

- Never revert unrelated local changes.
- Never use destructive git commands unless explicitly requested.
- Do not amend commits unless explicitly requested.
- If unexpected unrelated file changes appear during work, pause and ask user how to proceed.

---

## 10) Delivery Expectations

- Complete tasks end-to-end when feasible (implement + test + verify).
- If blocked, clearly state blocker and propose the next viable path.
- Keep outputs concise and actionable.
- Prefer concrete file references and verification outcomes.

## 11) Production Schema Safety Checklist

When the product is in production and a task touches Postgres tables, columns, indexes, constraints, or schema-dependent runtime behavior, agents must verify all of the following before calling the work complete:

- The change uses a real forward migration rather than editing bootstrap-only SQL and hoping deploy order hides the risk.
- Runtime readiness or startup checks fail closed if the new code depends on a migration that has not been applied yet.
- Deploy orchestration runs migrations before restarting or shifting traffic to code that depends on the new schema.
- Any destructive schema step is delayed until a later deploy after compatible code is already live.
- Documentation covering deploy/update behavior is updated in the same change.

<!-- debugbundle:start -->
## DebugBundle
- Use DebugBundle for runtime failures, production/customer-facing incidents, endpoint downtime, notification/webhook delivery failures, health-check failures, specific incident reports, or symptoms likely to have generated captured events.
- Use DebugBundle product analytics for visits, active users, routes, devices, actions, funnels, journeys, friction, and analytics opportunities; start with aggregate reads and generate an analytics bundle only for a bounded durable analysis.
- For deterministic local code, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first; do not check DebugBundle incidents unless runtime evidence is needed or the user asks.
- Read `.agents/skills/debugbundle/SKILL.md` for the full DebugBundle workflow.
<!-- debugbundle:end -->

## DebugBundle (Internal)
- For every new `@debugbundle/mcp` release or new public MCP/OpenClaw marketplace target, run the local MCP ecosystem release pipeline after npm publish so the official registry, Smithery MCP + skill entries, ClawHub skill + OpenClaw plugin, and discovery checks stay synchronized.
