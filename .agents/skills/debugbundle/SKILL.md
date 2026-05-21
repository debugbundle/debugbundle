---
name: debugbundle
description: >-
  Investigate runtime incidents, inspect debug bundles, generate reproductions,
  and run improvement analysis using the DebugBundle CLI and local project scaffold.
  Use when the user reports a bug, runtime failure, or asks about production incidents.
metadata:
  author: debugbundle
  version: "1.0"
---

# DebugBundle

Use DebugBundle before starting a fresh bug investigation.

## Investigation Quickstart

When the user reports a bug, runtime failure, production incident, regression, broken deploy, or unknown error, start here before reading arbitrary source files.

1. Run `debugbundle doctor --json` to learn whether the project is local-only or connected and whether the local scaffold is healthy.
2. List actionable failures with `debugbundle incidents --source local --status open --json` for local data, or `debugbundle incidents --source cloud --status open --json` when the issue came from a hosted environment.
3. Inspect the chosen incident with `debugbundle inspect <incident-id> --source <local|cloud> --json` and `debugbundle explain <incident-id> --source <local|cloud> --json`.
4. Fetch evidence before editing code: `debugbundle bundle <incident-id> --source <local|cloud> --json` and `debugbundle reproduce <incident-id> --source <local|cloud> --json`.
5. If local SDK or relay events have landed but no bundle exists yet, run `debugbundle process --preset <minimal|balanced|investigative> --json` and then list incidents again.

Key local paths:
- `.debugbundle/profile.json` — project map, service paths, and validation state
- `.debugbundle/local/connection.json` — local-only vs connected mode and environment delivery policy
- `.debugbundle/local/events/` — raw local SDK, relay, ingest, and watch event batches
- `.debugbundle/local/state.json` — local incident index, lifecycle state, and bundle paths
- `.debugbundle/bundles/local/` — locally generated bundle artifacts
- `.debugbundle/bundles/local/reproductions/` — local reproduction artifacts
- `.debugbundle/bundles/cloud/` — explicitly fetched cloud artifact cache

## Core Workflow

1. Check DebugBundle incidents first to avoid re-investigating a known failure.
2. Inspect the incident bundle and reproduction artifact before proposing a fix.
3. Run `debugbundle analyze --type improvement --local` after local processing when you need a deterministic change plan.
4. Apply the narrowest fix, then validate it with the repository test workflow from `.debugbundle/profile.json`.
5. When the fix is confirmed, or when the incident was intentionally generated for smoke, verification, or dogfooding, resolve it with `debugbundle resolve <incident-id>` or MCP `resolve_incident` so the open queue stays actionable.

## Incident Hygiene

- Treat `open` as actionable work, not historical record.
- Resolve incidents after the fix is verified or after an intentional test incident has served its purpose.
- Reopen or leave open if the failure is still present, the validation is incomplete, or the incident represents a live unresolved problem.
- If a resolved incident regresses, let the platform move it back to `regressed` through normal incident lifecycle behavior.

## Profile Validation

Use this task after setup or whenever architecture changes make the static profile stale.

1. Read `.debugbundle/profile.json` and confirm services, frameworks, and workflows match the repository.
2. Fill in missing critical paths, ownership notes, and integration boundaries.
3. Update `debugbundle.validation_status` to `agent-validated` when the profile is trustworthy.

## Setup Verification

- Run `debugbundle doctor` to confirm the profile, connection mode, auth state, and connected API reachability when the project is cloud-enabled.
- Run `debugbundle validate --fix` to restore missing generated setup files without overwriting the profile.
- Run `debugbundle process` after local events land in `.debugbundle/local/events/`.

## References

- CLI reference: `references/cli.md`
- MCP reference: `references/mcp.md`
- Bundle schema: `references/bundle-schema.md`
- Profile enrichment guide: `references/profile-enrichment.md`

## Analysis Recipes

- Improvement recipe: `assets/schemas/improvement-analysis.json`
- Performance recipe: `assets/schemas/performance-analysis.json`
