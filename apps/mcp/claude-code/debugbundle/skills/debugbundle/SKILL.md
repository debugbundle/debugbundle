---
name: debugbundle
description: Use DebugBundle MCP tools in Claude Code when production incidents, runtime failures, deterministic debug bundles, reproductions, health checks, probes, alerts, webhooks, or verification evidence are relevant.
---

# DebugBundle

Use this skill for production or runtime debugging workflows where DebugBundle evidence can help: incidents, deterministic bundles, reproduction artifacts, hosted health checks, probes, alerts, webhooks, project state, capture policy, GitHub automation, and verification.

Do not use this skill for deterministic source-only edits, layout work, copy changes, or test-only failures unless the user asks for DebugBundle evidence.

## Credentials

- Prefer local CLI auth state from `debugbundle login` on developer machines.
- Use a DebugBundle member token for Claude Code plugin, headless, or managed MCP workflows.
- Project tokens are SDK write-only ingestion credentials. Do not use them for MCP retrieval or management.
- Do not print credential values, signing material, or raw sensitive payloads.

## Workflow

1. Confirm the MCP server is connected in `/mcp` if DebugBundle tools are unavailable.
2. Start with `doctor`, `list_projects`, `list_incidents`, or `list_health_checks` depending on the user's goal.
3. Fetch focused evidence with `get_incident_context`, `get_bundle`, `get_reproduction`, or hosted health-check result tools.
4. Use the bundle and reproduction artifacts to guide code changes, configuration changes, or operational recommendations.
5. Run `verify_local`, `verify_cloud`, `smoke`, or project-specific tests before resolving incidents or claiming a fix.
6. Resolve, reopen, or update operational surfaces only when the user intent is clear and the evidence supports the action.

If a repository-local DebugBundle skill or instructions file exists, treat it as project-specific documentation from the current workspace. Review it before applying project-specific paths or validation recipes, and keep the credential rules above in force.
