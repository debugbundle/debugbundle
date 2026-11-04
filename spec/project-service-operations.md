# Project/service consolidation operations

Candidate workflow, 4 November 2026. Implementation and local qualification do
not authorise publication, hosted activation, a live merge, consumer edits or a
production canary. Keep those gates separate.

Projects represent a system investigated together. Services represent its
applications/processes. Site, App and API can share one project with independent
repository context and environments. No Product/Group object or Business tier is
introduced. Existing credentials, input names, evidence IDs and scopes remain
valid. A merge never silently reconciles access or policy conflicts.

## Checked server operations

Member-authenticated API and ordinary MCP call the same owner-checked domain
store. The hosted OpenAI read-only catalogue remains unchanged.

| Action                       | API                                          | Ordinary MCP                               |
| ---------------------------- | -------------------------------------------- | ------------------------------------------ |
| Preview                      | `POST /v1/project-merges/preview`            | `preview_project_merge`                    |
| Apply                        | `POST /v1/project-merges`                    | `apply_project_merge`                      |
| Status                       | `GET /v1/project-merges/{id}`                | `get_project_merge`                        |
| Recover an uncertain outcome | `GET /v1/project-merges?idempotency_key=...` | `get_project_merge` with `idempotency_key` |
| Read-only verification       | `GET /v1/project-merges/{id}/verification`   | `verify_project_merge`                     |
| Resume eligible work         | `POST /v1/project-merges/{id}/resume`        | `resume_project_merge`                     |
| Cancel before cutover        | `POST /v1/project-merges/{id}/cancel`        | `cancel_project_merge`                     |

Preview body is `{target_project_id, source_project_ids, service_mappings}`.
Each mapping is `{source_project_id, service_definition_id, name}`. Preview is
read-only and returns `plan_digest`, `ready`, actionable `blockers`, resource
counts/limits and deterministic `suggested_service_mappings`. Suggestions do not
apply themselves. Inspect them, make explicit mappings and preview again.

```sh
debugbundle project merge preview --target TARGET --sources SOURCE_A,SOURCE_B --json > inventory.json
# Save the chosen suggested_service_mappings as a JSON array in mappings.json.
debugbundle project merge preview --target TARGET --sources SOURCE_A,SOURCE_B --mapping-file mappings.json --json > checked-plan.json
debugbundle project merge apply --plan-file checked-plan.json --idempotency-key system-consolidation-1 --json
debugbundle project merge status --idempotency-key system-consolidation-1 --json
debugbundle project merge verify OPERATION_ID --json
```

Apply body is `{request, plan_digest, idempotency_key}`. Retain the same key and
exact request on retries. A changed request/digest with the same key conflicts.
After a timeout, look up the key before deciding what to retry. A conflict may
include a durable `operation_id`; retain it. `failed_before_commit` can be
re-previewed when its cause is resolved. `verification_failed_after_commit`
means the cutover committed; use status/verify/resume, never infer rollback.
Cancellation cannot undo a committed merge. No CLI command prompts interactively.

The request body ceiling is 1 MiB for preview/apply; other merge mutations retain
the normal 256 KiB ceiling. CLI mapping/preview files are bounded at 4 MiB. The
domain also enforces origin, service, configuration-byte, row, lock and statement
ceilings. A supported-size blocker requires reducing the operation's scope;
there is no partially visible chunked cutover.

## One authorised repository at a time

Normal project lists contain canonical projects. To resolve an old link without
widening its original view, use `GET /v1/projects?project_id=LEGACY_ID`,
`project list --project-id LEGACY_ID`, or ordinary MCP `list_projects.projectId`.
The result retains `project_id` and adds `canonical_project_id` for an alias.
Access is checked against current canonical membership. Existing dashboard links
use this exact-view fallback when the project is absent from the normal list;
late responses cannot replace a newly selected project. Existing controls/layout
and the hosted read-only catalogue are preserved.

The completed server receipt includes `adoption_manifest`: service IDs and names,
effective repository context, environments, retained input names and remaining
gates. It contains no credentials. Old unsafe metadata is withheld and marked for
manual review. A receipt superseded by a later merge must be replaced by the
latest applicable receipt before adoption.

```sh
debugbundle project merge adopt preview --operation-id OPERATION_ID --workspace-root /absolute/authorised/repository --json > adoption-plan.json
debugbundle project merge adopt apply --plan-file adoption-plan.json --json
```

