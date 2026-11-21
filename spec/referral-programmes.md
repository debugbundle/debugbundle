# Referral programmes and introductory offers

Status: approved implementation contract, 16 November 2026. Hosted capability
released 18 November in core 1.28.1/site 1.11.0; commercial programme activation
remains an operator decision. See [the release record](referral-release-20261117.md).

Implements FR-REF-01–10 / AC-REF-01–10. Approved policy, design, compatibility and
ordered delivery are in [the plan](referral-programmes-plan.md).

Initial defaults offer 20% off the first eligible Solo, Team or Business base
invoice, monthly or annual, and a 50% creator commission for twelve calendar
months of paid service. The commission percentage is configurable from 0% through
100% of eligible collected base cash after discounts/reversals; 50% is not a cap.
The rate cannot pay more than the remaining eligible cash. Discount and commission
are applied sequentially, not added: a $100 base with 20% off and 80% commission
means $80 collected, $64 commission and $16 retained before fees/operating costs.
Two decimal places are supported, with integer half-up money rounding. Trial/zero
invoices do not consume the offer; tax/capacity/noncash credit are excluded. Legacy
Business-only 10% claims and settlement keep their original terms. Accepted
customer claims freeze the programme version and commercial promise.

Creator-chosen public codes resolve through a globally unique, non-reassignable
registry to permanent partner identities. Manual entry works without cookies.
Saved workspace offers survive the trial, cookie expiry and device changes. One
introductory benefit per protected identity prevents benefit reuse. Customer-
offer replacement never silently changes the referring partner.

The owner approved the detailed plan/design on 16 November and subsequently
authorised the coordinated DebugBundle publication/deployment. Commercial
programme/provider writes, transfers and consumer-product changes remain separate.
Higher-rate programmes require the matching API, worker and site readers before
activation; a reader that still rejects rates above 50% cannot safely reconcile
or serve such a saved agreement. Existing frozen agreements are never rewritten.

Use forward migrations and fail-closed readiness. An activated new programme
requires a rollback reader capable of reconciling its obligations. Bootstrap
upgrades and destructive cleanup are forbidden.

## Compatibility, transient state and review delivery

The v2 public preview has an explicit legacy commercial definition without
invented programme/version IDs. A creator who accepted only
`business-referrals-2026-11` still offers 10% on Business only. Accepting a new
programme deliberately moves new uses of generated/branded codes to that
version; saved customer claims retain their own agreement. The original v1
referral response schemas stay unchanged. A v2 customer read/apply may report
`legacy_attribution` separately from a versioned claim, with eligibility indicated
without exposing financial identity or provider IDs.

Both signed cookie formats participate in first-valid precedence, ordered by
their original expiry. Passive visits never extend that expiry. An explicit
change or removal clears both formats before issuing the selected hint. New
verified accounts can carry either signed format into an atomic durable signup
intent. Browser and worker share bounded retry/backoff; a failed intent retains
its code for an explicit customer retry. Signup remains independent of provider
availability. A campaign over a legacy attribution changes only its discount;
`referral_version_id = NULL` explicitly preserves the original Business-only
commission contract, rather than relabelling it as a new agreement.

The existing cleanup lane removes expired 15-minute delegation hashes, marks
expired signup intents, and removes terminal intents 30 days after their original
expiry, in bounded batches. It never prunes permanent claims, codes, immutable
correction history or accounting. The browser-Owner account export includes
bounded personal creator membership/code and selected-workspace offer, history,
intent and early-grant sections. Protected identity hashes, provider IDs, temporary
proof hashes and operator reasons are excluded from those public projections.

`REFERRAL_PROGRAMMES_ENABLED` defaults false in core Compose and the prepared
hosted env source. Both API and worker receive it. Disabled new claims do not
hide saved offers or prevent their redemption/reconciliation. Activation requires
the new-claims gate, verified provider binding and explicit operator confirmation.
The local public-site development server uses `SITE_API_BASE_URL` (default
`http://localhost:3003`); the example referral landing URL is its public origin
`http://localhost:5292`. Production origins remain explicit configured values.

