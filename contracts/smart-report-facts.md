# Smart Report facts

Maps to FR-BUS-05/06 and AC-BUS-05/06 in [the Business specification](../spec/business-tier.md). Local implementation is qualified in [the qualification record](../spec/business-tier-qualification-20261108.md). The existing deterministic weekly digest keeps its current contracts; these facts belong to the separately opted-in Business reports.

## Period and coverage

All fact windows are half-open UTC intervals. Daily means midnight to midnight, weekly means Monday to Monday, and monthly means the first of one month to the first of the next. Delivery timezone changes scheduling only. `packages/smart-reports/src/report-period.ts` owns these definitions and adjacent comparisons. Monthly comparisons retain calendar lengths and expose per-day rates. An absent/incomplete previous period is unknown; it cannot become zero activity, a percentage trend, or a successful outcome.

Every source identifies its available time range, completeness, origin scope and sampling limitations. Backfill can use only actually retained records; it cannot reconstruct deleted transitions or infer inactivity before a watermark. Late source arrival must not silently produce a complete historical period. A report generated against a fixed cutoff records that cutoff and its bounded source selection.

## Authoritative sources

| Fact                                 | Current authoritative source                                                                              | Required report treatment                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New incident                         | `incidents.first_seen_at`, original project/service origin                                                | Preserve a numeric creation fact beyond routine incident pruning. Do not substitute artifact generation time.                                                                                                                                        |
| Resolution, reopening and regression | Actual `incidents.status` transitions through `metadata-incident-lifecycle.ts` and `metadata-grouping.ts` | Append numeric transitions atomically with the change. Repeated same-state writes create no transition. Resolve → regress → resolve must retain both recorded resolutions. Current `resolved_at` alone cannot reconstruct that history.              |
| Severity and outstanding priorities  | Current incident status/severity, original first/last seen times, plus retained lifecycle facts           | Include old unresolved high/critical incidents even if they had no event this period. Routine pruning and missing rows do not mean resolution.                                                                                                       |
| Occurrences                          | Current lifetime `incidents.occurrence_count`; retained `incident_events` where available                 | Label lifetime counts as lifetime. Never label them period counts. Any period count must have its own complete, deduplicated source and coverage; omitted historical events cannot become zero.                                                      |
| Improvement work                     | `improvement_opportunities` status, kind, severity, first/last detected and resolution transitions        | Distinguish a recorded resolution from a recommendation, snooze, dismissal or disappearance. Related incident IDs establish linkage, not proof that a deployment caused recovery.                                                                    |
| Availability                         | Existing `availability_check_daily_rollups`, monitored results and shared availability metric policy      | Report monitored checks/coverage and their estimated downtime. Paused or unknown time is not outage. Never sum overlapping check downtime into an account outage duration. Healthy observations can support observed recovery without proving a fix. |
| Analytics                            | Existing day-granularity session/route/action/funnel rollups and analytics settings                       | Preserve sampling/opt-in/retention limits. Sum only additive measures across disjoint dimensions; daily active-visitor counts cannot become unique monthly people. Correlation is not causation.                                                     |
| Debug context                        | Retained redacted incident/improvement evidence and bounded context summaries                             | Collect reusable text only after explicit report enablement and current entitlement. Honour the shorter project privacy/retention limit and a maximum of 90 days. No raw retention extension or unbounded bundle copy.                               |
| Comparisons                          | The same selected origins and metric semantics in current/previous UTC periods                            | Show missing/partial coverage, unequal month lengths and zero baselines. Never compare an inherited expanded scope with an earlier narrower scope as an organic change.                                                                              |

## Storage and selection constraints

Keep only the missing project-scoped numeric lifecycle/coverage facts for twelve calendar months. Source identity, original origin, event semantics and deduplication must survive ordinary artifact pruning. Explicit project/account deletion removes dependent report facts and outputs; a deleted original origin is never adopted into another report automatically. Project consolidation and transfer retain original evidence boundaries and require explicit classification in the merge inventory.

