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
- `debugbundle resolve <incident-id> [incident-id ...] [--source <local|cloud>] [--json]`
- `debugbundle reopen <incident-id> [incident-id ...] [--source <local|cloud>] [--json]`
- `debugbundle analyze --type improvement --local`

## Noise Management

- `debugbundle capture-rule suggest <incident-id> [--auth-file <path>] [--json]`
- `debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id <id> [--name <name>] [--expires-at <ISO8601>] [--auth-file <path>] [--json]`
- `debugbundle capture-rule list --project-id <id> [--auth-file <path>] [--json]`
- `debugbundle capture-rule create --project-id <id> --name <name> --action <demote|sample|drop> --matcher-json <json> [--auth-file <path>] [--json]`
- `debugbundle capture-policy get [--project <id>] [--json]`
- `debugbundle capture-policy set [--project <id>] --client-error-path-rule <404=/path/*@GET,POST> [--json]`

Use capture-rule suggestions for repeated operational noise after inspecting an incident bundle. Use capture-policy client-error path rules for route-scoped 4xx incidents instead of promoting all client errors.

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
debugbundle resolve <incident-id> [incident-id ...]
debugbundle incidents --status open --json
```

If you want a title-based batch cleanup and have `jq` available:

```bash
debugbundle incidents --status open --json \
  | jq -r '.incidents[] | select(.title | test("smoke test|dogfood|verification|synthetic"; "i")) | .incident_id' \
  | xargs debugbundle resolve
```
