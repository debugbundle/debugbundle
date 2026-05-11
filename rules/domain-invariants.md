# Domain Invariants — DebugBundle

Version: v1
Last updated: 2026-03-09

These invariants are rules that must NEVER be violated by any code in the system. They are not preferences — they are hard constraints. Any violation is a blocking defect.

---

## INV-1: Bundle Determinism

Given the same set of normalized events for an incident, the bundle generator must produce byte-identical output. Bundle generation must be a pure function of its inputs. No random IDs, no wall-clock timestamps, no non-deterministic iteration order.

**Enforcement:** Golden-fixture tests compare output against known-good snapshots.

---

## INV-2: SDK Never Crashes Host

SDK code (both `@debugbundle/sdk-node` and `@debugbundle/sdk-browser`) must NEVER throw uncaught exceptions into user code, block the request/response cycle, or crash the host process.

All SDK internal failures must be caught and silently swallowed (with optional internal diagnostic output). The SDK must degrade gracefully under all conditions: network failure, queue overflow, invalid configuration, missing API key, server errors.

**Enforcement:** Dedicated failure-injection test suite. SDK tests must include: malformed config, unreachable API, 500 responses, queue-full conditions, concurrent flushes.

---

## INV-3: Redaction Before Storage

Sensitive data must be redacted BEFORE leaving the SDK (client-side) and BEFORE any event payload is persisted (server-side). The pipeline must never persist unredacted sensitive fields.

Targets for automatic redaction:
- Passwords / password fields
- Authorization headers (Bearer tokens, API keys)
- Cookie values
- Credit card numbers / CVVs
- SSN / government IDs
- Custom user-defined patterns

**Enforcement:** Integration tests asserting redacted fields in stored events. No raw event stored in S3 or Postgres may contain known-sensitive patterns.

---

## INV-4: Processing Idempotency

All worker jobs must be idempotent. Re-running any job with the same input must produce the same result without duplicating data or corrupting state.

Jobs:
- `normalize-events` — re-normalizing already-normalized events produces same output
- `group-incident` — re-grouping produces same incident assignment
- `build-bundle` — re-building produces identical bundle (INV-1)
- `build-reproduction` — re-building produces same reproduction artifact
- `deliver-webhook` — re-delivery is logged but does not duplicate business effects
- `cleanup-retention` — re-running against already-cleaned data is a no-op

**Enforcement:** Each job type has a dedicated idempotency test.

---

## INV-5: Interface Parity

API, CLI, and MCP must expose equivalent capabilities for all core operations. No operation may exist in only one interface (except login flow for CLI, which has no MCP/API equivalent due to interactive auth).

All three interfaces must use the same underlying domain service functions. No interface may bypass shared packages to implement its own business logic.

**Enforcement:** Parity matrix test — enumerate operations and verify each exists in all interfaces.

---

## INV-6: Token Security

### INV-6a: Tokens Hashed at Rest
All tokens (project tokens, member tokens) must be stored as cryptographic hashes (SHA-256 minimum) in the database. The plaintext token is returned exactly once at creation time and never retrievable again.

### INV-6b: Token Scope Enforcement
Project tokens authenticate SDK event ingestion only. They cannot be used to read incidents, bundles, manage alerts, or perform any account operations.

Member tokens authenticate CLI/API/MCP operations. They cannot be used for SDK ingestion.

**Enforcement:** Auth middleware tests must verify scope enforcement for every route. Tests must confirm tokens are hashed before insert.

---

## INV-7: Webhook Signing

Every outgoing webhook payload must include an HMAC-SHA256 signature in the `X-DebugBundle-Signature` header, computed using the webhook's secret. Recipients must be able to verify payload integrity.

**Enforcement:** Webhook delivery tests verify signature presence and correctness.

---

## INV-8: Reproduction Confidence Is Explicit

Reproduction artifacts must always include an explicit `confidence` field with value `high`, `medium`, or `low`. This field must never be omitted, defaulted silently, or inferred without clear criteria.

**Enforcement:** Schema validation on reproduction output. Golden-fixture tests.

---

## INV-9: Retention Enforcement

