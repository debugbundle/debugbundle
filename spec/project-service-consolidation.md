# Projects, services and agent-driven project consolidation

**Created:** 2026-10-25  
**Status:** Implemented, released and production-qualified on 2026-11-04: core 1.21.0, clients 1.19.1, site 1.7.0. Hosted merging was subsequently enabled and the owner's API/App/Site server consolidation completed. Repository adoption was excluded; fresh post-merge SDK-event acceptance was not triggered or observed. See `project-service-live-20261104.md` for exact receipts and qualified runtime checks.

**Delivery:** One implementation phase, nine ordered slices (0–8).  
**Scope:** DebugBundle core, CLI, ordinary MCP, existing readers, setup guidance and release documentation.  
**Tracker:** [TODO.md](../TODO.md) → Project/service model and agent-driven consolidation.

This tracked implementation contract supersedes the original local proposal. The owner approved one implementation phase with the recommended defaults, a simple agent workflow, and preservation of existing functionality. The authorised production release is complete; see [its exact receipt](project-service-release-20261104.md). Live consolidation, repository adoption and their deployed-runtime evidence retain separate authorisation gates.

## 1. Recommended outcome

Use the hierarchy already implied by the product, and make it work consistently:

```text
Account / workspace
└── Project: DebugBundle
    ├── Service: Site       → its repository and environments
    ├── Service: App        → its repository and environments
    ├── Service: API        → its repository and environments
    └── Service: Worker     → its repository and environments
```

A **project** is the system a person wants investigated together and its shared
access/configuration boundary. A **service** is an application or process within
that system. An **environment** is a deployment dimension of a service. A domain,
repository or deployment does not automatically require a separate project.
Independent systems, or components needing different access/policy boundaries,
can still be separate projects. Do not infer that every repository in an account
belongs together.

An agent should be able to fulfil: “Put these named projects under DebugBundle as
Site, App and API, and update these authorised repositories to use that structure.”
The agent gets a structured preview, applies a checked server operation, adopts
the result locally, and reports which runtime deployments still need updating.
Ordinary investigation of DebugBundle then includes all its services by default.

There is **no migration wizard, new Product/Group level, mandatory SDK upgrade,
Business-tier dependency or new organisation model** in this phase. Keep ordinary
project/service navigation and filters; migration itself is API/CLI/MCP driven.
The owner's belief that they are currently the only user is useful context, not a
migration precondition we can assume without checking actual access and data.

## 2. Decisions that keep the scope manageable

| Question                                         | Decision                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Group existing projects forever, or consolidate? | Consolidate into one real project. Retain old identities only for compatibility/provenance, not as another user-facing hierarchy.                                                                                                                      |
| Destination                                      | An explicitly selected existing project. Someone wanting a fresh destination can use ordinary project creation first; the preview must include that destination's existing state.                                                                      |
| Eligibility                                      | Same account and owner, with identical effective member access/roles. Reject cross-account moves, inaccessible sources, overlapping operations and incompatible access. No service-level RBAC in this phase.                                           |
| Policy differences                               | Block incompatible project-wide settings and describe the exact differences. The agent can reconcile them through ordinary authorised commands and preview again. Do not invent a general service-policy override system to make every merge possible. |
| Service mapping                                  | Explicit, collision-free mapping of each source logical service to a destination logical service. Suggestions are deterministic; ambiguous cases require a supplied mapping. No many-to-one historical service coalescing.                             |
| Implementation size                              | Support bounded, transactional metadata consolidation. Establish tested row/time limits; reject oversized operations before cutover. Do not build a general online data-movement platform.                                                             |
| Object storage                                   | Preserve original object keys and immutable bytes. Store origin/routing metadata instead of copying or rewriting all evidence.                                                                                                                         |
| Automation                                       | API owns the durable operation; CLI and ordinary MCP call it. The agent handles repository edits with explicit local scope. Hosted read-only connectors remain read-only.                                                                              |
| Reversal                                         | Safe cancellation before cutover; atomic rollback on cutover failure. After successful cutover, use forward repair and a compatible runtime rollback, not a promised one-click unmerge.                                                                |

The stricter initial eligibility rules are intentional: a useful supported merge
is preferable to silently changing visibility, privacy, notifications or billing.
Blocked cases must be actionable, with no unsafe `force` bypass.

## 3. Planning baseline and affected contracts

