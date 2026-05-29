# Swift iOS SDK Implementation Plan

Version: v1
Last updated: 2026-05-29

---

## Purpose

This plan defines the Swift iOS SDK surface for DebugBundle. The goal is a production-ready Swift Package Manager package for native iOS and iPadOS applications that satisfies the same universal SDK, capture-policy, probe, redaction, safety, event-shape, release, and testing contracts as the shipped major SDKs while respecting Apple's app lifecycle, concurrency, privacy, background execution, and distribution constraints.

This document covers iOS and iPadOS. macOS, watchOS, tvOS, visionOS, server-side Swift, and cross-platform wrappers are out of scope for V1 unless explicitly approved later.

The Swift SDK must satisfy `contracts/sdk-interface.md`, especially sections 1 through 12 and the mobile correlation contract in section 10.1, plus `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

---

## Coverage Posture

### Native iOS and iPadOS Apps

iOS/iPadOS is the V1 center of gravity. The SDK must support:

- UIKit app lifecycle initialization.
- SwiftUI app lifecycle initialization.
- Scene foreground/background breadcrumbs.
- UIKit navigation breadcrumbs.
- SwiftUI navigation helper APIs.
- `URLSession` trace injection and request-event capture through explicit instrumented configurations.
- Swift concurrency capture helpers.
- In-process logging through SwiftLog and explicit SDK log APIs.
- Durable offline queueing across app restarts.
- Foreground and background upload scheduling where iOS permits it.

### Mobile Cross-Boundary Incidents

Swift events must use the same DebugBundle event pipeline as browser/client events. A mobile incident can include:

- a fatal crash, Objective-C exception, or handled Swift error,
- app version and build metadata,
- device and OS context,
- recent screen and user-action breadcrumbs,
- outbound network request metadata,
- `X-DebugBundle-Trace-Id`,
- backend events captured by a server SDK using the same trace ID.

### Apple Platform Constraints

iOS is not a server process. The SDK must account for:

- app suspension and termination,
- limited background execution,
- scene-based lifecycle,
- Swift concurrency task boundaries,
- App Store privacy review,
- file protection and device lock state,
- URLSession limitations around global interception,
- crash-capture safety constraints.

Swift iOS is a mobile/client SDK and must not host browser relay routes. Browser relay CORS preflight, `allowedOrigins`, `transportMode`, and `/debugbundle/browser` route handling belong to browser plus server SDK surfaces. If server-side Swift support is added later, that separate server SDK plan must implement the full relay contract.

---

## Scope

### V1 In Scope

- Swift core SDK for manual capture and shared runtime behavior.
- Swift-idiomatic singleton facade plus injectable `DebugBundleClient`.
- Universal SDK interface with Swift camelCase naming.
- UIKit `UIApplicationDelegate` and `UISceneDelegate` integration helpers.
- SwiftUI `App` modifier / view modifier setup.
- UIKit navigation capture through `UINavigationControllerDelegate` and view-controller lifecycle helpers.
- SwiftUI screen breadcrumb helpers for `NavigationStack`.
- `URLSessionConfiguration` instrumentation and delegate/wrapper helpers for trace injection and network breadcrumbs.
- Optional Alamofire adapter if dependency boundaries remain clean.
- SwiftLog `LogHandler` integration.
- Swift concurrency helpers for captured async operations and tasks.
- Handled `Error`, `NSError`, and Objective-C `NSException` capture where possible.
- Fatal crash evidence persisted for next-launch delivery when implemented safely.
- Durable offline queue in app-private Application Support storage.
- Direct connected transport to DebugBundle cloud or self-hosted ingestion.
- Session sampling, per-session caps, duplicate suppression, loop protection, retry/backoff, and `Retry-After` bounding.
- Mobile device context defined by the SDK contract.
- Always-on probes, remote probe directives through mobile-safe config fetch and ingestion-response piggybacking, and trigger-token support.
- Conservative privacy defaults suitable for consumer, healthcare, finance, and enterprise apps.

### V1 Out of Scope

- Server-side Swift frameworks such as Vapor or Hummingbird.
- Browser relay handlers, browser relay CORS/preflight options, and `.debugbundle/local/events` file transport.
- macOS, watchOS, tvOS, visionOS, extensions, widgets, and App Clips as first-class targets.
- React Native, Flutter, Unity, Xamarin, or MAUI wrappers.
- Arbitrary global interception of every `URLSession` in the process.
- Reading unified logs, sysdiagnose, Console.app logs, or OSLog store.
- Capturing request/response bodies by default.
- Capturing screenshots, view hierarchy text, text fields, clipboard, contacts, precise location, advertising identifiers, keychain values, photos, or file contents.
- MetricKit crash diagnostics as the only crash path.
- Mach exception server or signal-handler crash reporter unless implemented in a separately reviewed module with async-signal-safe guarantees.
- SQL, Core Data, GraphQL, SwiftData, Combine, StoreKit, APNs, or database auto-instrumentation.

---

## Artifacts

The Swift SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-swift
```

