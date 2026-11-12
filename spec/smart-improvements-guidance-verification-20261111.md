# Weekly improvement guidance — local verification

This is an unpublished implementation following the approved guidance plan.
During implementation the Owner requested simplification of the proposed format
versioning. That decision supersedes the earlier local design; the feature has
one schedule, one generation path and one AI configuration.

Core baseline: `c79f0ebf546d2db59628e583178f01fb310922bf`. Site baseline:
`a8ca5de80cec218da27358a058ce17974deec754`. Private cloud baseline:
`b253c59ec0e85726cc780a94916e263e02a68bfe`. All changes remain uncommitted.

## Inventory and contracts

FR-SMI-05–08 / AC-SMI-05–08 are owned by
[the planning contract](../contracts/improvement-review-planning.md).

| Boundary     | Implementation and invariant                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preparation  | Exact accepted origins, retained source IDs, numeric analytics and bounded policy/rule/alert/probe metadata; no new SDK collection or ingestion work.                                                  |
| Planning     | Up to five deterministic failure, noise, flow or evidence plans, grouped only through recorded incident-derived links; current trusted templates own configuration checks.                             |
| Provider     | Derived allowlisted context, closed investigations, source-reference validation, privacy/redaction and quantitative-output guards; no executable controls or extra model calls.                        |
| Persistence  | Existing facts, bundle/export schema, paid receipts and facts checksum retain their released meaning. One nullable bounded context snapshot has its own checksum and freezes before paid work.         |
| Reads        | Additive `/plan`, CLI `improvements reviews plan`, MCP `get_improvement_review_plan`; original bundle export and validated AI investigations remain available. Older-server fallback uses that export. |
| Presentation | Existing saved-review dialog, Badge, Notice and semantic lists show next checks, distinct effects and verification. No new setup, mutation control or navigation.                                      |
| Operations   | Normal migration/release train, existing quality gate and budget. No format selectors, per-review format/profile columns, extra flags, image reader labels or two-stage rollout.                       |

## Configuration coverage

| Family                  | Evidence and next step                                                                                                                                                                        | Verification boundary                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Capture policy          | Safe effective preset/verbosity/promotion summaries, or explicitly unknown. Establish expected behaviour before narrowing capture.                                                            | Compare accepted volume under comparable traffic; preserve genuine exceptions and important request failures.                         |
| Capture rules           | Bounded action/state/expiry/hit metadata and recorded incident links. Inspect existing suggestions and matching scope before adding a rule; prefer fixing unexpected behaviour at its source. | Demotion and accepted usage differ. Reproduce expected context and a genuine failure; preserve regressions and reverse evidence loss. |
| Alert delivery          | Repeated retained delivery for the same selected incident; incomplete totals remain unknown. Inspect cooldown, scope and email aggregation.                                                   | Check notification volume separately from incidents and confirm distinct critical/regression delivery.                                |
| Improvement sensitivity | Known verbose discovery setting with a supported noise-review candidate.                                                                                                                      | Discovery volume is not failure recovery; meaningful recurrence/friction must still surface.                                          |
| Temporary diagnostics   | Active scoped probes or investigative diagnostic capture. Normal balanced defaults do not imply a temporary investigation.                                                                    | Confirm the investigation still has its required evidence before ending extra capture.                                                |
| SDK-local filters       | Always unobserved on the server; inspect the authorised repository and actual installed SDK only when project controls cannot meet the need.                                                  | Preserve failure capture and redaction. Consumer changes require separate consent.                                                    |

## Failure and trust review

- Frequency does not prove harmlessness. Protected failures, serious active
  incidents and regression signals remain investigations. Analytics needs a known
  window, denominator and comparable coverage; incomplete evidence produces a
  measurement task. Recorded linkage is not causation.
- SQL reads have caps and run inside the existing authorised read-only snapshot
  with a statement timeout. Policy rewrites and moving cutoff alone do not buy a
  new narrative. Delivery overflow preserves positive repetition evidence while
  withholding complete counts; baseline windows stay unknown when unavailable.
- Provider projection excludes project/source IDs, rule text/matchers,
  recipients, destinations, raw logs/bodies and individual journeys. Restricted
  source narratives stay withheld. Semantic prose safeguards and a bounded
  evaluation do not guarantee every hypothesis is correct.
