# @debugbundle/mcp

MCP server for runtime error reporting, crash reporting, incident response, endpoint health checks, debug bundles, and product analytics. DebugBundle lets agents inspect customer-facing incidents, deterministic bundles, product-usage evidence, reproductions, probes, alerts, webhooks, projects, and setup state through the same management surface as the API and CLI. It is production debugging infrastructure, not a generic infrastructure-monitoring or observability platform.

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

| Environment                   | Recommended path                                                           | Notes                                                |
| ----------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Generic local MCP client      | `npx @debugbundle/mcp`                                                     | stdio transport                                      |
| Claude Desktop local MCP      | local MCP server config                                                    | uses local machine auth/config                       |
| Claude Code plugin            | `/plugin marketplace add debugbundle/debugbundle`                          | installs bundled MCP config and DebugBundle skill    |
| Codex developer plugin        | `codex plugin add debugbundle-codex@debugbundle`                           | repository marketplace; local MCP and workflow skill |
| Codex direct MCP              | `codex mcp add debugbundle -- npx -y @debugbundle/mcp@1.12.1 --local-auth` | app, CLI, and IDE on the same host                   |
| Cursor                        | MCP config with `npx @debugbundle/mcp`                                     | stdio transport                                      |
| VS Code / GitHub MCP Registry | `com.debugbundle/mcp`                                                      | official registry metadata                           |
| OpenClaw / ClawHub            | DebugBundle skill plus MCP config                                          | use the published skill for workflow guidance        |
| CI/headless agents            | `DEBUGBUNDLE_MEMBER_TOKEN`                                                 | never use a project token                            |
| Self-hosted DebugBundle       | `DEBUGBUNDLE_API_URL` plus member auth                                     | points the server at your API base URL               |

This package is the supported public local stdio path. A separate OpenAI Plugin `1.0.0` source candidate targets an OAuth-protected read-only remote endpoint at `https://mcp.debugbundle.com/mcp`; it is not deployed, submitted, published, or publicly installable yet and does not alter this package's catalog or authentication.

## Local authentication profile

MCP 1.9.0 adds `npx @debugbundle/mcp --local-auth`. This opt-in profile removes `bearerToken` from tool schemas, rejects per-call credentials and unknown fields, and uses only the server's startup CLI/environment member authentication. Hosted tools that require a member token fail with `mcp_tool_error:auth_state_missing` before an API request when auth is absent; run `debugbundle login` on that host or configure the server environment and restart the connection. Local-only retrieval remains available without a token. The default invocation preserves the legacy schemas and explicit per-tool token precedence.

## Codex

