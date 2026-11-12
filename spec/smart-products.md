# Smart Products follow-up

Approved 10 November 2026; release and bounded provider qualification authorised
11 November 2026. Release evidence is recorded in `smart-products-release-20261111.md`.
Consumer adoption remains separately scoped. Prices, subscriptions, raw-data retention and existing digest,
incident, opportunity and BundleV1 behaviour stay unchanged.

## Product decisions and implementation slices

1. Protect restricted report provider input and generated prose from known project
   identity, including legacy reads and cached PDF delivery.
2. Enable intentional factual reports on Solo and Team using the existing report
   lifecycle, with version-negotiated content and no AI admission or requests.
3. Add a separate bounded weekly project review to Improvements, with explicit
   Owner scope/consent, independent accounting and API/CLI/ordinary MCP parity.
4. Add public `/analytics/`, primary navigation and the homepage Product impact
   link using existing site components and shipped analytics claims.

The approved design reuses current tokens, Field/MultiSelect, table, dialog,
PendingButton, Notice and Empty primitives. Reports retain the Monthly editor
default, existing polling, PDF, verified recipient and overlap behaviour. Weekly
reviews use a compact Improvements section and a conventional settings dialog;
there is no new dashboard navigation or custom interaction system.

## Report products: FR-BUS-05/06 extension

Public terminology uses **Reports** for the paid-plan category and **Smart Reports**
for Business AI analysis. Landing cards, pricing, report guides, setup prompts and
dashboard copy must distinguish these products. Pricing shows Smart Reports as a
Business-only row under Reports. Existing routes, tool names, capability fields
and schema identifiers remain unchanged.

| Plan     | Content / cadences                                     | Runs per anchored month | Definitions | Projects / recipients |
| -------- | ------------------------------------------------------ | ----------------------: | ----------: | --------------------: |
| Free     | None                                                   |                       0 |           0 |                 0 / 0 |
| Solo     | Factual / monthly                                      |                       2 |           1 |                 3 / 1 |
| Team     | Factual / weekly, monthly                              |                       8 |           2 |                 5 / 5 |
| Business | AI with safe factual fallback / daily, weekly, monthly |                      40 |           5 |               10 / 10 |

Manual, scheduled and regenerated reports share their plan pool; extra capacity
never multiplies it. Trials use the selected tier and existing fixed trial window.
Self-host remains unlocked with bounded selection and explicit operator AI
configuration. Report AI's existing USD 1 account budget is unchanged.

A factual definition/run freezes `report_mode=factual`. It must have no AI profile,
reservation, paid attempt, token-count request or provider call. It completes as
`ready`; it is not an AI failure. Its canonical `report_document.v2` has a null
narrative and `analysis.status=not_requested`, all AI metadata null. New clients
request `/document?version=2`; absent/`version=1` retains the exact legacy v1 shape
and explicit unavailable analysis. Historical degraded reports retain their meaning.
The fixed OpenAI report-read contract still projects v1. No OAuth grant or
restricted tool catalog expands.

Upgrades never convert a factual definition to AI or reset usage. An explicit new
Business definition can select the AI product. Downgrades pause incompatible
cadence, mode, scope, recipients or definition counts for Owner review, preserving
whole-scope archive reads. Current entitlement/consent/creator checks continue
before collection, processing, publication and email. Numeric history remains at
most twelve months; derived reports/PDFs at most ninety days, subject to shorter
privacy limits and explicit deletion. Missing coverage remains unknown.

## Restricted identity: FR-BUS-06 extension

Protect provider input and generated prose, with Project A–J aliases in canonical
facts. Authorised local titles, IDs and source navigation keep their names and
purpose: restricted does not promise an entirely anonymous exported document.
The private bounded identity set includes accepted/current project names/slugs,
service names and configured origin hostnames. Never send it to the provider or
include it in diagnostics. Match Unicode-normalised case/punctuation boundaries,
with explicit generic and short-name treatment; this is not a guarantee against
all semantic inference.

