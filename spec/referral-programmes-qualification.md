# Referral programmes — local qualification complete

16 November 2026. The approved implementation is ready for internal review.
Core, the independent site and the private cloud source companion remain local,
uncommitted on `feature/referral-programmes`. No push, publication, deployment,
provider write, live activation, payment/transfer or consumer change occurred.

This records the original qualification snapshot. The later
[follow-up audit](referral-programmes-audit-20261116.md) records four further fixes,
fresh final-source coverage, 106 site tests and the rebuilt current image/artifacts.
Use that audit for current identities; the original receipts below are preserved.

## Final quality gates

| Gate                                                                        | Verified result                                                                                                                                                                      | Local evidence                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Complete unit/component/contract/infrastructure and disposable-Postgres run | All 143 groups pass; 868 file executions, 6,977 passed test executions and four existing skips                                                                                       | `.tmp/referral-final-unit-coverage.clean.log`                                                                              |
| Receipt-adapter coverage refresh                                            | Exact ten-file owning group passes 92 cases, including two additional paid/draft Solo cases; runtime source unchanged and refreshed measurements included before full coverage merge | `.tmp/referral-complete-receipt-shard.log`                                                                                 |
| Changed-code coverage                                                       | Pass for all 108 changed source files; eight below-threshold files qualify through complete changed-executable-line coverage under the unchanged checker                             | `coverage/coverage-final.json`, `coverage/coverage-summary.json`                                                           |
| Merged measurement                                                          | Lines 88.86%, functions 90.79%, statements 87.41%, branches 79.49%; the repository's changed-file gate applies its documented metrics and threshold                                  | Same coverage artifacts                                                                                                    |
| Lint, types and formatting                                                  | Full lint/types pass; subsequent test-only additions and the final Checkout correction pass focused lint; final changed-source formatting passes                                     | `.tmp/referral-final-lint.log`, `.tmp/referral-final-typecheck.log`, `.tmp/referral-final-format.log` and focused receipts |
| Core candidate and OpenClaw                                                 | Shared schemas, CLI, MCP, web and wrapper builds pass; bundle boundary checks pass                                                                                                   | `.tmp/referral-final-build.log`, `.tmp/referral-final-openclaw.log`                                                        |
| Independent site                                                            | 103 tests, 152-route static export, export recovery checks and types pass; authored formatting passes                                                                                | `.tmp/referral-final-site-check.log`, `.tmp/referral-final-site-format-check.log`                                          |
| Public contract parity                                                      | Four current contract checks pass, including exact generated policy/API/automation/reference files                                                                                   | `.tmp/referral-final-public-contracts.log`                                                                                 |
| Hosted source                                                               | 71 deployment/reader/context/edge checks pass; compatible local image builds and exactly matches its source manifest                                                                 | `.tmp/referral-final-cloud-check.log`, `.tmp/referral-final-hosted-image.log`                                              |

The main run's test counts are execution counts, not a sum of unique scenarios
across overlapping focused reruns. The receipt group was requalified after two
new test cases were added; no production file or measured coverage count was manually changed.
The same full-run merger and unchanged coverage checker consumed its real output.
All newly added referral scenarios ran. Earlier interrupted/failed diagnostics
are retained separately and are not final gate receipts.

Key database evidence includes the 17-case delegation matrix, all six real-domain
purchase/invoice combinations, atomic email/GitHub signup, legacy finances,
zero-invoice retirement, stale/deleted receipt leases and actual HTTP composition.
The 111-case consolidation matrix passes, with a new comparison preserving all
saved offer tables across a real merge. The 47-case purchase/legacy/Checkout run
proves that saved promises survive a lost signup acknowledgement and paused
programme while unresolved hints still block unconfirmed full-price purchase.

## Source and artifact identity

### Later local public-preview wiring check

The owner-provided screenshot exposed a local review configuration gap: the
static preview called hosted offer routes that have not been deployed. The
additional `make referral-public-review` target now uses actual public routes on
loopback with a separately named synthetic tmpfs database and clearly labelled
programme. It does not activate a production programme or provide private account,
mail, Checkout or payment transports. This local tooling and its rebuilt site
export are later evidence, outside the original full-run source/artifact snapshot.