Text summaries and completed outputs retain at most 90 days, subject to shorter privacy rules, explicit deletion and live access. No title, description, stack, route, email or other captured text belongs in the long-lived numeric journal. Full redacted evidence is the default only after opt-in; restricted mode excludes source narratives.

Evidence selection is bounded and deterministic, reserves representation for each selected project, and prioritises unresolved critical/high work, major new/regressed incidents, recorded resolutions and observed recovery. A noisy project cannot consume the whole selection. Source references resolve only through authenticated DebugBundle routes; model-authored URLs and invented references are rejected.

The report separates recorded resolution, observed recovery and inferred cause. It describes what happened, what was solved, what remains and the coming period's priorities; it never performs the recommended actions. HTML, PDF and email share one validated canonical result. Publication, download and every recipient send recheck the creator/recipient's current access to the entire accepted project/origin set, without post-filtering a mixed narrative.

## Numeric lifecycle journal

Candidate forward migration `202611070009_add_report_lifecycle_facts` adds `report_lifecycle_facts` and `report_source_coverage`; API and worker readiness require the exact enabled capture triggers. Inserts and actual status/severity changes append numeric facts atomically only while an enabled report's exact origin scope is active. Non-opted-in projects gain no new report history collector; ordinary incident mutations and existing all-tier analytics keep their behaviour. Same-state retries do not append a transition. No source-row FK cascades ordinary pruning into journal deletion; the project FK still cascades explicit project/account deletion. Source origins are retained during project consolidation. The trigger safely no-ops before the later additive collection-epoch table exists, so an older application worker cannot fail between ordered migrations.

The journal stores only opaque source/service/project identities, bounded transition/status/severity enums and timestamps. `backfilled` identifies historical facts recovered from retained rows. Backfill uses a project-scoped lock, fixed source type, at most 500 rows per batch, a stable source-ID cursor and deduplicated known timestamps. Indexed original-project/source-ID scans avoid scanning other projects for each cursor batch. It never fabricates intermediate transitions or a historical severity from current severity. A separate current `observed` state records known status/severity at collection time only when it differs from the latest actual observation. This preserves old unresolved priorities after pruning without pretending their historical severity is known. Neither backfill nor observation moves the definition's collection epoch backwards or makes an opt-out gap complete.

Period reads use the exact accepted original-origin array and saved definition's continuous-collection epoch, and count recorded resolution events separately from distinct resolved sources. They cannot treat an opt-out gap as complete history. They do not authorise a caller or expand merged origins; the report service must enforce current access to the entire saved scope before invoking them. Numeric queries and cleanup apply the same twelve UTC calendar-month cutoff regardless of database session timezone. Cleanup uses the existing bounded retention runner and requests a continuation if its numeric backlog remains.

Report definitions accept explicit project IDs and current verified-user recipient IDs, never caller-supplied origins, actor identity or arbitrary email addresses. Full mode defaults only with explicit source-collection consent; restricted mode can omit narratives. A disabled manual definition may have no schedule; an enabled schedule uses the existing IANA time/timezone contract. Replacing a definition requires its saved version. An overlap confirmation keeps existing weekly digests; disabling them uses their own existing settings. The accepted server-resolved origins are frozen per admitted run. Generation and AI budget use the same existing monthly billing allowance window, independent from UTC report periods.

Accepted project views must have disjoint original-origin sets; selecting overlapping canonical/legacy views cannot count evidence twice. Capturing management authority uses the existing job initiator checks with `manage_settings`, requiring both the holder's live admin/Owner role and any credential's project-admin permission. A write-only project permission is insufficient. Existing read/write job producers retain their current capture default.

