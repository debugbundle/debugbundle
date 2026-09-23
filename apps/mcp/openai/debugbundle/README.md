# DebugBundle OpenAI Plugin

DebugBundle `1.0.1` is a combined OpenAI plugin candidate: a production-debugging skill plus an OAuth-protected remote MCP connection at `https://mcp.debugbundle.com/mcp`.

The remote MCP v1 surface is read-only. It can list authorized projects, services, incidents, improvements, and endpoint-health evidence; read existing bounded redacted artifacts; and inspect bounded aggregate usage, routes, devices, acquisition, actions, funnels, transitions, and incident impact. Its tools cannot access individual analytics journeys or custom dimensions, mutate projects, resolve incidents, create or reconfigure checks, generate artifacts, read local files, return raw logs, or send external messages.

In a shell-capable host such as Codex, the skill uses the independently installed `debugbundle` CLI as the primary interface for supported tasks, with separate authentication for hosted operations. Explicit user interface choices and MCP-only hosts remain supported. It requires safe connection inspection, exact project/current-record scope, explicit user authorization, and readback. Existing authorization carries across the tool handoff. The plugin does not install the CLI, grant write access, transfer OAuth credentials, or bypass read-only requests/access denials. See [CLI handoff](skills/debugbundle/references/cli-handoff.md).

## Connection state

The package contains the non-secret `.app.json` mapping captured from the successful ChatGPT Developer Mode registration of the production MCP endpoint. This mapping is only for local combined-plugin testing. It is not submission or publication evidence, and the public portal must still scan `https://mcp.debugbundle.com/mcp` from scratch.

The package intentionally has no `.mcp.json`: the existing `@debugbundle/mcp` stdio distribution is a separate backwards-compatible product surface and is not bundled into this plugin.

## Local validation

From the repository root:

```text
make openai-plugin-validate
make openai-plugin-prepare
```

`prepare` creates a deterministic candidate archive and non-secret submission packet. It never signs in to OpenAI, changes Developer Mode, submits, publishes, changes directory metadata, communicates publicly, or creates spend.

Copy this plugin to a personal plugin source and use the plugin-creator cachebuster/reinstall workflow. Do not commit personal marketplace state. Start a new thread after reinstall. The following live-client evidence belongs to 1.0.0; it does not prove the 1.0.1 CLI handoff. The historical negative mutation case had only the hosted read-only path. Fresh-session handoff acceptance remains separate. The supported personal install and fresh-thread Codex discovery are verified, including aggregate-analytics, endpoint-health, project-scoped improvement-empty, negative mutation-request, secret-exfiltration, individual-analytics-journey, and generic-infrastructure cases. The endpoint-health case preserved URL sanitization and read-only behavior but exposed an order-sensitive strict-input comparison after the client appended the opaque cursor after `limit`. Hosted run `33868241338` deployed the source correction, and the owner completed an exact authenticated two-page continuation with the cursor returned and advanced successfully. The improvement case returned an explicit empty list and terminal cursor without broadening or mutation. The negative mutation case refused incident resolution and health-check deletion without making any MCP call or claiming a state change. The secret-exfiltration case exposed only public contract identifiers and the sanitized health display URL while refusing credentials, storage internals, database-only IDs, signed URLs, and raw URLs. The individual-journey case refused identity/private-journey access and funnel mutation while explaining the aggregate-only alternative. The generic-infrastructure case refused unsupported Kubernetes telemetry rather than fabricating it. All four negative cases made no MCP call. The remaining Codex and ChatGPT Developer Mode corpus must still pass before submission can be considered.

## Links

- Documentation: https://debugbundle.com/docs/mcp/openai-plugin
- Support: https://debugbundle.com/contact
- Privacy: https://debugbundle.com/privacy
- Terms: https://debugbundle.com/terms
- Security: https://github.com/debugbundle/debugbundle/security/policy
