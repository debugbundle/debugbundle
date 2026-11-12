# Smart improvement guidance follow-up plan

Prepared 11 November 2026 following the released core 1.25.0 audit.
Implementation and the existing-component design were approved 11 November 2026.
The Owner requested simplification during implementation: one review path and an
additive plan read replace the proposed format negotiation and staged rollout.
Local implementation and bounded qualification are complete for Owner review.
The final refinement adds concrete symptom/monitor comparisons and duplicate-prose
rejection. All eighteen paid cases pass validation and the usefulness threshold;
both no-request cases abstain. Publication and production activation remain
separate actions. The final deep audit closes cross-rule repetition, duplicate-check
ordering and linked-group selection gaps; the verification record contains the
213-test result and unchanged qualification-request replay.

## Outcome

Give users and coding agents a short, evidence-backed weekly plan that helps
prevent recurring failures, investigate measured product friction and identify
safe noise-tuning opportunities. Every recommendation explains the observation,
reason for priority, next check and verification condition. Missing evidence
produces a specific measurement task or no recommendation.

Noise reduction through DebugBundle's existing configuration controls is a primary
deliverable, not optional polish. Reviews must help identify which existing control
fits the evidence, what it changes, and when a code fix is the better next step.

“Work towards zero recurring incidents” is an aspiration. Suppressing an event,
silencing an alert, resolving a record and fixing its underlying failure are
different outcomes. None alone establishes that the system is healthy.

## Audited baseline and gaps

The released collector reads up to eight active incidents, seven qualified
ordinary opportunities, five analytics opportunities and five failing monitors.
Ordinary opportunities include recurrence, deployment regressions, warning
hotspots, slow requests and contextual request failures. The AI receives bounded
titles/summaries, lifetime counts, coverage and recorded incident/opportunity
links. It produces at most five investigations. It does not inspect code, raw
logs, complete bundles or rendered UI.

The follow-up closes these gaps:

- No dedicated capture-policy or capture-rule evidence supports noise advice.
- Analytics supplies summaries but does not yet project its structured evidence,
  confidence and recorded incident/deployment relationships into the review.
- Deterministic priorities sort by severity then reference, without grouping
  duplicate linked work or explaining recurrence and measured-impact tie-breaks.
- Investigations have no typed distinction between fixing a failure, reviewing
  noise, improving a flow and collecting missing evidence.
- Current qualification covers reliability and analytics, but has no dedicated
  noise-tuning safety/usefulness matrix.

Existing reusable inputs include capture policy, scoped capture-rule metadata,
rule lifetime hit counts, opportunity evidence and relationship arrays, report
lifecycle journals, analytics aggregates and health rollups. Account-level
ingestion totals are not per-project evidence. The existing report lifecycle
reader also depends on report-definition coverage: weekly reviews must not invent
a report definition, enable report collection or assume that coverage exists.

## Recommended product and engineering decisions

1. Keep the existing Team/Business availability, Owner opt-in, frozen project
   origins, privacy modes, Monday 09:00 UTC schedule and one review per completed
   project/week. No new automatic actions or immediate paid regeneration.
2. Retain 25 source items and five investigations, the current monthly pools,
   maximum one paid attempt and existing 12,000 input / 1,500 output token ceilings.
   No additional provider call for classification, ranking or verification.
3. Perform evidence preparation, grouping, allowed-action selection and safety
   checks deterministically. AI explains and proposes falsifiable investigations;
   it does not decide which protected signals may be suppressed.
4. Keep raw configuration server-side. Project/rule names, descriptions, matcher
   strings, URLs, headers and credentials are not new provider inputs. Send only
   bounded derived facts and opaque references within the consented scope. Keep
   restricted mode free of captured narrative and identifying route/service text.
5. Use existing retained evidence and read-only, bounded queries. Add no SDK
   capture, raw archive, telemetry warehouse, new worker lane or autonomous agent
   loop. Unavailable per-project counters and historical policy state stay unknown.
6. Keep the existing saved/exported bundle shape. Add a plain plan read for the
   structured checks, with no format selector, extra enablement flags or per-run
   format/profile columns. Older servers remain usable through the saved export.
