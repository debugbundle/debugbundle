# Browser resource incidents

Status: final audit and release authorized on 2026-09-16; release verification in progress.

## Objective and compatibility

Turn repeated browser resource failures into clearly named, resource-grouped incidents with scoped noise controls. Keep `bundle_version: 1` and existing context versions. Preserve raw error evidence, installed SDK payloads, unrelated fingerprints, incident IDs/history, lifecycle semantics, billing classes, and existing capture rules. No automatic suppression, historical merge, external diagnosis, or new service.

The approved UI uses the existing incident list/detail, Badge, Button, DialogFormContent, Alert and project capture-rule controls. Reuse semantic tokens, responsive layout and accessible dialog behavior. Rename the incident action to “Reduce noise”; explain context retention versus discarded future events, preview the complete matcher and retain loading/error/member-only/existing-rule states. Destructive rules require an explicit review of their exact scope.

## Execution checklist

- [x] Add failing resource identity, title, diagnosis, origin and scoped-suggestion regressions.
- [x] Implement one deterministic shared resource interpreter using sanitized existing browser evidence. Recognize exact GTM, Meta Pixel, Clarity and Google Identity resources; use type/filename/host for unknown targets. Origin relationship and dependency role remain separate; missing origin is unknown. Preserve the original error message.
- [x] Make suggestions resource-path/service/environment scoped. Recommend context-only or drop only for recognized optional-tracker candidates after an operator decision. Authentication, application and unknown resources have no automatic noise recommendation. Preserve existing explicitly configured rules.
- [x] Introduce a resource-only fingerprint revision with concrete host/path/type, excluding page route and generic error text. Preserve old hashes through explicit legacy normalization and server-derived aliases for installed exact-fingerprint rules. Keep all non-resource hashes unchanged and retain fallback grouping for insufficient evidence.
- [x] Carry resource titles/grouping through cloud workers, local processing and shared persistence paths. Preserve durable queued-job compatibility, event idempotency, regression/notification semantics and bounded bundle refresh.
- [x] Preserve sanitized route context beyond raw occurrence sampling with bounded summaries. Use an additive forward migration if required; test predecessor upgrade, ledger/readiness checks, clean bootstrap and deploy ordering. Never scan all raw objects to populate incident lists.
- [x] Add optional Bundle v1 resource evidence/route summaries, truthful possible-cause wording and consistent retrieval/UI presentation. Keep diagnostic confidence separate from resource importance. Maintain the read-only OpenAI projection boundary and update its fixtures/versioned release metadata if its shape changes.
- [x] Align compatible browser SDK rule-origin evaluation, public docs and generated schemas. Existing SDK installs remain accepted; SDK adoption and publishing are distinct from local implementation.
- [x] Run focused red/green checks, core lint/typecheck/unit/coverage, applicable storage/worker integration, browser/UI and schema/parity checks. Perform the pre-ship failure-mode review and reconcile contracts, overview and architecture map.

## Acceptance mapping

FR-ING-04/05: ingestion remains lightweight and server-authoritative. FR-PROC-02/03/07 and FR-GRP-01/07/08/09: versioned deterministic grouping, meaningful matched fields, retained routes and replay-safe counts. FR-GRP-10: retain severity defaults; context demotion is an explicit policy decision. FR-BND-01/03/07: compatible deterministic evidence with honest diagnosis. AC-EVT-08e/f/g: API/CLI/MCP/web suggestion parity, narrow rules and no incident/alert/dispatch from demoted events. INV-3/15/16: privacy, immutable billing class and server enforcement.

Synthetic acceptance corpus: four GTM route variants, five Meta Pixel route variants (seven occurrences), one Clarity resource, one Google Identity script, one application JavaScript asset and one logo. Thirteen old resource groups become six new groups with all fifteen occurrences retained. A separate signup promise rejection remains separate. Different services/environments, hosts, paths and asset versions never merge. Tests also cover credentials/query/fragment stripping, missing/relative/protocol-relative URLs, same-origin absolute URLs, unknown origins, spoofed provider hosts, old fingerprints, old bundles, duplicate/out-of-order events, and rule scope outside the originating service/environment.

## Rollout boundaries

