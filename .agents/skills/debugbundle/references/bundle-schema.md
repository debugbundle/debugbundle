# Bundle Schema Reference

Bundle artifacts describe a normalized incident with deterministic metadata, evidence, and reproduction guidance.

Focus on:
- `summary` for the failure synopsis and recommended action
- `service` and `environment` for routing to the right code path
- `context.error`, `context.request`, `context.response`, `context.logs`, `context.frontend`, `context.runtime`, `context.git`, `context.dependencies`, and `context.probe_data` for supporting evidence
- `reproduction` for confidence, commands, and manual steps
- `links.reproduction` for the generated reproduction artifact
- `metadata.source` for whether the bundle came from local or cloud data

Treat the bundle as the source of truth for the failure report. Use repository reads to confirm and patch the implicated code paths, not to rediscover incident context from scratch.
