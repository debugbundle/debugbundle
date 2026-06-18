export const PROFILE_FILE_PATH = ".debugbundle/profile.json";
export const CONNECTION_FILE_PATH = ".debugbundle/local/connection.json";
export const SKILL_DIRECTORY_PATH = ".agents/skills/debugbundle";
export const SKILL_FILE_PATH = `${SKILL_DIRECTORY_PATH}/SKILL.md`;
export const CLI_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/cli.md`;
export const MCP_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/mcp.md`;
export const BUNDLE_SCHEMA_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/bundle-schema.md`;
export const PROFILE_ENRICHMENT_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/profile-enrichment.md`;
export const IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/assets/schemas/improvement-analysis.json`;
export const PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/assets/schemas/performance-analysis.json`;
export const EVALS_FILE_PATH = `${SKILL_DIRECTORY_PATH}/evals/evals.json`;
export const GITIGNORE_FILE_PATH = ".gitignore";

export const GENERATED_FILE_PATHS = [
  PROFILE_FILE_PATH,
  CONNECTION_FILE_PATH,
  SKILL_FILE_PATH,
  CLI_REFERENCE_FILE_PATH,
  MCP_REFERENCE_FILE_PATH,
  BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
  PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
  IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
  PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
  EVALS_FILE_PATH
] as const;

export const ENSURED_DIRECTORY_PATHS = [
  ".debugbundle/local/events",
  ".debugbundle/bundles/local/reproductions",
  ".debugbundle/bundles/cloud",
  `${SKILL_DIRECTORY_PATH}/references`,
  `${SKILL_DIRECTORY_PATH}/assets/schemas`,
  `${SKILL_DIRECTORY_PATH}/evals`
] as const;

export const OBSOLETE_GENERATED_SCAFFOLD_PATHS = [
  ".debugbundle/agent-guide.md",
  ".debugbundle/skill",
  "skills/debugbundle"
] as const;

const MANAGED_GITIGNORE_LINES = [
  "# DebugBundle (managed by debugbundle setup)",
  ".debugbundle/local/*",
  "!.debugbundle/local/connection.json",
  ".debugbundle/bundles/"
] as const;

