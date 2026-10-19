# Notification preferences and daily incident digests

Status: released in core 1.18.0 on 2026-10-19 after owner approval. Production
verification and external distribution limits are recorded in
[the release evidence](notification-release-20261019.md).

## Product contract

Implements FR-ALT-08, FR-EMAIL-08, AC-ALT-10 and AC-EMAIL-05; extends FR-ALT-01/03/05/06, FR-EMAIL-07 and FR-AVC-02. Monitoring, ingestion,
incident lifecycle, evidence retention and signed lifecycle automation continue
while notification delivery is paused. Existing rules and delivery defaults remain.

- Account Settings and Project Settings expose the same reusable notification
  editor. Projects inherit account defaults; explicit project modes override them.
  Active account pauses always win. Each channel displays its effective policy.
- Personal preferences apply only to the signed-in user's email recipient. Shared
  destination preferences are explicitly labelled as affecting the team and require
  account-owner or project-owner/admin authority. Shared delivery restrictions and
  the recipient's personal restrictions both apply; neither can bypass the other.
- Email modes: immediate (existing short batching), daily, off. Slack, Discord and
  direct alert-webhook modes: immediate, off. Project modes may inherit. Personal
  preferences expose email only. Shared account defaults cover all current/future
  projects in that account; personal defaults cover accessible projects.
- Configured rule cooldowns remain effective across immediate and daily email.
  Both modes share the same atomic rule/key lock and pending/delivered history;
  converting an already-admitted short digest does not reapply its cooldown.
- Channel-selectable pauses support 24 hours, seven days, a custom future instant,
  and until resumed. Resume restores the saved delivery modes. All means every
  supported channel in the explicitly selected personal/shared scope, including
  destinations added later. Suppressed events are not replayed on resume.
- Availability incidents bypass daily batching. Explicit pauses and off suppress
  them, except when the pause explicitly allows health-check notifications.
- Authentication, security, billing and mandatory operational owner notices stay
  outside these operational-alert preferences. Optional weekly reports respect
  off/pause settings. Signed lifecycle webhooks and GitHub automation are separate.
- A daily email groups eligible incidents by project at a saved HH:mm and IANA
  timezone. It includes newly opened/reopened incidents that matched enabled email
  rules and remain unresolved at send time. It does not repeat an unchanged incident
  or send an empty email. Settings changes and loss of access are rechecked at send.
  Email policy changes wake pending batches immediately. Moving the time earlier
  uses the settings-change timestamp even if the worker restarts after that time.
  If that window is already sending or closed, late admissions and schedule moves
  remain queued for the next daily window. Future policy-only claims remain open
  to new incidents; a due email's fixed payload cannot gain unseen items.
  Switching to immediate flushes eligible pending incidents in a summary; other
  projects retain their own schedules. Pauses/off still suppress pending history.
- Durable pending references survive worker/provider failures. Claims are fenced,
  retries bounded, and windows advance only after successful delivery or deliberate
  empty/suppressed completion. Provider timeout ambiguity remains at-least-once.
  DST, missed scheduler ticks and process restart must not multiply logical sends.
  Daily mail has its own worker lane so large digest preparation cannot block live
  alert processing. A policy revision guard rebuilds a batch if settings change
  while it is prepared. Mail already handed to a provider cannot be recalled.
  Bounded cleanup retains daily metadata for 30 days; older replayed occurrences
  are discarded. Daily deliveries consume one existing alert allowance per
  project/batch; legacy short-digest transfers are not charged twice.
  A minimal per-project allowance ledger retains admission counts through incident
  deletion, queue cleanup, retries, rescheduling and coalescing. It contains no
  email address or telemetry and is removed with the project/account.

## Interfaces and design

GET/PATCH account and project notification preferences plus pause/resume operations
are available through the authenticated API, CLI and ordinary MCP. The hosted
read-only OpenAI and restricted-agent catalogs retain their existing scope.

The UI reuses semantic tokens and current settings layouts, Field/Select/Checkbox/
Input/Badge/Button primitives, labelled controls, visible keyboard focus, inline
validation, loading/saving/error/read-only states and stale-response guards. One
composable editor serves both scopes. The owner explicitly approved this design
proposal on 2026-10-18.
The opt-in local UI preview uses the same schemas and policy functions with
ephemeral notification state; it never queues mail or contacts a provider.

## Implementation sequence and verification

1. Shared schemas/policy resolution and tests; additive storage migration, durable
   preference records and daily queue; migration ledger/readiness coverage.
2. Delivery-time policy enforcement for direct alerts, existing email batches and
   optional weekly reports; durable daily scheduling/rendering; worker and real
   Postgres tests for retries, concurrency, resolution, access and resume behavior.
