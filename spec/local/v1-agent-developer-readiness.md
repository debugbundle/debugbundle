# V1 Agent and Developer Readiness Alignment

Status: accepted local implementation guide
Created: 2026-05-11
Accepted: 2026-05-11

This note captures the V1 readiness check for DebugBundle as a product that helps developers and agents detect, inspect, and explain production application failures.

It is intentionally local because it is an alignment artifact, not yet a public contract. Now that the gaps below are resolved, the stable parts should be promoted into the public specs, contracts, docs, CLI help, MCP docs, and launch checklist. The target is production-ready validation during the week of 2026-05-11 and community V1 publication the following week.

## Product Standard

DebugBundle V1 should make this golden path obvious and repeatable:

1. Install the relevant SDK.
2. Run setup or connect the project.
3. Send one test signal.
4. Trigger a real or synthetic 5xx request failure.
5. See an incident.
6. Fetch the incident and bundle from CLI, MCP, or web.
7. Ask an agent why it happened and receive a useful source-linked answer.

The product is V1-ready only if this path is easy for both a human developer and an AI agent to execute without needing DebugBundle internal knowledge.

## Current Foundation

The foundation is solid after the preset-aware request-signal work:

- `request_event` with `response_status >= 500` is an `incident_signal` under every preset.
- balanced also promotes `408`, `423`, `424`, `425`, and `429`; investigative also promotes `409`.
- request events outside the preset's immediate set remain `context_signal`, except repeated preset-enabled contextual failures can open request-anomaly incidents without changing their stored event class.
- ingestion accepts immediate request failures under every capture preset or override, and accepts request-anomaly candidates when the active policy keeps failure context.
- minimal and balanced capture defaults use `capture_request_events: "failures_only"`.
- browser SDK first-party immediate request failures stay as breadcrumbs for timeline context and also emit standalone `request_event` signals; balanced/investigative anomaly candidates can also be emitted as contextual `request_event` signals under `failures_only`.
- backend SDKs and relays accept and preserve immediate request failures even under restrictive capture policy modes, and preserve anomaly candidates when `failures_only` is active.
- worker grouping skips non-incident signals defensively.
- specs, data schemas, SDK contracts, and domain invariants now describe the preset-aware request-failure and anomaly rules.

This closes the earlier product gap where a handled production 5xx could be user-visible but fail to create an incident.

## Existing Alignment

| Readiness area | Existing coverage | Alignment state |
| --- | --- | --- |
| Event semantics | `spec/acceptance.md` AC-EVT-01 and AC-EVT-08a, `contracts/data-schemas.md` event classification table, `rules/domain-invariants.md` INV-15 and INV-16 | Strong |
| SDK behavior | `contracts/sdk-interface.md` browser breadcrumb exception, max-session exception, capture policy integration, relay accepted event types | Strong |
| Capture policy | `contracts/public-interfaces.md`, `contracts/sdk-interface.md`, CLI capture-policy commands | Strong |
| Local setup | `spec/local/local-first-onboarding.md`, `contracts/public-interfaces.md` setup section, CLI `setup`, `doctor`, `validate` | Strong |
| Local verification | CLI and MCP expose `verify local`; CLI synthesizes a local incident-signal batch, processes it, reads incident state, and reads the bundle | Strong |
| Cloud verification | CLI and MCP expose `verify cloud`; active `--trigger-5xx` proof path creates a synthetic hosted 5xx request incident and `--trigger-4xx <status>` proves configured promoted client-error incidents, both reporting bundle status plus classification reason | Strong |
| Smoke flow | CLI and MCP expose `smoke`; current behavior orchestrates local and cloud verification through the shared proof surfaces | Strong for V1 scope |
| Retrieval | API, CLI, and MCP expose list/get incident, bundle, reproduction, logs, resolve, reopen, plus deterministic `incident_reason` on incident retrieval | Strong |
| Agent entry points | MCP exposes setup, retrieval, analyze, probes, services, alerts, webhooks, projects, tokens, capture policy, GitHub, members, billing | Strong |
| Agent explanation | Bundles, matched fields, deterministic `incident_reason`, reproduction artifacts, logs, local `analyze`, and one-call incident context via CLI/MCP/API | Strong |
| Privacy and redaction | shared redaction, SDK sanitizer, browser privacy hardening, data schema redaction block, plus first-run CLI/MCP privacy preview | Strong |
| SDK parity | Node.js, Browser, Python, and PHP parity is visible in the published V1 matrix and aligns on 5xx capture preservation. Full relay handler parity across Node.js, Python, PHP, and WordPress is tracked separately in `spec/local/v1-sdk-relay-parity-plan.md` so foundation-only relay support is not mistaken for V1 completion. | Strong for request-failure parity; relay parity planned |

