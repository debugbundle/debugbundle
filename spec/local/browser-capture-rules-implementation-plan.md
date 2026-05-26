# Browser Capture Rules Implementation Plan

Status: implementation mostly complete
Owner: product/runtime debugging
Created: 2026-05-26
Last updated: 2026-05-26

## Implementation Status

This plan is now ahead of the pure-design stage. The following is implemented in the repository:

- browser `frontend_exception` normalization now fingerprints resource/browser failures more narrowly
- rejected browser `fetch()` calls are captured as failed network breadcrumbs
- shared capture-rule schemas, validation, deterministic evaluation, and suggestion generation exist
- storage, local capture-rule file support, and API CRUD are in place
- `GET /v1/sdk/config` now delivers active capture rules
- ingestion and worker processing enforce `drop`, `sample`, and `demote`
- browser SDK capture-rule parsing and local enforcement are implemented in the JS SDK repo
- Node SDK capture-rule parsing and local pre-buffer enforcement are implemented for `drop` and sampled-out `sample` outcomes in the JS SDK repo
- CLI and MCP parity exist for list/create/update/delete/suggest/create-from-suggestion
- web settings and incident-driven suggestion flows are implemented

Still intentionally incomplete or deferred:

- full manual structured rule authoring/editing in the web UI
- richer backend-local `demote` context preservation for the Node SDK
- local capture-rule enforcement parity for Python, PHP, Go, Ruby, and Java SDKs
- source-of-truth requirement/acceptance document updates and final pre-ship review

## Why This Matters

Browser capture has two competing responsibilities:

- catch real frontend failures early enough that developers and agents can act
- avoid turning expected browser noise into a permanent incident stream

Blocked analytics, tag managers, ad scripts, cross-origin resources, browser extensions, content security policy issues, offline tabs, and privacy tools can all produce browser-level failures. Some are useful context. Some are real production problems. Some are noise that should be ignored after a human has made that call.

The current product shape is close but incomplete:

- ordinary browser breadcrumbs are local/contextual by default
- selected first-party request failures can create incidents
- duplicate suppression and loop protection reduce temporary storms
- opaque browser `window` errors and resource-load errors are preserved as `frontend_exception`

The gap is that `frontend_exception` is incident-driving today, and resource-load errors can be browser or third-party noise. Once a developer identifies a noisy source, the best UX is a one-action way to demote, sample, or drop future matching captures across SDKs and interfaces.

## Product Decision

Add project-level `capture_rules` that are delivered through SDK config and enforced both client-side and server-side.

Capture rules are not personal preferences and not SDK-only local config. They change the shared project incident stream, alert behavior, usage impact, and automation behavior. Therefore they must be project-owned and available through API, CLI, MCP, and web.

The primary human workflow should be:

1. A browser incident appears.
2. The bundle clearly shows why it happened.
3. The user chooses `Demote similar`, `Sample similar`, or `Drop similar`.
4. DebugBundle suggests a safe, narrow rule from the incident evidence.
5. The user confirms the rule.
6. SDKs receive the active rule on config refresh.
7. Future matching events stop opening the same noisy incident.

## Requirement Mapping

This plan touches:

- `FR-SDK-04`: browser exceptions, breadcrumbs, network summaries, and frontend context capture
- `FR-SDK-09` and `FR-SDK-10`: duplicate suppression and loop protection remain temporary in-memory protections
- `FR-SDK-13`, `FR-SDK-24`, `FR-SDK-26`, `FR-SDK-27`, `FR-SDK-28`: sampling, breadcrumb behavior, network filtering, and session caps
- `FR-SDK-29`: device/browser context remains available when events are captured
- `FR-ING-01` through `FR-ING-05`: ingestion must remain lightweight and enforce capture decisions before persistence
- `FR-PROC-01` through `FR-PROC-03`: normalization/fingerprinting must support stable browser-noise grouping
- `FR-GRP-01`, `FR-GRP-08`, `FR-GRP-09`: grouping explainability and fingerprint versioning
- `FR-RET-01` through `FR-RET-05`: incidents and bundles must remain retrievable and actionable
- `FR-CLI-01` and `FR-CLI-04`: CLI parity and JSON output
- Interface parity rule: any capability that matters for automation must be available through API, CLI, and MCP