Data must be deleted when it reaches its retention limit. Retention values are defined in `TIER_CAPABILITIES` (`packages/shared-types/src/tier-capabilities.ts`):
- Free plan: `bundle_retention_days: 7`, `raw_event_retention_days: 7`
- Solo plan: `bundle_retention_days: 30`, `raw_event_retention_days: 14`
- Team plan: `bundle_retention_days: 90`, `raw_event_retention_days: 30`

Retention cleanup must run as a scheduled worker job. No data may persist beyond the plan's retention window + a grace period (maximum 24 hours cleanup lag).

**Enforcement:** Retention cleanup integration tests with time-travel.

---

## INV-10: Bundle Schema Versioning

Every bundle must carry a `bundle_version` field (integer `1` for V1). Consumers must check this field before parsing. Future schema changes must increment the version and maintain backward-compatible reading of older versions.

Each context block within the bundle may carry its own `version` field (integer) for independent evolution. The bundle envelope version governs the overall structure; context block versions govern block-specific shape.

**Enforcement:** Schema validation tests. Parsing tests with version checks.

---

## INV-11: Event Envelope Completeness

Every event persisted through ingestion must contain the complete envelope:
- `schema_version` (date string, e.g., `"2026-03-01"`)
- `event_id` (UUID v4)
- `event_type` (one of: `backend_exception`, `request_event`, `log_event`, `frontend_breadcrumb`, `frontend_exception`, `deploy_metadata`, `error_suppressed`, `probe_event`)
- `occurred_at` (ISO 8601)
- `sdk_name` (SDK package name, e.g., `@debugbundle/sdk-node`)
- `sdk_version` (SDK semver, e.g., `0.1.0`)
- `project_token` → resolved to `project_id`
- `service.name` and `service.environment`
- `payload` (type-specific)

Missing required fields must cause ingestion rejection (400).

**Enforcement:** Zod schema validation at ingestion boundary. Rejection tests for incomplete events.

---

## INV-12: Incident Fingerprint Stability

The same failure in the same location must always produce the same incident fingerprint. Fingerprinting must be deterministic based on the following normalization pipeline (applied in order):

1. **Error class/type** — fully qualified error name (e.g., `TypeError`, `HttpException`)
2. **Normalized message** — error message with volatile values stripped: UUIDs, email addresses, timestamps, IP addresses, hex strings, numeric IDs replaced with `{dynamic}`
3. **Top N stack frames** — top 3–5 application frames after filtering out library/vendor frames (`node_modules/`, `vendor/`, `site-packages/`, `.venv/`, internal runtime frames)
4. **Route template** — HTTP route with dynamic segments replaced by `{param}` placeholders (UUIDs, numeric IDs, encoded tokens)
5. **HTTP method + status** — where applicable

Fingerprint is computed as SHA-256 of canonical JSON (stable key ordering) of the normalized fields above.

Each incident carries a `fingerprint_version` field indicating the algorithm version. When the algorithm changes, new incidents use the new version; existing incidents retain their version.

**Enforcement:** Fingerprint unit tests with known inputs → known outputs. Golden fixture tests for normalization steps.

---

## INV-13: Self-Host / Cloud Parity

The self-hosted deployment must run the same core services as the cloud deployment. No feature may be cloud-only except billing integration and managed infrastructure concerns. The `docker-compose.yml` in `deploy/selfhost/` must produce a fully functional system.

**Enforcement:** Self-host smoke test suite (startup, ingest, retrieve, reproduce).

## INV-14: Organization Ownership

Every organization must have at least one member with `role = 'owner'`. The system must reject any operation that would remove the last owner (role change, member removal, account deletion flow).

**Enforcement:** Domain service check on role-change and member-removal operations.

---

## INV-15: Event Class Billing Integrity

The billing store must enforce event class separation when computing `monthly_raw_ingested_events` usage:

- **Free plans:** Only Class A events (`event_class = 'incident_signal'`) count against the primary monthly allowance. Class B (context signals) and Class C (operational signals) are excluded.
- **Paid plans (Solo, Team):** Class A and Class B events count. Class C events (`error_suppressed`, standalone `probe_event`) are excluded on all tiers.
- No event may change class after normalization. The `event_class` assigned during worker normalization is immutable for billing purposes.

