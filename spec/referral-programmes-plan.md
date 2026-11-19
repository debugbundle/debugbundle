# Referral programmes, creator codes and introductory offers

Date: 16 November 2026
Status: approved design implemented and qualified; hosted capability and app/site
published 18 November 2026. Commercial programme activation remains separate.
Current receipts and remaining external discovery limits are in
[the coordinated release record](referral-release-20261117.md).
Delivery: one implementation phase, executed through the ordered slices below.

17 November presentation amendment: the owner approved compact affiliate cards
and shared terms dialogs, and renamed the unpublished public page to `/affiliates/`
without a legacy alias. This supersedes the marketing-route labels in the original
plan below; domain/API/account names remain Referrals. See the current
[affiliate card review](referral-affiliate-cards-review.md).

## Outcome and authority

Give creators a memorable code and share link, give customers an accurate offer
before signup, preserve that offer through the free trial, and reconcile the
eventual purchase and creator earnings reliably. Let the DebugBundle operator
manage versioned referral programmes and introductory promotions beside internal
Analytics.

The owner accepted the preceding recommendation and added creator-chosen codes.
The owner subsequently approved implementation and isolated qualification on
separate branches. This authority does not include commit, push, publication,
deployment, live programme activation, provider writes, messages or transfers.
All work is scoped to DebugBundle. Consumer products remain outside scope.

One phase means one complete product outcome and acceptance checklist. Ordered
implementation and deployment steps are still necessary for production safety.
No slice substitutes for completing the customer-to-payout journey.

This proposal describes intended changes. Existing billing/referral contracts
remain the authority for deployed behaviour until implementation updates them
explicitly. Do not change historical commercial terms by editing constants.

## Verified starting point

Source inspected on 15–16 November; live public responses checked on 15 November:

- The supplied `/v1/referrals/visit/D2QM7UBHMH` link returned a 302 to the public
  site and a signed, host-only, HttpOnly, Secure, SameSite=Lax, 30-day cookie.
- Public pricing lists Solo $5/month or $48/year, Team $19/month or $192/year,
  and Business $59/month or $588/year, before applicable taxes.
- `FR-BUS-04` and the live referral guide specify Business-only eligibility,
  10% off the first eligible base invoice, and 50% commission for twelve calendar
  months of eligible paid base service.
- Protected attribution, prior-cash identity history, durable Checkout
  reservations, invoice-benefit markers, verified receipt reconciliation,
  immutable commission deltas, holds and manual payout claims already exist.
- Generated codes are constrained to ten base32 characters in storage and strict
  API/client schemas. A custom-code change cannot be a frontend-only edit.
- The public site has no offer-context reader or referral-aware pricing.
  `/docs/referrals/` exists; a dedicated marketing page/footer entry is missing.
- Ordinary Checkout enables Stripe promotion codes; referral Checkout supplies
  its verified coupon and disables promotion-code entry to prevent stacking.
- Signup captures a pending referral for a newly created verified user. Failed
  capture preserves the cookie and supports manual Billing recovery, without a
  durable automatic retry on later logins.
- The seven-day first-purchase wait is enforced under the organisation lock,
  independently of the referral discount.
- Internal Analytics requires its dedicated allowlist and an email-code browser
  session. Referral payout operators use a separate billing allowlist.

Public HTTP checks do not establish authenticated signup, checkout or payout
acceptance. Earlier test receipts are background, not results for this change.

## Product decisions

### Initial programme