export function buildSkill(): string {
  return [
    "---",
    "name: debugbundle",
    "description: >-",
    "  Investigate runtime incidents, inspect debug bundles, generate reproductions,",
    "  run improvement analysis, and inspect operational controls using the DebugBundle",
    "  CLI and local project scaffold. Use when the user reports a bug, runtime",
    "  failure, production incident, endpoint downtime, health-check issue, missing",
    "  notification, webhook delivery failure, probe request, or noisy incident.",
    "metadata:",
    "  author: debugbundle",
    '  version: "1.0"',
    "---",
    "",
    "# DebugBundle",
    "",
    "Use DebugBundle before starting a fresh bug investigation.",
    "",
    "## Investigation Quickstart",
    "",
    "When the user reports a bug, runtime failure, production incident, regression, broken deploy, or unknown error, start here before reading arbitrary source files.",
    "",
    "1. Run `debugbundle doctor --json` to learn whether the project is local-only or connected and whether the local scaffold is healthy.",
    "2. If `debugbundle doctor --json` reports `mode=local-only`, start with `debugbundle incidents --source local --status active --json`.",
    "3. If `debugbundle doctor --json` reports `mode=connected` and the target environment is cloud-enabled, check both `debugbundle incidents --source local --status active --json` and `debugbundle incidents --source cloud --status active --json` unless the user explicitly scoped the issue to local-only development. For user-reported production incidents, check cloud incidents after local incidents and explicitly report whether each source had matches.",
    "4. Inspect the chosen incident with `debugbundle inspect <incident-id> --source <local|cloud> --json` and `debugbundle explain <incident-id> --source <local|cloud> --json`.",
    "5. Fetch evidence before editing code: `debugbundle bundle <incident-id> --source <local|cloud> --json` and `debugbundle reproduce <incident-id> --source <local|cloud> --json`.",
    "6. If local SDK or relay events have landed but no bundle exists yet, run `debugbundle process --preset <minimal|balanced|investigative> --json` and then list incidents again.",
    "",
    "Key local paths:",
    "- `.debugbundle/profile.json` — project map, service paths, and validation state",
    "- `.debugbundle/local/connection.json` — local-only vs connected mode and environment delivery policy",
    "- `.debugbundle/local/events/` — raw local SDK, relay, ingest, and watch event batches",
    "- `.debugbundle/local/state.json` — local incident index, lifecycle state, and bundle paths",
    "- `.debugbundle/bundles/local/` — locally generated bundle artifacts",
    "- `.debugbundle/bundles/local/reproductions/` — local reproduction artifacts",
    "- `.debugbundle/bundles/cloud/` — explicitly fetched cloud artifact cache",
    "",
    "## Core Workflow",
    "",
    "1. Check DebugBundle incidents first to avoid re-investigating a known failure.",
    "2. Inspect the incident bundle and reproduction artifact before proposing a fix.",
    "3. Run `debugbundle analyze --type improvement --local` after local processing when you need a deterministic change plan.",
    "4. Apply the narrowest fix, then validate it with the repository test workflow from `.debugbundle/profile.json`.",
    "5. When the fix is confirmed, or when the incident was intentionally generated for smoke, verification, or dogfooding, resolve it with `debugbundle resolve <incident-id> [incident-id ...]` or MCP `resolve_incident` / `resolve_incidents` so the needs-attention queue stays actionable.",
    "",
    "## Investigation Controls",
    "",
    "Use these controls when the user's issue is about observability behavior, notification delivery, targeted evidence gathering, or event noise rather than only application code.",
    "",
    "- Availability checks: use hosted health checks for endpoint downtime, public reachability, or project Health tab issues. These are DebugBundle-run external `GET`/`HEAD` checks, not SDK events from the customer app.",
    "- Probes: inspect active probes with `debugbundle probe list <project-id> --json` or MCP `list_active_probes` before activating more probes. Activate probes only when targeted runtime evidence is needed and the user has asked for investigation.",
    "- Capture policy and rules: inspect policy/rules before suppressing noisy incidents. Prefer `debugbundle capture-rule suggest <incident-id> --json` and narrow capture-policy path rules over broad drops or demotions.",
    "- Alerts and webhooks: when the user reports missing, duplicate, or failed notifications, inspect alert config, webhook config, and webhook delivery history before changing application code.",
    "",
    "## Availability Checks",
    "",
    "- Start with `debugbundle health checks list --project-id <id> --json` or MCP `list_health_checks` to inspect saved checks and plan limits.",
    "- For a failing check, inspect `debugbundle health checks results <check-id> --project-id <id> --json` and `debugbundle health checks daily-rollups <check-id> --project-id <id> --json` before changing code.",
    "- Use `debugbundle health checks test --project-id <id> --url <url> --json` or MCP `test_health_check` before creating or updating a saved check. Tests are side-effect-free: no incidents, retained history rows, or counters.",
    "- Create, update, delete, enable, or disable checks only when the user explicitly asks to change monitoring.",
    "- Availability incidents reuse the normal incident lifecycle. If a check opened an incident, fetch the incident context, bundle, and reproduction before proposing a fix, then resolve only after the endpoint recovers or the intentional verification incident has served its purpose.",
    "- Do not configure private, localhost, metadata-service, credentialed, or state-mutating targets. V1 health-check targets must be external `http`/`https` URLs on safe ports.",
    "",
    "## Incident Hygiene",
    "",
    "- Treat `open` as actionable work, not historical record.",
    "- Resolve incidents after the fix is verified or after an intentional test incident has served its purpose.",
    "- Reopen or leave open if the failure is still present, the validation is incomplete, or the incident represents a live unresolved problem.",
    "- If a resolved incident regresses, let the platform move it back to `regressed` through normal incident lifecycle behavior.",
    "",
    "## Noise Management",
    "",
    "When incident evidence shows repeated low-value operational noise rather than a product bug, evaluate whether a scoped capture rule or capture-policy path rule should handle future matches.",
    "",
    "- Run `debugbundle capture-rule suggest <incident-id> --json` before creating a manual rule. Apply deterministic suggestions with `debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id <id>` after confirming the scope is safe.",
    "- Prefer project capture rules for operational noise because they are centralized, auditable, and enforced by ingestion and processing. Use SDK `beforeSend` only for app-owned local policy such as final redaction or events that must never leave the runtime.",
    "- Scope frontend noise by structured evidence such as service, environment, `browser_event_kind`, `browser_event_opaque`, `client_kind`, `bot_family`, and message fields. Do not broadly demote generic `Unhandled promise rejection` incidents without bot-scoped or otherwise narrow evidence.",
    "- For expected or intentionally promoted 4xx responses on known routes, use capture-policy client-error path rules instead of promoting all client errors: `debugbundle capture-policy set --client-error-path-rule <status=/path/*@GET>`.",
    "",
    "## Notification Delivery",
    "",
    "When notification or automation delivery is the reported failure, inspect configuration and delivery records before changing incident logic.",
    "",
    "- Alerts route incident notifications to configured channels. Start with `debugbundle alert list --project-id <id> --json` and confirm condition, severity, service, cooldown, channel, and enabled state.",
    "- Webhooks deliver signed lifecycle events to external systems. Start with `debugbundle webhook list --project-id <id> --json`, then inspect `debugbundle webhook deliveries <webhook-id> --project-id <id> --json` before retrying or testing.",
    "- Webhook tests and retries are side-effecting delivery actions. Use them only when validating a destination or replaying an explicit failed delivery.",
    "",
    "## Full Documentation",
    "",
    "- CLI: `https://debugbundle.com/docs/cli`",
    "- MCP tools: `https://debugbundle.com/docs/mcp/tools`",
    "- Availability checks: `https://debugbundle.com/docs/availability-checks`",
    "- Probes: `https://debugbundle.com/docs/probes`",
    "- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`",
    "- Alerts: `https://debugbundle.com/docs/alerts` and `https://debugbundle.com/docs/cli/alerts`",
    "- Webhooks: `https://debugbundle.com/docs/webhooks` and `https://debugbundle.com/docs/cli/webhooks`",
    "- API ingestion: `https://debugbundle.com/docs/api/ingestion`",
    "",
    "## Profile Validation",
    "",
    "Use this task after setup or whenever architecture changes make the static profile stale.",
    "",
    "1. Read `.debugbundle/profile.json` and confirm services, frameworks, and workflows match the repository.",
    "2. Fill in missing critical paths, ownership notes, and integration boundaries.",
    "3. Update `debugbundle.validation_status` to `agent-validated` when the profile is trustworthy.",
    "",
    "## Setup Verification",
    "",
    "- Run `debugbundle doctor` to confirm the profile, connection mode, auth state, and connected API reachability when the project is cloud-enabled.",
    "- Run `debugbundle validate --fix` to restore missing generated setup files without overwriting the profile.",
    "- Run `debugbundle process` after local events land in `.debugbundle/local/events/`.",
    "",
    "## Browser Capture and Relay Setup",
    "",
    "When the repository has a browser frontend, verify capture end to end instead of stopping at backend SDK setup.",
    "",
    "1. Add `@debugbundle/sdk-browser` to each browser app that should capture console, error, navigation, or request context.",
    "2. Initialize the browser SDK from the app entrypoint with the active environment and a browser relay endpoint.",
    "3. Add a backend relay endpoint at `/debugbundle/browser` using the server SDK relay helper when available.",
    "4. For same-origin apps, keep the browser endpoint as `/debugbundle/browser`.",
    "5. For split frontend/backend hosts, configure the browser endpoint to the API host relay URL and require explicit frontend origin allowlisting on the backend.",
    "6. Ensure auth and CSRF middleware allow the relay path while the relay still enforces origin, content type, body size, schema validation, and rate limits.",
    "7. Trigger a local browser smoke event, then run `debugbundle process --json` and confirm the incident or context event appears before marking setup complete.",
    "",
    "## References",
    "",
    "- CLI reference: `references/cli.md`",
    "- MCP reference: `references/mcp.md`",
    "- Bundle schema: `references/bundle-schema.md`",
    "- Profile enrichment guide: `references/profile-enrichment.md`",
    "",
    "## Analysis Recipes",
    "",
    "- Improvement recipe: `assets/schemas/improvement-analysis.json`",
    "- Performance recipe: `assets/schemas/performance-analysis.json`",
    ""
  ].join("\n");
}

