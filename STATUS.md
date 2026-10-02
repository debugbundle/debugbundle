# Current handoff — focused analytics reset, 2026-10-02

## Active direction

Branch: `update/visit-flows`. The owner has parked the expanded AnalyticsBundle update. **Do not resume `update/analytics` or execute its old full-scope checklist.** No active goal was present when the goal system was checked during this reset.

Read the [owner decision and lessons](spec/analytics-scope-reset-20261002.md), then the [focused plan](spec/analytics-visit-flows-plan-20261002.md). Follow AGENTS.md and its mandatory read order before code changes.

The replacement delivers two small supporting reports: acquisition from visits/site-to-app attribution through confirmed new accounts, and activation from first project through first real incident and first successful bundle retrieval. Use existing UI/API/CLI/ordinary MCP surfaces and shipped V1 foundations. Financials, broad growth/identity machinery, the AnalyticsBundle redesign, all-SDK rollout, and public Analytics page are excluded.

## Completed in this session

- Committed all git-visible pending core and Browser/Node SDK changes on `update/analytics`; the other ten SDK archive commits were already clean and preserved unchanged.
- Recorded the scope reset, marked the old status/checkpoint/ledger/handoff as parked, and preserved the relevant previously ignored analytics proposals and old TODO analytics checklist in the core archive.
- Created fresh `update/visit-flows` branches for core, all eleven SDK repos, and the site from their fixed stable bases. Other companion repositories remain clean on `main`.
- Prepared the focused plan, immutable preservation manifest, and restart prompt. The new root branch changes documentation only; SDK and site branches have no implementation changes from their bases.
- Checked file preservation, staged diff hygiene, limited high-confidence credential patterns, branch/base hashes, and clean Git state. No implementation suite was rerun: these are preservation/planning commits, not a release-readiness claim.

## Exact next step

**Implementation has not started.** In the next session, perform the bounded acquisition source pass specified in the focused plan, then complete that workflow through its report read before adding activation. Use the [restart prompt](spec/analytics-visit-flows-next-thread-20261002.md).

Use [the preservation manifest](spec/analytics-preservation-20261002.md) to inspect an archived change if a named acceptance case needs it. Do not merge the archive wholesale or import its migrations. Ignored historical local documents may still exist on disk; they are not an active task list.

## Operational boundaries

No push, merge, tag, publication, release, deployment, service restart, database migration, runtime gate change, or production mutation occurred. No browser or screenshots were used. Existing ignored environment files, caches, local notes, and local runtime data were preserved. Candidate build artifacts and a candidate-migrated local database may remain; use fresh isolated disposable Docker services and rebuild from this branch for future tests.

No application design or feature code was changed in this reset. This session's commit authorization does not authorize committing or releasing future implementation. Keep the core incident → bundle → agent workflow and installed SDK compatibility intact.
