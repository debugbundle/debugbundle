# @debugbundle/mcp

Model Context Protocol server for DebugBundle.

## Install

Run directly with npm:

```bash
npx @debugbundle/mcp
```

Or install globally:

```bash
npm install -g @debugbundle/mcp
debugbundle-mcp
```

## MCP Client Configuration

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

The server uses stdio transport and exposes the same DebugBundle incident, bundle, webhook, alert, token, project, member, billing, GitHub, probe, and diagnostic tools documented at https://debugbundle.com/docs/mcp.

## Authentication

Local use reuses CLI auth state from `~/.debugbundle/auth.json` when available. Headless clients can pass `bearerToken` in tool arguments.

## License

AGPL-3.0-only.