export function buildCliReference(): string {
  return [
    "# DebugBundle CLI Reference",
    "",
    "## Setup",
    "",
    "- `debugbundle setup [--non-interactive] [--json]`",
    "- `debugbundle doctor [--check-relay] [--json]`",
    "- `debugbundle validate [--fix] [--json]`",
    "- `debugbundle ingest <file> --format <format> [--json]`",
    "- `debugbundle watch --log <file> --format <format> [--json]`",
    "- `debugbundle watch --cloud --log <file> --format <format> [--json]`",
    "- `debugbundle process [--preset <minimal|balanced|investigative>] [--json]`",
    "- `debugbundle clean [--events] [--bundles] [--all] [--older-than <Nd>] [--json]`",
    "",
    "## Investigation",
    "",
    "- `debugbundle incidents [--source <local|cloud>] [--project-id <id>] [--environment <name>] [--service <name>] [--status <active|open|resolved|regressed|all>] [--severity <severity>] [--cursor <cursor>] [--limit <n>] [--json]`",
    "- `debugbundle inspect <incident-id> [--source <local|cloud>] [--json]`",
    "- `debugbundle explain <incident-id> [--source <local|cloud>] [--json]`",
    "- `debugbundle bundle <incident-id> [--source <local|cloud>] [--json]`",
    "- `debugbundle reproduce <incident-id> [--source <local|cloud>] [--json]`",
    "- `debugbundle resolve <incident-id> [incident-id ...] [--source <local|cloud>] [--json]`",
    "- `debugbundle reopen <incident-id> [incident-id ...] [--source <local|cloud>] [--json]`",
    "- `debugbundle analyze --type improvement --local`",
    "",
    "## Noise Management",
    "",
    "- `debugbundle capture-rule suggest <incident-id> [--auth-file <path>] [--json]`",
    "- `debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id <id> [--name <name>] [--expires-at <ISO8601>] [--auth-file <path>] [--json]`",
    "- `debugbundle capture-rule list --project-id <id> [--auth-file <path>] [--json]`",
    "- `debugbundle capture-rule create --project-id <id> --name <name> --action <demote|sample|drop> --matcher-json <json> [--auth-file <path>] [--json]`",
    "- `debugbundle capture-policy get [--project <id>] [--json]`",
    "- `debugbundle capture-policy set [--project <id>] --client-error-path-rule <404=/path/*@GET,POST> [--json]`",
    "",
    "Use capture-rule suggestions for repeated operational noise after inspecting an incident bundle. Use capture-policy client-error path rules for route-scoped 4xx incidents instead of promoting all client errors.",
    "",
    "## Probes",
    "",
    "- `debugbundle probe activate <project-id> --label-pattern <pattern> [--service <name>] [--environment <name>] [--ttl-seconds <n>] [--trigger-ttl-seconds <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle probe list <project-id> [--auth-file <path>] [--json]`",
    "- `debugbundle probe deactivate <project-id> <activation-id> [--auth-file <path>] [--json]`",
    "",
    "Use probes for targeted evidence gathering when bundle context is insufficient. Prefer narrow label patterns, scoped service/environment values, and explicit TTLs.",
    "",
    "## Notifications",
    "",
    "- `debugbundle alert list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle alert create --project-id <id> --channel <channel> --condition <condition> [--service-id <id>] [--severity-min <level>] [--cooldown <seconds>] --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle alert update <alert-id> --project-id <id> [--service-id <id|null>] [--channel <channel>] [--condition <condition>] [--severity-min <level|null>] [--cooldown <seconds>] [--config-json <json|null>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle alert delete <alert-id> --project-id <id> [--auth-file <path>] [--json]`",
    "- `debugbundle webhook list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle webhook create --project-id <id> --url <url> --event <event[,event]> [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle webhook update <webhook-id> --project-id <id> [--url <url>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle webhook delete <webhook-id> --project-id <id> [--auth-file <path>] [--json]`",
    "- `debugbundle webhook test <webhook-id> --project-id <id> [--event <verification.passed|verification.failed>] [--auth-file <path>] [--json]`",
    "- `debugbundle webhook deliveries <webhook-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle webhook retry <webhook-id> <delivery-id> --project-id <id> [--auth-file <path>] [--json]`",
    "",
    "Use alert commands for notification routing and webhook commands for signed event delivery, delivery history, synthetic tests, and manual retries.",
    "",
    "## Availability Checks",
    "",
    "- `debugbundle health checks list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle health checks get <check-id> --project-id <id> [--auth-file <path>] [--json]`",
    "- `debugbundle health checks create --project-id <id> --name <name> --url <url> --interval-seconds <n> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle health checks update <check-id> --project-id <id> [--name <name>] [--url <url>] [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--interval-seconds <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]`",
    "- `debugbundle health checks delete <check-id> --project-id <id> [--auth-file <path>] [--json]`",
    "- `debugbundle health checks test --project-id <id> --url <url> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle health checks results <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "- `debugbundle health checks daily-rollups <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]`",
    "",
    "Use availability-check commands for hosted endpoint reachability. Prefer `test` before saving a new target. `test` is side-effect-free and does not create incidents or retained history. Saved checks remain visible after downgrade, but checks beyond current count or interval limits pause until the project becomes eligible again.",
    "",
    "## Documentation URLs",
    "",
    "- CLI overview: `https://debugbundle.com/docs/cli`",
    "- Cloud workflow: `https://debugbundle.com/docs/cli/cloud-workflow`",
    "- API overview: `https://debugbundle.com/docs/api`",
    "- API ingestion: `https://debugbundle.com/docs/api/ingestion`",
    "- Alerts: `https://debugbundle.com/docs/alerts` and `https://debugbundle.com/docs/cli/alerts`",
    "- Webhooks: `https://debugbundle.com/docs/webhooks`, `https://debugbundle.com/docs/cli/webhooks`, and `https://debugbundle.com/docs/api/webhooks`",
    "- Probes: `https://debugbundle.com/docs/probes` and `https://debugbundle.com/docs/api/probes`",
    "- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`",
    "- Availability checks: `https://debugbundle.com/docs/availability-checks`",
    "- MCP tool catalog: `https://debugbundle.com/docs/mcp/tools`",
    "",
    "## Operational Paths",
    "",
    "- `.debugbundle/profile.json` — committed project map and agent validation state",
    "- `.debugbundle/local/connection.json` — committed delivery policy and cloud connection metadata",
    "- `.debugbundle/local/events/` — gitignored raw local event batches",
    "- `.debugbundle/local/state.json` — gitignored local incident index and lifecycle state",
    "- `.debugbundle/bundles/local/` — gitignored local bundle artifacts",
    "- `.debugbundle/bundles/local/reproductions/` — gitignored local reproduction artifacts",
    "- `.debugbundle/bundles/cloud/` — gitignored cache for explicitly fetched cloud artifacts",
    "",
    "## Incident Hygiene",
    "",
    "Resolve incidents after a fix is verified or after an intentional smoke, dogfood, or verification incident has served its purpose.",
    "Leave incidents open when the failure is still live or the fix is not yet confirmed.",
    "",
    "### Smoke-Test Cleanup Recipe",
    "",
    "Review open incidents and resolve the intentionally generated ones:",
    "",
    "```bash",
    "debugbundle incidents --status active --json",
    "debugbundle resolve <incident-id> [incident-id ...]",
    "debugbundle incidents --status active --json",
    "```",
    "",
    "If you want a title-based batch cleanup and have `jq` available:",
    "",
    "```bash",
    "debugbundle incidents --status active --json \\",
    "  | jq -r '.incidents[] | select(.title | test(\"smoke test|dogfood|verification|synthetic\"; \"i\")) | .incident_id' \\",
    "  | xargs debugbundle resolve",
    "```",
    ""
  ].join("\n");
}

