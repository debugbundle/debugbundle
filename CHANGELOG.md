# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning once production is reached.

## [Unreleased]

## [0.1.0] - 2026-05-07

### Added

- Initial public core repository baseline for `debugbundle/debugbundle`, including the API, worker, CLI, MCP server, web app, self-host tooling, and public-site artifact generation pipeline.
- Stable public release workflows for `@debugbundle/cli`, `@debugbundle/mcp`, and the core-owned shared JavaScript packages, plus the dedicated public-repo export manifest and SDK bootstrap metadata.

### Changed

- Moved JavaScript, Python, and PHP SDK source ownership to dedicated public repositories managed through `sdks.json` and `scripts/bootstrap-sdks.sh` instead of tracked source snapshots in the core repo.
- Moved public-site machine-readable artifact generation into the core-owned `scripts/public-site-artifacts.ts` pipeline so the standalone site repo consumes vendored static artifacts rather than importing core packages.

### Fixed

- Hardened the public core CI/export contract after repository cutover by repairing runtime-start storage fixtures, web-management timing drift, constructor-compatible SES mocks, and the changed-file coverage script's Docker git assumption.
