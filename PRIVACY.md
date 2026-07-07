# DebugBundle Privacy

Last updated: 2026-07-07

DebugBundle is designed around customer-controlled debugging data. SDKs capture application evidence only after a customer installs and configures them for a project. Self-hosted instances must not phone home.

## Debug Capture

DebugBundle debug capture focuses on incidents, bundles, reproductions, probes, logs, request summaries, and frontend context needed to diagnose failures.

Privacy rules:

- Sensitive values are redacted at SDK, ingestion, and processing boundaries where applicable.
- Project tokens are write-only and cannot read incidents, bundles, analytics, users, projects, billing, or settings.
- Member tokens and browser sessions are required for read/manage operations.
- Browser breadcrumbs must not capture raw form values or raw click text by default.
- SDKs must not collect fine-grained hardware identifiers.
- Mobile/client SDKs must not collect screenshots, raw view hierarchy, clipboard, contacts, photos, precise location, advertising identifiers, or keychain/keystore values by default.

## AnalyticsBundle Product Analytics

AnalyticsBundle is planned opt-in product analytics for the customer's own project. It is separate from DebugBundle's own product telemetry.

AnalyticsBundle rules:

- Disabled by default.
- Requires explicit browser SDK configuration with `analytics.enabled: true`.
- Consent-aware when the project or SDK requires consent.
- Uses a separate analytics processing lane and must not create incidents directly.
- Stores long-term aggregate metrics rather than long-term raw analytics events.
- Retains raw analytics inputs and representative journey samples only for bounded retention windows.
- Supports structured journey replay, not video replay, in the first implementation.

AnalyticsBundle must not collect by default:

- form values
- raw click text
- raw DOM snapshots
- screenshots or video replay
- precise coordinates or precise location
- raw IP addresses in analytics rollups
- raw URLs with query strings in long-term aggregates
- emails, names, phone numbers, addresses, tokens, secrets, payment data, or customer credentials

Returning-visitor and active-user analytics require privacy-safe identifiers:

- `strict` mode uses session-only analytics.
- `standard` mode may use a project-scoped anonymous visitor hash.
- `custom` mode may use customer-owned consent and identity integration while still enforcing DebugBundle schema, redaction, and retention limits.
- `user_id_hash` must be supplied by customer code as a privacy-safe hash. SDKs must not derive raw identity.

Team custom dimensions are controlled dimensions, not arbitrary retained JSON payloads. Values must be bounded, low-cardinality, redacted, and approved by project/tier configuration.