Reject unsafe fresh prose with `report_unsafe_prose`, retaining safe facts and no
second paid attempt. Legacy unsafe narrative is withheld in an in-memory factual
projection; immutable documents and settled receipt hashes stay unchanged. Unsafe
facts still fail closed. Cached PDFs must match the current safe projection and
recorded PDF hash or be explicitly prepared again from saved facts without AI.
Already downloaded files and delivered email cannot be recalled.

## FR-SMI-01: bounded project reviews

One versioned `improvement_review.v1` artifact per selected project and completed
UTC week, linking existing retained incident metadata, qualified ordinary
opportunities, aggregate analytics opportunities/counts and monitored health.
Select at most 25 sources and 5 deterministic priorities. No raw logs, headers,
request/response bodies, session identities or new raw archive. Selection and
source order are stable. Lifetime counts, sampling, partial coverage, health
check downtime and correlation limits remain explicit.

Model guidance may add at most five qualitative investigations with actual source
references, tentative labelled hypotheses and concrete checks. It cannot replace
facts/priorities, invent quantitative results, inspect a repository/UI, perform
actions, create posts, resolve incidents, send email or dispatch automation.
Closed-schema, reference, redaction, identity and numeric-prose checks run before
publication and on read. These checks do not prove every hypothesis true.
Recorded opportunity-to-incident relationships are carried only as references to
selected evidence; unknown, duplicate and self-references are rejected. Guidance
must favour specific inspection, a falsifiable hypothesis check and subsequent
verification over generic optimisation or speculative content marketing. Restricted
mode remains deliberately less specific; Full adds bounded redacted source context.

Intentional factual reports share a deterministic per-project overview across
web, HTML and PDF, with linked metrics and explicit coverage. Comparable daily
rates handle unequal periods; partial counts never become trend claims. Focus
preserves every selected urgent item and fills up to five positions with other
selected outstanding work. Released Business AI/fallback presentation is preserved.

## FR-SMI-02: consent and access

Existing customers default off. Only the current workspace Owner can enable an
explicit selection of current projects, with source/provider consent and a version
fence. No future projects or newly merged origins join implicitly. Preserve the
actual initiating credential; never substitute an Owner identity at execution.
Respect per-project automatic-improvement opt-outs, trial deadlines, current
management authority and every saved origin before work. Retained reads require
current access to the complete saved scope, including after downgrade.

When the saved review inventory is empty and reviews are disabled, eligible workspace
Owners see **Enable weekly review** in the standard empty state. It opens the same
settings dialog as the toolbar action; project selection and evidence consent are
still required before an enabled schedule is saved. Successful settings persistence
shows the shared saved toast; validation failures, failed writes and late completions
after leaving/changing context do not show success. Members, unavailable plans and
unknown settings never show an enable action.

Disabling the schedule preserves history. Removing consent/projects or narrowing
privacy deletes affected derived content. Project transfer/deletion and analytics
privacy narrowing invalidate it irreversibly; restoring settings cannot resurrect
old content. Source project deletion/transfer clears the affected workspace's
selection/consent and pauses for fresh Owner review, so stale origins cannot strand
settings or join a new scope. Unaffected saved artifacts retain current-access reads.
Content/buffers expire within ninety days and shorter governing analytics retention.
Newly inserted narrower policies and canonical policy changes invalidate every
retained origin they govern, so widening cannot restore older outputs. Account export provides bounded safe settings/metadata and
authenticated artifact links. Financial receipts retain only minimal accounting
metadata independently of content; deletion does not refund paid uncertainty.

## FR-SMI-03: durable schedule and independent budget

| Plan     | Selected projects | Paid reviews / anchored month | Separate AI ceiling |
| -------- | ----------------: | ----------------------------: | ------------------: |
| Team     |                 5 |                            25 |            USD 0.75 |
| Business |                10 |                            50 |            USD 1.50 |