Four `offer-public-review.integration.test.ts` cases pass; core typecheck and
focused lint/format pass. The webpack export completes, and the actual served
HTML and offer JavaScript match its rebuilt files. The compiled offer fetch uses
`http://localhost:3003`. Real local HTTP checks verify the 20% / 50% / 12-month
programme, empty fresh context, pending `REVIEW20` with an HttpOnly cookie,
credentialed exact-origin CORS and successful preflight; an untrusted pending
write is 403 and an unauthorised account write is 401.

Receipts: `.tmp/referral-public-review-tests.log`,
`.tmp/referral-public-review-typecheck.log`, `.tmp/referral-public-review-lint.log`,
`.tmp/referral-public-review-start.log`, `.tmp/referral-public-review-api.json`
and `.tmp/referral-public-review-served.json`. The existing review guide documents
startup, stop, synthetic-data ownership and the public-only review limitation.

### Original qualification snapshot

The final runtime source hashes recorded before the complete run are in
`.tmp/referral-final-source-start.json`; the original final reconciliation verified
no drift. The follow-up audit separately accounts for six later runtime changes.
The complete file/route/table inventory and repository heads are in
`.tmp/referral-review-inventory.md` and `.tmp/referral-review-source-manifest.json`.
`.tmp/referral-review-artifact-manifest.json` records SHA-256 identities for the
CLI/MCP/OpenClaw bundles and dashboard/site review archives.

Hosted local image: `sha256:ef121a53d884012f1ca3cbd4e242027d3240624d9a70ea93a1f8b3c3810795a2`.
Its 1,462-file runtime source digest is
`8fd6a2097053890de33151d89bb1b040922d53f0745b6c3439e2222d8e1db05f`.
The compatibility label is `referral-offers-v1`. Previous local source snapshots
and the unrelated business candidate are preserved. Test harness cleanup removes
only its labelled disposable resources.

The original context is now retained at
`.tmp/referral-runtime-candidate-before-followup-audit`; the original review
archives remain historical. The follow-up audit links the replacement candidate
and fresh review archives without overwriting those original receipts.

## Acceptance limits and release boundaries

These are local source, mocked-provider transport, real disposable-database,
component and compiled-artifact receipts. No real Stripe sandbox acceptance,
production/data acceptance or owner browser review is claimed. Browser inspection
and screenshots were not used, following the source/test workflow in AGENTS.md.
Existing non-blocking build/test warnings remain visible in the raw logs.

New programmes default off; migrations seed no activation. The public announcement
remains `site/docs/drafts/referral-programmes.mdx`, outside published blog content.
The [review guide](referral-programmes-review.md) contains the separately authorised
provider configuration, six-combination sandbox, compatible rollout/rollback,
programme activation and publication gates. Do not treat this local qualification
as launch authority. Capture SDK versions and other products remain unchanged.

## Acceptance and pre-ship audit map

| Acceptance | Implementation and principal evidence owners                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-REF-01  | ASCII-before-casefold code schemas, permanent global registry; programme/compatibility integration, creator component and policy tests.                                                                                                                            |
| AC-REF-02  | Immutable policy/version/ownership guards, transactional caps and retained promises; programme, purchase and compatibility integration.                                                                                                                            |
| AC-REF-03  | Mixed-cookie hints, atomic email/GitHub signup intent, bounded recovery and exact workspace reads; signup/compatibility integration, management/sign-up domain and UI tests.                                                                                       |
| AC-REF-04  | Integer policy projection, exact signed quote and provider coupon/product verifier; six purchase combinations, API, price/customer component and site tests.                                                                                                       |
| AC-REF-05  | Identity locks and tombstones, independent attribution, confirmed replacement and trial-safe deadline; programme/compatibility/purchase and customer UI tests.                                                                                                     |
| AC-REF-06  | Exact subject/attempt grant under the existing billing lock; purchase and operator integration plus original admission regressions.                                                                                                                                |
| AC-REF-07  | Browser Analytics email gate or token plus scoped proof; 17-case DB authority matrix, actual HTTP/default composition, CLI/client/MCP contracts and operator component states.                                                                                     |
| AC-REF-08  | Frozen commission through existing receipt/ledger/payout authority; purchase, performance, zero-recovery/lease fencing and original financial regressions.                                                                                                         |
| AC-REF-09  | Runtime public policy and generated pure projection, public route/footer/legal/guide and unpublished announcement; site tests/export and core projection contract.                                                                                                 |
| AC-REF-10  | Ordered additive migration with twelve tables, exact readiness/index/trigger validation, compatible reader floor, retained financial identity/export and bounded transient cleanup; installed-upgrade/compatibility/inventory integration and hosted source tests. |