This invariant ensures that passive telemetry (non-5xx request events, deploy metadata, operational aggregates) never silently consumes a Free user's primary error-capture budget, while first-party 5xx request failures are deliberately treated as Class A incident signals.

**Enforcement:** Billing query tests must verify that Free-tier usage counts exclude Class B and Class C events. Integration tests must confirm that identical ingestion payloads produce different billing counts on Free vs. paid plans.

---

## INV-16: Capture Policy Server-Side Enforcement

The ingestion API must reject events that violate the project's resolved capture policy. Rejection must happen at the ingestion boundary (before persistence) with an explicit `capture_policy_rejected` reason in the response.

SDKs should gate event emission client-side to minimize rejected traffic, but the server is the authoritative enforcement point. A well-behaved SDK + server pair should produce zero policy rejections under normal operation.

**Enforcement:** Integration tests must verify that non-5xx standalone `request_event` payloads are rejected on a Free project with `minimal` preset, first-party 5xx `request_event` payloads are accepted under every preset/override, and paid projects with `balanced` preset accept 5xx request failures by default.

---

## INV-17: Relay Wire Format Alignment

Browser relay handler output must use the same file format as the server SDK file transport: `<timestamp>-<sequence>-<service>.events.json` containing a JSON array of `EventEnvelope` objects, written atomically via temp-file + rename. `debugbundle process` must consume relay-written files without special-casing.

**Enforcement:** Tests must verify that relay-written event files pass the same validation and processing pipeline as server SDK file-transport output.

---

## INV-18: Relay Credential Isolation

The browser SDK must never possess or transmit cloud credentials (project tokens, member tokens, API keys). In connected mode, the relay handler attaches the server-side project token before forwarding events to the cloud ingestion API. Browser-originated events reach the relay via a same-origin POST without any DebugBundle credentials.

**Enforcement:** Tests must verify that relay handler implementations strip or reject any `project_token`, `organization_id`, or authentication headers present in incoming browser requests before processing.

---

## INV-19: Relay Origin Validation

All relay handler implementations must validate the `Origin` header of incoming requests against a developer-configured allowlist before processing any event data. Requests with missing or non-matching origins must be rejected with an appropriate HTTP error.

**Enforcement:** Tests must verify that relay handlers reject requests from non-allowlisted origins and accept requests from explicitly configured origins.

---

## INV-20: GitHub Credential Separation

GitHub OAuth user sign-in tokens must never be used for repository automation. Repository automation uses GitHub App installation access tokens exclusively. The GitHub App private key is stored only as an environment variable, never in the database. Installation access tokens are cached in Redis (50-minute TTL), never persisted to disk or database.

**Enforcement:** Tests must verify that dispatch delivery code uses only installation access tokens (not OAuth tokens), and that no GitHub App private key material appears in database tables or application logs.

---

## INV-21: Dispatch Payload Data Minimization

GitHub `repository_dispatch` payloads must contain only summary fields and API links. Full bundle JSON, raw event data, stack traces, and sensitive incident details must never be embedded in dispatch payloads. The receiving workflow fetches full data using a DebugBundle member token stored as a GitHub Actions secret.

**Enforcement:** Tests must verify that dispatch payload construction excludes bundle content, raw events, and any field marked as redactable. Payload size must be validated as bounded (summary-only).

---

## INV-22: Dispatch Cooldown Enforcement

Each dispatch rule operates an independent cooldown window per incident fingerprint. Within the configured `cooldown_seconds`, duplicate dispatches for the same `rule_id + incident_fingerprint` are suppressed. The cooldown minimum is 60 seconds. This prevents noise amplification from high-frequency incidents.

**Enforcement:** Tests must verify that dispatches within the cooldown window are skipped, that cooldown is per-fingerprint (not per-incident-ID), and that the minimum 60-second floor is enforced on rule creation/update.

---

## INV-23: GitHub App Webhook Verification

All incoming GitHub App webhook events (`POST /v1/github/app/webhook`) must be verified using HMAC-SHA256 with the `GITHUB_APP_WEBHOOK_SECRET` before processing. Unverified payloads must be rejected with `401`. This is consistent with INV-7 (webhook signing) applied to incoming GitHub events.

**Enforcement:** Tests must verify that webhook payloads without valid signatures are rejected, and that valid signatures from the configured secret are accepted.
