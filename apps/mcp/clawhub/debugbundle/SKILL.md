---
name: debugbundle
description: Use DebugBundle MCP and CLI workflows to investigate runtime errors/failures, fetch bundles, manage operational debugging surfaces, run verification, and guide fixes when captured operational evidence is relevant.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - node
    primaryEnv: DEBUGBUNDLE_MEMBER_TOKEN
    envVars:
      - name: DEBUGBUNDLE_MEMBER_TOKEN
        required: false
        description: Optional DebugBundle member token for hosted API and MCP operations.
      - name: DEBUGBUNDLE_API_URL
        required: false
        description: Optional DebugBundle API base URL for self-hosted or non-production environments.
    install:
      - kind: node
        package: "@debugbundle/mcp"
        bins:
          - debugbundle-mcp
    skillKey: debugbundle
    homepage: https://debugbundle.com/docs/mcp
---

# DebugBundle

Use this skill when a user asks you to investigate a production/customer-facing incident, runtime failure, endpoint downtime, DebugBundle incident, bundle, report, health check, probe, alert, webhook, improvement opportunity, GitHub dispatch automation, project access, billing capacity, or project setup.

For deterministic local source-code, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first. Do not check DebugBundle incidents unless the user asks, the issue involves live runtime behavior, or captured evidence is needed.

## Skill Scope

This is the portable ClawHub skill. It should not replace a repository's generated `.agents/skills/debugbundle/SKILL.md`; after `debugbundle setup`, read that local skill too because it contains project-specific profile paths, bundle locations, reproduction guidance, and validation recipes.

## Connection

Prefer the MCP server when the client exposes it. The standard stdio command is:

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

Hosted operations can authenticate through one of these paths:

- Existing CLI auth state in `~/.debugbundle/auth.json`.
- `DEBUGBUNDLE_MEMBER_TOKEN` in the MCP server environment.
- A per-tool `bearerToken` argument when explicitly supplied by the user.

Use `DEBUGBUNDLE_API_URL` only when the user is targeting self-hosted, staging, or another non-default API host.

## Operating Workflow

1. Run `doctor` first when setup, auth, connectivity, privacy, or local file state is uncertain.
2. For qualifying runtime/incident work, check incidents before inspecting code. Start with `list_incidents`, then fetch `get_incident_context` or `get_bundle`.
3. Use reproduction artifacts when available before proposing a fix.
4. For live debugging, use `activate_probe` only when the user asks for additional runtime evidence or the current bundle lacks enough context. Prefer short TTLs and scoped labels.
5. For endpoint downtime or Health tab issues, start with `list_health_checks`, inspect `list_health_check_results` and `list_health_check_daily_rollups`, and use `test_health_check` before creating or updating saved monitoring.
6. After a fix is verified, resolve the incident with `resolve_incident`. Also resolve intentional verification incidents after they have served their purpose.
7. For repeated low-value operational noise, inspect the incident evidence first, then evaluate capture-rule suggestions or path-scoped capture policy instead of repeatedly resolving the same pattern.
8. For recurring quality or performance work, inspect hosted improvement opportunities with `list_improvements`, fetch the improvement and bundle, then resolve, snooze, or reopen only after the user confirms the intended lifecycle change.

## Local Repository Setup

When a repository is not yet configured, guide the user through:

```bash
npx @debugbundle/cli setup
npx @debugbundle/cli doctor
npx @debugbundle/cli verify local
```

For hosted projects, use:

```bash
npx @debugbundle/cli verify cloud --trigger-5xx
```

After setup, read `.agents/skills/debugbundle/SKILL.md` and follow its project-local instructions.

## Hosted Health Checks

Hosted health checks are DebugBundle-run external `GET`/`HEAD` requests, not SDK events from the customer's app. Use them for public endpoint reachability and downtime investigations.

- Read with `list_health_checks`, `get_health_check`, `list_health_check_results`, and `list_health_check_daily_rollups`.
- Test target behavior with `test_health_check`; it is side-effect-free and does not open incidents or write retained history.
- Create, update, delete, enable, or disable checks only when the user explicitly asks to change monitoring.
- Avoid private, localhost, metadata-service, credentialed, or state-mutating targets.

## Operations Surfaces

The MCP server also exposes project, token, member, alert, Slack destination, webhook, weekly report, GitHub dispatch, billing, capture-policy, capture-rule, and improvement-settings tools. Treat these as management operations: read first, explain the intended change, and mutate only when the user explicitly asks.

Use GitHub dispatch tools for DebugBundle-managed repository automation, not general GitHub work. Use member tokens for management actions. Project tokens are write-only ingestion credentials and must never be used for retrieval, billing, project/member administration, GitHub automation, Slack, webhook, or MCP management operations.

## Safety

Never print member tokens, project tokens, authorization headers, cookies, webhook secrets, or raw sensitive payloads. Do not use project tokens for retrieval or management operations; project tokens are for SDK ingestion only. Use member tokens for CLI, API, and MCP management workflows.
