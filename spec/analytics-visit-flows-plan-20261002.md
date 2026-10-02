# Visits and connected activation flows — focused plan, 2026-10-02

Status: approved direction from the owner's scope reset; implementation has not started. Branch: `update/visit-flows`. The only work completed during reset is preservation, branch preparation, and this handoff.

Read the [scope decision](analytics-scope-reset-20261002.md) first. The previous `update/analytics` implementation is parked and is not the dependency list for this task.

## Purpose and fixed deliverable

Help an authorized user or agent answer: **Did our traffic bring new accounts, and did those accounts reach a useful DebugBundle bundle?** Keep analytics a small supporting feature of the core incident investigation product.

Deliver two useful reports inside the existing Analytics surface and through the same domain reads used by API, CLI, and ordinary MCP:

| Report | Required answers | Evidence boundary |
| --- | --- | --- |
| Acquisition | Visits and allowed sources; Get started/signup intent; observed site-to-app arrivals; successful new accounts; equal previous-period comparison | A click is intent. A new-account success comes from the committed server outcome. Show which arrivals/accounts can actually be linked and the unlinked remainder. |
| Activation | New accounts reaching first project, first real incident, and first successful bundle retrieval; step drop-off and elapsed time where supported | Count first outcomes for the same account in the stated window. Dashboard, API, CLI, and MCP retrievals share the successful retrieval boundary. Repeated downloads and existing-user logins are not new conversions. |

DebugBundle's public site and app are the first consumer. Use their explicit project configuration and existing permissions; do not hard-code privileged access or site hostnames into shared domain logic. Keep any reusable cross-project support limited to an explicitly configured same-organization source/destination pair needed by this workflow.

## Reuse before additions

The stable baseline already has opt-in traffic/action capture, saved funnel configuration, aggregate API/CLI/MCP reads, an Analytics UI, and a V1 AnalyticsBundle. It also has account/project/incident records. Start there.

The existing per-step session funnel counts do not establish an ordered, same-account, cross-project journey. Do not relabel them as proof. Add only the missing correlation and outcome reading needed for the two reports. Keep the public legacy funnel contract compatible.

Use server records for outcomes when they can answer the question. Do not add an SDK writer to every language, a generic event catalog, or a second copy of every business record. Modify browser or Node SDK packages only if their existing supported interfaces cannot provide a required signal or consent fix. Other SDK families stay at their preserved stable bases.

## Minimum semantics

- Preserve allowed source/campaign labels from site to app only with the applicable consent. No raw query strings, emails, form contents, tokens, or fingerprinting.
- An explicit, bounded handoff may connect the approved source and destination. It must respect origins and project permissions, expire, resist replay, and avoid exposing credentials or stable identity in URLs. Use the smallest existing mechanism that satisfies those cases; no general identity graph or arbitrary project-space model.
- Missing consent, blocked storage, missing handoff, or an expired link means unlinked activity. Campaign labels alone do not prove the same person. Reports must show that limit.
- Successful new account means a new committed account, not clicking signup or logging in. Project/incident/retrieval signals must match successful core outcomes, and retries must not add first conversions.
- A successful retrieval means the server successfully served the requested bundle through an authorized retrieval path. This demonstrates delivery, not that a human or agent read or benefited from it. Bundle generation alone is insufficient.
- Use a stated bounded report interval and the existing comparison/window conventions where they fit. Document the exact cohort, time window, ordering, denominators, and incomplete observation coverage with the first report fixture; do not introduce a configurable metrics language.
- Exclude identified internal/test activity by explicit supported markers or configuration. Preserve unknown activity as unknown; do not infer employee identity from personal data.
- Consent withdrawal must stop unsent analytics, retries, and unload delivery while preserving debug capture. Keep SDK consent headless and use existing application consent patterns; no injected banners or popups.

## Work order and stop points

### 1. Acquisition from event to readable result

Do one bounded source pass over the existing site/app instrumentation, V1 ingest/read paths, new-account commit boundary, and consent behavior. Record the exact missing hooks/fields and the smallest query change. Do not reopen a repository-wide architecture audit.

Add focused failing cases, implement the minimal consent-safe signals/handoff and committed new-account outcome, and expose the acquisition report through its shared read service and automation adapters. Validate a known fixture before moving on. Update this plan with demonstrated results and exact remaining gaps, not percentages or old slice counts.

