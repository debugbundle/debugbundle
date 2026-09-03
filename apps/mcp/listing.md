# DebugBundle MCP Listing Packet

Canonical source-of-truth for MCP marketplace and directory submissions.

Last verified: 2026-08-30

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
- Claude Code marketplace metadata: `https://github.com/debugbundle/debugbundle/blob/main/.claude-plugin/marketplace.json`
- Claude Code plugin package: `https://github.com/debugbundle/debugbundle/tree/main/apps/mcp/claude-code/debugbundle`
- License: `AGPL-3.0-only`
- Security reporting: `https://github.com/debugbundle/debugbundle/security/policy`

## Publication Status

Current release status for MCP ecosystem distribution.

- npm: published as `@debugbundle/mcp` version `1.7.0`; `npm view` verification passed on 2026-08-30.
- Official MCP Registry: published and verified as `com.debugbundle/mcp` version `1.7.0`; exact registry API verification passed on 2026-08-30.
- Smithery MCP: release accepted for `debugbundle/debugbundle` version `1.6.2`, but public registry indexing is still incomplete; support follow-up is pending, and release verification must treat this as partial until marketplace search/indexing shows it.
- Smithery Skill: published and publicly indexed for `debugbundle/debugbundle`.
- ClawHub Skill: published as `debugbundle/debugbundle`.
- ClawHub OpenClaw plugin: published as `@debugbundle/openclaw-plugin` version `1.6.2`.
- Claude Code first-party marketplace: packaged in this repository as `debugbundle@debugbundle`; users can add it with `/plugin marketplace add debugbundle/debugbundle`.
- Claude community marketplace: package is ready for review, but not listed until Anthropic accepts it into `anthropics/claude-plugins-community`.
- MCP.so: listed as of 2026-06-23 via the web submit flow; treat it as a third-party community directory, not an official registry.
- Glama: listed as of 2026-06-26 at `https://glama.ai/mcp/servers/sz3bl40umr`.
- PulseMCP: auto-listed as official as of 2026-06-26 at `https://www.pulsemcp.com/servers/debugbundle`; command-line verification still requires `manual_check_required` because the site returns HTTP 403 to the release verifier.
- LobeHub MCP: submitted as a request; no confirmed public listing as of 2026-06-26.
- OpenAI Plugin: repository-local `1.0.0` source candidate only; not deployed, registered, submitted, approved, published, or directory-discoverable.

Do not describe a downstream directory as live, official, verified, or indexed until the public listing is searchable or the marketplace has explicitly confirmed it.

## Canonical Positioning

- Short description: `Runtime error reporting, incident response, debug bundles, and product analytics for AI agents.`
- Full description: `DebugBundle turns runtime errors, crashes, customer-facing incidents, endpoint health checks, and product-usage signals into deterministic evidence for AI agents. Agents can inspect incidents, debug bundles, reproductions, aggregate analytics, funnels, journeys, opportunities, probes, alerts, and operational controls through API, CLI, or MCP. DebugBundle is production debugging infrastructure, not a generic infrastructure-monitoring platform.`

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

- Claude Code first-party marketplace:

```text
/plugin marketplace add debugbundle/debugbundle
/plugin install debugbundle@debugbundle
```

- Auth guidance:
  - Prefer existing CLI auth state at `~/.debugbundle/auth.json` for local users.
  - Use `DEBUGBUNDLE_MEMBER_TOKEN` for headless or marketplace-managed clients.
  - Use `DEBUGBUNDLE_API_URL` only for self-hosted, staging, or other non-default API hosts.
  - Do not use project tokens for MCP management or retrieval operations.

## What The Server Exposes

- Incident listing, inspection, bundle retrieval, reproduction retrieval, context aggregation, resolve, and reopen tools.
- Aggregate product-usage, route, device, referrer, action, funnel, journey, incident-impact, analytics-opportunity, analytics-bundle, settings, and saved-funnel tools.
- Hosted health-check, probe, alert, webhook, token, project, member, billing, capture-policy, capture-rule, improvement, and GitHub automation tools.
- Local diagnostic tools such as `doctor`, `validate`, `verify_local`, `verify_cloud`, `smoke`, and `analyze`.

## Search Terms

- `debugbundle`
- `@debugbundle/mcp`
- `com.debugbundle/mcp`
- `production debugging bundles`
- `runtime error reporting`
- `crash reporting`
- `incident reporting`
- `incident response`
- `live app monitoring`
- `production monitoring`
- `runtime errors`
- `exceptions and alerts`
- `endpoint health checks`
- `incident debugging MCP`
- `AI agent debugging`
- `MCP production debugging`
- `product analytics MCP`
- `AI agent funnel analysis`
- `AnalyticsBundle`

## Marketplace Safety Copy

- Project tokens are SDK write-only ingestion credentials and must not be used for management, retrieval, billing, or MCP workflows.
- Member tokens are for CLI, API, and MCP read/manage operations.
- The public MCP package uses stdio transport. The separate OpenAI candidate uses a twenty-three-tool OAuth-protected read-only remote projection, including nine aggregate-only analytics readers, only after its production and review gates pass.
- Hosted and local management tools use the same underlying DebugBundle services as API and CLI.
- The Claude Code plugin bundles local stdio MCP config and a workflow skill; it does not grant hosted account access by itself.
- Report suspicious listings, leaked examples, or security concerns through `https://github.com/debugbundle/debugbundle/security/policy`.

## Suggested Categories

