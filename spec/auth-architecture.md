# Auth Architecture — SPA, API, CLI, MCP

Version: v1.1
Last updated: 2026-08-30

---

## 1. Status

This file is the source-of-truth architecture record for DebugBundle authentication and authorization.

It defines how first-party auth works across:

- `apps/web` (React + Vite SPA)
- `apps/api` (Fastify HTTP API)
- `apps/cli`
- `apps/mcp`
- SDK ingestion clients

This document resolves the architectural question of how interactive browser auth, local agent auth, and ingestion auth share one core model without collapsing into a single credential type.

---

## 2. Core Decision

DebugBundle uses a **first-party auth system** owned by the API and shared domain services.

The system uses **three distinct auth artifacts**:

1. **User sessions** for the web app
2. **Member tokens** for CLI, local stdio MCP, API automation, and agents
3. **Project tokens** for SDK ingestion only
4. **OAuth grants and access tokens** for the official OpenAI-hosted MCP resource only

These artifacts belong to one shared auth domain, but they are intentionally not interchangeable.

### 2.1 Why This Model

- Browser sessions are the safest fit for an interactive SPA.
- Member tokens are the safest fit for terminals, CI, containers, and agent workflows.
- Project tokens keep ingestion isolated from account and retrieval operations.
- The web app remains a thin interactive surface, while API, CLI, and MCP continue to share the same account and authorization model.
- This preserves interface parity without forcing browser-specific auth patterns onto non-browser clients.

---

## 3. Non-Negotiable Rules

### 3.1 Shared Domain Ownership

All auth and authorization logic must live behind shared API/domain services.

No interface may implement its own:

- permission rules
- token validation rules
- verification gating rules
- project-access checks
- role checks
- token issuance or revocation logic

### 3.2 Token Scope Separation

- **Project tokens** authenticate SDK ingestion only.
- **Member tokens** authenticate CLI, MCP, and member-authorized API operations.
- **User sessions** authenticate interactive browser usage only.

No credential type may silently inherit another credential type's scope.

### 3.3 Browser Security Rule

The SPA must use cookie-backed sessions.

The web app must **not** persist member tokens, refresh tokens, or equivalent long-lived bearer credentials in browser storage.

### 3.3a Cross-Origin Deployment Rule

The SPA lives on `app.debugbundle.com` and the API lives on `api.debugbundle.com`. These are same-site (same eTLD+1) but cross-origin.

Required when the SPA starts making API requests:

- The API must configure CORS to allow `https://app.debugbundle.com` as an origin (env-driven, not hardcoded).
- The SPA must send `credentials: "include"` on fetch requests to the API.
- Session cookies set by the API (`SameSite=Strict; Secure; HttpOnly`) will be sent by the browser because both subdomains are same-site.
- No explicit `Domain` attribute is needed on session cookies — the cookie is scoped to `api.debugbundle.com` and the browser sends it back to that same host.

### 3.4 Token Storage Rule

All project tokens and member tokens must be stored hashed at rest. Plaintext is returned exactly once at creation time.

### 3.5 Verification Rule

Email verification is required before first member-token creation.

For first-party browser auth, redeeming a valid email sign-in code is the verification step: it creates the session and marks the account email as verified.

After a verified member token exists, the bearer may continue through API, CLI, and MCP flows without repeated human verification gates.

---

## 4. Auth Surfaces

### 4.1 Web App

The web app is responsible for:

- requesting email sign-in codes
- verifying email sign-in codes
- logout
- GitHub sign-in
- interactive account/project/token management

The web app authenticates with a first-party session cookie.

The session is used for interactive browser actions such as:

- viewing account state
- creating the first member token
- creating project tokens for projects where the signed-in user has owner/admin project access
- managing billing
- managing project sharing

### 4.2 CLI

The CLI authenticates with a **member token** created in the web app or via the API.

`debugbundle login` stores local auth state and all later CLI read/manage operations reuse that stored member token when calling the API.

### 4.3 MCP

The local stdio MCP server does not have a separate auth model.

It reuses the same local auth state already established by the CLI so agents do not need an additional login flow.

The official OpenAI-hosted MCP resource is separate: it accepts only OAuth access tokens issued for `https://mcp.debugbundle.com`. It never accepts a member token, project token, CLI auth file, or token inside a tool argument. This additive principal does not alter local stdio MCP or custom member-token clients.

