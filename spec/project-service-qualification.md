# Project/service consolidation qualification

Archived pre-release local audit, 4 November 2026. One implementation phase, governed
by FR-PJS-01–04, AC-PJS-01–03 and the acceptance matrix in
`project-service-consolidation.md`. These local receipts predate publication. The
subsequent authorised production release is complete; see
[the final release receipt](project-service-release-20261104.md). Hosted merge
activation, owner-project consolidation and consumer adoption remain separate.

## Executed local evidence

Final audit on 2026-11-04 found and corrected daily-notification scope,
recipient-membership and concurrent-pause gaps. All five new Postgres regressions
failed before the fix and now pass. The complete coverage, static, integration,
sealed-image and retained-client checks below pass for the corrected candidate.
No known local release blocker remains; production qualification stays separate.

| Boundary                             | Evidence                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete coverage gate               | `make test-unit`: 5,131 passed across 110 shards; lines 87.79%, functions 90.15%, branches 78.61%, statements 86.83%. The unchanged changed-file/changed-line gate passes for all 215 changed source files.                                                                                                                                                                |
| Static checks                        | Repository-wide lint and TypeScript checks pass. Changed source/test files pass formatting, including the final-audit fixes and corrected legacy fixture.                                                                                                                                                                                                                  |
| Schema and checked cutover           | 103 Postgres cases across 13 files, including exact 64-checksum predecessor, fresh bootstrap, bounded 1,000-service cutover, unknown dependency rejection, scopes, nested origins, repository authority and crash/retry boundaries. The final combined coverage run passes.                                                                                                |
| General integration                  | 180 passed, one existing optional test skipped, across 40 files on disposable Postgres/Redis/LocalStack. Real concurrent saved-funnel limits retain one created/one limit-reached result.                                                                                                                                                                                  |
| Installed clients and real processes | `make project-service-runtime`: integrity-checked retained CLI 1.18.2 and MCP 1.18.3, retained Node SDK 3.2.0 and fresh candidate CLI/MCP archives. Original NULL-scope tokens and a newly created canonical snapshot both ingest through real API/worker processes.                                                                                                       |
| Restart, artifacts and deletion      | The installed rehearsal restarts the worker after merge and a compatible API with apply disabled. Six pre-merge S3 objects retain exact SHA-256 bytes; both origin namespaces and their S3 objects are cleaned by canonical deletion.                                                                                                                                      |
| Mixed API control                    | Recorded predecessor `88a9a42c1762bab1f5bb7e73f908d67eeb67b99a` and candidate serve one forward-migrated disposable database before consolidation. Original token/read separation and return to the predecessor before any merge pass. This does not authorise a pre-contract rollback after merge.                                                                        |
| SDK equivalents                      | All 12 maintained source capture surfaces pass their existing config/probe/transport equivalents; all 11 repositories remain clean. React Native's Android native bridge passes; its iOS test harness reports 97.14% Swift and 100% Objective-C line coverage. Native production SPM support is not inferred from that harness.                                            |
| Builds and public guidance           | Core shared-types/CLI/MCP/web candidate build and OpenClaw validation pass. A normal installation on pinned OpenClaw 2026.6.9 loads all 149 tools and passes installed native scoped requests. The frozen old fields and hosted OpenAI catalogue remain protected. Public documentation tests (41 plus eight audit-script cases), typecheck and bounded static build pass. |
| Hosted preparation                   | Cloud deployment contract tests (25) and immutable-image gate tests (3) pass. Image labels and a read-only six-image candidate/active/stable check are prepared; no actual hosted image, fleet, settings or cache qualification is claimed.                                                                                                                                |

The installed rehearsal stores its artifact hashes and results under
`.tmp/project-service-runtime/receipt.json`; the source SDK identities are in
`.tmp/project-service-sdk-sources.json`. These are local candidate receipts,
not publication or production evidence. Final provenance must include the final
source snapshot and immutable release artifact identities before publication.

The focused 103-case Postgres run completed in 36.00 seconds on disposable local
Postgres 16, including the 1,000-service cutover fixture. Admission caps observed
metadata rows at 25,000, configuration inventory at 5,000 rows/16 MiB, and service
name metadata at 4 MiB. Cutover has a ten-second overall budget, five-second
statement limit and one-second lock bound. These are rejection ceilings, not
production throughput promises; live qualification remains separate.

## Pre-ship review

The review uses `pre-ship-review` across the following domain paths:

| Modules and data path                                                 | Required failure/compatibility review                                                                                                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service definitions, repository fallback, observed input/view aliases | Stable instance IDs, safe outward metadata, explicit clear/default semantics, complete pagination, unknown legacy names and rename reservations.                                                                            |
| Migration ledger, readiness, scope/configuration triggers             | Ordered forward-only changes; exact predecessor checksums; missing/disabled guard failure; migration before startup; ordinary management serialization and non-blocking trigger fences.                                     |
| Preview, reservations, journal, leases and cutover                    | Same current owner/account/access/settings, unknown dependency blockers, explicit bounded mappings, stale plans, duplicate keys, transactional cutover, cancellation, expired leases and truthful post-commit verification. |
| Ingestion, SDK config, probes and capture rules                       | Original credential authority/signing identities, immutable input bytes, durable lightweight acknowledgement, per-origin accounting, bounded private/no-store config and preserved server evaluation.                       |
| Incidents, improvements, evidence, bundles, profiles and deployments  | Current membership against retained origin closures, original IDs/keys/fingerprints/history, no broadened restricted reads and no rewrite of historical artifacts.                                                          |
| Alerts, webhooks, GitHub, notifications, weekly reports and health    | Original rules/scopes/repositories/recipients/dedupe, explicit later widening, queued work after cutover/restart, stable public selections and first-service registration.                                                  |
| Analytics, quotas, retention, account export and deletion             | Origin-scoped privacy/uniques, truthful aggregate coverage, preserved usage claims, effective canonical retention, complete closure cleanup and credential-free exports/receipts.                                           |
| API/client/CLI/MCP/OpenClaw and existing web data fetching            | Shared domain calls, validated request/response boundaries, read/manage separation, retryable conflicts, frozen old fields, optional new inputs and retained deep links without late-response overwrite.                    |
| Repository adoption                                                   | Explicit authorised root, safe bounded files, semantic/hash checked preview, preserved custom data/modes/caches, stale/forged plan rejection, conditional rollback and lock ownership.                                      |

The broad tests found and corrected two real regressions: a same-statement
snapshot prevented first health-check service registration, and a NOWAIT entry
fence rejected ordinary concurrent management edits. Historical migration tests
now start from exact predecessor SQL, rather than deleting old tables underneath
newer guards/checksums. The frozen MCP fixture remains unchanged; only explicitly
documented optional additions are allowed by its comparison.

Final trust-boundary review found and fixed cross-project GitHub repository
selection through service metadata. Dispatch now accepts only repository
registrations within the canonical origin closure. Retained binding edits and
removal recheck current canonical access without creating default policy or
changing another origin. Current-owner installation disconnect uses the account
merge fence and a narrowly verified FK cascade; direct retained-row deletes
remain blocked. The database cases and 41 focused API/storage cases pass. The
complete run exposed an older sequential missing-record mock that still assumed
single-statement installation deletion. Its responses now model the bounded
transaction; null/zero expectations are unchanged and the complete GitHub lane
passes. No application change was needed for that fixture correction.

The subsequent final audit traced daily admission, short-digest conversion,
delivery membership and policy-revision checks. Physical-project equality had
silently dropped canonical rules covering imported incidents; retained membership
could still admit a revoked recipient; a pause on the canonical project was absent
from the preparation revision hash. All three paths now use the accepted rule
scope and effective canonical access/policy. Five database regressions cover old
narrow rules, new broad rules, known recipients admitted before/after cutover,
revocation, an intervening pause, exactly-once delivery and preserved digest
allowance accounting. Immediate and short-digest delivery share the same origin
predicate. No migration, SDK protocol or UI change was needed.

The audit also reconciles the plan's historical source inventory and stale
implementation-status language. CLI flags and positional operation selectors were
checked against the actual parser and remain unchanged.

Pre-ship review, final coverage/static checks, lock-ownership review and local
reconciliation pass. Slices 0–7 are locally qualified. The whole delivery remains
open at slice 8 for live consolidation and adoption. Its separately authorised
production release is now qualified in the linked release receipt.

Lock ownership regression is fixed: replaced locks are preserved and require
review. Its focused adoption/CLI lane passes 11 cases, including multi-service
monorepo subset preservation and unrelated-repository rejection. Six files
identified by the unchanged coverage gate gained real transport/auth/file cases;
the final complete gate passes without exclusions or weakened thresholds.

