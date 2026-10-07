# Interface parity remediation

Status: complete for local implementation and qualification on 2026-10-07; owner approved the dashboard proposal and reiterated existing design patterns.
Baseline: core checkout `f4ea8dc748f447e7a5e7252ec3e3a261cf975006`, audited 2026-10-07.
Scope: fix all identified parity defects with backward-compatible adapters, shared
domain behavior and regression coverage. Local qualification is complete. The owner
subsequently authorized production preparation and the release train; execution and
release evidence are tracked in `interface-parity-release-20261007.md`.

## Completion contract

Parity means an authorized caller can perform the same domain operation with the
same supported values, scope, permissions, and outcome. Different authentication,
presentation, and local orchestration are allowed only when explicitly documented.
The ordinary member-authorized MCP catalog is the management reference. The hosted
23-tool and restricted five-tool MCP profiles retain their narrower authority.
Browser authentication, interactive billing, SDK ingestion, and local filesystem
workflows remain intentional exceptions. GitHub installation management requires
explicit reconciliation rather than silently classifying it as an auth exception.

Use existing API/domain services. Prefer additive client changes and existing
routes. Do not enable gated agent credential issuance, alter quotas, weaken role
checks, or change stored data. If a missing operation requires schema-dependent
runtime changes, stop that slice for forward-migration/deploy design first.

## Ordered work and finding register

| ID     | Work                                                                                                                                      | Required regression evidence                                                                                                                                                                   | Requirement / acceptance                                   | State                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| PAR-01 | Preserve GitHub rule event arrays, enabled state, nullable severity, bundle scope, and advanced fields; expose all eight supported events | Unchanged save preserves a disabled multi-event rule; unsupported-in-simple-form events round-trip; intentional edits change only selected fields                                              | FR-GHA-07/14/18, AC-GHA-03/04/07/16                        | Complete; local qualification passed |
| PAR-02 | Alert editor accepts all valid cooldown seconds, clears severity with null, preserves supported channel and existing config               | 0/60/300/3600/604800 seconds round-trip; Any clears a prior severity; Discord remains Discord; config preservation across edits                                                                | FR-ALT-01/03/04/05, AC-ALT-04/06                           | Complete; local qualification passed |
| PAR-03 | Match GitHub creator/role authorization and permit downgrade cleanup separately from paid new-use gating                                  | Member creates/manages own rule, cannot manage another member's rule or connection; Free downgrade can remove repo/delete owned rules but cannot create/update/retry                           | FR-GHA-17/18a, AC-GHA-14/15                                | Complete; local qualification passed |
| PAR-04 | Add dashboard lifecycle webhook edit/delete/enable/disable/retry and complete test-event selection                                        | Owner/admin and creator permissions; disabled/failed delivery recovery; exact event/filter round-trip; deletion confirmation; quota errors                                                     | FR-WHK-02/03/05/07/08/09, AC-WHK-06                        | Complete; local qualification passed |
| PAR-05 | Add alert service scope, enabled control, digest window, project cooldown scope, signing reveal/rotation and grouped delivery inspection  | Creation/rotation reveal once; ordinary reads never reveal keys; role/creator enforcement; digest/direct cursor pages; hidden config fields preserved                                          | FR-ALT-05/06/07, AC-ALT-05/08/09                           | Complete; local qualification passed |
| PAR-06 | Complete dashboard analytics actions, journey sample inventory, metric/bundle filters, custom windows and hourly granularity              | Filter serialization matches CLI/MCP; query scope consistent across overview panels; sample cursor traversal; quota/disabled/retained/partial states; focused bundle validation                | FR-ANL-15/16/19/23/24/26/29, analytics acceptance criteria | Complete; local qualification passed |
| PAR-07 | Reuse capture-rule create/edit controls for matcher/action/sampling; CLI explicitly clears expiry                                         | Full matcher and action round-trip including lifecycle predicates; preserve existing rule identity; valid expiry update/clear; invalid input fails before HTTP                                 | FR-EVT-07a/07b, AC-EVT-07a/08g, INV-16                     | Complete; local qualification passed |
| PAR-08 | Add real-app proof via additive verify_app_event; preserve frozen verify_cloud                                                            | New catalog accepts nonblank service/traceId/requestId and handler selects CLI expectAppEvent; synthetic mode injection rejected; existing synthetic paths and frozen legacy fixture unchanged | FR-CLI-02, FR-MCP-02/03                                    | Complete; local qualification passed |
| PAR-09 | Add explicit CLI webhook filter reset                                                                                                     | Empty object reaches the existing update service; omission preserves filters; conflicting reset and filter options rejected; false remains a valid filter                                      | FR-WHK-03/07, INV-5                                        | Complete; local qualification passed |
| PAR-10 | Add dashboard scoped agent credential lifecycle                                                                                           | Owner/admin list/revoke; default-disabled creation yields explicit unavailable state; single-project authority and one-time secret presentation unchanged                                      | Project-scoped agent evidence contract, SEC-05/24          | Complete; local qualification passed |
| PAR-11 | Add incident context and paginated, level-filtered incident logs                                                                          | Same scoped API records and cursor behavior; missing/expired/partial artifact states; no unbounded fetch or raw destination secrets                                                            | Retrieval parity contract, INV-3/5                         | Complete; local qualification passed |
| PAR-12 | Remove dashboard-only fixed/default option limits                                                                                         | Alerts/webhooks/weekly report lists expose existing supported limits and bounded reachability; webhook history traversal; configurable improvement snooze; weekly channel config parity        | FR-WEB-09, public list/snooze/channel contracts            | Complete; local qualification passed |
| PAR-13 | Reconcile GitHub installation setup/disconnect across interfaces                                                                          | Preserve browser state-cookie handoff for install/reconnect; evaluate owner-organization disconnect adapters separately; retain creator/project scopes and downgrade cleanup                   | FR-GHA-18, AC-GHA-16, GitHub installation contract         | Complete; local qualification passed |
| PAR-14 | Replace documentation-only parity confidence with behavioral coverage and explicit exceptions                                             | Four-interface operation/option/role matrix; tests exercise schemas, command adapters and actual component requests; ordinary/hosted/agent catalog separation                                  | INV-5, FR-MCP-02/03, FR-ANL-23                             | Complete; local qualification passed |