## Resolved V1 Gaps

### 1. Active Cloud 5xx Verification (Resolved 2026-05-11)

`verify cloud` is no longer passive-only. CLI and MCP now support an active `--trigger-5xx` / `trigger5xx` path that creates a temporary verification project token, sends a synthetic hosted `request_event` with `response_status: 503` through the real ingestion route, revokes the temporary token, polls incident retrieval, and reports incident id, bundle status, classification reason, and suggested next command. They also support `--trigger-4xx <status>` / `trigger4xxStatus` for the same proof path against a configured promoted client-error status such as `403`.

The synthetic cloud event is clearly marked as verification/test data while still flowing through the same ingestion, normalization, classification, grouping, bundle, and retrieval path as a real 5xx `request_event`.

### 2. Explicit Incident Creation Reason (Resolved 2026-05-11)

Incidents now expose a deterministic `incident_reason` in API retrieval, CLI `inspect`, MCP `get_incident`, and active cloud verification output reuse. The reason is derived from primary incident-signal metadata rather than stored as a separate mutable field.

Current shape:

```json
{
  "incident_reason": {
    "kind": "request_failure",
    "description": "request_event matched the immediate request failure incident rule",
    "event_type": "request_event",
    "event_class": "incident_signal",
    "matched_policy": "immediate request failures bypass capture_request_events suppression for the active preset"
  }
}
```

Current deterministic kinds are `backend_exception`, `frontend_exception`, `request_failure`, and `error_log`.

### 3. Agent-Friendly One-Call Incident Context (Resolved 2026-05-11)

CLI, MCP, and API now expose a deterministic one-call incident context surface so an agent does not need retrieval choreography just to answer the first question, "why did this fail?"

Current surfaces:

- API: `GET /v1/incidents/{id}/context`
- MCP: `get_incident_context`
- CLI: `debugbundle explain <incident-id> [--source <local|cloud>] [--json]`

The returned context includes:

- incident metadata,
- primary signal event summary,
- incident creation reason,
- latest bundle status or bundle body,
- reproduction summary,
- related logs,
- deploy metadata,
- grouping fields and fingerprint version,
- visibility explanations for grouping, bundle regeneration, spike detection, and notification cooldown behavior,
- redaction summary,
- suggested next checks.

The surface is deterministic data aggregation only. It does not require an LLM, and the product contract still does not imply that explanation requires AI.

### 4. Public SDK Parity Matrix (Resolved 2026-05-11)

The public docs now publish a verified V1 SDK parity matrix for Node.js, Browser, Python, and PHP, including:

- unhandled exceptions,
- handled exception capture,
- request 5xx capture,
- browser first-party 5xx promotion,
- breadcrumbs,
- relay support,
- remote config and capture policy,
- probes,
- redaction defaults,
- framework integrations,
- local file transport support.

The public docs also now make the preset-aware request-signal rule explicit on the SDK landing page and installation path: immediate request failures remain incident signals across shipped SDKs, browser first-party immediate failures emit standalone `request_event` signals while remaining visible as breadcrumbs, and balanced/investigative anomaly candidates can feed contextual request-anomaly detection under `failures_only`.

### 5. First-Run Privacy Proof (Resolved 2026-05-11)

CLI and MCP now expose a deterministic first-run privacy preview without requiring a real incident or live ingestion traffic:

- CLI: `debugbundle doctor --privacy`
- MCP: `doctor({ privacy: true })`

The preview uses a representative `request_event` with `response_status: 503`, runs it through the shared redaction package, classifies it through the shared event-class logic, and returns:

- redacted field paths,
- omitted field paths (currently empty by default because default redaction replaces sensitive values in-place),
- retained incident-relevant metadata,
- a redacted sample payload,
- whether the sample would create an incident.

### 6. Noise and Grouping Visibility (Resolved 2026-05-11)

The one-call incident context surface now includes a deterministic `visibility` block in API, CLI, and MCP retrieval output.

That block now explains:

- how duplicate 5xx request failures group into the current fingerprint,
- how normalized `route_template`, method, response status, service, and environment participate in that grouping boundary,
- when bundle regeneration happens and the current regeneration precedence (`regression_reopen` -> `deploy_metadata` -> `reproduction_confidence_change` -> `new_context_type`),
- how spike detection is evaluated after grouping and differs from incident creation,
- how webhook and GitHub lifecycle rules use per-rule cooldown windows to suppress repeated notifications for the same incident/event fingerprint.