| Concern                  | Planned policy                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer benefit         | 20% off the first eligible positive base-subscription invoice.                                                                                        |
| Plans                    | Solo, Team and Business; monthly and annual.                                                                                                          |
| Duration                 | First month on monthly billing, first year on annual billing; normal renewal price afterwards.                                                        |
| Partner earnings         | Initially 50%; configurable 0–100% of eligible collected base cash after discounts/refunds. No 50% ceiling; exclude tax, capacity and noncash credit. |
| Commission window        | Twelve calendar months from the first eligible paid base-service anchor; no reset on plan change, cancellation or resubscription.                     |
| Trial                    | Existing one-time 30-day no-card trial; no commission and no consumption of the introductory benefit.                                                 |
| New-customer eligibility | No prior verified paid history, including retained history after cancellation/deletion. Existing Free/trial customers can qualify.                    |
| Anonymous attribution    | Thirty days from the first valid visit; later passive links neither replace nor extend it.                                                            |
| Saved referral benefit   | Durable after claim/signup without cookie-dependent expiry; valid until first eligible purchase unless explicitly revoked for substantiated abuse.    |
| Stacking                 | One introductory offer per invoice. Catalogue annual pricing is the base price, not a second promotional code.                                        |
| Plan changes             | Commission follows eligible base service across all three plans inside the original window; no second introductory discount.                          |
| Payouts                  | Manual reviewed payouts; retain at least the existing 30-day/funds-availability hold and dispute/reconciliation holds.                                |
| Existing obligations     | Preserve legacy 10% claims, original service anchors, historical rates, earned balances and payout records.                                           |

Introductory percentage offers are the bounded promotion feature in this phase.
Support referral, first-purchase and holiday campaigns for customers who have not
previously paid. Customer-discount duration is one eligible invoice; partner
commission duration is separately configurable. Repeating discounts, fixed-amount
credits, gift cards, affiliate networks and discounts on existing paid renewals
are outside this implementation and must not appear as supported editor options.

Proposed launch defaults, to confirm when configuring the concrete programme:
review after 90 days; monthly payout review; USD 50 minimum routine payout.
Smaller balances remain owed and visible, with a documented final-settlement
process. The operator must set a claim limit or acknowledge no limit before
activation. No programme is activated by a migration or seed.

Initial arithmetic fixtures at the inspected catalogue, before tax/capacity and
assuming full cash collection with no refunds:

| Plan/interval    | Base invoice | Discounted first invoice | First-invoice commission | Normal renewal |
| ---------------- | ------------ | ------------------------ | ------------------------ | -------------- |
| Solo monthly     | $5.00        | $4.00                    | $2.00                    | $5.00/month    |
| Team monthly     | $19.00       | $15.20                   | $7.60                    | $19.00/month   |
| Business monthly | $59.00       | $47.20                   | $23.60                   | $59.00/month   |
| Solo annual      | $48.00       | $38.40                   | $19.20                   | $48.00/year    |
| Team annual      | $192.00      | $153.60                  | $76.80                   | $192.00/year   |
| Business annual  | $588.00      | $470.40                  | $235.20                  | $588.00/year   |

Subsequent monthly commission uses eligible cash inside the original window;
year-two service earns zero. The discounted invoice retains 40% of the ordinary
base amount for DebugBundle before fees and operating costs. Refresh catalogue
fixtures if prices change; do not hard-code these marketing amounts separately.

### Creator-chosen codes

- A verified enrolled creator can reserve one branded code, for example `OWEN20`.
  It aliases the permanent partner ID; it is not identity or authentication.
- Proposed syntax: 3–24 ASCII letters/digits with optional internal hyphens;
  first/last characters alphanumeric. Trim surrounding whitespace and match
  case-insensitively using uppercase. Reject Unicode lookalikes, spaces,
  punctuation, encoded separators and ambiguous decoding.
- Use one globally unique namespace for aliases, legacy generated codes and
  promotional codes. A code resolves to exactly one type/owner. Reserve official,
  support/admin words and legacy-code-shaped values from new self-service claims.
- Enforce uniqueness atomically in PostgreSQL. Availability feedback is advisory;
  only successful reservation establishes ownership. Rate-limit authenticated
  availability/claim requests and reveal no private creator information.
- Existing generated codes remain valid. One creator cannot reserve speculative
  aliases. Subsequent renaming is an audited operator correction in this phase;
  previous aliases continue to resolve to the same creator.
- Never recycle an alias to another creator/campaign, including after account
  deletion. Block abusive aliases for new claims without transferring ownership
  or changing already-earned obligations.
