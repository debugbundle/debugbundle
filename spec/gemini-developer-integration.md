# Gemini CLI developer integration

Implements FR-MCP-17 and AC-MCP-19 alongside the existing Codex and Claude Code distributions. Agent selection, generated instructions, and repair remain governed by `spec/agent-aware-cli-setup.md`; interface selection and authorization remain governed by `contracts/agent-interface-routing.md`.

## Package and runtime boundaries

- Source: `plugins/debugbundle-gemini/`; independent extension version `1.0.0`.
- Native entry point: root `gemini-extension.json`, with one `debugbundle` stdio server running `npx -y @debugbundle/mcp@1.12.1 --local-auth` in `${workspacePath}`.
- Workflow: `skills/debugbundle/SKILL.md`, containing the shared CLI-first guidance. Gemini's generated project skill takes precedence over the extension skill.
- Installation configures the connection and portable skill. Application setup, SDK capture, login, and authorized writes remain separate actions.
- Local reads require no member login. Hosted reads use saved CLI authentication on the same machine/account, or explicit protected environment forwarding for a direct MCP connection. Credentials never enter per-call schemas.
- No hooks, custom commands, automatic permission grants, domain services, database changes, or hosted OAuth changes are introduced.
- Public guides and the blog remain accurate about candidate status until the public source is verified.

## Local qualification

Run from the core checkout:

```sh
make gemini-extension-check
make gemini-extension-package
make gemini-extension-smoke
make codex-plugin-check
make agent-guidance-check
make lint typecheck
make -C site test typecheck build
```

The package target emits `.tmp/gemini-extension/debugbundle-gemini-1.0.0.zip` and its SHA-256. The archive contains only the root manifest, skill, README, changelog, and Apache-2.0 license. Tests check reproducibility, exact extracted content, rejection of unsupported capabilities/credentials and invalid versions, and refusal to follow source symlinks.

The native smoke pins Gemini CLI `0.61.0`, DebugBundle CLI `1.12.0`, and MCP `1.12.1`. CI and local qualification cover Node 22, 24, and 26 on Linux in Docker; the Make target defaults to Node 24 and accepts `GEMINI_SMOKE_NODE_IMAGE=node:22-bookworm` or `node:26-bookworm` for the other runtimes. It installs dependencies into an isolated application, then uses offline npm and a loopback-only proxy configuration for client checks. It verifies the extracted archive, native install/list/update/uninstall, real local incident/bundle/reproduction reads, real CLI setup, project-skill precedence and activation, saved-auth retrieval against a synthetic loopback server, per-call credential rejection, missing-auth failure before HTTP, direct MCP environment forwarding, access-denial propagation without retry, and preservation of user settings and project guidance on removal.

Recorded responses drive Gemini's real tool scheduler and MCP transport without a model API request. This proves integration plumbing; it does not prove a live model's investigation quality or permission decisions. No host credentials or customer incident data are used. Native macOS/Windows execution and other Gemini versions require their own client acceptance before being described as tested.

### Audit result, 2026-09-25

Native checks pass on Node 22/24/26, including all 123 MCP tool schemas. Core lint and typecheck pass; 81 focused Gemini/setup/package tests, 172 existing agent/MCP compatibility tests, shared guidance parity, and 32 site tests plus the static build pass. Both new site routes have valid local canonicals, sitemap entries, and internal links.

All 79 unit-test groups were exercised: 3,721 tests passed and one existing OpenAI release-provenance test failed. The ordinary full runner stopped at that failure; its remaining 30 groups were run separately without changing or skipping test expectations. Read-only manifest comparison confirms that only the source working-tree record differs; the OpenAI package, contract, and runtime sections are unchanged. The aggregate coverage gate and clean committed CI are not marked passed. Refresh provenance after the authorized implementation commit and rerun the normal gate before publication.

The final standalone ZIP contains exactly the five reviewed source files and has SHA-256 `0eb44ed01e1a06842704542e64f4dd4acbebdff8ed3521872fe89f3e09b224a1`. The implementation is a locally verified release candidate; public-source installation, deployment, and gallery discovery remain unperformed.

## Public release sequence

The candidate is locally prepared. Source publication, a public install, site deployment, and gallery discovery are not implied by local checks.

1. With release authorization, freeze the reviewed core and site changes at immutable commits and pass CI. Record the extension version, MCP pin, source commit, and archive SHA-256. The existing repository-wide OpenAI source-attestation check includes unrelated core changes: refresh only its provenance packet using the recorded API image digest and connection metadata, verify its plugin/contract/runtime hashes remain unchanged, and follow the existing immediately-following evidence-only commit rule. This does not publish or change the OpenAI connection.
2. Publish the exact standalone files at the root of a public extension repository, or attach the verified root-layout ZIP to its GitHub release. Keep core as the maintained source; do not independently edit the published copy.
3. Verify a fresh `gemini extensions install <public-repository-url>`, the installed version/skill/MCP connection, local evidence, update/reinstall, and removal from that public source. Update candidate wording and installation instructions using the verified URL.
4. Deploy the coordinated guide and article from their reviewed site commit. Check the live guide/article, redirects, canonical URLs, sitemap, and shared documentation navigation.
5. Add the `gemini-cli-extension` GitHub topic when gallery publication is authorized. Verify the gallery entry independently after its crawler runs; a topic or successful installation alone does not establish indexing.

An MCP server release is unnecessary for this extension-only change. If a future update changes the pinned MCP version, publish and verify that npm version first, then follow the existing MCP ecosystem release contract separately. Keep previous immutable extension releases available for explicit rollback.

External standards: [Gemini extension reference](https://geminicli.com/docs/extensions/reference/), [release and gallery guide](https://geminicli.com/docs/extensions/releasing/), and [skill precedence](https://geminicli.com/docs/cli/skills/), checked 2026-09-25.
