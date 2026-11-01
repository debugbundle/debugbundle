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
GitHub Release upgrade pass. Final hosted/site rollout, rollback retention,
monitoring and remaining native/ClawHub gates retain separate receipts.

The [local handoff](local/proposals/bundle-evidence-quality-sdk-parity-release-handoff-2026-10-29.md)
and machine-readable train ledger retain current progress. Simulator/emulator
measurements do not assert physical-device performance. OpenAI plugin 1.0.2 retains
its independent frozen package and portal authority; this train performs no portal
submission or publication.

## Current release verification

Full core [CI 41336331684](https://github.com/debugbundle/debugbundle/actions/runs/41336331684) passes at `88a9a42c1762bab1f5bb7e73f908d67eeb67b99a`, now merged to main. Site 1.6.11 CI and canonical release pass. Java and Android corrected publisher runs 41333697745 and 41333017156 complete successfully. Swift CocoaPods 3.1.1 is published and a fresh public installed-consumer native smoke passes; a test-only startup-policy fixture correction retains the immutable SDK tag/runtime. React Native retains its 3.1.0 version with Swift >=3.1.1.

An independent public Node 3.2.0 canary through the accepting runtime acknowledges native cause evidence, redaction, execution context, opted-in recovery and a legacy-shaped error. Two primary incidents are processed, recovery creates no incident, and the stored reader returns correlated recovery and causes without the test secret. Only the disposable DebugBundle-owned fixture is deleted after verification.

The official MCP Registry accepts and directly exposes 1.18.0. The verifier formerly searched only ten historical records; a deterministic red/green regression now requires the exact-version endpoint and rejects mismatched identity or missing versions. [Smithery confirms](https://smithery.ai/future) its publishing API/CLI/accounts were retired on 31 October. Its 403 is recorded as a retired channel, with no new publication claim. ClawHub skill and OpenClaw plugin 1.18.0 uploads are accepted; exact-version clean security/discovery gates remain pending.
