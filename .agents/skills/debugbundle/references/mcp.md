# DebugBundle MCP Reference

Use the same runtime-evidence-gated workflow through MCP when an agent is operating in connected mode.

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
- Use MCP bundle access when the current issue originated in production or otherwise needs captured runtime evidence.
- For deterministic local source, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first unless the user asks for DebugBundle evidence.
- Resolve fixed or intentionally generated incidents with `resolve_incident` or `resolve_incidents` so active incidents stay actionable.
- Fall back to local CLI processing when the project is local-only.

## Noise and Capture Policy Tools

- `suggest_capture_rules_from_incident` — generate deterministic capture-rule suggestions from an incident bundle.
- `create_capture_rule_from_incident_suggestion` — apply a confirmed suggestion.
- `list_capture_rules`, `create_capture_rule`, `update_capture_rule`, `delete_capture_rule` — manage project capture rules.
- `get_capture_policy`, `update_capture_policy` — review or update capture policy, including path-scoped client-error incident rules.

Use these tools for repeated low-value operational noise only after inspecting incident evidence. Keep frontend suppression scoped by structured browser and client signals, and use path-scoped capture policy for known 4xx routes.

## Probe Tools

- `activate_probe` — activate a remote probe pattern with optional service/environment scope and TTL.
- `list_active_probes` — list active probe activations for a project.
- `deactivate_probe` — deactivate one active probe.

Use probes for targeted evidence gathering when incident bundles do not contain enough runtime context.

## Notification Tools

- `list_alerts`, `create_alert`, `update_alert`, `delete_alert` — manage incident alert rules.
- `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook` — manage signed webhook destinations.
- `test_webhook`, `list_webhook_deliveries` — validate webhook delivery and inspect delivery history.

Use these tools when the reported problem is missing, duplicate, delayed, disabled, or failed notification delivery.

## Availability Check Tools

- `list_health_checks` — list hosted health checks and plan limits for a project.
- `get_health_check` — fetch one hosted health check by id.
- `test_health_check` — run a side-effect-free target test without opening incidents or writing retained history.
- `create_health_check`, `update_health_check`, `delete_health_check` — manage saved hosted health checks when the user explicitly asks to change monitoring.
- `list_health_check_results` — inspect recent raw executions for one check.
- `list_health_check_daily_rollups` — inspect retained per-day status history for one check.

Use these tools for endpoint downtime, public reachability, and project Health tab issues. Start with list/results/rollups, use `test_health_check` before saving target changes, and inspect the linked normal incident bundle when failures crossed the configured threshold.

## Documentation URLs

- MCP overview: `https://debugbundle.com/docs/mcp`
- MCP workflows: `https://debugbundle.com/docs/mcp/workflows`
- MCP tools: `https://debugbundle.com/docs/mcp/tools`
- Availability checks: `https://debugbundle.com/docs/availability-checks`
- Probes: `https://debugbundle.com/docs/probes`
- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`
- Managing noise: `https://debugbundle.com/docs/managing-noise`
- Alerts: `https://debugbundle.com/docs/alerts`
- Webhooks: `https://debugbundle.com/docs/webhooks`
- API ingestion: `https://debugbundle.com/docs/api/ingestion`

## Smoke-Test Cleanup Recipe

1. Call `list_incidents` with `status: "active"`.
2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.
3. Call `resolve_incidents` for verified synthetic incidents, or `resolve_incident` for a single incident.
4. Call `list_incidents` again and confirm the needs-attention queue only contains actionable failures.
