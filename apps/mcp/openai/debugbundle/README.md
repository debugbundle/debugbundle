# DebugBundle OpenAI Plugin

DebugBundle `1.0.0` is a combined OpenAI plugin: a production-debugging skill plus an OAuth-protected remote MCP connection at `https://mcp.debugbundle.com/mcp`.

The public v1 surface is read-only. It can list authorized projects, services, incidents, improvements, and endpoint-health evidence; read existing bounded redacted artifacts; and inspect bounded aggregate usage, routes, devices, acquisition, actions, funnels, transitions, and incident impact. It cannot access individual analytics journeys or custom dimensions, mutate projects, resolve incidents, create or reconfigure checks, generate artifacts, read local files, return raw logs, or send external messages.

## Connection state

The repository intentionally does not contain `.app.json` until ChatGPT Developer Mode has registered the production MCP endpoint and returned a real connection identifier. Registration is a manual testing action, not publication authorization. When that evidence exists, add the exact connection reference for local package testing only; the public portal must still scan `https://mcp.debugbundle.com/mcp` from scratch.

The package intentionally has no `.mcp.json`: the existing `@debugbundle/mcp` stdio distribution is a separate backwards-compatible product surface and is not bundled into this plugin.

## Local validation

From the repository root:

```text
make openai-plugin-validate
make openai-plugin-prepare
```

`prepare` creates a deterministic candidate archive and non-secret submission packet. It never signs in to OpenAI, changes Developer Mode, submits, publishes, changes directory metadata, communicates publicly, or creates spend.

After a real `.app.json` exists, copy this plugin to a personal plugin source and use the plugin-creator cachebuster/reinstall workflow. Do not commit personal marketplace state. A fresh Codex thread and a ChatGPT Developer Mode session must both run the retained test corpus before submission can be considered.

## Links

- Documentation: https://debugbundle.com/docs/mcp/openai-plugin
- Support: https://debugbundle.com/contact
- Privacy: https://debugbundle.com/privacy
- Terms: https://debugbundle.com/terms
- Security: https://github.com/debugbundle/debugbundle/security/policy
