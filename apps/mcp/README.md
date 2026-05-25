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

Supported Node.js versions: 22.x through 26.x.

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

The server uses stdio transport and exposes the same DebugBundle incident, incident-context, bundle, webhook, alert, token, project, member, billing, GitHub, probe, and diagnostic tools documented at https://debugbundle.com/docs/mcp. Hosted verification supports the active V1 proof path through `verify_cloud` with `trigger5xx: true` and the configured-client-error proof path with `trigger4xxStatus: 403`, incident triage can start with the one-call `get_incident_context` tool, and `doctor` accepts `privacy: true` to return the same deterministic redaction preview as `debugbundle doctor --privacy`.

## Authentication

Local use reuses CLI auth state from `~/.debugbundle/auth.json` when available. Headless clients can pass `bearerToken` in tool arguments.

## License

AGPL-3.0-only.