`smart-report-limits.ts` and `TierCapabilities` are the shared source for report availability and limits. Hosted Free/Solo/Team do not receive Smart Reports; Business receives five definitions, forty monthly organisation generations, ten selected projects and ten verified recipients. Purchased capacity units do not multiply these pools. Self-host keeps unlocked availability with generous definition/generation caps while sharing the bounded selection sizes; paid AI still needs explicit operator key/budget configuration. These capabilities do not activate a model or establish its evaluation gate.

`report-authorization.ts` resolves fresh current origins only at admission, freezes them, and checks the entire saved scope at later uses. It reuses `ProjectJobInitiatorSchema` and the existing live role/token checks; revoked/expired credentials and suspended membership cannot keep authorising report work. Managing the scope requires settings administration; reading needs evidence access. Verified recipients are checked as human identities against every saved constituent. Current canonical project ownership must still match the report organisation, while the saved origin set is never automatically expanded after consolidation. Storage read failures propagate for retry rather than becoming permanent access loss.

## Saved definition lifecycle

`report-definition-store.ts` owns definition creation, reads, replacement and removal. Creation uses an organisation-scoped request UUID and a canonical digest of the actor and parsed command; a lost acknowledgement does not create another schedule. Changed commands cannot reuse the UUID. The organisation row lock serialises the shared five-definition limit and reads current entitlement after waiting. Purchased capacity never expands this limit. Public records omit private initiating credential metadata.

Candidate forward migration `202611070010_add_smart_report_definitions` adds the definition table and required downgrade/deletion guards. API/worker readiness validates its columns, indexes, unique request constraint and exact enabled triggers in addition to ledger checksums. Empty bootstrap creates the shape directly; installed databases use the ordered migration. A Business downgrade pauses definitions and increments their version. Re-upgrade leaves the Owner-review flag set; only a current Owner's explicit reviewed replacement clears it. Retained reads and authorised version-fenced deletion remain available after downgrade. Explicit deletion or workspace transfer of any selected project/origin deletes the whole dependent definition rather than shrinking a mixed scope or retaining foreign-workspace report content.

All mutations validate current full-scope settings authority and verified recipient access. Replacement requires the saved version, and unchanged project selections keep their frozen origins. A plain name/schedule/recipient edit cannot absorb new merge origins. Saved recipients are revalidated on every edit and must be rechecked before sending. Weekly overlap requires the explicit `keep_existing` choice and never changes the existing channel.

Schedules persist both delivery time and the UTC period end. The first configured local minute at or after period close owns the delivery, including DST gap/repeat handling inherited from notification scheduling. New and resumed schedules choose future delivery; they never enqueue an unbounded historical catch-up. Ordinary edits retain an unclaimed future period when its delivery remains future. Runs must later freeze the accepted definition version independently of subsequent edits.

## Run admission

Candidate forward migration `202611070013_add_report_run_admission` adds shared
`report_allowance_windows` and immutable accepted `report_runs`. Admission locks
the organisation, re-reads current entitlement and billing state, then checks
the actual requesting authority and every verified recipient against the whole
saved scope. Scheduled work uses the saved initiating authority. It never adopts
an Owner identity. The run stores its own accepted scope/version, privacy,
recipients and period; ordinary definition edits cannot rewrite that snapshot.

Manual request UUIDs bind a parsed command digest and recover a lost
acknowledgement without another reservation. Scheduled period identity is unique
across definition versions. Manual, scheduled and explicit regenerated reports
share one organisation allowance; capacity does not multiply it. Annual accounts
reuse the existing anchored monthly allowance helper. Current hosted admission
reserves the complete configured worst-case logical AI allocation atomically with
the generation slot. Missing AI configuration allocates no AI spend and remains
an explicitly unavailable analysis. Admission itself makes no provider call.

Deleting a definitely unstarted run releases its slot and held AI allocation once.
Facts already generated or any paid attempt prevent that automatic refund.
Explicit source deletion/transfer also checks each run's frozen scope, including
origins removed by a later definition edit, and removes the whole affected run.
Immutable run processing, paid-attempt settlement, artifact cleanup, fair
scheduling, publication and run API/CLI/ordinary MCP are implemented.

