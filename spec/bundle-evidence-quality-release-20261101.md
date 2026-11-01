# Evidence quality and SDK parity release — 1 November 2026

The owner authorised the reviewed DebugBundle release train, its own dogfooding
and WordPress distribution on 1 November. Publication, deployed runtime and
consumer adoption are verified separately. Other products and existing WordPress
site installations are outside this authority.

The release implements [FR-EVID-01–09 and AC-EVID-01–09](bundle-evidence-quality.md).
Legacy envelopes, Bundle v1, fingerprints, token scopes, ordinary capture and the
restricted OpenAI contract remain compatible. Optional evidence requires proof of
the complete delivery path. Shared-types 3.0.0 is the deliberate exported Zod API
major; see [the migration guide](zod-v4-migration.md).

## Accepting runtime

[Hosted run 41330080159](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41330080159)
deployed accepting core `c3bec35ef1c64c0cf5be1c02885767d3dabc0884` before new SDK
adoption, retaining the previous site source. API and worker image digest is
`sha256:05c99a058e116f398322c86b31385c555920c87b8eac2fe6c125f9094274f475`.
Independent readback confirms core 1.20.0, healthy containers, zero restarts and
active `postgres-v1` processing. Migration 64 has the expected checksum
`589c0380e15f817a7555fcce1182885cda5d9edd677298ca21278a785ee2cb17`;
all 63 preceding checksums and the aggregate project/incident counts are preserved.
The prior 1.19.3 release remains the rollback input. This first rollout is distinct
from the final rollout with registry-adopted dogfooding dependencies.

## Published prerequisites and SDKs

