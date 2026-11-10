# Smart Report reliability and presentation audit

Scope: DebugBundle, 10 November 2026. Builds on the uncommitted rejection fix in
[smart-report-ai-rejection.md](smart-report-ai-rejection.md). No deployment,
production mutation, provider generation or budget change is authorised by this
audit. Existing receipts and canonical reports remain immutable.

Maps to FR-BUS-05/06, AC-BUS-05/06/07, the
[facts contract](../contracts/smart-report-facts.md) and the
[design rules](../rules/design-discipline.md).

## Reliability standard

The standard is a useful, honest report under supported inputs, explicit degraded
states under external failure, and no silent repeated charge, invented fact or
access expansion. No finite fixture set proves that every possible generated
sentence will be valid. Provider refusals, outages and unsupported output remain
real outcomes; they must not make the underlying factual report unusable.

Audit boundaries: definition/schedule, source coverage and selection, model
projection/decoder/validation, durable admission and receipts, artifact recovery,
publication/read authorisation, PDF/email isolation, retention, and customer states.
Tests must cover combinations and invariants as well as individual examples.
Provider success and deployed acceptance remain separate evidence layers.

## Approved presentation changes

The Owner approved this proposal on 10 November before layout implementation.
Use the existing Radix/shadcn visual system. No new palette, font, radius,
breakpoint, shadow or interaction language. Reuse semantic foreground/muted/border
tokens, the existing spacing and type scales, PageHeader, TitleBadgeRow, Button,
PendingButton, Card, Table, Badge, Notice, Field, Dialog/AlertDialog,
ResourceDeleteDialog, Skeleton and Empty. Extract reusable report status, period,
source-reference and evidence-list presentation; keep business rules in packages.

### Reports landing page

- Keep **Create report** in the shared page header.
- Replace the large allowance block with a compact summary: remaining/limit,
  reset date and expected scheduled demand. Show the longer forecast caveat only
  where relevant; retain visible quota warnings and partial-scope disclosure.
- Put **Report history** first. Use the existing table on desktop and readable
  stacked rows on narrow screens. Show name, a human-readable UTC period,
  descriptive state and expiry. “Ready”, “Facts only”, “Generating”, “Queued”,
  “Skipped — allowance reached”, “Paused — access changed”, “Failed” and
  “Cancelled” are distinct. Facts only links to a usable report and is not shown
  as successful AI analysis.
- Put **Saved reports** below history: compact rows/cards with title, cadence,
  selected-project count, schedule state and readable next delivery. A normal-size
  **Generate report** action and secondary **Edit settings** replace the stretched
  edit button and permanently expanded generation form.
- Generate opens a standard short confirmation: exact completed UTC period,
  one generation consumed, and an optional saved-recipient checkbox (off by
  default). Preserve the existing stable request identity after ambiguous replies.
  Never automatically regenerate facts-only reports.

### Saved report

- Lead with report name, readable UTC period, project count and report state.
  Keep the existing breadcrumb; remove repeated navigation/instructions.
- **Download PDF** / **Prepare PDF** is the main utility action. Keep refresh and
  opening the printable HTML secondary. Group regeneration/deletion separately;
  preserve explicit regeneration cost and deletion confirmations.
- Queued/generating reports get bounded automatic status refresh and clear waiting
  feedback; refresh never creates a report. Slow/error states keep manual refresh.
- Lead the document with the summary, then priorities, then recorded resolutions
  and observed recoveries. Explain facts-only analysis once, with facts still
  accessible. Do not present empty categories as proof of health or resolution.
- Show project names alongside evidence in mixed reports; sort urgent work by
  severity without letting a noisy project hide other projects. Keep links and
  source details available. Model prose must not invent shorter incident titles.
- Use structured lists for evidence and concise metric tables grouped by project.
  Keep detailed source context and methodology secondary, with coverage warnings
  visible near the affected facts. Preserve all canonical facts and authenticated
  source links across web, HTML and PDF; email remains an overview.
- Show friendly dates while retaining UTC boundary semantics and a readable data
  cutoff. Label estimated **check** downtime, unknown values, partial counts,
  snapshot metrics and unequal-period comparisons precisely.

### States and accessibility

Use existing loading, empty, warning and error primitives. No action is enabled by
frontend assumptions alone; backend whole-scope access remains authoritative.
Keep keyboard navigation, focus return from dialogs, named icon buttons, visible
focus, proper heading/table semantics, status text beyond colour, and wrapping long
titles. Use the existing mobile breakpoints and spacing. Pending controls reflect
only their own request; preserve drafts and request IDs after errors. Long lists
must remain usable without hiding urgent work or requiring hover.

Approval applies to this reuse-based presentation plan, not a new design system.
No browser investigation or screenshot capture is required by the repository;
source/component tests remain the verification path unless separately requested.

