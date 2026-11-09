# Business dashboard follow-up

Owner-approved local corrections for FR-BUS-02, FR-BUS-04 and FR-BUS-05, 8 November
2026. This is a presentation/browser-adapter follow-up; domain permissions,
financial policy, report scope and database schemas retain their contracts.

- Workspace switching appears only when at least two organisations are available.
  It reuses the existing large sidebar button and account-menu width/typography,
  without leaving an empty sidebar group. Focus/open refreshes discover membership
  changes; live backend membership remains authoritative when switching.
- Reports empty states reuse Card, Empty, icon and button primitives. Create,
  billing and project actions follow current permissions/entitlements. History
  retains its labelled region, including retained reports after downgrade.
- The browser referral adapter preserves shared-client error codes while retaining
  invalid-session handling, HttpOnly cookies and CSRF. Programme unavailability
  hides the Billing control and has a neutral Referrals state; transient failures
  remain retryable and domain messages remain visible.
- Root local Compose and environment examples use API port 3003 for referral links.
  Their default enrolment switch remains off. The ignored private `.env.local` has
  a stable signing secret, local enrolment enabled and localhost API/landing URLs
  for owner testing. Only the local API/worker were recreated; production settings
  and provider catalogue/payment/payout state were not changed.

Seven initial regression failures reproduced the reported problems. The focused
checks cover workspace hiding/discovery/switching, report actions and archive
access, referral error typing/session expiry, unavailable/temporary failures and
billing draft recovery. The complete dashboard/local-Compose run passes 862 tests
in 131 files. Type, lint and formatting checks and the package/dashboard candidate
build pass. Fourteen headless cases cover desktop/mobile, single/multiple
workspaces, Business/Team/read-only empty reports, unavailable referrals, hidden
Billing controls and invalid codes. Screenshots also cover light/dark themes; all
API responses in those visual checks are synthetic and no payment is attempted.

Receipts, screenshots, source hashes and the latest `dashboard.tar.gz` are retained
under `.tmp/business-ui-followup/`. Local API readiness passes and Vite serves the
changed source. Earlier runtime snapshots remain historical and must be refreshed
from the selected final source before release; this follow-up does not deploy or
activate production. The public-site artifact remains the pricing-anchor fix.


## Local referral URL correction

The initial local configuration check verified environment flags and API readiness,
but did not verify that the referral configuration parser accepted those URLs.
Zod's `httpUrl` also requires a public domain hostname, so it rejected localhost and
silently left the service unconfigured. The same restriction affected landing/link
construction and shared-client responses. One shared referral HTTP(S) URL schema
now accepts local/self-hosted hosts, including IPv4/IPv6 loopback, while continuing
to reject non-HTTP protocols and malformed URLs.

Seven tests first reproduced these failures. Type/lint/format, 164 referral tests
and 17 API configuration/CLI/MCP tests pass. The restarted local API constructs the
service and read-only queries for the owner's existing workspace validate partner,
earnings and attribution responses. Two final dashboard browser cases cover both
unenrolled state and an enrolled partner's localhost share link, with synthetic
responses and no consent or financial writes. Vite serves the corrected schema.

The latest dashboard archive, source receipt and runtime-read evidence are under
`.tmp/referral-local-url-fix/`, superseding the previous dashboard archive only.
Earlier runtime source images remain historical pending final-source release
preparation. No production configuration, provider payment, payout or enrolment was
changed.

## Referral terms and navigation presentation

FR-BUS-04 presentation follow-up: the acceptance link's `#referrals` fragment now
exists on the programme heading; the containing section preserves
`#referral-programme` for existing documentation links. The FieldLabel wraps its
text/link in one inline text container, preventing flex gaps between words, and
omits the trailing full stop. The link uses canonical `/terms/#referrals`.
Documentation navigation places Referrals in Help immediately after Billing.
Terms content/version, eligibility, API behaviour and consent state are unchanged.

Three failing regressions first reproduced the missing anchor, navigation grouping
and label mismatch. All 62 site checks and nine referral UI tests now pass, along
with site/root types, changed dashboard lint/format and site/dashboard builds.
Eleven headless checks cover desktop/mobile direct navigation to both fragments,
JavaScript disabled, the existing docs terms link, Help placement, normal inline
spacing, link activation without accepting terms and keyboard consent toggling.
Screenshots were reviewed; no overflow or browser errors occurred. Dashboard
responses are synthetic and no enrolment or financial write was submitted.

