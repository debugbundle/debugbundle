---
name: debugbundle
description: >-
  Investigate runtime incidents, inspect debug bundles, generate reproductions,
  run improvement analysis, and inspect operational controls using the DebugBundle
  CLI and local project scaffold. Use when runtime errors/failures or captured
  operational evidence are relevant: production/customer-facing incidents,
  endpoint downtime, health-check failures, notification or webhook failures,
  probes, noisy captured incidents, or explicit DebugBundle artifact requests. Do not use for
  deterministic local source, UI, layout, copy, calculation, refactor, or
  test-only issues unless runtime evidence is needed.
metadata:
  author: debugbundle
  version: "1.0"
---

# DebugBundle

Use DebugBundle when runtime evidence is relevant to the task.

## When To Use DebugBundle

Use the incident/artifact workflow when the user reports:

- production or customer-facing incidents, runtime failures, regressions, broken deploys, or unknown errors likely to have generated captured events
- endpoint downtime or a failing hosted health check
- missing, duplicate, or failed alerts, webhooks, GitHub dispatches, probes, or other operational delivery
- a specific DebugBundle incident id, bundle, reproduction, report, or noisy captured incident

For deterministic local source-code, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first. Do not check DebugBundle incidents unless the user asks, the issue involves live runtime behavior, or captured evidence is needed.

## Investigation Quickstart

When the issue matches the runtime/incident criteria above, start here before reading arbitrary source files.

1. Run `debugbundle doctor --json` to learn whether the project is local-only or connected and whether the local scaffold is healthy.
2. If `debugbundle doctor --json` reports `mode=local-only`, start with `debugbundle incidents --source local --status active --json`.
3. If `debugbundle doctor --json` reports `mode=connected` and the target environment is cloud-enabled, check both `debugbundle incidents --source local --status active --json` and `debugbundle incidents --source cloud --status active --json` unless the user explicitly scoped the issue to local-only development. For user-reported production incidents, check cloud incidents after local incidents and explicitly report whether each source had matches.
4. Inspect the chosen incident with `debugbundle inspect <incident-id> --source <local|cloud> --json` and `debugbundle explain <incident-id> --source <local|cloud> --json`.
5. Fetch evidence before editing code: `debugbundle bundle <incident-id> --source <local|cloud> --json` and `debugbundle reproduce <incident-id> --source <local|cloud> --json`.
6. If local SDK or relay events have landed but no bundle exists yet, run `debugbundle process --preset <minimal|balanced|investigative> --json` and then list incidents again.

Key local paths:
- `.debugbundle/profile.json` — project map, service paths, and validation state
- `.debugbundle/local/connection.json` — local-only vs connected mode and environment delivery policy
- `.debugbundle/local/events/` — raw local SDK, relay, ingest, and watch event batches
- `.debugbundle/local/state.json` — local incident index, lifecycle state, and bundle paths
- `.debugbundle/bundles/local/` — locally generated bundle artifacts
- `.debugbundle/bundles/local/reproductions/` — local reproduction artifacts
- `.debugbundle/bundles/cloud/` — explicitly fetched cloud artifact cache

## Core Workflow

1. For qualifying runtime/incident work, check DebugBundle incidents first to avoid re-investigating a known failure.
2. Inspect the incident bundle and reproduction artifact before proposing a fix.
3. Run `debugbundle analyze --type improvement --local` after local processing when you need a deterministic change plan.
4. Apply the narrowest fix, then validate it with the repository test workflow from `.debugbundle/profile.json`.
5. When the fix is confirmed, or when the incident was intentionally generated for smoke, verification, or dogfooding, resolve it with `debugbundle resolve <incident-id> [incident-id ...]` or MCP `resolve_incident` / `resolve_incidents` so the needs-attention queue stays actionable.

## Investigation Controls

Use these controls when the user's issue is about observability behavior, notification delivery, targeted evidence gathering, or event noise rather than only application code.

- Availability checks: use hosted health checks for endpoint downtime, public reachability, or project Health tab issues. These are DebugBundle-run external `GET`/`HEAD` checks, not SDK events from the customer app.
- Probes: inspect active probes with `debugbundle probe list <project-id> --json` or MCP `list_active_probes` before activating more probes. Activate probes only when targeted runtime evidence is needed and the user has asked for investigation.
- Capture policy and rules: inspect policy/rules before suppressing noisy incidents. Prefer `debugbundle capture-rule suggest <incident-id> --json` and narrow capture-policy path rules over broad drops or demotions.
- Alerts and webhooks: when the user reports missing, duplicate, or failed notifications, inspect alert config, webhook config, and webhook delivery history before changing application code.

## Availability Checks