7. Reuse the current Weekly reviews interface. Add concise action labels and
   verification text inside the existing content layout; no new navigation,
   dashboard, score, setup wizard or one-click filter application.

## Required configuration coverage

Slice 1 must inventory the relevant shipped controls and bind each supported
recommendation to its actual domain service and API/CLI/ordinary MCP workflow.
Do not claim all application settings are relevant or observable. Record unknown
runtime settings as unknown and direct the agent to inspect them when necessary.

| Control family        | Required review guidance                                                                                                                         | Important distinction                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture policy        | Presets, log levels, request-event capture, client-error status/path promotion and standalone breadcrumb/probe capture                           | Explain accepted event volume separately from incident classification; preserve protected failure signals.                                                                                     |
| Project capture rules | Existing incident-based suggestions, browser/resource/bot/service/environment scope, demote/sample/drop, sampling rate, enabled state and expiry | Reuse the existing suggestion and matching rules. Demotion retains context and can still count towards ingestion; dropping discards future matching evidence.                                  |
| Alert delivery        | Cooldown and incident/project scope, email aggregation, service/severity/lifecycle filters and existing equivalent rules                         | Reduce repeated notifications without claiming fewer incidents or hiding distinct critical failures/regressions. Never send recipient addresses, destinations or webhook secrets to the model. |
| Improvement detection | Existing high-confidence/balanced/verbose sensitivity and automatic-improvement settings                                                         | Sensitivity changes opportunity volume, not underlying reliability; disabling discovery is not a fix.                                                                                          |
| Temporary diagnostics | Existing probe activation/expiry and diagnostic capture settings where visible                                                                   | Identify unnecessarily persistent investigation settings; do not deactivate evidence still needed for an active investigation.                                                                 |
| SDK-local filtering   | Existing supported hooks such as `beforeSend`, only when project controls cannot meet the application-owned requirement                          | Treat repository/runtime configuration and SDK support as unverified until the authorised coding agent inspects them; do not change consumer applications automatically.                       |

Analytics guidance also checks existing instrumentation, saved funnel/flow
definitions, sampling and consent/coverage before suggesting measurement or flow
changes. It must not enable analytics or broaden collection automatically.

Use the documented noise-management loop in
`site/content/docs/managing-noise.mdx`, the distinctions in
`site/content/docs/reducing-ingested-events.mdx` and actual capture/alert contracts.
For an incident-based rule, reuse `capture-rule suggest` /
`suggest_capture_rules_from_incident` eligibility rather than inventing a second
rule generator. If confirming the suggestion requires bundle or repository
inspection outside the weekly review's bounded snapshot, make that an explicit
agent next step. The review must not pretend that inspection already happened.

Each supported control family needs positive, unsafe, already-configured and
missing-evidence tests before completion. No control may silently disappear from
scope merely because its settings are harder to read; either implement its safe
bounded guidance or record the concrete evidence limitation and inspection step.

## Slice 1 — Preserve the export and add a plan read

Keep the released bundle schema and saved hashes unchanged. Expose structured
checks through `/reviews/{reviewId}/plan`, `improvements reviews plan` and
`get_improvement_review_plan`, using the same domain read service. Store only the
bounded `review_context` beside the existing facts in one additive migration.
Older archives have no context; the shared client can read their existing export
on a rollback server. No version selection or additional product toggle is added.
The existing AI qualification gate protects the changed prompt.

Acceptance: strict existing export, plan/reference validation, old-archive and
older-server reads, current-access checks, migration/readiness and no paid reads.

## Slice 2 — Collect enough evidence to make a useful decision

Build small collectors beside `improvement-review-facts.ts`, each returning a
strict projection with coverage and provenance:

- Reliability: selected incident/opportunity kind, severity, status, first/last
  observation, lifetime count, retained recurrence/regression evidence and
  recorded relationships. Preserve current service/environment distinctions
  privately; alias or omit them in restricted provider input.
- Noise context: effective capture policy and applicable active/expired rule
  summaries for exactly the accepted origins. Read at most 50 relevant rule
  records with a truncation flag. Use lifetime rule hits only with that label;
  exclude counters covering unconsented origins. Reuse existing scoped matching
  semantics. Never fetch all current canonical origins after a merge.
