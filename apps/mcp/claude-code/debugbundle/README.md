# DebugBundle Claude Code Plugin

Production debugging bundles for AI agents. Connect Claude Code to DebugBundle MCP tools for incidents, deterministic bundles, reproductions, hosted health checks, probes, alerts, webhooks, projects, and verification workflows.

## Install

Add the first-party DebugBundle marketplace:

```text
/plugin marketplace add debugbundle/debugbundle
```

Install the plugin:

```text
/plugin install debugbundle@debugbundle
```

Then reload plugins if Claude Code does not connect the bundled MCP server immediately:

```text
/reload-plugins
```

The plugin ships a bundled MCP server definition that runs:

```bash
npx -y @debugbundle/mcp@1.6.2
```

## Authentication

Use one of these auth paths:

- Local developer machine: run `debugbundle login` first. The MCP server reuses local CLI auth state.
- Claude Code plugin config: set the optional `member_token` value when enabling the plugin.
- Self-hosted or non-default API host: set the optional `api_url` value when enabling the plugin.

Use member tokens for MCP read and management tools. Project tokens are SDK write-only ingestion credentials and are not valid for incident retrieval, bundle access, billing, project management, or other MCP workflows.

## Community Marketplace

This package is structured for Claude's community marketplace review. After Anthropic accepts it into `anthropics/claude-plugins-community`, users can add that marketplace and install from `@claude-community`.

## Links

- Docs: https://debugbundle.com/docs/mcp
- Distribution status: https://debugbundle.com/docs/mcp/distribution
- Source: https://github.com/debugbundle/debugbundle/tree/main/apps/mcp/claude-code/debugbundle
- Security policy: https://github.com/debugbundle/debugbundle/security/policy
