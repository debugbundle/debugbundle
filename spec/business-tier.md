# Business, access, billing and Smart Reports

Status: owner-approved implementation contract, 6 November 2026. The single
implementation phase is tracked in STATUS.md. Feature availability is gated by
completed runtime paths, not by this document's existence. No deployment or
provider configuration is authorised by implementation approval.

## Scope and defaults

Use fixed roles, the existing capacity model and existing API/worker/Postgres/
Redis/object storage. Do not add custom enterprise entitlements, automatic partner
transfers, bespoke support workflows or a new infrastructure service. There are
no current paid Solo/Team customers requiring commercial grandfathering or a
customer-notification programme. Preserve technical interfaces and installed SDK,
CLI, MCP, token, event, artifact and database compatibility.

| Paid plan | Monthly USD | Yearly USD | Included units | Extra unit monthly/yearly USD |
| --------- | ----------: | ---------: | -------------: | ----------------------------: |
| Solo      |           5 |         48 |              3 |                        1 / 10 |
| Team      |          19 |        192 |             15 |                        3 / 30 |
| Business  |          59 |        588 |             30 |                        3 / 30 |

Prices exclude applicable tax. Annual payment funds the same monthly allowance,
not twelve times the current month's allowance. Capacity increases existing
buckets only; it never creates project slots or multiplies people, retention,
health checks, report limits or fixed analytics settings. Purchased quantity
remains 0–99. Team/Business allow 1,000 unique people/account, including the owner,
without per-seat charges. Free/Solo limits remain unchanged. Solo/Team/Business share the existing one-time
30-day no-card trial under FR-BUS-07. Enterprise is a Contact us card only. Team/Business include
priority support; no included onboarding, 1:1 service or SLA.

Business uses Team's debug/automation buckets per unit and 90-day bundle/30-day
raw-event retention. Conservative Team/Business analytics per unit/month:
25,000 events, 5,000 sessions, 1,000 journey samples; other analytics limits are
unchanged. Team health: 5/project, 10 monitored projects/account, 30 active checks.
Business health: 10/project, 10 monitored projects, 50 active. Minimum 60 seconds.
Existing saved health history/configuration is preserved; excess execution is
paused deterministically, not deleted or reported as target downtime.

One focused analytics-efficiency pass is allowed. Preserve durable acknowledged
data, existing readers, redaction, replay recovery and latency. If meaningful
savings require rearchitecture, select the conservative limits and continue.
Broader cost/cardinality/admission/retention analysis remains a follow-up rather
than a launch prerequisite. This contract does not claim universal worst-case
profitability. Use observed usage/cost to revisit centrally defined numbers.

## FR-BUS-01: Catalogue and monthly allowances

The public `/pricing/` page is the price and feature-comparison reference.
`/docs/pricing/` explains plans/capacity and `/docs/billing/` explains billing
workflows; both link to current prices instead of duplicating price tables.

Catalogue entries explicitly name tier, month/year interval, USD currency and
base/capacity kind. Keep configured legacy monthly identifiers readable. Unknown
or inconsistent provider item combinations fail closed. Base and add-on items
match tier, interval and currency. Do not put yearly totals into monthly-specific
legacy response fields; new interval-aware operations are opt-in/additive.

Monthly subscriptions retain their current usage period identities. Annual terms
use monthly sub-windows from a stable original UTC anchor, clamping to the last
valid day of short months without accumulating drift. Windows are half-open;
exact boundary claims belong to the next window. Paid term/renewal is distinct
from allowance reset. Upgrades preserve already consumed allowance and purchased
quantity. Same-subscription quotes, payment-pending entitlements, immutable
reservations/idempotency, stale-event fencing and ambiguous-outcome recovery
remain mandatory. Increases are prorated; reductions and interval switches apply
at paid-term renewal. Internally managed overrides retain their existing immediate
capacity changes. Keep the 30-day trial and seven-full-day first-purchase wait.
Verified interactive owner confirmation remains required for checkout, portal
and paid-upgrade operations under the current billing contract.

## FR-BUS-02: Fixed organisation/project access