The following records the pre-implementation source inspection on 2026-10-25.
It is historical planning context, not the current implementation or an inventory
of the owner's hosted projects. Current module boundaries are documented in
`ARCHITECTURE_MAP.md`; executed evidence is in `project-service-qualification.md`.

| Current behaviour                                                                                    | Evidence                                                                                                                                | Planning implication                                                                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Profiles already describe multiple frontend/backend/worker services                                  | `site/content/docs/project-setup/profile.mdx`, `split-frontend-backend.mdx`; FR-PROF-01/02/09                                           | Extend the model and guidance rather than adding a grouping product.                                               |
| Stored service rows are unique by project, name and environment                                      | `packages/storage/src/storage-bootstrap-statements.ts`                                                                                  | Preserve existing environment-specific service IDs while adding an environment-independent service definition.     |
| Tokens, members, invitations, capture settings and many integrations are project-scoped              | Same bootstrap file; `metadata-access.ts`, `metadata-tokens.ts`                                                                         | A merge is a domain operation, not a bulk update of one foreign key.                                               |
| One primary GitHub repository is assigned per project                                                | FR-GHA-04; `project_github_repos`                                                                                                       | Add service repository overrides with a project default.                                                           |
| Incidents include service/environment in uniqueness; improvement fingerprints are unique per project | `storage-bootstrap-incident-statements.ts`; `event-normalizer/src/fingerprints.ts`                                                      | Preserve identities and origin namespaces; do not accidentally collapse two histories.                             |
| Analytics ledgers and aggregation keys include project identity                                      | `analytics-bootstrap-statements.ts`, `analytics-correlation-store.ts`                                                                   | Preserve dedupe, consent and correlation boundaries; unique people cannot simply be summed across former projects. |
| Object prefixes contain project IDs; cleanup enumerates those prefixes                               | `packages/storage/src/helpers.ts`, metadata/bundle stores                                                                               | Aliases need durable storage-origin ownership and cleanup coverage.                                                |
| Jobs have durable payloads, dedupe keys, dependencies and leases                                     | `packages/storage/src/worker-job-store.ts`                                                                                              | Fence cutover and resolve legacy scopes; do not rewrite queued payloads or recreate deliveries.                    |
| Project management already has API, CLI, MCP and shared client boundaries                            | `apps/api/src/routes/projects.ts`, `packages/project-management-client/src/index.ts`, CLI `project-commands.ts`, MCP `project-tools.ts` | Add thin adapters over shared domain services.                                                                     |
| Local connect/setup owns cloud identity and profile changes                                          | CLI `connection-config.ts`, `connect-command.ts`, `local-scaffold.ts`, `profile-validation.ts`                                          | Adoption must be explicit and preserve tokens/local data; do not rerun connect blindly.                            |

Extend FR-CLI-01/03/04, FR-PROF-01/03/09/10, FR-GHA-04, FR-RET-10,
FR-ALT-05/06/08, relevant token/access and analytics requirements, and
AC-PROJ-01/02. Slice 0 allocated FR-PJS-01–04 and AC-PJS-01–03 for the implemented
consolidation behaviour; those requirements and acceptance criteria are authoritative.

Read `contracts/public-interfaces.md`, `contracts/data-schemas.md`,
`contracts/agent-interface-routing.md`, `spec/notification-preferences.md`,
`rules/domain-invariants.md`, `rules/security-hardening.md` and the migration
contracts alongside the mandatory overview/spec read order. Reconcile with the
independent alert-environment and health-severity follow-ups without requiring
either feature to ship first or overwriting their changes.

## 4. Target model and service behaviour

The tracked [consolidation contract](../contracts/project-service-consolidation.md)
defines the physical origin-namespace representation and checked operation.
Logical ownership/routing consolidate atomically while historical namespace
references remain intact. This preserves the plan's IDs/scopes/bytes and avoids
rewriting old jobs or evidence merely to change their current project view.

### Service identity and repository context

- Add a small logical service definition owned by a project: stable ID, unique
  service key/name, optional description and repository association. Link existing
  environment-specific `services` rows to it through an additive migration.
  Keep their IDs and current public `service_id` meanings. Use a separately named
  additive field for logical identity; never reinterpret an existing identifier.
- Backfill by the exact existing project/name relationship, without guessing that
  similarly named services in different projects are the same. Environment stays
  on the existing service instance/event; do not turn `production` into a service.