Publish through Swift Package Manager. The package should expose focused products:

| Product | Purpose |
| --- | --- |
| `DebugBundle` | Core client, event model, buffering, transport, redaction, probes, suppression, offline queue, manual API, and lifecycle primitives. |
| `DebugBundleUIKit` | UIKit app, scene, view-controller, and navigation helpers. |
| `DebugBundleSwiftUI` | SwiftUI app/view modifiers and navigation breadcrumbs. |
| `DebugBundleURLSession` | URLSession instrumentation, trace injection, and network breadcrumb/request-event capture. |
| `DebugBundleSwiftLog` | SwiftLog `LogHandler` integration. |
| `DebugBundleAlamofire` | Optional Alamofire adapter if V1 includes it. |
| `DebugBundleCrashReporter` | Optional crash evidence module if safe fatal-crash capture cannot live in core. |
| `DebugBundleTestSupport` | Test utilities, fake transport, fixture assertions, and queue inspection helpers. |

Suggested module roots:

| Module | Owner |
| --- | --- |
| `DebugBundle` | Public facade, config, status, client, event model, queue, transport, redaction, probes. |
| `DebugBundleUIKit` | UIApplication, UIScene, UIViewController, UINavigationController integrations. |
| `DebugBundleSwiftUI` | App and view modifiers, screen naming, NavigationStack helpers. |
| `DebugBundleURLSession` | URLSessionConfiguration, URLProtocol/delegate/wrapper helpers, request capture. |
| `DebugBundleSwiftLog` | SwiftLog integration. |
| `DebugBundleCrashReporter` | Next-launch crash evidence and crash-path persistence. |

Repository tooling should use Swift Package Manager, Xcode project generation only when needed for examples, SwiftFormat or SwiftLint, Swift Testing and/or XCTest, iOS simulator test lanes, package documentation generation, DocC, semantic versioning, signed GitHub releases, and CI release validation.

Current toolchain snapshot for implementation planning only:

- Apple lists Xcode 26.5 with iOS/iPadOS 26.5 SDKs, iOS/iPadOS deployment targets from 15 through 26.5, and Swift 6 language mode.
- Swift.org announced Swift 6.2 on 2025-09-15; Apple Xcode support pages now show newer Xcode toolchains.
- V1 should keep source compatibility with Swift 5 mode where practical while validating Swift 6 mode in CI.

