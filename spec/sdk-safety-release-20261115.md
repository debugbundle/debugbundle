# SDK safety release train — 15 November 2026

Owner-authorised scope: commit, publish and deploy the completed DebugBundle SDK
hook-budget and internal-diagnostic corrections, including their own dependent
wrappers and the DebugBundle app/site. Consumer products and existing WordPress
sites are excluded. Publication and hosted acceptance are complete. The receipts below distinguish
source qualification, registry artifacts and actual production deployment.

## Version decisions and eligibility

| Distribution                             | Decision                   | Version           | Reason                                                                                                                                |
| ---------------------------------------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node / Browser                           | Publish                    | 3.2.4             | Hook replacement budget and local diagnostic containment/runtime corrections; aligned JS family.                                      |
| Python                                   | Publish                    | 3.0.0             | Hook-budget fixes plus a deliberate diagnostic callback thread/completion change; major version with `MIGRATION-3.0.md`.              |
| PHP                                      | Publish                    | 2.1.4             | Correct valid overflow reduction and malformed-return fallback.                                                                       |
| Java family                              | Publish                    | 3.1.4             | Correct hook-budget reduction and validation across the aligned Maven family.                                                         |
| Go                                       | Publish                    | 3.1.4             | Correct hook replacement handling and use bounded diagnostic codes.                                                                   |
| Ruby                                     | Publish                    | 2.1.4             | Preserve replacement redaction and complete malformed-evidence validation.                                                            |
| .NET family                              | Publish                    | 2.1.4             | Correct hook replacement and optional-evidence handling across the aligned NuGet family.                                              |
| Android family                           | Publish                    | 3.1.4             | Correct canonical hook budget handling while retaining bridge/native contracts.                                                       |
| Swift                                    | Publish                    | 3.1.5             | Correct hook reduction and safe local ACK diagnostics, including credential-shaped codes.                                             |
| Rust                                     | Publish                    | 1.0.2             | Correct hook-budget reduction and withhold unavailable whole-event validation.                                                        |
| React Native                             | Publish after native roots | 3.1.4             | Correct JS hook handling and adopt corrected Android/Swift implementations.                                                           |
| WordPress                                | Publish after PHP/Browser  | 2.1.4             | Adopt corrected bundled SDKs and repair local diagnostic nonce privacy.                                                               |
| Core / hosted app                        | Publish/deploy after JS    | 1.27.2            | Adopt the corrected Node/Browser packages; preserve existing configuration and data.                                                  |
| Site                                     | Publish/deploy after JS    | 1.10.4            | Adopt the corrected Browser package and ship reconciled SDK guidance.                                                                 |
| Shared types / redaction                 | Retain                     | 3.7.0 / 2.7.1     | No changed shipped implementation or required distribution repair; the JS SDKs retain their compatible shared-types 3.0.0 dependency. |
| CLI / MCP / OpenClaw / developer plugins | Retain                     | Existing versions | No changed installed behaviour; no package or marketplace cascade.                                                                    |

All SDK fixes except Python's optional diagnostic timing change are compatible
bug/privacy/reliability corrections and use patch increments. Python retains its
capture API and event protocol; the separate major protects clients relying on
inline diagnostic side effects or thread affinity. The migration guide is in
repository documentation and the source distribution.

## Qualification and order

The [deep audit](sdks/sdk-deep-audit-20261115.md), [hook-budget qualification](sdks/before-send-budget-audit.md)
and [diagnostic qualification](sdks/internal-diagnostics-qualification.md) retain
all thirteen surface dispositions, failing regressions, full source gates and
installed/native artifact evidence. Versioned release artifacts must pass their
own CI, staged-package checks and published-consumer gates as well.

The live CocoaPods provider schedule was refreshed on 15 November: the announced
permanent Trunk freeze remains 2 December 2026. Swift selects the existing SPM and
immutable Git-pod channels; public source, bare RN and Expo runtime checks remain
mandatory. Trunk publication is not selected for this train.

Publish independent roots first, then React Native and WordPress against their
verified public dependencies. Adopt the published JS family in DebugBundle core
and site only after registry readback. Use exact qualified core/site SHAs for the
hosted rollout, preserve existing activation/configuration and the verified
rollback pair, and verify served bytes and health independently. No migration,
new endpoint, event schema, infrastructure or consumer adoption is introduced.

