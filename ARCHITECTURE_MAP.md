MCP ecosystem verification owns exact-version ClawScan security acceptance and
separate discovery checks. Its report preserves findings and ClawHub's verified
VirusTotal retirement without inventing an antivirus pass; active audits and
moderation remain fail-closed.

Dashboard health alert: `workspace-health-alert.ts` reads existing project/check
APIs in batches of four and reuses shared current-state derivation, excluding
disabled/paused checks and suspended shares. `workspace-health-alert-context.tsx`
owns visible-only polling, focus/manual refresh and account/workspace request
fencing. The protected shell shares it with AppSidebar and HealthStatusPage;
SidebarMenuBadge and the destructive Badge variant render the accessible `!`.

Dashboard presentation: PageHeader owns description/action alignment; SiteHeader
owns navigation/title only. Access-token navigation uses `/access-tokens`.
`use-cursor-pagination` carries optional first-page total counts, and `inventory-title`
formats known totals. Incident/improvement routes and analytics opportunity reads
expose exact counts only under the new opt-in, reusing existing authorised count
queries. Shared schemas/OpenAPI describe the additive metadata. Review empty-state
enablement reuses the existing consent/settings dialog.

Dashboard setup guidance: `packages/shared-types/src/dashboard-setup.ts` owns
the presentation model and credential-free prompt. Web `dashboard-setup-data.ts`
observes existing read APIs (including bounded optional project analytics settings),
`dashboard-setup-preferences.ts` owns versioned
browser display preferences, and `dashboard-setup-context.tsx` fences asynchronous
work by account/workspace. The shared dialog and sidebar progress component are
mounted in the protected shell; the account menu reopens the guide. No CLI, auth,
server interface or database boundary changes. See `spec/dashboard-welcome.md`.

The local guidance follow-up passed its final bounded synthetic qualification:
all eighteen paid cases and two no-request abstentions, including concrete monitor
recovery comparisons and duplicate-prose rejection. Exact evidence is in
`evals/smart-improvements/guidance-qualification-final-20261111.json`. This is ready
for Owner review; no production activation or deployment occurred.
The final deep audit also closes cross-rule delivery detection, reordered duplicate
checks and linked-group ordering; 213 affected regression tests pass. The qualified
requests remain byte-identical and no additional provider calls were made.

Weekly guidance: `smart-improvements/review-planning-contract` owns bounded
context and the plan document; `review-planning` owns deterministic grouping,
control checks, digest and guidance validation. Storage collects exact-origin
configuration/numeric evidence and freezes one context snapshot with facts. The
existing store provides the unchanged export plus an additive plan read to the
shared client, API, CLI, ordinary MCP and existing UI. No new worker/service,
format flags or SDK collection is added.

Access tokens is the public label for the existing member-token credential family.
Dashboard, CLI and integration copy use that label while the existing token client,
routes, schemas and storage retain their identifiers and authority checks. See
`contracts/member-token-scopes.md`; no new authentication or migration path is added.

Smart Products backend/app released in core 1.25.0 and public site 1.9.0
(`spec/smart-products.md`; distribution acceptance and the remaining external
marketplace gate are in `spec/smart-products-release-20261111.md`):

- `packages/smart-improvements`: browser-safe closed contracts/policy, server-side
  deterministic priorities/digest and bounded provider client/qualification config.
- `packages/storage/improvement-review-*`: scope/consent, fair scheduler, frozen
  facts, independent allowance, lease-fenced paid intents/settlement, publication,
  current-access reads, export links and bounded retention. Worker is a thin adapter
  in the existing serial report lane; no new service or ingestion work.
- `packages/improvement-review-client`, API review routes, CLI review commands and
  ordinary MCP tools share the same domain path. Restricted/OpenAI catalogs stay fixed.
- Report identity snapshots/PDF projection provenance and frozen factual product
  modes use separate forward migrations; startup requires every new schema guard.
- `smart-reports/report-presentation` owns deterministic factual highlights/focus
  shared by web/HTML/PDF. Review source relationships are scoped/validated before
  the separate provider projection; ordinary MCP documents explicit chat consent.
- Shared Improvements review primitives and the existing Reports UI reuse current
  design tokens; `site/app/(site)/analytics` uses the public site primitives.

Released boundary (core 1.24.0, 10 November 2026): storage
`report-model-diagnostic-schema.ts` adds the nullable allowlisted operator code
through its own forward migration; `report-model-attempt-store.ts` keeps that code
outside the immutable receipt hash. Kind-specific evidence constraints in the
provider schema complement the unchanged canonical narrative validator. Model
failures preserve readable facts without another paid attempt. The API/worker
run the exact qualified `78783e7c` image; later evidence commits do not replace it.
Release and remaining external acceptance: `spec/smart-report-release-20261110.md`.

`apps/web/src/pages/improvements-page.tsx` owns the URL-selected Opportunities
and Weekly reviews panels, using shared Tabs primitives. Both browser and memory
routers register `/improvements/reviews`; the existing review section owns all
review loading, consent and permissions. Opportunity filter/selection state stays
in the page while inactive tab content and actions unmount.

`apps/web/src/components/system/resource-empty-state.tsx` composes the existing
Empty primitives for project/workspace/public resource lists and data panels.
`project-resource-empty-state.tsx` preserves the old component/type export as an
alias. Consumers own their scoped copy and existing action permissions; the
composition does not load data or grant capabilities.

Analytics UI: `AnalyticsSectionHeader` composes compact inventory actions and
`AnalyticsFilterPanel` owns the bounded desktop popover/mobile Sheet. Flow forms
use `DialogFormContent` with the existing schema and guarded writes. The nested
`analytics/bundles/new` route renders the same dialog shell over
`ProjectAnalyticsBundlesPage`, preserving its filter/pagination state and passing
the initiating link for focus restoration. `lib/analytics-presentation.ts` shares
system-label/category presentation without modifying transport or evidence.
`ProjectAnalyticsLayout` retains metric choices across tabs while exposing only
supported scope/time filters to inventory views and their generation defaults.

Smart Report rejection diagnostics: `smart-reports/model-diagnostics.ts` owns
allowlisted operator codes. `storage/report-model-attempt-store.ts` persists them
outside immutable receipt hashes; `report-model-diagnostic-schema.ts` supplies
the nullable forward migration and readiness gate. `report-presentation.ts`
shares fixed factual-fallback explanations across dashboard, HTML/PDF and email.
`smart-reports/model-narrative.ts` restricts provider-decoded highlight references
by claim kind while retaining the canonical schema and local safety validation.
`model-evidence.ts` applies mandatory privacy per bounded fact row; the model
client checks prose privacy before success and the content store rechecks it on
egress. `model-projection.ts` bounds AI-only caveats without changing canonical
facts. `report-scheduler-store.ts` resumes one overdue period before advancing
to a future delivery. Shared `report-presentation.ts`, `ReportRunStatus` and
`ReportEvidenceList` supply readable states, periods and project-labelled evidence;
the reports page owns history/settings layout and the report page bounds read-only
status polling with hidden/offline pausing, transient read recovery and automatic
canonical display. The reusable Notice pending variant supplies reduced-motion
loading feedback for generation and PDF preparation.
`ReportPdfDownloadButton` owns the user download intent, status reads and bounded
binary save through `report-api.ts`; the browser binary adapter strips the internal
authority marker and sends HttpOnly session cookies. `ReportRunStatus` uses the
shared Tooltip for focus/hover/tap details; history uses fixed column fractions in a horizontally scrollable table on all
screen sizes. Saved-report card actions wrap below their titles on phones. TableCaption provides standard internal bottom padding. CI includes all report database regressions in its isolated coverage shards and
requires PDF text extraction. The local `smart-report-coverage` target combines
real storage and adapter tests for the changed-file coverage gate.

Local report previews: `scripts/dev-mock/report-fixtures.ts` builds fictional
canonical facts and narratives with current UTC periods and the production
validators. `scripts/dev-mock/reports.ts` simulates scoped definitions, history,
recipients, allowance and run progression entirely in memory. The existing
loopback-only Vite middleware serves trusted HTML and bounded child-rendered PDF
downloads; it never proxies unsupported routes. Synthetic identity uses a valid
UUID consistently across session, ownership and preview management fixtures.

Local tier tooling: `scripts/dev-tier.sh` verifies local Docker/checkout identity;
`scripts/dev-tier.sql` atomically selects one unlinked organisation and sets a base
tier. `billing-admin-helpers.ts` respects explicit administrative Free rather than
applying the initial Team default. No API route or production configuration is added.

Business extension implementation boundaries (see `spec/business-tier.md` and STATUS.md):

- `packages/shared-types/src/billing-catalog.ts` and storage
  `billing-allowance-window.ts` own fixed offers and anchored monthly usage.
  Billing provider adapters own full-offer reservations, quotes, renewal scheduling
  and owner-contact synchronisation; API/browser adapters do not own that policy.
- `packages/auth/src/project-authorization.ts`, scoped member policy and storage
  actor-role services own effective permissions. Organisation management composes
  fixed people/invitation/transfer services under an organisation admission lock.
  SDK-only routes remain outside member authentication.
- `packages/referrals` owns validated receipt, discount and cash policy; storage
  owns immutable attribution/benefit/ledger/outbox and manual payout state. The
  independent financial worker performs external provider I/O outside locks.
- `packages/smart-reports` owns periods, canonical facts/output, model budgets and
  trusted renderers. Storage `report-*` modules own consented bounded collection,
  scope, admission, leases, artifacts, forecasts, retention and delivery receipts.
  `apps/worker/src/smart-report-runtime.ts` rotates PDF, generation and email in
  one independent serial lane; all workers share existing pools/object clients.
- `packages/report-client`, `organization-client` and `referral-client` serve API,
  CLI, ordinary MCP and approved dashboard components. Restricted agent catalogues stay frozen. The OpenAI report extension exposes
  list/read only through a distinct live OAuth report reader; existing grants and
  original tool schemas stay unchanged. Public site pricing/docs consume generated interface artifacts and fixed
  published offer data generated from the shared catalogue/capabilities, without
  importing server runtime modules.
- `storage/business-account-export.ts` supplies bounded private export sections;
  canonical report readers protect whole-scope document/HTML/PDF downloads. Account
  deletion clears report data and leaves protected financial obligations intact.
- Additive forward migrations and exact readiness precede consuming API/worker
  code. The private cloud companion owns Business-aware image/rollback guards,
  environment preparation and eventual separately authorised rollout.

Business trial selection reuses the existing signup/billing/CLI/MCP trial flow,
with a forward trial-plan constraint migration and database-deadline report fences.
Business-trial-aware immutable runtime/rollback images declare `business-tier-v2`.
The report-trial collection and self-hosted access forward migrations preserve
prior checksums. Browser sessions expose only a server-owned optional
`self_hosted` entitlement hint; live backend roles and token scope remain authoritative.

All implementation candidates remain local. Sales/generation/email switches
remain default-off; final combined qualification is recorded in STATUS.md.

Multiline exception release (6 November 2026): core 1.22.1 is live from
`8daab4acf3ca36c0c425aab455959c1bb7ae9a0d`. Java stderr assembly belongs to
the Java SDK; legacy continuation classification belongs to
`packages/event-normalizer`. Native exception routing and scoped duplicate
receipts belong to each SDK. Grouping, bundle schemas and notification delivery
retain their contracts. The hosted classifier was verified before Java 3.1.1
publication. DebugBundle API/worker and app/site now consume Node/Browser 3.2.1;
site 1.7.4 and canonical core/SDK releases are live and verified.

Swift 3.1.2 supports SPM and immutable Git CocoaPods sources. RN's Expo plugin
selects that Git source while preserving explicit consumer declarations and the
Swift >=3.1.1 floor; RN's Package.swift remains a test harness. RN 3.1.1 passes
public bare/Expo native delivery and npm registry gates. The Trunk-independent
distribution checklist is complete for these exact releases.
Exact release, runtime, rollback and adoption evidence:
`spec/multiline-exception-release-20261106.md`. Diagnosis and twelve-surface audit:
`spec/multiline-exception-capture.md`. Consumer products remain unchanged.

Diagnostic request boundary (3 November 2026, released): `doctor-command.ts` validates connected project scope before dispatch and limits its member-auth probe to one incident in that project. CLI/MCP/OpenClaw share the path. Tool metadata discloses the health/auth reads; native emitted and normal public-installed checks cover project/limit/auth, invalid scope and all 139 tools. CLI 1.18.2 and MCP/OpenClaw 1.18.3 pass source, artifact and exact security/runtime acceptance. See `spec/openclaw-runtime-scope-remediation-20261103.md`.

Earlier corrective server boundary (3 November 2026): CLI 1.18.1 and MCP
1.18.2 are verified public artifacts from 74ed1e8b. Developer pin adoption
preserves that implementation while advancing Codex/Claude/Gemini independently.
`check-openclaw-installed.mjs` supports explicit current-host, reviewed local-source
trust and normal capability-consent fixture options; none override remote install
security. Minimum and current host runtime/installed-byte proof both pass. Live
site and exact ClawHub acceptance are tracked in the remediation record.

Corrective release preparation (3 November 2026): owner authorised CLI 1.18.1,
MCP/OpenClaw 1.18.2, their applicable developer pin updates and site 1.6.12 with
the new verification article. `make openclaw-installed-check` adds normal archive
installation, real host runtime inspection and installed-byte/native-request
proof to mandatory preflight. Publication and live acceptance remain pending;
API/worker and language SDK releases are unchanged. See the current remediation
record for exact release evidence and remaining gates.

OpenClaw runtime and scope correction (3 November 2026, local candidate):
`apps/cli/src/local-retrieval-store.ts::resolveCloudIncidentProjectId` owns the
connected cloud-list default shared by CLI and MCP (and their OpenClaw projection),
with explicit project precedence and fail-closed missing connection scope. Local
selection stays separate. The OpenClaw build banner initializes native Node
`createRequire` for bundled CommonJS dependencies; `scripts/check-runtime.mjs`
inside the plugin package executes the emitted ESM through the real host SDK
against isolated loopback fixtures. `make openclaw-release-check` includes its
Node 22/24/26 matrix. No public schema, SDK, database or hosted runtime changes.
Release state is recorded in `spec/openclaw-runtime-scope-remediation-20261103.md`.

ClawHub follow-through (2 November 2026): MCP 1.18.1 is published to npm and the official Registry from immutable fbfdd394, with full source CI and installed native checks passing. ClawHub skill 1.18.1 is public with source-identical files and clean final review/moderation, but VirusTotal is missing and discovery passes 5/7 queries. Plugin 1.18.1 is accepted pending checks. The skill pins MCP 1.18.1 / CLI 1.18.0 and uses the supported 0.22.0 multipart publisher after 0.25.0 upload-ticket HTTP 500s; its accepted write appeared after the client timeout. Plugin inspection/publication stays on 0.25.0. Do not resubmit either accepted version. No core/SDK deployment or consumer adoption is included; see `spec/clawhub-publication-retry-20261101.md`.

Release integration (1 November 2026): deployed core API/worker and dashboard consume published Node/Browser 3.2.0 with shared-types 3.0.0/redaction 2.7.0; deployed site 1.6.11 consumes Browser 3.2.0. Developer packages pin published MCP 1.18.0. React Native main preserves its published 3.1.0 runtime with a documentation-only correction to the enforced Swift >=3.1.1 floor. Release verification reads the exact immutable official Registry version instead of a paginated historical search page. Smithery publisher retirement, owner-deferred ClawHub/OpenClaw acceptance and current distribution proof are recorded in `spec/bundle-evidence-quality-release-20261101.md`; consumer products are outside this rollout.

Billing safety (core 1.19.0): durable organization reservations coordinate Checkout and same-subscription Solo-to-Team upgrades with capacity changes. `packages/billing/src/` owns Stripe subscription/capacity and billing-email domain logic; API modules retain compatible adapters. Upgrades replace the existing base/add-on prices together, preserve purchased quantity, invoice prorations with `pending_if_incomplete`, and reuse one hosted invoice for required authentication or payment recovery. Prepared operations retain fixed parameters/idempotency and stop ambiguous replays before provider key expiry. Current-state webhook reads and subscription-identity fencing cover delayed events. `stripe-billing-period.ts` shares Clover item-first periods; `client-ip.ts` trusts only configured immediate peers. All four additive billing migrations must precede dependent runtime. Existing Stripe URLs and provider/account settings are not automatically changed. Hosted 1.19.0 is independently verified after the compatible-worker bridge: 63 migration checksums, active processing, exact source/SPA and retained bridge rollback. Local/test-mode payment proof and unresolved historic-data/provider matters remain separately qualified in STATUS.md. See `spec/billing.md`.

Billing domain boundaries: `packages/billing/src/stripe-{checkout,billing-period,subscription,subscription-upgrade,capacity,capacity-operations,webhook-emails}.ts` own provider orchestration and pure projections. Existing API module paths are compatibility exports; the API composes storage/provider dependencies and authenticated routes. Storage `billing-subscription-operation-{schema,store}.ts` owns immutable prepared commands, resource/completion fencing and the second additive migration. Provider settings and customer-account actions remain separately authorised operations.

Daily window ownership: `notification-daily-store.ts` shares a writable-window guard across new admission and rescheduling. Due claimed or completed windows cannot gain unseen items; fallback retains late items for the next daily window, while future policy-only claims remain open. Existing source lease fencing and allowance preservation apply before moving items.

Daily schedule UI: `daily-notification-schedule-fields.tsx` is shared by account/project notification editors, reuses weekly report hour options and responsive field layout, and preserves minute-level schedules through Custom time. The saved schedule and API/CLI/MCP contracts are unchanged.

Daily email rendering: `packages/email/src/index.ts` exports `renderDailyIncidentDigestEmail`, shared by `notification-daily-transport.ts` and the `daily-incident-digest` catalog entry in `packages/email/src/system-email-review.ts`. The dev-only review page and owner preview-send route consume that same catalog.

Web submission feedback: `apps/web/src/components/system/pending-button.tsx` owns request-specific spinner/busy presentation; `apps/web/src/lib/use-pending-action.ts` owns the synchronous in-flight guard for project/token/invite/probe creation. `DialogFormContent.busy` disables its close control for guarded dialogs. `NotificationSettings` composes the existing `CollapsibleCard` for project scopes and tracks Save/Pause/Resume separately.

Notification preference boundaries (released in core 1.18.0; migration 59 verified in production): `packages/shared-types/src/notification-preferences.ts` and `notification-schedule.ts` own schemas, precedence and DST; storage `notification-preferences-store.ts`, `notification-daily-{store,claims,usage}.ts`, `notification-delivery-service.ts`, `notification-legacy-delivery.ts`, `notification-account-data.ts` and `notification-schema.ts` own persistence, policy-aware batching, claims, lifecycle and forward migration. `packages/alert-client/src/notification-preferences.ts` is the pure shared interface client. API `routes/notification-preferences.ts`, CLI `notification-commands.ts`, MCP `notification-tools.ts` and dashboard `components/system/notification-{settings,pause-fields}.tsx` are adapters. Worker alert/weekly/delivery loops consume these services and reuse the email template. A separate in-process daily-email lane keeps large digests from delaying live alerts; no external service or scheduler is required. `alert-notification-history.ts` shares cooldown history across daily, short-digest and direct admission. `scripts/dev-mock/notifications.ts` adapts the same policy schemas for the opt-in in-memory settings preview.

Public status feature (shipped in core 1.16.0; current core 1.16.1 live): FR-AVC-07 adds opt-in project-anchored publication metadata and a safe aggregate projection. `public-status-store.ts` owns atomic same-owner/account selections and live ownership/eligibility checks; `public-status-projection.ts` owns sanitization and conservative freshness. Shared `availability-health.ts`/`availability-metrics.ts` preserve existing history behavior; `health-status-view.tsx` renders authenticated and public rows. `/status/:publicId` bypasses private providers, while Project Health manages title/selections/copy/preview. Five API operations, `health status` CLI and four ordinary MCP tools share the contract. Ordinary catalog has 134 tools; frozen hosted/restricted profiles stay 23/five. Migration `202610080001_add_public_status_pages` is additive and must precede runtime activation. See `spec/public-status-pages.md`, `rules/public-status-pages.md` and `spec/public-status-release-20261010.md` for production evidence.

Public status controls release (2026-10-10, core 1.16.1 live): the enable switch saves immediately through the existing settings endpoint. First enable creates the page with the validated form; later toggles preserve other drafts and use saved settings. Saving/failure states prevent competing changes and restore the saved switch on error. The copy input appears while publishing, and Preview status page focuses its heading without opening a tooltip. No API, domain or schema changes. Production evidence is in `spec/public-status-followup-release-20261010.md`.

Public status UI refinement (2026-10-09, owner-directed): Project Health opens publication settings with a toolbar button immediately left of Create health check, using the shared `dialog-form-content.tsx` modal with a scrollable body and fixed actions. Shared `components/system/multi-select.tsx` composes Radix/shadcn menus, search, controlled selections and pagination. `public-status-settings.tsx` loads on opening, owns publication draft/limits and a nested saved-preview dialog, discards unsaved edits on close and ignores late responses. Shared `read-only-copy-input.tsx` composes `ui/input-group.tsx` for labelled read-only URLs, a right-side copy icon and manual-copy fallback. Domain services and public interfaces are unchanged.

Public status theme/tooltip refinement (2026-10-10, owner-directed): `theme-init.ts` uses the existing public-route predicate to apply device color scheme before mount. `PublicStatusPage` owns a system-forced `ThemeProvider`; private routes keep their stored theme provider in `PrivateAppRoot`. Public themes never read/write dashboard preferences, listen to device changes and clean up on unmount. The footer reuses `BrandMark`. Shared `StatusHistoryStrip` disables hover corridors for plain-text daily details across authenticated Health Status, public pages and saved previews, preserving keyboard behavior and other tooltips. Domain/auth/schema behavior is unchanged.

Automatic local/self-host initialization uses `bootstrapStorageSchemaIfEmpty` through `db:bootstrap --if-empty`; populated schemas and ledgers remain untouched until `db:migrate` runs. API/worker dependencies retain migration-before-runtime ordering. Local `make dev` fails without resetting volumes. See NFR-SCHEMA-05 and `deploy/selfhost/README.md`.

> Previous interface parity release (2026-10-07): core 1.15.0, shared 2.3.0, CLI/MCP/OpenClaw 1.14.0 and site 1.6.2 are published and deployed. All fourteen audited gaps are patched, with existing dashboard patterns and the owner's Managing Noise edits retained. See [release evidence](spec/interface-parity-release-20261007.md) for exact sources, passing engineering/live runtime gates and external discovery limits. Public analytics flows shipped in 1.14.0; the expanded analytics candidate remains parked.