## CLI Review

The CLI is broadly straightforward and already has the right center of gravity:

- setup and diagnosis: `setup`, `connect`, `doctor`, `validate`
- proof paths: `verify local`, `verify cloud`, `smoke`
- local pipeline: `ingest`, `watch`, `process`, `clean`
- retrieval: `incidents`, `inspect`, `bundle`, `reproduce`, `logs`, `services`
- analysis: `analyze`
- operations: capture policy, probes, alerts, webhooks, GitHub, billing, members, tokens, projects

The main CLI V1 improvement is not breadth. It is proof clarity. A new user should be able to run one command that proves the exact V1 value proposition: "a 5xx request failure became an incident and here is the bundle."

## MCP Review

The MCP surface is already useful because it mirrors the important incident, bundle, setup, project, capture policy, probe, and operational tools.

For V1, the MCP should bias toward agent mental models:

- `verify_local` proves local pipeline health.
- `verify_cloud` proves hosted pipeline health.
- `list_incidents` discovers recent failures.
- `get_incident` retrieves metadata.
- `get_bundle` retrieves the debugging artifact.
- `get_reproduction` retrieves reproduction guidance.
- `get_logs` retrieves related logs.
- `analyze` runs local agent-oriented analysis.

The core setup, proof, retrieval, and explanation affordances are now in place. The remaining work after this note is no longer V1 readability or proof-path coverage; it is launch execution and post-launch expansion.

## Developer-Facing V1 Checklist

Before community V1, the developer path should pass this checklist:

1. A clean project can run `debugbundle setup` successfully.
2. `debugbundle doctor` reports actionable setup health.
3. `debugbundle verify local` creates a local incident and bundle.
4. `debugbundle verify cloud --trigger-5xx`, `debugbundle verify cloud --trigger-4xx <status>`, or equivalent creates a hosted request-failure incident.
5. `debugbundle incidents` shows the created incident.
6. `debugbundle inspect <incident-id>` explains status, severity, grouping, and incident reason.
7. `debugbundle bundle <incident-id>` returns the primary debugging artifact.
8. `debugbundle reproduce <incident-id>` returns explicit reproduction confidence.
9. MCP can perform the same retrieval path without relying on undocumented command behavior.
10. Public docs show the SDK parity matrix and preset-aware request-signal rules.
11. Public docs show what is captured and redacted by default.
12. Dogfooding proves DebugBundle catches DebugBundle production failures.

## Implementation Priority

The V1 readiness gaps tracked in this note are now resolved. Follow-on work should move to launch execution, docs polish, and the post-launch SDK backlog rather than additional readiness-slice plumbing.

## Agent-Facing V1 Checklist

Before community V1, an AI assistant should be able to complete this flow with one or two obvious tool calls per step:

1. Determine whether DebugBundle is installed and configured.
2. Verify local or cloud capture health.
3. List recent open incidents.
4. Fetch one incident and its bundle.
5. Explain why the incident was created.
6. Identify the primary failing request, exception, log, or frontend signal.
7. Identify relevant source paths, route templates, environment, service, and deploy metadata.
8. Report redaction status and missing context.
9. Suggest next debugging checks.
10. Resolve or reopen an incident only when explicitly asked.

## Promotion Plan

When this note is accepted, promote the stable pieces as follows:

- Public product promise and golden path: `spec/product.md`, public docs.
- CLI command contracts: `contracts/public-interfaces.md`, `apps/cli/README.md`, public CLI docs.
- MCP tool contracts: `contracts/public-interfaces.md`, `apps/mcp/README.md`, public MCP docs.
- 5xx incident rationale: `spec/requirements.md`, `spec/acceptance.md`, `contracts/data-schemas.md`, `contracts/sdk-interface.md`, incident docs.
- V1 launch checklist: tracked release checklist or public launch checklist.

## Bottom Line

DebugBundle has the right V1 spine now: request failures, exceptions, logs, breadcrumbs, bundles, reproduction artifacts, CLI retrieval, MCP retrieval, redaction, capture policy, and dogfooding all point in the same direction.

The tracked V1 readiness work in this note is complete: the proof path is now explicit, privacy is previewable on first run, and incident retrieval explains grouping, bundle regeneration, spike behavior, and notification suppression without requiring internal DebugBundle knowledge.