These external lanes are intentionally time-sensitive. Refresh Xcode, Swift, iOS SDK, deployment target, App Store upload, Swift Package Manager, and dependency lanes before repository scaffold, before beta, and before public release.

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-04`: mobile client breadcrumbs analogous to browser breadcrumbs.
- `FR-SDK-05`: canonical event types, especially `frontend_exception`, `frontend_breadcrumb`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: duplicate suppression, loop protection, and sampling.
- `FR-SDK-16`: universal SDK interface with Swift camelCase naming.
- `FR-SDK-18`, `FR-SDK-19`: in-process log capture and log-level filtering.
- `FR-SDK-22` and `FR-SDK-32`: `X-DebugBundle-Trace-Id` correlation through native HTTP clients.
- `FR-SDK-33`: durable offline queueing and deferred delivery.
- `FR-SDK-34`: mobile device context.
- `FR-SDK-37`: Swift iOS SDK delivery plan.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `FR-EVT-07` and `FR-EVT-08`: server-owned capture policy and ingestion backstop enforcement.
- `contracts/sdk-interface.md` sections 1 through 12.
- `rules/security-hardening.md` SDK, redaction, retry, trace-header, and object-sanitization requirements.
- `rules/sdk-testing-strategy.md` SDK, contract, compatibility, and release gates.

Primary acceptance coverage:

- `AC-SDK-04`: duplicate suppression.
- `AC-SDK-05`: redaction defaults.
- `AC-SDK-09`: in-process log capture.
- `AC-SDK-11`: universal interface consistency.
- `AC-SDK-12`: cross-context trace correlation.
- `AC-SDK-13`: loop protection recovery.
- `AC-SDK-15`: mobile trace injection.
- `AC-SDK-16`: mobile offline queue.
- `AC-SDK-17`: mobile device context.
- `AC-SDK-19`: iOS lifecycle and crash capture.
- `AC-SDK-20`: mobile privacy defaults.
- `AC-EVT-09` and `AC-EVT-09a`: local capture-policy enforcement.

---

## Public API

The SDK must expose a Swift facade and an instance client.

SwiftUI setup:

```swift
@main
struct CheckoutApp: App {
    init() {
        DebugBundle.init(
            DebugBundleConfig(
                projectToken: Bundle.main.debugBundleProjectToken,
                service: "checkout-ios",
                environment: "production",
                releaseChannel: "app-store"
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            CheckoutRootView()
                .debugBundleScreen("CheckoutRoot")
        }
    }
}
```

UIKit setup:

```swift
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        DebugBundle.init(
            DebugBundleConfig(
                projectToken: Bundle.main.debugBundleProjectToken,
                service: "checkout-ios"
            )
        )
        DebugBundleUIKit.install(application: application)
        return true
    }
}
```

Minimum universal facade:

```swift
DebugBundle.captureException(error, context: ["screen": "Checkout"])
DebugBundle.captureError(error)
DebugBundle.captureLog("payment retry failed", level: .warning, context: ["attempt": attempt])
DebugBundle.captureRequest(requestInfo, response: responseInfo)
DebugBundle.captureMessage("checkout started")
DebugBundle.setContext("account_id", value: accountId)
DebugBundle.probe("checkout.cart", data: ["items": itemCount])
DebugBundle.probe("checkout.tax", options: ProbeOptions(heavy: true)) {
    expensiveTaxState()
}
await DebugBundle.flush()
let status = DebugBundle.status
let lastEventAt = DebugBundle.lastEventAt
```

URLSession setup:

```swift
let configuration = URLSessionConfiguration.default
configuration.debugBundleInstrumented(
    tracePropagationTargets: ["https://api.example.com"]
)
let session = URLSession(configuration: configuration)
```

SwiftLog setup:

```swift
LoggingSystem.bootstrap { label in
    DebugBundleLogHandler(label: label)
}
```

All public APIs must be no-throw by default. Explicit operation wrappers may rethrow application errors after capture when documented.

---

## Runtime Compatibility

- Minimum iOS/iPadOS deployment target: iOS 15.
- Recommended production target: current App Store accepted Xcode and SDK at release time.
- Current planning lane: Xcode 26.5, iOS/iPadOS 26.5 SDK, Swift 6 language mode, iOS 15+ deployment.
- Package source compatibility should support Swift 5 language mode where practical.
- Swift 6 language mode must be validated in CI before release.
- Installed-base compatibility lanes: iOS 15, 16, 17, 18, and current stable iOS/iPadOS simulator/device lanes where available.
- UIKit and SwiftUI integrations are first-class; apps may use either or both.
- Core package should avoid binary dependencies and Objective-C swizzling by default.
- Optional integrations must not force SwiftLog, Alamofire, crash-reporter, UIKit, or SwiftUI dependencies onto core-only consumers unless platform constraints require it.

Release preparation must refresh Xcode, Swift compiler, Swift language mode, iOS SDK, iOS deployment target, App Store upload requirements, SwiftLog, Alamofire if shipped, SwiftFormat/SwiftLint, and simulator/device lanes.

---

## Configuration

Required:

| Option | Description |
| --- | --- |
| `projectToken` | Write-only project token for connected mobile ingestion. Treat as extractable from the app binary, not as a secret boundary. |

Important optional options:

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Kill switch. |
| `environment` | Bundle configuration or auto-detect | Runtime environment name. |
| `service` | Bundle identifier | Service name. |
| `endpoint` | `https://api.debugbundle.com/v1/events` | Cloud or self-host ingestion endpoint. |
| `releaseChannel` | `production` | Mobile release channel, e.g. debug, testflight, app-store. |
| `appVersion` | `CFBundleShortVersionString` | App version override. |
| `buildNumber` | `CFBundleVersion` | Build number override. |
| `batchSize` | `10` | Max events per batch. |
| `flushInterval` | `3 seconds` | Max delay before foreground flush. |
| `sampleRate` | `1.0` | Per-event sampling. |
| `sessionSampleRate` | `1.0` | Per-app-session sampling. |
| `maxEventsPerSession` | `100` | Cap for non-exception mobile events. |
| `maxBreadcrumbs` | `20` | Screen/action/network breadcrumb ring size. |
| `captureScreens` | `true` | Capture screen transition breadcrumbs. |
| `captureActions` | `false` | Capture coarse user action breadcrumbs. |
| `captureNetwork` | `true` | Capture instrumented network summaries. |
| `captureLogs` | `true` | Capture log integration output. |
| `logLevel` | `.warning` | Minimum captured log level. |
| `tracePropagationTargets` | `[]` | Required allowlist for adding trace headers beyond explicitly instrumented first-party clients. |
| `offlineQueueMaxEvents` | `500` | Max persisted offline events. |
| `offlineQueueMaxBytes` | `5 MB` | Max persisted queue bytes. |
| `offlineQueueTtl` | `72 hours` | Drop stale queued events on delivery attempt. |
| `requestTimeout` | `5 seconds` | HTTP transport timeout. |
| `fileProtection` | `.completeUntilFirstUserAuthentication` | Default queue file protection class. |
| `maxProbeLabels` | `50` | Distinct probe labels retained. |
| `maxProbeEntriesPerLabel` | `10` | Entries retained per label. |
| `probeFlushOnError` | `true` | Attach probe buffers to captured errors. |

