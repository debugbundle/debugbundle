# Analytics scope reset — 2026-10-02

## Owner decision and authority

The owner has stopped the expanded AnalyticsBundle update and authorized preserving all pending core and SDK work as local commits on `update/analytics`. Keep that branch for possible future review or abandonment. Do not resume it, merge it wholesale, activate its runtime gates, or treat unfinished slices as obligations of the replacement task.

Start the replacement on `update/visit-flows` from the fixed pre-analytics bases. The owner requested a focused plan and restart prompt, not implementation during the preservation session. Commit authorization covers the preservation and planning handoff. Push, merge, tag, publication, release, deployment, and production settings/data/credentials remain separately authorized actions.

This decision supersedes the full-scope execution instructions in the old STATUS, TODO analytics checklist, semantic completion plan, implementation checkpoint, original proposal/ledger, next-thread prompt, and SDK freeze/cutover documents. Those documents remain historical evidence on `update/analytics`. Historical requirements and design approvals for that expansion do not make its unfinished features part of this replacement task. Existing shipped contracts and security/privacy requirements still apply.

## Original need

The September 22 conversation asked whether posts brought visitors who signed up and used DebugBundle. The narrow proposal at 11:02 was:

- Observe visits, allowed traffic sources, and an explicit Get started/signup action.
- Preserve consented attribution from the public site to the app, which use separate projects.
- Count successful new-account creation separately from existing-user login.
- Use existing server records for first project, first real incident, and add a missing signal for first successful bundle retrieval through dashboard, API, CLI, or MCP.
- Exclude internal/testing activity, avoid duplicate conversions, and let an authorized agent read useful reports.

The intended product remains focused on incident → bundle → agent investigation. Analytics supports that workflow and helps explain acquisition and activation.

## Where the scope drifted

The proposal grew from a few meaningful signals and reports into a general semantic analytics system: versioned catalogs and plans, generalized project spaces and identity, source verification and repair systems, growth/cohort/retention reporting, financial/subscription metrics, new artifact contracts, extensive management UI, and a coordinated SDK migration. The pasted continuation documents an all-SDK discussion by 11:43, a separate consent-withdrawal fix requested at 11:50, and a thirteen-slice checklist by 12:02. The supplied record omits 11:02–11:43, so it cannot identify the exact message that introduced every expansion.

Some foundations protect real invariants, but their necessity was assessed against the enlarged product rather than the original small outcome. Work kept adding prerequisites before delivering enough usable workflows. Later approvals explain why the broad plan was executed; they do not establish that this was the right product scope. We should have made that growth explicit and reconsidered it earlier.

A previous count of 58 tables included existing analytics tables as well as candidate additions. It was not 58 new tables and does not itself prove database overload. The concern to address is concrete storage growth, query cost, and coupling to core operations.

## Salvage policy

- Preserve all work first. Checkpoint commits are not release-ready claims.
- Keep the shipped V1 analytics and published SDK safety behavior in the fixed bases.
- Reuse independent consent-withdrawal, privacy, redaction, retry, or regression-test fixes only when a named acceptance case in the focused plan needs them. Review the smallest diff and its dependencies; do not cherry-pick the broad implementation merely because it already exists.
- Connected site-to-app attribution was still unfinished. Do not advertise it as solved by the parked source.
- Keep financial admission and semantic activation disabled in the parked candidate. The new plan does not adopt those mechanisms or migrate their data.
- Do not automatically publish eleven SDK families. Change only a package actually needed by the focused workflow; prefer existing supported browser/Node interfaces and core records.
- No dedicated public Analytics page or dashboard redesign is included. Those require a separate future product task.

## Rules to prevent recurrence

1. Every new change must map to one of the two reports and a concrete acceptance case in the focused plan.
2. Build the acquisition workflow through its read surface, then activation through its read surface. Do not add speculative foundations for future reports.
3. A missing primitive is not authorization for a generic platform. If the bounded plan cannot work without changing its scope, explain the exact tradeoff and obtain a scope decision before expanding it.
4. No new schema merely to future-proof. Name its immediate consumer, bounded growth/retention, deletion behavior, query/index needs, and migration before implementation.
5. Optional analytics failures must not prevent account creation, project creation, incident capture, or bundle retrieval. Counts must disclose observation gaps instead of claiming ledger-grade completeness.
6. Completion means the two reports work through existing product surfaces with affected tests and a focused pre-ship review. It does not mean finishing the old thirteen slices.

The active plan is [Visits and connected activation flows](analytics-visit-flows-plan-20261002.md). The fresh checkout's preservation manifest records immutable archive commits and starting bases. The restart prompt is [here](analytics-visit-flows-next-thread-20261002.md).
