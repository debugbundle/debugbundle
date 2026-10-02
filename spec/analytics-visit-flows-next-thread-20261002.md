# Focused analytics restart — 2026-10-02

Copy the following prompt into the next implementation session:

---

Work in `/Users/owenfar/Developer/debugbundle` on `update/visit-flows`.

Follow AGENTS.md and its mandatory read order, then read:

1. `STATUS.md`
2. `spec/analytics-scope-reset-20261002.md`
3. `spec/analytics-visit-flows-plan-20261002.md`
4. `spec/analytics-preservation-20261002.md`

Implement only the focused plan: visits and sources, consented site-to-app signup attribution, confirmed new accounts, and first project → first real incident → first successful bundle retrieval, visible through the existing UI/API/CLI/ordinary MCP. These support DebugBundle's core incident/bundle workflow.

Start with the bounded acquisition source pass and complete that workflow through its read surface before activation. Reuse shipped V1 analytics and existing core records. Preserve installed SDK/debug behavior, consent/privacy, authorization and migration safety. Use Docker-backed Make targets and meaningful affected tests; no browser/screenshots. Use isolated disposable test services, not the parked candidate's existing database or stale builds.

The expanded work is parked on `update/analytics` across core and SDK repos. Its old STATUS, TODO checklist, semantic completion plan, ledger, contracts/freeze/cutover tasks are historical and must not restart. Do not merge its implementation wholesale, create a goal for that old scope, or import its migrations. Select an independent fix only for a named acceptance case in the new plan.

No revenue platform, cohorts, generic identity/catalog/reporting system, AnalyticsBundle redesign, all-SDK rollout or public Analytics page. Explain any scope-changing prerequisite before expanding. Keep the current status and focused plan updated with actual workflow evidence and exact gaps. Stop after a concrete focused local candidate and required pre-ship review. Do not commit, push, merge, tag, publish, release, deploy or change production settings/data/credentials without action-specific approval.

---

This prompt begins implementation; it does not authorize resuming the archived goal. The preservation session itself made no new feature implementation or production change.
