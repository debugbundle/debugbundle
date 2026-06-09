---
name: debugbundle
description: Use DebugBundle MCP and CLI workflows to investigate incidents, fetch bundles, run verification, and guide fixes.
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

Use this skill when a user asks you to investigate a bug, production incident, runtime failure, DebugBundle bundle, probe, alert, webhook, or project setup.

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
2. For bug reports, check incidents before inspecting code. Start with `list_incidents`, then fetch `get_incident_context` or `get_bundle`.
3. Use reproduction artifacts when available before proposing a fix.
4. For live debugging, use `activate_probe` only when the user asks for additional runtime evidence or the current bundle lacks enough context. Prefer short TTLs and scoped labels.
5. After a fix is verified, resolve the incident with `resolve_incident`. Also resolve intentional verification incidents after they have served their purpose.
6. For repeated low-value operational noise, inspect the incident evidence first, then evaluate capture-rule suggestions or path-scoped capture policy instead of repeatedly resolving the same pattern.

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

## Safety

Never print member tokens, project tokens, authorization headers, cookies, webhook secrets, or raw sensitive payloads. Do not use project tokens for retrieval or management operations; project tokens are for SDK ingestion only. Use member tokens for CLI, API, and MCP management workflows.
