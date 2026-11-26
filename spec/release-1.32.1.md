# Core 1.32.1 and site 1.13.1

The owner authorised commits, pushes, canonical releases and production deployment
for DebugBundle's SDK adoption update on 26 November 2026. Core adopts Node and
Browser 3.3.0 in API/worker/dashboard capture; the site adopts Browser 3.3.0.
Agent guidance ownership and the project profile are refreshed. No public API,
wire schema, stored schema, credential or application input name changes.

The [adoption record](debugbundle-sdk-adoption-20261126.md) contains requirement
mapping, SDK applicability, local qualification and the separately applied exact
hero-image threshold/incident receipt.

## Distribution eligibility

| Distribution                                                                 | Decision | Version and reason                                                                                                                               |
| ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core / API / worker / dashboard                                              | Publish  | 1.32.0 → 1.32.1; installed SDK behaviour gains protocol-aware privacy and browser teardown evidence.                                             |
| Public site                                                                  | Publish  | 1.13.0 → 1.13.1; installed Browser SDK changes from 3.2.4 to 3.3.0.                                                                              |
| CLI                                                                          | Retain   | 1.30.0; no packaged command or generated-template change in this release. The existing host installation was upgraded to this published version. |
| Ordinary MCP / Official MCP Registry                                         | Retain   | 1.30.0; no tool or package change.                                                                                                               |
| Shared types / redaction                                                     | Retain   | 3.9.0 / 2.8.0; already published, unchanged code.                                                                                                |
| Node / Browser SDK                                                           | Retain   | 3.3.0; consume the existing verified registry artifacts.                                                                                         |
| PHP / Python / Go / Rust / Ruby                                              | Retain   | 2.2.0 / 3.1.0 / 3.2.0 / 1.1.1 / 2.2.1; unchanged SDK distributions.                                                                              |
| Java / .NET / Android / Swift                                                | Retain   | 3.2.0 / 2.2.0 / 3.2.0 / 3.2.0; unchanged SDK distributions.                                                                                      |
| React Native / WordPress                                                     | Retain   | 3.2.0 / 2.2.0; unchanged wrappers, bridges and bundled distributions.                                                                            |
| Codex / Claude Code / Gemini                                                 | Retain   | 1.9.1 / 1.25.1 / 1.8.1; no installed plugin/extension change.                                                                                    |
| ClawHub skill / OpenClaw plugin                                              | Retain   | 1.30.0; unchanged packaged guidance and tools.                                                                                                   |
| Smithery / OpenAI connection and candidate / GitHub Action / CocoaPods Trunk | Retain   | Existing distributions; no publication or submission is required.                                                                                |

## Release and rollback plan

1. Publish reviewed source commits and require successful exact-source core/site CI.
2. Publish canonical core `v1.32.1` and site `v1.13.1` through their existing workflows.
3. Dispatch `deploy-hosted-stack.yml` from trusted cloud `main`, with immutable
   product/site SHAs and `deploy_assets=true`. Preserve MCP routing, project merge
   activation and capture-rule-v2 write settings.
4. Keep the normal active-plus-one-previous stable image pair. Existing advanced
   capture rules require compatible API/worker images on both sides of rollback.
5. Verify the active images' root/SDK versions, labels, digests and health; public
   API/MCP readiness; exact dashboard build ID; and Browser 3.3.0 in served app/site
   assets. Read back the scoped incidents and hero-image rule without a canary.

No new schema migration is introduced. Existing migration-ledger/readiness gates
remain required. Other products, provider settings, access rules and commercial
actions remain outside this release.

## Receipts

Local qualification passed before release authorisation. Exact-source CI,
canonical release and hosted receipts will be recorded after verification.
