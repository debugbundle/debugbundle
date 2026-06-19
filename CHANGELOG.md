# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning once production is reached.

## [Unreleased]

## [1.5.3] - 2026-06-19

### Changed

- Exposed linked availability-incident status through the shared health-check response contract so CLI, API, and web clients can distinguish active incidents from resolved ones without breaking existing consumers.
- Updated availability health surfaces to stop treating resolved linked incidents as active, so project health badges and aggregate status counts clear correctly after incident resolution.
- Promoted the hosted dogfooding manifests to `@debugbundle/shared-types@1.3.1`, `@debugbundle/redaction@1.3.1`, `@debugbundle/sdk-node@1.3.1`, and `@debugbundle/sdk-browser@1.3.1` after the coordinated shared and JS SDK release train completed.
- Published the coordinated server-SDK patch line at `debugbundle-python@1.1.2`, `debugbundle/sdk-php@1.1.2`, `debugbundle@1.1.2`, `github.com/debugbundle/debugbundle-go@v1.1.1`, the `com.debugbundle` Java SDK family at `1.1.1`, and the NuGet `DebugBundle.*` package family at `1.1.1`, followed by `debugbundle-wordpress@1.2.3`.

### Fixed

- Normalized hosted ingestion and event normalization to tolerate installed SDK envelope drift while the patched SDK releases move custom app context into envelope `context`, remove legacy request payload extras, and preserve redaction on the canonical event path.

## [1.5.0] - 2026-06-15

### Added

- Added hosted availability checks across API, CLI, MCP, worker scheduling/execution, web project health views, storage, and public contracts, including side-effect-free target tests, retained recent results, and retained daily rollups.

### Changed

- Added the production schema migration, startup migration assertions, tier-capability limits, and SSRF/outbound-request hardening required for the new availability-check path.
- Bumped the canonical core release to `1.5.0`, `@debugbundle/cli` to `1.5.0`, `@debugbundle/mcp` to `1.5.0`, and `@debugbundle/shared-types` plus `@debugbundle/redaction` to `1.3.0` for the coordinated availability-check release train.

## [1.4.0] - 2026-06-11

### Added

- Added incident `first_seen_after` filtering across the hosted retrieval API, CLI retrieval commands, MCP retrieval tools, and the shared retrieval client so automation can scope incident queries to recent windows more precisely.
- Added project incident dashboard metrics for open incidents, regressed incidents, incidents opened today, and incidents opened this month, including the new dashboard incidents-today table and project-listing metric fields.

### Changed

- Updated the hosted web dashboard and project overview surfaces to prioritize current incident health over bundle-volume counters, while preserving the existing project metrics payload as an additive-compatible contract.
- Bumped the canonical core release to `1.4.0`, `@debugbundle/cli` to `1.4.0`, and `@debugbundle/mcp` to `1.4.0` for the coordinated incident-visibility and retrieval-filter release train.

## [1.3.0] - 2026-06-09

### Added

- Added browser-noise capture-rule support for opaque browser events and user-agent-derived bot signals, including richer incident context guidance for repeated low-value frontend noise.
- Added generated skill guidance for capture-rule suggestions and path-scoped client-error capture-policy review so agent workflows can suppress recurring operational noise more safely.

### Changed

- Expanded the browser SDK contract documentation around `beforeSend`, opaque browser failures, and bounded unhandled-rejection reason capture so the release train documents the new JS SDK behavior end to end.
- Bumped `@debugbundle/shared-types` and `@debugbundle/redaction` to `1.2.0`, and `@debugbundle/cli` and `@debugbundle/mcp` to `1.3.0` for the coordinated browser-noise and agent-workflow release train.

## [1.2.0] - 2026-06-08

### Added

- Added explicit client-error incident promotion controls across capture policy, including path-scoped `immediate_client_error_path_rules` for real application routes that should open incidents on selected `4xx` responses without promoting the status globally.

### Changed

- Prevented unpromoted client-error request telemetry from opening normal incidents through hosted ingestion, worker anomaly thresholds, or local `debugbundle process`, while preserving `5xx` handling and explicitly promoted `4xx` behavior.
- Bumped `@debugbundle/shared-types` and `@debugbundle/redaction` to `1.1.0`, `@debugbundle/cli` to `1.2.0`, and `@debugbundle/mcp` to `1.2.0` for the synchronized capture-policy and client-error release train.

## [1.1.1] - 2026-06-06

### Added

- Added hosted bulk incident lifecycle routes for resolve and reopen so one request can update up to 1000 cloud incident ids at once while preserving request order and duplicate-id deduplication.

### Changed

- Updated the web incident inventory, project overview incident actions, CLI retrieval commands, MCP retrieval tools, shared retrieval client, and public reference artifacts so bulk incident resolve/reopen is documented and available across the supported automation surfaces.

