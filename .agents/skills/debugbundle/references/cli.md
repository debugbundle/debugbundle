# DebugBundle CLI Reference

## Setup

- `debugbundle setup [--non-interactive] [--json]`
- `debugbundle doctor [--json]`
- `debugbundle validate [--fix] [--json]`
- `debugbundle ingest <file> --format <format> [--json]`
- `debugbundle watch --log <file> --format <format> [--json]`
- `debugbundle watch --cloud --log <file> --format <format> [--json]`
- `debugbundle process [--json]`

## Investigation

- `debugbundle incidents`
- `debugbundle inspect <incident-id>`
- `debugbundle bundle <incident-id>`
- `debugbundle reproduce <incident-id>`
- `debugbundle resolve <incident-id>`
- `debugbundle reopen <incident-id>`
- `debugbundle analyze --type improvement --local`

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
