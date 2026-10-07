# Dashboard patch release — 2026-10-07

## Published sources and versions

- [Core 1.14.1](https://github.com/debugbundle/debugbundle/releases/tag/v1.14.1), source `f3d2dfd7cea9a1991c1661c73a86a02badf73f75`.
- Shared types/redaction 2.2.1 and CLI/MCP/OpenClaw 1.13.1. Published shared packages are adopted by the hosted dogfooding entrypoint.
- Site 1.6.1, source `083db39336bbf48d677eb7076f13a7d9a2ac7ca2`. The live generated reference reports core 1.14.1.
- SDK packages remain 3.1.0; SDK source is unchanged. Independent developer plugin pins and the hosted OpenAI version/catalog are unchanged after compatibility review.

The release covers incident-title bounds, Slack context/rows, browser-only failed
delivery clearing, card spacing, reusable accessible controls, page totals,
analytics action placement, measured 30-day health history and the populated local
preview. Requirements and acceptance are recorded in FR-WEB-09/10 and AC-WEB-09/10
and the relevant incident, alert and availability-check contracts.

Existing interfaces and persisted data remain compatible. Analytics totals are
opt-in to retain installed strict readers. The API was promoted before updated web
assets. No database schema change or new migration is part of this patch.

## Engineering and publication gates

| Gate                                                                                          | Verified result                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local full unit/coverage                                                                      | 3,915 tests, 461 files; all 59 changed-source coverage gates pass; merged line coverage 86.09%                                                              |
| [Exact-source main CI](https://github.com/debugbundle/debugbundle/actions/runs/37549220063)   | Lint, types, audit, build and all native Gemini jobs pass; 3,901 unit tests pass, 14 private-site checks skip because the private checkout is absent        |
| Private-site checks                                                                           | All 14 skipped public-CI cases pass locally; site CI/release also pass                                                                                      |
| Integration                                                                                   | 141 tests in 31 files, including the published Browser SDK composition path; no skipped cases                                                               |
| [Installed CLI matrix](https://github.com/debugbundle/debugbundle/actions/runs/37549220125)   | Node 22, 24, 26.0, 26.2 and latest 26, including upgrade checks, pass                                                                                       |
| [Shared package release](https://github.com/debugbundle/debugbundle/actions/runs/37547448294) | Published 2.2.1 packages and clean registry installs pass                                                                                                   |
| [CLI release](https://github.com/debugbundle/debugbundle/actions/runs/37547784806)            | Publish and installed-package verification pass                                                                                                             |
| [MCP release](https://github.com/debugbundle/debugbundle/actions/runs/37547784908)            | Publish, stdio and native Node 22/24/26 checks pass; 127-tool discovery and authentication boundaries pass                                                  |
| [Core publication](https://github.com/debugbundle/debugbundle/actions/runs/37550500759)       | All release gates pass; canonical tag resolves to the qualified source                                                                                      |
| Browser review                                                                                | 72 ordinary-HTTP desktop/phone views; no failed API responses, exceptions, stuck loading or page overflow; management actions and icon/contrast checks pass |
| Mock isolation                                                                                | Production build excludes synthetic fixture markers; mock actions remain in memory without provider requests or billing writes                              |

One native MCP attempt completed functional checks but failed at disposable Git
cleanup with `ENOTEMPTY`. Its retry passed. Bounded cleanup retries are committed
and verified locally; persistent cleanup failures still fail the harness.

Dependency updates remove high/critical findings and add the core high-severity
audit gate. Core retains 28 moderate and five low advisories below that threshold;
site audit reports no known vulnerabilities. These are distinct from a zero-finding
claim for every dependency.

## Hosted verification

- The hosted deployment workflow succeeds. API and worker report 1.14.1, the qualified OCI source revision and immutable digest `sha256:8e5f7af42d539b977f2ffde1723317241d44b95c5a81cc2c2267ec8f713c334f`; both are healthy with zero restarts.
- Public API/MCP readiness returns 200. The app's plain `version.json` reports the exact released SHA; site reference data reports core 1.14.1. OAuth issuer and unauthenticated MCP 401 resource-metadata challenge remain correct.
- The own-project endpoint monitor passes with zero consecutive failures. Local active incidents remain empty; cloud scoped incident data matches the baseline exactly, including one pre-existing OAuth incident. It was not resolved by this unrelated patch.
- Published CLI 1.13.1 and installed CLI 1.13.0 return identical scoped live incident data. The local doctor's only warning remains its older profile validation timestamp, with no errors.
- Retention keeps the active release and verified previous release, including immutable API/worker images. A dry run has zero deletion candidates; 45 GiB remains free.
- Fresh mock fixtures are available at `http://localhost:5291/dashboard`; `make dev-mock` resets simulated edits.

## MCP ecosystem and remaining limits

All five pushes are accepted: official Registry, Smithery MCP, Smithery Skills,
ClawHub skill and OpenClaw package. Registry 1.13.1, indexed Smithery records and
OpenClaw latest 1.13.1 are verified. Skill security passes and OpenClaw moderation
is clean/unblocked; downloaded files match committed source/builds and registry
digests. Initial stale versions and a transient scan status cleared during bounded
verification; immutable published versions were not overwritten.

ClawHub discovery remains partial: five of seven queries meet the configured top-10
target, the combined capability query is absent and incident-response ranks 17.
Glama returns 401; PulseMCP blocks automated reads and LobeHub requires manual
verification. MCP.so is found. These external indexing limitations remain visible;
the strict verification result is not reported as green or weakened.

No OpenAI portal submission or live Slack/webhook delivery test occurred. Local
OpenAI source/image provenance is refreshed independently of its frozen catalog.
Documentation/provenance follow-up commits do not replace the deployed source SHA.