- Code changes never rewrite attribution. Store immutable partner, programme-
  version and code-record IDs; retain the entered code only as bounded public
  provenance where useful.
- Offer the branded code and a link such as `https://debugbundle.com/r/OWEN20`.
  Preserve existing API visit links. Redirect only to configured destinations.

Manual entry works without a referral cookie, after switching devices, or after
finding the product elsewhere. It establishes attribution only after server
validation and a successful claim. It cannot automatically identify somebody who
never presents the code, nor bypass prior-payment eligibility.

### Attribution, offers and replacement

Separate the referring partner from the customer's chosen discount. A holiday
offer can replace the introductory discount without silently changing the partner.
Commission follows actual discounted cash under the frozen referral agreement.
An offer incompatible with commission must declare that before acceptance; the
initial campaigns remain commission-compatible.

The first valid passive referral link wins. An earlier promotion hint does not
block a subsequently presented creator code. Owner policy, 18 November 2026:
compare eligible invoice amounts, prefer the referral on a rounded-money tie,
and preserve the creator agreement even when a cheaper promotion supplies the
discount. Preserve all eligible scope before a plan/interval is selected.
Explicit entry can replace a pending/saved
referral only before Checkout reservation, with confirmation naming the public
codes and showing the resulting offer. A new URL parameter cannot change it.
After checkout, retain the existing reconciliation and terminal-retirement rules;
no override of ambiguous payment work.

Introductory offers share the identity-level first-purchase restriction. Replacing
20% with a 30% holiday offer must not leave another redeemable 20% benefit for a
later bill. Preserve the referring partner independently.

Programme edits create immutable versions. A claim freezes the version and terms;
Checkout freezes exact prices, discounts, provider mode and request parameters.
Ending/pausing a programme stops new claims, not promised benefits or financial
reconciliation. Separate fraud revocation from ordinary pause, require a recorded
reason and preserve history.

## Customer journey and reliable state

1. A visit/manual code returns a minimal validated preview: code, offer version,
   eligible plans/intervals, percentage, duration and explicit deadlines. No
   private account or partner finance data.
2. The public site shows “Referral offer available”. Preview is not a confirmed
   claim, reserved capacity or proof of new-customer eligibility.
3. Email-code/GitHub signup carries a bounded first-party intent. Verified server
   identity claims attribution and the offer atomically; then clear the cookie.
4. Existing verified Free/trial Owners can apply a code in Billing. Bind it to
   the displayed workspace using the existing expected-workspace guard.
5. Only durable success permits “Your discount is saved”. Read the workspace
   offer across devices, sessions and cookie deletion.
6. Trial start/expiry does not consume a normal referral or start commission.
   Holiday offers may have explicit redemption deadlines, but admission must
   guarantee at least the remaining trial plus seven days: refuse or explicitly
   extend that claim's deadline. Never promise an offer that expires mid-trial.
7. Quote the full monthly/annual amount, base discount, capacity, tax treatment
   and renewal price; revalidate server-side at Checkout.
8. Reserve/apply the exact offer durably. Lost responses replay the same intent,
   never another charge or discount.
9. Finalisation consumes the first eligible positive base invoice's benefit.
   Zero/trial invoices keep it pending. Failed payment retains that invoice's
   discount; commission requires verified collected cash.
10. Reconcile receipts/refunds/disputes through the existing financial lane.
    Display pending, available, claimed and paid separately.

Persist a bounded signup-intent receipt with the successful verified signup so
transient referral failure can retry for that exact identity/workspace. Do not
fail authentication, infer another account or rely on `created_user` becoming
true again. Invalid/rejected/expired intents have a visible recovery state.
Retry is bounded and idempotent and cannot override an explicit later choice or
checkout. Ordinary later logins never attach a new code to an arbitrary workspace.

If validation is unavailable, ordinary access/trial signup remains usable. Do not
silently send someone expecting a discount to full-price checkout. Provide retry/
remove-offer actions and explicit confirmation of the resulting price.