## Retained availability totals

Candidate forward migration `202611070012_add_report_availability_history` adds
report-enabled numeric check/day snapshots and shared per-definition original-origin
collection epochs in `report_collection_coverage`. Both lifecycle and health
collection use this opt-in boundary. Source rollup writes capture the corresponding totals
atomically only while an enabled report covers that origin. Snapshots include
check IDs, days, counts, measured timestamps and estimated check downtime; they
retain no URL, name or response body. Repeated captures replace a source snapshot
instead of adding it twice. Routine thirty-day health-history pruning does not
remove these bounded twelve-month numeric facts; explicit project/account
deletion still cascades. Check deletion leaves historical numeric observations.

Coverage starts at actual collection, never at a guessed historical date.
Disabling/pausing a definition, plan-loss review or workspace suspension clears
its continuous-collection watermark. Re-enabling starts a fresh epoch. Retained
history can be backfilled separately in stable origin/day/check order, at most
five hundred rows per batch, without moving the epoch backwards. Internal period
reads accept only explicit original origins, expose incomplete coverage and use
twelve UTC calendar-month bounds. Cleanup uses the existing bounded retention
runner. Check downtime remains a sum of estimated **check** downtime, never an
account outage duration. The generation service must still enforce whole-scope
access and distinguish an absence of monitored observations from healthy time.

## Model boundary and evaluation

`report-source-snapshot.ts` reconstructs known states from retained metadata and
numeric transitions, admitting only facts recorded by the frozen cutoff. Initial
non-open observations take effect when recorded; they cannot invent an earlier
resolved state. Routine pruning preserves last known unresolved priorities, and
explicit deletion removes them. Counts cover all known sources while details use
bounded urgent/resolved/recent slots. Complete outstanding inventory requires
coverage of the project's entire lifetime within the numeric horizon; older or
migrated predecessors remain explicitly partial.

`report-analytics-facts.ts` reads existing day aggregates only. Current canonical
privacy applies to the exact saved data origins without expanding them. Disabled
or expired analytics is unavailable; policy changes and updates after cutoff
prevent complete comparisons. Session and visitor-day sums retain their original
service/environment/origin scope and are never labelled unique monthly people.
No raw analytics events, journey identities or extra retention are introduced.

`report-facts-store.ts` assembles a definition under one read-only repeatable
database snapshot after current entitlement, saved-creator, scope, consent and
version checks. `report-facts.ts` produces deterministic canonical facts and a
separate private source-reference map. Numeric facts remain server-derived.
Period-close open counts differ from source states known at the cutoff; cached
text never decides lifecycle state. Each project keeps bounded urgent, solved,
improvement and recent detail. Missing/expired text uses labelled generic states.
Accepted derived reports have their separately disclosed ninety-day retention;
source-evidence expiry remains recorded so an expired source link is never
presented as available. Routine source expiry does not erase the derived report.
This pre-generation foundation still needs immutable accepted-run integration and
fresh publication/reader/privacy fences before production use.

`report-context-collector.ts` enriches an admitted full report with at most one
urgent, resolved and recent source bundle per project, thirty reads overall and a
twenty-second fetch budget. Optional bounded S3 reads enforce both a range and
actual streamed size plus a body/header deadline; ordinary reads keep their
existing behaviour. No database lock spans object reads. The collector rechecks
whole-scope authority and the exact source generation before accepting context.
`bundle-context.ts` caps compressed/expanded size, verifies hosted source identity,
kind, generation and timestamps, and redacts a small allowed projection again.
Bundle causes are tentative inference and actions are suggestions. Bodies,
headers, stacks, environment values and arbitrary probe payloads are excluded.
Reusable cache entries preserve a verified bundle excerpt across same-content
metadata refreshes. A manual disabled definition can enrich its requested report
without creating a reusable text cache. This does not schedule or admit a run.

