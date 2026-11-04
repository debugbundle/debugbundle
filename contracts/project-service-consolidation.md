# Project/service consolidation contract

Requirements: FR-PJS-01–04; acceptance: AC-PJS-01–03. Implementation follows
`spec/project-service-consolidation.md`; local qualification evidence and remaining
release/live gates are in `spec/project-service-qualification.md`. Merge apply is
disabled by default until the deployed fleet and compatible rollback are qualified.

## Ownership and preserved namespaces

One active canonical project owns the logical service catalogue and shared
access/policy boundary. Source project IDs become reserved legacy identities,
discoverable as aliases and absent from normal active-project lists. They never
become another visible grouping layer.

Preserve historical namespace references in evidence, ledgers, jobs, rules,
deliveries and object keys. The canonical relationship changes logical ownership
and routing, not historical provenance. This avoids rewriting accepted jobs,
fingerprints, dedupe keys, payloads, analytics hashes or immutable artifacts.
Legacy project rows remain reserved namespace records and must never be deleted
as ordinary source-project cleanup. Canonical deletion must enumerate every
origin and every object prefix before removing relational ownership.

This is the physical representation of the proposal's origin namespace: retained
rows may keep their original `project_id` internally. Public canonical readers
project current ownership and expose original provenance separately. Explicit
legacy reads remain limited to that origin; canonical reads include the complete
flattened origin closure. Never use alias resolution alone as authorization.
Every read checks current canonical membership and applicable credential scope.

Logical services retain their stable definition IDs and immutable
`origin_project_id`/`input_name` lineage. Their canonical names are collision-free.
`service_input_aliases` reserves every previously deployed input name within its
origin. `service_project_aliases` retains each issuing project's historical names
and its last current name for every service. A later consolidation or rename
cannot make an old canonical token select a different service. Name reuse by a
different logical service is rejected within that view. Unknown legacy names are
qualified deterministically against both current and retained names.
Environment-instance `service_id`s and histories survive adoption of new input
names and credentials. Unattributed evidence remains unattributed. Old SDK
tokens, including destination tokens, remain confined to their original input
namespace. Explicit new project-wide credentials can select the canonical scope;
creation does not revoke older credentials or require an SDK upgrade.
Repository defaults are frozen per imported service, including an absent
repository. An internal `repository_default_project_id` retains that fallback;
explicitly clearing the repository override adopts the current canonical default.
This prevents subsequent merges from attaching unrelated repositories and adds
no new setup option. Effective repository metadata remains the public contract.
Nullable credential `scope_origin_ids` means exactly the originally issued
namespace, including for historical destination credentials. New credentials
capture the current origin set once. Scope changes require a new credential;
existing hashes, expiry and revocation stay intact. Server-only routing intersects
the stored snapshot before a receipt, object or queue mutation. Mixed ingestion
batches retain each service's origin independently, including analytics privacy
hashes and usage accounting. Raw submitted names and immutable artifacts are
preserved. Canonical incident metadata uses logical names; legacy views use their
retained names. The hosted/restricted output catalogs remain unchanged.

## Checked operation

The API/CLI/MCP names, exact payloads, retry/error handling, default-disabled
activation and local adoption workflow are documented in
[`project-service-operations.md`](../spec/project-service-operations.md). The
typed client validates requests and responses. Preview includes deterministic
suggested mappings and current resource counts/limits; mappings remain explicit.
Completed receipts include a secret-free, snapshot-based adoption manifest.

Preview receives `target_project_id`, `source_project_ids` and
`service_mappings: [{source_project_id,service_definition_id,name}]`. A complete,
storage-owned inventory supplies revisions, origin closure and resource counts.
Do not accept a snapshot, access revision, settings revision or eligibility claim
from a client. Preview writes no project/operation state and returns no secrets.

The plan digest binds exact mappings, access/configuration revisions, origin
closure and runtime contract. Observation counts are informative: normal new
events do not stale the plan. Apply rechecks dynamic dependencies and limits
under stable locks. Different access, account, ownership, policy, pending invites,
overlapping operations, ambiguous names, unknown dependencies and unsupported
work block changes; there is no force flag.