- Allow a service to override the project's default repository and optional
  repository-relative root. Resolve routes, source locations, deployments and
  GitHub actions through that association. Validate installation access and path
  bounds. No agent-supplied arbitrary filesystem traversal or automatic clone.
- A project profile can describe services from several repositories. Paths are
  relative to each service's repository/root; do not pretend separate repositories
  share one checkout. Local profiles can describe the locally present subset plus
  canonical project/service identities and remote context.
- Make service definition list/get/create/update available through API/CLI/MCP.
  Restrict this phase to additive definitions and metadata updates; preserve
  existing deletion semantics, and defer historical service coalescing/deletion
  and general arbitrary service reparenting.
- Project-wide investigation lists all services and environments. A service or
  environment filter narrows scope only when requested; list pagination must not
  silently omit a service. Evidence stays attributed to its actual service.

### Source compatibility and provenance

Retain a durable legacy-project binding with its canonical project, source
namespace, service mapping and storage origins. Keep source IDs reserved and
prevent alias chains/cycles. Source project rows must not be passed through
ordinary cascading deletion as part of consolidation.

Persist grouping lineage on the mapped service definitions, independently of
which credential or storage prefix an event uses. Switching from an old token to
an explicitly created canonical token must continue the same mapped service's
incident/improvement history, not open a duplicate incident solely because of
adoption. Preserve source-wide improvement grouping where the old implementation
used it; do not make token identity a new fingerprint input. Historical rows with
no service remain explicitly unattributed, with their origin visible, rather than
being guessed into Site or API.

Only active canonical projects can be selected as sources/target. If a selected
project already owns legacy bindings, preview the full origin closure and flatten
those bindings directly into the destination in the same transaction. Preserve
their existing mappings/scopes and include their data in size limits. Selecting
an alias as though it were another active project returns its canonical identity;
it must not import the same records twice.

Existing SDK tokens keep their hashes, expiry/revocation state and origin rules.
They resolve through their source binding, including `GET /v1/sdk/config` and
relay ingestion, rather than becoming unrestricted target-project tokens.
Known service names map exactly. A previously unseen name submitted by an old
token gets a deterministic, collision-safe source-qualified service mapping;
it must not attach to an unrelated target service or start failing solely because
it appeared after the preview. Keep normal validation and quota enforcement.
Existing destination tokens likewise cannot gain authority over newly imported
service scopes merely because the destination now contains them. Explicitly new
canonical tokens can use the new documented scope after intentional creation.

Old project-ID reads and scoped agent credentials remain limited to their original
service/provenance namespace. Resolve object access only after checking that scope.
The canonical project returns the combined view to authorised users. Legacy IDs
are discoverable through explicit alias metadata/listing, not duplicated as active
projects in ordinary lists. Existing deep links retain their original filtered
scope when routed to the canonical project.

For management calls that cannot preserve the old scope, return a documented
`project_consolidated` conflict with the canonical ID and required service scope.
Never silently redirect a legacy project-wide delete, invitation, token creation,
profile overwrite or policy update into an operation on the entire destination.
Preserve safe source-scoped operations such as revoking an existing source token.
Preview must disclose these opt-in management changes and required client version.

## 5. What moves, what stays and what blocks a merge

Build a checked manifest of **every** table, object prefix, job type, cache and
public lookup using project identity. The following is the minimum coverage, not
permission to ignore unlisted surfaces. An unknown dependency blocks apply.

