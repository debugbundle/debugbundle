# Public Interfaces — DebugBundle

Version: v1
Last updated: 2026-05-13

---

## 0. Interface Parity Matrix

Every capability must be available through all applicable interfaces. Operations marked CLI-only are local-environment operations that have no server-side equivalent.

| Operation | API | CLI | MCP | Notes |
|-----------|-----|-----|-----|-------|
| Request email code | `POST /v1/auth/request-code` | — | — | Web-auth bootstrap only |
| Verify email code | `POST /v1/auth/verify-code` | — | — | Web-auth bootstrap only |
| Logout (web session) | `POST /v1/auth/logout` | — | — | Web-auth bootstrap only |
| Current session | `GET /v1/auth/session` | — | — | Web-auth bootstrap only |
| Export account data | `GET /v1/account/export` | — | — | Browser session only, owner only |
| Delete account | `DELETE /v1/account` | — | — | Browser session only, owner only |
| Accept invite | `POST /v1/auth/accept-invite` | — | — | Browser session only |
| GitHub sign-in start | `GET /v1/auth/github/start` | — | — | Browser redirect entry point only |
| GitHub sign-in callback | `GET /v1/auth/github/callback` | — | — | Browser redirect callback only |
| Slack app install URL | `GET /v1/slack/app/install-url` | `slack connect-url` | `get_slack_connect_url` | Returns a browser handoff URL for Team-tier project alert setup |
| Slack app callback | `GET /v1/slack/app/callback` | — | — | Browser OAuth callback only |
| GitHub device auth start | `POST /v1/auth/github/device/start` | — | — | CLI/browserless bootstrap helper |
| GitHub device auth poll | `POST /v1/auth/github/device/poll` | — | — | CLI/browserless bootstrap helper |
| GitHub device auth claim | `POST /v1/auth/github/device/claim` | — | — | Issues the member token after approval |
| GitHub token exchange | `POST /v1/auth/github/token/exchange` | — | — | Exchanges an existing GitHub access token, including `gh auth token`, for a member token |
| Ingest events | `POST /v1/events` | — | — | SDK-only (project token) |
| List incidents | `GET /v1/incidents` | `incidents` | `list_incidents` | |
| Get incident | `GET /v1/incidents/{id}` | `inspect` | `get_incident` | |
| Get incident context | `GET /v1/incidents/{id}/context` | `explain` | `get_incident_context` | Deterministic one-call incident explanation context aggregation |
| Resolve incident | `POST /v1/incidents/{id}/resolve` | `resolve` | `resolve_incident` | Explicit user action |
| Reopen incident | `POST /v1/incidents/{id}/reopen` | `reopen` | `reopen_incident` | Cloud incidents use the API route; local incidents still reopen directly from `.debugbundle/local/state.json` |
| Get bundle | `GET /v1/incidents/{id}/bundle` | `bundle` | `get_bundle` | |
| Get reproduction | `GET /v1/incidents/{id}/reproduction` | `reproduce` | `get_reproduction` | |
| Get logs | `GET /v1/logs` | `logs` | `get_logs` | Query by incident_id |
| List organization members | `GET /v1/organization/members` | `member list` | `list_members` | Browser Session or Member Token, owner only |
| List pending organization invites | `GET /v1/organization/members/invites` | `member invites` | `list_member_invites` | Browser Session or Member Token, owner only |
| Invite organization member | `POST /v1/organization/members/invite` | `member invite` | `invite_member` | Browser Session or Member Token, owner only, Team tier |
| Cancel organization invite | `DELETE /v1/organization/members/invites/{inviteId}` | `member cancel-invite` | `cancel_member_invite` | Browser Session or Member Token, owner only |
| Update organization member role | `PATCH /v1/organization/members/{userId}` | `member update-role` | `update_member_role` | Browser Session or Member Token, owner only |
| Remove organization member | `DELETE /v1/organization/members/{userId}` | `member remove` | `remove_member` | Browser Session or Member Token, owner only |
| List projects | `GET /v1/projects` | `project list` | `list_projects` | Browser Session or Member Token, scoped to member organization |
| Create project | `POST /v1/projects` | `project create` | `create_project` | Browser Session or Member Token, owner only |
| Update project | `PATCH /v1/projects/{id}` | `project update` | `update_project` | Browser Session or Member Token, owner only |
| Delete project | `DELETE /v1/projects/{id}` | `project delete` | `delete_project` | Browser Session or Member Token, owner only |
| Get billing summary | `GET /v1/billing` | `billing get` | `get_billing_summary` | Browser Session or Member Token, owner only |
| Start billing checkout | `POST /v1/billing/checkout` | — | — | Browser Session only, owner only |
| Open billing portal | `POST /v1/billing/portal` | — | — | Browser Session only, owner only |
| Increase capacity now | `POST /v1/billing/capacity/increase` | `billing capacity increase` | `increase_capacity` | Browser Session or Member Token, owner only |
| Schedule capacity reduction | `POST /v1/billing/capacity/scheduled-reduction` | `billing capacity schedule-reduction` | `schedule_capacity_reduction` | Browser Session or Member Token, owner only |
| Cancel scheduled capacity reduction | `DELETE /v1/billing/capacity/scheduled-reduction` | `billing capacity cancel-reduction` | `cancel_capacity_reduction` | Browser Session or Member Token, owner only |
| List project tokens | `GET /v1/projects/{id}/tokens` | `token project list` | `list_project_tokens` | Member token scoped to organization |
| Create project token | `POST /v1/projects/{id}/tokens` | `token project create` | `create_project_token` | Plaintext returned once |
| Revoke project token | `POST /v1/projects/{id}/tokens/{tokenId}/revoke` | `token project revoke` | `revoke_project_token` | |
| List member tokens | `GET /v1/member/tokens` | `token member list` | `list_member_tokens` | Member token scoped to caller |
| Create member token | `POST /v1/member/tokens` | `token member create` | `create_member_token` | Plaintext returned once |
| Revoke member token | `POST /v1/member/tokens/{tokenId}/revoke` | `token member revoke` | `revoke_member_token` | |
| List services | `GET /v1/services` | `services` | `list_services` | |
| Alert CRUD | `POST/GET/PATCH/DELETE /v1/alerts` | `alert list/create/update/delete` | `list_alerts/create_alert/update_alert/delete_alert` | Browser Session or Member Token, scoped to organization/project |
| Project Slack destinations | `GET /v1/projects/{id}/slack/destinations` | `slack list` | `list_slack_destinations` | Browser Session or Member Token, Team tier, reusable Slack channel list for alert setup |
| Test Slack destination | `POST /v1/projects/{id}/slack/destinations/{destinationId}/test` | `slack test` | `test_slack_destination` | Browser Session or Member Token, owner only, Team tier |
| Delete Slack destination | `DELETE /v1/projects/{id}/slack/destinations/{destinationId}` | `slack delete` | `delete_slack_destination` | Browser Session or Member Token, owner only, Team tier |
| Weekly report channel CRUD | `POST/GET/PATCH/DELETE /v1/weekly-report-channels` | `weekly-report list/create/update/delete` | `list_weekly_report_channels/create_weekly_report_channel/update_weekly_report_channel/delete_weekly_report_channel` | Browser Session or Member Token, scoped to organization/project |
| List webhooks | `GET /v1/webhooks` | `webhook list` | `list_webhooks` | Browser Session or Member Token, scoped to organization/project |
| Create webhook | `POST /v1/webhooks` | `webhook create` | `create_webhook` | Signing secret returned once |
| Update webhook | `PATCH /v1/webhooks/{id}` | `webhook update` | `update_webhook` | |
| Delete webhook | `DELETE /v1/webhooks/{id}` | `webhook delete` | `delete_webhook` | |
| Test webhook | `POST /v1/webhooks/{id}/test` | `webhook test` | `test_webhook` | Queues a signed synthetic delivery |
| Webhook deliveries | `GET /v1/webhooks/{id}/deliveries` | `webhook deliveries` | `list_webhook_deliveries` | Statuses: pending, retrying, delivered, failed, disabled |
| Retry webhook delivery | `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` | `webhook retry` | `retry_webhook_delivery` | Resets failed/disabled delivery to retrying |
| Doctor | — | `doctor` | `doctor` | CLI/MCP-only (local env) |
| Validate | — | `validate [--fix]` | `validate` | CLI/MCP-only (local env) |
| Verify local | — | `verify local` | `verify_local` | CLI/MCP-only (local env) |
| Verify cloud | — | `verify cloud` | `verify_cloud` | Uses API internally; `--trigger-5xx`/`trigger5xx` proves hosted 5xx incident creation and `--trigger-4xx <status>`/`trigger4xxStatus` proves configured hosted 4xx incident creation |
| Smoke test | — | `smoke` | `smoke` | CLI/MCP-only |
| Login | — | `login` | — | CLI-only (stores member-token auth state locally; supports member-token, GitHub device, and `gh` bootstrap modes) |
| Setup project | — | `setup` | — | CLI-only (local scaffold generation and relay scaffolding) |
| Ingest local logs | — | `ingest` | — | CLI-only (local log parser pipeline) |
| Watch local logs | — | `watch` | — | CLI-only (local log tail pipeline) |
| Process local events | — | `process` | — | CLI-only (local file transport pipeline) |
| Connect | — | `connect` | — | CLI-only (interactive) |
| Profile validate | — | `profile validate` | — | CLI-only (local files) |
| Profile show | — | `profile show` | — | CLI-only (local files) |
| Profile sync | — | `profile sync` | — | CLI-only (local files) |
| Analyze (local) | — | `analyze` | `analyze` | CLI/MCP-only (local agent-driven) |
| Activate probes (remote) | `POST /v1/projects/{id}/probes/activate` | `probe activate` | `activate_probe` | Browser Session or Member Token, Solo+ only |
| List active probes (remote) | `GET /v1/projects/{id}/probes` | `probe list` | `list_active_probes` | Solo+ only |
| Deactivate probes (remote) | `POST /v1/projects/{id}/probes/deactivate` | `probe deactivate` | `deactivate_probe` | Solo+ only |
| Get capture policy | `GET /v1/projects/{id}/capture-policy` | `capture-policy get` | `get_capture_policy` | Browser Session or Member Token |
| Update capture policy | `PATCH /v1/projects/{id}/capture-policy` | `capture-policy set` | `update_capture_policy` | Browser Session or Member Token, owner only |
| SDK config | `GET /v1/sdk/config` | — | — | SDK-only (project token, includes resolved capture policy) |
| Get GitHub App install URL | `GET /v1/github/app/install-url` | — | — | Browser Session or Member Token, Solo+ only; web convenience route for the install/reconnect CTA, optionally signed with a return path |
| Get GitHub installation | `GET /v1/github/installation` | `github status` | `get_github_status` | Browser Session or Member Token, Solo+ only |
| Disconnect GitHub installation | `DELETE /v1/github/installation` | — | — | Web/API only; mirrors web-initiated installation flow |
| List GitHub repositories | `GET /v1/github/repositories` | `github repos` | `list_github_repositories` | Browser Session or Member Token, Solo+ only |
| Get project GitHub repo | `GET /v1/projects/{id}/github/repo` | `github status` | `get_github_status` | Included in status response; Solo+ only |
| Set project GitHub repo | `PUT /v1/projects/{id}/github/repo` | `github repo set` | `set_project_github_repo` | Browser Session or Member Token, owner only, Solo+ only |
| Remove project GitHub repo | `DELETE /v1/projects/{id}/github/repo` | `github repo remove` | `remove_project_github_repo` | Browser Session or Member Token, owner only, Solo+ only |
| Create dispatch rule | `POST /v1/projects/{id}/github/rules` | `github rules create` | `create_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |
| List dispatch rules | `GET /v1/projects/{id}/github/rules` | `github rules` | `list_github_dispatch_rules` | Browser Session or Member Token, Solo+ only |
| Get dispatch rule | `GET /v1/projects/{id}/github/rules/{ruleId}` | — | — | API convenience; CLI/MCP use list |
| Update dispatch rule | `PATCH /v1/projects/{id}/github/rules/{ruleId}` | `github rules update` | `update_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |
| Delete dispatch rule | `DELETE /v1/projects/{id}/github/rules/{ruleId}` | `github rules delete` | `delete_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |
| List dispatch deliveries | `GET /v1/projects/{id}/github/deliveries` | `github deliveries` | `list_github_deliveries` | Browser Session or Member Token, Solo+ only |
| Retry dispatch delivery | `POST /v1/projects/{id}/github/deliveries/{id}/retry` | `github deliveries retry` | `retry_github_delivery` | Browser Session or Member Token, Solo+ only |
| GitHub App callback | `GET /v1/github/app/callback` | — | — | GitHub App setup URL / post-install redirect handler |
| GitHub App webhook | `POST /v1/github/app/webhook` | — | — | Installation lifecycle events (HMAC-verified) |

---

## 1. HTTP API

Base URL: `https://api.debugbundle.com/v1` (cloud). Self-hosted: configurable.

Auth model:
- Browser session cookie for interactive web-auth and member-authorized web usage
- Bearer member token for CLI, MCP, and automation
- Project token header for ingestion and SDK config

