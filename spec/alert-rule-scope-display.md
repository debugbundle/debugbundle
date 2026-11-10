# Alert rule scope display correction

Status: deployed in core 1.22.0 with CLI/MCP 1.20.0 after explicit owner release
approval. See [production release evidence](alert-scope-release-20261105.md) and
the remaining marketplace antivirus acceptance gate.

FR-ALT-03 / FR-PJS-03 / AC-PJS-02: retained automation scopes must be readable and
editable without implying broader coverage. The live read-only investigation
confirmed five original rules retain disjoint original project scopes. The alert
list response omits those scopes; the editor labels every null service filter
“All services”. Matching and delivery must continue to use the saved origin set.

## UI proposal (approved)

- Keep the existing alert table and edit dialog. Add a **Scope** column beside
  the condition, showing the effective service names, for example **App**,
  **Site**, or **debugbundle-api, debugbundle-worker**. An explicit single-service
  filter includes its environment. Large sets show a bounded list and remaining
  count. Only an unfiltered rule covering the whole current project says **All services**.
- Show the saved allowed scope beside the editor's **Service scope** field,
  separately from its selected service/environment filter. For a
  retained scope, label the unfiltered choice **All services in this scope** and
  offer only eligible service instances. Saving keeps the accepted project scope;
  this correction introduces no scope-widening interaction.
- Reuse existing `Table`, `Field`, `FieldDescription` and `Select` primitives,
  typography, spacing, muted text, focus and error patterns. Reuse the scope
  summary between the table and dialog; extract existing table concerns if needed
  to keep the page within its source-file size budget.
- Use normal wrapping within the existing responsive table container. Keep scope
  text visible without hover, accessible in reading order and operable with the
  existing keyboard controls. Add no custom colours, tokens, overlays or gestures.
- During unavailable/incomplete scope reads, show **Scope unavailable** or a
  clearly bounded summary. Never infer **All services** from missing metadata.
  Existing-rule service selection remains disabled when its allowed scope is
  unavailable, while other fields can save without resubmitting the service filter.

## Compatibility and implementation boundaries

### Alert list layout follow-up (10 November, owner requested)

Remove the generic Alert rule guidance card and the split-column layout so the
rules table, including its row actions, uses the available content width. Keep
the existing Card/Table primitives, tokens and responsive table overflow. Retained
Slack destinations, when applicable, remain below the rules as a separate section;
grouped deliveries follow. Keep the same create/edit/delete controls, permission
checks, scope summaries, and loading/empty/error states. No new component or
interaction is needed. This applies FR-WEB-06/08/09 and AC-WEB-09 alongside the
existing alert CRUD and scope acceptance. The user's removal request approves
this layout simplification.

Local qualification: 32 existing alert management, editing, options, concurrent
scope, scope-summary/editor and grouped-delivery cases pass. Root typecheck,
page lint/format, the production web build and whitespace checks pass. HTTP
confirms the existing mock preview serves the revised page. Pre-ship review found
no changed data, authority, effect, cleanup or schema paths: only the static guide
and split layout were removed, with the retained Slack section preserved. No
browser inspection, production write, commit or deployment. Evidence:
`.tmp/alert-rules-layout-20261110/`.

### Interface compatibility

Scope metadata is opt-in on the existing alert-list read. Default response shapes
must remain byte-shape compatible with installed strict clients. API, typed
client, CLI and ordinary MCP expose the same read option. The dashboard requests
it; confirmed create/update results remain successful if a follow-up scope refresh
fails, with unavailable metadata shown honestly. No new SDK, endpoint, MCP tool,
schema migration, secret exposure or alert-policy change is needed.

The shared storage/domain projection must use saved origin snapshots, current
canonical/retained view names and the actual service/environment filter. Reads
stay membership-scoped, bounded and complete-or-explicitly-truncated. Cover old
NULL snapshots, new global rules, partial/multiple origins, unknown/empty services,
explicit filters, renamed services, save/refresh failure and older servers.

## Verification

Reproduce the missing projection in existing storage/API/client tests first.
Exercise actual PostgreSQL merge and retained-scope reads; retain the existing
matching/delivery assertions. Verify ordinary CLI/MCP parity, strict predecessor
response shapes, UI table/editor semantics and save preservation. Run focused
Docker-backed tests, type/lint/format and relevant contract checks; reconcile
requirements, acceptance, public docs, overview/map and local STATUS. No browser
inspection is required or authorised by this task.

## Verified local backend result

The opt-in API/client/CLI/MCP path is implemented. The descriptor separates saved
origins and allowed services from the selected service/environment filter. Default
responses remain compatible with strict installed clients. Older-server fallback
is one same-origin read only; authorization failures are not retried. SDK names
and environments keep their existing nonempty-string contract.

Qualified: 5,245 tests in 652 files across 112 coverage chunks, including 110
actual PostgreSQL cases. Changed-source coverage passes for all 23 applicable
source files. Types, focused lint/format, shared-types/CLI/MCP/dashboard candidate
builds and the documentation build pass. A pre-existing discovery test assumed
single-quoted source paths; all four required links existed and their generated
output checks passed. The assertions now accept either quote style, and all 61
cases in that coverage chunk were rechecked with the unchanged runner before
combining the complete report. The original failure and recheck receipts are retained.
The historical legacy MCP fixture, existing tool description, required arguments
and approval flags remain unchanged; its guard allows only the documented
optional scope input.

The API test setup and read tests were extracted without changing assertions to
keep their functional files below the source-size target. No schema migration,
worker/SDK runtime, dependency, credential or production policy change is needed.
No new glossary term is introduced.

## Approved dashboard implementation

The table now shows effective scope, including the selected environment. The
editor separately explains the allowed scope and filters eligible instances by
saved origin IDs. Missing or invalid metadata disables only service selection;
other fields save without resubmitting the service filter. Clearing a filter keeps
the saved origin boundary and never sends `project_scope`.

Browser reads use cookie sessions and the shared strict-predecessor fallback.
Confirmed writes drop previous scope metadata; a bounded read attaches only
metadata matching the saved ID, timestamp and service filter. Failed or stale
reads keep the confirmed result and show Scope unavailable. Initial and follow-up
reads reconcile confirmed writes without hiding existing rules or restoring deleted
ones. A save refresh uses the current list limit; an incomplete-list error remains
visible until a read succeeds. Shared scope summary and table extraction reuse the
approved primitives and keep the page near the 800-line target. Dashboard behavior, older-server fallback, scope summaries,
failed inventory and failed/stale save-refresh cases pass. The pre-ship audit is
recorded with the verification receipts.

The local implementation/audit preceded release approval. Its raw receipts: `.tmp/alert-scope-fix-20261105/`.

## Final release-readiness audit

The audit added five regressions for overlapping reads/saves/deletes, failed
inventory reads and list-limit changes during a save. All 790 dashboard tests
were requalified; the combined result is 5,250 cases in 653 files/112 chunks,
including 110 PostgreSQL cases, with coverage passing for all 24 changed sources.
Final types, lint/format and candidate builds pass. Clean packed CLI/MCP installs
pass scope/default/fallback checks on Node 22/24/26; the shared package export passes.

No code blocker remains. ClawHub's existing 1.19.4 final reviews are clean, but a
fresh read still lacks required antivirus evidence. Its marketplace acceptance
gate remained open at audit time. The separately authorised release and production
verification are now recorded in the release evidence; antivirus acceptance is still open.
