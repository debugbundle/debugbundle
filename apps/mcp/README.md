# @debugbundle/mcp

MCP server for production debugging bundles, AnalyticsBundles, and incident workflows for AI agents. DebugBundle lets agents inspect incidents, deterministic bundles, product-usage evidence, reproductions, probes, hosted health checks, alerts, webhooks, projects, and setup state through the same management surface as the API and CLI.

## Install

Run the stdio server directly with npm:

```bash
npx @debugbundle/mcp
```

Or install globally:

```bash
npm install -g @debugbundle/mcp
debugbundle-mcp
```

Supported Node.js versions: 22.x through 26.x.

## MCP Client Config

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

Use `npx -y @debugbundle/mcp` in clients that require noninteractive package execution.

## Install Matrix

| Environment | Recommended path | Notes |
| --- | --- | --- |
| Generic local MCP client | `npx @debugbundle/mcp` | stdio transport |
| Claude Desktop local MCP | local MCP server config | uses local machine auth/config |
| Cursor | MCP config with `npx @debugbundle/mcp` | stdio transport |
| VS Code / GitHub MCP Registry | `com.debugbundle/mcp` | official registry metadata |
| OpenClaw / ClawHub | DebugBundle skill plus MCP config | use the published skill for workflow guidance |
| CI/headless agents | `DEBUGBUNDLE_MEMBER_TOKEN` | never use a project token |
| Self-hosted DebugBundle | `DEBUGBUNDLE_API_URL` plus member auth | points the server at your API base URL |

DebugBundle does not expose a hosted remote MCP endpoint today; this package is the local stdio path.

## Authentication

| Mode | Use | Notes |
| --- | --- | --- |
| CLI auth state | Local developer machines | Reuses `~/.debugbundle/auth.json` when available. |
| `DEBUGBUNDLE_MEMBER_TOKEN` | Headless or marketplace-managed clients | Member tokens are for CLI/API/MCP read and management operations. |
| Per-tool `bearerToken` | Explicit advanced automation | Overrides default auth for that call only. |
| Project token | SDK ingestion only | Do not use project tokens for MCP retrieval or management. |

## What Agents Can Do

- List active incidents and fetch full incident context.
- Fetch deterministic debug bundles and reproduction artifacts.
- Query aggregate usage, routes, device/browser/OS/language segments, referrers, actions, funnels, and journey patterns without waiting for an analysis artifact through `get_usage_summary`, `get_route_metrics`, `get_device_breakdown`, `get_action_metrics`, `get_funnel_analysis`, and related reads.
- Inspect retained redacted journey samples, analytics opportunities, and generated AnalyticsBundles; request a bounded analysis artifact when aggregate metrics alone are insufficient.
- Read analytics settings before proposing privacy, retention, consent, capture, or approved custom-dimension changes; update them only with explicit owner/admin intent.
- List saved analytics funnels and, with owner/admin access, create, update, or archive reusable funnel definitions through `list_saved_analytics_funnels`, `create_saved_analytics_funnel`, `update_saved_analytics_funnel`, and `archive_saved_analytics_funnel`.
- Inspect hosted health checks, probes, alerts, webhooks, projects, members, billing, capture policy, and GitHub automation state.
- Run local and hosted verification through tools such as `verify_local`, `verify_cloud`, `doctor`, `smoke`, and `analyze`.
- Resolve or reopen incidents after verification.

For analytics questions, use direct aggregate tools first and generate an AnalyticsBundle only when a bounded analysis needs a durable artifact. The product does not create one bundle per visit.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Node.js launch failure | Use Node.js 22.x through 26.x. Configure the client to use a supported `node` or `npx` runtime. |
| Missing local auth | Run `debugbundle login`, or set `DEBUGBUNDLE_MEMBER_TOKEN` for headless and managed clients. |
| Invalid token | Use a `dbundle_mem_` member token. Project tokens are SDK ingestion-only credentials. |
| Wrong API host | Leave `DEBUGBUNDLE_API_URL` unset for DebugBundle Cloud; set it only for self-hosted or non-default API hosts. |
| Local repo not initialized | Run `debugbundle setup` before local-only diagnostics, local bundle analysis, or generated project-skill workflows. |

## Links

- Docs: https://debugbundle.com/docs/mcp
- Agent workflows: https://debugbundle.com/docs/agent-workflows
- LLM index: https://debugbundle.com/llms.txt
- MCP tool schema: https://debugbundle.com/schemas/mcp-tools.json
- Official MCP Registry metadata: https://github.com/debugbundle/debugbundle/blob/main/apps/mcp/server.json

## Security And Trust

- Official MCP Registry name: `com.debugbundle/mcp`.
- Official npm package: `@debugbundle/mcp`.
- Source repository: https://github.com/debugbundle/debugbundle/tree/main/apps/mcp
- License: AGPL-3.0-only.
- The server uses stdio transport and local process credentials. It does not include hidden hosted management auth.
- Public examples must use placeholders only; never paste real member tokens, project tokens, webhook secrets, or customer configuration into marketplace listings.

## License

AGPL-3.0-only.