export function buildMcpReference(): string {
  return [
    "# DebugBundle MCP Reference",
    "",
    "Use the same incident-first workflow through MCP when an agent is operating in connected mode.",
    "",
    "## Investigation Tools",
    "",
    "- `doctor` — validate local profile, connection config, auth state, and setup health.",
    "- `list_incidents` — list local, cloud, or connected combined incidents; pass `source`, `status`, `environment`, `service`, `severity`, `cursor`, and `limit` when needed.",
    "- `get_incident` — fetch incident metadata by incident id.",
    "- `get_incident_context` — fetch deterministic explanation context for triage.",
    "- `get_bundle` — fetch the full debug bundle before proposing a fix.",
    "- `get_reproduction` — fetch reproduction guidance before editing code.",
    "- `resolve_incident` / `resolve_incidents` / `reopen_incident` / `reopen_incidents` — update lifecycle state after validation.",
    "- `analyze` — run local agent-oriented analysis from local bundles and skill schemas.",
    "",
    "- Prefer bundle retrieval tools before reading raw repository files.",
    "- Use MCP bundle access when the current issue originated in production.",
    "- Resolve fixed or intentionally generated incidents with `resolve_incident` or `resolve_incidents` so open incidents stay actionable.",
    "- Fall back to local CLI processing when the project is local-only.",
    "",
    "## Noise and Capture Policy Tools",
    "",
    "- `suggest_capture_rules_from_incident` — generate deterministic capture-rule suggestions from an incident bundle.",
    "- `create_capture_rule_from_incident_suggestion` — apply a confirmed suggestion.",
    "- `list_capture_rules`, `create_capture_rule`, `update_capture_rule`, `delete_capture_rule` — manage project capture rules.",
    "- `get_capture_policy`, `update_capture_policy` — review or update capture policy, including path-scoped client-error incident rules.",
    "",
    "Use these tools for repeated low-value operational noise only after inspecting incident evidence. Keep frontend suppression scoped by structured browser and client signals, and use path-scoped capture policy for known 4xx routes.",
    "",
    "## Probe Tools",
    "",
    "- `activate_probe` — activate a remote probe pattern with optional service/environment scope and TTL.",
    "- `list_active_probes` — list active probe activations for a project.",
    "- `deactivate_probe` — deactivate one active probe.",
    "",
    "Use probes for targeted evidence gathering when incident bundles do not contain enough runtime context.",
    "",
    "## Notification Tools",
    "",
    "- `list_alerts`, `create_alert`, `update_alert`, `delete_alert` — manage incident alert rules.",
    "- `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook` — manage signed webhook destinations.",
    "- `test_webhook`, `list_webhook_deliveries` — validate webhook delivery and inspect delivery history.",
    "",
    "Use these tools when the reported problem is missing, duplicate, delayed, disabled, or failed notification delivery.",
    "",
    "## Availability Check Tools",
    "",
    "- `list_health_checks` — list hosted health checks and plan limits for a project.",
    "- `get_health_check` — fetch one hosted health check by id.",
    "- `test_health_check` — run a side-effect-free target test without opening incidents or writing retained history.",
    "- `create_health_check`, `update_health_check`, `delete_health_check` — manage saved hosted health checks when the user explicitly asks to change monitoring.",
    "- `list_health_check_results` — inspect recent raw executions for one check.",
    "- `list_health_check_daily_rollups` — inspect retained per-day status history for one check.",
    "",
    "Use these tools for endpoint downtime, public reachability, and project Health tab issues. Start with list/results/rollups, use `test_health_check` before saving target changes, and inspect the linked normal incident bundle when failures crossed the configured threshold.",
    "",
    "## Documentation URLs",
    "",
    "- MCP overview: `https://debugbundle.com/docs/mcp`",
    "- MCP workflows: `https://debugbundle.com/docs/mcp/workflows`",
    "- MCP tools: `https://debugbundle.com/docs/mcp/tools`",
    "- Availability checks: `https://debugbundle.com/docs/availability-checks`",
    "- Probes: `https://debugbundle.com/docs/probes`",
    "- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`",
    "- Alerts: `https://debugbundle.com/docs/alerts`",
    "- Webhooks: `https://debugbundle.com/docs/webhooks`",
    "- API ingestion: `https://debugbundle.com/docs/api/ingestion`",
    "",
    "## Smoke-Test Cleanup Recipe",
    "",
    "1. Call `list_incidents` with `status: \"active\"`.",
    "2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.",
    "3. Call `resolve_incidents` for verified synthetic incidents, or `resolve_incident` for a single incident.",
    "4. Call `list_incidents` again and confirm the needs-attention queue only contains actionable failures.",
    ""
  ].join("\n");
}

