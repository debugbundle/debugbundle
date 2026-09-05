# Hosted Remote MCP Connector Proposal

Status: split decision; official OpenAI profile approved, arbitrary hosted-client profile deferred
Owner: developer experience / platform
Created: 2026-06-25
Last reconciled: 2026-09-04

## Summary

DebugBundle currently ships a local stdio MCP server through `@debugbundle/mcp` and the official MCP Registry entry `com.debugbundle/mcp`. A hosted Remote MCP connector would let remote-agent environments connect to DebugBundle without running local `npx`, but it is a separate product and infrastructure slice rather than a marketplace metadata update.

Current decision: the official OpenAI Plugin v1 may implement one OAuth-first, read-only hosted profile at the permanent `https://mcp.debugbundle.com` origin. Arbitrary custom hosted clients and general marketplace distribution remain deferred and may later use a separately reviewed member-token profile. The official profile is not a transport wrapper around the broad stdio catalog.

The authoritative OpenAI requirements are `FR-MCP-04` through `FR-MCP-11`, `NFR-MCP-01` through `NFR-MCP-04`, `AC-MCP-03` through `AC-MCP-13`, `contracts/public-interfaces.md`, and the fixtures under `tests/fixtures/openai-plugin-v1/`. Where this older proposal conflicts, those source-of-truth contracts win.

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

For the official OpenAI plugin, this origin is permanent. `https://api.debugbundle.com/mcp` is not a fallback: MCP resource routes must be unreachable through the API host. A scheme/host/port change requires a new OpenAI plugin; a path-only change requires a reviewed plugin version.

## Auth Model

Custom hosted-client path (deferred, not the official OpenAI plugin):

- `Authorization: Bearer dbundle_mem_*` member tokens for custom Remote MCP clients.
- Existing member/project authorization checks for every tool call.
- No project-token acceptance for retrieval, management, billing, project, incident, bundle, webhook, alert, probe, health-check, or token-management tools.

The token-first decision applies only to a future custom hosted-client profile.

Official OpenAI path (approved contract; deployed for owner-approved Developer Mode validation):

- OAuth 2.1/OIDC with the exact issuer, resource, scopes, PKCE, RFC 9207, CIMD, client-authentication, UserInfo, lifecycle, and retention profile in `spec/auth-architecture.md`.
- Exactly twenty-three tools from `tests/fixtures/openai-plugin-v1/tool-contracts.json`.
- No member or project token in transport or tool arguments.
- No custom MCP UI in v1; only the owner-approved existing-app consent, reviewer, and Settings revocation surfaces are present.

## Tool Scope

The official OpenAI profile exposes only:

- `list_projects`, `list_services`;
- `list_incidents`, `get_incident`, `get_incident_context`, `get_bundle`, `get_reproduction`;
- `list_improvements`, `get_improvement`, `get_improvement_bundle`; and
- `get_usage_summary`, `get_route_metrics`, `get_journey_patterns`, `get_device_breakdown`, `get_referrer_metrics`, `get_action_metrics`, `list_funnel_metrics`, `get_funnel_analysis`, `get_incident_impact`; and
- `list_health_checks`, `get_health_check`, `list_health_check_results`, `list_health_check_daily_rollups`.

All are dedicated zero-mutation hosted reads. The nine analytics readers use a separate `debugbundle:analytics:read` scope; `get_incident_impact` also requires incident scope. They read aggregate ledgers only and exclude individual journey samples/sample IDs, custom dimensions, analytics opportunities, AnalyticsBundle records/generation, settings, and every mutation. `get_incident_context` requires incident and artifact scopes and excludes raw logs. Health-check outputs use sanitized display URLs. Missing or stale artifacts never enqueue regeneration.

A future custom hosted-client profile may propose a broader hosted-safe catalog, but it cannot silently inherit the OpenAI grant or plugin version.

Exclude local-only tools:

- Local event-store inspection.
- Local bundle filesystem reads.
- Repository filesystem access.
- Any tool that assumes the MCP server process is running inside the user's code checkout.
- Raw logs, individual analytics journey samples, analytics opportunities/bundles, custom dimensions, and every mutation in the official OpenAI profile.

Local-only diagnostics stay stdio-only. Existing stdio and OpenClaw retain the full current catalog and order.

## Runtime Requirements

- Keep shared domain readers in packages/API-owned services. The OpenAI catalog is an isolated projection; `apps/api` must never import `apps/mcp`.
- Preserve the existing MCP catalog as the source of truth for stdio and OpenClaw only.
- Validate every inbound request at the MCP transport boundary.
- Authorize every tool call against the authenticated member and project membership.
- Add hosted MCP rate limits separate from ingestion limits.
- OpenAI tool domain execution must not synchronously write audit/product state. Metadata-only request telemetry is outside the domain transaction.
- Log only operational metadata; never log bearer tokens, tool arguments containing secrets, raw bundle contents, webhook secrets, or customer payloads.
- Run in the existing API image/process on the current Lightsail host; do not add a service/container without a separately approved capacity decision.
- Use the database-aware MCP bulkhead, Redis fail-closed coordination, atomic two-host slot promotion, independently operated no-deploy MCP Caddy gate, monitoring, and capacity gates in `FR-MCP-09`, `NFR-MCP-01`, `NFR-MCP-03`, and `AC-MCP-10`.

## Schema And Deploy Safety

The official OpenAI OAuth profile uses the additive grant, authorization-code, refresh-family, and encrypted provider-artifact records frozen in `contracts/data-schemas.md`. The ordered forward migration, empty-schema bootstrap, migration catalog, and fail-closed runtime readiness dependency are implemented in local source. Production still must apply and verify the migration before either feature flag is enabled.

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
- Complete the independent OpenAI package, scan, review corpus, submission, publication, and discovery gates in `rules/release-governance.md`.

## Acceptance

- A remote MCP-compatible client can connect to DebugBundle without local `npx`.
- Tool behavior matches stdio MCP for hosted-safe operations.
- Local-only tools are unavailable through hosted MCP.
- Auth is member-scoped and tenant-isolated.
- Rate limits, audit logs, readiness checks, and operational logs are present.
- Public docs and listings do not claim hosted Remote MCP availability before launch.
- The official OpenAI evidence state reports production deployment, live-client validation, portal review, publication, and directory discovery independently. A deployed Developer Mode candidate must never be described as approved, published, or directory-discoverable before those later gates are proven.
