# Data Schemas — DebugBundle

Version: v1
Last updated: 2026-06-15

---

## 0. Event Envelope Schema

SDK ingestion events use the canonical `EventEnvelopeSchema` exported by `packages/shared-types`.

Top-level envelope fields are strict. SDKs may include optional application metadata in `context`, but must not add ad-hoc root fields such as `sdk_language`.

```json
{
  "schema_version": "2026-03-01",
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "backend_exception",
  "sdk_name": "@debugbundle/sdk-node",
  "sdk_version": "1.2.0",
  "service": {
    "name": "checkout-api",
    "runtime": "node",
    "framework": "express",
    "environment": "production"
  },
  "occurred_at": "2026-06-19T08:00:00.000Z",
  "correlation": {
    "request_id": "req_123",
    "trace_id": "trace_123"
  },
  "context": {
    "tenant": "acme",
    "route_template": "/orders/{id}"
  },
  "payload": {}
}
```

Rules:
1. `payload` is closed per `event_type`; SDKs must not put arbitrary app context into event payloads.
2. Cross-cutting app or framework context belongs in optional envelope `context`.
3. Correlation identifiers belong in optional envelope `correlation`. SDKs may emit sparse correlation objects and may omit unknown fields.
4. Compatibility normalization may accept older installed SDK shapes, but new SDK releases must emit the canonical envelope directly and validate emitted events against this contract.

## 1. Bundle Schema

The canonical debugging artifact. A bundle is a **captured image in time** of a debugging-relevant failure or improvement signal. It must be portable, self-explaining, agent-readable, and support partial/optional contexts.

### Versioning Model

**Envelope versioning:** `bundle_version: 1` (integer). Bumps only when the overall contract changes in a major way (layout changes, required semantics change substantially, or major structural compatibility breaks).

**Context block versioning:** Each context block contains `version: 1` (integer) inside the block itself. This allows individual blocks to evolve independently without forcing a whole-bundle version change.

**Compatibility rules:**
1. Unknown context blocks must be ignored safely by consumers.
2. Missing context blocks are allowed.
3. Additive fields should be preferred over breaking changes.
4. A context block version bump should happen only when that block's meaning or structure changes incompatibly.
5. A new optional context block does not require a new `bundle_version`.

### Full Top-Level Structure

```json
{
  "bundle_version": 1,
  "bundle_id": "bnd_42",
  "bundle_type": "failure | improvement",
  "captured_at": "ISO8601",

  "sdk": {
    "name": "debugbundle-node",
    "version": "0.1.0"
  },

  "project": {
    "id": "proj_123",
    "slug": "main-app",
    "environment": "production"
  },

  "service": {
    "id": "svc_1",
    "name": "checkout-api",
    "runtime": "node",
    "framework": "nextjs",
    "version": "2026.03.09.1",
    "region": "eu-west-1"
  },

  "signal": {
    "signal_id": "sig_123",
    "signal_type": "exception | fatal_error | request_failure | frontend_exception | warning | deprecation | performance_issue | retry_loop | slow_query",
    "severity": "low | medium | high | critical",
    "fingerprint": "string",
    "first_seen_at": "ISO8601",
    "last_seen_at": "ISO8601",
    "occurrence_count": 238,
    "source_event_types": ["backend_exception", "request_event", "log_event"]
  },

  "summary": {
    "title": "string (short)",
    "description": "string (compact, factual)",
    "likely_cause": "string | null",
    "confidence": 0.87,
    "recommended_action": "string | null",
    "severity": "low | medium | high | critical",
    "error_type": "string | null",
    "error_message": "string | null",
    "first_application_frame": {
      "file": "string | null",
      "line": 0,
      "function": "string | null"
    },
    "primary_signal": "string | null",
    "signals": {
      "new_deploy": false,
      "regression_suspected": false,
      "customer_visible": false
    }
  },

  "impact": {
    "affected_users_estimate": 73,
    "affected_requests_estimate": 238,
    "business_criticality": "low | medium | high | critical",
    "customer_visible": true,
    "regression_suspected": true
  },

  "context": {
    "error": {
      "version": 1,
      "name": "string",
      "message": "string",
      "stack": "string",
      "handled": false,
      "top_frames": ["checkout.ts:42", "router.ts:19"]
    },

    "request": {
      "version": 1,
      "method": "string",
      "path": "string",
      "route_template": "string | null",
      "query": {},
      "headers": {},
      "body": {},
      "request_id": "string | null"
    },

    "response": {
      "version": 1,
      "status_code": 500,
      "duration_ms": 122,
      "headers": { "content-type": "application/json" },
      "body": { "error": "internal_server_error" }
    },

    "logs": {
      "version": 1,
      "items": [
        {
          "level": "string",
          "message": "string",
          "timestamp": "ISO8601",
          "attributes": {}
        }
      ]
    },

    "frontend": {
      "version": 1,
      "route_changes": [{ "from": "string", "to": "string", "ts": "ISO8601" }],
      "clicks": [{ "selector": "string", "label": "string", "ts": "ISO8601" }],
      "form_submissions": [{ "form": "string", "fields": {}, "ts": "ISO8601" }],
      "console_logs": [],
      "network_requests": [{
        "method": "string",
        "url": "string",
        "status": 0,
        "ts": "ISO8601",
        "duration_ms": 0,
        "caller_trace": ["getSession (api.ts:21)"],
        "response_body": { "error": "string" },
        "request_body": {},
        "response_headers": { "content-type": "application/json" },
        "response_content_length": 0
      }],
      "exceptions": [],
      "dom_context": { "mode": "lightweight", "html_excerpt": "string" }
    },

    "environment": {
      "version": 1,
      "os": "string | null",
      "host": "string | null",
      "container_id": "string | null"
    },

    "deploy": {
      "version": 1,
      "commit_sha": "string | null",
      "deploy_version": "string | null",
      "branch": "string | null",
      "deployed_at": "ISO8601 | null",
      "regression_window": "boolean | null"
    },

    "runtime": {
      "version": 1,
      "name": "node | php | python | browser-js | unknown",
      "runtime_version": "string | null",
      "platform": "string | null",
      "arch": "string | null",
      "pid": 123,
      "cwd": "string | null",
      "uptime_sec": 123.45,
      "hostname": "string | null",
      "thread_id": "string | number | null",
      "framework": "string | null",
      "framework_version": "string | null",
      "memory": {
        "rss": 0,
        "heap_total": 0,
        "heap_used": 0,
        "external": 0,
        "peak": 0
      },
      "framework_extras": {}
    },

    "git": {
      "version": 1,
      "commit": "string | null",
      "commit_short": "string | null",
      "branch": "string | null",
      "repo": "string | null",
      "dirty": false,
      "source": "config | env | local | unknown"
    },

    "dependencies": {
      "version": 1,
      "items": [
        { "name": "string", "status": "ok | degraded | failed | unknown", "notes": "string | null" }
      ]
    },

    "probe_data": {
      "version": 1,
      "items": [
        {
          "label": "string",
          "data": {},
          "timestamp": "ISO8601",
          "activation_id": "uuid | null"
        }
      ]
    },

    "device": {
      "version": 1,
      "user_agent": "string | null",
      "browser": { "name": "string | null", "version": "string | null" },
      "os": { "name": "string | null", "version": "string | null" },
      "device_type": "desktop | mobile | tablet | unknown",
      "screen": { "width": 0, "height": 0 },
      "viewport": { "width": 0, "height": 0 },
      "device_pixel_ratio": 2.0,
      "touch_capable": true,
      "language": "string | null",
      "connection_type": "string | null",
      "color_scheme_preference": "light | dark | no-preference | null"
    }
  },

  "reproduction": {
    "possible": true,
    "confidence": 0.87,
    "reason": "string",
    "artifacts": {
      "curl": "string",
      "httpie": "string",
      "json_spec": { "method": "string", "url": "string", "headers": {}, "query": {}, "body": {} }
    },
    "feasibility_reference": {
      "standard_http_bugs": "high",
      "frontend_interaction_plus_failing_request": "medium-high",
      "background_jobs": "medium",
      "race_conditions": "low",
      "external_outage_timing": "low-medium"
    }
  },

  "verification": {
    "verification_type": "string | null",
    "synthetic": false,
    "local_verified": true,
    "production_verified": true
  },

  "links": {
    "self": "string",
    "reproduction": "string",
    "incident": "string",
    "project": "string",
    "docs": "string"
  },

  "redaction": {
    "redacted": true,
    "fields": ["context.request.headers.authorization", "context.frontend.form_submissions[0].fields.email"],
    "notes": "string"
  },

  "metadata": {
    "created_at": "ISO8601",
    "updated_at": "ISO8601",
    "generator_version": "string",
    "generation_number": 1
  }
}
```