Apply persists an actor-bound idempotency record before execution. A reused key
with different content fails. Readers see old ownership or the complete cutover.
Original storage namespaces remain stable while the service catalogue and legacy
bindings change atomically. Database-bound service creation serializes with that
boundary so in-flight/older workers cannot create orphaned logical owners.
Existing accepted jobs keep their IDs, payloads, leases and dedupe identities.
Configuration writes acquire project fences and reject active participants;
runtime-only counters remain writable. Writes through aliases return
`project_consolidated` with the canonical ID. Safe credential revocation remains
available through the original project ID. A stale statement waiting through a
completed cutover must retry rather than apply with an obsolete project scope.
Any remaining writer requiring an ownership-generation fence must implement it
and pass concurrency/crash tests before merge activation.

Management entry points acquire the complete ordered origin fence before
resource row locks, allowing ordinary edits to serialize within one second (or a
shorter configured lock timeout). Longer contention returns retryable HTTP 409
`project_configuration_busy`. Direct row-trigger fences remain non-blocking to
avoid lock inversion with cutover, and current scope/access is checked again.

An operation distinguishes queued/checking/applying/verifying/completed,
cancelled, failed-before-commit and verification-failed-after-commit. The durable
receipt commits with ownership changes. Resume cannot replay a committed move;
verification is read-only and repair uses resume. Cancellation is allowed only
before cutover. Unknown transport outcomes require status by operation/key.
Verification checks retained mapping identity and ownership, so a later authorised
rename or consolidation does not invalidate a historical receipt.

The candidate supports at most 16 selected projects, 1,000 origin namespaces,
1,000 logical services and 25,000 observed catalogue/lineage rows. Configuration
hashing reads at most 5,001 rows per table/project and blocks above 5,000 or
16 MiB; member/preference lists block above 1,000. SQL hashes bounded rows with
SHA-256 without returning configuration secrets. Every operation transaction has
a ten-second deadline, a maximum five-second statement timeout and a one-second
lock timeout. These are admission ceilings; full latency, installed-client and
release qualification remain required before activation.

All three ordinary interfaces share domain services: preview, apply, status,
verify, resume, cancel. Restricted agent and hosted OpenAI catalogs remain
unchanged. New public routes/commands/tool schemas, scopes, stable errors and
annotation behavior require matching documentation before qualification.

## Integration and adoption boundaries

Exact service names observed in retained diagnostic, recovery, improvement and
analytics metadata reserve catalogue names even without an incident/service
instance. The forward backfill does not assign historical nullable service IDs.
Renamed evidence may match retained aliases only inside its original project,
environment and existing session/trace/failure-reference proof. Alias matching
must retain reference-reuse ambiguity rejection; no cross-origin correlation is
created. Advisory correlation locks share immutable input lineage. Raw objects
and captured names are not rewritten.

Improvement grouping uses immutable input lineage for new occurrences. An exact
previously recorded event retains its original fingerprint and ledger dedupe;
unattributed historical opportunities are not silently attached to a service.

Probe activation IDs and SDK issuer signing keys remain stable. Old wildcard
activations retain their original origin; intentionally new canonical wildcard
activations snapshot current origins. A multi-origin SDK configuration expands
narrower wildcards into retained service names, preserving the activation ID.
All maintained configuration parsers must accept the existing directive array;
no new SDK wire fields are needed. Projection is bounded to 5,000 directives and
1 MiB, with an explicit 503 rather than truncated scope. Optional piggyback
refresh failure must not reject events that are already durable.

A trigger defaults to its preserved origin/input signing identity, including a
narrow original issuer scope for wildcards. Explicit `sdk_token_id` selects an
active deployed token's immutable snapshot; `sdk_service` selects its retained
runtime name after renaming. Optional `sdk_project_id` selects a freshly adopted
issuer's current view and must match the token issuer when both are supplied.
API snake_case, CLI `--sdk-token-id`/`--sdk-service`/`--sdk-project-id` and ordinary
MCP camelCase expose the same optional fields. Responses report
`runtime_project_id`, `runtime_service` and `runtime_scope_origin_ids`.
The chosen runtime name must resolve to the same definition, not merely the same
origin. A wildcard cannot exceed its activation snapshot. Revoked, expired and
foreign tokens fail closed. No plaintext credential is read or returned.

Single-origin SDK signing keys remain byte-identical. Broader/restricted keys
are domain-separated by issuer and the sorted immutable origin snapshot, so an
old wildcard cannot acquire newly imported services and merges need not wait for
its TTL. No token rotation or automatic deactivation occurs. Combined active
probes retain the existing limit of five under the canonical write fence.

