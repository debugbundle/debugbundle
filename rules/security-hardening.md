# Security Hardening Rules — DebugBundle

Version: v1
Last updated: 2026-04-05

These rules are ongoing enforcement requirements derived from the Phase 20 hardening audit.
They apply to **every future change** — not just the initial hardening pass.

> Cross-referenced with: `rules/domain-invariants.md` (structural invariants),
> `spec/requirements.md` (NFR-SEC), `spec/auth-architecture.md`, `spec/hardening-checklist.md` (Phase 20 evidence).

---

## 1. API Transport Security

### SEC-01: Explicit CORS Configuration
The API must use an explicit CORS origin allowlist derived from environment configuration (`APP_BASE_URL`). Open CORS (`*`) is never permitted. New API deployments must configure CORS before accepting cross-origin requests. Preflight requests from non-allowed origins must receive `403`.

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

### SEC-10: Dev-Only Endpoints Fail In Production
Any dev-only or mock endpoint (e.g., mock OAuth login) must fail at server startup when `NODE_ENV=production`, not at request time. The API must not boot with dev surfaces exposed in production.

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
Browser trace-header injection (`X-DebugBundle-Trace-Id`) must be restricted to same-origin requests by default. Cross-origin injection only when the URL matches an explicit `tracePropagationTargets` allowlist. Never inject into arbitrary third-party requests.

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

New security-relevant routes or actions must add audit logging in the same change. Audit logging is fail-open (failures log warnings but do not block the request).

---

## 6. Trust Boundaries

### SEC-25: Owner-Only Route Authorization
Every route that performs destructive or privileged operations (project deletion, member removal, role changes, billing mutations) must enforce owner-only authorization via `requireOwnerMemberAuth()` or equivalent. New privileged routes must include an explicit authorization test proving non-owner rejection.

### SEC-26: Relay Credential Rejection
Browser relay handlers must strip or reject `project_token`, `organization_id`, and authentication headers from incoming browser requests. Browser events must never carry cloud credentials. Server-side relay attaches credentials during forwarding only.

---

## 7. Enforcement

Every rule above must be enforced by at least one of:
- **Automated test** — the preferred enforcement mechanism. New routes/features must include regression tests for the applicable SEC-* rules.
- **Startup assertion** — for configuration and environment requirements.
- **Schema validation** — for input/output shape enforcement.
- **Code review** — as a complementary check, never the sole enforcement.

When adding a new API route, SDK feature, or storage surface, review this list and confirm which SEC-* rules apply to the change. If a rule applies, the enforcement mechanism must be present before the change ships.