For PAR-12, do not manufacture an exact total from a capped response or invent
unsupported cursors. Audit each underlying route first; use its existing pagination
contract, clearly label bounded results, and design any necessary additive API
extension with compatibility tests before implementation.

## Dashboard design system proposal

Use the existing Radix/shadcn nova primitives and app-owned wrappers. Reuse semantic
colors, theme variables, typography, spacing, radii, focus treatment and motion in
`apps/web/src/styles/globals.css`; no new visual tokens or package dependencies.
Keep existing project navigation. Actions and sample inventory belong within the
project Analytics section; context/logs belong within incident detail; credentials
belong in existing token/settings surfaces; delivery inspection belongs alongside
alerts and webhooks.

Composable component inventory:

- Shared field groups for rule events, severity, enabled state, service/environment
  scope, cooldown with explicit seconds/minutes/hours/days units, and expiry.
- Reusable create/edit forms with explicit values and preservation of fields that
  are not changed. Reuse the existing scope multi-select, capture matcher controls,
  Field/FieldGroup/FieldSet, Input, Select, Checkbox and Switch primitives.
- Existing dialog pattern for short edits; grouped full-width contextual forms for
  complex rule/analytics configuration. Separate optional advanced settings without
  hiding core behavior or silently rewriting advanced values.
- Existing table/list, badge, accessible action button/tooltip and pagination
  components. Reuse cursor controls where APIs return cursors; never imply an exact
  count when one is not available. Narrow layouts use established responsive reflow.
- Existing deletion confirmation and plaintext token reveal patterns. Signing keys
  and credentials are displayed only in the successful one-time reveal state and
  never persisted to browser storage or included in general list/error output.
- Reusable analytics filter toolbar with standard fields for explicit time window,
  granularity, dimensions and scope; apply the same normalized query to every
  affected panel and bundle-generation request.

