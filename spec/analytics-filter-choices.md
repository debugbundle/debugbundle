# Observed analytics filter choices

The owner requested dropdowns backed by available filter data, disabled when
choices are unavailable, a plus icon on Create flow, a stable background when
bundle generation opens, and a compact sample-tag input/button row with an
example placeholder. The requested UI patterns use existing Select, Field,
Button, Notice and dialog primitives/tokens (FR-WEB-06/08/09, FR-ANL-15/23/24/29).
No publishing or deployment is authorised by these UI requests.

## Data and compatibility

Existing metric reads do not expose countries or observed custom-dimension
choices. Add one read-only `/v1/analytics/filter-options` capability, with CLI
`analytics filter-options` and ordinary MCP `get_analytics_filter_options` parity.
Keep every existing endpoint, response schema and restricted agent/OpenAI tool
catalogue unchanged. No dependency or database schema change is needed.

- Reuse existing metric project access, read rate limits, time validation,
  retained-origin/service scoping, SQL parameter binding and privacy policy.
- Send `Cache-Control: no-store` on choices responses so HTTP caches cannot
  substitute old choices for fresh access/approved-key evaluation.
- Read observed route and aggregate dimension values only for the requested
  project, period, granularity and service/environment. Choices are independent
  of selected metric dimensions, so another value can be selected without first
  clearing the old one. Accept only these supported context query fields.
- Cap each field at 100 choices, with an explicit truncated marker. Use stable
  reach/value ordering, a total response byte budget and current approved custom
  keys (at most eight). Never shorten or redact a selectable value into a different
  filter; omit unsafe/oversized values and mark omission instead.
- Preserve actual values, including valid empty custom values. Do not invent
  fallback browser/device/country lists or unknown/direct/none values that do not
  exist in storage. Return no raw sessions, tokens or arbitrary dimension fields.
- New optional API dependency fails closed when unavailable; older servers leave
  dropdowns unavailable with a retry action, without affecting metric reads or
  generating anything. No AI, delivery or generation budget is consumed.

## UI

- Load one bounded options response when the metric filter panel opens; refresh
  for changed project/time/scope and ignore or abort stale reads. Clear old choices
  on errors or project changes. Preserve selection values rather than silently
  rewriting filters. Loading, empty and unavailable fields are disabled and have
  distinct help. Offer retry after failure and explain truncated option lists.
- Use observed dropdowns for route/device/browser/OS/language/country/referrer,
  UTM and authentication fields, plus approved custom-dimension value selectors.
  Keep the validated numeric metric limit as a numeric setting. Retain apply,
  reset, dismissal, exact query values, and inventory scope-only behaviour.
- Keep time-window/More filters mounted beneath the generation dialog. The dialog
  continues to own focus and block interaction, without changing layout beneath.
- Add the existing inline-start Plus icon to Create flow. Align Sample tag's
  bounded input and small Apply button like the page-limit row; use `e.g. loop`.

## Verification required

Reproduce the absent options endpoint and the background-removal regression.
Cover real PostgreSQL scoped values, retained origins, empty fields, limits,
multilingual budgets, approved keys and privacy omission; API access, invalid
queries and unavailable capabilities; API/CLI/MCP parity; UI loading/error/empty,
stale responses, existing selections, apply/reset and real option values. Run
root types, scoped lint/format, relevant regressions and the production build.
No browser review, production data write, paid request or deployment is needed.

## Qualification and pre-ship review - 10 November

Inventory: shared request/response schemas, scoped storage reader, additive API
route/default adapter/OpenAPI declaration, shared privacy projection, CLI and
ordinary MCP adapters/catalogue, browser read/hook/select composition, filter
panel open events, local mock and requested project/grid/plus/tag/modal changes.
No database shape, SDK, receipt, factual report, generation ledger, paid attempt
or restricted-tool contract changed in this follow-up.

Failure and trust review: strict context-only inputs; existing project/read-rate
and accepted-origin authority; parameter-bound SQL; current approved custom keys;
100 choices per field and a 256 KiB response budget; privacy omission rather than
rewritten literals. The browser cancels pending reads, ignores obsolete responses,
rejects project/scope mismatches and offers explicit read-only retry. Disabled
empty/unavailable fields preserve current selections. Literal all and empty
custom values are distinct from clearing. Pool clients are reused and hooks abort
on close/unmount; there are no temporary artifacts or generation jobs to clean up.
No schema migration is required because the read uses existing rollup columns.

The final review reproduced an order-only rejection in the new projection guard.
Semantic deep equality now ignores object property ordering while still rejecting
changed strings, array values or schema/privacy failures. This affects only the
new opt-in guard; existing analytics readers retain their projection behaviour.
All 26 focused API cases pass in `check-ordering.log`, with root types and scoped lint/format also passing.

Evidence under `.tmp/analytics-ui-consistency-20261110/`:

- Red: absent route, dropdown behaviour, disappearing background controls and
  order-only projection rejection, each captured before its fix.
- `check-qualified.log`: root types, scoped lint/format and 76 tests across ten
  API/CLI/MCP/mock/browser files. The final ordering case adds one API regression.
- `regressions-final.log`: 149 analytics/project/MCP compatibility tests across
  25 files, including preserved restricted and legacy catalogues.
- `integration-final.log`: all five real PostgreSQL tests pass, including actual
  consolidated origins, approved keys, empty values, privacy omission, limits,
  multilingual byte bounds and window/scope isolation. Disposable services removed.
- `build-options.log`: Docker dashboard production build passes; the existing
  large-chunk advisory remains. Local HTTP `served-options.json` confirms the mock
  supplies observed browser/country choices and empty UTM choices.

No browser investigation, production mutation, AI request, commit, publication
or deployment was performed. Deployment and business acceptance remain separate.

Unique coverage across the final compatible and focused runs is 220 regression
cases plus five database cases (the six filter-choice UI cases ran in both suites).