### 2. Activation from existing records to readable result

Use committed project and real-incident records plus the missing successful retrieval signal to answer the activation report. Associate only what is needed for this bounded account workflow. Expose the same result to the authorized user/agent. Reuse existing infrastructure and keep optional analytics delivery outside the critical success path.

### 3. Finish the existing product workflow

Present the two results tidily in the existing Analytics UI using its components and layout; apply the repo design rules before UI implementation. Keep configuration to the minimum required pair/window/exclusion settings. Do not add a dashboard builder, a catalog-management area, a top-level product redesign, or a public marketing page.

Verify API, CLI, ordinary MCP, and UI agree on the same fixture; update matching interface documentation; complete the focused pre-ship review. Produce a concrete local release candidate and clearly list remaining publication/deployment/live-verification actions. Stop for action-specific authorization at that boundary.

## Acceptance: a small known dataset

Use local disposable Docker services and existing Make targets. Prove all of these with a hand-calculated fixture and affected tests:

1. A consented attributed visit → explicit signup intent → approved site/app handoff → committed new account is visible, with equal-period visit/source comparison. A destination visit without a valid link is shown as unlinked.
2. Existing-user login, abandoned signup, a failed/rolled-back account creation, replayed handoff, and retries cannot inflate new-account conversions.
3. That account's first project → first real incident → first successful bundle retrieval is ordered and counted once. Repeated retrieval through another interface does not add another activated account. Generation-only and rejected/failed retrieval do not count.
4. Internal/test activity is excluded using the chosen explicit rule. Independent projects/organizations cannot read or link each other's activity; readers need access to every contributing project.
5. No-consent/withdrawal/logout and stale asynchronous delivery cases respect privacy. Debug capture and core account/project/incident/bundle behavior keep working if analytics is unavailable.
6. Delayed/missing observations are disclosed honestly; zero observed is not presented as verified zero real conversions. API/CLI/MCP/UI show matching values and definitions, with empty, partial, unauthorized, and error states covered at their affected boundaries.

If a schema change is unavoidable, use forward migrations and existing readiness/deploy discipline. Test the affected populated upgrade and required-migration gate. No migration or runtime change is authorized during this planning handoff.

## Storage and core-service limits

Keep shared clients, bounded report queries/windows, existing worker infrastructure, and permission filtering. Before any new persistence, record its immediate report consumer, maximum growth/retention, deletion behavior, and indexes. Prefer existing records and aggregates where correct; avoid accumulating overlapping event, identity, receipt, and financial ledgers for this small task.

Check the actual affected query plans and a representative bounded fixture before activation. Do not promise zero new tables or zero cost without evidence, and do not start a maximum-volume tuning project. An analytics storage or delivery failure must not roll back an otherwise successful core operation. Never weaken existing privacy, erasure, or security obligations to keep a scope promise; if they cannot fit the bounded approach, explain the concrete tradeoff before expanding it.

Local services/data/caches from the parked branch may still exist. Do not run stable code against a candidate-migrated database or use stale candidate builds. Use an isolated disposable Docker project/database and rebuild from this branch when testing; preserve the old local state unless separately authorized to remove it.

## Explicitly excluded

- Revenue amounts, payment ledgers, refunds, MRR, subscriptions, billing-source admission, and financial reconciliation. A future yes/no paid milestone is a separate decision.
- General growth reports, retention/cohorts, arbitrary goals/funnel DSLs, generic namespaces/spaces/identity graphs, catalogs and plan versioning, source-authority certification, correction/rebuild platforms.
- A new AnalyticsBundle schema or artifact system, replacing V1 ingestion, semantic default activation, old-writer cutover, or importing the parked migration chain.
- A new dashboard/report builder, export framework, public Analytics page, hosted OpenAI connector expansion, additional SDK writers, or a coordinated all-SDK release.

## Change control and done

Every implementation change must name one acceptance case above. An unexpected prerequisite must first be tested against a smaller use of the shipped system. If it would add an excluded capability, stop that dependent work and present the smallest tradeoff for an owner scope decision. Prior broad design approvals do not expand this plan.

Done is the two supported workflows with honest data limits, the shared read surfaces, focused affected checks, documentation, and pre-ship review. Do not continue into the parked plan when these pass. No commit/push/merge/tag/publication/release/deployment or production mutation is authorized for future implementation merely by this handoff; obtain the applicable explicit action approval.
