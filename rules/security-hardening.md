# Security Hardening Rules — DebugBundle

Version: v1
Last updated: 2026-06-15

These rules are ongoing enforcement requirements derived from the Phase 20 hardening audit.
They apply to **every future change** — not just the initial hardening pass.

> Cross-referenced with: `rules/domain-invariants.md` (structural invariants),
> `spec/requirements.md` (NFR-SEC), `spec/auth-architecture.md`, `spec/hardening-checklist.md` (Phase 20 evidence).

---

## 1. API Transport Security

### SEC-01: Explicit CORS Configuration

The API must use an explicit CORS origin allowlist derived from environment configuration (`APP_BASE_URL`). Open CORS (`*`) is never permitted. New API deployments must configure CORS before accepting cross-origin requests. Preflight requests from non-allowed origins must receive `403`.

Exception: SDK project-token routes (`POST /v1/events`, `GET /v1/sdk/config`) may reflect a syntactically valid request `Origin` for browser direct/static ingestion because CORS preflight requests do not include bearer-token values. Those routes must not enable credentialed CORS for reflected origins, must still reject invalid project tokens, and must enforce any token-level `allowed_origins` check in the authenticated route handler. This is abuse reduction only, not a secret boundary.

### SEC-02: Body Size Limits On All Routes

Every API route must operate under an explicit body size limit. The server-wide default is 256 KB. Routes that need larger payloads must set an explicit per-route override with documented rationale. New routes inherit the global limit automatically — do not remove or raise it without security review.

### SEC-03: Request Timeout Enforcement

The API must enforce a server-wide request timeout (currently 30s). Routes that hang past the timeout are terminated with `503 request_timeout`. New routes inherit this automatically — do not disable it.

---

## 2. Authentication & Session Security

### SEC-04: Auth Endpoint Rate Limiting

All authentication-adjacent endpoints (login, signup, password reset, verification resend, and any future auth endpoints) must enforce per-IP rate limiting. Current limit: 10 requests/minute per IP. Rate-limited responses must include a `Retry-After` header.

### SEC-05: CSRF Protection On Session Mutations

All POST/PUT/PATCH/DELETE routes authenticated via session cookie must validate the `X-CSRF-Token` header using timing-safe comparison. Exempt only session-creating routes (login, signup) and bearer-token-only routes. New mutation routes using session auth inherit this requirement automatically.

### SEC-06: No Account Enumeration

Authentication responses must not reveal whether an account exists. Signup, forgot-password, and similar flows must return identical success responses regardless of whether the email is already registered. Never return "email already exists" or "email not found" to the client.

### SEC-07: Password Complexity

Password creation (signup, reset, change) must enforce: minimum 12 characters, at least one lowercase, one uppercase, and one digit or symbol. Login accepts any existing credential without retroactive enforcement.

### SEC-08: Session Lifetime Bounds

Default browser-session lifetime must not exceed 7 days. Changes to session lifetime require explicit rationale and security review.

### SEC-09: Constant-Time Security Comparisons

All security-sensitive string comparisons (token validation, HMAC verification, OAuth state, CSRF tokens, trigger-token signatures) must use constant-time comparison (`crypto.timingSafeEqual` in Node, `crypto.subtle.verify` in browser). Never use `===` for secrets.

### SEC-09a: Third-Party Redirect Query Evolution

Provider-controlled browser redirect callbacks must validate every query field the application consumes, including exact provider identifiers when present, and strip unknown query fields before route or domain logic runs. Unknown provider extensions must not break a callback or remain available for accidental downstream use. Missing, malformed, or duplicated consumed fields still fail closed. This rule does not relax signature or payload validation for provider webhooks.

### SEC-10: Dev-Only Endpoints Fail In Production

Any dev-only or mock endpoint (e.g., mock OAuth login) must fail at server startup when `NODE_ENV=production`, not at request time. The API must not boot with dev surfaces exposed in production.