| Surface                                                               | Required handling                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members, invitations, scoped credentials                              | Compare effective access including account-derived roles. Require matching access; block outstanding membership/invite differences until explicitly resolved. Preserve credential scopes, hashes and revocation; do not mint tokens in preview.                                                                                                                                                                                                    |
| Services, raw/normalised events, deployments                          | Retain record IDs, original capture context and immutable raw input. Reparent metadata with explicit service/origin mappings; new canonical projections may show the new names. Preserve deployment-to-repository associations.                                                                                                                                                                                                                    |
| Incidents, occurrences, improvements, generations                     | Preserve IDs, fingerprints, status, counters, timestamps and history. Extend collision-sensitive uniqueness with origin identity where needed. Distinct historical records remain distinct; moving a row is not a new incident/regression.                                                                                                                                                                                                         |
| Bundles, reproductions, profiles and artifacts                        | Keep immutable bytes, hashes, keys and versioned historical profiles. Return canonical routing/provenance outside those bytes. New artifacts may use the canonical project; old artifacts must remain retrievable from both authorised scopes.                                                                                                                                                                                                     |
| Jobs, pending deliveries, retries and dedupe                          | Keep existing job/delivery IDs, payloads, parent relationships, leases and dedupe identities. Resolve old scopes at execution. Preserve historical cooldown/coalescing namespaces; no replay or duplicate logical sends caused by consolidation.                                                                                                                                                                                                   |
| Alerts, webhooks and GitHub dispatch                                  | Carry each source rule/subscription with its original service namespace, filters, secrets and recipients. Project-wide source rules become scoped to that source's mapped services, including future legacy-token services. Existing target rules keep their prior scope too. Explicit later edits can widen them. Preserve the original project identity in existing subscription payload contracts; expose new routing metadata only compatibly. |
| Capture, privacy, retention, analytics settings, improvement controls | Require compatible effective project-wide settings across target and sources. Preview precise conflicts; never silently take the least restrictive value, enable analytics, lift consent or extend retention. Resolve differences separately and preview again.                                                                                                                                                                                    |
| Personal/shared notification preferences and pauses                   | Require equivalent effective settings, including pause expiry and recipient scope. Account restrictions still win. Do not resume paused delivery or release discarded/suppressed history.                                                                                                                                                                                                                                                          |
| Weekly reports and project-unique integrations                        | Explicitly describe consolidation of equivalent schedules into one target schedule; preserve delivery history and never replay it. Different recipients/schedules or incompatible singleton settings block apply until resolved.                                                                                                                                                                                                                   |
| Health checks, probes, status pages                                   | Preserve IDs, target URLs, credentials, severity, history, counters, incident links and schedules. Remap service ownership. Retain status-page URLs and exact opt-in exposure; no newly imported service becomes public. Block incompatible visibility or combined resource limits.                                                                                                                                                                |
| Analytics ledgers, aggregates, journeys, funnels and opportunities    | Preserve source namespaces, dedupe keys, privacy hashes and exact correlation links. Never join people/sessions just because their projects merged. Additive event totals can be combined; unique users/sessions need explicit per-origin semantics/coverage and must not be labelled deduplicated people across the system. Preserve saved-definition IDs or block unresolved name/limit collisions.                                              |
| Billing, usage and entitlements                                       | Same account means no new subscription, reset counters, refunded claims or capacity increase. Preserve historical claims. Evaluate combined project-scoped limits; block rather than silently disabling checks, funnels, probes or rules.                                                                                                                                                                                                          |
| Retention and deletion                                                | Canonical cleanup must cover every retained storage origin. Alias deletion must never cascade to target data. Preserve existing retention deadlines; no eager object deletion during merge. Test these paths even though account-deletion outbox hardening remains a separate backlog item.                                                                                                                                                        |
| Search, caches, exports and audit                                     | Invalidate affected caches after commit with retryable work. Check canonical/legacy lookups, pagination and exported identities. Retain a secret-free operation receipt plus actor and mapping history.                                                                                                                                                                                                                                            |

The origin namespace is a compatibility/integrity mechanism, not service-level
permissions or another visible grouping layer. Preserve it for old data and old
credentials. Native canonical instrumentation can adopt the normal new project
scope deliberately; preview explains resulting correlation/configuration changes.
Do not invent historical cross-service causality from matching names or timestamps.

## 6. Durable merge operation

### Preview

A side-effect-free preview accepts an explicit target, source IDs and proposed
service mappings. It inventories settings, access, dependencies, counts and
estimated work; returns suggested names, exact changes, blockers, adoption tasks
and a versioned plan digest. It exposes no token material or destination secrets.

Bind the digest to mappings, configuration/access revisions and the supported
schema/runtime version. Normal new events must not invalidate every preview;
record observation watermarks and recheck data-dependent conflicts under cutover
locks. Settings/access changes invalidate the plan and require a new preview.
Use bounded paginated inventories, not “first page looked empty” assumptions.

### Apply and recovery

1. Reauthorise the acting owner for every project. Accept the checked plan/digest
   and an idempotency key; persist a durable operation record before execution.
   A repeated key returns the same operation, not a second merge.
2. Acquire operation locks in stable ID order. Reject overlapping or reversed
   merges. Revalidate settings, permissions, limits and the complete manifest.