Configuration sources must include:

- Programmatic `DebugBundleConfig`.
- Bundle `Info.plist` examples for non-secret static values.
- Xcode build settings examples for service, environment, token, app version, build number, and release channel.
- Dependency-injected configuration for larger apps.

Configuration precedence is: explicit programmatic `DebugBundleConfig`, dependency-injected runtime config, Xcode/Info.plist-provided values, auto-detection, then SDK defaults. Server-owned capture policy and capture rules are more restrictive than local config when they conflict.

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config` and use ingestion enforcement as the authoritative backstop.

Service naming guidance: iOS apps should use a platform-specific service name such as `checkout-ios`, not the backend service name. If Android and iOS share one DebugBundle project, use distinct service names (`checkout-android`, `checkout-ios`) so bundles can separate client surfaces while still correlating through trace IDs.

Safe startup behavior: when `enabled` is true but no usable project token or endpoint is configured, the SDK must become a no-op or degraded client, expose that state through `status`, and never report healthy connected capture.

---

## Setup and Deployment Modes

### SwiftUI App

SwiftUI apps should initialize in the `App` initializer and use view modifiers for screen breadcrumbs:

```swift
ContentView()
    .debugBundleScreen("Checkout")
```

The modifier must not capture view state or text by default. It records screen identity, lifecycle timing, and navigation transitions only.

### UIKit App

UIKit apps should initialize in `UIApplicationDelegate` and install scene/navigation helpers explicitly:

```swift
DebugBundleUIKit.install(application: application)
navigationController.delegate = DebugBundleNavigationDelegate(existing: navigationController.delegate)
```

The SDK must preserve existing delegates by wrapping or composing when possible and documenting cases where manual forwarding is required.

### URLSession Apps

URLSession instrumentation must be explicit. The SDK may provide:

- `URLSessionConfiguration.debugBundleInstrumented(...)`
- a `DebugBundleURLProtocol` for configurations that support custom protocol classes,
- delegate/wrapper helpers for apps that need more control,
- an Alamofire adapter if V1 includes it.

Global `URLProtocol.registerClass` should not be the default because it can affect third-party SDKs and system traffic.

### Background Flush

Foreground apps flush on batch size, interval, lifecycle background, and explicit `flush()`. Background delivery should use safe iOS mechanisms such as background URLSession and `BGTaskScheduler` when configured, but docs must be clear that iOS may delay or deny background execution.

### Local Development

iOS has no server-style `.debugbundle/local/events` file transport. Local development should use an endpoint override to a local mock/staging ingestion endpoint reachable from simulator or device. The test support package must include a mock ingestion server and queue inspection helpers for local verification.

### Zero-Install Fallback

When installing the SDK is blocked, iOS apps may emit canonical `debugbundle-ndjson` through app-owned export/debug channels and ingest it manually. This is not full SDK parity because it lacks automatic trace injection, offline queueing, capture policy, probes, and lifecycle breadcrumbs.

---

## iOS Lifecycle, Crash, and Error Capture

The SDK must capture:

- handled `Error` and `NSError` values passed to `captureException`,
- Objective-C `NSException` where the runtime exposes it safely,
- Swift async operation failures through wrappers,
- scene foreground/background transitions,
- screen and navigation breadcrumbs,
- fatal crash evidence on next launch when safe crash-path persistence is implemented.

Swift does not have a general-purpose uncaught exception model equivalent to JVM exceptions. The SDK must be honest: handled errors and explicit operation wrappers are reliable; fatal crash capture requires a carefully designed next-launch crash reporter and cannot perform network work in the crashing process.

Fatal crash handling, if shipped in V1, must persist only minimal bounded evidence synchronously and upload on next launch. Signal/Mach handlers must be async-signal-safe. If that standard cannot be met in time, V1 must ship handled-error/lifecycle/network parity and mark full fatal crash reporting as post-V1 rather than implying unsafe coverage.

The SDK must preserve host behavior. It must not swallow application errors unless a no-throw helper is explicitly chosen, change app termination behavior, or interfere with existing crash reporters without documented chaining/composition.

---

## Breadcrumbs and User Actions

Mobile breadcrumbs reuse browser semantics:

- ring buffer in memory,
- attached to `frontend_exception` by default,
- optional standalone `frontend_breadcrumb` shipping when capture policy allows it,
- cleared only after successful attachment/flush.

Allowed default breadcrumbs:

- screen name or route identifier,
- previous screen,
- lifecycle transition,
- coarse tap/action target type,
- sanitized view class name,
- developer-provided screen/action names,
- network method, host, path template, status, and duration,
- app foreground/background.

Disallowed by default:

- text content,
- text field names or values,
- screenshots,
- full view hierarchy,
- precise coordinates unless explicitly enabled and rounded,
- clipboard, contacts, SMS, call logs, photos, location, advertising ID, keychain values.

SwiftUI helpers must require developer-provided names for sensitive screens instead of introspecting view state.

---

## Logging Integrations

V1 must support:

- `DebugBundle.captureLog(...)` manual logging.
- SwiftLog `LogHandler` integration.
- Optional context metadata from task-local or SDK-scoped context.

Logging integration must:

- capture structured `log_event` records in process,
- never read OSLog/unified logs,
- respect `logLevel` and capture policy,
- include logger label, level, message, metadata after redaction, timestamp, thread/task context when available, and throwable/error summary when supplied,
- avoid recursive SDK logging capture,
- avoid async network flushes from logging callbacks.

`os.Logger` global interception is out of scope because Apple does not expose a safe process-wide hook for third-party SDK capture.

---

## Privacy Defaults

Swift defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Do not capture view text, screenshots, text fields, location, contacts, clipboard, identifierForVendor, advertising ID, keychain values, photos, or file contents.
- Treat project tokens as write-only but extractable from the mobile binary.
- Use app-private Application Support storage with file protection.
- Redact sensitive data before queue persistence and transport.
- Collect jailbroken status as `null` unless the developer explicitly enables coarse device-integrity collection.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`
- `traceparent`