### 4.4 SDK Ingestion

SDKs authenticate ingestion requests with **project tokens** only.

Project tokens must never authorize retrieval, management, or account actions.

---

## 5. Credential Types

### 5.1 User Session

Purpose:

- interactive browser auth for the SPA

Properties:

- opaque server-side session identifier
- delivered via `HttpOnly`, `Secure` cookie
- `SameSite` policy chosen to match same-site SPA + API deployment
- revocable server-side
- short idle timeout plus bounded absolute lifetime

Storage model:

- session record stored server-side in Postgres or Redis-backed session storage
- browser stores only the opaque cookie value

Rules:

- browser never receives reusable member-token plaintext as part of standard login
- browser session is the source of interactive auth, not local storage state

### 5.2 Member Token

Purpose:

- non-browser auth for CLI, MCP, API automation, and agents

Properties:

- bearer token
- scoped to a member identity and organization/project access
- stored hashed at rest
- plaintext shown once at creation time
- revocable individually

Rules:

- valid for retrieval and management operations
- invalid for ingestion
- suitable for local files, CI secrets, and agent workflows

### 5.3 Project Token

Purpose:

- SDK write-only ingestion auth

Properties:

- bearer-style token carried by SDK clients
- scoped to a single project
- stored hashed at rest
- plaintext shown once at creation time
- revocable individually

Rules:

- valid only for ingestion and SDK config access
- invalid for incident retrieval, token management, billing, alerts, webhooks, or account operations

---

## 6. Canonical Flows

### 6.1 Human Bootstrap Flow

1. User signs up in the web app.
2. API creates account, member identity, and initial organization/project state as required.
3. User verifies email.
4. User logs into the SPA.
5. SPA, using the session, creates the first member token.
6. User runs CLI login with that member token.
7. MCP reuses the same local auth state.
8. CLI or web app creates project tokens for SDK installation.

This is the primary bootstrap flow for V1.

### 6.2 CLI Auth Flow

1. User or agent runs `debugbundle login`.
2. If an explicit auth mode or token was provided, the CLI uses it directly.
3. If no auth mode was provided and the session is interactive, the CLI prompts for GitHub auto mode, explicit GitHub device flow, or manual member-token entry.
4. `debugbundle login` stores local auth state.
5. CLI commands call the API with that token.
6. The API resolves member identity, organization access, and role permissions.

### 6.2a GitHub Device Bootstrap Flow

1. User or agent runs `debugbundle login --github` or `debugbundle login --github-device`.
2. DebugBundle starts a GitHub device authorization through the API and returns a verification URL plus short user code.
3. User approves the DebugBundle OAuth app in any browser.
4. CLI polls DebugBundle until approval completes.
5. DebugBundle links or creates the user account, issues a normal member token, and returns it once.
6. CLI stores the member token in local auth state.

### 6.2b GitHub CLI Bootstrap Flow

1. User or agent runs `debugbundle login --github-cli` or the auto mode `debugbundle login --github`.
2. CLI reads an existing `gh auth token` from the local machine when available.
3. CLI sends that GitHub access token to DebugBundle.
4. DebugBundle verifies the GitHub identity, links or creates the user account, and issues a normal member token.
5. CLI stores the member token in local auth state.

### 6.2c Connect-Time Auth Recovery

1. User or agent runs `debugbundle connect`.
2. If local member auth is already present, connect proceeds normally.
3. If auth is missing and the terminal is interactive, `connect` invokes the same `debugbundle login` bootstrap flow first.
4. After successful login, `connect` resumes project selection/creation and project-token issuance.
5. In non-interactive or `--json` mode, `connect` does not prompt and instead returns actionable auth guidance.

### 6.3 MCP Auth Flow

1. MCP starts locally.
2. MCP loads CLI-established auth state.
3. MCP calls the same API endpoints or underlying shared clients as CLI.
4. The API resolves member identity, organization access, and role permissions.

### 6.4 Browser Session Flow

1. User requests an email sign-in code from the API.
2. API sends the code and stores a hashed, time-limited auth challenge.
3. User submits the code to the API.
4. API verifies the challenge, creates a server-side session, and marks the email as verified.
5. API returns a secure session cookie.
6. SPA calls session-aware API endpoints using that cookie.
7. Logout revokes the server-side session and clears the cookie.

