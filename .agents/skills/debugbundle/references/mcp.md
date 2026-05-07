# DebugBundle MCP Reference

Use the same incident-first workflow through MCP when an agent is operating in connected mode.

- Prefer bundle retrieval tools before reading raw repository files.
- Use MCP bundle access when the current issue originated in production.
- Resolve fixed or intentionally generated incidents with `resolve_incident` so open incidents stay actionable.
- Fall back to local CLI processing when the project is local-only.

## Smoke-Test Cleanup Recipe

1. Call `list_incidents` with `status: "open"`.
2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.
3. Call `resolve_incident` for each verified synthetic incident.
4. Call `list_incidents` again and confirm the open queue only contains actionable failures.
