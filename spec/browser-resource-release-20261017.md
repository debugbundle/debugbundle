# Browser resource controls release — 2026-10-17

Status: authorized release train in progress. Production and registry success are recorded only after independent verification.

The owner authorized commits, pushes, production deployment and listing publication on 2026-10-17 after the implementation audit. Scope is FR-EVT-07c / AC-GRP-RESOURCE, the 18-family provider catalog, explicit resource controls, compatibility fixes, generated/distributed guidance and public docs. No new SDK option, database migration, customer-policy mutation or hosted OpenAI catalog/submission change is required.

## Planned versions

| Surface | Version |
| --- | --- |
| Core | 1.17.0 |
| Shared types / redaction | 2.5.0 |
| CLI / MCP / OpenClaw | 1.16.0 |
| Codex developer plugin | 1.3.1 |
| Claude Code plugin | 1.16.0 |
| Gemini extension | 1.2.1 |
| Website | 1.6.6 |

The shared packages publish first. Consumer pins change only after registry artifact checks. CLI/MCP publish next; developer marketplace pins follow verified MCP publication. The local MCP ecosystem pipeline updates the official Registry, Smithery MCP/skill and ClawHub skill/OpenClaw package. Core/site deployment uses reviewed immutable source commits and the private cloud rollout, retaining the verified previous release.

## Qualification and baseline

The final audit passed 4,257 unit/regression tests, 187 focused tests, all ten changed-source coverage gates, 15 isolated ingestion/resource integration tests, full lint/typecheck, candidate builds, 41 site tests/build/typecheck, and packaged CLI install/upgrade checks on Node 22/24/26. See [implementation evidence](browser-resource-incidents.md#local-verification).

Core baseline `e7400c49` and site baseline `2f61696` matched origin/main before preparation; cloud and standalone Gemini working trees were clean. npm latest was shared 2.4.0 and CLI/MCP 1.15.0. Proposed package versions were absent from the registry. Current core is 1.16.1 and site is 1.6.5. SDK versions and the frozen hosted OpenAI/restricted catalogs stay unchanged.

## Publication and rollout evidence

- Shared types/redaction 2.5.0 published from `a04f54e0` by [run 39031356123](https://github.com/debugbundle/debugbundle/actions/runs/39031356123). Both registry tarballs passed identity, integrity, license and compatibility checks; the shared artifact includes the provider catalog and service-scoped fallback. Consumer adoption passed 113 tests in six files and changes only the two intended dependency resolutions.
- Production baseline: API/worker 1.16.1 healthy, worker processing enabled, 58 migrations applied, 12,034 completed jobs and no other job states. Four existing scoped operational incidents were recorded before rollout for comparison.
- CLI/MCP 1.16.0 registry artifacts independently verified from `80b41e4e`. SHA-256: CLI `7f011aad6f3c0a0068402fdf135f713257d97d55c659a7c72396d5ddafa04253`; MCP `e01f823a02a3c245a1f44676b30db4fa4f24100fd535a91f71af4f87b7f314ac`. Existing public-status interfaces and new resource-control markers are present.
- Fresh website validation passes 41 tests, production build and typecheck; all 36 cloud deployment/site safeguards pass.
- Developer package publication, ecosystem listings and production rollout are pending.