If payload capture is later enabled, it must require explicit size limits, content-type filters, redaction, and documentation warning that it is not recommended for sensitive apps.

---

## Transport and Offline Queue

The Swift SDK must implement:

- HTTP transport for connected ingestion.
- Durable offline queue in app-private Application Support storage.
- Queue files protected with an explicit file protection class.
- Queue writes that are atomic and crash-safe.
- Queue limits by event count and bytes.
- TTL eviction for events older than 72 hours.
- Retry and backoff for `429` and transient `5xx`.
- `Retry-After` handling capped at 5 minutes.
- Drop behavior for non-429 `4xx` after recording an internal diagnostic.
- Foreground flush on batch size and interval.
- Background upload where iOS grants execution time.
- Connectivity-aware deferred delivery through `NWPathMonitor`.

Queue persistence must happen after redaction. Queued events must keep their original `occurred_at` capture timestamp and may add local queue metadata that is not sent as trusted event data.

Transport failures must never throw into app code. Main-actor work must be bounded to cheap enqueue operations; serialization, compression, queue compaction, and network transport run off the main actor.

---

## Capture Policy and Probes

The Swift SDK must use mobile-safe config behavior:

- Fetch `GET /v1/sdk/config` once on init when project token and endpoint are configured.
- Use `ETag`/`If-None-Match`.
- Do not poll aggressively in the background.
- Refresh opportunistically on foreground resume, bounded interval, explicit flush, and ingestion-response piggybacking.
- Fall back to safe minimal behavior when config fetch fails.