### Top-Level Additions (vs prior draft)

| Field | Purpose |
|-------|---------|
| `captured_at` | ISO8601 timestamp of the **primary signal event** (`occurred_at` of the triggering error/exception). Not the bundle generation time (that is `metadata.created_at`). |
| `sdk.name` | SDK package that captured the events (e.g., `debugbundle-node`, `debugbundle-python`, `@debugbundle/sdk-browser`). |
| `sdk.version` | SDK version that captured the events. Helps correlate SDK upgrades with bundle quality changes. |

### Summary Derivation Logic

All `summary` fields are **derived at bundle generation time** from existing context. They are not stored separately.

| Field | Derived from |
|-------|-------------|
| `severity` | `signal.severity` |
| `error_type` | `context.error.name` |
| `error_message` | `context.error.message` |
| `first_application_frame` | Stack parsing — top application frame from `context.error.stack` |
| `primary_signal` | `signal.signal_type` |
| `signals.new_deploy` | Deploy correlation / `context.deploy.regression_window` |
| `signals.regression_suspected` | `impact.regression_suspected` |
| `signals.customer_visible` | `impact.customer_visible` |

### Context Block Reference

#### `context.environment` — Host/Infrastructure

Describes the host/infrastructure where the service runs. Correlation identifiers (`trace_id`, `session_id`, `user_id_hash`) belong on the event envelope's `correlation` block, not here.

| Field | Type |
|-------|------|
| `os` | string or null |
| `host` | string or null |
| `container_id` | string or null |

#### `context.runtime` — Runtime/Process State

Describes the executing runtime and process state at capture time. Distinct from `environment` (host-level).

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Normalized: `node`, `php`, `python`, `browser-js`, `unknown` |
| `runtime_version` | string or null | Exact runtime version (e.g., `22.2.0`) |
| `platform` | string or null | OS/platform |
| `arch` | string or null | CPU architecture |
| `pid` | number or null | Process ID |
| `cwd` | string or null | Working directory |
| `uptime_sec` | number or null | Process uptime |
| `hostname` | string or null | Host/container hostname |
| `thread_id` | string, number, or null | Thread/worker identifier |
| `framework` | string or null | Detected framework (e.g., `nextjs`, `express`, `django`) |
| `framework_version` | string or null | Framework version |
| `memory` | object or null | `{ rss, heap_total, heap_used, external, peak }` — best-effort runtime memory stats |
| `framework_extras` | object or null | Optional framework-specific context (see below) |

**Omission rule:** If a field cannot be determined, omit it or set to `null`.

**`framework_extras`:** Optional, best-effort, namespaced inside `framework_extras`. Documented shape per runtime/framework is available in the bundle schema addendum but not required for bundle validity. Typical fields: `route`, `handler`, `middleware[]`, `render_mode`, `task_name`, `queue`.

#### `context.git` — Source/Revision Metadata

Describes the git/source state associated with the running build.

| Field | Type | Notes |
|-------|------|-------|
| `commit` | string or null | Full commit SHA |
| `commit_short` | string or null | Short commit SHA |
| `branch` | string or null | Branch or ref name |
| `repo` | string or null | Repository identifier |
| `dirty` | boolean | Meaningful primarily in development/local |
| `source` | string | How git metadata was determined: `config`, `env`, `local`, `unknown` |

**Collection priority:** SDKs should populate in order: (1) explicit application config, (2) CI/CD environment variables, (3) local `.git` inspection, (4) omit / mark `unknown`.

**Relationship with `context.deploy`:** Both blocks coexist. `deploy` answers "what release is active?" (`deploy.version`, `deploy.deployed_at`). `git` answers "what source revision is this code from?" (`git.commit`, `git.branch`). They may overlap on `commit_sha`/`commit` and `branch` — that is expected.

#### `context.device` — Client Device/Browser Metadata

Describes the end-user's device and browser environment. Populated by browser SDKs only. Backend SDKs omit this block.

| Field | Type | Notes |
|-------|------|-------|
| `user_agent` | string or null | Raw `navigator.userAgent` string |
| `browser` | object | `{ name, version }` — parsed from UA or `navigator.userAgentData` |
| `os` | object | `{ name, version }` — client operating system |
| `device_type` | string | `desktop`, `mobile`, `tablet`, or `unknown` — derived from UA |
| `screen` | object | `{ width, height }` — `screen.width` × `screen.height` (physical pixels) |
| `viewport` | object | `{ width, height }` — `window.innerWidth` × `window.innerHeight` (CSS pixels) |
| `device_pixel_ratio` | number or null | `window.devicePixelRatio` |
| `touch_capable` | boolean or null | `navigator.maxTouchPoints > 0` |
| `language` | string or null | `navigator.language` (BCP 47 tag, e.g. `en-US`) |
| `connection_type` | string or null | `navigator.connection.effectiveType` if available (e.g. `4g`, `3g`) |
| `color_scheme_preference` | string or null | `light`, `dark`, `no-preference`, or `null` — from `prefers-color-scheme` media query |

**Privacy note:** The raw `user_agent` string is included for debugging but subject to normal redaction rules. SDKs must not collect fine-grained hardware identifiers (GPU model, serial numbers, etc.).

**Collection rule:** Browser SDKs collect device context once per session (on `init()`) and attach it to all outgoing events. Values are snapshot — they do not update mid-session if the user resizes the window.

**Relationship with `context.runtime`:** `runtime` describes the executing JavaScript runtime (`browser-js`, memory stats, framework). `device` describes the physical/logical device and browser environment. Both blocks coexist for frontend events.

**Relationship with `frontend_exception.browser`:** The `frontend_exception` payload also includes a `browser` field at the event level. When `context.device` is present on the bundle, it is the authoritative source for browser and device info. The `frontend_exception.browser` field is populated from the same source and they will always agree.

#### Array-Wrapped Blocks

`logs`, `dependencies`, and `probe_data` use a wrapped object form for uniform block-level versioning:

```json
{
  "version": 1,
  "items": [...]
}
```

### Rules
- All top-level fields present unless explicitly optional
- Missing values represented as `null`, not omitted
- `context.error` may be `null` for improvement bundles
- `context.frontend` subfields may be empty arrays or `null`
- `context.runtime`, `context.git`, `context.device` are optional blocks — omit when unavailable
- DOM context must remain lightweight
- Sensitive form fields must be redacted
- User identifiers must be hashed or privacy-safe
- `confidence` always numeric (0–1)
- Large blobs avoided unless necessary
- `generation_number` starts at 1 and increments each time the bundle is regenerated for the same incident (see AMB-12). One active bundle per incident — only the latest is retained.

### Design Goals

The bundle schema optimizes for:

1. **Fast machine parsing** — flat structure, no deep nesting
2. **Minimal ambiguity** — explicit types, no overloaded fields
3. **Stable field names** — no renaming without a version bump
4. **Compact but sufficient context** — everything needed, nothing more
5. **Clear redaction signaling** — `redaction` section always present
6. **Support for agent workflows** — deterministic, numeric confidence, explicit nulls
7. **Support for future schema evolution** — integer version fields, additive-safe design, per-context versioning
8. **Fast debugging entrypoint** — `summary` block gives agents instant understanding without deep traversal

### Business Criticality Assignment

| Value | When to assign |
|-------|---------------|
| `critical` | Customer data loss, revenue impact, or security breach |
| `high` | Core feature broken for many users |
| `medium` | Degraded UX, non-critical path failures |
| `low` | Edge cases, cosmetic issues, rare paths |

### Improvement Bundle Differences

An improvement bundle uses the same top-level structure as failure bundles, with these differences:

- `bundle_type` = `"improvement"`
- `context.error` is typically `null`
- `signal.signal_type` is one of: `warning`, `deprecation`, `performance_issue`, `retry_loop`, `slow_query`
- `reproduction.possible` is more often `false`
- `summary.recommended_action` focuses on optimization or prevention rather than bug fixes

This structural similarity is intentional — agents treat both bundle classes consistently.

Not every improvement opportunity has a standalone improvement bundle artifact. Incident-derived opportunities such as `recurring_incident` and `post_deploy_regression` carry `related_incident_ids` and should route agents to the existing failure bundles for those incidents instead of duplicating the same debugging context. When every related incident is resolved, the incident-derived opportunity is resolved automatically.

### Schema Evolution Rules

- New required fields require a `bundle_version` bump (e.g., `1` → `2`)
- New optional fields may be added without a major version break
- New optional context blocks may be added without a `bundle_version` bump
- Individual context blocks may evolve independently via their internal `version` field
- Field meanings must not change silently
- Removed fields require a `bundle_version` bump

---

## 2. Debug Event Envelope Schema

Common wrapper for the canonical debug SDK event family:

```json
{
  "schema_version": "2026-03-01",
  "event_id": "uuid",
  "event_type": "backend_exception | request_event | log_event | frontend_breadcrumb | frontend_exception | deploy_metadata | error_suppressed | probe_event",
  "event_class": "incident_signal | context_signal | operational_signal",
  "project_token": "dbundle_proj_...",
  "project_id": "uuid",
  "sdk_name": "string",
  "sdk_version": "string",
  "service": {
    "name": "string (required)",
    "runtime": "string",
    "framework": "string",
    "environment": "string (required)"
  },
  "occurred_at": "ISO8601 (required)",
  "correlation": {
    "request_id": "string | null",
    "trace_id": "string | null",
    "session_id": "string | null",
    "user_id_hash": "string | null"
  },
  "payload": {}
}
```

**Required envelope fields:** `schema_version`, `event_id`, `event_type`, `occurred_at`, `sdk_name`, `sdk_version`, `service.name`, `service.environment`, `payload`

**`event_class` assignment:** This field is NOT set by SDKs. It is assigned by the event-normalizer during worker processing based on the following classification rules:

| event_type | Assigned event_class | Notes |
|------------|---------------------|-------|
| `backend_exception` | `incident_signal` | Always |
| `frontend_exception` | `incident_signal` | Always |
| `log_event` | `incident_signal` or `context_signal` | `incident_signal` when `level` is `error`, `fatal`, or `critical`; `context_signal` otherwise |
| `request_event` | `incident_signal` or `context_signal` | `incident_signal` when `response_status` matches the active capture preset's immediate request-failure statuses (`minimal`: `5xx`; `balanced`: `5xx`, `408`, `423`, `424`, `425`, `429`; `investigative`: balanced plus `409`), the project's resolved `immediate_client_error_statuses`, or a matching `immediate_client_error_path_rules` rule; `context_signal` otherwise |
| `frontend_breadcrumb` | `context_signal` | Journey context for exceptions |
| `deploy_metadata` | `context_signal` | Release correlation |
| `error_suppressed` | `operational_signal` | Platform operations only |
| `probe_event` | `context_signal` or `operational_signal` | `context_signal` when flushed with an error (always-on); `operational_signal` when standalone remote-activated |

`event_class` is immutable after normalization (INV-15). It drives billing (Free meters only `incident_signal`), incident eligibility (only `incident_signal` creates incidents), and surfacing rules.

---

## 2a. Analytics Event Envelope Schema

Analytics events are opt-in browser product-usage events. They share the ingestion transport with debug events, but they use a separate processing lane and must never participate in debug event classification, incident grouping, incident alerting, lifecycle webhooks, or GitHub incident automation.

```json
{
  "schema_version": "2026-07-analytics-01",
  "event_id": "uuid",
  "event_type": "analytics_event",
  "project_token": "string (optional)",
  "project_id": "uuid | null (server-assigned optional)",
  "occurred_at": "ISO8601",
  "sdk_name": "@debugbundle/sdk-browser",
  "sdk_version": "semver",
  "service": {
    "name": "string (required)",
    "runtime": "browser",
    "framework": "string | null",
    "environment": "string (required)"
  },
  "correlation": {
    "session_id": "string (required)",
    "visitor_id_hash": "string | null",
    "user_id_hash": "string | null",
    "trace_id": "string | null",
    "deploy_id": "string | null"
  },
  "payload": {
    "kind": "session_start | page_view | route_change | action | funnel_step | conversion | journey_marker | session_summary",
    "signal": {
      "action_key": "string | null",
      "funnel_key": "string | null",
      "step_key": "string | null",
      "conversion_key": "string | null",
      "marker_key": "string | null"
    },
    "route": {
      "path": "string | null",
      "normalized_path": "string | null",
      "title": "string | null"
    },
    "dimensions": {
      "auth_state": "anonymous | authenticated | unknown",
      "device_type": "desktop | mobile | tablet | unknown",
      "browser_family": "string | null",
      "browser_major": "number | null",
      "os_family": "string | null",
      "os_major": "number | null",
      "language": "string | null",
      "locale": "string | null",
      "viewport_bucket": "small | medium | large | unknown",
      "referrer_domain": "string | null",
      "utm_source": "string | null",
      "utm_medium": "string | null",
      "utm_campaign": "string | null",
      "country_code": "string | null",
      "region_code": "string | null"
    },
    "custom_dimensions": {}
  }
}
```

**Required envelope fields:** `schema_version`, `event_id`, `event_type`, `occurred_at`, `sdk_name`, `sdk_version`, `service.name`, `service.environment`, `correlation.session_id`, `payload.kind`, `payload.dimensions`.

**Privacy rules:**

- `event_type` is always `analytics_event`; specific analytics behavior is represented by `payload.kind`.
- `event_class` is not present on analytics events and must not be inferred later.
- `payload.signal` contains bounded aggregation keys only. `action` requires `action_key`; `funnel_step` requires `funnel_key` and `step_key`; `conversion` requires `conversion_key`; `journey_marker` requires `marker_key`.
- `session_id` is required for analytics correlation.
- `visitor_id_hash` is nullable and allowed only for privacy modes that support returning-visitor metrics.
- `user_id_hash` is customer-supplied and must be a privacy-safe hash; SDKs must not derive raw identity.
- Route `path` and `normalized_path` must strip query strings by default before long-term storage.
- Raw user-agent strings, raw IP addresses, form values, raw click text, screenshots, DOM snapshots, precise coordinates, precise location, tokens, secrets, names, emails, phone numbers, and payment data are not analytics fields.
- `custom_dimensions` accepts only bounded low-cardinality values that pass project/tier allowlists and redaction.

Analytics event fields may be derived from the same browser SDK primitives that produce debug breadcrumbs, such as normalized route keys, sanitized action selectors, session ids, and device context. The stored schemas remain separate: debug breadcrumbs and frontend exceptions stay in the debug event family and may feed failure bundles, while `analytics_event` envelopes feed analytics rollups, journey samples, opportunities, and AnalyticsBundle artifacts. Disabling, rejecting, or failing analytics processing must not remove or mutate debug event fields.

### Incident And Deploy Correlation Metadata

- `deploy_id` is retained as a bounded aggregate dimension and on the unique-rollup ledger so deploy comparison inputs do not require raw analytics scans.
- Analytics route-session subjects and debug-event `session_id` values use the same project-scoped SHA-256 subject hash. Optional `trace_id` values are also SHA-256 hashed before correlation metadata is persisted.
- `analytics_incident_correlations` stores only project/incident/event scope, service/environment, occurrence time, and nullable hashed session/trace identifiers. It does not retain raw session ids, raw trace ids, analytics payloads, URLs, or user identity.
- `analytics_incident_session_links` records idempotent incident-to-aggregate-route-session links. A separate `incident_route_session` unique-ledger kind ensures `analytics_route_rollups.linked_incident_sessions` counts each affected route session once even when several incident events or incidents match it.
- Correlation reconciles in either arrival order: a newly grouped incident links existing aggregate route sessions, while a newly inserted or correlation-enriched route session links existing incident correlations.
- Correlation metadata expires with the project aggregate-retention window. Project and incident deletion continue to cascade through the correlation tables.
- Debug incident grouping treats analytics correlation as fail-open enrichment. Correlation storage failures must not prevent incident persistence, bundle generation, alerts, or other existing debug behavior.