- Consent/privacy narrowing and project deletion remove the entire derived
  review, including its snapshot. Whole-scope access is rechecked for collection,
  payment, publication and reads. Paid/uncertain accounting survives content
  removal; paid intents are never retried by a generic job retry.
- Migration `202611110001_add_improvement_review_planning` is additive. Existing
  migration checksums are preserved. Readiness rejects a missing column or size
  constraint. Bootstrap remains empty-schema creation only. Old workers retain
  the original facts checksum for pending-work recovery.
- Existing connection/lease cleanup and serial worker lane are reused. Local
  integration stacks own and remove their disposable services/volumes. Native
  client fixtures use only loopback HTTP, temporary auth and unpublished packages.

## Evidence

Final local checks pass. Receipts remain in ignored local files:

- `.tmp/review-guidance-current-coverage.log`: 193 tests across 22 files for the
  final source, including scope, privacy, paid recovery, migration, old exports,
  plan reads, the twenty-case matrix and generated agent metadata.
- `.tmp/review-guidance-simplified-unit-final.log`: 122 focused unit/interface/UI
  tests, including two no-request abstentions.
- `.tmp/review-guidance-native-final.log`: freshly installed unpublished CLI/MCP
  export and plan reads pass on Node 22.23.3, 24.14.0 and 26.12.0.
- `.tmp/review-guidance-simplified-check-final.log`: type, lint and format checks.
- `.tmp/review-guidance-site-final.log`: final public-site tests, types and static
  build. `.tmp/review-guidance-simplified-build-final.log`: application/client builds.
- `.tmp/review-guidance-simplified-full.log`: all 134 regression shards ran, with
  6,543 tests passing initially. Two stale metadata checks failed: the OpenClaw
  manifest entry and the public MCP tool count. Production code was not changed
  to satisfy those checks; the generated manifest and documentation were corrected.
- `.tmp/review-guidance-final-coverage-gate.log`: both exact affected shards pass
  on recheck (5 OpenClaw tests and 61 contract tests), completing the regression
  matrix. Coverage merges all 134 shard receipts with the final 193-test recheck.
  Four source files changed during the long run use their final recheck mappings
  rather than stale mappings. The existing 80% changed-source gate passes for all
  23 changed source files; two use its existing changed-line fallback. No threshold
  or test expectation was weakened.
- `.tmp/review-guidance-source-manifest.json`: final local source and unpublished
  client-package hashes. These packages are review candidates, not new public releases.

No browser/device, production activation or provider-quality acceptance is claimed
by these local checks. The approved synthetic evaluation made thirty-six HTTP requests and cost
USD 0.0362846. No production write, canary, commit, push, publication, deployment
or consumer-product change has occurred.

## Historical failed check (superseded by final qualification)

The first guidance candidate was not provider-qualified. The Owner approved a USD 1 /
forty-request synthetic evaluation, excluding activation/deployment. The initial
run used thirty-six requests / eighteen paid attempts and USD 0.0362846, with
sixteen accepted and two rejected outputs. Several synthetic observations kept
incident-specific wording after changing their source kind, so no qualification
claim is made from that run. Rejections retained factual fallback; their precise
prose was not retained by the original runner and no cause is invented here.

Original inputs were verified against every ledger/request hash and preserved in
`evals/smart-improvements/guidance-initial-fixtures-20261111.json`; all outcomes and
costs are in `guidance-initial-evaluation-20261111.json`. Corrected inputs are in
`guidance-coherent-fixtures-20261111.json` and pass sixty-four offline domain tests.
The Owner explicitly approved the extension to sixty-six total HTTP requests,
keeping USD 1 total and excluding activation/deployment. The corrected run made
thirty requests / fifteen paid attempts; three unchanged paid inputs were reused
only after exact fixture/request-hash matching. Aggregate accounting is sixty-six
requests (thirty-three counters and thirty-three paid attempts), USD 0.0666457,
with no uncertain entries or unsettled reservations. Both no-evidence cases
abstained before the counter. The temporary owner-only credential file was removed
and the DebugBundle configuration bytes were unchanged.

Three corrected paid outputs were initially rejected because the new configuration
regex joined fields and matched across clauses: a bounded code change followed by
comparable capture/sampling observations looked like a capture mutation. Four
regressions were Red before the fix. Clause/field-bounded matching corrects that
specific false positive while direct configuration and suppression prescriptions
remain rejected. The provider prompt/request bytes are unchanged; original paid
outcomes are not overwritten or relabelled as successful provider-time validation.