Org Owner has owner authority; Business Org Admin has all-current/future-project
administration, excluding billing, ownership transfer, destructive account actions
and administration of Owner/peer Org Admins. Org Member has explicitly selected
project grants or an explicitly chosen all-current/future-project Member/Viewer
grant. Project roles are Owner/Admin/Member/Viewer. Selected Project Admin retains
existing project-local administration, including peer project Admin management,
without org-wide grants. Member retains current operational writes; Viewer is
read-only. Keep one fixed action policy in domain services and transactional SQL.

Strongest applicable positive grant wins. A lower direct grant does not override
inherited access. Suspension denies all sources. Org removal revokes the user's
org/direct grants and pending invitations in that org atomically; project-only
removal displays any remaining inherited source. Legacy project collaborators do
not gain organisation-wide visibility on upgrade. Count retained unique owner,
org and direct-project identities once, including suspended memberships; pending
normalised-email invitations reserve a place once. Invite/accept admission uses
an organisation lock, including concurrent cross-project acceptance.

Switching current org revalidates live membership and does not change a token's
context or a shared project's owner/billing org. The dashboard shows switching only
when multiple organisations are available, with focus/open revalidation of the list. Delegated project creation keeps
the billing owner and returns the actor's actual role. Ownership transfer uses
verified owner authentication, recipient acceptance and an atomic owner change;
credentials do not transfer. Keep the provider customer/subscription identity and
reconcile the verified new Owner billing contact after commit, fenced against a
later ownership change. Existing personal-account deletion remains identity
deletion, not a workspace-only action.

## FR-BUS-03: Scoped member tokens

Effective authority = live holder permissions intersected with credential scope,
permission set, current plan/status and accepted origin scope. Preserve credential
kind/ID/policy throughout the principal. Apply to lists, detail, changes, exports,
artifacts and queued execution. New interactive defaults are selected projects
and read-only. Explicit org-wide mode names one org and includes future projects;
selected mode validates each selected project, including legitimate cross-org
shares. All token issuers use the same versioned policy.

Legacy tokens retain ownership/direct-sharing semantics, including cross-org
shares and later direct invitations; Business inherited/admin rights do not
silently expand them. Legacy omitted-scope request shapes retain legacy policy.
New restricted tokens cannot mint credentials; verified interactive issuance is
the initial supported path. Project tokens stay SDK write-only, agent tokens stay
separate, hosted/restricted MCP and OpenAI OAuth grants remain unchanged. Merge
canonicalisation cannot expand accepted origins. Recheck revocation, removal,
suspension and role/plan loss at use and before asynchronous egress.

The web token list keeps legacy-token `Create replacement` beside `Revoke` in the
Actions column. It opens the normal scoped creation form with a replacement label,
selected-project/read-only defaults and a 90-day expiry. The dialog explains the
manual handover: create the token, update the CLI or MCP connection, then separately
revoke the old token. Opening or submitting this form never automatically revokes
or modifies the existing token.

## FR-BUS-04: Business-only referrals

Any existing user, including Free, may join as a partner with versioned terms.
Discount/commission eligibility concerns the referred Business base subscription:
10% off a new customer's first eligible Business base invoice; 50% commission on eligible
collected Business base cash for the first 12 calendar months. Solo/Team, capacity,
tax, uncollected cash and year-two service are excluded from commission. Trial/zero invoices do not consume the customer discount; a failed eligible invoice keeps its reserved discount on that same invoice. A no-card trial can
convert to eligible first paid Business; a prior paid Solo/Team customer is not
new on upgrade. Self-referral and benefit reuse are rejected. Billing shows customer code entry only to owners on Free or an active no-card trial; established paid or internal plans hide it. This presentation rule does not replace server eligibility checks or affect partner enrollment and earnings.

Save first valid attribution, permit explicit correction before reserved checkout,
and freeze the full offer. Pending links expire after 30 days; attribution saved
at signup survives trial. No promotion stacking. Derive eligibility chronology
from verified provider receipts, not browser return or webhook arrival order.
An invoice marked paid without collected cash does not establish commission.
Allocate mixed/prorated lines and annual service crossing the anniversary; a
late collection can earn once without extending the window. Downgrading stops
commission on lower-tier service; returning to Business resumes only inside the
original window without discount/clock reset.