The local public preview was refreshed and the local Vite source was read back.
`.tmp/referral-presentation-fix/manifest.json` records source hashes and the latest
dashboard/public-site archives, superseding the earlier UI-only archives. Existing
runtime snapshots still require a final-source rebuild before any release. The
pre-ship review found no new route, trust boundary, data/schema change or resource
lifecycle; this remains an unpublished local presentation correction.

## Referral payout page consistency

The payout child route now uses the existing shared-header breadcrumb composition:
Referrals links to its parent and Payouts is marked as the current page. Balances
and the reusable client/payment history compose Card with Empty, icon, title and
description, matching Reports. Empty first pages hide redundant pagination;
empty later pages retain Previous and explain how to return. The same shared
history correction applies to a partner's own Referrals page. Existing claim,
recording, retries, permission checks and financial state retain their behaviour.

Three initial regressions failed before the fixes. All 36 referral, Reports and
project-header checks pass, along with root types, changed-file lint/format and
the package/dashboard candidate build. Four headless scenarios cover desktop/mobile
and light/dark, both operator and partner empty histories, keyboard navigation back
to Referrals and access denial for a non-operator. Screenshots were reviewed with no
overflow or browser errors. Responses are synthetic; no enrolment, claim or payment
was submitted. Local Vite modules were read back after implementation.

The updated dashboard archive and source hashes are recorded in
`.tmp/referral-payout-ui-fix/manifest.json`. The public-site artifact remains
`.tmp/referral-presentation-fix/public-site.tar.gz`. Pre-ship review found no new
API, schema, trust boundary or resource lifecycle. No publication or deployment
occurred, and a final-source runtime build is still required before release.

## Local tier testing

FR-DEV-01 / AC-DEV-01 add `make dev-tier` inspection and
`make dev-tier TIER=free|solo|team|business [ORG=uuid]`. The shell verifies a local
Unix Docker endpoint, exact Compose service/container and this checkout before
connecting to Postgres through its container socket. A parameterised psql script
locks exactly one organisation, refuses provider-linked identities, trials and
pending billing, and sets the selected base tier with zero extra capacity. It does
not reset usage, call providers or bypass normal database downgrade/retention rules.
The operator-default helper respects an explicit administrative Free entitlement;
ordinary automatic Team defaults and authentication checks retain their behaviour.
No new network route, permission bypass or database migration is introduced.

Six initial regressions failed. Sixty distinct tool/auth/billing checks pass,
including invalid input, remote/foreign targets, read-only status, failure
propagation and explicit-Free persistence. `make dev-tier-check` exercises the
actual SQL in a disposable networkless Postgres: all tiers, ambiguous/missing/exact
organisation selection and provider/trial/unfinished-operation refusals. Root types,
changed-file lint/format and shell syntax checks pass.

A private mode-0600 database backup preceded the owner's local Team-to-Business
switch. Protected user/project/incident/membership/report/referral counts and the
membership checksum match afterwards. Actual API dependency readers agree on
Business and its base capacity; the initial operator default does not replace it.
The local API was restarted and readiness passes. No provider, AI, email or paid
evaluation was invoked. Evidence is in `.tmp/dev-tier/`; existing dashboard/site
archives are unchanged, while any runtime release still needs final-source preparation.

## Reports navigation, timezone and settings layout

9 November, FR-BUS-05/06: report creation uses the existing header-action context,
small primary button and plus icon from Projects. The empty-state create action
uses the same primary pattern. Permission/plan checks still determine availability,
and route changes remove the previous action. The shared breadcrumb composition
now covers Reports → Create report / Report settings / Report, retaining the
Referrals → Payouts parent pattern and existing project breadcrumbs.

The reusable definition fields use a two-column desktop grid for name/period,
projects/recipients and delivery time/timezone. Privacy, consent and schedule
enablement span the grid. Tablet/mobile stay one column; visual inspection caught
and corrected an earlier tablet breakpoint that cramped cadence buttons. New
schedules reuse the existing browser-timezone default with UTC fallback. Saved
or manually selected timezones/times remain intact when editing or toggling
scheduling. UTC fact periods, consent, cadence choices, limits and API payload
contracts retain their behaviour.