Old notifications/automation retain original service scope, recipient/public
exposure, payload identity, secrets and delivery history. Compatible global
policy becomes canonical; incompatible settings block and report safe field or
category names. Do not silently expand source/target rules or public selections.
Equivalent weekly schedules converge without replaying earlier delivery.

Analytics origins retain separate dedupe, consent, session/visitor and
correlation namespaces. Combined unique counts must disclose per-origin
semantics and never claim cross-origin people/session deduplication.

The secret-free adoption manifest contains exact old/new identities, input
names, repository contexts and outstanding configuration/deployment work. Local
adoption is bounded to one explicitly authorised root, compares expected file
hashes, preserves custom state/permissions/caches, and rejects symlinks and
concurrent changes. Server, local adoption and deployed-runtime verification
remain separate statuses. Consumer product edits and release/live actions retain
their own authorisation gates.

The local helper removes only the lock inode it created. A replaced/missing lock
is preserved and reported as `adoption_lock_changed_review_required`; reviewed
files may already have been applied. Inspect the files and active process before
recovery. A lock from another operation is never removed as routine cleanup.

## Inventory ownership

`project-merge-inventory.ts` explicitly classifies every current public-schema
table and project reference, including indirect histories, original public
selections, account-level data and the seven object roots. Unknown tables/views
or project-reference columns block eligibility. Classification is not proof that
every reader/writer is implemented: complete the module/data-path audit and
acceptance matrix before enabling apply.

## Retained automation

Capture rules, alerts, agent webhooks and GitHub dispatch rules snapshot origin
sets on creation. Older NULL snapshots mean the original project only. Ordinary
updates preserve scope; optional `project_scope: "current_project"` explicitly
snapshots the current closure. API, CLI `--project-scope current_project` and
ordinary MCP `projectScope` expose the same update. Later merges never widen the
saved set. Scoped rule tables have a combined 5,000-row supported ceiling, checked
before merge and under the root write fence afterwards.

Canonical CRUD can edit retained original rows without moving their IDs, origin,
creator, destinations, signing secrets or delivery/cooldown history. Actual current
membership is rechecked in the fenced SQL statement; a previously resolved role
cannot override revocation. New global rules match imported origins. Existing
service filters retain their original name context, while explicitly edited
filters use the current canonical view. Filter names reserve catalogue entries
even before a service emits evidence. Runtime matching translates only verified
aliases inside each event's origin, and an empty translation never becomes an
unfiltered rule. GitHub rules keep their original repository association.

Alert delivery and email-digest guards validate the event origin against the
rule snapshot; ledger project IDs and payloads retain their original namespace.
Retries, dedupe and signing-key provisioning do not rewrite accepted history.
Canonical notification and improvement policies are read through retained IDs.
Notification decisions retain recipient-specific preferences, health exceptions,
pause cutoffs and original item namespaces. Changing a project email policy wakes
pending mail for all of its origins without changing accepted claims or history.
Daily admission, short-digest conversion and delivery use the rule's saved origin
scope. Known-member recipients are bound and rechecked against current canonical
membership; retained membership rows cannot keep a revoked recipient eligible.
The final daily preparation revision check includes canonical project policies,
so a concurrent canonical pause defers delivery for re-evaluation. Original item
identities, dedupe and already-charged allowance records remain intact.

## Weekly report transition

Equivalent schedule multisets converge into the target's existing schedules.
Internal `weekly_report_channel_aliases` retain and flatten original channel IDs;
only an active checked operation can write those bindings. Every original channel
row and delivery claim remains available for accepted work. A channel deletion
retains delivery history rather than cascading accepted claim records.

New claims snapshot the current origin closure; historical NULL scopes mean the
original project only. Queued jobs pass their original delivery ID to the report
reader, which uses that accepted snapshot and verifies its project/window. Reports
without a delivery claim use the requested current view. Schedulers enumerate
only current canonical schedules and canonical activity. A window already claimed
by any equivalent origin schedule is consumed: there is no additional combined
resend for that transition window. Already queued reports still finish in their
original scopes. A later window uses the consolidated scope. Preview/operation
documentation must explain this behaviour; it is not a replay of past reports.

Retryable failed original claims keep their IDs, original project and original
channel. The scheduler queues that exact identity; discarded/suppressed claims
never reopen. History checks use the existing channel/window index under the
canonical project fence. Disabling or deleting the surviving schedule stops its
retained channels too. Notification preferences are rechecked for each recipient.

### Health, publications and account lifecycle

