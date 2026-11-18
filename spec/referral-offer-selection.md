# Cheapest introductory offer and creator attribution

18 November 2026. Owner-requested policy; local implementation, not deployed.
Maps FR/AC-REF-03, 04, 05, 08 and 10.

## Selection policy

Compare only eligible offers, using actual rounded base-invoice payable amounts
for the selected plan and billing interval. Tax and capacity stay separate.
Referrals win equal amounts, including cases where different percentages round
to the same invoice price. Multiple public promotions are ranked by discount,
then stable start/creation/ID order. Being newest does not make an offer best.

Before a plan/interval is selected, a promotion can replace the displayed referral
terms only when it retains every eligible plan and interval and improves price.
Exact public context queries supply `target_plan` and `interval` together.
The existing site pricing cards fetch that exact context and keep their existing
price, renewal, tax and eligibility presentation. Failed/stale reads cannot
advertise an unverified discount.

A valid presented referral code remains the public signup carrier even when
the preview's effective commercial version is a cheaper promotion. Code and
discount source are deliberately separate. Existing strict public response
shapes stay unchanged. Invalid or blocked explicit codes do not become valid
merely because an unrelated promotion is available.

An earlier promotional hint may yield to a creator code; a first valid creator
cannot be silently replaced by another passive link. Explicit creator changes
retain the existing confirmation rule. Manual/no-cookie signup carries the same
presented code. Neither public reads nor visits create account claims.

## Durable claims and earnings

API management and durable worker recovery call the shared
`referrals/offer-selection.ts` selector and presented-code application. Fresh
claims bind the chosen discount code/version and independently retain the original
referral code/version. Storage checks the creator, self-referral, protected
identity, prior payment, programme capacity and current code availability under
its existing transaction and locks. It rechecks both sources before committing.

Commission comes from the retained creator agreement and actual eligible
discounted cash. A promotion's zero commission rate never replaces that agreement.
For example, $5 less 30% collects $3.50; an accepted 50% creator agreement earns
$1.75 before its ordinary holds/reversals. Legacy creators keep their original
Business-only scope and explicit null referral-version marker.

There is still one introductory benefit per protected identity and no discount
stacking. Existing promises, refunds, debt offsets and payment eligibility remain
under their existing financial rules.

## Existing saved-offer checkout

Quote generation compares the saved promise with eligible live promotions and
the current versioned referral, for the exact selected invoice. Preview does
not mutate the saved claim. A changed quote signs private source-version and
selected-code metadata inside the existing opaque confirmation token; the public
quote DTO is unchanged. Old proofs remain accepted.

Only explicit purchase confirmation may replace the existing claim. It rechecks
the exact original claim/version, code, active terms, cap, identity and provider
eligibility before the existing Checkout reservation. A stale, expired, blocked
or conflicting choice fails closed. Retrying the confirmed same version is
idempotent. Reserved/used benefits and admitted provider attempts cannot be
rewritten in pursuit of a newer deal. The existing seven-day/grant rule remains.
The storage transaction repeats canonical saved-claim eligibility after provider
verification and lock waits, before changing attribution, history or slot counts.
This also covers removal/expiry during confirmation, not only before it starts.
Definitive pre-admission rejection requests a fresh price review for saved and
fresh claims alike. The API keeps provider-admission failures outside that recovery
boundary so an uncertain charged attempt cannot be discarded by the UI.
The existing workspace-offer reader also refreshes after that rejection, so a
claim removed in another tab cannot leave Billing stuck with stale saved terms.
A definitive no-offer response still requires a separate regular-price purchase
confirmation; refreshing never starts a payment.
Before the ordinary wait unlocks, a customer relying on an approved early-purchase
grant is compared only with offers that allow that grant. Once the ordinary wait
passes, all otherwise eligible promotions participate. Confirmation repeats this
check so a cheaper discount cannot strand a valid early-purchase path.

The change adds no table, column or migration. It reuses the existing claim,
attribution and immutable history shapes. The earlier publication correction's
separate forward data migration is still required by that pending release.

New private replacement proofs require the new reader. On rollback before
admission, refresh the quote against the saved claim; an already admitted provider
request retains its ordinary exact-attempt reconciliation rather than being
replaced or recharged. No production/provider test or release is included here.

## Checkout without a saved claim

The owner explicitly approved this extension on 18 November. The app offers a
read-only price review before purchase. API/CLI/MCP callers opt into discovery
with `include_public_offers: true`; omitting the flag preserves the prior no-claim
response. The request flag is separate from the unchanged public quote response.
An old server rejects the flag instead of silently offering an undiscounted
purchase to a new client.

The exact promotion is compared with any retained legacy Business discount;
legacy wins an equal rounded price and keeps its original redemption path. A
promotion's quote signs a fresh claim UUID plus the existing attribution ID/public
code snapshot. Preview creates no claim, coupon, reservation or charge. An
unresolved signup referral blocks discovery so its creator cannot be lost.

Only explicit purchase confirmation creates that exact claim. Under the ordinary
organisation and identity locks it rechecks attribution, code, programme capacity,
current Owner, prior payment, ordinary trial wait and existing checkout attempts.
A changed creator, another winning claim, blocked/full campaign or newly paid
identity rejects the confirmation. A duplicate confirmation reuses the same claim
and does not consume another slot. A previously admitted ordinary/provider attempt
keeps its exact terms. Fresh quotes cannot grant early purchase on their own.

The app displays the quoted initial and renewal amounts using the existing price
summary and dialog. A definitive no-offer response shows ordinary/legacy pricing
and still requires a separate purchase click. Lookup errors and unsupported
servers cannot silently select full price. A rejected fresh confirmation before
provider admission requests a new review; ambiguous transport/provider failures
retain their exact proof for reconciliation.

## Qualification

Regression coverage includes public per-invoice reads and signup carriers,
cheaper/referral/rounded ties, differing eligibility scopes, both visit orders,
legacy agreement preservation, self-referral, blocked quoted choices, durable
worker parity, unchanged preview claims and real discounted-cash ledger earnings.
Final test/build evidence is recorded in STATUS.md.

Final local evidence: 305 affected core/API/CLI/MCP/web cases pass; 20 focused
database cases cover the real HTTP and legacy boundaries plus ten selection
cases, including actual ledger earnings and worker recovery. Other offer suites
passed in the broader run. Four generated API/MCP reference checks pass. Site
checks pass (116 functional plus 10 dependency-policy cases), and its isolated
production export and typecheck pass. Core types, scoped lint/format, diff checks
and the app build pass. A final eleven-case selection run also passes after
protecting removed/expired offers from restoration through a stale replacement
quote. No hosted/provider/owner acceptance is implied.

The approved no-claim extension passes 36 focused database cases (15 fresh-claim
cases), 54 focused quote/API/CLI/MCP/web regressions, all 86 Billing UI cases and
four generated-reference checks. The reference check timed out under the combined
run's resource load and passed alone without changing its timeout or assertions.
Full core typecheck, scoped lint/format and the app build pass. The extension adds
no schema migration; the separate publication repair remains required for release.