Acceptance additions should extend:

- `AC-SDK-03`: browser exceptions attach breadcrumbs, but matching capture rules can alter future event handling
- `AC-SDK-04` and `AC-SDK-13`: automatic suppression remains temporary and does not create permanent rules
- `AC-ING-01`: accepted/rejected counts must report capture-rule filtering clearly
- `AC-GRP-01`, `AC-GRP-03`, `AC-GRP-08`: browser resource errors must group and explain consistently

## Goals

1. Give developers a clear manual way to stop known browser noise from creating future incidents.
2. Support `demote`, `sample`, and `drop` actions in V1.
3. Make the fastest path incident-driven: create rules from a bundle or incident, not from blank configuration.
4. Keep first-party application failures incident-driving by default.
5. Preserve third-party failures as useful context when possible.
6. Deliver active rules dynamically through SDK config.
7. Enforce rules server-side as a backstop.
8. Support local-only and connected modes.
9. Preserve API, CLI, MCP, and web parity.
10. Track rule effectiveness through hit counts and last-match timestamps.

## Non-Goals

- Do not automatically create permanent ignore rules from storms.
- Do not hide all browser resource errors by default.
- Do not add a dashboard-only feature.
- Do not require developers to write regex rules as the primary UX.
- Do not make `capture_rules` a replacement for capture policy presets.
- Do not preserve historical noisy incidents silently when a new rule is created; incident resolution remains explicit.
- Do not make rule evaluation depend on non-deterministic wall-clock state except `expires_at`.

## Existing Behavior To Preserve

Automatic suppression exists and should remain:

- local to the SDK process/tab/session
- in-memory only
- temporary
- reset after silence or restart
- represented through `error_suppressed` checkpoints

Manual capture rules are different:

- project-level
- durable
- audit-worthy
- visible and editable
- delivered dynamically to SDKs
- enforced by SDKs and ingestion

This distinction is important. The system should never permanently learn to ignore a production error without explicit user action.

Current local-enforcement state:

- browser SDK: local `demote`, `sample`, and `drop`
- Node SDK: local `drop` and sampled-out `sample`; `demote` still depends on ingestion/worker backstop enforcement
- other SDKs: server-side enforcement only today, with local parity intentionally tracked as a future follow-up

## Current Gaps To Fix First

### 1. Browser `fetch()` Rejections Are Under-Captured

The browser network hook currently handles responses with status codes well, but a rejected `fetch()` can bypass breadcrumb/request capture. This matters for:

- blocked domains
- CORS failures
- offline tabs
- DNS failures
- browser privacy tools
- extension interference

Fix before publishing the next browser SDK update:

- wrap `fetchSource(input, init)` in `try/catch`
- on rejection, create a `network_request` breadcrumb with:
  - `url`
  - `method`
  - `status_code: 0`
  - `duration_ms`
  - `failure_kind: "network_error"`
  - `failure_reason`, sanitized and normalized
  - `caller_trace`
- rethrow the original rejection so app behavior is unchanged
- promote only first-party network failures to standalone `request_event` when policy says so
- keep third-party network failures as breadcrumb/context unless an explicit rule or first-party allowlist changes that behavior

### 2. Browser Exception Fingerprinting Is Too Coarse

The normalizer currently gives unknown/non-request event types a generic normalized message. That makes `frontend_exception` grouping and rule suggestions too broad.

Fix before shipping capture rules:

- normalize `frontend_exception` using:
  - `payload.name`
  - normalized `payload.message`
  - selected top application frames
  - `payload.route`
  - `payload.browser_event.kind`
  - sanitized `payload.browser_event.target.source_url` host/path for resource errors
- introduce a new fingerprint version for browser exception improvements
- include matched fields such as `browser_event.kind`, `resource_host`, `resource_path`, and `route` when applicable
- avoid query strings, fragments, credentials, tokens, and full user-specific URLs in fingerprints

Without this fix, demote/drop rules risk matching too broadly.

## Capture Rule Model

### Rule Actions

V1 supports three actions:

| Action | Meaning | Default Use |
|---|---|---|
| `demote` | Matching events are captured as context, but cannot create or reopen incidents. | Known noise where context may still help future debugging. |
| `sample` | Matching events are probabilistically kept at a configured rate. Kept events retain their normal class unless `sample.event_class_override` is set. | Noisy but sometimes useful signals. |
| `drop` | Matching events are discarded before upload/persistence where possible. | Known third-party noise with low debugging value. |

### Action Semantics

`demote`:

- SDK should convert matching incident-eligible browser events into local context when possible.
- For `frontend_exception`, the SDK should not ship the exception as an incident signal. If there is an active related exception capture, it may attach a compact breadcrumb instead.
- Server enforcement must reclassify matching events as `context_signal` if they arrive anyway.
- Demoted events must not create, reopen, regress, alert, dispatch webhooks, or dispatch GitHub automation.
- Demoted context may still appear in bundles if attached to a later real incident.

`sample`:

- Rule contains `sample_rate` from `0.0` through `1.0`.
- Sampling decision must be deterministic per event to avoid SDK/server disagreement. Use a stable hash of `project_id`, `rule_id`, and `event_id`.
- `sample_rate: 0.0` is equivalent to `drop`, but the UI should guide users to choose `drop` for clarity.
- `sample_rate: 1.0` is equivalent to no sampling, but remains valid for temporarily disabling rate reduction without deleting the rule.
- Optional V1 field `sample_event_class` can be `preserve` or `context`. Default `preserve`.

`drop`:

- SDK discards before buffering when a rule can be evaluated locally.
- Relay and ingestion discard as a backstop.
- Dropped events should be counted in rule telemetry, but not persisted as raw events.
- Ingestion response should use explicit rejected reason `capture_rule_dropped` for directly submitted events.

### Matcher Fields

Rules use structured matchers instead of raw regex as the primary model.

Supported V1 matchers:

```ts
type CaptureRuleMatcher = {
  event_types?: EventEnvelope["event_type"][];
  services?: string[];
  environments?: string[];
  runtime?: Array<"browser" | "node" | "python" | "php" | "java" | "go" | "ruby" | "unknown">;
  first_party?: boolean;
  error_name?: string;
  message_contains?: string;
  message_equals?: string;
  browser_event_kind?: "window_error" | "resource_error";
  resource_url?: UrlMatcher;
  request_url?: UrlMatcher;
  status_codes?: number[];
  status_ranges?: Array<{ start: number; end: number }>;
  fingerprint?: { version: string; value: string };
};

type UrlMatcher = {
  host?: string;
  host_suffix?: string;
  path_prefix?: string;
  path_equals?: string;
};
```

Rules should intentionally avoid arbitrary JavaScript regex in V1. Structured host/path matching is safer to validate, easier to explain in UI, easier to serialize across SDKs, and less likely to leak secrets.

### Rule Record

```ts
type CaptureRuleAction = "demote" | "sample" | "drop";

type CaptureRule = {
  id: string; project_id: string; name: string; description: string | null;
  enabled: boolean; action: CaptureRuleAction; matcher: CaptureRuleMatcher;
  sample_rate: number | null;
  sample_event_class: "preserve" | "context" | null;
  created_by_user_id: string | null; created_from_incident_id: string | null;
  created_from_event_id: string | null; expires_at: string | null;
  hit_count: number; last_matched_at: string | null;
  created_at: string; updated_at: string;
};
```

Validation:

- `name` is required, max 120 characters.
- `description` max 500 characters.
- `action` must be one of `demote`, `sample`, `drop`.
- `sample_rate` is required for `sample`, omitted for other actions.
- `sample_rate` must be `0.0..1.0`.
- `sample_event_class` is valid only for `sample`.
- matcher must include at least one narrowing field besides `event_types`.
- browser resource rules must require at least `browser_event_kind: "resource_error"` plus host/path or fingerprint.
- `expires_at` must be in the future when provided.
- max active rules per project: start with 100.
- server normalizes host to lowercase and strips scheme/query/fragment from URL-derived matchers.

## Suggested Rule Shapes

### Third-Party Analytics Resource Noise

Default suggestion:

```json
{
  "name": "Demote analytics resource errors",
  "action": "demote",
  "matcher": {
    "event_types": ["frontend_exception"], "runtime": ["browser"],
    "browser_event_kind": "resource_error", "first_party": false,
    "resource_url": { "host": "analytics.example.com" }
  }
}
```