Use minor units and frozen rates; cumulative half-up rounding posts deltas.
Append refunds/dispute adjustments, including post-payout negative offsets.
Hold until max(collection + 30 days, funds availability), and while disputed.
Manual payouts are DebugBundle-operator-only: claim entries atomically by partner/
currency, pay externally, record stable reference; uncertain payments remain
claimed for reconciliation. No automatic transfer. Financial records preserve
necessary obligations through account deletion with minimum protected identity.
Financial referral never grants project, invoice or account access.

Customer terms exclude discretionary/goodwill refunds of referred Business base
subscription payments unless expressly agreed in writing, while preserving all
mandatory legal rights, including applicable withdrawal and non-conformity remedies.
Refunds reflect actual discounted payments subject to applicable law. Commission
adjustments remain separate and cannot reduce a legally required customer refund.
This policy does not add automated refund rejection or change ledger calculations.

## FR-BUS-05: Smart Report facts and content

Business: 40 admitted generations/month, 5 definitions, up to 10 explicitly chosen
same-org projects and 10 verified authorised recipients/report. Full bounded
redacted evidence is default after opt-in; restricted aggregate mode is optional.
Use incidents, context, improvements, availability and analytics where present.
Backend facts compare UTC days, Monday–Sunday weeks and calendar months with the
previous period; label coverage and differing month lengths. Delivery may use
local IANA timezone; skip duplicate DST occurrences and advance skipped times.

Include major events, resolved work, observed recovery, recurring/regressed and
old unresolved high/critical issues, evidence-backed impact and next day/week/
month priorities. Distinguish recorded resolution, observed recovery and inferred
cause. Never invent a resolution or precise outage from missing evidence.
Availability uses existing monitored metrics/estimated downtime; overlapping
checks do not become summed account outage time. Sampling/correlation limits are
explicit. No actions are performed from recommendations.

Record report-specific project lifecycle facts atomically only for report-enabled,
entitled projects, including explicitly opted-in unlocked self-hosted projects.
Keep bounded numeric history for 12 months; existing all-tier account analytics
is unchanged. Reuse actual retained evidence for backfill and expose incomplete
coverage. Routine artifact pruning does not mean resolution. Collect reusable
redacted source summaries only when report-enabled/entitled, at most 90 days and
subject to shorter privacy limits. Reports/PDFs retain 90 days, subject to live
access, privacy and explicit deletion. No raw-retention extension. Project/account
removal invalidates dependent access/delivery and removes associated report data.

The hosted Reports landing page uses the shared plan-upgrade callout on Free,
Solo and Team, with Open billing. Empty Business-only inventories stay hidden on
these tiers; authorised saved definitions and report history remain visible.
Self-hosted entitlement and live whole-scope archive access rules are unchanged.

## FR-BUS-06: Report safety, delivery and cost

Persist initiating actor and exact accepted project/origin scope. Manage requires
Owner/Org Admin or Project Admin on every selected project. Recheck creator before
generation/publication, recipients before each send and reader before HTML/PDF.
The whole mixed-scope report requires access to every included project; do not
filter combined narrative after generation. Membership/plan loss pauses affected
work. Edits apply to the next unclaimed period; explicit regeneration is a new
admission. No automatic future project/member/merge-origin inclusion.

Use fair indexed due claims, durable fenced jobs and atomic quota/budget admission.
Generation and AI allowances share the existing monthly billing allowance window,
including annual accounts; UTC report periods never reset either allowance.
AI/PDF uses a separately bounded lane inside the existing worker, concurrency one
initially, with hard deadlines and no database lock held across expensive work.
One validated canonical response supplies authenticated HTML, downloadable PDF
and useful email overview. Renderer/email retries/downloads do not call AI.
Use trusted escaped templates and prohibit arbitrary PDF network/file access.
Recipient policy checks supplement access. Persist per-recipient receipts;
uncertain email sends require reconciliation rather than blind resend.