`report-source-text-store.ts` collects reusable incident titles and improvement
summaries only for an enabled, currently entitled full-consent definition. Each
collection locks the organisation before the definition, checks its version and
rechecks the saved initiating authority against every frozen origin. Authority
loss pauses the definition. It does not accept caller-supplied text or origin IDs.
Each project view has twenty urgent, fifteen resolved and fifteen recent slots;
the ten-project bound therefore permits at most five hundred small summaries per
definition. Mandatory telemetry redaction plus URL/email withholding happens
before storage, with Unicode-safe title/context bounds. Bounded retained-bundle enrichment and periodic collection scheduling use the
same saved initiating authority and consent boundaries.

Candidate migration `202611070011_add_report_source_text` adds this cache and its
required enabled privacy guard. Restricted mode, consent removal, disabling,
pausing, Owner review or changed scope clears cached text. Explicit definition or
selected/origin project deletion cascades through the whole definition. Routine
incident pruning leaves only the bounded summary until its original content time
plus at most ninety days; collecting again does not renew that content lifetime.
Reads exclude expired rows and cleanup uses bounded locked batches. This internal
store does not authorise report readers; the report service must still enforce
the entire accepted scope before assembly or egress.

`model-evidence.ts` owns a bounded egress projection: at most ten opaque project labels, two hundred metric facts, one hundred selected evidence summaries and ten summaries per project. Original database identities, recipient emails and authenticated source URLs stay on the server. The projection validates period adjacency, source/metric semantics, reference uniqueness, project ownership of references and cutoff times. It reuses mandatory telemetry sanitisation before egress and withholds URLs/free-text emails. Restricted mode replaces project/source labels with generic labels and removes source narratives. This projection cannot authorise access; the report service must check the entire accepted scope before preflight and before every paid send.

`model-narrative.ts` validates one qualitative narrative with linked overview, typed highlights, bounded priorities and coverage notes. Numeric tables and dates come directly from immutable server facts in every format. Generated prose cannot insert numeric quantities or URLs. Resolution/recovery/outstanding highlight kinds must have eligible supporting evidence; priorities cite active sources, include selected critical work and represent each project with high/critical work. Partial coverage and bounded/restricted selection require limitations. These deterministic checks are supplemented by factual review of free prose; they are not a complete semantic verifier.

`model-client.ts` uses a fixed OpenAI origin, exact candidate models, complete-input token preflight, Standard service, no tools/conversation/storage, explicit-only thirty-minute caching, bounded bodies and deadlines. A prepared attempt is single-use and requires an awaited durable-admission callback before its paid request. Known validated usage settles even a rejected response; missing/uncertain usage retains its full worst-case reservation. There is no automatic retry or larger-model fallback. Candidate profiles and prompt/schema are in `model-request.ts`; they are not activated production selections until the evaluation gate passes.

`evals/smart-reports` contains synthetic fixtures, separate factual expectations and a pre-call rubric. `evaluation-ledger.ts` is an evaluation-only adapter with an exclusive file lock, fixed one-USD total authorisation, flushed reservations, conservative usage settlement and fail-closed recovery. It is not the production organisation quota/budget store. The temporary Afipal key is authorised only for this comparison and stays outside DebugBundle files/logs. No actual API call or spend is established by mocked transport tests.

The model projection recomputes current/previous daily comparisons with the shared period policy. It supplies an exact daily-rate direction and unavailable comparisons remain unavailable; a longer month with an unchanged daily rate must not be described as increased activity. The request explicitly lists permitted evidence-reference IDs. Project grouping IDs are not evidence references. Input/prompt changes after a comparison retain old attempts and receive new request hashes under the same evaluation budget.

