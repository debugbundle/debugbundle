# Architectural Constraints — DebugBundle

Version: v1
Last updated: 2026-03-09

---

## 1. Bundle-Oriented System

The architecture must remain centered on the bundle lifecycle:

```
Signal → Normalized events → Grouped context → Deterministic debug bundle → Human or agent action
```

Everything in the system must serve this loop. Do not build features that optimize for arbitrary log search, dashboard analytics, or generic observability in V1.

AnalyticsBundle is the narrow exception to the old "no dashboard analytics" wording: it is permitted only as an opt-in, bundle-oriented product analytics lane that serves agent-native usage/friction/impact analysis. It must remain aggregate-first, privacy-aware, and tied to AnalyticsBundle artifacts, opportunities, incident impact, funnels, routes, journeys, and API/CLI/MCP/web parity. It must not become arbitrary event search, generic observability, or a long-term raw telemetry warehouse.

Browser debug capture and AnalyticsBundle capture may share frontend instrumentation primitives such as route normalization, session correlation, device context, referrer parsing, action sanitization, and structured journey formatting. That reuse must not couple the lanes: debug incident capture must keep working when analytics is off, unavailable, consent-blocked, sampled out, quota-blocked, or internally failing, and analytics events must remain separately validated, metered, retained, and processed.

---

## 2. Layer Separation

### Strict Layers

| Layer             | Responsibility                                                   | Forbidden                               |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------- |
| SDK               | Capture, sanitize, buffer, batch, ship events                    | No bundle generation, no business logic |
| Ingestion API     | Authenticate, validate, persist raw, enqueue                     | No heavy synchronous processing         |
| Processing Worker | Normalize, group, generate bundles, deliver webhooks             | No direct API serving                   |
| Storage           | Persist metadata (Postgres), artifacts (S3), queue state (Redis) | No business logic in storage layer      |
| Retrieval API     | Serve bundles/incidents/reproductions via API/CLI/MCP            | No event ingestion                      |
| Automation        | Webhook/alert delivery                                           | No bundle generation                    |

### Dependency Direction

```
SDK → Ingestion API → Processing Worker → Storage
                                            ↑
Retrieval API/CLI/MCP ──────────────────────┘
```

---

## 3. Interface Parity

**Hard rule:** If a capability matters for automation, it must be available through API, CLI, and MCP. No capability may be dashboard-only.

All three interfaces must call the same internal domain services. No interface may have unique hidden behavior.

OpenClaw support is a first-class agent automation surface when shipped. OpenClaw tools must project the same agent capability set as MCP with host-appropriate naming and safety gates, and must delegate to the same MCP/shared tool implementation rather than creating a fourth business-logic path.

---

## 3a. SDK Capability Parity

SDK capability, safety and reliability parity is a separate mandatory dimension
from interface parity. Every SDK or SDK-evidence change must evaluate the whole
maintained SDK family, including relays, bundled distributions and native bridges,
under [the SDK capability parity rule](sdk-capability-parity.md). Equivalent
behaviour and explicit runtime limits take precedence over identical implementation
details.

---

## 4. MCP as Thin Adapter

The MCP server must be a thin adapter over the same domain services used by API and CLI. It must NOT implement separate business logic, separate validation, or have different result shapes.

OpenClaw plugins follow the same adapter rule: plugin code may translate host metadata, tool names, schemas, and approval/allowlist declarations, but product behavior must remain owned by shared domain services and the MCP/CLI/API tool implementation.

---

## 5. Shared Packages Rule

Core logic must live in shared packages, not duplicated in apps:

- `bundle-engine` — bundle assembly logic
- `repro-engine` — reproduction generation
- `event-normalizer` — validation, normalization, fingerprinting
- `shared-types` — schemas, types, constants
- `redaction` — redaction rules and helpers
- `auth` — auth helpers
- `email` — email abstraction

Apps (`api`, `worker`, `cli`, `mcp`, `web`) are composition layers that wire shared packages together.

---

## 6. No Provider Lock-In

- Framework choices must not imply provider lock-in.
- The product web app must remain deployable as a static SPA on standard object storage/CDN hosting.
- Object storage must use S3-compatible patterns (Amazon S3, LocalStack S3).
- Standard Postgres and Redis. No proprietary database features.
- Self-host and hosted cloud must run the same core services.

---

## 6a. Public / Private Repository Split

This repo is the public core product repo for DebugBundle. Cloud deployment and operations config must live in the separate private repo (`debugbundle-cloud`).

- **No application code in the private repo.** It holds only deployment config (hosting blueprints, IaC, monitoring, CI/CD, env templates, runbooks).
- The public product repo keeps self-host (`deploy/selfhost/`) and local dev assets, but not cloud-only deployment config.
- The private repo references Docker images built from the public product codebase at an explicit commit or release.
- **Public CI** runs tests, lint, type-check, and build validation only. No deployment pipelines.
- **Private CI** (in `debugbundle-cloud`) handles production deployment, container publishing, and infrastructure provisioning.
- **Community contributions** target the public product repo. Changes should benefit both self-host and cloud editions.
- **Licensing:** First-party public product code is Apache-2.0. The private `debugbundle/site` repository owns website implementation and branding; published docs, examples, and generated reference artifacts remain Apache-2.0. The product dashboard remains public. See `spec/licensing.md` for the WordPress exception and documentation ownership.

---

## 7. Ingestion Must Be Lightweight

The ingestion API (`POST /v1/events`) must:

- Accept, persist raw events, enqueue processing, and return.
- NOT perform bundle generation, normalization, or heavy analysis inline.
- Remain fast and low-cost per request.

