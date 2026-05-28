# Kotlin Android SDK Implementation Plan

Version: v1
Last updated: 2026-05-28

---

## Purpose

This plan defines the Kotlin Android SDK surface for DebugBundle. The goal is a production-ready Maven Central package family for native Android applications that satisfies the same universal SDK, capture-policy, probe, redaction, safety, event-shape, release, and testing contracts as the shipped major SDKs while respecting Android's lifecycle, storage, background-work, and app-distribution constraints.

This document covers the Android/mobile Kotlin surface. Kotlin server support for Ktor remains a separate server-SDK surface and must receive its own server-focused plan before implementation. Android SDK work must not be treated as a shortcut to Kotlin server parity.

The Kotlin Android SDK must satisfy `contracts/sdk-interface.md`, especially sections 1 through 12 and the mobile correlation contract in section 10.1, plus `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

---

## Coverage Posture

### Native Android Apps

Android is the V1 center of gravity. The SDK must support:

- `Application` lifecycle initialization.
- Activity and process lifecycle breadcrumbs.
- Jetpack Navigation and Navigation Compose breadcrumbs.
- OkHttp trace injection and request-event capture.
- Kotlin coroutine exception helpers.
- In-process logging through Timber and explicit SDK log APIs.
- Durable offline queueing across app restarts.
- Foreground and background flush scheduling.

### Mobile Cross-Boundary Incidents

Android events must use the same DebugBundle event pipeline as browser/client events. A mobile incident can include:

- a fatal crash or handled app error,
- app version and build metadata,
- device and OS context,
- recent screen and user-action breadcrumbs,
- outbound network request metadata,
- `X-DebugBundle-Trace-Id`,
- backend events captured by a server SDK using the same trace ID.

### Server Kotlin

Ktor, JVM server logging, browser relay handlers, local file transport, and server-side probe polling belong to the Kotlin server SDK, not this Android plan. Android may share schema, redaction, and transport design ideas with that future SDK, but the Android artifact must remain mobile-native.

---

## Scope

### V1 In Scope

- Android core SDK for manual capture and shared runtime behavior.
- Kotlin-idiomatic singleton facade plus injectable `DebugBundleClient`.
- Universal SDK interface with Kotlin camelCase naming.
- `Application.ActivityLifecycleCallbacks` screen breadcrumbs.
- `ProcessLifecycleOwner` app foreground/background breadcrumbs.
- Jetpack Navigation `OnDestinationChangedListener`.
- Navigation Compose helper.
- OkHttp `Interceptor` for trace injection and network breadcrumbs.
- Optional Ktor client plugin for Android clients using Ktor.
- Timber `Tree` integration.
- Coroutine exception helpers and `CoroutineExceptionHandler` integration.
- Uncaught exception handler for JVM/Kotlin fatal exceptions, with bounded next-launch delivery.
- ANR evidence capture through `ApplicationExitInfo` on API 30+ where available.
- Durable offline queue in app-private storage.
- WorkManager-backed retry and connectivity flush path.
- Direct connected transport to DebugBundle cloud or self-hosted ingestion.
- Session sampling, per-session caps, duplicate suppression, loop protection, retry/backoff, and `Retry-After` bounding.
- Mobile device context defined by the SDK contract.
- Always-on probes, remote probe directives through mobile-safe config fetch and ingestion-response piggybacking, and trigger-token support.
- Conservative privacy defaults suitable for consumer, healthcare, finance, and enterprise apps.

### V1 Out of Scope

- Ktor server SDK and browser relay handler parity.
- Kotlin Multiplatform shared Android/iOS SDK.
- React Native, Flutter, Unity, Xamarin, or MAUI wrappers.
- NDK/native crash unwinding and minidump capture.
- Automatic interception of every HTTP client in the app.
- Reading Logcat or device logs.
- Capturing request/response bodies by default.
- Capturing screenshots, view hierarchy text, form values, clipboard, contacts, precise location, advertising IDs, or keychain/keystore values.
- Play Integrity, SafetyNet, or device attestation.
- Push-notification, FCM, Room, Retrofit, GraphQL, SQL, Compose state, WebView JavaScript, or database auto-instrumentation.

---

## Artifacts

The Android SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-android
```

Publish Maven Central artifacts under the `com.debugbundle` group:

| Artifact | Purpose |
| --- | --- |
| `debugbundle-android-bom` | Gradle platform/BOM for version-aligned package family use. |
| `debugbundle-android-core` | Core client, event model, buffering, transport, redaction, probes, suppression, offline queue, manual API, and lifecycle primitives. |
| `debugbundle-android` | Recommended aggregate for standard Android apps: core, lifecycle hooks, WorkManager flush, and device context. |
| `debugbundle-android-okhttp` | OkHttp interceptor for trace injection and network breadcrumb/request-event capture. |
| `debugbundle-android-ktor-client` | Optional Ktor client plugin for Android apps using Ktor client. |
| `debugbundle-android-navigation` | Jetpack Navigation helpers. |
| `debugbundle-android-compose` | Navigation Compose and composable screen breadcrumb helpers. |
| `debugbundle-android-timber` | Timber `Tree` integration. |
| `debugbundle-android-testkit` | Test utilities, fake transport, fixture assertions, and queue inspection helpers. |

Suggested package roots:

| Package | Owner |
| --- | --- |
| `com.debugbundle.android` | Public facade, config, status, and client. |
| `com.debugbundle.android.transport` | HTTP transport, retry, and mobile config fetch. |
| `com.debugbundle.android.queue` | Durable queue, TTL, compaction, and WorkManager scheduling. |
| `com.debugbundle.android.redaction` | Android redaction implementation. |
| `com.debugbundle.android.probes` | Probe buffers, directives, and trigger tokens. |
| `com.debugbundle.android.lifecycle` | Application, Activity, and process lifecycle capture. |
| `com.debugbundle.android.network` | OkHttp and Ktor client integrations. |
| `com.debugbundle.android.navigation` | Jetpack Navigation and Compose helpers. |
| `com.debugbundle.android.logging` | Timber and manual log capture. |
| `com.debugbundle.android.crash` | Fatal exception and next-launch crash evidence. |

Repository tooling should use Gradle, Android Gradle Plugin, Kotlin, Detekt or ktlint, Android Lint, JUnit, Robolectric, instrumented Android tests, Gradle Maven Publish Plugin, signing, Dokka, binary compatibility validation, and a GitHub Actions release workflow.

Current toolchain snapshot for implementation planning only:

- Kotlin stable release line is 2.3.x, with 2.3.21 published on 2026-04-23.
- Kotlin 2.4.0 is scheduled for June-July 2026; refresh before implementation.
- Android Gradle Plugin 9.2.0 is current in the official release notes and supports API level 36.1 with JDK 17.
- Android 16 is the current stable platform release in the official Android update feed.

These external lanes are intentionally time-sensitive. Refresh them before repository scaffold, before beta, and before any public release.

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-04`: mobile client breadcrumbs analogous to browser breadcrumbs.
- `FR-SDK-05`: canonical event types, especially `frontend_exception`, `frontend_breadcrumb`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: duplicate suppression, loop protection, and sampling.
- `FR-SDK-16`: universal SDK interface with Kotlin camelCase naming.
- `FR-SDK-18`, `FR-SDK-19`: in-process log capture and log-level filtering.
- `FR-SDK-22` and `FR-SDK-32`: `X-DebugBundle-Trace-Id` correlation through native HTTP clients.
- `FR-SDK-33`: durable offline queueing and deferred delivery.
- `FR-SDK-34`: mobile device context.
- `FR-SDK-36`: Kotlin Android SDK delivery plan.
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
- `AC-SDK-18`: Android lifecycle and crash capture.
- `AC-SDK-20`: mobile privacy defaults.
- `AC-EVT-09` and `AC-EVT-09a`: local capture-policy enforcement.

---

## Public API

The SDK must expose a small Kotlin facade and an instance client.

Minimum setup:

```kotlin
class CheckoutApp : Application() {
    override fun onCreate() {
        super.onCreate()

        DebugBundle.init(
            application = this,
            config = DebugBundleConfig(
                projectToken = BuildConfig.DEBUGBUNDLE_TOKEN,
                service = "checkout-android",
                environment = BuildConfig.BUILD_TYPE,
                releaseChannel = BuildConfig.FLAVOR.ifBlank { "production" }
            )
        )
    }
}
```

Minimum universal facade:

```kotlin
DebugBundle.captureException(error, mapOf("screen" to "Checkout"))
DebugBundle.captureError(error)
DebugBundle.captureLog("payment retry failed", DebugBundleLogLevel.Warning, mapOf("attempt" to attempt))
DebugBundle.captureRequest(request = requestInfo, response = responseInfo)
DebugBundle.captureMessage("checkout started")
DebugBundle.setContext("account_id", accountId)
DebugBundle.probe("checkout.cart", mapOf("items" to itemCount))
DebugBundle.probe("checkout.tax", options = ProbeOptions(heavy = true)) { expensiveTaxState() }
DebugBundle.flush()
val status = DebugBundle.status
val lastEventAt = DebugBundle.lastEventAt
```

Instance API:

```kotlin
val client = DebugBundleClient.create(
    application = application,
    config = DebugBundleConfig(
        projectToken = token,
        service = "checkout-android"
    )
)