Every interactive surface must cover loading, empty, pending, selected, disabled,
permission-denied, tier/feature-unavailable, quota, partial-data, error/retry and
success states. Preserve input on failure, block duplicate submissions, and ignore
stale requests after project changes/unmount. Use semantic labels, keyboard access,
visible focus, field-associated errors and non-color status cues. Destructive actions
name the resource and consequences. No novel interaction is proposed.

The owner approved this proposal and specifically requested following existing
design patterns. No further design approval is required for these patterns.

## Implementation and verification discipline

1. Add behavior-first regressions in existing functional test files; confirm red.
2. Implement the smallest compatible change; confirm green for its functional slice.
3. Refactor at natural boundaries before extending files at/above 1,000 lines;
   target 800 lines. Preserve import paths with barrels where needed.
4. Update public CLI help, MCP descriptions, contracts and user docs together.
   Update system/architecture summaries for changed modules and workflows. Include
   opt-in mock fixtures for newly exposed dashboard paths.
5. Run Docker-backed focused tests, schema fixtures, format/lint and typecheck, then
   the applicable full unit/integration/build gates. Review failure modes, authority,
   secret handling, partial failures and cleanup before marking a slice complete.
6. Re-audit every register row and record evidence and any intentional exception.
   Source/unit proof is distinct from browser, live and installed-client proof.

Browser/screenshot investigation is not authorized or required by the repository's
frontend contract. No production/provider requests are necessary for these fixes.
Final release/publication and hosted deployment remain separate owner-authorized work.

## Evidence

- Audit baseline: 256 API/CLI/MCP/web test files, 2,027 existing tests passed.
- Isolated read-only mocked component probes reproduced GitHub event/enabled
  rewriting and alert severity omission; synthetic schema/adapter probes reproduced
  the cooldown, MCP real-app options and CLI expiry-null gaps.
- Remediation evidence will be recorded per slice as it is completed; the baseline
  suite is not evidence that the defects have been fixed.

### Initial CLI/MCP implementation

- Added `verify_app_event` to ordinary and local-auth MCP plus the existing OpenClaw
  projection, delegating to the CLI verifier. Its strict schema rejects synthetic
  modes and requires a nonblank scope hint. Existing `verify_cloud` remains frozen.
- Capture-rule update accepts `--expires-at null`; omission/date behavior remains
  unchanged. Real command validation still rejects invalid dates before API dispatch.
- Webhook update accepts shared-schema-validated `--filters-json`; `{}` clears all
  filters, omission preserves them, false-valued filters remain valid, and mixing
  explicit JSON with individual filter flags fails before dispatch.
- Extracted webhook argv handling to its own functional module and kept the original
  import path as a re-export, avoiding further growth of the combined handler.
- The new regressions failed before implementation (20 failures, 10 existing cases
  passing). Initial focused qualification passed 7 files / 71 tests and typecheck.
  The expanded suite exposed the frozen legacy metadata requirement. Preserve that
  fixture unchanged and use an additive tool; final regression gates follow below.
- GitHub install callback requires a matching signed browser state cookie. Returning
  the API-generated URL from CLI/MCP alone would lose that cookie and fail callback
  validation. Retain an explicit browser handoff; do not weaken state validation to
  manufacture automation parity. Organization installation disconnect is a separate
  owner-only operation and is not equivalent to removing one project's repository.

### Dashboard editor and delivery inspection implementation

- GitHub create/edit uses shared event checkboxes for all eight lifecycle events,
  independent bundle scope and incident status, enabled state, exact duration units,
  and existing project scope controls. Legacy null scopes are preserved by omission
  because the write contract rejects null. Member creator permissions and downgrade
  cleanup are separate from paid create/update/retry gates.
- Alert create/edit shares fields for exact duration, nullable severity clearing,
  Discord and existing raw Slack destinations, service scope, enabled state,
  optional digest window and immediate-channel cooldown scope. Signing opt-in and
  rotation use the existing one-time reveal primitive; general rule state excludes
  the returned secret. Group and member inspection uses the existing scoped API,
  bounded cursor requests, tables, pagination and retry states without invented totals.
- Capture-rule editing reuses the creation form's action, sampling, enabled and
  expiry controls. Its existing JSON editor presents the complete matcher so arrays
  and advanced lifecycle predicates remain editable and lossless. Shared schema
  validation rejects invalid matchers before HTTP. Unchanged expiry is omitted to
  preserve stored seconds and milliseconds. Sampling supports the API's 0–100% range.
