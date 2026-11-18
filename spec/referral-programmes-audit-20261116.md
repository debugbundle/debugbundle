# Referral programmes — follow-up implementation audit

16 November 2026. Scope: the approved referral/programme implementation in core,
the independent site and the private cloud source companion, on their dedicated
`feature/referral-programmes` branches. This is a source, automated workflow and
local runtime audit before owner review. The four discovered issues are corrected
and local validation passes. Ready for internal review; real-provider and deployed
acceptance remain release prerequisites, not claims made by this audit.

The subsequent [UI review](referral-ui-review-20261116.md) refreshes the public and
app presentation. Its current builds and four refreshed component coverage maps
supersede the corresponding UI artifacts recorded below; financial/runtime source
and release prerequisites are unchanged.

## Findings and corrections

| Finding                                                | Effect                                                                                           | Correction and regression                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public URL hint survived removal/replacement           | Refresh or retry could present the previous code again                                           | Successful selection/removal clears only `offer`, preserving other query fields, anchor and router state. Failed removal retains the original hint. Site client regressions fail before the fix and pass afterwards.                      |
| Every HTTP 409 was treated as a replacement conflict   | An invalid code could open a misleading replacement prompt                                       | Parse the bounded domain error code; only `offer_change_requires_confirmation` opens confirmation or reads the existing pending offer. Invalid/unavailable codes follow the normal error path.                                            |
| Code blocking raced claim admission                    | A block could commit between eligibility validation and a new promise                            | Both legacy and versioned claim paths hold the registry row through admission. Two real-Postgres transaction regressions reproduce the race, verify blocking serialisation and preserve the earlier saved attribution.                    |
| Near-100% discounts could round a base invoice to zero | Zero invoices preserve the benefit, allowing repeated recovery instead of a one-invoice discount | Activation/scheduling validates all selected catalogue plan/interval totals. Zero totals return `programme_discount_invalid`; drafts stay inactive and the operator gets revision guidance. Both 99.90% and 99.99% with Solo are covered. |

The financial correction adds no migration and changes no installed commercial
promise. Existing 20%/50% launch economics and legacy 10% Business terms remain
covered by the purchase and finance regressions.

## Acceptance audit

| Requirement  | Boundaries reviewed and evidence                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR/AC-REF-01 | ASCII normalisation, creator/promotion/legacy uniqueness, permanent aliases, deletion, concurrent reservation and blocking; policy, programme and compatibility tests.                                                                                            |
| FR/AC-REF-02 | Immutable versions/provider binding, explicit activation, caps under concurrent claims, pause/end preserving saved benefits; programme and purchase integration.                                                                                                  |
| FR/AC-REF-03 | Signed mixed-format cookies, first valid passive visit, explicit correction, atomic email/GitHub intent, bounded retry, exact Owner/workspace, no-cookie manual claim and cross-session durable reads; signup, compatibility, domain and UI cases.                |
| FR/AC-REF-04 | Six plan/interval totals, capacity/tax exclusions, signed quote identity/expiry, exact provider parameters, explicit introductory/renewal display, error/cache/CORS behaviour and zero-total rejection; purchase, API, coupon, quote and site cases.              |
| FR/AC-REF-05 | Single identity benefit, retained paid history, holiday replacement preserving the partner, trial-safe claim deadlines and frozen Checkout; programme, compatibility and billing cases.                                                                           |
| FR/AC-REF-06 | Default seven-day protection, exact scoped grant, revocation/expiry and admitted-attempt replay; existing and new checkout tests.                                                                                                                                 |
| FR/AC-REF-07 | Analytics allowlist/email ceremony, session CSRF, hashed 15-minute token/session/workspace/action delegation, audit and bounded inventories, API/CLI/ordinary MCP parity; operator and API suites.                                                                |
| FR/AC-REF-08 | Frozen commission, original calendar window, integer cumulative cash/refund allocation, zero/trial and failed invoices, idempotent/out-of-order receipt processing, reconciliation holds, manual payout races; original finance and new purchase/recovery suites. |
| FR/AC-REF-09 | Public page/footer/route manifest, dynamic terms/examples, creator states, legal/docs and announcement draft; site tests, export and generated-contract tests.                                                                                                    |
| FR/AC-REF-10 | Additive migration, installed data/checksums, exact readiness, immutable guards, account deletion/export, project-consolidation preservation, migration-before-runtime and compatible rollback floor; integration plus cloud source tests.                        |

Audit also checks source/module boundaries, fixed redirect destinations, no secret
or private identity in public projections, no provider calls under claim locks,
bounded transient cleanup and test-resource ownership. No SDK transport or
restricted/OpenAI tool catalogue is changed.