The model's requested Structured Outputs schema also constrains reference IDs to the actual admitted coverage/metric/evidence set, priorities to active source IDs and narrative strings to digit-free plain text. Quiet snapshots permit no invented priority rows. Shared schema definitions avoid repeating the same reference enum across every section. These provider-decoder constraints supplement, rather than replace, deterministic local validation and qualitative factual review.

Outstanding high/critical incident counts are point-in-time snapshots. Their daily rates are not applicable: differing month lengths cannot turn an unchanged open count into an improvement. The model projection marks these comparisons as snapshots, supplies the actual value direction and keeps both per-day values null. Period-total activity metrics retain their documented daily-rate comparisons. This distinction is checked before model selection.

## Run execution and canonical artifacts

Candidate migration `202611070013_add_report_run_admission` also binds each run to its actual durable generation job. Run/job/reservation creation is atomic. A worker must own the live job lease before binding or advancing a run. Ordinary definition edits affect later admissions; accepted scope/name/actor/privacy remain frozen, subject to current whole-scope authority, entitlement, explicit privacy narrowing and Owner review. Before source reads, object acceptance, preflight, paid admission and publication, recheck the relevant live fences. Do not substitute an Owner for a revoked actor.

`report-model-attempt-store.ts` commits a sending receipt before HTTP. The fixed selected Terra profile reserves USD 0.02475/run, USD 0.99 for forty. Generic job retries cannot admit a second paid call. Sending/uncertain outcomes keep the complete hold. Known validated usage settles independently of permission to publish and releases only unused money, including after run deletion. Successful small narrative buffers are retained only under a live lease/current authority, reused after output failure and cleared after canonical publication or deletion.

`report-generation.ts` produces a versioned private canonical document. It resumes exact hash-checked facts and a saved response; renderer recovery cannot call the model again. The model receives a disclosed per-view subset and compact lossless transport while HTML/PDF retain the full canonical tables. Missing model/preflight/rejected/uncertain responses have explicit degraded reasons. Factual reports still consume their logical generation; unused AI reservations are released. Definite pre-generation cancellation releases that generation once. Paid or uncertain calls are never refunded by cancellation.

Private content-addressed keys are registered before upload and attached only after a fresh fence. Bounded object reads verify hashes and schema. Uploads have a fifty-five-second SDK abort deadline. Intents survive source/run/account deletion and wait past the bounded upload deadline before exact-key cleanup; there is no broad bucket listing. Narrowing a definition from full collection irreversibly invalidates its earlier full runs, clears response buffers and schedules owned output deletion. Restoring full mode does not resurrect them. Completed reports have their separately disclosed ninety-day lifetime, with current access/privacy and explicit deletion still governing reads.

`report-run-management.ts` supplies bounded whole-scope history/get/cancel/delete operations and stable cursor progress even through inaccessible rows. It exposes no initiating credential, request digest, model receipt or lease token. Generation completion requires both persisted canonical fact and ready documents and atomically completes the durable job. The existing worker now has a separately bounded report lane with fair scheduling, generation and always-on exact-key maintenance. Generation defaults off. Public run API/CLI/ordinary MCP adapters use the same domain stores; restricted catalogues remain unchanged. Output renderers/delivery, collection scheduling and export remain qualification work.

Project analytics policy narrowing atomically and irreversibly invalidates the entire mixed report: enabled to disabled, non-strict to strict, custom to standard, newly required consent or shorter aggregate retention. It stops its durable generation job, clears saved model response buffers and schedules owned private outputs for deletion. Only definitely unstarted generation reservations and unpaid allocations are returned; paid or uncertain holds survive. Restoring a more permissive policy never restores an invalidated report. Unrelated capture presets, sampling and action controls govern future capture and do not erase archives. The guard is part of forward candidate migration 013 and required runtime schema readiness. Empty-schema bootstrap orders it after analytics and worker tables.

