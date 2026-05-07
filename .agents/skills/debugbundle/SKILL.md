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
