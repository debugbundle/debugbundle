# Referral and promotion payment audit — 17 November 2026

The automatic payment-setup follow-up is qualified locally for internal review.
Two catalogue-validation defects were reproduced and fixed. The final billing,
offer/integration, type, lint and build checks pass. Real Stripe sandbox acceptance
and the existing controlled rollout remain release gates.

## Scope and corrected findings

FR/AC-REF-04 owns activation, advertised prices, coupon scope and purchase
composition. FR/AC-REF-03, 05, 06, 08 and 10 and the existing billing contract
provide the trial, saved-promise, admission, financial and compatibility guards.
This audit changes one runtime module, `packages/referrals/src/stripe-offer-catalogue.ts`.
Existing public interfaces, schema/migration checksums, dependencies and pricing
configuration are unchanged. The changes remain uncommitted on `feature/referral-programmes`.

| Finding                                                                  | Consequence                                                                                                                                | Correction                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup accepted duplicate or commercially mismatched eligible base prices | Activation could advertise a discount that Checkout could not admit, or whose configured provider price disagreed with the published quote | Require exactly one current price per eligible plan/interval. Use the existing billing validator with explicit canonical USD amount, interval/count, licensed usage and exclusive tax treatment before coupon creation. |
| Product exclusion skipped retained capacity prices                       | A retained capacity price sharing an eligible base product could receive the base-only coupon during recovery                              | Inspect retained prices as well as current ones. Inactive historical prices are allowed for scope inspection but remain unavailable for new purchases. All capacity products remain excluded.                           |

The new catalogue tests first produced nine failures and one passing compatibility
case (`.tmp/referral-payment-audit-red.log`). All ten pass after the fix, alongside
the existing verifier, provisioning and recovery tests. Synthetic price responses
now include the same commercial fields returned by Stripe; assertions were not
weakened to obtain a pass.

## Payment and failure review

- **Authority and activation:** only the existing authorised Activate/Schedule
  action prepares a coupon. Drafts, reads, previews, claims and quotes cannot
  provision one. Stale, disabled or invalid transitions fail before provider work;
  final state is rechecked under the database lock. HTTP operator authority,
  CSRF/scoped delegation, input validation and safe errors remain enforced.
- **Retries and partial failure:** deterministic revision/mode identity and a
  stable idempotency key survive provider response loss and failed binding writes.
  Canonical read-back precedes creation and resolves uncertain acknowledgement.
  No retry rotates identity, mutates a saved binding or deletes a coupon.
  Competing activations preserve one immutable binding and one successful transition.
- **Purchase composition:** both programme kinds now have explicit tests from
  automatic activation through saved claim, signed full-price quote and repeated
  Checkout. Capacity remains a separate undiscounted line; the automatic coupon
  is applied once, promotion-code stacking is disabled, and retry reuses the
  same Checkout session. Existing six-plan/interval tests cover quote and ledger
  totals. Plain and legacy Checkout paths retain their existing behaviour.
- **Existing payment lifecycle:** the final regression covers subscription changes,
  renewals, capacity, webhooks, trial/early-purchase admission, interrupted payment,
  saved offers, zero-invoice recovery, refunds, disputes, collected-cash commission
  and payout compatibility. Existing manual coupon bindings remain supported.
- **Provider boundary:** the pinned installed Stripe SDK is exercised with an
  in-memory HTTP transport. It checks real request encoding, exact decimal
  percentage, once-only duration, expanded product scope, version header, stable
  idempotency and one create despite lost acknowledgement. No external HTTP
  request or actual Stripe credential is used by these tests.
- **Resource and schema safety:** provider calls retain the existing 15-second /
  30-request budget, eight-second per-request maximum and no automatic network
  retries. No provider work holds database locks. This audit adds no migration;
  the existing forward-migration, readiness and compatible API/worker rollback
  requirements still apply. Isolated database tests use owned tmpfs resources
  with no host database port; their cleanup completed successfully.

## Final local evidence

The suites overlap; counts below are individual gate results, not a unique total.
All package commands used Docker-scoped Make targets.

| Gate                                                             | Result                                                                                                                                              | Receipt                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Final existing-payment and referral regression                   | 864 tests, 101 files pass, including API/CLI/MCP and billing UI                                                                                     | `.tmp/referral-payment-audit-final-regression.log`                                                          |
| Offer and billing integration suite with V8 coverage             | 457 tests, 55 files pass in the isolated database harness                                                                                           | `.tmp/referral-payment-audit-integration.log`                                                               |
| Real Stripe SDK transport and activation-to-checkout composition | 11 tests pass; final nine provider/composition tests rerun after a fixture typing correction also pass                                              | `.tmp/referral-payment-audit-composition.log`, `.tmp/referral-payment-audit-complete-composition.log`       |
| Changed runtime coverage                                         | Catalogue statements, lines and functions 100%; branches 90.74%. Shared provisioning and coupon verification retain 100% statements/lines/functions | `.tmp/referral-payment-audit-coverage/coverage-summary.json`, `.tmp/referral-payment-audit-provenance.json` |
| Types, focused lint and format                                   | Repository typecheck and all eight touched runtime/test files pass                                                                                  | `.tmp/referral-payment-audit-complete-check.log`                                                            |
| Local deployment and site workflow checks                        | 71 tests pass, including compatible candidate/rollback and migration orchestration fixtures                                                         | `.tmp/referral-payment-audit-rollout.log`                                                                   |
| CLI/MCP/dashboard rebuild                                        | Pass; existing dashboard chunk-size warning remains                                                                                                 | `.tmp/referral-payment-audit-build.log`                                                                     |
| Fresh unpublished API/worker image                               | Frozen dependency install, runtime imports, migration and capability checks pass                                                                    | `.tmp/referral-payment-audit-image.log`                                                                     |

The image is `sha256:2c49a1909ef1251c04cbc1372d01719a783b7901ad0157bc91e50355f8a5e59f`.
Its 1,487-file source manifest is
`68eef3544a9df379bd5506327ab6e6ff3328af12e83ed2892943adc66f1c8f42`.
The audited catalogue source matches the snapshot. Source hashes and measurement
provenance are recorded separately; no global coverage counters or thresholds
were overwritten. The previous local image context was preserved before rebuilding.

## Review and release boundary

The [internal review guide](referral-programmes-review.md) and
[automatic payment setup review](referral-automatic-payment-setup-review.md)
remain the journey and implementation references. No additional UI or public-site
behaviour changed in this audit. Existing unrelated session work is preserved.

Before production activation, exercise the six plan/interval combinations in an
authorised Stripe sandbox, including tax/capacity, retry/failure, zero invoices,
refund/dispute receipts and automatic coupon preparation with the actual account
permissions. Then use the documented migration-before-runtime rollout, verify
readiness and the compatible rollback pair, and separately approve the concrete
campaign/publication. The prior payout-key and retention decisions remain as
recorded in the [payout review](referral-payout-preferences-review.md).

No real Stripe call, campaign activation, charge, transfer, commit, push,
publication, deployment or consumer-product mutation was performed. Local source,
synthetic transport and build evidence do not establish browser, owner, provider
or production acceptance.
