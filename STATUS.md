# Current handoff — public project flows, 2026-10-04

Final audit: [findings, cross-layer proof and release boundary](spec/analytics-public-flows-audit-20261004.md).

## Scope and owner decisions

Work on `update/visit-flows` in core, `site`, and `sdks/debugbundle-js`. The expanded
`update/analytics` branch and checklist remain parked. Follow AGENTS.md's read order,
then [the public contract](spec/analytics-public-flows-20261003.md),
[focused plan](spec/analytics-visit-flows-plan-20261002.md), and
[preservation manifest](spec/analytics-preservation-20261002.md).

The owner requires a public customer feature: project-defined acquisition and activation
flows for site→blog, site→dedicated auth→successful login→app, and explicit custom steps.
DebugBundle is an ordinary consumer. The earlier local operator-only implementation was
incorrect and has been replaced directly, without compatibility shims or migrations for
that unreleased iteration. Existing published contracts/data still require compatibility.

Design approval is already given. No public consent UI or marketing copy changes. Use
Docker-backed Make targets and disposable services; no browser/screenshots. Million-visit
load testing is explicitly deferred. No commit, push, publish, deploy or production change
was authorized during the local audit. On 2026-10-05 the owner explicitly approved committing, pushing, tagging, publishing and deploying this release train. Browser and Node SDK 3.1.0 are published; core/site/cloud release work is in progress. Previous internal-candidate test counts are obsolete.

## Current implementation

- Shared public definition/capture/report schemas; project-owned 2–8 step definitions,
  exact origins, versions and archive. API reads use ordinary project access; owner/admin
  manages. Project tokens remain write-only.
- Generic storage service: random hashed expiring contexts, single-use origin-bound
  handoffs, ordered idempotent steps, explicit unlinked observations and daily aggregate
  counters. No customer conversion joins to DebugBundle users/incidents/business records.
- Public Browser SDK `createAnalyticsFlowClient`: headless programmatic controls,
  tab-scoped sessionStorage continuity, same-tab external OAuth return, fragment scrubbing,
  bounded direct transport and nonthrowing results. Existing debug capture remains separate.
- Existing Analytics Flows tab now lists/configures customer definitions and reports current
  version reached/drop-off/previous/unlinked/time/source counts. API/CLI/ordinary MCP and
  OpenClaw expose the same definitions and aggregate reports.
- Additive migration `202610030001_add_public_analytics_flows`, readiness-required tables,
  bounded expiration/aggregate retention and cascaded project deletion. Existing durable
  retention continuation remains. The discarded local internal-only migration is removed.
- Internal signup fields/cookies, operator pair settings, auth hooks and bundle receipt
  hooks are removed. Marketing CTA code is back to its original form. Auth creation-race
  correctness fixes and ordinary analytics withdrawal fixes are retained independently.
- General public documentation describes customer examples and SDK/HTTP mechanics.
  Authentication docs describe authenticating to DebugBundle, not customer analytics.

## Local verification complete — 2026-10-04

The generic local candidate is implemented and verified. All commands below used
Docker-backed Make targets; no browser or production checks were performed.

- Core lint/typecheck pass, followed by final focused lint, typecheck and candidate build
  after the last source changes. Shared types, CLI, MCP and web artifacts build.
- Broad affected-module regression run: 2,996 passing tests and one stale generated
  OpenClaw manifest failure. The manifest and mutation classification were corrected;
  the subsequent API/OpenClaw/parity run passes all 11 tests across three files.
- Full configured integration suite: 134 tests across 29 files pass, including existing
  ingestion, analytics, worker durability, retention, deletion and populated-schema upgrades.
  Final public-flow fixture rerun: all four tests pass, including added concurrent Free
  plan admission and rejection of an app handoff before the login-completed step.
- Browser/Node SDK full check: 515 tests across 44 files, coverage gates, lint, typecheck,
  builds and installed-package delivery/privacy/export smoke checks pass. The public
  flow client has bounded queues, timeouts and a 4 KiB response limit.
- Site: 38 tests and typecheck pass; final documentation/static build passes.
- OpenClaw package build, generated metadata parity and plugin validation pass.
- Whitespace checks pass in all three repositories. Public marketing/pricing and signup
  UI changes are absent. No legacy support was added for the discarded local iteration.

Pre-ship review covered project/token/origin authorization, hashed contexts and constant-time
hash checks, replay/order/concurrency, quota claims, bounded response/queue/storage lifetimes,
aggregate-only reporting, withdrawal, definition versioning, archive, retention and deletion.
The real forward migration and readiness checks are covered; existing hosted rollout scripts
run migrations before candidate API/worker startup. No hosted script or production state was
changed. Reports explicitly distinguish unlinked observations and unknown attribution.

Evidence logs for this session are under `/tmp/public-flows-*` and `/tmp/public-flow-*`.
The corrected public contract records acceptance and known integration boundaries.

### Final audit follow-up

The owner requested another production-readiness audit after the generic implementation.
Two reproduced SDK/capture defects were corrected: attribution now rejects unknown/accessor
fields and recognized sensitive values before transport/storage, and malformed JavaScript
factory initialization returns an inactive client instead of throwing. Public APIs are unchanged.
The internal settings description now says optional browser analytics; it no longer promises
signup attribution before DebugBundle's public-client integration is adopted.

Final Docker evidence superseding the earlier focused/SDK counts above:

- Broad full-core discovery run: 3,747 tests passed; the newly added attribution regression
  caught the pre-fix implementation, and the committed release-manifest check failed against
  this dirty tree. The attribution regression is fixed and passes in the final targeted run.
- Combined changed-module coverage run: **296 tests passed**, six real-DB cases skipped in
  the unit environment, **all 38 changed source files pass the existing coverage gate**.
  Storage service/report and flow form line/function coverage are 100%. Existing thresholds
  are unchanged; 11 existing files qualify through complete changed-line coverage.
- Final composed SDK/API/database, flow and migration run: **23 tests passed**, including
  the optional built Browser SDK consumer. Actual token records/settings/quotas are exercised;
  start/arrival retries meter three events and one session for start → handoff → arrival.
- Final SDK full gate: **517 tests across 44 files**, coverage, lint/typecheck, Node/Browser
  builds and installed-package smoke checks pass.
- Final audit source lint/typecheck, core candidate build and site tests/typecheck/build pass.
  All three repositories pass whitespace checks; no changed source file reaches 1,000 lines.
- Exact remaining release verifier result: `release_manifest_drift`,
  `submission_packet_drift`, `release_checksums_drift`. No recorded release artifact was
  regenerated to claim an uncommitted candidate. This remains release preparation work.

All source/test audit findings are addressed. No further implementation blocker was found
within this focused scope. This is a verified local release candidate, not deployed production
verification or a full merged-core coverage claim. Audit logs: `/tmp/visit-flows-audit-*`.

## Release boundary

App/site still pin Browser SDK 3.0.3, which lacks the new public flow helper and local
withdrawal correction. An authorized release must publish/adopt the Browser SDK, coordinate
changed shared types/CLI/MCP/OpenClaw packages and MCP ecosystem metadata, run clean-tree
release checks, then configure/deploy core and frontend consumers. Backend SDK flow helpers
are outside scope; HTTP integrations are supported. DebugBundle's own cross-origin consumer
must use this public API after SDK adoption; its previous private wrappers were removed.
Existing default-off page-analytics auto-start flags/internal off switch remain, with stored
opt-out precedence. No production configuration changed.

The earlier full-core release-manifest gate requires a committed clean tree; no manifest
was rewritten to claim this dirty tree. No current full merged-coverage or release claim.