Public acquisition/activation flows are customer-project definitions with ordered origin-bound steps.
`packages/storage/src/analytics-flow-store.ts` owns versioned definitions, hashed expiring contexts,
single-use handoffs and aggregate increments; `analytics-flow-reports.ts` reads bounded daily counters.
`analytics-flow-schema.ts` supplies the additive migration and separate empty-schema bootstrap SQL.
API `routes/analytics-flows.ts`, CLI `analytics-flow-commands.ts`, ordinary MCP `analytics-flow-tools.ts`,
and the project Analytics Flows page share this contract. Ordinary project access replaces the discarded
operator-only candidate. No generic flow joins DebugBundle users, projects or incidents as business outcomes.

Browser SDK `analytics-flows.ts` exports the public headless helper. Same-tab sessionStorage preserves
context through a customer's dedicated auth origin and external OAuth return; integrations mark success
explicitly. Site→blog uses the same mechanism. Existing debug capture remains independent. DebugBundle's
own frontend SDK adoption/instrumentation belongs to the authorized release integration, using this same
public API. No public consent UI or marketing copy is changed. The general retention worker retains bounded
durable continuation; million-visit load testing is deferred by the owner.

# ARCHITECTURE MAP — DebugBundle

Alert-scope correction (core 1.22.0, deployed): storage `alert-scope-projection.ts` resolves bounded
accepted origin/service metadata in the requested view. `shared-types/alert-scope.ts`
validates the descriptor; the existing alert API, typed client, CLI and ordinary
MCP opt in without changing default response shapes or delivery matching. Web
`alert-scope.ts` and `AlertScopeSummary` share table/editor labels; `AlertRulesTable`
uses the existing table/actions. `AlertDeliveryFields` restricts instance choices
to the accepted origins. Browser scope refreshes attach matching metadata only
and never replace confirmed write fields. Production evidence and the remaining
marketplace gate are in `spec/alert-scope-release-20261105.md`.

Project/service consolidation shipped in core 1.21.0 and clients 1.19.1, tracked in
`spec/project-service-consolidation.md`. Storage `service-definition-schema.ts`
owns additive logical-service DDL, predecessor-writer linking and the ordered
forward migration. `project-merge-plan.ts` owns pure checked planning and stable
configuration-bound digests; storage snapshots are trusted domain inputs, never
client payloads. Existing `services.id` remains the public environment-instance
identity. `service-input-alias-schema.ts` owns origin input aliases and retained
project-view names. `project-merge-store.ts` owns durable reservations, leases,
cutover receipts and read-only verification; apply remains default-disabled.
API `routes/project-merges.ts`, the typed project-management client, CLI
`project-merge-commands.ts` and ordinary MCP `project-merge-tools.ts` share that
store. `project-read-scope.ts` constrains canonical,
legacy and credential-bounded reads, while `project-evidence-projection.ts` maps
metadata without changing original object paths. `project-ingestion-scope.ts`
resolves service names before persistence; API ingestion completion accounts for
each original namespace. Configuration/credential database guards serialize
cutover and `project-service-schema-check.ts` makes readiness fail closed for
missing/disabled scope fences. `project-adoption-manifest.ts` creates safe receipt
snapshots; `packages/project-adoption` owns bounded local file planning/apply and
preservation. Catalogue, retained-view pagination and downstream compatibility
adapters are implemented. `make project-service-runtime` qualifies installed
clients, SDK capture, worker restart, preserved S3 bytes and compatible API
restart on disposable infrastructure. Production release, retained-client reads,
served assets and the actual hosted candidate/active/stable image gate pass; see
`spec/project-service-release-20261104.md`. The owner-approved API/App/Site server
merge is complete under the retained API ID, named DebugBundle; its receipt and
separately qualified runtime checks are in `spec/project-service-live-20261104.md`.
The cloud stack's published `project_merges_enabled` input passes a validated
preserve/true/false selection to `hosted-image-rollout.sh`, changing the candidate
env through the existing rollout. Default/omitted selection preserves the flag.
Workflow `41909113370` activated hosted merging. Repository adoption and fresh
canaries were excluded from this server exercise.
The cloud stack workflow's optional `deploy_assets=false` keeps current frontend
assets during the first compatible API/worker stage; the default complete rollout
publishes the aligned app/site after client qualification.
See FR-PJS / AC-PJS and `spec/project-service-operations.md`.

Setup guidance is owned by CLI `agent-interface-guidance.ts` and embedded through
`local-scaffold.ts`; the sync script keeps five skill sources aligned. The site's
`agent-install-prompt.ts` shares its prompt across installation entry points.
The 5 November clarification of project reuse is authorised for release;
`connect-command.ts` still matches a slugified profile name.

`project-rule-access.ts` shares the accepted origin predicate between immediate,
short-digest and daily notification storage. `notification-daily-store.ts` keeps
original item/accounting namespaces but resolves membership and preparation policy
revisions through the canonical project.

`service-observation-schema.ts` reserves exact diagnostic/analytics service names
even before incident grouping creates an environment instance. Its forward
backfill and writer triggers preserve historical nullable service attribution.
Evidence-context and browser-recovery readers/locks resolve retained names only
within one origin. Improvement persistence now separates the public store facade,
types, shared helpers, canonical reads and original-namespace bundle metadata;
`improvement-opportunity-recording.ts` retains historical event/fingerprint dedupe.
`metadata-probes.ts` retains its public facade; `metadata-probe-read.ts` owns
credential-bounded SDK directives and manager inventory, while
`metadata-probe-write.ts` owns fenced admission/current membership and preserved
SDK signing identity. `project-probe-schema.ts` owns activation snapshots, lineage,
immutable scope and combined limits. `metadata-probe-signing.ts` selects exact
deployed token/name context; auth primitives isolate broader snapshot keys.
`project-rule-scope-schema.ts` and `project-automation-service-schema.ts` own saved
rule snapshots and filter-name contexts. Webhook/GitHub management, worker delivery
and record/type modules keep their original public facades.
`project-weekly-report-schema.ts` and `project-weekly-report-convergence.ts` retain
equivalent schedule identities and accepted delivery scopes. Weekly claim history
is fenced, and the worker keeps original IDs when retrying accepted origin work.
Notification/improvement policy reads use canonical ownership.
`availability-check-management-store.ts`, `project-health-service.ts` and
`project-health-schema.ts` own canonical management/original health execution
lineage. Public status selection keeps original anchors/check IDs under ordered
origin locks. `project-namespace-deletion.ts` owns complete-set deletion and its
internal storage-origin handoff; `account-deletion-store.ts` keeps account cleanup
transactional. Membership changes fence current roles and clean imported owned
automation. Analytics metrics queries/read helpers preserve origin namespaces;
`project-analytics-schema.ts` snapshots funnel and accepted generation scope.
`project-merge-service-inventory.ts` bounds bytes before loading historical names.
`routes/project-merges.ts`, `project-management-client/project-merges.ts` and the
CLI/MCP merge adapters expose the shared checked engine. Server apply is disabled
by default. `project-adoption-manifest.ts` snapshots secret-free service context;
`packages/project-adoption` owns one-root file planning, hash guards, atomic
replacement and conditional rollback. CLI adoption performs read-only server
preflight. Shared profile/connection schemas retain the existing CLI export paths.
Shared canonical text ordering makes plan hashes locale-independent. The GitHub
matching reader resolves registered service repositories for new rules without
rewriting accepted delivery destinations.
SDK-family qualification is tracked in
`spec/project-service-sdk-compatibility.md`; no SDK distribution has changed.

CocoaPods distribution (6 November 2026): Swift's `Package.swift` owns native
SPM products, and immutable Git-tag pods provide an independent installation
source. `publish-cocoapods.yml` treats Trunk as a separately selected channel.
RN's packaged `native-pod.js` and Expo plugin insert the Git pod declaration
without replacing an explicit consumer source; the wrapper reuses Swift and
Android SDKs. RN's `Package.swift` remains a stubbed test harness.
`spec/cocoapods-trunk-transition.md` owns the exact public-consumer release gates.

React Native candidate boundaries (29 October, unpublished): `safe-error-fields.ts`
shares accessor-free primitive error reads between redaction and
`exception-evidence.ts`. `canonical-schema.ts`, `owned-json.ts` and
`evidence-wire.ts` validate full canonical hook replacements using the generated
embedded schema. `evidence-controller.ts` owns complete-path proof and revocable
synchronous scopes; `diagnostic-budget.ts` accounts metadata plus pending native
bridge ownership and rechecks hook time/source association. Both native wrappers
forward evidence options/proof through existing config/status RPCs. The Swift
external-event parser accepts a missing private-carrier device placeholder and the
existing worker hydrates only device-bearing event types. The iOS wrapper's optional
`enqueueCanonicalEventJson` RPC bounds bytes/depth before JSON decoding, avoiding
TurboModule's removal of nested nulls; JavaScript prefers it and retains older
object/legacy carriers. Android's service serializer keeps
unknown runtime absent without changing public Kotlin constructor/copy signatures.
These are candidate implementation boundaries; final artifact/device qualification
is recorded in STATUS.md.

WordPress candidate boundaries: `CachedConfigFetcher` separates endpoint/token-scoped
capability proof from the capture-policy expiry. `RelayEvidencePolicy` intersects
proof, local options and current project policy before admission/forwarding/replay.
`RelaySpool.writeBatches` retains all protected byte-bounded chunks before browser
acknowledgement; `RelayForwarder` preserves indexed retry semantics within one
forwarding deadline. `debugbundle_evidence_options`, `debugbundle_sdk_ready` and
the browser SDK global expose explicit recovery without new admin UI.

Incident read recovery (released core 1.19.3/site 1.6.10, 2026-10-24): `lib/session.tsx` owns deduplicated initial-read retry and distinguishes unavailable session data from confirmed sign-out. `components/system/load-error-callout.tsx` composes the existing callout/pending-button pattern for both session and billing reads. `pages/use-billing-checkout-sync.ts` owns the extracted cancellation/revision-fenced read and existing Checkout-return reconciliation, retaining Checkout context after read failure; `billing-page.tsx` preserves its helper exports. Stable label elements in PendingButton/auth submit keep translated text outside conditional-icon DOM operations. Private-cloud viewer-request rules canonicalize repeated/raw-backslash separators before same-origin static-site redirects. No schema, payment-domain or public API/CLI/MCP interface changes are introduced.

Maintenance release (2026-10-23, core 1.19.1/site 1.6.8): `apps/api/src/client-ip.ts` rejects missing/non-string peers in the exact immediate-hop proxy callback; `apps/web/src/pages/billing-page.tsx` composes the existing purchase notice only while shared eligibility produces a future unlock time. In the site companion, `src/components/product-cta.tsx` owns reusable CTA copy/actions and theme-aware presentation, mounted once after article content by `app/(blog)/blog/[...slug]/page.tsx`. No new schema, domain service or public interface is introduced. See `spec/maintenance-release-20261023.md` for deployment identities and evidence.

Local UI fixtures live in `scripts/dev-mock/`: synthetic base records, rolling dates,
filtered pagination and in-memory mutation simulation. `management.ts`, `billing.ts`
and `analytics.ts` cover dashboard management/provider fixtures, local billing
simulation and analytics definitions/reports/artifacts respectively.
`public-status.ts` owns ephemeral publication metadata and paginated
choices, delegating safe output to the production `public-status-projection.ts`.
Workspace fixtures and fixture/new project/check IDs are UUIDs for strict client/form parity.
Mock credentials are invalid and provider/checkout navigation stays local. `apps/web/dev-mock-plugin.ts`
is the opt-in development middleware adapter; `vite.config.ts` excludes it from builds
and disables real API routing/telemetry in mock mode. `make dev-mock` recreates only
the loopback-bound web container. No runtime API, storage or worker domain path changes.

`scripts/dev-mock/billing-offers.ts` extends the retained legacy billing fixtures
with all paid tiers/intervals, exact synthetic quote confirmation, local checkout,
scheduled changes and simulated renewal/cancellation. Private simulator schemas
and controls live in `apps/web/src/dev/billing-preview-*`; the dev-gated lazy wrapper
is stripped from production. `/v1/__dev/billing` exists only in the loopback Vite
mock adapter. It changes fixture memory, never entitlements in real storage.

> Module boundary map for agent navigation.
> If this file conflicts with `/spec/architecture.md` or `/contracts/*`, those win.

SDK safety work spans the independent repositories under `sdks/`. `contracts/sdk-interface.md` §1.1 and `FR-SDK-19b` govern compatibility and hook/filter order; `AC-SDK-SAFETY-FILTER/CALLER` govern caller and queue behavior. Existing worker alert/delivery stores own bounded direct-group membership and retry ownership through additive migrations. Preserve distinct incident identities and signed lifecycle webhooks; no separate notification service or generic grouping package is introduced.

Java's existing worker owns weak Throwable inspection, protected admission and delivery. Android and Swift use their bounded delivery queue and deferred-capture helpers to keep persistence, hydration and overridable exception inspection off capture callers while preserving offline/ACK behavior. Python `delivery_hooks.py` reconciles final policy and byte ownership; built-in descriptors bypass custom exception metadata methods. Go `delivery.go` owns its bounded sender and pressure state. Ruby reserves held batches and cached replacements. .NET retains transport ownership by object identity so valid replacement IDs remain supported; deferred capture helpers project weak exception/logger references and configured sampling on its existing sender. Privacy traversal accepts standard bounded primitive containers and omits arbitrary custom enumerators/properties.

In the JavaScript companion, Node `delivery-hooks.ts` finalizes reserved batches; Browser `event-transport.ts` owns bounded deferred preparation, combined queued/sender retention, shared lifecycle byte reservations, bounded flush waiting and ACK/retry reconciliation. `fetch-transport.ts` caps Retry-After; built-in direct transport requires canonical acknowledgements while custom/legacy compatibility remains explicit. React Native's synchronous preparation helper returns only the protected final canonical/legacy wire representation before awaiting the native bridge. Application hooks run after capture returns, on the JavaScript event loop, with explicit callback responsibility. The major-3 migration guides document changed timing. Root `privacy-js-candidate-check` qualifies both SDK archives against exact independently versioned core archives; WordPress `check-staged-release.py` consumes those archives and the PHP ZIP, and `smoke-browser-asset.mjs` executes the extracted IIFE with actual PHP-generated configuration before installed WordPress smoke.

Backend acknowledgement helpers enforce strict canonical responses when the selected transport is SDK-owned HTTP; custom/file transports retain explicit legacy fallback. Node tracks its HTTP closure by weak identity; the other backend clients recognize their built-in HTTP transport type. Retry scheduling caps transport hints before deadline arithmetic, and PHP's `Transport/RetryAfter.php` owns numeric/date parsing. No public transport response type or event schema changes.

Native retry scheduling stays within the existing delivery workers: Android bounds custom durations before millisecond deadline arithmetic; Swift rejects nonfinite hints before computing a `Date`. PHP validates the wire errors-list shape before associative JSON decoding can erase the object/list distinction. React Native and WordPress adopt these corrections through their native/PHP dependencies after the patches are published.

PHP's `DebugBundleSdkQueueSupport.php` owns bounded admission and the single request-end selection; `DebugBundleSdk.php` owns capture, explicit synchronous flush, hooks, and authenticated remote-policy application. PHP SDK 2.0.2 substitutes the throwable class for empty messages before hooks/suppression. `DebugBundleSdkEventSupport.php` owns request/runtime projection, including canonical JSON object maps for absent request context. WordPress 2.0.3 bundles PHP SDK 2.0.2 and Browser SDK 3.0.3. Its `SdkBootstrap.php` binds PHP capture to request lifecycle, while `CachedConfigFetcher.php` reads only endpoint/token-hash-scoped transient policy on visitor requests and WP-Cron invokes `ConfigFetcher.php` for short authenticated remote refreshes. Both WordPress publication workflows assemble, checksum and installed-smoke the exact ZIP before publishing; the downloaded WordPress.org artifact also passed a clean installed smoke. This is the approved best-effort PHP exception to the otherwise nonblocking SDK rule, not a claim of asynchronous delivery. Consumer-product and installed-site mutations require separate explicit consent under `rules/release-governance.md`.

`scripts/incident-recovery-check.py` owns disposable Docker orchestration for the real API/worker recovery exercise; `scripts/incident-recovery-check.mjs` owns its synthetic HTTP workload and storage/artifact assertions. Neither is a production service. Reviewer fixture seeding disables synthetic health execution while preserving retained review evidence. Hosted Redis persistence activation and existing-volume preservation are private-cloud operator responsibilities.

Restricted agent evidence ownership: `packages/auth/src/primitives.ts` owns the separate `dbundle_agent_` validator; `packages/storage/src/agent-token-store.ts` owns hashed credential lifecycle and live issuer/project resolution, backed by an additive migration and readiness table requirement. `apps/api/src/routes/agent-tokens.ts` authorizes owner/admin lifecycle, while `agent-evidence.ts` enforces a separate project-bound read path and delegates only four incident reads to the bounded hosted projector. `packages/agent-read-client` reprojects and bounds responses for `apps/cli/src/agent-read-command.ts` and the five-tool `apps/mcp/src/agent-read-catalog.ts` profile. The ordinary member catalog and hosted OAuth catalog retain their different permissions; no agent token is converted to a member principal. Private cloud deploys must migrate before the new API starts and avoid issuing credentials to mixed replicas.

Resource incident ownership: `packages/shared-types/src/browser-resource*.ts` owns deterministic identity, the curated provider catalog (`browser-resource-providers.ts`), hidden/incomplete speculative-load evidence, explicit resource controls with exact-fingerprint fallback, origin and Bundle v1 evidence schemas. `capture-rule-suggestion-matching.ts` detects matching rules including the legacy resource scope without rewriting stored policy; `capture-rule-schemas.ts` and `capture-rule-evaluation.ts` own exact lifecycle/target predicates and the mixed-SDK server-only guard. `packages/event-normalizer/src/fingerprints.ts` owns v2/v3 hashes and grouping fields. `processor-shared.ts` creates hashed session/page burst notification keys, `processor-group.ts` carries their optional ten-second window, and `processor-alerts.ts` applies it only to immediate channels while email retains every digest item. `processor-bundle-context.ts` loads bounded same-session/trace request candidates through `metadata-bundles.ts`; `bundle-engine/src/browser-resource-context.ts` adds optional interruption/recovery evidence and prioritizes actionable recovery failures. Workers still carry optional title/route metadata into `metadata-grouping.ts`, and `metadata-bundles.ts` reads bounded SQL route summaries. `BrowserResourceDetails` renders the compatible context with existing dashboard primitives. Shared UI matcher copy serves suggestions and project settings. CLI state parsing lives in `local-processing-state.ts`; storage bundle contracts and incident bootstrap SQL live in `bundle-types.ts` and `storage-bootstrap-incident-statements.ts`. Browser SDK origin evaluation lives in the JS companion's `resource-origin.ts`.

`packages/event-normalizer/src/incident-title.ts` owns the shared bounded display-title selector; worker grouping, the ingestion metadata service, and local CLI processing call it without altering fingerprint inputs. `apps/web/src/pages/incident-detail-page.tsx` bounds existing and new stored titles visually using the established two-line title style.

---

The direct alert retry path stores the durable evaluation job ID on `alert_deliveries` through forward migration `202609250001_add_alert_evaluation_owner`. Only that job can retry a pending/failed send; separate occurrences may attach group membership without acquiring delivery ownership. The nullable additive column preserves historical rows and is included in migration/readiness gates.

The final transport audit also keeps response retry parsing in each SDK transport and deadline arithmetic in its delivery owner. Swift validates ACK count bounds before arithmetic. Java `EventDeliveryWorker` hands contended-close cleanup to the lock owner after release and ignores late delivery completion; `TransportFactory` passes configured ingestion timeouts into `HttpTransport`, bounded at 60 seconds. Go's HTTP response cap rejects overflow instead of exposing truncated ACK bytes. These corrections do not add caller work, public APIs or installer configuration.

## Module Dependency Graph

Licensing boundary: public product modules, SDKs, shared libraries, tools, and
plugins are Apache-2.0. Service-required artifact exceptions are WordPress
(GPL-2.0-or-later) and the portable ClawHub/Smithery skill (MIT-0). Private
`debugbundle/site` owns website implementation and branding; private
`debugbundle-cloud` owns hosted operations. The product dashboard remains public.
Published docs and generated references remain Apache-2.0; public builds require
no private repository. See `spec/licensing.md` for paired documentation changes.

```
                    ┌──────────────┐
                    │ shared-types │  (Zod schemas, TS types, constants)
                    └──────┬───────┘
                           │ imported by everything
          ┌────────────────┼────────────────────────────┐
          │                │                            │
    ┌─────▼─────┐    ┌─────▼──────┐              ┌──────▼─────┐
    │ redaction │    │    auth    │              │   email    │
    └─────┬─────┘    └─────┬──────┘              └──────┬─────┘
          │                │                            │
    ┌─────▼──────────┐     │                            │
    │event-normalizer│     │                            │
    └─────┬──────────┘     │                            │
          │                │                            │
    ┌─────▼──────────┐     │                            │
    │retrieval-client│     │                            │
    └─────┬──────────┘     │                            │
          │                │                            │
    ┌─────▼─────────┐      │                            │
    │ bundle-engine │      │                            │
    └─────┬─────────┘      │                            │
          │                │                            │
    ┌─────▼─────────┐      │                            │
    │ repro-engine  │      │                            │
    └─────┬─────────┘      │                            │
          │                │                            │
          └───────┬────────┘────────────────────────────┘
                  │
    ┌─────────────▼──────────────────────────┐
    │              Apps Layer                │
    │ api  │  worker  │  cli  │  mcp  │ web  │
    └────────────────────────────────────────┘
```

**Hard rule:** Apps import packages. Packages never import apps. Packages never import each other circularly.

---

Codex developer distribution lives in `plugins/debugbundle-codex/`, registered by `.agents/plugins/marketplace.json`. It bundles a workflow skill and the pinned stdio MCP server with the opt-in `--local-auth` profile, reusing existing CLI/member auth and local/connected tools. The hosted OpenAI plugin remains an independent read-only distribution. Its 1.0.1 skill candidate checks the separately authenticated CLI for explicitly authorized changes, with scoped reads and post-write verification; the frozen MCP catalog remains read-only. See `spec/openai-plugin-cli-handoff.md`. All distributed skills embed the shared CLI-first section from `apps/cli/src/agent-interface-guidance.ts`; `make agent-guidance-check` guards parity. Future agents follow `contracts/agent-interface-routing.md`. `tests/contracts/codex-developer-plugin.test.ts` guards package/release alignment; `scripts/smoke-codex-plugin.mjs` validates a disposable real Codex installation. See `spec/codex-developer-integration.md`.

