# @debugbundle/openclaw-plugin

OpenClaw tool plugin for DebugBundle incidents, bundles, reproductions, probes, health checks, and operational debugging.

## Install

```bash
openclaw plugins install clawhub:@debugbundle/openclaw-plugin
```

## Authentication

The plugin reuses the same auth precedence as the DebugBundle MCP server:

- Explicit `bearerToken` tool input when the user provides one.
- `DEBUGBUNDLE_MEMBER_TOKEN` in the OpenClaw plugin runtime environment.
- Existing DebugBundle CLI auth state from `debugbundle login`.

Use `DEBUGBUNDLE_API_URL` for self-hosted or non-production API hosts.

## Tools

The plugin exposes the DebugBundle MCP tool catalog with a `debugbundle_` prefix. For example:

- `debugbundle_list_incidents`
- `debugbundle_get_incident_context`
- `debugbundle_get_bundle`
- `debugbundle_get_reproduction`
- `debugbundle_resolve_incident`
- `debugbundle_activate_probe`
- `debugbundle_list_health_checks`

Mutation tools are marked optional in OpenClaw metadata and should be explicitly allowlisted by the operator before use.

## Documentation

Full DebugBundle MCP and agent workflow documentation: https://debugbundle.com/docs/mcp

## License

AGPL-3.0-only.
