# Browser resource controls release — 2026-10-17

Status: core 1.17.0 and site 1.6.6 are released and independently verified in production. All first-party package publications are publicly verified; search ranking and some third-party discovery checks remain qualified below.

The owner authorized commits, pushes, production deployment and listing publication on 2026-10-17 after the implementation audit. Scope is FR-EVT-07c / AC-GRP-RESOURCE, the 18-family provider catalog, explicit resource controls, compatibility fixes, generated/distributed guidance and public docs. No new SDK option, database migration, customer-policy mutation or hosted OpenAI catalog/submission change is required.

## Released versions

| Surface                  | Version |
| ------------------------ | ------- |
| Core                     | 1.17.0  |
| Shared types / redaction | 2.5.0   |
| CLI / MCP / OpenClaw     | 1.16.0  |
| Codex developer plugin   | 1.3.1   |
| Claude Code plugin       | 1.16.0  |
| Gemini extension         | 1.2.1   |
| Website                  | 1.6.6   |

The shared packages publish first. Consumer pins change only after registry artifact checks. CLI/MCP publish next; developer marketplace pins follow verified MCP publication. The local MCP ecosystem pipeline updates the official Registry, Smithery MCP/skill and ClawHub skill/OpenClaw package. Core/site deployment uses reviewed immutable source commits and the private cloud rollout, retaining the verified previous release.

## Qualification and baseline

