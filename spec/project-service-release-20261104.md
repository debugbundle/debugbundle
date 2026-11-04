# Project/service consolidation release train — 4 November 2026

The owner authorised the production release and complete DebugBundle release
train on 4 November. Live consolidation of existing DebugBundle projects remains
a later task. Consumer products are outside this release.

The audited source passed 5,131 tests across 110 shards, including 103 real
Postgres cases; 180 general integration cases passed with one existing optional
skip. Static, coverage, retained-client and sealed migration/rollback rehearsals
passed. See [qualification](project-service-qualification.md) for exact receipts.

## Distribution inventory

| Surface                              | Candidate/current version   | Release disposition                                          | Current result                                                                         |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Core API/worker and app              | 1.21.0                      | New minor release; forward migrations before runtime         | Preparing                                                                              |
| Shared types                         | 3.1.0                       | Publish additive schemas first                               | Preparing                                                                              |
| Redaction                            | 2.7.0                       | Unchanged; verify published artifact                         | Pending verification                                                                   |
| CLI                                  | 1.19.0                      | Publish and verify clean installed commands                  | Preparing                                                                              |
| MCP                                  | 1.19.0                      | Publish; exact Registry entry and installed native clients   | Preparing                                                                              |
| OpenClaw plugin / portable skill     | 1.19.0                      | Publish both; require exact security and runtime acceptance  | Preparing                                                                              |
| Codex developer plugin               | 1.5.0                       | Promote marketplace only after MCP publication               | Preparing                                                                              |
| Claude Code developer plugin         | 1.19.0                      | Promote marketplace only after MCP publication               | Preparing                                                                              |
| Gemini CLI extension                 | 1.4.0                       | Standalone repository, tag, archive and public installation  | Preparing                                                                              |
| Public site/docs                     | 1.7.0                       | Publish aligned guidance and verify served artifacts         | Preparing                                                                              |
| Hosted OpenAI connection             | Existing read-only contract | Verify live endpoint; independent submission gates remain    | Pending verification                                                                   |
| Node / Browser SDKs                  | 3.2.0                       | Unchanged; verify current public artifacts and compatibility | Fresh clean public consumer checks pass                                                |
| Python / PHP / Ruby / .NET SDKs      | 2.1.0                       | Unchanged; verify current public artifacts and compatibility | Fresh clean public consumer checks pass                                                |
| Java / Go / Android SDKs             | 3.1.0                       | Unchanged; verify current public artifacts and compatibility | Fresh clean public consumer checks pass                                                |
| Swift SDK                            | 3.1.1                       | Unchanged; preserve existing SPM/CocoaPods installs          | Pending verification                                                                   |
| React Native SDK                     | 3.1.0                       | Unchanged; preserve published native dependency floors       | Pending verification                                                                   |
| WordPress plugin                     | 2.1.0                       | Unchanged; verify public ZIP without changing consumer sites | Exact WordPress.org ZIP passes disposable native/browser/relay/retry/revocation checks |
| Smithery publisher / skill publisher | Retired                     | Excluded; provider retirement reconfirmed                    | No publication claimed                                                                 |

Private internal workspace packages are delivered in the core/client artifacts;
they are not independent registry publications. Existing SDK sources and wire
formats are unchanged, with the applicability matrix retained in
`project-service-sdk-compatibility.md`.

## Hosted rollout and rollback

Pin core, site and cloud source commits and immutable API/worker image digests.
Record the pre-release active/stable identity and schema ledger. Run ordered
migrations before new code starts, verify API/worker readiness and source identity,
preserve the managed MCP route, and verify served app/site assets independently.

Keep merge apply disabled until the actual fleet, compatible stable rollback and
served credential/origin/cache gates in the cloud runbook pass. Publication or a
healthy readiness endpoint does not close that activation gate. No existing
project is consolidated by this release.

## Evidence and outstanding gates

Release preparation is in progress. Add source/CI/workflow/registry/installation
and production receipts here as each gate completes. An accepted upload is not
platform security acceptance or deployed-runtime proof.

## Fresh retained-SDK package qualification

All eleven SDK repositories remain clean at their previously qualified commits.
Fresh public consumers pass for Node/Browser 3.2.0, Python/PHP/Ruby/.NET 2.1.0,
Java/Go/Android 3.1.0, Swift 3.1.1 and React Native 3.1.0. Swift uses a clean
published CocoaPods consumer with native iOS execution; React Native's fresh npm
check does not replace its retained exact-version native Android/iOS evidence.

The official WordPress.org 2.1.0 ZIP has SHA-256
`16e1467f217428afba7b608d5efc1263ed2bcf1a085336ce1ca6cb99dcce793a`.
Its extracted Browser 3.2.0 asset and complete disposable WordPress 7.1.1 runtime
pass authenticated policy, native/relayed evidence, durable retry and revocation.
The uniquely named stack and its volumes are removed; nine synthetic evidence
lines remain in the local receipt. No existing WordPress site was changed.

A distribution inventory found NuGet 2.1.0 already public but its GitHub Release
missing. Its NuGet repository commit matches the existing immutable `v2.1.0`
tag (`b45c5da48c31abf14db86918b6be384a66ee5045`); the canonical release record
is now public at the existing tag, without rebuilding, republishing or retagging
the artifact. GitHub latest and NuGet both resolve to 2.1.0.

The current public OpenClaw host is 2026.10.10. Both the supported 2026.6.9
minimum and current host load all 149 candidate tools and pass scoped native
requests. The current host's local-archive trust acknowledgement applies only to
the reviewed local candidate; remote ClawHub security and normal installation
remain mandatory publication gates.

The standalone-site CI currently checks the public core default branch. Its
new 149-tool documentation correctly conflicts with that branch's older 139-tool
catalogue until core promotion. The matching candidate documentation checks pass
locally. Rerun the unchanged site contract gate after core promotion; do not lower
the documented count or weaken the assertion.