It must enforce:

- capture log level/off settings,
- request event capture modes,
- breadcrumb capture modes,
- probe event capture modes,
- immediate client error status promotion,
- capture-rule `sample` and `drop` where local parity is implemented.

Probe behavior must match the universal contract:

- Always-on ring buffers for all tiers.
- Lazy probe closure support for Swift.
- `heavy = true` probes dormant until matching activation.
- Remote activation when config/piggyback directives are available.
- Trigger token extraction from deep-link query parameter `_debug_probe` and request header `X-DebugBundle-Probe-Trigger`.
- Trigger tokens apply only to the current app session or instrumented request, not permanently.
- Probe events respect session sampling and queue limits, except error-attached probe data remains attached to the error path.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

iOS events must include:

- `sdk_name`: `@debugbundle/sdk-swift`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `correlation.trace_id` when an instrumented request created or observed it
- sanitized payload
- mobile device context
- app version, build number, and release channel

Mobile client failures use `frontend_exception`. Mobile breadcrumbs use `frontend_breadcrumb`. Network failures use `request_event` when capture policy allows or promotes them. Logs use `log_event`. The SDK must not introduce Swift-only event types and must not assign `event_class`; classification remains worker-owned.

Device context may include OS name/version, device model, form factor, screen resolution, locale, timezone, network connection type, battery level/charging when available, free disk bytes when available, free memory bytes when available, app version, build number, release channel, and nullable jailbroken status.

---

## Implementation Slices

1. Repository scaffold and release wiring
   - Create `debugbundle-swift` with package products, governance files, CI, release workflow, SwiftFormat/SwiftLint, DocC, examples, and package validation.

2. Core client and event model
   - Config, facade, instance client, event envelope builder, buffer, status, last event timestamp, mockable transport, and HTTP transport.

3. Redaction and privacy
   - Default sensitive fields, Swift object serialization limits, header allowlist, no body capture defaults, and privacy tests.

4. Offline queue and transport
   - Application Support queue, file protection, atomic writes, TTL/size eviction, retry/backoff, connectivity handling, and no-throw guarantees.

5. Suppression and sampling
   - Duplicate suppression, loop protection, session sampling, per-session caps, and failure injection tests.

6. Lifecycle and device context
   - UIKit app/scene hooks, SwiftUI app/view modifiers, screen breadcrumbs, app/device snapshot, and low-risk battery/storage/network metadata.

7. Crash and error evidence
   - Handled error capture, NSException capture where safe, async operation wrappers, next-launch crash evidence if safe, and fatal-path safety tests.

8. Network integrations
   - URLSession instrumentation first, trace propagation targets, network breadcrumbs, request-event promotion, and optional Alamofire adapter.

9. Navigation and SwiftUI
   - UIKit navigation delegate composition, SwiftUI screen naming helpers, NavigationStack guidance, and breadcrumb tests.

10. Logging integrations
    - Manual log API, SwiftLog handler, recursion guard, structured context, and log-level/capture-policy enforcement.

11. Capture policy and probes
    - Config fetch, ETag caching, mobile-safe refresh, capture-rule enforcement subset, probe buffers, remote directives, and trigger tokens.

12. Documentation and examples
    - SwiftUI, UIKit, URLSession, SwiftLog, offline queue, privacy, crash caveats, probes, first-event verification, and staged artifact smoke apps.

---

## Testing Plan

The Swift SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for every universal method.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for headers, nested objects, circular references, oversized payloads, tokens, cookies, phone/card/OTP fields, and Swift metadata.
- Duplicate suppression and loop protection tests.
- Retry/backoff tests using `URLProtocol` fake transport or local mock server.
- Offline queue atomicity, TTL, capacity, corruption recovery, file protection, and app-restart tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger-token tests.
- UIKit lifecycle and navigation tests in simulator lanes.
- SwiftUI screen breadcrumb tests.
- URLSession instrumentation tests for trace injection, target allowlist, request metadata, and failure promotion.
- Alamofire adapter tests if shipped in V1.
- SwiftLog integration tests.
- Handled error, NSException, and async wrapper tests.
- Crash evidence tests in isolated process fixtures if crash reporter ships in V1.
- Concurrency tests for parallel log, request, probe, queue, and flush paths.
- Privacy snapshot tests proving no body/text/screenshot/location/device identifiers are captured by default.