Stripe's current [coupon object reference](https://docs.stripe.com/api/coupons/object)
confirms that product scope is requested with `expand=applies_to`, and that
`max_redemptions`/`redeem_by` can invalidate future redemption. The verifier checks
exact percentage, once-only duration, mode and eligible base products; provider
caps/expiry are rejected to preserve promised trial conversions. This reference
check is separate from real provider qualification.

## Verification receipts

| Gate                                                                                | Verified result                                                                                                                                               | Local receipt                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Final referral domain, real-Postgres, API, CLI, component and contract coverage run | 317 tests across 46 files pass with actual V8 coverage                                                                                                        | `.tmp/referral-audit-coverage.log`, `.tmp/referral-audit-current-coverage/`             |
| Legacy attribution, benefits, ledger, reconciliation and Checkout coverage run      | 73 tests across five files pass                                                                                                                               | `.tmp/referral-audit-legacy-coverage.log`, `.tmp/referral-coverage/`                    |
| Changed-source coverage                                                             | All 108 changed source files pass the unchanged checker; eight qualify through its changed-executable-line rule                                               | `.tmp/referral-audit-coverage-gate.log`, `.tmp/referral-audit-coverage-provenance.json` |
| Types, lint and formatting                                                          | Full core typecheck and lint pass; final focused lint/format pass; independent site typecheck passes                                                          | `.tmp/referral-audit-{typecheck-final,lint,lint-final,format-check,site-types}.log`     |
| Core and automation builds                                                          | Shared schemas, CLI, MCP, dashboard and OpenClaw builds pass                                                                                                  | `.tmp/referral-audit-{build,openclaw}.log`                                              |
| Public site                                                                         | 106 tests pass; 152-route static export and recovery checks pass                                                                                              | `.tmp/referral-audit-site-final.log`, `.tmp/referral-audit-preview.log`                 |
| Hosted source                                                                       | 71 deployment, reader compatibility, context and edge checks pass                                                                                             | `.tmp/referral-audit-cloud.log`                                                         |
| Local served runtime                                                                | Exact rebuilt HTML/client bytes, local API address, six-plan/interval policy, cookie selection/removal, typed invalid-code failure and Origin protection pass | `.tmp/referral-audit-runtime.json`                                                      |
| Local hosted candidate                                                              | Build passes; all 1,464 runtime files match the embedded manifest inside the network-disabled image                                                           | `.tmp/referral-audit-image.log`, `.tmp/referral-audit-artifact-manifest.json`           |

Earlier in this audit, a broader 376-test regression run and 152-test database
run also passed (`.tmp/referral-audit-regressions.log` and
`.tmp/referral-audit-integration-final.log`). These overlap the final runs and are
not added together as unique scenarios. Failed Red reproductions are retained
separately from passing results. The earlier 6,977-execution full qualification
is historical evidence, not a rerun claim for these later changes.

Source reconciliation compares all 1,294 core runtime TypeScript files with the
full-run manifest: six changed, 1,288 unchanged. For the six changed files, the
coverage merge **replaces** the old maps with fresh measured V8 maps from the two
final coverage runs; it never adds stale line maps to changed source. Original
measurements are backed up. Combined coverage is 88.86% lines, 90.79% functions,
87.41% statements and 79.50% branches. No checker, threshold or counter was altered.

Current local image:
`sha256:b04ab4e84291f8bdb8447b4de751a5e33767b174da14e79ea5f740c1bb836b70`.
Its 1,464-file source digest is
`7050ec8d3e2e89a0f98e0ae658c027da69bfff53f112928b3263a081d47116ef`;
the compatibility label remains `referral-offers-v1`. The current context is
`.tmp/referral-runtime-candidate`; the original context is preserved at
`.tmp/referral-runtime-candidate-before-followup-audit`. Fresh artifact hashes
and review archives are listed in `.tmp/referral-audit-artifact-manifest.json`.

The public preview is `http://localhost:5292/referrals/` with local code
`REVIEW20`. These HTTP and compiled-byte checks do not claim browser rendering,
authenticated signup or real Checkout acceptance. Existing non-blocking build
warnings remain visible in the logs.

## Release prerequisites

This audit cannot establish real provider or deployed-runtime acceptance from
synthetic responses. Before production activation:

1. Complete owner review of customer, creator and operator journeys. The running
   local `REVIEW20` preview covers only public context, terms and prices; it does
   not provide account authentication or Checkout.
2. Qualify the six plan/interval combinations in an authorised Stripe sandbox,
   including capacity/tax, failed/retried payment, expiry, zero invoices, refund
   and dispute receipts. Validate exact products/coupon and retain provider
   receipts using the pinned API version.
3. Release the additive migration and compatible API/worker readers with new
   claims disabled, retain a verified compatible rollback pair, and check actual
   readiness and public/API origins. Then configure/bind/activate the concrete
   programme and publish matching site/blog content under release authority.

No commit, push, publication, deployment, provider mutation, live programme
activation, transfer or other-product change is part of this audit.