## Cookies, public transport and privacy

Keep the cookie signed, HttpOnly, Secure and host-scoped; do not broaden it to all
subdomains or expose it to scripts. Add a read-only offer-context route with exact
public-site origin handling, credentialed CORS only for that route, rate limits
and private/no-store caching. Do not widen management CORS. CDN pages remain
unpersonalised; personalised responses never enter shared caches/search metadata.

Public code input supports preview/manual entry without cookies. Carry an opaque
bounded intent through auth where required; never put private account/finance
identifiers or credentials in URLs. Keep codes out of unbounded telemetry and
logs. Use fixed route templates rather than a dimension per creator code.

Read legacy signed cookie payloads throughout migration. A new version can carry
a bounded code-record/intent reference and expiry, while remaining only a hint
for server validation. It cannot assert eligibility, a percentage, operator
authority or a grant. Test mixed old/new cookies and preserve the first valid
pending attribution without extending its original expiry.

Document storage purpose, duration, removal and the distinction between requested
offer continuity and optional marketing measurement. Establish applicable consent
handling before automatic storage; first-party does not automatically mean exempt.
Rejecting optional tracking leaves manual entry usable. No fingerprinting or
cross-device identity matching.

## Purchase admission and operator authority

Public codes do not establish payment trust. Retain the seven-day wait by default.
The initial early-purchase mechanism is an audited operator-approved grant for
one verified customer identity/workspace and eligible programme. A programme can
permit grants; its public code alone cannot grant them. Recheck expiry, revocation
and use under the organisation lock. Retain suspension/single-subscription checks,
3DS, organisation/IP limits and uncertain-operation fences.

Consumption binds the grant to the exact Checkout attempt so retrying that
attempt remains idempotent. Expiry/revocation prevents new admission; it cannot
revoke an already-issued provider URL or undo a confirmed payment. Keep that
limitation explicit and reconcile existing attempts before any replacement.

Place “Programmes & offers” beside internal Analytics. Reuse its actual
`ADMIN_ANALYTICS_ACCESS_EMAILS` policy and verified email-code session requirement,
denial semantics and CSRF. Extract shared operator authorisation, not frontend
visibility. Programme data availability is independent of Analytics data.
Ordinary workspace Owner/Admin and GitHub-only sessions gain no operator access.

Programme administration also needs API/CLI/ordinary MCP parity without relaxing
that gate. Proposed bounded mechanism: an explicitly issued 15-minute operator
delegation created through the email-authenticated browser gate, tied to an
existing member-token ID, user, issuing session and allowed programme actions.
Store only its hash; require member token plus delegation, recheck allowlist and
revocation on every call, and invalidate on issuing-session/token revocation.
No automatic refresh, project-token use, secret logging or restricted OAuth/MCP
exposure. Activation/early-purchase grants need separate action scopes. Test
expired, stolen and cross-user delegations. Interactive authorisation is analogous
to login; domain operations remain available through all three interfaces.

This is a proposed security design, not existing capability. Qualify it before
activation. It grants neither internal Analytics data nor payout rights. Preserve
the separate payout operator policy; navigation to payouts rechecks that gate.

## Programme management and bounded data design

Editor fields: name; referral/introductory-campaign type; eligible plans/intervals;
percentage greater than zero and less than 100; one-invoice customer duration;
commission rate/window; claim schedule; explicit redemption deadline if any;
claim limit; early-grant policy; public wording; terms version; and provider
configuration verification status.

Validate all numeric values with bounded schemas: the initial editor supports
commission rates from zero to 10,000 basis points and windows from one to twelve
calendar months. The owner removed the former 50% ceiling on 17 November; only
paying more than eligible collected cash is rejected. Campaigns without a partner
have no commission setting. Wider durations require explicit policy extension.
Activation/scheduling prepares and verifies the Stripe discount automatically;
mode is server-selected and the normal editor has no provider-ID fields. Retain
advanced manual binding for compatible clients and existing saved agreements.