The private hosted source handles `/r/CODE` with a temporary no-store redirect to
the fixed API visit endpoint, rejecting encoded separators and ignoring query
destinations. The separately approved announcement is published at
`/blog/debugbundle-affiliate-programme/`. Historical local evidence remains in
`spec/referral-programmes-qualification.md`; hosted publication and exact live
artifacts are recorded separately in `spec/referral-release-20261117.md`.

Operator delegation rechecks the exact active token/session workspace as well as
the verified email, allowlist, unrestricted scope, active membership and expiry.
Changing the issuing session's workspace does not move its proof to another
workspace. Proof issuance rejects suspended membership and tokens from another
workspace. This supplements the ordinary member credential and never grants
Analytics or payout authority.

## Operator inventories and performance

The read-scoped operator routes `/v2/offers/operator/codes`, `/claims` and
`/early-grants` use bounded (maximum 100) stable date/ID paging and optional exact
code, partner, workspace, version or claim filters. They reveal support identifiers,
public code ownership, offer status and audited grant reasons; no customer email,
identity hash, provider identifier or credential is selected. Reasons remain
operator-only and do not enter customer exports.

`/v2/offers/operator/performance` accepts UTC `from`, exclusive `to`, and an
optional offer `version_id`, for at most 366 days. The cohort is the current claims
whose claim timestamp is in that window. Active trials are current trialing
workspaces; first paid conversions use retained verified cash history. Financial
values are the cohort's current lifetime totals as of the displayed observation
range, rather than transactions occurring inside the claim window. A changed
customer offer belongs to its current version; its original partner agreement
continues to determine commission.

A bounded derived `offer_claims.performance` projection is updated only from the
verified receipt worker's final lease-fenced transaction. It uses the exact
existing cash/refund allocation, rounds once in minor units, excludes tax/capacity/
noncash credit and cannot overwrite a newer observation. Invoice discount totals
are actual granted base discounts before refunds, never catalogue estimates.
Missing receipt/discount coverage, disputes and allocation holds are explicit.
Net/paid/reversed commission comes from the existing ledger and payout records.
This projection is not another accounting ledger or payment authority. It is
retained with financial claims after deletion and included without provider data
in the selected Owner's offer export.

## Compatible rollout floor

The immutable hosted image handshake is `referral-offers-v1`. Its build check
requires the exact programme migration and API/financial projection implementations.
The private cloud gate allows a first bridge with new claims disabled; activation
requires compatible candidate and retained rollback API/worker images. Once an
active runtime advertises this capability, disabling the flag never permits
falling back to old readers. Retain the additive schema and offer-aware worker;
rollback only to a verified compatible pair. A pre-offer binary is not a safe
rollback after any versioned promise. The authorised hosted release established
this compatible pair before enabling capability; no commercial programme was
activated as a deployment canary.

Bound provider coupons must have neither `max_redemptions` nor `redeem_by`.
Programme claim caps and frozen per-customer deadlines are enforced in
DebugBundle; provider limits must not invalidate an already promised trial
conversion. Do not delete a bound coupon while saved claims remain. The verifier
rejects capped/expiring, wrong-mode, wrong-percentage, repeating, unscoped or
capacity-discounting coupons. Activation/scheduling now prepares a missing coupon
automatically from immutable version terms, derives mode from the server's verified
price catalogue, and saves the existing binding shape. Already bound coupons are
verified and retained. Preparation uses a deterministic per-version/mode coupon ID
plus idempotency key, canonical read-back after uncertain creation, bounded requests
and no provider limits that could invalidate a saved trial benefit. Lifecycle checks
run before provider work and again under the storage lock. No provider request runs
under that lock. A failed preparation returns `programme_payment_setup_failed`
without activating the version; retry reuses the same identity. An unused coupon
may remain after a concurrent end/persistence failure; it is never automatically
deleted or applied to another version. This implementation performed no live write.