3. Fence affected writers with a project generation/epoch shared by API and
   workers. Allow already accepted work to finish or remain durably queued;
   claim/lease rules must stop an old worker committing under an obsolete scope.
   Do not wait indefinitely for unrelated or scheduled jobs to drain.
4. Perform bounded relational reparenting, namespace/mapping changes and alias
   activation in one database transaction, without network or object-store work.
   Readers see the old state or the complete new state, never a partial merge.
   New ingestion and config mutations must serialise with this boundary and
   re-resolve scope after waiting. Preserve existing acknowledgement guarantees;
   no accepted event may be lost or billed twice.
5. Commit the durable receipt atomically, release the gate, and run idempotent
   verification/cache work. A crash after commit is detected from the operation
   record; it does not rerun the data move or declare the merge absent.
6. Compare the manifest against the committed state and return separate server,
   local-adoption and deployment statuses. Verification failure leaves an explicit
   committed-but-unverified operation requiring repair, not a false rolled-back
   result. `resume` retries eligible work only.

States should distinguish queued, checking, applying, verifying, completed,
failed-before-commit and verification-failed-after-commit. Cancellation is allowed
only before the atomic cutover starts. Timeouts and abandoned leases have bounded
recovery. The operation journal is correctness-critical even if general security
audit logging is best effort.

Slice 0/3 must prove the cutover can meet existing ingestion/query latency budgets
on representative fixtures. Set enforced row/work/lock-time ceilings from that
evidence. If the transaction cannot fit, return a supported-size blocker; do not
quietly add long maintenance downtime or a partially visible chunked migration.

## 7. API, CLI and MCP workflow

The following implemented commands use shared package-domain services. Existing
project management clients own transport and typed responses. Exact routes,
request bodies, recovery and executable examples are in
`project-service-operations.md`.

| Action            | API shape                                                      | CLI shape                                                                          | Ordinary MCP shape                          |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Service catalogue | Project service-definition list/get/create/update routes       | Extend `services` with explicit project and definition metadata operations         | Matching service tools                      |
| Preview           | `POST /v1/project-merges/preview`                              | `debugbundle project merge preview --target … --sources … --mapping-file … --json` | `preview_project_merge`                     |
| Apply             | `POST /v1/project-merges` with plan digest and idempotency key | `debugbundle project merge apply --plan-file … --idempotency-key … --json`         | `apply_project_merge`                       |
| Inspect/verify    | Operation GET and read-only verification route                 | `debugbundle project merge status/verify <operation-id> --json`                    | `get_project_merge`, `verify_project_merge` |
| Retry/cancel      | Explicit operation resume/cancel routes                        | `debugbundle project merge resume/cancel <operation-id> --json`                    | Matching mutation tools                     |

Keep preview genuinely side-effect-free and bound its cost. If later design
persists a preview, change its contract/tool annotations accordingly. Apply,
resume and cancel are never read-only. Verification only reads; repairs go through
resume. Redact saved JSON plans/receipts; use normal auth storage rather than
embedding credentials. Define stable error codes for stale plans, access/policy
conflicts, service collisions, size limits and already consolidated projects.
Non-interactive CLI never prompts; existing exit-code conventions remain intact.

Every operation response includes the canonical ID, legacy mappings, per-surface
verification state, actionable blockers and any pending adoption work. A timeout
is resolved by querying the operation/idempotency key, not guessing whether to
repeat the mutation. Keep the frozen hosted read-only OpenAI catalogue unchanged.

## 8. Agent-assisted local adoption

The server cannot rewrite a user's repositories. Return a secret-free adoption
manifest describing old/new project IDs, exact service names/IDs, repository
associations, retained-token behaviour and applicable config changes.

The CLI should reuse existing scaffold/profile/validation helpers for a narrow
adoption command taking an operation receipt and **one explicit workspace root**:

1. Inspect recognised DebugBundle files and the existing connection/profile;
   verify that they refer to an included source/destination. Produce a file diff
   and expected content hashes. No recursive search across the user's machine.
2. Apply only authorised, recognised scaffold changes with atomic writes and
   compare-before-write checks. Preserve custom profile content, file permissions,
   auth, `.debugbundle/local/` events/state and local/cloud bundle caches. Reject
   symlink escapes and concurrent edits rather than overwriting them.
