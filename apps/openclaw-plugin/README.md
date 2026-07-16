# @debugbundle/openclaw-plugin

OpenClaw tool plugin for DebugBundle incidents, product analytics, bundles, reproductions, probes, health checks, and operational debugging.

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
- `debugbundle_get_usage_summary`
- `debugbundle_get_funnel_analysis`
- `debugbundle_list_analytics_journey_samples`
- `debugbundle_generate_analytics_bundle`
- `debugbundle_activate_probe`
- `debugbundle_list_health_checks`

For product-usage questions, start with aggregate reads such as `debugbundle_get_usage_summary`, then narrow to routes, actions, funnels, or bounded journey samples. Generate an analytics bundle only when a specific analysis question needs a durable artifact; DebugBundle does not create one per visit.

Mutation tools are marked optional in OpenClaw metadata and should be explicitly allowlisted by the operator before use. Analytics bundle generation, settings updates, and saved-funnel create/update/archive operations are mutations. Read the current analytics settings and funnel definitions first, explain the intended change, and proceed only when the user asks.

Use member authentication for analytics reads and management. Project tokens remain write-only SDK ingestion credentials. Keep analytics requests privacy-safe: do not request raw form values, raw click text, credentials, direct identifiers, or high-cardinality custom values.

## Documentation

Full DebugBundle MCP and agent workflow documentation:

- https://debugbundle.com/docs/mcp
- https://debugbundle.com/docs/mcp/workflows
- https://debugbundle.com/docs/analytics

## License

AGPL-3.0-only.
