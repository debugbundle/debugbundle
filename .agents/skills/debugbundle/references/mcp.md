# DebugBundle MCP Reference

Use the same incident-first workflow through MCP when an agent is operating in connected mode.

## Investigation Tools

- `doctor` — validate local profile, connection config, auth state, and setup health.
- `list_incidents` — list local, cloud, or connected combined incidents; pass `source`, `status`, `environment`, `service`, `severity`, `cursor`, and `limit` when needed.
- `get_incident` — fetch incident metadata by incident id.
- `get_incident_context` — fetch deterministic explanation context for triage.
- `get_bundle` — fetch the full debug bundle before proposing a fix.
- `get_reproduction` — fetch reproduction guidance before editing code.
- `resolve_incident` / `reopen_incident` — update lifecycle state after validation.
- `analyze` — run local agent-oriented analysis from local bundles and skill schemas.

- Prefer bundle retrieval tools before reading raw repository files.
- Use MCP bundle access when the current issue originated in production.
- Resolve fixed or intentionally generated incidents with `resolve_incident` so open incidents stay actionable.
- Fall back to local CLI processing when the project is local-only.

## Smoke-Test Cleanup Recipe

1. Call `list_incidents` with `status: "open"`.
2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.
3. Call `resolve_incident` for each verified synthetic incident.
4. Call `list_incidents` again and confirm the open queue only contains actionable failures.
