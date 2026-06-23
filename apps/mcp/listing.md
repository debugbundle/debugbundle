# DebugBundle MCP Listing Packet

Canonical source-of-truth for MCP marketplace and directory submissions.

Last verified: 2026-06-23

## Primary Listing

- Product name: `DebugBundle`
- Official MCP Registry name: `com.debugbundle/mcp`
- npm package: `@debugbundle/mcp`
- Transport: `stdio`
- Public install command: `npx @debugbundle/mcp`
- Repository: `https://github.com/debugbundle/debugbundle`
- Repository subfolder: `apps/mcp`
- Docs: `https://debugbundle.com/docs/mcp`
- README: `https://github.com/debugbundle/debugbundle/tree/main/apps/mcp`
- Registry metadata: `https://github.com/debugbundle/debugbundle/blob/main/apps/mcp/server.json`
- License: `AGPL-3.0-only`

## Publication Status

Current release status for MCP ecosystem distribution.

- npm: published as `@debugbundle/mcp` version `1.6.0`.
- Official MCP Registry: published and verified as `com.debugbundle/mcp` version `1.6.0`.
- Smithery MCP: release accepted for `debugbundle/debugbundle`, but public registry indexing is still incomplete; treat this as pending until marketplace search/indexing shows it.
- Smithery Skill: published for `debugbundle/debugbundle`.
- ClawHub Skill: published as `debugbundle/debugbundle`.
- ClawHub OpenClaw plugin: published as `@debugbundle/openclaw-plugin` version `1.6.0`.
- Glama: not listed yet as of 2026-06-23.
- LobeHub MCP: not confirmed listed yet as of 2026-06-23.
- PulseMCP: pending auto-listing check.

Do not describe a downstream directory as live, official, verified, or indexed until the public listing is searchable or the marketplace has explicitly confirmed it.

## Canonical Positioning

- Short description: `Production debugging bundles for AI agents.`
- Full description: `DebugBundle turns production incidents into deterministic debug bundles for AI agents. Agents can inspect incidents, bundles, reproductions, probes, hosted health checks, alerts, webhooks, projects, and setup state through API, CLI, or MCP.`

## Install And Auth

- Local stdio install: `npx @debugbundle/mcp`
- Global install:

```bash
npm install -g @debugbundle/mcp
debugbundle-mcp
```

- Claude/Cursor-style config:

```json
{
  "mcpServers": {
    "debugbundle": {
      "command": "npx",
      "args": ["@debugbundle/mcp"]
    }
  }
}
```

- Auth guidance:
  - Prefer existing CLI auth state at `~/.debugbundle/auth.json` for local users.
  - Use `DEBUGBUNDLE_MEMBER_TOKEN` for headless or marketplace-managed clients.
  - Use `DEBUGBUNDLE_API_URL` only for self-hosted, staging, or other non-default API hosts.
  - Do not use project tokens for MCP management or retrieval operations.

## What The Server Exposes

- Incident listing, inspection, bundle retrieval, reproduction retrieval, context aggregation, resolve, and reopen tools.
- Hosted health-check, probe, alert, webhook, token, project, member, billing, capture-policy, capture-rule, improvement, and GitHub automation tools.
- Local diagnostic tools such as `doctor`, `validate`, `verify_local`, `verify_cloud`, `smoke`, and `analyze`.

## Search Terms

- `debugbundle`
- `@debugbundle/mcp`
- `com.debugbundle/mcp`
- `production debugging bundles`
- `incident debugging MCP`
- `AI agent debugging`
- `MCP production debugging`

## Marketplace Safety Copy

- Project tokens are SDK write-only ingestion credentials and must not be used for management, retrieval, billing, or MCP workflows.
- Member tokens are for CLI, API, and MCP read/manage operations.
- The MCP package uses stdio transport and does not expose a hosted remote MCP endpoint today.
- Hosted and local management tools use the same underlying DebugBundle services as API and CLI.

## Suggested Categories

- `Developer Tools`
- `Observability`
- `Debugging`
- `Incident Response`

## Suggested Demo Calls

- `list_incidents`
- `get_incident_context`
- `get_bundle`
- `resolve_incident`
- `list_health_checks`

## Glama

- Current state on 2026-06-23: `https://glama.ai/api/mcp/v1/servers?query=debugbundle` returned no matching server.
- Repo metadata: root `glama.json` is present for maintainer verification and repository claim.
- Submission path:
  - Sign in to Glama with GitHub.
  - Open `https://glama.ai/mcp/servers`.
  - Click `Add MCP Server`.
  - Submit repository URL: `https://github.com/debugbundle/debugbundle`
  - Display name: `DebugBundle`
  - Short description: `Production debugging bundles for AI agents.`
- Indexing expectations:
  - Glama verifies GitHub maintainer access before listing.
  - Discoverability can remain withheld until Glama can build and introspect the server successfully.
- Verification check after submit: `https://glama.ai/api/mcp/v1/servers?query=debugbundle`
- Follow-up after indexing: claim the server entry so it does not remain unclaimed with limited discoverability.

## LobeHub

- Current state on 2026-06-23: no confirmed public `DebugBundle` MCP listing was found.
- Self-service path: authenticate the LobeHub market CLI, then submit the repository:

```bash
npx -y @lobehub/market-cli@0.0.38 register
npx -y @lobehub/market-cli@0.0.38 plugin submit https://github.com/debugbundle/debugbundle
```

- Current blocker observed on 2026-06-23: LobeHub rejected self-serve submission with `Repository owner "debugbundle" does not match your GitHub username "owenfar1". You can only submit your own repositories.`
- Implication: the current self-serve CLI path appears to support user-owned repositories only, not organization-owned repositories like `debugbundle/debugbundle`.
- Known fallback: if the web submit flow or CLI path is unavailable, file a marketplace issue against `lobehub/lobehub` with the canonical metadata above and note that the official MCP Registry entry already exists.
- Draft issue body: `apps/mcp/lobehub-submission-issue.md`