3. Coordinate credential scope and service-name adoption. Keeping a legacy token
   means keeping its legacy input-name mapping; never send a canonical name into
   an old mapping blindly. Creating/rotating a canonical token is a separate
   explicit action, with plaintext shown only through the existing secret flow.
4. Return remaining application SDK initialisation, environment variable, relay,
   CI, deployment-secret and documentation edits as an agent checklist with exact
   service mappings. The agent makes language-aware edits, reviews the diff and
   runs the repository's checks. No universal regex rewrite of arbitrary code.
5. Verify profile/connection and read-only cloud resolution. Distinguish local
   configuration success from a runtime deployment or real end-to-end ingest
   proof; only run synthetic writes/canaries when authorised.

An agent can perform the same work with ordinary filesystem tools using the
manifest; MCP/API users are not forced to install a new orchestration platform.
Repositories without local access remain explicit pending tasks. An existing
authorisation covering the named repositories/actions is sufficient; do not add
repeated confirmation prompts merely because this is a migration.

DebugBundle product changes do **not** authorise edits, SDK upgrades, pushes,
deployments or canaries in SayCheese, Healthbrain, Sava or any other consumer.
Obtain separate scope naming that product and action before adoption there.
Document this in generated agent guidance as well as the execution receipt.

## 9. One phase, nine ordered slices

All slices belong to this phase. Compatibility foundations can deploy before the
merge capability is enabled; that ordering is not a separate product phase. Every
slice adds meaningful tests before changed behaviour and keeps its docs current.
Do not put planning slice numbers into source/test identifiers.

Slices 0–7 are locally qualified; evidence, exact artifact identities and remaining
release/live gates are recorded in [the qualification report](project-service-qualification.md).
Slice 8 remains open. No publication, deployment, activation or live adoption is
claimed by the local checkmarks below.

### Slice 0 — Inventory, executable contracts and migration rehearsal design

- [x] Catalogue all project-scoped schema, objects, jobs, integrations, readers,
      credentials, cached data and limits; record disposition and coverage for each.
- [x] Promote the decisions above into requirements, acceptance and public/data
      contracts. Freeze field names, compatibility semantics, errors and permission
      rules. Verify current callers and source-unique constraints, not just bootstrap.
- [x] Build anonymised fixtures for a populated multi-service project, several
      split projects, differing settings/access, pending jobs and a near-limit dataset.
- [x] Establish the bounded transaction design and measurable latency/size gates.

**Exit:** No unknown data owner or unresolved contract decision; tests demonstrate
the current missing behaviour without changing existing expectations to pass.

### Slice 1 — Additive service definitions, repository context and schema guards

- [x] Add ordered ledger/checksum-validated migrations for service definitions,
      legacy bindings/origins, operation records and required scope/uniqueness fields.
      Backfill separately where necessary; retain existing IDs and legacy defaults.
- [x] Implement service metadata and repository fallback/override in shared
      packages, profile/schema support and API/CLI/MCP adapters.
- [x] Add readiness/version checks and deploy orchestration requiring migrations
      before schema-dependent API/worker code. Test clean bootstrap separately from
      upgrade of populated installations.

**Exit:** Unmerged installations behave as before; old public service IDs remain
valid; multi-repository project context is coherent across interfaces.

### Slice 2 — Compatibility resolution and exact scope preservation

- [x] Centralise canonical/origin scope resolution at auth and domain boundaries;
      audit every direct project lookup/query, including object fetches and workers.
- [x] Implement legacy token/name mappings, destination-token preservation,
      service namespace filters, old-link/read compatibility and safe management errors.
- [x] Cover SDK config, ingestion, relay, profiles, caches and restricted agent
      credentials. Preserve source identity in immutable evidence and existing hooks.

**Exit:** Alias fixtures prove no broadened reads/writes, no orphaned artifacts,
and no old SDK install requiring immediate reconfiguration.

### Slice 3 — Checked preview and transactional merge engine

- [x] Implement inventory, mapping suggestions, conflicts, plan digests and
      idempotent durable operation state using shared domain/storage packages.
- [x] Implement writer fencing, lock ordering, atomic relational cutover and
      bounded verification/resume/cancel semantics.
- [x] Exercise all table dispositions, singleton conflicts and origin-sensitive
      uniqueness. Enforce tested size/time limits before activation.

**Exit:** Concurrent ingest/worker/management traffic, crash injection and retry
prove all-or-nothing cutover and exactly one logical migration outcome.