---

## 2b. AnalyticsBundleV1 Schema

AnalyticsBundle artifacts summarize an analysis unit such as a funnel dropoff, route-health issue, journey-friction pattern, feature-usage analysis, incident impact, deploy comparison, or conversion path. They are not generated per visit.

```json
{
  "schema_version": "analytics_bundle.v1",
  "bundle_type": "analytics",
  "analysis_kind": "usage_summary | route_health | funnel_dropoff | journey_friction | feature_usage | incident_impact | deploy_comparison | conversion_path",
  "project": {
    "project_id": "uuid",
    "service": "string | null",
    "environment": "string | null"
  },
  "analysis_window": {
    "from": "ISO8601",
    "to": "ISO8601",
    "granularity": "hour | day | week | month"
  },
  "summary": {
    "title": "string",
    "description": "string",
    "confidence": "low | medium | high",
    "severity": "low | medium | high"
  },
  "metrics": {
    "sessions_analyzed": "number",
    "affected_sessions": "number | null",
    "baseline": {},
    "current": {}
  },
  "segments": [],
  "journey_patterns": [],
  "representative_journeys": [],
  "linked_incidents": [],
  "linked_deploys": [],
  "recommendations": [],
  "redaction": {
    "rules_applied": [],
    "omitted_fields": []
  },
  "metadata": {
    "input_fingerprint": "sha256:<hex>"
  }
}
```

**Determinism rules:**

- Same analysis specification plus same rollup/sample/incident/deploy inputs must produce byte-identical deterministic evidence after stable serialization.
- Arrays must be sorted deterministically.
- Representative journeys must be selected through deterministic scoring and tie-breaking.
- Generated representative journeys may be hydrated from retained redacted journey samples referenced by aggregate journey patterns. Hydrated records must remain bounded, use a keyed timeline object for ordered steps, and must not add raw session IDs, raw user identifiers, raw text, URLs with query strings, object-storage keys, or unredacted analytics payloads.
- Wall-clock generation timing belongs in bundle-generation metadata rows, not in deterministic bundle evidence.

**Relationship to `BundleV1`:** `AnalyticsBundleV1` is a separate artifact schema. It does not replace failure or improvement `BundleV1` artifacts and must not be returned from incident failure bundle endpoints.

---

## 3. Event Payload Schemas

### 3.1 `backend_exception`
```json
{
  "name": "string",
  "message": "string",
  "stack": "string",
  "handled": "boolean",
  "request": { "method": "string", "path": "string", "query": {}, "headers": {}, "body": {} },
  "response": { "status_code": 0, "headers": {}, "body": {} },
  "runtime": {
    "version": "string",
    "platform": "string | null, optional",
    "arch": "string | null, optional",
    "pid": "number | null, optional",
    "cwd": "string | null, optional",
    "uptime_sec": "number | null, optional",
    "hostname": "string | null, optional",
    "thread_id": "string | number | null, optional",
    "framework_version": "string | null, optional",
    "memory": "{ rss, heap_total, heap_used, external, peak } | null, optional",
    "framework_extras": "object | null, optional"
  }
}
```

Backend SDKs should fill the optional runtime fields from safe process facts when available. SDKs must not include environment variables in this block.

### 3.2 `request_event`
```json
{
  "method": "string",
  "path": "string",
  "query": {},
  "headers": {},
  "body": {},
  "response_status": 0,
  "duration_ms": 0,
  "route_template": "string",
  "response_headers": {},
  "response_body": {}
}
```

### 3.3 `log_event`
```json
{
  "level": "string",
  "message": "string",
  "attributes": {}
}
```

### 3.4 `frontend_breadcrumb`
```json
{
  "breadcrumb_type": "route_change | click | form_submit | console_log | network_request",
  "route": "string",
  "data": {
    "url": "string",
    "method": "string",
    "status_code": 0,
    "duration_ms": 0,
    "caller_trace": ["function (file.ts:line:col)"],
    "response_body": {},
    "request_body": {},
    "response_headers": { "content-type": "application/json" },
    "response_content_length": 0
  }
}
```
Note: `data` fields shown above are for `network_request` breadcrumbs. Other breadcrumb types have their own data shapes.

### 3.5 `frontend_exception`
```json
{
  "name": "string",
  "message": "string",
  "stack": "string",
  "route": "string",
  "browser": { "name": "string", "version": "string" },
  "browser_event": {
    "kind": "window_error | resource_error",
    "message": "string | null",
    "file_name": "string | null",
    "line_number": "number | null",
    "column_number": "number | null",
    "target": {
      "tag_name": "string | null",
      "source_url": "string | null",
      "attributes": {
        "rel": "string",
        "as": "string",
        "type": "string",
        "media": "string",
        "cross_origin": "string",
        "async": true,
        "defer": false,
        "integrity_present": true
      }
    },
    "page": {
      "url": "string | null",
      "referrer": "string | null",
      "ready_state": "loading | interactive | complete | null",
      "visibility_state": "visible | hidden | prerender | unloaded | null"
    },
    "opaque": true
  },
  "rejection_reason": {
    "kind": "error | string | object | null | undefined | unknown",
    "name": "string",
    "message": "string",
    "preview": "string"
  },
  "device": {
    "user_agent": "string | null",
    "os": { "name": "string | null", "version": "string | null" },
    "device_type": "desktop | mobile | tablet | unknown",
    "screen": { "width": 0, "height": 0 },
    "viewport": { "width": 0, "height": 0 },
    "device_pixel_ratio": 2.0,
    "touch_capable": true,
    "language": "string | null",
    "connection_type": "string | null",
    "color_scheme_preference": "light | dark | no-preference | null"
  },
  "dom_context": { "mode": "lightweight", "html_excerpt": "string" }
}
```

`browser_event` is present when the Browser SDK captured the exception through a browser-native global hook such as `window` `error`. When `opaque` is `true`, the browser did not provide a usable JavaScript `Error` object; inspect `file_name`, `line_number`, `column_number`, `target.source_url`, optional technical `target.attributes`, or optional `page` lifecycle state for the best available source clue.

`rejection_reason` is present when the Browser SDK captured a global `unhandledrejection` event. It preserves a bounded, sanitized description of the original rejection reason so generic messages such as `Unhandled promise rejection` can be triaged without relying only on the fallback exception message.

### 3.6 `deploy_metadata`
```json
{
  "commit_sha": "string",
  "version": "string",
  "branch": "string",
  "environment": "string",
  "deployed_at": "ISO8601"
}
```

### 3.7 `probe_event`
```json
{
  "label": "string",
  "data": {},
  "activation_id": "uuid | null",
  "probe_label_pattern": "string"
}
```

`probe_event` is emitted in two scenarios: (1) **always-on flush** — when an error occurs, all probe ring buffers flush alongside the error event; in this case `activation_id` is `null`; (2) **remote-activated shipping** (paid tiers only) — when a remote activation matches the label, data ships independently with the `activation_id` set. Probe events are NOT fingerprinted or grouped into incidents. They are diagnostic context: if a probe event shares a `trace_id` or falls within the same time window + service as an incident, it is attached to the bundle as `context.probe_data[]`.

---

## 4. Aggregate Suppression Event

Emitted by SDKs when duplicate suppression is active:

```json
{
  "event_type": "error_suppressed",
  "fingerprint": "string",
  "suppressed_count": 0,
  "window_seconds": 30,
  "first_seen": "ISO8601",
  "last_seen": "ISO8601"
}
```

---

## 5. Database Schema (PostgreSQL)

### 5.1 users
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| email | text | UNIQUE NOT NULL |
| name | text | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### 5.2 organizations
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| name | text | NOT NULL |
| plan | text | NOT NULL DEFAULT 'free' |
| stripe_customer_id | text | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### 5.3 organization_members
| Column | Type | Constraints |
|--------|------|-------------|
| organization_id | uuid | FK → organizations, CASCADE |
| user_id | uuid | FK → users, CASCADE |
| role | text | NOT NULL DEFAULT 'owner' |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| PK | (organization_id, user_id) | |

