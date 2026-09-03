# Draft: Investigate Production Incidents From ChatGPT And Codex

Status: unpublished working copy; move into the public blog only after verified publication, fresh-install validation, press coordination when required, and separate owner approval of the exact communication.

DebugBundle brings deterministic, redacted production-debugging evidence into ChatGPT and Codex through a read-only OpenAI plugin.

Instead of pasting logs or giving an agent broad operational access, a linked user can select an authorized project, list active incidents, inspect bounded incident context, retrieve an existing debug bundle or reproduction, review stored runtime improvements, analyze bounded aggregate product usage and incident impact, and examine sanitized endpoint-health results. The twenty-three-tool surface cannot access individual journeys, resolve incidents, change projects, reconfigure checks, create credentials, generate artifacts, or send messages.

The plugin combines a tailored production-investigation skill with an OAuth-protected remote MCP connection. DebugBundle applies its normal redaction before a stricter field-level output projection. Raw logs, analytics journeys, tokens, authorization headers, object-storage keys, signed URLs, and internal identifiers are excluded.

Example starting prompts:

- List the active production incidents in my checkout project and summarize the highest-severity one.
- Investigate this incident using its existing context, bundle, and reproduction evidence.
- Explain why this endpoint health check has been failing, using recent results and daily rollups.

The existing `@debugbundle/mcp` stdio package, CLI authentication, OpenClaw integration, installed projects, and APIs remain available and unchanged.

Publication placeholders that must be replaced only after independent evidence exists:

- verified OpenAI directory URL;
- exact install and connection steps;
- publication date and availability;
- production endpoint/eval evidence summary;
- approved launch communication and press-coordination record.