Frontend-only review harnesses must be absent from production routing and require an explicit development opt-in. The OpenAI synthetic UI preview may run only when Vite reports development mode and `VITE_OPENAI_PLUGIN_PREVIEW=true`, or under the test runner; supplying that variable to a production build must not mount the route. Its fixtures stay in browser memory and must not call OAuth interaction, reviewer credential, grant, or connection-revocation APIs. A preview route cannot relax API feature flags, canonical-host enforcement, session checks, CSRF, or provider validation.

### SEC-11: Required Environment Variables Fail Fast

Security-critical env vars (probe trigger secret, GitHub App credentials, etc.) must cause startup failure when missing or empty. No fallback values for secrets. Fail loud, fail early.

---

## 3. SDK Security

### SEC-12: File Permissions On Local Events

SDK-written local event files must use owner-only permissions (`0o600` for files, `0o700` for directories). No world-readable or group-readable event data on disk.

### SEC-13: Path Validation

Any user-configurable path parameter (`eventsDir`, working directory reads, etc.) must be validated as a canonical absolute path. Reject path-traversal patterns (`../`, non-canonical paths, symlinks to outside target directory). Fail closed on suspicious paths.

### SEC-14: Symlink Protection On File Writes

Temp files must be created with `O_EXCL | O_NOFOLLOW` where available. Final write targets must be checked for symlinks via `lstat` before rename. Reject symlinked paths instead of writing through them.

### SEC-15: Unpredictable Temp File Names

Temp files must use `crypto.randomBytes()` suffixes. No predictable timestamp-only or sequence-only naming patterns.

### SEC-16: Object Sanitization Depth and Size Limits

SDK serialization of user-provided objects must enforce maximum depth, string-length truncation, and array/object size caps. Deep or oversized payloads degrade to truncation markers instead of unbounded recursion or memory growth.

### SEC-17: Retry-After Bounding

SDK clients must cap `Retry-After` header values at a maximum (currently 5 minutes). Hostile or misconfigured servers must not be able to force unbounded backoff.

### SEC-18: No Raw User Text In Breadcrumbs

Click breadcrumbs must not capture `textContent` (may contain prices, account info). Form breadcrumbs must capture only `field_count`, not field names (which may leak schema info like `credit_card_number`). Only structural/selector context is permitted.

### SEC-19: Trace Header Scoping

Browser trace-header injection (`X-DebugBundle-Trace-Id`) must be restricted to same-origin requests by default. Cross-origin injection only when the URL matches an explicit `tracePropagationTargets` allowlist. Mobile SDK trace-header injection must happen only through explicit native HTTP instrumentation and configured first-party propagation targets. Never inject into arbitrary third-party requests.

### SEC-20: No User-Provided Regex Execution

SDK configuration that accepts URL patterns (network filters, deny patterns) must use string matching only. Never compile and execute user-provided `RegExp` objects against request data (ReDoS risk).

---

## 4. Redaction

### SEC-21: Expanded Default Sensitive Keys

The redaction engine must recognize at minimum: `password`, `secret`, `token`, `api_key`, `apikey`, `access_token`, `refresh_token`, `private_key`, `passwd`, `card_number`, `cvv`, `cvc`, `pin`, `expiry`, `phone`, `bearer`, `session_id`, `otp`, `verification_code`, `authorization`, `cookie`, `ssn`. New sensitive patterns discovered in production should be added to the default set.

### SEC-22: Segment-Aware Key Matching

Sensitive-key detection must use segment-aware matching (tokenized comparison after delimiter/camelCase splitting), not exact string equality. `user_password`, `apiKey`, `my_secret_field`, `accessToken`, and `sessionId` must all match their base sensitive terms.

### SEC-23: Circular Reference Protection

Redaction traversal must track visited objects via `WeakSet` and replace circular references with a stable `[Circular]` marker instead of recursing infinitely.

---

## 5. Audit Logging

### SEC-24: Security Events Must Be Audit-Logged

The following categories of actions must produce `audit_logs` entries:

- Login attempts (success and failure)
- Signup events
- Password changes
- Token creation and revocation (member + project)
- Organization role changes
- Billing access (checkout, portal, webhook processing)
- Session creation and revocation
- Config changes (capture policy, webhooks, alerts)
- Hosted availability-check creation, update, deletion, and target tests

New security-relevant routes or actions must add audit logging in the same change. Audit logging is fail-open (failures log warnings but do not block the request).

---

## 6. Trust Boundaries

### SEC-25: Owner-Only Route Authorization

Every route that performs destructive or privileged operations (project deletion, member removal, role changes, billing mutations) must enforce owner-only authorization via `requireOwnerMemberAuth()` or equivalent. New privileged routes must include an explicit authorization test proving non-owner rejection.

### SEC-26: Relay Credential Rejection

Browser relay handlers must strip or reject `project_token`, `organization_id`, and authentication headers from incoming browser requests. Browser events must never carry cloud credentials. Server-side relay attaches credentials during forwarding only.

### SEC-27: Hosted Outbound Request Guardrails

Any DebugBundle-hosted outbound request feature, including availability checks, must enforce SSRF guardrails before every request and every redirect. Allowed targets are external `http`/`https` URLs on ports 80 or 443 only. Embedded credentials, localhost, private hostnames, private/reserved IP ranges, metadata service addresses, and unsafe redirects must fail closed. Retained evidence, audit logs, synthetic events, and bundle context must not store raw query values or URL fragments from checked targets.

### SEC-28: OpenAI OAuth Canonical Binding

The official OpenAI OAuth profile must bind authorization, code exchange, access token, refresh family, grant, protected-resource metadata, and every MCP invocation to issuer `https://api.debugbundle.com` and resource/audience `https://mcp.debugbundle.com`. OAuth/OIDC metadata must set `authorization_response_iss_parameter_supported: true`, and every success or error authorization response must include that exact RFC 9207 `iss`. PKCE permits S256 only. Missing/mismatched issuer, resource, audience, scope, grant, account, organization, or current project membership fails closed.

### SEC-29: OpenAI CIMD And Client Authentication

CIMD is accepted only from the exact approved HTTPS metadata URL, initially `https://chatgpt.com/oauth/client.json`. Fetches must apply `SEC-27` on initial resolution and every redirect, reject userinfo/private/reserved destinations, limit redirects to two, response size to 128 KiB, and total time to five seconds, validate metadata/JWKS/redirect URIs, cache briefly in Redis, and fail closed. Production uses `private_key_jwt` with exact client `iss`/`sub`, token-endpoint audience, maximum five-minute assertion lifetime, trusted `kid`, valid signature, and one-time `jti`. Unrestricted DCR and wildcard redirect/client origins are forbidden; public-client `none` requires a separately reviewed interoperability exception and PKCE.

### SEC-30: OpenAI Credential Isolation And Lifecycle

OpenAI access tokens are asymmetric JWTs valid for exactly 12 minutes; refresh tokens are 30-day opaque rotating hashed families with reuse detection; authorization codes are five-minute, single-use, and hashed. Access tokens contain only minimal protocol, subject, grant/organization, and scope claims—never email, name, member/project tokens, or customer content. OpenAI credentials must be rejected by member/project authenticators, and member/project tokens must be rejected by the OpenAI resource. Revocation, account suspension/deletion, membership removal, refresh reuse, or key retirement fails closed.

### SEC-31: Canonical Host And Surface Isolation

`/mcp` and protected-resource metadata are reachable only through `mcp.debugbundle.com`; OAuth/OIDC issuer routes are reachable only through `api.debugbundle.com`. Caddy strips untrusted surface/forwarding headers and supplies a trusted internal marker. Fastify validates the proxy chain, exact configured host, and marker. Alternate `Host`, `Forwarded`, `X-Forwarded-Host`, direct-port, and spoofed-marker requests fail closed. The no-deploy MCP Caddy gate may close only MCP with a bounded `503`; it must not expose routes on the other host.