Use draft, scheduled, active, paused and ended states. Published versions are
immutable. Show preview prices/earnings and before/after terms before activation.
Audit activation, pause, revisions, aliases, claim revocation and grants. Bank
details stay outside workspace forms; never initiate automatic external payouts.

Add forward-migrated storage for these logical records, splitting modules by
concern to respect source-size limits:

| Record                          | Required invariant                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Programme and immutable version | Validated bounded policy, accepted/public terms, explicit lifecycle.                                         |
| Partner membership              | Partner ID and accepted version; legacy agreement stays readable.                                            |
| Global code registry            | Unique canonical code, immutable owner/type, aliases and non-reassignable tombstones.                        |
| Offer claim                     | Protected identity/workspace, attribution, version, source, applicable expiry, one introductory eligibility. |
| Signup intent                   | Exact verified signup binding, bounded expiry/retries and terminal result.                                   |
| Checkout/benefit extension      | Immutable claim/provider references; preserve first-invoice and uncertainty fences.                          |
| Early-purchase grant            | Audited actor/subject/scope/expiry and consumed/revoked state.                                               |
| Operator delegation             | Hashed proof, token/session/action binding, expiry and revocation.                                           |

Reuse receipt/outbox/ledger/payout structures where their invariants fit; extend
policy inputs with frozen versions, without creating another money ledger.
Preserve integer minor units, cumulative rounding, calendar-month anniversary
allocation, funds availability, partial cash and refund/dispute adjustments.
Never infer payment from browser redirects.

Reserve claim-limit capacity atomically when promising the offer. A later
redemption counter cannot invalidate a saved claim. Release slots only through
explicit eligible cancellation/expiry rules; non-expiring referrals retain their
slot. Visits/previews consume none.

Operator metrics: claims, trials, first paid conversions, collected base cash,
discounts, earned/paid commission and reversals, using authoritative bounded
aggregates and defined UTC windows/coverage dates. Cookie visits are not unique
people; do not invent historical click counts or build a tracking warehouse.
Creators see only their minimal client statuses and financial history, never
customer emails, invoices or project data.

## Interface and compatibility contract

Proposed operations must gain exact documented request/response schemas during
implementation. All adapters call shared domain services.

| Capability                                         | Interface coverage                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Public preview/visit                               | Minimal public offer-context/code preview and existing visit routes. |
| Creator profile, code claim and programme terms    | Versioned referral API, CLI, ordinary MCP and app.                   |
| Workspace offer read/apply/replace                 | Offer API, CLI, MCP and Owner-authorised app.                        |
| Quote and purchase admission                       | Existing billing service extended across API/CLI/MCP/app.            |
| Programme list/draft/revise/preview/activate/pause | Operator API/CLI/MCP/app using the authority above.                  |
| Early-purchase grant/revocation                    | Separately scoped operator API/CLI/MCP/app actions.                  |
| Earnings/payouts                                   | Existing compatible readers/actions; no automatic external transfer. |

Keep v1 generated-code schemas and response shapes intact. Strict old clients
can reject extra fields or a branded code in a base32-only field. Use explicit
new/versioned representations for codes, memberships and offers; generated codes
remain the legacy representation of the same permanent partner.

Legacy joins/applications retain their legacy terms while that programme accepts
claims; changing availability uses its existing explicit state, not different
economics. New clients select/accept the new programme/version. Existing creators
opt in without recreating identity. Future link/manual claims then use its
advertised version; prior claims stay frozen. Legacy reads/settlement remain
supported independently of enrolment state. A legacy apply operation that cannot
represent a newer claim must not silently downgrade or overwrite that claim.

Test published old-client fixtures against the new server and new clients against
old-server unsupported-capability responses. Return clear capability guidance,
never a silently different offer. Restricted OpenAI/OAuth catalogues stay unchanged.
No SDK capture or consumer adoption change is required.

