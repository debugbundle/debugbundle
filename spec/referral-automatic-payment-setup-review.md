# Automatic programme payment setup — local review, 17 November 2026

The approved follow-up removes manual Stripe setup from the normal programme
card. Activate and Schedule prepare or verify the once-only discount from the
immutable revision before changing its lifecycle. This applies to both referral
programmes and promotions. Existing manually bound coupons remain supported.
Work remains local and uncommitted on `feature/referral-programmes`.

The subsequent [payment audit](referral-payment-audit-20261117.md) adds exact
catalogue/retained-capacity validation and records the final billing regression,
actual-SDK synthetic transport and fresh API/worker image evidence.

## Acceptance and module inventory

FR-REF-04 and AC-REF-04 own the behaviour; the existing accounting and rollout
contracts continue to apply. No public route, request shape, database shape,
migration checksum, pricing configuration or dependency version changed.

| Boundary                       | Implementation and retained behaviour                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle policy               | `programme-lifecycle.ts` shares legal transitions, expected-state, positive first-invoice and unlimited-claim checks between management, locked storage and existing UI controls.                                                                                                                                         |
| Provider catalogue             | `stripe-offer-catalogue.ts` shares exact coupon/product verification with Checkout and recovery. It rejects incomplete, mixed-mode, inactive, oversized or capacity/ineligible-product scope. Both intervals of the same eligible plan may share a product; domain target-price checks still enforce the chosen interval. |
| Automatic preparation          | `stripe-offer-provisioning.ts` derives mode from server-configured prices and prepares the immutable percentage, once-only duration and sorted eligible base products. Response product scope is explicitly requested. Metadata contains only programme/version UUIDs.                                                    |
| Existing verifier              | `stripe-offer-coupon.ts` retains its public function signature, target-price validation, sanitised errors and read-only Checkout/recovery behaviour.                                                                                                                                                                      |
| Shared service and persistence | `offer-management.ts` prechecks before provider work and calls existing immutable binding storage. `offer-programme-store.ts` repeats lifecycle checks under locks before transition. `default-offers.ts` supplies the provider preparation dependency.                                                                   |
| Privileged interfaces          | The existing HTTP state action calls the shared service behind operator verification, CSRF or scoped delegation, strict input validation and audit. CLI and ordinary MCP retain the same request operation; MCP describes its provider side effect. The manual provider-binding operation stays compatible.               |
| App                            | The existing programme card/confirmation handles preparation, pending, error and retry; coupon-ID/live-mode controls are removed. Drafts and promotional-code reservation retain their existing controls.                                                                                                                 |
| Local simulator                | `scripts/dev-mock/referral-offers.ts` simulates the same lifecycle without real provider clients. Existing unsupported payout actions and live-binding refusal remain explicit.                                                                                                                                           |
| Public contract/docs           | The new typed setup error is projected to the site; generated API/reference artifacts and the referral guide match the source. Requirements, acceptance, architecture and accounting navigation are updated.                                                                                                              |

## Failure and trust review

- Draft creation, reads, previews, claims and quotes cannot provision a coupon.
  Only the authorised Activate/Schedule path can do so. Disabled, stale, ended,
  zero-invoice or unacknowledged unlimited requests fail before provider writes.
- Each revision/mode has one deterministic coupon ID and stable idempotency key.
  A canonical read comes first; only a genuine provider missing-resource response
  permits creation. A failed or ambiguous create gets one canonical read-back.
  Retries never rotate identity, replace a saved binding or delete a coupon.
- Product scope, mode, exact percentage, duration and automatic-coupon ownership
  metadata are verified. Capped, expiring, unscoped or mismatched coupons fail
  closed. Configuration never comes from a customer code or browser mode flag.
- Preparation has a 15-second, 30-request budget; each provider request has at
  most eight seconds and no automatic network retry. Catalogue validation and
  scope bounds precede creation. No provider request holds a database lock.
- Provider/binding failure leaves the lifecycle unchanged and returns the safe
  `programme_payment_setup_failed` error. Competing activations revalidate under
  the existing lock; one transition succeeds and the binding remains unique.
  An unused coupon after interruption/concurrent ending is retained safely and
  reused by identity if eligible; there is no destructive cleanup.