The operator generation switch stops new creation/enabling/generation while preserving authorised retained metadata and deletion/cancellation. Disabled definition updates can still narrow privacy or stop schedules. The worker's private-object and expiry maintenance continues with generation disabled. Current whole-scope readers retain archives after plan downgrade until their separate report expiry; generation and delivery still require current Business entitlement and the actual saved actor.

The local PDF template is `report-pdf-node.ts`, with metric labels/comparisons and evidence categories shared through `report-presentation.ts`. It accepts a closed canonical content view and writes plain text through pinned PDFKit/fontkit, never interpreting report HTML or fetching report-provided assets. Bundled Noto CJK and the existing Instrument Sans Latin-extension WOFF are hash checked and keep their OFL licences. Unsupported glyphs are represented explicitly by Unicode code points, with a disclosure and the original text available in HTML. The maximum template is bounded to one hundred A4 pages and five MiB; long grid rows flow as labelled text instead of clipping. The authenticated PDF cache uses this template without a new AI call or logical generation charge.

`report-pdf-process.ts` launches only a fixed local Node child with a 128-MiB V8 heap, twenty-second deadline, one-MiB canonical input and five-MiB output. Its environment contains only runtime mode, UTC and executable search path; provider/database credentials are not inherited. It drains bounded diagnostics without logging content, supports cancellation and validates PDF framing before returning bytes. Real maximum-report extraction, accented/CJK text, all source/metric references, page numbering and active-content exclusions are checked in the Docker `smart-report-pdf-test` target with Poppler. This code/test evidence does not claim visual/browser acceptance or full-worker resource headroom. `report-pdf-store.ts` coalesces a real durable PDF job for an actual current reader, verifies the canonical hash and rechecks the complete scope before and after rendering/object I/O. `report-pdf-claim.ts` fences its actual lease independently from generation authority. Private artifact intents survive deletion for exact-key cleanup. API/CLI/ordinary MCP expose status, preparation and authenticated download. The same serial worker report lane alternates generation and PDF work fairly; archived PDF preparation and cleanup continue with generation disabled. The dashboard report list, full-page editor and reader reuse this canonical content, shared clients and existing system components. PDF online-report locations are built only from configured dashboard origin and validated saved identities, then checked in the child envelope. Receipt-backed email delivery is implemented; local integrated qualification is recorded in the qualification record above; release and provider acceptance remain separate.

## Periodic report collection

Forward migration `202611070015_add_report_collection_progress` adds one cascading
progress row per definition. A worker pass visits at most one due definition and
250 retained numeric rows (hard maximum 500), using persisted lifecycle origin/ID
or availability day/check cursors. After the initial backfill, redacted bounded
source summaries refresh every five minutes; existing numeric capture triggers
continue independently. Definition-version changes restart the safe idempotent
backfill. Progress and facts commit together, and failed batches roll back to a
savepoint with a one-minute retry delay. Least recently processed definitions
progress first. Only enabled, unsuspended Business definitions qualify; the saved
creator's current whole-scope authority is checked before and after each batch.
Revocation pauses collection without substituting the account Owner. Disabling
`SMART_REPORTS_ENABLED` also stops this periodic collector. All work is local SQL;
no database locks span object storage, model or email calls. Existing retention
cleanup still expires source text and numeric facts while reporting is disabled.
Readiness requires the forward table/index before dependent API/worker startup;
bootstrap remains for empty databases only. The progress row has no source text
or credentials and is removed with its definition.

## Observed health recovery evidence

Forward migration `202611070016_add_report_health_recovery_facts` stores only
original project/check/result IDs and observed/recorded times for actual
failing-to-passing health executor transitions. A successful result must satisfy
the existing configured recovery threshold. An internal monitor error, manual
check edit, absence of failures or improved aggregate totals cannot create this
evidence. The fact commits with the existing check result/state transaction only
for an enabled, unsuspended Business report scope. It is idempotent by original
project/result and contains no endpoint name, URL, error or response body.