Three initial regressions failed. All 41 focused report/referral/project checks
pass, including create action placement, parent navigation, role gating, saved
schedule/draft preservation and explicit consent. Root types, changed-file
lint/format and the package/dashboard candidate build pass. Eight headless cases
cover four widths, light/dark, two device timezones, all three child breadcrumbs,
keyboard return, manual/saved timezone preservation and controls within their
containers. Final screenshots were inspected. Responses were synthetic; no report
definition, generation, delivery or provider call was submitted.

The local Vite modules were read back. `.tmp/reports-ui-refinement/manifest.json`
records the final source hashes and dashboard archive, superseding the preceding
dashboard archive only. The public site remains unchanged. Pre-ship review found
no new API, schema, permission boundary or resource lifecycle; header effects clean
up on route changes and existing server validation remains authoritative. No
publication/deployment occurred; runtime release preparation still needs final source.

## New-report form defaults

9 November, owner clarification: automatic monthly report provisioning on Business
activation remains deferred. When a user opens the new-report form, Monthly,
automatic generation, 09:00 in the current browser timezone and the current
verified account recipient are preselected. The checkbox now reads Generate
reports automatically and explains generation, selected-recipient email and
manual-only operation when disabled. It composes the standard FieldContent so the
checkbox aligns with its label rather than the middle of wrapped help text.

The form creates nothing until Save and keeps project scope and Full-mode source
consent explicit. Recipient defaults use the signed-in verified user ID; the server
still validates verification and full-scope access. Saved definitions are mapped
directly from their record, retaining disabled scheduling, null schedules and
intentionally empty recipient lists. Public API defaults remain unchanged.

Three initial regressions failed. All 20 report checks and 62 site checks pass,
plus root/site types, changed-file lint/format and dashboard/site builds. Report
test sessions now use valid UUID identities so the preselected recipient exercises
the unchanged real input validator. Tests cover consent before Save, current-user
recipient selection, unverified exclusion, retained failed drafts and saved manual
settings. Eight headless desktop/mobile cases cover verified/unverified new forms,
saved manual/scheduled forms, editable defaults and both device/saved timezones.
Final screenshots were inspected; no browser errors or page overflow occurred.
All browser API responses were synthetic and only reads were permitted.

Local Vite and the rebuilt/remounted documentation preview were read back.
`.tmp/report-form-defaults/manifest.json` records the final dashboard and public-site
archives, superseding the preceding UI/site archives. Pre-ship review found no new
API, database shape or permission path; current server consent/recipient checks
remain authoritative and no automatic report/account provisioning was introduced.
No report definition, AI generation, email or provider mutation was performed.


## Tier wording and customer referral visibility

9 November, owner-directed, FR-GHA-17 / FR-BND-08 / FR-EVT-05 and FR-BUS-04:
the homepage workflow link is now simply GitHub automation. General paid-feature
guides and upgrade messages use paid plans rather than an incomplete Solo/Team
list. Slack and collaboration retain their actual Team-or-Business distinction;
pricing choices, legacy billing operations and referral exclusions keep their
specific tier names. Current analytics/retention/trial documentation includes
Business where applicable. CLI health-check descriptions match the existing
shared capabilities. Capture-default prose now matches the already implemented
balanced default on all hosted plans; no capture, limit or SDK behaviour changed.

Billing renders customer code entry only after its billing summary is known and
only for owners on Free or an active no-card trial. Established paid and internal
plans hide it without requesting customer attribution. Business trials retain
code entry before their first paid conversion, as do trials that may convert to
Business. Server eligibility, Checkout reservations, saved attribution and partner
enrolment/earnings are unchanged. A formerly paid customer back on Free remains
subject to the existing authoritative server checks.

Four new visibility regressions initially failed. All 152 focused checks across
14 files pass after updating the changed copy expectations, alongside root/site
types, changed-file lint/format, 62 site checks and dashboard/site builds. Eight
headless desktop/mobile billing cases verify Free, Business trial, paid Business
and internal Business, including no attribution reads when hidden, collapsible
entry when shown and no overflow/browser errors. The served homepage link was
also checked and final screenshots inspected. Browser API responses were synthetic
and read-only. Local 5291 source and the refreshed 5292 public preview were read back.

Pre-ship review found no new API, schema, permission, resource-lifecycle or billing
policy boundary. `.tmp/tier-copy-referral-visibility/manifest.json` records the
latest dashboard/site archives and source hashes, superseding the preceding
form-default archives. No account, report, provider, email or production mutation
occurred. Final-source runtime release preparation remains separate.


## Homepage Smart Reports introduction