Receipts: `.tmp/sdk-release-20261115/`. Initial inventory records all fifteen
repositories, clean remote ancestry and preserved pre-release local files.
Current status: all thirteen SDK surfaces are published; core and site are live
and independently verified.

## Publication and verification progress

All thirteen SDK capture surfaces are published and independently verified. React
Native passes public Android/Swift dependency, Expo and device runtime gates,
trusted npm publication and installed-package checks. Core/site publication and
hosted acceptance also pass, as recorded below.

| Distribution         | Publication / installed-consumer gate                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node / Browser 3.2.4 | [43736831571](https://github.com/debugbundle/debugbundle-js/actions/runs/43736831571)                                                                                                       |
| Python 3.0.0         | [43742039102](https://github.com/debugbundle/debugbundle-python/actions/runs/43742039102)                                                                                                   |
| PHP 2.1.4            | [43736703810](https://github.com/debugbundle/debugbundle-php/actions/runs/43736703810)                                                                                                      |
| Java 3.1.4           | [43737020521](https://github.com/debugbundle/debugbundle-java/actions/runs/43737020521)                                                                                                     |
| Go 3.1.4             | [43742112592](https://github.com/debugbundle/debugbundle-go/actions/runs/43742112592)                                                                                                       |
| Ruby 2.1.4           | [43737068008](https://github.com/debugbundle/debugbundle-ruby/actions/runs/43737068008)                                                                                                     |
| Android 3.1.4        | [43741711858](https://github.com/debugbundle/debugbundle-android/actions/runs/43741711858)                                                                                                  |
| Swift 3.1.5          | [43746846163](https://github.com/debugbundle/debugbundle-swift/actions/runs/43746846163)                                                                                                    |
| Rust 1.0.2           | [43746276898](https://github.com/debugbundle/debugbundle-rust/actions/runs/43746276898)                                                                                                     |
| .NET 2.1.4           | [43737071558](https://github.com/debugbundle/debugbundle-dotnet/actions/runs/43737071558), [GitHub release](https://github.com/debugbundle/debugbundle-dotnet/releases/tag/v2.1.4)          |
| WordPress 2.1.4      | [GitHub ZIP](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/43744445210), [WordPress.org](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/43745083426) |
| React Native 3.1.4   | [Source CI](https://github.com/debugbundle/debugbundle-react-native/actions/runs/43747011814), [release](https://github.com/debugbundle/debugbundle-react-native/actions/runs/43750996443)  |

Independent readback verifies both JS archive integrity values, Python's wheel and
source archive including migration guides, PHP/Go/Ruby archive identities, all
18 Maven family POMs and all ten NuGet packages. Rust 1.0.2's public metadata,
index and archive agree on SHA-256
`f65d5da5b8b67f493a28899633609f9ea1838bbaf11794d5000c7edd9b0489c8`.
WordPress.org's actual ZIP bundles PHP 2.1.4 and Browser 3.2.4; its Browser asset
SHA-256 is `7331cffbf7534172e5b173cdd284e7ef33f5789e6c1559f509a84786ec032a23`.

## Release-gate corrections

- Go's pinned linter found two unchecked test-cleanup results. Explicit best-effort
  cleanup fixes the lint errors without changing runtime code or assertions.
- Rust's performance consumer lock needed its own SDK version aligned with 1.0.2.
  The final source then passes all eight qualification jobs and trusted publication.
- Python's first post-publish install exhausted its PyPI propagation retries.
  Registry hashes match the GitHub release assets. A verification-only recovery
  skips existing registry uploads and GitHub assets; the immutable 3.0.0 files
  were retained and installed-consumer checks pass.
- Swift's original simulator pressure assertions pass an unchanged source rerun.
  The initial publication subsequently passed all source, simulator, native-floor,
  local SPM and CocoaPods checks, then failed because fetching the annotated remote
  tag would overwrite the checkout's local lightweight tag. The corrected workflow
  separates tooling and immutable SDK source, fetches the tag into `FETCH_HEAD`
  and checks its peeled commit against that SDK checkout. Real isolated Git
  regressions reproduce the old failure and reject a mismatched remote source;
  no tag is rewritten. Recovery qualifies and publishes the unchanged 3.1.5 tag.
- Core's first 138-shard run passes every shard except a release fixture still
  naming Rust 1.0.1. Aligning its selected version with the independently verified
  1.0.2 release retains wrong-version, yanked and checksum rejection controls.
  Full corrected core CI 43751382686 passes on the exact deployed source.

Current repository README headings describe released hook behaviour. Existing
compatibility anchors and immutable published archives are retained; wording-only
follow-ups do not create additional SDK versions. The final documentation pass
introduces no new public interface or glossary term.

React Native 3.1.4 npm readback verifies the archive integrity, Swift 3.1.5 and
Android 3.1.4 dependency pins, wrapper podspec and installed contents. The
wrapper podspec retains its compatible Swift SDK lower bound 3.1.1. Swift uses public SPM and immutable
Git-pod distribution; no Trunk publication or production React Native SPM support
is claimed.

## Hosted acceptance

Core **1.27.2** and site **1.10.4** are released and live. Full corrected core
CI [43751382686](https://github.com/debugbundle/debugbundle/actions/runs/43751382686)
and CLI compatibility [43751382703](https://github.com/debugbundle/debugbundle/actions/runs/43751382703)
pass on the exact runtime source `3d205b9a45b17bf8f3a3869b42a56297f50edc6d`. Canonical core release
[43756357576](https://github.com/debugbundle/debugbundle/actions/runs/43756357576)
and site release [43756362222](https://github.com/debugbundle/site/actions/runs/43756362222)
pass. Site source/tag is `9a3c2c184a89269171933cab3c75992e3611fce5`; its source CI
[43745144000](https://github.com/debugbundle/site/actions/runs/43745144000) passes.

The [hosted rollout 43757275524](https://github.com/debugbundle/debugbundle-cloud/actions/runs/43757275524)
deploys these immutable sources with assets enabled, preserving MCP routing and
project-merge activation. API and worker report version 1.27.2, healthy with zero
restarts; their actual OCI revision labels match the qualified core source.
Both immutable images use digest `sha256:c1a4f334573e6270d29c24e4150999186cf4c33638bf28ec90ce9b125c8c5aa5`.

- Actual API and worker SDK installations are Node 3.2.4. Every distributed file
  matches the independently downloaded and integrity-verified npm archive.
- All 91 migration IDs/checksums match the predeployment baseline. No migration
  is introduced or applied. Selected configuration, nineteen credential
  fingerprints, report/review settings, budgets, attempt states/hashes and tracked
  row counts are preserved in read-only repeatable-read snapshots.
- All seven production alarms are OK. Public API readiness and app build identity
  match the selected release. The scoped DebugBundle project retains zero local
  and twenty cloud active incidents with exactly the same IDs. Doctor has zero
  errors and the same pre-existing profile-freshness warning.
- Active release is `20261115202256-f159577664fd`; previous stable is
  `20261115030343-f4b7859cfc8f` (1.27.1). Independent retention dry-run verifies
  exactly these two directories and all four immutable API/worker image references,
  with zero obsolete directory/image candidates. No broad Docker prune is used.
- Live acceptance checks 36 selected routes, twelve homepage
  install/initialise panels and ordered guides, all thirteen current SDK labels,
  hook/diagnostic anchors and Python 3 migration guidance. App identity, reference
  data, search content, the Rust launch article and its linked metadata pass.
  Fourteen actual S3 objects match publicly served CDN bytes, including compiled
  app/site entries, app identity and the changed SDK/privacy guidance.

Receipts are retained under `.tmp/sdk-release-20261115/`; operational acceptance
is also recorded in the private cloud runbook. They contain hashes and bounded
metadata rather than credentials or raw customer content. No consumer application,
existing WordPress site, production synthetic event or paid-model canary is changed
or run. The OpenAI plugin version and publication state remain unchanged; its local
source/image evidence is refreshed under the existing release rule.

Final reconciliation commits change evidence Markdown and the required OpenAI
manifest only; they do not replace the qualified runtime source or retag releases.
The historical audit checkpoints retain their original local qualification limits.