The final audit passed 4,257 unit/regression tests, 187 focused tests, all ten changed-source coverage gates, 15 isolated ingestion/resource integration tests, full lint/typecheck, candidate builds, 41 site tests/build/typecheck, and packaged CLI install/upgrade checks on Node 22/24/26. See [implementation evidence](browser-resource-incidents.md#local-verification).

Core baseline `e7400c49` and site baseline `2f61696` matched origin/main before preparation; cloud and standalone Gemini working trees were clean. npm latest was shared 2.4.0 and CLI/MCP 1.15.0. Proposed package versions were absent from the registry. At preparation, core was 1.16.1 and site was 1.6.5. SDK versions and the frozen hosted OpenAI/restricted catalogs stay unchanged.

## Publication and rollout evidence

- Shared types/redaction 2.5.0 published from `a04f54e0` by [run 39031356123](https://github.com/debugbundle/debugbundle/actions/runs/39031356123). Both registry tarballs passed identity, integrity, license and compatibility checks; the shared artifact includes the provider catalog and service-scoped fallback. Consumer adoption passed 113 tests in six files and changes only the two intended dependency resolutions.
- Production baseline: API/worker 1.16.1 healthy, worker processing enabled, 58 migrations applied, 12,034 completed jobs and no other job states. Four existing scoped operational incidents were recorded before rollout for comparison.
- CLI/MCP 1.16.0 registry artifacts independently verified from `80b41e4e`. SHA-256: CLI `7f011aad6f3c0a0068402fdf135f713257d97d55c659a7c72396d5ddafa04253`; MCP `e01f823a02a3c245a1f44676b30db4fa4f24100fd535a91f71af4f87b7f314ac`. Existing public-status interfaces and new resource-control markers are present.
- Fresh website validation passes 41 tests, production build and typecheck; all 36 cloud deployment/site safeguards pass.
- [CLI workflow 39031958881](https://github.com/debugbundle/debugbundle/actions/runs/39031958881) and [MCP workflow 39031960839](https://github.com/debugbundle/debugbundle/actions/runs/39031960839) pass candidate and registry-installed runtime/native gates.
- Developer package contracts pass 190 tests in 45 files plus 82 Gemini/setup tests in eight files. Native public Git installation, all 134 tools, local evidence, credential boundaries, update/reinstall and removal pass for Codex 0.153.1, Claude Code 2.1.277 and Gemini CLI 0.61.0.
- Gemini standalone source `ef26fcbd79916d06973461c820fc7a3a4ae0f7e8`, tag/release `v1.2.1`, matches the five core-owned files. The downloaded release ZIP matches SHA-256 `338f917f7ef39e39e6c2a792859102a4a11330ef75dd0033d90bf3cd17c7eea4`. The required gallery topic is present; gallery indexing is not asserted.

## Production rollout and readback

- [Exact-source CI 39032339542](https://github.com/debugbundle/debugbundle/actions/runs/39032339542) passes audit, lint, typecheck, full unit/coverage/build and native Gemini Node 22/24/26 checks. All ten changed-source coverage gates pass. The separate [CLI compatibility workflow](https://github.com/debugbundle/debugbundle/actions/runs/39032339510) passes.
- [Core release workflow 39032534755](https://github.com/debugbundle/debugbundle/actions/runs/39032534755) publishes [v1.17.0](https://github.com/debugbundle/debugbundle/releases/tag/v1.17.0) at `47ae20ec64e0847d372ff3d0fcc419d5303aac43`. [Site v1.6.6](https://github.com/debugbundle/site/releases/tag/v1.6.6) is at `5672f9d073cc5c5b1c39a12b7635d727b7ff877c`.
- [Hosted rollout 39033810796](https://github.com/debugbundle/debugbundle-cloud/actions/runs/39033810796) succeeds from trusted cloud `b2508b1671c16a0d0ade55e682c082c48cbb827a`, deploying those exact product/site commits with the existing MCP route preserved.
- Independent SSH readback confirms API and worker 1.17.0 at the product commit above, immutable image digest `sha256:7f44f85f40d11085e7d0c58e7fdf0b2ffb305bd989f16854ce574cb951690464`, healthy/running with zero restarts or OOMs. Worker readiness reports processing enabled and protocol `postgres-v1`. The read-only database check finds 58 migrations and only completed durable jobs.
- Active release is `20261017125033-c494777251f4`. The verified previous stable release `20261010182852-9b51cce83a47` and both previous API/worker images at digest `sha256:3873f6afab8f9123dd7f48a8913e2f64b2e28bcb35f335a933dc7e94786440bf` remain available. The repo-owned retention dry run reports no candidate release directories or image references; disk has 45 GiB free.
- Thirteen independent public HTTP checks pass: API/MCP readiness, exact dashboard revision and served resource-control code, current generated references and provider/agent guides, API unauthenticated rejection, MCP POST-only semantics, and missing-doc 404 behavior. The temporary verifier initially expected GET `/mcp` to return 401; existing source/contracts correctly require 405 with `Allow: POST`, and the verifier was corrected without a product change.
- Installed CLI 1.10.0 successfully reads the live suggestion route for an already verified incident and the exact project's capture-rule inventory. This confirms older CLI/API compatibility without changing any rule. Real resource capture enforcement is covered by the isolated integration evidence; no customer rule or live synthetic incident was created.
- The monitored project's four pre-existing incidents are byte-for-byte unchanged after rollout, with no new active incidents; its endpoint health check is passing with zero consecutive failures. All 80 independent API/MCP readiness samples pass from rollout through 12:56:58 UTC, with no observed availability interruption.

## Listings and remaining external limits

The repo-owned ecosystem pipeline prepares from published MCP 1.16.0, passes stdio smoke, and records accepted writes for the official MCP Registry, Smithery MCP, Smithery Skills, ClawHub skill and OpenClaw package. The expired official Registry session was renewed with the existing operator-managed DNS key; no key material enters the release record.

- MCP Registry exposes 1.16.0. Smithery MCP exposes 1.16.0 and is indexed; its shared skill points to the published core `main` source and is indexed.
- OpenClaw 1.16.0 is publicly visible. All six public package file hashes match the validated local package, including the compiled implementation and plugin manifest.
- ClawHub accepted skill 1.16.0 (receipt `k9759qwhxjz03h2nkndhw0axrs8ge0k2`). Its non-publishing content resolver returns `unchanged`, version/latest 1.16.0, and exact two-file fingerprint `1805effea2790401f799c96488492e6c3455b3c356bdd0163ecfd9d59d9d937c`. Initial public reads lagged at 1.14.0; final public inspection reports 1.16.0 with a clean moderation verdict, and the retrieved 1.16.0 SKILL.md matches source. No duplicate upload or version bump was attempted.
- The maintained ClawHub discovery check remains partial: five of seven capability queries meet the top-ten target. The combined error-reporting query remains outside the top 25 and incident response ranks 17. This discovery limitation is not relaxed or reported as a passing gate.
- mcp.so is found. Glama's public page exists, but its search API rejects unauthenticated verification (401); exact current-release indexing is unverified. PulseMCP returns 403 to automated checks; LobeHub and Gemini gallery visibility remain unverified. No directory approval or indexing is inferred from repository publication.

Local operator evidence is retained under `/tmp/debugbundle-noise-release-*.log`, `*.json` and `.tmp/mcp-ecosystem/1.16.0/report.json`. Runtime source remains the exact CI-qualified release commit; documentation/source-provenance follow-ups do not change deployed code or public tool catalogs.