Allow user to choose `drop` instead when the source is clearly known third-party telemetry.

### First-Party Chunk Load Failure

Default suggestion:

```json
{
  "name": "Sample chunk load errors",
  "action": "sample",
  "sample_rate": 0.1,
  "sample_event_class": "preserve",
  "matcher": {
    "event_types": ["frontend_exception"], "runtime": ["browser"],
    "browser_event_kind": "resource_error", "first_party": true,
    "resource_url": { "path_prefix": "/assets/" }
  }
}
```

Do not default first-party chunk/resource failures to `drop`. These often represent broken deploys, stale asset caching, or CDN problems.

### Known Opaque Cross-Origin Script Noise

Default suggestion:

```json
{
  "name": "Demote opaque cross-origin script errors",
  "action": "demote",
  "matcher": {
    "event_types": ["frontend_exception"], "runtime": ["browser"],
    "browser_event_kind": "window_error", "first_party": false,
    "message_equals": "Window error"
  }
}
```

If the source host is available, the suggestion must include it. A generic `Window error` rule without host/fingerprint should require an explicit confirmation warning.

### Noisy First-Party Request Status

Default suggestion:

```json
{
  "name": "Sample repeated checkout conflicts",
  "action": "sample",
  "sample_rate": 0.25,
  "sample_event_class": "preserve",
  "matcher": {
    "event_types": ["request_event"], "runtime": ["browser"], "first_party": true,
    "request_url": { "path_prefix": "/checkout" },
    "status_codes": [409]
  }
}
```

Request rules should be narrower than browser resource rules because request statuses are often business-flow dependent.

## Default Behavior After Rules

Before any manual rule:

- first-party `frontend_exception`: incident signal
- first-party resource-load error: incident signal
- third-party resource-load error: incident signal initially, but bundle UI should strongly suggest demotion/drop when source is third-party
- first-party status-bearing request failure: follows capture policy
- third-party status-bearing request failure: breadcrumb/context only by default
- first-party `fetch()` rejection: captured as network breadcrumb and policy-eligible request failure after the under-capture fix
- third-party `fetch()` rejection: breadcrumb/context only by default

After a matching rule:

- `demote`: no incident creation/reopen; context may remain
- `sample`: deterministic sample gate applies before storage and incident side effects
- `drop`: no event storage, no incident side effects, hit counters update best-effort

## Interface Parity

### API

