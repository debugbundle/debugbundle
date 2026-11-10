# Analytics UI consistency

## Requested design and scope

The owner requested right-aligned flow actions, readable state labels, consistent
button sizing, narrower filter menus, compact opportunity/bundle controls and
modal flow creation and analytics-bundle generation. These instructions approve
the following reuse of existing patterns (FR-WEB-06/08/09, FR-ANL-19/23/24/26/29/30,
AC-WEB-09, AC-ANL-16/21 and the public flow acceptance).

- Reuse AnalyticsSectionHeader and small Button actions beside Refresh. Flow
  metadata and edit/archive actions share a wrapping Card header, with actions at
  the right on desktop and an unclipped row on smaller screens. Multi-action
  section toolbars wrap below the title on mobile/tablet widths.
- Flow create/edit uses Dialog and DialogFormContent, size lg, with its existing
  fields and schema, a scrollable body and persistent Cancel/Save footer. Restore
  focus to the initiating control. Validation/provider errors retain the draft;
  pending submission blocks dismissal and duplicate mutations. Project changes
  and unmounting suppress late UI updates, without retrying a write.
- Bundle generation uses the same form-dialog composition over its existing
  inventory. Retain `/analytics/bundles/new` as a nested modal route, preserving
  the underlying list's filters/page size and restoring focus on cancellation.
  Direct links still work. Successful submission opens the existing generation
  detail; quota/access/validation errors retain the form. No implicit generation.
- Use the existing w-96 desktop filter width with viewport bounds, one column,
  scrolling and persistent actions; retain the existing mobile Sheet. Remove the
  extra-wide option. Inventory Filters belongs beside Refresh and generation in
  the section header, rather than occupying an otherwise empty row. Existing
  page limits and filter apply/reset/dismiss semantics remain available.
- Inventory scope menus expose service/environment only: device, campaign,
  metric-limit and other metric-only filters are not supported by those list
  queries. Keep metric choices when switching tabs, hide their unapplied chips
  from inventory views, and omit them from bundle-generation defaults there.
  Resetting inventory scope leaves metric choices intact. Inventory status/kind
  and pagination continue using their existing supported query fields.
- Share the existing label formatter for system enum labels. Fix plain-text flow
  purposes, action kinds, device/browser/platform categories, journey/bundle and
  incident-impact category summaries, and applied-filter labels. Preserve
  customer names, routes, origins, source/campaign values, IDs and query values.
  Existing ready/pending/failed/archived badges, partial coverage, errors and empty
  states keep their meaning. No new colours, tokens, overlays or interaction types.

No dependency, API, schema, scope, quota, provider budget or backend behaviour is
changed. Publication/deployment remains a separate owner action. Verification is
source/tests and local HTTP only; browser review has not been requested.

## Verification

Four modal/focus/pending regressions failed against the original inline/page
flows. Two further regressions reproduced ignored metric filters appearing on
inventories. All pass after their fixes. Existing generation field markup and
validation helpers are preserved (apart from equivalent formatting/grouping);
`form-preservation.json` records the comparison.

The full dashboard run passed 917 of 918 cases; the remaining test expected the
removed wide, three-column filter layout. Its expectations now match the requested
bounded, single-column menu. The final affected run passes 103 tests across 14
analytics/flow/creation/workspace/impact files, including both new inventory-scope
cases, retained filter/limit state, focus, viewer access, quotas, draft errors,
pending duplicate/dismissal guards, enum labels and unchanged query values.

Final root types, lint/format for all 29 changed source/test files, the production
dashboard build and whitespace checks pass. The earlier full run and final
affected run qualify all 920 dashboard cases across those runs. Local HTTP reads
confirm the updated preview modules. Evidence:
`.tmp/analytics-ui-consistency-20261110/{red,filter-scope-red,check,check-final,build-final}.log`
and `preview-check.json`. No browser review, provider call, data write, commit,
publication or deployment was performed.

## Pre-ship review

- Inventory: shared dialog close-focus support, analytics headers/filters/labels,
  flow form/controller, bundle modal route and parent inventory, and their related
  category displays. Existing public URLs and API payloads remain compatible.
- Failure states: schema validation, scope restrictions, readable partial/error
  states and quota errors remain. Rejected form attempts retain drafts. Modal
  pending guards prevent duplicate writes and dismissal; existing generation and
  new flow UI fences suppress late effects after project changes/unmounting.
- Authority: owner/admin flow management stays gated by current project context;
  server authority remains decisive. No new data, raw HTML, credential, provider
  or trust boundary. Category formatting does not rewrite stored facts or query
  values. Inventory menus no longer imply unsupported filtering.
- Cleanup: no new listeners, intervals, clients or storage. Existing read cleanup
  and React/Radix dialog focus management remain; focus restoration checks that
  its initiating control is still connected.
- Contracts: public flow step/origin bounds, versioning/archive and aggregate
  caveats are retained. Analytics generation validation is unchanged, including
  incident access, scope, UTC windows, idempotent admission and quotas. No schema
  or deployment migration applies to this presentation-only slice.

The owner-requested observed dropdown choices, Create flow Plus icon, persistent
modal background, compact sample-tag control and metadata grid are qualified in
[the filter-choice follow-up](analytics-filter-choices.md) and
[project-details layout](project-details-layout.md). Earlier generation, inventory,
access and layout decisions remain in effect.