9 November, owner-approved presentation of FR-BUS-05/06: the investigation-tools
section retains its six cards and adds a compact full-width Smart Reports row
below them. It identifies Business availability and explains recorded resolutions,
major issues, next priorities, weekly/monthly reviews, email overviews and HTML/PDF.
The whole row links to the existing Smart Reports guide.

The existing shared SurfaceCard accepts a responsive row layout and rich heading
content; its default stacked layout remains compatible. The new consumer reuses
site tokens, border, icon, typography, hover and keyboard focus styles. Mobile
stacks the action below the copy, while tablet/desktop place it alongside. No
new route, data read, report generation, permission or delivery behaviour is added.

All 62 site checks, types and static build pass. Six headless light/dark cases at
390, 768 and 1280 pixels verify the full-width placement below the existing cards,
responsive direction, no page overflow, visible keyboard focus and Enter navigation
to the report guide. Existing About cards retain their stacked layout. Final
screenshots were inspected and the rebuilt local preview is served at port 5292.
Browser traffic was confined to read-only local preview requests.

Pre-ship review found no schema, trust-boundary or resource-lifecycle change.
The latest site archive and source receipt are under `.tmp/homepage-smart-reports/`,
superseding the preceding site archive only. The dashboard archive remains under
`.tmp/tier-copy-referral-visibility/`. No publication or deployment occurred.


## Smart Report wording and contextual agent setup

9 November, owner-directed FR-DOC-01/09 and FR-BUS-05/06: public feature copy now
promotes email overviews and downloadable PDFs. Guides and terms describe the
in-app report in plain language; technical HTML routes/contracts remain intact.
The dashboard action is Open report in new tab, with matching PDF-failure copy.
No report content, generation, download, auth or delivery behaviour changed.

The homepage report row uses the same 32px icons, 16px semibold titles, 14px/24px
body typography and 20px padding as the existing tool cards. Its independent
Explore link aligns with the description and shares the exact compact outlined
button style with Quick installation's Set up DebugBundle link. The agent trigger
sits at the right of the heading row; the surface is a section to avoid nesting
interactive controls inside a card link. Existing stacked SurfaceCards retain
their layout and styles. All agent dialog descriptions use 14px/20px typography;
bounded dialog scrolling keeps Copy reachable on small screens.

The shared catalogue calls the new workflow Smart Reports setup. Homepage copy
uses Regular reviews. The prompt supports daily, weekly and monthly choices,
recommends monthly initially, and requires cadence/forecast confirmation rather
than enabling daily by default. It reads existing definitions before changes,
checks member/project/recipient authority, obtains Full-mode source consent and
privacy choice, preserves weekly digests, and uses stable creation IDs or expected
update versions. Read-only connections prepare a proposal. Manual generation,
test mail, trials and billing changes require a separate explicit request.

One reusable AgentAssistPromptCard now serves Quickstart's Optional Agent-Assisted
Workflows and the five linked feature guides: analytics, alerts, availability
checks, probes and Smart Reports. Catalog tests verify each guide's matching card,
actual public management tool names and the report prompt's safety boundaries.
No new management capability or public API was introduced.

All 65 site checks, site/root types, changed dashboard lint/format, 20 report checks
and dashboard/site builds pass. Six headless light/dark cases at 320, 768 and 1280
pixels compare actual card typography and button styling with the existing controls.
They verify generic names, layout, keyboard guide navigation, all five contextual
cards and the five-card optional list. Forty-two prompt copy/focus-return checks
match the complete catalogue text; descriptions measure 20px line height and
all dialogs stay within the viewport. Two additional desktop/mobile cases check
five public pages and the renamed dashboard action using synthetic read-only API
responses. Final screenshots were inspected and local previews serve the changes.

Browser review also found a mobile pricing overflow: absolutely positioned hidden
Included/Not included labels escaped their table cells. A relative containing
block now keeps them inside the table. The page stays within the mobile viewport,
and the comparison region still scrolls to Business. A documentation-card height
rule and unbounded small-screen dialog height were corrected during review.

Pre-ship review found no new schema, external trust boundary, report/provider write
or resource lifecycle. The latest dashboard/site archives and source receipt are
under `.tmp/report-agent-workflows/`, superseding the previous homepage site and
tier-copy dashboard archives. No commit, publication or deployment occurred;
final-source runtime release preparation remains separate.


## Homepage report-card spacing and links