Check IDs, URLs, counters, incident links, due times, leases and result/rollup
namespaces remain original. Management reads project the requested view's service
name. Canonical owner/admin writes can edit imported checks while holding the
complete origin fence. A check cannot switch to a different origin's service:
return `409 service_scope_conflict`; create a separate check instead. Canonical
saved-check limits and account active-check/monitored-project limits still apply.
An execution claimed before cutover finishes under its original project/claim.

Existing public status pages keep their public IDs, anchor IDs and exact physical
project/check selections. Importing private checks never publishes them. The
current owner can manage an existing publication through its retained anchor;
creating a new publication requires a canonical anchor. Selection updates lock
all selected origin sets in global order and recheck cutover before publication.

Canonical project deletion removes the complete locked origin closure in one
transaction. Restrictive service references are removed before the catalogue,
bindings and journals. The internal deletion result hands every physical ID to
the existing seven-prefix object cleanup, then removes that internal field from
the HTTP result. Legacy-ID deletion stays a conflict. Account deletion includes
all physical IDs and uses the same complete-set guard; ordinary retention keeps
original object keys and expiration timestamps. Object-store deletion retry
outbox hardening remains the independently tracked lifecycle follow-up.

Membership/invite mutations hold the canonical configuration fence across live
role checks and writes. Member/invite reads at retained IDs use current canonical
membership. Removing/leaving membership also removes that member's automation
across every imported origin. Billing counts canonical active projects while
retaining account capacity, original claims and usage counters.

### Analytics scope and accepted work

Metrics read the canonical origin union, or a retained ID's original closure.
Service filters resolve exact catalogue aliases within the actual origin. No
privacy hash, visitor/session identity, ledger key, correlation link or stored
journey is rewritten. A multi-origin response adds `origin_scope` to its summary
or metrics window: ordered `origin_project_ids` and
`unique_count_semantics: "sum_of_origin_scoped_counts"`. Counts are sums of the
existing origin-scoped aggregates, not deduplicated people across the system.
Single-origin responses keep their existing keys. Bundles retain this coverage
inside their existing `metrics.current.usage` record.

Saved funnels/flows keep their original identities and history. Duplicate keys,
including archived keys, block consolidation. Combined active limits and the
100-total-flow enumeration ceiling are checked before cutover. Canonical updates
edit the original definition under the complete origin fence. New funnel
definitions snapshot their applicable origins; historical NULL scopes mean the
original project. Flow capture intersects a credential's saved origin snapshot
before resolving an imported definition, and never reconnects unrelated contexts.

Analytics bundle generations snapshot origins at reservation. Old NULL scopes
mean only their original project. Claims pass that private snapshot to worker
metrics/sample reads; no queued payload is rewritten. A new multi-origin request
includes scope in its dedupe fingerprint, preserving old report identity while
allowing a separate combined report. Public generation DTOs keep their shape.

### Configuration transport and repository routing

SDK configuration uses `Cache-Control: private, no-store` and the existing
credential/origin/capability `Vary` fields. Retain ETags and SDK polling intervals.
Expire the predecessor's 30-second edge entries before enabling consolidation.
Directive arrays have a 192 KiB budget, leaving policy/capability room within
installed SDK transports' 256 KiB configuration bound. Preview checks a
conservative projection of retained/planned names; oversized sets return a size
blocker. Runtime reads fail explicitly instead of returning partial directives.

Existing pre-feature GitHub rules keep their original project repository. New
rules resolve the actual matching service's effective repository. Dispatch uses
only a same-account/owner registered repository within the canonical project's
origin closure and an active installation. A service URL is context, not an
authority grant over another project, and an unregistered override cannot fall
through to an unrelated default.
Assignment validates and locks the active installation in the owning account.
Accepted delivery payloads/destinations and original rule scopes remain intact.
The existing repository PUT/DELETE endpoints accept a retained project ID for
that exact origin binding only, rechecking current canonical owner/admin access
inside the write fence. Updating it preserves its rules; removal deletes only
that origin's rules and binding. It never creates a canonical default rule from
a retained-ID edit. Account installation disconnect rechecks the current account
owner and takes the bounded organization fence before the real FK cascade;
ordinary direct deletes cannot bypass retained-origin guards.

Preview bounds historical service metadata to 4 MiB before transferring names
from Postgres, in addition to row/resource limits. Request/hash key ordering is
ordinal and independent of host locale. Invalid operation selectors return a
stable input error before a database UUID cast or lookup.
