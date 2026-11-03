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