### 5.4 projects
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| organization_id | uuid | FK → organizations, CASCADE |
| name | text | NOT NULL |
| slug | text | NOT NULL |
| environment_default | text | NOT NULL DEFAULT 'production' |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (organization_id, slug) | |

### 5.5 project_tokens
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| token_hash | text | UNIQUE NOT NULL |
| label | text | NOT NULL |
| last_used_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| revoked_at | timestamptz | |

### 5.5a member_tokens
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → users, CASCADE |
| organization_id | uuid | FK → organizations, CASCADE |
| token_hash | text | UNIQUE NOT NULL |
| label | text | NOT NULL |
| last_used_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| revoked_at | timestamptz | |

### 5.5b project_invites
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| email | text | NOT NULL |
| role | text | NOT NULL |
| invited_by_user_id | uuid | FK → users |
| invite_token_hash | text | UNIQUE NOT NULL |
| accepted_at | timestamptz | |
| canceled_at | timestamptz | |
| expires_at | timestamptz | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (project_id, lower(email)) | WHERE accepted_at IS NULL AND canceled_at IS NULL |

### 5.5c oauth_identities
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| provider | text | NOT NULL |
| provider_user_id | text | NOT NULL |
| user_id | uuid | FK → users, CASCADE |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| UNIQUE | (provider, provider_user_id) | |
| INDEX | (user_id, provider) | |

### 5.6 services
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| name | text | NOT NULL |
| runtime | text | |
| framework | text | |
| environment | text | NOT NULL DEFAULT 'production' |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (project_id, name, environment) | |

### 5.7 deployments
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| service_id | uuid | FK → services, SET NULL |
| environment | text | NOT NULL |
| commit_sha | text | |
| version | text | |
| branch | text | |
| deployed_at | timestamptz | NOT NULL |
| metadata | jsonb | NOT NULL DEFAULT '{}' |

### 5.8 incidents
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| service_id | uuid | FK → services, SET NULL |
| environment | text | NOT NULL |
| fingerprint | text | NOT NULL |
| fingerprint_version | text | NOT NULL DEFAULT 'v1' |
| title | text | NOT NULL |
| severity | text | NOT NULL DEFAULT 'medium' |
| status | text | NOT NULL DEFAULT 'open' |
| first_seen_at | timestamptz | NOT NULL |
| last_seen_at | timestamptz | NOT NULL |
| occurrence_count | integer | NOT NULL DEFAULT 1 |
| affected_users_estimate | integer | |
| latest_deployment_id | uuid | FK → deployments, SET NULL |
| spike_detected_at | timestamptz | |
| resolved_at | timestamptz | |
| resolved_by_member_id | uuid | FK → users, SET NULL |
| regressed_at | timestamptz | |
| matched_fields | text[] | |
| bundle_object_key | text | |
| reproduction_object_key | text | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

**Status values:** `open`, `resolved`, `regressed`

**Rolling frequency counters:** Occurrence rates (1m, 5m, 1h, 24h sliding windows) are tracked in Redis sorted sets for real-time spike detection. The `occurrence_count` column is the authoritative durable total. Frequency snapshots are periodically persisted to Postgres (default every 60s) for counter recovery after Redis restart.

| Column | Type | Constraints |
|--------|------|-------------|
| frequency_occurrences_1m | integer | |
| frequency_occurrences_5m | integer | |
| frequency_occurrences_1h | integer | |
| frequency_occurrences_24h | integer | |
| frequency_baseline_1h_per_5m | double precision | |
| frequency_spike_ratio_5m_to_1h | double precision | |
| frequency_has_sufficient_baseline | boolean | |
| frequency_is_spiking | boolean | |
| frequency_snapshot_at | timestamptz | |

**Occurrence sampling (FR-GRP-07):** Raw events are stored in S3-compatible object storage at ingestion. The `incident_events` junction table references all occurrences. Retention is evaluated at write time by `recordIncidentEventRetention`: each event is assigned boolean retention reasons (`retain_first`, `retain_latest`, `retain_after_deploy`, `retain_highest_severity`, `retain_deploy_metadata`). An event is sampled (`is_sampled = true`) when it holds at least one retention reason. When a new event displaces a previously retained event (e.g. a new "latest" replaces the old "latest"), the displaced event's raw S3 blob is deleted and its `is_sampled` flag is cleared. Bundle assembly queries only `is_sampled = true` events via `listIncidentEventReferences`.

**Indexes:**
- `incidents_project_last_seen_idx` on (project_id, last_seen_at DESC)
- `incidents_project_env_service_fingerprint_idx` UNIQUE on (project_id, environment, service_id, fingerprint)
- `incidents_status_idx` on (project_id, status)

### 5.8a availability_checks
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| created_by_user_id | uuid | FK → users, SET NULL |
| name | text | NOT NULL |
| url | text | NOT NULL |
| method | text | NOT NULL, CHECK IN (`GET`, `HEAD`) |
| expected_status_min | integer | NOT NULL DEFAULT `200`, CHECK `100..599` |
| expected_status_max | integer | NOT NULL DEFAULT `399`, CHECK `100..599` |
| timeout_ms | integer | NOT NULL DEFAULT `2500`, CHECK `500..5000` |
| interval_seconds | integer | NOT NULL, CHECK `>= 30` |
| failure_threshold | integer | NOT NULL DEFAULT `3`, CHECK `1..10` |
| recovery_threshold | integer | NOT NULL DEFAULT `2`, CHECK `1..10` |
| environment | text | NOT NULL DEFAULT `production` |
| service_name | text | |
| enabled | boolean | NOT NULL DEFAULT `true` |
| status | text | NOT NULL DEFAULT `unknown`, CHECK IN (`unknown`, `passing`, `failing`) |
| consecutive_failures | integer | NOT NULL DEFAULT `0` |
| consecutive_successes | integer | NOT NULL DEFAULT `0` |
| linked_incident_id | uuid | FK → incidents, SET NULL |
| last_checked_at | timestamptz | |
| next_check_at | timestamptz | |
| claimed_at | timestamptz | |
| last_result_status | text | nullable result-status enum |
| last_result_http_status | integer | |
| last_result_error_kind | text | |
| last_result_error_message | text | |
| last_result_duration_ms | integer | |
| deleted_at | timestamptz | Soft-delete marker for future status-history surfaces |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

**Indexes:**
- `availability_checks_project_created_idx` on `(project_id, created_at DESC)`
- `availability_checks_due_idx` on `(next_check_at, project_id)`
- `availability_checks_claimed_idx` on `(claimed_at)`

### 5.8b availability_check_results
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| check_id | uuid | FK → availability_checks, CASCADE |
| project_id | uuid | FK → projects, CASCADE |
| started_at | timestamptz | NOT NULL |
| completed_at | timestamptz | NOT NULL |
| duration_ms | integer | NOT NULL |
| status | text | NOT NULL, CHECK IN (`success`, `http_status_mismatch`, `timeout`, `dns_error`, `tls_error`, `connection_error`, `redirect_blocked`, `security_blocked`, `internal_error`) |
| http_status | integer | |
| error_kind | text | |
| error_message | text | |
| redirect_count | integer | NOT NULL DEFAULT `0` |
| checked_url_host | text | NOT NULL |
| checked_url_path | text | NOT NULL |
| final_url | text | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Detailed execution history is retained for 30 days and then purged by retention cleanup. Response bodies and raw resolved IP addresses are intentionally not stored.

**Indexes:**
- `availability_check_results_check_started_idx` on `(check_id, started_at DESC)`
- `availability_check_results_project_started_idx` on `(project_id, started_at DESC)`

### 5.8c availability_check_daily_rollups
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| check_id | uuid | FK → availability_checks, CASCADE |
| project_id | uuid | FK → projects, CASCADE |
| day | date | NOT NULL |
| state | text | NOT NULL, CHECK IN (`unknown`, `operational`, `degraded`, `down`, `paused`) |
| total_checks | integer | NOT NULL DEFAULT `0` |
| successful_checks | integer | NOT NULL DEFAULT `0` |
| failed_checks | integer | NOT NULL DEFAULT `0` |
| degraded_checks | integer | NOT NULL DEFAULT `0` |
| avg_duration_ms | integer | |
| first_checked_at | timestamptz | |
| last_checked_at | timestamptz | |
| downtime_seconds | integer | NOT NULL DEFAULT `0` |
| incident_ids | uuid[] | NOT NULL DEFAULT empty array |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | `(check_id, day)` |