client.captureException(error)
client.probe("cart.state") { cartSnapshot() }
client.flush(timeout = 5.seconds)
```

OkHttp setup:

```kotlin
val httpClient = OkHttpClient.Builder()
    .addInterceptor(DebugBundleOkHttpInterceptor())
    .build()
```

Navigation setup:

```kotlin
navController.addOnDestinationChangedListener(DebugBundleNavigationListener())
```

Timber setup:

```kotlin
Timber.plant(DebugBundleTimberTree())
```

All public APIs must be no-throw by default. Explicit helper wrappers may rethrow application exceptions after capture when documented.

---

## Runtime Compatibility

- Minimum Android compatibility: API 23.
- Recommended production target: current Google Play supported target SDK at release time.
- Recommended build lane at plan date: latest stable Android Gradle Plugin and Kotlin stable release line.
- Current planning lane: Kotlin 2.3.21, AGP 9.2.0, JDK 17, compile SDK/API 36.1.
- Installed-base compatibility lanes: API 23, 26, 30, 33, 35, and current stable platform/API.
- API 30+ lane required for `ApplicationExitInfo` ANR/crash evidence.
- JVM bytecode target should remain broadly compatible with current Android toolchains and avoid desugaring-heavy APIs unless release CI proves compatibility.
- Core SDK must avoid reflection-heavy or annotation-processor-heavy designs.
- Optional integrations must not force OkHttp, Ktor client, Timber, Navigation, Compose, or WorkManager dependencies onto core-only consumers.

Release preparation must refresh Kotlin, AGP, Gradle, Android Studio, compile SDK, target SDK, min SDK, AndroidX Lifecycle, WorkManager, Navigation, Compose, OkHttp, Ktor client, Timber, Robolectric, and emulator/device lanes.

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
| `environment` | Build type or auto-detect | Runtime environment name. |
| `service` | App package name | Service name. |
| `endpoint` | `https://api.debugbundle.com/v1/events` | Cloud or self-host ingestion endpoint. |
| `releaseChannel` | `production` | Mobile release channel, e.g. internal, beta, production. |
| `appVersion` | Android package versionName | App version override. |
| `buildNumber` | Android package versionCode | Build number override. |
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
| `logLevel` | `Warning` | Minimum captured log level. |
| `tracePropagationTargets` | `[]` | Required allowlist for adding trace headers beyond explicitly instrumented first-party clients. |
| `offlineQueueMaxEvents` | `500` | Max persisted offline events. |
| `offlineQueueMaxBytes` | `5 MB` | Max persisted queue bytes. |
| `offlineQueueTtl` | `72 hours` | Drop stale queued events on delivery attempt. |
| `requestTimeout` | `5 seconds` | HTTP transport timeout. |
| `maxProbeLabels` | `50` | Distinct probe labels retained. |
| `maxProbeEntriesPerLabel` | `10` | Entries retained per label. |
| `probeFlushOnError` | `true` | Attach probe buffers to captured errors. |

Configuration sources must include:

- Programmatic `DebugBundleConfig`.
- Android manifest placeholders or resources only for non-secret static values.
- Gradle `BuildConfig` fields for token, service, environment, version, and channel examples.
- Dependency-injected configuration for larger apps.