The full auth model is defined in `/spec/auth-architecture.md`.

Member-authorized routes accept either a valid browser session or a valid member token. After principal resolution, both paths must enforce the same authorization rules and execute the same domain behavior.

Stripe checkout and customer-portal billing routes remain browser-session-only interactive surfaces. Billing summary and allowance-capacity management routes now accept owner-scoped member tokens so CLI and future MCP tools can reuse the same domain behavior.

### 1.0a Browser Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/request-code` | None | Request a one-time email code for browser sign-in or first-time signup |
| POST | `/v1/auth/verify-code` | None | Verify a one-time email code and create a browser session |
| POST | `/v1/auth/logout` | Browser Session | Revoke current browser session |
| GET | `/v1/auth/session` | Browser Session | Return current session state or `session: null` when signed out |
| GET | `/v1/account/export` | Browser Session | Export retained organization-account data as a JSON attachment (owner only) |
| DELETE | `/v1/account` | Browser Session | Permanently delete the current organization account after email confirmation (owner only) |
| POST | `/v1/auth/accept-invite` | Browser Session | Accept a pending organization invite for the current signed-in user |
| GET | `/v1/auth/github/start` | None | Start GitHub OAuth and set transient state cookie |
| GET | `/v1/auth/github/callback` | None | Complete GitHub OAuth, issue browser session, and redirect back to the app |
| POST | `/v1/auth/github/device/start` | None | Start GitHub device flow and return the verification URL/code |
| POST | `/v1/auth/github/device/poll` | None | Poll GitHub device-flow progress through DebugBundle |
| POST | `/v1/auth/github/device/claim` | None | Claim the issued member token after device approval completes |
| POST | `/v1/auth/github/token/exchange` | None | Exchange an existing GitHub access token for a DebugBundle member token |

Browser-session bootstrap endpoints exist for the SPA flow only. The separate GitHub CLI bootstrap endpoints are API-backed helpers used by `debugbundle login --github*`, while MCP still reuses the member-token auth state established by the CLI.

`GET /v1/auth/session` returns either `session: null` or a session object with `auth_methods.email`, `auth_methods.github`, and `csrf_token`. Browser-session mutations continue to use `csrf_token` from the same session payload.

`POST /v1/auth/request-code` always returns a generic success payload when the request is valid. Existing accounts can use the code immediately. New accounts are created only after a valid code is verified, and the request endpoint preserves the same response shape so the browser flow does not reveal account existence.

**Request email code:**
```json
{
  "email": "user@example.com",
  "accepted_terms": true
}
```

`accepted_terms` is required and must be `true`. The server records the corresponding `accepted_terms_at` timestamp on account creation.

**Verify email code:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

GitHub sign-in preserves the same first-party browser-session model as email-code auth. The start endpoint redirects to GitHub and sets a transient `SameSite=Lax` OAuth state cookie; the callback validates that state, links or creates the user account through `oauth_identities`, issues the normal session cookie, clears the transient OAuth cookie, and redirects back to the app callback URL.

The CLI bootstrap flow is additive and issues the same member-token credential used by normal CLI/MCP auth. `POST /v1/auth/github/device/start` plus `poll`/`claim` implement the official GitHub device flow. `POST /v1/auth/github/token/exchange` accepts an already-authenticated GitHub access token such as the output of `gh auth token`.

`GET /v1/account/export` returns a JSON attachment covering the retained organization-account record set, including members, projects, tokens, reusable Slack destinations, incidents, audit logs, billing-processing rows, and retained raw-event, bundle, and reproduction artifacts when present in object storage.

`DELETE /v1/account` requires an owner-scoped browser session plus a confirmation body that repeats the signed-in email address:

```json
{
  "email": "owner@example.com"
}
```

- Non-owner session: `403 { "error": "forbidden" }`
- Confirmation email mismatch: `400 { "error": "invalid_confirmation" }`
- User is still the sole owner of another organization: `409 { "error": "other_owned_organizations_exist" }`

**Accept invite request:**
```json
{
  "token": "dbundle_invite_..."
}
```

**Accept invite response:**
```json
{
  "membership": {
    "user_id": "uuid",
    "organization_id": "uuid",
    "role": "member"
  }
}
```

- Missing or invalid browser session: `401 { "error": "invalid_session" }`
- Invalid accept payload: `400 { "error": "invalid_payload" }`
- Missing, expired, or already-consumed invite token: `400 { "error": "invalid_token" }`
- Signed-in user email does not match invite email: `403 { "error": "invite_email_mismatch" }`

### 1.1 Ingestion

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/events` | Project Token | Ingest batched events |

`POST /v1/events` is subject to per-project-token ingestion rate limiting using the active tier capability (`ingestion_rate_per_min`). When the limit is exceeded, the API must reject the batch before persistence and return `429 Too Many Requests` with a `Retry-After` header.

**Request:**
```json
{
  "events": [
    {
      "schema_version": "2026-03-01",
      "event_id": "uuid",
      "event_type": "backend_exception",
      "occurred_at": "ISO8601",
      "service": { "name": "string", "runtime": "string", "framework": "string", "environment": "string" },
      "correlation": { "request_id": "string?", "trace_id": "string?", "session_id": "string?", "user_id_hash": "string?" },
      "payload": {}
    }
  ]
}
```

**Response:**
```json
{
  "accepted": 1,
  "rejected": 0,
  "errors": [],
  "probe_directives": {
    "active_probes": [
      {
        "id": "uuid",
        "label_pattern": "checkout.*",
        "service": "* | service-name",
        "environment": "* | production",
        "expires_at": "ISO8601"
      }
    ]
  }
}
```

**Rate-limited response:**
```json
{
  "accepted": 0,
  "rejected": 2,
  "errors": [
    {
      "index": 0,
      "reason": "rate_limited"
    },
    {
      "index": 1,
      "reason": "rate_limited"
    }
  ],
  "retry_after_ms": 12000
}
```

**Monthly quota exhausted response:**
```json
{
  "accepted": 0,
  "rejected": 2,
  "errors": [
    {
      "index": 0,
      "reason": "monthly_quota_exceeded"
    },
    {
      "index": 1,
      "reason": "monthly_quota_exceeded"
    }
  ],
  "retry_after_ms": 86400000
}
```

When the shared `monthly_raw_ingested_events` allowance is exhausted, new hosted events are rejected before persistence with `monthly_quota_exceeded`. Already stored data remains retrievable.

Rate-limited responses also include `Retry-After: <seconds>` so SDKs can back off without guessing.

`probe_directives` is only included for paid-tier projects where `remote_probes` capability is enabled and active remote probe activations exist. Omitted for free-tier projects and when no remote probes are active. This enables browser SDKs to receive remote probe state without additional polling requests. Always-on probes are purely SDK-local and require no server-side directives.

### 1.2 Incidents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/incidents` | Browser Session or Member Token | List incidents (filterable) |
| GET | `/v1/incidents/{id}` | Browser Session or Member Token | Get incident metadata |
| GET | `/v1/incidents/{id}/context` | Browser Session or Member Token | Get deterministic one-call incident explanation context |
| POST | `/v1/incidents/{id}/resolve` | Browser Session or Member Token | Explicitly resolve an incident |
| GET | `/v1/incidents/{id}/bundle` | Browser Session or Member Token | Get debug bundle |
| GET | `/v1/incidents/{id}/reproduction` | Browser Session or Member Token | Get reproduction artifact |
| GET | `/v1/logs` | Browser Session or Member Token | Query logs by incident |

**Query params (list incidents):** `project_id`, `environment`, `service`, `status` (open/resolved/regressed), `severity`, `limit`, `cursor`

Current API implementation scope (Phase 7 continuation): `GET /v1/incidents` supports organization-scoped filtering by `project_id`, `environment`, `service`, `status`, `severity`, plus cursor-based pagination via `cursor` and `limit` (1-100, default 20).

**Query params (logs):** `incident_id` (required), `level`, `limit`, `cursor`

**Incident response fields include:** `id`, `project_id`, `project_name`, `service_id`, `service_name`, `environment`, `fingerprint`, `fingerprint_version`, `title`, `severity`, `status`, `first_seen_at`, `last_seen_at`, `occurrence_count`, `affected_users_estimate`, `spike_detected_at`, `resolved_at`, `regressed_at`, `matched_fields`, `incident_reason`

Current API implementation scope (Phase 1 continuation):
- `GET /v1/incidents` response body: `{ incidents: IncidentRetrievalRecord[], next_cursor: string | null }`
- `GET /v1/incidents/{id}` response body: `{ incident: IncidentRetrievalRecord }`
- `GET /v1/incidents/{id}/context` response body: `IncidentContextRecord`
- `POST /v1/incidents/{id}/resolve` response body: `{ incident: IncidentRetrievalRecord }`
- `IncidentRetrievalRecord` fields: `incident_id`, `project_id`, `project_name`, `service_id`, `service_name`, `latest_deployment_id`, `environment`, `fingerprint`, `fingerprint_version`, `title`, `severity`, `status`, `first_seen_at`, `last_seen_at`, `occurrence_count`, `spike_detected_at`, `resolved_at`, `regressed_at`, `matched_fields`, `incident_reason`
- `IncidentContextRecord` fields: `incident`, `incident_reason`, `primary_signal`, `bundle`, `reproduction`, `logs`, `deploy`, `grouping`, `visibility`, `redaction`, `suggested_next_checks`
- `primary_signal` summarizes the current incident's primary failing signal without requiring an LLM call. `logs.source` is one of `retrieval`, `bundle_context`, or `none`. `bundle` and `reproduction` use deterministic artifact states: `ready`, `pending`, or `failed`.
- `visibility` explains four operator-facing behaviors directly in retrieval output: how repeated failures group into the current fingerprint, when bundle regeneration occurs (including current precedence), how spike detection differs from incident creation, and how webhook/GitHub cooldown windows suppress repeated lifecycle notifications.
- `incident_reason` is deterministically derived from the incident's primary `incident_signal` metadata. Current kinds: `backend_exception`, `frontend_exception`, `request_failure`, `error_log`. Example:

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
- `GET /v1/incidents/{id}/bundle` response body: artifact JSON when present; `{ "status": "pending" }` when artifact is missing; `{ "status": "failed", "reason": "..." }` when artifact is unreadable/invalid
- `GET /v1/incidents/{id}/reproduction` response body: artifact JSON when present; `{ "status": "pending" }` while the reproduction artifact is not yet available; `404 { "error": "reproduction_not_found" }` on non-not-found artifact read failures
- `GET /v1/logs` requires `incident_id` and supports `level`, `cursor`, `limit` (1-100, default 20); response body: `{ logs: [{ event_id, event_type, occurred_at, is_sampled, level }], next_cursor }`
- Authorization failure: `401 { "error": "invalid_member_token" }`
- Out-of-scope or missing incident: `404 { "error": "incident_not_found" }`
- Missing reproduction artifact: `200 { "status": "pending" }`

**Bundle response:** Full bundle JSON or `{"status": "pending"}` / `{"status": "failed", "reason": "..."}`

When hosted bundle generation is blocked by the shared `monthly_bundle_requests` allowance, `GET /v1/incidents/{id}/bundle` returns `200 { "status": "failed", "reason": "monthly_quota_exceeded" }` until the monthly window resets or allowance expands.

### 1.3 Services

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/services` | Browser Session or Member Token | List services for a project |

**Query params (services):** `project_id` (required), `limit` (optional, 1-100, default 100)

Current API implementation scope (Phase 7 kickoff slice):
- `GET /v1/services` requires `project_id` and returns `200 { services: ServiceRetrievalRecord[] }`
- `ServiceRetrievalRecord` fields: `service_id`, `project_id`, `name`, `runtime`, `framework`, `environment`
- Authorization failure: `401 { "error": "invalid_member_token" }`
- Out-of-scope or missing project: `404 { "error": "project_not_found" }`
- Invalid query: `400 { "error": "invalid_query" }`

### 1.3a Organization Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/organization/members` | Browser Session or Member Token (owner only) | List organization members |
| GET | `/v1/organization/members/invites` | Browser Session or Member Token (owner only) | List pending, non-expired organization invites |
| POST | `/v1/organization/members/invite` | Browser Session or Member Token (owner only) | Create a pending organization member invite |
| DELETE | `/v1/organization/members/invites/{inviteId}` | Browser Session or Member Token (owner only) | Cancel a pending organization invite |
| PATCH | `/v1/organization/members/{userId}` | Browser Session or Member Token (owner only) | Update an organization member role between `owner` and `member` |
| DELETE | `/v1/organization/members/{userId}` | Browser Session or Member Token (owner only) | Remove a non-owner organization member |

**Member list response shape:**
```json
{
  "members": [
    {
      "user_id": "uuid",
      "email": "owner@example.com",
      "role": "owner",
      "created_at": "ISO8601"
    }
  ]
}
```

**Create invite request:**
```json
{
  "email": "new@example.com",
  "role": "member"
}
```