## Audit results

Confirmed gaps and fixes:

| Boundary                         | Reproduced failure                                                                                                                                         | Fix and regression                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated prose / private reader | Valid narrative containing an email or credential-shaped string was marked successful, then the mandatory reader privacy check withheld the entire report. | Reject unchanged-policy privacy violations as existing `report_unsafe_prose` before successful settlement. Real worker/client/store/read tests prove usable factual fallback, immutable known cost and no second paid request. A resumed response buffered by an older worker is also rechecked before publication; its original successful receipt/hash/cost remain unchanged. No raw prose is retained.        |
| Multilingual maximum evidence    | A valid ten-project fact set with bounded Japanese titles/context exceeded the single telemetry-event sanitizer budget before AI compaction.               | Apply the same mandatory policy to each schema-validated row and bounded metadata; reader uses the same projection. Document/request/token limits stay unchanged. Real retained-document reads preserve all 140 metrics and 100 sources.                                                                                                                                                                         |
| Maximum selection notes          | Valid facts already containing twenty caveats overflowed the schema when projection added its own per-project caveats.                                     | Bound AI-only notes, preserve per-project selection caveats and explicitly disclose additional caveats retained in the full report. Canonical facts are never truncated by this change.                                                                                                                                                                                                                          |
| Scheduler recovery / forecast    | A daily schedule delayed forty-five days admitted successive historical reports, while the allowance forecast counted only one overdue period.             | Atomically honour the one persisted overdue period, then advance to a future delivery using database time. No burst of historical paid admissions. Explicit historical manual generation remains available under ordinary allowance/access rules.                                                                                                                                                                |
| Continuous verification          | The isolated CI coverage registry omitted the newly added diagnostic regressions; external PDF text extraction was not required.                           | Register diagnostics in the existing database coverage shards, guard every report integration file against registry omission, and require the Poppler-backed PDF tests in CI using its existing Node/pnpm environment. The local `smart-report-coverage` target combines adapters and disposable storage before the changed-file coverage gate. No provider credentials, production services or paid evaluation. |

The approved web presentation changes reuse existing tokens and primitives.
History precedes saved settings; normal-size generation/edit actions replace the
expanded action form. A labelled dialog shows the exact period and allowance
consequence before admission. Lost acknowledgement retains the same command.
Queued/generating reads now continue at bounded intervals while visible, with
connection backoff and automatic document display; polling never generates or
prepares PDF. See the later Generating report feedback follow-up for the updated
policy replacing the initial fifteen-check limit. Reader/mutation
permissions remain backend-owned. Statuses distinguish usable facts-only content
from generation failure. UTC display dates include the actual days in the report,
while canonical half-open periods remain unchanged. Urgent sources are sorted by
severity and labelled by project; canonical urgent work remains visible alongside
AI priorities in web, HTML and PDF. Source context uses ordinary disclosure in the
web view. Destructive/regeneration controls remain separately confirmed.

## Qualification

Private command evidence: `.tmp/report-reliability-20261110/`.

- The new privacy, multilingual, note-bound and long-outage tests failed against
  the prior code before their respective fixes. The CI governance tests detected
  the missing diagnostic registry entry and PDF extraction gate before their fixes.
- The deterministic matrix covers 2,160 combinations: three cadences, two privacy
  modes, one through ten projects, three coverage states, six source states and
  Latin/Japanese text. It checks satisfiable valid narratives, preserved numeric
  facts, bounded/fair selection, restricted-mode text removal and rejection of
  missing urgent priorities or foreign references. This is invariant testing,
  not 2,160 provider responses or an estimate of live AI success rate.
- Full unit run: 5,932 passed, 574 conditional cases skipped. After the final
  saved-response recovery change, `make smart-report-coverage` passes 396 cases
  across 47 files, including all 169 report database cases; its three conditional
  PDF extraction cases pass in the explicit PDF gate below. Changed-file coverage
  passes for all 23 changed source modules (six use the existing fully-covered
  changed-line fallback). All nine previously token-counted synthetic request
  hashes and their budgets are unchanged.
- Final repository-wide TypeScript and changed-file lint/format checks pass.
  The generic static target exhausted Node's default 2-GiB heap; the established
  `billing-safety-check` target passes with its configured 4-GiB TypeScript heap.
  CI governance passes, including the complete report test registry guard.
  The CI workflow itself has not run remotely.
- All sixteen explicit HTML/PDF/child/text cases pass after presentation changes.
  The maximum fixture includes ten projects, 140 metrics and 100 sources.
- The local resource check passes with three serial maximum PDF children while
  synthetic ingestion continues. The test uses mocked ingestion persistence;
  it does not establish hosted throughput or an SLA. A 128-MiB child V8 heap
  limit is not an RSS guarantee (sampled child RSS was about 219 MiB).
