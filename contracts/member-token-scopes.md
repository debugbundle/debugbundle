# Member token scopes

Implements FR-BUS-03 and AC-BUS-03 in [the Business contract](../spec/business-tier.md).
Project ingestion, agent tokens, OpenAI OAuth and the hosted/restricted MCP
catalogues retain their separate contracts.

`POST /v1/member/tokens` retains the legacy `{label}` body and response. An
optional `scope` declares either:

- `{mode: "projects", project_ids: UUID[], permissions: Permission[]}`; 1–100
  distinct projects, including legitimate direct cross-organisation shares.
- `{mode: "organization", organization_id: UUID, permissions: Permission[]}`;
  exactly the verified interactive session's current organisation, including
  future projects only to the extent the holder has live authority.

Permissions are `project:read`, `project:write`, `project:admin` and
`organization:admin`. Project write includes read; project admin includes project
read/write/configuration. Organisation administration is separate and requires
organisation mode. No permission permits a restricted token to mint member,
ingestion or agent credentials, transfer ownership, delete a project or delete a personal account.
Live role/plan/status checks remain mandatory; a permission never grants a role.

New scopes require a verified browser session. Bearer requests return
`interactive_verification_required`. Omitted scope retains legacy issuance.
An optional `expires_at` applies only to scoped creation: future, at most 365
days; the default is 90 days. The server snapshots accepted origins and validates
all selected projects and requested permissions. The stored version-1 policy has
at most 1,000 distinct origins in total. Invalid stored policies fail closed.

`GET /v1/member/tokens?include_scope=true` opts into the `scope` property on new
scoped records. Default lists keep the strict legacy response shape. A legacy
record omits `scope`, including in an opted-in list. Plaintext is returned once;
only its hash is stored. No client may supply accepted origins as a query filter.

Lists/counts apply accepted origins and organisation bounds before pagination.
An expanded merged project cannot widen a token: global evidence remains limited
to accepted origins, and a project operation whose full current scope exceeds
the snapshot fails closed. Review/reissue a token to accept the expanded scope.
Legacy tokens keep ownership and direct-sharing authority, including later
direct invitations; Business inheritance never silently enlarges them.

CLI `token member list --include-scope` and `token member create --scope-json
'<declaration>' [--expires-at <iso>]` expose the same declarations. Ordinary MCP
`list_member_tokens` accepts `includeScope`; `create_member_token` accepts `scope`
and `expiresAt`. Both retain the verified-interactive issuance boundary. The
dashboard's new form defaults to selected projects and read-only permissions.

New interactive and token-identified artifact requests retain only the user ID
and initiating token ID, plus accepted origin scope. No bearer/session plaintext
is copied into a queue or generation record. Analytics execution and publication
recheck live token expiry/revocation, issuing membership, project rights and
accepted origins. Missing/revoked authority cancels work before source reads or
publication. Write attempts retain their deterministic object key for cleanup after failure, including an uncertain storage reply.

Incident/improvement regeneration and downstream reproduction preserve a fixed
full-project snapshot and recheck it before work and publication. They fail closed
if a merge expands that scope. Previously accepted ingestion/system jobs keep
their existing path. Suggestion previews can request missing bundle regeneration
and remain operational writes for restricted credentials; applying a suggestion
also requires its existing project administration checks. Existing remote probes
remain bounded accepted operational configuration under their deactivation/TTL
contract, rather than becoming a new deferred requester queue.

Forward migration `202611070005_bind_project_job_initiators` adds nullable
analytics initiator metadata and a worker claim guard. It blocks an older worker
from claiming work whose saved authority it cannot enforce; existing unbound jobs
remain runnable. The capable worker establishes `project-initiator-v1` only for
its transaction-local claim. Apply migrations and start the capable worker before
activating scoped request producers; retain this guard during rollback. Mixed
scope artifacts are refused before object reads, including capture suggestions
and reproductions.
