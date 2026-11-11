# Weekly improvement planning contract

FR-SMI-05–08 / AC-SMI-05–08 extend the released weekly review without changing
its schedule, consent, scope, allowance or paid-attempt rules.

## One review and an additive plan read

There is one schedule, one generation path and one AI configuration. Existing
`GET /v1/organizations/{organizationId}/improvements/reviews/{reviewId}/bundle`
exports keep their released strict shape and saved hashes. The additive `/plan`
read returns that saved content with `context` and at most five typed `plans`.
Older archives have `context: null` and no configuration plans. The plan checks
derive from frozen evidence and the current trusted templates. Neither read
queues work, calls a provider or rewrites retained content. Both require current
whole-scope access and private/no-store responses.

CLI adds `improvements reviews plan ...`; ordinary MCP adds
`get_improvement_review_plan`. No format selector, per-review format/profile
columns or additional enablement flags are required. The web uses the plan read;
the shared client falls back to the existing export on an older server. Existing
restricted/OpenAI catalogues remain unchanged. Validated AI investigations remain
in the existing export. The plan read adds server-owned configuration checks and
their supporting snapshot.

The additive migration `202611110001_add_improvement_review_planning` adds only
nullable, size-bounded `review_context`. Readiness requires that column and its
constraint; deploy migration before new code. The snapshot freezes with facts
before any paid intent and owns its own checksum; the released facts checksum
retains its meaning for older worker recovery. Existing frozen facts/paid receipts keep their original
meaning. Old readers can still read the unchanged saved/exported bundle shape.
Bootstrap creates an empty schema and never upgrades one.

## Evidence and privacy

Only explicitly accepted origin IDs are inputs to the collectors. Canonical
aliases never add origins. Configuration for a merged legacy view that cannot be
established within those origins is unknown. Public/private provider projections
are distinct: no project/source UUIDs, rule names/descriptions/matchers, recipients,
destinations, credentials, user journeys or raw event bodies enter the new model
context. Restricted mode keeps its generic source labels and withheld narratives.

The context contains at most 25 source signals, 25 origin policy summaries,
50 rule summaries, 25 alert summaries and 100 inspected delivery/probe rows.
Overflow makes coverage partial; a missing policy is unknown. Rule lifetime hits
covering other origins or matches after cutoff are withheld. Delivery rows are
bounded retained records created and delivered within the review period for
selected incidents and alert rules, not a complete notification count. A sample
can establish repeated delivery for the same incident even if the total is unknown.
This includes different wholly accepted rules delivering the same incident;
only participating rules are linked. Distinct incidents and rules spanning
unaccepted origins cannot establish repetition. Multiple recipients may be
intentional: repetition prompts inspection, never an automatic suppression claim.
Policies/rules are dated snapshots, not evidence of SDK adoption or past behaviour.
SDK-local configuration is always `not_observed` until an authorised agent inspects it.

Structured analytics measurements use an allowlist of numeric keys, units and
actual observation windows. Missing windows produce snapshot values, not weekly
counts. Baseline measurements without their own comparison window remain snapshots.
Denominators and complete comparable coverage are required before a flow
plan can progress beyond evidence collection. Recorded incident relationships are
links, not causal findings. No report definition, extra collection or raw archive
is enabled to support these reads.

Context shares the existing bounded retention, consent/privacy invalidation,
project/account deletion and whole-scope egress checks. Equivalent policy timestamp
rewrites and advancing review cutoff do not independently buy another narrative.

## Plans and configuration advice

At most five server-owned plans use `investigate_failure`, `review_noise`,
`improve_flow` or `collect_evidence`. Each includes actual source references,
reason, inspection, verification and supported control checks. Serious active
failures precede lower-severity work; recorded recurrence/regression and measured
impact break appropriate severity ties. Incident-derived recurrence opportunities
can group with their recorded incident. Analytics correlations remain separate
investigations so they cannot silently become a shared-cause claim.
Grouping and reference-ceiling selection use stable severity/reference order,
independent of input iteration order.

Control checks cover capture policy, capture rules, alert delivery, improvement
sensitivity, temporary diagnostics and conditional SDK-local inspection. Known
capture settings are stated by the server. Incident noise review reuses existing
capture-rule suggestion/eligibility and matching workflows; the review invents no
matcher, executable command, regex, provider destination or mutation payload.

High frequency is not harmlessness. Establish expected behaviour and impact before
tuning. Demotion affects incident creation but retained events can still count as
ingestion; sampling/drop affect retained event volume; cooldowns/digests affect
notifications; sensitivity affects opportunity discovery. Verify these outcomes
separately, preserving genuine failures and distinct critical/regression delivery.
No review executes a change or grants permission to alter a consumer application.

AI investigations must cite exactly the references of an allowed server plan.
Configuration decisions remain in server templates. Unplanned references,
configuration prescriptions, unsafe identity/redaction/quantitative output and
malformed responses are rejected to factual plans, without another paid request.
Identical checks repeated under different source labels or in a different checklist
order are rejected as duplicate guidance. The model may omit a redundant investigation; unlinked reference groups
remain separate, and the factual plans still cover the selected work. Health
checks compare available failing/last-successful observation windows and response
evidence, independent recovery and regressions in previously successful coverage.
These are inspection questions, never invented historical observations.
Validation and a bounded evaluation do not prove every natural-language hypothesis.
A quiet period, deletion, resolution click, lower traffic or altered capture policy
does not establish a successful fix. Without reliable comparison the output gives
the future verification condition and leaves the outcome unverified.

## Quality and budget safeguards

The existing enablement, AI key and quality gate remain. The changed prompt needs
its own qualification under `SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE=weekly-review-guidance`;
the released prompt's earlier qualification does not qualify new provider inputs.
There is no additional product/version switch. Keep AI unavailable until this
check passes; deterministic plans remain useful without it. The same 12,000 input /
1,500 output ceilings, single paid intent, USD 0.02475 reservation, independent
monthly pools and paid-uncertainty holds apply.

Offline qualification includes every supported control family, protected failures,
existing/expired rules, incomplete evidence, privacy and injection. Paid synthetic
qualification requires separate explicit approval, at most USD 1 and 40 total HTTP
requests including counters/failures. Its restart-safe ledger prevents case replay,
concurrent ownership and silent fixture changes. Interrupted paid calls remain held.
The Owner-approved 11 November 2026 evaluation exceptionally extended the combined
cap to 66 requests while retaining USD 1 total, to correct synthetic fixture errors.
Its immutable original/corrected ledgers and results are recorded in
`evals/smart-improvements/guidance-evaluation-20261111.json`. That completed check
used all 66 requests and does not authorise further calls or activation. The
normal runner's forty-request limit is unchanged.
The Owner subsequently approved a final refinement check up to 102 cumulative
requests, retaining the USD 1 overall cap and excluding activation/deployment.
It uses eighteen frozen synthetic cases (at most thirty-six additional requests)
and preserves all earlier results. The completed final check passes the bounded
safety/usefulness review, recorded with exact current hashes in
`evals/smart-improvements/guidance-qualification-final-20261111.json`. Cumulative
usage is 102 requests / USD 0.1056066, with no uncertainty; the cap is exhausted.
Earlier failed guidance receipts are historical evidence only. This qualification
does not set an environment marker or authorise activation/deployment.
Require seven of eight for specificity, practical next check, falsifiability and
verification, no zero dimension and every hard safety gate. No provider-quality
claim or activation is made until those results are recorded.

Release uses the ordinary migration and compatible runtime train. No separate
reader-bridge rollout is needed for this addition: saved exports remain readable
by the released readers. Publication and deployment require later authorisation.