Untrusted evidence is data: redact before egress, no model tools/credentials,
strict schema and source-reference/factual validation. The completed synthetic
comparison selects Terra for its material quality improvement over Luna. The
qualified profile is 12,000 input / 1,500 total output tokens and one paid attempt,
reserving at most USD 0.99 for forty runs including short-cache-write and regional
costs; see [the evaluation record](../evals/smart-reports/results-20261107.md).
Budget at most $1/org/month and protect all 40 logical runs (at most
$0.025 worst-case/run including permitted attempts). Paid attempts have bounded
independent retry/outcome accounting, including uncertainty. Factual-only output
is explicitly degraded and is not a successful AI evaluation result. Prepare
local eval fixtures; Owen authorised at most $1 total for the Luna/Terra evaluation on 7 November; Owen subsequently authorised temporary use of the Afipal project key for this specific comparison; record actual spend/results and keep the credential outside DebugBundle files/logs. No budget increase or other Afipal action is implicit.
Self-host AI is opt-in with operator key/budget; missing AI never breaks debugging.
Self-host keeps its unlocked-feature convention with generous generation/definition
allowances; the same ten-project/ten-recipient technical selection bounds protect
rendering and model work. Hosted report allowances are per organisation and never
multiplied by capacity units.

Existing deterministic weekly digests, default channels/three recipients and
alerts remain intact. Smart schedules are separately opt-in with explicit choice
for overlapping weekly email. API/CLI/ordinary MCP operations use shared domain
services; existing restricted catalogues remain frozen except the explicitly consented saved-report extension in FR-BUS-08. UI reuses the approved
Radix Nova/shared tokens/primitives proposal; no new design system.
Reports use the standard shared-header create action and parent breadcrumbs on
create, settings and saved-report pages. Settings use paired responsive fields,
with privacy and consent kept full width. A new delivery schedule defaults to the
browser's IANA timezone (UTC fallback). The new-report form preselects Monthly,
automatic generation at 09:00 and the signed-in user's verified recipient identity.
Projects and Full-mode consent remain explicit, and nothing is created until Save.
Saved/manual schedule values and recipient selections, including an empty list,
are preserved when editing. API defaults remain unchanged. Report fact periods
remain UTC regardless of delivery timezone.

The Reports landing page leads with retained history and a compact shared allowance,
followed by saved settings. Manual generation confirms the exact completed UTC
period and allowance use; email remains opt-in. Report states distinguish usable
facts-only content from failed/skipped work. Bounded read-only status polling never
generates or prepares output. Queued/processing reports show Generating report...
with a reduced-motion-aware spinner and automatically display the saved document
when readable. Serial status reads continue for slow work, pause when hidden or
offline, back off on temporary failures and stop on lost access or terminal states.
History status explanations use focusable badge tooltips, with balanced desktop
columns and stacked mobile rows. Comparison headings group their supporting text;
metric table captions have internal bottom padding. Download PDF is a single
explicit action with Preparing PDF... progress and automatic file save when
ready. Cached output skips preparation, and leaving the page cancels download
intent. The browser retrieves bounded validated PDF bytes using session cookies
without sending the internal browser-scope marker as a bearer token.
Web, HTML and PDF lead with summary and priorities,
retain canonical urgent work alongside AI recommendations, and identify each source
project. Friendly dates show included UTC days without changing half-open facts.
After a prolonged scheduling interruption, admit the persisted overdue period once
and advance to a future delivery; do not replay the entire historical backlog
against the shared allowance. See the approved [reliability audit](smart-report-reliability-audit.md).

## Acceptance

- AC-BUS-01: Exact catalogue, included/0–99 extra capacity, monthly/annual totals,
  conservative analytics limits and Free/Solo invariants are tested. Annual
  month-end/leap-day anchors and boundary/upgrade races preserve usage identity.
- AC-BUS-02: Real transaction tests cover 1,000-person admission, duplicate invites,
  role/delegation/transfer, suspension/removal, all/selected access and org switch.
  Legacy cross-org tokens work; inherited rights never expand legacy scopes.
- AC-BUS-03: Role/action/credential matrix covers list/count/read/write/issuance/
  download/export and queued egress; merges preserve original scopes. Viewer
  cannot mutate. Restricted token cannot mint credentials.
- AC-BUS-04: Complete Business-only referral arithmetic and exclusions, first eligible invoice discount and first-paid service
  anchor, anniversary/proration, receipt chronology, refunds/disputes and payout
  races pass. Duplicate/out-of-order events cannot duplicate money/entitlements.
- AC-BUS-05: Report history covers resolve–recur–resolve, old high/critical issues,
  missing/late evidence, pruning, UTC periods and partial backfill; no invented
  recovery, impact or outage. Existing deterministic digest tests still pass.
- AC-BUS-06: Fair scheduling, quota/budget races, cancellation/revocation mid-call,
  injection/output rejection, provider uncertainty and retry isolation pass.
  HTML/PDF/email agree and authorised downloads do not generate again.
