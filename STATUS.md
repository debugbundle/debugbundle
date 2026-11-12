# 12 November release — published and production verified; external discovery partial

Core 1.26.0 is live from `3fb2a321e3de18bac89d631a1cc21b5f46f42b79` through backend workflow 43130093460. API and worker serve the verified immutable `5bb8dfb7…` image, healthy with zero restarts; public readiness passes. All 91 source migrations match, preserving all 90 previous checksums. Aggregate counts, independent budget state, authenticated settings/consent/scope/schedule/allowance and saved-report content hashes are unchanged. Only the qualified weekly-review marker changed to `weekly-review-guidance`; no new paid evaluation or generation canary ran.

App 43131222787 and site 43131226071 pass. Site 1.9.1 is live from `76a59e9c2cf17525987e3e86c0254917919e7326`; 97 site tests, 149-page export, canonical release and main CI pass. Live HTTP verifies the compact on-demand Chat controls, removed Contact placeholder, shared readiness reconciliation, high-priority home hero preload, article/sitemap, 200-tool schema, 23 immutable scripts and exact app build. Browser/Lighthouse/provider-interaction acceptance is not inferred.

Shared types 3.6.0, CLI/MCP/OpenClaw 1.24.0, Codex 1.8.0, Claude Code 1.24.0, Gemini 1.7.0 and Action 2.0.1 are published with registry/native/public-source checks. Unchanged SDKs and redaction retain their versions. Both current ClawScan security gates pass; VirusTotal was retired by the provider and is recorded explicitly, with adverse historical evidence still rejected. Discovery remains 5/7 under unchanged rank requirements. OpenAI 1.1.0 remains a separately gated sealed candidate.

The full runtime CI passes all 135 shards and the normal changed-source gate for 109 files, plus PDF/audit/lint/types/build. The provider-contract follow-up passes all 19 security/publication tests and scoped checks. Retention verifies active plus one previous stable release, zero candidates and 45 GiB free. The DebugBundle production incident check has zero new incidents/regressions; historical records remain. Canonical core 1.26.0 publication passes workflow 43134185035 at tag source `40a36d43`. The final evidence-only main CI is linked from the release record and canonical GitHub Release. Exact evidence: [release record](spec/release-20261112.md).

# Smart improvement guidance — pre-release qualification history

The Owner approved implementation, then requested removal of unnecessary format
versioning on 11 November 2026, reporting that the just-launched feature is not
yet in use.
The local change now has one schedule, one AI configuration and the existing saved
bundle/export shape. A normal `/plan` read (CLI `improvements reviews plan`, MCP
`get_improvement_review_plan`) exposes richer checks through the same domain read.
The client falls back to the export on an older server. No format selector,
per-review format/profile columns, extra enablement flags, image labels or staged
reader rollout remain. Migration `202611110001_add_improvement_review_planning`
adds only the bounded nullable context snapshot and its readiness constraint.

Guidance covers recurrence, measured analytics and capture policy/rules, alert
delivery, sensitivity, temporary diagnostics and unobserved SDK-local filters.
Typed next steps distinguish investigation, noise review, measured flow and
missing evidence; every control keeps separate effects and verification safeguards.
The original export continues to include validated AI investigations.

Earlier baseline verification passed a 193-test combined
cohort and 122 focused tests. All 134 regression shards ran; two stale
metadata checks were corrected and their exact shards pass (66 tests). The normal
80% changed-source gate passes for all 23 changed source files. Types, lint,
formatting, application/public-site builds and freshly installed CLI/MCP checks
on Node 22/24/26 pass. Source/public docs and generated agent metadata are synced.
See `spec/smart-improvements-guidance-verification-20261111.md` for the precise
receipts, coverage reconciliation and limits of these local checks.

Final local completion (11 November): the Owner approved finishing the remaining
health/specificity work and extended the cumulative evaluation cap from 66 to 102
requests, retaining USD 1 overall. The final prompt asks for recorded retry/no-retry
comparisons, failing/last-successful monitor windows, independent recovery and
previously successful-check regressions. Identical investigation checks under
different source labels are rejected to factual plans without a paid retry; the
model can omit redundant prose while all server plans remain available. Factual
monitor plans now provide the same concrete comparison and verification task.

The final bounded check **passes**: all 18 paid cases validate and meet the 7/8
agent usefulness threshold, including overlapping health (8/8); both no-request
cases abstain. It used 36 additional HTTP requests and USD 0.0389609. All runs total
102 requests / 51 paid attempts, USD 0.1056066, with no uncertain holds. Initial
fixture mistakes, failed quality review and exact original outcomes remain
preserved. Final evidence is
`evals/smart-improvements/guidance-qualification-final-20261111.json`; the earlier
failed receipt does not qualify current inputs.

The final deep audit closes cross-rule repeated notification detection, reordered
duplicate AI checks and input-order-dependent selection of large linked groups.
All 213 tests across 22 files pass with real storage, including exact-hash replay
of all final provider responses and newly expired factual rule plans. The prompt
and qualified requests remain unchanged; no further provider calls were made.
The normal changed-source coverage gate, typecheck, lint and formatting pass.
All earlier migration, public-site/app build and installed-client receipts remain
applicable to their unchanged surfaces. The planned implementation is ready for
Owner review/testing; agent qualification is not human acceptance or a universal
quality guarantee. The approved request cap is exhausted.

No activation, commit, push, publication, deployment or consumer change occurred.
The Owner subsequently requested the article prepared for the next release:
`site/content/blog/weekly-smart-improvements-recurring-incidents.mdx` is now ready
with the planned 12 November 2026 date. The next site build includes it; coordinate
publication with the guidance release. Production configuration is unchanged. Release and activation are separate later actions. Earlier
pre-simplification/failed-prompt receipts are historical only.

# Smart Products production release — verified; external marketplace gate open

Core 1.25.0 and the app are live from `5662ecfa9c4d317af1bb88a6dffc900f282da449`.
Runtime CI 42933424182 passes all 134 shards, PDF regressions, audit, lint, types
and build. Bridge 42938121962 and activation 42938941486 pass: all 90 migrations,
all 87 prior checksums and checked aggregate counts are preserved. Both retained
image pairs support v2. Reports and separately qualified weekly AI are enabled;
account settings stay opt-in. Existing report and new settings/allowance/archive
reads pass. DebugBundle's own incident check found no new attention since rollout.

App 42939755311 and site 42941740400 pass. Site 1.9.0 serves the Analytics page,
approved pricing/docs, Crisp support chat, UI fixes and the Business-only article.
Nine live pages and the sitemap pass content/canonical checks; no new visual or
Lighthouse score is claimed. Core 1.25.0 and site 1.9.0 canonical releases pass.
Shared types 3.5.0 and CLI/MCP 1.23.0 are public with registry/native checks green.
Codex 1.7.0, Claude Code 1.23.0 and Gemini 1.6.0 pass public installation, local
evidence, authentication, update and removal checks. Gemini Node 22/24/26 and its
exact five-file source/tag/downloaded archive pass. The official Registry resolves
1.23.0. Normal public OpenClaw 1.23.0 installation passes on host 2026.11.3.

ClawHub skill/plugin 1.23.0 are public with clean final platform reviews, but their
required antivirus results are absent and two skill discovery queries miss rank.
Strict acceptance remains incomplete: no force/security bypass, threshold change
or repeat upload. Final findings are preserved in
`spec/smart-products-marketplace-20261111.json`. External gallery indexing remains
separate. Final source CI is visible in GitHub Actions; deployed artifact and
successful release receipts are in `spec/smart-products-release-20261111.md`.

Retention is clean: only active plus verified previous remain, containers are
healthy and 45 GiB is free. No consumer product was changed. Owner authorised the
full release and bounded evaluation; the evaluation used 32 provider requests and
USD 0.0220396, with no customer data. Operational evidence is retained under
`.tmp/release-20261111/` and in the private cloud runbook.

Final developer-source CI exposed a clock race in the ten-project report-content
test fixture: separately sampled expiry could exceed cutoff plus 90 days by one
millisecond. A deterministic reproduction confirms the retention validator is
correct; production already derives expiry from the saved cutoff. The fixture
now does the same, and its complete disposable-Postgres integration file passes.
No runtime or published-artifact change is needed. Final source CI covers this
test-only correction; historical failed run 42941119042 is retained as evidence.

Earlier sections below are historical local-phase records.

# Business article draft and Invite person icon — local review ready, 11 November 2026

Invite person now has the shared inline + icon. Core typecheck, focused lint/format
and ten People interaction tests pass. The unpublished article **Smart Reports and
team access in DebugBundle Business** follows the existing practical blog style.
The Owner explicitly chose released Business updates only; upcoming Solo/Team
factual reports, weekly reviews and stronger restricted-name protection are excluded.
Search-intent research and claim sources are in
`site/docs/smart-reports-business-post-editorial.md`; no measured volume/trend claims.

All 74 site tests, typecheck and static build pass. Article metadata, sitemap/archive,
hero and seven internal links are verified. Local article and archive HTTP bytes
match export at `http://localhost:5292/blog/smart-reports-engineering-reports-team-access/`.
No publish or deploy. The blog has no draft filter: the MDX would enter a later
site deployment, whose full scope and actual publication date still require review.

# Members, tokens and People refinements — local review ready, 11 November 2026

Project Members now uses a wider 3:2 left column, capitalised roles and shared
Alerts-style icon actions; its introductory text is removed. Both token tables
have matching right-aligned Revoke buttons with retained confirmations. Viewer
failed because the local mock omitted it from its role validator; the mock is
fixed, and the existing API accepts all three roles in regression tests. Vite
automatically reloaded the mock, resetting synthetic demo edits only.

People and Referrals now match user-menu row spacing. People has a compact search
beside the title with a trailing icon, the requested placeholder and no visible
label. Its table actions align right and reuse the shared icon buttons, preserving
permissions, accessible names and confirmation behaviour.

Core typecheck and focused ESLint/Prettier pass; 95 tests pass across 11 files.
Local HTTP reads confirm updated source and project routes on 5291. No browser
visual acceptance, real membership/token operation, publish or deploy occurred.
Details: `spec/local/handoffs/access-ui-refinements-20261111.md`.

# Improvements tabs and compact header — local review ready, 11 November 2026

Improvements now reuses Analytics' line tabs: Opportunities at `/improvements`
and Weekly reviews at `/improvements/reviews`. Filters persist between views;
inactive panels and their bulk actions are hidden. Saved-review access and Owner
consent controls retain their existing checks. The weekly header is shorter,
limited to the existing `max-w-lg` token, with the AI allowance on its own line
and wrapping actions. Opportunities omits the empty-selection instruction while
retaining counts and controls once rows are selected.

Final core typecheck, focused ESLint/Prettier and 28 Improvements/review tests pass.
The earlier tab-route/navigation check passed 9 cases, and the public guide change
passed all 74 site tests, typecheck and build. Both local tab routes and changed
source modules are served on 5291 without resetting the synthetic preview.
No browser/visual acceptance or release occurred. Evidence and review scenarios:
`spec/local/handoffs/ui-refinements-20261111.md` and
`spec/local/handoffs/smart-products-review-20261110.md`.

# Public UI and app navigation refinements — local review ready, 11 November 2026

All four Owner-requested refinements are implemented: the Contact security card
uses the shared card action to `/security/`; testimonial figures retain native
figure/caption semantics without the invalid `group` role; phones use naturally
wrapping bundle-title text with decorative braces around the title only, while
desktop keeps its whole-section framing; Health Status now follows Improvements
in the shared app sidebar.

Verification: 74 site tests, site typecheck and static build; core typecheck,
focused sidebar lint/format and 22 navigation/health/improvement tests all passed.
The first export retained stale CSS; a clean build after preserving `.next` fixed
it. Final HTTP readback matches 3 exported pages and both linked stylesheets,
including the new mobile rules and existing Crisp bootstrap. The synthetic app
preview serves the new order without being restarted/reset. Public preview is
healthy at `http://localhost:5292/`; the source preview on 5293 is resumed.
No browser/screenshots or fresh Lighthouse score were taken. No publish or deploy.
Evidence and details: `spec/local/handoffs/ui-refinements-20261111.md`.

# Public-site Crisp chat — locally implemented, 11 November 2026

The Owner-supplied Crisp website ID is mounted in the shared public root layout
through Next.js Script after hydration. Marketing, documentation and blog share
one asynchronous loader; repeated bootstrap preserves queued commands and the
loaded API. No new package, app/account identity wiring or core runtime changes.
The privacy page discloses support-chat processing and links to Crisp's policy.

Verification: all 74 existing site tests, typecheck and bounded static build pass.
An isolated fake-DOM check verifies the ID is set before loading, one script on
re-entry and preserved queue/API state without contacting Crisp. All 145 exported
HTML files contain the bootstrap; seven local routes return 200 and exactly match
the export. Public preview refreshed at `http://localhost:5292/`. No browser/widget
interaction or chat message was performed; no commit, publish or deploy.
Details: `spec/local/handoffs/crisp-public-site-20261111.md`.

# Smart products - deep audit complete; local review ready

All four approved workstreams are implemented as an uncommitted local candidate.
The final deep audit fixed scheduler/housekeeping starvation, identity-bound
pausing, canonical retention after consolidation, and cached-PDF identity changes
during fetch. Intentional factual reports now share useful linked summaries and
severity-ordered focus across web/HTML/PDF. Weekly reviews retain recorded source
relationships and stronger investigation/verification instructions. Agent-facing
consent, permissions and readback are documented for ordinary MCP/CLI.

Final gate: 780 tests across 103 files passed; all 82 changed production source
files meet the unchanged coverage policy. Four tool-gated PDF skips pass in the
separate 18-test real PDF run. The broad sweep passed all 133 test groups (6,474
tests); its aggregate coverage failed on two files during ongoing edits, and the
subsequent frozen-source combined gate passed those files and the full changed
surface. General integration passed 182 cases (one unselected external SDK artifact
variant skipped); full consolidation passed 111. Historical and populated upgrade,
readiness, receipts, frozen OpenAI, static/build/OpenClaw and site gates passed.
The 142-file deep-audit fingerprint records that tested snapshot; the subsequent
public-copy follow-up below has its own site verification.

Contract: `spec/smart-products.md`. Detailed final evidence and known boundaries:
`spec/local/handoffs/smart-products-deep-audit-20261110.md`. Owner scenarios:
`spec/local/handoffs/smart-products-review-20261110.md`. Previous evidence in that
guide is explicitly historical; the deep audit supersedes it.

Ready for Owner local review/testing. New review AI remains default-off and
unqualified; actual provider usefulness requires separately authorised paid
qualification. Release requires migrations before new readers/workers, generation
pause during mixed-reader rollout, and a v2-capable rollback. No commit, push,
publication, deployment, production/consumer mutation or paid provider call occurred.

Public-copy follow-up: Team/Business weekly smart reviews now appear in pricing
cards, comparison and FAQs, with fixed 5/25 and 10/50 project/AI-review limits.
Priority support remains last on Team. Homepage, Analytics, pricing/billing/report/
improvement/MCP docs and privacy/terms disclosures distinguish factual reports,
Business AI reports and separately consented weekly reviews. The billing guide now
uses catalogue per-unit analytics limits. No feature, dependency or schema changes.
Site verification: 66 site tests plus 8 dependency-policy tests, typecheck and bounded
static build passed. Eleven public preview routes returned 200 with bytes matching
the export; the local public container is healthy. Evidence: `.tmp/smart-products-public-copy-green.log` and `.tmp/smart-products-public-copy-http.log`.

Documentation grouping follow-up (11 November): the landing page now matches the
sidebar: Capture Policy, Reducing Ingested Events and Managing Noise under
Configuration; Availability Checks, Smart Reports, Probes and GitHub Automation
under Advanced Features. GitHub is no longer duplicated under Agent Workflows.
Existing SurfaceGrid/SurfaceCard styles, keyboard states and canonical paths are
reused; icon choices match the sidebar. Corrected the GitHub guide's incomplete
plan-availability sentence. All 74 site tests, typecheck and static build passed;
31 local docs routes returned 200 and matched the export. The local public preview
was refreshed; no publication or deployment. Evidence:
`.tmp/docs-navigation-reconciliation-20261110.log` and
`.tmp/docs-navigation-reconciliation-http-20261110.log`.

App synthetic preview: localhost:5291; public static preview: localhost:5292;
Analytics source preview: localhost:5293. Only the local public preview was restarted
for this follow-up. No browser/screenshot acceptance was performed; real API, worker
and database containers remain unchanged.
The historical handoff below remains unchanged for continuity.

# Next-thread handoff - four deferred product proposals

The 10 November production release is live. The next-thread handoff is
`spec/local/handoffs/smart-products-next-20261110.md` (local/ignored): Team/Business
Smart Improvements, stronger restricted-report project-identity protection,
deterministic Solo/Team reports with Business AI reports, and public Analytics
navigation/marketing. These remain proposals; no implementation or activation was
performed in the handoff turn. It records the released sources, existing gaps,
material decisions, code paths and acceptance expectations. A new release and
fresh paid evaluation require separate instructions. Preserve this uncommitted
documentation pointer and the local handoff when starting the next thread.

# Smart Report and dashboard release - live; external acceptance partial

10 November: core 1.24.0 is live from `78783e7cb12b6f0c49e874e1287236e317c9f995`;
site 1.8.1 is live from `2245639aab088292370ed7a58355e43ba08b314f`.
CLI/MCP 1.22.0 and shared types 3.4.0 are published with registry/native checks.
The official MCP Registry resolves 1.22.0. ClawHub accepted and exposes the 1.22.0
skill/OpenClaw package; normal public installation on OpenClaw 2026.11.2 passes.
Its strict acceptance remains partial: antivirus evidence is missing for both,
the provider skill verification reports `card.missing`, and discovery passes five
of seven queries. These gates remain open; upload/install/review success does not
waive them. Developer-plugin pins, SDK versions and the OpenAI release are unchanged.

Full source CI `42841110248` passed 6,367 main-lane cases plus 16 required PDF
cases, the unchanged 90-source coverage gate and native Node jobs. Initial CI
caught shared integration-fixture state: a referral readiness test intentionally
removed a constraint/ledger entry, which the choice fixture reused. The failing
order was reproduced and fixed by resetting only that fixture's disposable schema;
all behavioural assertions and production migration validation remain intact.

Backend `42848814140`, app `42852886471` and site `42852895723` passed. The 87-entry
ledger retains all 86 prior entries; the nullable diagnostic and allowlist
constraint are present. Exact image/source hashes, API/worker readiness, retained
rollback pair, report/receipt/allowance hashes and environment hashes pass.
Authenticated choices/private reports work; anonymous choices are denied with
no-store. All 26 checked CDN resources match S3, including the exact app build,
generated references and cache policy. All eight alarms and three saved checks
pass. No new active incident IDs appeared; the pre-existing reviewer credential
expiry warning increased from 36 to 38 occurrences and remains open.

No new paid report, automatic retry, email resend or consumer-product action was
performed. Existing factual content and the historical unknown rejection reason
remain unchanged. The stronger restricted-output project-name safeguard and the
new product/tier/marketing proposals remain deferred. Release evidence:
`spec/smart-report-release-20261110.md`, `.tmp/release-20261110/`, and the private
cloud runbook `runbooks/smart-report-release-2026-11-10.json`. Later documentation
commits do not identify another deployed runtime revision.

