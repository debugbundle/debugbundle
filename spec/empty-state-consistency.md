# Empty-state consistency

## Scope and design

The requested GitHub settings update reuses the approved dashboard empty-state
pattern. Extend the same pattern to comparable empty resource lists and analytics
panels. This maps to FR-WEB-06/08/09, FR-ANL-29 and FR-GHA-15, and AC-WEB-09,
AC-ANL-15 and AC-GHA-03. There are no API, schema or data changes.

- Reuse `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`
  and optional `EmptyContent`/`Button` with existing tokens and Lucide icons.
- Promote the existing project resource composition to `ResourceEmptyState` for
  project, workspace and public resource lists; retain the old import/type alias.
- Use a short sentence-case title, a relevant decorative icon and scoped help.
  Keep the existing responsive width, padding, typography and theme tokens.
- Show an action only when its existing permission and callback permit it. Move
  GitHub's existing create action into the empty body without duplicating it.
  Other section actions remain in place. Use standard keyboard-operable buttons.
- Keep loading, error, access, upgrade and unavailable states distinct. Absence of
  retained evidence must not imply no incidents, activity or downtime occurred.
- Hidden GitHub failures are a separate filtered state; clearing remains local
  to this browser and never deletes delivery history.

The user's request to match existing empty states authorises this reuse; this
does not introduce a new visual system or interaction.

## Audit inventory

| Area                   | Changes                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                 | Dispatch rules, first delivery, and all failures hidden                                                                                                                           |
| Access and connections | Pending workspace invites, direct project access, OpenAI connections and inactive connections with retained history, project agent credentials, people search                     |
| Notifications          | Alert groups and paginated group members, Slack report channels                                                                                                                   |
| Analytics              | Overview routes/devices/opportunities, audience breakdowns, captured funnel steps, saved flows, retained journey samples, related opportunity context, admin rejection breakdowns |
| Evidence and status    | Filtered incident logs, public status with no published checks                                                                                                                    |

Already consistent: report history/definitions, tokens, webhooks, health checks,
alert rules, capture rules, incident/improvement inventories, top-level analytics
lists, referral lists and not-found views use shared Empty compositions.

Deliberately retain compact inline messages for form/select options, setup
summaries, report factual evidence categories, missing stack/resource evidence,
health counters, and analytics correlation/methodology notes. These are field or
fact descriptions rather than empty resource inventories. Error/loading feedback
continues to use Notice, Skeleton or its existing pending treatment.

## Verification

The two new GitHub empty/action regressions failed against the original UI.
The full dashboard run passed 910 of 914 cases. Three failures were assertions for
labels changed by this slice; one was a new assertion that incorrectly included
initial page requests when checking the local hide action. Expected labels now
match the documented titles, and the read-only assertion measures that action.
The final rerun passes all 17 cases in the four affected test files, qualifying
all 914 dashboard cases across the full run and corrected-assertion rerun.

Root typecheck, scoped lint and formatting for all 26 source/test files pass.
The production dashboard build and git whitespace check pass. HTTP reads confirm
the existing loopback preview serves all three updated GitHub/shared modules.
Evidence is in `.tmp/empty-state-consistency-20261110/` (`red.log`, `check.log`,
`check-final.log`, `build.log`, `preview-check.json`). No browser review,
production write, paid call, commit or deployment was performed.

## Pre-ship review

- Inventory: one shared composition, its compatible project alias, and 18
  consumers across GitHub, access, notifications, analytics, evidence and public
  status. All changes are presentation or the placement of an existing action.
- Empty, filtered-empty, loading, unavailable and error branches retain their
  existing conditions. Active versus historical OpenAI connections and direct
  versus inherited project access remain distinct.
- The shared composition owns no effects, fetching, credentials, retention or
  authority. Callers still decide whether an action is permitted. Ordinary
  escaped React text renders the help and titles; no HTML trust boundary changes.
- Existing project imports and prop types remain valid. No new dependency,
  background request, provider call, delivery retry or storage write was added.
- GitHub regression cases cover permitted/unavailable creation, one create
  action, reversible browser-only hiding, later failures, explicit retry and a
  genuinely empty server history. Existing list/resource tests exercise the
  preserved alias and surrounding error/loading/access paths.
- Schema/deploy safety is not applicable to this presentation-only slice. No
  migration, infrastructure, runtime deployment or consumer product is changed.