### 6.5 Ingestion Flow

1. SDK initializes with a project token.
2. SDK sends batched events to ingestion.
3. API authenticates the project token.
4. API accepts only ingestion-authorized operations under that credential.

---

## 7. Authorization Model

### 7.1 Principal Types

The system recognizes these principal types:

- anonymous browser visitor
- authenticated browser session user
- authenticated member-token bearer
- authenticated project-token bearer
- authenticated OpenAI OAuth grant bearer

### 7.2 Authorization Axes

Authorization decisions combine:

- principal type
- account ownership context
- project access
- member role
- project-scoped resource ownership where member-created automation is allowed
- credential scope
- verification state where applicable

### 7.3 Verification Gate

Unverified users may:

- access limited account/session surfaces needed to complete verification
- log into the web app if allowed by product rules
- browse non-privileged UI surfaces

Unverified users may not:

- create member tokens
- enable billing
- invite collaborators

The first member token is the trust transition point from human bootstrap to agent-capable operations.

### 7.4 Role Model

The auth domain must support member roles at minimum for:

- owner access
- admin access
- standard member access

Role semantics:

- **Owner**: billing owner, delete-project authority, full access to all project resources
- **Admin**: can manage collaborators, capture policy, and shared integrations/configuration, but cannot delete the project or take over billing
- **Member**: can access project data and create allowed project-scoped automation resources, but cannot manage collaborators, edit capture policy, manage shared integrations, or mutate automation resources created by other collaborators

Role checks must be enforced identically for session-authenticated and member-token-authenticated requests.

---

## 8. Backend Architecture

### 8.1 Package Boundary

Auth business logic belongs in shared packages and API domain services, not in the SPA, CLI, or MCP adapters.

Expected ownership areas:

- credential hashing and generation
- password verification
- session issuance and revocation
- member-token issuance and revocation
- project-token issuance and revocation
- verification-token issuance and consumption
- password-reset-token issuance and consumption
- role and membership authorization
- current-principal resolution

### 8.2 API Layers

The API should separate:

- request parsing and validation
- principal resolution
- authorization checks
- domain operation execution
- transport response shaping

This keeps session-authenticated and token-authenticated callers on the same business path after identity resolution.

### 8.3 Session Storage Choice

V1 should use server-side sessions with one of these approaches:

1. **Postgres-backed session records**
2. **Redis-backed session records with durable user/session metadata in Postgres**

Preferred V1 bias:

- keep canonical account and token state in Postgres
- use Redis only if session throughput or operational simplicity clearly benefits from it

Because the hosted stack now separates the database onto its own instance, session durability in Postgres is operationally reasonable for early V1.

### 8.4 Email Code Handling

Email auth codes must:

- be stored only as hashed challenge material at rest
- never be logged
- never be retrievable after issuance
- be validated through rate-limited endpoints

### 8.5 Token Handling

Member and project tokens must:

- use explicit prefixes
- be generated with high entropy
- be hashed before persistence
- be compared using constant-time checks after lookup
- carry enough metadata for revocation, audit, and attribution
- update `last_used_at` on successful active-token authentication; high-frequency project-token paths may coalesce writes within a short bounded interval

### 8.6 CSRF and Cookie Rules

Because the SPA uses cookie-backed auth, state-changing browser-session endpoints must have CSRF protection.

V1 acceptable patterns:

- same-site deployment plus strict `SameSite` policy where feasible
- explicit CSRF token mechanism for state-changing session-authenticated endpoints

Bearer-token endpoints used by CLI and MCP do not require browser-style CSRF protection.

---

## 9. Data Model Expectations

The auth system should persist at minimum:

- users
- organizations
- organization memberships
- email auth challenges
- sessions
- member tokens
- project tokens
- auth audit records

Important expectations:

- token rows store only hashes plus metadata
- email auth challenges store only hashed code material at rest
- revoked credentials remain auditable
- session revocation and token revocation are independent operations

---

## 10. API Contract Shape

### 10.1 Session-Oriented Browser Endpoints

The API should expose first-party browser-auth endpoints for:

- request email code
- verify email code
- logout
- current session / current user
- GitHub auth start/callback endpoints when OAuth is enabled