- The oversized legacy management suite was split into functional files with common
  helpers; original scenarios and request assertions remain. Interaction assertions
  now use the approved event checkboxes and explicit duration unit controls.
- CLI/MCP/OpenClaw regression: 123 files / 835 tests pass, including the unchanged
  frozen legacy MCP fixture. Initial GitHub/alert regressions: 8 failures reproduced,
  then all 12 passed. Alert options: four failures reproduced, then all 11 alert
  option/noise cases passed. Exact duration + existing alert editing: 21 tests pass.
  Group cursor/error inspection: two tests pass. Capture editing: two failures
  reproduced, then 11 new/existing capture tests pass.
- Remaining dashboard operations, bounded options and the GitHub disconnect adapters
  are implemented below. Final coverage/lint/typecheck/regression qualification is
  still required. No release or live acceptance is implied by these checks.

### Remaining dashboard and installation implementation

- Webhook create/edit preserves all events, disabled state and false/empty filters.
  Named delete confirmations and retry use existing owner/admin/creator services.
  Failed/disabled retry requires the endpoint to be enabled. Limit controls expose
  the existing 1–100 caps without inventing cursors.
- Analytics Actions and retained sample inventory use shared response schemas.
  Common metric validation reuses the original API schema and resolver, re-exported
  at the existing API import path. All dimensions, exact UTC/relative windows,
  hourly granularity and bounded results are exposed; overview opportunity scope
  is coherent. Project inventories reuse workspace kind/status filters. Generation
  accepts exact timestamps, relative durations, opportunity context and JSON metadata.
  Saved flow windows and worker scope-versus-metadata semantics remain explicit.
- Scoped agent credentials use existing list/create/revoke services, owner/admin
  gates, default-disabled creation, future bounded expiry and one-time secret reveal.
  Incident Context and Logs use existing redacted context and cursor/level metadata.
- Weekly email deletion, full schedule/timezone, enabled state and direct Slack
  webhook or connected destination config retain tier and role gates. Email channel
  uniqueness remains deliberate. Lists expose 1–100 caps; custom improvement snooze
  supplements the existing seven-day shortcut.
- GitHub organization disconnect is additive in client, CLI, ordinary/local-auth MCP,
  OpenClaw and dashboard. Organization owner scope and all-project repo cleanup are
  explicit; Free downgrade cleanup remains allowed. Browser install/reconnect keeps
  the signed state-cookie handoff. Ordinary catalog is now 130; hosted 23 and agent
  five remain unchanged; legacy metadata fixture remains untouched.
- Changed management flows cancel stale reads and discard late mutations after
  project/detail navigation. Secret results cannot appear in a later project context.
  Reused confirmations, fields, tables, tabs and responsive overflow retain existing
  design patterns. No dependency, theme/token, schema or production-config change.
- `scripts/dev-mock` has contract-valid synthetic actions, samples/artifacts, incident
  evidence, agent lifecycle availability, group reads and GitHub disconnect fixtures.
  It remains an opt-in simulator with unusable synthetic credentials and no proxy.
- The four-interface operation/option/role matrix and intentional exceptions are in
  `spec/interface-parity-matrix.md`. Functional request/dispatch tests supplement the
  pre-existing documentation assertions rather than replacing server-domain tests.

### Pre-ship review

Reviewed changed CLI/client argv and transport; MCP catalogs/legacy projection;
shared analytics schema/API alias; dashboard rule/evidence/credential/analytics/weekly
state; and opt-in fixtures. Invalid input is rejected before dispatch where applicable;
server domain validation/authorization remains authoritative. Pending actions preserve
input on failure and block duplicate ordinary UI submissions. Context cancellation,
late result guards and secret separation cover navigation and partial failures.
Browser mutations keep CSRF headers; scoped agent credentials never become management
tokens. No schema migration or new storage/provider resource is introduced. Existing
legacy metadata and published artifacts are not changed by local builds.

