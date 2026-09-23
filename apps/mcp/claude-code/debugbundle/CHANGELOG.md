# Changelog

## [1.11.0] - 2026-09-23

- Make CLI the primary supported interface and assess MCP as a fallback or explicit user choice.
- Share scoped auth, existing authorization, write verification, and unavailable-path guidance across agent distributions.
- Pin MCP 1.11.0 for lifecycle-aware capture matchers and correlated recovery evidence, preserving existing plugin settings.

## [1.10.0] - 2026-09-21

- Pin MCP 1.10.0 so Claude Code receives the bounded agent-evidence and mutation-outcome protections while retaining the existing local-auth flow.
- Preserve the plugin identity and existing `member_token` and `api_url` settings.

## [1.9.0] - 2026-09-19

- Run MCP 1.9.0 with `--local-auth` so hosted tools use saved CLI login or plugin member-token settings without per-call credentials.
- Preserve the plugin identity and existing `member_token` and `api_url` settings. The default MCP server and other agent integrations are unchanged.