### Slice 4 — Downstream policies, integrations, analytics and lifecycle safety

- [x] Prove scoped alerts/webhooks/GitHub actions, paused/daily/weekly delivery,
      health checks/probes and public status behaviour across the cutover.
- [x] Preserve analytics ledgers, privacy/correlation, usage claims and truthful
      combined metrics. Apply quota/compatibility blockers without silent loss.
- [x] Extend retention, canonical deletion and legacy-ID deletion safeguards to
      every origin and artifact. Prove new and old deep links and export access.

**Exit:** End-to-end fixture reconciliations balance IDs/counts/hashes/claims and
show no duplicate logical notifications, extra public exposure or retention drift.

### Slice 5 — Complete API/CLI/MCP operation experience

- [x] Expose preview/apply/status/verify/resume/cancel with the same domain behaviour,
      typed clients, stable JSON/errors, auth and truthful tool annotations.
- [x] Document real command/API examples, partial/timeout outcomes and blockers.
- [x] Keep hosted read-only integrations unchanged and verify installed CLI/MCP
      compatibility, including clients that do not know new optional fields.

**Exit:** The whole server workflow is executable by an agent without dashboard
steps, duplicated business logic or secrets in plans/output.

### Slice 6 — Local adoption, setup guidance and complete investigations

- [x] Add the narrow local adoption preview/apply path using existing scaffold
      helpers; cover monorepo, separate-repository, browser-relay and local-only setups.
- [x] Update generated/portable agent guidance: choose project vs service, inspect
      every service, use explicit environment filters, obey consumer consent and
      report local/runtime completion separately.
- [x] Make existing project/service readers and web filters reflect canonical
      scope and legacy links. Add no merge wizard. Any required UI changes reuse
      existing patterns and follow the repository's design approval rules.

**Exit:** A fixture agent task discovers Site/App/API under one project and produces
safe reviewed repository changes without overwriting custom content or local data.

### Slice 7 — Full rehearsal, failure review and release candidate

- [x] Run Docker-backed lint/typecheck/unit/integration/build/schema and relevant
      site documentation checks. Add Make targets before introducing new routines.
- [x] Rehearse populated-schema upgrades, merge, old/new SDK traffic, concurrency,
      worker restart, object access, cleanup and compatible runtime rollback.
- [x] Complete `pre-ship-review` against the data manifest and acceptance matrix;
      record exact source versions, logs, timings, row ceilings and remaining risks.
- [x] Prepare changelog, operator runbook, client/runtime minimum versions and
      support guidance. Resolve failures; do not relabel them as accepted migrations.

**Exit:** Locally qualified release candidate and reviewable production procedure;
no claim that local tests prove deployment or the owner's actual migration.

### Slice 8 — Authorised release, owner adoption and reconciliation

- [x] Under separate release authorisation, deploy migrations and compatible
      runtime first, verify readiness, then publish supported CLI/MCP and enable merge.
      Follow the MCP ecosystem synchronisation pipeline for any new MCP release.
- [x] Refresh a read-only inventory of the owner's actual named projects, confirm
      ownership/settings/data assumptions, select mappings and produce a live preview.
- [x] Apply only the authorised consolidation and reconcile its receipt; all
      original tokens remain valid. Repository adoption was excluded by the
      narrowed owner task and is not claimed.
- [ ] Fresh post-merge SDK-event acceptance is not triggered or observed. Actual
      existing-token configuration, history, analytics, routing, health, queues
      and monitoring pass; synthetic canaries/delivery tests were excluded.
- [x] Run post-phase reconciliation: tracked specs/contracts/rules, overview/map,
      glossary, STATUS, site/setup/API/CLI/MCP docs and TODO agree with shipped reality.

**Exit:** Server consolidation and agreed adoption/verification are complete with
evidence. Otherwise record the exact remaining gate and leave the TODO open.

## 10. Required acceptance matrix

