# Public Interfaces — DebugBundle

Version: v1
Last updated: 2026-06-12

---

## 0. Interface Parity Matrix

Every capability must be available through all applicable interfaces. Operations marked CLI-only are local-environment operations that have no server-side equivalent.

| Operation | API | CLI | MCP | Notes |
|-----------|-----|-----|-----|-------|
| Request email code | `POST /v1/auth/request-code` | — | — | Web-auth bootstrap only |
| Verify email code | `POST /v1/auth/verify-code` | — | — | Web-auth bootstrap only |
| Logout (web session) | `POST /v1/auth/logout` | — | — | Web-auth bootstrap only |
| Current session | `GET /v1/auth/session` | — | — | Web-auth bootstrap only |
| Get current account avatar | `GET /v1/account/avatar` | — | — | Browser session only, cached first-party avatar bytes |
| Import Gravatar avatar | `POST /v1/account/avatar/import-gravatar` | — | — | Browser session only, explicit user action from account settings |
| Export account data | `GET /v1/account/export` | — | — | Browser session only, owner only |
| Request account deletion OTP | `POST /v1/account/delete/request-otp` | — | — | Browser session only, owner only |
| Delete account | `DELETE /v1/account` | — | — | Browser session only, owner only, requires confirmation phrase + OTP |
| Accept project invite | `POST /v1/auth/project-invite/accept` | — | — | Browser session only |
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
| Resolve incident | `POST /v1/incidents/{id}/resolve` | `resolve <incident-id>` | `resolve_incident` | Explicit user action |
| Resolve incidents (bulk) | `POST /v1/incidents/resolve` | `resolve <incident-id> [incident-id ...]` | `resolve_incidents` | One bulk mutation request for cloud incidents; local mode still resolves per incident against `.debugbundle/local/state.json` |
| Reopen incident | `POST /v1/incidents/{id}/reopen` | `reopen <incident-id>` | `reopen_incident` | Explicit user action |
| Reopen incidents (bulk) | `POST /v1/incidents/reopen` | `reopen <incident-id> [incident-id ...]` | `reopen_incidents` | One bulk mutation request for cloud incidents; local mode still reopens per incident against `.debugbundle/local/state.json` |
| Get bundle | `GET /v1/incidents/{id}/bundle` | `bundle` | `get_bundle` | |
| Get reproduction | `GET /v1/incidents/{id}/reproduction` | `reproduce` | `get_reproduction` | |
| Suggest capture rules from incident | `POST /v1/incidents/{id}/capture-rule-suggestion` | `capture-rule suggest` | `suggest_capture_rules_from_incident` | Browser Session or Member Token; deterministic bundle-derived suggestions |
| Create capture rule from incident suggestion | `POST /v1/incidents/{id}/capture-rules` | `capture-rule create-from-suggestion` | `create_capture_rule_from_incident_suggestion` | Browser Session or Member Token, owner/admin only |
| Get logs | `GET /v1/logs` | `logs` | `get_logs` | Query by incident_id |
| List improvements | `GET /v1/improvements` | `improvements list` | `list_improvements` | Hosted deterministic improvement opportunities across the organization or a filtered project |
| Get improvement | `GET /v1/improvements/{id}` | `improvements get` | `get_improvement` | |
| Resolve improvement | `POST /v1/improvements/{id}/resolve` | `improvements resolve` | `resolve_improvement` | Explicit user action |
| Reopen improvement | `POST /v1/improvements/{id}/reopen` | `improvements reopen` | `reopen_improvement` | Explicit user action |
| Snooze improvement | `POST /v1/improvements/{id}/snooze` | `improvements snooze` | `snooze_improvement` | Explicit user action |
| Get improvement bundle | `GET /v1/projects/{id}/improvements/{improvementId}/bundle` | `improvements bundle` | `get_improvement_bundle` | Hosted improvement artifact for a project-scoped opportunity |
| List project members | `GET /v1/projects/{id}/members` | `project members list` | `list_project_members` | Browser Session or Member Token, any authorized project member |
| Get project member avatar | `GET /v1/projects/{id}/members/{userId}/avatar` | — | — | Browser session or member token, authorized project viewers only |
| List pending project invites | `GET /v1/projects/{id}/invites` | `project members invites` | `list_project_member_invites` | Browser Session or Member Token, owner/admin only |
| Invite project member | `POST /v1/projects/{id}/invite` | `project members invite` | `invite_project_member` | Browser Session or Member Token, owner/admin only, Team tier |
| Cancel project invite | `DELETE /v1/projects/{id}/invites/{inviteId}` | `project members cancel-invite` | `cancel_project_member_invite` | Browser Session or Member Token, owner/admin only |
| Update project member role | `PATCH /v1/projects/{id}/members/{userId}` | `project members update-role` | `update_project_member_role` | Browser Session or Member Token, owner/admin only |
| Remove project member | `DELETE /v1/projects/{id}/members/{userId}` | `project members remove` | `remove_project_member` | Browser Session or Member Token, owner/admin only |
| Leave project membership | `DELETE /v1/projects/{id}/membership` | `project members leave` | `leave_project` | Browser Session or Member Token, any collaborator on that project |
| List projects | `GET /v1/projects` | `project list` | `list_projects` | Browser Session or Member Token, scoped to owned and shared projects |
| Create project | `POST /v1/projects` | `project create` | `create_project` | Browser Session or Member Token, owner only |
| Update project | `PATCH /v1/projects/{id}` | `project update` | `update_project` | Browser Session or Member Token, owner only |
| Delete project | `DELETE /v1/projects/{id}` | `project delete` | `delete_project` | Browser Session or Member Token, owner only |
| Get billing summary | `GET /v1/billing` | `billing get` | `get_billing_summary` | Browser Session or Member Token, owner only |
| Start no-card trial | `POST /v1/billing/trial/start` | `billing trial start` | `start_trial` | Browser Session or Member Token, owner only |
| Start billing checkout | `POST /v1/billing/checkout` | — | — | Browser Session only, owner only |
| Open billing portal | `POST /v1/billing/portal` | — | — | Browser Session only, owner only |
| Increase capacity now | `POST /v1/billing/capacity/increase` | `billing capacity increase` | `increase_capacity` | Browser Session or Member Token, owner only |
| Schedule capacity reduction | `POST /v1/billing/capacity/scheduled-reduction` | `billing capacity schedule-reduction` | `schedule_capacity_reduction` | Browser Session or Member Token, owner only |
| Cancel scheduled capacity reduction | `DELETE /v1/billing/capacity/scheduled-reduction` | `billing capacity cancel-reduction` | `cancel_capacity_reduction` | Browser Session or Member Token, owner only |
| List project tokens | `GET /v1/projects/{id}/tokens` | `token project list` | `list_project_tokens` | Browser session or member token with project access |
| Create project token | `POST /v1/projects/{id}/tokens` | `token project create` | `create_project_token` | Owner/admin project access; plaintext returned once; optional static-browser origin allowlist |
| Revoke project token | `POST /v1/projects/{id}/tokens/{tokenId}/revoke` | `token project revoke` | `revoke_project_token` | Owner/admin project access |
| List member tokens | `GET /v1/member/tokens` | `token member list` | `list_member_tokens` | Browser session or member token scoped to caller |
| Create member token | `POST /v1/member/tokens` | `token member create` | `create_member_token` | Browser session or member token; plaintext returned once |
| Revoke member token | `POST /v1/member/tokens/{tokenId}/revoke` | `token member revoke` | `revoke_member_token` | Browser session or caller-owned member token |
| List services | `GET /v1/services` | `services` | `list_services` | |
| Alert CRUD | `POST/GET/PATCH/DELETE /v1/alerts` | `alert list/create/update/delete` | `list_alerts/create_alert/update_alert/delete_alert` | Browser Session or Member Token, scoped to project; member may mutate only self-created rules |
| Project Slack destinations | `GET /v1/projects/{id}/slack/destinations` | `slack list` | `list_slack_destinations` | Browser Session or Member Token, reusable Slack channel list for alert setup; preserved destinations remain readable while paused on Free |
| Test Slack destination | `POST /v1/projects/{id}/slack/destinations/{destinationId}/test` | `slack test` | `test_slack_destination` | Browser Session or Member Token, owner/admin only, Team tier |
| Delete Slack destination | `DELETE /v1/projects/{id}/slack/destinations/{destinationId}` | `slack delete` | `delete_slack_destination` | Browser Session or Member Token, owner/admin cleanup action; allowed after downgrade |
| Weekly report channel CRUD | `POST/GET/PATCH/DELETE /v1/weekly-report-channels` | `weekly-report list/create/update/delete` | `list_weekly_report_channels/create_weekly_report_channel/update_weekly_report_channel/delete_weekly_report_channel` | Browser Session or Member Token, scoped to organization/project; preserved Slack channels remain readable while paused |
| List webhooks | `GET /v1/webhooks` | `webhook list` | `list_webhooks` | Browser Session or Member Token, scoped to project |
| Create webhook | `POST /v1/webhooks` | `webhook create` | `create_webhook` | Signing secret returned once |
| Update webhook | `PATCH /v1/webhooks/{id}` | `webhook update` | `update_webhook` | Owner/admin may update any webhook; member may update only self-created webhooks |
| Delete webhook | `DELETE /v1/webhooks/{id}` | `webhook delete` | `delete_webhook` | Owner/admin may delete any webhook; member may delete only self-created webhooks |
| Test webhook | `POST /v1/webhooks/{id}/test` | `webhook test` | `test_webhook` | Queues a signed synthetic delivery; member may test only self-created webhooks |
| Webhook deliveries | `GET /v1/webhooks/{id}/deliveries` | `webhook deliveries` | `list_webhook_deliveries` | Statuses: pending, retrying, delivered, failed, disabled |
| Retry webhook delivery | `POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` | `webhook retry` | `retry_webhook_delivery` | Resets failed/disabled delivery to retrying; member may retry only self-created webhooks |
| Doctor | — | `doctor` | `doctor` | CLI/MCP-only (local env) |
| Validate | — | `validate [--fix]` | `validate` | CLI/MCP-only (local env) |
| Verify local | — | `verify local` | `verify_local` | CLI/MCP-only (local env) |
| Verify cloud | — | `verify cloud` | `verify_cloud` | Uses API internally; `--trigger-5xx`/`trigger5xx` proves hosted synthetic incident creation, `--trigger-4xx <status>`/`trigger4xxStatus` proves configured hosted 4xx promotion, and `--expect-app-event` proves real SDK-driven app capture |
| Smoke test | — | `smoke` | `smoke` | CLI/MCP-only |
| Login | — | `login` | — | CLI-only (stores member-token auth state locally; supports member-token, GitHub device, and `gh` bootstrap modes) |
| Setup project | — | `setup` | — | CLI-only (local scaffold generation, mixed-runtime discovery, relay scaffolding, and runtime-specific relay guidance) |
| Ingest local logs | — | `ingest` | — | CLI-only (local log parser pipeline) |
| Watch local logs | — | `watch` | — | CLI-only (local log tail pipeline) |
| Process local events | — | `process` | — | CLI-only (local file transport pipeline) |
| Connect | — | `connect` | — | CLI-only (interactive) |
| Profile validate | — | `profile validate` | — | CLI-only (local files) |
| Profile show | — | `profile show` | — | CLI-only (local files) |
| Profile sync | — | `profile sync` | — | CLI-only (local files) |
| Analyze (local) | — | `analyze` | `analyze` | CLI/MCP-only (local agent-driven) |
| Activate probes (remote) | `POST /v1/projects/{id}/probes/activate` | `probe activate` | `activate_probe` | Browser Session or Member Token, Solo+ only |
| List active probes (remote) | `GET /v1/projects/{id}/probes` | `probe list` | `list_active_probes` | Browser Session or Member Token, preserved activations remain readable while paused on Free |
| Deactivate probes (remote) | `POST /v1/projects/{id}/probes/deactivate` | `probe deactivate` | `deactivate_probe` | Browser Session or Member Token cleanup action; allowed after downgrade |
| List health checks | `GET /v1/projects/{id}/availability-checks` | `health checks list` | `list_health_checks` | Browser Session or Member Token; readable to any authorized project member |
| Get health check | `GET /v1/projects/{id}/availability-checks/{checkId}` | `health checks get` | `get_health_check` | Browser Session or Member Token; readable to any authorized project member |
| Create health check | `POST /v1/projects/{id}/availability-checks` | `health checks create` | `create_health_check` | Browser Session or Member Token, owner/admin only |
| Update health check | `PATCH /v1/projects/{id}/availability-checks/{checkId}` | `health checks update` | `update_health_check` | Browser Session or Member Token, owner/admin only |
| Delete health check | `DELETE /v1/projects/{id}/availability-checks/{checkId}` | `health checks delete` | `delete_health_check` | Browser Session or Member Token, owner/admin only |
| Test health check target | `POST /v1/projects/{id}/availability-checks/test` | `health checks test` | `test_health_check` | Browser Session or Member Token, owner/admin only, side-effect-free |
| List health check results | `GET /v1/projects/{id}/availability-checks/{checkId}/results` | `health checks results` | `list_health_check_results` | Browser Session or Member Token; readable to any authorized project member |
| List health check daily rollups | `GET /v1/projects/{id}/availability-checks/{checkId}/daily-rollups` | `health checks daily-rollups` | `list_health_check_daily_rollups` | Browser Session or Member Token; readable to any authorized project member |
| Get capture policy | `GET /v1/projects/{id}/capture-policy` | `capture-policy get` | `get_capture_policy` | Browser Session or Member Token; member receives preview-only payload |
| Update capture policy | `PATCH /v1/projects/{id}/capture-policy` | `capture-policy set` | `update_capture_policy` | Browser Session or Member Token, owner/admin only |
| List capture rules | `GET /v1/projects/{id}/capture-rules` | `capture-rule list` | `list_capture_rules` | Browser Session or Member Token; members receive preview-only payload |
| Create capture rule | `POST /v1/projects/{id}/capture-rules` | `capture-rule create` | `create_capture_rule` | Browser Session or Member Token, owner/admin only |
| Update capture rule | `PATCH /v1/projects/{id}/capture-rules/{ruleId}` | `capture-rule update` | `update_capture_rule` | Browser Session or Member Token, owner/admin only |
| Delete capture rule | `DELETE /v1/projects/{id}/capture-rules/{ruleId}` | `capture-rule delete` | `delete_capture_rule` | Browser Session or Member Token, owner/admin only |
| Get improvement settings | `GET /v1/projects/{id}/improvement-settings` | `improvements settings get` | `get_improvement_settings` | Browser Session or Member Token; members receive preview-only payload and all tiers can inspect availability |
| Update improvement settings | `PATCH /v1/projects/{id}/improvement-settings` | `improvements settings set` | `update_improvement_settings` | Browser Session or Member Token, owner/admin only, paid Solo+ or self-host |
| SDK config | `GET /v1/sdk/config` | — | — | SDK-only (project token, includes resolved capture policy) |
| Get GitHub App install URL | `GET /v1/github/app/install-url` | — | — | Browser Session or Member Token, owner/admin only on eligible Solo+ project; web convenience route for the install/reconnect CTA, optionally signed with a return path |
| Get GitHub installation | `GET /v1/github/installation` | `github status` | `get_github_status` | Browser Session or Member Token; read remains available when preserved GitHub setup is paused on Free |
| Disconnect GitHub installation | `DELETE /v1/github/installation` | — | — | Web/API cleanup action; owner/admin only and allowed after downgrade |
| List GitHub repositories | `GET /v1/github/repositories` | `github repos` | `list_github_repositories` | Browser Session or Member Token, owner/admin only on eligible Solo+ project |
| Get project GitHub repo | `GET /v1/projects/{id}/github/repo` | `github status` | `get_github_status` | Included in status response; read remains available when preserved GitHub setup is paused on Free |
| Set project GitHub repo | `PUT /v1/projects/{id}/github/repo` | `github repo set` | `set_project_github_repo` | Browser Session or Member Token, owner/admin only, Solo+ only |
| Remove project GitHub repo | `DELETE /v1/projects/{id}/github/repo` | `github repo remove` | `remove_project_github_repo` | Browser Session or Member Token, owner/admin cleanup action; allowed after downgrade |
| Create dispatch rule | `POST /v1/projects/{id}/github/rules` | `github rules create` | `create_github_dispatch_rule` | Browser Session or Member Token, any authorized project member on eligible Solo+ project |
| List dispatch rules | `GET /v1/projects/{id}/github/rules` | `github rules` | `list_github_dispatch_rules` | Browser Session or Member Token; read remains available when preserved GitHub setup is paused on Free |
| Get dispatch rule | `GET /v1/projects/{id}/github/rules/{ruleId}` | — | — | API convenience; CLI/MCP use list |
| Update dispatch rule | `PATCH /v1/projects/{id}/github/rules/{ruleId}` | `github rules update` | `update_github_dispatch_rule` | Browser Session or Member Token, owner/admin may update any rule; member may update only self-created rules |
| Delete dispatch rule | `DELETE /v1/projects/{id}/github/rules/{ruleId}` | `github rules delete` | `delete_github_dispatch_rule` | Browser Session or Member Token cleanup action; owner/admin may delete any rule and member may delete only self-created rules, allowed after downgrade |
| List dispatch deliveries | `GET /v1/projects/{id}/github/deliveries` | `github deliveries` | `list_github_deliveries` | Browser Session or Member Token; read remains available when preserved GitHub setup is paused on Free |
| Retry dispatch delivery | `POST /v1/projects/{id}/github/deliveries/{id}/retry` | `github deliveries retry` | `retry_github_delivery` | Browser Session or Member Token, owner/admin or creator-owned-rule member on eligible Solo+ project |
| GitHub App callback | `GET /v1/github/app/callback` | — | — | GitHub App setup URL / post-install redirect handler |
| GitHub App webhook | `POST /v1/github/app/webhook` | — | — | Installation lifecycle events (HMAC-verified) |
| GitHub Marketplace webhook | `POST /v1/github/marketplace/webhook` | — | — | GitHub Marketplace listing webhook for purchase/subscription lifecycle tracking (HMAC-verified) |