Exactly one paid attempt, at most USD 0.025 reserved per review. The fixed initial
Terra profile reserves USD 0.02475 (12,000 input / 1,500 output tokens). No shared
report/bundle/capacity pool, top-up or manual paid regeneration. No data or unchanged
normalised evidence makes no provider call; existing unresolved priorities remain
linked. Missing/unqualified AI yields useful deterministic facts.

Run Mondays at 09:00 UTC. Persist due state and a unique project/week identity;
recover only the latest completed week after outage, then advance to a future
Monday. Bounded fair claims use the existing serial worker lane. Reserve quota
and money atomically under the organization lock. Persist sending intent before
HTTP; release definitely unpaid reservations only. Known usage settles even after
publication rights disappear; unknown outcomes retain their hold. Worker recovery
reuses validated output or factual fallback and never retries a paid intent.

`SMART_IMPROVEMENTS_ENABLED` defaults false. AI additionally requires its own enable
flag, key and `SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE=weekly-review-terra-v1`.
Report qualification does not qualify this new prompt. Offline fixtures/rubric
must pass first; actual paid provider qualification is separately authorised.
The unchanged initial profile passed the separately authorised synthetic provider
qualification on 11 November 2026; see `evals/smart-improvements/qualification-20261111.json`.
Activation is recorded separately in the release evidence.

## FR-SMI-04: interface and public analytics parity

Member/session list, metadata, bundle, settings and allowance operations under
`/v1/organizations/{organizationId}/improvements/reviews` call shared domain stores.
Reads are private/no-store and never reserve or enqueue. CLI `improvements reviews`
and six ordinary MCP tools use the same validated client. Restricted/OpenAI
catalogs/grants and ordinary opportunity/BundleV1 interfaces stay fixed.
The workspace UI uses the existing line-tab pattern: `/improvements` defaults
to Opportunities, while `/improvements/reviews` opens Weekly reviews. Tab changes
preserve opportunity filters and show only the selected panel and its actions;
weekly archive reads remain available under current access after downgrade.
Public Analytics uses familiar site navigation and existing shipped capabilities,
with opt-in/privacy and missing-data limits; no speculative marketing claims.
Ordinary MCP/CLI agents may obtain explicit chat consent and configure either
product using the real credential. Confirm scope, mode, schedule and recurring
allowance/provider use (plus report recipients), save with the current version,
then read back. Weekly reviews require the current Owner; reports require current
whole-scope administration. Read-only/restricted connectors cannot enable either,
and consent does not bypass operator flags, qualification or current permissions.

## Acceptance

- AC-SMI-01: bounded stable selection, reference integrity, no raw evidence,
  meaningful coverage, malicious output rejection and factual fallback.
- AC-SMI-02: default-off Owner consent/version/scope, no future projects,
  tenant/credential/opt-out/trial/tier fences, irreversible narrowing/deletion,
  bounded retention/export and current whole-scope archive reads.
- AC-SMI-03: atomic independent quotas/ceilings, no-data/no-change zero requests,
  single paid intent, known/unknown settlement, outage/lease recovery, no retry.
- AC-SMI-04: API/CLI/MCP parity and unchanged restricted catalogs; familiar accessible
  pending/empty/factual/quota/access/failure UI and isolated synthetic preview;
  public Analytics nav/canonical/sitemap/links and site build.
- AC-BUS-05/06 extension: Solo/Team factual generation succeeds with zero AI rows,
  holds or requests; v1 compatibility; preserved Business degradation/email/PDF,
  lifecycle/coverage/allowance/trials and migrations/readiness/checksums.

Schema uses three ordered additive forward migrations dated `20261110`, with
ledger checksums and fail-closed runtime readiness. Existing migration strings
remain immutable. The deploy path must migrate before new API/worker startup and keep generation
paused until every serving reader understands v2. A rollback must retain a v2-capable
reader for newly saved factual archives; older Business v1 artifacts are unchanged;
bootstrap remains empty-schema creation only. Local candidate checks cannot
substitute for a later authorised rollout or live provider acceptance.