These endpoints are for the SPA and should operate through session cookies rather than member tokens.
Provider-controlled browser redirect callbacks validate every consumed or security-relevant query field and strip unknown query parameters before route logic runs. This applies consistently to GitHub sign-in, GitHub App setup, and Slack OAuth redirects; it does not relax signed webhook verification.
The GitHub callback accepts the provider's RFC 9207 `iss` parameter only when it exactly matches `https://github.com/login/oauth`; callbacks without `iss` remain valid for backwards compatibility with older GitHub authorization responses, and unrelated provider extensions are ignored.

### 10.2 Member-Authorized Endpoints

The API should expose member-authorized endpoints for:

- member token CRUD
- project token CRUD
- incidents, bundles, reproduction, logs
- alerts
- weekly reports
- webhooks
- probes activation
- project and organization management as allowed by role

These endpoints must accept:

- browser session auth for interactive web usage
- member-token auth for CLI, MCP, and automation

After principal resolution, both auth paths must execute the same authorization and domain logic.

The official OpenAI MCP adapter resolves its OAuth principal separately, then calls dedicated read-only domain readers. An OAuth scope is only an outer capability bound: every reader must still verify the backing grant, user, organization, account status, and current project membership. OpenAI access tokens are never accepted by the normal member-token or project-token authenticators.

### 10.3 Project-Authorized Endpoints

The API should expose project-authorized endpoints for:

- event ingestion
- SDK config retrieval

These endpoints accept project tokens only.

---

## 11. UI and SPA Implications

Because `apps/web` is a React + Vite SPA using a fully reusable shadcn-based UI system:

- auth forms must be built from shared shadcn-based form primitives
- auth screens must reuse app-level layout and feedback components
- dark mode and light mode must both be supported from the first auth screens onward
- icons must be consumed through a shared icon wrapper component, not directly from a vendor package in page code
- auth-specific visual patterns should become reusable components where they repeat

Auth architecture must not push security responsibilities into the UI layer. The SPA is a client of the auth system, not the auth system itself.

---

## 12. Security Baseline

At minimum, the auth system must implement:

- rate limiting for request-code, verify-code, and token creation
- token hashing at rest
- secure cookie attributes
- CSRF protection for session-authenticated mutations
- audit logging for sensitive auth actions
- explicit auth error codes without leaking internals
- revocation checks on all protected routes
- no secret or token logging

Sensitive auth actions include:

- email change
- session revocation
- member-token creation or revocation
- project-token creation or revocation
- billing access changes
- member invitation or role change

---

## 13. Recommended V1 Implementation Shape

### 13.1 Preferred V1 Stack

- Fastify-owned first-party auth
- first-party session issuance for both email-code and GitHub sign-in flows
- hashed, time-limited email auth challenges
- server-side opaque session cookies for the SPA
- Postgres as canonical auth store
- optional Redis use only where justified for session or rate-limit behavior
- member tokens for CLI and MCP
- project tokens for SDK ingestion

### 13.2 Why This Fits DebugBundle

- It keeps maximum product ownership and control.
- It matches the repo's existing member-token and project-token contracts.
- It preserves the agent-first CLI/MCP workflow.
- It avoids leaking browser-specific auth assumptions into automation interfaces.
- It fits the new hosted shape with a separate database instance.
- It keeps the web app minimal rather than turning it into the product's only meaningful interface.

---

## 14. Explicit Non-Goals

V1 does not require:

- device code flow
- Google sign-in
- SSO / SAML
- browser storage of reusable bearer auth
- collapsing member tokens and project tokens into a single credential model

These may be added later without changing the V1 security model.

The former hosted multi-tenant MCP non-goal is superseded only for the approved official OpenAI Plugin v1 surface described below. It remains a non-goal for the local stdio server and for arbitrary hosted clients.

---

## 15. Acceptance Alignment

This architecture must preserve and satisfy:

- token isolation
- verification gating before first member-token creation
- member-token full access after verification
- role-based restrictions
- API / CLI / MCP parity for member-authorized operations
- local MCP reuse of CLI-established auth state

If implementation choices conflict with those properties, this document does not override the source-of-truth contracts or acceptance criteria. It explains how to implement them coherently.

---

## 16. Official OpenAI OAuth And OIDC Profile

### 16.1 Reconciled Boundary