---

## 1. HTTP API

Base URL: `https://api.debugbundle.com/v1` (cloud). Self-hosted: configurable.

Auth model:
- Browser session cookie for interactive web-auth and member-authorized web usage
- Bearer member token for CLI, MCP, and automation
- Project token header for ingestion and SDK config

The full auth model is defined in `/spec/auth-architecture.md`.

Member-authorized routes accept either a valid browser session or a valid member token. After principal resolution, both paths must enforce the same authorization rules and execute the same domain behavior.

Stripe checkout and customer-portal billing routes remain browser-session-only interactive surfaces. Billing summary, no-card trial start, and allowance-capacity management routes now accept owner-scoped member tokens so CLI and MCP can reuse the same domain behavior.

### 1.0a Browser Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/request-code` | None | Request a one-time email code for browser sign-in or first-time signup |
| POST | `/v1/auth/verify-code` | None | Verify a one-time email code and create a browser session |
| POST | `/v1/auth/logout` | Browser Session | Revoke current browser session |
| GET | `/v1/auth/session` | Browser Session | Return current session state or `session: null` when signed out |
| GET | `/review/access` | None | Secret-gated reviewer bootstrap that sets a short-lived review grant cookie and redirects to the app |
| GET | `/v1/account/avatar` | Browser Session | Return the signed-in user's cached avatar bytes when one has been imported |
| POST | `/v1/account/avatar/import-gravatar` | Browser Session | Import and cache a Gravatar avatar server-side after explicit user action |
| GET | `/v1/account/export` | Browser Session | Export retained organization-account data as a JSON attachment (owner only) |
| POST | `/v1/account/delete/request-otp` | Browser Session | Request an email OTP for account deletion after the exact confirmation phrase is provided (owner only) |
| DELETE | `/v1/account` | Browser Session | Permanently delete the current organization account after phrase confirmation and OTP verification (owner only) |
| POST | `/v1/auth/project-invite/accept` | Browser Session | Accept a pending project invite for the current signed-in user |
| GET | `/v1/auth/github/start` | None | Start GitHub OAuth and set transient state cookie |
| GET | `/v1/auth/github/callback` | None | Complete GitHub OAuth, issue browser session, and redirect back to the app |
| POST | `/v1/auth/github/device/start` | None | Start GitHub device flow and return the verification URL/code |
| POST | `/v1/auth/github/device/poll` | None | Poll GitHub device-flow progress through DebugBundle |
| POST | `/v1/auth/github/device/claim` | None | Claim the issued member token after device approval completes |
| POST | `/v1/auth/github/token/exchange` | None | Exchange an existing GitHub access token for a DebugBundle member token |

Browser-session bootstrap endpoints exist for the SPA flow only. The separate GitHub CLI bootstrap endpoints are API-backed helpers used by `debugbundle login --github*`, while MCP still reuses the member-token auth state established by the CLI.

`GET /review/access?token=<secret>&next=/login` is an internal reviewer bootstrap surface enabled only when `REVIEW_ACCESS_SECRET` is configured. It validates the token with a constant-time comparison, rate-limits like other auth-adjacent endpoints, sets only a short-lived HttpOnly review grant cookie, and redirects to the app. The reviewer still signs in normally; when their owner session resolves, the server applies the existing internally managed Team override path and clears the review grant cookie. The API also accepts `/v1/auth/review/access` as a versioned alias for the same handler.

`GET /v1/admin/analytics/summary` is an internal browser-only operator surface for the hosted `/analytics` page. It is intentionally excluded from CLI/MCP parity because it is not a customer or automation capability. Access requires a valid browser session with verified email-code auth plus a normalized email present in `ADMIN_ANALYTICS_ACCESS_EMAILS`; member tokens are never accepted. Every unauthorized or unavailable state returns `404 { "error": "not_found" }` with `Cache-Control: no-store`, and the response body is aggregate-only with no account, user, project, email, token, or raw-event identifiers.

`GET /v1/admin/analytics/malformed-rejections` is a second internal browser-only operator surface for tracing malformed ingestion spikes. It uses the same access controls and `404 { "error": "not_found" }` fail-closed behavior as the summary route. Unlike the summary route, this response may include internal project/service identifiers plus SDK/version, event-type, and schema-validation metadata so operators can identify a misbehaving sender quickly. It must never include raw payload values, tokens, email addresses, or stack traces.

`GET /v1/auth/session` returns either `session: null` or a session object with `auth_methods.email`, `auth_methods.github`, `avatar_url`, and `csrf_token`. Browser-session mutations continue to use `csrf_token` from the same session payload.

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

When GitHub sign-in returns a profile image URL, the API may fetch and cache that avatar server-side in first-party object storage as a best-effort post-login step. Avatar import failures must not block authentication.

The CLI bootstrap flow is additive and issues the same member-token credential used by normal CLI/MCP auth. `POST /v1/auth/github/device/start` plus `poll`/`claim` implement the official GitHub device flow. `POST /v1/auth/github/token/exchange` accepts an already-authenticated GitHub access token such as the output of `gh auth token`.

`GET /v1/account/export` returns a JSON attachment with top-level `export_version: 1` plus the retained organization-account record set, including organization and project members, projects, tokens, capture policies, probes, hosted improvement opportunities, reusable Slack destinations, alerts, weekly reports, webhooks, GitHub automation, incidents, audit logs, billing-processing rows, retryable plan-cleanup rows, operational email rows, and retained raw-event, bundle, improvement-bundle, and reproduction artifacts when present in object storage.

`GET /v1/account/avatar` returns the signed-in user's cached avatar bytes with a first-party URL shape of `/v1/account/avatar`. `POST /v1/account/avatar/import-gravatar` performs a server-side fetch against Gravatar only after explicit user action, stores the resulting avatar in object storage, and returns:

- `200 { "avatar": { "source": "gravatar", "avatar_url": "/v1/account/avatar", "updated_at": "ISO8601" } }`
- `404 { "error": "gravatar_not_found" }` when no Gravatar image exists
- `502 { "error": "avatar_import_failed" }` when the remote fetch fails or returns an unsupported image

`POST /v1/account/delete/request-otp` requires an owner-scoped browser session plus the exact confirmation phrase:

```json
{
  "confirmation_text": "Delete my account"
}
```

On success, DebugBundle emails a six-digit OTP to the signed-in account email address.

- Non-owner session: `403 { "error": "forbidden" }`
- Confirmation phrase mismatch: `400 { "error": "invalid_confirmation" }`
- Email delivery unavailable: `503 { "error": "account_deletion_verification_unavailable" }`

`DELETE /v1/account` then requires the same phrase plus the emailed OTP:

```json
{
  "confirmation_text": "Delete my account",
  "otp": "123456"
}
```

- Non-owner session: `403 { "error": "forbidden" }`
- Confirmation phrase mismatch: `400 { "error": "invalid_confirmation" }`
- OTP mismatch or expiry: `400 { "error": "invalid_otp" }`
- User is still the sole owner of another organization: `409 { "error": "other_owned_organizations_exist" }`
- User still owns projects in another organization: `409 { "error": "other_owned_projects_exist" }`

On success, the delete removes the signed-in user from every remaining organization membership and shared-project collaboration by deleting the user identity. The sole-owner guard remains in place for any other organization that would otherwise be left without an owner, and deletion is blocked while the same identity still owns projects outside the organization being deleted.
Anonymized aggregate account-usage metrics are preserved after deletion for lifecycle analytics, but they are not user-accessible after the account is gone and they do not retain project names, payloads, tokens, emails, or other customer content. Required payment/provider-retention records are also preserved outside the normal account export surface for accounting, tax, audit, fraud, chargeback, and webhook-idempotency needs.

**Accept project invite request:**
```json
{
  "token": "dbundle_invite_..."
}
```

**Accept project invite response:**
```json
{
  "membership": {
    "project_id": "uuid",
    "user_id": "uuid",
    "role": "member"
  }
}
```