- AC-BUS-07: Ordered forward migrations/checksums upgrade populated predecessors;
  missing migrations fail readiness; migration runs before dependent API/worker.
  No installed-data bootstrap/reset or destructive-in-place schema shortcuts.
- AC-BUS-08: Focused analytics operation evidence or conservative fallback is
  recorded. Changed paths meet current NFRs while core work progresses. Full
  infrastructure cost certification and unrelated admission redesign are deferred.

New Business purchase admission defaults closed. `BUSINESS_SALES_ENABLED=true`
also requires reporting to be enabled and its selected AI provider/profile to be
configured in API composition. Fresh Business checkout, upgrade preview/confirmation
and a new scheduled move to Business share this gate. Solo/Team admission and
existing Business interval changes, subscriptions, renewals, capacity, report
archives, accepted payment recovery and financial reconciliation remain available.
The switch does not revoke entitlements, cancel provider checkouts, invalidate
already admitted payments or alter scheduled operations. No provider catalogue
or live setting is changed by this local implementation.

Owner decision, 7 November 2026: the customer referral benefit is **10% off the
first eligible Business base invoice**, rather than the first successful payment
across potentially multiple unpaid invoices. Trials and zero invoices do not
consume the benefit. Retrying the same eligible invoice preserves its discount;
its failed payment does not grant a discount on another eligible invoice. A
provider-confirmed expired/voided initial checkout can recover through the
existing safe checkout replacement flow without concurrent reuse. Capacity,
tax and promotion stacking remain excluded. This does not change commission:
50% of eligible collected Business base cash, with its existing first-paid
service-period anchor, twelve-month limit and refund/dispute accounting.

## Approved follow-up: Business trials and ChatGPT report reads

Owner-approved on 8 November 2026. These two additions extend the local candidate;
the deeper audit and final phase review require the Owner's subsequent go-ahead.

**FR-BUS-07:** Business is an option in the existing one-time 30-day no-card trial.
Keep verified Owner access, signup intent, seven-full-day first-purchase wait,
no repeat trial, no purchased capacity during trial and explicit paid conversion.
Business trial admission follows the default-off Business launch/readiness gate.
Use the same 40-report allowance and USD 1 maximum AI budget over the trial's
single anchored window; trial status never creates bonus allowances or referral
commission. Expiry stops new generation and email, pauses inherited privileges
through the existing downgrade path and preserves authorised report archives.
Weekly reports demonstrate early value; monthly history remains honestly partial.
Use an additive forward migration for the trial-plan constraint, exact readiness
and a runtime/rollback capability that understands Business trial state.

**FR-BUS-08:** The hosted ChatGPT connection may list saved report runs and read
validated canonical report content. Add an explicit `debugbundle:reports:read`
OAuth scope and consent category; existing grants gain no new scope. Keep the
original twenty-three tool/schema contracts unchanged and add only read tools.
Bind every call to its actual user, organisation and live grant. Recheck the
whole frozen report scope, revocation, expiry and privacy before and after object
I/O. Never post-filter a mixed narrative, generate a report, send email, prepare
PDF, mutate settings or return storage keys, credentials, internal request hashes
or signed links. Keep bounded strict output and source text as untrusted data.

- AC-BUS-09: Solo/Team trial regressions and Business signup/API/CLI/MCP/browser
  parity, one-time/expiry/conversion races, fixed allowance/budget, zero trial
  commission and migration/readiness/rollback checks pass.
- AC-BUS-10: Original OpenAI contracts remain identical; new reads require explicit
  consent/current grant and complete project/origin authority. Test cross-org,
  mixed scope, downgrade, privacy/deletion/expiry, mid-read revocation, injection,
  bounded output and absent mutation/AI capabilities.

### Launch audit clarification

Self-hosted deployments retain unlocked organisation administration and Smart
Reports, including the dashboard. A server-owned optional browser session hint
exposes entitlement only; it never bypasses verified identity, current roles,
suspension, explicit inherited grants, legacy-token isolation or report consent.
Trial-deadline numeric collection must stop before lifecycle cleanup runs, and a
late paid conversion must begin a fresh coverage epoch. Both guarantees require
forward migrations and fail-closed readiness.
