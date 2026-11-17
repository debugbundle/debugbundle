# Referral and offer UI review

16 November 2026. Follow-up to the approved design proposal in
`referral-programmes-plan.md` and the owner's request for a more compact banner.
Local source/component review; no browser rendering or screenshot acceptance is
claimed. Core and site remain on `feature/referral-programmes`, uncommitted.

## Pattern and scope

Retain existing public-site tokens, typography, buttons and responsive spacing;
retain the app's shadcn Field/Input/Notice/confirmation patterns. The public notice
is a compact offer-type tag and summary aligned with the active navigation container with a standard details modal. The owner's
SayCheese screenshots and read-only source inspection guide the tag, amount/strike
order and modal hierarchy. No SayCheese files or runtime were changed. No new visual system,
dependency, payment behaviour, eligibility rule or storage/API interface is added.

| Surface                           | Review and refinement                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public offer notice               | Blue REFERRAL/SALE tag and first-invoice message on the left; a blue View details link and arrow on the right, with no dismiss control. Home retains max-w-7xl with its existing gutters; docs/blog match the installed Fumadocs 97rem/1400px containers with 16px gutters. Phones show “20% off” on one row; full scope remains available to assistive technology and in Details. Full codes stay in the modal. |
| Notice interaction                | Shared Radix modal shell with title/description, Escape/close behaviour, library-managed focus and scrollable body. Terms/pricing links close the modal. The technical hide/remove explanation and removal action are gone; clearing belongs beside code entry.                                                                                                                       |
| Public price cards                | Discounted amount first, then plain-text original amount in `del` beside a percentage badge. Code tags reuse the stronger blue token; discount badges use the inverse neutral tokens. Renewal, annual upfront payment and exclusions remain visible.                                                                                                                                  |
| Public code entry                 | Plain native details/summary disclosure, closed by default, with no surrounding card. Persistent label, full-width mobile input, bounded desktop field and mobile code-entry settings remain inside. Clear code sits beside Check code and clears local presentation only after the server confirms success. Failures retain the code.                                                |
| Public programme terms            | Readable line length and less internal terminology; numerical price/commission columns align right with tabular figures and explicit column headers. Existing conditions and six examples remain intact.                                                                                                                                                                              |
| Signup, Billing and creator forms | Shared components retained; help and errors linked to their code input, invalid/disabled field semantics and mobile code entry aligned. Signup Clear code uses the anonymous endpoint; only successful clearing removes the URL hint and alternate auth links, preserving trial/return intent.                                                                                        |
| Checkout summary                  | Amounts align right with tabular figures; labels retain flexible width. First invoice, renewal, capacity, tax and yearly payment distinctions remain visible.                                                                                                                                                                                                                         |
| Creator and operator organisation | Programme conditions/examples and administrator version metadata use a shared closed-by-default Programme details disclosure. Names, revision/state, enrolment consent and operator actions remain visible. Existing histories, inventories and confirmations are retained.                                                                                                                                                                                                           |

A stale or updating public offer previously retained optimistic discount copy. The notice now
shows standard-price/retry guidance while validation is unavailable or in flight, matching the
pricing cards. This is presentation only; the underlying pending code remains
available for recovery.