Generation selects at most ten period-bounded recovery observations per selected
project view, then includes at most one within its existing ten-evidence budget.
The canonical source/evidence type is `health`, status/event `observed_recovery`.
It has no reusable source text. Recovery is an observation, never proof of a
causal fix. Whole-scope report authorisation remains required. Numeric evidence
survives routine raw-result/check pruning for at most twelve UTC calendar months;
project/account deletion cascades. Existing bounded availability retention also
prunes these facts, including while reporting is disabled. Authenticated source
navigation opens the project's health view only while the exact successful raw
result and undeleted check remain retained; otherwise the canonical report marks
the source unavailable. Raw check results still expire after thirty days.
Readiness requires the forward table and indexes before dependent runtime starts.

Full-mode retained bundle excerpts also include bounded service name, runtime
and framework under the existing 1,600-character source context limit and
mandatory redaction. The project profile is currently a local project scaffold;
there is no hosted profile document/storage reader in the existing API/worker.
Reports use the retained service context that is available to them. They do not
read owner workspaces, upload local profiles or infer unseen critical paths.
Restricted mode omits these excerpts. No new profile platform or SDK payload is
introduced by reporting.

## Shared report allowance forecast

`GET /v1/organizations/:organizationId/report-definitions/:definitionId/allowance`,
`debugbundle reports allowance <organization-id> <definition-id>` and ordinary
MCP `get_report_allowance` use the same validated allowance reader. A currently
readable whole-scope definition anchors access. The private/no-store response
contains the current anchored monthly billing window, quota, used/remaining
logical generations and upcoming configured schedule demand. Annual billing and
capacity units never multiply the pool. A partial-scope flag means only readable
schedules were included; no hidden definition names, origins or creators are
returned. Runnable schedules require their own saved creator's current authority.
One persisted overdue period is forecast per definition, followed by actual IANA
local delivery times up to the exclusive allowance end. DST does not duplicate
an occurrence. The forecast is bounded and read-only, changes no schedule and
reserves no quota. Only atomic generation admission determines actual acceptance;
excess scheduled runs retain their visible skipped-quota outcome.

The Reports overview shows this shared pool and warns when upcoming schedules
exceed the remaining generations. Manual requests and schedule changes can alter
demand. A failed allowance read does not hide saved definitions or report history.
The ordinary MCP capability does not expand restricted/OpenAI catalogues.

Account export uses the existing browser-Owner route with fixed bounded sections
for numeric lifecycle, availability, observed health recoveries and collection
coverage. Numeric pages retain original project identity, enforce current origin
access before and after selection, and never extend twelve-month retention.
Report runs and canonical content use the ordinary authenticated report readers;
no raw object key or model-attempt receipt is exported. Account deletion removes
project-dependent facts, collection state, definitions, runs and mail intents;
required financial identity and unresolved provider accounting remain protected.

## Business trial and consented ChatGPT archive reads

The Business trial uses the same report quotas and model budget in one fixed thirty-day allowance window, anchored at trial start. Generation, source collection and email lose entitlement at the database trial deadline even if lifecycle cleanup is delayed. No second allowance is granted at a calendar-month boundary. Trial expiry preserves authorised archive reads for the existing ninety-day lifetime. See `spec/billing.md` and `contracts/chatgpt-saved-reports.md`.

OAuth archive readers retain a distinct read-only authority and current whole-scope grant checks; they are never queued job initiators or substituted Owners. The new explicitly consented `debugbundle:reports:read` scope adds two declarations to the frozen original twenty-three tools. The original declarations remain unchanged.

Numeric lifecycle and availability capture enforce the database trial deadline,
independently of asynchronous billing cleanup. A paid conversion after that deadline
starts a new coverage epoch; the missed interval is not presented as continuous
collection. Self-hosted opt-in collection, observed recovery and report management
remain unlocked without changing role, source consent or whole-scope checks.