- No customer, subscription, invoice, charge, promotion code or payout is created
  by setup. Trial benefits, internal claim limits, immutable saved offers, normal
  renewals, extra capacity, quote admission and collected-cash accounting retain
  their existing paths. Provider expiry/redemption caps cannot strand saved trials.
- There is no schema change in this follow-up. The earlier additive programme
  migrations and compatible API/worker rollback floor remain required for release.

## Qualification

All commands used Docker-scoped Make targets. Provider transports are synthetic;
integration tests use isolated owned tmpfs PostgreSQL with no host database port.

| Gate                                              | Result and local receipt                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad referral/offer regression with V8 coverage  | 397 tests across 48 files pass. Includes offer purchase/recovery/signup/compatibility, legacy attribution/ledger, payout preferences, API/CLI, components, simulator and public-contract projection. `.tmp/referral-automatic-discount-final-regression.log`                                                                                                                                                                                 |
| Final provider response and scheduling regression | 24 tests across three files pass after the final response-expansion correction. Both referral/promotion Activate/Schedule, pause/resume, persistence failure, lost acknowledgement, concurrency and HTTP activation are exercised. `.tmp/referral-automatic-discount-expansion-green.log`                                                                                                                                                    |
| Changed application coverage                      | All 14 changed application modules exceed the 80% statements/lines/functions floor. Lifecycle, catalogue, coupon verifier and provisioning modules have 100% statements/lines/functions. Fresh broad coverage is supplemented only by the final provisioning run; no global coverage map is overwritten. File hashes, measurement sources and separate simulator metrics are in `.tmp/referral-automatic-discount-coverage-provenance.json`. |
| Types, focused lint and format                    | Full repository typecheck and all 23 touched runtime/test files pass, with final provider/scheduling follow-up checks. `.tmp/referral-automatic-discount-final-check.log`, `.tmp/referral-automatic-discount-expansion-check.log`, `.tmp/referral-automatic-discount-schedule-check.log`                                                                                                                                                     |
| Local CLI/MCP/dashboard candidate                 | `make candidate-build` passes after the final runtime change. Existing dashboard chunk-size warning remains. `.tmp/referral-automatic-discount-final-build.log`                                                                                                                                                                                                                                                                              |
| Independent public site                           | 108 site checks plus eight dependency-policy checks pass; static export and subsequent typecheck pass. `.tmp/referral-automatic-discount-site-test.log`, `.tmp/referral-automatic-discount-public-build.log`, `.tmp/referral-automatic-discount-site-types.log`                                                                                                                                                                              |
| Projection/reference artifacts                    | Canonical site policy matches exactly; generated OpenAPI/reference artifacts pass contract equality tests. `.tmp/referral-automatic-discount-artifacts.log`                                                                                                                                                                                                                                                                                  |
| Local HTTP                                        | Programme preview, served programme component and public referral docs return 200. Served component has automatic setup text and no manual coupon-ID control. `.tmp/referral-automatic-discount-http.json`                                                                                                                                                                                                                                   |

Red receipts preserve the initial missing implementation/service tests and the
missing create-response expansion assertion. A broad run started before the final
catalogue boundary change contained one failure; the fresh 397-test run above
passes on that completed implementation. Tests were not weakened to obtain green.

## Review and release boundary

Review the private simulator at `http://localhost:5291/programmes` and the
rebuilt public guide at `http://localhost:5292/docs/referrals/`. Simulator edits
are temporary and reset when its process or watched configuration restarts.

Automatic setup needs coupon read/create and price-read permissions in the
server's existing Stripe account/mode. Existing bindings need only verification.
No credentials, provider permissions or access rules were changed. Stripe's
[coupon creation reference](https://docs.stripe.com/api/coupons/create),
[includable coupon scope](https://docs.stripe.com/api/coupons/object) and
[idempotency contract](https://docs.stripe.com/api/idempotent_requests) inform the
provider boundary; real provider acceptance is separate from these test doubles.

No live/sandbox Stripe call, campaign activation, payment, transfer, publication,
commit, push, deployment or consumer-product mutation was performed. Authorised
Stripe sandbox checks and the existing exact-runtime release gates remain before
production rollout. This record establishes automated local readiness for internal
review, not provider, browser/device, owner or production acceptance.
