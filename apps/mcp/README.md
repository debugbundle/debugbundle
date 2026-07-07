# @debugbundle/mcp

MCP server for production debugging bundles and incident workflows for AI agents. DebugBundle lets agents inspect incidents, deterministic bundles, reproductions, probes, hosted health checks, alerts, webhooks, projects, and setup state through the same management surface as the API and CLI.

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
| Claude Code plugin | `/plugin marketplace add debugbundle/debugbundle` | installs bundled MCP config and DebugBundle skill |
| Cursor | MCP config with `npx @debugbundle/mcp` | stdio transport |
| VS Code / GitHub MCP Registry | `com.debugbundle/mcp` | official registry metadata |
| OpenClaw / ClawHub | DebugBundle skill plus MCP config | use the published skill for workflow guidance |
| CI/headless agents | `DEBUGBUNDLE_MEMBER_TOKEN` | never use a project token |
| Self-hosted DebugBundle | `DEBUGBUNDLE_API_URL` plus member auth | points the server at your API base URL |

DebugBundle does not expose a hosted remote MCP endpoint today; this package is the local stdio path.

## Claude Desktop

In Claude Desktop, open Settings > Developer, edit the local MCP config, and add:

```json
{
  "mcpServers": {
    "debugbundle": {
      "command": "npx",
      "args": ["-y", "@debugbundle/mcp"]
    }
  }
}
```

Run `debugbundle login` first to reuse local CLI auth state, or add `DEBUGBUNDLE_MEMBER_TOKEN` to the server environment for managed/headless use. Set `DEBUGBUNDLE_API_URL` only for self-hosted or non-default API hosts.

## Claude Code Plugin

Claude Code users can add DebugBundle's first-party marketplace from this repository:

```text
/plugin marketplace add debugbundle/debugbundle
/plugin install debugbundle@debugbundle
```

The plugin package lives at `apps/mcp/claude-code/debugbundle`, bundles a Claude Code skill, and starts the MCP server with the current published `@debugbundle/mcp` version. It is also structured for Claude community marketplace review; do not describe it as listed in `claude-community` until Anthropic accepts and publishes it.

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
- Inspect hosted health checks, probes, alerts, webhooks, projects, members, billing, capture policy, and GitHub automation state.
- Run local and hosted verification through tools such as `verify_local`, `verify_cloud`, `doctor`, `smoke`, and `analyze`.
- Resolve or reopen incidents after verification.

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
