# Multiline exception release — 6 November 2026

Status: released and live. All SDK publisher and public-consumer gates pass.
Core 1.22.1 and site 1.7.4 are deployed and independently verified. The owner authorised
DebugBundle publication/deployment and its own dogfooding. Consumer products and
existing WordPress site installations remain outside this authority.

## Version decisions

These are backwards-compatible capture, classification and resource-lifecycle
corrections, so these are patch releases. No event/bundle schema change, public
API removal or database migration is required. Java hosted-first adoption and optional iOS
Git-source setup are documented below.

| Surface                            | Version                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| Core                               | 1.22.1                                                     |
| Node / Browser aligned family      | 3.2.1                                                      |
| Java, Go, Android                  | 3.1.1                                                      |
| Python, PHP, Ruby, .NET, WordPress | 2.1.1                                                      |
| Swift                              | 3.1.2                                                      |
| React Native                       | 3.1.1, Android 3.1.1; Swift >=3.1.1, Git 3.1.2 recommended |
| Public site                        | 1.7.4, docs and Browser dogfooding adoption                |

CLI, MCP, shared-types, redaction and agent distributions retain their existing
independent versions: their code/contracts are unaffected. Browser advances with
the aligned JS family while retaining existing capture behaviour.

## Completed release order and safety gates

1. Publish qualified JS family and independent SDK roots; retain their existing
   shared package pins. Update DebugBundle root/web/site dogfooding only after
   exact registry artifacts exist and their installed consumers pass.
2. Deploy the compatible hosted classifier from a reviewed immutable core SHA,
   preserving assets initially if necessary. Verify readiness/version, protected
   data fingerprints, queues, runtime health and rollback before Java distribution.
3. Publish Java after classifier verification. Complete WordPress against public
   PHP/Browser artifacts and React Native against public Android/Swift artifacts.
4. Publish canonical core/site releases and finish the exact-source hosted app/site
   rollout. Verify installed registries, served assets, monitoring and retained
   rollback. Reconcile the release records and repository state.

Swift uses supported SPM and immutable Git CocoaPods sources. Trunk publication
must be an explicit separate channel: a read-only provider response cannot be
reported as successful publication. Bare RN and Expo consumers must build and
actually deliver through the selected public native path before RN npm publication.

## Evidence

The [final local audit](multiline-exception-release-audit-20261106.md) records the
red/green regressions and all twelve SDK dispositions. Detailed train receipts are
retained under `.tmp/multiline-release-20261106/`; exact source/workflow/runtime and
registry identities are recorded below.

## Backend cutover verified

Core 1.22.1 source `8daab4acf3ca36c0c425aab455959c1bb7ae9a0d` passes
full public source CI 42224969142 and local CI (5,253 tests / 112 shards,
87.83% merged line coverage). Hosted backend workflow 42228375243 passes with
client assets deliberately retained. API and worker are healthy with zero restarts;
readiness is 200. Both containers contain Node SDK 3.2.1 and exact matching
classifier bytes. The two scoped alert rules, nine credential/token scopes, five service
definitions and all 66 migration ledger rows retain their fingerprints. The
pre-release DebugBundle database snapshot is available. Java was published
only after these checks. App/site assets published independently, retaining this
verified backend and its previous stable rollback instead of performing another
backend cutover.

## Frontend publication safeguard

The app-only publisher uploaded mutable entrypoints before their new hashed
assets. A regression failed on that order; cloud `e18c45e5d9d06dad5fe6b74b4b29efcc49165d1f`
now uploads assets first and retains older hashes. All 30 deployment tests, three
image tests, 14 edge/site tests and three edge-rule tests pass. This workflow-only
correction does not restart or rotate the already verified backend.

## Mobile fixture qualification follow-up

RN's first full publication run stopped before npm upload at the new Xcode 27
Expo runtime check: no JS/ingestion activity from the generated classic-window
app. The same fixture delivered on Xcode 26.2. The isolated fixture now uses a
scene-owned window while retaining Expo's factory, subscribers and linking. Three
new helper regressions and the full 134-case RN suite pass; corrected local Expo
simulator delivery passes without changing the 120-second deadline. The complete
release gates pass at `28de60bd4ce0520be875b6565a709afdfaa8fb39`, including
public bare/Expo delivery on Xcode 27; no consuming application or SDK runtime
API changed for this fixture correction.

The asset-only app deployment 42240068070 passes from the same core source, using
cloud `e18c45e5`. Served app build/JS/CSS match S3 bytes and cache policy, and the
compiled client contains Browser SDK 3.2.1. The backend image pair is retained.

## Independent publications verified

