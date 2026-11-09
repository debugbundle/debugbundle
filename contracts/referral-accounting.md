# Business referral accounting

Implements FR-BUS-04 / AC-BUS-04 in [the Business specification](../spec/business-tier.md).
Local enrolment, attribution, first-eligible-invoice benefit, provider receipt reconciliation, ledger, manual payout and export adapters are implemented. Local qualification is recorded in [the qualification record](../spec/business-tier-qualification-20261108.md); no production programme has been activated.

## Calculation boundary

`packages/referrals/src/commission-policy.ts` accepts canonical invoice lines and
verified cash/refund facts. `invoice.paid`, an entitlement change, a browser return
or an invoice credit is not a cash receipt. Provider adapters must establish that
classification before calling this policy.

- All money is integer USD minor units. Line net amounts already exclude line
  discounts. Tax is explicit and never commissioned.
- Only positive Business base-subscription service earns commission. Solo, Team,
  Free, add-ons and other charges are excluded.
- The qualifying first-paid service start and its twelve-calendar-month
  anniversary bound eligible service. A leap-day anniversary clamps to the last
  valid day. Late collection does not extend that service window.
- Exact service-duration fractions apportion lines crossing the anniversary.
  Canonical successful-payment chronology establishes the anchor; webhook arrival
  order cannot establish it. Ambiguous history stays held for reconciliation.
- Actual cash is allocated proportionally across positive invoice charges,
  including tax. Customer credits and negative prorations reduce that cash; they
  never become commissionable cash themselves.
- Verified line-specific refunds first reduce the remaining net/tax charge mix. Allocate retained cash across that remaining mix before applying the service window and rate; partial collection cannot leave commission on refunded cash. A tax-only refund cannot exceed the line tax. Charge refunds without line facts reduce retained cash proportionally across the remaining mix.
  Verified credit-note line allocations can identify base/add-on refunds and
  explicitly separate net amounts from tax-only refunds. Invalid, duplicate,
  unknown or over-refunded facts are rejected.
- Apply the frozen 50% rate to the exact cumulative eligible cash fraction, then
  round half up once to a minor unit. Persist the new target minus the previous
  target as an immutable ledger entry. Do not calculate independent rounded
  earnings for split payments or independent rounded reversals for split refunds.
- Availability is the later of collection plus thirty days and provider funds
  availability. An unresolved dispute or unverified refund/credit allocation holds positive earnings from payout; verified resolution reconciles the
  target once, including any associated refund. Previously paid reversals remain
  negative balances rather than rewriting the original payout.

The first valid attribution remains until an explicit customer correction before
checkout reservation. Self-referrals, previous paying customers and reserved
checkouts cannot acquire or silently replace attribution. A no-card Solo/Team
trial is not a prior paying customer. Durable financial history must enforce this
through cancellation and account recreation; current plan alone is insufficient.

## Customer refund policy

