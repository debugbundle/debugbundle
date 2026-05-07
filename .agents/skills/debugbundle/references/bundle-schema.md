# Bundle Schema Reference

Bundle artifacts describe a normalized incident with deterministic metadata, evidence, and reproduction guidance.

Focus on:
- `summary` for the failure synopsis and recommended action
- `service` and `environment` for routing to the right code path
- `links.reproduction` for the generated reproduction artifact
- `metadata.source` for whether the bundle came from local or cloud data