Codex can use the existing stdio server independently of the hosted OpenAI plugin. See the [Codex developer package](../../plugins/debugbundle-codex/README.md) and [Codex setup guide](https://debugbundle.com/docs/mcp/codex/) for the repository marketplace, direct configuration, authentication, verification, and removal. The repository plugin must be released on the default branch before GitHub installation works; local checkout installation is available for candidate validation.

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

The plugin package lives at `apps/mcp/claude-code/debugbundle` and bundles a Claude Code skill. See the [Claude Code setup guide](https://debugbundle.com/docs/mcp/claude-code/) for the plugin's pinned MCP version, direct MCP configuration, authentication, verification, updates, and removal. It is also structured for Claude community marketplace review; do not describe it as listed in `claude-community` until Anthropic accepts and publishes it.

## Authentication

| Mode                       | Use                                     | Notes                                                             |
| -------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| CLI auth state             | Local developer machines                | Reuses `~/.debugbundle/auth.json` when available.                 |
| `DEBUGBUNDLE_MEMBER_TOKEN` | Headless or marketplace-managed clients | Member tokens are for CLI/API/MCP read and management operations. |
| Per-tool `bearerToken`     | Explicit advanced automation            | Overrides default auth for that call only.                        |
| Project token              | SDK ingestion only                      | Do not use project tokens for MCP retrieval or management.        |

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

The local semantic-analytics candidate adds `analytics_spaces_list`, `analytics_space_get`, `analytics_space_preview`, and `analytics_space_apply` to ordinary stdio/local-auth profiles. Apply requires an explicitly approved change, the matching preview hash, expected revision and idempotency key. Preview is read-only; it cannot grant authority. All-source access, owner management, audit and plan-downgrade rules remain API-owned. These tools are absent from the hosted OpenAI and restricted agent-read profiles. See [the control contract](../../contracts/analytics-semantic-control.md).

The candidate also adds `analytics_writers_list`, `analytics_writer_preview` and `analytics_writer_apply` to those ordinary profiles. List returns active project credential metadata only. Preview reviews a create/revoke without a write. Apply requires the matching `previewHash`, expected revision and idempotency key; project owner/admin authority is rechecked by the API. A newly issued server/relay writer secret appears once in the apply response, so keep that tool output private. A replay returns `secret_unavailable`. These tools are absent from the restricted agent-read and hosted OpenAI profiles, and the credential does not yet enable V2 ingestion.

The local project-owner identity namespace candidate adds `analytics_identity_namespace_get`, `analytics_identity_namespace_preview` and `analytics_identity_namespace_apply` to ordinary stdio/local-auth profiles over the same API client as the CLI. Preview is read-only; apply requires matching `previewHash`, expected revision and idempotency UUID. Inputs accept only a key fingerprint, never the HMAC key. The default API composition still returns `503`; restricted agent-read and hosted OpenAI profiles do not gain these tools. No identity-bearing V2 capture is enabled.

The local project declaration flow adds `analytics_plan_get`, `analytics_plan_validate`, `analytics_plan_preview` and `analytics_plan_apply` to ordinary stdio/local-auth profiles. They use the same owner/admin API as `analytics plan` CLI commands. Get returns the current catalog and prospective report definitions, plus bounded retained observation counts/dates for current catalog entry revisions and producers. Separate `producer_observations` rows include submitted SDK name/version, capped at 300 with an explicit truncation flag; old producer totals are not backfilled. These observations do not verify package authenticity or a business success boundary. Validate returns fixed issues without writing; preview shows the report diff, effective shared V1/V2 saved-report capacity and the resulting project-only `business_measurement_enabled` grant (false when omitted); apply requires the matching reviewed `previewHash`, expected revision and idempotency key. Current authority, catalog state and capacity are rechecked. The local `analytics_report_query` tool uses the same project ordered-funnel reader as API and CLI; it returns partial or unavailable quality with unverified source coverage and is disabled in default API composition. These tools are absent from restricted agent-read and hosted OpenAI profiles. V2 capture and complete growth reports remain unavailable.

The ordinary stdio/local-auth `analytics_space_plan_get`, `analytics_space_plan_validate`, `analytics_space_plan_preview` and `analytics_space_plan_apply` tools share the CLI/API space-plan service. Preview checks current all-source authority, membership and catalog revisions; apply requires its reviewed hash. Only zero-report space declarations can be saved. These tools are absent from restricted agent-read and hosted OpenAI profiles and do not activate space reports or capture.

The local `analytics_report_query` result exposes `failed_events` as a subset of unprojected `pending_events` for failed/skipped/missing worker jobs. It stays partial while source and rebuild quality are unverified; this metadata never includes raw event data.

The ordinary stdio/local-auth `analytics_job_retry` tool calls the same owner/admin event retry as API and CLI. It accepts only project and event UUIDs, returns queued metadata without raw input, and is absent from restricted agent-read and hosted OpenAI profiles. The default recovery service is disabled.

`analytics_report_query` accepts `report_key` with either `from` and `to` UTC timestamps or `last: "7d" | "30d" | "90d"`; the forms are exclusive. Relative boundaries come from PostgreSQL time. A window before the current definition's `available_from` returns an insufficient-history error rather than a partial-period count.

The local ordinary stdio/local-auth `analytics_erasure_status` tool reads one project task by `projectId` and `taskId` through the owner/admin API. The payload-free response does not reveal the erased subject. It is absent from restricted agent-read and hosted OpenAI profiles, and default API composition still returns `503 analytics_identity_unavailable`.

For analytics questions, use direct aggregate tools first and generate an AnalyticsBundle only when a bounded analysis needs a durable artifact. The product does not create one bundle per visit.

## Troubleshooting

| Symptom                    | Check                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Node.js launch failure     | Use Node.js 22.x through 26.x. Configure the client to use a supported `node` or `npx` runtime.                     |
| Missing local auth         | Run `debugbundle login`, or set `DEBUGBUNDLE_MEMBER_TOKEN` for headless and managed clients.                        |
| Invalid token              | Use a `dbundle_mem_` member token. Project tokens are SDK ingestion-only credentials.                               |
| Wrong API host             | Leave `DEBUGBUNDLE_API_URL` unset for DebugBundle Cloud; set it only for self-hosted or non-default API hosts.      |
| Local repo not initialized | Run `debugbundle setup` before local-only diagnostics, local bundle analysis, or generated project-skill workflows. |

## Links

- Docs: https://debugbundle.com/docs/mcp
- Agent workflows: https://debugbundle.com/docs/agent-workflows
- LLM index: https://debugbundle.com/llms.txt
- MCP tool schema: https://debugbundle.com/schemas/mcp-tools.json
- OpenAI Plugin candidate: https://debugbundle.com/docs/mcp/openai-plugin
- Official MCP Registry metadata: https://github.com/debugbundle/debugbundle/blob/main/apps/mcp/server.json

## Security And Trust

- Official MCP Registry name: `com.debugbundle/mcp`.
- Official npm package: `@debugbundle/mcp`.
- Source repository: https://github.com/debugbundle/debugbundle/tree/main/apps/mcp
- License: Apache-2.0.
- The server uses stdio transport and local process credentials. It does not include hidden hosted management auth.
- Public examples must use placeholders only; never paste real member tokens, project tokens, webhook secrets, or customer configuration into marketplace listings.

## License

Apache-2.0.