The [customer refund terms](https://debugbundle.com/terms/#referral-refunds) exclude
discretionary/goodwill refunds for referred Business base subscription payments
unless expressly agreed in writing. Mandatory legal withdrawal/refund rights and
non-conformity remedies remain unaffected. Refund amounts reflect actual discounted
payments subject to applicable law; partner commission adjustments are separate
and cannot reduce a legally required customer refund. These terms do not authorise
automated refund rejection or alter receipt, ledger, hold or payout calculations.

## Delivery boundary

Provider reconciliation, immutable storage, operator-only payout claiming and
manual external-reference recording are implemented. No financial
referral grants project access or billing-document access. No automatic money
transfer is part of this programme. Production activation requires owner-approved
programme terms, protected financial retention/payout details and verified
provider test journeys.

## Partner and attribution records

Candidate migration `202611070006_add_referral_attribution` adds three account-level
surfaces; project consolidation classifies all three as unchanged account data.

- `referral_partners` freezes a verified user's public code, accepted terms and
  5,000-basis-point rate. Workspace switching does not create another partner.
  Rejoining is idempotent and cannot reactivate a paused partner.
- `referral_attributions` records the first valid partner and its source. Current
  verified organisation Owner authority is checked after the organisation lock.
  An explicit correction is allowed before any checkout reservation; the provider
  customer link must still match the eligibility read. The checkout-reservation
  binding and provider eligibility facts are internal, never request-controlled.
- `billing_customer_history` retains minimum prior-cash-payment identity for
  eligibility after cancellation, deletion or account recreation. Its writer
  consumes verified provider receipts, rather than plan or invoice-status guesses.

Owner email is normalised with trim/lowercase and keyed HMAC-SHA256 using the
purpose prefix `referral-customer:v1:`. The separate identity secret is stable
configuration; changing it requires an explicit history migration. Plaintext
email is not stored in these financial records. Organisation deletion clears its
live FK while retaining the opaque external organisation ID and protected
eligibility hash. Existing payment-retention records remain intact.

The partner client projection contains only a referral client ID, attribution date
and programme status. It does not expose organisation/user IDs, emails, invoice
identifiers, project lists or debug data. The shared API/CLI/ordinary MCP adapters and optional runtime now use these records. Receipt reconciliation and the approved partner/operator UI are implemented locally. Discount reservation and early/deleted customer reconciliation are implemented; local ledger/payout qualification is recorded in the qualification record above.

## Identity and customer attribution interfaces

`GET/POST /v1/referrals/partner` read/enrol the authenticated verified human, independent of the selected workspace tier. Enrolment requires the current explicit `terms_version`; existing partners remain readable when enrolment is disabled. `GET /v1/referrals/clients` returns only that partner's opaque client IDs, dates and statuses, with bounded `limit`/partner-bound `before` pagination. It grants no customer or project access.

`GET/POST /v1/referrals/attribution` require the verified current workspace Owner. Writes accept only `code` and `explicit_correction`; eligibility and identity are resolved server-side. The first saved valid code remains until an explicit correction before checkout reservation. Restricted project/organisation credentials cannot access personal financial data. Browser writes retain session/CSRF enforcement.

`GET /v1/referrals/visit/:code` sets a signed, HttpOnly, SameSite=Lax 30-day pending cookie and redirects only to the configured product landing page. A later link cannot refresh or replace a valid pending code. Signup capture is optional and must not interrupt authentication on service/provider failure. No private identity appears in the link or cookie.

Configured API/landing URLs and returned share URLs must be valid HTTP(S) URLs.
Localhost, IPv4/IPv6 loopback and private hostnames are supported for local and
self-hosted installations; non-HTTP protocols remain invalid.

CLI: `referrals status`, `referrals join --accept-terms-version <version>`, `referrals clients [--limit 1-100] [--before <client-id>]`, `referrals customer`, `referrals apply --code <code> [--confirm-change]`. All use the existing authenticated actor and JSON output. Ordinary MCP exposes `get_referral_partner`, `join_referral_program`, `list_referral_clients`, `get_customer_referral`, `apply_customer_referral` through the same validated client. Hosted/restricted read-only tool catalogues stay unchanged.

## Verified cash and immutable ledger

`stripe-cash-receipts.ts` validates successful captured charges, underlying PaymentIntent status, customer/currency/live-mode identity and balance-transaction funds availability. It uses each InvoicePayment allocation, not the entire underlying charge. Manual payment records, open/zero allocations and customer credit do not establish collected cash. Partial collections on open subscription invoices still count as prior-payment history. Truncated or inconsistent history fails closed. All provider reads are bounded with an eight-second request timeout and no automatic network retry.

Candidate migration `202611070007_add_referral_commission_ledger` adds retained canonical receipt snapshots, frozen commission periods, current invoice targets, immutable target-delta entries, manual payout batches and unique entry claims. These are unchanged account data during project consolidation. Runtime readiness validates the ledger structure before schema-dependent workers start. Provider adapters supply bounded canonical facts; no public API accepts receipt or eligibility facts from the customer.

Reconciliation sorts successful collection timestamps and provider payment identities, independently of webhook order. A later plan/interval change cannot restart the commission period. Duplicate canonical snapshots create no additional earning. A different first-payment chronology is held for explicit reconciliation, rather than silently resetting a paid programme. Refunds append target reductions; a reversal after payout remains a negative offset against future earnings. Positive entries with disputes or explicit reconciliation holds remain unavailable until a verified resolution. The current invoice balance uses `payout_held` for both; negative reversals still offset available earnings immediately.

A partner/currency lock serialises adjustments and payout claims. Each ledger entry can belong to only one payout batch, and only one claimed/uncertain batch may remain active for a partner/currency. Operators retry the same claim UUID; uncertain outcomes stay claimed until an external payment reference is reconciled. Recording the same paid reference is idempotent, while a conflicting reference is rejected. These stores never initiate a bank/provider transfer.

Partner identity uses a separate `referral-partner:v1:` HMAC purpose. Deleting a user clears its live partner FK while retaining the protected identity hash and obligations. Recreating an email does not automatically restore another identity's private financial history. Bank/payout details are agreed and verified with the operator outside the product; they are not collected in ordinary workspace forms.

Stripe's [coupon duration rules](https://docs.stripe.com/billing/subscriptions/coupons#coupon-duration) consume a once coupon at invoice finalisation. The approved customer benefit is therefore the first eligible Business base invoice. Trial/zero invoices do not consume it; retrying an eligible failed invoice keeps its existing discount without granting a discount on another eligible invoice. Commission remains based on verified collected cash. No provider coupon or pricing configuration has been changed.

## Partner finance and manual operator interfaces

`GET /v1/referrals/earnings` reads the verified human's own pending/available/claimed/paid USD balance, or null before joining, and indicates separately configured operator access. `GET /v1/referrals/payouts` lists only that partner's bounded payout records. Workspace ownership/administration never supplies operator authority.

Configured, verified DebugBundle operators use `GET /v1/referrals/operator/balances`, `GET /v1/referrals/operator/payouts`, `POST /v1/referrals/operator/payouts/claim`, `POST /v1/referrals/operator/payouts/:id/uncertain` and `POST /v1/referrals/operator/payouts/:id/paid`. The runtime reuses the explicit `BILLING_ADMIN_OVERRIDE_EMAILS` allowlist and verified user identity; the review-access secret grants no payout authority. Requests cannot choose operator identity, time, currency or amount. Claims use a caller-retained UUID; payment recording requires `confirmed_external_payment: true` and the actual stable external reference. Uncertain batches remain claimed. Paid records, claimed amounts, receipt snapshots, service anchors and ledger entries cannot be rewritten or deleted through ordinary storage operations.

CLI adds `referrals earnings`, `payouts`, `operator-balances`, `operator-payouts`, `claim-payout --partner <id> --claim <stable-uuid>`, `payout-uncertain --batch <id>` and `payout-record --batch <id> --reference <reference> --confirm-external-payment`. Ordinary MCP provides the same validated functions via `get_referral_earnings`, `list_referral_payouts`, `list_referral_operator_balances`, `list_referral_operator_payouts`, `claim_referral_payout`, `mark_referral_payout_uncertain` and `record_referral_payout`. Tool availability does not authorise any external transfer.

Browser attribution writes include `expected_organization_id` from the displayed workspace. This is a mismatch guard, never a selector: the verified current Owner's server-side organisation remains authoritative. A switch between rendering and submission returns `organization_context_changed` before any mutation. CLI can supply `--organization <expected-id>`; immutable bearer-token context remains unchanged.

## Durable financial handoff

Candidate migration `202611070008_add_referral_reconciliation_outbox` retains only signed event identity/type, resource identity/type, provider customer, protected customer binding, mode and provider time, plus execution status. No webhook payload, email, description or payment method is retained. The source has no cascading user/organisation FK. Its original provider identity cannot be rewritten; a previously unknown customer binding can only be filled once. Readiness validates its columns, indexes and exact enabled immutability guard before dependent runtime starts.

The webhook captures after raw-body signature verification and before the billing duplicate return. Its independent transaction inserts the financial source and existing durable job atomically. On storage failure, ordinary entitlement processing still runs; the response requests provider redelivery with a fixed error. A retry cannot be dropped merely because the entitlement event is already processed. Checkout processing makes a second idempotent capture to preserve a newly linked customer identity.

The separate financial lane performs bounded provider reads outside transactions and uses the existing worker lease. A final short transaction verifies that lease, writes canonical receipt/ledger deltas, completes the retained source and completes the job. Stale workers cannot commit any of those writes. Ordinary job expiry/retry exhaustion never removes the retained source; it remains held and can dispatch a new attempt. Unmatched deleted/early customer identities remain pending rather than inventing a binding or paying an inferred balance; trusted provider-resource metadata and retained identities can establish a binding; unresolved or conflicting identities remain held for operator reconciliation.

Pending known sources hold that customer's positive entries; unknown scope conservatively holds positive payouts until it is bound. Capture and payout admission use a short database advisory fence so a claim cannot race an already admitted pending adjustment. Negative reversals still offset balances immediately. The canonical reader must observe a triggering credit note/refund/dispute in its complete lists before clearing the source, avoiding a hold release from a lagging provider read. Noncash or ambiguous credit allocation remains an explicit per-invoice payout hold. This lane never initiates transfers or blocks incident processing. Its separately fenced benefit recovery may update only the saved eligible draft invoice, as specified below; it never creates, finalises or charges an invoice.

A capacity-only Business cash collection is retained in customer first-cash
history but does not start or consume the referral commission period. The first
positive paid base-service collection supplies that service-period anchor and
stable payment identity. Earlier paid Solo/Team service remains ineligible,
including a positive Solo/Team add-on on a zero-base bill. Subsequent base
payments cannot restart the period. Incomplete or changed chronology retains the
existing reconciliation hold rather than rewriting an earned period silently.

Missing enrolment/link-signing configuration stops new programme enrolment but
must not discard owed financial events. With retained attributions or commission
history, verified Stripe resource identities still enter the financial outbox.
Existing attribution/receipt identity hashes remain usable through account
deletion without recomputing an identity. A new, unbound identity stays pending
until configuration or verified binding is restored; no replacement hash is
invented. The existing worker still dispatches retained financial work when its
Stripe provider is configured, independently of the optional signing secret.
An unconfigured programme with no retained attributions/earnings does not start
financial capture for unrelated billing. No provider mutation occurs in capture
or reconciliation, and the financial hold remains authoritative while unresolved.

Owner decision, 7 November 2026: the customer referral benefit is **10% off the
first eligible Business base invoice**, rather than the first successful payment
across potentially multiple unpaid invoices. Trials and zero invoices do not
consume the benefit. Retrying the same eligible invoice preserves its discount;
its failed payment does not grant a discount on another eligible invoice. A
provider-confirmed expired/voided initial checkout can recover through the
existing safe checkout replacement flow without concurrent reuse. Capacity,
tax and promotion stacking remain excluded. This does not change commission:
50% of eligible collected Business base cash, with its existing first-paid
service-period anchor, twelve-month limit and refund/dispute accounting.

## Durable customer invoice benefit

Candidate forward migration `202611070017_add_referral_invoice_benefit` adds an
identity-keyed `referral_invoice_benefits` marker with its frozen attribution,
original organisation, coupon, checkout attempt and verified provider binding.
The first eligible invoice identity is unique and immutable once observed.
The marker survives account deletion; a new account cannot reset the same
identity's introductory offer. This is financial eligibility metadata, not debug
content, and contains no email, payment details or API credential.

Reservation requires the current verified, unsuspended billing Owner, the exact
attribution and an active non-self partner. The organisation, attribution and
identity are serialised without provider I/O. A different unresolved checkout
cannot replace the reservation. Only the existing provider-confirmed terminal
checkout/subscription retirement flow may release an unconsumed attempt. An
eligible invoice can never be released for another invoice. Observing a trial,
zero or draft invoice keeps the benefit pending; a valid positive eligible
invoice freezes the customer benefit independently of commission collection.
Current schema readiness requires the new table, index and enabled immutability
trigger before dependent runtime starts. Existing schema upgrades use the forward
migration; bootstrap remains empty-schema-only.

`stripe-referral-coupon.ts` performs bounded read-only validation of the configured
coupon and Business products. It accepts exactly ten percent, duration once,
matching provider mode and explicit Business-base-only product restrictions.
A coupon that could also discount capacity, including a shared base/capacity
product, is refused. Checkout freezes the validated coupon and attribution in
its exact persisted request; promotion-code entry is disabled for that offer.
New claims recheck durable paid history and the identity marker. Confirmed
terminal retirement can release an unconsumed checkout; uncertain work is kept.

Verified invoice finalisation facts are projected separately from cash receipts.
The first positive eligible invoice freezes the benefit even if payment fails.
Zero/trial invoices leave it pending. When the next eligible draft appears,
`referral-benefit-reconciliation.ts` prepares a fixed invoice-specific intent;
`stripe-benefit-recovery.ts` revalidates provider customer, subscription metadata,
coupon scope and the exact draft before applying its coupon. This uses Stripe's
[draft-invoice update](https://docs.stripe.com/api/invoices/update?api-version=2026-02-25.clover)
and its stable idempotency identity. It never creates/finalises/charges an invoice,
changes a subscription, or chooses a later bill on replay. A lost acknowledgement
reads back the same draft. An unresolved intent cannot be replaced by another
invoice. A finalised first eligible invoice lacking the expected discount remains
held for explicit reconciliation; no refund, credit or new benefit is invented.

Provider reads/writes run outside database locks. Short transactions check the
worker lease before preparation and before committing receipt/ledger/source/job
completion. Provider price/coupon configuration and programme activation remain
separate operator actions; these source changes perform no provider call.
