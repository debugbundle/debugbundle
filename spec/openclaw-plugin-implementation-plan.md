# OpenClaw Plugin Implementation Plan

## Purpose

DebugBundle must treat OpenClaw as a first-class agent automation surface. The existing portable skill teaches agents how to use DebugBundle; the OpenClaw plugin gives OpenClaw agents executable DebugBundle tools without relying on shell commands or prompt-only examples.

This plugin is not a marketplace wrapper. It is an agent interface that must follow the same production compatibility and parity standards as API, CLI, and MCP.

## Source-Of-Truth Requirements

- Interface parity remains mandatory: automation capabilities must stay available through API, CLI, MCP, and OpenClaw when OpenClaw support is shipped for that capability.
- The OpenClaw plugin must not implement separate business logic, validation rules, auth semantics, result shapes, or lifecycle behavior.
- The plugin must delegate to the existing MCP tool registry or a shared package extracted from it.
- Project tokens remain SDK write-only. OpenClaw management tools must use member-token auth through `DEBUGBUNDLE_MEMBER_TOKEN`, existing CLI auth state, or an explicitly supplied bearer token argument.
- Mutation tools must be opt-in in OpenClaw metadata and should add per-call approval hooks before public publish when OpenClaw approval APIs are stable enough for the target host version.

## Package Location

Use `apps/openclaw-plugin/`.

Published package name and ClawHub package:

```text
@debugbundle/openclaw-plugin
```

Install command:

```bash
openclaw plugins install clawhub:@debugbundle/openclaw-plugin
```

## Architecture

The efficient implementation path is a full-catalog bridge over the existing MCP surface:

1. Read `MCP_TOOL_CATALOG` and `MCP_TOOL_NAMES` from `apps/mcp/src/tool-catalog.ts`.
2. Convert each Zod input schema to JSON Schema and wrap it as a TypeBox unsafe schema for `defineToolPlugin`.
3. Prefix each exposed OpenClaw tool as `debugbundle_<mcp_tool_name>` to avoid collisions with OpenClaw core or other plugins.
4. Execute by calling `createDefaultMcpTools(...)` and invoking the mapped MCP handler.
5. Preserve existing MCP auth precedence: explicit `bearerToken`, `DEBUGBUNDLE_MEMBER_TOKEN`, CLI auth state, then local-only behavior where supported.

This gives OpenClaw complete MCP capability coverage while keeping MCP as the source of truth. If the bridge becomes too heavy for published artifacts, extract the MCP catalog and tool factory into a shared `packages/agent-tools` package and have both MCP and OpenClaw import that package.

## Tool Coverage

All current MCP tools should be exposed with a `debugbundle_` prefix: setup/verification, analysis, retrieval/lifecycle, improvements, health checks, probes, projects, services, tokens, members, billing, capture policy/rules, alerts, Slack, webhooks, weekly reports, and GitHub automation.

Read tools may be available by default. Mutating tools must be marked optional so operators explicitly allow them through OpenClaw `tools.allow` before a model can call them.

## Safety Model

- Never log or return member tokens, project tokens, auth headers, cookies, webhook secrets, or raw sensitive payloads.
- Do not add a config field that encourages storing a member token in plain plugin config unless OpenClaw SecretRef support is intentionally wired and tested.
- Prefer env/CLI auth state for credentials in V1.
- Mark mutation tools optional.
- Add per-call approval hooks for production-impacting actions before public publish.

## Release Pipeline

After `@debugbundle/mcp` npm publish succeeds, the local MCP ecosystem release pipeline must also handle the OpenClaw plugin:

1. Build `apps/openclaw-plugin`.
2. Validate generated plugin metadata:
   ```bash
   openclaw plugins build --entry ./dist/index.js --check
   openclaw plugins validate --root apps/openclaw-plugin --entry ./dist/index.js
   ```
3. Pack and smoke-test local install.
4. Validate ClawHub package:
   ```bash
   clawhub package validate ./apps/openclaw-plugin
   clawhub package publish ./apps/openclaw-plugin --dry-run
   ```
5. Publish only after validation and namespace confirmation:
   ```bash
   clawhub package publish ./apps/openclaw-plugin
   ```
6. Verify:
   ```bash
   clawhub package inspect @debugbundle/openclaw-plugin --files --json
   ```

## Acceptance

- OpenClaw tool names are a one-to-one prefixed mapping over `MCP_TOOL_NAMES`.
- OpenClaw tool descriptions and schemas are generated from the MCP catalog.
- Each OpenClaw tool delegates to the MCP handler with equivalent input and output semantics.
- Mutation tools are optional in generated metadata.
- Package metadata includes `openclaw.compat.pluginApi`, `openclaw.compat.minGatewayVersion`, `openclaw.build.openclawVersion`, `openclaw.build.pluginSdkVersion`, `openclaw.install.minHostVersion`, and `openclaw.extensions`.
- The release pipeline includes `clawhubPlugin` prepare/publish/verify steps.
- Published artifacts include `dist/`, `openclaw.plugin.json`, `package.json`, `README.md`, and `LICENSE`.

## Publish Gate

Do not publish the OpenClaw plugin until all of these are true:

- `pnpm --filter @debugbundle/openclaw-plugin build` passes.
- OpenClaw metadata validation passes.
- Local npm-pack install/inspect smoke passes.
- ClawHub package dry-run passes.
- Security review confirms no secret persistence or token-scope confusion.
- The package is published under the `@debugbundle` owner namespace.