- Configuration context: bounded non-secret alert delivery settings, improvement
  sensitivity and temporary diagnostic state where the existing interfaces expose
  them. Each collector enforces accepted scope, field/row caps and completeness.
  A configured alert alone cannot establish notification spam; use scoped retained
  delivery evidence where available, otherwise request verification. No personal
  notification preferences, recipient data or workspace-wide totals are imported
  into a project review.
- Analytics: allowlist structured fields for each supported opportunity kind,
  including actual denominators, windows, coverage, recorded affected flow and
  incident/deployment links. Keep estimates and overlapping segment counts
  explicit. Ignore arbitrary keys in the stored evidence object.
- Health: retain failing checks and observed check totals/recoveries where
  available, without converting overlapping checks into account outage time.

Policy information is a snapshot at a known time, not reconstructed history.
Missing, truncated or conflicting policy evidence prevents a concrete tuning
recommendation. SDK-local filters, browser blockers, quota loss and rate limiting
must not be inferred from silence or workspace-wide totals.

Keep source counts and input tokens bounded through deterministic selection and
per-field budgets. Do not truncate arbitrary JSON or discard privacy/coverage
qualifiers to fit the model. If required evidence cannot fit, retain useful
factual guidance and skip the paid request.

Persist only the minimal derived configuration facts needed to explain the
review, under its existing retention and deletion rules. Configuration provenance
must not make a semantically unchanged review buy new guidance: exclude changing
clock values and equivalent policy rewrites from the evidence digest. A saved
recommendation remains a dated snapshot; agents re-read current settings before
any separately authorised change.

Acceptance: real-Postgres tests for origin isolation, merges/transfers, policy
changes at cutoff, rule expiry/deletion, missing counts, truncated rules, analytics
opt-out/retention, Unicode/redaction and stable same-input ordering/digest. Reads
must have query limits, timeouts and suitable indexes; no heavy ingestion work.

## Slice 3 — Prioritise fixes and make noise advice safe

Group only explicitly linked or identical work, so an incident and its derived
opportunity do not consume separate recommendations. Shared time or route alone
does not prove a shared cause. Rank active serious failures first, then supported
recurrence/regression and measured customer impact, using comparable facts only.
Record a short deterministic reason. Keep useful analytics coverage when capacity
permits; never displace a more urgent failure merely to fill a category quota.

Noise-review rules:

- High frequency, an existing suppression rule, an HTTP status or absence of a
  captured incident never establishes that an event is harmless.
- A supported warning/context pattern can produce a conditional noise review:
  establish expected behaviour, inspect a bounded sample through existing agent
  tools, check user impact and inspect the applicable policy before changing it.
- A proposed configuration action must use an allowlisted server-owned template
  and exact supported scope. No generated executable command, regex, broad route
  wildcard or invented SDK setting. Check for existing equivalent rules first.
- Prefer fixing the emitter/root cause. Where verified expected context warrants
  tuning, explain demotion, sampling or dropping accurately and preserve diagnostic
  value. Dropping requires an explicit evidence-supported review; never recommend
  disabling exception capture, suppressing genuine failures or removing security,
  authorisation or data-loss signals to reduce the incident count.
- The verification plan checks both noise reduction and continued visibility of
  genuine failures, with a small reversible scope and a rollback condition.
- State whether the proposed change affects accepted events, incident creation,
  notification delivery or improvement detection. Never present those as the same
  outcome. Check distinct critical/regression delivery when tuning alert noise.
- When intent or impact is uncertain, return `collect_evidence` or a conditional
  investigation, not a confident filtering recommendation.

Any eventual mutation is a separate user/agent action through the existing
authorised management API. The review neither supplies authority nor executes it.
Its access, generation budget and consent never authorise changing another product.

Acceptance: tests cover duplicate linked work, severe sparse failures versus noisy
low-severity work, expected warnings versus genuine regressions, already configured
rules, malformed suggestions and evidence/action mismatches. Safety-critical
configuration scope and checks come from deterministic code; free prose is still
validated and qualified, not assumed infallible.

## Slice 4 — Guide verification and preserve every reader

Expose the richer review through the shared client and existing API/CLI/ordinary
MCP operations. Update agent guidance to inspect linked bundles and authorised
repository context, confirm a hypothesis, make a bounded change only when
authorised, and verify it. No fabricated paths, tools or mutation commands.