Gemini CLI developer distribution is sourced from `plugins/debugbundle-gemini/`. Gemini's root `gemini-extension.json` points at the same published local-auth stdio MCP package, sets the process directory to `${workspacePath}`, and discovers the bundled skill. `scripts/package-gemini-extension.mjs` validates and emits a standalone root-layout archive; `scripts/verify-gemini-publication.mjs` compares the public repository's tracked files and version tag with core source. `scripts/smoke-gemini-extension.mjs` installs its extracted contents; `scripts/gemini-smoke-session.mjs` supplies recorded responses to exercise Gemini's real tool scheduler, local evidence, project-skill activation, and synthetic auth without a model API request. Core owns this source and its release checks; `debugbundle/debugbundle-gemini` owns public Git installation and gallery discovery. No domain service or hosted OAuth dependency is added. See `spec/gemini-developer-integration.md`.

## Package Boundaries

The private site's `content/docs/mcp/codex.mdx`, `content/docs/mcp/claude-code.mdx`, and `content/docs/mcp/gemini.mdx` own the dedicated agent setup guides. `src/content-source.ts` registers them under MCP; the shared route pipeline supplies their canonicals, sitemap entries, search indexing, and redirects. The Claude Code plugin remains under `apps/mcp/claude-code/debugbundle`, registered by `.claude-plugin/marketplace.json`, and uses the published MCP local-auth profile without changing default MCP schemas. `make claude-plugin-smoke` validates native installation/removal and synthetic authentication.

> **Note:** `shared-types` and `redaction` are maintained in this core repository and published for the separate JS SDK monorepo (`github.com/debugbundle/debugbundle-js`) to consume. `sdk-node` and `sdk-browser` live in that companion repository. See the "JavaScript SDK Monorepo" section below.

### `packages/shared-types` _(core-owned)_

- **Candidate schema migration:** `src/json-schema.ts` owns native Zod 4 input
  export for OpenAPI, MCP/OpenClaw, site artifacts and native wire fixtures. It
  preserves advertised closure/defaults and inlines reusable shapes for the native
  validators' closed vocabulary. Shared-types 3.0 exposes Zod 4 schema APIs;
  dependency order and compatibility are in `spec/zod-v4-migration.md`.

- **Evidence candidate:** shared `exception-evidence.ts`/`evidence-bounds.ts` own bounded graph/UTF-8 rules; `stack-frames.ts` interprets normalized text independently of fingerprinting; `diagnostic-context.ts`/`bundle-evidence.ts` own typed scope, recovery, resource and provenance shapes; `evidence-capabilities.ts`/`evidence-emission.ts` own strict path proof and downgrade; `evidence-interpretation.ts` supplies shared reader facts and guidance. `spec/bundle-evidence-quality.md` owns the candidate contract and rollout gates. Receiver/worker/local implementations and every maintained SDK have qualification recorded in STATUS and the release handoff; the owner-authorised dependency-ordered release is in progress.
- **Evidence paths:** API `evidence-negotiation.ts` adapts opt-in discovery on existing requests; worker `processor-evidence-context.ts` loads scoped retained objects using immutable receipts. Storage `evidence-ingestion-receipt.ts` claims evidence identities before future-time admission or raw writes without adding receipt queries to ordinary ingestion. `evidence-context-{schema,store,reader,retention}.ts` owns the additive migration, hashed correlation locks/index, durable rebuild intents and cleanup tombstones. CLI `local-diagnostic-context.ts`, `local-processing-files.ts` and `local-bundle-artifacts.ts` persist first receipts and protected payload hashes outside rebuildable state, and rebuild artifacts without lifecycle changes. Bundle `error-context.ts`, `occurrence-context.ts` and `diagnostic-evidence.ts` preserve selected-primary measurements and deterministic recovery/provenance. Dashboard `incident-evidence-reader.tsx` composes existing controls; `mcp-core/evidence-summary.ts` separately allowlists restricted summaries. Python splits native snapshots/wire validation, proof/HTTP, operation/scope leases, diagnostic budgets, recovery capture and flush delivery into their owning modules; `canonical_event.py` owns native JSON and interprets the vendored runtime
  `event-envelope.schema.json`; `ingestion_wire.py` provides the exact native
  serializer, optional-evidence fitting and ordered byte prefixes/chunks.
  `flush_delivery.py` retains finalized tails outside capture locks;
  `relay_delivery.py` includes server credentials, a shared monotonic deadline
  and exclusive markers after complete canonical acceptance. Public imports
  remain unchanged.
- **PHP canonical/wire candidate:** `OwnedJson.php` bounds native-only copies; `CanonicalEventSchema.php` interprets and projects the vendored `event-envelope.schema.json`, preserving empty-map JSON semantics. `BeforeSend.php` distinguishes invalid fallback from exhausted validation; `DebugBundleSdkEventBoundary.php` revalidates post-privacy shapes before policy. `IngestionWire.php` owns final serializer bytes and prefixes/chunks; `HttpTransport.php` supports a shared native deadline. `RelayForwardTransport.php` counts server credentials and separately reports accepted versus completely acknowledged delivery; `RelayFileTransport.php` creates exclusive private completion markers. Fatal first capture retains trusted SDK map shapes without loading the schema interpreter.
- **Java evidence candidate:** core `OwnedJson.java` and `JsonValidationBudgetExceeded.java` own final hook results; `CanonicalEventSchema.java` reads the packaged `com/debugbundle/sdk/event-envelope.schema.json`. `EvidenceWire.java` adds UTF-8/graph/scope/resource refinements and `CanonicalJson.java` counts the accepting JSON form. `BeforeSendProcessor.java` uses these boundaries while `DefaultDebugBundleClient.java` withholds failed post-hook privacy without restoring pre-hook content. `ExceptionSnapshot.java` retains native cause/suppressed evidence; `ReportedExceptionEvidence.java` parses retained stderr and `ExceptionEvidenceBudget.java` reduces optional metadata. `OperationContext.java`, `DiagnosticCaptureBudget.java` and `EvidenceController.java` own revocable execution and pending diagnostics. `RemoteConfigManager.java` owns the existing polling worker; `EvidenceDeliveryState.java` and `EvidenceProtocol.java` share proof/ACK/DTO primitives with web relays. `IngestionWire.java` counts actual native request bytes. `BoundedHttpResponse.java` is the common native reader; `RelayHttpForwarder.java` shares a forwarding deadline and complete-ACK proof across chunks. Whole-phase acceptance is tracked in STATUS and the release handoff.
- **Ruby producer candidate:** `client_exception_support.rb` retains legacy capture ownership; `exception_evidence.rb` derives bounded native locations/causes from scalar snapshots. `evidence_value.rb`, `evidence_json.rb`, `evidence_wire.rb`, `evidence_graph.rb` and `evidence_resources.rb` own native-only DTO, byte and semantic boundaries. `canonical_event_schema.rb` interprets the vendored `event-envelope.schema.json`; `before_send.rb` adds canonical conditional identity refinements. `operation_context.rb` and `framework_operation.rb` scope Rack/Sidekiq metadata; `diagnostic_budget.rb` shares bounded pending/metadata ownership. `client_evidence_support.rb` gates capture and hook replacement; existing queue/process modules release ownership on ACK, drop, close, fork and disposal. `event_batch.rb` bounds actual outgoing JSON; `bounded_http_response.rb` bounds existing ingestion/config replies. `relay/handler.rb` validates protected DTOs and `relay/forwarder.rb` chunks after server metadata expansion, retaining the spool until complete canonical acceptance. Whole-phase acceptance is tracked in STATUS and the release handoff.
- **Outgoing body budgets:** shared `EVENT_INGESTION_MAX_BODY_BYTES` retains the existing 256 KiB receiver limit; `EVENT_ENVELOPE_MAX_WIRE_BYTES` reserves wrapper overhead. `ingestion-wire.ts` fits owned, protected primary events without discarding legacy custom reference data. Browser `transport-lane.ts` owns admission/byte selection and `event-transport.ts` owns delivery and chunk-local reconciliation. Node `wire-batch.ts` returns finalized tails to its existing buffer and splits relay batches; `relay-evidence.ts` owns server-metadata fitting, downstream ACK/proof and a whole-batch deadline. Ruby `event_batch.rb` owns equivalent wire measurement and relay splitting. Local files retain their existing admission semantics. Maintained native senders/relays implement the same final-body budget through their language-specific wire owners; exact qualification lives in the release handoff.
- **SDK change governance:** `rules/sdk-capability-parity.md`, linked from `AGENTS.md`, `contracts/sdk-interface.md` and `rules/sdk-testing-strategy.md`, requires an applicability/evidence review across every maintained SDK and its relays, wrappers and bridges whenever SDK behaviour or evidence changes. Shared schemas and conformance fixtures remain core-owned; implementations remain in their companion repositories.
- **Producer candidates:** JS `exception-evidence.ts`, `operation-context.ts`, `evidence-controller.ts`, `passive-resources.ts` and `relay-evidence.ts` own native/retained snapshots, lifecycle, passive browser DTOs and path intersection. PHP `ExceptionEvidence.php`, `EvidenceWire.php`, `DiagnosticCaptureBudget.php`, `OperationContext.php`/`OperationState.php`, SDK evidence/boundary traits and `RelayEvidencePath.php` own the equivalent safe PHP producer/relay paths. `scripts/sync-evidence-fixtures.ts` generates canonical accepting wire fixtures; native fatal, installed-package and FPM smoke runners stay in the PHP companion. These are unreleased implementations, with other SDKs and whole-phase qualification still pending.
- **Owns:** All Zod schemas, TypeScript type exports, enums, constants, **tier capabilities config**, **event class enum**, **capture policy types**, **capture rule types and suggestion logic**, **improvement settings types**, **AnalyticsEventEnvelope** and **AnalyticsBundleV1** schemas, and the canonical preset-aware plus status/path-override-aware request-failure classifier used by ingestion, workers, and SDKs
- **Exports:** `BundleV1Schema`, `BundleV1`, `EventEnvelopeSchema`, `EventEnvelope`, `AnalyticsEventEnvelopeSchema`, `AnalyticsBundleV1Schema`, `createEventEnvelope`, `TIER_CAPABILITIES`, `getTierCapabilities`, `TierName`, `TierCapabilities`, `EventClass`, `CapturePreset`, `CapturePolicy`, capture-rule schemas and evaluators, event payload schemas, `DeviceInfoSchema`, `ContextDeviceSchema`, DB row types, API request/response types, webhook payload types, profile schema, severity enum, signal type enum, all context-block sub-schemas
- **Depends on:** nothing (leaf package)
- **Test fixtures:** `__fixtures__/` for canonical schema samples

### `packages/redaction` _(core-owned)_

- **Owns:** Sensitive data detection and scrubbing logic
- **Exports:** `redact(payload, rules)`, default rules, custom rule builder
- **Depends on:** `shared-types`
- **Invariant:** Must redact passwords, auth headers, cookies, card numbers, SSN, custom patterns

### `packages/auth`

- **Owns:** Password hashing, session issuance/revocation, verification flows, token generation, hashing, validation, middleware factories, and the official OpenAI OAuth/OIDC profile
- **Exports:** Existing member/project/session helpers plus OpenAI issuer/resource constants, OIDC provider configuration, metadata, and access-token verification
- **Depends on:** `shared-types`
- **Invariant:** Member/project tokens stored as SHA-256 hashes. Plaintext returned once at creation. Project tokens may carry optional `allowed_origins` for direct/static browser ingestion abuse reduction, enforced by project-token API routes after token authentication. SPA auth uses first-party cookie sessions rather than browser-stored bearer auth.

### `packages/mcp-core`

- **Owns:** Transport-neutral OpenAI MCP descriptors, strict input/output schemas, deterministic redacted projections, health URL sanitization, safe result envelopes, and injected read-only handler composition
- **Exports:** `OPENAI_MCP_TOOLS`, schema/descriptor types, `createOpenAiHostedMcpHandlers()`, and projection helpers
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** Exactly twenty-three tools; no filesystem/CLI auth/runtime access; no import from an app; no mutation/regeneration/queue operation reachable from the handler factory. Nine analytics readers are aggregate-only and cannot query retained journey samples or AnalyticsBundle generation state.

### `packages/event-normalizer`

- **Owns:** Raw event validation, normalization to canonical form, fingerprinting, **event class classification**
- **Exports:** `validateEvent()`, `normalizeEvent()`, `fingerprint()`, `classifyEvent()`
- **Depends on:** `shared-types`, `redaction`
- **Internal structure:** `index.ts` owns canonical normalization/classification and remains the public barrel; `mobile-event-compatibility.ts` owns the bounded, deterministic conversion of wire shapes emitted by installed Android/Swift `1.1.x` clients plus scalar/list probe object-wrapping; `java-event-compatibility.ts` owns the exact identity-and-shape-gated conversion of the legacy runtime-memory object emitted by installed Java releases through `1.3.0`. Unrelated SDK identities and extended malformed shapes remain on the strict validation path.
- **Invariant:** Fingerprint is deterministic. Same failure → same fingerprint. `event_class` assignment is deterministic and immutable after normalization (INV-15), including preset-aware request-event classification when worker jobs carry the resolved capture preset from ingestion.

### `packages/bundle-engine`

- **Owns:** Deterministic bundle assembly from normalized events + incident context
- **Exports:** `buildBundle(incident, events, context): BundleV1`
- **Depends on:** `shared-types`, `storage`
- **Internal structure:** `index.ts` owns deterministic bundle orchestration and backend/request/runtime context; `frontend-context.ts` owns deterministic frontend exception, breadcrumb, opaque-browser-error, and first-application-frame projection while preserving the existing barrel entrypoint.
- **Invariant:** Same inputs → byte-identical output. No random IDs, no wall-clock timestamps.
- **Runtime wiring:** Consumed by `apps/worker` `build-bundle` stage for persisted bundle artifacts.

### `packages/analytics-bundle-engine`

- **Owns:** Deterministic AnalyticsBundle artifact shaping from already-selected aggregate metrics, opportunity evidence, journey patterns, explicitly ranked representative journeys, linked incidents/deploys, and recommendations
- **Exports:** `buildAnalyticsBundle(input): AnalyticsBundleV1`, `stableSerializeAnalyticsBundle(value)`
- **Depends on:** `shared-types`
- **Invariant:** Same normalized analytics inputs → byte-identical output. Explicit representative-journey ranks are ordered before lexical ties; no random IDs, wall-clock generation timestamps, or raw analytics event storage.
- **Runtime wiring:** Planned worker generation will call this package after storage/domain services select bounded aggregate/sample inputs, then persist the gzipped artifact to S3-compatible storage.

### `packages/repro-engine`

- **Owns:** Reproduction artifact generation from bundles
- **Exports:** `buildReproduction(bundle): ReproductionArtifact`
- **Depends on:** `shared-types`, `bundle-engine`
- **Invariant:** Confidence field always explicit (`high`/`medium`/`low`).

### `packages/email`

- **Owns:** Email template rendering and sending abstraction
- **Exports:** Weekly report email rendering, billing lifecycle email rendering (purchase confirmation, renewal, payment failure, entitlement downgrade, plan/capacity changes), operational email rendering (webhook auto-disable, allowance thresholds, retention rotation), plus transport adapters
- **Depends on:** `shared-types`
- **Adapter:** Transport adapters remain behind the same abstraction; provider choice is intentionally outside this public map

### `packages/runtime-logger`

- **Owns:** Shared structured runtime logging substrate for `apps/api` and `apps/worker`
- **Exports:** Runtime logger creation helpers, log-level/env/service resolution, safe error-message extraction
- **Depends on:** external `pino` only
- **Invariant:** Internal operability only. This package must not grow into product-facing log storage/search/dashboard behavior.

### `packages/retrieval-client`

- **Owns:** Shared HTTP client helpers for retrieval parity surfaces consumed by CLI and MCP
- **Exports:** `createRetrievalApi()`, `RetrievalApiError`
- **Depends on:** no internal packages
- **Invariant:** CLI and MCP remain thin adapters over shared retrieval API client behavior

### `packages/log-parser`

- **Owns:** Shared CLI log parser registry, canonical `debugbundle-ndjson` handling, and first-party parsers for existing server log formats
- **Exports:** `CANONICAL_LOG_FORMAT`, `ACCEPTED_LOG_FORMATS`, `formatAcceptedLogFormats()`, `parseAcceptedLogFormat()`, `parseLogFile()`, `buildProjectId()`
- **Depends on:** `shared-types`
- **Invariant:** Parsers are package-owned and registry-driven; command modules do not embed parser-specific regex logic. `debugbundle-ndjson` remains the canonical structured interchange format for zero-install capture across unsupported languages.

### `packages/sdk-node` _(lives in `debugbundle-js` repo)_

- **Owns:** Node.js SDK core capture client, framework/logger adapters, in-memory buffering, failure isolation, vanilla runtime hooks, always-on probe ring buffers, request-scoped trigger-token probe activation, duplicate suppression, ingestion-backoff handling, remote config polling for capture policy plus project capture rules, file transport for local-only mode, and browser relay handler (receives browser events from same-origin or explicitly allowed split-host frontends, answers CORS preflight, validates/sanitizes, and writes to local events or spool for durable delivery)
- **Exports:** `debugbundle`, `createDebugBundleSdk()`, universal capture methods, `captureExceptions()`, `captureRejections()`, `captureConsole()`, `express()`, `fastify()`, `nextjs()`
- **Subpath exports (relay):** `@debugbundle/sdk-node/relay` (core relay handler factory), `@debugbundle/sdk-node/relay/express` (Express middleware), `@debugbundle/sdk-node/relay/fastify` (Fastify plugin), `@debugbundle/sdk-node/relay/nextjs` (Next.js API route handler)
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host code; failed or throttled flushes keep buffered events in memory, honor retry backoff, suppress duplicate/looping failures locally, keep remote probe directives process-local, and resolve trigger-token activations from request-local state only. Every current SDK's optional synchronous `beforeSend` hook runs on an isolated, canonical, redacted event before capture policy/rules, sampling, suppression, persistence, or buffering; `null` drops locally, invalid returns keep the SDK-owned original, and hook failures emit bounded diagnostics without throwing. Connected transports reconcile indexed ingestion acknowledgements, never requeue accepted events, retry only quota/rate-limited indices, and never advance delivery success for an all-rejected batch. Capture policy and project capture rules remain server-owned; the Node runtime currently enforces local `drop` plus sampled-out `sample` outcomes before buffering while leaving `demote` to ingestion/worker backstop enforcement until a backend-local context downgrade path exists. Relay handler must validate Origin, answer allowed `OPTIONS` preflights, enforce body size limits, strip/override protected fields, and never expose server-side credentials to browser clients (INV-17, INV-18, INV-19).
- **Transport selection:** File transport for local-only server SDKs on the current machine (writes to `.debugbundle/local/events/` and requires persistent storage plus CLI access for processing), file transport for connected `local`/`development`, and HTTP transport for connected `staging`/`production`. Browser relay writes to `.debugbundle/local/events/` (local-only) or `.debugbundle/local/browser-relay-spool/` (connected durable).
- **Internal structure:** `core.ts` owns transport/buffering/runtime state plus request-context lookup; `before-send.ts` owns local hook validation/failure isolation; `file-transport.ts` owns atomic file-write transport for local events; `framework-integrations.ts` owns Express/Fastify/Next.js wrappers; `logger-integrations.ts` owns logger detection and method patching; `suppression.ts` owns duplicate suppression and loop-protection state; `remote-probes.ts` owns config parsing and directive matching; `trigger-token.ts` owns request token extraction/validation; `relay.ts` owns core relay handler logic (validation, sanitization, field override, write/forward, durable spool management); `relay-express.ts`, `relay-fastify.ts`, `relay-nextjs.ts` own framework-specific relay adapters; `utils.ts` and `types.ts` hold shared helpers/contracts

### `packages/sdk-browser` _(lives in `debugbundle-js` repo)_

- **Owns:** Browser SDK core capture client, browser-native auto-capture hooks, opaque `window` error and resource-load metadata capture, bounded `unhandledrejection` reason summaries, breadcrumb buffering and standalone breadcrumb shipping, preset-aware first-party network response promotion to `request_event`, always-on probe ring buffers, zero-poll remote probe directive intake, page-load trigger-token probe activation, session-governance controls, network filtering, cross-context trace-header injection for browser requests, privacy-default frontend event capture, shared sanitized frontend primitives for debug breadcrumbs and opt-in AnalyticsBundle signals, opt-in AnalyticsBundle session/page/route/semantic-action/structural-action/funnel/conversion/friction-marker capture, best-effort lifecycle delivery, device-context collection, duplicate suppression, and transport backoff
- **Exports:** `createDebugBundleBrowserSdk()`, universal browser capture methods, `init()`, `captureException()`, `captureError()`, `captureLog()`, `captureRequest()`, `captureMessage()`, `setContext()`, `probe()`, `flush()`, `dispose()`
- **Depends on:** `shared-types`, `redaction`
- **Invariant:** SDK failures never throw into host pages; breadcrumbs default to local ring-buffer-only capture until a `frontend_exception`, except first-party network failures in the current preset's immediate request-failure set or explicit status/path client-error incident rules, which also emit standalone `request_event` incident signals; unpromoted `4xx` responses such as generic 404s remain non-incident telemetry/context; breadcrumbs can be batched as standalone `frontend_breadcrumb` events when configured; always-on probe buffers stay local until exception flush; duplicate exception/log/request storms are suppressed locally with periodic `error_suppressed` checkpoints and in-memory recovery after silence; failed or throttled flushes keep buffered events in memory and retry after backoff; relay unload uses bounded credential-free `navigator.sendBeacon()` with `fetch(keepalive)` fallback, while direct ingestion uses bounded authenticated `fetch(keepalive)`. Direct browser SDKs may explicitly request a bounded project analytics block through the existing project-token SDK config request, preserving legacy config responses for other clients; it can only restrict local analytics opt-in and never affects debug capture; relay mode never includes browser-side project tokens. Browser SDK trace injection is scoped to same-origin or explicit `tracePropagationTargets`, must preserve native `fetch` input and `HeadersInit` semantics, never drops caller auth headers while adding `X-DebugBundle-Trace-Id`, never possesses cloud credentials, exposes an optional synchronous `beforeSend` hook for app-owned local filtering/final redaction, and still relies on server-owned capture rules plus local rule enforcement for known operational noise — events ship through a backend relay handler or directly to cloud (static-only mode).
- **Analytics separation invariant:** Debug breadcrumbs and analytics events may be derived from the same sanitized route/session/device/action primitives, but debug capture must keep working when analytics is disabled, unavailable, consent-blocked, sampled out, quota-blocked, or internally failing. Direct-browser `standard` mode may persist only an opaque first-party visitor value under a project-token-hash-derived storage key and emit only a separate SHA-256-derived visitor hash; strict mode, consent withdrawal, and remote strict settings must leave no persistent visitor value. Friction markers may use only ephemeral target-object identity and timing, emit fixed marker keys, and never serialize target-derived fields. Credential-free relay mode remains session-only until it can obtain an authenticated project scope. Emitted debug and analytics envelopes remain separate and follow separate retention, quota, consent, and processing paths.
- **Invariant:** Bundle consumers must treat the inline `frontend_exception.payload.breadcrumbs[]` payload as the canonical browser error-context path, merge it deterministically with any standalone `frontend_breadcrumb` events when both exist, preserve optional enriched `frontend_exception.payload.browser_event` metadata for opaque browser-native failures, and avoid inferring application frames from known SDK listener assets for opaque browser-native `window_error` signals.
- **Transport selection:** Relay POST to the user's backend is the default and recommended transport. Same-origin relay paths such as `/debugbundle/browser` are inferred automatically; split frontend/backend relay URLs use explicit `init({ transportMode: "relay", endpoint: "https://api.example.com/debugbundle/browser" })`. Static-only direct POST to cloud remains available when no backend exists and requires a dedicated public write-only project token.
- **Internal structure:** `index.ts` owns transport/buffering state plus public capture APIs and pending trigger-token state; `before-send.ts` owns local hook validation/failure isolation; `types.ts` owns browser SDK contracts/constants; `runtime.ts` owns browser environment accessors, normalization, filter helpers, trace-id generation, and probe-directive parsing; `hooks.ts` owns console/network hook installation plus one-time device snapshot capture; `suppression.ts` owns duplicate suppression and loop-protection state; `trigger-token.ts` owns `_debug_probe` token validation