The sealed local image rehearsal also passes: candidate image
`sha256:11aada1b574055c79e595c78a557a06fb6877d1ad4015a5766b3cbccd9280874`
and historical predecessor
`sha256:6aec8aad6fd6b23b569e5bb04792fe7f44a3d5e963c744e529566ecb05f3b38a`
prove refusal before the exact three required migrations, unchanged predecessor
rows/columns/checksums, idempotent migration, API/worker readiness, legacy writes
and return to the predecessor before any consolidation. The additive project
server-evaluation flag is checked explicitly as false. The predecessor image is
explicitly unlabelled for project-service capability; it is not a post-merge
rollback candidate. Inputs, build identities and owned cleanup receipts are in
`.tmp/evidence-release/project-service-final-audit/check-6b23343e0181`.
The sealed candidate source context is
`75ba31f237b6bc3e578590b1465165ffe45e008fa6ff7354647988e2c7b5c467`;
its inventory excludes credentials, caches, consumer repositories and SDK trees.
Later documentation reconciliation does not change the qualified
application/runtime source. This audit rehearsal supersedes the earlier
`project-service-final` and `project-service-qualified` rehearsals.
The uncommitted candidate is based on core
`0ef64a60e3f93db4026ec293f8ff4de1e25bfddf`, site
`30b0f62a92ca1a2f09ea16e4dc4935978a4528b8` and cloud companion
`7797818535880b9afcc3c0526d5aa82ecffc71cb`. No new commit or tag was created.
The historical image predates the existing typed-evidence migration, so this
rehearsal applies that migration plus the two new project/service migrations.
The separate 64-migration predecessor fixture needs only the two new migrations:

| New migration                            | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `202611030001_add_service_definitions`   | `dffbb749d4b0616d97db174fb215300eec27ff8bcfd50fd2f13921c72d3a1c0b` |
| `202611030002_add_project_consolidation` | `7f6bb6eb7879f11b3d5717319673d232a4b82bd6f94c25b95fc9c0ef10830b16` |

## Installed artifact identities

| Archive                             | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `@debugbundle/cli` (1.18.2)         | `549a1cf507a0332e06899fe4772dc03ce0a902442501243a3c4fe180625c254f` |
| `@debugbundle/mcp` (1.18.3)         | `f79b83ff8ea338738f0c4b2586686b2ede7b6fc4df3cb4d4d1fd873d46934657` |
| `@debugbundle/sdk-node` (3.2.0)     | `9b8292fe0e9d5d0828bc6b7e7f1636a392ce34f6db81f399cb7c92c2bf6350b6` |
| `candidate-cli` (local-unpublished) | `53258003255455b6845d8e3057de50b5df0f06cdbe057849d728c2315c2d2c0a` |
| `candidate-mcp` (local-unpublished) | `ec5289a6bc9dbb8bdba9039e238791674402d69cbc09b0baca9f93a39fa06f9e` |

The source SDK commit inventory is recorded in
`project-service-sdk-compatibility.md`. Final local logs are named
`/tmp/debugbundle-project-{unit,lint,type,format,site}-final.log`,
`/tmp/debugbundle-project-scope-final.log`,
`/tmp/debugbundle-project-installed-runtime-final-source.log` and
`/tmp/debugbundle-project-image-{prepare,build,check}-final.log`.
The corrected final-audit reruns are recorded in
`/tmp/debugbundle-final-audit-{unit,static,lint,integration,runtime}.log`,
`/tmp/debugbundle-final-audit-notifications-{red,green}.log` and
`/tmp/debugbundle-final-audit-image-{prepare,build,check}.log`.
Only the sealed local images and archives above were rehearsed; publishing
requires final release identities and checks against the actual hosted fleet.

## Release and live gates

The original recommendation was core 1.21.0 and CLI/MCP/OpenClaw 1.19.0. The
actual published and production-qualified line is core 1.21.0, corrective clients
1.19.1 and site 1.7.0; see the final release receipt for exact identities. SDK code/wire
formats are unchanged and no SDK release or consumer upgrade is required by the
logical consolidation model.

Keep `PROJECT_MERGES_ENABLED=false` until ordered migrations, every actual API
and worker participant, a verified compatible stable rollback and the served
SDK-config cache/origin boundaries are qualified. See the cloud companion's
`runbooks/project-service-consolidation.md`. After a committed merge, every
rollback must retain `project-services-v1`, even with apply disabled.

Do not infer a single-user account from these fixtures. Effective membership,
revocation, current owner/account and incompatible invites/settings are tested.
The live owner's actual users, projects, access/settings and selected mappings
must be inventoried before a separately authorised live preview/apply.

Server completion, each authorised repository's adoption and actual deployed
runtime verification remain separate gates. Local source/artifact proof does
not close those live gates or authorise edits to another product.
