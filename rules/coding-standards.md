# Coding Standards — DebugBundle

Version: v1
Last updated: 2026-03-09

---

## 1. Language & Runtime

- **Primary language:** TypeScript (strict mode) across all packages and apps
- **Primary runtime:** Node.js
- **Package manager:** pnpm (workspaces)
- **Monorepo orchestrator:** turborepo

---

## 2. Code Style

- Use consistent formatting enforced by a shared Prettier/ESLint config at the repo root.
- Prefer `const` over `let`. Never use `var`.
- Use explicit return types on exported functions and public APIs.
- Use Zod or JSON Schema for runtime validation at system boundaries.
- Prefer named exports over default exports.
- Use ISO 8601 for all timestamps.
- Use `null` for missing values, not `undefined`, in API responses and data schemas.

---

## 3. Comment Governance

- **Functional comments:** Explain behavior intent and invariants.
- **Inline comments:** Explain non-obvious technical constraints.
- Read existing comments before editing related behavior.
- If behavior changes, update comments in the same change.
- Remove stale comments immediately.
- Do not comment out code — delete it.

---

## 4. Error Handling

- Never swallow exceptions silently.
- Use structured error types with clear categories.
- At system boundaries (API, SDK, CLI), provide explicit error responses.
- Internal errors should be logged; external-facing errors should be sanitized.
- No internal stack traces or secrets exposed to clients.

---

## 5. Naming Conventions

- Use `snake_case` for JSON field names in API responses, event payloads, and schemas.
- Use `camelCase` for TypeScript variables, functions, and local identifiers.
- Use `PascalCase` for TypeScript types, interfaces, and classes.
- Use `kebab-case` for file names and directory names.
- Token prefixes: `dbundle_proj_` (project tokens), `dbundle_mem_` (member tokens), `dbundle_probe_` (probe trigger tokens).
- Phase numbers are internal planning metadata only. Do not put phase-specific naming or content in source files, test files, test names, comments, variables, or identifiers.
- Organize tests by functional behavior and module ownership, never by the phase or roadmap slice that introduced the work. See `rules/test-organization.md` for the full test directory structure and placement rules.

---

## 6. Module Boundaries

- Shared packages under `packages/` must not import from `apps/`.
- Apps under `apps/` may import from `packages/`.
- No circular dependencies between packages.
- Each package has a clear public API surface (explicit exports).

---

## 7. Configuration

- All configuration via environment variables.
- No hard-coded credentials or secrets.
- Provide `.env.example` files with documentation.
- Use typed config parsing (Zod or similar) at app startup.

---

## 8. Pre-Production Rules

This project is NOT in production. Therefore:

1. **NO backwards compatibility** — break things freely when improving
2. **NO legacy code** — remove old implementations entirely
3. **NO migration paths** — users can clear data if needed
4. **NO workarounds for old patterns** — clean implementations only
5. **NO deprecated code comments** — delete, don't comment out

These rules apply until first public release. After production: backwards compatibility becomes mandatory.

---

## 9. Documentation Style

All documentation must be agent-friendly:
- Short sections with clear headings
- Deterministic terminology (same concept = same word everywhere)
- Explicit schemas and structured examples over prose descriptions
- Avoid marketing language and vague descriptions
- Every feature must include: behavior, inputs, outputs, edge cases, examples
- Phase references are allowed only in planning and progress-tracking documents such as `spec/implementation-roadmap.md`, the local status tracker, and `CHANGELOG.md`.

---

## 10. Environment Detection Heuristics

SDKs and CLI must auto-detect project runtime and framework using file heuristics.

**Runtime detection:**

| File | Detected Runtime |
|------|------------------|
| `package.json` | Node |
| `composer.json` | PHP |
| `requirements.txt` / `pyproject.toml` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |

**Framework detection:**

| Signal | Detected Framework |
|--------|--------------------|
| `next.config.js` / `next.config.mjs` | Next.js |
| `express` dependency | Express |
| `fastify` dependency | Fastify |
| `artisan` file | Laravel |
| `manage.py` | Django |

**Deployment target detection:**

| Signal | Detected Target |
|--------|-----------------|
| `vercel.json` / `VERCEL` env var | Vercel |
| `netlify.toml` / `NETLIFY` env var | Netlify |
| `wrangler.toml` | Cloudflare Pages/Workers |
| `render.yaml` / `RENDER` env var | Render |
| `docker-compose.yml` / `Dockerfile` | Docker |
| Fallback | Generic Node server |

---

## 11. Git Conventions

- Never revert unrelated local changes.
- Never use destructive git commands unless explicitly requested.
- Do not amend commits unless explicitly requested.
- If unexpected unrelated file changes appear during work, pause and ask.

---

## 12. Storage Bootstrap Conventions

- The authoritative storage schema lives in `packages/storage/src/migrations.ts` as the clean-slate bootstrap contract.
- The bootstrap SQL must describe the final database shape directly for a fresh database.
- Do not use schema-evolution SQL in the bootstrap contract: no `ALTER TABLE`, no `ADD COLUMN`, no `DROP CONSTRAINT`, no `IF NOT EXISTS`, and no backfill/update steps for historical rows.
- Do not reintroduce `schema_migrations` or append-only migration IDs while the project remains pre-production.
- Do not include `BEGIN`, `COMMIT`, or `ROLLBACK` statements inside bootstrap SQL. Transactions are managed by the bootstrap runner.
- Bootstrap behavior may detect three states only: empty database, already-bootstrapped clean schema, or unsupported legacy/partial schema that must be recreated.
- Bootstrap failures must fail fast with explicit error messages that distinguish legacy-schema detection, partial-schema detection, bootstrap failure, and rollback failure.

---

## 13. File Size Limits

- **Target:** No single source file should exceed ~800 lines.
- **Hard limit:** Files reaching 1,000 lines must be refactored before further work is added.
- Split at natural boundaries: type definitions, helper functions, route groups, test suites by concern.
- Source-code modules should re-export via barrel `index.ts` files so external import paths remain stable.
- Test files should extract shared setup into `tests/helpers/` modules and split by functional concern.
- When splitting, verify: typecheck passes, all existing tests pass, no external imports break.