**Invite response shape:**
```json
{
  "invite": {
    "invite_id": "uuid",
    "organization_id": "uuid",
    "email": "new@example.com",
    "role": "member",
    "invited_by": "uuid",
    "accepted_at": null,
    "expires_at": "ISO8601",
    "created_at": "ISO8601"
  }
}
```

Invite creation also sends a transactional invite email containing a one-time acceptance link when invite email delivery is configured.

**Pending invite list response shape:**
```json
{
  "invites": [
    {
      "invite_id": "uuid",
      "organization_id": "uuid",
      "email": "pending@example.com",
      "role": "member",
      "invited_by": "uuid",
      "accepted_at": null,
      "expires_at": "ISO8601",
      "created_at": "ISO8601"
    }
  ]
}
```

**Member removal response shape:**
```json
{
  "member": {
    "user_id": "uuid",
    "email": "member@example.com",
    "role": "member",
    "created_at": "ISO8601"
  }
}
```

**Update member role request:**
```json
{
  "role": "owner"
}
```

**Update member role response shape:**
```json
{
  "member": {
    "user_id": "uuid",
    "email": "member@example.com",
    "role": "owner",
    "created_at": "ISO8601"
  }
}
```

- Authorization failure: `401 { "error": "invalid_member_token" }`
- Forbidden for non-owner callers: `403 { "error": "forbidden" }`
- Unverified browser-session owners cannot create or cancel invites: `403 { "error": "email_verification_required" }`
- Team-tier capability required for invites: `403 { "error": "upgrade_required" }`
- Missing member-management dependency/surface: `404 { "error": "member_management_not_available" }`
- Invalid invite payload: `400 { "error": "invalid_payload" }`
- Invalid invite params: `400 { "error": "invalid_invite_id" }`
- Invalid member params: `400 { "error": "invalid_member_id" }`
- Existing organization member email: `409 { "error": "member_already_exists" }`
- Existing pending invite email: `409 { "error": "invite_already_exists" }`
- Missing pending invite: `404 { "error": "invite_not_found" }`
- Missing organization member: `404 { "error": "member_not_found" }`
- Demoting the last remaining owner is not allowed on this surface: `409 { "error": "owner_role_change_not_allowed" }`
- Removing an owner is not allowed on this surface: `409 { "error": "owner_removal_not_allowed" }`

### 1.3b Project Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects` | Browser Session or Member Token | List projects in caller organization |
| POST | `/v1/projects` | Browser Session or Member Token (owner only) | Create new project in caller organization |
| PATCH | `/v1/projects/{id}` | Browser Session or Member Token (owner only) | Update project name, slug, or default environment |
| DELETE | `/v1/projects/{id}` | Browser Session or Member Token (owner only) | Delete project and its project-scoped resources |

**List projects query:**
- `limit` default `20`, min `1`, max `100`

**Create project request:**
```json
{
  "name": "Main App",
  "slug": "main-app",
  "environment_default": "production"
}
```

**Project response shape:**
```json
{
  "project": {
    "project_id": "uuid",
    "organization_id": "uuid",
    "name": "Main App",
    "slug": "main-app",
    "environment_default": "production",
    "organization_plan": "free",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

**Update project request:**
```json
{
  "name": "Main App",
  "slug": "main-app",
  "environment_default": "production"
}
```

All update fields are optional, but at least one field must be present.

`organization_plan` is the owning organization's active billing tier projected onto project-shaped responses for capability decisions. It is not a project-specific subscription.

- Authorization failure: `401 { "error": "invalid_member_token" }`
- Forbidden for non-owner callers: `403 { "error": "forbidden" }`
- Missing project management dependency/surface: `404 { "error": "projects_not_available" }`
- Invalid list query: `400 { "error": "invalid_query" }`
- Invalid create payload: `400 { "error": "invalid_payload" }`
- Invalid update payload or path params: `400 { "error": "invalid_payload" }` or `400 { "error": "invalid_project_id" }`
- Duplicate slug within organization: `409 { "error": "project_slug_taken" }`

### 1.3c Billing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/billing` | Browser Session or Member Token (owner only) | Return billing summary, plan state, and allowance usage for the current organization |
| POST | `/v1/billing/checkout` | Browser Session (owner only) | Create a Stripe-hosted checkout session URL for an allowed upgrade target |
| POST | `/v1/billing/checkout/confirm` | Browser Session (owner only) | Verify a returned Stripe Checkout Session and sync the organization billing snapshot from Stripe |
| POST | `/v1/billing/portal` | Browser Session (owner only) | Create a Stripe-hosted customer-portal session URL for an active paid plan |
| POST | `/v1/billing/capacity/increase` | Browser Session or Member Token (owner only) | Immediately increase additional allowance-capacity units via Stripe subscription update with proration |
| POST | `/v1/billing/capacity/scheduled-reduction` | Browser Session or Member Token (owner only) | Schedule an allowance-capacity reduction to take effect at the next billing-period boundary via Stripe subscription schedule |
| DELETE | `/v1/billing/capacity/scheduled-reduction` | Browser Session or Member Token (owner only) | Cancel a pending scheduled allowance-capacity reduction, releasing the Stripe subscription schedule |

Billing summary and allowance-capacity management routes accept both browser session and owner-scoped member tokens. Checkout, checkout confirmation, and portal routes are browser-session-only interactive surfaces. Stripe checkout sessions are created dynamically with `client_reference_id` = `organization_id`; the success URL includes Stripe's `{CHECKOUT_SESSION_ID}` placeholder so the web app can ask the API to verify the returned Checkout Session and sync the account immediately.

**Billing summary response shape:**
```json
{
  "billing": {
    "plan": "solo",
    "stripe_customer_id": "cus_123",
    "active_projects": 1,
    "capacity_units": {
      "total": 3,
      "included": 3,
      "additional_purchased": 0,
      "pending_reduction": null
    },
    "usage_window": {
      "starts_at": "2026-03-01T00:00:00.000Z",
      "ends_at": "2026-04-01T00:00:00.000Z"
    },
    "allowances": {
      "monthly_bundle_requests": {
        "used": 180,
        "limit": 750
      },
      "monthly_raw_ingested_events": {
        "used": 800,
        "limit": 6000
      },
      "retained_bundle_cap": {
        "used": 40,
        "limit": 450
      },
      "monthly_remote_activations": {
        "used": 3,
        "limit": 75
      },
      "monthly_alert_deliveries": {
        "used": 10,
        "limit": 225
      }
    }
  }
}
```

`active_projects` is the current count of active projects. Project creation is not gated by `capacity_units.total`.

`capacity_units.additional_purchased` is the persisted count of purchased extra capacity units for the organization. Billing allowance capacity is computed from `included + additional_purchased`, not inferred from the current number of projects.

`capacity_units.pending_reduction` is `null` when no scheduled reduction exists. When a reduction is scheduled:
```json
{
  "pending_reduction": {
    "additional_purchased": 1,
    "total": 4,
    "effective_at": "2026-04-01T00:00:00.000Z",
  }
}
```

**Checkout request:**
```json
{
  "target_plan": "team"
}
```

**Checkout / portal response shape:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

**Checkout confirmation request:**
```json
{
  "session_id": "cs_test_123"
}
```

Checkout confirmation returns the standard billing summary response after the API retrieves and verifies the Stripe Checkout Session and subscription. The route must only apply the session when its `client_reference_id` or `metadata.organization_id` matches the authenticated browser session organization.

**Capacity increase request:**
```json
{
  "target_additional_capacity_units": 3
}
```

`target_additional_capacity_units` must be greater than the current `additional_purchased` count and no greater than 99. The Stripe subscription item quantity is updated immediately with proration. A pending scheduled reduction must be cancelled before increasing capacity. Response is the updated billing summary.

**Capacity reduction schedule request:**
```json
{
  "target_additional_capacity_units": 1
}
```

`target_additional_capacity_units` must be less than the current `additional_purchased` count and no greater than 99 (0 to remove all extra capacity units). A Stripe subscription schedule is created (or updated) with two phases: current phase maintains current capacity until billing period end, next phase applies the reduced quantity. Response is the updated billing summary with `pending_reduction` populated.

**Cancel capacity reduction:** No request body. Releases the Stripe subscription schedule and keeps the current capacity quantity. Response is the updated billing summary with `pending_reduction: null`.

- Missing or invalid session/token: `401 { "error": "invalid_session" }` or `401 { "error": "invalid_member_token" }`
- Forbidden for non-owner callers: `403 { "error": "forbidden" }`
- Missing billing dependency/surface: `404 { "error": "billing_not_available" }`
- Missing billing record for organization: `404 { "error": "billing_not_found" }`
- Invalid checkout payload: `400 { "error": "invalid_payload" }`
- Invalid upgrade target for current plan: `409 { "error": "invalid_plan_change" }`
- Checkout confirmation could not find or use the returned session: `404 { "error": "checkout_session_not_found" }` or `409 { "error": "checkout_not_complete" }`
- Portal requested for free plan: `409 { "error": "no_active_subscription" }`
- Stripe not configured or temporarily unavailable: `503 { "error": "billing_not_configured" }` or `503 { "error": "billing_service_error" }`
- Capacity-management error (free plan, invalid target, pending reduction conflict): `409` with descriptive error code

### 1.3d Token Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects/{id}/tokens` | Browser Session or Member Token | List project tokens in member organization |
| POST | `/v1/projects/{id}/tokens` | Browser Session or Member Token | Create new project token (plaintext shown once) |
| POST | `/v1/projects/{id}/tokens/{tokenId}/revoke` | Browser Session or Member Token | Revoke project token |
| GET | `/v1/member/tokens` | Browser Session or Member Token | List member tokens for caller identity |
| POST | `/v1/member/tokens` | Browser Session or Member Token | Create new member token (plaintext shown once) |
| POST | `/v1/member/tokens/{tokenId}/revoke` | Browser Session or Member Token | Revoke member token |

**Create token request:**
```json
{
  "label": "ci"
}
```

**Create token response:**
```json
{
  "token": {
    "token_id": "uuid",
    "label": "ci",
    "created_at": "ISO8601",
    "last_used_at": null,
    "revoked_at": null,
    "expires_at": null,
    "plaintext": "dbundle_proj_... | dbundle_mem_..."
  }
}
```

**List tokens response:**
```json
{
  "tokens": [
    {
      "token_id": "uuid",
      "label": "ci",
      "created_at": "ISO8601",
      "last_used_at": null,
      "revoked_at": null,
      "expires_at": null
    }
  ]
}
```

### 1.4 Alerts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/alerts` | Browser Session or Member Token | Create alert rule |
| GET | `/v1/alerts` | Browser Session or Member Token | List alert rules |
| PATCH | `/v1/alerts/{id}` | Browser Session or Member Token | Update alert rule |
| DELETE | `/v1/alerts/{id}` | Browser Session or Member Token | Delete alert rule |

**Query params (list alerts):** `project_id` (required UUID), `limit` (optional, integer 1-100, default 20)

**Create alert request:**
```json
{
  "project_id": "uuid",
  "service_id": "uuid",
  "channel": "email",
  "condition_type": "severity_threshold",
  "severity_min": "high",
  "config": {
    "to": "oncall@example.com"
  },
  "is_enabled": true
}
```

`service_id` and `severity_min` are optional on create, and `is_enabled` defaults to `true`.
For `channel: "email"`, `config.to` is required and must be a single recipient email address. Create additional alert rules if multiple people should receive email notifications.
For `channel: "slack"`, prefer `config.slack_destination_id` when the workspace/channel was connected through the Slack OAuth flow. Direct `config.webhook_url` remains valid for callers that intentionally want a raw webhook configuration.

**Update alert request:**
```json
{
  "channel": "webhook",
  "service_id": null,
  "severity_min": null,
  "config": {
    "target_url": "https://hooks.example.test/alerts"
  },
  "is_enabled": false
}
```

Update requests must include at least one field. `service_id`, `severity_min`, and `config` accept `null` to clear the stored value.
When updating channel-specific `config`, include the `channel` in the same request so validation can apply the correct config schema.