Shared-types 3.0.0 and redaction 2.7.0 pass publication and clean registry checks in
[41330113458](https://github.com/debugbundle/debugbundle/actions/runs/41330113458).
Node/Browser 3.2.0 pass their registry smoke in
[41330967654](https://github.com/debugbundle/debugbundle-js/actions/runs/41330967654).
The JS lock update changes only the shared-types archive integrity to the actual
published bytes; all 603 tests, coverage, types, lint and installed delivery/privacy
checks pass. The clean published archives omit stale, unreferenced local build
outputs; every retained published file matches the qualified content.

CLI and MCP 1.18.0 pass their release matrices and public installation gates in
[41331038064](https://github.com/debugbundle/debugbundle/actions/runs/41331038064)
and [41331040581](https://github.com/debugbundle/debugbundle/actions/runs/41331040581).
Their published package contents exactly match the qualified archives. Python,
PHP, Ruby, Go and .NET publication gates also pass. All ten NuGet 2.1.0 packages
are visible and a separate clean .NET 8 consumer verifies native evidence,
explicit recovery, privacy, delivery and the ASP.NET browser relay.

Ruby's first release attempt stopped before publication at the unchanged enriched
capture budget. The same source and image measured 0.97 seconds in qualified CI
and 0.94 locally; one fresh-runner retry passed the unchanged 1.5-second limit and
completed publication. No SDK assertion or threshold was relaxed.

WordPress 2.1.0 uses registry-resolved PHP 2.1.0 and Browser 3.2.0. Its final
unmarked ZIP passes all three WordPress/PHP lanes; 93 tests / 461 assertions,
types and all 19 coverage floors pass without a source overlay. The GitHub release
and WordPress.org publication are independently checked. The public ZIP install
check and final source identities are recorded in the release handoff.

## Release-specific corrections

Java's publisher is updated to Central plugin 0.12.0 for its documented
[Maven 3.10 metadata correction](https://central.sonatype.org/publish/publish-portal-maven/#0120-13-oct-2026). A no-upload bundle check verifies all nine complete component
layouts; the release workflow checks the signed bundle before actual publication.
No Java SDK runtime interface changes. Existing version tags remain immutable.

Android's release job now uses the same Pixel/2-GB/explicit 256-MB heap configuration
and complete-result validator as its qualified CI job. All API 23/36/37 release
native checks pass without changing SDK code, queue limits or privacy assertions.

Swift 3.1.1 supersedes the tagged 3.1.0 attempt. A deterministic regression proves
that a structured task group could wait for a late Foundation cancellation callback
beyond the request deadline. One terminal completion gate now cancels the losing
read and releases the sender independently; body encoding shares the deadline.
Response size, identity encoding and UTF-8 checks remain enforced. Full host/iOS
and per-file coverage, iOS 15 compilation, SPM/CocoaPods and actual Swift 5.10
compiler/installed-consumer checks pass. The clean consumer resolves its conditional
compiler-compatible dependencies instead of retaining a newer compiler's generated
lock. React Native requires the corrected Swift floor before its own publication.

## Qualification and follow-through

The preceding source audit covers 4,862 core cases across 594 files, all 180 real
storage integration cases with no skips, and 18 migration/rollback checks. Registry
adoption adds passing core consumer, type/build, site and native client gates.
The installed core/site graphs contain no legacy Zod 3, so their unused patch
registrations are retired; negative audit fixtures remain fail-closed.

Codex 1.4.1, Gemini 1.3.1 and Claude 1.18.0 use published MCP 1.18.0. Native local
package checks discover 139 tools and pass their auth, retrieval, update and removal
controls with disposable fixtures. Public Codex/Claude GitHub checks and Gemini
GitHub Release upgrade pass. Final hosted/site rollout, rollback retention, monitoring and native gates have
separate receipts below; ClawHub acceptance remains explicitly deferred.

The [local handoff](local/proposals/bundle-evidence-quality-sdk-parity-release-handoff-2026-10-29.md)
and machine-readable train ledger retain current progress. Simulator/emulator
measurements do not assert physical-device performance. OpenAI plugin 1.0.2 retains
its independent frozen package and portal authority; this train performs no portal
submission or publication.

## Current release verification

Full core [CI 41336331684](https://github.com/debugbundle/debugbundle/actions/runs/41336331684) passes at `88a9a42c1762bab1f5bb7e73f908d67eeb67b99a`, now merged to main. Site 1.6.11 CI and canonical release pass. Java and Android corrected publisher runs 41333697745 and 41333017156 complete successfully. Swift CocoaPods 3.1.1 is published and a fresh public installed-consumer native smoke passes; a test-only startup-policy fixture correction retains the immutable SDK tag/runtime. React Native retains its 3.1.0 version with Swift >=3.1.1.

An independent public Node 3.2.0 canary through the accepting runtime acknowledges native cause evidence, redaction, execution context, opted-in recovery and a legacy-shaped error. Two primary incidents are processed, recovery creates no incident, and the stored reader returns correlated recovery and causes without the test secret. Only the disposable DebugBundle-owned fixture is deleted after verification.

The official MCP Registry accepts and directly exposes 1.18.0. The verifier formerly searched only ten historical records; a deterministic red/green regression now requires the exact-version endpoint and rejects mismatched identity or missing versions. [Smithery confirms](https://smithery.ai/future) its publishing API/CLI/accounts were retired on 31 October. Its 403 is recorded as a retired channel, with no new publication claim. ClawHub skill and OpenClaw plugin 1.18.0 uploads are accepted; exact-version clean security/discovery gates remain pending.

## Latest verified state

All maintained SDK release workflows and public registry consumer gates pass.
React Native [41337102827](https://github.com/debugbundle/debugbundle-react-native/actions/runs/41337102827)
passes every compatibility, wrapper, published Android/Swift native runtime and
npm installed-package gate. Its first npm smoke saw a stale registry packument;
a publisher-only retry passed without changing the package. The public tarball
SHA-256 is `3a45da5981ca0982d254c586a1c1350a8d6b544f53d8319f7718cb8232a80c8f`.
Its native sources, manifest, podspec, README and license match reviewed source
`7c0942fa1f0bf06e44375cc9fdd6d571fb4c848d`; the podspec enforces Swift >=3.1.1.
Publishing the verified tarball omits npm gitHead, so provenance uses the workflow
revision, integrity and independent source-byte comparison.

Swift's complete public CocoaPods workflow
[41337695438](https://github.com/debugbundle/debugbundle-swift/actions/runs/41337695438)
and fresh three-lane [CI 41340601382](https://github.com/debugbundle/debugbundle-swift/actions/runs/41340601382)
pass. The latter uses documentation-only descendant
`c027476f9cda008d40365af34675be98cc71067d` with original deadline/performance
assertions and timeouts. Two earlier simulator fixture failures remain in the
receipts. An automatic review rejected a proposed fixture timeout change; it was
not applied. No runtime patch beyond published Swift 3.1.1 was needed.

| Distribution                 | Version                | Verified result                                                                      |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| Shared-types / redaction     | 3.0.0 / 2.7.0          | Published, independent registry consumers                                            |
| Node / Browser               | 3.2.0                  | Published; 603 cases and installed delivery/privacy                                  |
| Python / PHP / Ruby / .NET   | 2.1.0                  | Published; maintained native/compiler/installed matrices                             |
| Java / Go / Android          | 3.1.0                  | Published; native and public family/module consumers                                 |
| Swift                        | 3.1.1                  | SPM/CocoaPods public delivery and compiler/native checks                             |
| React Native                 | 3.1.0                  | npm/GitHub release; real published-native Android/iOS runtime gates                  |
| WordPress                    | 2.1.0                  | GitHub and WordPress.org; actual public ZIP installed smoke                          |
| CLI / MCP                    | 1.18.0                 | npm and installed compatibility; exact official Registry entry                       |
| Codex / Gemini / Claude Code | 1.4.1 / 1.3.1 / 1.18.0 | Public native install/auth/update/removal and 139-tool discovery                     |
| Site                         | 1.6.11                 | Canonical source release, CI/export and hosted deployment; independent S3/CDN checks |

[Core CI 41339187661](https://github.com/debugbundle/debugbundle/actions/runs/41339187661)
passes at release source `ee2254617938f9d8f83f47ed3f92157c6d18b483`.
[Site CI 41340746606](https://github.com/debugbundle/site/actions/runs/41340746606)
passes at `b91960302bdadcafc3f9db65984000d21ef6a9fd`.
React Native main now includes documentation-only follow-up
`44ce6a67219f94e87d5fb9ecb38dd8b7146a752d`, correcting its written Swift floor to
the already-enforced 3.1.1. The published package and immutable tag are unchanged.

### Production identity, retention and observation

[Final hosted run 41338599261](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41338599261)
passes with product `88a9a42c1762bab1f5bb7e73f908d67eeb67b99a` and the previous
site deliberately retained. Later core changes are release helper/tests/docs and
OpenAI provenance only; API/worker/dashboard implementation has not drifted.
Both live containers independently report that exact revision and image digest
`sha256:b27b9a60cd68ee31caf06c48c007c47cbcdd4e47bbfc3c0257f206b1be8c35dd`, healthy
with zero restarts. Installed versions are Node 3.2.0, shared-types 3.0.0 and
redaction 2.7.0. Worker processing is active with `postgres-v1`. Public API/MCP
readiness is 200, the SPA serves build 88a9a42c with no-cache version metadata,
and the existing OAuth resource/scopes remain intact.

The owner script applied retention successfully. Independent dry-run agrees:
active `20261101185344-1251b026d291`, previous accepting
`20261101171453-c90804d297e8`, both exact API/worker image references retained,
and zero obsolete release directories/image references. The helper hash matches
trusted cloud source. Approximately 47 GB disk and 897 MB available memory were
observed after rollout.

A second fresh public Node 3.2.0 live canary passes against this runtime and deletes
only its new fixture. All 64 migration checksums match. Projects remain 38;
live incident count moved from 547 to 546 across a successful scheduled retention
cleanup at 18:58 UTC. Incident-expiry/deletion SQL is unchanged from the predecessor,
no organization quota rotations occurred, and the canary organization is well
below its 6,000 retained-bundle cap. This is consistent with normal expiration;
the aggregate baseline cannot identify the individual expired row. No restoration
or unrelated data mutation was performed. All seven DebugBundle alarms remain OK,
and the exact active API baseline remains one pre-existing OAuth incident with its
original count/timestamp and no next page.

### ClawHub acceptance and authorised follow-through

ClawHub skill 1.18.0 is public with clean final review/moderation. Its previously
missing VirusTotal result has since arrived clean. The owner-requested rescan
`w17cddbzbyn37bfn045mvz5yz18hcy6x` and original scanner evidence are retained.

OpenClaw plugin 1.18.0 is now failed/not recoverable. Its secret scan is clean;
ClawScan failed before a verdict because Skillspector failed, and public latest
remains 1.17.0 at the retry checkpoint. ClawHub's recovery implementation applies
to its original OpenClaw release-authorised attempts, not this ordinary publisher
upload. No recovery override or scanner waiver was attempted.
Smithery is a retired publisher channel under its official 31 October notice.

The owner subsequently authorised one fresh coordinated 1.18.1 packaging retry.
MCP 1.18.1 is published on npm and the official Registry, with full source CI and
installed native checks passing. ClawHub accepted the fresh plugin for checks;
the skill remains absent after server errors/timeouts. Exact-version security
and discovery remain open. See [the current patch evidence](clawhub-publication-retry-20261101.md)
for the immutable artifact, supported multipart publisher and final outcomes.

Automatic approval review initially rejected React Native main promotion and the
canonical core tag while these mandatory ClawHub gates remained open; neither
rejected write ran. The owner subsequently explicitly directed: "Let's do
everything else and leave the openclaw thing for the end if it's not a blocker."
This authorises the independent core release, React Native main promotion, site
deployment and evidence reconciliation with ClawHub acceptance explicitly open.
The qualified core and SDK delivery paths do not depend on ClawHub publication.
No ClawHub acceptance criterion is waived and full ecosystem completion remains
unclaimed. Its prepared support issue stays a draft; no communication is authorised.

### Independent publication follow-through

React Native main promotion is independently read back at `44ce6a67219f94e87d5fb9ecb38dd8b7146a752d`.
[Core release 41354190812](https://github.com/debugbundle/debugbundle/actions/runs/41354190812)
passes from qualified source `ee2254617938f9d8f83f47ed3f92157c6d18b483`; the
public [v1.20.0 release](https://github.com/debugbundle/debugbundle/releases/tag/v1.20.0)
and immutable tag independently resolve to that exact revision. [Site deployment 41354208886](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41354208886)
passes from trusted cloud `7797818535880b9afcc3c0526d5aa82ecffc71cb`, product
`ee2254617938f9d8f83f47ed3f92157c6d18b483` and site
`b91960302bdadcafc3f9db65984000d21ef6a9fd`. These runs do not republish SDKs or
redeploy API/worker images. Independent readback checks six served routes and all
23 loaded JavaScript assets against S3 byte-for-byte, current Node/Browser 3.2.0
docs, revalidating HTML and immutable hashed JavaScript. Served SDK 3.2.0 and
structured-evidence code are present. API/MCP readiness remains 200 and the app
still reports build 88a9a42c. Site source identities and completed edge/invalidation
checks are retained with the successful workflow. All seven production alarms
remain OK and the exact API incident baseline is unchanged. All independent
core, SDK, WordPress and site publication steps are complete. Final ClawHub
security/discovery acceptance remains open in the authorised follow-through above.
