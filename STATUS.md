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