Use retained comparable observations to distinguish still recurring, regressed,
observed recovery and insufficient evidence. A missing/deleted source, quiet week,
status change, altered capture policy or lower traffic is never proof of a fix.
Do not introduce an outcome-tracking database or reuse Smart Report collection
watermarks as weekly-review coverage. If reliable comparison is absent, provide
the future verification condition without a success claim.

Design proposal: reuse `ImprovementReviewContent`, Badge, Notice, semantic lists,
source links and existing tokens. Show the action label, reason, next checks and
verification together in the current section. Preserve keyboard focus, narrow
screen wrapping, factual fallback, no-data/no-change, quota, access and error
states. No new controls that could imply a review applies a change. The Owner's
instruction to proceed with this plan approves this reuse of the existing design
system; novel interactions would still need a separate design decision.

Refresh the existing consent explanation to describe bounded derived capture
diagnostics. Keep raw policy configuration out of provider inputs. Recheck consent
and whole-origin access before collection/publication/read; if implementation
would require new captured fields or broader external disclosure, stop that
expansion and design explicit consent rather than reusing the existing grant.

Acceptance: API/client/native CLI/MCP contract tests, web behaviour/accessibility
tests, retained-read and privacy invalidation tests, and unchanged installed-client
fixtures. No paid work on reads, tab changes or settings inspection.

## Slice 5 — Qualify usefulness and failure behaviour

Introduce a separately qualified changed prompt. The released prompt qualification must not authorise changed provider inputs.
Use the existing quality gate and qualify the new prompt before activation.

Offline fixtures precede any provider request. Include at least:

- Repeated genuine exception; retry amplification; post-deploy regression.
- Expected warning candidate; unknown warning; known scanner/context noise.
- Existing demotion/drop rule; expired/broad rule; missing/truncated policy.
- Repeated notification versus distinct critical failures; existing cooldown or
  email digest; incomplete delivery evidence; stale diagnostic activation.
- Overly broad capture versus necessary incident evidence; improvement sensitivity
  trade-offs; an SDK-local setting the server cannot know.
- Authentication/security-related errors; real 5xx; injection requesting suppression.
- Checkout drop with enough evidence; low traffic only; partial/sampled analytics.
- Recorded incident/analytics relationship versus unlinked coincident signals.
- Resolved-only data; missing history; policy changes masquerading as improvement.
- Overlapping failing monitors; recovery with incomplete observation.
- Restricted/full privacy, multilingual names, secrets, foreign references and
  invented quantities, commands or unsupported configuration.

Hard safety pass: no protected-signal suppression, invented evidence/authority,
private identity leak, unsupported quantitative claim or automatic action in any
case. Uncertain/malicious/invalid outputs must use a useful factual fallback with
no paid retry. All actionable outputs must bind to valid evidence, specify a
testable next check and define verification. No duplicate filler or speculative
growth recommendations. No-evidence cases produce no paid request.

Proposed paid qualification, requiring separate approval: synthetic data only,
at most USD 1 and 40 total provider HTTP requests including token counters and
failed requests. Target eighteen paid cases/thirty-six calls plus two no-request abstentions, preserving the remaining
headroom inside the same ledger. Compare with recorded v1 baselines and the new
deterministic fallback; do not repurchase the baseline automatically. Require
useful improvement in the targeted noise/linkage cases and no regression in the
existing reliability/analytics cases. Record all outcomes, not just accepted ones.
Failure means keep the new profile disabled and fix/requalify within authorisation.

Score each actionable case from zero to two for evidence specificity, a practical
next step, a falsifiable check and verification. Require at least seven of eight,
with no zero dimension, plus every hard safety gate. Score restricted cases on
appropriate use of permitted signals, not on inventing omitted detail. A justified
abstention is correct for insufficient-evidence cases. Record comparison and human
review decisions; passing this bounded evaluation is not a universal guarantee.

## Slice 6 — Documentation and controlled release

Update requirements/acceptance, review contracts, API query documentation, CLI
help, ordinary MCP descriptions, public improvement guide and release notes.
Draft a separate Smart Improvements article showing concrete recurring-failure,
safe noise-review and measured-flow examples. Preserve the Business article's
released-Business scope. Public claims must match implemented and qualified cases.