Audit inventory covers the domain/storage model, auth account transaction,
Checkout reservation/admission, receipt recovery/ledger/reporting, retention/export,
public and privileged HTTP, CLI/ordinary MCP, app components, public site and hosted
source. No capture SDK or restricted/OpenAI tool catalogue changes are involved.

Boundary review checks raw ASCII before casefold; bounded strict schemas and input
files; fixed redirect destinations; exact public Origin/no-store responses; normal
CSRF and Owner/expected-workspace guards; hashed, short-lived action/workspace proof;
redacted audit projections; exact quote/provider binding and no client-supplied money.
Public previews confer no eligibility, operator access or early-purchase authority.

Failure review covers concurrent aliases/caps/claims, invalid and stale states,
provider timeouts/lost acknowledgement, duplicate or stale worker leases, account
deletion and late/refunded cash. No provider I/O runs under financial DB locks.
Zero-invoice repair retirement requires complete exact provider evidence and cannot
reset an already collected/refunded benefit, release Checkout or start commission.
One late recovery acknowledgement may complete the same consumed invoice only.

Cleanup review separates expiring proof/signup state from permanent aliases,
accepted terms, identity tombstones, retirement evidence and accounting. Test
containers/networks have unique ownership labels and cleanup guards, no published
database port or persistent volume. Existing unrelated runtime candidates remain.
No new long-running service, recurring provider charge or automatic payout exists.

Schema review retains old checksums/bootstrap, uses the new ordered forward
migration and fail-closed readiness, and requires migration before consumers in the
existing hosted rollout. There is no destructive contraction. Disabling claims
keeps saved obligations, legacy recovery and offer-aware reconciliation available;
rollback cannot cross the documented reader floor.

The generated OpenAPI semantic comparison with the site starting revision retains
every existing path and schema. Only `/v1/account/export` and its existing page
schema change, additively listing the six public offer export sections. New offer
operations/schemas are appended; existing definitions remain semantically equal.
The ordinary MCP catalogue adds 26 operations (226 total); restricted/OpenAI
catalogues and all SDK manifests retain their prior contents/versions.

## Final audit corrections

Regression tests exposed and verified fixes for raw Unicode folding into ASCII
codes; provider coupon limits that could strand trial conversions; legacy alias
registration/blocking after migration; creator/operator alias races; exact-workspace
delegation; and a zero-invoice draft-repair loop. Both recovery acknowledgement
states, legacy recovery and stale/deleted receipt-worker leases are exercised.
Legacy signup now captures its durable hint even with new programmes disabled,
including provider-outage recovery; unrelated new intents retain their retry budget.
Public and signup notices distinguish available, unavailable and failed-validation
states, retaining the presented code without displaying false saved success.

The full database rehearsal also exposed the existing project-consolidation
inventory's missing classification for the twelve new account tables. They are
explicitly `unchanged_account`; an actual merge regression compares every saved
programme/claim table before and after consolidation. Unknown tables and project
references continue to fail closed. The final full gate includes this fix and the corrected forward-migration fixtures.

An interruption regression reproduced a durable new or legacy offer being blocked
by its still-pending signup acknowledgement. Checkout now checks the same Owner's
durable promise before treating that hint as unresolved. All six purchases with a
paused programme pass; unconfirmed hints still block, and original Checkout safety
and legacy benefit regressions pass in the 47-case combined run. No eligibility,
seven-day protection, coupon or signed-quote check was removed.
