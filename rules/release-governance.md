# Release & Open-Source Governance — DebugBundle

Version: v1
Last updated: 2026-05-31

---

## 1. Required Repository Files

The public repository must contain these root-level files:

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project overview, quick start, badges, links | Required |
| `LICENSE` | AGPL-3.0-only full text | Required |
| `CONTRIBUTING.md` | How to contribute (fork, branch, test, PR) | Required |
| `CODE_OF_CONDUCT.md` | Community conduct standards (Contributor Covenant v2.1) | Required |
| `SECURITY.md` | Vulnerability disclosure process | Required |
| `CHANGELOG.md` | Release history (Keep a Changelog format) | Required |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug report template | Required |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature request template | Required |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist (tests, docs, breaking changes) | Required |

---

## 2. CI/CD Pipeline Specification

### Public Repository (`.github/workflows/`)

**ci.yml** — Runs on every push and PR:
1. `pnpm install` (frozen lockfile)
2. `turbo lint` (ESLint)
3. `turbo typecheck` (tsc --noEmit)
4. `turbo test` (vitest run)
5. `turbo build`

**release-cli-package.yml** — Runs on `cli-v*` tags or manual dispatch:
1. Validate the CLI release manifest and version
2. Run focused CLI package tests
3. Pack and smoke-test the staged artifact
4. Publish `@debugbundle/cli` to npm
5. Smoke-test a clean install from the registry

**release-mcp-package.yml** — Runs on `mcp-v*` tags or manual dispatch:
1. Validate the MCP release manifest and version
2. Run focused MCP package tests
3. Pack and smoke-test the staged artifact
4. Publish `@debugbundle/mcp` to npm
5. Smoke-test a clean install from the registry

The MCP package release manifest must include package-level MCP Registry metadata (`server.json`) alongside `package.json`, `README.md`, `LICENSE`, and the executable bin wrapper so public registry and marketplace submissions can be validated from the same release artifact.

**release-shared-js-packages.yml** — Runs on `shared-js-v*` tags or manual dispatch:
1. Validate the shared package versions
2. Run focused shared-package tests
3. Build the shared packages and prepare publish manifests
4. Pack and smoke-test staged artifacts
5. Publish `@debugbundle/shared-types` and `@debugbundle/redaction` to npm
6. Smoke-test clean installs from the registry

The public core repository currently uses package-scoped release workflows rather than a single root `release.yml`. If a future release model introduces a monolithic tag workflow, this document must be updated in the same change.

Public CI must NEVER contain deployment config, cloud credentials, or infrastructure code.

### Package Release Checklist

Any SDK or package published to an external registry must satisfy these minimum artifact checks before release is considered complete:

1. Every publishable package includes a package-level `README.md` that is present in the final published artifact.
2. Every publishable package includes the project license text or the registry-equivalent required license metadata in the final published artifact.
3. The release workflow validates staged artifacts before publish and then validates a clean install from the target registry after publish.
4. Registry-specific provenance/signing settings must match the actual hosting constraints. For npm releases from private GitHub repositories, do not enable GitHub provenance until the source repository is public or the registry/provider supports that private-source flow.

### Cross-Repo SDK Release Discipline

Every standalone SDK repository must adopt the same release-hardening pattern before it counts as release-ready:

1. Package-level documentation must be shipped inside the published artifact and must cover configuration source precedence, runtime support labels, install examples for every claimed setup mode, service naming guidance, safe startup/status semantics, and first-event verification.
2. Release workflows must validate the staged artifact before publish and rerun an application-driven clean-install smoke from the target registry after publish.
3. Any package family that is documented as version-aligned must publish as one coherent family and must avoid mixed-version public snippets.
4. New SDK plans in `spec/sdks/*.md` must describe their release workflow, clean-install smoke path, and publish-time compatibility matrix before implementation starts.

### V1 Release Train Order

The V1 release train must publish dependency roots before dependent wrappers. Do not publish a package that embeds, pins, wraps, or documents another DebugBundle package until that prerequisite version is visible from the target registry and its published-artifact smoke has passed.