### SEC-32: OpenAI Read-Only Domain Boundary

Every OpenAI tool uses a dedicated hosted reader that can only read existing records and stored artifacts. It must never regenerate, enqueue, update last-access state, synchronously write audit/product state, send an external action, or otherwise mutate customer-visible state. Missing, stale, pending, failed, or oversized artifacts return bounded status without starting work. Tool-request telemetry is metadata-only, outside the domain transaction, and cannot change results. Injected regeneration, queue, audit-write, and last-access fakes must record zero calls.

### SEC-33: OpenAI Output Minimization And Prompt-Injection Safety

OpenAI results run existing redaction first and then an explicit field allowlist. Strict output schemas, the field-level data map, per-field bounds, list/window caps, and the 512 KiB artifact ceiling are mandatory. Raw logs, auth material, email, request bodies, form values, cookies, signed URLs, object keys, database-only IDs, internal hashes, hidden debug fields, individual analytics journey samples/sample IDs, analytics opportunities/bundles/generation state, arbitrary custom dimensions, raw analytics events, and unbounded captured content are forbidden. The nine allowed analytics tools read aggregate ledgers only under `debugbundle:analytics:read`, use fixed lookbacks no longer than 90 days and lists no larger than 25, and must disable any adjacent retained-sample or bundle-state query before projection. `get_incident_impact` additionally requires incident scope and a current same-project incident. `get_incident_context` requires both incident and artifact scopes and has no raw-log field/read. Health URLs permit only HTTP(S), remove userinfo/query/fragment, and redact secret-like path segments. All customer strings are untrusted data and must never be executed or followed as instructions; direct and end-to-end prompt-injection fixtures are required.

### SEC-34: OpenAI Reviewer Isolation

Reviewer access uses a separately flagged synthetic user/organization/project and deterministic fixtures with no production customer access. Its high-entropy credential is hashed in hosted secret/config ownership, accepted in a POST body only, never placed in a query string, and rate-limited to at most 10 attempts/minute/IP and 5/minute/credential key plus a global backstop. Success, failure, grant, revoke, and expiry are audit logged without secrets. Outside-network and periodic review smokes plus pre-expiry alerting are required; cancellation, removal, or completed publication verification revokes the credential and reviewer grants.

### SEC-35: OpenAI Retention, Bulkhead, And Metadata-Only Logs

Consumed/expired codes are deleted after 24 hours, expired/revoked refresh history after 30 days, and expired/revoked grants after 90 days, using indexed idempotent batches of at most 500 rows without deleting active state. OAuth/MCP rate controls are Redis-coordinated and fail closed: authorization 30/minute per user session and validated client; token exchange 30/minute per validated client and 5/minute per code/refresh family; unauthenticated challenge 120/minute/IP with burst 30 plus global backstop; authenticated MCP 60/minute/user and 60/minute/grant; artifact tools 20/minute/user and 20/minute/grant; reviewer entry 10/minute/IP and 5/minute/credential key; concurrent calls two/grant; and global concurrency starts at two and cannot exceed four without measured proof. Identity limits are primary; shared-egress IP/global limits are defense-in-depth. Database admission reserves at least six connections for ordinary API traffic and never waits unboundedly. Operational logs are limited to request ID, method/tool, pseudonymous client/grant key, outcome/status, duration, size bucket, rate/bulkhead decision, and cancellation/timeout state—never arguments, results, OAuth material, email, customer identifiers, incident text, endpoint bodies, or artifacts.

---

## 7. Enforcement

Every rule above must be enforced by at least one of:

- **Automated test** — the preferred enforcement mechanism. New routes/features must include regression tests for the applicable SEC-\* rules.
- **Startup assertion** — for configuration and environment requirements.
- **Schema validation** — for input/output shape enforcement.
- **Code review** — as a complementary check, never the sole enforcement.

When adding a new API route, SDK feature, or storage surface, review this list and confirm which SEC-\* rules apply to the change. If a rule applies, the enforcement mechanism must be present before the change ships.