The official OpenAI Plugin is a combined skill plus remote MCP distribution. Customer data is private, so the remote resource is OAuth-first and read-only. This resolves the earlier conflict between this document's hosted-MCP non-goal and `spec/hosted-remote-mcp-connector.md`'s token-first future proposal: those earlier decisions continue to govern local stdio and optional custom hosted clients, while the official OpenAI surface uses the profile in this section.

Canonical identifiers are permanent public contracts:

- protected resource and access-token audience: `https://mcp.debugbundle.com`;
- authorization issuer: `https://api.debugbundle.com`;
- Streamable HTTP endpoint: `https://mcp.debugbundle.com/mcp`;
- protected-resource metadata: `https://mcp.debugbundle.com/.well-known/oauth-protected-resource`;
- OAuth metadata: `https://api.debugbundle.com/.well-known/oauth-authorization-server`;
- OIDC metadata: `https://api.debugbundle.com/.well-known/openid-configuration`; and
- production redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`.

An origin change means a new OpenAI plugin. A path-only MCP change means a reviewed plugin version. If the live OpenAI app-management page presents a different redirect mode or client metadata URL, stop for contract review rather than wildcarding it.

### 16.2 Maintained Protocol Implementation

The authorization server will use `oidc-provider` v9, initially pinned with `~9.11.2`, mounted in the existing API process with a project-owned Postgres adapter. `@modelcontextprotocol/sdk` supplies Streamable HTTP and resource-server verification primitives. The implementation may use the libraries' `jose` dependency but must not implement protocol cryptography independently.

This choice is recorded in `spec/openai-plugin-oauth-decision.md`. It is accepted because the maintained provider supports OIDC discovery/UserInfo, PKCE, resource indicators, RFC 7009 revocation, RFC 9207, JWT access tokens, `private_key_jwt`, and experimental CIMD. Because CIMD is experimental and may change in a minor release, the dependency is tilde-pinned and its metadata behavior is covered by conformance fixtures. A compatibility/security spike that finds a required fork or substantial custom protocol implementation is a hard stop for owner review; no paid identity provider may be selected without explicit approval.

### 16.3 Authorization And Client Authentication

- Authorization code flow uses PKCE S256 only.
- Authorization codes live for five minutes, are single-use and hashed at rest, and bind client, exact redirect URI, exact resource, scopes, user, organization, and code challenge.
- OAuth and OIDC metadata set `authorization_response_iss_parameter_supported: true`.
- Every successful and error authorization response includes `iss=https://api.debugbundle.com`; comparison is exact, without normalization.
- Authorization and token requests must carry and bind `resource=https://mcp.debugbundle.com`, and the access-token `aud` is that exact value.
- CIMD is enabled only for the exact client metadata URL `https://chatgpt.com/oauth/client.json`. Fetches require HTTPS, public DNS/IP resolution on every redirect, no credentials, a 128 KiB response cap, a five-second total timeout, at most two redirects, schema validation, and a short Redis cache. The exact redirect URI and JWKS in the validated document are allowlisted; no wildcard or arbitrary origin is accepted.
- `private_key_jwt` is the only production token-endpoint client-auth method for the approved client. Assertions require exact `iss` and `sub` equal to the validated client ID, exact token-endpoint audience, a maximum five-minute assertion lifetime, a trusted `kid`, a valid signature, and one-time Redis-backed `jti` replay protection.
- Public-client `none` is disabled for v1. It may be added only if a recorded OpenAI interoperability test proves it necessary, always with PKCE, through a reviewed contract/version change.
- Unrestricted dynamic client registration is disabled.

### 16.4 Scopes, Identity, And Consent

The complete initial scope set is:

```text
openid
email
debugbundle:projects:read
debugbundle:incidents:read
debugbundle:artifacts:read
debugbundle:improvements:read
debugbundle:analytics:read
debugbundle:health:read
```

The grant binds one user to one organization and the exact OpenAI client/resource. `list_projects` shows only projects currently visible to that user in the granted organization; every later tool rechecks record and project authorization. `get_incident_context` requires both incident and artifact scopes. `get_incident_impact` requires both analytics and incident scopes and rechecks the incident against the authorized project. New project visibility is not silently broadened by the grant.