Both commands first read server status and verification using normal CLI auth.
Preview reads only recognised connection/profile files in that root and returns
their hashes and semantic leaf diffs. It never prints the original profile or
custom content. Apply checks the exact plan and current server manifest, rejects
symlinked paths and concurrent changes, and replaces each changed file atomically
with its original permissions. A later failure rolls back this invocation's own
writes only if they are still unchanged. A rollback conflict reports
`adoption_partial_apply_review_required`; inspect the named workspace before
continuing. Already-applied file hashes let the same checked plan complete a
previous interruption. A crashed process may leave `.debugbundle/adoption.lock`;
confirm no adoption process is running before removing that lock and retrying.
Cleanup removes only its own lock inode. A replacement/missing lock reports
`adoption_lock_changed_review_required` and is preserved; configuration files may
already be applied, so inspect them and the active process before recovery.

The helper reports `local_configuration: applied` and
`local_adoption: pending_repository_checks`; it cannot certify a repository's
application review or test suite. It changes the connection's project ID and adds profile context. It keeps
local service names, dependency references, existing tokens, custom content,
local events/state, auth and bundle caches. Unmatched or ambiguous services block
automatic adoption with `adoption_service_mapping_required`. Inspect the manifest
and make an authorised language-aware repository change in that case. It does
not rewrite application code, environment variables, relay configuration, CI or
deployment secrets. The result lists those remaining checks and leaves deployed
runtime verification pending. Local plan files are bounded at 8 MiB; recognised
scaffold files at 1 MiB each.

Profile context is explicitly labelled `metadata_source: merge_receipt_snapshot`.
Read the current service catalogue before completing repository review; later
authorised names/repository changes do not rewrite an immutable merge receipt.
Hosted analytics preserve the frozen structured JSON vocabulary and convey
multi-origin coverage and unique-count semantics in an additional ordinary MCP
text block. API/CLI/ordinary MCP retain the explicit `origin_scope` metadata.

`make test-unit` runs the complete sharded coverage gate plus the selected real
Postgres migration/consolidation cases in one randomly named, labelled, tmpfs
test database. It exposes no host port and receives no application/provider
credentials. Cleanup verifies resource ownership before removal. CI supplies a
fresh Postgres service for the same coverage lane; other Redis/S3 integration
tests retain their independent lane. An explicit isolated-database marker is
required rather than silently skipping database coverage.

MCP/API agents can use the same manifest with ordinary filesystem tools; they do
not need a new platform or migration UI. Before any consumer edits, SDK upgrades,
push, deployment or canary, verify authorisation names that product and action.
DebugBundle implementation approval does not authorise adoption in SayCheese,
Healthbrain, TaskTime, Sava, Afipal or any other consumer.

## Activation and rollback floor

GitHub service repository URLs supply context. Dispatch requires an existing
repository registration inside the consolidated project's origins and an active
same-account installation; a URL cannot grant access to an unrelated project.
Manage a retained repository binding through the existing repository PUT/DELETE
endpoint with its original project ID and current canonical owner/admin access.
This updates or removes only that origin's binding/rules. Updating a retained
binding does not create a new default rule. Account-wide installation disconnect
requires the current account owner and serializes against a merge; a busy fence
returns the existing retryable configuration conflict.

`PROJECT_MERGES_ENABLED` defaults to false. Preview readiness describes data
compatibility; it does not grant deployment or activation approval. Before
enabling apply, qualify the exact candidate artifacts, apply the ordered forward
migrations, and replace/drain every incompatible API and worker process. Startup
and readiness must reject missing migrations/guards. Wait for the predecessor
SDK-config cache lifetime to expire and verify private/no-store responses for
distinct credentials and relay origins on the actual served route. No compatible
fleet or cache qualification is inferred from source-only tests.

Ordinary management writes acquire the complete origin fence in ID order before
resource row locks and serialize for up to one second (or a shorter configured
lock timeout). Contention beyond that budget returns retryable HTTP 409
`project_configuration_busy`. Direct row-trigger fences remain non-blocking;
merge reservations and a scope changed through cutover still reject the write.

After the first committed merge, rollback must retain the project-service runtime
contract and additive schema. Returning to a pre-consolidation API/worker binary
would lose alias/scope handling. Keep a separately qualified compatible rollback
artifact and immutable provenance; do not revert the schema or bootstrap it.
Release preparation and live server consolidation, repository adoption and
deployed-runtime evidence remain separate acceptance gates.
