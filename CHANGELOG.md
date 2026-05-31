# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning once production is reached.

## [Unreleased]

### Added

- Prepared `@debugbundle/mcp` for public MCP Registry and ClawHub distribution with `mcpName` ownership metadata, `server.json`, env-token auth support, and a portable ClawHub skill.

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