Daily rollups are retained for at least 30 days so project status-history surfaces can be layered on later without reshaping the data model.

**Index:** `availability_check_daily_rollups_project_day_idx` on `(project_id, day DESC)`

### 5.9 incident_events
| Column | Type | Constraints |
|--------|------|-------------|
| incident_id | uuid | FK → incidents, CASCADE |
| event_id | uuid | NOT NULL |
| event_type | text | NOT NULL |
| event_class | text | NOT NULL |
| occurred_at | timestamptz | NOT NULL |
| is_sampled | boolean | NOT NULL DEFAULT false |
| retain_first | boolean | NOT NULL DEFAULT false |
| retain_latest | boolean | NOT NULL DEFAULT false |
| retain_after_deploy | boolean | NOT NULL DEFAULT false |
| retain_highest_severity | boolean | NOT NULL DEFAULT false |
| retain_deploy_metadata | boolean | NOT NULL DEFAULT false |
| severity_rank | integer | NOT NULL DEFAULT 0 |
| PK | (incident_id, event_id) | |

`event_class` values: `incident_signal`, `context_signal`, `operational_signal`. Assigned by event-normalizer, immutable after write (INV-15). Used by billing-store to filter Free-tier event counts (`WHERE event_class = 'incident_signal'`).

**Index:** `incident_events_incident_sampled_idx` on (incident_id, is_sampled, occurred_at ASC, event_id ASC)

### 5.10 alert_rules
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| created_by_user_id | uuid | NOT NULL, FK → users |
| service_id | uuid | FK → services, CASCADE |
| channel | text | NOT NULL |
| condition_type | text | NOT NULL |
| severity_min | text | |
| cooldown_seconds | integer | NOT NULL DEFAULT 0 |
| config | jsonb | NOT NULL DEFAULT '{}' |
| is_enabled | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### 5.10a alert_deliveries
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| alert_id | uuid | NOT NULL, FK → alert_rules, CASCADE |
| project_id | uuid | NOT NULL, FK → projects, CASCADE |
| incident_id | uuid | NOT NULL, FK → incidents, CASCADE |
| condition_type | text | NOT NULL |
| dedupe_key | text | NOT NULL |
| notification_key | text | NOT NULL DEFAULT '' |
| channel | text | NOT NULL |
| status | text | NOT NULL |
| payload | jsonb | NOT NULL |
| last_error | text | |
| delivered_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (alert_id, incident_id, dedupe_key) | |

These rows represent immediate non-email alert sends. Email alerts use the digest queue below so bursty incidents can be aggregated before transport delivery.
Exact replay idempotency still keys on `(alert_id, incident_id, dedupe_key)`. Optional cooldown suppression uses `(alert_id, notification_key)` plus recent delivery history and does not merge incidents.

### 5.10b alert_email_digests
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | NOT NULL, FK → projects, CASCADE |
| recipient | text | NOT NULL |
| status | text | NOT NULL |
| next_attempt_at | timestamptz | |
| claimed_at | timestamptz | |
| last_error | text | |
| delivered_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Pending email digests aggregate for a fixed 10-second window per `(project_id, recipient)` before the worker claims them for send.

### 5.10c alert_email_digest_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| digest_id | uuid | NOT NULL, FK → alert_email_digests, CASCADE |
| alert_id | uuid | NOT NULL, FK → alert_rules, CASCADE |
| project_id | uuid | NOT NULL, FK → projects, CASCADE |
| incident_id | uuid | NOT NULL, FK → incidents, CASCADE |
| condition_type | text | NOT NULL |
| dedupe_key | text | NOT NULL |
| notification_key | text | NOT NULL DEFAULT '' |
| payload | jsonb | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (alert_id, incident_id, dedupe_key) | |

Digest-item notification keys follow the same cooldown semantics as immediate deliveries so repeated email notifications can be suppressed without changing per-incident digest dedupe.

### 5.11 agent_webhooks
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| url | text | NOT NULL |
| secret_hash | text | NOT NULL |
| events | text[] | |
| filters | jsonb | NOT NULL DEFAULT '{}' |
| is_enabled | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

### 5.12 webhook_deliveries
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| webhook_id | uuid | FK → agent_webhooks, CASCADE |
| event_name | text | NOT NULL |
| target_url | text | NOT NULL |
| attempt_count | integer | NOT NULL DEFAULT 0 |
| last_response_code | integer | |
| status | text | NOT NULL DEFAULT 'pending' |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| last_attempted_at | timestamptz | |

### 5.13 usage_counters
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| organization_id | uuid | FK → organizations, CASCADE |
| metric | text | NOT NULL |
| period_start | date | NOT NULL |
| period_end | date | NOT NULL |
| value | bigint | NOT NULL DEFAULT 0 |
| UNIQUE | (organization_id, metric, period_start, period_end) | |

### 5.14 probe_activations (Remote Activations — Solo+ Only)
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → projects, CASCADE |
| label_pattern | text | NOT NULL |
| service | text | NOT NULL DEFAULT '*' |
| environment | text | NOT NULL DEFAULT '*' |
| activated_by | uuid | FK → users |
| trigger_token_hash | text | NOT NULL |
| expires_at | timestamptz | NOT NULL |
| trigger_expires_at | timestamptz | NOT NULL |
| deactivated_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |

This table only tracks **remote activations** (Solo+). Always-on probe mode has no server-side state — ring buffers are purely local to the SDK.

**Indexes:**
- `probe_activations_project_active_idx` on (project_id) WHERE deactivated_at IS NULL AND expires_at > now()

**Constraints:**
- `expires_at` must be ≤ `created_at + interval '1 hour'` (passive activation TTL, max 3600s)
- `trigger_expires_at` must be ≤ `created_at + interval '24 hours'` (trigger token TTL, max 86400s)
- `trigger_expires_at` defaults to `expires_at` when `trigger_ttl_seconds` is not provided at creation
- Max concurrent remote activations per project enforced at application level (Free: 0 — 403 on attempt, Solo+: 5)
- `trigger_token_hash` stores SHA-256 hash of the plaintext trigger token (shown once at activation, never stored in plaintext)

### 5.15 capture_policies
| Column | Type | Constraints |
|--------|------|-------------|
| project_id | uuid | PK, FK → projects, CASCADE |
| preset | text | NOT NULL DEFAULT 'minimal' |
| capture_logs | text | |
| capture_request_events | text | |
| capture_breadcrumbs | text | |
| capture_probe_events | text | |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

One row per project. Created on project creation with tier-appropriate defaults (Free: `minimal`, Solo/Team: `balanced`). Nullable override columns (`capture_logs`, etc.) mean "inherit from preset"; non-null means explicit override.

**Preset defaults:**

| Preset | capture_logs | capture_request_events | capture_breadcrumbs | capture_probe_events |
|--------|-------------|----------------------|--------------------|--------------------|
| `minimal` | `error` | `failures_only` | `local_only` | `buffer_only` |
| `balanced` | `warning` | `failures_only` | `exception_only` | `buffer_only` |
| `investigative` | `info` | `all` | `standalone` | `standalone_when_activated` |

**Resolved policy:** For each control, use the explicit override if non-null, otherwise the preset default. This resolved policy is served via `GET /v1/sdk/config` and `GET /v1/projects/{id}/capture-policy`.

### 5.16 capture_rules

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| project_id | text | NOT NULL, FK -> projects, CASCADE |
| name | text | NOT NULL |
| description | text | |
| enabled | boolean | NOT NULL DEFAULT true |
| action | text | NOT NULL, CHECK IN (`demote`, `sample`, `drop`) |
| matcher | jsonb | NOT NULL |
| sample_rate | double precision | Required only when `action = 'sample'` |
| sample_event_class | text | Required only when `action = 'sample'`, CHECK IN (`preserve`, `context`) |
| created_by_user_id | text | |
| created_from_incident_id | text | |
| created_from_event_id | uuid | |
| expires_at | timestamptz | |
| hit_count | integer | NOT NULL DEFAULT 0 |
| last_matched_at | timestamptz | |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Capture rules are project-level manual decisions for known noisy event patterns. `demote` keeps matching events as context, `sample` deterministically retains a fraction of matching events, and `drop` rejects matching events before raw persistence where possible. Active rules are served in `GET /v1/sdk/config` as `capture_rules`.

