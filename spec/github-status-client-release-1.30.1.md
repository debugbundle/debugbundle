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

GitHub workflow qualification, npm and marketplace publication, public install,
security review and discovery remain release steps. The local archives carry no
registry provenance claim.