- Dashboard production build passes. No browser/screenshot verification was
  performed, in accordance with the repository's frontend rule.

## Final boundary review

- Changed paths: model projection/client and receipt-buffer recovery; canonical
  private reader; scheduler admission; web presentation/status reads; HTML/PDF
  formatting; safe diagnostic migration/settlement from the preceding fix; and CI.
- Bad input still fails closed through the existing schemas and final narrative
  validator. Privacy checks remain mandatory at generation and egress. New UI
  prose is escaped, links use server identities, and no public diagnostic API or
  new permission is introduced.
- Transaction/lease/idempotency integration cases cover concurrent admission,
  lost replies, output failure, revoked authority, privacy narrowing, retention,
  uncertain delivery and paid reservations. Saved unsafe response recovery keeps
  the paid receipt immutable and publishes facts without a replacement request.
- UI status timers have bounded attempts and clean up on navigation/unmount.
  PDF remains an isolated bounded child; disposable test services are cleaned up
  by their existing ownership-scoped targets.
- The existing diagnostic forward migration, fail-closed readiness and deploy
  ordering remain required. This audit adds no schema or access-rule change.
  `make smart-report-coverage` and `make smart-report-pdf-test` are the repeatable
  local gates; neither needs a provider key.

## Continuing reliability and rollout

The local implementation is not deployed. Apply the existing additive diagnostic
migration before new API/worker images; its frozen checksum and earlier receipt
hash projection remain unchanged. No new migration is needed for this audit.
No stored document, production quota, budget, access rule or paid receipt was
rewritten. No new provider request was made during this audit.

After an explicitly authorised release, verify migration/readiness and actual
report outcomes separately. Check scheduled admission, canonical read, PDF and
recipient delivery through current authorised interfaces. Never regenerate an
old rejected report or replay an uncertain send as part of verification without
explicit authority for that paid/delivery action.

Operators should monitor counts separately for `ready`, `factual_only`, `failed`,
`skipped_quota` and `paused_access`, oldest queued/processing age, overdue enabled
schedules, PDF failure and uncertain email/model attempts. Review every new
rejection code during initial rollout. A rise in facts-only reports is an AI
quality problem even when factual delivery works. Historical NULL diagnostics
remain unknown. Never collect prompts, rejected prose, email addresses or secrets
for this monitoring. A bounded read-only diagnostic aggregate after migration is:

```sql
SELECT state, COALESCE(diagnostic_code,
                      CASE WHEN state = 'succeeded' THEN 'none' ELSE 'unknown' END) AS diagnostic,
       count(*) AS attempts
FROM report_model_attempts
WHERE created_at >= now() - interval '24 hours'
GROUP BY state, diagnostic_code;
```

No alerting infrastructure was enabled or changed by this local task. Hosted
monitoring activation belongs to the cloud companion and a separately authorised
release. Existing worker failure signals do not by themselves measure AI quality.

External outages, refusals, incomplete output and missing/unsupported claims can
still produce factual-only output. The final validator remains strict, and input
preflight may reject unusually large valid evidence before paid admission. Exact
coverage/reference constraints do not prove every qualitative sentence true;
new model/prompt/profile changes still need the frozen quality evaluation and an
explicit spend cap. A finite test suite is evidence of supported behaviour, not
a promise that future provider behaviour can never change.

## Local sample report preview

The Owner requested working local examples on 10 November. `make dev-mock`
serves them at `http://localhost:5291/reports`. The existing Billing preview
controls can select the synthetic Business tier to enable create/generate actions.
These controls do not change the real local account or its billing.

Four saved sample definitions and seven runs cover a multi-project ready report,
facts-only fallback, restricted evidence, a quiet report, queued/processing
progression, failed generation and allowance skipping. Every example is labelled
Sample and its canonical notes disclose fictional data with no provider or email
attempt. Dates track current complete UTC periods. Production schemas validate
all facts/narratives, recipient IDs and API responses. Quiet coverage and missing
analytics remain distinct; restricted context and project labels are projected
through the existing policy. Source links are unavailable fixture placeholders.

Creating, editing, generating, regenerating, cancelling and deleting affect only
in-memory mock maps. Stable command IDs simulate idempotency and allowance usage;
deleting a completed report does not refund its generation. Pending cancellation
releases the simulated generation once. Scope/version/consent checks stay active.
The missing workspace-people mock and non-UUID owner fixture were corrected so
recipient selection and saved-report validation work in this preview.

HTML opens from the production escaped renderer. PDF downloads use the existing
bounded renderer child, share in-flight/cached bytes per sample and never inherit
provider/database credentials. Mock email selections are explicitly withheld;
there is no mail transport. Restarting mock mode resets the examples and edits.
The middleware remains development-only, loopback/same-origin and blocks unknown
API routes rather than forwarding them to a real backend. No production route,
access rule, quota, receipt, report or paid model attempt was changed.