### JavaScript SDK Monorepo

The TypeScript/JavaScript SDKs live in a separate JS SDK repo: `github.com/debugbundle/debugbundle-js`. This follows the industry convention used by other established services — the product-facing JS SDK packages live together in one dedicated repo while shared cross-product libraries can remain core-owned when source coupling still exists.

**`debugbundle-js` repo contents:**

- `packages/sdk-node` (`@debugbundle/sdk-node`) — Node.js backend SDK
- `packages/sdk-browser` (`@debugbundle/sdk-browser`) — Browser SDK

The `debugbundle-js` repo now consumes published `@debugbundle/shared-types` and `@debugbundle/redaction` packages from npm. The core monorepo (`debugbundle/debugbundle`) continues to own the maintained source for those two packages and now owns only their shared-package release workflow, while the dedicated `debugbundle/debugbundle-js` repo owns release automation for `@debugbundle/sdk-node` and `@debugbundle/sdk-browser`.

**Publishing authentication:** The seven npm packages use GitHub Actions OIDC scoped to their owning repository and release workflow, with `id-token: write` only in publishing jobs. See `rules/release-governance.md` for npm configuration and secret retirement gates.

**Migration note:** The public `debugbundle/debugbundle-js` repo is live, its dedicated release workflow now stages and publishes the SDK packages from that repository, and core dogfooding in `apps/api` and `apps/web` continues to resolve published npm artifacts by disabling implicit pnpm workspace linking for non-`workspace:` ranges. Shared-package publication remains a core responsibility because `shared-types` and `redaction` still have direct source coupling in the main product repo. The production release train publishes dependency roots before dependent packages: shared packages first, then the JS SDK family, then dependent wrappers such as WordPress. After registry publish, bump the pinned versions in the root app, hosted SPA, and public-site manifests before hosted validation or deploy.

**Current ownership note:** `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` are the packages intended to move cleanly with `debugbundle-js`. By contrast, `@debugbundle/shared-types` and `@debugbundle/redaction` remain core-owned source in the current workspace even though they are published as standalone npm packages and consumed by the JS SDK. Core still has meaningful direct source-path coupling to both packages, especially `shared-types`, across product code, tests, and build-time artifact generation. Treat them as externally distributed core libraries for the current Phase 22 repo split; moving their maintained source into `debugbundle-js` would be a later deliberate extraction slice rather than an already-complete ownership transfer.

**Working rule in this workspace:** Edit `packages/shared-types` and `packages/redaction` here in the core repo. Edit JS SDK source in the standalone `debugbundle-js` repo itself or in a local clone bootstrapped into `sdks/debugbundle-js`; do not recreate `shared-types` or `redaction` as source-of-truth inside that SDK clone.

### Non-TypeScript SDKs

Automatic logging respects native suppression before SDK capture. The JS companion's `logger-emission.ts` observes Pino/Bunyan/Winston emission after native filtering, while `logger-integrations.ts` retains compatible adapters for logger-like objects. The Python companion's `structlog_integration.py` isolates per-call bound logger instrumentation without modifying application processor lists. PHP checks the active severity mask in the non-fatal error hook; WordPress inherits this behavior through its locked Composer dependency. Ruby preserves native logger levels and lazy block evaluation. See FR-SDK-19a and AC-SDK-07a/09a.

All non-TS SDKs implement the same universal SDK interface (`init`, `captureException`, `captureError`, `captureLog`, `captureRequest`, `captureMessage`, `setContext`, `flush`, `probe`) with language-idiomatic naming. See `contracts/sdk-interface.md` for the full contract and `spec/sdk-language-targets.md` for the rollout plan. V1 relay parity is implemented for Python, PHP, WordPress, Java Spring Boot, Java servlet/JAX-RS app-server adapters, Go net/http, and Ruby Rack/Rails. Each full relay-compatible surface validates and sanitizes browser batches, answers allowed `OPTIONS` preflight requests for split frontend/backend deployments, preserves correlation, isolates credentials, writes local-only event files, writes connected durable spool files, and forwards connected events with server-side credentials using the shared relay contract. Mobile SDKs (Kotlin Android, Swift iOS, and React Native) are client SDKs, not relay handlers; they use the mobile correlation contract, target-scoped trace injection, offline queueing through native foundations, remote probe directives, trigger-token activation, and direct connected ingestion.

All non-TypeScript SDKs live in separate repositories under `github.com/debugbundle/`, each with its own language-native toolchain, CI pipeline, and independent release cycle.

**Local workspace convention:** Separate SDK repos live as independent clones or active scaffolds under `sdks/` for single-workspace development. The core repo now ships `sdks.json` plus `scripts/bootstrap-sdks.sh`, root workspace/test/typecheck wiring no longer hardcodes the staged JS SDK tree, and the legacy tracked SDK snapshot directories have been removed from the core repo index. The public site repo lives as a real local clone at the root `site/` path for day-to-day work, while lower-touch companion repos such as `debugbundle/action` live under ignored `.local-repos/` clones. Temporary operator notes and local execution checklists live under ignored `.local-notes/`. On an older long-lived checkout, remove any pre-cutover `sdks/debugbundle-js`, `sdks/debugbundle-python`, or `sdks/debugbundle-php` directories from disk before the first bootstrap run so those paths can be recloned cleanly.
The current local SDK repo set includes `debugbundle-js`, `debugbundle-python`, `debugbundle-php`, `debugbundle-wordpress`, `debugbundle-java`, `debugbundle-go`, `debugbundle-ruby`, `debugbundle-android`, `debugbundle-swift`, the published `debugbundle-react-native` SDK repo, and the published `debugbundle-dotnet` SDK repo.

**Published V1 backend SDK scope:**

| SDK       | Repository                                     | Package Registry                       | Frameworks                                                   |
| --------- | ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Python    | `github.com/debugbundle/debugbundle-python`    | PyPI (`debugbundle-python`)            | Django, Flask, FastAPI                                       |
| PHP       | `github.com/debugbundle/debugbundle-php`       | Packagist (`debugbundle/sdk-php`)      | Laravel, Symfony                                             |
| WordPress | `github.com/debugbundle/debugbundle-wordpress` | WordPress.org plugin + GitHub releases | WordPress plugin wrapper over PHP SDK + browser SDK relay    |
| Java      | `github.com/debugbundle/debugbundle-java`      | Maven Central                          | Spring Boot, Servlet/JAX-RS app servers, javaagent bootstrap |
| Ruby      | `github.com/debugbundle/debugbundle-ruby`      | RubyGems (`debugbundle`)               | Rails, Rack, Sidekiq                                         |
| Go        | `github.com/debugbundle/debugbundle-go`        | pkg.go.dev                             | net/http, Gin, Echo                                          |

Detailed implementation plans live in `spec/sdks/`. Current published lines are JS 1.6.0, Python/PHP/Java/Go/Ruby/.NET 1.3.0, WordPress 1.4.1, and Android/Swift/React Native 1.2.0. The SDK family shares canonical event construction, indexed ingestion acknowledgement, object-wrapped arbitrary probe values, and the universal safe `beforeSend` contract. Android and Swift own canonical durable mobile delivery; React Native preserves its authored identity/error/context through additive native external-event APIs and delegates policy/probe/config ownership explicitly. Java's core, Spring, servlet, JAX-RS, and javaagent modules are implemented; zero-WAR-change javaagent request/relay auto-registration is not claimed unless a container lane proves it.

**Backend expansion status:**

| SDK             | Repository                                  | Package Registry                            | Frameworks          |
| --------------- | ------------------------------------------- | ------------------------------------------- | ------------------- |
| C# (published)  | `github.com/debugbundle/debugbundle-dotnet` | NuGet (`DebugBundle.Sdk` + `DebugBundle.*`) | ASP.NET Core / .NET |
| Kotlin (server) | `github.com/debugbundle/debugbundle-kotlin` | Maven Central                               | Ktor                |
| Rust            | `github.com/debugbundle/debugbundle-rust`   | crates.io (`debugbundle`)                   | Axum, Actix Web     |

**Mobile expansion status, following the Mobile Correlation Contract:**

| SDK                         | Repository                                        | Package Registry                  | Frameworks        |
| --------------------------- | ------------------------------------------------- | --------------------------------- | ----------------- |
| Kotlin (Android, published) | `github.com/debugbundle/debugbundle-android`      | Maven Central                     | Android lifecycle |
| Swift (iOS, published)      | `github.com/debugbundle/debugbundle-swift`        | Swift Package Manager / CocoaPods | UIKit / SwiftUI   |
| React Native (published)    | `github.com/debugbundle/debugbundle-react-native` | npm                               | React Navigation  |
| Dart / Flutter              | `github.com/debugbundle/debugbundle-flutter`      | pub.dev (`debugbundle`)           | Flutter           |

### Public Site

The public documentation/marketing/blog site lives in the standalone public repo `github.com/debugbundle/site` and is cloned locally at the root `site/` path when documentation work is needed.

**Public support chat:** `site/app/layout.tsx` mounts the reusable first-party
`src/components/support-chat.tsx` control across marketing, docs and blog routes.
The Contact page reuses its inline variant beside email; both share one controller
and the inline action remains available after opening or closing a conversation.
Its `src/lib/support-chat.ts` controller loads Crisp only on explicit activation,
preserves existing commands/API state and one loader during client navigation,
and bounds opening feedback with retry/email recovery. Pending controls also check
Crisp's reported open state to recover missed startup events; these checks stop on
success, failure or timeout. A full document reload starts uninitialised.
No account/project data is forwarded. The privacy page
discloses this lifecycle separately from first-party analytics; the authenticated
web app and core runtime are outside this integration. This on-demand follow-up
is local, following the automatic bootstrap released in site 1.9.0.

**Homepage hero discovery:** `src/components/hero-signal-field.tsx` emits a
high-priority image preload for the exact CSS background when the hero is rendered.
The shared root layout does not preload that artwork on unrelated pages.

**Pricing documentation:** `/pricing/` owns public prices and plan comparisons. The
existing `/docs/pricing/` route is the Plans and capacity guide; it explains shared
allowances and links to the comparison. Billing docs cover subscription workflows.

**Agent setup guidance:** `site/src/lib/agent-assist-prompts.ts` owns the shared
prompt catalogue. `agent-assist-prompt-card.tsx` and the existing prompt dialog
serve Quickstart's optional workflows and the corresponding feature guides.
Reports guidance distinguishes factual Solo/Team reports from Business Smart
Reports with AI analysis. It uses existing authenticated management operations and
preserves project scope, consent, schedule and delivery approval boundaries.
Public Reports labels retain existing `smart-reports` routes and capability names.

**Build-time boundary:** The standalone site repo no longer imports core apps/packages. Core now owns `scripts/public-site-artifacts.ts`, which generates vendorable static JSON artifacts into `site/public/` before the site build runs. The site-owned `generate:artifacts` script is limited to search-index generation. At runtime (after `next build`), the site has zero workspace dependencies — it's a fully static Next.js export.

**Core-owned artifact inputs (build-time only):**

- `apps/api/src/openapi.ts` — OpenAPI 3.1 spec
- `apps/cli/src/profile-validation.ts` — ProfileSchema
- `apps/cli/src/usage.ts` — CLI usage lines for reference docs
- `apps/mcp/src/tool-catalog.ts` — MCP tool catalog
- `packages/shared-types/src/index.ts` — BundleV1Schema
- `packages/webhook-client/src/index.ts` — WebhookEventPayloadSchema, WebhookEventTypeSchema

**Generated artifact boundary:** `scripts/public-site-artifacts.ts` is the core-owned generator entrypoint. It writes the vendorable output set to the local `site/public/`: `llms.txt`, `openapi.json`, `reference-data.json`, `schemas/bundle.json`, `schemas/profile.json`, `schemas/webhook-events.json`, `schemas/mcp-tools.json`, and the two example bundle JSON files. `site/scripts/generate-public-artifacts.ts` now writes only `search-index.json`. Edit agent guidance in the core generator and test its generated `/llms.txt`; the hosted workflow overwrites the vendored copy before building.

**Missing-route boundary:** `site/app/not-found.tsx` exports the site-styled `404.html`, without an inherited homepage canonical. `site/scripts/verify-error-page.mjs` validates the built HTML and sitemap during the site build. The private cloud companion owns public-origin `403`/`404` → HTML/HTTP `404` configuration and ten-second error caching; both hosted release paths apply it and run `scripts/verify-hosted-site.mjs` to verify missing marketing/docs/blog/assets (GET and HEAD). This does not alter app/API authorization or bucket permissions.

**Extraction status:** The site repo is already decoupled from core imports, the public `debugbundle/site` repository exists with green dedicated-repo CI, and the public core repo `debugbundle/debugbundle` is now live with green CI as well. Local multi-repo development now uses the real `site/` clone directly instead of keeping a tracked export snapshot in core.

---

## App Boundaries

### `apps/api`

- **Owns:** HTTP route handlers, request/response lifecycle, ingestion endpoint
- **Routes:** See `/contracts/public-interfaces.md`
- **Imports:** `auth`, `shared-types`, `event-normalizer`, `redaction`, `storage`
- **Does NOT own:** Bundle generation, reproduction, webhook delivery (those are worker)
- **OpenAI hosted ownership (local candidate implemented):** The existing API image/process owns the `mcp.debugbundle.com` Streamable HTTP route, `api.debugbundle.com` OAuth/OIDC issuer routes, trusted-host/surface validation, request-scoped OAuth principal, dedicated zero-mutation reader composition, MCP admission bulkhead, and metadata-only telemetry. `apps/api` may import shared packages but must never import `apps/mcp`; `tests/contracts/openai-plugin-v1-contract.test.ts` enforces this boundary.
- **Key constraint:** Ingestion (`POST /v1/events`) must be lightweight: reject declared oversized bodies before auth/parsing, authenticate project token, enforce optional token `allowed_origins` when configured, validate, rate-limit, enforce capture policy, apply project capture rules, persist accepted raw events, enqueue only, increment durable monthly organization/project counters for accepted billable events, and include the resolved capture preset plus resolved `immediate_client_error_statuses` and `immediate_client_error_path_rules` on normalize jobs so request-event classification stays stable in the worker. Canonical normalization/fingerprinting is performed synchronously only when an active exact-fingerprint capture rule requires it, using the worker's current fingerprint version rather than any client-controlled value.
- **Retrieval note:** `GET /v1/incidents` supports additive time-window filters including `first_seen_after` and `attention_after`; the latter matches incidents first opened or regressed at or after the supplied timestamp and is shared with CLI/MCP/local retrieval.
- **Dogfooding note:** Dogfooding runs against published `@debugbundle/sdk-node@1.7.0`. `server.ts` optionally initializes the npm-published SDK during bootstrap when `DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, the manual dev-only backend trigger route `GET /__dogfood/backend-error` remains gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`, and the hosted owner-authenticated verification route `POST /v1/internal/dogfooding/backend-error` is separately gated by `DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER=true`.
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now publishes the API on host port `3003`, so the backend dogfood trigger is reachable directly at `http://localhost:3003/__dogfood/backend-error`
- **Internal structure:**
  - `server.ts` — route composition (delegates to route modules)
  - `dogfooding.ts` — env-gated API SDK bootstrap and manual backend trigger registration
  - `audit-logging.ts` — fail-open audit log recording with actor-type resolution (browser session vs member token) and request IP hashing
  - `routes/account.ts` — owner-scoped browser-session account export, cached-avatar retrieval/import, and destructive account deletion with exact confirmation phrase, email OTP verification, collaborator-membership teardown, external sole-owner/project-owner guards, and audit logging
  - `routes/admin-analytics.ts` — internal browser-session-only aggregate product analytics summary route for the hosted `/analytics` page, gated by verified email auth plus `ADMIN_ANALYTICS_ACCESS_EMAILS` and returning `404` on all denial paths
  - `routes/health.ts` — health/ready/live probes
  - `routes/auth.ts` — signup/login/logout/session plus invite-acceptance, GitHub start/callback browser-auth flows, GitHub device bootstrap, GitHub access-token exchange, session auth-method disclosure, and best-effort GitHub avatar caching after browser OAuth completion
  - `openai-authorization-interaction.ts` / `openai-consent-access.ts` / `openai-oauth-http.ts` / `openai-plugin-runtime.ts` / `openai-reviewer-access.ts` — official OpenAI OAuth/OIDC discovery/authorize/token/revoke/UserInfo/JWKS composition, RFC 9207 response issuer, CIMD/client authentication, API-origin interaction parsing, verified-session consent, synthetic reviewer backend, feature gating, and expiry monitoring
  - `routes/openai-connections.ts` — no-store browser-session connection inventory scoped to exact user/current organization plus confirmed POST-body grant/refresh-family revocation and bounded audit evidence
  - `openai-mcp-http.ts` / `openai-mcp-dependencies.ts` / `openai-mcp-operations.ts` / `openai-mcp-projections.ts` / `openai-rate-limits.ts` — canonical-host stateless Streamable HTTP, route-scoped zero-length binary discovery compatibility, protected-resource/challenge/readiness routes, OAuth principal validation, dedicated readers, strict projection, admission/rates/timeout/output bounds, and metadata-only telemetry
  - `routes/ingestion.ts` — event ingestion; splits accepted `analytics_event` inputs into a separate analytics lane after project-token auth, validates analytics enablement/custom dimensions, persists short-lived raw analytics objects, and avoids incident grouping for analytics events
  - `ingestion-request-compatibility.ts` — authenticated-ingestion-only adapter for the exact installed Swift `{ batch }` wrapper; event-shape compatibility stays in `event-normalizer`, and ingestion records bounded compatibility telemetry while canonical and unrelated SDK shapes remain strict
  - `routes/incidents.ts` — incident retrieval, bundle, reproduction, logs
  - `routes/analytics-settings.ts` — project AnalyticsBundle settings read/update surface over shared analytics settings schemas, member preview, owner/admin mutation, all-tier analytics availability including the bounded Free preview, and fixed tier-bounded controlled custom dimensions
  - `routes/analytics-saved-funnels.ts` — all-tier project saved-funnel list/create/update/archive surface with member reads, owner/admin mutations, fixed tier-bounded active-definition limits, shared schemas, and configuration audit records
  - `routes/analytics-filter-options.ts` / `routes/analytics-read-projection.ts` — bounded observed-choice read over existing project access/rate limits; shared analytics privacy projection preserves legacy behaviour and rejects changed selectable literals
  - `routes/analytics.ts` — thin Analytics HTTP registration for aggregate metrics, opportunity/bundle inventory, generation, and artifact/status retrieval
  - `routes/analytics-visit-flows.ts` — configured source/destination project-token handoff writes plus two operator-gated aggregate reads; current signup consent (signed for GitHub OAuth) gates account linking after response completion; withdrawal remains available with capture disabled; bundle outcomes link best-effort after core success
  - `routes/analytics-contracts.ts` — shared analytics HTTP request schemas, cursor parsing, and bounded time-window resolution
  - `routes/analytics-route-services.ts` — project/organization authorization helpers, linked-opportunity request derivation, focused-kind validation, deterministic generation response handling, and metric input normalization
  - `routes/project-members.ts` — project-scoped collaborator listing for any authorized member, cached member-avatar reads, pending-invite lifecycle, invite creation with transactional invite email delivery, role updates, member removal, and collaborator self-leave with removed-member automation cleanup
  - `routes/billing.ts` — owner-scoped billing summary and allowance-capacity management for browser sessions or member tokens, plus browser-only Stripe checkout and customer-portal handoff
  - `routes/stripe-webhook.ts` — Stripe webhook ingestion with raw-body signature verification, idempotent event processing, and entitlement recomputation for checkout.session.completed, subscription.created/updated/deleted, invoice.paid, and invoice.payment_failed events, including synced Stripe billing-period boundaries used by billing summaries
  - `routes/projects.ts` — organization-scoped project list/create/update/delete with owner-only destructive enforcement and optional project color-tag metadata
  - `routes/services.ts` — project-scoped service retrieval
  - `routes/alerts.ts` — alert rule CRUD, severity-threshold lifecycle scope handling, reusable Slack destination ID validation, unsafe literal-target rejection, and one-time custom webhook secret creation/rotation
  - `routes/slack.ts` — Slack OAuth connect flow plus reusable Slack destination list/test/delete routes shared by web, CLI, and MCP
  - `routes/probes.ts` — remote probe activation/deactivation and trigger-token issuance, scoped through per-project access resolution so shared collaborators act against the owner organization
  - `routes/availability-checks.ts` — hosted health-check CRUD, retained result/history reads, and side-effect-free target testing
  - `routes/capture-policy.ts` — per-project capture policy GET/PATCH
  - `routes/capture-rules.ts` — per-project capture-rule CRUD plus incident-derived suggestion/create-from-suggestion flows; suggestions annotate matching existing rules and create-from-suggestion is idempotent
  - `routes/tokens.ts` — token lifecycle CRUD
  - `routes/webhooks.ts` — webhook CRUD, synthetic test delivery, delivery history retrieval, and manual delivery retry
  - `routes/weekly-report-channels.ts` — per-project weekly report channel CRUD
  - `routes/github.ts` — GitHub App installation listing, project-scoped repo connection/disconnection, dispatch rule CRUD, dispatch delivery history/retry, installation callback handling, and GitHub App webhook ingestion endpoint
  - `routes/github-marketplace-webhook.ts` — GitHub Marketplace listing webhook ingestion for purchase/subscription tracking keyed by GitHub delivery IDs
  - `api-types.ts` — shared type definitions
  - `api-analytics-types.ts` — analytics-specific API dependency contracts split out of `api-types.ts` to keep type boundaries under the source-file size limit
  - `api-helpers.ts` — auth guards, response builders, browser-session/member-token convergence, owner-role principal checks
  - `schemas.ts` — Zod request/response schemas
  - `slack-app.ts` — Slack OAuth state cookie, redirect-path validation, and code exchange helpers
  - `openapi.ts` — API-owned OpenAPI 3.1 generator built from request schemas plus shared client response schemas for public artifact publication
  - `stripe-config.ts` — Stripe client factory, price-to-plan mapping, billing state derivation, entitlement eligibility checks
  - `billing-slot-management.ts` — Stripe subscription state loading, projected billing summary computation, subscription-item quantity building for immediate allowance-capacity increases, and subscription-schedule phase building for deferred allowance-capacity reductions
  - `billing-links.ts` — non-production static billing URL fallback; production requires the authenticated dynamic Stripe path
  - `default-dependencies.ts` — dependency composition including account export artifact hydration for retained raw events, failure bundles, improvement bundles, and reproductions; admin-only aggregate analytics gating through `ADMIN_ANALYTICS_ACCESS_EMAILS`; project AnalyticsBundle settings management; internal analytics usage metering for event/session and bundle-generation quotas; project-object cleanup on account deletion; dynamic Stripe checkout session; customer portal creation; projected billing summaries; and Stripe-backed allowance-capacity mutations
  - shared client packages under `packages/*-client` — thin typed HTTP adapters reused by CLI and MCP parity flows; billing allowance-capacity management uses `packages/billing-client`
  - `runtime.ts` — server bootstrap, graceful shutdown, and conditional Stripe webhook wiring (creates separate connection pool for billing sync)