Node/Browser 3.2.1, Python/PHP/Ruby/.NET/WordPress 2.1.1, Java/Go/Android
3.1.1 and Swift 3.1.2 pass their public registry/native consumer gates. Exact
SDK tags match their publisher revisions (`published-roots.json`). Java source
`510fbfaa123d87a7b38b5cabe33431073c6f83b3` passes release 42230294812 and
Central metadata exposes 3.1.1 after the backend correction was verified live.
WordPress.org 2.1.1's downloaded ZIP contains PHP 2.1.1 and the exact Browser
3.2.1 asset, without any staged-candidate marker.

Scoped post-backend monitoring retains the same 15 active incident IDs. Two
pre-existing Site font-resource incidents recurred before frontend cutover; their
exact current font URLs return HTTP 200 with the expected content type. This does
not prove those clients' earlier failures resolved. Their state/policy is retained.
All three saved API/app/site endpoint checks pass after promotion; their final
fresh samples and remaining client-acceptance limits are recorded below.

## Published SDK provenance

| SDK repository | Version | Exact source                               | Passing publisher                                                                               |
| -------------- | ------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| js             | 3.2.1   | `b5cf2732aebfc0b21b2522041f0f2d42d2a6686e` | [42223632859](https://github.com/debugbundle/debugbundle-js/actions/runs/42223632859)           |
| python         | 2.1.1   | `93dc3af733f52f023b6576ec6494093e1df90d48` | [42223637259](https://github.com/debugbundle/debugbundle-python/actions/runs/42223637259)       |
| php            | 2.1.1   | `f1617bbd7cecdb33195532063f861e4fbf13ff78` | [42223641582](https://github.com/debugbundle/debugbundle-php/actions/runs/42223641582)          |
| ruby           | 2.1.1   | `d056e68019b2d57206902ccb5e9323c6e229c88e` | [42223780572](https://github.com/debugbundle/debugbundle-ruby/actions/runs/42223780572)         |
| go             | 3.1.1   | `6b959be0b64379062baa79305e7813f1a9297e73` | [42223956966](https://github.com/debugbundle/debugbundle-go/actions/runs/42223956966)           |
| dotnet         | 2.1.1   | `c39bb1b36d1055c5368255b8cc0cf93468d5bcc7` | [42223645265](https://github.com/debugbundle/debugbundle-dotnet/actions/runs/42223645265)       |
| android        | 3.1.1   | `3b58420bccc55554df8df5a763a4dd3aa6f742b3` | [42223649791](https://github.com/debugbundle/debugbundle-android/actions/runs/42223649791)      |
| swift          | 3.1.2   | `439c156ff05a772d8092316cc5029f18ad0555c6` | [42224083049](https://github.com/debugbundle/debugbundle-swift/actions/runs/42224083049)        |
| wordpress      | 2.1.1   | `ae5c08e0c970f4fbd2d14521110019d11822833e` | [42225855396](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/42225855396)    |
| java           | 3.1.1   | `510fbfaa123d87a7b38b5cabe33431073c6f83b3` | [42230294812](https://github.com/debugbundle/debugbundle-java/actions/runs/42230294812)         |
| react-native   | 3.1.1   | `28de60bd4ce0520be875b6565a709afdfaa8fb39` | [42239861849](https://github.com/debugbundle/debugbundle-react-native/actions/runs/42239861849) |

Node and Browser are the aligned JS family. WordPress.org additionally passes
[42227098587](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/42227098587).
React Native passes corrected public Android/Swift/Expo native delivery and npm
registry smokes. Its v3.1.1 tag and promoted default branch share the same source.

The unchanged synthetic JBoss stdout/stderr regression also passes against the
actual Maven Central 3.1.1 core JAR in a fresh Maven repository, with no SDK source
overlay: one test, six coherent exception events, three GET/three POST, retained
NPE/application frames and suppressed/native/proxy evidence. The same fixture
failed on the three pre-fix Java releases during investigation.

## Compatibility and adoption

Java consumers need SDK 3.1.1 to assemble redirected stderr into complete
exceptions. Hosted core 1.22.1 protects recognised legacy continuation records
from independent incident creation; it cannot reconstruct causes or frames that
an older SDK already lost. Historical artifacts and incidents are not rewritten.
Self-hosted users must deploy core 1.22.1 before adopting Java 3.1.1, including
its bounded ERROR-level orphan-context summaries. No application changes or
production configuration updates were made on consumers' behalf.

Existing API, event and bundle shapes, GET/POST fingerprint separation, ordinary
error incidents, redaction and notification policy remain compatible. Newly
complete exception types/evidence can naturally yield different future
fingerprints; historical incidents are not merged or rewritten. Correlation
uses retained exception identity and owned scope; uncertain or overlapping
bridges can retain duplicate evidence rather than merge unrelated failures.
SDK-specific contention, truncation, shutdown and request-end limits remain in
the twelve-surface audit. Simulator/native mock-delivery proof does not establish
physical-device or each external consumer's acceptance.

Swift upgrades can use SPM or the immutable Git v3.1.2 pod source. React Native
3.1.1 keeps the Swift >=3.1.1 floor, documents bare Podfile and Expo config-plugin
Git source selection, and preserves explicit sources/manual ownership. New Trunk
publication was not selected; existing installations remain supported. WordPress
2.1.1 is published, but no existing site installation was updated.

## Rollback and preserved state

The active backend is `/opt/debugbundle-releases/20261106135043-10e2d35f45d0`;
previous stable core 1.22.0 is
`/opt/debugbundle-releases/20261105152155-110ee3183dd3`. Both API and worker image
identities are retained:

- Active: `sha256:60df8ab32e391bcfb0856522cd9a3493ce02553146656cce23af75e24013ba8a`.
- Previous: `sha256:7bccabafbb91ff7c52169a50edb8af440606fabda2471d9fa0aac8d46c7670aa`.

The available pre-release database snapshot is
`debugbundle-db-pre-multiline-20261106-1320`. No schema migration was required.
Asset-only app/site rollout preserves this backend rollback pair and prior hashed
assets. Runtime rollback to core 1.22.0 would also remove the new continuation
classifier: Java 3.1.1 orphan summaries could again become incidents. Keep that
compatibility dependency in any rollback decision; do not claim the older worker
retains the new capture-quality guarantees. No rollback was executed.

Read-only post-rollout checks confirm healthy zero-restart containers, readiness
200, only completed worker-job states, unchanged protected fingerprints and all
eight operational alarms OK. The exact Lightsail pre-release database snapshot
remains available. Asset deployments retain the same active/previous runtime pair.

The documentation/build-only default-branch follow-ups leave release tags
immutable: Java `5594923c09c60e02d0a5d512916cc68cbb260d9c` fixes an existing
network-probe quoting error (real HTTP 200, CI 42242334197 passes); Swift
`edb3c50daa0e63a4f4c4dcb452cfac96533f244e` updates the Git/SPM installation
example (CI 42239889650 passes after a checkout-only runner failure was retried).
Neither follow-up republishes an SDK binary.

RN 3.1.1 source `28de60bd4ce0520be875b6565a709afdfaa8fb39` passes all shared
verification, public Android/Swift build/runtime and Expo prebuild/runtime gates
in workflow 42239861849. npm publication and registry smoke pass. A separate
public tarball readback verifies SHA-512 integrity and all six packaged native
bridge/plugin files against source. Swift/Android native code is reused from
public dependencies; no wrapper fork or consumer installation was introduced.

Site 1.7.4 tag resolves to `320f4929bcbe55de14aaf4bda4d08e265ece6ed6`;
[release 42249916432](https://github.com/debugbundle/site/actions/runs/42249916432)
passes after source CI 42233424979. Its hosted asset-only rollout uses the same
core source and cloud asset publisher, preserving the verified backend pair.

## Canonical releases and final hosted verification

| Surface / operation           | Exact source                                                              | Passing workflow                                                                         |
| ----------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Core 1.22.1 canonical release | `8daab4acf3ca36c0c425aab455959c1bb7ae9a0d`                                | [42249896613](https://github.com/debugbundle/debugbundle/actions/runs/42249896613)       |
| Backend-only rollout          | core source above; cloud `8cc3c6263b1617bca6cfca002e8d942a5e8ca49d`       | [42228375243](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42228375243) |
| App assets                    | core source above; cloud `e18c45e5d9d06dad5fe6b74b4b29efcc49165d1f`       | [42240068070](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42240068070) |
| Site 1.7.4 canonical release  | `320f4929bcbe55de14aaf4bda4d08e265ece6ed6`                                | [42249916432](https://github.com/debugbundle/site/actions/runs/42249916432)              |
| Site assets                   | site/core sources above; cloud `e18c45e5d9d06dad5fe6b74b4b29efcc49165d1f` | [42250330707](https://github.com/debugbundle/debugbundle-cloud/actions/runs/42250330707) |

Core and site tags resolve to those exact source commits. Final public readback
verifies 31 resources: app entrypoint/version/JS/CSS, site entrypoint and 14 JS
chunks, all eleven SDK guides plus WordPress. CDN and S3 bytes/cache policies
match. The served app build identifies the core source above; app and site bundles
contain Browser 3.2.1. All twelve guides show their intended versions, including
Git v3.1.2 instructions and Java's hosted-first adoption requirement. API/worker
contain Node 3.2.1 and the exact reviewed classifier bytes. This proves deployed
artifacts and configuration, alongside the separate mock/native delivery tests;
it does not claim every external browser/device or consuming application passed.

The canonical DebugBundle project's final scoped monitoring retains the original
15 active incident IDs. The only count changes are the two pre-existing font
recurrences described above. No incident was closed, merged or suppressed, and
no alert policy, credential scope or service identity was changed. Fresh saved
API/app/site health samples pass with HTTP 200. Public release notes, SDK/site
migration guidance, architecture/status and the CocoaPods checklist are reconciled.
Documentation-only follow-up commits do not retag or redeploy the verified code.