---

## 8. Processing Must Be Idempotent

All processing jobs (`group-incident`, `build-bundle`, `build-reproduction`, `deliver-webhook`, `cleanup-retention`) must be safely re-runnable without corrupting state.

---

## 9. Bundle Generation Must Be Deterministic

Given the same underlying event dataset, the bundle generator must produce identical output. This is required for trust, automation, and reproducibility.

---

## 10. SDKs Must Never Break Host Applications

This is the most critical reliability constraint. SDK internal failures must:

- Be caught internally
- Not block the main request/event path
- Not crash server or browser processes
- Degrade safely when queues are full
- Surface errors only through internal diagnostics

---

## 11. Storage Separation

| Data Type              | Store                        | Rationale                        |
| ---------------------- | ---------------------------- | -------------------------------- |
| Relational metadata    | PostgreSQL                   | Structured queries, transactions |
| Raw event payloads     | S3-compatible object storage | Cheap, temporary, compressed     |
| Generated bundles      | S3-compatible object storage | Cheap, durable artifacts         |
| Reproduction artifacts | S3-compatible object storage | Cheap, durable artifacts         |
| Queue state            | Redis                        | Fast, ephemeral                  |

Do NOT store raw events in PostgreSQL. Do NOT turn Postgres into a telemetry warehouse.

---

## 12. Scalability Guard

V1 must NOT add:

- Kafka
- ClickHouse
- OpenSearch
- Kubernetes
- Tracing backends
- Arbitrary query engines

Scale when the product proves broader needs.

---

## 13. Frontend Sandboxing

Frontend toolchain (npm, bundlers) should run in Docker-scoped environments to avoid host/system file exposure. If host package management is used, document explicitly in `/rules/` with pinned versions.
For local macOS workstation repair after Docker's forced install replaces native modules, Node 26.0.0 with pnpm 11.3.0 may run a frozen-lockfile reinstall (offline when the package cache is complete); validation and builds remain Docker-backed.

The React Native iOS installed-artifact lane may use host Node26.0.0/npm11.12.1
with React Native0.76.9 or0.87.1 and community CLI20.1.3 inside the SDK's disposable `.smoke`
consumer. CocoaPods/Xcode/Metro need macOS dependencies and the simulator.
The Expo iOS lane uses create-expo-app5.0.0 with the SDK57 TypeScript blank
template57.0.33 in the same disposable consumer. This exception covers the
repo-owned `rn-runtime-ios`, `rn-smoke-ios` and `rn-smoke-expo-ios` Make targets;
ordinary TypeScript, coverage and npm package checks remain Docker-backed. It does
not authorize consumer-product installs or global package/toolchain changes.

Android evidence qualification may run workspace-local macOS arm64 Emulator37.2.12
and Platform-Tools37.0.1 with command-line tools23.0 against API37.0 Google APIs arm64 image revision8,
API36 default arm64 revision2 and API23 default arm64 revision7. Tools,
AVDs, caches and synthetic APKs stay under this repository's ignored `.tmp` paths;
the Linux SDK used for Docker builds remains separate. Provisioning reuses already
accepted SDK licences and fails if a new licence or changed pinned revision is
required. Builds remain in Docker. This exception permits headless synthetic
runtime tests, not consumer-app installation or global Android configuration.
The official [sdkmanager](https://developer.android.com/tools/sdkmanager) supports
the platform override; [emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration)
requires a matching arm64 image on Apple silicon. Emulator results remain distinct
from physical-device performance and configured x86_64 CI lanes.
The Swift minimum-toolchain qualification may extract the signed upstream Swift
5.10 release package under `.tmp/swift-5.10` and run that compiler with the existing
macOS14.5 SDK. `make evidence-swift-floor-prepare` verifies the Swift Open Source
installer identity and records the package hash; it never runs the installer,
changes the selected Xcode or writes into system toolchain directories. This is
local qualification only. See the [official package verification guidance](https://www.swift.org/install/macos/package_installer/).

The React Native Android qualification harness may use the same pinned host
Node26.0.0/npm11.12.1, RN0.87.1 and CLI20.1.3 to prepare its disposable consumer
and coordinate this emulator. It reuses built SDK bytes (`--skip-build`); Gradle,
Metro compilation and APK inspection remain Docker-backed. Private ADB port5047
and emulator ports5580/5581 isolate it from other development devices.

## 13a. UI Design-System Approval Gate

Before any UI design, layout, or component implementation begins:

- Propose a design system first (design tokens, primitives, component inventory, state matrix, accessibility expectations, and usage patterns).
- Obtain explicit user approval on that design system proposal.
- Only after approval, implement UI/layout/components.

Component implementation rule:

- Build components for maximum reuse (composable APIs, variant-driven props, shared primitives, avoid page-only one-off components unless explicitly approved).

---

## 14. Cost Constraint

Hosted cloud service costs must stay within an explicitly approved lean baseline. For the current allowlisted-launch slice, the approved target baseline is roughly `$30/month` with an approval ceiling around `$35/month`; do not exceed that ceiling without explicit user approval. Architecture decisions must still factor in cost awareness — prefer cheap object storage over database row storage, compress aggressively, and enforce retention.

---

## 15. Token Scope Separation

- **Project Tokens**: SDK write-only, project-scoped. Cannot read bundles or manage accounts.
- **Access Tokens** (formerly Member Tokens): CLI/API/MCP read/manage within token scope and the issuing user's current permissions. Existing member-token identifiers remain compatible; see `contracts/member-token-scopes.md`.

These token classes must never be conflated.
