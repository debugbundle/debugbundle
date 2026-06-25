## Feature Description

Please list DebugBundle in the LobeHub MCP marketplace.

DebugBundle is a public MCP server for production debugging bundles and operational incident workflows for AI agents. It is already published in the official MCP Registry, but it is not yet confirmed in the current LobeHub MCP market results.

## Proposed Solution

Please ingest or list the official MCP Registry entry for `com.debugbundle/mcp`.

Canonical public metadata:

- Title: `DebugBundle`
- Official MCP Registry identifier: `com.debugbundle/mcp`
- Registry entry: `https://registry.modelcontextprotocol.io/v0.1/servers/com.debugbundle%2Fmcp/versions/latest`
- Website / docs: `https://debugbundle.com/docs/mcp`
- Repository: `https://github.com/debugbundle/debugbundle`
- Repository subfolder: `apps/mcp`
- npm package: `https://www.npmjs.com/package/@debugbundle/mcp`
- Public install command: `npx @debugbundle/mcp`
- Transport: `stdio`
- License: `AGPL-3.0-only`

What it does:

- Lists, inspects, resolves, and reopens incidents.
- Fetches incident context, deterministic debug bundles, and reproduction artifacts.
- Manages hosted health checks, probes, alerts, webhooks, tokens, projects, members, billing, capture policy, capture rules, improvement settings, and GitHub automation.
- Reuses the same DebugBundle domain services as API and CLI.

Auth guidance:

- Local users can reuse DebugBundle CLI auth state from `~/.debugbundle/auth.json`.
- Headless or marketplace-managed clients can set `DEBUGBUNDLE_MEMBER_TOKEN`.
- `DEBUGBUNDLE_API_URL` is optional for self-hosted or non-default API environments.
- Project tokens are write-only SDK ingestion credentials and must not be used for MCP management or retrieval operations.

## Additional Information

Validation done on 2026-06-25:

- The official MCP Registry entry is active for `com.debugbundle/mcp` version `1.6.1`.
- `@debugbundle/mcp` version `1.6.1` is already published.
- The Smithery MCP release has been accepted for version `1.6.1`, with public indexing still pending.
- The Smithery Skill, ClawHub Skill, and ClawHub OpenClaw plugin entries are already published.
- Glama lists DebugBundle at `https://glama.ai/mcp/servers/sz3bl40umr`.
- MCP.so lists DebugBundle at `https://mcp.so/server/debugbundle/debugbundle`.
- PulseMCP auto-lists DebugBundle from the official registry at `https://www.pulsemcp.com/servers/debugbundle`, but command-line release verification requires manual confirmation because the site returns HTTP 403 to the verifier.
- The current public LobeHub CLI exposes `plugin submit <gitUrl>` for MCP plugins, but self-serve submission failed with: `Repository owner "debugbundle" does not match your GitHub username "owenfar1". You can only submit your own repositories.`
- That suggests the current CLI path only supports repositories owned by the connected GitHub username, not organization-owned repositories like `debugbundle/debugbundle`.

If needed, I can provide screenshots, a terminal example, or a shortened marketplace description packet from `apps/mcp/listing.md`.
