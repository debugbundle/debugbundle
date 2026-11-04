# Project/service consolidation release train — 4 November 2026

The owner authorised the production release and complete DebugBundle release
train on 4 November. Live consolidation of existing DebugBundle projects remains
a later task. Consumer products are outside this release.

The audited source passed 5,131 tests across 110 shards, including 103 real
Postgres cases; 180 general integration cases passed with one existing optional
skip. Static, coverage, retained-client and sealed migration/rollback rehearsals
passed. See [qualification](project-service-qualification.md) for exact receipts.

## Distribution inventory — released and verified

| Surface                          | Version                             | Result                                                                         |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Core API/worker and app          | 1.21.0                              | Live, healthy; source 3292618b; compatible rollback verified                   |
| Shared types                     | 3.1.0                               | Public; signatures, provenance and exact integrity verified                    |
| Redaction                        | 2.7.0                               | Retained byte for byte; public consumer verified                               |
| CLI / MCP                        | 1.19.1                              | Public; native installs, exact runtime rehearsal and live reads pass           |
| OpenClaw plugin / portable skill | 1.19.1                              | Exact final review, antivirus and moderation pass; normal public installs pass |
| Codex developer plugin           | 1.5.0                               | Public core marketplace; native Git install/update/auth/removal pass           |
| Claude Code developer plugin     | 1.19.1                              | Public core marketplace; native Git install/update/auth/removal pass           |
| Gemini CLI extension             | 1.4.1                               | Public repository/tag/ZIP; actual public 1.4.0 to 1.4.1 upgrade passes         |
| Public site/docs                 | 1.7.0                               | Live; matching source CI and served/S3 bytes/cache headers verified            |
| Hosted OpenAI connection         | Existing read-only 23-tool contract | Live authenticated response unchanged from baseline; no new submission         |
| Node / Browser SDKs              | 3.2.0                               | Fresh public consumers pass; runtime sources/artifacts unchanged               |
| Python / PHP / Ruby / .NET SDKs  | 2.1.0                               | Fresh public consumers pass; .NET canonical release record reconciled          |
| Java / Go / Android SDKs         | 3.1.0                               | Fresh public consumers pass                                                    |
| Swift SDK                        | 3.1.1                               | Fresh public CocoaPods native consumer passes; existing SPM evidence retained  |
| React Native SDK                 | 3.1.0                               | Fresh npm consumer passes; exact-version native evidence retained              |
| WordPress plugin                 | 2.1.0                               | Official ZIP passes disposable native/browser/relay/retry/revocation checks    |
| Smithery publishing              | Retired                             | Excluded; no new publication claimed                                           |

Private internal workspace packages are delivered in the core/client artifacts;
they are not independent registry publications. Existing SDK runtime sources and wire
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

## Historical preparation record

The stage records below retain the preparation and corrective-release history.
The final production receipt supersedes their earlier pending states. Upload,
platform security acceptance and deployed-runtime proof remain distinct evidence.

## Fresh retained-SDK package qualification

All eleven SDK runtime sources retain their previously qualified commits. The JS
repository has a documentation-only follow-up recorded below; all worktrees are
clean.
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

The initial standalone-site CI checked the older public core default branch. Its
new 149-tool documentation correctly conflicts with that branch's older 139-tool
catalogue until core promotion. The unchanged site contract gate subsequently passed
against the promoted 149-tool core; no assertion was weakened.

## Backend-first production stage (historical receipt)

Cloud source `8d564cb8de16733696d8d1233b2234e298a6c51c` deployed core
`016c2501f129bd46b860332b9ba19ca78d2c34fb` in
[workflow 41822124561](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41822124561).
The API/worker image digest is
`sha256:bb44f1e2a03fca201e0721923b5e46246cb8be9c5f9c173ce7208c9996da94c2`.
Both containers are healthy with zero restarts. `deploy_assets=false` retained all
33 common public resource hashes, including the prior app and site. This is a
backend stage, not completion of the full release train.

The production schema has 66 ledger entries; all previous 64 entries, checksums
and application timestamps are unchanged. The historical project, service and
project-token ID hashes match the pre-release capture exactly when excluding
normal rows created after that capture. Member, agent-token, alert-rule and probe
identity hashes also match. All service instances have definitions. There are
zero legacy project bindings and zero merge operations; merge apply remains off.
A managed database snapshot, `debugbundle-db-pre-project-services-20261104`, is
available. Existing SDK config credentials return 200 with `private, no-store`,
`Vary: Authorization, Origin` and the expected browser CORS origin. The independent
hosted OpenAI connection returns the same three service IDs before and after.

