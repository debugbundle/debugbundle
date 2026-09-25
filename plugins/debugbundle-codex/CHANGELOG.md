# Changelog

## [1.1.1] - 2026-09-25

- Pin the published MCP 1.12.1 release while preserving CLI-first guidance, local authentication, and existing plugin settings.

## [1.1.0] - 2026-09-23

- Make CLI the primary supported interface and assess MCP as a fallback or explicit user choice.
- Share scoped auth, existing authorization, write verification, and unavailable-path guidance across agent distributions.
- Pin MCP 1.11.0 for lifecycle-aware capture matchers and correlated recovery evidence, preserving existing plugin settings.

## [1.0.1] - 2026-09-21

### Changed

- Pin the developer integration to `@debugbundle/mcp@1.10.0` for the bounded agent-evidence and mutation-outcome protections.

## [1.0.0] - 2026-09-18

### Added

- Codex repository marketplace package with a debugging workflow skill and the existing `@debugbundle/mcp@1.9.0` stdio server with opt-in `--local-auth`.
- Dedicated installation, authentication, verification, update, and removal instructions.

This package is versioned independently from the MCP server and the hosted OpenAI plugin.