- Missing or invalid browser session: `401 { "error": "invalid_session" }`
- Invalid accept payload: `400 { "error": "invalid_payload" }`
- Missing, expired, or already-consumed invite token: `400 { "error": "invalid_token" }`
- Signed-in user email does not match invite email: `403 { "error": "invite_email_mismatch" }`
- Owner's current plan no longer allows project sharing, but the pending invite is preserved for later retry before expiry: `403 { "error": "shared_access_suspended" }`

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
        "activation_id": "uuid",
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
| POST | `/v1/incidents/resolve` | Browser Session or Member Token | Explicitly resolve incidents in bulk |
| POST | `/v1/incidents/{id}/reopen` | Browser Session or Member Token | Explicitly reopen an incident |
| POST | `/v1/incidents/reopen` | Browser Session or Member Token | Explicitly reopen incidents in bulk |
| GET | `/v1/incidents/{id}/bundle` | Browser Session or Member Token | Get debug bundle |
| GET | `/v1/incidents/{id}/reproduction` | Browser Session or Member Token | Get reproduction artifact |
| GET | `/v1/logs` | Browser Session or Member Token | Query logs by incident |

**Query params (list incidents):** `project_id`, `environment`, `service`, `status` (`active`/open/resolved/regressed; `active` means open or regressed), `severity`, `first_seen_after`, `attention_after`, `limit`, `cursor`

Current API implementation scope (Phase 7 continuation): `GET /v1/incidents` supports organization-scoped filtering by `project_id`, `environment`, `service`, `status`, `severity`, `first_seen_after`, `attention_after`, plus cursor-based pagination via `cursor` and `limit` (1-100, default 20). `attention_after` matches incidents first seen at or after the provided timestamp or regressed at or after the provided timestamp.

Low-value external-probe `GET`/`404` routes such as common WordPress, OWA, RDWeb, VPN, `/.env`, and autodiscover scanner paths may still exist as accepted request telemetry when capture policy allows them, but they should not appear as normal incidents unless the project explicitly promotes that status or a narrow status+path rule.

**Query params (logs):** `incident_id` (required), `level`, `limit`, `cursor`

**Incident response fields include:** `id`, `project_id`, `project_name`, `service_id`, `service_name`, `environment`, `fingerprint`, `fingerprint_version`, `title`, `severity`, `status`, `first_seen_at`, `last_seen_at`, `occurrence_count`, `affected_users_estimate`, `spike_detected_at`, `resolved_at`, `regressed_at`, `matched_fields`, `incident_reason`

Current API implementation scope (Phase 1 continuation):
- `GET /v1/incidents` response body: `{ incidents: IncidentRetrievalRecord[], next_cursor: string | null }`
- `GET /v1/incidents/{id}` response body: `{ incident: IncidentRetrievalRecord }`
- `GET /v1/incidents/{id}/context` response body: `IncidentContextRecord`
- `POST /v1/incidents/{id}/resolve` response body: `{ incident: IncidentRetrievalRecord }`
- `POST /v1/incidents/resolve` request body: `{ incident_ids: string[] }` (1-1000 hosted incident UUID strings, duplicates ignored before execution)
- `POST /v1/incidents/resolve` response body: `{ incidents: IncidentRetrievalRecord[] }`
- `POST /v1/incidents/{id}/reopen` response body: `{ incident: IncidentRetrievalRecord }`
- `POST /v1/incidents/reopen` request body: `{ incident_ids: string[] }` (1-1000 hosted incident UUID strings, duplicates ignored before execution)
- `POST /v1/incidents/reopen` response body: `{ incidents: IncidentRetrievalRecord[] }`
- `IncidentRetrievalRecord` fields: `incident_id`, `project_id`, `project_name`, `project_color_tag`, `service_id`, `service_name`, `latest_deployment_id`, `environment`, `fingerprint`, `fingerprint_version`, `title`, `severity`, `status`, `first_seen_at`, `last_seen_at`, `occurrence_count`, `spike_detected_at`, `resolved_at`, `regressed_at`, `matched_fields`, `incident_reason`
- `IncidentContextRecord` fields: `incident`, `incident_reason`, `primary_signal`, `bundle`, `reproduction`, `logs`, `deploy`, `grouping`, `visibility`, `redaction`, `browser_signal`, `suggested_next_checks`
- Retrieval clients must validate required fields but tolerate additive success fields so cloud API enrichments do not break installed CLI versions that do not consume the new fields.
- `primary_signal` summarizes the current incident's primary failing signal without requiring an LLM call. `logs.source` is one of `retrieval`, `bundle_context`, or `none`. `bundle` and `reproduction` use deterministic artifact states: `ready`, `pending`, or `failed`.
- `visibility` explains four operator-facing behaviors directly in retrieval output: how repeated failures group into the current fingerprint, when bundle regeneration occurs (including current precedence), how spike detection differs from incident creation, and how alert/webhook/GitHub cooldown windows suppress repeated lifecycle notifications.
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

### 1.2a Improvements

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/improvements` | Browser Session or Member Token | List hosted improvement opportunities (filterable) |
| GET | `/v1/improvements/{id}` | Browser Session or Member Token | Get hosted improvement metadata |
| POST | `/v1/improvements/{id}/resolve` | Browser Session or Member Token | Explicitly resolve a hosted improvement |
| POST | `/v1/improvements/{id}/reopen` | Browser Session or Member Token | Reopen a hosted improvement |
| POST | `/v1/improvements/{id}/snooze` | Browser Session or Member Token | Snooze a hosted improvement until a future ISO8601 timestamp |
| GET | `/v1/projects/{id}/improvements/{improvementId}/bundle` | Browser Session or Member Token | Get the hosted improvement bundle artifact |

**Query params (list improvements):** `project_id`, `environment`, `service`, `status` (open/resolved/snoozed), `severity`, `kind`, `limit`, `cursor`

Open request/log candidates below the configured generation threshold are internal counting state and are excluded from list responses. Common external-probe `GET`/`404` request paths are excluded from hosted improvement lists. Recurring-incident opportunities are listed after their recurrence threshold is met; post-deploy regression opportunities may be listed immediately.

Current API implementation scope:
- `GET /v1/improvements` response body: `{ improvements: ImprovementRetrievalRecord[], next_cursor: string | null }`
- `GET /v1/improvements/{id}` response body: `{ improvement: ImprovementRetrievalRecord }`
- `POST /v1/improvements/{id}/resolve` response body: `{ improvement: ImprovementRetrievalRecord }`
- `POST /v1/improvements/{id}/reopen` response body: `{ improvement: ImprovementRetrievalRecord }`
- `POST /v1/improvements/{id}/snooze` request body: `{ snoozed_until: string }`; response body: `{ improvement: ImprovementRetrievalRecord }`
- `GET /v1/projects/{id}/improvements/{improvementId}/bundle` response body: hosted improvement artifact JSON when present; `{ "status": "pending" }` while an artifact is still expected; `{ "status": "failed", "reason": "bundle_not_generated_yet" }` when a directly fetched opportunity is still below the hosted generation threshold; `{ "status": "failed", "reason": "..." }` when no artifact is currently available. Incident-derived opportunities (`recurring_incident`, `post_deploy_regression`) may return `{ "status": "failed", "reason": "covered_by_incident_bundle", "related_incident_ids": string[] }` because agents should fetch the related incident bundle instead of a duplicate improvement artifact.
- `ImprovementRetrievalRecord` fields: `improvement_id`, `project_id`, `project_name`, `project_color_tag`, `project_slug`, `service_id`, `service_name`, `service_runtime`, `service_framework`, `environment`, `kind`, `status`, `severity`, `confidence`, `fingerprint`, `title`, `summary`, `occurrence_count`, `evidence`, `related_incident_ids`, `first_detected_at`, `last_detected_at`, `resolved_at`, `snoozed_until`, `bundle_generation_number`, `bundle_created_at`, `bundle_updated_at`, `bundle_failure_reason`

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
- Preserved shared access paused by the owner's current tier: `403 { "error": "shared_access_suspended" }`

### 1.3a Project Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects/{id}/members` | Browser Session or Member Token (any authorized project member) | List project members including the owner and collaborators |
| GET | `/v1/projects/{id}/members/{userId}/avatar` | Browser Session or Member Token | Return a cached project member avatar for authorized project viewers |
| GET | `/v1/projects/{id}/invites` | Browser Session or Member Token (owner/admin only) | List pending, non-expired project invites |
| POST | `/v1/projects/{id}/invite` | Browser Session or Member Token (owner/admin only) | Create a pending project collaborator invite |
| DELETE | `/v1/projects/{id}/invites/{inviteId}` | Browser Session or Member Token (owner/admin only) | Cancel a pending project invite |
| PATCH | `/v1/projects/{id}/members/{userId}` | Browser Session or Member Token (owner/admin only) | Update a collaborator role between `admin` and `member` |
| DELETE | `/v1/projects/{id}/members/{userId}` | Browser Session or Member Token (owner/admin only) | Remove a collaborator from the project |
| DELETE | `/v1/projects/{id}/membership` | Browser Session or Member Token (collaborator only) | Leave a shared project as the authenticated collaborator |

**Member list response shape:**
```json
{
  "members": [
    {
      "user_id": "uuid",
      "email": "owner@example.com",
      "role": "owner",
      "membership_type": "owner",
      "avatar_url": null,
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
    "project_id": "uuid",
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
      "project_id": "uuid",
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
    "membership_type": "collaborator",
    "avatar_url": null,
    "created_at": "ISO8601"
  }
}
```

**Update member role request:**
```json
{
  "role": "admin"
}
```

**Update member role response shape:**
```json
{
  "member": {
    "user_id": "uuid",
    "email": "member@example.com",
    "role": "admin",
    "membership_type": "collaborator",
    "avatar_url": null,
    "created_at": "ISO8601"
  }
}
```

- Authorization failure: `401 { "error": "invalid_member_token" }`
- Forbidden for non-admin callers: `403 { "error": "forbidden" }`
- Preserved shared access paused by the project owner's current tier: `403 { "error": "shared_access_suspended" }`
- Unverified browser-session owner/admin callers cannot create or cancel invites: `403 { "error": "email_verification_required" }`
- Team-tier capability on the project owner's plan is required for invites: `403 { "error": "upgrade_required" }`
- Missing member-management dependency/surface: `404 { "error": "member_management_not_available" }`
- Invalid invite payload: `400 { "error": "invalid_payload" }`
- Invalid invite params: `400 { "error": "invalid_invite_id" }`
- Invalid member params: `400 { "error": "invalid_member_id" }`
- Existing project member email: `409 { "error": "member_already_exists" }`
- Existing pending invite email: `409 { "error": "invite_already_exists" }`
- Missing pending invite: `404 { "error": "invite_not_found" }`
- Missing project member: `404 { "error": "member_not_found" }`
- Missing project member avatar: `404 { "error": "avatar_not_found" }`
- Demoting the last remaining owner is not allowed on this surface: `409 { "error": "owner_role_change_not_allowed" }`
- Removing an owner is not allowed on this surface: `409 { "error": "owner_removal_not_allowed" }`

### 1.3b Project Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects` | Browser Session or Member Token | List projects visible to the caller, including owned and shared projects |
| POST | `/v1/projects` | Browser Session or Member Token (owner only) | Create new project in caller organization |
| PATCH | `/v1/projects/{id}` | Browser Session or Member Token (owner only) | Update project name, slug, default environment, or optional color tag |
| DELETE | `/v1/projects/{id}` | Browser Session or Member Token (owner only) | Delete project and its project-scoped resources |

**List projects query:**
- `limit` default `20`, min `1`, max `100`

When a collaborator keeps saved access to a shared project but the owner's current tier no longer allows sharing, `GET /v1/projects` still returns that project with `shared_access_suspended: true` so the UI can show a paused state instead of dropping the project from view. Project-scoped mutations for that collaborator return `403 { "error": "shared_access_suspended" }` until the owner upgrades again.

**Create project request:**
```json
{
  "name": "Main App",
  "slug": "main-app",
  "environment_default": "production",
  "color_tag": "blue"
}
```