The shared-package workflow's initial attempt stopped before any npm write: it
incorrectly required an unchanged redaction version to be bumped alongside new
shared types. The correction verifies both packed SHA-512 integrities first,
retains exact existing artifacts, and publishes only missing archives. The local
registry plan retains redaction 2.7.0 byte for byte and publishes shared types
3.1.0. A mismatched existing archive or a failed registry check aborts the pair.

## Initial client/support publication (historical receipt)

CLI 1.19.0 is public from core `016c2501f129bd46b860332b9ba19ca78d2c34fb`:
[workflow 41825151782](https://github.com/debugbundle/debugbundle/actions/runs/41825151782)
passes native and installed checks across Node 22, 24, 26.0.0, 26.2.0 and 26.
MCP 1.19.0 is public from `bed9d491f10f2b7565313e6b140db5cfdd2e2ada`:
[workflow 41825779172](https://github.com/debugbundle/debugbundle/actions/runs/41825779172)
passes Node 22/24/26 package, native Codex, published Codex and OpenClaw gates.
Shared-types 3.1.0 is public from the same reviewed source through
[workflow 41825773703](https://github.com/debugbundle/debugbundle/actions/runs/41825773703).
Redaction 2.7.0 was verified and retained, without a redundant version bump or
republish. Exact npm integrity/provenance metadata is retained in the local
release receipts. Core now adopts the public shared-types 3.1.0 dependency;
retained SDKs continue using their declared compatible support dependencies.

The JS SDK public guides at documentation commit
`8358dba` now identify their evidence APIs as published in 3.2.0 and explain that
core support packages are independently versioned. Five existing repository
metadata/documentation tests pass. Runtime sources, package versions and existing
immutable tags/artifacts are unchanged.

## Corrective local trace scope gate

The first 1.19.0 package release checks passed, but ClawHub's final plugin review
reported a reproducible local-processing defect: a reused trace ID could combine
frontend/backend events from different projects or environments. No hosted
authorization bypass was established. This blocked the initial attempt; the review was not
waived. The complete platform findings remain in the exact-version local report.

New executable scope regressions fail against the original artifact source
(four failures, with the same-scope control passing). The fix keys local trace
correlation by project, environment and trace. Readers and incremental processing
refuse a mixed retained cache without rewriting it. An explicit capture-preset
rebuild can regenerate scoped state/artifacts from preserved raw event files.
The compiled CLI/OpenClaw runtime gates now exercise actual local processing with
reused traces across both scopes. CLI/MCP/OpenClaw 1.19.1 supersede the first
attempt. Developer catalogues subsequently adopted that publication, and public
Gemini 1.4.0 was updated through immutable 1.4.1.

The staged API/worker is unaffected by this local-processing defect. Its two
handled predecessor-worker deadlocks were confined to the migration boundary;
all 11 enabled checks resumed, with zero stale claims, expired jobs, deadlock jobs
or blocked queries. Production aggregate tenancy confirms multiple accounts and
owners, so no single-user assumption is used. The exact npm signatures and
attestations of seven installed packages verify cryptographically; public archive
integrity and GitHub workflow/source provenance are retained separately.

The corrected source passes 916 CLI/MCP/OpenClaw and developer contract cases,
plus explicit malformed-cache reader regressions. The exact pre-fix source
reproduction yields four failures and one passing same-scope control. Fresh native
CLI tarball checks pass on Node 22, 24, 26.0.0, 26.2.0 and 26; native emitted
OpenClaw checks pass on Node 22/24/26, including actual `verify_local` processing
of six events into four project/environment groups without cloud requests.

## Corrective package publication and live retained clients

Corrective CLI 1.19.1 passes
[workflow 41831495218](https://github.com/debugbundle/debugbundle/actions/runs/41831495218),
and MCP 1.19.1 passes
[workflow 41831500100](https://github.com/debugbundle/debugbundle/actions/runs/41831500100),
both from `1bce158b430267160be1d1b10d4a8e10c74e0233`. Their installed scope
regressions and native clients pass. The developer catalogues now pin that verified
package. Exact Registry/ClawHub acceptance, public developer catalogue promotion
and final app/site rollout were subsequently completed in the final receipt below.

Fresh public CLI 1.19.1 and MCP 1.19.1 read the actual production project, its
three retained service IDs and three logical definitions; connected diagnostics
succeed and the MCP exposes 149 tools. Independently, retained public CLI 1.18.2
and MCP 1.18.3 still read the same live project and original service IDs, with the
old 139-tool catalogue intact. These checks are read-only and project-scoped.
The two migration-boundary incidents remain single occurrences with their
evidence retained; no later recurrence appeared in these reads.

## Final production receipt

Production rollout
[41837159203](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41837159203)
completed successfully from cloud `a3e8892ed4794ac6466b3eb99f7689169f2137e0`,
core `3292618b59dc5388786278c662fa3afa1ae8d279` and site
`c9cab5efa64372686bac780308de2a8238440da5`. Canonical core
[v1.21.0](https://github.com/debugbundle/debugbundle/releases/tag/v1.21.0)
and site [v1.7.0](https://github.com/debugbundle/site/releases/tag/v1.7.0)
release workflows pass (`41835815532` and `41836473330`). The matching site
contract rerun `41831740785` passes after core promotion.

Exact-source CI `41832699365` passes all 110 shards (5,133 cases, including 103
real Postgres cases), lint, typecheck, build and native Gemini on Node 22/24/26.
Merged coverage is 87.78% lines, 90.14% functions, 78.64% branches and 86.82%
statements. All 220 changed source files pass the existing coverage gate; 24
below-threshold files pass its changed-line rule. CLI runtime CI `41832698839`
passes the supported Node matrix. The later documentation-only reconciliation
does not rebuild or replace these immutable release artifacts.

The active API/worker image digest is
`sha256:4776feced637f813c7a48d381a153e4c446dc1fc7b462ed81e5359fcad6b97b4`,
with source revision `3292618b`. The verified previous stable image is
`sha256:bb44f1e2a03fca201e0721923b5e46246cb8be9c5f9c173ce7208c9996da94c2`
from the first compatible 1.21.0 stage. All six candidate/active/stable API/worker
references pass `project-services-v1` and `postgres-v1`. Both actual containers
match the active image references, are healthy, and have zero restarts/OOMs.
Retention leaves exactly the active release and that verified previous stable.

The ledger remains at 66 with all previous 64 records, checksums and application
timestamps unchanged. Historical project/service/token IDs are preserved;
membership, alert-rule, agent-token and probe identities remain unchanged. All
service instances have logical definitions. Legacy bindings and merge operations
are both zero. All 11 enabled endpoint checks resumed with no stale claims,
expired jobs, deadlock jobs or blocked queries. The two handled predecessor-worker
migration-boundary incidents remain single occurrences; their evidence and the
pre-existing incident are retained. All eight existing production alarms are OK.

The served app build ID is exactly `3292618b59dc5388786278c662fa3afa1ae8d279`.
The new service guide and OpenAPI schema return 200. Thirty app/site resources,
including 24 JS/CSS assets, match their S3 origin SHA-256 bytes with the expected
cache headers; duplicate HTTP header values are preserved in receipts. Existing
SDK credentials return 200 with private/no-store, credential/origin Vary and
correct browser CORS. OAuth discovery and the hosted MCP contract remain valid;
the independent authenticated OpenAI service response is unchanged from baseline.
New and retained public CLI/MCP clients pass actual scoped production reads.

Both exact ClawHub 1.19.1 final reviews and antivirus scans pass; portable-skill
moderation is clean/unblocked. Normal remote installation succeeds without force
for both the portable skill and the plugin on current OpenClaw 2026.10.10. The
plugin's installed native runtime registers 149 tools and passes scoped reads and
local correlation processing. Broad search discovery remains the previously
separated 5/7 result; it is not security or installation acceptance. Smithery's
retired publishing path and OpenAI's separate submission remain outside this
release. Gemini `ed7d95232d0c5c51dfa22a15ff115bc8b30a66f0` / `v1.4.1` has ZIP
SHA-256 `32b16dc8a0e484d4d88e5d30b6f4adcd332650f420a96465eca9c19a08aab3cc`;
all five public files match and a normal public 1.4.0-to-1.4.1 upgrade passes.

The final isolated merge rehearsal passes with CLI/MCP archives byte-identical to
npm 1.19.1: CLI SHA-256
`4c4fd7ccd36352ee2084e83340f870aa61105db593bab13502987d3c8e7ee31c`,
MCP `3f8b02136a2e5d1e3b4524f65ff169f17e9238755e99466b9e3fb915c192e0d4`.
Original SDK tokens, new credential scopes, worker/API restarts, six immutable
objects and origin cleanup pass. Owned fixture containers/volumes are removed.
Seven installed packages have verified npm registry signatures and attestations.

### Deliberately separate next task

Production is multi-account/multi-owner. Merge apply remains disabled. No existing
project was consolidated, no consumer product was changed, and no repository was
adopted. Inventory the owner's actual named DebugBundle projects and refresh
access/settings before activation/preview/apply. Report server consolidation,
separately authorised repository edits and their deployed-runtime verification as
independent completion gates. The overall consolidation TODO stays open for that
later work; production release qualification is complete.

Local receipts are under `.tmp/project-service-release-20261104/`,
`.tmp/mcp-ecosystem/1.19.1/report.json` and
`.tmp/project-service-runtime/receipt.json`. They contain exact public artifact,
header, image, migration, preservation, installation and monitoring evidence.
