# Data Schemas — DebugBundle

Version: v1
Last updated: 2026-03-11

---

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

### Schema Evolution Rules

- New required fields require a `bundle_version` bump (e.g., `1` → `2`)
- New optional fields may be added without a major version break
- New optional context blocks may be added without a `bundle_version` bump
- Individual context blocks may evolve independently via their internal `version` field
- Field meanings must not change silently
- Removed fields require a `bundle_version` bump

---

## 2. Event Envelope Schema

Common wrapper for all SDK events:

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
| `request_event` | `incident_signal` or `context_signal` | `incident_signal` when `response_status >= 500`; `context_signal` otherwise |
| `frontend_breadcrumb` | `context_signal` | Journey context for exceptions |
| `deploy_metadata` | `context_signal` | Release correlation |
| `error_suppressed` | `operational_signal` | Platform operations only |
| `probe_event` | `context_signal` or `operational_signal` | `context_signal` when flushed with an error (always-on); `operational_signal` when standalone remote-activated |

`event_class` is immutable after normalization (INV-15). It drives billing (Free meters only `incident_signal`), incident eligibility (only `incident_signal` creates incidents), and surfacing rules.

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

### 5.5b invites
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| organization_id | uuid | FK → organizations, CASCADE |
| email | text | NOT NULL |
| role | text | NOT NULL DEFAULT 'member' |
| invited_by | uuid | FK → users |
| invite_token_hash | text | UNIQUE when present |
| accepted_at | timestamptz | |
| expires_at | timestamptz | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | (organization_id, email) | |

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
| service_id | uuid | FK → services, CASCADE |
| channel | text | NOT NULL |
| condition_type | text | NOT NULL |
| severity_min | text | |
| config | jsonb | NOT NULL DEFAULT '{}' |
| is_enabled | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

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

### 5.16 github_installations

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

### 5.17 project_github_repos

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

### 5.18 github_dispatch_rules

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

### 5.19 github_dispatch_deliveries

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| rule_id | uuid | NOT NULL, FK → github_dispatch_rules |
| project_id | uuid | NOT NULL, FK → projects |
| incident_id | uuid | NOT NULL |
| incident_fingerprint | text | NOT NULL |
| status | text | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'delivered', 'failed', 'retrying') |
| attempt_count | integer | NOT NULL, DEFAULT 0 |
| last_attempt_at | timestamptz | |
| last_error | text | |
| github_status_code | integer | |
| dispatch_payload | jsonb | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Index:** `idx_dispatch_deliveries_cooldown` on `(rule_id, incident_fingerprint, created_at DESC)` supports efficient cooldown lookups ("has this fingerprint been dispatched within cooldown_seconds?").

Delivery statuses: `pending` → `delivered` or `retrying` → `delivered` or `failed`. Retry strategy: 1s → 5s → 30s → 2min → 10min (5 attempts). Rules are NOT auto-disabled after failures.

---

## 6. Object Storage Path Conventions

| Artifact | Path Pattern |
|----------|------------|
| Raw events | `raw-events/{project_id}/{yyyy}/{mm}/{dd}/{hour}/{event_id}.json.gz` |
| Bundles | `bundles/{project_id}/{incident_id}/bundle.json.gz` |
| Reproductions | `reproductions/{project_id}/{incident_id}/reproduction.json.gz` |

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