9 November, owner correction: the report row shares the tool grid's 16px visible
card gap. The mobile stack accounts for the carousel's existing 8px bottom padding;
tablet and desktop use the normal 16px stack gap. Removing the row variant's minimum
height and space-between distribution also matches the neighbouring title/body
spacing instead of stretching it. Stacked SurfaceCards retain their previous
minimum height, padding, distribution and hover styles.

The Smart Reports title now links to the existing guide with the same title-link
classes as the other tool cards. The row surface has no border-highlight hover
state; its separate title, Explore link and agent button remain independent
controls. Report behaviour, prompt text and credential settings are unchanged.

All 65 site checks, types and static build pass. Six headless light/dark cases at
320, 768 and 1280 pixels measure a 16px visible card gap, matching desktop/tablet
title-to-description spacing, unchanged card border colour on hover, matching
reference title-link styling and successful keyboard title/button navigation.
Prompt copying and focus return still work; existing stacked cards retain their
layout. No page errors or horizontal overflow occurred. Final screenshots were
inspected and the local public preview was refreshed.

Pre-ship review found no new route, API, schema, trust boundary or resource
lifecycle. `.tmp/report-card-consistency/manifest.json` identifies the latest site
archive and source hashes, superseding only the preceding public-site archive.
Dashboard artifacts, protected provider configuration and hosted runtime remain
unchanged. No publication or deployment occurred.


9 November, owner spacing adjustment: the Smart Reports row now has an explicit
10px internal gap (`gap-2.5`). This supersedes the preceding internal-spacing choice;
the 16px outer card gap, title link, button and border-hover behaviour are preserved.
All 65 site checks, types/build and two computed-style checks pass at 320/1280px.
The local preview is refreshed; the latest site receipt/archive is under
`.tmp/report-card-gap/`. No dashboard, credential, report or hosted change occurred.

## Referral customer refund terms

9 November, owner-requested policy addition for FR-BUS-04: a separate customer
refund section excludes discretionary/goodwill refunds for Business base
subscriptions purchased using a referral code or link, unless expressly agreed in
writing. Mandatory legal withdrawal/refund rights and remedies for a service not
supplied as contracted remain intact. Refunds reflect actual discounted payments
subject to applicable law; partner commissions are adjusted separately and cannot
reduce a legally required customer refund. The terms date and referral guide are
updated, with a direct `#referral-refunds` link. The separate versioned partner
agreement, frozen offers, commission calculations and existing holds/reversals are
unchanged. No automated refund rejection or new financial operation was added.