Add project-scoped capture-rule routes:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/projects/{id}/capture-rules` | Browser Session or Member Token | List project capture rules. |
| `POST` | `/v1/projects/{id}/capture-rules` | Owner/admin | Create rule. |
| `GET` | `/v1/projects/{id}/capture-rules/{ruleId}` | Browser Session or Member Token | Read one rule. |
| `PATCH` | `/v1/projects/{id}/capture-rules/{ruleId}` | Owner/admin | Update rule. |
| `DELETE` | `/v1/projects/{id}/capture-rules/{ruleId}` | Owner/admin | Delete rule. |
| `POST` | `/v1/incidents/{id}/capture-rule-suggestion` | Browser Session or Member Token | Generate a suggested rule from incident evidence. |
| `POST` | `/v1/incidents/{id}/capture-rules` | Owner/admin | Create a rule from the selected incident suggestion. |

Response shape for list:

```json
{
  "capture_rules": [],
  "access_mode": "editable"
}
```

Suggestion response:

```json
{
  "suggestions": [
    {
      "suggestion_id": "primary_resource_host_demote",
      "label": "Demote resource errors from analytics.example.com",
      "recommended_action": "demote",
      "confidence": "high",
      "reason": "The primary event is an opaque browser resource-load error from a third-party host.",
      "rule": {}
    }
  ]
}
```

Rules:

- owners/admins can create/update/delete
- members can list and request suggestions, but cannot create/update/delete
- suggestions must be deterministic from stored incident/bundle/event data
- API must never suggest a broad drop rule for first-party failures
- API must audit create/update/delete actions

### SDK Config

Extend `GET /v1/sdk/config`:

```json
{
  "capture_policy": {},
  "capture_rules": [
    {
      "id": "crule_...", "enabled": true, "action": "demote",
      "matcher": {}, "sample_rate": null, "sample_event_class": null,
      "expires_at": null
    }
  ]
}
```

SDK config should only include active, enabled, non-expired rules. Server/API management responses include full metadata.

Delivery:

- browser direct mode: fetched from `/v1/sdk/config`
- browser relay mode: relay should expose/pass through SDK config without browser-held credentials
- backend SDKs: existing remote config polling path
- local-only: relay and local CLI processing should read project-local capture rules from `.debugbundle/capture-rules.json` or profile-backed equivalent

### CLI

Add capture-rule commands:

```text
debugbundle capture-rule list --project <id> [--json]
debugbundle capture-rule get <rule-id> --project <id> [--json]
debugbundle capture-rule create --project <id> --action demote --event-type frontend_exception --browser-event-kind resource_error --host analytics.example.com [--json]
debugbundle capture-rule update <rule-id> --project <id> --enabled false [--json]
debugbundle capture-rule delete <rule-id> --project <id> [--json]
debugbundle capture-rule suggest --incident <id> [--json]
debugbundle demote <incident-id> [--project <id>] [--json]
debugbundle sample <incident-id> --rate 0.1 [--project <id>] [--json]
debugbundle ignore <incident-id> [--project <id>] [--json]
```

Command behavior:

- `demote`, `sample`, and `ignore` are shortcuts over suggestion + confirmation in interactive mode.
- non-interactive mode must require enough flags or return validation guidance.
- `ignore` maps to `drop`; use that user-facing term carefully because it discards future data.
- all commands support `--json`.
- local-only mode writes the local capture-rule store and prints which runtime surfaces can consume it.

### MCP

Add tools:

- `list_capture_rules`
- `get_capture_rule`
- `create_capture_rule`
- `update_capture_rule`
- `delete_capture_rule`
- `suggest_capture_rule_from_incident`
- `demote_incident_future_matches`
- `sample_incident_future_matches`
- `ignore_incident_future_matches`

MCP tools should return the same shapes as API/CLI JSON and include `access_mode`.

### Web

Use existing app-shell, project settings, table, form, dialog/sheet, and shadcn primitives.

Primary UX:

- incident detail and bundle view get contextual actions:
  - `Demote similar`
  - `Sample similar`
  - `Drop similar`
- actions open a focused confirmation dialog or drawer with:
  - suggested rule name
  - match summary in human language
  - action selector
  - sample rate control when action is `sample`
  - optional expiration
  - preview of matched source fields
  - explicit impact text
- default primary action should be `Create rule`
- after creating a rule, offer a separate `Resolve incident` action if the incident remains open

Project settings:

- add `Capture rules` under project settings near `Capture policy`
- use a table, not cards
- columns:
  - rule name
  - action
  - matcher summary
  - status
  - hits
  - last matched
  - expires
  - actions
- row actions:
  - enable/disable
  - edit
  - delete
- members see read-only table and suggestions preview
- owners/admins can manage

Design proposal for implementation approval:

- use a settings table for rule management
- use a dialog for simple incident-derived rule creation
- use a full settings page or drawer for advanced manual rule editing
- use existing form controls: select for action, slider/input pair for sample rate, checkbox/toggle for enabled, date/time input for expiration
- keep helper copy short and impact-focused
- avoid creating regex-builder UI in V1

## Local-Only Behavior

Local-only mode still needs the feature because browser relay and local bundle processing can produce noisy incidents.

Recommended local store:

```text
.debugbundle/capture-rules.json
```

Shape:

```json
{
  "version": 1,
  "rules": []
}
```

Local behavior:

- `debugbundle capture-rule ...` mutates the local file when no cloud project is connected.
- local browser relay reads active rules and includes them in browser SDK config.
- `debugbundle process` applies rules while processing local event files.
- local rule hits are written back best-effort.
- local and cloud rule schemas remain identical.

This keeps local-only and connected behavior conceptually aligned.

## Storage Plan

Pre-production note: bootstrap schema can be updated directly for clean environments, but add an ordered forward migration if current hosted/local validation paths require existing databases to pass readiness.

Add table:

```sql
CREATE TABLE capture_rules (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  action text NOT NULL,
  matcher jsonb NOT NULL,
  sample_rate double precision,
  sample_event_class text,
  created_by_user_id uuid,
  created_from_incident_id uuid,
  created_from_event_id uuid,
  expires_at timestamptz,
  hit_count bigint NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capture_rules_project_enabled_idx
  ON capture_rules(project_id, enabled);
CREATE INDEX capture_rules_project_updated_idx
  ON capture_rules(project_id, updated_at DESC);
```

Domain store:

- add `capture-rule-store.ts` in `packages/storage`
- expose CRUD, active-rule lookup, and hit recording
- keep rule evaluation helper outside storage so SDK/server/local processor can share semantics through `shared-types` or a small capture-rules package if needed

## Rule Evaluation

Evaluation order:

1. Normalize event facts into a safe `CaptureRuleEvaluationContext`.
2. Filter to enabled, active, non-expired rules.
3. Evaluate rules in deterministic order:
   - most specific first
   - then newest first or explicit priority if added
4. Apply first matching terminal action.

Specificity scoring:

- fingerprint match: highest
- exact host/path/status match: high
- host suffix/path prefix: medium
- event type only: invalid for active rules

Avoid priority in the first slice unless implementation needs it. Specificity plus updated time should be enough.

Server-side backstop:

- ingestion evaluates active `drop` and `sample` rules before raw persistence.
- normalization/worker evaluates `demote` before incident grouping when events are still accepted.
- if an SDK misses a rule, server still prevents incident side effects.
- if ingestion cannot evaluate a rule safely, fail open for `demote` and `sample`, but fail closed for invalid rule definitions at write time.

Billing/accounting:

- dropped events do not count as ingested usage because they are rejected before persistence.
- demoted events count according to context-signal rules, not incident-signal rules.
- sampled-out events do not count as ingested usage.
- sampled-in events count according to their final event class.

## SDK Implementation Plan

### Shared Types

Add to `packages/shared-types`:

- capture rule schemas
- matcher schemas
- SDK config `capture_rules` response field
- rule evaluation helper if feasible without pulling browser-only dependencies
- deterministic sample helper

Keep browser URL parsing in SDK/runtime code, but share matcher shape and validation.

### Browser SDK

Files likely involved in `sdks/debugbundle-js/packages/sdk-browser`:

- `src/index.ts`
- `src/hooks.ts`
- `src/runtime.ts`
- `src/types.ts`
- SDK config parsing tests
- browser network/request failure tests
- browser opaque/resource error tests

Required behavior:

- parse `capture_rules` from SDK config
- apply active rules before buffering/shipping
- capture `fetch()` rejections as described above
- preserve app behavior by rethrowing rejected network calls
- demote matching `frontend_exception` to breadcrumb/context when possible
- drop matching events before buffer
- sample matching events deterministically
- expose diagnostics for invalid/ignored rules through `onDiagnostic`, not console noise
- never throw due to malformed rule config

Browser-specific rule context should include:

- event type
- service/environment
- runtime `browser`
- first-party decision
- browser event kind
- sanitized resource host/path
- request host/path
- status code
- message/name
- fingerprint if available from SDK-local equivalent or server-provided suggestion

### Node And Backend SDKs

V1 browser-noise UX depends most on browser SDK, but capture rules should be general enough for backend parity.

Backend SDK behavior:

- parse `capture_rules` from SDK config
- apply `drop` and `sample` before buffering
- apply `demote` where the SDK can avoid standalone incident event emission
- continue relying on server backstop for final event-class mutation
- do not let capture-rule evaluation throw into user code

### Relay Handlers

Relay handlers should:

- expose/pass through SDK config for browser relay mode
- apply server-side project credentials only after browser events are sanitized
- evaluate local/cloud capture rules as a backstop when forwarding browser events
- preserve INV-18 credential isolation and INV-19 origin validation

## Server Implementation Plan

### API Routes

Add `apps/api/src/routes/capture-rules.ts`.

Wire into:

- `server.ts`
- `schemas.ts`
- `api-types.ts`
- `openapi.ts`
- `default-dependencies.ts`
- audit logging

Route implementation should use domain services, not inline SQL.

### Ingestion

Update `apps/api/src/routes/ingestion.ts`:

- load active rules for the project/token
- evaluate `drop` and `sample` before object storage persistence
- include explicit rejected reasons:
  - `capture_rule_dropped`
  - `capture_rule_sampled_out`
- include accepted event count after rule filtering
- pass resolved rule IDs/effects to worker jobs if useful for matched field explainability

Do not perform heavy bundle or incident reads inside ingestion. Suggestion generation belongs to retrieval/action routes, not ingestion.

### Worker/Normalizer

Update:

- `packages/event-normalizer`
- `apps/worker/src/processor.ts`
- incident reason helpers
- request anomaly path as needed

Required behavior:

- improved `frontend_exception` normalization and fingerprinting
- `demote` rules prevent incident creation/reopen/regression
- demoted event classes are immutable once normalized
- matched fields include capture rule effect when a rule changes classification
- bundle summaries should explain demoted context when present

### Bundle Engine

Bundle changes should be additive:

- include capture-rule evidence in metadata/context only if useful
- show when an event was demoted due to a rule
- keep deterministic bundle output
- avoid changing `bundle_version` unless schema requires new required fields

## Suggestion Engine

Implement a deterministic suggestion builder used by API/CLI/MCP/web.

Input:

- incident metadata
- primary event
- latest bundle if available
- normalized matched fields

Output:

- ranked suggestions with rule payloads
- confidence
- reason
- impact text

Suggestion priority:

1. browser `resource_error` with third-party host: suggest `demote`; allow `drop`
2. browser `resource_error` with first-party asset path: suggest `sample`; do not suggest `drop` by default
3. opaque `window_error` with host: suggest `demote`
4. repeated first-party request status on narrow route: suggest `sample`
5. exact fingerprint fallback: suggest `demote` with lower confidence

Safety rules:

- no broad `drop` suggestion for first-party failures
- no generic `frontend_exception` drop rule
- no `Window error` rule without host/fingerprint unless user expands advanced options
- no rule suggestion that includes query strings, fragments, credentials, or tokens

## UI/UX Details

### Incident Detail Actions

Show actions when an incident has enough evidence:

- `Demote similar`
- `Sample similar`
- `Drop similar`

Preferred defaults:

- third-party browser resource error: `Demote similar`
- first-party browser resource error: `Sample similar`
- repeated request anomaly: `Sample similar`
- exact fingerprint with low confidence: `Demote similar`

### Confirmation Dialog

The dialog should show:

- action selector
- concise rule name
- match summary, for example `Browser resource-load errors from analytics.example.com`
- effect summary, for example `Future matches will be kept as context and will not open incidents`
- sample rate control if action is `sample`
- optional expiration
- rule preview as advanced collapsed detail

Button labels:

- primary: `Create rule`
- secondary: `Cancel`
- optional after success: `Resolve incident`

### Project Settings Page

Add a rule table with:

- empty state: `No capture rules`
- loading state
- error state with retry
- read-only state for project members
- disabled row style for disabled/expired rules
- clear destructive delete confirmation

The manual create/edit flow can be a drawer or full page because advanced matching is more complex than an incident-derived suggestion.

### Copy Principles

Use `demote`, `sample`, and `drop` consistently.

Impact copy:

- `Demote`: `Future matches will be kept as context and will not open incidents.`
- `Sample`: `Only a percentage of future matches will be kept.`
- `Drop`: `Future matches will be discarded before storage.`

Avoid implying that demotion fixes the underlying app issue.

## Security, Privacy, And Reliability

- Validate rule payloads with Zod at API boundaries.
- Do not store full URLs with query strings in generated rules.
- Redact or reject credentials in URL-derived matchers.
- Audit create/update/delete.
- Enforce project authorization on every route.
- Keep SDK failures isolated.
- Ensure rule hit counters are best-effort and never block ingestion.
- Do not log raw captured payloads while evaluating rules.
- Keep browser project tokens write-only; rule config delivery must respect relay credential isolation.

## Implementation Slices

### Slice 1: Foundations And Browser SDK Correctness

- [x] Add `frontend_exception` normalization and fingerprint tests.
- [x] Implement improved `frontend_exception` normalization.
- [x] Add browser SDK tests for rejected `fetch()` capture.
- [x] Implement rejected `fetch()` breadcrumb/request handling.
- [x] Update browser docs for blocked requests/resource-load behavior.

Exit criteria: browser resource errors group narrowly enough for rule suggestions, and blocked/rejected `fetch()` calls are captured without changing app behavior.

### Slice 2: Shared Rule Schema And Storage

- [x] Add capture rule schemas/types in shared types.
- [x] Add capture rule table/bootstrap/migration as needed.
- [x] Add storage adapter.
- [x] Add local `.debugbundle/capture-rules.json` schema helper.
- [x] Add unit tests for validation and matching.

Exit criteria: rule records can be created, listed, updated, deleted, and evaluated deterministically.

### Slice 3: API And SDK Config

- [x] Add capture-rule CRUD API routes.
- [x] Add incident suggestion API.
- [x] Extend SDK config response with active rules.
- [x] Update OpenAPI artifact generation.
- [x] Add API integration tests.

Exit criteria: connected SDKs can receive active rules, and API permissions and validation are covered.

### Slice 4: Enforcement

- [x] Enforce `drop` and `sample` in ingestion.
- [x] Enforce `demote` in normalization/worker before grouping.
- [x] Record rule hits best-effort.
- [x] Add billing/accounting tests for dropped, demoted, and sampled events.
- [x] Add local processor enforcement.

Exit criteria: matching events produce the correct incident, storage, and usage effects even if SDK-side filtering misses them.

### Slice 5: SDK Parity

- [x] Browser SDK parses and applies `capture_rules`.
- [x] Node SDK parses and applies `capture_rules` for local `drop` and sampled-out `sample`.
- [x] Relay handlers expose/pass through SDK config and evaluate local rules.
- [x] Add SDK tests for `demote`, `sample`, `drop`.
- [x] Add non-TS SDK follow-up note for Python, PHP, Go, Ruby, and Java local parity.

Exit criteria: active rules reduce network/storage noise before upload where possible, and SDK failures remain isolated.

### Slice 6: CLI And MCP

- [x] Add CLI capture-rule commands.
- [ ] Add CLI incident shortcuts: `demote`, `sample`, `ignore`.
- [x] Add MCP tools.
- [x] Update retrieval client if needed.
- [x] Add CLI/MCP tests and JSON output fixtures.

Exit criteria: automation can manage the feature without dashboard dependency.

### Slice 7: Web UX

- [x] Add project settings capture-rules page/table.
- [x] Add incident/bundle contextual actions.
- [x] Add suggestion confirmation dialog.
- [ ] Add manual create/edit flow.
- [x] Add role-aware read-only state.
- [x] Add responsive and accessibility checks.

Exit criteria: developers can create useful rules from incidents in one short flow, and owner/admin/member behavior is clear.

### Slice 8: Docs And Release Readiness

- [x] Update `spec/requirements.md`.
- [x] Update `spec/acceptance.md`.
- [x] Update `contracts/public-interfaces.md`.
- [x] Update `contracts/sdk-interface.md`.
- [x] Update `contracts/data-schemas.md`.
- [x] Update `rules/domain-invariants.md`.
- [x] Update public SDK docs.
- [x] Update `SYSTEM_OVERVIEW.md` and `ARCHITECTURE_MAP.md`.
- [x] Run pre-ship review.

Exit criteria: source-of-truth docs and generated artifacts match implementation, and quality gates pass.

## Test Plan

Unit tests:

- matcher validation and evaluation
- deterministic sampling and URL sanitization
- frontend exception normalization
- rejected `fetch()` capture
- SDK rule application

Integration tests:

- API CRUD permissions and SDK config active-rule filtering
- ingestion rejects dropped/sampled-out events before persistence
- demoted events cannot create/reopen/regress incidents
- sampled-in events preserve expected event class
- rule hit counters update best-effort
- local processor applies local rules

End-to-end tests:

- browser resource-load incident -> suggestion -> create demote rule -> future same error does not create a new incident
- first-party chunk error -> suggestion defaults to sample, not drop
- third-party request failure remains breadcrumb/context by default
- member can preview but cannot create a rule
- CLI and MCP can create the same rule as web/API

## Remaining Decisions

Track three follow-ups after review: whether local rules stay in `.debugbundle/capture-rules.json` or move into `profile.json`, whether `sample_event_class: "context"` should be exposed in web manual editing, and whether CLI aliases like `demote`, `sample`, and `ignore` are worth adding beyond explicit `capture-rule` commands.
