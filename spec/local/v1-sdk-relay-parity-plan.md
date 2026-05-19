# V1 SDK Relay Parity Plan

Status: planned local implementation guide
Owner: SDK / integrations
Created: 2026-05-19

## Goal

Bring every V1-supported server SDK relay surface into one shared definition of browser relay compatibility.

A server SDK cannot be described as full relay-compatible for V1 unless it can receive browser SDK batches, validate and sanitize them, preserve correlation, isolate credentials, and deliver accepted events through the same local-only, durable connected, and low-latency connected modes defined by the SDK contract.

Until an SDK reaches that bar, public wording should call it a browser relay foundation or manual relay integration helper, not full relay handler parity.

## Source-of-Truth Mapping

This plan implements and audits these existing rules:

- `FR-REL-01` through `FR-REL-14` in `spec/requirements.md`.
- `AC-REL-01` through `AC-REL-10` in `spec/acceptance.md`.
- `INV-17`, `INV-18`, and `INV-19` in `rules/domain-invariants.md`.
- Section 13 of `contracts/sdk-interface.md`.
- SDK test tiers in `rules/sdk-testing-strategy.md`.

If this plan conflicts with those files, update the source-of-truth files first and keep this plan in sync.

## V1 Scope

Full relay parity applies to these V1 shipped server SDK or integration surfaces:

| Surface | Required V1 relay shape |
| --- | --- |
| Node.js SDK | Core relay factory plus Express, Fastify, and Next.js adapters. |
| Python SDK | Core relay handler plus Django, Flask, and FastAPI adapters. |
| PHP SDK | Core relay handler plus Laravel middleware and Symfony controller. |
| WordPress plugin | WordPress REST relay route that composes the PHP relay behavior and adds WordPress-appropriate persistent limiter/spool storage. |

The Browser SDK remains the relay client. It must never be counted as a backend relay handler.

Go and Ruby are deferred until their SDK work resumes. When they resume, they must implement the same relay contract before being marked full relay-compatible.

## Current State Snapshot

### Node.js

Node.js is the reference implementation today. It already has:

- strict browser event type validation,
- field override and credential isolation,
- same-origin or allowlist validation,
- Express, Fastify, and Next.js adapters,
- local-only file transport writes,
- connected durable spool writes,
- cloud forwarding with server-side project credentials,
- delivered-spool marker behavior.

Known alignment checks before V1 parity signoff:

- Confirm whether `text/plain` JSON support is intentionally allowed. The current requirement says `application/json` so browsers trigger CORS preflight. If `text/plain` remains necessary for unload/beacon behavior, update the contract and all SDKs together; otherwise make Node strict.
- Confirm whether accepting an `events` array alias is intentional. If not, standardize on `batch` only.

### Python

Python currently has a relay foundation:

- `BrowserRelayHandler`,
- Django, Flask, and FastAPI registration helpers,
- origin validation,
- content-type checks,
- body-size checks,
- event-type allowlisting,
- field sanitization,
- callback-based `on_accept` handoff.

Missing for full parity:

- built-in local-only atomic file transport write path,
- connected durable relay spool,
- connected cloud forwarding with server-side project token,
- delivered/undelivered spool state and retention behavior,
- parity options for `projectMode`, `localEventsDir`, `spoolDir`, `durableWrite`, `endpoint`, `projectToken`, `service`, and `environment`,
- framework-adapter tests that prove end-to-end delivery rather than only handler acceptance.

### PHP

PHP currently has a relay foundation:

- `DebugBundle\Relay\BrowserRelayHandler`,
- Laravel middleware,
- Symfony controller,
- origin validation,
- content-type checks,
- body-size checks,
- event-type allowlisting,
- field sanitization,
- callback-based `onAccept` handoff.

Missing for full parity:

- built-in local-only atomic file transport write path,
- connected durable relay spool,
- connected cloud forwarding with server-side project token,
- delivered/undelivered spool state and retention behavior,
- parity options for `projectMode`, `localEventsDir`, `spoolDir`, `durableWrite`, `endpoint`, `projectToken`, `service`, and `environment`,
- a rate-limit store suitable for PHP shared-nothing runtimes,
- framework-adapter tests that prove end-to-end delivery rather than only handler acceptance.

### WordPress

WordPress is a concrete integration wrapper rather than a general-purpose SDK. It already has a REST browser relay route, persistent rate limiting, and bounded spool behavior around the PHP SDK path.

Required V1 checks:

- Keep WordPress behavior aligned with the PHP SDK relay contract as PHP moves from foundation to full parity.
- Preserve WordPress-specific persistent rate limiting because PHP in-memory limiter state is not reliable across normal WordPress requests.
- Add mock-ingestion smoke coverage that proves browser events reach a test ingestion server through the WordPress relay path.

## Full Relay Parity Checklist

A server SDK relay surface is full relay-compatible only when all items below are true.

### Handler Surface

- Exposes a core language-idiomatic relay handler.
- Exposes adapters for every V1 framework listed for that SDK.
- Mounts at `POST /debugbundle/browser` by default.
- Accepts the canonical browser relay body shape: JSON object with `batch` array of browser-origin event envelopes.
- Returns the canonical response shape: `{ "accepted": number, "rejected": number, "errors": string[] }` for 202 and 400 responses.

### Security Behavior

- Rejects non-POST requests with `405`.
- Validates `Origin`, with `Referer` fallback, before parsing or processing event data.
- Defaults to same-origin validation from the request host.
- Supports an explicit allowed-origin list.
- Requires `Content-Type: application/json` unless the source-of-truth contract is deliberately expanded for every SDK.
- Rejects request bodies larger than 256 KB with `413`.
- Applies per-IP rate limiting with default `60` requests per minute.
- Strips incoming `authorization`, `cookie`, and `x-api-key` request headers before any accepted-batch callback or forwarding path can observe them.
- Removes browser-supplied `project_token` and `organization_id`.
- Forces `sdk_name` to `@debugbundle/sdk-browser`.
- Preserves `correlation.trace_id` exactly when provided.
- Never exposes server-side project tokens or member tokens in browser responses.

