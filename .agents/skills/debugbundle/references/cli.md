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

- `debugbundle incidents [--source <local|cloud>] [--project-id <id>] [--environment <name>] [--service <name>] [--status <active|open|resolved|regressed|all>] [--severity <severity>] [--cursor <cursor>] [--limit <n>] [--json]`
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

## Probes

- `debugbundle probe activate <project-id> --label-pattern <pattern> [--service <name>] [--environment <name>] [--ttl-seconds <n>] [--trigger-ttl-seconds <n>] [--auth-file <path>] [--json]`
- `debugbundle probe list <project-id> [--auth-file <path>] [--json]`
- `debugbundle probe deactivate <project-id> <activation-id> [--auth-file <path>] [--json]`

Use probes for targeted evidence gathering when bundle context is insufficient. Prefer narrow label patterns, scoped service/environment values, and explicit TTLs.

## Notifications

- `debugbundle alert list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`
- `debugbundle alert create --project-id <id> --channel <channel> --condition <condition> [--service-id <id>] [--severity-min <level>] [--cooldown <seconds>] --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle alert update <alert-id> --project-id <id> [--service-id <id|null>] [--channel <channel>] [--condition <condition>] [--severity-min <level|null>] [--cooldown <seconds>] [--config-json <json|null>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle alert delete <alert-id> --project-id <id> [--auth-file <path>] [--json]`
- `debugbundle webhook list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`
- `debugbundle webhook create --project-id <id> --url <url> --event <event[,event]> [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle webhook update <webhook-id> --project-id <id> [--url <url>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle webhook delete <webhook-id> --project-id <id> [--auth-file <path>] [--json]`
- `debugbundle webhook test <webhook-id> --project-id <id> [--event <verification.passed|verification.failed>] [--auth-file <path>] [--json]`
- `debugbundle webhook deliveries <webhook-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`
- `debugbundle webhook retry <webhook-id> <delivery-id> --project-id <id> [--auth-file <path>] [--json]`

Use alert commands for notification routing and webhook commands for signed event delivery, delivery history, synthetic tests, and manual retries.

## Availability Checks

- `debugbundle health checks list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`
- `debugbundle health checks get <check-id> --project-id <id> [--auth-file <path>] [--json]`
- `debugbundle health checks create --project-id <id> --name <name> --url <url> --interval-seconds <n> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle health checks update <check-id> --project-id <id> [--name <name>] [--url <url>] [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--interval-seconds <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]`
- `debugbundle health checks delete <check-id> --project-id <id> [--auth-file <path>] [--json]`
- `debugbundle health checks test --project-id <id> --url <url> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--auth-file <path>] [--json]`
- `debugbundle health checks results <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`
- `debugbundle health checks daily-rollups <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`

Use availability-check commands for hosted endpoint reachability. Prefer `test` before saving a new target. `test` is side-effect-free and does not create incidents or retained history. Saved checks remain visible after downgrade, but checks beyond current count or interval limits pause until the project becomes eligible again.

## Documentation URLs

- CLI overview: `https://debugbundle.com/docs/cli`
- Cloud workflow: `https://debugbundle.com/docs/cli/cloud-workflow`
- API overview: `https://debugbundle.com/docs/api`
- API ingestion: `https://debugbundle.com/docs/api/ingestion`
- Alerts: `https://debugbundle.com/docs/alerts` and `https://debugbundle.com/docs/cli/alerts`
- Webhooks: `https://debugbundle.com/docs/webhooks`, `https://debugbundle.com/docs/cli/webhooks`, and `https://debugbundle.com/docs/api/webhooks`
- Probes: `https://debugbundle.com/docs/probes` and `https://debugbundle.com/docs/api/probes`
- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`
- Managing noise: `https://debugbundle.com/docs/managing-noise`
- Availability checks: `https://debugbundle.com/docs/availability-checks`
- MCP tool catalog: `https://debugbundle.com/docs/mcp/tools`

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
debugbundle incidents --status active --json
debugbundle resolve <incident-id> [incident-id ...]
debugbundle incidents --status active --json
```

If you want a title-based batch cleanup and have `jq` available:

```bash
debugbundle incidents --status active --json \
  | jq -r '.incidents[] | select(.title | test("smoke test|dogfood|verification|synthetic"; "i")) | .incident_id' \
  | xargs debugbundle resolve
```