Preview qualification: 123 mock/report interface tests pass, along with final
TypeScript/lint/format and the production dashboard build. Live local HTTP reads
confirm the sample content, recipient choices, HTML MIME/body and a 23,475-byte
PDF with a valid envelope. The frontend alone was refreshed; API, worker and
Postgres container identities remain unchanged. The running preview has Business
selected in the simulator. Evidence is under `.tmp/report-reliability-20261110/`
(`mock-final.log`, `mock-tests-final.log`, `mock-static-final.log`,
`mock-build.log`, `mock-live.json`, sample HTML/PDF and runtime identity snapshots).
No browser or screenshot review was performed. Source-only changes use the
existing approved UI, with no new design system or layout proposal.

## Generating report feedback

The Owner explicitly requested Generating report... with a spinner and automatic
opening on 10 November. This extends the approved waiting state using the existing
Notice, LoaderCircle icon and PendingButton motion convention, semantic tokens
and type/spacing scale. Notice exposes a reusable pending variant, used for both
report generation and PDF preparation. Status text remains available when reduced
motion disables animation. Existing report name, period and cancellation/deletion
controls retain their normal hierarchy and access checks.

Queued and processing reports show a labelled live status region and switch to
the canonical document as soon as it is readable. Read-only checks are serial:
initially every two seconds, then every five seconds for slow generation. Hidden
tabs and offline state pause checks; returning online/visible checks immediately.
Temporary status or document-read failures retry with bounded backoff and visible
connection feedback. Access/not-found failures stop checking and clear private
progress state. Terminal failed/cancelled/paused states do not keep spinning.
Navigation/unmount clears timers/listeners and ignores delayed old responses.
No generation, regeneration, PDF preparation, email or paid provider action is
triggered by the status loop. This replaces the earlier fifteen-check limit for
generation. The later direct-download follow-up also replaces the old PDF status
limit with serial checks while the download control is mounted.

Generation feedback qualification: four regressions failed before implementation;
52 focused UI/presentation/mock cases pass afterwards. The complete Smart Report
gate passes 403 cases with three conditional PDF extraction skips, and all 24
changed-source coverage gates pass. Types/lint/format and the final production
build pass. Checks include both ready and factual-only auto-display, slow work,
hidden/offline pausing, immediate resume, single in-flight polling, late responses
after unmount, temporary status/content failures, revoked access and terminal
failed/cancelled/paused states. The running local HTTP preview serves the updated
code, with a fresh synthetic queued example recorded in `generation-preview.json`.
No browser/screenshot inspection, paid request, production change or deployment
was performed. Evidence is in the `generation-*.log` files beside that JSON.

## Table spacing and direct PDF download

The Owner requested compact status details, balanced history columns, tighter
comparison heading spacing, padded table captions and a single Download PDF action.
Use the existing Table/Badge/Tooltip/PendingButton tokens and primitives: desktop
columns use standard 5/12, 1/4, 1/6, 1/6 fractions; mobile stays stacked. Failed,
skipped and paused explanations open on hover, keyboard focus or badge activation,
with Escape dismissal. Group the comparison heading and description at gap-1;
shared table captions receive pb-4 inside their border. No colour/type/radius or
new layout system is introduced.

Download PDF shows Preparing PDF... and the existing left spinner while preparing
and retrieving the file. It starts one file download when ready, then restores
Download PDF. Cached PDFs skip preparation. Only a user click creates a download
intent; visiting a page with an existing queued PDF must not download unexpectedly.
Keep the bounded PDF-only binary transport, HttpOnly browser session authority,
normal backend access/expiry checks, and no model/generation/recipient changes.
Navigation or identity change discards late downloads; preparation/status/download
failures restore a retryable action and visible explanation. These are the exact
standard interactions requested by the Owner, extending the approved UI proposal.

Table/download qualification: six existing UI expectations failed before the
implementation. Afterwards 47 focused UI cases pass, with 19 final binary/browser
API checks including same-origin, absolute and relative API bases. Full report
coverage passes 416 cases (three conditional PDF extraction skips), with all 27
changed-source gates green. The local coverage target includes both .ts and .tsx
report tests. Final types/lint/format and dashboard production build pass. Live
local HTTP confirms the five updated UI modules and a valid cached 23,459-byte PDF.
No browser/screenshot review, paid provider call, email, database/schema/access
change, production deployment or commit was performed. Details are in the
`table-pdf-*.log` evidence files. This direct-download follow-up supersedes the
older Prepare PDF/Download PDF presentation and its fifteen-status-read limit.
