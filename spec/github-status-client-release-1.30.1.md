# GitHub status client patch 1.30.1

`debugbundle github status` and `get_github_status` accept the existing HTTP 200
responses for an unconnected GitHub App or an unassigned repository. CLI human
output explains the unconnected state; CLI JSON keeps `installation: null` and
omits an unassigned `repo`. Project-scoped MCP reports `repo: null`. Connected
responses and genuine API errors retain their existing behavior. The repository
assignment write still requires a repository object in its success response.

FR-GHA-01, FR-GHA-04, FR-GHA-18 and AC-GHA-16 cover this correction. The API
already returns the documented shapes. This patch changes the shared client
and status formatting, with no schema, deployment, credential or access change.

## Distribution decisions

| Distribution                                           | Decision       | Reason                                                                                                                                          |
| ------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI and ordinary MCP npm packages                      | Publish 1.30.1 | The installed clients read valid empty GitHub status responses through the bundled shared client.                                               |
| Official MCP Registry                                  | Publish 1.30.1 | Advertise the verified MCP npm package with matching registry metadata.                                                                         |
| OpenClaw companion                                     | Publish 1.30.1 | Its bundled MCP tools include the corrected GitHub status reader.                                                                               |
| ClawHub portable skill                                 | Publish 1.30.1 | Exact installer pins deliver the corrected CLI and MCP.                                                                                         |
| Codex 1.9.1, Claude Code 1.25.1 and Gemini 1.8.1       | Retain         | Existing exact MCP 1.30.0 pins remain compatible with the hosted API; those plugin installs do not gain this fix until a separate pin adoption. |
| Smithery MCP and skill                                 | Retain         | Published history stays intact. Publication is retired per release governance.                                                                  |
| Hosted core, site and restricted OpenAI connection     | Retain         | No hosted behavior, public-site build or restricted tool contract change.                                                                       |
| SDKs, shared-type/redaction packages and GitHub Action | Retain         | The correction is bundled into the affected clients. These artifacts have no changed runtime behavior.                                          |

## Qualification and release sequence

1. Check API/CLI/MCP contract parity and both empty status paths. Test real
   client decoding with synthetic responses and exercise installed CLI, MCP
   stdio and native OpenClaw artifacts against loopback API fixtures.
2. After approval, commit and push a release branch and qualify that revision.
   Keep the unpublished portable installer pins off public `main` until both
   npm artifacts pass clean registry installation. Publish from the existing
   package workflows and preserve the exact artifact/source receipts.
3. Run the repository release pipeline from the published MCP npm artifact.
   Select official Registry, ClawHub skill and OpenClaw plugin publication;
   perform the configured discovery and security follow-through. Verify the
   supported minimum and current OpenClaw host, the exact public versions and
   both package installer pins before promoting the public source.
4. Record verified publication in the agent distribution ledger. Core and
   hosted releases stay independent.

## Local candidate evidence

- The new loopback stdio check reproduces `invalid_response_shape` against a
  clean install of the published MCP 1.30.0. It passes against the packed 1.30.1
  candidate on Node 22, 24 and 26.
- The packed CLI passes the five-version matrix (Node 22, 24, 26.0.0, 26.2.0
  and current 26). The GitHub status probe runs over HTTP/1 and HTTP/2 in the
  installed-runtime check.
- 94 focused API, CLI, MCP and package/contract tests pass. The separate
  OpenClaw/ecosystem suite passes 61 tests. Docker typecheck and focused lint pass.
- The candidate OpenClaw bundle passes manifest validation and native scoped
  requests on Node 22, 24 and 26. A clean install on the supported minimum host,
  2026.6.9, loads the packed artifact and passes the same scoped checks.
  Current OpenClaw 2026.11.10 also passes on Node 24.22.3 using the documented
  local archive trust and capability acknowledgements in a disposable profile.
  Public ClawHub installation still requires ordinary security enforcement and
  verification after publication.

Local candidate archives and their SHA-256 values:

| Artifact | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| CLI      | `6b6851ac7f1dee2061951871fcf5c603e280d96e0d0b3e3b40ae3829928a39e8` |
| MCP      | `64c4da0e2838662f7f1e65f95fa25f000a09502289dc9c24069bb6c21418cdbd` |
| OpenClaw | `77e859e1201481667ed41dc2da25895b8989288399e4fbefb83e31073bd20359` |

## Publication receipts

- Annotated `cli-v1.30.1` and `mcp-v1.30.1` both resolve to
  `3d099a227fa0a9da0d82bccfb5262867a18dda99`. The [CLI compatibility matrix](https://github.com/debugbundle/debugbundle/actions/runs/45905590033),
  [CLI release workflow](https://github.com/debugbundle/debugbundle/actions/runs/45905771175)
  and [MCP release workflow](https://github.com/debugbundle/debugbundle/actions/runs/45905771114)
  passed for that revision. MCP includes native Codex checks on Node 22, 24 and
  26 and a native Codex readback against the published package.
- Both [CLI](https://www.npmjs.com/package/@debugbundle/cli/v/1.30.1) and
  [MCP](https://www.npmjs.com/package/@debugbundle/mcp/v/1.30.1) are npm `latest`.
  The downloaded archives match the local SHA-256 values above and npm's
  SHA-512 integrity. Their npm provenance names the release revision and
  workflows. Cold-cache public installs, loopback GitHub status checks and
  `npm audit signatures` pass independently for both packages.
- The [official Registry](https://registry.modelcontextprotocol.io/v0/servers/com.debugbundle%2Fmcp/versions/1.30.1)
  resolves `com.debugbundle/mcp` 1.30.1 to the exact npm stdio package. The MCPB
  bundle built from that npm archive passed the stdio status check. Its SHA-256
  is `cbb13977de2b2eefa6d469e0ae87291167f65bde6f33ffb16615fb48f6cf718e`.
- The [ClawHub skill](https://clawhub.ai/debugbundle/skills/debugbundle) is public
  at 1.30.1. The raw `SKILL.md` matches the qualified source byte for byte,
  including both installer pins. Final ClawScan review and moderation are clean.
  The report retains three SkillSpector warnings adjudicated as expected by the
  final review. Bounded discovery passes six of seven queries against the
  five-query minimum.
- The [OpenClaw plugin](https://clawhub.ai/debugbundle/plugins/openclaw-plugin/security-audit?version=1.30.1)
  is public at 1.30.1 with clean final ClawScan review. Its downloaded archive
  matches published SHA-256
  `0d4b21da02f01406a13cc2ba16f9e65bf31b427e66d3ad7daa2182379269361d`.
  All six packaged files match the qualified local archive. A clean public install
  on OpenClaw 2026.11.10 loads the exact runtime and passes scoped reads,
  including the GitHub empty state, using normal capability consent.
- [Glama's public listing](https://glama.ai/mcp/servers/debugbundle/debugbundle)
  is reachable even though directory API search returns HTTP 401. LobeHub
  remains a discovery follow-up. Neither is an exact-version publication channel
  for this patch.
- Hosted API and MCP readiness return `ready`. Dashboard build ID remains
  `66e8a15e6f1f54ef610a29e9063d94aa38428949`, the deployed Core 1.32.1 revision.