The initial full unit run exposed a provenance-fixture coupling: its committed-source
OpenAI release assertion was reading the edited working tree. The verifier correctly
rejected that tree. The test now verifies the same manifest/hash assertions in an
isolated local committed-source checkout, with a separate regression proving tracked
source edits still fail closed. All 13 release-automation tests pass; neither the
production verifier nor historical manifest was changed. Direct release verification
on the uncommitted candidate remains a separate release-preparation gate.

Initial integration qualification passed 139 cases with one skipped and one fixture
seeding timeout under concurrent heavy checks. The original timed-out test then passed
in isolation in 2.4 seconds, retaining its assertions and five-second timeout. Local
Compose services and disposable volumes were removed after both runs.

Final qualification outcomes are recorded below; the initial results above retain
the evidence of defects and coverage gaps corrected during this work.

### Final re-audit correction

The option re-audit found an additional PAR-04 adapter gap: the API accepts all eight
webhook test events while CLI and legacy MCP accept only verification events. Eight
new cases reproduced the mismatch. CLI/shared-client event types now accept the
existing full enum; MCP/OpenClaw use additive `test_webhook_event`, preserving the
frozen `test_webhook` descriptor and legacy default. No API, domain, storage or payload
shape changed. The ordinary catalog is 130; hosted 23 and agent five stay unchanged.
The interrupted coverage run is superseded by final qualification after this fix.

The final payload re-audit reproduced six synthetic lifecycle envelope parser failures.
`SyntheticWebhookTestPayloadSchema` now extends the retained verification test schema
with the existing complete event enum, and the shared payload union accepts both real
lifecycle payloads and all existing synthetic test envelopes. The API's emitted shape,
legacy schema, payload signature and storage behavior are unchanged. All eight test
event envelopes have explicit parsing regressions.

### Final qualification and reconciliation

- Full Docker unit qualification: **4,066 tests in 497 files across 91 shards pass**.
  The current run's merged coverage is 86.65% lines, 89.09% functions, 76.92%
  branches and 85.81% statements. The repository's changed-source gate passes for
  **all 73 changed source files**, including ten qualified by covered changed lines.
  No coverage threshold was relaxed and no historical coverage was merged.
- Final disposable PostgreSQL/Redis/S3 integration qualification: **140 tests pass
  in 31 files**, with one optional built Browser SDK case skipped because
  `INTEGRATION_FLOW_SDK_MODULE` was not supplied. API/domain scope, roles, cleanup,
  delivery and storage behavior remain covered. Local integration resources were
  removed after the run.
- Full lint, final focused lint, full typecheck, candidate builds, site checks and
  OpenClaw build pass. Installed CLI and published-version upgrade checks pass on
  Node 22, 24 and the tested Node 26 releases. The frozen legacy MCP fixture is
  unchanged; ordinary/local-auth MCP has 130 tools, hosted OAuth 23 and agent five.
- Pre-ship review covers all fourteen register rows: input/schema validation,
  owner/admin/creator and tier/feature authority, disabled/expired/partial states,
  bounded lists and cursor behavior, lossless edits, failed mutation retries,
  stale requests, duplicate submission prevention, secret redaction and one-time
  presentation. All changed TypeScript files are below the 1,000-line hard limit.
  There is no database schema change or migration/deployment dependency.
- Requirements, acceptance, public interface contract, CLI help, MCP descriptions,
  public site guides, system/architecture summaries and the operation/option/role
  matrix match the implementation. Existing components, tokens and interactions
  are retained; no dependency, theme or lockfile change was introduced.
- Final logs: `/tmp/debugbundle-parity-unit-final-qualified.log`,
  `/tmp/debugbundle-parity-integration-complete.log`,
  `/tmp/debugbundle-parity-payload-quality.log`,
  `/tmp/debugbundle-parity-site-final-qualified.log` and
  `/tmp/debugbundle-parity-cli-final-qualified.log`.

All fourteen audited findings are patched locally. The documented interface
differences remain deliberate: browser state-cookie authentication/setup handoff,
restricted MCP profiles, bounded API lists, supported saved-flow windows and
analytics worker scope versus specification metadata. Browser/provider/live checks,
release preparation and publication are separate; no commit or deployment occurred.
