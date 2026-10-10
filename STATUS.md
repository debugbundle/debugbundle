# Public status modal follow-up — 2026-10-10 (release candidate 1.16.1)

FR-AVC-07 / AC-AVC-07: the enable switch now saves immediately. First enable
creates the page with the validated title/check selections; later toggles use
saved settings and preserve other edits for Save status settings. The read-only
copy input appears while enabling and becomes copyable when the URL exists.
Failures restore the saved switch without losing drafts. The action is Preview
status page, and opening it focuses the heading without activating a day tooltip.
Keyboard day details and focus return remain.

Pre-ship review covers first-enable validation, saved/draft separation, existing
empty configurations, pending/error/retry states, late toggle/save responses,
preview focus, clipboard fallback and collaborator restrictions. No API, schema,
auth or monitoring change. All 78 focused/adjacent tests in 11 files pass, both changed-source coverage gates
pass, and focused lint, repository typecheck and candidate builds pass. Evidence:
`.tmp/public-status-autosave-{red,green,coverage,lint,typecheck,build}.log`.
Docs/rules are reconciled. Owner accepted the changes and authorized commit, push and release. Launch qualification and production verification are in progress; see `spec/public-status-followup-release-20261010.md`.

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