| Compatibility case                      | Required result                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Old generated link/code, no saved claim | Resolve the permanent partner and explicitly selected/advertised programme; preserve legacy API economics.                            |
| Old saved 10% claim or ledger           | Continue exact legacy redemption and settlement; never convert it implicitly.                                                         |
| New branded code through a new client   | Resolve the registry and accept the advertised version through the new representation.                                                |
| New claim through an old representation | Return a supported conflict/capability response if it cannot be represented truthfully; do not downgrade it or insert invalid fields. |
| Creator opts into new programme         | Keep partner identity and every alias; only subsequent claims select the new version.                                                 |

## Design-system proposal

The prior approval establishes product direction. This component/state proposal
is the explicit design review artifact required before UI implementation. Use
current shadcn primitives and public-site `--site-*` tokens; no new palette,
typography, spacing scale or novel interaction.

| Surface              | Composition and behaviour                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public offer notice  | Reusable compact strip aligned with the active site/docs/blog navigation container, with a contrasting REFERRAL/SALE tag, short first-invoice message and small close action. Details modal contains full code, eligibility and deadlines; Public code entry is a closed disclosure; Clear code lives beside public/signup code entry. Dismissal keeps the code. |
| Pricing              | Existing PricingTierCard/interval selector; introductory amount first, original price in a plain strike beside an inverse percentage badge, actual billed total and renewal amount.                                                                                                                                                                              |
| Signup/trial/Billing | Shared offer summary/code field with available/saving/saved/reserved/used/expired/ineligible states.                                                                                                                                                                                                                                                             |
| Creator referrals    | Existing header/cards/copy-input/history; add code reservation, conditions, earnings rate/window and examples.                                                                                                                                                                                                                                                   |
| Internal programmes  | Existing gated navigation, PageHeader, line tabs, inventory table/pagination; full-page editor and standard activation confirmation.                                                                                                                                                                                                                             |
| Public `/referrals/` | Existing SiteShell, readable sections, earnings examples, eligibility, trial/payout explanation, terms and join CTA.                                                                                                                                                                                                                                             |
| Footer/blog          | Existing footer navigation and editorial template.                                                                                                                                                                                                                                                                                                               |

Share composable status, code-field, price-breakdown and earnings-example
presentations where framework boundaries permit. Share validated DTOs/money
formatting, not server packages with the static site. One canonical policy
calculation supplies published projections for UI and marketing examples.

Cover loading/no-offer, pending/saved, replacement confirmation, unavailable code,
claim limit, paused/ended, ineligible, transient failure, expired campaign,
checkout pending and consumed states. Preserve drafts on failure; fence stale
account/workspace reads. Never show “saved” optimistically. Require labels,
keyboard focus, live status, non-colour indicators and mobile reflow. Reuse
PendingButton, Field/FieldError, notices and dialogs.

Post-claim copy: “Your referral discount is saved to this workspace. Start your
free trial now; we'll apply 20% off your first eligible Solo, Team or Business
invoice when you upgrade.” Display any campaign deadline alongside it.

## Requirements and acceptance mapping

During implementation add these entries to canonical requirements/acceptance and
reconcile FR-BUS-04, AC-BUS-04, FR-BIL-07/10 and AC-BILL-05/09. These IDs describe
functionality, not phase numbers.

| Requirement                                     | Acceptance                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| FR-REF-01: Creator ownership and compatibility  | AC-REF-01: normalization, uniqueness races, reserved names, aliases, tombstones, old clients/links.               |
| FR-REF-02: Versioned programmes/frozen offers   | AC-REF-02: revisions/pause/end preserve claims, terms, caps and earned obligations.                               |
| FR-REF-03: Cookie-independent trial continuity  | AC-REF-03: manual claim, both signup methods, durable retry, cross-device account read and workspace fences.      |
| FR-REF-04: Accurate offer display               | AC-REF-04: notice/pricing/quote/provider totals agree for every plan/interval; safe cache/error states.           |
| FR-REF-05: Promotions/non-stacking              | AC-REF-05: replacement preserves partner attribution and cannot create another benefit.                           |
| FR-REF-06: Controlled early purchase            | AC-REF-06: code alone cannot bypass; exact grant works; expiry/revocation/replay/races fail closed.               |
| FR-REF-07: Operator control/parity              | AC-REF-07: gate, CSRF, delegation scope/revocation, denied actors, API/CLI/MCP parity and audit.                  |
| FR-REF-08: Correct commission/preserved finance | AC-REF-08: all-plan cash, annual/prorated boundaries, retries, reversals, holds and payout claims reconcile once. |
| FR-REF-09: Discoverability/terms                | AC-REF-09: public page/footer/docs/examples/announcement match activated policy.                                  |
| FR-REF-10: Upgrade/rollback/retention           | AC-REF-10: ordered migrations, preserved data, readiness, compatible rollback and deletion/export.                |