Catalogue verification requires exactly one current base price per eligible
plan/interval, matching the advertised USD amount, interval/count, licensed usage
and exclusive tax treatment. Retained prices remain in the product-scope check:
an inactive historical capacity price is readable, never newly purchasable, and
cannot share a discounted base product. These checks also protect Checkout and
draft-invoice recovery through the shared verifier.

Legacy generated aliases are registered transactionally during either v1 or v2
enrolment, including creators who join after the forward migration. Blocked legacy
codes are rejected by new public previews and v1 new-attribution paths; saved
attribution/benefits remain readable. Legacy signup recovery stays available when
only new programmes are disabled. It skips unrelated new intents without using
their retry allowance. Receipt failures cannot starve the signup recovery pass.

Confirmed zero-invoice recovery retirement is shared with the legacy path. Only
complete provider finalisation/cash facts for the exact retained recovery invoice,
subscription, customer and protected identity can retire that draft repair.
`referral_benefit_recovery_retirements` records immutable scope, invoice, zero
amounts and observation time. It does not release Checkout, consume the benefit,
reset its identity eligibility or act as another money ledger. Ever-collected base
cash prevents this retirement even after refunds. Capacity/tax-only cash does not
consume a base benefit. A late acknowledgement of that same first eligible invoice
may set recovery completion once; consumed commercial facts remain immutable.

A pending signup hint prevents an unconfirmed full-price purchase. Once the same
verified Owner has durable attribution or an offer claim, that record becomes
the Checkout authority even if signup-completion acknowledgement was lost and
new enrolment later pauses. Ordinary identity, claim, quote, coupon, eligibility
and seven-day/grant checks still apply. The pending hint grants no discount or
new reservation by itself and cannot replace the saved choice.

Code admission holds a shared registry-row lock until either legacy attribution
or a versioned claim commits. An operator block must precede admission or wait
for that already admitted promise; it cannot invalidate saved terms. Explicit
public removal and successful code selection clear the URL hint while preserving
other query fields/router state. Invalid codes do not open a replacement prompt;
only the typed `offer_change_requires_confirmation` response does.

Activation and scheduling reject a percentage that rounds any eligible catalogue
base invoice to zero (`programme_discount_invalid`). Zero-invoice recovery must
not turn a one-invoice offer into a recurring free subscription. The operator
must create a lower-discount revision; existing immutable versions are not edited.

## Creator payment setup

Settings → Referrals reuses the internal Tabs pattern with Programme, Earnings,
Referred clients and Payments. Programme contains codes, enrolment and agreement
details; Payments combines payout preferences and payment history. Switching tabs
retains form drafts and history pagination; changing the signed-in person resets
private state. The Programme tab opens initially. Tabs support keyboard navigation
and expose only the selected panel to assistive technology.
Payment setup precedes history while any accepted programme lacks saved payment
preferences. Once all are confirmed saved, history comes first. Existing saved
preferences use that order on return; failed saves never mark setup complete.