## [1.1.0] - 2026-06-04

### Added

- Added no-card 30-day Solo and Team trial onboarding across signup, billing, CLI, MCP, worker lifecycle scheduling, operational email delivery, and public documentation.
- Added trial state visibility to billing interfaces, including remaining-trial-day messaging in the hosted billing UI and normalized trial metadata in the API, CLI, and MCP surfaces.

### Changed

- Strengthened the production migration path for no-card trials with ordered forward migrations, clean-install bootstrap parity, API/worker readiness guards, and self-host deploy guidance that requires migrations before runtime startup.
- Split oversized API, CLI, web, and storage modules as part of the trial slice so the new billing and signup behavior ships without violating repo file-size limits.
- Bumped `@debugbundle/cli` to `1.1.0` and `@debugbundle/mcp` to `1.1.0` for the new trial-management commands, trial-aware billing output, and MCP billing tool additions.

## [1.0.1] - 2026-06-03

### Added

- Alert rules now support notification cooldown suppression across API, CLI, MCP, and the web app without changing incident grouping, including broader notification keys for low-information opaque browser-native `window_error` alerts.
- Browser bundle assembly now consumes inline exception breadcrumbs and preserves additional browser-native opaque error metadata for better failure context.

### Changed

- Worker severity inference now treats opaque browser-native `window_error` captures as `low` and opaque `resource_error` captures as `medium`, while preserving `high` for backend exceptions, non-opaque frontend exceptions, and immediate request-failure incident signals.
- Promoted the core monorepo and hosted web app dogfooding manifests to `@debugbundle/shared-types@1.0.1`, `@debugbundle/redaction@1.0.1`, `@debugbundle/sdk-node@1.0.1`, and `@debugbundle/sdk-browser@1.0.1`.
- Bumped `@debugbundle/cli` to `1.0.3` and `@debugbundle/mcp` to `1.0.2` for the alert cooldown, severity, and MCP registry metadata sync changes in this release train.

## [0.1.3] - 2026-05-22

### Added

- Canonical root-repository GitHub Releases on `v*` tags so the core monorepo now has a public product-level release surface alongside the package-specific CLI, MCP, and shared-package releases.

### Changed

- Defined the root `debugbundle` repository version as the canonical public DebugBundle product release number, while keeping `cli-v*`, `mcp-v*`, and `shared-js-v*` as package-specific distribution tags.

### Security

- Hardened OAuth state validation by switching the GitHub install and web-session callback comparisons to constant-time checks.
- Hardened browser trace propagation matching by dropping caller-provided regular expressions from the allowlist path and allowing string-only matching.

## [0.1.2] - 2026-05-13

### Added

- Interactive CLI auth selection when `debugbundle login` runs without an explicit auth mode, including GitHub auto mode, explicit GitHub device flow, and existing member-token entry.
- Connect-time auth recovery so `debugbundle connect` can prompt for login first when local member auth is missing, then resume automatically after authentication succeeds.

### Changed

- Updated CLI guidance, source-of-truth specs, and public auth/cloud workflow docs to document the new interactive login and connect recovery behavior.

### Fixed

- Cleared remaining repo-wide typecheck and lint blockers in the API, web, worker, and auth test harnesses so the release path is green again.

## [0.1.1] - 2026-05-11

### Changed

- Promoted `request_event` payloads with `response_status >= 500` to incident signals across ingestion, normalization, worker grouping, SDK capture policy, and public contracts.
- Updated the canonical minimal/balanced capture-policy defaults so 5xx request failures are captured by default while non-5xx request events remain context-only unless policy is widened.

### Fixed

- Prevented non-incident signals that reach the worker grouping queue from creating or updating incidents.

## [0.1.0] - 2026-05-07

### Added

- Initial public core repository baseline for `debugbundle/debugbundle`, including the API, worker, CLI, MCP server, web app, self-host tooling, and public-site artifact generation pipeline.
- Stable public release workflows for `@debugbundle/cli`, `@debugbundle/mcp`, and the core-owned shared JavaScript packages, plus the dedicated public-repo export manifest and SDK bootstrap metadata.

### Changed

- Moved JavaScript, Python, and PHP SDK source ownership to dedicated public repositories managed through `sdks.json` and `scripts/bootstrap-sdks.sh` instead of tracked source snapshots in the core repo.
- Moved public-site machine-readable artifact generation into the core-owned `scripts/public-site-artifacts.ts` pipeline so the standalone site repo consumes vendored static artifacts rather than importing core packages.

### Fixed

- Hardened the public core CI/export contract after repository cutover by repairing runtime-start storage fixtures, web-management timing drift, constructor-compatible SES mocks, and the changed-file coverage script's Docker git assumption.