`color_tag` is optional. Accepted values are `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, and `slate`.

**Project response shape:**
```json
{
  "project": {
    "project_id": "uuid",
    "organization_id": "uuid",
    "name": "Main App",
    "slug": "main-app",
    "environment_default": "production",
    "color_tag": "blue",
    "organization_plan": "free",
    "relationship": "owned",
    "effective_role": "owner",
    "sharing_state": "private",
    "owner_email": "owner@example.com",
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
  "environment_default": "production",
  "color_tag": null
}
```

All update fields are optional, but at least one field must be present. Set `color_tag` to `null` to clear a previously assigned tag.

`organization_plan` is the owning organization's active billing tier projected onto project-shaped responses for capability decisions. It is not a project-specific subscription. `sharing_state` exists in addition to `relationship` so owners can tell when one of their own projects has already been shared with collaborators.

Project `metrics.attention_incidents_today` counts incidents first opened today or regressed today. `metrics.opened_incidents_today` remains first-opened-only for compatibility.

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
| POST | `/v1/billing/trial/start` | Browser Session or Member Token (owner only) | Start an eligible 30-day no-card Solo or Team trial for the current organization |
| POST | `/v1/billing/checkout` | Browser Session (owner only) | Create a Stripe-hosted checkout session URL for an allowed upgrade target |
| POST | `/v1/billing/checkout/confirm` | Browser Session (owner only) | Verify a returned Stripe Checkout Session and sync the organization billing snapshot from Stripe |
| POST | `/v1/billing/portal` | Browser Session (owner only) | Create a Stripe-hosted customer-portal session URL for an active paid plan |
| POST | `/v1/billing/capacity/increase` | Browser Session or Member Token (owner only) | Immediately increase additional allowance-capacity units via Stripe subscription update with proration |
| POST | `/v1/billing/capacity/scheduled-reduction` | Browser Session or Member Token (owner only) | Schedule an allowance-capacity reduction to take effect at the next billing-period boundary via Stripe subscription schedule |
| DELETE | `/v1/billing/capacity/scheduled-reduction` | Browser Session or Member Token (owner only) | Cancel a pending scheduled allowance-capacity reduction, releasing the Stripe subscription schedule |

Billing summary, no-card trial start, and allowance-capacity management routes accept both browser session and owner-scoped member tokens. Checkout, checkout confirmation, and portal routes are browser-session-only interactive surfaces. Stripe checkout sessions are created dynamically with `client_reference_id` = `organization_id`; the success URL includes Stripe's `{CHECKOUT_SESSION_ID}` placeholder so the web app can ask the API to verify the returned Checkout Session and sync the account immediately.

For paid internally managed accounts (`stripe_customer_id = null`), the same capacity routes remain available. In that mode, increases and reductions both apply immediately to the stored purchased-capacity quantity and `pending_reduction` remains `null`.

**Billing summary response shape:**
```json
{
  "billing": {
    "plan": "solo",
    "billing_state": "trialing",
    "stripe_customer_id": null,
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
        "limit": 10500
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
      },
      "monthly_webhook_deliveries": {
        "used": 20,
        "limit": 750
      }
    },
    "trial": {
      "available": false,
      "active": true,
      "plan": "solo",
      "started_at": "2026-03-01T00:00:00.000Z",
      "ends_at": "2026-03-31T00:00:00.000Z",
      "used_at": "2026-03-01T00:00:00.000Z",
      "converted_at": null,
      "expired_at": null,
      "days_remaining": 14
    }
  }
}
```

`active_projects` is the current count of active projects. Project creation is not gated by `capacity_units.total`.

`billing_state` reflects the organization's current billing lifecycle state. It is `null` for baseline Free organizations with no paid or trial lifecycle state yet.

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

`trial` is always present. It records whether the organization is currently eligible for a no-card trial, whether a trial is active, the selected trial plan when one was used, lifecycle timestamps (`started_at`, `used_at`, `converted_at`, `expired_at`), and `days_remaining` during an active trial.

**Trial start request:**
```json
{
  "target_plan": "team"
}
```

`target_plan` must be `solo` or `team`. The route starts a 30-day no-card trial only when the organization is still eligible. Response is the updated billing summary.

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

`target_additional_capacity_units` must be less than the current `additional_purchased` count and no greater than 99 (0 to remove all extra capacity units). For Stripe-managed paid accounts, a Stripe subscription schedule is created (or updated) with two phases: current phase maintains current capacity until billing period end, next phase applies the reduced quantity. Response is the updated billing summary with `pending_reduction` populated. For internally managed paid accounts, the reduction is applied immediately and `pending_reduction` stays `null`.

**Cancel capacity reduction:** No request body. Releases the Stripe subscription schedule and keeps the current capacity quantity. Response is the updated billing summary with `pending_reduction: null`.

- Missing or invalid session/token: `401 { "error": "invalid_session" }` or `401 { "error": "invalid_member_token" }`
- Forbidden for non-owner callers: `403 { "error": "forbidden" }`
- Missing billing dependency/surface: `404 { "error": "billing_not_available" }`
- Missing billing record for organization: `404 { "error": "billing_not_found" }`
- Invalid checkout payload: `400 { "error": "invalid_payload" }`
- Trial already used, active, or otherwise unavailable: `409 { "error": "trial_unavailable" }`
- Invalid upgrade target for current plan: `409 { "error": "invalid_plan_change" }`
- Checkout confirmation could not find or use the returned session: `404 { "error": "checkout_session_not_found" }` or `409 { "error": "checkout_not_complete" }`
- Portal requested for free plan: `409 { "error": "no_active_subscription" }`
- Stripe not configured or temporarily unavailable: `503 { "error": "billing_not_configured" }` or `503 { "error": "billing_service_error" }`
- Capacity-management error (free plan, invalid target, pending reduction conflict, or active trial conversion required): `409` with descriptive error code such as `trial_conversion_required`

### 1.3d Token Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects/{id}/tokens` | Browser Session or Member Token | List project tokens visible through project access |
| POST | `/v1/projects/{id}/tokens` | Browser Session or Member Token, owner/admin project access | Create new project token (plaintext shown once) |
| POST | `/v1/projects/{id}/tokens/{tokenId}/revoke` | Browser Session or Member Token, owner/admin project access | Revoke project token |
| GET | `/v1/member/tokens` | Browser Session or Member Token | List member tokens for caller identity |
| POST | `/v1/member/tokens` | Browser Session or Member Token | Create new member token (plaintext shown once) |
| POST | `/v1/member/tokens/{tokenId}/revoke` | Browser Session or Member Token | Revoke member token |

**Create token request:**
```json
{
  "label": "ci",
  "allowed_origins": ["https://app.example.com"]
}
```

`allowed_origins` is optional and applies only to project tokens. It can be set through the dashboard's **Allowed browser origins** field or through CLI/API/MCP automation. The dashboard accepts one origin per line or comma-separated. When present, `POST /v1/events` and `GET /v1/sdk/config` require an `Origin` header matching one of the normalized origins; requests without `Origin` are rejected. This is intended for direct/static browser ingestion abuse reduction and should not be used for server SDK or relay-forwarding tokens. It is not a replacement for the same-origin browser relay because non-browser clients can still spoof `Origin`.

**Create token response:**
```json
{
  "token": {
    "token_id": "uuid",
    "label": "ci",
    "allowed_origins": ["https://app.example.com"],
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
  "severity_lifecycle_scope": "both",
  "cooldown_seconds": 604800,
  "config": {
    "to": "oncall@example.com"
  },
  "is_enabled": true
}
```

`service_id`, `severity_min`, and `severity_lifecycle_scope` are optional on create, and `is_enabled` defaults to `true`.
`severity_lifecycle_scope` applies only to `condition_type: "severity_threshold"` and may be `new_incident`, `incident_regressed`, or `both`; omitted severity-threshold rules default to `both`, while non-threshold rules return `null`.
`cooldown_seconds` is optional, defaults to `0`, and may be set between `0` and `604800` seconds (7 days).
For `channel: "email"`, `config.to` is required and must be a single recipient email address. Create additional alert rules if multiple people should receive email notifications.
For `channel: "slack"`, prefer `config.slack_destination_id` when the workspace/channel was connected through the Slack OAuth flow. Direct `config.webhook_url` remains valid for callers that intentionally want a raw webhook configuration.

**Update alert request:**
```json
{
  "channel": "webhook",
  "service_id": null,
  "severity_min": null,
  "severity_lifecycle_scope": "incident_regressed",
  "cooldown_seconds": 3600,
  "config": {
    "target_url": "https://hooks.example.test/alerts"
  },
  "is_enabled": false
}
```

Update requests must include at least one field. `service_id`, `severity_min`, `severity_lifecycle_scope`, and `config` accept `null` to clear or reset the stored value.
`cooldown_seconds` accepts `0` to disable suppression and positive values up to `604800` to suppress repeated notifications for the same notification key.
When updating channel-specific `config`, include the `channel` in the same request so validation can apply the correct config schema.

**Alert response:**
```json
{
  "alert": {
    "alert_id": "uuid",
    "project_id": "uuid",
    "created_by_user_id": "uuid",
    "service_id": null,
    "channel": "email",
    "condition_type": "severity_threshold",
    "severity_min": "high",
    "severity_lifecycle_scope": "both",
    "cooldown_seconds": 604800,
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
      "created_by_user_id": "uuid",
      "service_id": null,
      "channel": "slack",
      "condition_type": "error_spike",
      "severity_min": null,
      "severity_lifecycle_scope": null,
      "cooldown_seconds": 0,
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
- `GET /v1/alerts` returns `200 { alerts: AlertRule[] }` for callers authorized on the target project.
- `POST /v1/alerts` returns `201 { alert: AlertRule }`.
- `PATCH /v1/alerts/{id}` returns `200 { alert: AlertRule }` for owner/admin or the rule creator.
- `DELETE /v1/alerts/{id}` returns `204` on success for owner/admin or the rule creator.
- Worker-side alert evaluation now enqueues internal `evaluate-alerts` jobs from real incident transitions for `new_incident`, `severity_threshold`, `incident_regressed`, `regression_after_deploy`, and `error_spike` conditions.
- Matching non-email alerts persist one internal `alert_deliveries` row per `alert_id + incident_id + dedupe_key` before delivery so duplicate worker replays stay idempotent. Email alerts aggregate into a 10-second per-project/per-recipient digest queue backed by `alert_email_digests` plus `alert_email_digest_items`, so bursts send one email while preserving per-incident dedupe.
- Each alert rule may additionally define a delivery cooldown window via `cooldown_seconds`. This suppresses repeated notifications for the same computed notification key without changing incident grouping. Default `0` preserves existing behavior.
- Severity-threshold rules use `severity_lifecycle_scope` to match new incidents, incident regressions, or both. The default is `both`; delivery dedupe keys separate new-incident and regression lifecycle events so a new high-severity incident and its later regression can notify independently.
- Severity is inferred from signal confidence before alert filters run. Backend exceptions, non-opaque frontend exceptions, and immediate request-failure incident signals infer `high`; opaque browser-native `window_error` signals infer `low`; opaque browser-native `resource_error` signals infer `medium`; `error_suppressed` infers `medium`; other events infer `low`.
- Opaque browser `frontend_exception` alerts may reuse a broader notification key than the incident fingerprint so repeated low-information browser-native `window_error` signals can be suppressed across otherwise separate incidents.
- Delivery transport is implemented for `channel: "email"`, `channel: "slack"`, `channel: "discord"`, and `channel: "webhook"`. Email requires `config.to` as a single recipient address; Slack accepts either `config.slack_destination_id` (resolved to an encrypted stored webhook URL at delivery time) or `config.webhook_url`; Discord requires `config.webhook_url`; webhook requires `config.target_url`.
- Authorization failure: `401 { "error": "invalid_member_token" }`
- Invalid list query: `400 { "error": "invalid_query" }`
- Invalid alert ID: `400 { "error": "invalid_alert_id" }`
- Invalid create/update body: `400 { "error": "invalid_payload" }`
- Slack channel unavailable on current plan: `403 { "error": "upgrade_required" }`
- Missing scoped project on list/create: `404 { "error": "project_not_found" }`
- Missing scoped connected Slack destination on create/update: `404 { "error": "slack_destination_not_found" }`
- Missing scoped alert on update/delete: `404 { "error": "alert_not_found" }`
- Existing alert owned by another collaborator when member tries to mutate it: `403 { "error": "forbidden" }`

### 1.4a Slack Connected Destinations

These routes back the Team-tier `Connect Slack` flow inside the project alerts modal and the agent-facing Slack destination management commands. The OAuth callback remains browser-only, while API, CLI, and MCP all support listing, testing, and deleting reusable Slack destinations plus creating browser handoff install URLs.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/slack/app/install-url` | Browser Session or Member Token (owner/admin only) | Return a Slack OAuth authorize URL for a project-scoped connect flow |
| GET | `/v1/slack/app/callback` | None | Complete Slack OAuth and redirect back to the app |
| GET | `/v1/projects/{id}/slack/destinations` | Browser Session or Member Token | List reusable connected Slack channels for the project organization |
| POST | `/v1/projects/{id}/slack/destinations/{destinationId}/test` | Browser Session or Member Token (owner/admin only) | Send a test message to a reusable connected Slack channel |
| DELETE | `/v1/projects/{id}/slack/destinations/{destinationId}` | Browser Session or Member Token (owner/admin only) | Disconnect a reusable Slack destination |

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
- `GET /v1/slack/app/install-url` requires owner/admin access, a Team-tier organization, and a scoped project.
- `GET /v1/projects/{id}/slack/destinations` requires member auth and keeps preserved destinations readable after downgrade so saved Slack setup remains visible while paused on Free.
- `POST /v1/projects/{id}/slack/destinations/{destinationId}/test` requires owner/admin access, decrypts the stored webhook URL, sends a Slack test message, and returns `502` with a stable Slack-specific error code when delivery fails.
- `DELETE /v1/projects/{id}/slack/destinations/{destinationId}` requires owner/admin access, remains available as a cleanup action after downgrade, and returns `409 { "error": "slack_destination_in_use" }` while any alert rule or weekly report still references that destination.
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

Lifecycle webhook delivery creation is paused when the shared `monthly_webhook_deliveries` allowance is exhausted. Existing incidents, bundles, webhook configuration, delivery history, and manual retry of already-created failed deliveries remain available. Synthetic test deliveries also consume this meter and return `429 { "error": "monthly_quota_exceeded" }` with `Retry-After` when the allowance is exhausted.

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
    "created_by_user_id": "uuid",
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
    "created_by_user_id": "uuid",
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

