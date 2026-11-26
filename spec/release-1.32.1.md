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

1. Publish reviewed source commits and require successful exact-source CI for each release.
2. Publish canonical core `v1.32.1` and site `v1.13.1` through their existing workflows
   after their respective source checks pass. The independent site publication may
   finish while core CI runs; the combined deployment waits for both releases.
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

### Qualified sources and canonical releases

- Core `66e8a15e6f1f54ef610a29e9063d94aa38428949` passes
  [source CI](https://github.com/debugbundle/debugbundle/actions/runs/45882032809),
  including all 146 coverage shards, and
  [CLI runtime compatibility](https://github.com/debugbundle/debugbundle/actions/runs/45882032744)
  on Node 22, 24, 26.0.0, 26.2.0 and latest 26.
  The [canonical release workflow](https://github.com/debugbundle/debugbundle/actions/runs/45889425205)
  passes and publishes [v1.32.1](https://github.com/debugbundle/debugbundle/releases/tag/v1.32.1)
  at that exact commit, independently verified by tag readback.
- Site `f0a88e4b1958a07236e33208f57667c1e9fc30e5` passes
  [source CI](https://github.com/debugbundle/site/actions/runs/45878659541) and
  [release](https://github.com/debugbundle/site/actions/runs/45882039030).
  Published [v1.13.1](https://github.com/debugbundle/site/releases/tag/v1.13.1)
  resolves to that exact commit. Local qualification also includes 137 site
  tests, static export, typecheck and installed Browser SDK privacy/delivery checks.

### Hosted rollout and independent readback

The [combined deployment](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45890994946)
passes from trusted cloud source `f9284e357ea1af6668cadb13f444e5f44b633860`,
using the two immutable release commits above. Migration validation reports
`applied=0; already_applied=97`. The workflow verifies worker activation,
publishes both frontend exports, completes CloudFront invalidations and verifies
real HTTP 404 responses for missing pages/assets with GET and HEAD.

- Active release: `20261126203056-e456b9df6cc9`.
- Active API and worker immutable image digest:
  `sha256:b91c9db0b18ebf3379f41542d8c334d585541c1943cb9586afc8f11da84df048`.
- Previous stable release: `20261125172652-f29b359385df`, retaining API and worker
  images at `sha256:b4de06110940e496f7b6551b2b94ddcec1262f9bd1b8f4396e1ce035b17c2e4e`.
- Independent on-host inspection confirms exactly those two releases, both
  compatible image pairs, root version 1.32.1 and installed Node SDK 3.3.0 in
  healthy API/worker containers with zero restarts and no OOM kills. Active image
  revision labels match the core source; both rollback sides retain
  `capture-rules-v2`. Worker readiness reports active `postgres-v1` processing.
- All 62 selected protected credentials/settings match the previous release;
  merge and capture-rule-v2 write activation remain enabled. Root disk usage is
  23%, with 46,478,544 KiB available at readback.
- Public API/MCP `/ready` return `ready`; dashboard and site return HTTP 200.
  Dashboard `/version.json` identifies the exact core release SHA. Its served
  `/assets/index-CGNlZ8o3.js` and the site's
  `/_next/static/chunks/2sihbq-k7fo1p.js` contain Browser SDK 3.3.0 and no 3.2.4
  version literal. All 16 referenced same-origin site scripts were fetched
  successfully. Public reference data reports core 1.32.1.
- CLI doctor is healthy. Existing API-ready, site-homepage and app-login monitors
  are passing with HTTP 200 and no consecutive failures. Scoped readback remains
  3 open, 2 regressed and 94 resolved; the exact hero-image threshold is enabled
  with zero natural matches at verification. No further lifecycle mutation or
  synthetic production event was performed.

The optional scoped GitHub repository read returns
`404:installation_not_found`. This is recorded as an integration verification
limitation; no GitHub installation or configuration was changed. Browser/device,
provider and customer-journey acceptance remain separate from these release checks.

### Inherited qualification repair

The final follow-up CI from 25 November failed on two stale bookkeeping checks:
the current agent ledger table still listed the previous plugin versions, and
the Rust release test fixture still expected 1.0.2. Both failures were reproduced
locally. The ledger now matches the unchanged published manifests and MCP pins;
the fixture now explicitly expects the published 1.1.1 crate. Independent
crates.io metadata, index and archive readback agree on SHA-256
`cd4d5c7bf6e6fb2dfff0059723b96b477efc2218ba06b83d6d2b797b9800c631`.
No production logic, registry-check enforcement or assertion is weakened.
