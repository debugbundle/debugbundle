# OpenClaw native runtime and connected incident scope correction

Status: owner-authorised release preparation on 3 November 2026. Candidates are
CLI 1.18.1 and MCP/OpenClaw 1.18.2; publication and exact-version acceptance are
pending. Existing immutable 1.18.0/1.18.1 artifacts are unchanged.

## Confirmed upstream state

On 2 November 2026, Patrick-Erichsen
[confirmed](https://github.com/openclaw/clawhub/issues/4214#issuecomment-6588056002)
that ClawHub fixed SkillSpector and published unchanged plugin 1.18.0 and 1.18.1.
The maintainer verified anonymous archive equality and exact-version installs,
but reported missing project filters in incident requests and native plugin
loading failures. Publication recovery does not establish working runtime or
clean security acceptance. Issue #4214 remains open for those separate defects.

## Reproduction and correction

Mapped requirements: FR-MCP-02/03/10/18, NFR-SEC-13, INV-5;
AC-MCP-01/02/11 and AC-OPENCLAW-01 through 04. Applicable security boundaries:
SEC-03/10/11, project/member authorization and existing egress redaction. No new
routes, credentials, token privileges, event fields or database shape are added.

- Native `node` import of the original emitted ESM fails with
  `Dynamic require of "node:assert" is not supported` inside bundled Undici.
  The existing OpenClaw manifest validation still passes, demonstrating why
  transpiling validation alone missed the runtime failure. The build now adds
  Node's `createRequire(import.meta.url)` before CommonJS dependency execution.
  The existing pinned HTTP implementation/dispatcher pair, optional tool policy,
  schemas and public exports are retained.
- Connected CLI and MCP listings ignore `cloud_project_id` and send unscoped
  cloud requests. New failing tests confirm both explicit-cloud and merged
  paths. A shared resolver now supplies the connection's project to every cloud
  page unless an explicit project is selected. Local evidence is not filtered
  using this cloud-only default. Null, blank, non-string or missing connected
  scope fails before an incident-list request. Explicit local reads and
  unconnected account-wide member reads retain their semantics. Server member
  access checks remain authoritative; this is client selection, not a new
  authentication boundary.

Source references: `apps/cli/src/local-retrieval-store.ts`,
`apps/cli/src/retrieval-list-detail-commands.ts`,
`apps/mcp/src/retrieval-tools.ts`, `apps/openclaw-plugin/package.json` and
`apps/openclaw-plugin/scripts/check-runtime.mjs`.

The runtime fixture registers the emitted plugin through the actual pinned
OpenClaw SDK, performs compressed loopback incident reads and multi-page merged
reads, checks the native approval request and rejects missing project scope
without another request. It uses a temporary workspace and synthetic token;
no production data, saved connection or consumer product is modified.
`make openclaw-release-check` includes the native Node 22/24/26 matrix, so a
future ESM load or scope regression prevents the existing publisher pipeline.
The mandatory installed check packs the candidate, installs pinned OpenClaw
2026.6.9 in a disposable container, invokes its normal plugin installer and
`plugins inspect --runtime`, compares all 139 registered tools and installed
entry bytes, then executes native scoped reads from those installed bytes.

## Qualification

- Red: native ESM load reproduces the exact `node:assert` error; new project
  scope suites initially fail eight MCP and six CLI cases. One CLI test fixture
  also lacked required local-state metadata and was corrected to use the real
  fixture reader before acceptance.
- Green: 879 tests in 124 CLI/MCP/OpenClaw, agent-routing and release-governance
  files pass; full workspace typecheck passes. Existing account-wide tests now
  use an empty workspace rather than inheriting the developer checkout's real
  connected project. Connected fixtures include their intended cloud project.
- Initial native matrix: Node 22.23.3, 24.14.0 and 26.12.0 import the bundle,
  register all 139 tools and complete a project-scoped loopback request.
- Final edge suite: 35 tests in five files pass, including blank explicit scope,
  an explicit project overriding an incomplete connection, and stable project
  scope when connection metadata changes between pagination requests. These
  overlap the earlier regression suite; the counts are not additive.
- Expanded native Node 22/24/26 matrix passes compressed responses, scoped
  multi-page retrieval, native approval metadata and fail-closed missing scope.
  Mandatory `make openclaw-release-check` passes all 32 tests in nine files as
  well as the artifact/manifest and runtime checks.
- Full workspace lint and changed-file lint pass. New files pass the repository
  formatter; `git diff --check` is clean. Full workspace typecheck passes.
- Pre-ship review: changed paths are local connection selection, the two client
  adapters, emitted ESM initialization and their release checks/docs. No database
  migration, hosted activation, SDK change, new authority, raw payload output or
  production request is introduced. Cloud project selection stays fixed for a
  list traversal; invalid scope makes no list request. Temporary runtime fixtures
  are removed and loopback connections are closed. Existing API authorization,
  sanitization, tool catalogs, optional approvals and local selection remain
  covered by the passing compatibility suites.

Local logs: `/tmp/debugbundle-openclaw-regressions.log`,
`/tmp/debugbundle-openclaw-typecheck.log`,
`/tmp/debugbundle-openclaw-runtime.log`,
`/tmp/debugbundle-openclaw-release-check.log`,
`/tmp/debugbundle-openclaw-final-edge-tests.log`,
`/tmp/debugbundle-openclaw-lint.log` and
`/tmp/debugbundle-openclaw-changed-lint.log`.

## Release boundaries

The owner authorised publishing this corrective release and the DebugBundle site
on 3 November. Use the selected new immutable patch versions; never overwrite or re-upload changed bytes as published
1.18.0/1.18.1. CLI and MCP consumers of the shared scope fix need their own
applicable distribution updates; the native OpenClaw package remains aligned
with MCP under the existing contract. Do not silently update independently
versioned Codex/Claude/Gemini pins or consumer products.

Before release, retain the final local evidence, owner approval and exact source
identity. Then use the existing package/release pipeline, exact-version ClawHub
inspection and normal hosted security review. Verify downloaded artifact
identity, installed plugin load and a scoped request in a clean supported host
before claiming runtime acceptance. Publication/security/discovery remain
separate gates; scanner warnings cannot be locally cleared. No public follow-up
comment or additional release action has been taken in this local correction.

## Authorised release sequence

1. Re-audit code/contracts; qualify CLI/MCP/OpenClaw, including installed bytes,
   native Node matrix, full source regressions and source CI.
2. Publish CLI 1.18.1 and MCP 1.18.2 through existing trusted GitHub workflows.
   Verify registry integrity and clean installed CLI/MCP behaviour.
3. Run the existing post-npm ecosystem pipeline for official Registry, ClawHub
   skill and OpenClaw plugin 1.18.2. Smithery remains a retired publication target.
   Retain every accepted receipt and require exact-version security outcomes.
4. After npm publication, adopt the corrected MCP pin in independently versioned
   DebugBundle Codex/Claude/Gemini patch packages and verify their public installs.
5. Publish site 1.6.12, including the existing new verification article and
   current developer guidance, through a site-only immutable-SHA deployment.
   Verify served article/index/sitemap, redirects, assets/cache, source identity
   and unchanged API readiness. No API/worker or language SDK deploy is required.
6. Reconcile release records. Keep issue #4214 open while any security or native
   installed-runtime acceptance is incomplete. Do not create more versions for
   an operational scanner failure or bypass held security outcomes.

## Publication progress

- Corrective source `74ed1e8b08abd76ac500c28806ddd33621fbed2d` passes full CI
  `41628553335`, including all 103 coverage shards and build. CLI runtime CI
  `41628553432` passes the supported matrix. A broad local run passed 4,884
  checks and timed out two API checks; both owning files then passed all 23
  tests at unchanged limits. No test timeout was raised.
- CLI 1.18.1 (`41631915939`) and MCP 1.18.2 (`41631915937`) are published with
  successful release workflows. Downloaded artifacts have the expected source
  commit, npm provenance and exact SRI integrity. Both published packages made
  real read-only requests against the connected DebugBundle production project,
  returning only its one active incident.
- Site source `f692b8c329dd1e82346922510ae46375f176ca4c` passes CI `41630937542`,
  49 local site checks, typecheck, production build and 16 core/site contract
  checks. Production deployment remains pending developer distribution updates.
- The initial Registry publication returned 401 because its five-minute DNS
  session expired before publication. Renew immediately before retry; no version
  change or authentication-policy weakening is required.
- Current public OpenClaw is 2026.10.10. Unlike the 2026.6.9 floor, it requires
  explicit trust confirmation for a local archive outside ClawHub review.
  `OPENCLAW_CHECK_TRUST_LOCAL=1` acknowledges only the exact locally built
  candidate path, inside a disposable profile. It cannot be applied to a remote
  ClawHub install. This is local artifact qualification, not security acceptance;
  the published ClawHub installation must pass normally without that flag.

The current host also requires separate third-party capability consent.
Qualification reviews DebugBundle's fixed 139-tool catalog and approval hook,
then uses `OPENCLAW_CHECK_ACCEPT_CAPABILITIES=1` in the disposable profile.
The vendor documents this normal consent separately from source acknowledgement;
neither flag overrides installer security policy. Production instructions ask
operators to review capabilities before the normal consent flag. Remote
ClawHub qualification never sets the local-source force flag.

Current-host qualification passes on OpenClaw 2026.10.10 after the documented
source and capability acknowledgements in the disposable test profile. Runtime
inspection reports all 139 tools loaded, installed JavaScript bytes match the
qualified candidate, and native scoped reads/pagination/approval/fail-closed
checks pass. The minimum 2026.6.9 host remains independently qualified. All 34
developer package contract/routing/publication checks pass with the updated
Codex/Claude/Gemini pins; their public installation checks follow promotion.

## Additional diagnostic path found by exact-version review

The accepted 1.18.2 upload is public, but its final review is suspicious because
`doctor` still sends an unscoped authenticated `/v1/incidents?limit=1` probe.
Ordinary lists and pagination are corrected; diagnostics discarded the returned
incident data, so this is an overly broad read rather than a demonstrated
agent-facing disclosure or authorization bypass. The finding is valid.

Five new/updated assertions fail before the fix. The shared CLI doctor path now
validates and trims its connected project before any network request and adds an
encoded `project_id` to the one-incident probe. Null, missing, blank and non-string
scope never dispatch. Local-only diagnostics remain offline. All 43 doctor/MCP
checks pass. Tool metadata explicitly discloses connected health and saved-member
authentication checks. Native emitted/installed qualification now also executes
this diagnostic path and asserts scope, limit, credentials and fail-closed state.
No language SDK, server authorization, database or customer data changes apply.

The implementation change requires new immutable CLI 1.18.2 and MCP/OpenClaw/skill
1.18.3 patches. Published 1.18.2 remains untouched. Developer wrapper adoption
follows successful npm publication. Full CI 41635642589 found one stale ledger
row after developer pin adoption; reconcile the ledger, preserve the test and
require the new source CI to pass. The initial source 74ed remains qualified.
Final security review and antivirus must still pass; lexical discovery is 5/7.

The legacy stdio/OpenClaw parity gate caught the intentional doctor description clarification. A narrow compatibility allowance covers only its two descriptions under the documented connected-diagnostic contract; the historical fixture remains unchanged; all schemas, names, approval flags and result shapes remain identical. This is an explicit metadata correction, not a change to the separately frozen hosted OpenAI catalog.

Diagnostic candidate local qualification passes full workspace typecheck,
changed-code lint, 43 doctor/MCP regressions, 18 focused scope/catalog/ledger
checks (overlapping), and mandatory OpenClaw preflight: all 32 tests, emitted
Node 22/24/26 runtime checks and a clean installed 2026.6.9 host. Native doctor
checks include project/limit encoding, unauthenticated health, synthetic member
authentication and five invalid-scope cases with no network request. The same
139 tools, schemas, optional approvals and local evidence behavior are retained.
The installed fixture closes its loopback server and removes its disposable
state; no database, server deployment or consumer product change is required.

Source CI 41639765863 passed lint/typecheck and native Gemini Node22/24/26 but found one additional stdio test assertion for the old doctor description. The documented metadata clarification also applies there; the original name/schema/result assertions are preserved. The complete CLI/MCP suite and fresh full CI must pass before publication.

The complete CLI/MCP regression suite passes all 869 tests across 120 files after the metadata expectation is reconciled. Diagnostic runtime code and version candidates are unchanged.