export function buildBundleSchemaReference(): string {
  return [
    "# Bundle Schema Reference",
    "",
    "Bundle artifacts describe a normalized incident with deterministic metadata, evidence, and reproduction guidance.",
    "",
    "Focus on:",
    "- `summary` for the failure synopsis and recommended action",
    "- `service` and `environment` for routing to the right code path",
    "- `context.error`, `context.request`, `context.response`, `context.logs`, `context.frontend`, `context.runtime`, `context.git`, `context.dependencies`, and `context.probe_data` for supporting evidence",
    "- `reproduction` for confidence, commands, and manual steps",
    "- `links.reproduction` for the generated reproduction artifact",
    "- `metadata.source` for whether the bundle came from local or cloud data",
    "",
    "Treat the bundle as the source of truth for the failure report. Use repository reads to confirm and patch the implicated code paths, not to rediscover incident context from scratch.",
    ""
  ].join("\n");
}

export function buildProfileEnrichmentReference(): string {
  return [
    "# Profile Enrichment",
    "",
    "The setup profile is generated from static analysis and must be reviewed before agents rely on it for architecture decisions.",
    "",
    "Checklist:",
    "- verify `project.primary_languages`, `project.package_managers`, and `project.deployment_targets`",
    "- verify each service `kind`, `runtime`, `framework`, `paths`, `owns_routes`, and `depends_on` value against the repository",
    "- add critical paths for ingestion, processing, retrieval, SDK capture, auth, billing, and any project-specific high-risk workflows",
    "- confirm `repo.generated_paths` and `repo.do_not_edit_paths` match the local scaffold",
    "- confirm build, test, lint, and install workflows in `developer_workflows`",
    "- for browser frontends, confirm `@debugbundle/sdk-browser` is initialized and a backend `/debugbundle/browser` relay is reachable",
    "- for split frontend/backend hosts, confirm the browser SDK uses the API relay URL and the backend allowlists the frontend origin",
    "- update `debugbundle.last_reviewed_at` and set `debugbundle.validation_status` to `agent-validated` when complete",
    ""
  ].join("\n");
}