All eighteen final paid responses now pass offline validation against the exact
fixture/request hashes. `.tmp/review-guidance-validator-red.log`,
`.tmp/review-guidance-validator-replay.log` and
`.tmp/review-guidance-validator-green.log` retain the diagnosis and initial fix.
The final 74-test domain suite includes replay of every retained final response;
its coverage/check receipts are `.tmp/review-guidance-validator-coverage.log` and
`.tmp/review-guidance-validator-check.log`. The prior full regression/build receipts
above cover the unchanged implementation; this final correction is separately
qualified by targeted tests, typecheck, lint and the normal coverage gate
(`.tmp/review-guidance-validator-final-gate.log`). It passes for all 23 changed
source files; final mappings replace the validator's older coverage mappings.

`evals/smart-improvements/guidance-evaluation-20261111.json` preserves both ledgers,
every final response, usage, provenance, original rejection state, offline replay,
scores and comparison. Seventeen paid cases meet the 7/8 agent usefulness rubric;
the overlapping-health case repeats identical checks, adds little to factual plans
and scores 6/8, weaker than the retained released health baseline. Safety-compatible
text is not by itself a usefulness pass. Neither universal quality, no regression
nor human acceptance is claimed.

That candidate remained **unqualified**. The final refinement below addresses
health and full-mode specificity without lowering the rubric or changing the
historical receipts. No production configuration was changed by either check.

## Final qualification and review readiness

The Owner requested completion and explicitly approved extending the cumulative
request cap from 66 to 102, with USD 1 overall unchanged and no activation or
deployment. The corrected prompt and factual monitor plans now require concrete
symptom comparisons, failing/last-successful monitor windows and response evidence,
independent persistence when overlapping monitors recover, and regression checks
for previously successful coverage. It may omit redundant investigations without
merging unlinked source groups. A new duplicate-check validator rejects identical
prose under different labels to factual fallback, with no second paid response.
No schema, UI pattern, generation lane, product version or flag was added.

The duplicate/prompt requirements and factual health-plan regressions were Red
before implementation (`.tmp/review-guidance-specificity-red.log` and
`.tmp/review-guidance-health-plan-red.log`). Final qualification uses the same
fixed twenty synthetic conditions: eighteen paid cases and two no-request
abstentions. Every paid case passed provider-time application validation and the
minimum 7/8 usefulness rubric in Codex's manual review; overlapping health improved
from repetitive 6/8 prose to a concrete selected-monitor comparison and verification
(8/8), while the incident cases explicitly test recorded retry/no-retry behaviour.
Restricted identities, unknown facts, protected failures and captured instructions
remain within the existing safety boundaries. Human review remains the Owner's
next step; this is not statistical or universal proof of model usefulness.

The final check made thirty-six requests (eighteen counters/eighteen paid attempts),
USD 0.0389609. Cumulative totals across every historical/final call are 102 requests,
fifty-one paid attempts, USD 0.1056066, with zero uncertain entries or unsettled
holds. No further provider request is authorised by this exhausted cap. The
credential wrapper removed its temporary owner-only file and verified DebugBundle
configuration bytes unchanged. No customer evidence or other product was accessed.

Permanent evidence is
`evals/smart-improvements/guidance-qualification-final-20261111.json`: exact qualification-time
fixture/request/source hashes, immutable prior receipt hash, final ledger, every
response, usage, per-case scores and comparison. The runner's generic
`qualified:false` output requires this separate manual review; it is retained as
the original outcome, not rewritten. The final receipt records the passing bounded
agent review. Activation and deployment were neither authorised nor performed.

Final checks:

- `.tmp/review-guidance-specificity-coverage.log`: 208 tests across 22 files,
  including real Postgres scope/consent, budgets, migration/readiness, recovery,
  API/CLI/MCP and existing UI adapters; temporary services/volumes removed.
- `.tmp/review-guidance-final-receipt-tests.log`: 80 domain tests, including exact
  current request-hash binding and offline validation of every final response.
  The earlier failed health prose remains in its original receipt and is now
  explicitly rejected as duplicate guidance.
- `.tmp/review-guidance-specificity-check-final.log`: final root typecheck and
  scoped lint/format checks. `.tmp/review-guidance-specificity-final-gate.log`:
  standard changed-source coverage gate passes all 23 files, using final mappings
  for the five sources changed since the broad 134-shard run.