- Start with `debugbundle health checks list --project-id <id> --json` or MCP `list_health_checks` to inspect saved checks and plan limits.
- For a failing check, inspect `debugbundle health checks results <check-id> --project-id <id> --json` and `debugbundle health checks daily-rollups <check-id> --project-id <id> --json` before changing code.
- Use `debugbundle health checks test --project-id <id> --url <url> --json` or MCP `test_health_check` before creating or updating a saved check. Tests are side-effect-free: no incidents, retained history rows, or counters.
- Create, update, delete, enable, or disable checks only when the user explicitly asks to change monitoring.
- Availability incidents reuse the normal incident lifecycle. If a check opened an incident, fetch the incident context, bundle, and reproduction before proposing a fix, then resolve only after the endpoint recovers or the intentional verification incident has served its purpose.
- Do not configure private, localhost, metadata-service, credentialed, or state-mutating targets. V1 health-check targets must be external `http`/`https` URLs on safe ports.

## Incident Hygiene

- Treat `open` as actionable work, not historical record.
- Resolve incidents after the fix is verified or after an intentional test incident has served its purpose.
- Reopen or leave open if the failure is still present, the validation is incomplete, or the incident represents a live unresolved problem.
- If a resolved incident regresses, let the platform move it back to `regressed` through normal incident lifecycle behavior.

## Noise Management

When incident evidence shows repeated low-value operational noise rather than a product bug, evaluate whether a scoped capture rule or capture-policy path rule should handle future matches.

- Run `debugbundle capture-rule suggest <incident-id> --json` before creating a manual rule. Apply deterministic suggestions with `debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id <id>` after confirming the scope is safe.
- Prefer project capture rules for operational noise because they are centralized, auditable, and enforced by ingestion and processing. Use SDK `beforeSend` only for app-owned local policy such as final redaction or events that must never leave the runtime.
- Scope frontend noise by structured evidence such as service, environment, `browser_event_kind`, `browser_event_opaque`, `client_kind`, `bot_family`, and message fields. Do not broadly demote generic `Unhandled promise rejection` incidents without bot-scoped or otherwise narrow evidence.
- For expected or intentionally promoted 4xx responses on known routes, use capture-policy client-error path rules instead of promoting all client errors: `debugbundle capture-policy set --client-error-path-rule <status=/path/*@GET>`.

## Notification Delivery

When notification or automation delivery is the reported failure, inspect configuration and delivery records before changing incident logic.

- Alerts route incident notifications to configured channels. Start with `debugbundle alert list --project-id <id> --json` and confirm condition, severity, service, cooldown, channel, and enabled state.
- Webhooks deliver signed lifecycle events to external systems. Start with `debugbundle webhook list --project-id <id> --json`, then inspect `debugbundle webhook deliveries <webhook-id> --project-id <id> --json` before retrying or testing.
- Webhook tests and retries are side-effecting delivery actions. Use them only when validating a destination or replaying an explicit failed delivery.

## Full Documentation

- CLI: `https://debugbundle.com/docs/cli`
- MCP tools: `https://debugbundle.com/docs/mcp/tools`
- Availability checks: `https://debugbundle.com/docs/availability-checks`
- Probes: `https://debugbundle.com/docs/probes`
- Capture policy and rules: `https://debugbundle.com/docs/capture-policy`
- Managing noise: `https://debugbundle.com/docs/managing-noise`
- Alerts: `https://debugbundle.com/docs/alerts` and `https://debugbundle.com/docs/cli/alerts`
- Webhooks: `https://debugbundle.com/docs/webhooks` and `https://debugbundle.com/docs/cli/webhooks`
- API ingestion: `https://debugbundle.com/docs/api/ingestion`

## Profile Validation

Use this task after setup or whenever architecture changes make the static profile stale.

1. Read `.debugbundle/profile.json` and confirm services, frameworks, and workflows match the repository.
2. Fill in missing critical paths, ownership notes, and integration boundaries.
3. Update `debugbundle.validation_status` to `agent-validated` when the profile is trustworthy.

## Setup Verification

- Run `debugbundle doctor` to confirm the profile, connection mode, auth state, and connected API reachability when the project is cloud-enabled.
- Run `debugbundle validate --fix` to restore missing generated setup files without overwriting the profile.
- Run `debugbundle process` after local events land in `.debugbundle/local/events/`.

## Browser Capture and Relay Setup

When the repository has a browser frontend, verify capture end to end instead of stopping at backend SDK setup.

1. Add `@debugbundle/sdk-browser` to each browser app that should capture console, error, navigation, or request context.
2. Initialize the browser SDK from the app entrypoint with the active environment and a browser relay endpoint.
3. Add a backend relay endpoint at `/debugbundle/browser` using the server SDK relay helper when available.
4. For same-origin apps, keep the browser endpoint as `/debugbundle/browser`.
5. For split frontend/backend hosts, configure the browser endpoint to the API host relay URL and require explicit frontend origin allowlisting on the backend.
6. Ensure auth and CSRF middleware allow the relay path while the relay still enforces origin, content type, body size, schema validation, and rate limits.
7. Trigger a local browser smoke event, then run `debugbundle process --json` and confirm the incident or context event appears before marking setup complete.

## References

- CLI reference: `references/cli.md`
- MCP reference: `references/mcp.md`
- Bundle schema: `references/bundle-schema.md`
- Profile enrichment guide: `references/profile-enrichment.md`

## Analysis Recipes

- Improvement recipe: `assets/schemas/improvement-analysis.json`
- Performance recipe: `assets/schemas/performance-analysis.json`