3. API authorization/CSRF/rate limits/audit, shared clients, CLI and MCP parity,
   OpenAPI/help/docs. Existing clients and frozen tool profiles remain compatible.
4. Approved reusable account/project settings UI and interaction tests.
5. Focused checks, typecheck, lint/format, relevant integration/full regressions,
   pre-ship audit and documentation reconciliation. Deployment must apply the
   forward migration before new API/worker activation; missing migrations fail
   readiness. Production and provider acceptance remain separate from local proof.

## Pre-ship review and local evidence (2026-10-19)

The reviewed data path is settings UI/API/client/CLI/MCP → shared policy schemas →
preference storage → direct/short-digest/weekly/daily worker delivery. Supporting
changes cover migration/readiness, billing allowance accounting, account export
and deletion, OpenClaw metadata, and paired handwritten/generated site references.

- Input and trust boundaries: strict shared schemas validate channel modes,
  schedules and pauses. Member/session authorization, project membership, shared
  management roles, rate limits and session CSRF remain enforced. Failure responses
  and persisted provider errors use fixed codes. Personal policy belongs to the
  actual email recipient. Weekly recipient filtering precedes grouping, so a
  recipient cannot receive another recipient's project content.
- Failure modes: tests cover concurrent settings changes and queue inserts,
  competing/expired claims, overdue-window coalescing, DST gaps/repeated times,
  provider retries, changed schedules, resolved/reopened incidents, disabled rules,
  removed membership, no empty mail, and no replay after pause/off. Preview bounds
  do not truncate eligibility checks or the total count. Conversion from short
  batching retains its original accounting status when later items are appended.
- Resource lifecycle: the daily lane has bounded item pages, a 25-incident preview,
  renewable leases and bounded retries. It uses the shared database pool and
  participates in worker shutdown. Indexed cleanup removes expired metadata in
  batches; foreign keys and account deletion remove scoped references and cancel
  pending mail. Disposable integration services and volumes are removed afterward.
- Schema safety: additive migration
  `202610180001_add_notification_preferences` is registered with the existing
  ordered checksum ledger. Real PostgreSQL tests retain populated legacy data,
  reject missing required tables, apply the migration, verify indexes and confirm
  idempotent reruns. Bootstrap remains empty-schema-only. Both hosted rollout
  scripts were inspected and run `db:migrate` before candidate API activation;
  there is no destructive schema step in this release.
- Contract alignment: FR-ALT-08/FR-EMAIL-08 and AC-ALT-10/AC-EMAIL-05, public/data
  contracts, system-email rules, glossary, overview/map and companion API/CLI/MCP
  references describe the implemented behavior. Ordinary MCP has 138 tools; the
  hosted OpenAI 23-tool and restricted-agent 5-tool catalogs are unchanged.

Initial implementation verification (superseded by the final review results below):

- Full regression suite: 525 passing files / 4,307 passing tests; 34 files / 162
  conditional tests skipped. Final follow-up: all 61 focused tests in 13 files
  pass, including nine real PostgreSQL integration tests and the final accounting
  regression.
- Focused coverage across 19 new source modules: 98.01% statements, 99.34% lines,
  98.16% functions, 91.06% branches; every module meets 80% on all four measures.
- Repository lint/typecheck, new-file formatting, shared/CLI/MCP/web candidate
  builds, OpenClaw bundle/native validation and companion site 41 tests/build/
  typecheck pass. The final typed weekly-recipient regression also passes all ten
  weekly-report tests. Core and site diffs pass whitespace checks.

This is local source/test/build evidence. No browser inspection, live provider
delivery, package publication or production rollout was performed. Release must
apply the migration before starting the new runtime, then independently verify
deployed readiness and delivery. Provider acknowledgement ambiguity remains the
documented at-least-once limitation.

## Final review follow-up (2026-10-19)

The owner-requested review reproduced and corrected these gaps before manual testing:

- Pending email previously waited for its old deadline after an earlier schedule
  change, and switching to immediate could discard it. Scoped wake-ups now rebuild
  schedules from the change timestamp, preserve concurrent wake-ups and flush
  immediate mail without sending unrelated future windows early.
- Daily allowance rejection omitted the existing mandatory limit notice. The
  rejection result now queues the same deduplicated operational notice.
- Usage previously depended on retained incident items. The additive allowance
  ledger preserves usage after deletion/cleanup and does not charge again when
  batches move or combine. Export/deletion and migration/readiness include it.
- A stale worker could create destination metadata during a failed reschedule.
  Ordered recipient/schedule locks and source lease validation now precede writes.
  Preference update locks also use a canonical scope key independent of object-key order.
- The opt-in local settings preview lacked notification routes. Its new in-memory
  adapter supports account/project inheritance, personal/shared policies, pause/
  resume, validation and read-only states using the production shared contract.