# Combined production-readiness review - locally qualified, release withheld

10 November: Owner requested a final combined audit and explicitly withheld release.
Review and evidence: `spec/production-readiness-smart-reports-ui-20261110.md` and
`.tmp/production-review-20261110/`. Added the missing analytics-choice DB suite to
CI and reproduced/fixed its registry omission. The full unit pass found two
distribution/documentation failures: the public MCP count and generated OpenClaw
manifest lagged the new tool. Both are corrected; existing targeted regressions
and Node 22/24/26 offline OpenClaw runtime checks pass. The new tool remains
optional. Added release notes and synchronised the private site companion's
API/CLI/MCP guides and generated references; its 72 tests, typecheck and 145-page
production build pass. The hosted companion remains unchanged (33 workflow tests).

Final API review also reproduced a missing explicit cache policy on the new
private choices route. It now sends no-store; the real HTTP/default-adapter/
Postgres regression verifies scoped choices, privacy/no-store headers and no job.

All 132 CI-equivalent coverage groups pass: 6,382 tests across 804 files,
including 390 database cases. The unchanged coverage gate passes all 90 changed
source files. Root types, 148-file scoped lint/format, final fix regressions,
the separate 200-case report/access/migration database run, 16 required PDF cases,
candidate builds, synthetic report resource bounds and the high-severity dependency
policy also pass. The final site build passes after generated-reference refresh.
No known blocker remains in the reviewed changes. Apply the diagnostic migration
before the new API/worker, preserve existing flags/budgets/receipts, and verify
actual deployed revisions/readiness after a separately authorised release.
No commit, publication, deployment, browser review, paid request or production/
consumer mutation was performed. Disposable test services were cleaned up.

# Project details and observed-filter UI follow-up - locally qualified and served

10 November: project identity fields use a responsive definition grid, with labels
above wrapping values. The existing combined overview module was split into
summary/table/presentation modules below the source limit with old exports retained.
Sample tag is a compact input/Apply row with an example placeholder. Create flow
has the standard Plus icon. Bundle generation leaves background time/scope
controls mounted; cancel/list state and focus restoration stay intact.

Metric More filters now offers observed dropdown choices, including countries and
approved custom dimensions, through the bounded project-authorised options read.
Loading, unavailable and empty states disable the affected choices; current
selections survive, stale reads are cancelled/ignored, and retry is read-only.
API, CLI and ordinary MCP parity are documented; existing endpoints, restricted
catalogues, accepted-origin access fences, receipts and generation/AI budgets are
preserved. Privacy changes omit literals rather than rewrite selectable values.
The final review reproduced and fixed an order-only rejection in the new guard.

Qualification: 220 unique regression/interface tests plus five real PostgreSQL
integration tests pass; root types, scoped lint/format, Docker dashboard build,
source-size checks and diff checks pass. The local mock serves observed options
and explicit empty fields at localhost:5291. Evidence and pre-ship review are in
`spec/analytics-filter-choices.md`, `spec/project-details-layout.md` and
`.tmp/analytics-ui-consistency-20261110/` (76-case focused run, 149-case compatible
run with six repeated UI cases, plus the new ordering case and five DB cases).
No browser review, production write, paid request, commit, publication or deployment.
No migration is needed for this aggregate-read/UI follow-up; prior report diagnostic
migration/deploy requirements below remain unchanged.

# Analytics UI consistency - locally qualified and served

10 November: the requested analytics changes reuse the existing section header,
small buttons and form dialogs. Flow edit/archive actions align right and wrap
on narrow screens; create/edit flow and analytics-bundle generation use modal
forms with persistent footers. The existing bundles/new URL is a nested modal
over the retained inventory; cancel restores focus and keeps filters/page size.
Pending guards prevent duplicate writes/dismissal, and drafts survive errors.
Filter menus are bounded single-column popovers with the existing mobile Sheet;
inventory filters sit beside Refresh/generation instead of a separate blank row.
Shared category labels cover flow purpose, action kinds, devices/platforms and
related summaries without changing customer keys, names, routes or query values.

The audit also found metric-only filters offered on inventories that ignored
them. Inventory scope controls/chips and generation defaults now reflect their
supported time/service/environment fields; metric choices survive tab switching
and inventory scope reset. The status/kind filters and pagination stay intact.

Qualification: four modal regressions and two inventory-scope regressions were
Red before their fixes. The full web run passed 917/918 (one old wide-layout
assertion); the final affected run passes 103/103 across 14 files, including the
updated layout assertion and new scope cases. Together they qualify all 920 web
cases. Final root types, lint/format for 29 source/test files, production build
and whitespace checks pass. Source comparison retains bundle form fields and
validation helpers; HTTP confirms seven updated preview modules. Pre-ship review
and decisions: `spec/analytics-ui-consistency.md`; evidence:
`.tmp/analytics-ui-consistency-20261110/`. No browser review, provider/runtime data
write, commit, publication, deployment or consumer-product change.

# Alert rules full-width layout - locally qualified and served

10 November: removed the Owner-requested generic Alert rule guidance card and
split layout. The rules card now uses the available width; retained Slack
destinations remain below it when applicable, followed by grouped deliveries.
Existing table actions, role gates, scope summaries, forms and empty/error/loading
states remain in place. All 32 related web tests, root types, page lint/format,
production web build and whitespace checks pass. HTTP confirms the existing mock
preview serves the update. Pre-ship review covers this static presentation-only
change; no new effects, API, data, schema or cleanup paths. Decision and evidence:
`spec/alert-rule-scope-display.md`, `.tmp/alert-rules-layout-20261110/`. No browser
review, production write, commit, deployment or consumer-product change.

# Empty-state consistency - locally qualified and served

10 November: replaced bare empty-list paragraphs/informational notices across
GitHub rules/deliveries, access and OpenAI connections, alert groups, Slack report
channels, analytics previews/details, incident logs and public status with the
existing icon/title/help pattern. The shared `ResourceEmptyState` composition
retains `ProjectResourceEmptyState` and its prop type as compatible exports.
GitHub creation moves into the empty body only when already permitted; hidden
failures explain browser-only visibility and remain reversible. Loading/errors,
access/upgrade gates, field hints and factual evidence caveats retain their
separate meanings. No backend, schema, dependency, data, access or budget change.

Qualification: two new regressions were Red before implementation. Full dashboard
run: 910/914 passed; three old-label assertions and one overbroad new test
assertion were corrected. Final affected rerun: 17/17 passed across four files,
qualifying all 914 cases across the runs. Final root types, scoped lint/format for
26 source/test files, production dashboard build and whitespace checks pass.
HTTP confirms the existing mock preview serves the updated modules. Pre-ship
review and audit inventory: `spec/empty-state-consistency.md`; evidence:
`.tmp/empty-state-consistency-20261110/`. No browser review, paid call, email,
commit, deployment or consumer-product change. Prior Smart Report work remains
uncommitted and unchanged by this presentation slice.

# Report table spacing and single PDF action - locally qualified and served

10 November: implemented the Owner-requested balanced history columns (5/12,
1/4, 1/6, 1/6 on desktop; mobile remains stacked). Long report names wrap. Failed,
skipped and paused details are now accessible badge tooltips on hover, focus or
activation, with Escape dismissal. Comparison heading/description uses gap-1;
shared table captions have pb-4 inside their border.

PDF is one Download PDF button: Preparing PDF... and the existing left spinner
cover preparation/file retrieval, then the file saves once and the label returns.
Cached PDFs skip preparation. Visiting an already queued PDF does not create a
download intent. Read failures restore an actionable button; leaving the report
suppresses late file saves. The browser uses the existing bounded PDF transport
and session cookies, never sending the internal browser-scope marker. Same-origin,
absolute and relative reverse-proxy API bases are supported. Backend access,
expiry, derivative caching, model budgets and factual receipts remain unchanged.

Qualification: six initial UI regressions failed before implementation. Focused
UI tests: 47 passed; final transport/browser-client cases: 19 passed. Complete
Smart Report coverage: 416 passed, three conditional extraction skips, all 27
changed-source gates green. The coverage target now includes both .ts/.tsx report
adapter tests. Final types/lint/format and production dashboard build pass. Local
HTTP confirms five updated preview modules and a valid cached 23,459-byte PDF.
No browser/screenshot inspection, paid provider call, email, commit or deployment.
Evidence: `.tmp/report-reliability-20261110/table-pdf-*.log`. Existing checkpoints
and the approved design/reliability record remain below.

# Report generation progress - locally qualified and served in preview

10 November: implemented the Owner-requested Generating report... live status
with a reduced-motion-aware spinner, using a reusable pending Notice variant
also consumed by PDF preparation. Slow generation keeps serial read-only checks
(two seconds initially, five seconds later) instead of stopping after thirty
seconds. Hidden/offline tabs pause; transient status/canonical reads use backoff.
Published ready or factual-only content replaces progress in place. Access errors
clear private progress; failed/cancelled/paused states and navigation stop checks.
No status read admits generation, prepares PDF, sends email or calls the provider.

Four new progress regressions were Red before the change. Final qualification:
52 focused UI/presentation/mock cases; full Smart Report gate 403 passed and three
conditional PDF extraction skips, with all 24 changed-source coverage gates green.
Types/lint/format and the production dashboard build pass. Component-only content
and delivery tests were moved into their owning functional files, and the report
coverage target includes all three files. Existing receipt/access/budget and
real-storage tests remain green. No schema, API contract or quota was changed.

HTTP checks confirm the running mock preview serves the new label/spinner and
automatic loading code. A fresh queued synthetic example is recorded in
`.tmp/report-reliability-20261110/generation-preview.json`; opening it demonstrates
queued-to-processing-to-report in memory. No browser/screenshot review or
production deployment was performed. Current evidence: `generation-red.log`,
`generation-final.log`, `generation-coverage.log` and `generation-build-final.log`.

# Smart Report local samples - running in the isolated preview

10 November: the Owner requested mock reports to review the approved UI without
local backend setup. Added four sample definitions and seven runs to the existing
loopback-only Vite simulator: ready multi-project, factual-only, restricted, quiet,
queued/processing, failed and skipped examples. Current complete UTC periods and
production fact/narrative/API schemas are used. Create/edit/generate/regenerate,
cancel/delete, pagination and simulated allowance work in memory; the recipient
warning was fixed with the missing people mock and a consistent UUID demo owner.
No production component or layout was changed in this follow-up.

`make dev-mock` refreshed only the mock frontend. The running preview at
`http://localhost:5291/reports` has synthetic Business selected for fresh actions.
HTTP checks confirm sample documents, recipients, escaped HTML and a 23,475-byte
real PDF from the bounded child renderer. Local API/worker/Postgres container
identities are unchanged. Simulated edits reset when mock mode restarts.

Qualification: 123 mock/report interface tests; final types/lint/format and the
dashboard production build pass. The final quiet example has no invented
resolution/priority. No browser or screenshot review was performed. No AI call,
email, production data, quota, receipt, schema, commit or deployment was changed.
Details: `spec/smart-report-reliability-audit.md`, Local sample report preview;
command evidence: `.tmp/report-reliability-20261110/mock-*.log` and `mock-live.json`.

# Smart Reports reliability and approved UI - qualified locally; not deployed

10 November: completed a further reliability audit and the Owner-approved UI
proposal in `spec/smart-report-reliability-audit.md`. Reproduced and fixed unsafe
narrative publication (including old buffered-response recovery), maximum
multilingual fact redaction, overflowing AI-only selection notes and historical
schedule catch-up draining the allowance. Factual output, final validation,
existing paid receipts/hashes, one-attempt policy, access and budgets are preserved.

Reports now lead with history and compact saved settings/allowance; generation
confirms the UTC period and quota use. Saved reports lead with summary/priorities,
retain canonical urgent work with project labels and use clear states, readable
UTC dates, source disclosures and bounded read-only polling. Existing components
and tokens are reused; no browser or screenshot check was requested/performed.

Full unit run: 5,932 passed (574 conditional skips). Final combined coverage after
recovery changes: 396 passed, including 169 real-storage report cases, plus all
23 changed source coverage gates. The three conditional PDF cases pass in the
separate sixteen-case Poppler/HTML/PDF gate. The matrix exercises 2,160 deterministic
input combinations, not provider responses. Nine previous synthetic request
hashes/budgets are unchanged. Type/lint/format, dashboard build and the bounded
synthetic PDF resource check pass. CI now includes the new diagnostics in its
existing isolated coverage registry and explicitly requires PDF text extraction.

No new paid provider request, production mutation, commit, push or deployment.
The earlier additive diagnostic migration must precede new API/worker activation;
no further migration was added. Provider outages/invalid prose can still yield
facts-only reports. Monitoring and authorised deployed acceptance remain release
work, not evidence established by local tests. See the audit for exact scope,
limits, repeatable targets and `.tmp/report-reliability-20261110/` evidence.
Earlier local rejection-fix and original handoff checkpoints are retained below.

# Smart Report AI rejection - fix qualified locally and with provider; not deployed

9–10 November: the explicitly approved exact-payload diagnostic reproduced
`report_claim_not_supported`. The provider schema admitted highlight references
that did not support their claim kind; correct local validation rejected them.
The decoder now restricts resolution, health recovery and outstanding claims to
supporting references, retaining the canonical schema and local validator
byte-for-byte. A separately approved fixed-schema request succeeded and passed
canonical validation. Two paid local calls total USD 0.0095392 by the application's
cost calculation. Nine token-only fixture checks pass, maximum 10,930/12,000 input
tokens. Model/profile/token limits, the USD 1 account budget and production quotas
are unchanged; there were no automatic paid retries or production mutations.

Allowlisted diagnostics persist outside the existing receipt hash, with nullable
forward migration `202611090001_add_report_model_diagnostics`, legacy NULL/hash
compatibility and fail-closed readiness. Shared dashboard/HTML/PDF/email copy
explains factual fallback. Final focused qualification: 179 report/interface
tests, 46 report integration tests plus 17 storage migration cases, sixteen
PDF/rendering checks, types/lint/format. An earlier full unit run had 5,895 passes,
two timeouts and one stale startup fixture; all three files passed isolated reruns
at unchanged time limits, including the added refusal-to-listen regression.
Authenticated readback confirms the original canonical report is unchanged.
The original report and paid receipt are preserved; its discarded reason remains
unknown and is not backfilled. No commit, publication or deployment occurred.
See `spec/smart-report-ai-rejection.md` and private receipts under
`.tmp/report-model-rejection-20261109/`. Earlier handoff checkpoint retained below.

# Smart Report AI rejection - diagnosis complete, fix pending

9 November: the owner's October monthly report received a Terra response
(2,444 input / 370 output tokens), then fell back to facts because the report
client rejected the output. The exact branch is unknown: settlement drops the
safe rejection reason and presentation collapses it to `model_rejected`.
No fix or new model call was performed. The next thread should preserve bounded
diagnostics, identify the actual cause and fix it without weakening validation,
changing immutable receipts or retrying paid work implicitly. Local handoff:
`spec/local/handoffs/smart-report-ai-rejection-20261109.md`; private receipts:
`.tmp/report-model-rejection-20261109/`. This checkpoint is a handoff-only edit.

# Business/UI release - live, external acceptance partial

9 November: core 1.23.0 and site 1.8.0 are deployed from the exact tested refs.
Business sales, Smart Reports and referrals are enabled with the unchanged $1
monthly account report budget. All affected SDK/shared/CLI/MCP and developer plugin
packages are published and qualified through their supported installation paths.
Core CI passes 6,228 tests and changed-file coverage for 438 source files; site CI,
protected-data/migration checks, rollback retention, public assets and live pricing
checks pass. The three superseded Stripe prices are archived safely.

ClawHub publication is accepted but strict antivirus/discovery acceptance remains
partial. OpenAI 1.1.0 is an independently prepared candidate awaiting its separate
portal/review process. The owner's authenticated account, checkout and report/inbox
acceptance remain distinct. See [the release record](spec/business-release-20261109.md).
No consumer application or installation was changed.

# Reports tier gate and sidebar — ready locally

9 November: hosted Free/Solo/Team Reports now reuse the Improvements-style shared
upgrade callout and Open billing action. Empty Business-only inventories stay hidden;
authorised saved definitions/history remain visible. Self-hosted access and genuine
archive retry errors remain intact. Plan/context changes invalidate stale list data.
Projects now sits immediately after Improvements in the shared sidebar.

The local report lists return contract-valid empty inventories. Browser testing
also found an old non-UUID workspace fixture; all mock records now derive their
workspace identity from the same valid fixture. Real report-client tests cover the
read boundary rather than only testing direct handler output. No production
validation, API authorization or financial logic changed.

The plan dialog now explains returning to Free through Manage subscription,
preserving configuration while normal data limits/retention continue. The billing
guide's outdated original-tier retention promise is corrected against current
retention SQL. Cancellation timing remains provider-confirmed; no new paid pause
mode or Free checkout SKU was introduced.

129 focused tests, 72 site checks, types/lint/format and both builds pass. Sixteen
actual local browser cases cover all tiers, both themes and mobile/desktop, shared
callout styling, sidebar order and the Free explanation; final screenshots were
inspected. No page errors, unexpected HTTP failures, external browser requests or
horizontal overflow occurred. Local 5291/5292 previews are refreshed; the simulator
is on paid Team/monthly with zero extra units. Latest dashboard/site archives and
source receipt: `.tmp/reports-tier-gate/manifest.json`. No real account, database,
provider configuration or hosted runtime changed; no deployment occurred.

# Local billing UX preview — ready

9 November: `make dev-mock` now exposes **Local billing preview** on Billing, with
Free/Solo/Team/Business, monthly/yearly, paid/complimentary and day-1/day-8 trial
fixtures. The normal offer dialog supports all paid transitions, local checkout
confirmation, retained units, scheduled changes and simulated renewal/cancellation
to Free. Exact stale/expired confirmations fail. Complimentary plans have a compact
View plans link; closing the ordinary plan dialog restores keyboard focus through
the shared DialogTrigger. Production billing permissions and provider logic remain
unchanged.

The frontend is currently in isolated mock mode at `http://localhost:5291/billing`,
on paid Team/monthly with zero extra units. Refresh to load it. Apply preview resets
only fixture memory; `make dev-mock-off` restores the real local account/API.
No real database, account, provider credential, subscription, payment or email was
changed. Production output excludes the simulator import, controls and private path.

139 focused checks and a separate 73-test billing UI regression run pass (overlapping
coverage), along with types/lint/format and the candidate build. Twelve final
headless checks exercise actual Vite responses on desktop/mobile, light/dark,
conversion, upgrade, scheduling/cancellation, renewal, Free, complimentary states
and keyboard return. No page errors, unexpected HTTP failures, overflow or external
browser requests occurred; final screenshots were inspected. Latest dashboard
archive/source receipt: `.tmp/billing-preview/manifest.json`. The public-site archive
remains `.tmp/referral-refund-terms/public-site.tar.gz`. Provider-hosted payment,
tax, authentication and portal acceptance remain separate; no deployment occurred.