### `apps/worker`

- **Owns:** Background processing via durable Postgres jobs and compatible Redis ingress adoption
- **Resource lifecycle:** `worker-env.ts` owns bounded interruptible polling waits and temporary readiness-client cleanup. `packages/storage/src/frequency-counter.ts` caps the internal snapshot-throttling cache at 10,000 IDs; authoritative Redis/Postgres data is unchanged. Status-only worker transports release unread responses. `scripts/check-worker-poll-memory.mjs` and focused lifecycle tests guard uptime-independent retention; see `spec/worker-resource-lifecycle.md`.
- **Hosted outbound boundary:** `packages/storage/src/alert-outbound-guard.ts` validates public literal/DNS targets and supplies a validated address to a bounded Undici socket pool. Direct alerts, signed lifecycle webhooks, weekly Slack reports, the API Slack test route, and availability-check execution use it with manual redirects; provider response handling, availability evidence, and signing remain with their owning modules. Custom direct alert-webhook signing secrets live in a separate nullable `alert_rules` column and are selected only for worker delivery; eligible legacy null rows atomically acquire per-rule keys before sending; explicit rotation reveals a key and opts into version 1 payloads.
- **Jobs:** `normalize-events`, `aggregate-analytics-events`, `group-incident`, `build-bundle`, `build-analytics-bundle`, `build-reproduction`, `evaluate-alerts`, `deliver-alert-email-digest`, `deliver-operational-email`, `deliver-webhook`, `generate-weekly-report`, `cleanup-retention`, `dispatch-github`
- **Imports:** `bundle-engine`, `repro-engine`, `event-normalizer`, `shared-types`, `redaction`, `email`
- **Key constraint:** All jobs must be idempotent; worker-owned severity inference must distinguish high-confidence failures from low-confidence opaque browser-native captures before alert filters run; lifecycle webhooks gate new intents against `monthly_webhook_deliveries` before queue insertion, alert evaluation achieves this by persisting one internal `alert_deliveries` row per alert/incident/dedupe key before immediate non-email delivery plus an `alert_email_digests` / `alert_email_digest_items` queue for fixed 10-second email batching. Failed direct sends keep their group and retry through the bounded durable evaluation job, without charging a second monthly delivery intent; other eligible destinations are still evaluated. Optional per-rule alert `cooldown_seconds` suppression checks recent `(alert_id, notification_key)` history without changing incident grouping, operational owner notifications are persisted in `operational_email_deliveries` before email transport attempts so webhook auto-disable, allowance, retention, and no-card trial lifecycle notices can retry independently, trial reminder/expiry scheduling uses `trial_lifecycle_events` as the cross-poll idempotency ledger after durable email queueing or expiry succeeds and re-checks billing state before downgrading expired trials, lower-tier downgrades preserve paid-feature setup while terminalizing in-flight paid-feature deliveries and depending on current-tier checks to pause Slack/GitHub/probes/hosted improvements/collaboration until re-upgrade, resolving reusable Slack destinations only after the claim row is written, weekly reporting now relies on persisted `bundle_generations` history plus `weekly_report_deliveries` claim rows before email or Slack transport is attempted, request/log hosted improvement bundles share the same retained-bundle-cap pruning path as failure bundles across one combined incident/improvement inventory while below-threshold candidates stay internal and incident-derived improvement opportunities only link to related failure bundles, GitHub dispatch achieves idempotency via `github_dispatch_deliveries` claim rows with cooldown enforcement before `repository_dispatch` API calls and non-retryable `skipped` rows for DebugBundle-side hourly suppressions, and worker-triggered lifecycle transitions may record deletion-safe account analytics counters without retaining payload data or deleted account joins
- **Availability lane:** Hosted health checks run in a bounded in-process lane separate from the serialized Redis job priority chain. Storage claim eligibility applies plan-derived per-project, monitored-project, and organization-active-check caps; legacy intervals below a current plan floor are clamped at read/claim/record boundaries rather than migrated. The lane batch-claims due checks, executes them concurrently under `AVAILABILITY_CHECK_CONCURRENCY`, uses `AVAILABILITY_CHECK_CLAIM_BATCH_SIZE` and `AVAILABILITY_CHECK_LOOP_INTERVAL_MS` for cost-friendly tuning, records lag/backlog metrics, and emits rate-limited worker dogfood warnings when due-check lag indicates saturation. Monitor-internal results retain diagnostics without changing customer health, incident thresholds, or daily uptime; the worker logs an aggregate and rate-limits its own dogfood incident.
- **Alert email retry:** `alert_email_digests` retains one durable digest identity when its provider fails. The existing `deliver-alert-email-digest` worker job retries with bounded backoff; scheduler claims older than ten minutes can be reclaimed if enqueue was interrupted. Provider exception text is not persisted.
- **Analytics lane:** `aggregate-analytics-events` validates short-lived raw analytics objects, ledgers each event/unique subject before idempotent hourly/daily rollup writes, and maintains bounded completed journey artifacts. Deterministic evaluators cover funnel dropoff, route loops/fixed friction markers, route exit regression, deploy conversion regression, and incident reach; the six-hour leased scheduler scans only enabled projects with recent daily activity in cursor-bounded batches. Bundle requests can be standalone or opportunity-linked, retry failed deterministic generations, and are processed by a bounded worker using aggregate metrics plus ranked redacted journeys. Hourly/daily/raw/sample/bundle retention windows remain independent. The analytics lane, transport buffer, quota ledger, and failure handling stay separate from incident grouping and debug capture.
- **Analytics generation scope:** Generation workers accept legacy top-level service/environment scope plus the public API's nested safe filters; an explicit normalized route narrows route and journey-pattern evidence at the aggregate query boundary, and feature-usage artifacts include bounded aggregate action metrics.
- **OpenAI OAuth maintenance:** `openai-oauth-maintenance.ts` runs only when explicitly enabled, reuses the existing worker process, deletes bounded indexed batches of expired/consumed/revoked OAuth records, preserves active grants/current refresh families, emits counts/duration only, and monitors reviewer expiry without reading customer payloads.
- **Saved funnel control plane:** `analytics_saved_funnels` stores reusable project definitions separately from per-visit analytics and generated AnalyticsBundles. The Postgres store enforces the lesser of stored project settings and current-tier active limits under a project transaction lock, archives definitions softly, and is exposed through the same API client to CLI and MCP. Saved-funnel limits remain independent from event, session, journey-sample, and bundle-generation allowances.
- **Browser analytics capture:** the external `debugbundle-js` browser SDK adds explicit bounded journey markers and one unload-safe session summary on non-persisted `pagehide`, while preserving separate analytics/debug paths and treating back-forward-cache transitions as non-exits.
- **Scheduled analytics opportunity evaluation:** the bounded worker scheduler takes a six-hour Redis lease by default and enqueues `evaluate-analytics-opportunities`. Its processor scans enabled projects with recent daily session rollups in stable UUID cursor batches of 25, reuses the deterministic aggregate evaluator with one scheduled timestamp, and enqueues one continuation only for a full batch. It never reads raw analytics objects, and queued work remains below incident, aggregation, and bundle-build lanes.
- **Incident-impact replay constraint:** retained sample IDs and hydrated journeys require an exact internal project-scoped affected-session subject match, matching service/environment, transition tag, bounded window, and a completed unexpired artifact. The correlation hash is never public; legacy samples without it are not selected.
- **Local dev note:** the top-level `docker-compose.yml` `dev` profile now starts the worker alongside API and web so local dogfooding can exercise the full ingestion-to-bundle path without a separate manual worker launch

### `packages/agent-setup`

- Owns verified-agent selection/detection, project-root discovery, bounded safe filesystem access, ownership metadata, canonical refresh, native instructions with shared ownership, append-only gitignore repair, Claude link/copy discovery, plugin hints, and removal.
- CLI `agent-setup.ts` passes the canonical `local-scaffold.ts` templates into this domain service; setup/doctor/validate share it. No reverse package-to-app import, separately published skill, network installation, or authentication mutation.
- Contract: `spec/agent-aware-cli-setup.md`; tests: `tests/packages/agent-setup` and `tests/apps/cli/cli-agent-setup.test.ts`.

### `apps/cli`

- **Parity remediation ownership:** `webhook-command-handler.ts` owns lifecycle
  webhook argv handling and validated JSON filter replacement, with a compatible
  re-export from `management-webhook-alert-slack-weekly-command-handlers.ts`.
  The shared `packages/webhook-client` filter schema validates explicit JSON;
  existing HTTP/domain services own authorization and updates. Capture-rule argv
  update maps the explicit `--expires-at null` sentinel to JSON null. Ordinary MCP
  `setup-tools.ts` adds `verify_app_event` over the existing CLI verifier while
  retaining frozen `verify_cloud` metadata;
  no hosted or restricted-agent catalog changes. See the local remediation register
  in `spec/interface-parity-remediation.md` and `spec/interface-parity-matrix.md`.
  Additive GitHub disconnect adapters in `github-client`, CLI and MCP call the existing
  organization-owner DELETE route; the OpenClaw projection remains catalog-derived.