- Daily admission bypassed rule cooldowns, and live delivery could not see daily
  history after a mode switch. A shared storage query and atomic rule/key lock now
  preserve cooldowns in both directions, while distinct severity keys stay eligible.

Final verification:

- Full repository: 527 passing files / 4,314 passing tests; 34 files / 169
  conditional tests skipped.
- After the last cooldown compatibility fix: all 1,029 storage/worker/startup/
  preview regressions pass in 117 files. The final feature and integration gate
  passes 113 tests in 16 files, including 16 notification PostgreSQL cases plus
  existing migration and alert-deduplication integration suites.
- All 22 new source modules meet the 80% per-file coverage gates: 98.28%
  statements, 99.43% lines, 98.33% functions and 92.08% branches overall.
- Repository lint and the final changed-file lint pass. Final repository
  typecheck passes. Shared/CLI/MCP/web builds and the companion documentation's
  41 tests/build/typecheck pass, including the final artifact refresh. Generated
  OpenAPI adds only the six notification paths; all existing paths are unchanged.
  Native OpenClaw validation remains valid: its source/catalog did not change in
  this follow-up.
- Forward migration and missing-migration readiness, legacy data preservation,
  checksum/idempotency, cleanup, account lifecycle and interface authorization are
  covered. Both hosted rollout paths and self-host Compose run migration before
  activating dependent code; the self-host update/rollback guide is reconciled.

No known source or automated-test blockers remain for owner testing. Manual UI
acceptance, controlled live-provider delivery and production rollout/readiness
are separate checks; none were performed or claimed here. No commit, publication
or deployment was authorized.

## Owner layout correction (2026-10-19)

The shared account/project notification editor now uses one padded card body with
the standard field-group spacing and a separator between delivery and pause controls.
Removing the intermediate card footer removes its shaded strip and restores the
card's bottom padding. Account verification and sign-in cards follow Account data
export in the desktop sidebar and retain a single-column mobile reading order.
Notification actions, permissions and persistence are unchanged. All 38 existing
notification/account/project settings checks, changed-file lint, typecheck and
candidate builds pass. The local server serves the updated component; visual
acceptance remains with the owner.

## Pre-release review after owner refinements (2026-10-19)

The final review reproduced a lost-incident race in both schedule changes and new
admission delayed across a daily deadline. An incident could be appended after
the destination email's payload was fixed, then marked delivered without appearing
in that email. Both paths now require a writable pending window and carry late
items into the next daily window. Future claims used only for policy validation
still accept incidents for their original deadline. Source lease fencing and
allowance preservation remain intact. Real PostgreSQL tests failed before the
fix and pass for delivered, in-flight and future-window cases afterward.

The two-project system-email example now uses the supported `incident_regressed`
condition, so its regression label matches production delivery.

Verification evidence:

- The full 96-shard unit run passed 4,323 tests in 528 files. Its initial coverage
  gate exposed three storage modules exercised only by the integration suite.
  Added transaction, lease, admission, accounting and preference-update unit cases
  pass all 26 storage checks (23 added cases). Current storage coverage was merged
  with the full run using Istanbul, replacing the edited daily-store source map.
  The unchanged changed-code gate passes all 67 changed source files. Daily store,
  claims and usage each have 100% statement/line/function coverage; preference
  storage has 97.61% statements and 100% lines/functions.
- The final full integration run passes 174 tests in 34 files, with one conditional
  SDK-module fixture skip, including 21 notification PostgreSQL cases. The CLI timeout was increased
  to 20 seconds after a pre-existing reviewer-fixture setup exceeded five seconds
  under concurrent validation; assertions and fixture behavior were unchanged.
  Disposable integration containers and volumes were independently confirmed gone.
- Native OpenClaw validation and companion documentation's 41 tests/build/typecheck
  pass. API/CLI/ordinary MCP parity and frozen hosted/restricted catalogs remain
  aligned with the public contracts. The local API returns ready and the running
  dashboard serves the shared daily schedule controls.
- Repository lint and final changed-file lint, repository typecheck and final
  shared/CLI/MCP/web candidate builds pass. The 26 storage tests also pass after
  their final typed database adapters. Diffs pass whitespace checks and no changed
  source/test file reaches the 1,000-line hard limit.
- Hosted image/source rollout scripts and self-host dependencies run migrations
  before dependent API/worker activation. The additive notification migration,
  readiness failure before migration, installed-data preservation and cleanup are
  covered by real-service tests. This review introduces no further schema change.

No browser inspection, provider delivery, commit, publication or production rollout
was performed. Owner UI acceptance and controlled delivery/readiness checks during
the authorized release remain distinct from this local qualification.