Owner and admin may manage any webhook in the project. Plain members may create webhooks, but may update, test, retry, or delete only the webhooks they created themselves.

### 1.6 Weekly Report Channels

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/weekly-report-channels` | Browser Session or Member Token | Create weekly report channel |
| GET | `/v1/weekly-report-channels` | Browser Session or Member Token | List weekly report channels |
| PATCH | `/v1/weekly-report-channels/{id}` | Browser Session or Member Token | Update weekly report channel |
| DELETE | `/v1/weekly-report-channels/{id}` | Browser Session or Member Token | Delete weekly report channel |

Project members with access may list weekly report channels. Only project owners and admins may create, update, or delete weekly report channels.

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

Always-on probes (ring buffer + error-flush) require no API endpoints — they are purely SDK-local. The endpoints below manage **remote activation** (Solo+ only). When a project downgrades to Free, saved remote probe activations remain readable through the management list route so owners can see what will resume after an upgrade. Activation still fails with `upgrade_required` while the lower tier is active, while deactivation remains available as a cleanup action.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/probes/activate` | Browser Session or Member Token (Solo+) | Remotely activate probes matching a label pattern |
| GET | `/v1/projects/{id}/probes` | Browser Session or Member Token | List active remote probe activations; preserved activations remain readable while paused on Free |
| POST | `/v1/projects/{id}/probes/deactivate` | Browser Session or Member Token | Deactivate a remote probe activation; cleanup remains available after downgrade |
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
      "activation_id": "uuid",
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
      "activation_id": "uuid",
      "label_pattern": "checkout.*",
      "service": "checkout-api | *",
      "environment": "production | *",
      "expires_at": "ISO8601"
    }
  ],
  "poll_interval_ms": 60000,
  "trigger_token_key": "project-scoped signing key for trigger-token validation"
}
```

`trigger_token_key` is present only when remote probes are enabled for the project. SDKs use it to validate `dbundle_probe_...` trigger tokens locally without an API call.

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

### 1.8a Availability Checks

Availability checks are hosted external HTTP checks executed by DebugBundle infrastructure, not by customer SDKs. V1 supports `GET` and `HEAD` targets only. Failures reuse the same incident, bundle, alert, webhook, CLI, MCP, and project-navigation model as the rest of DebugBundle rather than creating a separate uptime product. Saved checks remain visible after downgrade; checks that exceed the current plan's count or interval limits are marked paused and stop executing until the project becomes eligible again.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/projects/{id}/availability-checks` | Browser Session or Member Token | List health checks plus plan-derived limits for the project |
| GET | `/v1/projects/{id}/availability-checks/{checkId}` | Browser Session or Member Token | Fetch one health check plus current plan-derived limits |
| POST | `/v1/projects/{id}/availability-checks` | Browser Session or Member Token (owner/admin) | Create a hosted health check |
| PATCH | `/v1/projects/{id}/availability-checks/{checkId}` | Browser Session or Member Token (owner/admin) | Update a hosted health check |
| DELETE | `/v1/projects/{id}/availability-checks/{checkId}` | Browser Session or Member Token (owner/admin) | Delete a hosted health check |
| POST | `/v1/projects/{id}/availability-checks/test` | Browser Session or Member Token (owner/admin) | Run a side-effect-free target test using the same validation and execution rules as saved checks |
| GET | `/v1/projects/{id}/availability-checks/{checkId}/results` | Browser Session or Member Token | List recent raw execution results for a health check |
| GET | `/v1/projects/{id}/availability-checks/{checkId}/daily-rollups` | Browser Session or Member Token | List retained per-day state rollups for a health check |

**Create request:**
```json
{
  "name": "Primary app",
  "url": "https://app.example.com/health",
  "method": "GET",
  "expected_status_min": 200,
  "expected_status_max": 399,
  "timeout_ms": 2500,
  "interval_seconds": 60,
  "failure_threshold": 3,
  "recovery_threshold": 2,
  "environment": "production",
  "service_name": "web",
  "enabled": true
}
```

| Field | Required | Default | Constraint |
|-------|----------|---------|------------|
| `name` | Yes | — | 1-120 chars |
| `url` | Yes | — | `http` or `https` only; credentials forbidden; local/private targets blocked |
| `method` | No | `GET` | `GET` or `HEAD` |
| `expected_status_min` | No | `200` | integer `100-599`, must be `<= expected_status_max` |
| `expected_status_max` | No | `399` | integer `100-599`, must be `>= expected_status_min` |
| `timeout_ms` | No | `2500` | integer `500-5000` |
| `interval_seconds` | Yes | — | integer `30-86400`, but plan minimums may be higher |
| `failure_threshold` | No | `3` | integer `1-10` |
| `recovery_threshold` | No | `2` | integer `1-10` |
| `environment` | No | project-default behavior | optional project-scoped environment label |
| `service_name` | No | `null` | optional service label used for filtering and incident grouping |
| `enabled` | No | `true` | disabled checks remain visible and retained but do not execute |

**List response:**
```json
{
  "checks": [
    {
      "check_id": "uuid",
      "name": "Primary app",
      "url": "https://app.example.com/health",
      "method": "GET",
      "interval_seconds": 60,
      "status": "passing",
      "paused_reason": null,
      "environment": "production",
      "service_name": "web",
      "last_checked_at": "ISO8601",
      "next_check_at": "ISO8601",
      "last_result_status": "success",
      "last_result_http_status": 200,
      "last_result_duration_ms": 183
    }
  ],
  "limits": {
    "max_checks_per_project": 5,
    "min_interval_seconds": 60
  }
}
```

`status` is one of `unknown`, `passing`, `failing`, or `paused`. `paused` is used for disabled checks and for preserved checks that exceed current plan limits after downgrade. The worker retains raw results and daily rollups for 30 days so the project can later expose a status-history page without schema changes.

**Results response:**
```json
{
  "results": [
    {
      "result_id": "uuid",
      "started_at": "ISO8601",
      "completed_at": "ISO8601",
      "duration_ms": 183,
      "status": "success",
      "http_status": 200,
      "error_kind": null,
      "error_message": null,
      "redirect_count": 0,
      "checked_url_host": "app.example.com",
      "final_url": "https://app.example.com/health"
    }
  ]
}
```

**Daily rollups response:**
```json
{
  "rollups": [
    {
      "day": "2026-06-15",
      "state": "operational",
      "total_checks": 1440,
      "successful_checks": 1439,
      "failed_checks": 1,
      "degraded_checks": 0,
      "avg_duration_ms": 190,
      "downtime_seconds": 30,
      "incident_ids": []
    }
  ]
}
```

Daily rollup `state` is intentionally less sensitive than raw execution status. A failed execution below the configured consecutive `failure_threshold` records failed checks, downtime estimate, and a `degraded` day, but it does not mark the full day `down`. A day is `down` only after the threshold-backed availability incident path opens or regresses an incident and appends that incident id to the rollup.

Guardrails:

| Constraint | Free | Solo | Team |
|------------|------|------|------|
| Max checks per project | 1 | 5 | 25 |
| Minimum interval | 300s (5m) | 60s | 30s |
| History retention | 30 days | 30 days | 30 days |
| Read access | Authorized project member | Authorized project member | Authorized project member |
| Create/update/delete/test | Owner/admin | Owner/admin | Owner/admin |

When consecutive failures reach `failure_threshold`, DebugBundle opens or regresses the linked availability incident for that check using the normal incident lifecycle. When consecutive successes reach `recovery_threshold`, DebugBundle auto-resolves the linked availability incident.

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
    "immediate_client_error_statuses": [401, 403, 409, 422],
    "immediate_client_error_path_rules": [
      { "status_code": 404, "path_pattern": "/checkout/*", "methods": ["GET", "POST"] }
    ]
  },
  "overrides": {
    "capture_logs": "off | warning | error | info | null",
    "capture_request_events": "off | failures_only | filtered | all | null",
    "capture_breadcrumbs": "local_only | exception_only | standalone | null",
    "capture_probe_events": "buffer_only | standalone_when_activated | null",
    "immediate_client_error_statuses": null,
    "immediate_client_error_path_rules": null
  },
  "access_mode": "editable | preview"
}
```

`policy` is the effective resolved policy after merging preset defaults with any non-null overrides. `access_mode: "editable"` responses include `overrides` so owner/admin clients can distinguish `use preset default` from explicit `none`. `access_mode: "preview"` responses are returned to plain members and omit raw override provenance from the interactive experience. SDKs consume the same resolved values via `GET /v1/sdk/config`.

**Update capture policy:**

```
PATCH /v1/projects/{id}/capture-policy
Authorization: Bearer dbundle_member_...  (or browser session, owner/admin only)
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
  "immediate_client_error_statuses": [401, 403, 409, 422],
  "immediate_client_error_path_rules": [
    { "status_code": 404, "path_pattern": "/checkout/*", "methods": ["GET", "POST"] }
  ]
}
```

Response `200`: same shape as GET response with updated values.

**Validation rules:**
- `preset` must be one of `minimal`, `balanced`, `investigative`
- override keys must be valid control names
- override values must be valid for that control
- `immediate_client_error_statuses` must contain only integer HTTP statuses in `400..499`, is normalized to deduped ascending order, and is limited to 12 entries
- `null` for `immediate_client_error_statuses` means `use preset default`; `[]` means explicit `none`
- `immediate_client_error_path_rules` must contain at most 25 rules; each rule uses a `4xx` `status_code`, a `path_pattern` that starts with `/` and may use only a terminal `*` wildcard, and optional HTTP `methods` normalized to uppercase
- `null` for `immediate_client_error_path_rules` means `use preset default`; `[]` means explicit `none`
- Free-tier projects cannot set `capture_probe_events` to `standalone_when_activated` (returns 403)
- Omitted override fields keep their existing override state; on a project with no saved capture-policy row yet, omitted overrides behave as `null` and resolve from preset defaults
- Plain members receive `403 { "error": "forbidden" }` on update attempts

**Error responses:**
- `401` — missing or invalid auth
- `403` — insufficient role (non-owner) or tier restriction
- `404` — project not found or not in caller's organization

### 1.9a Capture Rules

Per-project capture rules let operators manually `demote`, `sample`, or `drop` known noisy event patterns after they appear in real incidents.

**List capture rules:**

```
GET /v1/projects/{id}/capture-rules
Authorization: Bearer dbundle_member_...  (or browser session)
```

Response `200`:
```json
{
  "access_mode": "manage | preview",
  "rules": []
}
```

**Create capture rule:**

```
POST /v1/projects/{id}/capture-rules
Authorization: Bearer dbundle_member_...  (or browser session, owner/admin only)
Content-Type: application/json
```

Request body matches the shared capture-rule schema and supports `action: "demote" | "sample" | "drop"` plus matcher fields such as `event_types`, `services`, `environments`, `runtime`, `browser_event_kind`, `browser_event_opaque`, `client_kind`, `bot_family`, `message_equals`, `message_contains`, `error_name`, `resource_url`, `request_url`, `status_codes`, `first_party`, and optional `fingerprint`.

**Suggest capture rules from an incident:**

```
POST /v1/incidents/{id}/capture-rule-suggestion
Authorization: Bearer dbundle_member_...  (or browser session)
```

Response `200`:
```json
{
  "bundle_status": "ready | pending | failed",
  "bundle_reason": "string | null",
  "suggestions": [
    {
      "suggestion_id": "primary_resource_host_demote",
      "label": "Demote resource errors from analytics.example.com",
      "recommended_action": "demote",
      "confidence": "high | medium | low",
      "reason": "string",
      "requires_confirmation": false,
      "created_rule_id": "uuid | null",
      "created_rule_enabled": true,
      "rule": {}
    }
  ]
}
```

Suggestions are deterministic from stored incident + bundle evidence. `created_rule_id` is populated when the suggested condition already has a matching project rule, including disabled rules. `pending` indicates the bundle is not ready yet. `failed` indicates the bundle cannot currently support suggestion generation.

**Create a capture rule from a suggestion:**

```
POST /v1/incidents/{id}/capture-rules
Authorization: Bearer dbundle_member_...  (or browser session, owner/admin only)
Content-Type: application/json
```

Request body:
```json
{
  "suggestion_id": "primary_resource_host_demote",
  "name": "Demote analytics resource noise",
  "description": null,
  "enabled": true,
  "expires_at": null
}
```

Response `201`: same `{"rule": ...}` shape as direct capture-rule creation.

Response `200`: same `{"rule": ...}` shape when a matching rule already exists for the selected incident suggestion. This makes the suggestion workflow idempotent and prevents duplicate rules for the same suggested condition.

**Error responses:**
- `401` — missing or invalid auth
- `403` — insufficient role for create/update/delete
- `404` — incident, project, or suggestion not found
- `409` — suggestion generation unavailable because the incident bundle is not ready

### 1.10 Improvement Settings

Per-project improvement settings control whether hosted deterministic improvement analysis is enabled and how aggressively it fires on eligible paid tiers.

**Get improvement settings:**

```
GET /v1/projects/{id}/improvement-settings
Authorization: Bearer dbundle_member_...  (or browser session)
```

Response `200`:
```json
{
  "access_mode": "manage | preview",
  "cloud_automation_available": true,
  "settings": {
    "automated_improvement_bundles_enabled": true,
    "improvement_bundle_sensitivity": "high_confidence | balanced | verbose"
  }
}
```

`cloud_automation_available` is capability-derived from the caller's effective plan (`false` on Free, `true` on Solo/Team/self-host). The stored `settings` object is project-backed and is returned to authorized viewers even when hosted automation is not available for the current tier.

**Update improvement settings:**

```
PATCH /v1/projects/{id}/improvement-settings
Authorization: Bearer dbundle_member_...  (or browser session, owner/admin only)
Content-Type: application/json
```

Request body (all fields optional, but at least one is required):
```json
{
  "automated_improvement_bundles_enabled": false,
  "improvement_bundle_sensitivity": "high_confidence"
}
```

Response `200`: same shape as GET response with updated values.

**Validation rules:**
- `automated_improvement_bundles_enabled` must be boolean when provided
- `improvement_bundle_sensitivity` must be one of `high_confidence`, `balanced`, or `verbose`
- request body must include at least one mutable field
- plain members receive `403 { "error": "forbidden" }` on update attempts
- Free-tier projects receive `403 { "error": "upgrade_required" }` on update attempts because hosted cloud automation is not available

**Error responses:**
- `401` — missing or invalid auth
- `403` — insufficient role or tier restriction
- `404` — project not found or improvement settings unavailable

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
    "immediate_client_error_statuses": [],
    "immediate_client_error_path_rules": []
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

The setup callback endpoint completes the App installation flow for trusted in-app installs: it requires the signed install `state` to match the transient install cookie, validates the `installation_id` through the GitHub App client before recording it in `github_installations`, accepts GitHub's optional `setup_action`, and redirects the user back into the originating DebugBundle project GitHub tab. If GitHub reaches the setup URL without DebugBundle's install state, such as a direct Marketplace install, the endpoint clears any stale install cookie and redirects to the web app without trusting or persisting the unauthenticated `installation_id`.

The webhook endpoint handles `installation.created`, `installation.deleted`, `installation.suspend`, and `installation.unsuspend` events. All payloads are verified with HMAC-SHA256 using `GITHUB_APP_WEBHOOK_SECRET`.

**Installation and repository management:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/github/app/install-url` | Browser Session or Member Token (owner/admin only) | Get the GitHub App installation URL used by the web install/reconnect CTA |
| GET | `/v1/github/installation` | Browser Session or Member Token | Get current org's GitHub App installation status; preserved setup remains readable while paused on Free |
| DELETE | `/v1/github/installation` | Browser Session or Member Token (owner/admin only) | Disconnect GitHub installation |
| GET | `/v1/github/repositories` | Browser Session or Member Token (owner/admin only) | List repositories available to the installation |
| GET | `/v1/projects/{id}/github/repo` | Browser Session or Member Token | Get project's assigned primary repo |
| PUT | `/v1/projects/{id}/github/repo` | Browser Session or Member Token (owner/admin only) | Set or change project's primary repo |
| DELETE | `/v1/projects/{id}/github/repo` | Browser Session or Member Token (owner/admin only) | Remove project's repo assignment |

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

