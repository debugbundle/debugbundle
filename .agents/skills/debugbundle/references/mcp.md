# DebugBundle MCP Reference

Use the same incident-first workflow through MCP when an agent is operating in connected mode.

## Investigation Tools

- `doctor` — validate local profile, connection config, auth state, and setup health.
- `list_incidents` — list local, cloud, or connected combined incidents; pass `source`, `status`, `environment`, `service`, `severity`, `cursor`, and `limit` when needed.
- `get_incident` — fetch incident metadata by incident id.
- `get_incident_context` — fetch deterministic explanation context for triage.
- `get_bundle` — fetch the full debug bundle before proposing a fix.
- `get_reproduction` — fetch reproduction guidance before editing code.
- `resolve_incident` / `resolve_incidents` / `reopen_incident` / `reopen_incidents` — update lifecycle state after validation.
- `analyze` — run local agent-oriented analysis from local bundles and skill schemas.

- Prefer bundle retrieval tools before reading raw repository files.
- Use MCP bundle access when the current issue originated in production.
- Resolve fixed or intentionally generated incidents with `resolve_incident` or `resolve_incidents` so open incidents stay actionable.
- Fall back to local CLI processing when the project is local-only.

## Noise and Capture Policy Tools

- `suggest_capture_rules_from_incident` — generate deterministic capture-rule suggestions from an incident bundle.
- `create_capture_rule_from_incident_suggestion` — apply a confirmed suggestion.
- `list_capture_rules`, `create_capture_rule`, `update_capture_rule`, `delete_capture_rule` — manage project capture rules.
- `get_capture_policy`, `update_capture_policy` — review or update capture policy, including path-scoped client-error incident rules.

Use these tools for repeated low-value operational noise only after inspecting incident evidence. Keep frontend suppression scoped by structured browser and client signals, and use path-scoped capture policy for known 4xx routes.

## Smoke-Test Cleanup Recipe

1. Call `list_incidents` with `status: "open"`.
2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.
3. Call `resolve_incidents` for verified synthetic incidents, or `resolve_incident` for a single incident.
4. Call `list_incidents` again and confirm the open queue only contains actionable failures.
