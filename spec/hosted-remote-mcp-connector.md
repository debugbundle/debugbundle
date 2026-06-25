# Hosted Remote MCP Connector Proposal

Status: proposal
Owner: developer experience / platform
Created: 2026-06-25

## Summary

DebugBundle currently ships a local stdio MCP server through `@debugbundle/mcp` and the official MCP Registry entry `com.debugbundle/mcp`. A hosted Remote MCP connector would let remote-agent environments connect to DebugBundle without running local `npx`, but it is a separate product and infrastructure slice rather than a marketplace metadata update.

## Goals

- Provide a public Remote MCP endpoint for hosted and remote-agent clients.
- Preserve API/CLI/MCP parity by delegating hosted MCP tools to the same domain services and tool catalog as the stdio MCP package.
- Keep tenant isolation, token-scope separation, auditability, rate limits, and logging explicit.
- Support marketplace connector submissions only after the hosted endpoint is production-ready.

## Non-Goals

- Do not replace the local stdio package.
- Do not expose local-only repository filesystem tools through hosted MCP.
- Do not accept project tokens for MCP retrieval or management.
- Do not publish a remote connector URL before auth, authorization, rate limits, readiness, and docs are implemented.

## Recommended Endpoint

Prefer:

```text
https://mcp.debugbundle.com
```

Fallback if simpler operationally:

```text
https://api.debugbundle.com/mcp
```

The dedicated hostname is easier to document, monitor, and submit to connector marketplaces.

## Auth Model

Initial acceptable path:

- `Authorization: Bearer dbundle_mem_*` member tokens for custom Remote MCP clients.
- Existing member/project authorization checks for every tool call.
- No project-token acceptance for retrieval, management, billing, project, incident, bundle, webhook, alert, probe, health-check, or token-management tools.

Preferred later path:

- OAuth for marketplace-managed multi-user clients.
- Per-connector scopes if the Remote MCP ecosystem standardizes a stable scope model.

## Tool Scope

Expose hosted-safe tools only:

- Incident listing, context, bundle, reproduction, resolve, and reopen.
- Hosted health checks, probes, alerts, webhooks, weekly reports, projects, members, billing, capture policy, capture rules, improvements, services, GitHub automation, and setup diagnostics.

Exclude local-only tools:

- Local event-store inspection.
- Local bundle filesystem reads.
- Repository filesystem access.
- Any tool that assumes the MCP server process is running inside the user's code checkout.

## Runtime Requirements

- Use the existing MCP tool catalog as the source of truth.
- Add a transport adapter only; do not fork business logic.
- Validate every inbound request at the MCP transport boundary.
- Authorize every tool call against the authenticated member and project membership.
- Add hosted MCP rate limits separate from ingestion limits.
- Treat mutation tools like API/CLI management actions for audit logging.
- Log only operational metadata; never log bearer tokens, tool arguments containing secrets, raw bundle contents, webhook secrets, or customer payloads.
- Expose readiness and liveness checks if this is a separately deployed service.

## Schema And Deploy Safety

Avoid database changes for the first slice if possible by reusing existing auth, audit, and rate-limit infrastructure.

If persistent hosted-MCP sessions, connector grants, OAuth clients, or dedicated rate-limit ledgers require schema changes:

- Ship ordered forward migrations.
- Make readiness fail closed when required migrations are missing.
- Run migrations before new hosted MCP code receives traffic.
- Use expand/contract discipline for any later cleanup.

## Documentation Requirements

Before public launch:

- Add Remote MCP setup docs with endpoint, auth, and supported clients.
- Update `/docs/mcp/distribution` to list the hosted endpoint as live.
- Update `apps/mcp/server.json` only if the active MCP Registry schema supports remote metadata for the chosen transport.
- Update marketplace listings to distinguish local stdio from hosted Remote MCP.
- Add security notes explaining that hosted MCP cannot access local repository files or local-only bundles.

## Acceptance

- A remote MCP-compatible client can connect to DebugBundle without local `npx`.
- Tool behavior matches stdio MCP for hosted-safe operations.
- Local-only tools are unavailable through hosted MCP.
- Auth is member-scoped and tenant-isolated.
- Rate limits, audit logs, readiness checks, and operational logs are present.
- Public docs and listings do not claim hosted Remote MCP availability before launch.
