# DebugBundle OpenAI Plugin

DebugBundle `1.0.0` is a combined OpenAI plugin: a production-debugging skill plus an OAuth-protected remote MCP connection at `https://mcp.debugbundle.com/mcp`.

The public v1 surface is read-only. It can list authorized projects, services, incidents, improvements, and endpoint-health evidence; read existing bounded redacted artifacts; and inspect bounded aggregate usage, routes, devices, acquisition, actions, funnels, transitions, and incident impact. It cannot access individual analytics journeys or custom dimensions, mutate projects, resolve incidents, create or reconfigure checks, generate artifacts, read local files, return raw logs, or send external messages.

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

Copy this plugin to a personal plugin source and use the plugin-creator cachebuster/reinstall workflow. Do not commit personal marketplace state. The supported personal install and fresh-thread Codex discovery are verified, including aggregate-analytics and endpoint-health cases. The endpoint-health case preserved URL sanitization and read-only behavior, but its second page exposed an order-sensitive strict-input comparison after the client appended the opaque cursor after `limit`. The source correction and public-handler regression are complete; production deployment and a live second-page recheck remain required. The remaining Codex and ChatGPT Developer Mode corpus must still pass before submission can be considered.

## Links

- Documentation: https://debugbundle.com/docs/mcp/openai-plugin
- Support: https://debugbundle.com/contact
- Privacy: https://debugbundle.com/privacy
- Terms: https://debugbundle.com/terms
- Security: https://github.com/debugbundle/debugbundle/security/policy