# Referral customer refund terms — ready locally

9 November: referred Business base subscription payments are excluded from
discretionary/goodwill refunds unless expressly agreed in writing. Mandatory legal
rights and remedies remain unaffected; commissions cannot be deducted from a
legally required customer refund. The dated customer terms and referral guide now
explain this policy. Partner terms/version, financial calculations, holds and
refund reversals are unchanged; no automated rejection or provider action was added.

All 65 site tests, types and static build pass. Generated HTML and local 5292
terms/guide readback pass, including existing referral anchors and the new refund
link. The latest site archive/receipt is under `.tmp/referral-refund-terms/`,
superseding `.tmp/report-card-gap/public-site.tar.gz`. Dashboard artifacts and
hosted runtime are unchanged. This policy does not eliminate chargeback/fraud
exposure; no publication or deployment occurred.

# Report provider credential — configured; activation unchanged

9 November: the owner-approved temporary provider credential is configured in
protected local server settings, the encrypted hosted deployment secret and the
protected live environment file. The local API and worker were reloaded and both
contain the matching key. Report generation/AI remain disabled and the USD 1 per
organisation monthly budget remains unchanged. The web environment has no report
key. Existing quiet-period behaviour is unchanged; no paid provider call was made.

The live API/worker containers and images were preserved and readiness passed.
Their process environment will load the staged key during the separately approved
release; this setup did not deploy code or activate Business/reporting. Source
provider configuration remained unchanged. Metadata-only receipts and protected
pre-change backups are recorded under `.tmp/report-api-key-configuration/` and in
the private cloud operator runbook. Dashboard/site artifacts are unchanged.

# Local tier testing — ready

`make dev-tier` inspects local workspace tiers; add `TIER=free|solo|team|business`
to switch, and `ORG=uuid` when several workspaces exist. Refresh the dashboard
after switching. The command tests base allowances (zero extra capacity), verifies
the checkout-owned local Docker/Postgres socket and refuses linked provider
identities, trials and pending billing. Explicit administrative Free no longer
reverts to the operator's initial Team default. Normal local downgrade/retention
rules and Business report review requirements remain effective.

The owner's local workspace is on Business. A private pre-change backup is under
`.tmp/dev-tier/`; protected row counts and membership checksum match afterwards.
Actual billing and project reads agree on Business, with 30 included units and
zero extra capacity. Sixty distinct tier-tool/auth/billing checks pass, plus real
SQL all-tier/refusal tests in a disposable socket-only Postgres. Root types and
changed-file lint/format pass; the local API was restarted and is ready. No provider
call, new API route, schema change or deployment occurred. Existing final-source
runtime release preparation remains required; dashboard/site artifacts are unchanged.

# Business dashboard follow-up — ready for local owner tests

The workspace switcher is hidden for a single organisation and uses the existing
large sidebar/menu spacing when needed. Reports empty states now use standard
cards/icons and permission-aware actions. Referral HTTP errors retain domain codes,
with separate unavailable and retryable states. Local referral enrolment is enabled
in private ignored configuration, with a stable secret and the correct port 3003;
production defaults/settings remain unchanged.
The remaining localhost URL validation failure is corrected across referral config,
link construction and client responses. The local API was restarted and its actual
partner/earnings/attribution reads now pass; enrolment and local share-link browser
checks pass. The correction has 181 API/domain/client/interface tests and a rebuilt
dashboard. Receipts are under `.tmp/referral-local-url-fix/`.

[The follow-up record](spec/business-ui-followup-20261108.md) retains targeted,
862-test dashboard/configuration and headless desktop/mobile evidence. The latest
dashboard archive is `.tmp/report-agent-workflows/dashboard.tar.gz`. Earlier runtime
snapshots are historical after these UI changes and need a fresh final-source
build before release. No production release or provider billing action occurred.

Referral presentation follow-up: both `/terms/#referrals` and the existing
`#referral-programme` destination scroll to the programme terms. The consent label
uses inline text without a trailing dot, and docs place Referrals under Help beside
Billing. All 62 site checks and nine referral UI tests pass, with types/lint/format,
rebuilt site/dashboard and eleven headless checks covering desktop/mobile anchors,
no-JavaScript navigation, consent-link isolation and keyboard interaction. Local
5291/5292 previews serve the fixes. Evidence and both updated archives are under
`.tmp/referral-presentation-fix/`; no consent or financial write was performed.

Payout consistency follow-up: the shared header now shows Referrals → Payouts with
the standard parent link. Partner balances and shared client/payment history use
the existing Card/Empty icon, title and description pattern. Empty first pages hide
pagination; empty later pages retain Previous. All 36 referral/Reports/project-header
tests, types/lint/format and the candidate build pass. Four headless desktop/mobile,
light/dark scenarios cover operator/partner empties, keyboard parent navigation and
the operator-access boundary. Evidence and the updated dashboard receipt are under
`.tmp/referral-payout-ui-fix/`; public-site artifacts are unchanged.

Reports UI refinement (9 November): Create report uses the Projects-style shared
header action and plus icon, including the standard primary empty-state action.
Create, settings and saved-report pages have parent breadcrumbs. New schedules
detect the browser timezone, while saved/manual values survive edits and toggling.
The shared form pairs inputs at desktop widths and stacks them on tablet/mobile;
privacy/consent span the form. All 41 report/referral/project checks, root types,
changed-file lint/format and the candidate build pass. Eight headless scenarios
cover four widths in light/dark, keyboard navigation, saved timezone preservation
and clipped-control checks. Local Vite serves the final source; evidence and the
updated dashboard archive are under `.tmp/reports-ui-refinement/`. No report,
generation, notification or provider write was submitted during review.

New-report defaults (9 November): the form now preselects automatic Monthly
generation at 09:00 in the device timezone and the current verified account as
email recipient. The control is labelled Generate reports automatically with a
plain-language explanation. Projects, source consent and Save remain explicit;
no default report is provisioned on Business activation. Saved manual/scheduled
reports and empty recipient lists are preserved; API defaults are unchanged.
All 20 report tests, 62 site checks, types/lint/format and both builds pass. Eight
headless desktop/mobile cases cover verified/unverified new accounts and saved
manual/scheduled reports, including opt-out. Local 5291/5292 previews were read
back. The latest dashboard/site archives and receipt are under
`.tmp/report-form-defaults/`; no report, provider or delivery write occurred.

Tier-copy/referral follow-up (9 November): general paid-feature wording no longer
lists only Solo/Team. Current guides include Business where relevant and retain
real tier distinctions. Billing hides customer referral code entry on established
paid/internal plans while preserving Free and active trials. All 152 focused
checks, 62 site checks, types/lint/format, builds and nine headless cases pass.
Local previews were read back; its dashboard/site archives and source
receipt are under `.tmp/tier-copy-referral-visibility/`. No provider or account
mutation occurred; final-source runtime preparation remains required.

Homepage Reports follow-up (9 November): a compact full-width Smart Reports row
now sits below the six investigation cards, with Business availability, the agreed
benefit copy and a link to the guide. It reuses the shared surface card with an
optional responsive row layout. All 62 site checks, types/build and six headless
light/dark mobile/tablet/desktop cases pass, including keyboard navigation. The
5292 preview is refreshed; `.tmp/homepage-smart-reports/manifest.json` records the
latest site artifact. Dashboard artifacts and production remain unchanged.

Report wording and agent setup follow-up (9 November): feature copy now says
email overviews and downloadable PDFs; the dashboard uses Open report in new tab.
The homepage row matches the existing card typography/icon/padding and shares
Set up DebugBundle's button style. Its title-row agent action opens the generic
Smart Reports setup prompt, with all three cadence choices and monthly recommended.
All prompt descriptions use standard 20px line height and bounded scrolling.
One shared prompt card appears in Optional Agent-Assisted Workflows and each of
the five feature guides. Explicit scope/consent, verified recipients, read-first
configuration, digest preservation and retry/delivery boundaries remain intact.

All 65 site checks, 20 report checks, types/lint/format, builds and eight final
headless cases pass, including 42 copy/focus-return workflows and computed-style
comparisons. Final screenshots were inspected. A hidden-label containing-block
fix keeps the mobile pricing page within the viewport while retaining table scroll.
Local previews are refreshed; `.tmp/report-agent-workflows/manifest.json` records
the latest dashboard/site artifacts and supersedes the preceding UI receipts.
No provider/account/report write or production deployment occurred.

Homepage report-card consistency follow-up (9 November): the visible card gap is
16px across mobile/tablet/desktop, title/body spacing matches the neighbouring
cards, and the report surface no longer highlights its border on hover. The title
and Explore action both open the guide; the agent control remains independent.
All 65 site checks, types/build and six light/dark headless cases pass. Final
screenshots were inspected. `.tmp/report-card-consistency/manifest.json` records
the refreshed local preview and latest site archive; dashboard, credentials and
hosted runtime are unchanged.

Smart Reports internal spacing is explicitly 10px per the owner’s final adjustment.
The 16px outer gap and links remain intact. Site checks/types/build and mobile/desktop
computed-style checks pass; the refreshed site receipt is `.tmp/report-card-gap/manifest.json`.

# Rounded pricing — prepared and verified; release pending

8 November 2026. Solo is $5/month or $48/year, Team $19/$192 and Business $59/$588.
Annual cards show exactly $4/$16/$49 per month. Extra units are Solo $1/$10 and
Team/Business $3/$30 (month/year). Source, docs/terms, local previews, twelve live
and test Stripe prices and twelve hosted price-reference secrets agree.
[The pricing qualification](spec/pricing-refresh-20261108.md) records tests,
provider receipts, exact new artifacts and the three old prices retained until
hosted checkout cutover. No deployment, customer billing or activation change.

The subsequent docs/UI refinement centres the pricing introduction, makes Compare
plan details a same-page anchor, and turns `/docs/pricing/` into Plans and capacity
without duplicated prices. Site tests/types/build, documentation contracts, old
anchors and headless desktop/tablet/mobile checks pass. The latest site archive
is `.tmp/report-card-gap/public-site.tar.gz`; no runtime/provider change.
The approved Enterprise section now sits after the tier cards and before the
comparison table. The rebuilt local preview, site tests/types and three-viewport
headless checks pass; its exact artifact receipt is retained alongside the archive.
Same-page CTA links now use native fragment navigation so repeated clicks scroll
again. First/repeated clicks and keyboard activation pass at three viewport sizes
on both `/pricing` and `/pricing/`, including after changing billing interval.

This follow-up supersedes earlier price amounts and runtime/site artifact hashes
below; prior broad Business audit results remain historical evidence.

# Business launch audit — complete locally; owner tests next

8 November 2026. The authorised A–J audit and Business trial / explicitly
consented ChatGPT saved-report follow-ups are complete. Findings, fixes, exact
candidate identities and release boundaries are in
[the launch review](spec/business-launch-review-20261108.md).

- Fixed requested-scope OAuth consent, trial-deadline report history, late-conversion
  coverage and self-hosted organisation/report entitlements without broadening legacy tokens.
- Pricing uses the shared catalogue, simple cards, grouped comparison/extra units,
  collapsible FAQs and annual-by-default monthly equivalents with annual totals.
  Headless desktop/tablet/mobile, light/dark and keyboard checks pass; dashboard
  People, invitations, Reports, Referrals and annual Billing were also inspected.
- All 128 coverage groups / 6,134 checks pass, plus 32 focused UI checks. The
  unchanged coverage gate passes for 423 changed source files. Full lint, final
  root types and focused style/behaviour checks pass; the CLI split preserves all
  25 routing cases and brings changed source/test files below the hard size limit.
- All 85 integration files pass (559 checks, one optional fixture skip); the
  installed Browser SDK lane then passes both cases. Site has 48 passing tests,
  a verified export, and current docs/pricing at http://localhost:5292/docs.
- The local database upgraded from 83 to 86 forward migrations with a backup and
  unchanged protected rows. API is ready. All 66 historical migrations remain
  unchanged. The v2 local runtime image, offline PDF fonts, provider/plugin contract
  tests and 45 private cloud deployment/rollback checks pass.
- Exact local CLI/MCP/OpenClaw/dashboard/site/OpenAI archives and runtime source
  hashes are retained in `.tmp/business-audit/final-artifacts/manifest.json`.

No commit, publish, deployment, production/provider mutation, real notification,
additional paid model evaluation or consumer change occurred. Local account tier
and activation settings are unchanged. Owner tests, provider setup/test journeys,
ChatGPT rescan/reviewer acceptance and authorised deployment/activation remain
open. Initial implementation qualification below is historical and superseded by
this audit where the candidate identity or migration count differs.

# Business tier — implemented and locally qualified

8 November 2026. The owner-approved single phase A–J is complete locally.
The durable contract is [spec/business-tier.md](spec/business-tier.md); exact
candidate identity, acceptance review, receipts and release boundaries are in
[the qualification record](spec/business-tier-qualification-20261108.md).
No paid Solo/Team grandfathering or customer-transition programme was added.

| Slice | Status | Result |
| --- | --- | --- |
| A: contracts/design/fixtures | Complete locally | Fixed scope, prices, roles, Business-only referrals and report privacy/quotas; approved existing UI system. |
| B: analytics/catalogue/allowances | Complete locally | Conservative analytics limits, monthly/yearly catalogue, anchored monthly annual allowances and deterministic health pausing. |
| C: authorisation/scoped tokens | Complete locally | Actual actor and frozen-origin checks, legacy token/SDK isolation, queued authority fences and twelve-surface credential privacy qualification. |
| D: organisation administration | Complete locally | Unique-person admission, invitations, suspension/removal, fixed grants, workspace switching and accepted ownership transfer. |
| E: monthly/yearly billing | Complete locally | Full-offer reservations/quotes, matching capacity, payment-pending entitlements, renewal changes and current-owner billing contact sync. |
| F: Business referrals | Complete locally | First eligible base-invoice discount, collected-cash commission, holds/reversals, protected exports and manual external-reference payout records. |
| G: report facts/history | Complete locally | Bounded consented lifecycle/health/analytics/context, coverage, privacy/retention, paged export and deletion. |
| H: report runs/AI | Complete locally | Fenced fair claims, shared 40-run allowance/budget, one paid attempt, retained archives and visible allowance forecast. |
| I: HTML/PDF/email/UI | Complete locally | Canonical private HTML/PDF/email, bounded PDF child, receipt-backed delivery, whole-scope authority and ordinary API/CLI/MCP/dashboard parity. |
| J: integrated qualification | Complete locally | Regression, coverage, migration, resource, SDK candidate, build, security and documentation checks; exact local artifacts retained. |

All 128 functional/coverage groups pass 6,072 checks. The initial changed-source
gate found fifteen gaps; 93 focused behaviour checks and fourteen fresh database
checks pass, and merged evidence passes the unchanged policy for all 402 changed
source files. Final root types, lint/style and the nine-case organisation/keyboard
recheck pass. All 84 integration files were exercised; the final two failures pass
the nine-case export/installed-runtime recheck. One existing optional installed
Browser-flow fixture remains skipped. Site tests/types/static build/404 pass;
44 private cloud workflow/image/rollback/context tests pass. Core audit has zero
high/critical findings under existing policy. No changed source/test file reaches
the 1,000-line limit.

All 66 historical migrations are unchanged. Seventeen ordered additive migrations
bring the candidate to 83; populated predecessor, checksum, missing-schema readiness
and migration-before-code checks pass. The rebuilt local runtime image and offline
font checks pass. Compiled CLI/MCP/OpenClaw/dashboard and public-site archives,
source hashes and image identity are retained in the qualification record.

Maximum local report proof: ten projects, 140 metrics, 100 sources and three
serial real PDFs; ingestion p95 is 19.07 ms for predecessor source, 12.14 ms current
and 13.33 ms under PDF pressure, below 200 ms. Blocked simulated AI leaves normal
work progressing with a one-connection pool. Node/Browser, staged WordPress,
Swift/SPM/CocoaPods and RN Android/bare/Expo iOS candidate checks pass without
changing consumer products or dependency floors. These are local qualification
claims, not hosted full-capacity or published-package acceptance.

The approved synthetic model evaluation cost USD 0.31524845 across 127 paid
attempts, with zero uncertain holds. Terra passes all nine factual gates and
improves mean quality from 3.225/4 to 3.8/4; forty bounded attempts reserve at most
USD 0.99/month. Temporary Afipal key copies were removed; no Afipal source,
settings, data or deployment changed. Broader infrastructure/full-exhaustion cost
certification remains explicitly owner-deferred.