- **Owns:** CLI command parsing, terminal I/O, interactive flows, local processing pipeline
- **Commands:** See `/contracts/public-interfaces.md` and `/spec/local-first-onboarding.md` §11
- **Imports:** `shared-types`, `auth`, `event-normalizer`, `bundle-engine`, `repro-engine` (for local processing), `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads/writes `.debugbundle/` for local operations.
- **Key constraint:** Exit codes must follow contract (0/1/2/3/4, with existing management-command conflict/forbidden mappings still using 5 where already established)
- **Local-first commands:** `setup` (guided onboarding with mixed-runtime service discovery, interactive target selection in TTY sessions, JSON `selected_targets` / `relay_guidance`, and optional relay-route scaffold for Fastify, Express, and Next.js App Router projects when both DebugBundle SDKs are present), `doctor`, `validate`, `profile validate`, `verify local`, `verify cloud` including active synthetic `--trigger-5xx` / `--trigger-4xx` plus app-event verification via `--expect-app-event`, `process` (local event → bundle pipeline), `analyze`, `ingest`/`watch` (log-based capture), `connect` (upgrade to cloud), `resolve`/`reopen` (incident lifecycle), `clean` (retention)
- **Internal structure:** `main.ts` owns top-level argv routing; `argv-helpers.ts` owns shared CLI parsing and option coercion; `login-command.ts` now owns all bootstrap login paths including direct member-token persistence, GitHub device flow polling, and `gh auth token` exchange; `cli-fs-helpers.ts` owns shared filesystem utility helpers (`isRecord`, `isMissingPathError`, `resolveWorkspacePath`) used across CLI command modules; `management-command-handlers.ts` owns token/project/alert/slack/webhook/weekly-report/capture-policy/billing/probe/project-members/github/improvements/analytics settings subcommand routing; `management-analytics-command-handlers.ts` owns `debugbundle analytics settings get|set`; `auth-context.ts` owns stored-auth HTTP client creation for shared API clients including `createAuthenticatedBillingApi`, `createAuthenticatedSlackApi`, and `createAuthenticatedGitHubManagementApi`; `billing-commands.ts` owns billing summary retrieval and capacity-management commands (get, capacity increase, capacity schedule-reduction, capacity cancel-reduction) via `packages/billing-client`; `slack-commands.ts` owns connected Slack destination list/connect-url/test/delete flows via `packages/slack-client`; `improvement-commands.ts` owns hosted improvement list/get/bundle/resolve/reopen flows while `improvement-settings-commands.ts` owns project-scoped hosted-improvement automation settings; `analytics-settings-commands.ts` owns the analytics settings API client and CLI rendering; `setup-command.ts` owns the public `setup` scaffold flow, with `setup-service-discovery.ts` handling mixed-runtime service inference, `setup-target-selection.ts` handling TTY target selection defaults, and `setup-relay-guidance.ts` handling runtime-specific relay scaffolding/instructions; `connect-command.ts` owns the local-only to connected-mode upgrade flow (profile validation, cloud project selection/creation, project-token minting, and connection-config rewrite); `verify-command.ts` owns local proof generation plus passive cloud verification, active synthetic cloud verification through temporary project-token creation and real `/v1/events` ingestion, and app-event verification that waits for hosted incident visibility using service/environment plus optional trace/request correlation hints; `project-commands.ts` owns project lifecycle mutations (list, create, update, delete) exposed through the CLI via `packages/project-management-client`; `github-commands.ts` owns GitHub installation-status, repository-listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry commands via `packages/github-client`; `probe-commands.ts` owns remote probe activation/deactivation/listing exposed through the CLI with inline API client; `member-commands.ts` owns project collaborator management (list, invites, invite, cancel-invite, update-role, remove, leave) with inline API client; `ingest-command.ts` owns one-shot local event-batch writes plus handoff into the existing process pipeline while delegating format parsing to `packages/log-parser`; `watch-command.ts` owns incremental log tailing from EOF, rewrite/truncation detection, repeated registry-backed parsing, and the mode-specific fanout between local event-batch writes plus `process` handoff and connected-mode shipment to `POST /v1/events` using shared `partitionEventsForIngestion` final UTF-8 byte preflight and complete per-chunk acknowledgement; `local-scaffold.ts` owns canonical generated scaffold templates; `packages/agent-setup` owns native integration and safe cleanup, retaining legacy paths whose ownership cannot be proven; `local-retrieval-store.ts` owns local incident/bundle/reproduction reads plus local resolve/reopen state mutations against `.debugbundle/local/state.json` and `.debugbundle/bundles/local/`; `retrieval-source.ts` owns shared source-tagging plus merged incident pagination helpers used by CLI and MCP retrieval; `cloud-artifact-cache.ts` owns persistence of explicit cloud bundle/reproduction fetches into `.debugbundle/bundles/cloud/`, cache-status sync for cloud resolve, and opportunistic 30-day expiry pruning; `clean-command.ts` owns the operator-facing local retention surface for processed local events, local incident-cap trimming with resolved-first eviction, explicit cloud-cache pruning, and scaffold-preserving `--all` runtime reset; `doctor-command.ts`, `validate-command.ts`, `profile-command.ts`, and `analyze-command.ts` own local-first validation and analysis workflows; `process-command.ts` owns the local file-transport pipeline, preset-aware full reprocessing, promoted request-failure incident processing, and state/bundle writing; `retrieval-commands.ts`, `token-commands.ts`, `project-commands.ts`, `services-command.ts`, `alert-commands.ts`, `slack-commands.ts`, `webhook-commands.ts`, `weekly-report-commands.ts`, `capture-policy-commands.ts`, `probe-commands.ts`, `member-commands.ts`, `github-commands.ts`, `improvement-commands.ts`, `improvement-settings-commands.ts`, and `analytics-settings-commands.ts` are thin command adapters over shared clients or local orchestration modules, including explicit `source` routing, default merged local/cloud retrieval behavior in connected mode, collapse of multi-id cloud incident resolve/reopen into hosted bulk routes, and cloud artifact cache refresh on explicit fetch
- **Analytics CLI ownership:** `management-analytics-command-handlers.ts` routes aggregate reads, opportunity and bundle workflows, settings, and saved funnels; `analytics-metrics-api.ts` owns the shared HTTP/query adapter, `analytics-metrics-commands.ts` owns rendering/auth command orchestration, and the bundle/settings/saved-funnel modules own their corresponding workflows reused by MCP.
- **Retrieval CLI ownership:** `retrieval-commands.ts` preserves the existing public command import path as a barrel. `retrieval-list-detail-commands.ts` owns list/detail/context and shared bounded output formatting; `retrieval-lifecycle-artifact-commands.ts` owns resolve/reopen, bundle, log, and reproduction commands using those same privacy formatters.
- **Analytics web settings ownership:** `apps/web/src/components/system/project-analytics-settings-card.tsx` owns the project Settings card over the existing analytics-settings API, including loading/error retry, bounded Free-preview guidance, owner/admin capture/privacy/sampling/retention controls, member preview, and fixed tier-bounded controlled custom-dimension allowlists. Its unframed `project-analytics-saved-funnels-section.tsx` child independently lists active definitions and provides owner/admin ordered-step create/update/archive controls while members remain read-only. `apps/web/src/lib/api.ts` remains the thin cookie/CSRF browser adapter; validation, authorization, archival semantics, and tier/active-limit enforcement stay API-owned.

### `apps/mcp`

- **Owns:** MCP protocol adapter (stdio transport)
- **Tools:** See `/contracts/public-interfaces.md`
- **Imports:** `shared-types`, `auth`, `github-client` (for GitHub automation management)
- **Communication:** Calls HTTP API for cloud operations (not direct DB access). Reads `.debugbundle/` for local-store queries and local lifecycle updates when unconnected, when `source: "local"` is explicitly requested, or when connected-mode detail/lifecycle retrieval probes local state before falling back to cloud.
- **Key constraint:** Thin adapter only — no unique business logic. Must support local-store reads when cloud is unavailable.
- **OpenAI boundary:** the split `tool-catalog*` modules remain authoritative only for stdio and the full OpenClaw projection. The official OpenAI catalog is a separate twenty-three-tool contract under `tests/fixtures/openai-plugin-v1/`, implemented by `packages/mcp-core`, with distribution source under `apps/mcp/openai/`; it is not implemented by pruning or mutating the legacy catalog. `apps/api/src/openai-mcp-analytics-operations.ts` owns the fixed-window aggregate projection; `packages/storage/src/analytics-metrics-store.ts` and `analytics-incident-impact-metrics.ts` expose explicit suppression options so OpenAI never reads retained samples or bundle-generation state.
- **Internal structure:** `main.ts` owns the external stdio entrypoint for the publishable `@debugbundle/mcp` package; `server.ts` owns MCP JSON-RPC request handling for initialize, tool listing, and tool calls; `default-tools.ts` composes the default runtime tool registry over shared HTTP clients, environment-provided `DEBUGBUNDLE_MEMBER_TOKEN` / `DEBUGBUNDLE_API_URL`, CLI auth state, and local CLI modules; `server.json` owns MCP Registry metadata for the npm package; `ecosystem-release-manifest.json`, `scripts/release-mcp-ecosystem.mjs`, `scripts/mcp-ecosystem-verification.mjs`, `scripts/mcp-ecosystem-target-verification.mjs`, and `scripts/mcp-ecosystem-publication.mjs` own the host-side post-npm ecosystem release workflow that rebuilds the MCPB bundle from the published npm artifact, smoke-tests the staged stdio server, publishes official-registry/Smithery MCP/Smithery skill/ClawHub skill metadata, builds/validates/publishes the OpenClaw plugin package, verifies bounded ClawHub capability-query ranks after index propagation, and emits Glama/LobeHub discovery follow-up checks; `retrieval-tools.ts`, `token-tools.ts`, `project-tools.ts`, `services-tools.ts`, `setup-tools.ts`, `analyze-tools.ts`, `alert-tools.ts`, `slack-tools.ts`, `webhook-tools.ts`, `weekly-report-tools.ts`, `billing-tools.ts`, `capture-policy-tools.ts`, `probe-tools.ts`, `health-check-tools.ts`, `member-tools.ts`, `github-tools.ts`, `improvement-tools.ts`, `improvement-settings-tools.ts`, and `analytics-settings-tools.ts` expose thin MCP tool factories over shared clients or existing CLI modules; `analytics-settings-tool-catalog.ts` owns the catalog entries for `get_analytics_settings` and `update_analytics_settings`. GitHub MCP coverage now includes installation status, repository listing, project repo assignment/removal, dispatch-rule CRUD, and delivery history/retry. `tool-catalog.ts` owns the source-of-truth MCP tool catalog with Zod input schemas for all shipped tools, used by the public-site artifact pipeline to generate `/schemas/mcp-tools.json` and by `apps/openclaw-plugin` to generate OpenClaw `debugbundle_*` tool metadata; retrieval tools now reuse the CLI local-store reader plus `retrieval-source.ts` helpers for merged connected-mode incident listing, local-first detail/artifact/lifecycle lookup, explicit source tagging, collapse of multi-id cloud resolve/reopen into hosted bulk mutation routes, and `cloud-artifact-cache.ts` persistence so cloud bundle/reproduction fetches refresh `.debugbundle/bundles/cloud/`, cloud resolve updates cached status snapshots, and stale cloud-cache files are pruned during explicit cache activity
- **Analytics MCP ownership:** `analytics-metrics-tools.ts` exposes `get_analytics_filter_options`, `get_usage_summary`, `get_route_metrics`, `get_journey_patterns`, `get_device_breakdown`, `get_referrer_metrics`, `get_action_metrics`, `list_funnel_metrics`, `get_funnel_analysis`, `list_analytics_opportunities`, and `get_analytics_opportunity` over the shared CLI HTTP client, and `analytics-metrics-tool-catalog.ts` owns their published tool metadata. Settings remain in `analytics-settings-tools.ts` / `analytics-settings-tool-catalog.ts`.
- **OpenAI distribution ownership:** `apps/mcp/openai/debugbundle/` owns the independently versioned combined skill and local Developer Mode source, including its non-secret `.app.json` mapping. `apps/mcp/openai/submission/portal-review.json` selects the exact five positive and three negative portal cases from the larger corpus. `scripts/openai-plugin-release-lib.mjs` builds the separate ZIP-first portal artifact from that source for a new initial upload: it removes `.app.json`/`apps`, adds the hosted remote `.mcp.json`/`mcpServers`, retains internal `name` `debugbundle` and public `interface.displayName` `DebugBundle`, and imports listing/review metadata. The old form-created draft requires publication before a ZIP update and routes a main-page upload back to its name-mismatch check; the owner should delete only that obsolete unpublished Platform draft before the fresh upload. `release-manifest.json` records the generated ZIP's hashes, while the submission folder retains non-secret review evidence. The owner-visible ChatGPT App ID and Version ID are not substituted for the `plugin_asdk_app...` technical Developer Mode connection ID. `tests/fixtures/openai-plugin-v1/implementation-gaps.json` preserves the live/manual evidence boundary.

### `apps/openclaw-plugin`

- **Owns:** Publishable OpenClaw tool plugin package for ClawHub package distribution
- **Tools:** One `debugbundle_<mcp_tool_name>` projection per MCP catalog entry
- **Imports:** `apps/mcp/src/tool-catalog.ts`, `apps/mcp/src/default-tools.ts`
- **Communication:** Delegates to the MCP default tool registry, so cloud/local behavior, auth precedence, and result shapes remain MCP-aligned
- **Key constraint:** No product business logic. OpenClaw code may translate host metadata and safety declarations only.
- **Internal structure:** `src/index.ts` maps the MCP catalog to OpenClaw `defineToolPlugin` metadata, converts Zod schemas to JSON Schema and TypeBox unsafe schemas, delegates execution to `createDefaultMcpTools`, uses `src/tool-policy.ts` to default unreviewed capabilities to optional, and installs native per-call approval hooks for optional tools; `scripts/check-bundle.mjs` rejects server-only imports and dynamic compilation in the assembled artifact; `openclaw.plugin.json` is generated from the built entry; `package.json` owns OpenClaw compatibility metadata and ClawHub install hints.

### `apps/web`

- **Owns:** Implemented first seven web management slices plus hosted improvement management, project product-analytics overview/routes/funnels/audiences/journeys/opportunities/bundles, customer workspace Analytics inventory, internal operator analytics, and the owner-approved existing-app OpenAI consent/reviewer/connection-revocation experience. Public-auth routes include `/login`, `/signup`, `/invite`, `/oauth/consent`, and `/oauth/reviewer`; signed-in management includes `/settings` plus the existing dashboard/project/incident/analytics/billing routes. The explicitly opted-in `/__dev/openai-plugin` route is a non-public synthetic visual-review harness and is not mounted in production.
- **Framework:** React + Vite SPA deployed to `app.debugbundle.com`
- **Imports:** `shared-types`
- **Communication:** Calls HTTP API at `api.debugbundle.com` (cross-origin, same-site)
- **Key constraint:** Web is NOT the product core. Agent/CLI/API are primary interfaces. UI must stay reusable, shadcn-based, theme-capable, and use cookie-backed session auth. The public site remains a separate static-exported Next.js + Fumadocs deployment on `debugbundle.com` with marketing pages, `/docs`, and `/blog`. Focused frontend validation runs through `make web-check`.
- **Dogfooding note:** Dogfooding runs against published `@debugbundle/sdk-browser@1.7.0`. `src/main.tsx` optionally initializes the npm-published browser SDK during startup when `VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN` is present, and the manual dev-only console bridge `window.__DEBUGBUNDLE_DOGFOOD__.triggerFrontendException()` remains gated by `VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS=true`.
- **Internal structure:** `src/app.tsx` owns protected/public-auth route composition while `src/app-project-routes.tsx` owns the single project route tree reused by browser and memory routers. `src/components/system/auth-layout.tsx` is the shared auth shell; `src/pages/openai-consent-page.tsx`, `src/pages/openai-reviewer-page.tsx`, `src/lib/openai-oauth-api.ts`, and `src/components/system/openai-connections-section.tsx` own the UID-only interaction, exact disclosure/scope selection, credential clearing, API continuation, and responsive Settings revocation surfaces. The OpenAI section is full-width after the primary Settings cards; active grants render immediately while retained revoked/expired grants remain in a collapsed keyboard-accessible history disclosure until automatic physical cleanup. `src/lib/openai-plugin-preview-gate.ts` owns the production-deny routing gate without importing preview fixtures; `src/openai-plugin-preview-route.tsx`, `src/pages/openai-plugin-preview-page.tsx`, and `src/lib/openai-plugin-previews.ts` lazy-load and compose the production view components with deterministic non-customer fixtures for the explicit development/test-only state and iframe-width matrix. The preview modules own no OAuth client and cannot mount in production. `src/lib/dogfooding.ts` owns fail-closed app route templating and records only path templates, never interaction UIDs or OAuth state. Analytics page/component ownership remains under its existing focused modules. `src/lib/api.ts` remains the compatibility barrel over focused browser adapters. `src/components/ui/*` holds shadcn primitives and `src/components/system/*` holds reusable product components.

Web heading layout: `apps/web/src/components/system/title-badge-row.tsx` composes existing headings, badges, optional title accessories and actions in reading order with responsive wrapping. Callout cards, analytics detail headers and system-email previews reuse it; heading semantics and badge tones stay with callers.

Web list ownership: `apps/web/src/lib/api-artifacts.ts` holds incident/improvement list clients behind the unchanged `lib/api.ts` exports. `lib/use-cursor-pagination.ts` caches first-page totals, ignores obsolete filter requests, and refreshes counts after mutations. A changed first-page cursor resets the cached page chain to prevent skipped rows; a stable cursor preserves the current page. `components/system/cursor-pagination-controls.tsx` renders the shared page count and navigation.

Health history ownership: `apps/web/src/pages/health-status-page-utils.ts` builds the displayed UTC-day window, check-weighted 30-day uptime, daily impact, and precise duration labels reused by the project Health tab. Project tooltips identify summed check downtime. Current status is independent of history; `apps/web/src/lib/health-status-summary.ts` retains the dashboard's explicitly daily calculation. `packages/storage/src/availability-check-store.ts` persists threshold-confirmed `down` before incident linkage, retains active incident references on continuing outage days, and preserves the day's worst state after recovery without changing the rollup schema or lifecycle transitions.

### `site/` (public-site)

- **Owns:** The static public-site surface for `debugbundle.com`, including route-group boundaries for marketing pages (landing with product hero/how-it-works/value-props/SEO, pricing with full Free/Solo/Team tier data, legal/informational pages), MDX-backed `/docs` and `/blog` routes (including the AnalyticsBundle concept/privacy/self-hosting, CLI, API, browser SDK, and MCP tool documentation), build-time publication of machine-readable public artifacts, and the generated `/docs/v1/reference/*` subtree. Documentation content is authored per `spec/documentation.md` with static Fumadocs navigation and Orama search.
- **Framework:** Next.js App Router with static export and a live Fumadocs-backed MDX docs/blog content pipeline
- **Imports:** Internal site config and site-owned presentation components only
- **Communication:** No runtime dependency on the product API for page rendering; machine-readable artifacts and generated reference content are emitted as static assets or build-time outputs, with `/openapi.json` sourced from the API-owned generator in `apps/api/src/openapi.ts` through the core-owned `scripts/public-site-artifacts.ts` pipeline and the page-facing reference subtree hydrated from a locally generated `public/reference-data.json` snapshot
- **Key constraint:** Must remain deployable as a static export suitable for standard static hosting, with token-driven light/dark theming and minimal ownership of Fumadocs internals in the first pass.
- **Internal structure:** `app/layout.tsx` owns shared metadata, theme-provider wiring, and the client dogfooding bootstrap; `app/(site)/*` owns marketing and legal routes; `app/(docs)/docs/*` owns the versioned docs entry tree including the MDX catch-all docs route and `/docs/v1/reference/*`; `app/(blog)/blog/*` owns the blog index and dynamic post routes; `app/sitemap.ts` and `app/robots.ts` own static SEO outputs; `source.config.ts` owns the Fumadocs collection declarations; `content/docs/analytics/*`, `content/docs/cli/analytics.mdx`, `content/docs/api/analytics.mdx`, and the browser/MCP references own the public AnalyticsBundle guidance; the remaining `content/docs/*.mdx` and `content/blog/*.mdx` own authored docs/blog content; `src/lib/dogfooding.ts` owns explicit production `standard` AnalyticsBundle initialization for static site routes; `src/content-source.ts` owns the static-export-safe Fumadocs source wiring; `src/content-components.tsx` owns the shared MDX component map; `src/site-config.ts` owns route, nav, and theme constants; repo-root `scripts/public-site-artifacts.ts` owns build-time publication of `llms.txt`, `openapi.json`, schemas, example artifacts, and `reference-data.json`; `site/scripts/generate-public-artifacts.ts` owns search-index publication; `src/reference-data.ts` now carries the reference-data type contract used by page-time readers; `src/reference-content.ts` owns page-time loading of that generated reference snapshot; `src/components/*` owns reusable site, docs, blog, theming, and reference-table shells

---

### `packages/storage`

- **Owns:** All storage adapters: Postgres metadata, hosted improvement opportunity persistence, S3 object store, Redis queue, Redis frequency counters
- **Exports (via barrel `index.ts`):** All types, adapters, and service factories
- **Depends on:** `shared-types`, `auth`
- **Internal structure:**
  - `types.ts` — shared storage type definitions plus compatibility re-exports for split type modules
  - `queue-types.ts` — Redis queue client interfaces and typed job payload contracts
  - `alert-types.ts` — alert management, retention sampling, and alert-delivery type contracts
  - `operations-types.ts` — weekly report, operational email, token/project/account lifecycle, GitHub, collaboration, and webhook-delivery type contracts
  - `helpers.ts` — object key builders, token hashing
  - `auth-store.ts` — Postgres account creation, password credential, session, one-time token persistence, linked auth-method disclosure, and per-session login-method tracking
  - `account-store.ts` — Postgres account export aggregation for retained organization/project records and destructive account-deletion lifecycle persistence, including analytics/payment-retention handoff before org cleanup
  - `account-analytics-store.ts` — Postgres deletion-safe account analytics ledger, internal month/year/lifetime query helpers, aggregate admin analytics summary reads, retained-row backfill, and payment/provider retention snapshot persistence for deleted accounts
  - `integration-secret-crypto.ts` — shared encryption/decryption helpers for stored integration secrets such as Slack webhook URLs
  - `openai-oauth-schema-migrations.ts` / `openai-oauth-bootstrap-statements.ts` — ordered additive migration and clean-schema SQL for normalized grants/codes/refresh families plus encrypted provider artifacts
  - `openai-oauth-store.ts` — bounded grant/code/refresh lifecycle, revocation, reuse detection, and indexed physical-retention cleanup
  - `openai-oidc-provider-adapter.ts` — encrypted `oidc-provider` model adapter with category-separated HMAC lookup fields and transactional normalized-record mirrors
  - `metadata-store.ts` — Postgres metadata store (account membership, explicit project ownership + `project_members`, invite-token-backed `project_invites`, invite cancellation/acceptance, collaborator self-leave/removal with member-owned automation cleanup, project list/create + tokens + color tags, project dashboard metrics, incidents, probes, capture-policy/rule and GitHub-rule mutation flows, deployments, alerts including severity-threshold lifecycle scope, weekly-report aggregation, incident-event retention reasons)
  - `analytics-schema-migrations.ts` / `analytics-bootstrap-statements.ts` — production migration and clean-bootstrap SQL for project analytics settings, analytics ingestion ledgers, durable analytics usage counters including retained journey samples, aggregate rollups, journey sample indexes, analytics opportunities, and AnalyticsBundle generation metadata
  - `analytics-ingestion-jobs.ts` — narrow analytics aggregation job and persistence contracts kept outside oversized shared storage type files
  - `analytics-bundle-jobs.ts` — internal AnalyticsBundle build job contract used by the Redis queue lane for on-demand and scheduled generation work
  - `analytics-filter-options-store.ts` — observed route/dimension choices from scoped aggregate rollups; accepted-origin intersection, approved custom keys, per-field and total byte bounds, and omission of unsafe literals
  - `analytics-metrics-store.ts` / `analytics-incident-impact-metrics.ts` — Postgres aggregate AnalyticsBundle summary, route, journey-pattern, device, referrer, action, funnel, and incident-impact queries for API/CLI/MCP retrieval; incident impact reads only hashed incident/session links and aggregate ledgers, and reports unavailable conversion deltas explicitly
  - `analytics-visit-flow-store.ts` / `visit-flow-schema.ts` — bounded site-to-app handoff and arrival storage, source attribution, committed-account link, first bundle receipt, and shared acquisition/activation reports; forward migration and readiness gate keep existing installations compatible
  - `analytics-journey-sample-store.ts` — retained redacted journey sample metadata reservation, internal project-scoped correlation subject persistence, artifact-complete marking, list/detail reads, and project-scoped cleanup helpers; public reads only expose rows after artifact persistence completes
  - `analytics-opportunity-evaluator.ts` — evaluator orchestration plus funnel-dropoff and journey-friction candidates
  - `analytics-opportunity-regression-evaluator.ts` — bounded route-exit, deploy-conversion, incident-impact, and stale-resolution evaluators
  - `analytics-opportunity-recording.ts` — stable opportunity fingerprint upsert, relationship refresh, reopen/snooze rules, windows, and numeric normalization
  - `analytics-opportunity-scheduler-store.ts` — bounded cursor scan of enabled projects with recent aggregate session activity for scheduled opportunity evaluation
  - `analytics-opportunity-store.ts` — Postgres project and organization analytics-opportunity list/detail reads with project metadata, stable timestamp/record-ID cursors, and latest AnalyticsBundle generation status for API/CLI/MCP retrieval
  - `analytics-bundle-generation-store.ts` — Postgres internal AnalyticsBundle generation metadata lifecycle plus project and organization inventory reads with project metadata, deterministic input fingerprinting, idempotent reservation, pending-generation and exact queued-generation claiming, artifact-key completion, failure recording, and linked opportunity bundle-state sync
  - `analytics-rollup-store.ts` — Postgres analytics event ledger and idempotent hourly/daily session, route, route-transition, action/conversion/marker, and funnel rollup writes using hashed session subjects for unique counters
  - `analytics-correlation-store.ts` — privacy-safe incident/session correlation hashing and bidirectional idempotent reconciliation between grouped debug incidents and aggregate analytics route sessions; updates linked-session counters without coupling incident success to analytics availability
  - `analytics-usage-store.ts` — durable internal analytics allowance counters with atomic claim/release for hosted event/session, retained journey sample, and AnalyticsBundle generation quota enforcement without expanding the public billing summary response
  - `analytics-settings-store.ts` — Postgres project analytics settings reads with analytics-off defaults for existing projects and merge-upsert persistence for opt-in capture/retention/custom-dimension settings, preserving the approved-custom-dimensions cap invariant
  - `analytics-saved-funnel-store.ts` — Postgres saved-funnel definition list/create/update/archive lifecycle over the existing production table; create locks the owning project before checking the lesser of its stored and current-tier active-definition limits, and archived keys can be safely reactivated without deleting historical funnel rollups
  - `availability-check-store.ts` / helpers / executor — hosted health-check CRUD, secure target validation, single and batched due-check claiming, execution recording, incident linkage, and 30-day result/rollup retention; `availability-check-store-queries.ts` shares deterministic read/claim eligibility and excludes per-project excess before allocating organization execution slots
  - `ingestion-analytics.ts` — shared ingestion-side aggregation helpers that translate accepted/rejected batch outcomes into account analytics metric deltas
  - `improvement-opportunity-store.ts` — Postgres hosted improvement automation facade and occurrence recording; public imports remain stable. Types/shared helpers live in `improvement-opportunity-types.ts` and `improvement-opportunity-shared.ts`, canonical scoped reads in `improvement-opportunity-read.ts`, and original-namespace artifact/generation ownership in `improvement-bundle-metadata.ts`.
  - `incident-improvement-counts.ts` — Read-only filtered counts for first-page incident and improvement list metadata, wired through API dependency composition; analytics inventory stores derive totals from their filtered page queries only for opted-in initial requests
  - `improvement-opportunity-recording.ts` — shared hosted-improvement recording helpers (fingerprinting plus generic opportunity upsert/event-sampling SQL reused by multiple deterministic rules)
  - `slack-destination-store.ts` — Postgres reusable Slack destination CRUD plus worker-side encrypted-secret lookup
  - `alert-lifecycle.ts` — shared severity-threshold lifecycle scope defaults, matching, and dedupe key helpers
  - `billing-store.ts` — Postgres billing summary queries derived from organization plan, active-project counts, shared allowance-capacity units, and durable organization/project monthly usage counters
  - `alert-delivery-store.ts` — Postgres alert evaluation queries, immediate alert delivery-intent persistence, and queued email-digest persistence/claiming
  - `alert-group-inspection.ts` — project/organization-scoped, payload-free group summaries and keyset-paginated member incident IDs for direct deliveries and email digests
  - `schema-migrations-catalog.ts` and `storage-bootstrap-statements.ts` — additive `alert_delivery_members` schema for candidate coalesced direct-delivery membership; worker readiness requires the ordered forward migration before membership writes
  - `operational-email-delivery-store.ts` — Postgres operational email delivery ledger with dedupe and retry state for system-triggered owner notifications
  - `plan-cleanup-task-store.ts` — Postgres durable cleanup-task persistence for external cleanup side effects; downgrade cleanup currently preserves hosted improvement bundle objects rather than queuing object deletion
  - `webhook-delivery-store.ts` — Postgres webhook delivery persistence
  - `weekly-report-channel-store.ts` — Postgres weekly-report channel CRUD and scheduler lookup
  - `frequency-counter.ts` — Redis rolling frequency counter (1m/5m/1h/24h buckets)
  - `ingestion-rate-limiter.ts` — Redis-backed per-token ingestion rate limiting
  - `ingestion-services.ts` — ingestion metadata, member auth, persistence services
  - `s3-client.ts` — S3-compatible object store adapter
  - `redis-queue.ts` — Redis queue client (typed enqueue/claim/ack; atomic bounded stale-claim recovery)
  - `billing-sync-store.ts` — Postgres billing sync for Stripe webhooks (idempotent event dedup, entitlement updates, Stripe customer linking, entitlement revocation)
- `github-store.ts` — Postgres GitHub automation persistence for installations, project repo connections, dispatch-rule CRUD, worker-side dispatch matching/cooldown/rate-limit counters, and project-scoped dispatch-delivery claim/history/retry state
- `github-marketplace-store.ts` — Postgres GitHub Marketplace purchase snapshot persistence and webhook idempotency ledger, bridged to organizations by GitHub installation ID when available
  - `audit-log-store.ts` — Postgres audit log persistence (create, query by organization/action/time range)
  - `retention-store.ts` — Postgres tier-aware retention cleanup service (sampled debug event expiry by organization tier plus analytics raw/journey sample/AnalyticsBundle artifact/aggregate expiry)
  - `migrations.ts` — authoritative bootstrap schema and required-table manifests (not re-exported from barrel)
  - `schema-migrations.ts` — ordered forward migrations, migration ledger/checksum enforcement, and runtime readiness assertions for existing databases
- **Key constraint:** All external consumers import only from `index.ts` barrel

**Production DB rule:** Schema changes must never rely on bootstrap SQL or restart ordering alone. Use forward migrations, run them before API/worker consume the schema, and ship destructive cleanup only after compatible code has already been live.

### `packages/retrieval-client`

- **Owns:** Authenticated retrieval HTTP client shared by CLI and MCP
- **Exports:** `createRetrievalApi()`, response/error contracts
- **Key constraint:** Owns all retrieval path/query construction and response-shape validation

### `packages/token-management`

- **Owns:** Authenticated token lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createTokenManagementApi()`, response/error contracts
- **Key constraint:** Owns all token-management path construction and response-shape validation

### `packages/project-management-client`

- **Owns:** Authenticated project list/create/update HTTP client used by CLI and MCP project-management flows, including optional project color-tag metadata
- **Exports:** `createProjectManagementApi()`, response/error contracts
- **Key constraint:** Owns project-management path construction and response-shape validation so connect logic stays out of raw HTTP route strings

### `packages/alert-client`

- **Owns:** Authenticated alert lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createAlertApi()`, alert response contracts including severity-threshold lifecycle scope, structured API errors
- **Key constraint:** Owns alert path/query construction, delete success mapping, and response-shape validation for list/create/update/delete alert-rule surfaces

### `packages/webhook-client`

- **Owns:** Authenticated webhook lifecycle HTTP client shared by CLI and MCP
- **Exports:** `createWebhookApi()`, webhook/delivery response contracts, structured API errors
- **Key constraint:** Owns webhook path/query construction, delete success mapping, synthetic test-delivery request shaping, and response-shape validation for list/create/get/update/delete/test/delivery-history surfaces

### `packages/billing-client`

- **Owns:** Authenticated billing HTTP client shared by CLI and MCP parity flows
- **Exports:** `createBillingApi()`, `BillingApiError`, `expectBilling()`, billing summary Zod schemas
- **Key constraint:** Owns billing path construction, response-shape validation, and error mapping for billing summary retrieval and allowance-capacity management (increase, schedule reduction, cancel reduction). Does not expose checkout/portal (browser-session-only surfaces).

### `packages/github-client`

- **Owns:** Authenticated GitHub automation HTTP client shared by CLI and MCP for managing GitHub App installations, repository connections, dispatch rules, and dispatch delivery history/retry
- **Exports:** `createGitHubManagementApi()`, `GitHubManagementApiError`, response/error contracts, GitHub automation Zod schemas
- **Depends on:** none (internal packages)
- **Key constraint:** Owns all GitHub automation path/query construction and response-shape validation for installation listing, repo connection/disconnection, dispatch-rule CRUD, delivery history retrieval, and manual delivery retry. Does not own GitHub App credential management or dispatch execution (those are API/worker-owned).

## Storage Boundaries

| Store      | Owned By                                              | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `apps/api`, `apps/worker`                             | Core relational tables for auth, projects, incidents, improvements, alerts, webhooks, GitHub automation, billing, account analytics, availability checks, and AnalyticsBundle. The additive OpenAI migration adds normalized `oauth_authorization_grants`, `oauth_authorization_codes`, `oauth_refresh_tokens`, and encrypted/HMAC-indexed `oauth_provider_artifacts`; production must apply it before enablement.                                                   |
| Amazon S3  | `apps/api` (write), `apps/worker` (read/write/delete) | Raw events (`raw/{project_id}/{date}/{event_id}.json`) for retained sampled occurrences, failure bundles (`bundles/{project_id}/{incident_id}/bundle.json.gz`), hosted improvement bundles (`improvement-bundles/{project_id}/{opportunity_id}/bundle.json.gz`), reproductions (`reproductions/{project_id}/{incident_id}/reproduction.json.gz`), short-lived raw analytics events, redacted journey samples, and generated AnalyticsBundle artifacts                |
| Redis      | `apps/api`, `apps/worker`                             | Redis claimed-job queues, incident frequency counters, ingestion rate-limit counters, GitHub App installation token cache (50m TTL), optional caches. The OpenAI path uses bounded CIMD metadata caching, `private_key_jwt` `jti` replay protection, identity-aware rate limits, refresh-family coordination where needed, and the fail-closed MCP concurrency bulkhead; loss of that coordination closes only MCP unless Redis is also a shared primary dependency. |

---

## Data Flow Summary

### Ingestion Flow

```
SDK → POST /v1/events → API validates → split debug/analytics families → enforce capture policy/capture rules for debug or analytics settings/custom dimensions for analytics → S3 (raw accepted events only) → Redis queue → Postgres worker adoption → transactional incident stages / bounded follow-up jobs

Current execution detail: API request path does not persist incident metadata synchronously; worker-owned `normalize-events` and `group-incident` jobs perform normalization, event_class classification, grouping lifecycle persistence, sampled-occurrence retention decisions, raw-object pruning for demoted summary-only events, and transition evaluation. Exceptions, `error`/`fatal`/`critical` logs, request events in the preset-specific immediate request-failure set, status-wide client-error incident overrides, and matching path-scoped client-error incident rules classify as `incident_signal`; other request events remain `context_signal` and repeated unpromoted `4xx` telemetry does not open normal incidents. Free-tier billing counts only `incident_signal` events (INV-15).
```

### Retrieval Flow

```
CLI/API/MCP → GET /v1/incidents/{id}/bundle → API reads Postgres metadata → S3 (bundle artifact) → response

Webhook delivery status retrieval follows the same API/domain-store path (e.g., `GET /v1/webhooks/{id}/deliveries` reads Postgres delivery metadata).

Incident list/detail retrieval follows the same API/domain-store path and scope checks (e.g., `GET /v1/incidents` and `GET /v1/incidents/{id}` resolve member identity from `member_tokens` and enforce organization-scoped metadata queries).

Retrieval authorization is member-token based and metadata-backed: API resolves token hash from `member_tokens` and enforces organization scoping before returning retrieval payloads.

Current retrieval implementation includes scoped artifact and log surfaces: `GET /v1/incidents/{id}/bundle` (artifact or pending), `GET /v1/incidents/{id}/reproduction` (artifact), and `GET /v1/logs?incident_id=...` (incident-event log rows).
```

### Official OpenAI MCP Flow (Local Candidate Implemented)

The independent 1.0.2 package candidate is built by `scripts/openai-plugin-release-lib.mjs`. Its portal archive replaces the local Developer Mode mapping with a remote `.mcp.json` that explicitly declares OAuth and `extensions["com.openai"].auth.client.mode: "cimd"`. Discovery and the existing `private_key_jwt` provider policy remain authoritative; the twenty-three-tool wire contract and hosted runtime are unchanged. Owner screenshots on 2026-10-23 establish configured/authorized MCP, verified domain, all twenty-three expected tools and no findings in the latest metadata scan. Review information, reviewer-case execution and publication retain separate gates.

`scripts/openai-plugin-diagnostics.mjs` derives an identity-only compatibility connection-test archive without changing the canonical release manifest. It was not uploaded and is no longer needed for the identified blocker. A temporary browser-local correction to the portal's `none`-only CIMD predicate enabled the successful owner-operated connection/scan; its scope, twelve-case offline reproduction and portal evidence are documented in `apps/mcp/openai/submission/registration-diagnostics.md`. The override is not DebugBundle runtime code, and explicit override-disabled persistence remains to be confirmed. A portable variant was rejected during schema review and is not emitted. `make openai-plugin-diagnostics` writes only local artifacts; tests cover deterministic bytes, preserved credential-free OAuth/skill/review semantics and canonical-evidence isolation.

```text
ChatGPT/Codex
  → https://mcp.debugbundle.com/mcp
  → Caddy trusted surface marker + exact host validation
  → OAuth JWT/grant/account/scope verification
  → Redis rate limit + DB-aware admission bulkhead
  → isolated twenty-three-tool projection
  → package/API-owned dedicated readers
  → existing Postgres records and S3 artifacts only
  → redaction + field allowlist + strict output schema
  → structuredContent + compact text
```

The projection never calls the stdio tool factories, never imports `apps/mcp` into `apps/api`, never enqueues/regenerates/writes customer state, never reads raw logs for incident context, never queries individual journey samples or analytics-bundle state from its aggregate analytics tools, and never returns stored health URLs verbatim. The same API image/process and Lightsail host are retained. `.local-repos/debugbundle-cloud` owns DNS/Caddy/env/two-slot rollout/monitoring/retention changes, including atomic API+MCP promotion and the independently operated MCP-only no-deploy route gate; core owns runtime/domain/auth/storage/package contracts. Production now runs the managed dual-host path with OAuth, reviewer access, and MCP enabled for owner-approved Developer Mode validation. Owner reconnect and captured connection metadata are complete; three bounded ChatGPT cases, one fresh-thread Codex aggregate-analytics case, and the primary owner-client endpoint-health sequence pass. The owner then supplied the exact failed continuation inputs, allowing a public-handler regression to reproduce an order-sensitive strict-input equality check before the hosted reader. `packages/mcp-core/src/openai-contract.ts` now uses structural equality so JSON object member order cannot invalidate an otherwise schema-valid cursor request. Hosted run `33868241338` deployed the correction on the shared two-slot runtime; the migration ledger, immutable-image promotion, public API/MCP/OAuth checks, and installed-baseline alarm audit pass. The exact authenticated two-page continuation now passes and advances the opaque cursor without mutation; production telemetry records two admitted successful calls with no timeout or cancellation. The project-scoped improvement inventory also preserves an explicit empty result without broadening, hidden artifact reads, or mutation. Negative incident-resolution/health-check-deletion, secret-exfiltration, individual-analytics-journey, and generic-infrastructure requests are refused at the client boundary without MCP calls or claimed state changes. The secret case distinguishes public contract UUIDs and sanitized health URLs from excluded credentials, storage internals, database-only IDs, signed URLs, and raw URLs. The analytics case distinguishes aggregate funnel metrics from excluded identities/private journeys and unavailable funnel mutations, while the infrastructure case rejects unsupported Kubernetes telemetry rather than fabricating it; bounded production telemetry confirms all four no-call paths. Advertised OpenAI schemas now carry their transitive local `$defs` and serialize nullable unions as portable `anyOf` branches. Hosted run `33907119277` deployed that compatibility correction on the same shared runtime at API/worker digest `sha256:349c98954955643f3f14cb1070623bbf7c25d3e6b1402d35214bca9479d3fdb7`; all 48 migrations were already applied, the existing OpenAI/Caddy configuration was preserved, and the pinned data-free Inspector plus public API/MCP/OAuth boundary checks pass. Post-deploy authenticated catalog refresh remains separate live-client evidence. The controlled immutable-image rollback and roll-forward rehearsal, owner-approved deployed keyboard/screen-reader spot check, rotated reviewer credential, and outside-network fixed-tenant isolation smoke pass. The five superseded OpenAI-specific metric filters and alarms are not installed; the deployed hybrid boundary uses metadata-only DebugBundle incidents plus the free UptimeRobot readiness monitor. The retained synthetic reviewer corpus, representative load evidence, submission, publication, and discovery remain manual evidence gates.

The 2026-09-07 monitoring decision supersedes the uninstalled five-CloudWatch-alarm plan described above. `openai-operational-monitoring.ts` defines the finite fail-safe signal boundary, `dogfooding.ts` converts those signals into handled DebugBundle incidents, and the OAuth/MCP adapters report outside their domain transactions. Normal discovery and rejected bearer tokens are excluded from incidents. The private cloud baseline keeps its existing AWS alarms, forbids creation of the superseded OpenAI custom metrics, and assigns independent `mcp.debugbundle.com/ready` reachability/TLS coverage to the existing free UptimeRobot account. Monitor `803934645` independently reports `Up`; hosted run `34157207153` deployed the incident adapter on the existing shared API process, and one credential-free invalid-token probe verified the sanitized handled-incident boundary before that intentional incident was resolved.

`packages/mcp-core/src/openai-contract.ts` also owns the advertised-schema wire projection. It walks each tool's transitive local references, includes only the required `$defs`, and normalizes nullable array-form `type` declarations into equivalent `anyOf` branches. `scripts/openai-plugin-inspector-harness.ts` exposes this exact catalog over an isolated data-free stdio server for pinned strict Inspector validation. These local candidate checks do not authenticate, query customer data, or prove a production deployment.

On 2026-09-08, fresh authenticated Codex clients loaded the corrected three-starter-prompt package, enumerated exactly the frozen 23-tool catalog, and exercised every tool against production with at most two concurrent calls. Every call completed without mutation; empty analytics remained explicit, health URLs remained sanitized, and a failed existing improvement artifact remained a bounded result. This supersedes the earlier partial owner-client corpus and pending catalog-refresh wording above. The outside-network reviewer isolation smoke also passes after the owner-authorized credential rotation. The synthetic reviewer retained corpus and representative load evidence remain separate gates. `apps/api/src/event-loop-evidence.ts` supplies the remaining process measurement by atomically overwriting one bounded metadata-only file inside hosted-MCP API containers; it adds no public route, customer storage, or external monitoring stream.

### Webhook Flow

```
Worker lifecycle event (bundle.reopened / incident.spike_detected) → match enabled `agent_webhooks` by event + filters (environment/service/severity) → persist delivery intent (Postgres) → claim due deliveries by `next_attempt_at` → enqueue `deliver-webhook` jobs → real HTTP delivery attempt with HMAC signature + retry-state/observability updates → after 50 consecutive final failures auto-disable the webhook (`is_enabled = false`)

API test delivery (`POST /v1/webhooks/{id}/test`) → scope webhook to member organization → persist synthetic delivery intent already claimed for attempt 1 → enqueue `deliver-webhook` immediately → reuse the same signed worker transport + retry bookkeeping

CLI/MCP parity for synthetic tests stays thin: `debugbundle webhook test` and `test_webhook` both delegate to `packages/webhook-client`, which owns the shared `POST /v1/webhooks/{id}/test` request/response contract.
```

### Weekly Reporting Flow

```
build-bundle reservation → append deterministic `bundle_generations` history row → project creation seeds one enabled owner-recipient email `weekly_report_channels` row using browser timezone when available, otherwise UTC → API/CLI/MCP/web project settings manage explicit per-project `weekly_report_channels` with at most one email channel per project → runtime scheduler evaluates enabled channels in their configured timezone/day/hour → aggregate weekly bundle counts + new incidents + resolved incidents + regressions + top spikes for the computed 7-day window → suppress zero-activity projects → claim idempotent `weekly_report_deliveries` row per channel window → combine due email deliveries for the same recipient set and weekly window into one email with per-project sections while Slack remains project/channel scoped → render/send email via `packages/email` or post Slack webhook text → mark each delivery `delivered` or `failed`
```

### GitHub Dispatch Flow

```
Worker lifecycle event (bundle.created / bundle.reopened / incident.spike_detected / improvement_bundle.created) → match enabled `github_dispatch_rules` by event + filters (environment/service/severity/bundle_type and incident_status when applicable) + target cooldown check → enforce DebugBundle hourly dispatch caps (100/project/hour, 4000/installation/hour) and persist non-retryable `skipped` history rows for suppressed matches → persist delivery intent targeting either an incident or improvement opportunity (Postgres `github_dispatch_deliveries`) → claim due deliveries by `next_attempt_at` → acquire GitHub App installation token (Redis cache, 50m TTL) → POST `repository_dispatch` with event_type "debugbundle.incident" and client_payload (summary fields + API links, including `improvement_id` for hosted improvements) → update delivery status/retry state → retry on failure (1s → 5s → 30s → 2m → 10m, 5 attempts max)
```

### Agent Automation Flow

```
Webhook (bundle.created) → Agent receives → GET bundle → GET reproduction → analyze repo → propose patch → open PR
GitHub dispatch (debugbundle.incident) → GitHub Actions workflow triggers → public `debugbundle/action@v1` can fetch incident failure-bundle context when `incident_id` is present, while hosted improvement workflows can use `links.bundle` and a member token to fetch the improvement bundle when `improvement_id` is present → repository-owned automation analyzes → proposes fix / opens issue / creates PR

The action now lives in its own public repository, `debugbundle/action`. This core workspace keeps the workflow examples under `examples/github-actions/`, while local action-source work happens in the standalone clone at `.local-repos/action`.
```

---

## Local Project Files (`.debugbundle/` and `.agents/`)

```
.debugbundle/
  profile.json                — Project description (committed, validation_status tracked)
  local/
    events/                    — Raw SDK file-transport events (gitignored)
    browser-relay-spool/       — Browser relay durable delivery spool plus `.delivered` sidecars (gitignored, connected mode)
    state.json                 — Processing watermark, incident index (gitignored)
    connection.json            — Delivery policy per environment (committed)
  bundles/
    local/                     — Locally processed bundles (gitignored)
    cloud/                     — Cloud-fetched artifact cache (gitignored)

.agents/
  skills/
    debugbundle/
      SKILL.md                 — Agent skill per agentskills.io spec (committed)
      references/              — CLI, MCP, bundle-schema, profile-enrichment docs
      assets/                  — Analysis schemas and examples
      evals/                   — Evaluation fixtures
```

`debugbundle validate --fix` owns drift repair for generated skill content: it recreates missing files and refreshes stale managed skill references, schemas, and evals to the current CLI templates while preserving the reviewed profile.

See `/spec/local-first-onboarding.md` for the full layout rationale, gitignore policy, and artifact lifecycle.

---

## Self-Host Topology

```
docker-compose.yml
  ├── api        (Node.js / Fastify)        — startup preflight (DB schema + Redis + S3), GET /ready returns 503 on degradation
  ├── worker     (Node.js / Redis claims)          — startup preflight (DB schema + Redis + S3), internal health server on WORKER_HEALTH_PORT
  ├── web        (React + Vite SPA)
  ├── postgres   (PostgreSQL 17+)
  ├── redis      (Redis 7+)
  └── localstack (S3-compatible, replaces hosted S3)
```

Same core services as cloud. No feature differences except billing integration.

Both API and worker fail-fast at startup if any dependency check fails (missing DB tables, Redis unreachable, S3 bucket missing). The API `/ready` endpoint re-runs these checks on each request and returns `503 {status: "not_ready", reason}` when the stack is degraded. The worker exposes an internal HTTP health server (env `WORKER_HEALTH_PORT`, default disabled) whose `/ready` endpoint is used by the Compose health check instead of `pidof node`.

---

## Test Organization

```
tests/
  vitest.setup.ts              — Global test setup (jsdom matchers, cleanup)
  helpers/                     — Shared test utilities
  fixtures/                    — Golden fixture files
  apps/
    api/                       — API route, runtime, and dependency tests
    cli/                       — CLI command, routing, and auth tests
    mcp/                       — MCP tool surface tests
    openclaw-plugin/           — OpenClaw plugin package and manifest tests
    web/                       — React SPA tests (jsdom)
    worker/                    — Worker processor, runtime, and scheduling tests
  packages/
    alert-client/              — Alert client tests
    analytics-bundle-engine/   — AnalyticsBundle artifact builder tests
    auth/                      — Auth service and Postgres auth store tests
    bundle-engine/             — Bundle generation tests
    email/                     — Email rendering and transport tests
    event-normalizer/          — Event normalization tests
    redaction/                 — Redaction tests (moved to debugbundle-js repo)
    repro-engine/              — Reproduction engine tests (behavior, golden, redaction)
    retrieval-client/          — Retrieval client tests
    sdk-browser/               — Browser SDK tests (moved to debugbundle-js repo)
    sdk-node/                  — Node SDK tests (moved to debugbundle-js repo)
    shared-types/              — Shared type/schema tests (moved to debugbundle-js repo)
    storage/                   — Storage adapter, store, and migration tests
    token-management/          — Token management client tests
    webhook-client/            — Webhook client tests
    weekly-report-client/      — Weekly report client tests
    github-client/             — GitHub automation client tests
  integration/                 — Docker-backed ingestion integration tests
  contracts/                   — Cross-cutting contract and parity tests
  infrastructure/              — CI wiring and migration script tests
```

Test placement rules are defined in `rules/test-organization.md`.

Integration tests run serially (`--no-file-parallelism --maxWorkers=1`) to avoid cross-file state interference from shared DB/Redis.

---

## Repository Strategy

**This workspace** = the public core repo checkout plus local convenience clones. Core apps, packages, self-host assets, docs, and tests live here, while the public site repo lives at `debugbundle/site`. The real local `site/` clone now lives at the repo root, lower-touch companion repos live under ignored `.local-repos/`, and standalone SDK clones live under `sdks/`.

`/post-v1` is reserved for deferred planning artifacts and future feature candidates. It is intentionally non-authoritative and must not override the active V1 spec layer in `/spec`, `/contracts`, or `/rules`.

Environment-specific deployment configuration, operations runbooks, and other private infrastructure concerns are intentionally outside this public architecture map. The public hosting contract still requires private hosted deploys to run database migrations before new API/worker runtime, use image-based two-slot API rollouts with healthcheck assertions, keep production env rendering owner-only and redacted, enforce an edge ingestion body limit, retain exactly the active plus one verified previous stable release/image set with fail-closed target validation and pre-pull disk headroom, and attach bounded automated recovery to sustained external API health-check failure.

---

## Key Contract & Rule Files

| File                                      | Governs                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec/local-first-onboarding.md`         | Local-first product model, onboarding flow, SDK transport strategy, log-based capture, local processing pipeline, agent skill structure |
| `/spec/auth-architecture.md`              | First-party auth model: sessions, member tokens, project tokens, auth surfaces, credential flows, data model, API contract shape        |
| `/spec/openai-plugin-oauth-decision.md`   | Accepted `oidc-provider`/MCP SDK decision, compatibility stop conditions, and version/security discipline                               |
| `/spec/openai-plugin-threat-model.md`     | Official OpenAI OAuth, remote MCP, reviewer, output, same-host, release, and operational threat foundation                              |
| `/spec/hosted-remote-mcp-connector.md`    | Split between the approved OAuth-first OpenAI profile and deferred token-first arbitrary hosted clients                                 |
| `/spec/tech-stack.md`                     | Frontend framework, UI system, hosted cloud direction, deployment shape, sizing, operational baseline                                   |
| `/contracts/public-interfaces.md`         | API, CLI, MCP, webhook, SDK interface definitions + parity matrix                                                                       |
| `/contracts/data-schemas.md`              | Database tables, event envelope, bundle schema                                                                                          |
| `/contracts/openai-plugin-v1-data-map.md` | Field-level OpenAI result sources, transformations, bounds, privacy categories, and omissions                                           |
| `/contracts/sdk-interface.md`             | Universal SDK interface: core methods, vanilla hooks, log capture, framework integration                                                |
| `/rules/coding-standards.md`              | Code style, documentation style, environment detection, git conventions                                                                 |
| `/rules/design-discipline.md`             | Frontend/UI/UX, accessibility, layout, interaction, and design-system rules                                                             |
| `/rules/domain-invariants.md`             | Hard business rules (27 invariants)                                                                                                     |
| `/rules/architectural-constraints.md`     | Module boundaries, Docker-first, open-source rules                                                                                      |
| `/rules/package-standards.md`             | Multi-registry naming (npm/PyPI/Packagist), semver, CHANGELOG, error codes, type safety                                                 |
| `/rules/release-governance.md`            | Governance files, CI/CD spec, breaking change policy, test coverage targets                                                             |
| `/rules/sdk-testing-strategy.md`          | Cross-SDK testing tiers, transport mocking, contract compliance, CI pipeline per language                                               |
| `/rules/tdd-discipline.md`                | Red/green TDD protocol, test-before-code mandate, verification workflow                                                                 |
| `/rules/test-organization.md`             | Test directory layout, placement rules, naming conventions                                                                              |

### Incident reliability implementation

- `packages/mcp-core/src/openai-admission.ts`: bounded cancellable local admission, before shared Redis concurrency leases.
- `packages/mcp-core/src/operational-pressure.ts`: fixed-cardinality pressure sampling used by API dogfooding; endpoint guards and per-request logs remain authoritative.
- `apps/api/src/openai-mcp-operations.ts`: storage-adapter-aware artifact absence and generation-state explanations.
- `apps/api/src/openai-mcp-projections.ts`: command-string exclusion and conservative legacy placeholder replay feasibility.
- Hosted `apps/worker/src/processor.ts` no longer supplies platform deployment configuration to customer bundle builds; explicit local bundle-engine configuration remains supported.
- `packages/storage/src/improvement-opportunity-recording.ts`: numeric duration comparisons preserve fractional/large values without changing database shape.
- `spec/incident-reliability.md`: reviewed fixes, remaining ingestion/repair/scale-out boundaries and required capacity evidence before expanding hosted limits.

### Durable worker module boundaries

- `packages/storage/src/worker-job-schema.ts`: additive ordered migration and separate clean-bootstrap statements; `schema-migrations.ts`, migration compatibility checks and readiness own the migration gate.
- `packages/storage/src/worker-job-store.ts`: stable intent identities, fenced claims, dependency gating, bounded retries/retention and scoped metadata inspection/retry. `savepoint-queryable.ts` preserves nested transaction ownership; `processed-event-store.ts` owns normalization receipts.
- `packages/storage/src/metadata-store.ts`: compatibility composition barrel. `metadata-grouping.ts` owns occurrence/dedupe/retention writes; sibling `metadata-*` modules own project/access, incident lifecycle/read, bundles, tokens, probes, alerts and reports. Shared helpers stay in storage.
- `apps/worker/src/durable-queue.ts`: legacy Redis adoption, heartbeat/ack/failure orchestration and one-connection transactional callbacks. `durable-incident-processing.ts`: composition of scoped normalization/grouping/improvement stores and deferred lifecycle/object-delete work.
- `apps/worker/src/processor.ts` and `improvement-bundles.ts`: compatible barrels over normalization/grouping, artifact/context, alert/delivery and improvement evaluation/generation/publishing modules.
- `apps/worker/src/runtime.ts` / `worker-steps.ts`: fair incident passes plus a bounded independent delivery lane using shared resources. `worker-activation.ts`: explicit paused candidate state and activation marker; internal readiness exposes protocol and processing state.
- `scripts/worker-jobs.ts` / `make worker-jobs`: internal database operator inspection and explicit one-job recovery. Hosted images, staged promotion/activation and compatible-worker rollback remain owned by `.local-repos/debugbundle-cloud`.
- `spec/worker-durability.md`: exact transaction, retry, retention, resource, operator, migration and test contracts. API acceptance still spans S3 and Redis; the journal begins at worker adoption.

Analytics correlation locking is acquired before rollup writes in a separate statement (`lockAnalyticsCorrelation`), so overlapping analytics/incident transactions cannot both miss the other side. Durable job maintenance resumes full bounded batches at one-second intervals while backlog summaries remain once per minute.

## Incident evidence reliability extension

The JS SDK companion owns guarded native error hooks/field readers and stack URL sanitization (`native-error-hooks.ts`, `native-fields.ts`, `browser-stack.ts`). Its existing Node relay and the Java relay preserve the bounded browser context. `scripts/check-browser-evidence.mjs` is a disposable native Chromium-to-relay-to-bundle verification path, not a production service.

Core `event-normalizer/java-timer-message.ts` owns scoped v2 WildFly calendar normalization; ingestion supplies legacy v1 capture-rule aliases through the shared evaluator. `mcp-core/browser-evidence.ts` owns the additive bounded OpenAI browser projection. Worker `improvement-bundle-context.ts` canonicalizes storage timestamps before schema validation; storage occurrence recording preserves latest evidence on delayed arrivals. `storage/metadata-bundles.ts` resolves exact project/service/environment deployment history at the source occurrence; `bundle-engine/deployment-context.ts` reconciles it with time-scoped raw deployment evidence. See `spec/incident-reliability.md` for compatibility, hosted release verification and remaining SDK adoption, repair and capacity gates.

`redaction/browser-stack.ts` provides the server ingestion backstop for HTTP(S) browser stack URL privacy, including legacy SDK submissions.

The durable queue adapter treats reproduction `bundle_missing`/`bundle_invalid` outcomes as retryable failures instead of completed receipts. Browser stack sanitizers consume the full URL before separating stack punctuation, so parentheses within credentials/query cannot bypass redaction.

`storage/object-store-errors.ts` owns the shared explicit-absence classifier used by OpenAI artifact readers and incident/improvement context loaders. Non-absence storage failures propagate to bounded build retries instead of silently discarding available context.

Core 1.9.1 forwards `WORKER_START_PAUSED` through `worker-env.ts` into startup activation. Environment and full-startup regressions cover the paused boundary; the private cloud image build also verifies this wiring before publication. Hosted migration/activation and a bounded native-browser/improvement canary passed; broader capacity and customer adoption remain separate.

Core 1.9.2 aligns analytics bundle processing with the durable queue `dequeue` contract and removes its direct Redis acknowledgement. The shared worker lane owns completion/retry, including recovery after an artifact completes but its journal acknowledgement fails. Real runtime-composition and storage-backed analytics regressions cover this boundary.

- `apps/api/src/openapi-{model,components,foundation,projects,evidence,configuration,notifications,capture,agent}.ts`: source-backed public API documentation modules; the stable builder export remains in `openapi.ts`.

- `packages/runtime-logger/src/privacy.ts`: output projection for API/worker records, child bindings, HTTP metadata and fixed message identifiers before Pino serialization.

CLI runtime compatibility: `packages/node-http/src/index.ts` pairs the pinned Undici fetch and dispatcher for CLI/default MCP/scoped-agent reads, avoiding Node 26.0.0 compressed HTTP/2 header loss. `packages/retrieval-client/src/mutation-outcome.ts` carries fixed no-retry guidance for unconfirmed lifecycle mutations. `make cli-runtime-check` verifies clean installed CLI packages against synthetic loopback HTTP/1 and HTTP/2 servers across the supported Node matrix.

`apps/cli/src/verify-output.ts` owns verification report formatting; `verify-command.ts` retains the public local/cloud verification entry points. Retrieval command tests are split between rendering and authentication/source behavior without changing their fixtures.

Browser recovery and alert policy ownership: `shared-types/browser-recovery.ts` validates explicit sanitized failure candidates; `storage/browser-recovery-store.ts` indexes references and schedules durable enrichment with correlation locks, while `browser-recovery-schema.ts` supplies the forward migration and clean bootstrap. `retention-store.ts` removes expired index rows. `shared-types/alert-notification-policy.ts` owns channel noise configuration and stable per-rule policy; `alert-delivery-store.ts` serializes independent configured cooldown and burst checks before reading their snapshots. `apps/web/src/lib/alert-form.ts` holds the existing reusable alert form helpers, re-exported by the page to preserve import compatibility. Matcher summaries expose the new safety conditions through the existing shared text formatter.

Custom alert webhook signing: `webhook_payload_version` separates compatible legacy JSON from opt-in group-reference bodies. Migration `202609250002_version_alert_webhook_payloads` runs before new API/worker code; storage creates or atomically provisions per-rule CSPRNG secrets and custom delivery fails closed without one. Provider-native Slack/Discord authentication remains provider-owned.

### Hosted public flow consumers (2026-10-05)

The site and app consume Browser SDK 3.1.0 through their `lib/dogfooding-flows.ts` modules. Optional origin-restricted project configuration enables `site-acquisition` (site visit, app arrival, confirmed sign-in) and `product-activation` (successful project creation, incident read, bundle retrieval). The existing programmatic analytics policy and stored opt-out apply. These consumers use public flow APIs; no private account joins are introduced. Hosted build settings and definition provisioning belong to the private cloud repository.

Web shared styles use the vendored shadcn 4.1.2 Tailwind stylesheet (upstream MIT
notice retained) through `globals.css`. The component generator is a separate
development tool, not an app dependency; this removes its unused unpatched glob
parser from the installed graph while preserving existing component styles.

### Local interface parity candidate

- `apps/web/src/components/system/github-rule-fields.tsx` and `lib/github-rule-form.ts`
  own reusable GitHub form presentation and API serialization.
- Shared duration and lifecycle-event fields compose existing UI primitives.
- Alert form/delivery fields reuse create/edit presentation; `lib/api-alerts.ts`
  preserves existing imports through the API barrel. `alert-groups-card.tsx` uses
  shared response schemas and bounded scoped group/member inspection.
- Capture-rule creation form also renders full JSON matcher editing without changing
  rule identity; metadata and sampling go through the existing update API.
- Dashboard management test scenarios live in functional files with common helpers
  under `tests/apps/web/helpers/`. Other audited adapters remain in progress.

### Interface parity candidate boundaries

- `packages/shared-types/src/analytics-query.ts` owns the existing metric query schema
  and time resolver. API `analytics-contracts.ts` re-exports the same schema under its
  established name; dashboard filter validation uses it without moving domain reads.
- `apps/web/src/lib/api-alerts.ts`, `api-alert-groups.ts`, `api-webhooks.ts`,
  `api-agent-tokens.ts` and `api-incident-evidence.ts` are thin browser adapters over
  existing services. Analytics actions/samples reuse shared response schemas.
- Dashboard system components share duration/lifecycle/rule fields, bounded limits,
  resource confirmations, weekly-report schedule fields and one-time reveal primitives.
  Incident evidence tabs and agent credential management own scoped read/mutation state;
  project and detail navigation discards late results in changed paths.
- Analytics layout owns common metric filters; inventory filters reuse the workspace
  component with fixed project scope. Journey samples use the existing detail route;
  saved flow windows and worker specification-metadata limits remain explicit.
- `scripts/dev-mock` models newly exposed routes locally, including default-disabled
  agent issuance. It remains an opt-in synthetic simulator with no provider proxy.
- Functional dashboard management tests share `tests/apps/web/helpers` after splitting
  the oversized suite. Behavioral mappings accompany the documentation table.

Webhook test event adapters reuse the existing webhook-client enum and API/domain
test service. `test_webhook_event` is additive in ordinary MCP/OpenClaw; frozen
`test_webhook` metadata and restricted profiles remain unchanged. Behavioral tests
live in `tests/contracts/webhook-test-event-parity.test.ts`.

Billing confirmation and recovery live in packages/billing/src: stripe-upgrade-quote/preview, stripe-capacity-payment, stripe-checkout-confirmation and stripe-operation-reconciliation. stripe-webhook-transaction coordinates storage and notification outbox; billing-email-payload is shared with the operational-email worker. The web billing page composes the shared `billing-subscription-control` and interval-aware quote summary; billing-upgrade routes expose owner preview. Shared billing-client carries payment_required to CLI/MCP.

Scheduled plan changes: `packages/billing/src/stripe-plan-change.ts` coordinates persisted requests, `stripe-plan-change-quote.ts` signs/revalidates forecasts, `stripe-plan-change-schedule.ts` preserves and checks phases, and `stripe-completed-schedule.ts` handles subsequent mutations after the final phase applies. `apps/api/src/routes/billing-plan-change.ts` reuses owner admission from `billing-principal.ts`; `packages/billing-client/src/plan-change*.ts` owns additive contracts shared by web, CLI and MCP. The billing page composes `billing-subscription-control.tsx`; the legacy monthly API/CLI/MCP remain supported. Migration 202610220004 expands the shared reservation kinds. `make billing-stripe-test` executes the explicit disposable provider validation script; it is never part of ordinary tests or a production canary.

First-purchase restriction: `packages/shared-types/src/first-purchase-eligibility.ts` owns the pure elapsed-time rule; `packages/storage/src/billing-checkout-store.ts` enforces it with authoritative trial data and processed paid-invoice history under the organisation lock. Web presentation uses `billing-page-helpers.ts` and the reusable `components/system/billing-purchase-notice.tsx`, with the existing billing refresh lifecycle. Provider confirmation/webhooks remain separate from purchase admission. No response schema or database migration is added for the wait.

Dependency audit ownership: core and site each own an identical `scripts/dependency-audit.mjs` and `patches/` artifact set. Maintained schema code uses Zod 4.6.7. Already published dogfooding SDKs still require the pnpm-managed Zod 3.25.76 collection-bound backport until their ordered registry adoption. The auditor verifies every active legacy artifact before accounting for the exact owner-approved GHSA, retaining other severity gates. See `rules/release-governance.md`.

### Evidence candidate SDK module ownership (unreleased)

| Surface      | Owning modules and boundary                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java         | Native/retained-stderr evidence and revocable operations stay separate from the delivery worker. `EvidenceProtocol` shares canonical/proof/ACK/byte rules with servlet/Spring relays; `RelayHttpForwarder` owns the whole forwarding deadline.                                                                                                                                                             |
| Go           | `internal/evidence` owns canonical events, proof, ACKs and wire primitives. `operation_context.go`, `recovery.go` and `diagnostic_budget.go` own revocable scopes and pending receipts; `panic_evidence.go` retains hook-free observed panic evidence.                                                                                                                                                     |
| .NET         | Partial `DebugBundleClient` Capture/Preparation/Privacy/Flush/Queue files preserve public imports. `OwnedJson`, `CanonicalEventSchema`, `EvidenceWire` and `AcceptingJsonSize` own canonical boundaries; OperationContext/Recovery/DiagnosticCaptureBudget own scopes and charged receipts. `DebugBundleRelayHandler.Delivery.cs` and `RelayEvidenceState.cs` own forwarding/proof.                        |
| Android      | `DebugBundleCanonicalEventSchema`, `DebugBundleEvidenceWire` and `DebugBundleOwnedEvent` own canonical input; `DebugBundleBridgeJson` owns native bridge JSON. ExceptionEvidence/Operation/DiagnosticBudget own weak native snapshots, revocable scopes and offline receipt accounting. HTTPReply/EvidenceController/Delivery own bounded reads, path proof and final chunks.                              |
| Swift        | `DebugBundleClientCapture.swift` preserves public capture APIs. ExceptionEvidence/HTTPReply/EvidenceController own native collection and transport proof. `DebugBundleDeliveryQueue.refineBatch` preserves finalized queue ownership during compatible downgrade. Internal `DebugBundleRuntimeEvidence` SPI shares privacy/projection with CrashReporter; private atomic files bound next-launch recovery. |
| React Native | The JS facade owns canonical snapshots and local diagnostic ownership. Android/iOS wrappers preserve JS identity; the additive JSON-string bridge carrier keeps nested nulls through iOS object conversion. Native SDKs remain the queue, persistence and transport owners.                                                                                                                                |
| WordPress    | Settings/SdkBootstrap own evidence options and PHP request lifecycle. CachedConfigFetcher scopes local proof/policy by destination and token; cron refreshes remote state. BrowserAsset/relay/spool owners preserve the exact bundled browser capability and final native wire contract.                                                                                                                   |

Per-SDK `evidence-performance` Make targets compare the same inputs with evidence
off/on and queue pressure. JVM/V8 facade results do not qualify ART/Hermes devices.
Swift Darwin live/high-water allocation is distinct from cumulative allocation.
WordPress's optional staged-runtime comparison runs through the installed ZIP and
real WP hooks with a fake transport; it does not modify an existing site.

`record-sdk-evidence-artifacts.py` inventories existing source, package and receipt
bytes. Go/Android/Swift retain their own source-artifact recorders. Core CLI runtime
checks and native Codex checks consume packed candidates; release inventories
must match those exact tarballs. Java runtime tooling pins Maven 3.9.11 in its
qualification image without altering production dependencies. See STATUS and the
release handoff for current acceptance and open gates; module availability alone
never establishes SDK parity or publication readiness.

Native qualification tooling: `scripts/prepare-evidence-android-emulator.sh` provisions private pinned tools/images; `run-evidence-android-device.py` owns isolated ADB/device lifetime and hashes the installed APKs/Maven inputs. Android's installed consumer has an actual instrumentation test and ART comparison; `check-connected-evidence.py` rejects an empty connected gate. The RN synthetic app runs its packed facade on Hermes and separately verifies native HTTP delivery. `prepare-evidence-swift-floor.sh` extracts a signed official compiler under the workspace, and `run-evidence-swift-floor.sh` consumes the retained source archive with the installed macOS14.5 SDK. Swift's package manifest selects the existing LogHandler API below Swift6.2 and the LogEvent API/dependency floor on modern compilers. Toolchain provisioning never changes system compiler selection or grants release authority.

Runtime migration qualification: `scripts/rehearse-evidence-runtime.py` stages
git-owned candidate sources and an immutable predecessor archive, uses the private
cloud companion's unchanged runtime Dockerfile, and owns a disposable internal
Docker network. `runtime-evidence-schema-fixture.mjs` exercises the images' actual
storage and readiness functions. Image/context/fixture identities and HTTP
readiness/config receipts remain under `.tmp/evidence-release/`. These local
checks do not publish images or replace exact hosted rollout verification.

Swift native HTTP deadline ownership: `DebugBundleHTTPReply.ReplyCompletion` owns
one terminal continuation and both cancellation handles. Native reads keep their
byte/encoding cap and check cancellation; timeout does not await a late Foundation
callback. HTTP body encoding shares the request deadline. Swift 3.1.1 and the RN
Swift minimum carry this correction; other SDK timeout implementations do not use
the structured task-group wait that caused this failure.

Local trace correlation uses `event-normalizer/src/local-correlation-scope.ts`
to key project, environment and trace together. CLI processing and all bundled
MCP/OpenClaw readers reject mixed retained incident source events until an
explicit preset rebuild; valid legacy records remain compatible. Local summary
formatting lives in `apps/cli/src/local-processing-summary.ts`; functional trace
regressions and reusable processing fixtures are separate from general CLI cases.

Cloud artifact safety: CLI/MCP/OpenClaw share incident-ID validation in
`packages/retrieval-client` and the CLI cloud cache reuses
`packages/agent-setup/src/files.ts` for symlink checks, bounded reads and guarded
atomic writes. URL dispatch and cache side effects reject unsafe IDs first.

Retained local artifact boundaries live in `apps/cli/src/local-artifact-paths.ts`.
Retrieval, processing/rebuilds and cleanup validate canonical bundle/reproduction
metadata and reject symbolic links. Local state/event IO reuses managed file
helpers with allocation bounded to the opened file and atomic state/processing writes.

Referral finance uses `referral-ledger-schema.ts` / `referral-ledger-store.ts` for immutable canonical receipts, frozen service anchors, cumulative target deltas and manual payout claims. `packages/referrals/src/referral-finance.ts` separates verified personal partner reads from configured DebugBundle operators, using the existing `BILLING_ADMIN_OVERRIDE_EMAILS` allowlist. The optional API factory is `default-referrals.ts`; absent/invalid dedicated configuration disables referrals independently of authentication and debugging. New enrolment defaults off while retained finance reads stay available with the stable secret.

Referral routes share the validated `packages/referral-client` with CLI and ordinary MCP, including explicit external-payment recording confirmation. The browser uses its session/CSRF context; `/settings/referrals` provides versioned joining, public link/code, earnings and paginated minimal histories, while `/settings/referrals/payouts` is operator-only. Billing's code form includes an expected-workspace guard. Provider cash/line/refund/dispute adapters and the retained reconciliation outbox are now connected to an independent worker lane. The exact first-eligible-invoice benefit/recovery, early/deleted customer reconciliation and personal export are implemented; combined qualification remains in progress and does not activate the programme.

Financial handoffs use `referral-reconciliation-schema.ts` / `referral-reconciliation-store.ts` (candidate forward migration `202611070008_add_referral_reconciliation_outbox`). The signed webhook saves minimal resource/customer identity and a durable job together, before billing dedupe; failed handoffs request provider redelivery after ordinary entitlement reconciliation. The same event can fill its original customer binding after Checkout links the customer. No provider read runs in that transaction. `stripe-receipt-snapshot.ts` validates complete original invoice lines, allocated captured cash, linked credit-note/refund identities and dispute outcomes. It keeps unknown allocations held and waits for the triggering adjustment to appear in provider lists. Settlement currency does not change USD commission.

`referral-receipt-processor.ts` runs one financial job per pass in its own lane using existing worker claims. Bounded provider reads precede a fenced transaction committing the canonical ledger, retained event completion and job completion together. Expired/exhausted execution jobs cannot erase the retained financial intent; the outbox can dispatch a fresh attempt. Pending known events hold the relevant customer's positive earnings, and unknown scope conservatively holds all positive payouts until verified binding. Source identity survives account deletion. The shared Stripe factory now lives in `packages/billing/src/stripe-config.ts`; the API path re-exports it, and the worker can read the same price map without requiring a webhook secret. No provider/account configuration has changed.

Smart Report facts are separate from the existing weekly digest. `packages/smart-reports/src/report-period.ts` defines complete UTC days, Monday–Sunday weeks, calendar months and honest adjacent comparisons. `contracts/smart-report-facts.md` records source units, scope, coverage and sampling rules. `report-lifecycle-schema.ts` (candidate forward migration `202611070009_add_report_lifecycle_facts`) appends numeric incident/improvement transitions in the same transaction as each actual status/severity change. It retains no captured text and has no cascading incident FK: routine source pruning cannot erase a recorded resolution or invent one. Explicit project/account deletion removes its dependent facts. Original project/service IDs preserve merge-origin boundaries.

`report-lifecycle-store.ts` reads only accepted explicit origins, distinguishes resolution events from distinct resolved entities, and marks periods before the collection watermark or twelve-month cutoff incomplete. Separate bounded retained-history backfill deduplicates known source timestamps without claiming complete transition history or historical severity. Numeric cleanup uses the existing retention runner, UTC calendar-month cutoffs and bounded continuation. `report-source-text-store.ts` adds bounded full-consent redacted summaries, independent lifecycle refresh, original-content expiry and required privacy deletion guards. Numeric and text cleanup share the existing bounded retention runner with continuation. Bounded bundle-context collection, availability/analytics coverage, complete fact selection, durable generation, rendering and receipt-backed delivery use the report modules described below. The capped synthetic model evaluation is recorded in `evals/smart-reports/results-20261107.md`; it is separate from production activation.

Report collection uses `storage/report-collector-store.ts` and the additive
`report-collector-schema.ts` forward migration. The existing serial report lane
runs at most one SQL-only batch every five seconds while reporting is enabled,
resumes saved bounded cursors and checks the saved creator and frozen origins.
Initial numeric backfill gives way to five-minute bounded redacted summary
refreshes. This lane holds no locks over provider or object-storage work.

`storage/report-health-store.ts` records numeric observed recovery inside the
existing health executor's result transaction after a threshold-backed real
failing-to-passing transition. Its additive schema and bounded period reader feed
canonical report health evidence without URLs or raw retention extensions.

`storage/report-allowance-store.ts` and `smart-reports/report-allowance.ts` own
anchored monthly generation usage and bounded current-schedule forecasts. API,
CLI, ordinary MCP and the reusable Reports allowance Card share the same reader.
`billing/business-sales-policy.ts` separately gates fresh Business admission;
API composition requires an explicit launch switch and configured reporting/AI,
while existing paid subscription and reconciliation readers retain access.

`storage/referral-benefit-store.ts` and its additive forward schema retain the
identity-fenced first eligible customer invoice reservation. The pure decision
lives in `referrals/customer-benefit.ts`; read-only provider coupon validation is
in `referrals/stripe-referral-coupon.ts`. Current Owner/attribution checks and
provider/customer identity fences apply before reservation. Checkout preserves
its exact coupon/attribution request. Verified finalisation facts consume the
benefit independently of collected cash. `referral-benefit-reconciliation.ts`
prepares a persisted exact-draft intent after a zero/trial bill;
`referrals/stripe-benefit-recovery.ts` validates and updates only that invoice
outside locks. Lost acknowledgements read back/replay the same invoice. Missing
finalised discounts remain held for reconciliation. No provider programme is
activated by these local changes.

`storage/business-account-export.ts` adds fixed, bounded pages to the existing
browser-Owner account export. It reuses current report scope readers, exposes
only closed delivery/financial projections and keeps canonical report downloads
on their authenticated paths. Numeric pages preserve origin identity and current
retention. Default export data and artifact handling remain intact with an added
section manifest. Report-history and export cursors preserve database timestamp
precision so adjacent records cannot be skipped within a millisecond.

The private cloud companion verifies `business-tier-v1` image labels before
hosted migration/startup and protects the selected previous stable API/worker.
A sales-disabled bridge precedes a second verified image rollout and separately
authorised Business activation. Environment-only activation checks the retained
rollback pair; legacy source rollouts cannot replace a Business-aware runtime.
The helper is read-only and performs no deployment or provider mutation itself.

### Dashboard metadata and filter-choice composition

`pages/project-overview-page.tsx` retains the public ProjectOverviewPage and
IncidentTable exports; `project-overview-summary.tsx`,
`components/system/project-incident-table.tsx` and `lib/project-presentation.ts`
own the extracted summary, table and shared presentation. Existing incident and
bundle pages keep their handlers and imports. Analytics dimensions compose
`ObservedAnalyticsSelect` through `analytics-dimension-fields.tsx`;
`use-analytics-filter-options.ts` owns cancellable context reads through the
schema-validating browser adapter. `AnalyticsFilterPanel` exposes open changes
so only an open metric panel loads choices. Generation dialogs retain the
background filter container and never change its layout.