### Event and Wire Format

- Accepts only `frontend_exception`, `error_suppressed`, `frontend_breadcrumb`, `request_event`, and `probe_event`.
- Validates the event envelope shape against the SDK contract.
- Preserves browser-owned `service`, `environment`, `occurred_at`, and `payload` unless explicit relay overrides are configured.
- Applies configured `service` and `environment` overrides consistently across languages.
- Writes local files using the same atomic file transport format as server SDK file transport: `<timestamp>-<sequence>-<service>.events.json` containing a JSON array of event envelopes.
- Ensures `debugbundle process` can process relay-written files without a relay-specific branch.

### Delivery Modes

- Local-only mode writes accepted browser events to `.debugbundle/local/events/`.
- Connected durable mode writes accepted events to `.debugbundle/local/browser-relay-spool/` before any cloud forwarding attempt.
- Connected durable mode retains undelivered spool files when cloud forwarding fails.
- Connected durable mode marks or records delivered spool files after successful forwarding.
- Connected low-latency mode forwards to cloud without a spool only when `durableWrite: false` or the language-idiomatic equivalent is explicitly configured.
- Cloud forwarding attaches the server-side project token only after request validation and sanitization.
- Forwarding failure does not throw into the host framework request path.

### Operations and Diagnostics

- Spool directories are configurable.
- Local event directories are configurable.
- Default paths match the Node SDK contract.
- `debugbundle doctor --check-relay` can report undelivered spool files regardless of which server SDK wrote them, because the on-disk format is shared.
- Framework adapters document production rate-limit storage expectations. PHP and WordPress must not rely on per-request object memory for production rate limiting.

## Work Plan

### 1. Contract and Requirement Alignment

- Update `contracts/sdk-interface.md` so it explicitly separates relay foundation from full relay-compatible handler parity.
- Update `spec/requirements.md` so relay requirements apply to all V1-supported server SDKs, not only Node.js.
- Update `spec/acceptance.md` so relay acceptance criteria are language-agnostic and include a cross-SDK parity fixture.
- Update `rules/sdk-testing-strategy.md` so relay parity is part of mandatory SDK contract testing for server SDKs that ship backend framework integrations.

### 2. Shared Relay Fixtures

Create a shared relay fixture pack consumable by Node.js, Python, PHP, and WordPress tests:

- valid browser batch,
- mixed valid and invalid event types,
- credential-smuggling payload,
- wrong-origin request,
- missing-origin request,
- oversized body,
- rate-limit sequence,
- local-only expected event file shape,
- connected durable spool expected file shape,
- cloud-forwarding mock request shape.

The fixture should live in a source-of-truth location that SDK repos can vendor or fetch during CI without importing core application code.

### 3. Node.js Parity Audit

- Decide and enforce the canonical content type behavior.
- Decide and enforce the canonical request body property name.
- Confirm Express, Fastify, and Next.js adapters all run the same core relay path.
- Confirm local-only, connected durable, and low-latency paths pass the shared fixtures.
- Confirm connected forwarding never forwards browser-supplied credentials.

### 4. Python Full Relay Delivery

- Add a language-native relay delivery module that owns local file writes, durable spool writes, cloud forwarding, delivered markers, and safe failure handling.
- Extend the Python handler options to include project mode, project token, endpoint, local events directory, spool directory, durable-write toggle, service override, environment override, injected clock, and injected HTTP transport for tests.
- Wire Django, Flask, and FastAPI adapters through the full handler path.
- Add pytest coverage for all shared fixtures and framework adapters.
- Update Python README and package docs after tests pass.

### 5. PHP Full Relay Delivery

- Add a language-native relay delivery module that owns local file writes, durable spool writes, cloud forwarding, delivered markers, and safe failure handling.
- Extend the PHP handler options to include project mode, project token, endpoint, local events directory, spool directory, durable-write toggle, service override, environment override, injected clock, injected HTTP transport, and rate-limit store.
- Wire Laravel and Symfony adapters through the full handler path.
- Add PHPUnit coverage for all shared fixtures and framework adapters.
- Update PHP README and package docs after tests pass.

### 6. WordPress Reconciliation

- Reconcile the WordPress REST relay with the updated PHP relay contract.
- Keep WordPress-specific persistent rate limiting and bounded spool behavior where it is stricter than the general PHP SDK.
- Add the mock-ingestion end-to-end smoke proving frontend browser events reach a test server through the WordPress relay.
- Update WordPress docs after tests pass.

### 7. Public Documentation and Release Gates

- Update the public SDK parity matrix only after each SDK passes its relay parity fixtures.
- Use these labels consistently:
  - Full relay handler: SDK implements the complete handler, delivery, and adapter checklist.
  - Relay foundation: SDK validates and sanitizes but requires caller-owned delivery.
  - Relay client path: Browser SDK sends to a backend relay and is not itself a relay handler.
  - Integration relay: WordPress or other wrapper composes SDK behavior into a concrete platform route.
- Release notes must call out any SDK that remains foundation-only before V1 as an explicit exception, not an implied finished surface.

## Acceptance for This Plan

This plan is complete when:

- the source-of-truth contracts define full relay parity for all V1-supported server SDKs,
- a cross-SDK fixture matrix exists,
- Node.js, Python, PHP, and WordPress pass their applicable relay fixture suites,
- public docs use only the approved labels above,
- no V1 release checklist marks Python or PHP as full relay-compatible while they remain callback-only foundations.