| Scenario                                    | Must demonstrate                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh install and populated upgrade         | Real forward migrations, idempotent backfill, checksum checks and fail-closed missing-schema/version readiness; bootstrap is not the upgrade path.                                                     |
| Unmerged control                            | Existing SDKs, CLI, MCP, web readers, profiles and jobs keep their behaviour with no unsolicited merge/config changes.                                                                                 |
| Three split projects                        | One canonical project lists all mapped services/environments and their complete incident context; no arbitrary naming/deduplication.                                                                   |
| Many services within one source             | Every logical service maps separately; repeated names across environments remain one logical definition with preserved instance IDs.                                                                   |
| Later consolidation and credential adoption | Existing alias closures flatten without cycles or duplicate imports; a canonical token reporting the same mapped failure continues its prior incident history; unattributed evidence stays accessible. |
| Identical fingerprints/names/event IDs      | Distinct histories and ledger namespaces survive; duplicate retries remain duplicates rather than fresh events.                                                                                        |
| Scope attacks and stale access              | Cross-account/owner, altered roles, revoked credentials, stale plans, unknown IDs, scope widening and alias cycles fail before changes.                                                                |
| Token compatibility                         | Existing source and target tokens, origin restrictions, expiry/revocation, SDK config, relay and newly discovered legacy services retain bounded authority.                                            |
| Concurrent traffic                          | Accepted events/jobs are neither lost nor double-billed; stale worker leases cannot commit wrong scope; ordinary readers never see partial reparenting.                                                |
| Failure at each operation boundary          | Before-commit rollback; crash-after-commit detection; idempotent apply/resume; truthful verification failure; no partial “success”.                                                                    |
| Notifications and integrations              | Original filters, pauses, secrets, dedupe, cooldown, payload identity and repository target remain correct; migration itself sends no new incident alerts.                                             |
| Analytics and privacy                       | Consent/settings unchanged, exact prior correlations retained, no invented cross-source identities, truthful unique-count coverage and unchanged usage claims.                                         |
| Immutable artifacts and old links           | IDs, bytes/hashes and original storage keys preserved; authorised legacy/canonical fetches work; unauthorised scopes fail.                                                                             |
| Health/status and limits                    | Schedules, histories and status URLs persist; no public scope expansion, counter reset or silent quota exception.                                                                                      |
| Retention/deletion                          | Original expiries enforced across all roots; canonical cleanup includes origins; legacy delete cannot remove the canonical project.                                                                    |
| Local adoption                              | Bounded explicit roots, secret-free diffs, concurrent-edit/symlink protection, repeat-safe writes and preserved local caches/events/custom profile content.                                            |
| Release compatibility                       | Merge disabled until every runtime participant is compatible; approved rollback version still understands aliases/origins.                                                                             |

Use behaviour tests and production-shaped fixtures, not tests mirroring private
helpers. Run the repository's required gates once changes settle; broaden testing
when failures or subsequent changes justify it. Browser investigation is not
required unless the user requests it under the current repository rules.

## 11. Rollout limits and completion record

The rollback floor changes once the first merge is committed: binaries unaware of
aliases/origin scope are no longer safe, even if SQL migrations were additive.
Ship and verify the compatibility foundation first; retain a verified compatible
rollback release before enabling merge. Do not run destructive down migrations
or restore a stale database over new production traffic as a routine unmerge.
Backups and recovery procedures remain required for operator disaster recovery.

No destructive cleanup of legacy bindings belongs in this phase. Their later
retirement requires proof that tokens, links, retained artifacts and jobs no longer
depend on them, plus a separately documented compatibility window. Keeping these
small records is cheaper and safer than forcing every installed consumer to move
at once.

The main implementation risks are incomplete scope resolution, unclassified
project references, oversized transactions and false analytics deduplication.
The manifest, bounded first version, origin preservation and integration tests
address them directly. If representative fixtures cannot meet the bounded-cutover
contract, stop at that gate and revise the implementation plan before promising
online migration; do not weaken compatibility to fit the schedule.

Track these outcomes separately in the execution receipt:

| Outcome                                     | Status on 2026-11-04                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Proposal and TODO link                      | Superseded by this tracked implementation contract                   |
| Tracked contracts and implementation slices | Implemented; final audit corrections qualified                       |
| Local qualification and migration rehearsal | Passed for the final audited candidate                               |
| Runtime/client release                      | Released and independently verified                                  |
| Owner's server-side project consolidation   | Completed and independently verified                                 |
| Each named repository adoption              | Excluded from the narrowed owner task                                |
| Actual deployed runtime verification        | Existing-token/read/health gates pass; fresh SDK event not exercised |

The resulting product should feel simpler: select **DebugBundle**, inspect its
services, and let an agent manage a reviewed consolidation when needed. The
compatibility machinery stays behind that operation; it does not become a new
daily workflow for the user.