**Alert response:**
```json
{
  "alert": {
    "alert_id": "uuid",
    "project_id": "uuid",
    "service_id": null,
    "channel": "email",
    "condition_type": "severity_threshold",
    "severity_min": "high",
    "config": {
      "to": "oncall@example.com"
    },
    "is_enabled": true,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

**List alerts response:**
```json
{
  "alerts": [
    {
      "alert_id": "uuid",
      "project_id": "uuid",
      "service_id": null,
      "channel": "slack",
      "condition_type": "error_spike",
      "severity_min": null,
      "config": {
        "slack_destination_id": "uuid"
      },
      "is_enabled": true,
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

Current API implementation scope (Phase 10 alert CRUD slice):
- `GET /v1/alerts` returns `200 { alerts: AlertRule[] }` for member-token callers scoped to the project's organization.
- `POST /v1/alerts` returns `201 { alert: AlertRule }`.
- `PATCH /v1/alerts/{id}` returns `200 { alert: AlertRule }`.
- `DELETE /v1/alerts/{id}` returns `204` on success.
- Worker-side alert evaluation now enqueues internal `evaluate-alerts` jobs from real incident transitions for `new_incident`, `severity_threshold`, `incident_regressed`, `regression_after_deploy`, and `error_spike` conditions.
- Matching alert evaluations persist one internal `alert_deliveries` row per `alert_id + incident_id + dedupe_key` before delivery so duplicate worker replays stay idempotent.
- Delivery transport is implemented for `channel: "email"`, `channel: "slack"`, `channel: "discord"`, and `channel: "webhook"`. Email requires `config.to` as a single recipient address; Slack accepts either `config.slack_destination_id` (resolved to an encrypted stored webhook URL at delivery time) or `config.webhook_url`; Discord requires `config.webhook_url`; webhook requires `config.target_url`.
- Authorization failure: `401 { "error": "invalid_member_token" }`
- Invalid list query: `400 { "error": "invalid_query" }`
- Invalid alert ID: `400 { "error": "invalid_alert_id" }`
- Invalid create/update body: `400 { "error": "invalid_payload" }`
- Slack channel unavailable on current plan: `403 { "error": "upgrade_required" }`
- Missing scoped project on list/create: `404 { "error": "project_not_found" }`
- Missing scoped connected Slack destination on create/update: `404 { "error": "slack_destination_not_found" }`
- Missing scoped alert on update/delete: `404 { "error": "alert_not_found" }`

### 1.4a Slack Connected Destinations

These routes back the Team-tier `Connect Slack` flow inside the project alerts modal and the agent-facing Slack destination management commands. The OAuth callback remains browser-only, while API, CLI, and MCP all support listing, testing, and deleting reusable Slack destinations plus creating browser handoff install URLs.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/slack/app/install-url` | Browser Session or Member Token | Return a Slack OAuth authorize URL for a project-scoped connect flow |
| GET | `/v1/slack/app/callback` | None | Complete Slack OAuth and redirect back to the app |
| GET | `/v1/projects/{id}/slack/destinations` | Browser Session or Member Token | List reusable connected Slack channels for the project organization |
| POST | `/v1/projects/{id}/slack/destinations/{destinationId}/test` | Browser Session or Member Token | Send a test message to a reusable connected Slack channel |
| DELETE | `/v1/projects/{id}/slack/destinations/{destinationId}` | Browser Session or Member Token | Disconnect a reusable Slack destination |

**Install-url query params:** `project_id` (required UUID), `return_to` (optional app-relative path such as `/projects/<projectId>/alerts`)

**Install-url response:**
```json
{
  "install_url": "https://slack.com/oauth/v2/authorize?client_id=...&scope=incoming-webhook&redirect_uri=...&state=..."
}
```

**List connected Slack destinations response:**
```json
{
  "destinations": [
    {
      "slack_destination_id": "uuid",
      "organization_id": "uuid",
      "slack_team_id": "T123",
      "slack_team_name": "Acme Workspace",
      "slack_channel_id": "C123",
      "slack_channel_name": "#alerts",
      "installed_by_member_id": "uuid",
      "is_active": true,
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

`GET /v1/slack/app/callback` validates the signed install state, exchanges the Slack OAuth code, upserts the reusable destination, clears the transient cookie, and redirects back to the requested app path with `slack_connect=success|cancelled|error`.

Current implementation behavior:
- `GET /v1/slack/app/install-url` requires owner access, a Team-tier organization, and a scoped project.
- `GET /v1/projects/{id}/slack/destinations` requires member auth and Team tier.
- `POST /v1/projects/{id}/slack/destinations/{destinationId}/test` requires owner access, decrypts the stored webhook URL, sends a Slack test message, and returns `502` with a stable Slack-specific error code when delivery fails.
- `DELETE /v1/projects/{id}/slack/destinations/{destinationId}` requires owner access and returns `409 { "error": "slack_destination_in_use" }` while any alert rule or weekly report still references that destination.
- Slack webhook URLs are never returned by these routes.

### 1.5 Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/webhooks` | Browser Session or Member Token | Create webhook |
| GET | `/v1/webhooks` | Browser Session or Member Token | List webhooks |
| GET | `/v1/webhooks/{id}` | Browser Session or Member Token | Get webhook details |
| PATCH | `/v1/webhooks/{id}` | Browser Session or Member Token | Update webhook |
| DELETE | `/v1/webhooks/{id}` | Browser Session or Member Token | Delete webhook |
| POST | `/v1/webhooks/{id}/test` | Browser Session or Member Token | Queue a signed synthetic test delivery |
| GET | `/v1/webhooks/{id}/deliveries` | Browser Session or Member Token | List delivery history |

**Deliveries query params:** `limit` (optional, integer 1-100, default 20)

**Test delivery request:**
```json
{
  "event_type": "verification.passed"
}
```

`event_type` is optional and defaults to `verification.passed`.

**Test delivery response:**
```json
{
  "delivery": {
    "delivery_id": "uuid",
    "event_type": "verification.passed"
  }
}
```

**Deliveries response:**
```json
{
  "deliveries": [
    {
      "delivery_id": "uuid",
      "event_type": "bundle.reopened",
      "status": "pending | retrying | delivered | failed",
      "attempt_count": 1,
      "next_attempt_at": "ISO8601 | null",
      "last_response_code": 200,
      "last_attempted_at": "ISO8601 | null",
      "last_error": "string | null"
    }
  ]
}
```

**Create webhook request:**
```json
{
  "project_id": "uuid",
  "url": "https://example.com/hook",
  "events": ["bundle.created", "improvement_bundle.created"],
  "filters": {
    "environment": ["production"],
    "severity_min": "high",
    "bundle_type": ["failure", "improvement"]
  },
  "is_enabled": true
}
```

**Create webhook response:**
```json
{
  "webhook": {
    "webhook_id": "uuid",
    "project_id": "uuid",
    "url": "https://example.com/hook",
    "events": ["bundle.created", "improvement_bundle.created"],
    "filters": {
      "environment": ["production"],
      "severity_min": "high",
      "bundle_type": ["failure", "improvement"],
      "verification": false
    },
    "is_enabled": true,
    "created_at": "ISO8601",
    "updated_at": "ISO8601",
    "signing_secret": "dbundle_whsec_..."
  }
}
```

`signing_secret` is returned on create only so the receiver can verify the `X-DebugBundle-Signature` HMAC payload. List, get, and update responses omit it.

**List webhooks query params:** `project_id` (required), `limit` (optional, integer 1-100, default 20)

**List/get/update response shape:**
```json
{
  "webhook": {
    "webhook_id": "uuid",
    "project_id": "uuid",
    "url": "https://example.com/hook",
    "events": ["bundle.created"],
    "filters": {},
    "is_enabled": true,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

**Lifecycle event payload** (`bundle.reopened`, `incident.spike_detected`):
```json
{
  "event_type": "bundle.reopened",
  "incident_id": "uuid",
  "project_id": "uuid",
  "occurred_at": "ISO8601",
  "service_name": "string",
  "environment": "string",
  "severity": "low | medium | high | critical",
  "regression_after_deploy": true,
  "deploy_version": "string | null",
  "deploy_commit_sha": "string | null",
  "deploy_branch": "string | null",
  "deploy_deployed_at": "ISO8601 | null",
  "minutes_since_deploy": "number | null"
}
```

Deploy correlation fields are populated when `regression_after_deploy` is `true` (regression within 24h of a deploy). When `false`, all deploy fields are `null`.

**Synthetic test payload** (`POST /v1/webhooks/{id}/test`):
```json
{
  "delivery_id": "uuid",
  "event": "verification.passed",
  "event_type": "verification.passed",
  "occurred_at": "ISO8601",
  "project_id": "uuid",
  "webhook_id": "uuid",
  "incident_id": "uuid",
  "test": true,
  "data": {
    "message": "Synthetic webhook test delivery"
  }
}
```

Current webhook delivery behavior for the Phase 10 base: worker delivery attempts retry with exponential backoff through the persisted delivery queue, delivery history exposes per-attempt state (`pending`, `retrying`, `delivered`, `failed`), and a webhook is automatically disabled by setting `is_enabled = false` after 50 consecutive final delivery failures.

### 1.6 Weekly Report Channels

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/weekly-report-channels` | Browser Session or Member Token | Create weekly report channel |
| GET | `/v1/weekly-report-channels` | Browser Session or Member Token | List weekly report channels |
| PATCH | `/v1/weekly-report-channels/{id}` | Browser Session or Member Token | Update weekly report channel |
| DELETE | `/v1/weekly-report-channels/{id}` | Browser Session or Member Token | Delete weekly report channel |

**Query params (list weekly report channels):** `project_id` (required UUID), `limit` (optional, integer 1-100, default 20)

**Create weekly report channel request:**
```json
{
  "project_id": "uuid",
  "channel": "email",
  "config": {
    "to": ["team@example.com"]
  },
  "schedule": {
    "day_of_week": "monday",
    "hour_of_day": 9,
    "timezone": "UTC"
  },
  "is_enabled": true
}
```

Slack channels accept either `config.webhook_url` or `config.slack_destination_id`. Team-tier callers should prefer `slack_destination_id` so weekly reports reuse the same encrypted connected Slack channel as alert rules.

**Update weekly report channel request:**
```json
{
  "schedule": {
    "day_of_week": "friday",
    "hour_of_day": 16,
    "timezone": "America/New_York"
  },
  "is_enabled": false
}
```

**Weekly report channel response:**
```json
{
  "channel": {
    "channel_id": "uuid",
    "project_id": "uuid",
    "channel": "slack",
    "config": {
      "slack_destination_id": "uuid"
    },
    "schedule": {
      "day_of_week": "friday",
      "hour_of_day": 16,
      "timezone": "America/New_York"
    },
    "is_enabled": false,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

**List weekly report channels response:**
```json
{
  "channels": [
    {
      "channel_id": "uuid",
      "project_id": "uuid",
      "channel": "email",
      "config": {
        "to": ["team@example.com"]
      },
      "schedule": {
        "day_of_week": "monday",
        "hour_of_day": 9,
        "timezone": "UTC"
      },
      "is_enabled": true,
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

- Authorization failure: `401 { "error": "invalid_member_token" }`
- Invalid list query: `400 { "error": "invalid_query" }`
- Invalid channel id: `400 { "error": "invalid_weekly_report_channel_id" }`
- Invalid create/update body: `400 { "error": "invalid_payload" }`
- Slack connected-destination unavailable on current plan: `403 { "error": "upgrade_required" }`
- Slack connected-destination management missing in runtime config: `503 { "error": "slack_not_configured" }`
- Missing scoped project on list/create: `404 { "error": "project_not_found" }`
- Missing scoped connected Slack destination on create/update: `404 { "error": "slack_destination_not_found" }`
- Missing scoped channel on update/delete: `404 { "error": "weekly_report_channel_not_found" }`

### 1.7 Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | System health |
| GET | `/ready` | None | Readiness probe; returns `200 { "status": "ready" }` when required runtime dependencies are available, otherwise `503 { "status": "not_ready", "reason": "..." }` |
| GET | `/live` | None | Liveness probe |

### 1.8 Probes (Remote Activation — Solo+ Only)

Always-on probes (ring buffer + error-flush) require no API endpoints — they are purely SDK-local. The endpoints below manage **remote activation** (Solo+ only).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/probes/activate` | Browser Session or Member Token (Solo+) | Remotely activate probes matching a label pattern |
| GET | `/v1/projects/{id}/probes` | Browser Session or Member Token (Solo+) | List active remote probe activations |
| POST | `/v1/projects/{id}/probes/deactivate` | Browser Session or Member Token (Solo+) | Deactivate a remote probe activation |
| GET | `/v1/sdk/config` | Project Token | SDK config (remote probes, poll interval). Solo+: includes active_probes. Free: `remote_probes_enabled: false`. |

**Activate request:**
```json
{
  "label_pattern": "checkout.*",
  "service": "checkout-api",
  "environment": "production",
  "ttl_seconds": 300,
  "trigger_ttl_seconds": 86400
}
```

| Field | Required | Default | Constraint |
|-------|----------|---------|------------|
| `label_pattern` | Yes | — | Dot-notation label or wildcard (`checkout.*`, `*`) |
| `service` | No | `*` (all) | Scope to specific service |
| `environment` | No | `*` (all) | Scope to specific environment |
| `ttl_seconds` | Yes | — | Passive activation TTL (max 3600s / 1 hour) |
| `trigger_ttl_seconds` | No | `ttl_seconds` | Trigger token TTL (max 86400s / 24 hours) |
| `sample_rate` | No | `1.0` | 0.0–1.0 |

**Activate response:**
```json
{
  "activation_id": "uuid",
  "label_pattern": "checkout.*",
  "service": "checkout-api",
  "environment": "production",
  "expires_at": "ISO8601",
  "trigger_expires_at": "ISO8601",
  "created_at": "ISO8601",
  "trigger_token": "dbundle_probe_..."
}
```

`expires_at` controls the passive polling window. `trigger_expires_at` controls how long the trigger token remains valid (can be up to 24h after creation). The `trigger_token` is HMAC-SHA256 signed and scoped to this activation's labels, service, and environment. Attach it to a specific HTTP request via query parameter `_debug_probe` or header `X-DebugBundle-Probe-Trigger` to activate matching probes for that single request without waiting for SDK polling.

If the shared `monthly_remote_activations` allowance is exhausted, activation requests are rejected before creation with `429 { "error": "monthly_quota_exceeded", "retry_after_ms": <ms> }` and a `Retry-After` header.

**List response:**
```json
{
  "activations": [
    {
      "id": "uuid",
      "label_pattern": "checkout.*",
      "service": "checkout-api",
      "environment": "production",
      "expires_at": "ISO8601",
      "activated_by": "user@example.com",
      "created_at": "ISO8601"
    }
  ]
}
```

**Deactivate request:**
```json
{ "activation_id": "uuid" }
```

**SDK config response (GET /v1/sdk/config):**

Response header: `Cache-Control: public, s-maxage=30` (CDN-edge-cacheable). Purged on probe activate/deactivate.

```json
{
  "probes_enabled": true,
  "remote_probes_enabled": true,
  "active_probes": [
    {
      "id": "uuid",
      "label_pattern": "checkout.*",
      "service": "checkout-api | *",
      "environment": "production | *",
      "expires_at": "ISO8601"
    }
  ],
  "poll_interval_ms": 60000
}
```

Free-tier projects receive: `{ "probes_enabled": true, "remote_probes_enabled": false, "active_probes": [], "poll_interval_ms": 0 }` — probes are enabled (always-on ring buffer works) but remote activation is not available.

**Guardrails:**

| Constraint | Free | Solo | Team |
|------------|------|---------|------|
| Always-on probes (ring buffer + error-flush) | Available | Available | Available |
| Remote activation | Not available (403) | Full access | Full access |
| Max concurrent remote activations per project | N/A | 5 |
| Max remote activation TTL | N/A | 3600s (1 hr) |
| Max trigger token TTL | N/A | 86400s (24 hr) |
| `ttl_seconds` required | N/A | Yes |
| Auth (remote activation) | N/A (403) | Member token |
| Browser config delivery (remote) | N/A | Session-start check + ingestion piggybacking |
| Backend config delivery (remote) | N/A | 60s polling (CDN-cached) |

### 1.9 Capture Policy

Per-project capture policy controls what event classes the SDK captures and the ingestion API accepts.

**Get capture policy:**

```
GET /v1/projects/{id}/capture-policy
Authorization: Bearer dbundle_member_...  (or browser session)
```

Response `200`:
```json
{
  "policy": {
    "preset": "minimal | balanced | investigative",
    "capture_logs": "off | warning | error | info",
    "capture_request_events": "off | failures_only | filtered | all",
    "capture_breadcrumbs": "local_only | exception_only | standalone",
    "capture_probe_events": "buffer_only | standalone_when_activated",
    "immediate_client_error_statuses": [401, 403, 409, 422]
  },
  "overrides": {
    "capture_logs": "off | warning | error | info | null",
    "capture_request_events": "off | failures_only | filtered | all | null",
    "capture_breadcrumbs": "local_only | exception_only | standalone | null",
    "capture_probe_events": "buffer_only | standalone_when_activated | null",
    "immediate_client_error_statuses": null
  }
}
```

`policy` is the effective resolved policy after merging preset defaults with any non-null overrides. `overrides` preserves the raw saved state so clients can distinguish `use preset default` from explicit `none`. SDKs consume the same resolved values via `GET /v1/sdk/config`.

**Update capture policy:**

```
PATCH /v1/projects/{id}/capture-policy
Authorization: Bearer dbundle_member_...  (or browser session, owner only)
Content-Type: application/json
```

Request body (all fields optional):
```json
{
  "preset": "minimal | balanced | investigative",
  "capture_logs": "warning",
  "capture_request_events": "failures_only",
  "capture_breadcrumbs": "exception_only",
  "capture_probe_events": "buffer_only",
  "immediate_client_error_statuses": [401, 403, 409, 422]
}
```

Response `200`: same shape as GET response with updated values.

**Validation rules:**
- `preset` must be one of `minimal`, `balanced`, `investigative`
- override keys must be valid control names
- override values must be valid for that control
- `immediate_client_error_statuses` must contain only integer HTTP statuses in `400..499`, is normalized to deduped ascending order, and is limited to 12 entries
- `null` for `immediate_client_error_statuses` means `use preset default`; `[]` means explicit `none`
- Free-tier projects cannot set `capture_probe_events` to `standalone_when_activated` (returns 403)
- Omitted override fields keep their existing override state; on a project with no saved capture-policy row yet, omitted overrides behave as `null` and resolve from preset defaults

**Error responses:**
- `401` — missing or invalid auth
- `403` — insufficient role (non-owner) or tier restriction
- `404` — project not found or not in caller's organization

**SDK config integration:**

`GET /v1/sdk/config` response now includes the resolved capture policy:
```json
{
  "probes_enabled": true,
  "remote_probes_enabled": false,
  "active_probes": [],
  "poll_interval_ms": 60000,
  "capture_policy": {
    "preset": "minimal",
    "capture_logs": "error",
    "capture_request_events": "failures_only",
    "capture_breadcrumbs": "local_only",
    "capture_probe_events": "buffer_only",
    "immediate_client_error_statuses": []
  }
}
```

SDKs must respect the server-side capture policy. Events that violate the policy are rejected by the ingestion API with reason `capture_policy_rejected`.

### 1.10 GitHub Repository Automation (Solo+ Only)

**GitHub App lifecycle (not user-facing management routes):**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/github/app/callback` | None | GitHub App setup URL / post-install redirect handler |
| POST | `/v1/github/app/webhook` | GitHub App webhook secret (HMAC-SHA256) | Installation lifecycle events |

The setup callback endpoint completes the App installation flow: validates the `installation_id`, accepts GitHub's optional `setup_action`, records the installation in `github_installations`, validates a signed install `state` when present, and redirects the user back into the DebugBundle web app so they can continue setup from the originating project GitHub tab.

The webhook endpoint handles `installation.created`, `installation.deleted`, `installation.suspend`, and `installation.unsuspend` events. All payloads are verified with HMAC-SHA256 using `GITHUB_APP_WEBHOOK_SECRET`.

**Installation and repository management:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/github/app/install-url` | Browser Session or Member Token | Get the GitHub App installation URL used by the web install/reconnect CTA |
| GET | `/v1/github/installation` | Browser Session or Member Token | Get current org's GitHub App installation status |
| DELETE | `/v1/github/installation` | Browser Session or Member Token (owner only) | Disconnect GitHub installation |
| GET | `/v1/github/repositories` | Browser Session or Member Token | List repositories available to the installation |
| GET | `/v1/projects/{id}/github/repo` | Browser Session or Member Token | Get project's assigned primary repo |
| PUT | `/v1/projects/{id}/github/repo` | Browser Session or Member Token (owner only) | Set or change project's primary repo |
| DELETE | `/v1/projects/{id}/github/repo` | Browser Session or Member Token (owner only) | Remove project's repo assignment |

**Get installation response:**
```json
{
  "installation": {
    "id": "uuid",
    "installation_id": 12345678,
    "account_login": "my-org",
    "account_type": "Organization",
    "status": "active",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

When no GitHub App installation is connected yet, the route returns:
```json
{
  "installation": null
}
```

**List repositories response:**
```json
{
  "repositories": [
    {
      "id": 987654,
      "owner": "my-org",
      "name": "my-app",
      "full_name": "my-org/my-app",
      "default_branch": "main",
      "private": true
    }
  ]
}
```

**Set repo request:**
```json
{
  "owner": "my-org",
  "repo": "my-app"
}
```

**Get/set repo response:**
```json
{
  "repo": {
    "id": "uuid",
    "project_id": "uuid",
    "installation_id": "uuid",
    "repo_owner": "my-org",
    "repo_name": "my-app",
    "default_branch": "main",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

When no repository is assigned to the project yet, the route returns:
```json
{
  "repo": null
}
```

**Dispatch rule management:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/github/rules` | Browser Session or Member Token (owner only) | Create dispatch rule |
| GET | `/v1/projects/{id}/github/rules` | Browser Session or Member Token | List dispatch rules |
| GET | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token | Get single rule |
| PATCH | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token (owner only) | Update rule |
| DELETE | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token (owner only) | Delete rule |

**Create rule request:**
```json
{
  "name": "High severity incidents",
  "event_types": ["bundle.created", "bundle.reopened"],
  "environments": ["production"],
  "services": [],
  "severity_min": "high",
  "bundle_type": "failure",
  "incident_status": "new_or_reopened",
  "cooldown_seconds": 300
}
```

**Rule response:**
```json
{
  "rule": {
    "rule_id": "uuid",
    "project_id": "uuid",
    "name": "High severity incidents",
    "enabled": true,
    "event_types": ["bundle.created", "bundle.reopened"],
    "environments": ["production"],
    "services": [],
    "severity_min": "high",
    "bundle_type": "failure",
    "incident_status": "new_or_reopened",
    "cooldown_seconds": 300,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

**List rules response:**
```json
{
  "rules": [
    { "...same shape as rule response..." }
  ]
}
```

**Dispatch delivery history:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects/{id}/github/deliveries` | Browser Session or Member Token | List delivery history |
| POST | `/v1/projects/{id}/github/deliveries/{id}/retry` | Browser Session or Member Token | Retry a failed delivery |

**Deliveries query params:** `status` (optional: `pending`, `delivered`, `failed`, `retrying`), `limit` (optional, 1-100, default 20)

**List deliveries response:**
```json
{
  "deliveries": [
    {
      "delivery_id": "uuid",
      "rule_id": "uuid",
      "rule_name": "High severity incidents",
      "incident_id": "uuid",
      "incident_title": "TypeError in checkout",
      "status": "delivered",
      "attempt_count": 1,
      "last_attempt_at": "ISO8601",
      "last_error": null,
      "github_status_code": 204,
      "created_at": "ISO8601"
    }
  ]
}
```

**Retry response:** Same shape as single delivery.

**Error responses:**
- `401 { "error": "invalid_member_token" }` — missing or invalid auth
- `403 { "error": "forbidden" }` — non-owner caller for write operations
- `403 { "error": "upgrade_required" }` — Free-tier project
- `404 { "error": "installation_not_found" }` — no active GitHub installation for the organization
- `404 { "error": "rule_not_found" }` — dispatch rule not found
- `404 { "error": "delivery_not_found" }` — delivery not found
- `409 { "error": "installation_suspended" }` — installation is suspended
- `409 { "error": "installation_removed" }` — installation has been removed
- `400 { "error": "invalid_payload" }` — invalid request body

**Dispatch payload contract** (sent as `client_payload` in `repository_dispatch`):
```json
{
  "debugbundle_event": "bundle.created",
  "incident_id": "inc_abc123",
  "bundle_type": "failure",
  "bundle_version": 3,
  "severity": "high",
  "service": "checkout-api",
  "environment": "production",
  "title": "TypeError: Cannot read property 'id' of undefined",
  "links": {
    "bundle": "https://api.debugbundle.com/v1/incidents/inc_abc123/bundle",
    "reproduction": "https://api.debugbundle.com/v1/incidents/inc_abc123/reproduction",
    "dashboard": "https://app.debugbundle.com/incidents/inc_abc123"
  },
  "debugbundle": {
    "project_id": "proj_xyz789",
    "occurrence_count": 12,
    "first_seen_at": "2026-03-20T14:30:00Z",
    "dispatch_id": "dsp_delivery123",
    "dispatched_at": "2026-03-25T10:00:00Z"
  }
}
```

The `event_type` on the `repository_dispatch` is always `debugbundle.incident`. The specific lifecycle event is in `debugbundle_event` inside `client_payload`, and delivery metadata lives under `client_payload.debugbundle`. `dispatch_id` is globally unique per delivery attempt for workflow deduplication.

A GitHub delivery with `status: "delivered"` and `github_status_code: 204` means GitHub accepted DebugBundle's `repository_dispatch` API request. It does not mean a GitHub Actions workflow ran or completed successfully; the receiving repository must contain a matching workflow and owns its run status.

Reference action distribution: external repositories consume `debugbundle/action@v1`. The action lives in the dedicated public `debugbundle/action` repository and fetches the bundle and reproduction artifact into `.debugbundle/bundles/cloud/` using `incident-id`, `debugbundle-token`, optional `api-base-url`, and optional `workspace-root` inputs.

### API Response Rules
- JSON only
- Versioned endpoints
- Explicit nulls (never omit fields)
- Stable field names
- ISO 8601 timestamps
- Redaction markers (`[REDACTED]`)
- Machine-friendly error responses

---

## 2. CLI Interface

Binary: `debugbundle`

### 2.1 Auth Commands
```
debugbundle login
debugbundle whoami
```

V1 CLI auth uses a member token created in the web app or API, or bootstrapped through the GitHub CLI/device helpers. `debugbundle login` persists `{ bearer_token, base_url }` to `~/.debugbundle/auth.json`, and `debugbundle whoami` reads the same local auth state.

Current local CLI behavior: `debugbundle login` accepts an explicit member token or GitHub flags, and when run with no explicit auth mode in an interactive terminal it prompts for GitHub auto mode, GitHub device flow, or manual member-token entry. Read-path commands and token-management commands reuse that stored auth state when constructing authenticated API requests, so local users and agents do not need to inject bearer tokens manually once `debugbundle login` has been completed.

### 2.2 Setup Commands
```
debugbundle setup [--non-interactive] [--json]
debugbundle connect [--auth-file <path>] [--json]
debugbundle doctor [--check-relay] [--privacy] [--json]
debugbundle validate [--fix] [--json]
debugbundle ingest <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]
debugbundle watch --log <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]
debugbundle watch --cloud --log <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]
debugbundle process [--json]
```

Current local CLI setup behavior: `debugbundle setup [--non-interactive] [--json]` is the single entrypoint that replaces the old `debugbundle init`. It detects the project stack, generates `profile.json` with `validation_status: "static-analysis-only"`, creates `.debugbundle/local/connection.json` (defaults to `"mode": "local-only"`), generates `.agents/skills/debugbundle/SKILL.md` per agentskills.io spec, manages `.gitignore` entries, and optionally appends a DebugBundle section to `AGENTS.md`. When the repository already includes both `@debugbundle/sdk-browser` and `@debugbundle/sdk-node`, setup also scaffolds the browser relay route for supported backend frameworks: it patches Fastify and Express server entrypoints with the appropriate relay registration and creates `app/debugbundle/browser/route.ts` for supported Next.js App Router projects. `--non-interactive` is the CI/scripted variant of the same flow and uses the same local-first defaults without entering a guided prompt path.

Current local CLI connect behavior: `debugbundle connect` upgrades a local-only project to cloud-connected mode by reusing stored member auth, selecting or creating a cloud project from `.debugbundle/profile.json`, minting a new project token, and updating `.debugbundle/local/connection.json` to enable production cloud delivery while leaving `local`, `development`, and `staging` local-only by default. If member auth is missing and the terminal is interactive, `connect` invokes the same login chooser first and then resumes automatically. Existing local events and local incident state are NOT uploaded or rewritten.

Current local CLI doctor behavior validates the generated `.debugbundle/` scaffold, checks whether local CLI auth state is present and valid, and warns when `.debugbundle/profile.json` has a `debugbundle.last_reviewed_at` older than 30 days. `--check-relay` additionally inspects `.debugbundle/local/browser-relay-spool/` for undelivered spool files and reports their count and age. `--privacy` adds a deterministic first-run redaction preview built from a representative `request_event` with `response_status: 503`, showing the redacted field paths, omitted field paths (currently empty by default because default redaction replaces sensitive values in-place), retained incident-relevant metadata, a redacted sample payload, and whether the sample would create an incident. Delivered relay spool entries are tracked by `.events.json.delivered` sidecars written after successful cloud forwarding; files without that marker are treated as undelivered. Connected-mode cloud cache retention is maintained both opportunistically during explicit cloud cache activity and explicitly through the first shipped `debugbundle clean` path.

Current local CLI validate behavior checks the generated DebugBundle local files and validates `.debugbundle/profile.json` against the v1 profile schema. `--fix` safely recreates missing generated files (`.agents/skills/debugbundle/SKILL.md`, `.debugbundle/local/connection.json`) when they are absent, without overwriting existing files. It does not delete cached cloud artifacts; cache pruning now lives in `debugbundle clean` plus the existing opportunistic connected-mode cache maintenance path.

Current local CLI ingest behavior is `debugbundle ingest <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]`. It parses supported log files into deterministic local `EventEnvelope[]` batches, derives a stable local `project_id` from `.debugbundle/profile.json`, writes the resulting batch atomically into `.debugbundle/local/events/`, and then invokes the existing local processing pipeline so bundles, reproductions, and `.debugbundle/local/state.json` stay aligned with SDK file-transport ingestion. `debugbundle-ndjson` accepts either the documented minimal NDJSON error shape or full event-envelope lines; `php-error` and `apache-error` currently target fatal/error incident extraction.

The accepted first-party CLI input formats are currently `debugbundle-ndjson`, `php-error`, and `apache-error`. Among those, `debugbundle-ndjson` is the canonical structured interchange format for zero-install capture; the others are first-party adapters for common existing server log formats.

Current local CLI watch behavior is `debugbundle watch --log <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]`. It tails a supported log file from the current end-of-file, parses only newly appended complete records into the same deterministic local `EventEnvelope[]` shapes as `debugbundle ingest`, writes each appended batch into `.debugbundle/local/events/`, and invokes the existing local processing pipeline after each batch.

Current connected CLI watch behavior is `debugbundle watch --cloud --log <file> --format <debugbundle-ndjson|php-error|apache-error> [--json]`. It requires `.debugbundle/local/connection.json` to already be in connected mode with a production `cloud_base_url`, requires `DEBUGBUNDLE_PROJECT_TOKEN` in the environment, tails the supported log file from the current end-of-file, parses only newly appended complete records into the same deterministic `EventEnvelope[]` shapes as `debugbundle ingest`, and ships each appended batch directly to `POST /v1/events` without writing local `.debugbundle/local/events/` files.

Current local CLI clean behavior is `debugbundle clean [--events] [--bundles] [--all] [--older-than <Nd>] [--json]`. With no flags it applies the documented local retention policy: remove processed local event files older than 7 days, prune delivered browser relay spool files in `.debugbundle/local/browser-relay-spool/` older than 24 hours and undelivered spool files older than 7 days, trim `.debugbundle/local/state.json` to the most recent 50 local incidents while prioritizing resolved incidents for eviction, delete the evicted incidents' local bundle/reproduction artifacts, and prune cloud cache files older than 30 days since last access. Delivered relay spool entries are identified by `.events.json.delivered` sidecars; files without that sidecar are treated as undelivered. `--events` removes all processed event files up to the current watermark. `--bundles` scopes the command to cloud-cache pruning only, and `--older-than` requires `--bundles` and accepts day-based values like `30d`. `--all` resets runtime data to an empty state by clearing `.debugbundle/local/events/`, `.debugbundle/local/browser-relay-spool/`, `.debugbundle/bundles/local/`, `.debugbundle/bundles/cloud/`, and rewriting `.debugbundle/local/state.json`, while preserving generated config such as `.debugbundle/profile.json`, `.debugbundle/local/connection.json`, and the managed agent-skill scaffold.

Current local CLI process behavior is `debugbundle process [--json]`. It reads batch files from `.debugbundle/local/events/`, validates and classifies envelopes through `event-normalizer`, groups local incidents by `fingerprint + environment + service`, writes deterministic bundle artifacts to `.debugbundle/bundles/local/`, writes deterministic reproduction artifacts to `.debugbundle/bundles/local/reproductions/`, and persists the authoritative local incident index plus processing watermark in `.debugbundle/local/state.json`. JSON mode returns processed file/event/incident counts with per-service incident totals. When no event files are newer than the watermark, the command exits `0` and reports `No new events to process.`

### 2.3 Verification Commands
```
debugbundle verify local [--json]
debugbundle verify cloud --project-id <id> [--trigger-5xx | --trigger-4xx <400-499>] [--service <name>] [--environment <name>] [--max-age-minutes <n>] [--auth-file <path>] [--json]
debugbundle smoke [--json]
```

Current local CLI verify behavior is `debugbundle verify local [--json]`. It validates `.debugbundle/profile.json`, synthesizes a local incident-signal batch in `.debugbundle/local/events/`, runs the existing local `debugbundle process` pipeline, confirms that local incident state now contains the synthetic incident, and reads the generated local bundle artifact from `.debugbundle/bundles/local/`. No cloud auth, member token, or project token is required.

Cloud CLI verify behavior is `debugbundle verify cloud --project-id <id> [--trigger-5xx | --trigger-4xx <400-499>] [--service <name>] [--environment <name>] [--max-age-minutes <n>] [--auth-file <path>] [--json]`. Without an active trigger flag, it reuses stored member auth, performs passive verification through the retrieval API, and confirms that the latest incident matching the requested project/service/environment filters has a `last_seen_at` inside the verification window (default `15` minutes). With `--trigger-5xx`, it creates a temporary verification project token, sends a synthetic `request_event` with `response_status: 503` through the real `POST /v1/events` ingestion endpoint, revokes the temporary token, polls incident retrieval, and fetches bundle status. With `--trigger-4xx <status>`, it runs the same real-ingestion proof path using the provided `4xx` status and succeeds only when the target project configuration promotes that status into immediate incident creation. `--trigger-5xx` and `--trigger-4xx` are mutually exclusive. The synthetic event is marked with verification headers/path/body while still using the same ingestion, processing, grouping, bundle, and retrieval path as a real request failure. The current scaffold defaults `environment` to `production`, returns setup-style JSON output, and reports auth/config failures separately from passive or active verification failures.

Active `verify cloud --trigger-5xx --json` and `verify cloud --trigger-4xx <status> --json` include a `verification` object:

```json
{
  "mode": "active_5xx | active_4xx",
  "accepted_event_count": 1,
  "incident_id": "inc_123",
  "bundle_status": "ready | pending | unknown",
  "classification_reason": {
    "kind": "request_failure",
    "description": "request_event response_status=503 matched the immediate request failure incident rule",
    "event_type": "request_event",
    "event_class": "incident_signal",
    "matched_policy": "immediate request failures bypass capture_request_events suppression for the active preset"
  },
  "suggested_next_command": "debugbundle inspect inc_123 --source cloud"
}
```

Current smoke CLI behavior is `debugbundle smoke --project-id <id> [--service <name>] [--environment <name>] [--max-age-minutes <n>] [--auth-file <path>] [--json]`. It is a lightweight orchestration layer over the current local and cloud verification commands: it runs both deterministically, summarizes them as `local-verification` and `cloud-verification` checks, aggregates child warnings/errors, and returns the shared setup/verification JSON schema. Exit-code precedence is preserved for validation (`4`) and auth/config (`2`) failures surfaced by either child verification path.

### 2.3a Setup/Verification JSON Output Schema
All setup and verification commands with `--json` must return:
```json
{
  "status": "healthy | warning | error",
  "checks": [
    { "name": "<check_name>", "status": "ok | warning | missing | error", "message": "<detail>" }
  ],
  "warnings": ["<string>"],
  "errors": ["<string>"],
  "suggested_actions": ["<string>"],
  "auto_fix_available": true | false
}
```

### 2.4 Data Commands
```
debugbundle incidents [--source <local|cloud>] [--project-id <id>] [--environment <env>] [--service <name>] [--status <open|resolved|regressed>] [--severity <level>] [--cursor <cursor>] [--limit <n>] [--json]
debugbundle inspect <incident-id> [--source <local|cloud>] [--json]
debugbundle resolve <incident-id> [--source <local|cloud>] [--json]
debugbundle reopen <incident-id> [--source <local|cloud>] [--json]
debugbundle bundle <incident-id> [--source <local|cloud>] [--json]
debugbundle logs <incident-id> [--level <level>] [--cursor <cursor>] [--limit <n>] [--json]
debugbundle reproduce <incident-id> [--source <local|cloud>] [--json]
debugbundle services [--json]
```

Current local CLI retrieval behavior: when `.debugbundle/local/connection.json` is configured with `"mode": "local-only"`, `debugbundle incidents`, `debugbundle inspect`, `debugbundle resolve`, `debugbundle reopen`, `debugbundle bundle`, and `debugbundle reproduce` read `.debugbundle/local/state.json`, `.debugbundle/bundles/local/`, and `.debugbundle/bundles/local/reproductions/` directly without requiring `debugbundle login`. Local incident listing preserves the machine-readable `{ incidents, next_cursor }` shape and applies `project_id`, `environment`, `service`, `status`, `severity`, `cursor`, and `limit` filters against the local incident index.

Current connected-mode retrieval behavior: when `.debugbundle/local/connection.json` is configured as `"connected"`, `debugbundle incidents` now merges matching local and cloud incidents by default, preserves `cursor` / `limit` pagination after the merged sort order is applied, and annotates cloud-backed incident payloads with `source: "cloud"` so origin is explicit in both human and JSON output. `--source local` and `--source cloud` still narrow the same commands to a single store. `debugbundle inspect`, `debugbundle resolve`, `debugbundle reopen`, `debugbundle bundle`, and `debugbundle reproduce` now probe the local store first and then fall back to cloud. When `debugbundle bundle` or `debugbundle reproduce` fetches from cloud, the returned payload is also written to `.debugbundle/bundles/cloud/<incident-id>.bundle.json` or `.debugbundle/bundles/cloud/reproductions/<incident-id>.reproduction.json`, overwriting the cached snapshot on later explicit fetches; cloud resolve and cloud reopen rewrite cached status fields when a cached copy exists, and the same explicit cloud cache activity prunes `.debugbundle/bundles/cloud/` entries older than 30 days since last access.

Current local CLI retrieval limitation: `debugbundle logs` still requires the authenticated cloud path in the current implementation; local log projection is not part of this slice.

### 2.5 Alert Commands
```
debugbundle alert list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle alert create --project-id <id> --channel <channel> --condition <condition> [--service-id <id>] [--severity-min <level>] --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle alert update <id> [--service-id <id|null>] [--channel <channel>] [--condition <condition>] [--severity-min <level|null>] [--config-json <json|null>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle alert delete <id> [--auth-file <path>] [--json]
```

Current alert CLI behavior is a thin adapter over the alert HTTP client in `packages/alert-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. `alert create` requires `--config-json` with a channel-specific object, and `alert update` accepts `null` clears for `service_id`, `severity_min`, or `config`. Slack alert configs can use either `{"webhook_url":"..."}` or `{"slack_destination_id":"uuid"}`.

### 2.6 Webhook Commands
```
debugbundle webhook list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle webhook create --project-id <id> --url <url> --event <event[,event]> [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle webhook update <id> [--url <url>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle webhook delete <id> [--auth-file <path>] [--json]
debugbundle webhook test <id> [--event <verification.passed|verification.failed>] [--auth-file <path>] [--json]
debugbundle webhook deliveries <id> [--limit <n>] [--auth-file <path>] [--json]
```

Current webhook CLI behavior is a thin adapter over the webhook HTTP client in `packages/webhook-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. Multi-value flags (`--event`, `--environment`, `--service`, `--bundle-type`) accept comma-separated values.

### 2.7 Slack Commands
```
debugbundle slack list --project-id <id> [--auth-file <path>] [--json]
debugbundle slack connect-url --project-id <id> [--return-to </projects/...>] [--auth-file <path>] [--json]
debugbundle slack test <destination-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle slack delete <destination-id> --project-id <id> [--auth-file <path>] [--json]
```

Current Slack CLI behavior is a thin adapter over `packages/slack-client`. `slack connect-url` returns the browser OAuth handoff URL, `slack list` exposes reusable connected destinations for a project organization, `slack test` sends a test message to the selected destination, and `slack delete` removes a destination once no alert rules or weekly reports still reference it.

### 2.8 Weekly Report Commands
```
debugbundle weekly-report list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle weekly-report create --project-id <id> --channel <email|slack> --day-of-week <day> --hour-of-day <0-23> --timezone <iana> --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle weekly-report update <channel-id> [--day-of-week <day>] [--hour-of-day <0-23>] [--timezone <iana>] [--config-json <json>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle weekly-report delete <channel-id> [--auth-file <path>] [--json]
```

Current weekly report CLI behavior is a thin adapter over the weekly report HTTP client in `packages/weekly-report-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. Slack weekly-report configs accept either `{"webhook_url":"..."}` or `{"slack_destination_id":"uuid"}` in `--config-json`.

### 2.9 Profile Commands
```
debugbundle profile validate [--json]
debugbundle profile show [--json]
debugbundle profile sync
```

Current local `debugbundle profile validate` behavior validates `.debugbundle/profile.json` and reports field-path errors for missing or invalid required schema fields.

### 2.10 Analysis Commands
```
debugbundle analyze [--type failure|improvement|performance] [--local] [--json]
```

Current local `debugbundle analyze` behavior reads `.debugbundle/bundles/local/`, `.debugbundle/profile.json`, and repository source files discovered from the profile's service paths, then emits a deterministic bundle analysis artifact. The current implementation supports `--type improvement` for local analysis, uses the recipe contract at `.agents/skills/debugbundle/assets/schemas/improvement-analysis.json`, returns exit code `3` when no local bundles are available, and returns exit code `4` for unsupported local analysis types or invalid local profile state.

### 2.11 Probe Commands (Remote Activation — Solo+ Only)
```
debugbundle probe activate <project-id> --label-pattern <pattern> [--service <name>] [--environment <name>] [--ttl-seconds <n>] [--trigger-ttl-seconds <n>] [--auth-file <path>] [--json]
debugbundle probe list <project-id> [--auth-file <path>] [--json]
debugbundle probe deactivate <project-id> <activation-id> [--auth-file <path>] [--json]
```

These commands manage **remote probe activations** (Solo+ only). Always-on probes require no CLI commands — they operate automatically in the SDK.

### 2.12 Capture Policy Commands
```
debugbundle capture-policy get [--project <id>] [--json]
debugbundle capture-policy set [--project <id>] --preset <minimal|balanced|investigative> [--json]
debugbundle capture-policy set [--project <id>] --override capture_logs=warning --override capture_request_events=failures_only [--json]
debugbundle capture-policy set [--project <id>] --client-error-incidents <preset-default|none|recommended|custom> [--client-error-statuses <401,403,...>] [--json]
```

`capture-policy get` displays the project's current resolved policy plus raw override semantics for client error incidents. `capture-policy set` updates the preset and/or individual override fields via `--override key=value` (use `null` to clear an override), and also supports the dedicated client-error incident mode flags shown above. Owner-only.

### 2.13 Billing Commands
```
debugbundle billing get [--json]
debugbundle billing capacity increase --target-additional-capacity-units <n> [--json]
debugbundle billing capacity schedule-reduction --target-additional-capacity-units <n> [--json]
debugbundle billing capacity cancel-reduction [--json]
```

`billing get` retrieves the organization's billing summary, plan state, active-project counts, capacity units, and allowance metrics. Requires owner-scoped member token authentication.

`billing capacity increase --target-additional-capacity-units <n>` immediately increases the additional capacity-unit count to `<n>` via Stripe subscription update with proration. Target must be greater than current additional purchased units. Fails if a pending scheduled reduction exists.

`billing capacity schedule-reduction --target-additional-capacity-units <n>` schedules a reduction of additional capacity units to `<n>` at the next billing period boundary via Stripe subscription schedule. Target must be less than current additional purchased units.

`billing capacity cancel-reduction` cancels a pending scheduled capacity reduction, keeping the current purchased quantity.

All billing commands require a stored member token with owner role. The `--json` flag outputs machine-readable JSON.

`analyze` reads local bundles from `.debugbundle/bundles/local/`, the project profile, and relevant source code. It generates an analysis bundle following the bundle schema. The `--local` flag is implied when running without cloud credentials. The skill layer (`.agents/skills/debugbundle/assets/schemas/`) provides structured analysis recipes that the user's AI agent follows to produce the analysis.

### 2.14 Project Commands
```
debugbundle project list [--limit <n>] [--auth-file <path>] [--json]
debugbundle project create --name <name> --slug <slug> [--environment-default <env>] [--auth-file <path>] [--json]
debugbundle project update <project-id> [--name <name>] [--slug <slug>] [--environment-default <env>] [--auth-file <path>] [--json]
debugbundle project delete <project-id> [--auth-file <path>] [--json]
```

`project list` lists all projects scoped to the authenticated member's organization. `project create` creates a new project with the given name and slug. `project update` modifies existing project attributes. `project delete` permanently removes a project (owner-only). All require member token authentication.

### 2.15 Member Commands
```
debugbundle member list [--auth-file <path>] [--json]
debugbundle member invites [--auth-file <path>] [--json]
debugbundle member invite --email <email> --role <owner|admin|member> [--auth-file <path>] [--json]
debugbundle member cancel-invite <invite-id> [--auth-file <path>] [--json]
debugbundle member update-role <user-id> --role <owner|admin|member> [--auth-file <path>] [--json]
debugbundle member remove <user-id> [--auth-file <path>] [--json]
```

`member list` lists all organization members. `member invites` lists pending invitations. `member invite` sends an invitation to the specified email (Team tier). `member cancel-invite` cancels a pending invitation. `member update-role` changes a member's role. `member remove` removes a member from the organization. All require owner-scoped member token authentication.

### 2.16 GitHub Commands
```
debugbundle github status [--auth-file <path>] [--json]
debugbundle github repos [--auth-file <path>] [--json]
debugbundle github repo set <owner/repo> [--project-id <id>] [--auth-file <path>] [--json]
debugbundle github repo remove [--project-id <id>] [--auth-file <path>] [--json]
debugbundle github rules [--project-id <id>] [--auth-file <path>] [--json]
debugbundle github rules create [--project-id <id>] [--name <name>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type>] [--incident-status <status>] [--cooldown <seconds>] [--auth-file <path>] [--json]
debugbundle github rules update <rule-id> [--name <name>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type>] [--incident-status <status>] [--cooldown <seconds>] [--enabled <true|false>] [--auth-file <path>] [--json]
debugbundle github rules delete <rule-id> [--auth-file <path>] [--json]
debugbundle github deliveries [--project-id <id>] [--status <status>] [--limit <n>] [--auth-file <path>] [--json]
debugbundle github deliveries retry <delivery-id> [--project-id <id>] [--auth-file <path>] [--json]
```

`github status` shows the organization's GitHub App installation status and any assigned repo for the current project. `github repos` lists repositories available to the installation. `github repo set` assigns a primary repo to the project. `github deliveries` lists recent delivery history for a project, and `github deliveries retry` retries a failed delivery within that project scope. Multi-value flags (`--event`, `--environment`, `--service`) accept comma-separated values. All commands require member token authentication (Solo+ tier).

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General failure |
| 2 | Auth/config error |
| 3 | Resource not found |
| 4 | Validation error |

---

## 3. MCP Tool Interface

Package: `apps/mcp/`

Install surface: `@debugbundle/mcp` publishes a standalone stdio MCP server with the `debugbundle-mcp` bin. External MCP clients should invoke it with `npx @debugbundle/mcp` or a global `debugbundle-mcp` install. The server reuses CLI auth state from `~/.debugbundle/auth.json` when present and still accepts explicit `bearerToken` tool arguments for headless automation.

### 3.1 Core Tools
```
debugbundle_list_incidents    → same result as GET /v1/incidents (including `next_cursor`)
debugbundle_get_incident      → same result as GET /v1/incidents/{id}
debugbundle_resolve_incident  → same result as POST /v1/incidents/{id}/resolve for cloud incidents; local state mutation for local incidents
debugbundle_reopen_incident   → same result as POST /v1/incidents/{id}/reopen for cloud incidents; local state mutation for local incidents
debugbundle_get_bundle        → same result as GET /v1/incidents/{id}/bundle
debugbundle_get_logs          → same result as GET /v1/logs
debugbundle_get_reproduction  → same result as GET /v1/incidents/{id}/reproduction
debugbundle_list_services     → same result as GET /v1/services
debugbundle_list_alerts          → same result as `GET /v1/alerts`
debugbundle_create_alert         → same result as `POST /v1/alerts`
debugbundle_update_alert         → same result as `PATCH /v1/alerts/{id}`
debugbundle_delete_alert         → same result as `DELETE /v1/alerts/{id}`
debugbundle_list_slack_destinations    → same result as `GET /v1/projects/{id}/slack/destinations`
debugbundle_get_slack_connect_url      → same result as `GET /v1/slack/app/install-url`
debugbundle_test_slack_destination     → same result as `POST /v1/projects/{id}/slack/destinations/{destinationId}/test`
debugbundle_delete_slack_destination   → same result as `DELETE /v1/projects/{id}/slack/destinations/{destinationId}`
debugbundle_list_weekly_report_channels   → same result as `GET /v1/weekly-report-channels`
debugbundle_create_weekly_report_channel  → same result as `POST /v1/weekly-report-channels`
debugbundle_update_weekly_report_channel  → same result as `PATCH /v1/weekly-report-channels/{id}`
debugbundle_delete_weekly_report_channel  → same result as `DELETE /v1/weekly-report-channels/{id}`
debugbundle_list_webhooks          → same result as `GET /v1/webhooks`
debugbundle_create_webhook         → same result as `POST /v1/webhooks`
debugbundle_update_webhook         → same result as `PATCH /v1/webhooks/{id}`
debugbundle_delete_webhook         → same result as `DELETE /v1/webhooks/{id}`
debugbundle_test_webhook           → same result as `POST /v1/webhooks/{id}/test`
debugbundle_list_webhook_deliveries → same result as `GET /v1/webhooks/{id}/deliveries`
```

Current MCP alert, Slack-destination, weekly-report, and webhook behavior is a thin adapter over the same shared HTTP clients used by CLI, returning the same machine-readable payloads for lifecycle operations without adding business logic.

Current MCP local retrieval behavior: when no `bearerToken` is supplied and the project is configured as local-only, `debugbundle_list_incidents`, `debugbundle_get_incident`, `debugbundle_resolve_incident`, `debugbundle_reopen_incident`, `debugbundle_get_bundle`, and `debugbundle_get_reproduction` read the same local store used by the CLI (`.debugbundle/local/state.json`, `.debugbundle/bundles/local/`, `.debugbundle/bundles/local/reproductions/`) and return the same machine-readable payloads without cloud auth.

Current connected-mode MCP retrieval behavior: when the project is configured as `"connected"`, `debugbundle_list_incidents` now merges matching local and cloud incidents by default, preserves merged `cursor` / `limit` pagination, and annotates cloud-backed incident payloads with `source: "cloud"` so callers can distinguish origin explicitly. `source: "local"` and `source: "cloud"` still narrow the same MCP retrieval/lifecycle tools to a single store. `debugbundle_get_incident`, `debugbundle_resolve_incident`, `debugbundle_reopen_incident`, `debugbundle_get_bundle`, and `debugbundle_get_reproduction` now probe the local store first and fall back to cloud. When MCP fetches a cloud bundle or reproduction, the same payload is written into `.debugbundle/bundles/cloud/` so the local artifact cache matches explicit connected-mode fetches across both agent-facing surfaces; cloud resolve and cloud reopen rewrite cached status fields when a cached copy exists, and explicit cloud cache activity prunes `.debugbundle/bundles/cloud/` entries older than 30 days since last access.

Current MCP retrieval limitation: `debugbundle_get_logs` remains cloud-backed in the current implementation and still requires a bearer token.

### 3.2 Setup/Verification Tools
```
debugbundle_doctor            → same result as `debugbundle doctor --json`
debugbundle_validate          → same result as `debugbundle validate --json`
debugbundle_verify_local      → same result as `debugbundle verify local --json`
debugbundle_verify_cloud      → same result as `debugbundle verify cloud --json`
debugbundle_smoke             → same result as `debugbundle smoke --json`
```

Current MCP setup/verification behavior is a thin adapter over the existing CLI command modules in `apps/cli/src/`. The MCP wrappers force JSON mode, parse the CLI JSON output, and return the same machine-readable payloads to agents without adding extra business logic. `doctor` accepts `privacy: true` to mirror `debugbundle doctor --privacy --json`, including the same deterministic privacy preview payload.

Current MCP setup/verification input shape:
- `doctor`: optional `authFilePath`, `privacy`
- `validate`: optional `fix`
- `verify_local`: no required inputs
- `verify_cloud`: required `projectId`, optional `service`, `environment`, `maxAgeMinutes`, `trigger5xx`, `trigger4xxStatus`, `authFilePath`
- `smoke`: required `projectId`, optional `service`, `environment`, `maxAgeMinutes`, `authFilePath`

### 3.3 Analysis Tools
```
debugbundle_analyze           → same result as `debugbundle analyze --json`
```

Current MCP analysis behavior is a thin adapter over the CLI analyze command in `apps/cli/src/analyze-command.ts`. The MCP wrapper forces JSON mode, forwards the optional `type` and `local` inputs, and returns the same machine-readable payload that `debugbundle analyze --json` produces.

### 3.4 Probe Tools (Remote Activation — Solo+ Only)
```
debugbundle_activate_probe    → same result as POST /v1/projects/{id}/probes/activate
debugbundle_list_active_probes → same result as GET /v1/projects/{id}/probes
debugbundle_deactivate_probe  → same result as POST /v1/projects/{id}/probes/deactivate
```

These tools manage **remote probe activations** (Solo+ only). Always-on probes require no MCP tools — they operate automatically in the SDK.

### 3.5 Capture Policy Tools
```
get_capture_policy            → same result as GET /v1/projects/{id}/capture-policy
update_capture_policy         → same result as PATCH /v1/projects/{id}/capture-policy
```

These tools manage per-project capture policy (preset selection and advanced overrides). `update_capture_policy` is owner-only.

### 3.6 Billing Tools
```
debugbundle_get_billing_summary          → same result as GET /v1/billing
increase_capacity                        → same result as POST /v1/billing/capacity/increase
schedule_capacity_reduction              → same result as POST /v1/billing/capacity/scheduled-reduction
cancel_capacity_reduction                → same result as DELETE /v1/billing/capacity/scheduled-reduction
```

These tools manage organization billing summary and capacity lifecycle. All require owner-scoped member token authentication.

### 3.7 Project Tools
```
debugbundle_list_projects     → same result as GET /v1/projects
debugbundle_create_project    → same result as POST /v1/projects
debugbundle_update_project    → same result as PATCH /v1/projects/{id}
debugbundle_delete_project    → same result as DELETE /v1/projects/{id}
```

These tools manage project lifecycle. `create_project`, `update_project`, and `delete_project` are owner-only.

### 3.8 Member Tools
```
debugbundle_list_members          → same result as GET /v1/organization/members
debugbundle_list_member_invites   → same result as GET /v1/organization/members/invites
debugbundle_invite_member         → same result as POST /v1/organization/members/invite
debugbundle_cancel_member_invite  → same result as DELETE /v1/organization/members/invites/{inviteId}
debugbundle_update_member_role    → same result as PATCH /v1/organization/members/{userId}
debugbundle_remove_member         → same result as DELETE /v1/organization/members/{userId}
```

These tools manage organization member lifecycle. All require owner-scoped member token authentication. `invite_member` requires Team tier.

### 3.9 GitHub Tools
```
debugbundle_get_github_status           → same result as GET /v1/github/installation
debugbundle_list_github_repositories    → same result as GET /v1/github/repositories
debugbundle_set_project_github_repo     → same result as PUT /v1/projects/{id}/github/repo
debugbundle_remove_project_github_repo  → same result as DELETE /v1/projects/{id}/github/repo
debugbundle_list_github_dispatch_rules  → same result as GET /v1/projects/{id}/github/rules
debugbundle_create_github_dispatch_rule → same result as POST /v1/projects/{id}/github/rules
debugbundle_update_github_dispatch_rule → same result as PATCH /v1/projects/{id}/github/rules/{ruleId}
debugbundle_delete_github_dispatch_rule → same result as DELETE /v1/projects/{id}/github/rules/{ruleId}
debugbundle_list_github_deliveries      → same result as GET /v1/projects/{id}/github/deliveries
debugbundle_retry_github_delivery       → same result as POST /v1/projects/{id}/github/deliveries/{id}/retry
```

These tools manage GitHub repository automation. Read operations require member-token authentication and Solo+ tier; mutating tools additionally require owner scope where the paired HTTP route does.

### MCP Response Rules
- Deterministic
- Compact
- Machine-readable
- Redaction-aware
- Consistent with CLI/API results
- Include `suggested_actions` (string array) for setup/verification failures to guide agent remediation
- Structured error categories: `auth_error`, `config_error`, `validation_error`, `resource_not_found`, `verification_failed`, `transient_backend_error`

---

## 4. SDK Public API

See `/contracts/sdk-interface.md` for the full universal interface contract. Below are language-specific quick-start examples.

### 4.1 Node SDK (`@debugbundle/sdk-node`)

```js
const debugbundle = require('@debugbundle/sdk-node');

// Minimal init (framework auto-detected)
debugbundle.init({ projectToken: process.env.DEBUGBUNDLE_TOKEN });

// Vanilla hooks (no framework required)
debugbundle.captureExceptions();    // process.on('uncaughtException')
debugbundle.captureRejections();    // process.on('unhandledRejection')
debugbundle.captureConsole();       // console.error/warn wrapping (opt-in)

// Manual capture
debugbundle.captureException(new Error('checkout failed'), { userId: '123' });
debugbundle.captureLog('Slow query detected', 'warning', { query: 'SELECT...' });
debugbundle.captureRequest(req, res);
```

Current implementation scope (Phase 8 complete): the Node SDK now covers the full planned V1 backend surface for this phase: core singleton/factory methods, buffered transport, manual request/log/exception capture, always-on probe buffering, vanilla Node hooks, Express/Fastify/Next.js wrappers, logger auto-attachment for supported logger instances, duplicate suppression, loop-protection aggregates/recovery, and paid-tier remote probe config polling with ETag reuse and local directive expiry.

### 4.2 Browser SDK (`@debugbundle/sdk-browser`)

```js
import { debugbundle } from '@debugbundle/sdk-browser';

debugbundle.init({
  projectToken: 'dbundle_proj_...',
  // captureConsole: false (opt-in),
  // captureNetwork: true (default),
  // maskFormValues: true (default),
});

// Auto-captures: window errors, promise rejections, route changes, clicks, network
// Manual capture:
debugbundle.captureException(err);
debugbundle.captureMessage('User clicked broken link', 'warning');
```

### 4.3 Python SDK (`debugbundle-python`)

```python
import debugbundle

debugbundle.init(project_token=os.environ['DEBUGBUNDLE_TOKEN'])

# Vanilla hooks
debugbundle.capture_exceptions()    # sys.excepthook
debugbundle.capture_logging()       # logging module handler (opt-in)
debugbundle.capture_async()         # asyncio loop exceptions

# Manual capture
debugbundle.capture_exception(err, context={'user_id': '123'})
debugbundle.capture_log('Slow query', level='warning', context={'ms': 5000})

# Django — add to settings.py MIDDLEWARE + LOGGING
# Flask — debugbundle.flask.init_app(app)
# FastAPI — app.add_middleware(debugbundle.fastapi.DebugBundleMiddleware)
```

### 4.4 PHP SDK (`debugbundle/sdk-php`)

```php
use DebugBundle\DebugBundle;

DebugBundle::init(['projectToken' => $_ENV['DEBUGBUNDLE_TOKEN']]);

// Vanilla hooks
DebugBundle::captureErrors();       // set_error_handler()
DebugBundle::captureExceptions();   // set_exception_handler()
DebugBundle::captureShutdown();     // register_shutdown_function()

// Manual capture
DebugBundle::captureException($e, ['userId' => '123']);
DebugBundle::captureLog('Cache miss rate high', 'warning', ['rate' => 0.45]);

// Laravel — register DebugBundleServiceProvider (auto-discovers)
// Symfony — enable DebugBundleBundle in bundles.php
```

### 4.5 Probe Usage (All SDKs)

```js
// Node.js — always-on: buffers in per-label ring buffer, flushes alongside errors
debugbundle.probe('checkout.pricing.tax', { cart, taxRate, computedTax });

// Lazy variant (backend SDKs only) — callback invoked for ring buffer storage
debugbundle.probe('checkout.pricing.tax', () => ({ cart, taxRate, computedTax }));

// Heavy probe (backend SDKs only) — dormant in always-on mode, only fires when remotely activated (paid tiers)
debugbundle.probe('db.query-plan', () => ({ plan: db.explain(query) }), { heavy: true });
```

```python
# Python — always-on: buffers in ring buffer, flushes on error
debugbundle.probe('checkout.pricing.tax', {'cart': cart, 'tax_rate': tax_rate})
debugbundle.probe('checkout.pricing.tax', lambda: {'cart': cart, 'tax_rate': tax_rate})
```

```php
// PHP — always-on: buffers in ring buffer, flushes on error
DebugBundle::probe('checkout.pricing.tax', ['cart' => $cart, 'taxRate' => $taxRate]);
DebugBundle::probe('checkout.pricing.tax', fn() => ['cart' => $cart, 'taxRate' => $taxRate]);
```

```js
// Browser — data only, no lazy variant. Buffers in ring buffer, flushes alongside frontend_exception
debugbundle.probe('checkout.ui.cart-render', { itemCount, renderTime });
```

---

## 5. Webhook Payload Contract

### Event Types
- `bundle.created`
- `bundle.updated`
- `bundle.reopened`
- `bundle.resolved`
- `verification.passed`
- `verification.failed`
- `improvement_bundle.created`
- `incident.spike_detected`

### Payload Shape
```json
{
  "event": "bundle.created",
  "occurred_at": "ISO8601",
  "project_id": "proj_123",
  "bundle_id": "bnd_42",
  "bundle_type": "failure",
  "severity": "high",
  "service": "checkout-api",
  "environment": "production",
  "verification": false,
  "summary": "TypeError in checkout flow",
  "links": {
    "bundle": "/v1/incidents/inc_42/bundle",
    "reproduction": "/v1/incidents/inc_42/reproduction"
  }
}
```

Payloads are signed with the webhook shared secret (HMAC). Full bundle is NOT embedded — fetch via API link.

---

## 6. Public Site Machine-Readable Artifacts

The static public site at `debugbundle.com` publishes the following machine-readable artifacts at stable URLs. All are generated from source at build time and served as static files (no server runtime).

| Route | Content-Type | Source | Description |
|-------|-------------|--------|-------------|
| `/llms.txt` | `text/plain` | Build-time generation | LLM/agent discovery file listing documentation URLs, schema links, example bundles, and agent workflow guides |
| `/openapi.json` | `application/json` | `apps/api/src/openapi.ts` | OpenAPI 3.1 specification generated from API route Zod schemas |
| `/schemas/bundle.json` | `application/json` | `packages/shared-types` `BundleV1Schema` | JSON Schema (Draft 2020-12) for the bundle v1 format |
| `/schemas/profile.json` | `application/json` | `apps/cli/src/profile-validation.ts` `ProfileSchema` | JSON Schema for `profile.json` validation |
| `/schemas/webhook-events.json` | `application/json` | `packages/webhook-client` `WebhookEventPayloadSchema` | JSON Schema for webhook event payloads |
| `/schemas/mcp-tools.json` | `application/json` | `apps/mcp/src/tool-catalog.ts` `MCP_TOOL_CATALOG` | MCP tool invocation schemas (oneOf per tool) |
| `/examples/bundle.failure.json` | `application/json` | `examples/bundle.failure.json` | Example failure bundle validated against `BundleV1Schema` |
| `/examples/bundle.improvement.json` | `application/json` | `examples/bundle.improvement.json` | Example improvement bundle validated against `BundleV1Schema` |

### Generation Pipeline

Artifacts are generated by `apps/public-site/scripts/generate-public-artifacts.ts` during the `build` step (`pnpm run generate:artifacts && next build`). The pipeline also generates the search index (`/search-index.json`) and reference data consumed by `/docs/v1/reference/*` pages.