- Earlier application/public-site builds, installed CLI/MCP on Node 22/24/26 and
  the complete regression shard inventory remain valid for their unchanged
  surfaces. No browser/device or production workflow acceptance is claimed.

All planned local implementation and bounded qualification tasks are complete
for Owner review/testing. The ordinary migration, release, activation and
production readback remain later separately authorised actions.

## Final deep audit (11 November 2026)

The follow-up audit maps to FR-SMI-05–08 / AC-SMI-05–08 and closes three
edge cases with regression tests before the fixes:

| Finding                                                                | Resolution and boundary                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same incident delivered by different alert rules was missed.           | The bounded retained sample now checks repetition across wholly accepted rules and links only participating rules. Distinct incidents and rules spanning unaccepted origins remain excluded. Recipients are not read, so repetition remains an inspection task rather than a claim of redundant delivery. |
| Reordering identical AI checks bypassed duplicate detection.           | The validator compares normalised check lists independently of order, without changing returned prose or making another paid request.                                                                                                                                                                     |
| More than five linked sources could change selection with input order. | Both grouping and selection use stable severity/reference order, preserving the reference ceiling and remaining plans.                                                                                                                                                                                    |

The unit failures are preserved in `.tmp/review-guidance-audit-red.log`.
The alert regression first exposed test-fixture UUID/scope setup errors; these
were corrected to use a real merged-project binding with enforced database
triggers. `.tmp/review-guidance-audit-alert-red-scoped.log` then reproduced the
actual missing repetition. No production guard was relaxed to make a fixture pass.
A further regression verifies that advancing the cutoff changes an expired rule's
factual plan while unchanged evidence still avoids buying another narrative.

Rechecked boundaries: old-worker paid receipt recovery, immutable bundle export,
older-server client fallback, exact-origin collection, restricted provider input,
current-access read projection, consent/privacy removal, independent quota and
uncertain-attempt holds. The ordered migration runs before API/worker startup in
hosted and self-hosted paths; readiness fails closed when it or its constraint is
missing. Context remains nullable and no destructive schema step is introduced.

The final paid receipt remains immutable. Its source hashes describe the code at
qualification time; audit fixes change the planner/collector source hashes.
Exact provider request/fixture hashes and all retained responses are replayed
offline by `review-qualification.test.ts`; the prompt and twenty qualified inputs
are unchanged. No provider call or spending-cap extension is part of this audit.

Final audit verification passes:

- `.tmp/review-guidance-audit-green.log`: 213 tests / 22 files, including the new
  regressions, retained qualification replay and the full affected integration,
  domain and API/CLI/MCP/web cohort. Disposable services and volumes were removed.
- `.tmp/review-guidance-audit-check.log`: root typecheck plus lint/format for all
  audit source and test changes.
- `.tmp/review-guidance-audit-coverage-gate.log`: the standard 80% changed-source
  gate passes all 23 changed source files. Six current source mappings replace
  their stale mappings from the prior complete 134-shard run; existing changed-line
  fallback applies to two previously low-coverage files. Thresholds are unchanged.
- Core, site and cloud baseline heads are unchanged. Site sources, UI/client
  bundles and provider request construction are unchanged since their prior build
  and native client checks. No browser, production workflow or human acceptance
  is inferred from these local tests.

No outstanding implementation blocker was found within this approved follow-up.
The implementation is ready for final Owner review/testing; release, runtime
activation and production verification are still separate later actions.

## Owner review

Review the final receipt's concrete warning/noise, repeated-alert, retry,
complete/partial analytics and overlapping-health cases. Check that the next step
is an investigation with a verification condition, that capture/rule/notification
effects remain distinct, and that unknown settings and coverage are explicit.
The existing Weekly reviews view and API/CLI/MCP plan read expose the same saved
review. No read or tab change buys a narrative or applies configuration. Local
mock examples remain synthetic and do not change account settings or spend.

Following the Owner's next-release preparation request, the Smart Improvements
article is at `site/content/blog/weekly-smart-improvements-recurring-incidents.mdx`,
dated 12 November 2026. `site/docs/smart-improvements-post-editorial.md` records
search intent, content checks and the coordinated-release dependency. It is
included in the next site build, with no timed publication job.
The released Business article remains unchanged. Publication and deployment are
later explicit actions. Future release evidence must cover migration, readiness,
export/plan reads, consent, budgets and the ordinary compatible rollback.