function buildAnalysisRecipe(recipe: {
  analysisType: "improvement" | "performance";
  goal: string;
  focusAreas: string[];
  requiredInputs: string[];
  outputSections: string[];
}): string {
  return `${JSON.stringify(
    {
      schema_version: "v1",
      analysis_type: recipe.analysisType,
      goal: recipe.goal,
      required_inputs: recipe.requiredInputs,
      focus_areas: recipe.focusAreas,
      output_sections: recipe.outputSections
    },
    null,
    2
  )}\n`;
}

export function buildImprovementAnalysisRecipe(): string {
  return buildAnalysisRecipe({
    analysisType: "improvement",
    goal: "Turn the latest local DebugBundle failure evidence into a deterministic improvement plan.",
    focusAreas: [
      "Identify the most likely code path to change first.",
      "Explain why the current failure happens with the available bundle evidence.",
      "Propose a narrow code change and the validation steps needed to confirm it."
    ],
    requiredInputs: [
      ".debugbundle/profile.json",
      ".debugbundle/bundles/local/*.bundle.json",
      "Relevant repository source files"
    ],
    outputSections: ["root_cause_hypothesis", "recommended_code_changes", "validation_plan"]
  });
}

export function buildPerformanceAnalysisRecipe(): string {
  return buildAnalysisRecipe({
    analysisType: "performance",
    goal: "Review the latest local DebugBundle evidence for deterministic performance improvements.",
    focusAreas: [
      "Identify the primary latency or throughput bottleneck.",
      "Call out the most likely constrained dependency or code path.",
      "Recommend the smallest measurable optimization and how to verify it."
    ],
    requiredInputs: [
      ".debugbundle/profile.json",
      ".debugbundle/bundles/local/*.bundle.json",
      "Relevant repository source files"
    ],
    outputSections: ["performance_hypothesis", "optimization_plan", "measurement_plan"]
  });
}