Configuration precedence is: explicit programmatic `DebugBundleConfig`, dependency-injected runtime config, Gradle/manifest-provided values, auto-detection, then SDK defaults. Server-owned capture policy and capture rules are more restrictive than local config when they conflict.

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config` and use ingestion enforcement as the authoritative backstop.

Service naming guidance: Android apps should use a platform-specific service name such as `checkout-android`, not the backend service name. If Android and iOS share one DebugBundle project, use distinct service names (`checkout-android`, `checkout-ios`) so bundles can separate client surfaces while still correlating through trace IDs.

Safe startup behavior: when `enabled` is true but no usable project token or endpoint is configured, the SDK must become a no-op or degraded client, expose that state through `status`, and never report healthy connected capture.

---

## Setup and Deployment Modes

### Standard Android App

The recommended setup is explicit `Application.onCreate()` initialization plus optional integrations for the app's real runtime:

```kotlin
DebugBundle.init(this, DebugBundleConfig(projectToken = token))
registerActivityLifecycleCallbacks(DebugBundleActivityLifecycleCallbacks())
```

The aggregate `debugbundle-android` package may register lifecycle helpers when `DebugBundle.init()` is called, but importing the dependency must have no side effects.

### OkHttp Apps

OkHttp interceptor is the required trace-correlation path. It must:

- inject one UUID v4 `X-DebugBundle-Trace-Id` per outgoing first-party request,
- store request metadata as a network breadcrumb,
- emit standalone `request_event` for capture-policy-qualified request failures,
- preserve existing caller headers unless the caller already set `X-DebugBundle-Trace-Id`.

### Background Flush

Foreground apps flush on batch size, interval, lifecycle background, and explicit `flush()`. WorkManager handles deferred queue delivery when the app is backgrounded or connectivity returns. WorkManager jobs must be bounded, network-aware, battery-aware, and no-throw.

### Local Development

Android has no server-style `.debugbundle/local/events` file transport. Local development should use an endpoint override to a local mock/staging ingestion endpoint reachable from emulator or device. The testkit must include a mock ingestion server and queue inspection helpers for local verification.

### Zero-Install Fallback

When installing the SDK is blocked, Android apps may emit canonical `debugbundle-ndjson` through existing app-owned export/debug channels and ingest it manually. This is not full SDK parity because it lacks automatic trace injection, offline queueing, capture policy, probes, and lifecycle breadcrumbs.

---

## Android Lifecycle, Crash, and Error Capture

The SDK must capture:

- handled `Throwable` values passed to `captureException`,
- uncaught JVM/Kotlin exceptions through a chained `Thread.UncaughtExceptionHandler`,
- coroutine errors through `CoroutineExceptionHandler` helpers,
- Activity foreground/background and screen changes,
- app foreground/background transitions,
- process death evidence from `ApplicationExitInfo` on API 30+,
- ANR evidence where `ApplicationExitInfo.REASON_ANR` is available on next launch.

Fatal crash handling must persist only a minimal bounded crash envelope synchronously and let the previous handler continue. It must not attempt network calls, redaction traversal of large objects, coroutine dispatch, or arbitrary allocations in the crashing path. Upload happens on next launch.

The SDK must preserve host behavior. It must not swallow fatal exceptions, change Android's crash dialog behavior, prevent ANR reporting, or change WorkManager retry semantics.

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
- sanitized view resource name or `accessibilityIdentifier` equivalent when configured,
- network method, host, path template, status, and duration,
- app foreground/background.

Disallowed by default:

- text content,
- form field names or values,
- screenshots,
- full view hierarchy,
- precise coordinates unless explicitly enabled and rounded,
- clipboard, contacts, SMS, call logs, photos, location, advertising ID.

---

## Logging Integrations

V1 must support:

- `DebugBundle.captureLog(...)` manual logging.
- Timber `Tree` integration.
- Optional coroutine/context metadata from app-provided context.

Logging integration must:

- capture structured `log_event` records in process,
- never read Logcat,
- respect `logLevel` and capture policy,
- include logger/tag, level, message, throwable summary, timestamp, thread name, coroutine name when available, and sanitized context,
- avoid recursive SDK logging capture,
- avoid blocking the main thread or log callback path.

Direct `android.util.Log` global interception is out of scope because Android does not provide a safe process-wide hook.

---

## Privacy Defaults

Android defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Do not capture view text, screenshots, form values, location, contacts, clipboard, Android ID, advertising ID, account names, phone number, or installed app lists.
- Treat project tokens as write-only but extractable from the mobile binary.
- Use app-private storage for queue files.
- Redact sensitive data before queue persistence and transport.
- Collect rooted/jailbroken status as `null` unless the developer explicitly enables coarse device-integrity collection.

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

The Android SDK must implement:

- HTTP transport for connected ingestion.
- Durable offline queue in app-private storage.
- Queue writes that are atomic and crash-safe.
- Queue limits by event count and bytes.
- TTL eviction for events older than 72 hours.
- Retry and backoff for `429` and transient `5xx`.
- `Retry-After` handling capped at 5 minutes.
- Drop behavior for non-429 `4xx` after recording an internal diagnostic.
- Foreground flush on batch size and interval.
- Background flush through WorkManager when available.
- Connectivity-aware deferred delivery.

Queue persistence must happen after redaction. Queued events must keep their original `occurred_at` capture timestamp and may add local queue metadata that is not sent as trusted event data.

Transport failures must never throw into app code. Main-thread work must be bounded to cheap enqueue operations; serialization, compression, queue compaction, and network transport run off the main thread.

---

## Capture Policy and Probes

The Android SDK must use mobile-safe config behavior:

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
- Lazy probe callback support for Kotlin.
- `heavy = true` probes dormant until matching activation.
- Remote activation when config/piggyback directives are available.
- Trigger token extraction from deep-link query parameter `_debug_probe` and request header `X-DebugBundle-Probe-Trigger`.
- Trigger tokens apply only to the current app session or instrumented request, not permanently.
- Probe events respect session sampling and queue limits, except error-attached probe data remains attached to the error path.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

Android events must include:

- `sdk_name`: `@debugbundle/sdk-android`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `correlation.trace_id` when an instrumented request created or observed it
- sanitized payload
- mobile device context
- app version, build number, and release channel

Mobile client failures use `frontend_exception`. Mobile breadcrumbs use `frontend_breadcrumb`. Network failures use `request_event` when capture policy allows or promotes them. Logs use `log_event`. The SDK must not introduce Android-only event types and must not assign `event_class`; classification remains worker-owned.

Device context may include OS name/version, API level, device manufacturer, model, form factor, screen resolution, locale, timezone, network connection type, battery level/charging when available, free disk bytes when available, free memory bytes when available, app version, build number, release channel, and nullable rooted/jailbroken status.

---

## Implementation Slices

1. Repository scaffold and release wiring
   - Create `debugbundle-android` with Gradle modules, governance files, CI, signing, Maven Central release workflow, Dokka, binary compatibility checks, and examples.

2. Core client and event model
   - Config, facade, instance client, event envelope builder, buffer, status, last event timestamp, mockable transport, and HTTP transport.

3. Redaction and privacy
   - Default sensitive fields, Android object serialization limits, header allowlist, no body capture defaults, and privacy tests.

4. Offline queue and transport
   - App-private queue, atomic writes, TTL/size eviction, retry/backoff, WorkManager flush, connectivity handling, and no-throw guarantees.

5. Suppression and sampling
   - Duplicate suppression, loop protection, session sampling, per-session caps, and failure injection tests.

6. Lifecycle and device context
   - Application, Activity, ProcessLifecycleOwner, screen breadcrumbs, app/device snapshot, and low-risk battery/storage/network metadata.

7. Crash and ANR evidence
   - Chained uncaught exception handler, next-launch crash upload, API 30+ `ApplicationExitInfo`, and fatal-path safety tests.

8. Network integrations
   - OkHttp interceptor first, then optional Ktor client plugin, trace propagation targets, network breadcrumbs, and request-event promotion.

9. Navigation and Compose
   - Jetpack Navigation listener, Navigation Compose helpers, route naming guidance, and breadcrumb tests.

10. Logging integrations
    - Manual log API, Timber tree, recursion guard, structured context, and log-level/capture-policy enforcement.

11. Capture policy and probes
    - Config fetch, ETag caching, mobile-safe refresh, capture-rule enforcement subset, probe buffers, remote directives, and trigger tokens.

12. Documentation and examples
    - Application setup, OkHttp, Navigation, Compose, Timber, offline queue, privacy, probes, first-event verification, and staged artifact smoke apps.

---

## Testing Plan

The Android SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for every universal method.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for headers, nested objects, circular references, oversized payloads, tokens, cookies, and phone/card/OTP fields.
- Duplicate suppression and loop protection tests.
- Retry/backoff tests using a fake transport or mock web server.
- Offline queue atomicity, TTL, capacity, corruption recovery, and app-restart tests.
- WorkManager scheduling and connectivity flush tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger-token tests.
- Activity/process lifecycle tests with Robolectric.
- Instrumented tests for lifecycle, queue durability, and file-storage permissions.
- OkHttp interceptor tests for trace injection, target allowlist, request metadata, and failure promotion.
- Ktor client plugin tests if shipped in V1.
- Navigation and Compose breadcrumb tests.
- Timber integration tests.
- Uncaught exception handler tests in isolated process fixtures.
- `ApplicationExitInfo` tests on API 30+ emulator/device lanes where stable.
- Concurrency tests for parallel log, request, probe, queue, and flush paths.
- Privacy snapshot tests proving no body/text/screenshot/location/device identifiers are captured by default.

CI matrix:

```text
Kotlin latest stable core unit lane
Kotlin previous stable compatibility lane
AGP latest stable lane
Android API 23 Robolectric/instrumented compatibility lane
Android API 26 installed-base lane
Android API 30 ApplicationExitInfo lane
Android API 33 modern compatibility lane
Android current stable emulator/device lane
OkHttp current stable lane
Ktor client current stable lane if shipped
Navigation current stable lane
Compose current stable lane
WorkManager current stable lane
```

Quality gates:

- Gradle wrapper validation.
- `./gradlew lint`.
- `./gradlew detekt` or `./gradlew ktlintCheck`.
- `./gradlew test`.
- `./gradlew connectedCheck` for release candidates.
- Android Lint warnings treated as errors for SDK source.
- Coverage threshold at or above the SDK standard.
- `./gradlew publishToMavenLocal` validates publishable artifacts.
- Maven POM metadata, license, sources, Dokka docs, signatures, and version alignment validated.
- Clean-install smoke app installs staged artifacts via Maven local.
- Registry smoke app installs from Maven Central after publish.

---

## Release Readiness Checklist

- [ ] Universal Kotlin API implemented.
- [ ] Instance client and facade implemented.
- [ ] Android lifecycle breadcrumbs implemented.
- [ ] Navigation and Compose breadcrumbs covered by tests.
- [ ] OkHttp trace injection and request-event capture implemented.
- [ ] Offline queue survives app restart, respects bounds, and preserves original timestamps.
- [ ] WorkManager deferred delivery works on connectivity restoration.
- [ ] Fatal exception next-launch delivery implemented without changing crash behavior.
- [ ] API 30+ ANR/process-exit evidence captured where available.
- [ ] Timber and manual log capture are in-process and non-recursive.
- [ ] Duplicate suppression and loop protection match the universal contract.
- [ ] Capture policy is fetched, cached, and enforced locally with ingestion as backstop.
- [ ] Always-on probes, heavy probes, remote directives, and trigger tokens implemented.
- [ ] SDK failures never throw into host app code.
- [ ] Main-thread work is bounded and tested.
- [ ] Request/response bodies, view text, screenshots, location, clipboard, and advertising IDs are off by default.
- [ ] Trace headers are only added by explicit instrumentation and target allowlists.
- [ ] Maven artifacts include README, license, sources, docs, signatures, and correct metadata.
- [ ] Release docs cover config precedence, support labels, install modes, service naming, safe startup/status semantics, and first-event verification.
- [ ] Public docs include Android setup, OkHttp, Ktor client if shipped, Navigation, Compose, Timber, offline queue, crash/ANR caveats, probes, and privacy examples.
- [ ] CI passes all supported Android, Kotlin, AGP, integration, and hardening lanes.
- [ ] Clean-install smoke passes from staged Maven artifacts.
- [ ] Published-package smoke passes from Maven Central.

---

## Release Decisions

- Android V1 is a native mobile/client SDK, not a Kotlin server SDK.
- Minimum Android compatibility is API 23; current stable Android and AGP lanes must be refreshed before implementation and release.
- OkHttp is the required V1 network correlation integration because it is the dominant Android HTTP layer and provides a safe explicit interception point.
- WorkManager is the required production deferred-delivery path because mobile offline queueing must survive app restarts and connectivity gaps.
- Timber is the first logging integration; Logcat scraping is explicitly forbidden.
- Native NDK crash capture is post-V1 unless a safe separate module is approved.
- Kotlin Multiplatform should not block native Android V1. KMP may become a later sharing strategy after native Android and Swift semantics are proven.

---

## Open Decisions

- Whether `debugbundle-android` should aggregate WorkManager by default or require explicit `debugbundle-android-workmanager`.
- Whether Ktor client support ships in V1 or immediately after OkHttp.
- Whether rooted/jailbroken detection should remain opt-in forever for privacy and app-store policy clarity.
- Whether mobile config refresh should use only foreground/init/piggyback or include a very low-frequency background refresh through WorkManager.
- Whether to define a first-class mobile deep-link helper for probe trigger tokens.
- Whether release docs should recommend per-platform project tokens or a shared project token across Android and iOS apps.