The scope was checked against the European Commission's
[consumer contract guidance](https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-contract-terms/index_en.htm)
and [digital-service remedies](https://europa.eu/youreurope/citizens/consumers/shopping/guarantees/index_en.htm).
This is a customer-facing policy restriction, not a guarantee against fraud,
chargebacks, provider fees or uncollectable post-payout negative balances.

Pre-ship review covered the terms, guide and matching specification/accounting
contract: no application logic, API, schema, trust boundary or resource lifecycle
changes. All 65 site tests, type checks and the static build pass. Generated HTML
checks preserve both existing referral anchors, verify the new policy and mandatory
rights wording, and validate the guide's link. Local terms/guide HTTP readback
passes after refreshing only the public-site preview. No browser review was needed
for this text-only change. `.tmp/referral-refund-terms/manifest.json` identifies the
latest unpublished site archive, superseding only the report-card-gap site archive.
Dashboard/provider configuration and hosted runtime remain unchanged.

## Local paid billing review

9 November, owner-approved FR-WEB-10 / AC-WEB-10 and FR-BUS-01 follow-up: the existing
Vite-only simulator now models all paid tiers and intervals through shared catalogue
and change-classification functions. The retained legacy fixtures remain supported.
Private scenario controls reuse CollapsibleCard, FieldGroup, ToggleGroup, Input and
PendingButton, with normal loading/error/disabled behaviour. Free fixes capacity
at zero; trials retain the first-purchase wait. Synthetic amounts are explicitly
labelled and never represent a provider quote.

Normal paid dialogs review and confirm upgrades through loopback-only checkout;
receipt confirmation changes fixture entitlements and is idempotent. Downgrades
and interval switches keep current access until simulated renewal, retaining extra
units. Exact schedules can be cancelled. The local portal handoff exposes simulated
cancellation/renewal to Free. Session/project tier projections agree. New mock
configuration validates bounded strict input and clears stale fixtures; expired or
source-changed quotes fail. All state remains in memory. The real local database,
API/worker, credentials, hosted flags and financial records remain unchanged.

Complimentary billing retains its existing restrictions and gains a read-only
View plans link through the shared environment-aware external-link helper. Browser
review found that the normal plan dialog lost keyboard focus on close. A failing
regression reproduced it; the existing shared DialogTrigger now restores focus
without changing the quote, payment or scheduling handlers.

139 focused tests, a separate overlapping 73-test billing UI run, types/lint/format
and the candidate build pass. The initial 36 simulator regressions were red before
implementation; the focus regression was also red before its fix. Twelve final
headless checks use the real loopback Vite simulator, including actual local
checkout/receipt navigation, mature/locked trials, annual/monthly quotes, scheduled
reductions/cancellation, Free and complimentary presentation. Desktop/mobile light
and dark screenshots were inspected. No page error, unexpected HTTP failure,
external request or horizontal overflow occurred; keyboard return passes in both
mobile themes. Test-script selector/animation corrections are retained as historical
evidence, not product failures or final acceptance receipts.

Pre-ship review covered the Vite gate/middleware, private scenario schema/controls,
mock billing state, shared external link, plan-dialog trigger and matching docs.
No production API, SDK, database schema, provider operation, migration or cleanup
path changed. Production build scans exclude the private simulator path/controls.
The preview is left on paid Team/monthly with zero extra units for owner review.
`make dev-mock-off` restores normal routing; `make dev-tier` remains the separate
real-local-entitlement tool. No new production billing bypass is introduced.

`.tmp/billing-preview/manifest.json` records the final dashboard archive and source
hashes, superseding `.tmp/report-agent-workflows/dashboard.tar.gz` only. Public-site
artifacts remain at the referral-refund terms receipt. Provider-hosted payment,
tax/authentication and actual portal configuration are separate acceptance gates;
no commit, publication or deployment occurred.

## Reports tier gate, Free explanation and sidebar

9 November owner follow-up for FR-BUS-01/05 and FR-WEB-10: hosted non-Business
Reports reuse PlanUpgradeCallout, matching Improvements' neutral card, badge and
Open billing button. Empty definitions/history do not appear below this callout.
Existing authorised definitions and report history remain visible, with current
Business-only management controls still gated. Self-hosted entitlement remains
unchanged. Genuine archive failures still show Retry; plan/workspace changes
invalidate stale list completions. Projects is immediately after Improvements in
the existing shared sidebar array, including its mobile rendering.

The plan chooser explains that Free is reached by cancelling through Manage
subscription. Configuration is preserved while paid features pause; data is still
subject to Free limits and retention, not an indefinite storage freeze. The billing
guide's outdated original-tier retention sentence was corrected against
`retention-store.ts`, which uses the current organisation plan. No cancellation
API, Stripe pause mode, free price or provider configuration was added.

The local simulator now returns schema-valid empty report lists, with signed-in
workspace matching and bounded list queries. Actual browser testing exposed that
the old `org_123` fixture fails the report client's UUID boundary before any HTTP
read. A real-client regression first reproduced that failure, and the fixture now
uses one UUID shared by session/projects and derived management records. Production
input validation was preserved. Existing mock creation tests now assert that new
projects use their current session workspace, rather than an obsolete literal.

Six initial presentation/endpoint regressions and the additional real-client UUID
regression were red before the fixes. All 129 focused tests, 72 site checks,
types/lint/format and both builds pass. Sixteen actual Vite browser cases cover
Free/Solo/Team/Business at 390/1280px in both themes, computed-style equality with
Improvements, sidebar order, the Free explanation and keyboard dialog return.
Screenshots were inspected. There are no page errors, unexpected HTTP failures,
external browser requests or horizontal overflow. Unit coverage additionally
preserves authorised archive reads after downgrade, retries real archive failures
and retains unlocked self-hosted Free reporting.

Pre-ship review covered presentation gates, empty/retained/error states, late
completions, mock identity/query/auth boundaries, sidebar routing and retention
copy. No production API, database schema, report permissions, SDK, generation,
AI/email, billing operation or cleanup policy changed. The latest dashboard/site
archives and source hashes are in `.tmp/reports-tier-gate/manifest.json`, superseding
the billing-preview dashboard and referral-refund-terms site archives only. The
local simulator is left on paid Team/monthly with zero extra units. Local public
docs were refreshed; real data and hosted runtime are unchanged. No commit,
publication or deployment occurred.