1. Publish core-owned shared JS packages from `debugbundle/debugbundle`: `@debugbundle/shared-types` and `@debugbundle/redaction`.
2. Publish the JS SDK family from `debugbundle/debugbundle-js`: `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` at the same version, after the matching shared-package version is already on npm.
3. Publish independent backend SDKs and package families whose public artifacts do not bundle another DebugBundle SDK: Python, PHP, Java, Go, Ruby, Android, Swift, .NET, CLI, and MCP. Version-aligned package families must publish coherently as one family.
4. Publish React Native only after the Android Maven package family and Swift/CocoaPods package it delegates to are published and smoke-tested.
5. Publish WordPress only after the PHP SDK and browser SDK versions it requires are published and smoke-tested; rebuild the bundled browser asset from those exact published versions before assembling the plugin ZIP.
6. Bump internal dogfooding manifests only after their referenced registry versions exist, then run hosted/source-deploy validation.
7. Create the canonical core GitHub release after package-specific release workflows and registry smoke checks are green.

### Internal Dogfooding Version Touchpoints

Our own source-deployed surfaces intentionally dogfood the published JS packages instead of workspace-linking them implicitly. After a successful registry publish, bump these manifests in the same release-prep slice before hosted validation:

- Root `package.json`: `@debugbundle/shared-types`, `@debugbundle/redaction`, `@debugbundle/sdk-node`
- Hosted app `apps/web/package.json`: `@debugbundle/sdk-browser`
- Public site `site/package.json`: `@debugbundle/sdk-browser`

Do not bump those dogfooding manifests ahead of a registry publish. The hosted source deploy workflow installs from those manifests and should always resolve packages that already exist in the target registry.

### Private Repository (`debugbundle-cloud`)

Handles production deployment, container publishing to private registries, and infrastructure provisioning. See `/rules/architectural-constraints.md` section 6a.

---

## 3. Breaking Change Policy

### Production
- Breaking changes require a major version bump.
- Migration guide must be published: what changed, why, how to update.
- Deprecated features retained for at least one major version before removal.
- Breaking changes must be announced in CHANGELOG under `### Breaking`.

### Production Database Schema Evolution Policy

- Production database changes must use ordered forward migrations. Clean-schema bootstrap files are not a supported upgrade mechanism.
- Hosted and self-hosted deploy procedures must run migrations before new application code is started against the target database.
- Schema changes must follow expand/contract rollout discipline: additive migration first, compatible code next, optional backfill after that, destructive cleanup only in a later release.
- Any release that changes schema-dependent runtime behavior must include migration-path tests plus deploy/readiness validation that fails closed when required migrations are missing or invalid.
- Agent-authored release reviews must explicitly check for unsafe destructive-in-place changes, bootstrap-as-migration regressions, and deploy ordering mistakes.

---

## 4. Root README Structure

The root `README.md` must contain:

1. **Project name + tagline** — "DebugBundle — Production debugging bundles for AI agents"
2. **Badge row** — CI status, npm version, license, Discord/community link
3. **What is DebugBundle?** — 2-3 sentence description
4. **Key features** — Bundle creation, CLI/API/MCP access, agent-native, self-hostable
5. **Quick start** — Install SDK → init → verify (< 5 minutes)
6. **Documentation links** — Docs site, API reference, CLI reference
7. **Self-hosting** — Link to `deploy/docker-compose.yml` and self-host guide
8. **Contributing** — Link to CONTRIBUTING.md
9. **License** — AGPL-3.0-only with brief explanation

---

## 5. Example Applications

The repository should include example applications under `examples/`:

| Example | Framework | Description |
|---------|-----------|-------------|
| `examples/express-basic/` | Express | Minimal Express app with DebugBundle SDK |
| `examples/fastify-basic/` | Fastify | Minimal Fastify app with DebugBundle SDK |
| `examples/nextjs-basic/` | Next.js | Next.js app with server + browser SDK |

Each example must include:
- `README.md` with setup instructions
- Working `package.json`
- `.env.example` with required variables
- Demonstrates: SDK init, error capture, bundle retrieval via CLI

---

## 6. Test Coverage

- Enforced: **80% minimum per file** for statements, lines, functions, and branches on source files that remain in Vitest coverage scope.
- Measured with V8 coverage via Vitest.
- Coverage reports generated in CI and displayed via badge.
- Critical paths (ingestion, bundle generation, auth) must have **>90% coverage**.

---

## 7. Telemetry Policy

- DebugBundle SDKs do NOT collect anonymous usage data in V1.
- If telemetry is added post-V1, it must be opt-in only.
- Telemetry decisions must be documented in `PRIVACY.md`.
- Self-hosted instances never phone home.

---

## 8. Status Page

- Cloud service health should be exposed at `status.debugbundle.com`.
- Health check endpoints: `GET /healthz` (API), `GET /readyz` (Worker).
- Downtime notifications via status page and optional webhook.