OIDC UserInfo returns only stable `sub`, normalized `email`, and `email_verified: true`. A false or missing verification claim fails closed. Email exists only to support OpenAI workspace verified-domain restrictions: it is excluded from access tokens, MCP tool results, and operational logs. A minimal ID token may be issued to support safe `id_token_hint` reauthorization; it contains only required OIDC claims and the same verified identity.

Consent identifies DebugBundle, ChatGPT/Codex, the selected organization, the six individually selectable product read scopes, the verified-identity purpose, the customer-data categories that may be sent on request, the read-only/no-write boundary, and revocation. The analytics scope explicitly covers bounded aggregate usage, routes, devices, acquisition, actions, funnels, journey patterns, and incident impact while excluding individual journeys, custom dimensions, analytics bundles/opportunities, and mutations. The owner approved `spec/openai-plugin-consent-design-proposal.md` on 2026-08-30 and approved the aggregate-only analytics scope extension on 2026-09-02. The local source implements it with the existing `AuthLayout`, shared fields/notices/buttons, Radix/shadcn checkbox and alert-dialog patterns, safe login continuation, and no custom MCP UI. The API remains authoritative for client, redirect, resource, requested/selected scopes, interaction freshness, verified browser session, current organization membership, and grant ownership.

The provider interaction begins and resumes on `api.debugbundle.com`; its HttpOnly interaction cookie is never moved to the app origin. Browser navigation to `/oauth/interaction/{uid}` redirects to `app.debugbundle.com/oauth/consent?interaction={uid}`, and the app uses no-store JSON GET/POST requests against the API interaction URL. The synthetic reviewer POST remains under `/oauth/interaction/{uid}/reviewer` so the same cookie path is valid. Only the opaque UID may appear in these app URLs. Credentials, codes, assertions, tokens, email, organization/project identifiers, grant IDs, and customer content are prohibited from URLs/history. Consent decision endpoints enforce the auth-endpoint IP limit plus the 30/minute pseudonymous session/client interaction limit and fail closed if Redis coordination is unavailable.

### 16.5 Token And Revocation Lifecycle

- Access tokens are asymmetric JWTs valid for exactly 12 minutes with rotatable keys and `kid`, minimal `iss`, `aud`, `sub`, grant/organization, scope, `jti`, `iat`, `nbf`, and `exp` claims, and no customer content or email.
- Refresh tokens are high-entropy opaque values stored only as hashes, rotate on every use, belong to a replay-detecting family, and expire after 30 days.
- Every MCP call verifies signature, issuer, audience/resource, time, scopes, grant state, account state, organization, and current record/project access.
- Account suspension/deletion, membership removal, grant revocation, refresh reuse, or signing-key retirement fails closed. Refresh reuse revokes the family and grant.
- `/oauth/revoke` revokes the named refresh family and backing grant. The signed-in Settings `OpenAI connections` section lists only the current user's grants in the current organization and revokes an owned grant plus every remaining refresh token through a CSRF-protected POST and explicit confirmation. Organization/account-wide operator revocation remains a documented operational action rather than a browser mass-revoke control.
- Consumed or expired authorization-code rows are physically deleted after 24 hours; expired/revoked refresh history after 30 days; expired/revoked grant rows after 90 days, subject to the approved audit-evidence boundary.
- Cleanup uses expiry/revocation indexes and idempotent worker/maintenance batches of at most 500 rows per transaction. It logs counts/duration only and never deletes an active grant or current refresh family.

### 16.6 Reviewer Authentication Lifecycle

OpenAI review uses one synthetic user, organization, project, and deterministic fixture set with no path to production customer organizations. The dedicated credential is high entropy, stored only as a hash in hosted secret/config ownership, entered through the approved password-style app form, accepted only in the `/oauth/interaction/{uid}/reviewer` POST body, cleared from browser component state after the response, and unavailable through the existing query-string review access path. The page never accepts organization or project input.

The route is separately feature-flagged, allows at most 10 attempts per minute per IP and 5 per minute per reviewer-credential key plus a global backstop, and records success, failure, grant, revoke, and expiry security events without credential material. Credentials have a bounded rolling expiry, an alert at least 14 days before expiry, an outside-network pre-submit smoke, and a periodic in-review smoke. Rotation/extension updates the portal only through an approved submission action. Revoke the credential and reviewer grants immediately after publication verification, removal, or review cancellation; a future review uses a newly rotated credential.