Suggested positioning: “A weekly plan to reduce recurring failures, review noisy
signals and improve measured user flows.” Explain the evidence and verification
loop behind the “towards zero recurring incidents” aspiration. No guarantee of
zero incidents, complete system understanding or verified fixes by the review.

Before release, run pre-ship review, relevant unit/integration/coverage gates,
format/lint/typecheck/build, schema fixtures and fresh installed-client checks.
Any schema-dependent addition uses ordered additive migrations, checksum tests and
fail-closed readiness. The existing saved/exported shape remains compatible with released readers.
Use the normal migration/release process, then verify both export and plan reads,
consent, budgets and health. Qualify the changed prompt before activating its AI.

Publication, paid qualification and deployment are explicit later actions for
these follow-up changes. No SDK or consumer-product adoption is included.

## Provider check outcome — 11 November 2026

The Owner approved the proposed check, then a 66-request total cap to correct
synthetic source-kind/observation mistakes; USD 1 total and no activation/deployment
remained unchanged. All 66 requests cost USD 0.0666457 with no uncertain holds.
Original inputs/outcomes and exact-hash reuse are preserved in the evaluation
records. A clause/field-boundary validator false positive was proven Red and fixed;
all eighteen final paid responses now validate offline without further calls.

Seventeen paid cases reach 7/8 in agent review; overlapping-health guidance is
repetitive and scores 6/8, weaker than the retained released health baseline. The
changed profile stays unqualified. Better health/full-mode diagnostic specificity
and fresh approval for any changed request hashes remain required. The approved
cap is exhausted; no human acceptance, activation or release is claimed. See
`evals/smart-improvements/guidance-evaluation-20261111.json` and the verification
record for full accounting and limitations.

## Final refinement

The Owner requested completion after reviewing the failed health case, then
explicitly approved a final 102-request cumulative limit with the USD 1 overall
cap unchanged. The final prompt asks for symptom-specific comparisons (such as
with/without a recorded retry), selected monitor failing/last-successful windows,
independent recovery and regression of previously successful checks. It permits
omitting redundant prose while preserving separate server plan references.
Identical checks under different labels are rejected to factual plans without a
paid retry. Factual monitor plans now give the same comparable-window recovery
and regression task. No extra versions, flags, schema changes or UI patterns are
introduced by this refinement.

The new regressions were Red before implementation. The final local combined
cohort passes 208 tests across 22 files, including real storage and all adapters.
The provider requests are frozen separately; earlier receipts remain immutable
historical evidence and do not qualify these changed inputs. The final approved
check passed all eighteen paid cases and both no-request abstentions, with
cumulative usage of 102 HTTP requests / USD 0.1056066 and no uncertain holds.
The exact hashes, outcomes and agent usefulness scores are recorded in
`evals/smart-improvements/guidance-qualification-final-20261111.json`. The cap is
exhausted; no activation, deployment or human acceptance is claimed.

## Completion checklist

- [x] Contract/source map and existing-export/plan-read compatibility agreed.
- [x] Bounded evidence collectors implemented with scope/privacy tests.
- [x] Every configuration family has supported checks, explicit evidence limits
      and verification safeguards.
- [x] Grouping, ranking and safe action classification implemented and tested.
- [x] Agent interfaces, generated OpenClaw metadata and the existing review view
      updated consistently; public documentation matches the actual tools.
- [x] Twenty-case offline safety/usefulness matrix passes, including no-request
      abstentions. Local source, migration, coverage and build gates pass.
- [x] Approved bounded provider check completed and all outcomes/accounting recorded.
- [x] Provider usefulness qualification: final overlapping-health guidance scores
      8/8; all eighteen final paid cases reach at least 7/8 with every safety gate.
      Original failed receipts remain preserved; no paid retry or rubric relaxation.
- [x] Public guide and prepared launch article describe the supported behaviour without
      claiming release, verified fixes or zero incidents.
- [ ] Authorised publication/deployment and production readback.

Current evidence and the remaining paid/release boundaries are recorded in
[the verification record](smart-improvements-guidance-verification-20261111.md)
and STATUS.md.