The app refinements follow the existing component API and the current official
[Field](https://ui.shadcn.com/docs/components/radix/field) and
[Input](https://ui.shadcn.com/docs/components/radix/input) documentation.
The modal reuses the installed [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
and the site's established overlay tokens. `site-dialog.tsx` owns the reusable
frame; `public-offer-notice.tsx` owns offer presentation; `offer-badge.tsx` and
`offer-price.tsx` keep tag/price styling consistent. Provider state and money
calculation keep their existing boundaries. Clearing remains an anonymous hint
operation, separate from authenticated Billing benefit removal (FR/AC-REF-03–05).

## Verification

- The first UI round reproduced stale discount messaging and missing accessible
  validation. The subsequent modal round reproduced the old inline presentation
  against the new request, then verifies compact trigger semantics, complete modal
  conditions, paused/error/loading states, monthly/yearly amounts and fractional
  percentage badges. That checkpoint had 111 passing site tests, typecheck and static
  export/recovery checks.
- Token-based contrast checks pass: code tag 5.68:1 light / 10.40:1 dark;
  discount badge 17.16:1 light / 14.22:1 dark. This is a calculation from the
  current CSS tokens, separate from browser visual acceptance.
- Signup validation reproduced missing invalid/accessible error state. All 35
  owning customer, signup, creator, operator and quote component tests pass.
- Core typecheck, focused lint/format and candidate builds pass. Actual V8
  measurements refresh the four modified app component maps. All other runtime
  files retain hash-verified audit measurements; all 108 changed source files pass
  the unchanged coverage gate.
- Local preview rebuilt through `make referral-public-review`; public-only
  synthetic `REVIEW20` remains the review code. Private signup/Checkout and real
  provider acceptance remain separate, as documented in the review guide.

Receipts: `.tmp/referral-ui-{site-green,app-green,coverage,coverage-gate,types,lint,build,preview}.log`
and `.tmp/referral-ui-coverage-provenance.json`. `.tmp/referral-ui-served.json`
confirms that the running preview serves the final HTML and offer client bytes,
including the loading-state correction, with an available local `REVIEW20` offer.
The prior backend audit and image
receipts remain historical; current UI bytes are in `apps/web/dist` and `site/out`.
No image publication, deployment or programme activation occurred.

Latest modal/tag receipts: `.tmp/referral-modal-{green,format,preview}.log`,
`.tmp/referral-modal-contrast.json` and `.tmp/referral-modal-served.json`.
This round changes only site presentation and documentation; the earlier app
component and backend audit receipts retain their original scope.

The subsequent compact/mobile and code-clearing refinement passes 112 site tests
and 71 app/offer/auth tests. Regression checks first reproduced the missing
generic labels and Clear code action. They now cover long referral/promotion codes,
full modal conditions, successful anonymous clearing, retained state on failure or
malformed/unconfirmed responses, and preservation of trial/return links. Public URL
hints are retained until the server confirms `{offer: null}`. Signup uses the same
existing anonymous endpoint, never the authenticated benefit-removal route.

Core/site type checks and focused lint/format pass. Fresh V8 measurements replace
only the three changed app source maps; every other runtime source hash matches
the previous measured evidence. The unchanged coverage gate passes all 108 changed
files. Receipts: `.tmp/referral-compact-{site-green,coverage,check,coverage-gate}.log`
and `.tmp/referral-compact-coverage-provenance.json`. The compact close target is
32px; keyboard focus remains visible. Mobile uses shorter copy, while screen readers
retain the full first-invoice scope. No browser measurement is claimed.
Both local builds pass; the public preview was rebuilt and refreshed with the
explicit review API override. `.tmp/referral-compact-served.json` records exact
HTTP-to-export HTML, JavaScript and CSS matches for referrals/pricing, including
the compact full-width strip and code-entry controls. Build receipts:
`.tmp/referral-compact-{build,preview,format-check}.log`.

The owner subsequently restored container alignment: home/marketing uses its
existing `max-w-7xl` and 16px/24px gutters; blog matches the installed Fumadocs
1400px navigation and docs its 97rem layout, both with 16px gutters. Route-aware
presentation keeps the root notice mounted so dismissal survives navigation.
Public code entry on Pricing and Referrals is a native details/summary disclosure,
closed by default, without the surrounding card. Keyboard toggling, form labels,
errors, replacement confirmation and clearing remain available when expanded.
The new disclosure regression first failed against the persistent card, then all
113 site tests and typecheck passed. This is a site-only refinement; existing app
and financial verification retain their previous scope. Current receipts use
`.tmp/referral-alignment-*`.
The site export/rebuild passes. `.tmp/referral-alignment-served.json` verifies that
home, docs, blog, Pricing and Referrals serve the current HTML, JavaScript and CSS;
both public code forms are closed disclosures in the exported HTML. This verifies
served artifacts, not browser-measured geometry.

Pricing placement follow-up: the optional code disclosure now belongs to the
pricing controls directly above the plan cards. It sits opposite the billing
interval selector on desktop and directly beneath it on narrow screens. It no
longer occupies a standalone row between the tax note and Enterprise section.
When expanded, the desktop billing selector stays aligned to the bottom of the
controls row. Code actions do not shrink or wrap their labels; the input takes
the remaining row width. The pricing disclosure label stays anchored to the
right in both states while its fields remain left-aligned. Narrow screens retain
the stacked form arrangement.
All 113 site tests, typecheck, formatting and local export pass. The served HTML
and linked assets match the rebuilt export; the sole closed code disclosure is
inside the pricing controls before the plan cards. Receipts:
`.tmp/referral-pricing-placement-{check,format,preview}.log` and
`.tmp/referral-pricing-placement-served.json`.
The expanded-row alignment/button follow-up retains 113 passing site tests,
typecheck, formatting and export checks. Current receipts use
`.tmp/referral-pricing-alignment-*`, including HTTP-to-export asset verification.
The disclosure label alignment uses the reusable `summaryAlign` option: pricing
anchors the summary to the right; form fields keep normal start alignment. All
113 site tests, types and export checks pass. The local preview serves the current
HTML and alignment CSS; receipts use `.tmp/referral-disclosure-alignment-*`.
The closed desktop pricing summary removes the disclosure's outer vertical
padding and aligns its question to the bottom of the controls row, matching the
billing pill. Its 44px focus/tap area remains; expanded and stacked mobile states
retain their existing alignment.
All 113 site tests, typecheck, formatting and export pass; served artifacts match
the rebuilt local export. Receipts use `.tmp/referral-question-baseline-*`.

The owner's agent-prompt reference is now the common dialog design. `SiteDialog`
owns the shared header/footer, border, overlay and 36px circular close button,
with existing spacing/focus tokens. The prompt client now consumes this shell
instead of duplicating Radix markup. Its wide/top-positioned layout, eyebrow,
description, code block, docs link and copy state remain its own configuration;
offer details retain a compact centred layout. The header's close control sits
at the end of the title row with the same inset as the prompt reference.
Both prompt entry points have named, closed modal-trigger regression checks.
All 114 site tests, typecheck, formatting and static export checks pass. The local
preview is rebuilt; `.tmp/referral-shared-dialog-served.json` verifies current
HTML and linked assets on referrals, pricing and the Alerts guide, including the
shared shell and retained prompt clipboard action. Remaining receipts use
`.tmp/referral-shared-dialog-{check,format-check,preview}.log`. These are
source/component and served-artifact checks; browser interaction is not claimed.

Final pricing placement: the owner moved the optional code disclosure to the
right of “Compare every plan”. The billing selector is restored to its original
centred position above the cards, independently of the disclosure. Comparison
heading/summary controls share a 44px row; the question stays right-aligned when
opened, with form fields left-aligned and non-wrapping actions. On narrow screens
the disclosure follows the comparison heading. The former bottom-alignment
special case tied to the billing pill has been removed.
All 114 site tests, typecheck, formatting and export pass. The rebuilt preview
serves the restored selector and one closed code disclosure inside the comparison
section; linked assets match the current export. Receipts:
`.tmp/referral-comparison-code-{check,format,preview}.log` and
`.tmp/referral-comparison-code-served.json`.

Private app review: port 5291 runs the existing explicitly opted-in local UI
simulator. Missing v2 interception and offer/admin/legacy-referral fixtures caused
the reported loading failures. The middleware now handles v1/v2 locally; new
in-memory adapters validate offer operation inputs/outputs and expose synthetic
campaign drafts, revisions, test binding/activation and codes. Empty Analytics,
earnings, client and payment responses match the current clients. Unsupported
support/payment operations return unavailable; live-mode binding is refused.
Both Host and Origin restrictions, body bounds and production exclusion remain.
No provider or database clients are imported by these adapters.

Internal Analytics and Programmes & offers titles now replace DebugBundle in the
app header. Content headings are removed; Analytics links to Programmes in ready,
error and email-gate states, with the return link retained. Create programme sits
at the right of the tabs row and is hidden while editing or on another tab.
The title-placement regressions first failed against the old fallback header.
All 146 local preview/offer/UI tests pass, including actual middleware requests,
origin denial, draft/revision/state contracts, legacy reads and reset semantics.
Core types, focused lint/format and the candidate build pass. Real HTTP reads
verify all 15 requested API resources and four app routes on 5291. Receipts use
`.tmp/referral-app-preview-*`. No browser geometry or real provider/authentication
acceptance is claimed; simulator state remains separate from the public fixture.

## 17 November compact programme cards and link hover

The owner requested homepage-exact link behaviour: the shared inline link class
now uses no underline normally and underlines only on hover, including the banner
button. Existing colours, arrow, focus ring, phone label and container alignment
are preserved. No banner dismissal was restored. The public preview was rebuilt.

Creator enrolment and accepted-agreement details, and administrator programme
metadata/policy/examples, reuse `offer-programme-details.tsx`. It composes the
installed Radix Collapsible with the existing ghost Button and rotating chevron.
It starts closed, supports keyboard activation and exposes standard expanded and
controlled-region attributes. Consent, code fields, provider forms, revision and
activation controls remain outside, so disclosure changes do not reset inputs.

Focused checks: 14 creator/admin/policy/payout component tests passed, with
initial failures recorded before implementation. All 114 site tests passed; site
typecheck passed after the export completed. A concurrent initial typecheck saw
temporary missing generated `.next/types`; the post-build check passed without
source changes. Core types, focused lint/format, app build and public export also
passed. No browser/device acceptance, commit, publication or deployment is claimed.
Evidence is in `.tmp/referral-banner-hover-*.log` and
`.tmp/referral-programme-disclosure-*.log`.

Final disclosure coverage passed 10 tests across four files. The shared disclosure
measured 100% lines/functions; creator and administrator integrations measured
92.64%/94.73% lines and 94.73%/93.75% functions respectively. Existing coverage
maps were retained only for hash-verified unchanged runtime source. The complete
changed-file gate passed 125 files (10 existing larger files qualified by changed
executable lines). Receipt: `.tmp/referral-programme-disclosure-coverage-gate.log`;
provenance: `.tmp/referral-programme-disclosure-coverage-provenance.json`.

## 17 November pointer affordances

Enabled native and ARIA buttons now inherit `cursor: pointer` from the public
site's shared base layer. This covers offer details, home/docs theme toggles,
menu buttons and dialog controls. Native/ARIA/data-disabled states are excluded;
explicit zoom, drag and disabled cursor styles still override the base rule.
The app's existing Button/Toggle primitives already provide pointer cursors.
The regression check failed before the CSS change; all 115 site tests and the
public export passed afterward. The local preview was refreshed at port 5292.
Receipts: `.tmp/site-pointer-cursor-red.log`, `.tmp/site-pointer-cursor-green.log`
and `.tmp/site-pointer-cursor-build.log`. No browser hover inspection or deployment
is claimed.

## 17 November compact action widths and Analytics alignment

Programme-details triggers use intrinsic button width and start alignment in both
creator and administrator cards; the join/change-programme action also stays
content-sized on the left. Policy tables retain their normal available width.
Analytics uses one full-width PageHeader with its status badges and Programmes &
offers link in the right-hand action group, including the email-gate/error states.
The existing responsive header handles narrow layouts without changing other pages.

The existing Analytics check now waits for its asynchronously loaded action before
checking its placement with the UTC status; the initial check raced the loading
skeleton. All 14 focused creator/admin/Analytics checks passed afterward, as did
core typecheck, focused lint/format and the local candidate build. Fresh V8 maps
cover the three changed runtime files; changed-file coverage passed 125 files.
Receipts: `.tmp/referral-compact-actions-tests-green.log`,
`.tmp/referral-compact-actions-check.log`, `.tmp/referral-compact-actions-build.log`
and `.tmp/referral-compact-actions-coverage-gate.log`. No browser/device or
production acceptance is claimed.

## 17 November creator referral tabs

The creator Referrals page now reuses the existing internal Tabs primitives:
Programme (code, enrolment and agreement), Earnings, Referred clients and Payments.
Payment preferences and payment history sit together in Payments. The default is
Programme; the tab list can scroll at narrow widths. Only the selected panel is
exposed to assistive technology. Panels remain mounted while hidden to preserve
unsaved branded codes, recipient details and history pagination. The personal
identity key clears hidden drafts on a signed-in-person change. A confirmed
enrolment refreshes payout setup and balances through a component callback.
Legacy creators keep their code, terms, earnings, history and separate payout
operator action. Programme-unavailable earnings use a neutral notice.

All 39 focused component/app checks passed, including keyboard tab selection,
inactive-panel visibility, legacy accounts, draft retention, post-enrolment setup,
identity changes, payment validation and unavailable states. Core types, focused
lint/format and the candidate build passed. Fresh V8 coverage measures the page
at 98.48% lines/100% functions and creator control at 92.75%/94.73%. The changed-file
gate passed 125 files after hash-verifying unchanged runtime maps.

Receipts: `.tmp/referral-tabs-final-coverage.log`,
`.tmp/referral-tabs-final-check.log`, `.tmp/referral-tabs-build.log`,
`.tmp/referral-tabs-coverage-provenance.json` and
`.tmp/referral-tabs-final-coverage-gate.log`. The local preview remains at
`http://localhost:5291/settings/referrals`; no restart was needed. This is local
source/test/build qualification, with no browser, device or production acceptance.

Earnings empty-state follow-up: an Earnings Card now composes the existing
ResourceEmptyState with the finance Wallet icon, centred title and description,
matching the client/payment cards. Balance, loading and failure branches are
unchanged. The regression assertion failed against the former notice; all 25
referral checks passed afterward. Core types, focused lint/format, candidate build
and the changed-file coverage gate passed. Receipts:
`.tmp/referral-earnings-empty-{red,green,check,build,coverage-gate}.log` and
`.tmp/referral-earnings-empty-coverage-provenance.json`.

Saved payout-preferences priority: Payments now precedes preferences after every
accepted programme has a confirmed saved destination, including on return visits.
Setup remains first while any programme needs details. Failed saves retain input
and ordering; editing saved preferences does not move them back above history.
The preference component reports only confirmed completeness. Stable keyed
siblings retain their state when the page changes DOM order.

All 32 referral/payment checks passed, covering successful and failed saves,
saved-on-load ordering, incomplete programmes, draft retention and legacy flows.
Core types, focused lint/format and the candidate build passed. Fresh V8 coverage
measures the page at 98.59% lines/100% functions and payout preferences at 100% for
both; both files exceed the existing 80% statements/lines/functions floor.
Coverage is retained separately because unrelated session sources changed in the
workspace; older whole-tree maps were not reused or overwritten. Initial session
failures were followed by a passing targeted control and the fresh 32-test run.
Receipts: `.tmp/referral-payout-order-{red,fixture,green,check,build}.log` and
`.tmp/referral-payout-order-coverage-provenance.json`. No browser or production
acceptance is claimed.

## 17 November configurable commission correction

The owner clarified that 50% is an initial default, never an operator ceiling.
Offer validation and verified-cash accounting now share a 0–100% basis-point
schema. This boundary rejects paying more than eligible collected cash after
discount/refund allocation. Discount and commission are sequential; their nominal
percentages are not added. At 100% the retained base share is zero before fees
and operating costs. Refund debt and existing legacy 50% agreements are preserved.

The editor accepts exact two-decimal percentages without floating-point input
artefacts. Its validation explains the cash boundary, and new-draft description
copy no longer hard-codes a commission promise that becomes stale after editing.
The browser policy projection and generated OpenAPI/reference artifacts were
refreshed. No database shape/checksum or live programme data changed.

Qualification: 292 checks passed in the disposable-Postgres/backend/UI sweep;
its sole failed assertion identified the stale generated API reference. After
regeneration, all 68 final-source/unit/automation/contract checks passed. Database
cases cover all three paid plans at 50%, 75% and 100%, later draft revisions,
duplicate receipts and refunds. CLI/MCP and real HTTP draft composition accept
higher rates; legacy settlement assertions remain unchanged. All 116 site checks,
core/site types, focused lint/format, app build and public export passed.

Fresh V8 coverage passes the existing 80% statements/lines/functions floor for
all three changed core runtime files; the site's generated module exactly matches
the canonical policy. Coverage is retained independently of unrelated working-tree
changes. Initial site build/type qualification found a test-fixture union that
needed explicit version narrowing; the corrected fixture and final export passed.
Local HTTP reads returned 200 for Programmes, public Referrals and the served
OpenAPI document, whose 13 versioned commission bounds all advertise 10000 bps.

Vite automatically restarted after its shared policy dependency changed. The
private simulator's temporary review edits reset on that restart. Public nginx
was refreshed after export; neither fixture is a production/provider acceptance.
Receipts: `.tmp/referral-commission-rate-green.log`,
`.tmp/referral-commission-rate-qualified.log`,
`.tmp/referral-commission-rate-check.log`,
`.tmp/referral-commission-rate-coverage-provenance.json`,
`.tmp/referral-commission-rate-build.log`,
`.tmp/referral-commission-rate-site-final-test.log`,
`.tmp/referral-commission-rate-site-final-types.log`,
`.tmp/referral-commission-rate-public-final-build.log` and
`.tmp/referral-commission-rate-http.json`. No activation, deployment or transfer
occurred.