- `Developer Tools`
- `Observability`
- `Debugging`
- `Incident Response`

## Suggested Demo Calls

- `list_incidents`
- `get_incident_context`
- `get_bundle`
- `get_usage_summary`
- `get_funnel_analysis`
- `list_analytics_opportunities`
- `resolve_incident`
- `list_health_checks`

## Claude Code

- Current first-party marketplace state: repository-hosted marketplace catalog at `.claude-plugin/marketplace.json`, plugin package at `apps/mcp/claude-code/debugbundle`.
- User install path:

```text
/plugin marketplace add debugbundle/debugbundle
/plugin install debugbundle@debugbundle
```

- Plugin contents:
  - `.claude-plugin/plugin.json` metadata pinned to the current `@debugbundle/mcp` package version.
  - `.mcp.json` local stdio server config using `npx -y @debugbundle/mcp@<version>`.
  - `skills/debugbundle/SKILL.md` for Claude Code workflow routing.
  - `README.md` with install, auth, and community marketplace status.
- Claude community marketplace path:
  - Validate locally with `claude plugin validate apps/mcp/claude-code/debugbundle`.
  - Submit through Anthropic's plugin submission form.
  - After acceptance, users add `/plugin marketplace add anthropics/claude-plugins-community` and install `debugbundle@claude-community`.
- Do not claim `claude-community` availability until the plugin appears in the public community catalog.

## MCP.so

- Current state on 2026-06-26: listed at `https://mcp.so/server/debugbundle/debugbundle`.
- Positioning note: MCP.so is a third-party community MCP marketplace, not the official MCP Registry.
- Verification check: confirm the page still uses the `npx -y @debugbundle/mcp` install path and member-token auth guidance.
- Preferred listing target URL: `https://github.com/debugbundle/debugbundle`
- Keep the MCP-specific subfolder in the content/body: `https://github.com/debugbundle/debugbundle/tree/main/apps/mcp`
- Preferred display name: `DebugBundle`
- Preferred author/org label: `debugbundle`
- Preferred short description: `Runtime error reporting, incident response, debug bundles, and product analytics for AI agents.`
- Suggested tags:
  - `debugbundle`
  - `mcp`
  - `debugging`
  - `observability`
  - `incident-response`
  - `developer-tools`
  - `ai-agents`
  - `production`
- Submission notes:
  - Use the repository root as the main GitHub URL so the marketplace `Visit Server` action lands on the stable project homepage, README, license, and repo activity.
  - Put the `apps/mcp` subfolder URL in the long-form content so users can find the package-specific README and registry metadata quickly.
  - Use a member-token placeholder in public config examples such as `"<YOUR_OWN_DEBUGBUNDLE_MEMBER_TOKEN>"`.
  - Do not publish a real member token or any project token in the listing.

## Glama

- Current state on 2026-06-26: listed at `https://glama.ai/mcp/servers/sz3bl40umr`.
- Repo metadata: root `glama.json` is present for maintainer verification and repository claim.
- Submission path:
  - Sign in to Glama with GitHub.
  - Open `https://glama.ai/mcp/servers`.
  - Click `Add MCP Server`.
  - Submit repository URL: `https://github.com/debugbundle/debugbundle`
  - Display name: `DebugBundle`
  - Short description: `Runtime error reporting, incident response, debug bundles, and product analytics for AI agents.`
- Indexing expectations:
  - Glama verifies GitHub maintainer access before listing.
  - Discoverability can remain withheld until Glama can build and introspect the server successfully.
- Verification check: `https://glama.ai/api/mcp/v1/servers?query=debugbundle`
- Follow-up: claim the server entry if Glama still marks it as unclaimed.

## PulseMCP

- Current state on 2026-06-26: auto-listed as the official DebugBundle MCP server at `https://www.pulsemcp.com/servers/debugbundle`; automated ecosystem verification still requires manual confirmation because the page returns HTTP 403 to command-line fetches.
- Listing source: official MCP Registry metadata for `com.debugbundle/mcp`.
- Verification check: confirm the page still shows `com.debugbundle/mcp` and links to the DebugBundle repository/server metadata. The automated ecosystem verifier treats PulseMCP as `manual_check_required` when the public page returns HTTP 403 to command-line fetches.

## Docker MCP Catalog

- Current decision on 2026-06-25: do not target Docker MCP Catalog for now.
- Rationale: DebugBundle's supported public MCP path is the npm-backed local stdio package. A Docker listing should wait until there is a product-owned Docker MCP package with release automation and clean-install smoke coverage.

## LobeHub

- Current state on 2026-06-26: submitted as a request; no confirmed public `DebugBundle` MCP listing was found.
- Self-service path: authenticate the LobeHub market CLI, then submit the repository:

```bash
npx -y @lobehub/market-cli@0.0.38 register
npx -y @lobehub/market-cli@0.0.38 plugin submit https://github.com/debugbundle/debugbundle
```

- Current blocker observed on 2026-06-23: LobeHub rejected self-serve submission with `Repository owner "debugbundle" does not match your GitHub username "owenfar1". You can only submit your own repositories.`
- Implication: the current self-serve CLI path appears to support user-owned repositories only, not organization-owned repositories like `debugbundle/debugbundle`.
- Known fallback: if the web submit flow or CLI path is unavailable, file a marketplace issue against `lobehub/lobehub` with the canonical metadata above and note that the official MCP Registry entry already exists.
- Draft issue body: `apps/mcp/lobehub-submission-issue.md`
