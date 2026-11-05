# Project/service installation guidance release — 5 November 2026

The owner authorised commit/push, publication of the affected DebugBundle
packages/site, production verification and cleanup of merged branches.
FR-PJS-01 / AC-PJS-03 now default installation to one project per system across
service repositories, preserving existing connections and access/privacy boundaries.
`connect` remains name-based; the guide explains binding a known project ID.
The install prompt is 236 words; shared project/service guidance is four bullets,
232 words. No consumer product was changed.

## Published inventory

| Surface                      | Version | Published source / acceptance                                                                          |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| CLI / MCP                    | 1.19.4  | npm `gitHead` `61555f74048a40eddb8d46b187ef7c62d5f764d6`; both release workflows pass                  |
| OpenClaw plugin              | 1.19.4  | ClawHub final review and antivirus clean; normal public installation passes                            |
| Portable skill               | 1.19.4  | Published; byte-identical normal installation passes; final review/moderation clean; antivirus pending |
| Codex developer plugin       | 1.5.1   | Public core marketplace at merge `e77cca52`; pins MCP 1.19.4; native public checks pass                |
| Claude Code developer plugin | 1.19.4  | Same public core source/pin; native public checks pass                                                 |
| Gemini CLI extension         | 1.4.4   | Standalone main/tag `b6b2fc208b2b0339c6b3d855fd3d9db5a7b9f0ad`; public upgrade passes                  |
| Public site/docs             | 1.7.2   | Site `cb8d67d1d43a01b2630422a1ba57855ec3862034`; live production checks pass                           |
| OpenAI combined plugin       | 1.0.3   | Sealed local candidate only; portal submission remains separate                                        |

Official Registry `com.debugbundle/mcp` 1.19.4 is published and exact readback
passes. Both npm latest tags and provenance match the qualified immutable source;
four installed packages have verified registry signatures and attestations.
CLI [41946266798](https://github.com/debugbundle/debugbundle/actions/runs/41946266798)
and MCP [41946271830](https://github.com/debugbundle/debugbundle/actions/runs/41946271830)
pass supported Node 22/24/26 variants, packaged/native and public-client checks.
Actual published CLI checks preserve local-only setup and reject unsafe cloud/local
inputs before unintended IO, preserving unrelated files and retained state.

Codex 0.153.1, Claude Code 2.1.277, Gemini CLI 0.61.0 and OpenClaw 2026.10.10
pass normal public installation, 149-tool discovery, authentication/access denial,
local evidence, settings and removal checks. Public update/reinstall checks also
pass; Gemini upgrades the actual public 1.4.3 installation to 1.4.4. The supported
OpenClaw minimum 2026.6.9 remains independently qualified. No public install uses
a force or security override. All five Gemini files/main/tag match core; the
actual downloaded release ZIP matches SHA-256
`2b5c0ffb6f382c86288791c92b68a559472d82c822dcbc06f8c85e2591b271ec`.

## Security corrections and source qualification

Marketplace final reviews found two pre-existing artifact boundary defects during
this train. A crafted incident ID could escape the cloud-cache path in 1.19.2;
a later refreshed review of 1.19.3 found retained local metadata could select
unrelated JSON. Earlier clean interim reviews did not override the findings.
Published versions/tags remain immutable; 1.19.4 supersedes the affected clients.
Raw findings remain in the local release evidence directory.

FR-CLI-17/18 and AC-CLI-CACHE/LOCAL-ARTIFACT now enforce safe opaque URL IDs,
canonical local artifact paths, symlink rejection, guarded bounded reads and
atomic writes across retrieval, rebuilds and cleanup. Invalid retained state and
unrelated files survive; large stores retain the native read ceiling. Confirmed
remote mutations keep their outcome if optional caching fails. Regression cases
first reproduced both flaws; emitted/installed plugin checks cover malicious
cloud IDs, resource IDs, local metadata and symlink paths with no unexpected HTTP.

Exact-source [CI 41946273828](https://github.com/debugbundle/debugbundle/actions/runs/41946273828)
passes 5,174 tests across 111 shards, including 103 actual Postgres cases.
Coverage: lines 87.78%, functions 90.12%, branches 78.63%, statements 86.82%;
the changed-source gate passes. CLI runtime CI passes. The only initial Gemini
job failures were pre-publication npm ETARGET; those jobs passed after publication.
PR [#12](https://github.com/debugbundle/debugbundle/pull/12) merged normally at
`e77cca52f4a68787c2dc12179fe62c1de895cb5e`, with a tree identical to qualified
source `61555f74`.

## Production site and retained runtime

Site source CI 41947204200 and release 41947207635 pass. The first site deployment
exposed an actual generation mismatch: core's `scripts/public-site-artifacts.ts`
overrode the corrected site-vendored llms.txt with stale interface priorities and
omitted the one-project default. An active contract reproduced the failure;
the corrected generator's 5,488 bytes now match the approved site copy exactly.
Eleven active routing cases and six explicit machine-readable cases pass, with
types/lint/format. The generated-output regression is included in normal CI.

Corrected site deployment
[41952378142](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41952378142)
passes from cloud `cb11cfb084bf8c7e81dc94a31f1d38668700aabb`, product
`46337a46a97dc07b146903de49860b587773058f` and site `cb8d67d1`. Ten live guide
pages, six assets and llms.txt pass content assertions, CDN/S3 byte comparison
and applicable cache checks. The connection anchor and current MCP pins are live.

After deployment, the saved API/App/Site checks pass HTTP 200 with zero consecutive
failures (02:04:54 UTC); all eight production alarms are OK. Four served App
resources are byte-identical to the baseline and API `/ready` returns 200.
Read-only merge verification remains true/no failures for operation
`f38fb964-4cce-4eca-9a73-e3528998b253`; canonical DebugBundle and five retained
services are unchanged. Core API/worker 1.21.0, its active/previous stable images,
66 migrations, original histories, tokens and scopes remain as recorded in
[the consolidation receipt](project-service-live-20261104.md).

The guidance/client changes require no API/worker rollout, schema migration,
SDK release, credential change, repository adoption or synthetic production event.
App/Site SDK analytics opt-in remains separate from API/Worker instrumentation;
the shared project analytics policy is unchanged. The hosted OpenAI 23-tool
contract is unchanged. No new glossary term is introduced.

## Remaining acceptance and repository cleanup

The portable skill's antivirus result is still missing. Overall/final review and
moderation are clean, but the provider's generic `decision: pass` does not satisfy
our explicit antivirus gate. Raw public metadata and the stored report ZIP independently confirm the omission.
One supported owner rescan of exact skill 1.19.4 is running; neither missing evidence nor accepted publication is a security pass.
OpenClaw's final review is benign/high-confidence and its antivirus is clean
(62 undetected, zero malicious/suspicious). Broad ClawHub discovery remains the
separately tracked 5/7 baseline; Smithery publishing is retired.

The generator-correction main CI is in progress. Earlier merged-main CI completed
all shards but its 1 ms OpenAI timeout-monitor test observed the generic failure
category; no test expectation or hosted runtime was changed to hide that result.
The qualified client source CI above is independently green.

Core, site, Gemini and cloud are on main with clean, synced tracked trees.
The merged `release/project-guidance-20261105` branch was deleted locally and
from origin after exact-head/ancestry checks. Unmerged `feature/muse-connector`,
the ahead-one parked `update/analytics` commit and the detached Muse worktree
are preserved. Final CI and portable-skill antivirus acceptance remain open. Local raw receipts: `.tmp/project-guidance-release-20261105/v1194/`.