Local implementation and validation first. The owner subsequently authorized final audit, commits, package publication and deployment. Do not apply rules to SayCheese, resolve customer incidents or rewrite historical artifacts. New grouping is forward-only; a separately reviewed historical reconciliation can follow. Grouping reduces incident/bundle churn, while demotion retains context and may remain billable on paid plans. SDK-side dropping/sampling reduces transmission; server-side dropping/sampling reduces accepted retention.

## Evidence and progress

- Initial core and JS SDK worktrees clean. Site has a pre-existing edit to `content/blog/structured-incident-bundles-for-ai-agent-debugging-context.mdx`; preserve it.
- Live read-only review on 2026-09-16: 14 active SayCheese incidents, including 13 resource rows representing six targets and 15 occurrences. Resource captures do not establish Pi-hole or another blocker.
- Implemented shared resource interpretation, exact scoped suggestions, resource-only v3 grouping with v1/v2 rule aliases, shared frontend severity, sampled route metadata, optional Bundle v1 context and existing-pattern UI.
- Synthetic local corpus: 15 resource occurrences become six groups; independent signup and traced backend exceptions remain separate. Replay is idempotent. Resource events no longer merge into local application incidents solely through trace correlation.
- Isolated database verification covers predecessor migration/readiness, clean bootstrap, replay, raw sampling, delayed arrivals, old jobs with missing routes, top-20 bounds, missing attribution and project isolation. Full integration: 90 passed initially; one unrelated reviewer-seeding timeout passed on focused retry.
- JS SDK lint/typecheck/coverage/build/packed checks pass: 342 tests in 34 files. Native Chromium through relay, normalization, deterministic Bundle and frozen OpenAI projection passes for all four browser error kinds. Public schemas regenerated; paired docs/site tests/build/typecheck pass.
- Final core lint and typecheck pass. Full core unit run passes all 3,346 tests in 385 files (72 shards). Merged coverage: 85.44% lines, 88.05% functions, 75.60% branches, 85.04% statements. The changed-source gate passes for all 36 assessed files, including seven files qualified by changed-line coverage. The first run reached the release-integrity gate, which correctly detected the modified worktree; local OpenAI candidate metadata was refreshed with no API image deployment claim. Plugin/tool wire versions and contracts are unchanged.
- Local validation logs are `/tmp/debugbundle-resource-unit-final.log`, `/tmp/debugbundle-resource-integration-all.log`, `/tmp/debugbundle-resource-integration-recheck.log`, `/tmp/debugbundle-resource-sdk-check.log`, `/tmp/debugbundle-resource-browser.log`, `/tmp/debugbundle-resource-site.log`, `/tmp/debugbundle-resource-lint-final.log` and `/tmp/debugbundle-resource-typecheck-final.log`. UI behavior is covered by DOM tests and component review; an authenticated dashboard visual walkthrough and production verification belong to release validation.

## Pre-ship review

- Ingestion remains validate/persist/enqueue. Legacy fingerprint aliases are server-derived only and computed when matching rules require them.
- No automatic suppression or severity reduction based on provider role. Demotion/drop scopes exclude other paths, services, environments and ordinary script exceptions. Client/server page-origin evaluation is aligned; already discarded client events cannot be recovered by server changes.
- Bundle diagnosis follows the primary signal; related resource evidence cannot replace an application exception or its frame. Unknown/missing evidence uses conservative fallback behavior. Route summaries are snapshots at ordinary bounded bundle refreshes, not live impact estimates.
- Final audit regressions bind suggestions to the primary resource/error instead of the last related exception. Route summaries and incident totals use one SQL statement snapshot, so concurrent arrivals cannot make the counts disagree.
- Route writes use existing incident/event idempotency and retention paths; the nullable additive migration preserves old jobs, rows and rollback compatibility. The existing hosted source/image rollout scripts run migrations before new runtime consumers. No destructive migration, raw object scan for incident lists, schema backfill or history rewrite was added.
- API/CLI/MCP use the same suggestion service. The web view uses existing card/table/dialog/checkbox components, wraps mobile actions, retains pending/error/existing-rule states and reports read-only access.
- No new service, provider lookup, automatic rule engine, historical reconciliation job or public endpoint was introduced. Changes include mandatory file splits at existing size limits. No commit, push, package publish, live rule change or deployment has occurred.