FR/AC-REF-11 and the [payment setup contract](../contracts/referral-accounting.md#per-programme-payment-preferences) extend these programmes with encrypted per-programme recipient preferences and immutable manual payout instructions. Product defaults include IBAN/Wise/Revolut, five currencies and supported countries; programme editors have no additional controls. Routine payout review starts at $50 USD without forfeiting smaller balances. See the [approved implementation plan](referral-payout-preferences-plan.md).

## Public affiliate presentation

Anonymous public context compares the presented code with current promotions
within their claim window and capacity, preferring the cheapest eligible rounded
invoice amount and the referral on ties. Exact comparisons accept plan and interval
together. Before selection, a better promotion must retain the original eligible
scope. The presented referral code remains the signup attribution carrier even
when the displayed terms are a cheaper promotion. Invalid explicit codes never
masquerade as a valid promotion. Preview reads create no cookie,
claim or provider object. The existing site-wide banner, details, pricing and
signup link consume this same context on the homepage and other public layouts.
The public banner retains the single-line “X% off” shorthand on phones and says
“X% off eligible plans” on larger screens. At the desktop navigation breakpoint
it prefixes the promotion's programme name, or the fixed
customer-facing “DebugBundle Referral Offer” title for referrals, with a dot
separating title and discount. Referral details use that same customer-facing
title. Full eligibility, one-invoice and renewal conditions stay in the details.
The promotional draft form requires a chosen public code. The shared draft
input accepts optional `promotion_code` for compatible API/CLI/MCP clients and
saves it in the same transaction as the new version. Duplicate/reserved/invalid
codes cannot leave a partial programme or revision. `PromotionCodeSchema` allows
ten-character campaign codes such as `BLCKFRYD26`; creator aliases keep their
legacy-generation namespace restriction. All codes still share the unique
registry and protected official-name rules. The card reads its saved codes with
the inventory's optional `version_id` filter instead of a separate Reserve form.
Codes belong to a version: revised drafts choose a new unused code, while saved
claims and old aliases retain their original version. Saving a draft publishes
nothing; activation/discovery/claims use that exact saved code. Existing clients
may omit the new field, and the separate promotion-code operation stays supported.
Roll out the compatible API before updated dashboard/automation clients, which
send the new draft field and inventory filter. This uses existing tables and
unchanged public version responses; no database migration is required.
Activation/scheduling reserves a stable public promotion code when none exists.
An intentionally blocked code is never bypassed by generating another code.

Signup and durable recovery save that cheaper discount with the original creator
agreement. Existing saved offers can receive an exact cheaper quote without a
write; explicit confirmation rechecks and records its replacement before Checkout
reservation. Ties prefer an available versioned referral. Legacy attribution
remains Business-only under its original agreement. See the
[selection contract](referral-offer-selection.md). Customers without a saved claim
can review public promotions without a write, then explicitly confirm creation
of the exact claim with their existing creator attribution preserved.

Activating/scheduling a revision atomically ends its superseded live revisions;
saving a draft leaves the current offer alone. Saved agreements, claims and
financial terms stay frozen. Operators see one permanent programme with pending
drafts and closed revision history. Ended programmes are in closed Archives;
discarding a draft records its existing ended transition rather than deleting
immutable history. Native date/time inputs use the device timezone and persist
UTC; untouched stored seconds remain exact. See the
[correction and upgrade notes](referral-programme-publication-correction.md).

The public programme page is `/affiliates/`, linked as Affiliates between About
and Contact in the footer. This is a clean rename of the unpublished marketing
route, with no legacy redirect. `/docs/referrals/`, creator settings, API names and
creator-code tracking retain their domain names.

Reusable programme cards show the name, description, selected commission and
customer discount, eligible plans/intervals and earning duration. A catalogue-based
first-invoice earning highlight uses the shared integer-money preview. Where an
annual plan has a commission window shorter than a year, exact earnings require
service dates: show the commission rate instead of a misleading full-year maximum.
The terms modal retains the complete conditions, payout rules, deadlines, immutable
terms version and examples; it uses the existing shared accessible dialog. Joining
continues through the account's existing verified consent flow. No public action
accepts an agreement or initiates payment.

## Creator notifications

FR/AC-REF-12 confirms accepted revisions, celebrates the first verified paying
referral per permanent programme and sends a conditional daily UTC summary for
subsequent new paying customers, grouped by programme. Renewals, visits and trials
do not trigger a summary. Notification records are atomic with enrolment or final
verified settlement; they do not authorise payment or change the financial lane.
The shared email templates and acknowledged SES transport retain pending-money
wording, recipient checks, bounded retries and uncertainty fences. See the
[notification review](creator-referral-emails-review.md) and accounting contract.