Apply SEC-01/02/03 for bounded transport; SEC-04/04a/05/06/08/09 for auth,
throttling, CSRF/session/proof handling; SEC-10/11 for config/test separation; and
SEC-24/25 for audit/authority. Preserve INV-3/4/5/6 privacy, idempotency, parity and
credential scope. Document the route-specific public-origin exception in SEC-01
without weakening management endpoints. Record SDK parity as not applicable.

## Ordered implementation within the single phase

| Slice                                        | Work and primary owners                                                                                                                                   | Exit evidence                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A — Contracts and fixtures                   | Canonical requirements/acceptance, referral/billing/security contracts, UI proposal review, legacy and money fixtures.                                    | Explicit compatibility/policy matrix and failing behaviour tests.                            |
| B — Durable model and policy                 | `packages/referrals`, `packages/storage`, shared DTO/client modules: versions, codes, claims, signup intents, migrations/readiness and authority records. | Real Postgres upgrade, collision, cap, identity, deletion and concurrency tests.             |
| C — Finance and admission                    | `packages/billing`, benefit stores, receipt adapters/worker: all-plan coupon verification, quotes/reservations, benefit, commission and early grants.     | Six plan/interval combinations plus capacity, failure/replay and legacy-ledger fixtures.     |
| D — Interfaces and operator access           | API, referral client, CLI and MCP: versioned operations, delegation and audit.                                                                            | Auth matrix, parity, strict old-client fixtures, bounded failure handling.                   |
| E — Customer/creator/operator UI             | `apps/web`, `site`: offer components, signup recovery, Billing, codes, editor and public pricing.                                                         | Component/state/accessibility contracts and build/export; no implicit browser investigation. |
| F — Content and qualification                | Public page/footer, terms/privacy/docs, blog draft, isolated full-flow fixtures and provider preparation.                                                 | All acceptance rows evidenced, consistent claims, no unresolved financial correctness issue. |
| G — Release readiness and authorised rollout | Eligibility matrix, cloud deployment/rollback plan, exact artifacts/provider receipts, pre-ship review and docs reconciliation.                           | Local readiness separately recorded; publication/activation only with release authority.     |

Business logic stays in packages; applications are adapters. Keep the 800-line
target/1,000-line hard ceiling and existing import paths when splitting. Use
Docker-backed Make targets; add focused targets before new repeated commands.

## Qualification and deployment

Required automated scenarios with synthetic identities and isolated storage:

- Code collisions across creators/campaigns, case variants, invalid/reserved
  names, concurrent claims, deletion/recreation and alias corrections.
- Both signup methods; existing Free/trial claim; no cookie, rejected optional
  storage, expired/tampered cookie, failed attribution and bounded retry.
- First link versus explicit correction; stale workspace/owner/session; paused
  creator, ended programme, cap races and delayed holiday conversion.
- All six plan/interval combinations, capacity plus base, tax, trial/zero bills,
  failed payment, expired Checkout, unknown responses and duplicate jobs.
- Plan changes, annual service across anniversary, partial collection/refunds,
  noncash credits, disputes, paid reversals and competing payout claims. Legacy
  canonical receipts with unchanged policy inputs must retain identical outputs.