export function buildSkillEvals(): string {
  return `${JSON.stringify(
    {
      schema_version: "v1",
      skill: "debugbundle",
      evaluations: [
        {
          name: "incident_first_workflow",
          prompt: "The user reports a production checkout failure. Confirm the skill tells the agent to inspect DebugBundle artifacts first.",
          expected_behavior: [
            "Check incidents before reading arbitrary source files.",
            "Read the skill workflow before proposing a fix."
          ]
        },
        {
          name: "profile_validation_task",
          prompt: "The generated profile is shallow. Confirm the skill teaches the agent how to validate and enrich it.",
          expected_behavior: [
            "Read .debugbundle/profile.json.",
            "Update validation_status when the profile has been reviewed."
          ]
        },
        {
          name: "incident_resolution_hygiene",
          prompt: "A bug was fixed and a smoke-test incident was intentionally triggered during verification. Confirm the skill teaches the agent to resolve that incident once the check passes.",
          expected_behavior: [
            "Resolve verified or intentionally generated incidents after the workflow is complete.",
            "Leave unresolved incidents open when the failure is still live or unverified."
          ]
        },
        {
          name: "noise_management_guidance",
          prompt: "The same low-value frontend incident keeps reopening. Confirm the skill tells the agent how to evaluate operational noise without hiding real bugs.",
          expected_behavior: [
            "Inspect incident evidence before creating a rule.",
            "Use capture-rule suggestions for repeated operational noise.",
            "Keep generic frontend suppression narrow with structured browser or bot signals.",
            "Use capture-policy path rules for known route-scoped 4xx incidents."
          ]
        },
        {
          name: "operational_controls_guidance",
          prompt: "The user reports missing webhook deliveries and asks whether probes or alerts are available. Confirm the skill points the agent to the relevant operational controls and docs.",
          expected_behavior: [
            "Inspect alert and webhook configuration plus webhook delivery history before changing application code.",
            "Use probes for targeted evidence gathering with narrow scope and TTL.",
            "Point to the full CLI, MCP, alerts, webhooks, probes, capture policy, availability checks, and ingestion documentation URLs."
          ]
        },
        {
          name: "artifact_path_discovery",
          prompt: "The user reports an unknown local runtime error. Confirm the skill tells the agent which DebugBundle paths and commands to inspect first.",
          expected_behavior: [
            "Run doctor and list local open incidents before broad source exploration.",
            "Use .debugbundle/local/state.json, .debugbundle/bundles/local/, and reproduction artifact paths as the local evidence map."
          ]
        },
        {
          name: "connected_incident_fetch",
          prompt: "The user says a production incident fired in the hosted DebugBundle project. Confirm the skill points the agent to the cloud retrieval path.",
          expected_behavior: [
            "Check both local and cloud incident sources when the project is connected and the environment is cloud-enabled.",
            "Explicitly report whether the local source, the cloud source, or both had matches.",
            "Fetch inspect, context, bundle, and reproduction artifacts before editing code."
          ]
        }
      ]
    },
    null,
    2
  )}\n`;
}

export function buildConnectionConfig(): string {
  return `${JSON.stringify(
    {
      mode: "local-only",
      cloud_project_id: null,
      cloud_base_url: null,
      environments: {
        local: { delivery: "local-only" },
        development: { delivery: "local-only" },
        staging: { delivery: "local-only" },
        production: { delivery: "local-only" }
      }
    },
    null,
    2
  )}\n`;
}

export function buildManagedGitignoreSection(): string {
  return `${MANAGED_GITIGNORE_LINES.join("\n")}\n`;
}