GitHub automation eligibility is determined from the target project's owner plan, not from the acting collaborator's personal account plan.

`POST /v1/github/marketplace/webhook` is separate from the GitHub App installation webhook. It exists for GitHub Marketplace listing events such as `ping` and `marketplace_purchase`, verifies `X-Hub-Signature-256`, persists the latest Marketplace purchase snapshot keyed by the GitHub Marketplace account, and records processed delivery IDs for idempotency. In the current billing model, this route does **not** mutate DebugBundle organization billing tiers or Stripe-derived entitlements; it tracks Marketplace-originated listing state and can later be linked to a DebugBundle organization through the shared GitHub App installation ID.

**Dispatch rule management:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/projects/{id}/github/rules` | Browser Session or Member Token | Create dispatch rule |
| GET | `/v1/projects/{id}/github/rules` | Browser Session or Member Token | List dispatch rules |
| GET | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token | Get single rule |
| PATCH | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token | Update rule |
| DELETE | `/v1/projects/{id}/github/rules/{ruleId}` | Browser Session or Member Token | Delete rule |

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

Rules may also subscribe to hosted improvement bundle creation:
```json
{
  "name": "Hosted improvements",
  "event_types": ["improvement_bundle.created"],
  "environments": ["production"],
  "services": [],
  "severity_min": "medium",
  "bundle_type": "improvement",
  "incident_status": "new_or_reopened",
  "cooldown_seconds": 300
}
```

`incident_status` only affects incident lifecycle events. Hosted improvement rules send `incident_status: "new_or_reopened"` for schema consistency and match on `bundle_type: "improvement"` plus the selected `improvement_bundle.created` event.

**Rule response:**
```json
{
  "rule": {
    "rule_id": "uuid",
    "project_id": "uuid",
    "created_by_user_id": "uuid",
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

**Deliveries query params:** `status` (optional: `pending`, `delivered`, `failed`, `retrying`, `skipped`), `limit` (optional, 1-100, default 20)

**List deliveries response:**
```json
{
  "deliveries": [
    {
      "delivery_id": "uuid",
      "rule_id": "uuid",
      "rule_name": "High severity incidents",
      "incident_id": "uuid-or-null",
      "improvement_id": "uuid-or-null",
      "target_title": "TypeError in checkout",
      "status": "delivered | skipped",
      "attempt_count": 1,
      "last_attempt_at": "ISO8601",
      "last_error": null,
      "github_status_code": 204,
      "created_at": "ISO8601"
    }
  ]
}
```

Exactly one of `incident_id` or `improvement_id` is present. `target_title` is the incident title for failure-bundle dispatches and the improvement title for hosted improvement dispatches.

**Retry response:** Same shape as single delivery.

`skipped` delivery records are non-retryable warnings created when DebugBundle suppresses a matching dispatch because the project or GitHub App installation has reached its hourly dispatch limit.

Owner and admin may manage any dispatch rule. Plain members may create dispatch rules on an eligible shared project, but may update, delete, or retry only the rules and deliveries tied to rules they created themselves. Plain members may not mutate the shared GitHub installation or repository assignment.

When a project downgrades to Free, preserved GitHub installation state, repository assignment, dispatch rules, and delivery history remain readable so the owner can see what will resume after an upgrade. GitHub install flows, repository set/update operations, rule create/update operations, and delivery retries still fail with `upgrade_required` while the lower tier is active. Delete-only cleanup actions for the installation, repo assignment, and dispatch rules remain available.

**Error responses:**
- `401 { "error": "invalid_member_token" }` — missing or invalid auth
- `403 { "error": "forbidden" }` — caller lacks the required project role or resource ownership for the attempted mutation
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
  "improvement_id": null,
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

The `event_type` on the `repository_dispatch` is always `debugbundle.incident` for both incident and hosted improvement dispatches. The specific lifecycle event is in `debugbundle_event` inside `client_payload`, and delivery metadata lives under `client_payload.debugbundle`. `dispatch_id` is globally unique per delivery attempt for workflow deduplication. For hosted improvement dispatches, `incident_id` is `null`, `improvement_id` is set, `bundle_type` is `"improvement"`, `links.bundle` points at the project-scoped improvement bundle route, and `links.reproduction` is `null`.

A GitHub delivery with `status: "delivered"` and `github_status_code: 204` means GitHub accepted DebugBundle's `repository_dispatch` API request. It does not mean a GitHub Actions workflow ran or completed successfully; the receiving repository must contain a matching workflow and owns its run status.

Reference action distribution: external repositories consume `debugbundle/action@v1` for incident dispatches. The action lives in the dedicated public `debugbundle/action` repository and fetches the bundle and reproduction artifact into `.debugbundle/bundles/cloud/` using `incident-id`, `debugbundle-token`, optional `api-base-url`, and optional `workspace-root` inputs. Hosted improvement dispatches expose `links.bundle` directly in the payload for repository-owned workflows to fetch with a member token.

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

Current local CLI setup behavior: `debugbundle setup [--non-interactive] [--json]` is the single entrypoint that replaces the old `debugbundle init`. It detects mixed-runtime service roots, generates `profile.json` with `validation_status: "static-analysis-only"`, creates `.debugbundle/local/connection.json` (defaults to `"mode": "local-only"`), generates `.agents/skills/debugbundle/SKILL.md` per agentskills.io spec, manages `.gitignore` entries, and optionally appends a lightweight DebugBundle trigger section to `AGENTS.md`. The generated skill teaches a runtime-evidence-gated investigation workflow: check incidents first for qualifying runtime, production, health-check, notification, webhook, or captured-artifact issues, but inspect source/tests first for deterministic local UI, layout, copy, calculation, refactor, or test-only issues unless runtime evidence is needed. It also covers profile validation, browser relay verification, incident resolution hygiene, and noise-management review using capture-rule suggestions or path-scoped client-error capture policy when repeated low-value incidents are supported by bundle evidence. In interactive TTY sessions it lets the operator choose which detected targets to prepare first; in non-interactive mode it keeps deterministic whole-repo defaults. When the repository already includes browser and backend SDK surfaces, setup either scaffolds deterministic relay insertion points (Fastify, Express, Next.js App Router) or emits runtime-specific relay guidance for shipped relay-capable runtimes. JSON output exposes `detected_services`, `selected_targets`, `relay_action`, and `relay_guidance` so agents can act on the same machine-readable state as the human-readable output.

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
debugbundle verify cloud --project-id <id> [--trigger-5xx | --trigger-4xx <400-499> | --expect-app-event] [--service <name>] [--environment <name>] [--trace-id <id>] [--request-id <id>] [--max-age-minutes <n>] [--auth-file <path>] [--json]
debugbundle smoke [--json]
```

Current local CLI verify behavior is `debugbundle verify local [--json]`. It validates `.debugbundle/profile.json`, synthesizes a local incident-signal batch in `.debugbundle/local/events/`, runs the existing local `debugbundle process` pipeline, confirms that local incident state now contains the synthetic incident, and reads the generated local bundle artifact from `.debugbundle/bundles/local/`. No cloud auth, member token, or project token is required.

Cloud CLI verify behavior is `debugbundle verify cloud --project-id <id> [--trigger-5xx | --trigger-4xx <400-499> | --expect-app-event] [--service <name>] [--environment <name>] [--trace-id <id>] [--request-id <id>] [--max-age-minutes <n>] [--auth-file <path>] [--json]`. Without an active trigger flag, it reuses stored member auth, performs passive verification through the retrieval API, and confirms that the latest incident matching the requested project/service/environment filters has a `last_seen_at` inside the verification window (default `15` minutes). With `--trigger-5xx`, it creates a temporary verification project token, sends a synthetic `request_event` with `response_status: 503` through the real `POST /v1/events` ingestion endpoint, revokes the temporary token, polls incident retrieval, and fetches bundle status. With `--trigger-4xx <status>`, it runs the same real-ingestion proof path using the provided `4xx` status and succeeds only when the target project configuration promotes that status into immediate incident creation. With `--expect-app-event`, it waits for a real SDK-driven incident from the requested app surface and uses `service`, `environment`, `trace_id`, and `request_id` hints to match the hosted bundle deterministically. Synthetic trigger modes and `--expect-app-event` are mutually exclusive. The current scaffold defaults `environment` to `production`, returns setup-style JSON output, and reports auth/config failures separately from passive, synthetic, or app-event verification failures.

Active `verify cloud --trigger-5xx --json`, `verify cloud --trigger-4xx <status> --json`, and app-driven `verify cloud --expect-app-event --json` include a `verification` object:

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
debugbundle incidents [--source <local|cloud>] [--project-id <id>] [--environment <env>] [--service <name>] [--status <active|open|resolved|regressed|all>] [--severity <level>] [--first-seen-after <ISO8601>] [--attention-after <ISO8601>] [--cursor <cursor>] [--limit <n>] [--json]
debugbundle inspect <incident-id> [--source <local|cloud>] [--json]
debugbundle resolve <incident-id> [incident-id ...] [--source <local|cloud>] [--json]
debugbundle reopen <incident-id> [incident-id ...] [--source <local|cloud>] [--json]
debugbundle bundle <incident-id> [--source <local|cloud>] [--json]
debugbundle logs <incident-id> [--level <level>] [--cursor <cursor>] [--limit <n>] [--json]
debugbundle reproduce <incident-id> [--source <local|cloud>] [--json]
debugbundle services [--json]
```
`debugbundle incidents` defaults to `--status active` so the CLI shows incidents that need attention (`open` or `regressed`). Use `--status all` to omit the status filter and include resolved incidents.

Current local CLI retrieval behavior: when `.debugbundle/local/connection.json` is configured with `"mode": "local-only"`, `debugbundle incidents`, `debugbundle inspect`, `debugbundle resolve`, `debugbundle reopen`, `debugbundle bundle`, and `debugbundle reproduce` read `.debugbundle/local/state.json`, `.debugbundle/bundles/local/`, and `.debugbundle/bundles/local/reproductions/` directly without requiring `debugbundle login`. Local incident listing preserves the machine-readable `{ incidents, next_cursor }` shape and applies `project_id`, `environment`, `service`, `status`, `severity`, `first_seen_after` / `--first-seen-after`, `attention_after` / `--attention-after`, `cursor`, and `limit` filters against the local incident index.

Current connected-mode retrieval behavior: when `.debugbundle/local/connection.json` is configured as `"connected"`, `debugbundle incidents` now merges matching local and cloud incidents by default, preserves `cursor` / `limit` pagination after the merged sort order is applied, and annotates cloud-backed incident payloads with `source: "cloud"` so origin is explicit in both human and JSON output. `--source local` and `--source cloud` still narrow the same commands to a single store. `debugbundle inspect`, `debugbundle resolve`, `debugbundle reopen`, `debugbundle bundle`, and `debugbundle reproduce` now probe the local store first and then fall back to cloud. When multiple cloud-backed incident ids are passed to `debugbundle resolve` or `debugbundle reopen`, the CLI collapses them into one hosted bulk mutation request while keeping local incidents on the existing local-state path. When `debugbundle bundle` or `debugbundle reproduce` fetches from cloud, the returned payload is also written to `.debugbundle/bundles/cloud/<incident-id>.bundle.json` or `.debugbundle/bundles/cloud/reproductions/<incident-id>.reproduction.json`, overwriting the cached snapshot on later explicit fetches; cloud resolve and cloud reopen rewrite cached status fields when a cached copy exists, and the same explicit cloud cache activity prunes `.debugbundle/bundles/cloud/` entries older than 30 days since last access.

When cloud retrieval returns `retrieval_api_error: 200:invalid_response_shape`, the CLI should include an update hint because the most common cause is an older installed CLI parsing a newer cloud response shape.

Current local CLI retrieval limitation: `debugbundle logs` still requires the authenticated cloud path in the current implementation; local log projection is not part of this slice.

### 2.5 Alert Commands
```
debugbundle alert list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle alert create --project-id <id> --channel <channel> --condition <condition> [--service-id <id>] [--severity-min <level>] [--cooldown <seconds>] --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle alert update <id> --project-id <id> [--service-id <id|null>] [--channel <channel>] [--condition <condition>] [--severity-min <level|null>] [--cooldown <seconds>] [--config-json <json|null>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle alert delete <id> --project-id <id> [--auth-file <path>] [--json]
```

Current alert CLI behavior is a thin adapter over the alert HTTP client in `packages/alert-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. `alert create` requires `--config-json` with a channel-specific object, and `alert update` accepts `null` clears for `service_id`, `severity_min`, or `config`. `--cooldown` maps to API `cooldown_seconds`, uses seconds, accepts `0` to disable notification suppression, and accepts positive values up to `604800` (7 days). Slack alert configs can use either `{"webhook_url":"..."}` or `{"slack_destination_id":"uuid"}`.

### 2.6 Webhook Commands
```
debugbundle webhook list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle webhook create --project-id <id> --url <url> --event <event[,event]> [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle webhook update <id> --project-id <id> [--url <url>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type[,type]>] [--verification <true|false>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle webhook delete <id> --project-id <id> [--auth-file <path>] [--json]
debugbundle webhook test <id> --project-id <id> [--event <verification.passed|verification.failed>] [--auth-file <path>] [--json]
debugbundle webhook deliveries <id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle webhook retry <id> <delivery-id> --project-id <id> [--auth-file <path>] [--json]
```

Current webhook CLI behavior is a thin adapter over the webhook HTTP client in `packages/webhook-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. Multi-value flags (`--event`, `--environment`, `--service`, `--bundle-type`) accept comma-separated values.

### 2.7 Slack Commands
```
debugbundle slack list --project-id <id> [--auth-file <path>] [--json]
debugbundle slack connect-url --project-id <id> [--return-to </projects/...>] [--auth-file <path>] [--json]
debugbundle slack test <destination-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle slack delete <destination-id> --project-id <id> [--auth-file <path>] [--json]
```

Current Slack CLI behavior is a thin adapter over `packages/slack-client`. `slack connect-url` returns the browser OAuth handoff URL, `slack list` exposes reusable connected destinations for a project organization, `slack test` sends a test message to the selected destination, and `slack delete` remains available after downgrade to remove a destination once no alert rules or weekly reports still reference it.

### 2.8 Weekly Report Commands
```
debugbundle weekly-report list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle weekly-report create --project-id <id> --channel <email|slack> --day-of-week <day> --hour-of-day <0-23> --timezone <iana> --config-json <json> [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle weekly-report update <channel-id> [--day-of-week <day>] [--hour-of-day <0-23>] [--timezone <iana>] [--config-json <json>] [--is-enabled <true|false>] [--auth-file <path>] [--json]
debugbundle weekly-report delete <channel-id> [--auth-file <path>] [--json]
```

Current weekly report CLI behavior is a thin adapter over the weekly report HTTP client in `packages/weekly-report-client`, reusing stored member auth after `debugbundle login` and forwarding JSON output without duplicating transport logic. Slack weekly-report configs accept either `{"webhook_url":"..."}` or `{"slack_destination_id":"uuid"}` in `--config-json`; preserved Slack weekly-report channels remain listed while paused after downgrade.

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

These commands manage remote probe activations. `probe activate` remains a Solo+ mutation, `probe list` stays readable on Free after downgrade, and `probe deactivate` remains available as cleanup for preserved activations. Always-on probes require no CLI commands — they operate automatically in the SDK.

### 2.11a Health Check Commands
```
debugbundle health checks list --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle health checks get <check-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle health checks create --project-id <id> --name <name> --url <url> --interval-seconds <n> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]
debugbundle health checks update <check-id> --project-id <id> [--name <name>] [--url <url>] [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--interval-seconds <n>] [--failure-threshold <n>] [--recovery-threshold <n>] [--environment <name>] [--service <name|null>] [--enabled <true|false>] [--auth-file <path>] [--json]
debugbundle health checks delete <check-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle health checks test --project-id <id> --url <url> [--method <GET|HEAD>] [--expected-status-min <code>] [--expected-status-max <code>] [--timeout-ms <n>] [--auth-file <path>] [--json]
debugbundle health checks results <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
debugbundle health checks daily-rollups <check-id> --project-id <id> [--limit <n>] [--auth-file <path>] [--json]
```

These commands manage hosted health checks without requiring SDK changes. Read commands are available to any authorized project member. Create, update, delete, and test require owner/admin authorization. `health checks test` is side-effect-free and does not create incidents or retained history. Passing `--service null` during create or update clears the optional service label.

### 2.12 Capture Policy Commands
```
debugbundle capture-policy get [--project <id>] [--json]
debugbundle capture-policy set [--project <id>] --preset <minimal|balanced|investigative> [--json]
debugbundle capture-policy set [--project <id>] --override capture_logs=warning --override capture_request_events=failures_only [--json]
debugbundle capture-policy set [--project <id>] --client-error-incidents <preset-default|none|recommended|custom> [--client-error-statuses <401,403,...>] [--client-error-path-rule <404=/checkout/*@GET,POST>] [--client-error-path-rules-json <json>] [--json]
```

`capture-policy get` displays the project's current resolved policy plus raw override semantics for client error incidents. `capture-policy set` updates the preset and/or individual override fields via `--override key=value` (use `null` to clear an override), and also supports the dedicated client-error incident mode flags shown above. `--client-error-path-rule` promotes a specific `4xx` status and path pattern without promoting that status globally. Owner-only.

### 2.12a Capture Rule Commands
```
debugbundle capture-rule list --project-id <id> [--auth-file <path>] [--json]
debugbundle capture-rule suggest <incident-id> [--auth-file <path>] [--json]
debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id <id> [--name <name>] [--description <text>] [--enabled <true|false>] [--expires-at <ISO8601>] [--auth-file <path>] [--json]
debugbundle capture-rule create --project-id <id> --name <name> --action <demote|sample|drop> --matcher-json <json> [--description <text>] [--enabled <true|false>] [--sample-rate <0-1>] [--sample-event-class <preserve|context>] [--expires-at <ISO8601>] [--auth-file <path>] [--json]
debugbundle capture-rule update <rule-id> --project-id <id> [--name <name>] [--description <text>] [--enabled <true|false>] [--action <demote|sample|drop>] [--matcher-json <json>] [--sample-rate <0-1>] [--sample-event-class <preserve|context>] [--expires-at <ISO8601>] [--auth-file <path>] [--json]
debugbundle capture-rule delete <rule-id> --project-id <id> [--auth-file <path>] [--json]
```

`capture-rule suggest` exposes the deterministic incident suggestion surface without mutating project state. `capture-rule create-from-suggestion` applies one of those suggestions with optional local overrides like `name`, `description`, or `expires-at`. Direct `create/update/delete` remain the explicit project-management surface and require owner/admin authorization.

### 2.13 Improvement Settings Commands
```
debugbundle improvements list [--project-id <id>] [--environment <name>] [--service <name>] [--status <status>] [--severity <level>] [--kind <kind>] [--cursor <cursor>] [--limit <n>] [--json]
debugbundle improvements get <improvement-id> [--json]
debugbundle improvements bundle <improvement-id> --project-id <id> [--json]
debugbundle improvements resolve <improvement-id> [--json]
debugbundle improvements reopen <improvement-id> [--json]
debugbundle improvements snooze <improvement-id> --until <ISO8601> [--json]
debugbundle improvements settings get --project <id> [--json]
debugbundle improvements settings set --project <id> [--enabled <true|false>] [--sensitivity <high_confidence|balanced|verbose>] [--json]
```

`improvements list/get/bundle/resolve/reopen/snooze` are the hosted improvement-management surface and map directly to the corresponding improvement retrieval routes. `improvements settings get` displays project-backed hosted improvement automation settings plus a capability-derived `cloud_automation_available` flag. `improvements settings set` updates the enabled flag and/or sensitivity mode. Owner/admin only; Free-tier projects receive `upgrade_required`.

### 2.14 Billing Commands
```
debugbundle billing get [--json]
debugbundle billing trial start --plan <solo|team> [--json]
debugbundle billing capacity increase --target-additional-capacity-units <n> [--json]
debugbundle billing capacity schedule-reduction --target-additional-capacity-units <n> [--json]
debugbundle billing capacity cancel-reduction [--json]
```

`billing get` retrieves the organization's billing summary, plan state, trial state, active-project counts, capacity units, and allowance metrics. Requires owner-scoped member token authentication.

`billing trial start --plan <solo|team>` starts an eligible 30-day no-card trial and returns the updated billing summary. During an active trial, Stripe checkout remains browser-only; the CLI reports `trial_conversion_required` and directs the operator to the billing page when capacity changes require paid conversion first.

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

`project list` lists both owned and shared projects visible to the authenticated member and includes relationship metadata such as `effective_role`, `owner_email`, and owner-visible `sharing_state`. `project create` creates a new owned project with the given name and slug. `project update` modifies existing project attributes for an accessible project. `project delete` permanently removes a project (owner-only). All require member token authentication.

### 2.15 Project Member Commands
```
debugbundle project members list --project-id <id> [--auth-file <path>] [--json]
debugbundle project members invites --project-id <id> [--auth-file <path>] [--json]
debugbundle project members invite --project-id <id> --email <email> --role <admin|member> [--auth-file <path>] [--json]
debugbundle project members cancel-invite <invite-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle project members update-role <user-id> --project-id <id> --role <admin|member> [--auth-file <path>] [--json]
debugbundle project members remove <user-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle project members leave --project-id <id> [--auth-file <path>] [--json]
```

`project members list` lists the owner and collaborators for one project. `project members invites` lists pending invitations for that project. `project members invite` sends a collaborator invitation to the specified email (Team tier). `project members cancel-invite` cancels a pending invitation. `project members update-role` changes a collaborator's role. `project members remove` removes another collaborator from the project. `project members leave` removes the authenticated collaborator's own membership from that project. Member removal and self-leave remove only that collaborator's project-scoped automation resources for that project, such as alert rules, webhooks, and GitHub dispatch rules; other project resources remain. Listing is available to any authorized project member, while invite visibility and management remain owner/admin-only.

### 2.16 GitHub Commands
```
debugbundle github status [--project-id <id>] [--auth-file <path>] [--json]
debugbundle github repos [--project-id <id>] [--auth-file <path>] [--json]
debugbundle github repo set <owner/repo> --project-id <id> [--auth-file <path>] [--json]
debugbundle github repo remove --project-id <id> [--auth-file <path>] [--json]
debugbundle github rules --project-id <id> [--auth-file <path>] [--json]
debugbundle github rules create --project-id <id> --name <name> --event <event[,event]> [--environment <env[,env]>] [--service <svc[,svc]>] --severity-min <level> --bundle-type <type> [--incident-status <status>] [--cooldown <seconds>] [--enabled <true|false>] [--auth-file <path>] [--json]
debugbundle github rules update <rule-id> --project-id <id> [--name <name>] [--event <event[,event]>] [--environment <env[,env]>] [--service <svc[,svc]>] [--severity-min <level>] [--bundle-type <type>] [--incident-status <status>] [--cooldown <seconds>] [--enabled <true|false>] [--auth-file <path>] [--json]
debugbundle github rules delete <rule-id> --project-id <id> [--auth-file <path>] [--json]
debugbundle github deliveries [--project-id <id>] [--status <status>] [--limit <n>] [--auth-file <path>] [--json]
debugbundle github deliveries retry <delivery-id> [--project-id <id>] [--auth-file <path>] [--json]
```

`github status` shows the organization's GitHub App installation status and any assigned repo for the current project. `github repos` lists repositories available to the installation for owner/admin callers. `github repo set` assigns a primary repo to the project for owner/admin callers. `github rules create` is available to any authorized collaborator on an eligible shared project, while rule update/delete and delivery retry obey creator ownership for plain members. `github deliveries` lists recent delivery history for a project, and `github deliveries retry` retries a failed delivery within that project scope when the caller owns the underlying rule or has admin rights. Multi-value flags (`--event`, `--environment`, `--service`) accept comma-separated values. Eligibility is determined from the target project's owner plan, not the acting collaborator's personal plan.

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

Install surface: `@debugbundle/mcp` publishes a standalone stdio MCP server with the `debugbundle-mcp` bin. External MCP clients should invoke it with `npx @debugbundle/mcp` or a global `debugbundle-mcp` install. The package ships MCP Registry metadata in `apps/mcp/server.json`, and npm ownership verification uses `mcpName: "com.debugbundle/mcp"` in `apps/mcp/package.json`. The server resolves hosted auth in this order: explicit per-tool `bearerToken`, `DEBUGBUNDLE_MEMBER_TOKEN` from the MCP server environment, then CLI auth state from `~/.debugbundle/auth.json`. `DEBUGBUNDLE_API_URL` may override the default `https://api.debugbundle.com` endpoint for self-hosted or non-production environments.

### 3.1 Core Tools
```
debugbundle_list_incidents    → same result as GET /v1/incidents (including `next_cursor`)
debugbundle_get_incident      → same result as GET /v1/incidents/{id}
debugbundle_resolve_incident  → same result as POST /v1/incidents/{id}/resolve for cloud incidents; local state mutation for local incidents
debugbundle_resolve_incidents → same result as POST /v1/incidents/resolve for cloud incidents; local state mutations per incident for local incidents
debugbundle_reopen_incident   → same result as POST /v1/incidents/{id}/reopen for cloud incidents; local state mutation for local incidents
debugbundle_reopen_incidents  → same result as POST /v1/incidents/reopen for cloud incidents; local state mutations per incident for local incidents
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

Alert MCP tools use camelCase request fields (`projectId`, `serviceId`, `conditionType`, `severityMin`, `cooldownSeconds`, `isEnabled`) over the same HTTP alert API. `cooldownSeconds` is optional on `create_alert` and `update_alert`, uses seconds, defaults to API `0` on create when omitted, accepts `0` to disable suppression, and is capped at `604800`.

Current MCP alert, Slack-destination, weekly-report, and webhook behavior is a thin adapter over the same shared HTTP clients used by CLI, returning the same machine-readable payloads for lifecycle operations without adding business logic.

Current MCP local retrieval behavior: when no `bearerToken` is supplied and the project is configured as local-only, `debugbundle_list_incidents`, `debugbundle_get_incident`, `debugbundle_resolve_incident`, `debugbundle_resolve_incidents`, `debugbundle_reopen_incident`, `debugbundle_reopen_incidents`, `debugbundle_get_bundle`, and `debugbundle_get_reproduction` read the same local store used by the CLI (`.debugbundle/local/state.json`, `.debugbundle/bundles/local/`, `.debugbundle/bundles/local/reproductions/`) and return the same machine-readable payloads without cloud auth.

Current connected-mode MCP retrieval behavior: when the project is configured as `"connected"`, `debugbundle_list_incidents` now merges matching local and cloud incidents by default, defaults omitted status to `active` (`open` or `regressed`), preserves merged `cursor` / `limit` pagination, and annotates cloud-backed incident payloads with `source: "cloud"` so callers can distinguish origin explicitly. `status: "all"` omits the status filter and includes resolved incidents with open and regressed incidents. `source: "local"` and `source: "cloud"` still narrow the same MCP retrieval/lifecycle tools to a single store. `debugbundle_get_incident`, `debugbundle_resolve_incident`, `debugbundle_resolve_incidents`, `debugbundle_reopen_incident`, `debugbundle_reopen_incidents`, `debugbundle_get_bundle`, and `debugbundle_get_reproduction` now probe the local store first and fall back to cloud. When MCP resolves or reopens multiple cloud-backed incidents, it collapses them into one hosted bulk mutation request while keeping local incidents on the existing local-state path. When MCP fetches a cloud bundle or reproduction, the same payload is written into `.debugbundle/bundles/cloud/` so the local artifact cache matches explicit connected-mode fetches across both agent-facing surfaces; cloud resolve and cloud reopen rewrite cached status fields when a cached copy exists, and explicit cloud cache activity prunes `.debugbundle/bundles/cloud/` entries older than 30 days since last access.

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

These tools manage remote probe activations. `activate_probe` remains a Solo+ mutation, while `list_active_probes` stays readable on Free after downgrade and `deactivate_probe` remains available as cleanup for preserved activations. Always-on probes require no MCP tools — they operate automatically in the SDK.

### 3.4a Health Check Tools
```
list_health_checks         → same result as GET /v1/projects/{id}/availability-checks
get_health_check           → same result as GET /v1/projects/{id}/availability-checks/{checkId}
create_health_check        → same result as POST /v1/projects/{id}/availability-checks
update_health_check        → same result as PATCH /v1/projects/{id}/availability-checks/{checkId}
delete_health_check        → same result as DELETE /v1/projects/{id}/availability-checks/{checkId}
test_health_check          → same result as POST /v1/projects/{id}/availability-checks/test
list_health_check_results  → same result as GET /v1/projects/{id}/availability-checks/{checkId}/results
list_health_check_daily_rollups → same result as GET /v1/projects/{id}/availability-checks/{checkId}/daily-rollups
```

These tools expose the hosted health-check management surface for agents and automations. Read operations are available to any authorized project member. Create, update, delete, and test require owner/admin authorization. `test_health_check` is side-effect-free and does not open incidents or write retained history.

### 3.5 Capture Policy Tools
```
get_capture_policy            → same result as GET /v1/projects/{id}/capture-policy
update_capture_policy         → same result as PATCH /v1/projects/{id}/capture-policy
```

These tools manage per-project capture policy (preset selection and advanced overrides, including status-wide and path-scoped client-error incident promotion). `get_capture_policy` returns a preview-only payload to plain members and an editable payload to owner/admin callers. `update_capture_policy` requires owner/admin authorization.

### 3.5a Capture Rule Tools
```
list_capture_rules                         → same result as GET /v1/projects/{id}/capture-rules
create_capture_rule                        → same result as POST /v1/projects/{id}/capture-rules
update_capture_rule                        → same result as PATCH /v1/projects/{id}/capture-rules/{ruleId}
delete_capture_rule                        → same result as DELETE /v1/projects/{id}/capture-rules/{ruleId}
suggest_capture_rules_from_incident        → same result as POST /v1/incidents/{id}/capture-rule-suggestion
create_capture_rule_from_incident_suggestion → same result as POST /v1/incidents/{id}/capture-rules
```

These tools expose the same manual capture-rule workflow as the API and CLI. Suggestions are deterministic and read-only. Rule creation, update, deletion, and create-from-suggestion require owner/admin authorization.

### 3.6 Improvement Settings Tools
```
list_improvements            → same result as GET /v1/improvements
get_improvement              → same result as GET /v1/improvements/{id}
get_improvement_bundle       → same result as GET /v1/projects/{id}/improvements/{improvementId}/bundle
resolve_improvement          → same result as POST /v1/improvements/{id}/resolve
reopen_improvement           → same result as POST /v1/improvements/{id}/reopen
snooze_improvement           → same result as POST /v1/improvements/{id}/snooze
get_improvement_settings      → same result as GET /v1/projects/{id}/improvement-settings
update_improvement_settings   → same result as PATCH /v1/projects/{id}/improvement-settings
```

These tools manage hosted improvement opportunities plus hosted improvement automation settings. `get_improvement_settings` returns the effective project-backed settings plus a capability-derived availability flag. `update_improvement_settings` requires owner/admin authorization and a Solo+ or self-host capable project.

### 3.7 Billing Tools
```
debugbundle_get_billing_summary          → same result as GET /v1/billing
start_trial                              → same result as POST /v1/billing/trial/start
increase_capacity                        → same result as POST /v1/billing/capacity/increase
schedule_capacity_reduction              → same result as POST /v1/billing/capacity/scheduled-reduction
cancel_capacity_reduction                → same result as DELETE /v1/billing/capacity/scheduled-reduction
```

These tools manage organization billing summary, no-card trial start, and capacity lifecycle. All require owner-scoped member token authentication. `get_billing_summary` includes the `billing_state` field plus the normalized `trial` object. `start_trial` accepts `targetPlan: "solo" | "team"`. Capacity tools return `trial_conversion_required` while an active no-card trial still requires paid conversion.

### 3.7 Project Tools
```
debugbundle_list_projects     → same result as GET /v1/projects
debugbundle_create_project    → same result as POST /v1/projects
debugbundle_update_project    → same result as PATCH /v1/projects/{id}
debugbundle_delete_project    → same result as DELETE /v1/projects/{id}
```

These tools manage project lifecycle. `create_project`, `update_project`, and `delete_project` are owner-only.
`create_project` accepts optional `colorTag`; `update_project` accepts optional `colorTag` and clears the tag when `null` is provided. The value set matches the shared palette documented for `color_tag` on `POST /v1/projects`.

### 3.8 Member Tools
```
list_project_members         → same result as GET /v1/projects/{id}/members
list_project_member_invites  → same result as GET /v1/projects/{id}/invites
invite_project_member        → same result as POST /v1/projects/{id}/invite
cancel_project_member_invite → same result as DELETE /v1/projects/{id}/invites/{inviteId}
update_project_member_role   → same result as PATCH /v1/projects/{id}/members/{userId}
remove_project_member        → same result as DELETE /v1/projects/{id}/members/{userId}
leave_project                → same result as DELETE /v1/projects/{id}/membership
```

These tools manage project collaboration lifecycle. Listing is available to any authorized project member. Invite, cancel, role update, and removal require owner/admin authorization. `leave_project` is for collaborators leaving their own membership. `invite_project_member` requires Team tier.

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

These tools manage GitHub repository automation. Project-scoped read operations use the target project's owner plan for eligibility; repository connection management requires owner/admin access; dispatch-rule create is available to authorized project collaborators, while update/delete and delivery retry obey creator ownership for plain members.

### MCP Response Rules
- Deterministic
- Compact
- Machine-readable
- Redaction-aware
- Consistent with CLI/API results
- Include `suggested_actions` (string array) for setup/verification failures to guide agent remediation
- Structured error categories: `auth_error`, `config_error`, `validation_error`, `resource_not_found`, `verification_failed`, `transient_backend_error`

---

## 3a. OpenClaw Plugin Interface

Package: `@debugbundle/openclaw-plugin`

Install surface:

```bash
openclaw plugins install clawhub:@debugbundle/openclaw-plugin
```

The OpenClaw plugin is a host-native projection of the MCP tool catalog. It exposes every MCP tool as `debugbundle_<mcp_tool_name>` and delegates execution to the same MCP tool factory used by `@debugbundle/mcp`. The plugin may translate host metadata, TypeBox schemas, tool prefixes, optional-tool declarations, and OpenClaw approval hooks, but it must not add product behavior that is absent from API/CLI/MCP.

OpenClaw auth follows the MCP auth order: explicit per-tool `bearerToken`, `DEBUGBUNDLE_MEMBER_TOKEN`, then CLI auth state from `~/.debugbundle/auth.json`. `DEBUGBUNDLE_API_URL` or plugin config `apiBaseUrl` may point at self-hosted or non-production APIs. Project tokens remain write-only ingestion credentials and are not valid for OpenClaw management tools.

Mutation tools must be marked optional in `openclaw.plugin.json` so operators explicitly allow them before model exposure. Production-impacting mutations must also use OpenClaw per-call approval hooks before public publish.

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
  transportMode: 'relay',
  endpoint: '/debugbundle/browser',
  // captureConsole: false (opt-in),
  // captureNetwork: true (default),
  // maskFormValues: true (default),
});

// Auto-captures: window errors, promise rejections, route changes, clicks, network
// Manual capture:
debugbundle.captureException(err);
debugbundle.captureMessage('User clicked broken link', 'warning');
```

For split frontend/backend deployments, keep relay mode explicit and point `endpoint` at the backend relay URL. Add the backend API origin to `tracePropagationTargets` when cross-origin first-party requests should receive `X-DebugBundle-Trace-Id` and be eligible for policy-driven request-failure promotion. The browser fetch wrapper must preserve native `fetch` input and header semantics, including `Headers`, tuple arrays, record headers, and `Request` object headers. For frontend-only deployments without a backend, use direct mode with a dedicated public write-only `projectToken` and allowed browser origins.

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
