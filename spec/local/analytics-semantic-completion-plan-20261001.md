# Analytics completion plan — 2026-10-01

> Branch checkpoint update, 2026-10-01: the owner authorized local `update/analytics` branches and commits for the core and eleven affected SDK repositories. See the [fixed audit bases and checkpoint record](../analytics-update-branch-audit-20261001.md). This supersedes earlier no-commit wording only for these checkpoints; push/publication/deployment and later commits still require their own authorization. Continue implementation on these branches. The full Analytics feature remains in scope.

Status: documentation reconciliation; implementation stopped for the owner's fresh-thread handoff. No new feature, runtime gate, release approval or slice closure is introduced here.

## Product and scope

Analytics supports DebugBundle's core debugging/incident product. Deliver one understandable Analytics experience with browser and Node SDK packages. Internal wire-schema identifiers are implementation details, not customer-facing editions or two permanent setups.

**The deliverable is the entire Analytics feature: backend ingestion and processing, identity, all agreed reports, AnalyticsBundle, dashboard/API/CLI/MCP, and cutover/acceptance. “Browser and Node” limits only the SDK packages implemented in this candidate; it does not narrow the feature to SDK work.**

The owner has **not** removed connected identity, growth reports, revenue or AnalyticsBundle from the agreed scope. Keep those obligations visible. Only the other SDK semantic writers (original slices 5 and 6) and maximum-volume tuning were explicitly deferred. A proposal to defer anything else must identify the affected requirement and user-visible consequence; do not silently cut it or invent additional requirements. Do not request publication/deployment approval before a concrete final candidate exists.

Current scope therefore has **11 applicable original slices and 2 deferred slices**. This is a scope count, not a completion claim. No trustworthy overall percentage or remaining-hours estimate exists. The earlier approximately 45% estimate is withdrawn. Code size, test counts and candidate migration counts do not measure delivered product value.

## How to report completion

- **Implemented locally:** the behavior exists and has scoped source/test evidence. Name what a user or caller can do and what remains unavailable.
- **Slice reviewed:** the original section 13 exit evidence is met and the mandatory pre-ship review is recorded. A dependent feature may remain open without reopening that component. This reconciliation does not award this status to any slice.
- **Local release candidate ready:** all applicable functional requirements, package/migration/compatibility checks and integrated local acceptance pass. Incomplete functionality remains inaccessible until its activation conditions pass.
- **Published/deployed/live accepted:** distinct external outcomes requiring explicit authorization and actual evidence. They are not prerequisites for describing an internal component as locally implemented.

Stop using the historical “0/13” tally as the headline progress measure. Keep the original thirteen-row roadmap for traceability, show the deferred rows separately, and report completed workflows plus specific remaining acceptance items. Do not substitute a new optimistic closure count without review.

## Restore fixed slice boundaries

