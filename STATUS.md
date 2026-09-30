# Analytics update — current handoff, 2026-10-01

> Branch checkpoint update, 2026-10-01: the owner authorized local `update/analytics` branches and commits for the core and eleven affected SDK repositories. See the [fixed audit bases and checkpoint record](spec/analytics-update-branch-audit-20261001.md). This supersedes earlier no-commit wording only for these checkpoints; push/publication/deployment and later commits still require their own authorization. Continue implementation on these branches. The full Analytics feature remains in scope.

**Stopped at the owner's request after documentation reconciliation; resume in a new thread.** The entire Analytics feature remains the deliverable: backend, identity, all agreed reports, AnalyticsBundle, UI/API/CLI/MCP and cutover. Browser and Node restrict only the SDK packages receiving new writers. Analytics remains a supporting DebugBundle feature.

## Current state

- A packed ten-event browser/Node fixture passes local authenticated ingestion, durable receipt/worker processing and project funnels, including protected Node known identity and an installed old-format event.
- Catalog/plan/writer and space-membership management have local domain and interface implementations. Project/portfolio funnel readers, project identity/revocation/erasure and bounded retention exist with scoped evidence. Tracking and ordered-funnel UI are partial.
- Migration 26 adds key-free connected-space namespace metadata and reviewed membership-bound changes. It is not a handoff service. Latest evidence: 4 namespace, 1 populated-upgrade, 18 storage-migration and 54 focused tests; typecheck/lint/format/diff checks. These are prior code-validation results, not tests rerun during this documentation turn.
- Connected handoff/erasure, verified source success, complete correction/rebuild, remaining growth and financial reports, AnalyticsBundle successor, complete UI and release cutover remain open. Default semantic capture/capability/report services stay disabled; financial admission fails closed.

## How progress is tracked now

The [completion plan](spec/local/analytics-semantic-completion-plan-20261001.md) restores the original slice boundaries and has a fixed execution order. **11 original slices apply; 2 SDK slices are deferred.** This is not a closure count. No slice was declared complete in this docs-only reconciliation. The old 0/13 headline and approximately 45% estimate are not useful current progress measures. Report demonstrated workflows, original slice reviews and local release readiness separately.

**Next:** perform the bounded original-exit review of slices 2 (space membership/authorization) and 3 (catalog/writers/ingestion), including the pre-ship review before closure, and identify exact browser/Node contract gaps. Then complete the single-project browser action → committed Node success → correct goal/funnel → approved UI/API/CLI/MCP workflow. Follow the completion plan through connected identity, remaining reports, financials, artifacts/UI and integrated release preparation. Do not resume the historical handoff-first Next or broaden the reviewed slice exits.

## Decisions and limits

- Other SDK writers and maximum-volume tuning are deferred. The full agreed analytics functionality is not otherwise reduced.
- One current Analytics setup; accepted conditional 30-day old-writer window only after actual site/app upgrades and active-writer inventory. Keep debugging and retained historical contracts intact.
- Business-operation dedupe lasts until project deletion; each active space report uses one slot in every linked project.
- Dashboard proposal already approved. Dedicated public Analytics page with a header link is recorded as a separate bounded follow-up once supported claims are known; no UI work occurred in this reconciliation.
- Preserve all intentional root/companion changes. Docker-backed Make targets; no browser/screenshots. No commit/push/tag/publish/release/deploy or production settings/data/credential mutation is authorized.

Read the [current evidence checkpoint](spec/local/analytics-semantic-implementation-20260928.md), [reconciled original ledger](spec/local/proposals/analyticsbundle-semantic-tracking-and-growth-analytics-plan-2026-09-22.md#progress-ledger--reconciled-2026-10-01) and [paste-ready new-thread prompt](spec/local/analytics-semantic-next-thread-20261001.md).

The complete previous STATUS, including unrelated historical sessions, is preserved byte-for-byte in [the status archive](spec/local/history/analytics-before-reconciliation-20261001/STATUS.md). It is historical evidence, not current authorization or instructions.

Documentation reconciliation checks: original slice exit table unchanged; local links resolve; STATUS/checkpoint each have one current Next; 348 existing non-Markdown changed-file contents across root, eleven SDK repos and site remain unchanged. `git diff --check` passes. No runtime tests or feature changes were made in this reconciliation.