- Offer changes between preview/claim/quote/reservation, coupon drift, shared
  base/capacity products, wrong provider mode and missing expected discount.
- CORS/cache isolation, CSRF, enumeration limits, denied operators, delegation
  expiry/revocation, privilege separation and no secret logging.
- Clean/installed-schema upgrades, unchanged old migration checksums, readiness
  rejection before migration, retained data and mixed-version API/worker reads.
  No destructive schema cleanup in this phase.

Use unit, component, API/CLI/MCP contract and real PostgreSQL integration tests.
Run lint, format, types, coverage, build and affected site export gates. Browser
investigation/screenshots require the explicit request specified by AGENTS.md;
source/export checks and real-browser acceptance remain distinct.

Prepare Stripe test-mode qualification for exact totals, product-scoped coupons,
retries and canonical cash projections across six combinations. Provider writes
require explicit authority; do not create production charges/canaries. Stripe's
first-time-order flag is not domain eligibility; its once-coupon finalisation
behaviour stays covered by invoice-benefit tests.

When release is authorised:

1. Preserve existing state, exact source/artifacts and migration ledger without
   exposing identities/credentials.
2. Apply additive forward migrations before consuming API/worker code. Backfill
   legacy references in bounded restartable steps, retaining records/checksums.
   `db-bootstrap` is never an upgrade path.
3. Deploy compatible readers/writers with new activation off and exact readiness.
4. Verify provider products/coupons and prepare a draft programme. Saved delayed
   conversions must not depend on a globally expired coupon. Domain claim dates
   and provider configuration must independently honour promised benefits.
5. Establish a verified rollback candidate that understands new claims and keeps
   financial reconciliation alive before activation. A Business-only/10%-only
   rollback reader is unsafe once new financial obligations exist.
6. Release matching app/site/client capabilities, then activate the concrete
   programme under operator authority, preserving old links and promises.
7. Publish page/footer/announcement when the advertised offer is usable; verify
   exact served artifacts/routes. Link routing/hosting belongs in the cloud repo.
8. Observe bounded aggregates and reconciliation failures. The stop action halts
   new claims/enrolment while preserving claims and owed earnings.

The original planning-only task retained all versions. The implemented release
assesses core/site/CLI/MCP/shared distributions independently in its eligibility
matrix; SDKs remain Retain without shipped changes. The authorised MCP release
ran the ecosystem pipeline, retaining its partial external search result rather
than treating it as green. Hosted rollout/retention automation belongs in
`.local-repos/debugbundle-cloud`. Production programme drafting/activation and
payment or mail canaries were not part of the authorised deployment.

## Completion and remaining decisions

Implementation is complete when every AC-REF row has concrete evidence, legacy
regressions pass, UI/provider/ledger calculations agree, pre-ship review has no
unresolved correctness/security issue and docs are reconciled. Record local,
provider, deployment, publication and owner acceptance separately. Follow the
pre-ship, post-phase reconciliation and session-handoff skills at their relevant
boundaries; do not call source tests proof of production acceptance.

Before UI code: review this explicit design-system proposal under AGENTS.md.
Before activation: confirm actual review date/claim cap, payout cadence/minimum/
final settlement, published terms and cookie treatment. Explicitly review the
existing referral-specific goodwill-refund restriction; this plan does not
silently replace the owner-approved policy.

Next implementation action: reconcile canonical contracts and add failing
code/offer/legacy fixtures in slice A. No runtime code or production setting is
changed by preparing this plan.

## References

- [Business](business-tier.md), [billing](billing.md),
  [referral accounting](../contracts/referral-accounting.md).
- [Requirements](requirements.md), [acceptance](acceptance.md),
  [security](../rules/security-hardening.md),
  [design discipline](../rules/design-discipline.md).
- [Live referral guide](https://debugbundle.com/docs/referrals/) and
  [price catalogue](https://debugbundle.com/pricing-catalog.json).
- [Stripe coupons/promotion codes](https://docs.stripe.com/billing/subscriptions/coupons),
  checked 15 November 2026; refresh at provider qualification.