**Indexes:**
- `capture_rules_project_enabled_idx` on (project_id, enabled)
- `capture_rules_project_updated_idx` on (project_id, updated_at DESC)

### 5.17 github_installations

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| organization_id | uuid | NOT NULL, FK → organizations, CASCADE |
| installation_id | bigint | NOT NULL, UNIQUE |
| account_login | text | NOT NULL |
| account_type | text | NOT NULL, CHECK IN ('Organization', 'User') |
| status | text | NOT NULL, DEFAULT 'active', CHECK IN ('active', 'suspended', 'removed') |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

One row per GitHub App installation. Scoped to one DebugBundle organization. `installation_id` is the GitHub-assigned numeric ID. `status` tracks installation lifecycle from GitHub App webhook events.

### 5.18 project_github_repos

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| project_id | uuid | NOT NULL, UNIQUE, FK → projects, CASCADE |
| installation_id | uuid | NOT NULL, FK → github_installations |
| repo_owner | text | NOT NULL |
| repo_name | text | NOT NULL |
| default_branch | text | NOT NULL, DEFAULT 'main' |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

One primary repo per project, enforced by `UNIQUE` on `project_id`. `installation_id` references the GitHub App installation (not the GitHub numeric ID).

### 5.19 github_dispatch_rules

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| project_id | uuid | NOT NULL, FK → projects, CASCADE |
| name | text | NOT NULL |
| enabled | boolean | NOT NULL, DEFAULT true |
| event_types | text[] | NOT NULL |
| environments | text[] | |
| services | text[] | |
| severity_min | text | CHECK IN ('low', 'medium', 'high', 'critical') |
| bundle_type | text | CHECK IN ('failure', 'improvement') |
| incident_status | text | NOT NULL, DEFAULT 'new_or_reopened', CHECK IN ('new_only', 'reopened_only', 'new_or_reopened') |
| cooldown_seconds | integer | NOT NULL, DEFAULT 300 |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Dispatch rules reuse the same filter field semantics as webhook filters (`event_types`, `environments`, `services`, `severity_min`, `bundle_type`). `incident_status` and `cooldown_seconds` are dispatch-specific. `cooldown_seconds` minimum configurable value is 60.

### 5.20 github_dispatch_deliveries

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| rule_id | uuid | NOT NULL, FK → github_dispatch_rules |
| project_id | uuid | NOT NULL, FK → projects |
| incident_id | uuid | NULL, FK → incidents |
| improvement_opportunity_id | uuid | NULL, FK → improvement_opportunities |
| target_fingerprint | text | NOT NULL |
| status | text | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'delivered', 'failed', 'retrying', 'skipped') |
| attempt_count | integer | NOT NULL, DEFAULT 0 |
| last_attempt_at | timestamptz | |
| last_error | text | |
| github_status_code | integer | |
| dispatch_payload | jsonb | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| dedupe_key | text | NOT NULL |

Exactly one of `incident_id` or `improvement_opportunity_id` must be present. Incident dispatches target a failure incident; hosted improvement dispatches target an improvement opportunity.

**Index:** `github_dispatch_deliveries_rule_dedupe_key_idx` on `(rule_id, target_fingerprint, dedupe_key)` suppresses duplicate delivery intents for the same rule, target lifecycle event, and dedupe key. Cooldown lookups use `target_fingerprint` so incident and hosted improvement dispatches share the same suppression model without requiring fake incident rows.

Delivery statuses: `pending` → `delivered` or `retrying` → `delivered` or `failed`. `skipped` records are non-retryable history rows for dispatches suppressed by DebugBundle-side hourly rate limits. Retry strategy: 1s → 5s → 30s → 2min → 10min (5 attempts). Rules are NOT auto-disabled after failures.

### 5.21 AnalyticsBundle Tables

Analytics storage is aggregate-first. Raw analytics events are short-lived object-storage inputs, not long-term Postgres event rows. Rollups are precomputed counters and summaries keyed by project, time bucket, granularity, route/action/funnel keys, and bounded dimensions; they are the query model for normal analytics reads and must not preserve per-visit raw payloads.

Retention cleanup removes raw analytics objects according to `raw_retention_days`, retained journey samples according to `sample_retention_days`/`expires_at`, generated AnalyticsBundle artifacts/metadata older than `aggregate_retention_months`, and aggregate rollup rows older than `aggregate_retention_months`. In-window rollups remain the normal query model for analytics metrics.

Required table concepts for the AnalyticsBundle implementation:

| Table | Purpose |
|---|---|
| `project_analytics_settings` | Project-scoped analytics enablement, privacy mode, consent requirement, sampling, retention, saved-funnel/custom-dimension limits, and capture toggles |
| `analytics_usage_counters` | Durable internal monthly analytics allowance counters for events, sessions, retained journey samples, and AnalyticsBundle generations |
| `analytics_ingestion_ledger` | Idempotency ledger keyed by project/event id so reprocessing does not double-count rollups |
| `analytics_rollup_uniques` | Idempotency ledger for unique session counts per rollup bucket, dimension hash, route/action/funnel key, and hashed session subject |
| `analytics_session_rollups` | Hourly/daily session, active-user, new/returning visitor, bounce, exit, duration, and pageview aggregates by bounded dimensions |
| `analytics_route_rollups` | Hourly/daily route/page aggregates including pageviews, unique sessions, entrances, exits, bounces, duration buckets, and linked incident sessions |
| `analytics_action_rollups` | Semantic action and feature-usage aggregates by route and bounded dimensions |
| `analytics_funnel_definitions` | Optional saved funnel definitions for named project funnels |
| `analytics_funnel_rollups` | Funnel-step conversion/dropoff/time aggregates by bounded dimensions |
| `analytics_transition_rollups` | Route-to-route transition aggregates for journey/path analysis |
| `analytics_incident_correlations` | Short-lived hashed debug incident session/trace correlation records used only to reconcile aggregate analytics evidence |
| `analytics_incident_session_links` | Idempotent incident-to-route-session links that support incident impact metrics without raw event scans |
| `analytics_journey_samples` | Short-lived retained representative journey sample index pointing to redacted object-storage artifacts; public reads expose only rows with completed artifacts |
| `analytics_opportunities` | Deterministic usage/friction/incident-impact/deploy-comparison opportunities with status, severity, confidence, evidence summary, related incident/deploy ids, and bundle state |
| `analytics_bundle_generations` | On-demand or scheduled AnalyticsBundle generation metadata, input fingerprint, status, object key, and failure reason |

Dimension storage must remain bounded. Built-in dimensions include route, device type, browser family/major, OS family/major, language/locale, viewport bucket, referrer domain, UTM fields, auth state, country/region when enabled, deploy, and approved Team custom dimensions. Arbitrary raw JSON payloads must not be used as the long-term analytics query model.

`project_analytics_settings.approved_custom_dimensions` must remain a JSON array whose length is less than or equal to `max_custom_dimensions`; API, storage, and database constraints all preserve that invariant for full and partial settings updates.

Retained journey sample artifacts use object storage path `analytics-journeys/{project_id}/{sample_id}.json.gz` and are indexed by `analytics_journey_samples`. The worker writes at most one deterministic sample per project/session/UTC day when `journey_sample_rate` includes that session. The artifact schema is intentionally small and redacted:

```json
{
  "schema_version": "analytics_journey_sample.v1",
  "sample_id": "uuid",
  "project_id": "uuid",
  "service": "web",
  "environment": "production",
  "session_id_hash": "sha256:...",
  "visitor_id_hash": "sha256:...",
  "first_seen_at": "ISO8601",
  "last_seen_at": "ISO8601",
  "analysis_tags": ["route_change", "transition:/->/pricing"],
  "dimensions_summary": {},
  "events": []
}
```

