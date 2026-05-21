# DebugBundle CLI Reference

## Setup

- `debugbundle setup [--non-interactive] [--json]`
- `debugbundle doctor [--check-relay] [--json]`
- `debugbundle validate [--fix] [--json]`
- `debugbundle ingest <file> --format <format> [--json]`
- `debugbundle watch --log <file> --format <format> [--json]`
- `debugbundle watch --cloud --log <file> --format <format> [--json]`
- `debugbundle process [--preset <minimal|balanced|investigative>] [--json]`
- `debugbundle clean [--events] [--bundles] [--all] [--older-than <Nd>] [--json]`

## Investigation

- `debugbundle incidents [--source <local|cloud>] [--project-id <id>] [--environment <name>] [--service <name>] [--status <status>] [--severity <severity>] [--cursor <cursor>] [--limit <n>] [--json]`
- `debugbundle inspect <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle explain <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle bundle <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle reproduce <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle resolve <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle reopen <incident-id> [--source <local|cloud>] [--json]`
- `debugbundle analyze --type improvement --local`

## Operational Paths

- `.debugbundle/profile.json` — committed project map and agent validation state
- `.debugbundle/local/connection.json` — committed delivery policy and cloud connection metadata
- `.debugbundle/local/events/` — gitignored raw local event batches
- `.debugbundle/local/state.json` — gitignored local incident index and lifecycle state
- `.debugbundle/bundles/local/` — gitignored local bundle artifacts
- `.debugbundle/bundles/local/reproductions/` — gitignored local reproduction artifacts
- `.debugbundle/bundles/cloud/` — gitignored cache for explicitly fetched cloud artifacts

## Incident Hygiene

Resolve incidents after a fix is verified or after an intentional smoke, dogfood, or verification incident has served its purpose.
Leave incidents open when the failure is still live or the fix is not yet confirmed.

### Smoke-Test Cleanup Recipe

Review open incidents and resolve the intentionally generated ones:

```bash
debugbundle incidents --status open --json
debugbundle resolve <incident-id>
debugbundle incidents --status open --json
```

If you want a title-based batch cleanup and have `jq` available:

```bash
debugbundle incidents --status open --json \
  | jq -r '.incidents[] | select(.title | test("smoke test|dogfood|verification|synthetic"; "i")) | .incident_id' \
  | xargs -n1 debugbundle resolve
```