The original deliverable/exit table in the [proposal, section 13](proposals/analyticsbundle-semantic-tracking-and-growth-analytics-plan-2026-09-22.md#13-single-phase-delivery-slices) remains the baseline. Requirements/contracts still govern correctness and security; restoring planning boundaries does not waive them.

The single current status ledger is in [proposal section 13](proposals/analyticsbundle-semantic-tracking-and-growth-analytics-plan-2026-09-22.md#progress-ledger--reconciled-2026-10-01). It lists all thirteen original rows, distinguishing the eleven applicable slices and two deferred SDK slices. Update that ledger in place; this plan owns sequencing and scope, not a duplicate completion tally.

The concrete boundary repair is:

- Slice 2 ends at space membership/authorization and its original linking, access, revoke/unlink/delete evidence. Connected identity/handoff belongs to slice 7. Report execution belongs to slices 8–10, artifacts to 11 and their interfaces to 12.
- Slice 3 owns catalog/writer/ingestion, mixed-client authentication, capability negotiation and receipt/quota correctness. Required complete projections and activation still gate release, but every downstream report must not be added to its local component closure definition.
- Slice 4 owns browser/Node writers. Slices 5/6 are deferred. This does not defer any backend/report/UI/artifact feature in the agreed scope.
- Slice 13 owns assembled local candidate acceptance. External publication, deployment and live verification are reported after specific authorization, without claiming those outcomes from local tests.

No slice is newly closed here. Existing local evidence is indexed in the [checkpoint](analytics-semantic-implementation-20260928.md).

## Fixed order of work

These are execution checkpoints mapped to the original slices, not new scope or additional gates. Work on one checkpoint at a time; finish its concrete outcome before opening another foundation.

1. **Bounded reconciliation of slices 2 and 3, plus JS contract gaps.** Inspect the original exit items against the named code/tests and existing evidence. Produce a short pass/gap table, apply pre-ship review where closure is justified, and fix only concrete missing requirements. Do not repeat the entire repository audit or add handoff/report requirements to membership/ingress closure. End with a definite status for each audited item and the exact next implementation gap.
2. **Complete the single-project browser/Node workflow.** A reviewed plan and normal package setup capture a browser action and committed Node success, process once, and yield the same correct project goal/funnel result through the approved UI/API/CLI/MCP. Finish necessary source-quality, late/lost-job correction and erasure behavior for this path. Use a small hand-calculated fixture with duplicates, rollback/no-success, late work, loss and consent/revocation. Preserve explicit unknown/partial results where evidence is absent; never fabricate verification. The existing packed ten-event evaluation is a starting point, not this checkpoint's completion.
3. **Complete the connected site/app workflow.** Reuse the namespace/membership/portfolio foundations to implement allowlisted anonymous handoff, destination-owned known association, connected erasure and joined reports. Prove the existing contract's adversarial cases. Finish the missing browser relay integration here if it depends on this work; project-local relay requirements remain in checkpoint 2.
4. **Complete the remaining nonfinancial reports.** Finish trends/distincts, activation, retention/cohorts, numeric measures and acquisition attribution one report at a time, including storage, source quality and UI/API/CLI/MCP. Use the existing kernels and approved design. Each report ends with a small known-answer acceptance dataset.
5. **Complete financial reporting.** Implement the verified billing namespace and durable dedupe before admitting financial facts; then subscription/receipt reconciliation and reports against synthetic truth. Keep financial admission closed until these dependencies pass. This remains in scope; it is not a reason to block a separate component's local review.
6. **Complete AnalyticsBundle and remaining product surfaces.** Produce deterministic, bounded artifacts from the completed reports; finish measurement-health/opportunity and incident/deploy-impact evidence without causal overclaims; close saved reports/export and remaining approved UI/management flows. Prove consistent permissions and answers without rebuilding their domain services.
7. **Assemble one reviewable local release candidate.** Complete the browser/Node setup and migration guide, exact staged-package consumers, populated migration/rollback rehearsal, installed-client/debug regressions and integrated acceptance. Run applicable full required gates once the candidate is assembled; rerun only affected gates after fixes. Prepare exact external release/registry/live-verification steps for later approval. Do not publish to satisfy local readiness.

The focused new thread starts at checkpoint 1 and continues into checkpoint 2. The former “Next: implement handoff allowlist” is deferred in execution order to checkpoint 3, not removed from scope. If an actual security or correctness dependency blocks a checkpoint, record its source requirement and minimal necessary fix; do not turn it into an unbounded prerequisite project.

## Control effort and scope

- Reuse existing code and accepted designs. Do not reimplement working foundations or add a generic policy/control framework without a current required consumer.
- Each meaningful change names one user outcome, its requirement, its owning original slice and the smallest verification needed. After relevant checks pass, proceed to completion; repeat/broaden only for a new change, a failure, a concrete unresolved risk or a required gate.
- Tests for auth, privacy, replay, migration and report correctness remain necessary. New million-event stress work is deferred; do not keep expanding synthetic volume targets. Record existing capacity limitations honestly and do not claim throughput qualification.
- Before candidate acceptance, reconcile any mandatory capacity/cleanup claim with the retained design and owner-deferred benchmark work. If a promised bound cannot be supported, present a concrete limit or design decision; never silently waive a contractual bound or reopen open-ended benchmarking.
- New safety blockers need an actual reachable failure, missing requirement or unsupported product claim. Do not infer arbitrary enterprise-scale obligations from the word “production.”
- Keep source, local validation, release approval and live acceptance separate. No source rewrite, migration squash, destructive cleanup or removal of intentional edits is authorized by this planning reset.
- Keep one current status paragraph and one current Next. Update the ledger row in place after meaningful work; archive detailed logs rather than accumulating competing “latest” sections. Retain exact test references without treating test totals as percent completion.

## Preserved owner decisions and safety

- Browser and Node are the selected SDK packages. Preserve root and all eleven SDK companion worktrees; inspect `.local-repos/` for hosted/deployment ownership when needed.
- Analytics remains opt-in and separate from debug behavior. Keep default semantic capture/capability/report gates disabled until their complete activation conditions pass. Internal test injection is not activation evidence.
- Minimal opaque business-operation dedupe keys survive until project deletion. Every active space report consumes one saved-report slot in every linked source project.
- Financial facts remain fail-closed until authenticated billing-source namespace and separate durable dedupe exist.
- Preserve installed payloads through the accepted cutover. The old analytics writer window is 30 days **after both known installs actually upgrade**, conditional on checking for other active old writers. Local tests start no window. Later remove the old capture/processing lane by reviewed change; retain historical readers for their retention/artifact obligations. See the [cutover draft](analytics-js-cutover-guide-20260930.md).
- Use Docker-backed Make targets. No browser or screenshots unless requested. No commit, push, tag, publish, release, deploy or production settings/data/credential changes without explicit action-specific approval.
- The existing dashboard proposal is already approved. Follow design rules/skill before UI work; do not ask for that same approval again.

## Dedicated public Analytics page

Owner intent recorded 2026-10-01: give Analytics a dedicated public product page linked from the site header, presenting it as a supporting DebugBundle capability. This is a bounded follow-up to make the completed feature understandable, not a second product, new analytics feature set or added SDK/backend gate.

Prepare the page once the actual candidate capabilities and limitations are known. Reuse the site's header/page patterns, focus on concrete supported questions and the relationship to debugging, and match every claim to available functionality. Inspect the site's own AGENTS and design rules/skill first. Dashboard-design approval does not approve an unseen public-page design; produce a concrete minimal proposal for the site's required review before implementation. The present task records intent only; no page/navigation implementation or publication is requested in this reconciliation.

## Historical evidence and handoff

Byte-preserved pre-reconciliation documents are under [history/analytics-before-reconciliation-20261001](history/analytics-before-reconciliation-20261001/): `STATUS.md`, `implementation-checkpoint.md`, and `original-proposal-and-ledger.md`. Their relative links were written for their original locations. They contain dated evidence, outdated current-state statements and old scope; do not execute a historical Next as today's task.

The source/test worktree was left intact during this reconciliation. No new runtime tests or slice-completion review were performed. Read [the current checkpoint](analytics-semantic-implementation-20260928.md) for exact verified boundaries and [the new-thread prompt](analytics-semantic-next-thread-20261001.md) for continuation.