CI matrix:

```text
Swift package unit lane on latest stable Xcode
Swift 5 language mode compatibility lane where supported
Swift 6 language mode lane
iOS 15 simulator compatibility lane
iOS 16 simulator lane
iOS 17 simulator lane
iOS 18 simulator lane
Current stable iOS simulator/device lane
UIKit integration lane
SwiftUI integration lane
URLSession lane
SwiftLog current stable lane
Alamofire current stable lane if shipped
```

Quality gates:

- `swift package resolve`
- `swift test`
- Xcode simulator tests for UIKit/SwiftUI products.
- SwiftFormat or SwiftLint verification.
- Compiler warnings treated as errors for SDK source.
- Coverage threshold at or above the SDK standard.
- Package manifest validation for all products.
- DocC documentation build.
- Clean-install smoke app installs staged package from a local git tag.
- Registry smoke app installs from the public GitHub tag after release.

---

## Release Readiness Checklist

- [ ] Universal Swift API implemented.
- [ ] Instance client and facade implemented.
- [ ] SwiftUI setup and screen breadcrumbs implemented.
- [ ] UIKit lifecycle and navigation breadcrumbs implemented.
- [ ] URLSession trace injection and request-event capture implemented.
- [ ] Offline queue survives app restart, respects bounds, file protection, and preserves original timestamps.
- [ ] Connectivity-aware deferred delivery works within iOS execution limits.
- [ ] Handled errors and async wrappers are covered by tests.
- [ ] Fatal crash evidence is either safely implemented with next-launch delivery or explicitly out of V1 release claims.
- [ ] SwiftLog and manual log capture are in-process and non-recursive.
- [ ] Duplicate suppression and loop protection match the universal contract.
- [ ] Capture policy is fetched, cached, and enforced locally with ingestion as backstop.
- [ ] Always-on probes, heavy probes, remote directives, and trigger tokens implemented.
- [ ] SDK failures never throw into host app code.
- [ ] Main-actor work is bounded and tested.
- [ ] Request/response bodies, view text, screenshots, location, clipboard, IDFV, advertising IDs, and keychain values are off by default.
- [ ] Trace headers are only added by explicit instrumentation and target allowlists.
- [ ] Swift package products include README, license, docs, and correct metadata.
- [ ] Release docs cover config precedence, support labels, install modes, service naming, safe startup/status semantics, and first-event verification.
- [ ] Public docs include SwiftUI, UIKit, URLSession, Alamofire if shipped, SwiftLog, offline queue, crash caveats, probes, and privacy examples.
- [ ] CI passes all supported Swift, Xcode, iOS, integration, and hardening lanes.
- [ ] Clean-install smoke passes from staged package tag.
- [ ] Published-package smoke passes from public GitHub tag.

---

## Release Decisions

- Swift V1 is a native iOS/iPadOS client SDK, not a server-side Swift SDK.
- Minimum deployment target is iOS 15 because current Xcode support lists iOS 15+ deployment and it balances installed-base reach with modern lifecycle/concurrency support.
- URLSession instrumentation must be explicit; global URLProtocol registration is not the default.
- SwiftLog is the first logging integration; OSLog/unified-log scraping is explicitly forbidden.
- Fatal crash capture must be next-launch and async-signal-safe. If that cannot be implemented safely, it must not be claimed for V1.
- macOS, watchOS, tvOS, visionOS, App Clips, and extensions are post-V1.
- Swift Package Manager is the primary distribution path. CocoaPods can be reconsidered later if customer demand justifies the maintenance burden.

---

## Open Decisions

- Whether fatal crash evidence ships in core or a separate `DebugBundleCrashReporter` product.
- Whether Alamofire support ships in V1 or immediately after URLSession.
- Whether jailbroken detection should remain opt-in forever for privacy and App Store policy clarity.
- Whether background delivery should use background URLSession only, `BGTaskScheduler`, or both.
- Whether Swift 5.9 source compatibility is worth preserving once Xcode 26.x becomes the dominant release lane.
- Whether release docs should recommend per-platform project tokens or a shared project token across Android and iOS apps.