[Local docs](http://localhost:5292/docs) and
[pricing](http://localhost:5292/pricing/) serve the current export, including new
pricing, reports and referral guides. The `/docs` redirect retains port 5292.

No commit, push, publication, deployment, production/provider mutation or real
notification occurred. Sales, new Smart Report generation and email egress remain
default-off. An authorised release still needs versioned publication where
applicable, provider setup/test journeys, migration-first deployment with a
Business-aware retained rollback, live headroom and owner/provider acceptance.

# Multiline patch release — released and verified

6 November 2026. Core 1.22.1 is live from `8daab4ac`; hosted classifier bytes,
Node 3.2.1, readiness, protected data and retained rollback are verified. App
assets from the same revision serve Browser 3.2.1 with CDN/origin parity. Java
3.1.1 was published after hosted verification; the actual Maven Central JAR passes
the six-occurrence redirected-stderr regression in a clean consumer. All other
independent SDK patches and WordPress.org 2.1.1 pass their published-artifact gates.
React Native 3.1.1 public bare/Expo runtime and registry gates pass. Canonical core
1.22.1/site 1.7.4 releases and both hosted asset deployments pass. All 31 served
resource readbacks match origin; API/worker are healthy with zero restarts and
eight alarms OK. Protected fingerprints and the previous rollback pair remain intact. See the immutable provenance and limitations in
[the release record](spec/multiline-exception-release-20261106.md).

The [twelve-surface audit](spec/multiline-exception-capture.md) and
[pre-release local qualification](spec/multiline-exception-release-audit-20261106.md)
record the diagnosis and regressions. Full core CI passes 5,253 cases and 61
integration tests; Java 217, Node/Browser 611, Python 403, PHP 210, WordPress 93,
Ruby 338, .NET 195, Swift 169 and RN 134 tests pass with the documented runtime,
coverage and installed-artifact gates. Synthetic ingestion retains 114 records
as two groups of three genuine failures with no frame incidents.

Swift 3.1.2 public SPM/Git-pod and RN bare/Expo native runtime consumers pass.
The CocoaPods transition checklist is complete for these exact releases; existing
Trunk compatibility is retained and new Trunk publication was not selected.
Consumer products and existing WordPress installations remain unchanged; no
incident state or notification policy is changed.

# Alert scope release — 5 November checkpoint; marketplace acceptance open

At that checkpoint, core **1.22.0** and site **1.7.3** were live from qualified core `795f3f1e` /
site `00749bc0`. CLI/MCP/OpenClaw/portable skill **1.20.0** and shared-types
**3.2.0** are published. Redaction 2.7.0 and the reviewed developer-package pins
retain their independent versions. See [release evidence](spec/alert-scope-release-20261105.md).

The dashboard shows saved coverage and eligible service choices; confirmed saves
and deletes survive overlapping reads. The approved credential action alignment
is deployed. Live canonical/retained-view reads pass; all five alert rows, nine
credential/scope records, five service identities and 66 migrations retain their
fingerprints. The older CLI still parses unchanged default responses. Both runtime
containers are healthy with zero restarts/OOM; rollback images are retained.
Seven served resources match origin bytes/cache policy. All three saved checks
ran after cutover and pass; all eight alarms are OK, with no new active incident.

Local qualification covers 5,250 cases; public source/main CI passes 5,235 cases
with 15 expected private-site skips, separately covered by local/site checks.
Package, native-client, public OpenClaw installation and artifact parity checks pass.
No SDK, consumer product, alert policy, credential change or synthetic canary.

ClawHub's exact 1.20.0 skill/plugin final reviews are clean and public source bytes
match. Required antivirus results remain absent for both, so strict marketplace
acceptance stays open. Broad discovery and retired Smithery remain separate limits.

Core/site/cloud are on main. Unused branches and the detached Muse worktree were
cleared after preserving commits and 28 local files in `.local-repos/branch-archives/`.
Raw release receipts: `.tmp/alert-scope-release-20261105/`.

# Installation guidance release — published; external acceptance blocked

5 November 2026. CLI/MCP/OpenClaw and the portable skill 1.19.4, Codex 1.5.1,
Claude Code 1.19.4, Gemini 1.4.4 and site 1.7.2 are public. One project per system
is the default across service repositories; existing connections and access/privacy
boundaries stay explicit. Generated skills, install prompts and live guides agree.
The install prompt is 236 words; the shared project/service section is four bullets.

Marketplace reviews exposed cloud-cache and retained-local artifact traversal;
1.19.4 fixes both with validated IDs/paths and guarded filesystem operations.
Exact client source CI passes 5,174 tests. Corrected main passes 5,175 tests
across 111 shards, including 103 Postgres cases; coverage and runtime gates pass. Normal public native Codex/Claude/Gemini/OpenClaw
installs, authentication, evidence, updates and removal pass. PR #12 is merged.

The site is live from core `46337a46` / site `cb8d67d1`. Live verification caught
and corrected the core generator overwriting approved llms.txt. Ten guide pages,
six assets and llms.txt now match CDN/origin bytes; API/App/Site health checks and
all eight alarms pass. No API/worker, SDK, credential or consumer change occurred.
OpenAI 1.0.3 remains a sealed local candidate with separate portal handling.

Both exact ClawHub final reviews are clean, but current responses omit antivirus
results for both distributions. The skill's supported owner rescan succeeded and
wrote back results without antivirus; the plugin's earlier clean 62-engine report
is retained, with unchanged artifact bytes. The repo verifier correctly fails
closed. Known discovery remains 5/7, qualified separately. Corrected-source main
CI and runtime checks pass. The merged release branch is deleted locally/remotely;
both unmerged branches and the detached worktree remain. See
`spec/project-guidance-release-20261105.md` for identities, evidence and the blocker.

# Owner's three-project consolidation — server merge completed

4 November 2026. The owner approved the narrow activation/merge. Cloud `b0daa141`
/ workflow `41909113370` enabled merging through the normal rollout, preserving
MCP and skipping frontend publication. A fresh available DebugBundle snapshot
precedes mutation. API's shared analytics policy matches App/Site; SDK analytics
opt-in remains App/Site only.

Operation `f38fb964-4cce-4eca-9a73-e3528998b253` completed and independently verifies
with no failures. Canonical DebugBundle retains the API ID and imports App/Site.
All five service definitions/instances, 78 incident histories, nine tokens'
immutable credentials/scopes, 66 ledger records and six scope-identity groups are
preserved. Old source IDs retain their original views. Three historical bundle
responses are byte-identical. Analytics reconcile to 110 pageviews/41 sessions
with explicit origin-count semantics.

Active API/worker `6fb7afe9e94d` and stable `4776feced637` pass the six-image gate.
Both containers are healthy with zero restarts/OOMs; there are no expired jobs or
leases. All three checks ran after cutover and pass; all eight alarms are OK.
Thirty-four served resources and four old browser credential/origin pairs pass.
Hosted MCP reads canonical and legacy views correctly.

Server consolidation is complete. Repository adoption and synthetic canaries were
excluded; no application/profile/SDK/token edits or consumer changes occurred.
Runtime reads/configuration/health are verified; no fresh post-merge SDK event was
triggered or observed. The existing CLI GitHub-status limitation remains separate.
See `spec/project-service-live-20261104.md` for exact provenance and limits.

# Project/service release train — shipped and verified

4 November 2026. Core/API/worker/app 1.21.0 and site 1.7.0 are live from core
`3292618b` / site `c9cab5e`, with healthy containers, zero restarts and all eight
production alarms OK. Ordered migrations are at 66; all earlier 64 ledger
records and historical project/service/token IDs remain intact. A verified
compatible 1.21.0 previous stable release is retained; the six-image gate passes.

CLI/MCP/OpenClaw and the portable skill are 1.19.1; shared-types is 3.1.0,
redaction remains byte-identical 2.7.0, and public Codex 1.5.0 / Claude Code
1.19.1 / Gemini 1.4.1 pin MCP 1.19.1. Both exact ClawHub security/antivirus gates
and normal remote installs pass. Public developer install/update/auth/removal,
new/retained clients against production, all maintained SDK public consumers and
the independent unchanged hosted OpenAI connection pass. Broad ClawHub discovery
remains the separately tracked 5/7 result; retired Smithery publishing is excluded.

Release review caught and corrected cross-project/environment local trace
correlation. Mixed old caches now fail closed until an explicit retained-event
rebuild. Exact npm 1.19.1 bytes pass the final isolated merge/restart/evidence
rehearsal. Full exact-source CI passes 5,133 cases across 110 shards; coverage,
static, migration and public contract gates pass. Thirty served app/site resources
match S3 bytes and cache headers. Two handled predecessor-worker errors occurred
once at the first migration boundary, recovered and did not recur; evidence stays.

Production is multi-account/multi-owner. Merge apply remains disabled and no
existing project was merged. The owner's scattered-project exercise, explicitly
authorised repository adoption and deployed-runtime verification remain the next
separate task. No consumer product was changed.
See `spec/project-service-release-20261104.md` for exact identities and receipts.

# Project/service consolidation — implementation audit

Final audit passed (4 November): daily notification scope, current-membership
and concurrent canonical-pause gaps are fixed. Five new database regressions
failed before the fix and now pass. Complete coverage, integration, static,
sealed-image and retained-client qualification pass for the corrected candidate.

4 November 2026. The owner authorised one implementation phase following the
nine ordered slices and recommended, simple defaults. The subsequent production release is authorised; live consolidation of named
projects and consumer adoption remain separately scoped. Slices 0–7 are implemented
and locally qualified. Slice 8 production release qualification is complete; live consolidation and
repository adoption remain separate completion gates.

Source of truth: `spec/project-service-consolidation.md`, FR-PJS-01–04 and
AC-PJS-01–03. The initial worktree was clean; all candidate changes are scoped to
DebugBundle and its own documentation/distributions. At the local audit, all eleven SDK repositories remained clean and no consumer
product or production data/configuration had been changed. The production release
is tracked separately above.

Implemented: first-class logical services and repository/environment context;
retained origin/input/view identities; checked API/client/CLI/ordinary MCP merge
preview/apply/status/verify/resume/cancel; actor-bound idempotency, durable leases,
atomic cutover, bounded writer fences and truthful post-commit verification;
scoped downstream automation/analytics/health/lifecycle handling; complete service
pagination and retained deep-link fetching; one-root local adoption with safe
semantic diffs, preserved credentials/custom data/caches and explicit remaining
gates. No Product/Group layer, Business dependency or migration UI was added.

The two ordered migrations preserve the exact committed predecessor's 64 ledger
checksums. Fresh bootstrap and populated upgrades are separately exercised;
readiness rejects missing migrations/functions/columns or disabled scope guards.
`PROJECT_MERGES_ENABLED` remains false by default in core/self-host/cloud templates.
Ordinary management writes serialize within a bounded fence; direct trigger
fences remain non-blocking. Current membership and multi-user revocation are
verified; the live account's actual users/access still require a fresh inventory.

Executed evidence is tracked in `spec/project-service-qualification.md`:

- The final complete run passes 5,131 tests across 110 shards, including all 103
  real Postgres cases. The unchanged coverage gate passes for all 215 changed
  source files (87.79% lines, 90.15% functions, 78.61% branches, 86.83% statements).
  Repository-wide lint, typecheck and formatting pass. The old sequential GitHub
  miss-path fixture now models the bounded transaction; expectations are intact.
- The full existing integration lane passes 180 cases with one existing optional
  skip. The consolidation Postgres lane passes 103 cases across thirteen files,
  including a 1,000-service cutover, exact NULL-scope predecessor GitHub rule,
  first health-check registration, concurrency, nested origins and retry/crash.
- Installed retained CLI 1.18.2/MCP 1.18.3/Node SDK 3.2.0 and packed candidate
  clients pass against real disposable API/worker/DB/Redis/S3. Original tokens,
  intentional new scope, worker restart, compatible API restart, six immutable
  S3 objects and complete canonical-origin cleanup pass.
- The sealed predecessor/candidate image rehearsal passes exact migration/startup
  refusal, row/column/checksum preservation, idempotence, legacy writes and
  pre-merge API/worker rollback. Post-merge rollback requires the new contract.
- Source equivalents pass across all twelve SDK capture surfaces, including both
  React Native native bridge harnesses. This is not new production-device or
  per-language installed-artifact proof; no SDK release or consumer upgrade is
  required by the unchanged wire protocol.
- Core candidate builds, OpenClaw validation and clean pinned-host installation
  pass; all 149 tools load with native scoped requests. Public documentation
  tests/typecheck/static build pass. Hosted workflow/image gate tests pass.

Local pre-ship review and source/spec/contract/glossary reconciliation pass. The
frozen old MCP contract and exact predecessor checksums remain protected. All
application/runtime files match the refreshed sealed final-audit image context;
later changes are documentation only. Exact source/image/archive identities and
logs are recorded in the qualification report. No known local check remains open.

Release is now authorised and tracked above; activation and live adoption retain
their documented gates.
Before enabling apply: qualify every actual API/worker, a verified compatible
stable rollback and served credential/origin/cache behaviour. Obtain named
project approval and refresh ownership/access/settings/mappings before live apply.
Each consumer repository edit/deployment/canary requires explicit product/action
consent. Server, repository and deployed-runtime completion are independent.

# Corrective releases and site verified — 3 November 2026

CLI 1.18.2, MCP/OpenClaw/ClawHub skill 1.18.3, Codex 1.4.3, Claude Code 1.18.2
and Gemini CLI 1.3.3 are public and verified. Runtime source 751474ec passes
full CI 41641533811 (103 coverage shards/build); developer source e4b9b47e
passes CI 41647357939. Exact npm source/provenance/integrity and actual scoped
production list/doctor reads pass. Both exact ClawHub final security/antivirus
gates and anonymous source parity pass. A normal public current-host OpenClaw
installation loads all 139 tools and performs scoped native/doctor requests
without a force flag. Minimum-host and Node 22/24/26 runtime proof also pass.

Site 1.6.13 is live from 30b0f62a through site-only run 41648981900, using
qualified product 751474ec and cloud 77978185. Independent S3/CDN verification
passes nine pages, 26 JS/CSS assets, the current doctor schema, article/index/
sitemap/canonical/redirect and cache policy. Rollback site f44843f7 is verified
and retains the article. API/app build 88a9a42c is unchanged; API/MCP readiness
and API/App/Site health checks pass. Active baselines remain 1/0/8, with no new
active IDs observed after deployment. No consumer product or existing WordPress
site is changed, and no API/worker or language SDK release is needed here.

Article: https://debugbundle.com/blog/ai-fix-passes-locally-production-still-fails/

The original evidence plan's release/handoff row is complete. Broad ClawHub
search remains 5/7 and the strict aggregate verifier remains partial for those
external relevance results; mandatory security/runtime checks pass. No support
comment or issue closure is sent. See the final acceptance and exact receipts in
`spec/openclaw-runtime-scope-remediation-20261103.md`.

# Historical local correction checkpoint — 3 November 2026

ClawHub maintainer Patrick-Erichsen confirmed unchanged plugin 1.18.0 and 1.18.1
published with matching anonymous downloads and successful installations in
[issue #4214](https://github.com/openclaw/clawhub/issues/4214#issuecomment-6588056002).
Publication is recovered; the same comment reports missing connected-project
incident filters and native ESM `node:assert` load failures. Keep the issue open.

Both defects were reproduced locally before fixes. The candidate shares explicit
or connected project scope across cloud CLI/MCP/OpenClaw list requests and all
pages, fails closed on unusable connected scope, and retains local/global
unconnected behaviour. A Node `createRequire` build banner fixes bundled CommonJS
HTTP imports; native emitted-artifact checks are now mandatory before release.

Current proof: 879 CLI/MCP/OpenClaw regressions across 124 files, 35 final edge
checks (overlapping), full typecheck, full/changed-file lint and formatting pass.
Native Node 22/24/26 pass loading, all 139 tool registrations, compressed scoped
pagination, approval metadata and fail-closed missing project checks. Mandatory
OpenClaw release preflight passes its 32 tests plus native artifact/manifest and
runtime gates. Pre-ship review finds no additional implementation gaps. No versions bumped, commits, pushes, publications, issue replies,
hosted deployments or consumer changes in this follow-up. Next: owner review and fresh release approval before
choosing/releasing new immutable patch versions. ClawHub security re-review and
exact published installation/runtime acceptance remain release gates. Detailed evidence:
`spec/openclaw-runtime-scope-remediation-20261103.md`.

# Historical mobile handoff — 2 November 2026

Superseded by the authorised 6 November implementation and release record above.

The owner requested a durable handoff for the next release. The
[transition checklist](spec/cocoapods-trunk-transition.md) records the announced
1–7 November read-only test and 2 December 2026 permanent freeze, current
Swift 3.1.1 / React Native 3.1.0 release evidence, affected workflows and exact
next-release checks. Mandatory agent instructions and release governance link it.

Open: qualify a native pod installation path independent of new Trunk writes for
RN/brownfield iOS, adapt Swift release automation while retaining its checks, and
update matching SDK/site migration guidance with clean-consumer runtime proof.
Native SPM already exists; RN's SPM manifest is only a test harness. This is a
documentation handoff, not an implemented or qualified migration. No SDK/site
files, dependencies, workflows, published versions or consumer products changed;
the owner subsequently authorised committing and pushing this documentation only.
SDK publication, deployment and consumer changes remain outside this follow-up.
Independent releases remain separately scoped.

Handoff verification: all transition references and local checklist links resolve;
Docker Prettier leaves the checklist unchanged, and the existing release-governance
suite passes all five tests. Pre-ship review finds documentation-only changes with
no runtime, trust-boundary or schema change. The six migration gates remain open.

# Historical ClawHub checkpoint — owner authorised 1.18.1 attempt

MCP 1.18.1 is published to npm and the official Registry from immutable fbfdd394.
Full source CI, release CI and installed public checks on Node 22/24/26 pass.
ClawHub skill 1.18.1 is public with exact source bytes, clean final review and
moderation; VirusTotal is missing and bounded discovery passes 5/7 queries.
Plugin 1.18.1 is accepted pending checks. The portable skill's corrected MCP
1.18.1 / CLI 1.18.0 pins were accepted after a delayed multipart response, despite
the client timing out. Plugin
inspection/publication retains 0.25.0; the skill's supported multipart publisher
is pinned to 0.22.0 after upload-ticket HTTP 500s.
Both exact ClawHub security/discovery gates remain open. No support issue is
submitted; core, language SDKs, WordPress and hosted runtime retain their verified
releases. No further uploads or version bumps are planned while these external
outcomes remain unresolved. See [patch evidence](spec/clawhub-publication-retry-20261101.md).

# Release checkpoint — 1 November 2026

All maintained SDKs and developer packages are published with passing native and
registry consumer gates. Core 1.20.0 is live from 88a9a42c with healthy API/worker,
active processing, verified migrations/rollback and passing owned live canaries.
Full current core/site/Swift CI passes. See the [current release evidence](spec/bundle-evidence-quality-release-20261101.md)
for exact versions, hashes and the qualified live retention count difference.

The owner explicitly authorised finishing independent publications while leaving
ClawHub/OpenClaw for later consideration. React Native main is promoted to
44ce6a67 with its documentation correction; the published 3.1.0 tag is unchanged.
Site 1.6.11 is deployed from b9196030: six served routes and 23 JavaScript assets
match S3 byte-for-byte, cache rules pass, and Browser 3.2.0 evidence code is served.
API/MCP readiness remains 200 and the app build remains 88a9a42c. Canonical core
release workflow 41354190812 passes; public v1.20.0 and its immutable tag resolve
to qualified ee225461. All independent publication steps are complete.

The original skill 1.18.0 antivirus result has since cleared. Its failed plugin
remains retained; the owner-authorised 1.18.1 attempt above is now active. Final
ClawHub ecosystem completion remains unclaimed, with no support issue submitted.

# Evidence quality and SDK parity: authorised release in progress — 1 November 2026

The single-phase implementation is merged to core `main` at `88a9a42c1762bab1f5bb7e73f908d67eeb67b99a`
across DebugBundle core, all maintained SDK repositories and the documentation site.
The [merged core PR](https://github.com/debugbundle/debugbundle/pull/10) and the
[local release handoff](spec/local/proposals/bundle-evidence-quality-sdk-parity-release-handoff-2026-10-29.md)
identify review sources, qualification receipts, dependency order and rollback.
The [execution ledger](spec/local/proposals/bundle-evidence-quality-sdk-parity-execution-2026-10-25.md)
retains red/green history. Current publication and independent production receipts are recorded in the [tracked release evidence](spec/bundle-evidence-quality-release-20261101.md).

The owner's final audit adds durable payload identity to local CLI diagnostic
receipts. A reproduced replay regression showed that editing a rejected future
event could make it appear recovered after processing-state loss. The fix retains
the original receipt and protected payload hash, preserves legacy timestamp-only
ledgers and rejects corrupt receipts. Targeted CLI regression, type and lint checks
pass; the handoff records the final refreshed distribution/CI/runtime identities.
SDK source and packaged artifact identities were rechecked against all thirteen
inventories, with live readback of the ten successful qualification workflows.

**Release authorised on 1 November:** the owner approved the reviewed DebugBundle
release train, including own dogfooding and WordPress distribution. Accepting core
1.20.0 and migration 64 are independently verified in production; shared packages,
JS SDK, CLI and MCP publication gates pass. Remaining SDK/plugin, own-consumer and
final hosted/site gates are tracked in the local handoff. Other products and existing
WordPress-site installations require separate consent. Existing-component design is approved.

## Release checkpoint - 9 November 2026

- All affected SDK/shared/CLI/MCP packages and standalone Gemini are published and qualified.
- Business-aware core 1.23.0 bridge is live with activation switches off; additive migrations and protected-data hashes verified.
- Final full tests pass; three UI coverage paths require focused additions and a complete CI rerun before public core/assets/activation.
- ClawHub strict acceptance remains partial: final antivirus results unavailable, skill discovery 5/7. Do not mark the ecosystem release complete.
- See [release record](spec/business-release-20261109.md) for exact stage boundaries.

## Release versions

| Distribution | Version and reason |
| --- | --- |
| Core | 1.20.0: additive bounded evidence, typed context and provenance. |
| Shared-types / redaction | 3.0.0 / 2.7.0: exported Zod schema API major; additive privacy helpers. |
| Node / Browser | 3.2.0: compatible capture APIs and negotiated optional evidence. |
| CLI / MCP / OpenClaw | 1.18.0: compatible readers and automation. |
| Python / PHP / Ruby / .NET / WordPress | 2.1.0: compatible evidence/recovery additions; WordPress.org public ZIP and installed-runtime smoke pass. |
| Java / Go / Android / React Native | 3.1.0: compatible native/framework/bridge additions. |
| Swift | 3.1.1: evidence additions plus corrected native deadline cancellation; tagged 3.1.0 attempt retained. |
| Site | 1.6.11: documentation update. |
| Portable OpenAI plugin | 1.0.2 unchanged package bytes; candidate source provenance is local, with deployed runtime identity left unclaimed. |

Maintained JavaScript schema code uses upstream Zod 4.6.7. Legacy identifier shape,
partial maps, nullable response metadata, CLI profile errors and public tool metadata
retain their contracts. Shared-package publication validates independent versions.
The authorised core/site registry adoption removes their active transitive Zod 3
instances; unused patch registrations are retired and installed-graph tests require
that legacy instances remain absent. The independently published JS SDK
has a zero-vulnerability audit, with no SDK-specific audit exception. See
`spec/zod-v4-migration.md` for migration and dependency boundaries.

## Qualification boundaries

- Core accepting contracts, deterministic bundles/readers, migration-before-startup
  and predecessor rollback have local proof. The final pre-release audit covers 4,862 core cases across 594 files (4,847 in
  public CI plus 15 private-site cases locally), 180 real-storage integration
  cases with no skips, changed-source coverage and all thirteen committed-source
  provenance checks. Registry adoption adds passing consumer, type/build and
  native developer-client checks; final source CI and rollout are recorded in
  the handoff.
- Node/Browser pass 603 tests, per-file coverage and installed privacy/delivery on
  supporting hosts; Node 22 native/fallback and installed consumers are separately
  verified. Actual Chromium exercises causes, resources, CSP, recovery and teardown.
- Python 398, PHP 208, Ruby 327 and .NET 191 tests retain coverage/privacy/safety gates;
  native installed matrices and exact artifacts are inventoried. Windows/Linux
  .NET 8/10 CI passes for the reviewed source.
- Java's maintained compiler/framework/agent lanes and Go's floor/current installed
  module, race and lint gates are separately retained. Ruby frame protection reuses
  text only inside one bounded projection, with independent returned values.
- Android API 23/36/37 native HTTP/ART and actual RN/Hermes delivery/cost rows identify
  exact Maven/APK/tarball inputs. Connected CI and simulator measurements remain
  distinct from physical-device performance claims.
- Swift's host/iOS coverage, actual Swift 5.10 compiler/installed consumer,
  SPM/CocoaPods and iOS 15 artifact checks are separate. Full Swift 5.10 XCTest needs
  a matching older Xcode framework; this is a documented runtime tooling limitation.
- The staged WordPress ZIP passes its native/browser/relay/spool/revocation runtime
  matrix. Final registry locks/ZIP and post-publication MCP ecosystem checks belong
  to the dependency-ordered authorised release, after owner review.
- Site tests/typecheck and the bounded default-compiler static export pass. No
  browser inspection or screenshots are required or claimed.

The local handoff records exact current gate closure and CI identities. Do not mark
whole-phase acceptance or infer a shipped release while an applicable gate is open.
Consumer adoption requires separate product-specific consent. Historical checkpoints
below describe earlier releases and do not authorise this candidate's release.

# Production follow-up complete — 24 October 2026

Core **1.19.3** and site **1.6.10** are published and deployed from exact reviewed commits `c991294ccad14ee5eb257daac38fc58a0cdc1451` and `f7299dae6a42c0840821c685046b1d3aa0a8b015`, through trusted cloud `40606e14e156a0d27a6ca2b4ba2531d2aee1e677`. All exact-source CI/canonical-release/hosted gates pass. Independent runtime inspection verifies healthy API/worker, zero restarts, active processing, installed security patches and immutable image digest; migrations report zero new and 63 already applied. Verified 1.19.1 rollback and both images remain retained. Live SPA retry states, all 28 CTAs and safe malformed-path redirects pass independent readback. See [release evidence](spec/incident-followup-release-20261024.md).

Independent active and all-status paginated reads at 07:50 UTC show **zero active incidents in all four DebugBundle projects**: API 44 resolved, App 19 resolved, Site seven resolved, WordPress SDK development empty. The OAuth connection now passes a fresh token exchange and authenticated MCP read; its earlier failure cause is unconfirmed. Thirteen App/Site noise/recovered records and eleven deployed application/path records are closed under the reviewed evidence; ordinary application errors remain captured. This is a current checkpoint, not a guarantee against future regressions.

The owner reviewed the UI recovery changes and reauthorised production. The unchanged 1.19.2 tag was blocked by a newly updated dependency audit before publication/deployment; replacement 1.19.3 clears the added request-library findings while preserving the exact verified Zod exception and other severity gates. No consumer product, production payment/email or OAuth policy change was introduced. Exact owner-browser reproduction remains unverified. OpenAI portal reviewer/video/submission/publication gates remain separate. The existing reviewer login/23 November expiry is preserved. Later documentation/provenance commits do not change the deployed sources above.

Earlier entries below are historical checkpoints.

# Fresh production release qualification — 24 October 2026

The owner reviewed the session/billing UI state changes and explicitly reauthorised production deployment. The complete previous candidate passes 4,668 tests / 566 files / 100 coverage shards, all six changed runtime coverage checks, full lint/typecheck/build and exact core/site/CLI CI. A fresh canonical-release audit then failed on two additional high findings in body-parser and Undici before publication or deployment; the 1.19.2 tag remains untouched. Compatible patched versions 2.4.0 and 8.12.2 are being qualified in replacement core 1.19.3, with site 1.6.10 references. No new UI or OAuth policy change is added.

The fresh inventory has API 1, App 11 and Site 1 active incidents; the new App occurrence contains only extension frames and is eligible for a separate exact scoped context rule. The eleven previously identified App/Site application failures await deployment proof. The OAuth connection still failed after owner reconnection; provider metadata and JWKS returned 404 even with provider headers. It remains open. Production remains core 1.19.1/site 1.6.8 until all replacement gates pass.

# App and Site incident follow-up — 2026-10-23

The owner approved the recommended compatible Zod backport and its exact core/site audit exception on 24 October after automatic review requested explicit approval. Both proposed gates pass with verified installed hashes and semantic checks; all eight fail-closed auditor tests pass in each checkout. Core retains six low and 31 moderate findings; site has no unaccounted findings at its stricter local low threshold. Official standalone Zod 4 paths use 4.6.6. Full regression and exact-source CI remain required before publication. Eleven App/Site incidents await deployment; a fresh API OAuth token failure regressed at 22:00 UTC and is under separate investigation. No follow-up release has deployed yet.

The owner's dashboard discrepancy exposed a scope gap: earlier zero-active checks covered the connected **DebugBundle API** project only. They did not include **DebugBundle App** (17 open) or **DebugBundle Site** (six open). The owner explicitly confirmed both projects belong in this task. Their 23 bundles, explanations and available reproductions are retrieved. Ten extension-only stack incidents now have verified project/service/production/exact-fingerprint demotion rules and are resolved; a separately recovered favicon incident is resolved after HTTP/SVG readback. Twelve remain under investigation: seven DOM ownership failures, three fetch failures, one unattributed inline exception and one repeated-slash site routing failure. CLI 1.17.0 is still registry latest; `validate --fix` is healthy. No consumer product is included.

The final preceding release-evidence CI and CLI compatibility checks pass. The owner approved the existing-component read-error/retry design. Core 1.19.2/site 1.6.9 now contain handled session/billing loading failures, preserved Checkout context and stable translated loading labels; the initial 77 focused checks and typecheck pass, with further polling-preservation checks and the complete suite in progress. The unattributed evaluated-script signature is absent from all 40 first-party static JS files; it is resolved under a separate exact-fingerprint/message/hidden-window context rule, with attribution still qualified. Eleven genuine application/path incidents remain open pending deployment verification. Site edge regression tests pass for repeated slashes; raw backslash safety is also covered before release. Do not report all DebugBundle projects clear until independent active queries cover API, App and Site. The earlier release receipt remains valid for its explicitly connected API scope.

# Production release complete — 2026-10-23 (API-scope checkpoint)

Core **1.19.1** and site **1.6.8** are published and deployed from `86c134f1885e8baade8b9ac5c0f1479f13f1304a` and `2cc93191da67c0f52f0d28e7972b6ab2a4e896ee`. Exact-source core, CLI compatibility, site, canonical-release and hosted-rollout workflows pass. Independent runtime readback confirms both containers match the source/version and immutable image digest, are healthy with zero restarts, and have active worker processing. The migration gate reports zero new migrations and 63 already applied. The previous stable runtime and both images are retained and validated. See `spec/maintenance-release-20261023.md` for source identities, checks and limits.

All 28 live blog posts have the one shared centred CTA, docs before the primary homepage action, the important themed foreground and no eyebrow. Live SPA bytes identify the approved core source; billing notice visibility has regression coverage. The site release also pins Next.js 16.4.1 after its independent CI audit found security advisories; the patched site audit, 41 tests, build and typecheck pass. Core's existing six low and 31 moderate audit findings remain below the high-severity release gate.

The owner chose to preserve the current reviewer login and extend its expiry to **2026-11-23T07:53:34.795Z**. Only the expiry changed; persisted configuration and an outside-network POST-body login/synthetic-boundary smoke pass. The callback was not followed and no fresh token exchange or full reviewer-case execution is claimed. Both remaining incidents were resolved at **20:42:30 UTC** after deployment/renewal proof; independent project-wide active readback is empty. The saved readiness monitor passes HTTP 200 with zero failures. Existing three narrow noise rules remain; broad suppression was declined because it would hide future genuine failures.

OpenAI 1.0.2 candidate source and deterministic packaging are included; the frozen 23-tool contract is unchanged. Portal submission/publication remain pending the accessible video, full reviewer-case evidence, imported annotation review, override-disabled reload and owner approval. No consumer product was changed. Documentation/provenance follow-up commits do not change the deployed source identities above. Earlier local/in-progress entries below are historical checkpoints.

# Approved release in progress — 2026-10-23 (historical checkpoint)

The owner explicitly authorised committing and pushing the complete reviewed DebugBundle batch and deploying production. Core 1.19.1 and site 1.6.8 include the final CTA contrast, alignment, action-order and eyebrow refinements, plus the OpenAI 1.0.2 candidate source and packaging. The reviewed file hashes match, all three repositories are current on `main`, and preflight production API/worker are healthy with zero restarts on the verified 1.19.0 source. Release commits, exact-commit CI, hosted rollout and independent production readback are in progress. OpenAI portal submission/publication and the pending reviewer credential-renewal choice retain their separate gates.

# Commit and release readiness reviewed — 2026-10-23

Owner-requested public-site preview is running as healthy `debugbundle-public` / service `public` in the existing `debugbundle` Compose group, bound to `127.0.0.1:5292`. It serves the reviewed static export; the Codex blog CTA, homepage and docs all return HTTP 200. Open `http://localhost:5292/blog/debug-production-errors-with-codex/#blog-product-cta-title` for review. Local lifecycle commands are `make -f .local-notes/public-site-preview.mk public-preview` and `public-preview-stop`; rebuild the site export and rerun `public-preview` after future source edits so its bind mount follows the replaced output directory. Preview configuration stays in ignored local notes.

The owner's light/dark screenshots exposed a CTA contrast issue missed by the earlier markup checks: the unlayered global anchor reset overrode the normal foreground utility. The shared CTA now uses the same important themed foreground as existing site buttons, centres its content/actions, omits the redundant DebugBundle eyebrow at the owner's request, and renders docs before the primary homepage action so the primary is on the right at desktop widths. All 41 site tests, static build and typecheck pass again; all 28 exports and the refreshed served preview verify the new order/alignment, with the compiled important colour rule winning over the global reset. Browser visual acceptance remains the owner's preview step.

The complete current core/site batch is reviewed on `main`, including the proxy-address crash fix, billing-notice visibility, reusable blog CTA, refreshed CLI scaffold and earlier OpenAI candidate/submission work. Core **1.19.1** and site **1.6.8** patch versions and dated changelogs are prepared locally. Generated site OpenAPI/reference artifacts match current core source; independently published CLI/MCP/SDK versions remain separate. No commit, push, publication or deployment occurred during this review.

All **100 coverage shards / 564 files / 4,650 tests** pass, with the unchanged changed-source coverage gate passing both runtime files. Proxy-address coverage is 100% across all metrics; billing satisfies the existing changed-line coverage rule. Repository-wide lint, final typecheck, changed-source formatting, dashboard production build, nine focused release-governance/site-ownership checks, all **41 site tests**, static site build and site typecheck pass. The final export again verifies one correctly linked CTA on each of 28 posts and none on 112 other HTML pages. The high-severity audit gate passes with 6 low and 31 moderate findings; the existing large-bundle and React test warnings remain. Database/provider/browser integration was not rerun because this batch adds no schema, payment-service or browser-instrumentation change.

OpenAI source validation and refreshed candidate prepare/verify pass. The plugin ZIP remains byte-identical to the reviewed 1.0.2 candidate; submission/provenance evidence is current for the uncommitted tree. The future runtime digest is explicitly unset. After implementation commits, regenerate evidence against the exact committed source and make the manifest-only evidence commit; verify exact-commit CI and deployed digests during the authorised rollout. Portal reviewer-case execution, video, submission and publication remain separate gates.

The final read at approximately 17:46 UTC shows the existing readiness monitor passing HTTP 200 with zero failures and exactly the same two active incidents: the one-occurrence socket-address crash awaits deployment; the reviewer-expiry warning awaits the owner's renewal choice for the credential already saved in the draft. Existing narrow noise rules are preserved and CLI validation remains healthy. No regression blocker was found locally, but the remaining incidents must stay active until their production conditions are verified. The private review and receipts are `.local-notes/release-readiness-20261023.md` and `.local-notes/release-review-test-summary-20261023.txt`.

# Billing notice visibility corrected; blog CTA prepared — 2026-10-23

The billing paid-unlock notice now appears only when a valid trial start produces a future first-purchase unlock time. It is absent before trial start, appears after successful trial creation, and disappears once payment unlocks, including automatic and focus refresh. The server-side purchase policy and existing notice design are unchanged. Three regression cases reproduced the prior pre-trial notice; full typecheck, changed-source lint/format and all 21 focused trial, purchase-gate, refresh and shared eligibility tests pass in Docker. Requirements, acceptance, billing documentation and changelog are aligned. No browser or production verification is claimed.

The owner approved the reusable product introduction at the end of every blog article, with “Explore DebugBundle” linking to the homepage and “Read the docs” as the secondary action. The site repository remains on `main`; `ProductCta` provides shared copy/action props, a supporting-content slot, existing theme tokens and responsive native links. All 41 site tests, production static build and TypeScript checks pass. Independent emitted-HTML inspection verifies exactly one CTA after the article body on all 28 posts, correct copy/destinations and accessible heading/link structure, and no CTA on the other 112 exported pages. Authored MDX, metadata and analytics are unchanged. No browser, conversion uplift or production verification is claimed. The approved design and checks are recorded in `.local-notes/blog-cta-proposal-20261023.md` and `.local-notes/blog-cta-export-verification-20261023.json`. No commit, push or deployment occurred. Incident release and reviewer-renewal decisions below remain pending while the requested updates are prepared.

# Cloud incident remediation prepared — 2026-10-23

The connected DebugBundle API cloud project had six active incidents. Four historical OpenAI failures are resolved after current authenticated reads and exact-window OAuth recovery evidence, with independent status readback. The API socket-address crash and reviewer credential expiry warning remain active. Closure of the historical records establishes observed recovery, not the cause of the original privacy-limited tool failures.

The local proxy-trust fix rejects unavailable/non-string peer addresses without throwing or trusting forwarding headers. Six regressions failed before the fix; all 13 proxy cases now pass. Docker verification passes full typecheck, changed-source lint/format, 56 focused tests and the full unit suite: **4,649 passed, 200 skipped**. No schema or public-interface change is required. CLI 1.17.0 is verified latest, and the updated project scaffold passes `validate --fix` without warnings. Existing narrow noise rules are retained; broader suggestions would hide genuine future failures and were not applied.

Work remains on `main` with the earlier OpenAI submission edits preserved. Commit/push/deployment require the owner's explicit approval under AGENTS.md section 9. Reviewer renewal also awaits the owner's choice: preserve the already-saved draft credential and extend expiry to 23 November, or rotate it and coordinate draft replacement. Neither production configuration nor deployment changed. Verify the hosted fix and reviewer renewal before resolving the last two incidents. The private operational handoff is `.local-notes/incident-remediation-20261023.md`.

# OpenAI portal connection and current scan pass — 2026-10-23

The owner loaded the one-function local override, reached **Authorization required**, completed sign-in/consent and supplied **Authorized** evidence. The next portal screenshots show **MCP configuration: Configured**, **Authentication: Authorized**, **Domain verified** and **No findings in the latest MCP scan**. All twenty-three displayed tool names match the frozen release catalog in order, checked within the preceding minute. This succeeds on the existing canonical parent/draft without a new identity or production OAuth change. It establishes owner-observed authorization and metadata scanning; it does not establish every reviewer case or imported annotation. Explicit confirmation of an override-disabled reload is still separate.

The owner completed the review-credentials step; all five positive and three negative case entries show complete. Supporting content still requires the video walkthrough URL, while the release notes are imported. This is saved-form evidence rather than reviewer-case execution. Read-only runtime inspection confirms reviewer access enabled until `2026-11-07T07:53:34.795Z`, and the expected Keychain metadata entry exists; no credential or hash was printed. The complete recording script is now in `apps/mcp/openai/submission/demo-recording-plan.md`, with exact prompts, suggested narration, visible evidence and safe link delivery. All eight prompts match the imported cases byte for byte and in order. The recording, fresh reviewer-login/case run, remaining acceptance gates and owner submission approval are still open. The portal remains **Not submitted** and **Not published**. No commit, push, review submission, publication, deployment or consumer-product change occurred. See `apps/mcp/openai/submission/review-checklist.md` and `registration-diagnostics.md`. Earlier diagnostic checkpoints below predate this successful result.

# OpenAI portal CIMD incompatibility isolated — 2026-10-23 (historical checkpoint)

The owner supplied plugin/app responses and both loaded frontend modules. Draft recreation retained the 5 October parent. The portal's `ep` CIMD predicate requires `none` for a non-empty authentication-method list; its shared filter discards `private_key_jwt`. With DebugBundle's advertised CIMD/private_key_jwt metadata and no DCR, this rejects CIMD and falls back to PREDEFINED, triggering the observed client-ID validation before a save request. The displayed package JSON and save form state are separate. Current OpenAI documentation supports CIMD signed assertions, so a narrow browser-local predicate correction is documented without changing the approved hosted OAuth policy. Twelve offline cases reproduce the defect and verify the proposed correction; the exact discovered form response, corrected browser run, backend acceptance, token exchange and current tool scan remain unverified.

`make openai-plugin-diagnostics` retains a separate identity-only connection-test ZIP, but that upload is deferred because a new parent encounters the same predicate. Tests compare every other manifest field and file byte, require deterministic output and unchanged canonical evidence, and reject unsupported formats/options. The portable experiment was excluded because the published Agent Plugins MCP schema forbids the per-server OAuth extension shown by OpenAI's docs. All 34 focused Docker-backed tests, full typecheck, changed-source lint and formatting pass. The owner then supplied the local override file after DevTools could not save its buffer. The agent backed it up and saved the one-function correction, with full-module syntax, exact byte comparison, twelve predicate cases and independent disk readback passing. No production, parent-plugin or hosted OAuth change occurred. Browser execution is unverified; the next external test is one owner-operated connection attempt after loading the saved override, followed by disabling it. See `apps/mcp/openai/submission/registration-diagnostics.md`; review/publication remain separate manual gates.

# OpenAI CIMD retry package prepared locally — 2026-10-23

Independent plugin candidate 1.0.2 explicitly selects OAuth/CIMD in the portal ZIP's remote `.mcp.json`, addressing the missing registration setting in 1.0.1. The hosted provider, `private_key_jwt` policy, eight scopes, frozen 23-tool wire contract and skill bytes are unchanged. Versioned listing/review metadata and requirements/contracts are reconciled. The new exact-configuration regression failed against the URL-only generator before the fix; the Docker-backed focused suite now passes all 30 tests, full typecheck and changed-source ESLint pass, and changed code/JSON is formatted.

Pre-ship review found no new runtime trust boundary, database/deploy dependency, resource lifecycle or customer-state mutation. The deterministic ZIP is a local uncommitted candidate; its source record must be refreshed after the authorised source/evidence commits before final release promotion. The committed-checkout provenance test still verifies committed bytes independently of working-tree changes. Chrome Computer Use access was not approved, so the agent made no portal changes. The owner's subsequent screenshots confirm the imported CIMD declaration and verified domain, but lower **Connect** still returns the pre-defined OAuth client ID error. No successful OAuth connection, current tool scan, review or publication is evidenced. The owner then deleted the draft and recreated 1.0.2 from ZIP under the same parent plugin: skill checks pass, but Connect reproduces the exact error and the tool scan remains incomplete. This did not prove a reset of the underlying plugin/MCP registration. An unsent support follow-up now requests inspection/reset of the effective registration and confirmation of CIMD/private_key_jwt support for public submission. See `apps/mcp/openai/submission/review-checklist.md` for the remaining reviewer, recording and publication gates.

# Hosted billing safety deployed — 2026-10-22

Core 1.19.0 is deployed from `6cbbc2e2`, following the verified 1.18.1 compatibility-worker bridge. It provides same-subscription Solo-to-Team upgrades with confirmed proration, retained capacity and payment recovery, plus Team-to-Solo scheduling at renewal. Durable Checkout/subscription reservations and webhook transactions preserve uncertain operations and queue billing notifications atomically. First paid purchase requires seven elapsed trial days; the existing billing page shows the unlock time and contact link. Existing paid management remains available. The frozen read-only OpenAI catalog is unchanged; source CLI/MCP additions require separately published packages.

The full 100-shard unit run passes **4,636 tests**, including the additional operation-store and plan-change composition cases. The unchanged coverage gate passes all **71 changed source files** over the complete billing range. **25 disposable PostgreSQL cases**, full typecheck, lint/format, dashboard build and **41 site tests** pass. Exact deployed-source CI and installed CLI compatibility pass; committed provenance/governance passes 18 tests. Approved security updates move transitive MCP SDK dependencies to 1.32.1 and Vite to 8.1.6. The high-severity audit gate passes; 37 low/moderate findings and the existing large-bundle warning remain.

Earlier authorised test-mode provider/browser checks cover paid/declined/authentication recovery, proration/tax/discounts, retained capacity, scheduled downgrade renewal/re-upgrade, direct Checkout return, hosted 3DS retry on the same invoice, same-subscription upgrade and real signed test webhook delivery. The later seven-day policy has unit/UI/PostgreSQL coverage; the revised hosted-browser harness has not been rerun. No production payment or customer email was triggered for release verification. These proof layers do not establish customer legitimacy or complete containment.

Independent production readback verifies the exact source labels and critical file hashes, version 1.19.0, healthy API/worker with zero restarts, enabled worker processing, all **63 migration checksums**, both new billing tables and the expanded notification constraint. All four additive billing migrations preceded dependent activation. Proxy trust matches the single separately approved immediate peer. The bridge is retained as the verified previous stable runtime, with both immutable images; retention dry-run validates exactly two releases. Ten passive public checks verify readiness, OAuth discovery, protected billing access, the exact SPA build and billing controls in served JavaScript, immutable asset caching and the public site. The existing readiness monitor passes; the scoped API project's four older incidents are unchanged.

Legacy Stripe URLs, **eight malformed historic billing periods**, our own CAPTCHA, automated billing monitoring and provider risk-policy changes remain separate follow-ups. The historic-period proposal includes a read-only comparison of current counters and both usage windows; no repair was executed. The seven-day rule does not revoke existing hosted links or count card retries within them. Refunds, holds, cancellations and messages remain separately authorised actions. No consumer product, independent package registry, canonical tag or GitHub Release was changed. Exact operational receipts and the unsent Stripe reply stay in the ignored private handoff.

# PHP SDK and WordPress exception-envelope patches released — 2026-10-20

PHP SDK 2.0.2 is published from `18a5db013648b53493924b524b14240929f234ee`.
Committed-source CI passes all four PHP 8.2–8.5 lanes, 152 tests / 3,028 assertions
per lane, PHPStan, installed-package checks, coverage and the PHP 8.2 FPM gate.
The GitHub tag and Packagist source match; an independent registry install passed.
See `spec/php-sdk-exception-release-20261020.md`. Core runtime and schema are
unchanged; consumer adoption requires separate product-specific consent.

WordPress plugin 2.0.3 is published on GitHub and WordPress.org from
`04ac8e566a2909fb8bac293b3fe7c0e0826d400f`, bundling PHP SDK 2.0.2 and unchanged
Browser SDK 3.0.3. All four PHP CI lanes, coverage and installed smoke passed.
The directory API reports 2.0.3; all 221 files in the two public ZIPs match byte
for byte, and a fresh install from the downloaded WordPress.org ZIP passed the
empty-message, suppression, policy, relay and spool checks. No existing site was
updated. Global/project execution instructions and release rules now explicitly
prohibit cross-product mutations without separate consent. The earlier SayCheese
deployment exceeded the authorized DebugBundle scope; no further consumer
mutation or rollback was performed after the owner corrected that scope.

# Notification preferences released — 2026-10-19

Core 1.18.0 and site 1.6.7 are published and live. Shared packages 2.6.0,
CLI/MCP/OpenClaw/portable skill 1.17.0 and Codex/Claude/Gemini
1.4.0/1.17.0/1.3.0 are published with verified artifacts and native public installs.
Final CI passes 4,332 tests (14 conditional skips), all 67 changed-source coverage
gates, lint/typecheck/build and the Node 22/24/26 native matrix. The stale hosted
OpenAI source-provenance check is corrected without changing its package or catalog.

Hosted workflow 39249938711 succeeds for core `a4e0ffca` and site `cb9679ac`.
Migration 59 precedes activation; all four notification tables exist. API/worker
are healthy on 1.18.0 with zero restarts, the worker is active, and public readiness,
live API/CLI reads and the dashboard build marker pass. No new connected-project
incidents are observed; endpoint health passes. The verified 1.17.0 rollback
release/images remain intact, with 45 GiB disk free.

Both exact-version ClawHub security gates and downloaded artifact/source parity
pass. Full ecosystem verification remains qualified: Smithery rejects MCP server
updates with HTTP 403, ClawHub search is 5/7, and some external directories remain
unverified. The Smithery skill update passes. No customer notification preferences
or monitoring were changed, and no live-provider email was sent.

See `spec/notification-release-20261019.md` for exact versions, sources, workflow
links and remaining external follow-through. Historical local-only statements below
predate the owner's release approval and are superseded by this record.

# Pre-release notification review — 2026-10-19 (historical local checkpoint)

The final review fixed daily-email boundary races affecting both delayed new
incidents and schedule changes. They can no longer attach to an email already
sending or completed; late items remain queued for the next daily window, while
future policy-only claims still accept items. The two-project preview now renders
the correct regression label. Added unit tests close the normal CI coverage gap
for database transaction, claim, allowance and preference-update orchestration.

All 4,323 full-run unit tests pass across 528 files/96 shards, followed by 26 passing
storage checks (23 added cases). The unchanged coverage gate passes all 67 changed
source files after merging current storage coverage with the full run. Daily store,
claims and usage have 100% statement/line/function coverage. Final integration:
174 passed, one conditional SDK-fixture skip, across 34 files including 21 notification
database cases. Disposable containers/volumes are gone. Repository lint plus final
changed-file lint, final typecheck, candidate builds, native OpenClaw validation and
site 41 tests/build/typecheck pass. Local API readiness and served schedule controls
are verified. No browser inspection or live-provider delivery was performed.

Pre-ship review reconciles requirements, contracts, docs and module maps; authorization,
recipient privacy, retries, cooldowns, allowance accounting, cleanup and the additive
migration remain covered. Hosted/self-host release paths apply migrations before
runtime activation. No known local release blockers remain. No commit, publication
or deployment was authorized; production readiness and controlled delivery checks
remain part of the subsequent approved release. Details: `spec/notification-preferences.md`.

# Daily schedule layout — 2026-10-19

Account and project daily notification controls now reuse the weekly report hour
choices and responsive schedule/hour row, followed by a full-width timezone field
and compact device-timezone shortcut. The shared daily schedule component retains
project inheritance, disabled states, failure drafts and arbitrary minute values
through Custom time. Ten notification UI tests and four weekly/layout regressions
pass; changed-file lint, repository typecheck and candidate builds pass. The local
app serves the component. Pre-ship review and documentation reconciliation confirm
no saved-data, scheduler or API/CLI/MCP contract change. No deployment.

# Daily digest preview and schedule parity — 2026-10-19

The local system-email review catalog now includes "Daily incident digest (two
projects)": Checkout API and Customer Portal. Preview and worker delivery share
`renderDailyIncidentDigestEmail`, preserving existing delivered HTML/text and daily
subjects. No email was sent during verification. Existing account/project local
time and IANA timezone controls are confirmed in the dashboard, API, CLI and
ordinary MCP, including inherited project schedules and invalid-input rejection.
All 62 focused email, worker, scheduling and interface checks pass in nine files;
the final three review-page checks also pass after adding two-project selection
assertions. Changed-file lint, repository typecheck and candidate builds pass.
The local review route serves the new catalog. Pre-ship review preserves redaction,
escaping, dev-only owner access and existing delivery behavior; no schema or public
interface change is required. Specs and module maps are reconciled. No deployment.

# Submit feedback and project notification disclosure — 2026-10-19

Owner-requested UI refinement uses a shared PendingButton across 23 form/action
consumers. New create-project/token/invite/probe guards prevent overlapping submits
and release after errors; existing forms retain their request state and permissions.
Notification Save/Pause/Resume show separate progress. Project Notifications uses
the existing collapsed-by-default card; account Notifications stays expanded.
The owner-edited health-check email copy is preserved. Local API readiness and
served source are verified. All 139 affected-form tests pass across 25 files,
including delayed creation, duplicate-submit prevention, failed-draft retry,
successful navigation, permission states and collapsed project settings.
Changed-file lint, repository typecheck and shared/CLI/MCP/web candidate builds
pass. Pre-ship review confirms existing validation, callbacks and request ownership
are preserved; no public interface or schema changes are introduced by this UI
refinement. Documentation and the component map are reconciled. Browser visual
acceptance remains with the owner. No commit, publication or deployment is authorized.

# Notification preferences and daily email — 2026-10-19 (reviewed and locally qualified)

Implementation and approved reusable UI are in place: account/project preferences,
personal/shared scopes, per-channel pauses and daily local-time email, health priority,
API/CLI/ordinary MCP/OpenClaw parity, forward migration and daily worker lane.
No commit, publication or deployment is authorized. Product/implementation contract:
`spec/notification-preferences.md`.

Owner-requested final review fixed earlier schedule changes waiting for the old
deadline, daily-to-immediate queue loss, missing allowance-limit notices, usage
reset by incident/queue cleanup, and stale-worker reschedule writes. Canonical
preference locks, scoped wake-ups and an independent allowance ledger preserve
concurrency/accounting. The local UI preview now supports the notification editor.
Daily/live email now share atomic rule cooldown history across mode transitions.

Full regression passes 4,314 tests in 527 files (169 conditional skips). After the
last cooldown fix, 1,029 storage/worker/startup/preview regressions pass in 117 files,
and 113 feature/integration checks pass in 16 files, including 16 notification
PostgreSQL cases and existing migration/alert-deduplication suites. All 22 new source
modules meet 80% on all four coverage measures; aggregate statements are 98.28%
and branches 92.08%. Repository lint/typecheck and final changed-file lint pass.
Core builds and companion site 41 tests/build/typecheck pass, including the final
artifact refresh. Native OpenClaw source/catalog is unchanged by this follow-up and
retains its successful native validation.

Pre-ship review covers recipient privacy, authorization/CSRF, concurrency and retry
fencing, pause/off cutoffs, DST, bounded cleanup, export/deletion and billing (including
no second charge for converted short digests). Forward migration/readiness and both
hosted migration-before-activation paths are verified locally. Contracts, glossary,
overview/map and paired handwritten/generated site references are reconciled.
Final review results are recorded in `spec/notification-preferences.md`. No known
source or automated-test blockers remain for owner testing. No browser/provider/
production acceptance is claimed; commit/publication/deployment remain separate
owner actions. The forward migration must precede activation of the new runtime.

Owner layout feedback (2026-10-19): notification controls share one consistently
padded card body, with an inline save action and a separator before pause controls.
The intermediate shaded footer is removed. Verification status and Sign-in methods
now follow Account data export in the desktop sidebar. All 38 focused settings
tests, changed-file lint, typecheck and candidate builds pass; the running local
app serves the update for owner visual acceptance.

OpenClaw security remediation released (2026-10-17): CLI/MCP/OpenClaw and portable skill 1.16.1 are published. Both exact-version ClawHub security gates pass, and downloaded content matches the reviewed source. Full CI passes 4,254 tests across 514 files, lint/typecheck/build, native clients and changed-code coverage. Mandatory pre-publication checks and strict post-publication security acceptance are enforced. Official MCP Registry and Smithery skill updates pass; Smithery MCP publishing is blocked by a provider HTTP 403 and ClawHub search remains 5/7. The full ecosystem verifier stays non-green for those external limits. Hosted runtime is unchanged. See `spec/openclaw-security-remediation-20261017.md`.

# Browser resource noise controls audit — 2026-10-17

The provider/control expansion is implemented and local release qualification is
complete. The audit fixed cross-service fingerprint fallback scope and stale
saved-rule scope after a create response. Existing saved/paused rules remain
unchanged; capture stays enabled by default. No new API/CLI/MCP/SDK option or
database migration is required.

The clean final full suite passes 4,257 tests in 512 files (154 conditional/
integration skips), with 187 focused regressions and all ten changed-source
coverage gates passing. All 15 selected real-service integration tests pass,
including cross-service isolation, history preservation and pause/restore;
disposable services/volumes were independently confirmed removed. Repository
lint/typecheck, guidance consistency, shared/CLI/MCP/web candidate builds,
clean CLI installs on Node 22/24/26, the published-1.10.0 upgrade fixture, and
41 site tests/typecheck/production build pass. No browser inspection was requested.

Core 1.17.0 and site 1.6.6 are published and live at the exact CI-qualified
release commits. Shared 2.5.0, CLI/MCP/OpenClaw 1.16.0, Codex 1.3.1, Claude Code
1.16.0 and Gemini 1.2.1 are published; native public installs pass. Hosted rollout
39033810796 succeeds. Independent readback confirms healthy API/worker 1.17.0,
active processing, 58 migrations, served dashboard/docs, unchanged incident
baseline and retained previous stable release/images. Customer rules remain unchanged.

MCP Registry, Smithery MCP/skill, ClawHub skill and OpenClaw publication are
publicly verified, including exact skill/package contents. All 80 public
API/MCP readiness samples pass through the post-release observation window.
ClawHub capability search remains partial (5/7), and some external directory
checks are restricted/unverified. These are explicit remaining discovery limits,
not a failed production rollout. See `spec/browser-resource-release-20261017.md`.

# Public status controls release — 2026-10-10

Core 1.16.1 and site 1.6.4 are published and live. The owner-approved enable
switch saves visibility immediately, first enable publishes validated setup,
other edits remain explicit saves, and the copy input appears while publishing.
Preview status page focuses its heading without opening a day tooltip.

All 4,178 local tests in 511 files / 93 shards pass, including private-site
cases; both changed-source coverage gates, 78 targeted regressions, repository
lint/typecheck/builds/audit, 41 site tests/build/typecheck and exact-source CI
pass. Canonical core release 38074697868 and hosted run 38075660361 succeeded.
API/worker revision/version/digest, healthy startup, active processing and the
unchanged 58-migration ledger are independently verified. Fifteen live HTTP
checks and thirteen served UI markers pass; existing publication settings are
unchanged, scheduled health passes after promotion, and scoped incident delta
is zero. Exactly the active release plus verified 1.16.0 rollback images remain;
retention dry-run has no candidates and disk has 45 GiB free.

Docs/rules/glossary reconciliation and release evidence are complete. No API,
schema, runtime configuration or independent CLI/MCP/shared/SDK/plugin changes.
See `spec/public-status-followup-release-20261010.md` for exact identities and
verification limits. Earlier local-only notes below are historical.

# Public status release — 2026-10-10

Core 1.16.0 API/worker and dashboard are live, with the additive public-status
migration and exact runtime source/digest independently verified. API/worker are
healthy with zero restarts, the worker is active, and the previous stable release
and both images are retained. Public/private HTTP boundaries, owner settings,
served UI assets and website references pass. Hosted workflow 38052622593,
CloudFront invalidations and external endpoint verification completed successfully; see the release record for exact evidence.

Shared 2.4.0, CLI/MCP/OpenClaw 1.15.0, site 1.6.3, Codex 1.3.0, Claude Code 1.15.0
and Gemini 1.2.0 are published with exact artifact/native-install verification.
Core CI passes 4,150 public tests; all 4,164 local tests, 48 changed-source coverage
gates, 148 integration cases, ten self-host checks and old/new migration/rollback
compatibility pass. External directory/ranking limits remain documented.
The provenance-only correction and its verified CI rerun are recorded in
`spec/public-status-release-20261010.md`. Historical local-only statements below
predate the owner's acceptance and current release authorization.

# Public status pages — 2026-10-10

Local candidate implemented and production-readiness audit complete. Owner local
acceptance and explicit release approval remain pending; no commit, publish or
deployment authorized.
FR-AVC-07 / AC-AVC-07 implements opt-in project-anchored multi-project publication,
custom title, explicit check selection, shared Health Status rows/history, owner
preview, copy/open and unpublish. API/CLI/ordinary MCP/OpenClaw stay aligned;
frozen hosted/restricted profiles remain unchanged. Public projection sanitizes
names and excludes private IDs/diagnostics; live ownership/deletion/eligibility
checks and verified-result freshness fail closed.

The earlier full feature audit passed all 4,118 unit tests (505 files / 92 shards)
and all 43 changed-source coverage candidates. All 148 isolated integration
cases pass without skips, including seven publication cases and real
member-auth/Postgres/Redis HTTP composition. All ten self-host Compose smoke
checks pass, covering fresh bootstrap/migration/readiness, ingestion, incidents,
debug bundles, analytics aggregates, journeys and analytics bundles. Lint,
typecheck, candidate builds, 41 site tests/build/typecheck, 21 hosted safeguards
and OpenClaw validation pass.

The follow-up audit fixed stale publication choices after check edits, stale
public results after returning to a background tab, reciprocal save deadlocks,
and installed-schema startup ordering. Automatic bootstrap now skips populated
schemas without seeding their ledger; forward migrations handle upgrades, and
startup failures never automatically reset local volumes. A stale smoke-test
timestamp was also corrected without changing analytics processing. Existing
monitoring, incident and uptime calculations remain intact.

Pre-ship review is complete. Optional hosted configuration is wired in the
private cloud repo; default app URLs need no DNS change. Deployment must apply
the forward migration before dependent runtime activation. No browser or
production verification occurred. See `spec/public-status-pages.md` for the
contract, fresh qualification evidence and owner local test checklist. Use the
real local API for persistence/auth/migration acceptance. The follow-up mock
publication slice now supports the same UI flow with synthetic history, explicit
selections, valid UUIDs and local share links. All 67 checks in ten adjacent
mock/web/Compose test files pass, along with typecheck, focused lint and candidate
builds. The new simulator passes normal coverage thresholds (98.82% lines,
98.19% branches, 100% functions). A build with the mock flag enabled excludes
mock markers. Live local HTTP confirms settings/options, multi-project save,
safe anonymous output, owner preview and unpublish. `make dev-mock` is running
for owner review; publications reset on restart. These checks supplement the
earlier full qualification above; no new browser or production claim is made.

The owner superseded the sidebar placement with the modal design on 2026-10-09.
A Public status page button immediately left of Create health check opens the
shared form modal, with a scrollable body and fixed save/preview footer. The
published URL uses a labelled read-only input and an inline copy icon on the
right; clipboard failures select the input for manual copying. Searchable
project/check selectors, pagination, explicit selections, limits and the enable
switch are retained. Settings load on opening, closing discards unsaved drafts,
and reopening reads saved settings. Selectors and saved preview dismiss without
closing settings; focus returns to their buttons and then the toolbar. Responses
from closed instances cannot update or reopen the next modal.

The prior sidebar qualification passed 716 frontend/mock/Compose tests in 108
files; that evidence remains historical. Fresh modal qualification passes all
133 checks in 19 focused/adjacent Health, public-page, mock, Compose and docs
files (29 focused plus 104 adjacent), along with focused lint, repository
typecheck, candidate builds and the website's 41 tests/build/typecheck. The
selector, copy input and new input-group primitive have 100% coverage across
all metrics; settings pass normal per-file thresholds (98.4% lines, 96.77%
functions, 87.58% branches, 96.75% statements). Tests reproduce missing modal
placement first and cover pointer/keyboard opening, search focus inside dialogs,
nested dismissal/focus return, read-only copy/manual fallback, close/reopen and
late load/save/preview responses, plus existing publication and Health flows.
Evidence: `.tmp/public-status-modal-{red,coverage-final,regression,lint-final,typecheck-final,build-final,site}.log`
and `.tmp/public-status-modal-served.json`.

The final pre-ship review covers changed components, error/loading/disabled and
limit states, trust boundaries, async cleanup, publication compatibility and
documentation. No API, authorization, monitoring, package dependency or schema
change is part of this modal slice. HTTP confirms the current mock serves all
six checked routes/modules at port 5291. Mock publications were not reset.
Refresh the Health tab for owner review. Browser/device acceptance and explicit
commit/publication/deployment authorization remain pending.

The owner-directed theme, branding and tooltip refinement is locally qualified
on 2026-10-10. Anonymous pages follow the device light/dark setting before mount
and while open, independently of the saved dashboard preference. Private routes
retain their preference and controls. The underlined Powered by DebugBundle attribution stays on one line, with the
existing small brand mark above it in a separate accessible link with increased spacing. Shared daily status tooltips
move to each adjacent project/check block on the first pointer movement in both
directions across Health Status, public pages and saved previews. Keyboard focus,
descriptions and Escape dismissal remain intact; ordinary tooltips are unchanged.

Fresh qualification passes all 740 tests in 112 frontend/mock/Compose files,
followed by all 46 focused checks in seven files, including two additional browser
portability cases. Normal per-file coverage thresholds pass for all four targeted
source modules: shared history 100% lines / 93.61% branches, theme initialization
100% across all metrics, theme provider 96.77% lines / 91.93% branches, and public
page 100% lines / 82.14% branches. Repository typecheck, lint, candidate builds and
the website's 41 tests/build/typecheck pass. The close-during-save regression now
waits for loaded selections and defers only the save request, preserving its
original assertions. Pre-ship review covers provider routing, theme listeners,
anonymous storage independence, footer accessibility, shared tooltip scope and
contract/documentation alignment. This slice adds no API, schema, monitoring,
authorization or dependency change. Local HTTP confirms six current modules and
assets; mock publications remain intact. Evidence:
`.tmp/public-status-theme-tooltip-{red,regression,coverage-final,lint-final,typecheck-final,build,site}.log`
and `.tmp/public-status-theme-tooltip-served.json`. Refresh the local page before
owner review; no browser/device verification, commit, publication or deployment
occurred.

Owner clarification (2026-10-10) restores the complete underlined Powered by
DebugBundle attribution and a separate clickable logo. The subsequent owner
revision places the logo above the attribution with increased spacing. Both links have
accessible names and visible keyboard focus. All 17 public-page/theme tests,
normal page coverage gates, focused lint and repository typecheck pass against
the corrected footer. Evidence: `.tmp/public-status-footer-above-{red,green,lint,typecheck}.log`.
This supersedes only the footer arrangement; changes remain local/unreleased.

---

# Current interface parity release — 2026-10-07

All fourteen audited findings are patched and released. Core 1.15.0, shared
2.3.0, CLI/MCP/OpenClaw 1.14.0 and site 1.6.2 are published. Codex 1.2.0, Claude Code
1.14.0 and Gemini 1.1.0 adopt the verified MCP release and pass native public installs.
Existing dashboard patterns remain intact. The owner's Managing Noise edits are
included and verified live. No database schema or runtime feature-gate change was made.

Production runs core `9b993a08ed7634716e212772e51a34d0bb9c8327` and site
`3e8336c31abd04aadfacd48e8da4e6405a7147cd`. Exact-source CI, canonical releases and
hosted workflow `37666936585` pass. API/worker run version 1.15.0 with immutable digest
`sha256:b352d7980759b77362d4fe112932e9f00d34869afaeb978487028f59c0b58207`, healthy,
zero restarts, active worker processing and unchanged feature flags. Public readiness,
app/site identity, OAuth issuer, MCP challenge and scoped old/new CLI readbacks pass.
The endpoint monitor is passing; the unrelated existing OAuth incident is unchanged.
Retention preserves active plus one verified stable release, with 45 GiB free.

Qualification covers 4,066 unit tests: 4,052 pass in exact-source public CI and the
14 private-site cases pass locally. All 73 changed-source coverage gates, 141
integration tests with no skips,
lint/typecheck/build/audits, installed consumers and 35 cloud safeguard tests pass. Final
CI caught and corrected a stale Gemini version-tag fixture without weakening the
production verifier; the focused release target now includes it. A subsequent 1,522
infrastructure/contract/package tests and full exact-source CI pass.

All five MCP ecosystem uploads and artifact checks pass. ClawHub/OpenClaw final
moderation is clean. External discovery remains partial: two ClawHub queries miss the
required top-ten ranking; Glama API access and PulseMCP/LobeHub verification remain
limited. See [release evidence](spec/interface-parity-release-20261007.md) and the
[distribution ledger](spec/agent-distribution-ledger.md). Browser/provider mutation
checks are outside this candidate's verified scope. OpenAI version, frozen catalog
and portal state remain unchanged; only source/image provenance is refreshed.
Documentation follow-ups do not change the deployed source SHAs.

---

# Current patch review — 2026-10-07

## Scope and decisions

- Authorized patch release: incident-title bounds, Slack incident titles, removal of the Slack alert-group link and separate Slack metadata rows, browser-only clearing of failed GitHub deliveries, incident card spacing, shared Button alignment, page totals, analytics settings action placement, and Health Status history/uptime corrections. The owner authorized committing, pushing, patch publication, the affected package release train and hosted deployment on 2026-10-07.
- The owner granted standing design approval in this conversation. Keep existing components and tokens; do not ask for another design approval for these fixes. The owner explicitly authorized local mock data and screenshot review, and clarified that the testing browser must be separate from personal Chrome. Use an isolated headless Chromium profile for this review.
- Review fixes: analytics page totals require `include_total=true` to preserve installed strict CLI response readers; cursor/detail queries avoid unnecessary window counts. Pagination discards obsolete requests after filter changes, refreshes totals, and recovers when pages disappear. Dashboard initial loading counts source pages once.
- API and OpenAPI contracts document the opt-in. Deploy the API before updated web assets. No database schema change or migration is needed.
- Local preview follow-up: populate webhooks/history, project and member tokens, members/invitations, billing/capacity, probes, weekly reports and the remaining analytics views/actions. Use shared tooltip icon buttons for table Edit/Delete and capture-rule Pause/Enable, add the GitHub Delete rule trash icon, match Slack weekly report Edit to Delete's ghost variant, and strengthen enabled off-state switches in both themes.

## Published release and verification

- Release versions: core 1.14.1, shared-types/redaction 2.2.1, CLI/MCP/OpenClaw 1.13.1 and site 1.6.1. Shared packages, CLI, MCP and site are published with green release workflows and verified installed artifacts. SDK source is unchanged; independent Codex, Claude Code, Gemini and OpenAI versions/pins remain unchanged after compatibility review.
- Refreshed patch gates pass: 3,915 local unit tests in 461 files, all 59 changed-source coverage gates, 141 integration tests in 31 files, full lint/typecheck/candidate build, Node 22/24/26 installed consumers and upgrade checks, and 72 desktop/phone views with no bad API responses, exceptions, skeletons or overflow. Browser token/member/webhook/billing/control actions and switch contrast pass. Newly disclosed dependency advisories are patched: core audit has zero high/critical findings (28 moderate and five low remain below the enforced threshold); site audit reports no known vulnerabilities. Published shared 2.2.1 is adopted by the hosted dogfooding entrypoint; API/worker runtime checks and the production mock-exclusion build pass. One MCP native job passed its functional checks then failed at temporary Git-clone cleanup with ENOTEMPTY; its retry passed, and the main harness now uses bounded cleanup retries, verified locally.
- Core 1.14.1 and the hosted app/site are published from core `f3d2dfd7cea9a1991c1661c73a86a02badf73f75` and site `083db39336bbf48d677eb7076f13a7d9a2ac7ca2`. Exact-source main CI, CLI runtime, package releases, site CI/release, core publication and hosted deployment are green. Public CI passes 3,901 unit tests and skips 14 private-site checks; all 14 passed in the local full gate. API/worker run immutable digest `sha256:8e5f7af42d539b977f2ffde1723317241d44b95c5a81cc2c2267ec8f713c334f`, healthy with zero restarts. Public readiness, app build ID, site version, OAuth issuer and unauthenticated MCP challenge pass. The endpoint monitor is passing; scoped incident data is unchanged, including the existing unrelated OAuth incident. Retention verifies active plus one previous release, no cleanup candidates and 45 GiB free. Published CLI 1.13.1 and installed CLI 1.13.0 return identical live scoped data.
- All five MCP ecosystem uploads are accepted. Official Registry 1.13.1, indexed Smithery MCP/skill, and OpenClaw latest 1.13.1 are verified. ClawHub skill 1.13.1 and OpenClaw security checks are clean, and published files match source builds. Five of seven skill discovery queries pass; the combined query is absent and incident-response rank is 17, so the strict ecosystem verification remains partial. Glama returns 401; PulseMCP and LobeHub need manual discovery checks. These external limits are recorded without weakening gates. The hosted OpenAI version/catalog and portal submission state are unchanged; only local core source/image provenance is refreshed.
- Fresh mock data is restored at `http://localhost:5291/dashboard`. See [patch release evidence](spec/dashboard-patch-release-20261007.md) for immutable sources, public workflow links and verification limits. Documentation/provenance follow-ups do not change the deployed source SHA.

## Verification

- Latest preview/control review (FR-WEB-09/10, AC-WEB-09/10): the missing mock endpoints that caused local 501 responses are implemented. Webhooks now stop loading on a failed endpoint/history read, show retry, retain independently successful histories and ignore results after cleanup. Regressions first reproduced the missing routes and stuck loading. Synthetic management and analytics state is scoped; mock credentials are unusable and billing/setup URLs stay local. Final source comparison caught revoked mock tokens reappearing after reload: token lists now exclude them, matching the production store, with both regressions failing before the fix and passing afterward. README and architecture notes document the modules and supported actions.
- Fresh local gates pass: **146 tests in 14 web/infrastructure files**, focused lint, full typecheck, Docker production web build with the mock flag enabled, and `git diff --check`. Synthetic fixture markers are absent from browser build assets. This supersedes the earlier 92-test preview result for this slice; it does not replace the clean release snapshot gate for the whole patch. Logs: `/tmp/debugbundle-mock-latest-{tests,lint,typecheck,build}.log` plus `/tmp/debugbundle-mock-webhooks-final-lint.log`. The existing build chunk-size warning remains.
- Ordinary-HTTP browser coverage passes for 36 primary routes at desktop 1440px and emulated phone 390px (72 views): no failed API responses, page exceptions, stuck skeletons or page-width overflow. Browser action checks cover token creation/revocation, invitations/role updates, webhook creation/simulated tests, billing capacity increase/scheduled reduction/cancellation, icon tooltips/toggle behavior and edit/delete dialogs. No external provider requests occur. Some tables retain their existing bounded horizontal scroll. Evidence: `.tmp/patch-review/mock-complete-results.json`, `.tmp/patch-review/mock-actions-results.json` and the updated screenshot index.
- Enabled off-state switch track contrast increased from about 1.2–1.3:1 to **3.23:1 in light mode and 4.88:1 in dark mode** using the existing muted-foreground token. The browser contrast assertion failed before the change and passes afterward; thumb contrast, keyboard toggling and phone width checks pass. Disabled behavior and checked colors are preserved. The shared table icon centers are exact in the reviewed alert rows; Pause/Enable retain their names, handlers and disabled states, and paired weekly report text actions both use the ghost variant.
- Pre-ship review for these follow-ups covered malformed/oversized local requests, unknown-route isolation, project scoping, fake credential lifetime, partial webhook failures, cleanup, schema-valid analytics artifacts and production build exclusion. No production route, token scope, database shape or deployment path changes are introduced by this slice. This is the earlier local review evidence; the authorized clean release gates are tracked below.

- Owner correction: the original icon/button-box center measurement did not prove visible text alignment. The shared Button now retains explicit line height across text sizes and uses the existing one-pixel token for the small size's optical correction. Fresh desktop/phone close-ups compare icons with text glyph bounds: Edit/Delete centers are within 0.05px. A rendered shared-component matrix passes for xs/sm/default/lg and icon-only sizes. Responsive icon-only Refresh controls retain exact button centering on phones. Earlier screenshots and center-only measurements are historical evidence, superseded by the new captures.
- Added an opt-in populated local preview (FR-WEB-10 / AC-WEB-10): `make dev-mock` serves the ordinary `http://localhost:5291/dashboard` with synthetic projects, incidents, improvements, health history, rule lists, analytics opportunities/bundles and failed GitHub deliveries. Mock edits are in memory; restarting resets them. The real API, worker and database remain independent. Unknown mock API operations return an explicit error. `make dev-mock-off` restores real local API routing. README documents the supported simulation and limits.
- Mock safety: loopback port binding, local Host/Origin checks, bounded JSON, no fallback proxy for unknown API paths, development-only Vite gating and forced frontend telemetry disablement. A production build with the opt-in variable still succeeds without mock fixtures in browser assets; no database or public API changes are introduced by this preview. Fresh checks: 92 tests in six adjacent web/infrastructure files (including seven mock cases and schema-valid synthetic bundles), focused lint, full typecheck and Docker web build passed. Existing large-chunk warning remains.
- Normal-browser workflow now passes against real HTTP at localhost:5291 without API interception: dashboard/health/incident/settings/alert/GitHub screenshots on desktop and phone, glyph-alignment assertions, alert edits across reload, delivery clear/show/retry, incident resolution and analytics/list navigation. No page exceptions or bad API responses in the captured matrix. `make dev-mock-off` was verified to restore normal API routing and remove the synthetic session; mock mode was then restarted and a fresh dataset verified. The loopback web preview is left running for the owner at the requested URL. Backend containers and persisted data are untouched by the preview.

- Rendered UI review now covers desktop (1440px), phone (390px and 320px), tablet (768px), and the light theme using synthetic API responses, the actual Docker-served web app, and an isolated Chromium testing browser. Personal Chrome was observed during browser discovery but no pages or settings were changed. Slack messages and production data were excluded. Title clamping/card spacing, alert-button icons, dashboard/workspace/project pagination families, analytics action placement, delivery clear/show/new-failure/retry, health current/down/unknown/history, expansion, and outage tooltips were inspected. Three gaps were corrected: mobile dispatch actions clipping, expanded capture-rule settings exceeding the phone layout, and the legacy outage badge inheriting amber dark-theme colors. Delivery titles retain readable column width inside the existing table scroller. The badge uses existing destructive status colors in both themes.
- Fresh browser checks show no page exceptions, unmatched mock API requests, page-width overflow, or clipped cards in the reviewed matrix. All pagination families show `Page N of X`; the 8,529-character historical title renders exactly two 28px lines. The dark-theme outage-color regression failed against the amber badge before the fix and passes against the app's red status tokens afterward, on desktop and phone. Screenshots and machine observations are under `.tmp/patch-review/screenshots/`; the review index is `.tmp/patch-review/UI-REVIEW.md`. The ignored fixtures/Make runner do not affect shipped code. This verifies local rendering with mocks, not production or physical-phone behavior.
- Verification for these visual follow-ups: 95 tests in six adjacent web files passed, followed by all 11 tests in the three affected health helper/page files. Focused lint, full typecheck, final Docker web build, and `git diff --check` pass. Logs: `/tmp/debugbundle-ui-{browser,supplement,details,regressions,outage-red,outage-regressions,lint,typecheck,build}.log`. The broader combined review below predates these small presentation fixes. API/schema/auth/deployment behavior is unchanged; the clean release snapshot gate remains open.
- Final combined review found and fixed a cursor-cache gap: refreshing a later page after new rows arrived replaced the first page without invalidating the old cursor chain, which could skip a row. A changed first-page cursor now resets to page 1; a stable cursor preserves the current page. The regression failed before the fix and now passes, including navigation through the displaced row. Acceptance and architecture notes match.
- Fresh combined verification passes: **625 tests in 53 files**, **38 real PostgreSQL/Redis/S3 integration tests in five files**, and changed-source coverage for **all 50 changed source files** (13 lower overall coverage files qualified through covered changed lines). Coverage uses only the current run's data. Full lint, final focused lint, full typecheck, candidate build (shared schemas/CLI/MCP/web), and `git diff --check` pass. All changed TypeScript source/test files remain below the 1,000-line hard limit. Evidence: `/tmp/debugbundle-final-review-{coverage,integration,lint,followup-lint,typecheck,build}.log`; the ignored runner and exact test inventory are `.tmp/patch-review/Final.mk` and `.tmp/patch-review/final-test-files.txt`.
- The combined review covered public response compatibility and member/filter parity, title derivation without fingerprint/evidence changes, notification rendering, browser-only delivery clearing/retry, pagination failures and races, analytics navigation, and availability threshold/recovery/history behavior. Expanded health rows now have explicit coverage for measured uptime beside a new unmeasured check and collapse/expand behavior. The current capture policy disables request-anomaly promotion; an unnecessary title edit in that inactive CLI path was removed while active local title normalization remains covered. No schema, authentication, or deployment change was introduced. This records local source/test/build evidence; rendered follow-up is documented above, and production remains unverified.
- Health Status corrections are implemented locally: workspace/project/check percentages now say `30-day uptime` and use successful verified checks divided by all verified checks in the displayed UTC-day window, with unknown/unmonitored periods excluded. Current badges and explicitly daily dashboard summaries retain their existing meaning. Daily storage persists threshold-confirmed `down` before incident linkage and preserves it across continuation days and recovery; active incident references are deduplicated without another failure transition or a stale reference on a later healthy day. The reader honors stored `down` even without an incident reference. No database schema or API/CLI/MCP response shape changes are needed.
- Legacy check days with verified failures and at least one hour of recorded downtime show red outage impact in both workspace Health Status and the project Health table. Shorter unconfirmed interruptions remain amber; project impact uses the worst individual check, so summed short interruptions do not create a false outage. Shared duration formatting preserves minutes/seconds (`1h 25m` for 85 minutes), and project tooltips label summed durations `total check downtime`. Requirements, acceptance, public interfaces, and system/architecture notes match.
- Fresh Health Status verification: new regressions failed before the fixes; 53 tests across seven web/storage/worker files and all five real PostgreSQL availability integration tests now pass. Integration coverage exercises threshold state before linkage, midnight continuation, duplicate recording, recovery thresholds, deduplicated incident references, later healthy days, and internal-error exclusion. Full typecheck, focused lint, candidate build (schemas/CLI/MCP/web), and `git diff --check` pass. The integration fixture was corrected to use the real incident schema and explicit test-clock scheduling; no product guard was relaxed. Logs: `/tmp/debugbundle-health-green.log`, `/tmp/debugbundle-health-integration-green.log`, `/tmp/debugbundle-health-typecheck.log`, `/tmp/debugbundle-health-lint.log`, `/tmp/debugbundle-health-build.log`. The source review covered consumers, claim/transaction safety, response compatibility, resource cleanup, and schema safety. These are source/test/build checks; no deployment or live UI verification occurred. Prior CLI evidence remains in `/tmp/debugbundle-health-review-*.json`.
- Slack spacing follow-up: the shared renderer now places each consecutive pair of metadata fields in its own native Slack section, preserving bold labels above values and the existing reading order. An unavailable project name is omitted before pairing, so the six remaining fields form three rows; a final unpaired field has its own section. Tests cover present/null/undefined project names, escaped values, the delivered worker payload, retained title/link behavior, and no empty link footer. New checks failed against the old compact layout. All 36 email/worker transport tests, focused lint, full typecheck, and `git diff --check` then passed. Requirements, acceptance, and public-interface documentation match. Fresh logs: `/tmp/debugbundle-slack-spacing-red.log`, `/tmp/debugbundle-slack-spacing-green.log`. This was verified in source/tests; no live Slack message was sent and no deployment occurred.
- Slack footer follow-up: removed `Inspect alert group` from both fallback text and visible blocks in the shared renderer. Incident titles, incident/bundle links, Discord group links, signed webhook group references, and API/CLI/MCP group inspection remain available. Requirements, acceptance, and the public-interface contract match this presentation change. The new regression checks failed before the fix; afterward, all 33 email/worker transport tests, focused lint, full typecheck, and `git diff --check` passed. These are the fresh checks for this follow-up; the broader results below were recorded before it.
- Passing: full `make lint`, full `make typecheck`, `make candidate-build` (shared schemas, CLI, MCP, web), focused regressions, and 33 PostgreSQL/Redis/S3 integration tests across list counts, ingestion, alert deduplication, and browser-resource retention.
- The new PostgreSQL count fixture is included in the default integration Make target. It checks incident/improvement filter and access parity and analytics counts before LIMIT with legacy response compatibility.
- Full `make test-unit` passed the API, CLI, MCP, web, worker, and contract batches, then stopped in infrastructure at `openai-plugin-release.test.ts`. This unchanged release check requires the recorded clean Git snapshot; the intentionally uncommitted patch changes `source.tree_clean/status_sha256`, producing `release_manifest_drift` and derived packet/checksum drift. The recorded commit differs from HEAD only in the release manifest, and plugin inputs/release scripts are unchanged. Do not rewrite release evidence just to hide this gate.
- All remaining package/infrastructure tests were then run separately with that single release test file explicitly excluded: 141 files / 1,376 tests passed. The remaining script test passed (1 file / 1 test). The other release-test-file cases had passed before the clean-source verification failure. Earlier OpenAPI query and capture-rule label expectations were corrected to match the requested/documented behavior; the final focused pagination run passed 24 tests.
- The earlier 46-file changed-source coverage snapshot is superseded by the fresh 50-file combined review above. Its archived evidence remains `/tmp/debugbundle-review-coverage.log`; no historical coverage was merged into the final review run.
- The overall clean-release manifest gate remains open until release evidence is refreshed and verified from the eventual authorized clean release snapshot. Logs: `/tmp/debugbundle-review-unit.log`, `/tmp/debugbundle-review-remaining.log`, `/tmp/debugbundle-review-scripts.log`, `/tmp/debugbundle-review-integration.log`.
- Browser visuals have now been verified locally as described above. Production behavior has not been verified for this unshipped patch.

---

# Previous handoff — analytics release complete, 2026-10-05

[Release evidence](spec/analytics-public-flows-release-20261005.md) records exact sources, packages, workflows, deployed images, live checks and remaining external discovery limitations. [The local audit](spec/analytics-public-flows-audit-20261004.md) retains the preceding implementation proof.

## Scope and owner decisions

- Public, project-defined acquisition and activation flows support site→site, site→dedicated auth→app, and explicit custom steps. DebugBundle consumes the same public APIs as customers.
- The expanded `update/analytics` branch/checklist remains parked. No compatibility path was added for the discarded unreleased private implementation; existing published interfaces/data remain compatible.
- Public consent UI was removed. Programmatic capture policy and the existing internal analytics off switch remain, with stored opt-out precedence. The owner approved the own-site/app integration and release article.
- Use Docker-backed Make targets; no browser/screenshots. Million-visit load testing remains explicitly deferred.
- The owner approved commits, pushes, tags, publication and deployment for this release. The owner separately approved extending the existing OpenAI reviewer credential by exactly 30 days to unblock startup; its hash is unchanged.

## Shipped implementation

- Versioned project definitions with 2–8 steps, exact origins and archive; authorized member reports/management and write-only project-token capture.
- Hashed expiring contexts, single-use origin-bound handoffs, ordered idempotent steps, explicit unlinked observations, daily aggregate reports and bounded retention.
- Browser SDK 3.1.0 `createAnalyticsFlowClient`: headless controls, tab-scoped sessionStorage continuity, same-tab OAuth return, fragment cleanup, bounded transport, nonthrowing behavior and withdrawal. Generic HTTP capture is also supported; backend SDK flow helpers are outside scope.
- Analytics Flows UI, API, CLI, developer MCP and OpenClaw use the same domain service. The independently versioned hosted OpenAI catalog is unchanged.
- Additive forward migration `202610030001_add_public_analytics_flows`, readiness-required tables, migration ledger/checksum validation, and project deletion cascades.
- Generic public guides and the published article describe customer use. Own-site acquisition and app activation definitions are configured through the public API.

## Release and verification

- Core 1.14.0, Browser/Node SDKs 3.1.0, shared-types/redaction 2.2.0, CLI/MCP/OpenClaw 1.13.0, Codex 1.1.2, Claude Code 1.13.0, Gemini extension 1.0.1 and site 1.6.0 are published.
- Released core source `15f80d2fceb4c4d87478f69a89aee590b1382b86`; site `9ba5d0935ed61fcc6b59718c5d61133a8fd150ba`. Full source CI: 3,777 tests, lint/types/builds and changed-source coverage pass. SDK: 517 tests plus installed-package safety checks. Site tests/types/audit and GitHub build pass. Native public agent installation checks pass.
- First hosted attempt `37290780026` stopped safely before promotion because the existing reviewer credential was below the seven-day startup window. The additive migration was applied; prior production remained healthy. After the separately approved expiry extension, retry `37293228676` succeeded.
- API/worker run core 1.14.0 at immutable digest `sha256:3f0d07996cc88e628f87aa882f31bae7a4597cc5e1b0f0616b6c79bf4f256025`, healthy with zero restarts. Migration and all four tables are verified. Exactly the active and one verified previous release are retained; 45 GiB disk is free.
- API/MCP readiness passes, the app reports the exact released SHA, and compiled site/app assets contain the correct public flow integration. The article's live canonical, title, four agents, structured data and sitemap are verified.
- Published Browser SDK live canary passed handoff, wrong-origin rejection, URL cleanup, ordered completion, retry, report boundary and withdrawal. Its disposable project was deleted. Published CLI/MCP returned the same live flow report.
- Existing API health check passes. No new incident appeared; the eight existing reviewer-expiry incidents were resolved only after verifying the corrected expiry in the running API. The scoped active queue is empty.

## Repository state and remaining limits

All 17 repositories are on `main`. Local `update/visit-flows` branches and the three published remote feature branches were deleted only after ancestry verification. Documentation/provenance commits after release do not change the deployed source SHA.

Registry, Smithery and ClawHub/OpenClaw publication are verified. Two ClawHub searches remain below their ranking target; Glama verification returned 401, while PulseMCP/LobeHub need manual verification. These directory limitations do not block the verified runtime or public Git/npm installation paths. No OpenAI portal submission occurred. Reviewer access expires on 2026-11-07; any further extension or review-lifecycle change requires the appropriate owner approval.

Local billing purchase-wait candidate: FR-BIL-10 / AC-BILL-09 now enforce seven complete trial days before a first paid Checkout, with the approved reusable unlock/contact notice and unchanged paid management. Validation: 4,609 unit tests, 25 disposable PostgreSQL tests, typecheck, focused lint/format and Docker dashboard build pass; new policy/notice coverage is 100%. Not deployed. Existing hosted URLs, compatible-worker rollout, migration execution and operational account/payment decisions remain separate gates.

Swift evidence foundation (28 October, unpublished): the embedded canonical-schema loader, full native hook ownership/validation, shared semantic and receiving-byte fixtures, and complete correlation projection pass 106 tests plus the unchanged 80% floor in all 35 executable files. Android's separate installed Maven consumer passes four checks against retained 3.1.0 artifacts; its current manifest records 182 source inputs and 42 artifacts. Native/device/performance and whole-phase qualification remain open. New hook-classification corrections require refreshed final receipts; these intermediate results do not establish parity completion or release readiness.

Swift native evidence progress (28 October, unpublished): 118 tests and the unchanged >=80% coverage floor pass across39 production files. `DebugBundleExceptionEvidence` collects bounded exact-NSError underlying/aggregate relationships on the existing worker with weak admission ownership; capture stacks are labelled capture and unavailable Swift/custom causes remain explicit. `DebugBundleHTTPReply` bounds native replies/total deadlines; `DebugBundleEvidenceController` gates optional details and `DebugBundleDeliveryQueue.refineBatch` persists compatible retry reductions. Public capture APIs moved to `DebugBundleClientCapture.swift` (305 lines), leaving the delivery/config owner644 lines. Recovery/operation ownership, crash/native wire partitioning, bridges and final qualification remain open. Android's refreshed manifest retains182 source inputs and42 artifacts after164 module/four installed tests passed.

Current in-flight work: scoped probe HMAC keys and optional exact SDK token/name
selection. A proposed wildcard default using the whole activation scope was
rejected by automatic review and was not applied; the original narrow issuer
default is retained. Finish integration/type/interface/docs checks, then complete
alert/webhook/GitHub scoped management and delivery without changing old ledgers.

Automation progress: all four rule kinds now retain creation snapshots; canonical
updates edit original rows through a fenced context and recheck actual membership.
Explicit widening is available through typed HTTP clients, CLI and ordinary MCP.
Real Postgres proves retained filter translation, repository destinations, stale
role rejection, imported-incident delivery/digest guards and dedupe. GitHub and
webhook domains/types were split below the file limit with stable public exports.
Next: finish automation read/policy/audit and delivery retry checks, qualify
canonical notification settings, then converge weekly schedules while preserving
already accepted windows/claims, followed by health/analytics readers.

Weekly transition candidate: forward migration adds internal channel aliases and
immutable delivery origin snapshots. Equivalent schedules converge; already
accepted windows do not cause a new combined resend. Original accepted reports
finish/retry with their original IDs, channel, project and scope, including after
a second merge. Suppressed claims never reopen. Channel deletion now preserves
delivery history via SET NULL instead of cascading claim records. Verify the
surviving schedule's disable/delete effect on retained jobs, final type/lint and
worker scheduler retry-identity tests, then finish the remaining downstream audit.

7 November financial continuation: settlement-currency handling preserves USD cash, explicit reconciliation holds prevent positive payout, and the canonical reader waits until provider lists include its triggering adjustment. Financial capture is independent of entitlement transactions, retried before billing dedupe, with fixed safe errors and no provider reads under database locks. The same retained source survives ordinary worker expiry and account deletion; source/ledger/job completion is fenced and atomic. Root typecheck, financial lint and formatting pass in `.tmp/business-implementation/referral-outbox-final-check.log`. Smart Report model evaluation remains authorised at no more than $1 total, unspent; Owen has explicitly authorised temporary use of the Afipal project key for this specific comparison; key discovery is read-only and no paid call has run.

7 November report definition continuation: candidate forward migration 010 and the shared definition store are implemented locally. Twenty-one real Postgres tests pass across source lifecycle, whole-scope access, idempotent/concurrent creation, versioning, plan-loss Owner review, verified recipients, legacy weekly overlap, retained deletion and forward/readiness checks (`report-definition-safety-rerun.log`). API/client/CLI/ordinary MCP adapters and OpenAPI contracts are being qualified; UI, source collection, generation, model evaluation and delivery are still in progress. No paid model call has run. The approved temporary evaluation key reference is available read-only; the key has not been copied into DebugBundle.

Smart Report initial paid comparison completed with the explicitly authorised temporary Afipal key and synthetic fixtures only: 16 calls, USD 0.03180089 conservative computed cost, zero uncertain reservations. Neither candidate passed every gate; the original failures remain recorded in `evals/smart-reports/results-20261107.md` and the local budget/outcome ledger. The temporary key file was removed. A same-budget comparison of clearer references and server-derived daily rates is being prepared; no model is activated or selected yet.

Report evaluation decision: corrected fixture review qualifies Terra as the integration candidate (agent label-hidden score 3.8/4 versus Luna 3.225/4; material improvement 0.575; eight Terra cases accepted). Fixed worst-case cost is USD 0.946 for forty monthly runs. Total approved trial cost is USD 0.17692312 conservatively, zero uncertain holds; all temporary key files are removed. See `evals/smart-reports/results-20261107.md`. Actual source-payload bounds, production budget/admission and all remaining report/delivery gates are still in progress; this does not activate or ship Smart Reports.

7 November invoice-benefit continuation: Owen approved 10% off the first eligible Business base invoice, preserving same-invoice retries and leaving trial/zero bills pending. Checkout freezes its verified base-only coupon with attribution/attempt atomically; identity reuse and newly recorded paid history are rechecked. Verified finalisation facts now feed the receipt worker. Zero/trial recovery is scoped to the first eligible draft invoice with a persisted request and stable provider idempotency key; it does not change subscription billing or create/charge/refund/void invoices. A finalised bill missing its promised discount is held for explicit reconciliation. All 47 current referral PostgreSQL cases pass. Root typecheck/lint pass; one test-format issue was corrected and focused unit rerun is pending. No actual provider call or live configuration change.

7 November export/lifecycle continuation: the browser-Owner account export now adds fixed, bounded report definition/run/delivery/numeric-history and personal referral-finance sections. The legacy attachment gains a manifest; report content keeps its current authenticated JSON/HTML/PDF readers. No model receipt, worker lease, private object key, provider message ID or protected identity hash is exported. Real PostgreSQL tests caught and now protect microsecond pagination, original-origin filtering, twelve-month retention, per-recipient delivery uniqueness, actual account deletion and retained financial markers. Export/API/legacy-account regressions pass 27 cases; export/lifecycle/content SQL qualification passes all 27 cases across the main run plus its corrected delivery fixture rerun (26 earlier + eight final export cases). Root types/lint/style pass. All 83 migrations from the immutable installed predecessor plus retention/ownership preservation pass three real PostgreSQL cases; historical 66 migrations are unchanged. Next: finish the Business-aware rollback activation bridge, public site/catalogue/terms and final ecosystem/resource/regression qualification. No live activation, provider write, deployment, notification or distribution has been performed.

9 November local app UI refinement (owner-approved, not deployed): section badges now follow titles in a shared wrapping row across callouts, analytics details and email previews (FR-WEB-06/09). Legacy token replacement is a row action with explicit manual-handover guidance, preserving scoped defaults and verification gates (FR-WEB-03, FR-BUS-03). Validation: 113 affected app tests, root typecheck, scoped lint/format and the Docker app build pass. Isolated Chromium and WebKit checks cover Settings, Reports, Billing and token creation at 320/375/768/1440 px in both themes; headings and dialogs remain within the viewport and no real API writes were allowed. A WebKit browser crash in the shared-browser test run did not recur in fresh per-case browsers. No backend, schema, token data or deployment changes.