`events` is capped at 100 safe journey steps, preserving the first and last portions when a session-day exceeds the cap. Each step may include event id, timestamp, analytics kind, safe route/previous-route objects, semantic action/funnel/marker keys, trace/deploy ids, bounded built-in dimensions, and approved custom dimensions. It must not include raw session IDs, raw user IDs, raw visitor IDs, form values, raw text content, DOM snapshots, screenshots, request/response bodies, raw URLs with query strings/fragments, tokens, emails, names, payment data, or arbitrary application payloads.

Aggregate journey-pattern metric responses may expose up to three retained `sample_ids` for each transition pattern and requested metrics window. These IDs are references into `analytics_journey_samples`; they do not expose object-storage keys, raw session IDs, or unredacted journey payloads, and expired samples must be omitted from responses.

---

## 6. Object Storage Path Conventions

| Artifact | Path Pattern |
|----------|------------|
| Raw events | `raw-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz` |
| Bundles | `bundles/{project_id}/{incident_id}/bundle.json.gz` |
| Reproductions | `reproductions/{project_id}/{incident_id}/reproduction.json.gz` |
| Raw analytics events | `analytics-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz` |
| Analytics journey samples | `analytics-journeys/{project_id}/{sample_id}.json.gz` |
| AnalyticsBundle artifacts | `analytics-bundles/{project_id}/{bundle_generation_id}/analytics-bundle.json.gz` |

---

## 6a. Local File Path Conventions (Browser Relay)

Browser relay events are written to the user's project root under `.debugbundle/`. These paths are local to the user's server, not cloud object storage.

| Artifact | Path | When Used |
|----------|------|-----------|
| Local-only relay events | `.debugbundle/local/events/<timestamp>-<sequence>-<service>.events.json` | Relay in local-only mode (same dir as Node SDK file transport) |
| Connected relay spool | `.debugbundle/local/browser-relay-spool/<timestamp>-<sequence>-<service>.events.json` | Relay in connected durable mode (pre-cloud-forward spool) |

**Connected durable delivery marker:** when a spooled browser relay batch is successfully forwarded to cloud, the relay writes a sidecar marker file next to the spool entry: `<timestamp>-<sequence>-<service>.events.json.delivered`. The spool payload remains the source event batch; the marker file exists only to track delivered-vs-undelivered retention.

**Wire format:** Both paths use the same file format as the Node SDK file transport:
- Filename: `<timestamp>-<sequence>-<service>.events.json` (e.g., `1711036800000-0001-checkout-web.events.json`)
- Contents: JSON array of event envelopes (identical to Node SDK file transport output)
- Write mechanism: atomic temp-file + rename (no partial reads by `debugbundle process`)

**Spool retention (connected durable mode):**
- Delivered spool files: spool entries with a `.delivered` sidecar are pruned after 24 hours (default, measured from the marker mtime)
- Undelivered spool files: spool entries without a `.delivered` sidecar are retained for 7 days (default, configurable TTL, measured from the spool file mtime)

The `.debugbundle/local/browser-relay-spool/` directory is intentionally separate from `.debugbundle/local/events/` so connected relay durability does not create a second local incident-processing stream unless explicitly configured.

---

## 6. Availability Check API Record Schemas

Hosted availability checks are project-scoped external HTTP checks executed by DebugBundle infrastructure. These records back the API, CLI, MCP, and web `Health` tab surfaces.

### 6.1 AvailabilityCheckRecord

```json
{
  "check_id": "uuid",
  "project_id": "uuid",
  "name": "Checkout homepage",
  "url": "https://example.com/health",
  "method": "GET",
  "expected_status_min": 200,
  "expected_status_max": 399,
  "timeout_ms": 2500,
  "interval_seconds": 300,
  "failure_threshold": 3,
  "recovery_threshold": 2,
  "environment": "production",
  "service_name": "frontend",
  "enabled": true,
  "status": "passing",
  "paused_reason": null,
  "organization_plan": "free",
  "consecutive_failures": 0,
  "consecutive_successes": 4,
  "linked_incident_id": null,
  "last_checked_at": "ISO8601 | null",
  "next_check_at": "ISO8601 | null",
  "last_result_status": "success | http_status_mismatch | timeout | dns_error | tls_error | connection_error | redirect_blocked | security_blocked | internal_error | null",
  "last_result_http_status": 200,
  "last_result_error_kind": null,
  "last_result_error_message": null,
  "last_result_duration_ms": 184,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### 6.2 AvailabilityCheckResultRecord

```json
{
  "result_id": "uuid",
  "check_id": "uuid",
  "project_id": "uuid",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "duration_ms": 184,
  "status": "success",
  "http_status": 200,
  "error_kind": null,
  "error_message": null,
  "redirect_count": 0,
  "checked_url_host": "example.com",
  "final_url": "https://example.com/health"
}
```

### 6.3 AvailabilityCheckDailyRollupRecord

```json
{
  "check_id": "uuid",
  "project_id": "uuid",
  "day": "YYYY-MM-DD",
  "state": "operational",
  "total_checks": 288,
  "successful_checks": 288,
  "failed_checks": 0,
  "degraded_checks": 0,
  "avg_duration_ms": 173,
  "first_checked_at": "ISO8601 | null",
  "last_checked_at": "ISO8601 | null",
  "downtime_seconds": 0,
  "incident_ids": []
}
```

### 6.4 AvailabilityCheckTestResult

```json
{
  "normalized_url": "https://example.com/health",
  "result": {
    "status": "success",
    "http_status": 200,
    "duration_ms": 184,
    "error_kind": null,
    "error_message": null,
    "checked_url_host": "example.com",
    "checked_url_path": "/health",
    "checked_url_query": {},
    "final_url": "https://example.com/health",
    "redirect_count": 0
  }
}
```

## 7. Project Profile Schema (profile.json)

```json
{
  "profile_version": "v1",
  "project": {
    "name": "string",
    "repo_url": "string",
    "primary_languages": ["string"],
    "package_managers": ["string"],
    "deployment_targets": ["string"]
  },
  "services": [
    {
      "name": "string",
      "kind": "frontend | backend | worker",
      "runtime": "string",
      "framework": "string",
      "paths": ["string"],
      "owns_routes": ["string"],
      "depends_on": ["string"]
    }
  ],
  "infrastructure": {
    "databases": ["string"],
    "queues": ["string"],
    "object_storage": ["string"],
    "external_services": ["string"]
  },
  "critical_paths": [
    { "name": "string", "owner_service": "string", "notes": "string" }
  ],
  "repo": {
    "root_paths": ["string"],
    "generated_paths": ["string"],
    "do_not_edit_paths": ["string"]
  },
  "developer_workflows": {
    "install": "string",
    "build": "string",
    "test": "string",
    "lint": "string"
  },
  "debugbundle": {
    "profile_owner": "string",
    "last_reviewed_at": "ISO8601",
    "validation_status": "static-analysis-only | agent-validated",
    "skill_path": "string",
    "notes": "string"
  }
}
```

---

## 8. Webhook Event Payload Schema

### 8.1 Bundle Lifecycle Events

Applies to: `bundle.created`, `bundle.updated`, `bundle.resolved`, `verification.passed`, `verification.failed`, `improvement_bundle.created`

```json
{
  "event_type": "string",
  "occurred_at": "ISO8601",
  "project_id": "string",
  "bundle_id": "string",
  "bundle_type": "failure | improvement",
  "severity": "low | medium | high | critical",
  "service": "string",
  "environment": "string",
  "verification": "boolean",
  "summary": "string",
  "links": {
    "bundle": "string (API path)",
    "reproduction": "string (API path)"
  }
}
```

### 8.2 Incident Lifecycle Events

Applies to: `bundle.reopened`, `incident.spike_detected`

```json
{
  "event_type": "bundle.reopened | incident.spike_detected",
  "incident_id": "string",
  "project_id": "string",
  "occurred_at": "ISO8601",
  "service_name": "string",
  "environment": "string",
  "severity": "low | medium | high | critical",
  "regression_after_deploy": "boolean",
  "deploy_version": "string | null",
  "deploy_commit_sha": "string | null",
  "deploy_branch": "string | null",
  "deploy_deployed_at": "ISO8601 | null",
  "minutes_since_deploy": "number | null"
}
```

**Deploy correlation fields** are populated when `regression_after_deploy` is `true` (the regression occurred within 24 hours of a deploy). When `false`, all deploy fields are `null`.
