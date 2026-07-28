# React Native SDK Implementation Plan

Version: v1
Last updated: 2026-07-27

---

## Purpose

This plan defines the React Native SDK surface for DebugBundle. The goal is a production-ready npm package for iOS and Android React Native applications that satisfies the same universal SDK, capture-policy, probe, redaction, safety, event-shape, release, and testing contracts as the major SDKs while respecting React Native's JavaScript runtime, native module architectures, app lifecycle, mobile offline behavior, and native build constraints.

React Native is a client/mobile SDK, not a server SDK and not a browser relay handler. It must correlate React Native client failures with backend SDK events through `X-DebugBundle-Trace-Id`, preserve mobile privacy defaults, and use native persistence/background mechanisms for reliable delivery on both iOS and Android. Browser relay features such as `transportMode`, `allowedOrigins`, CORS preflight, and `/debugbundle/browser` route handling belong to browser plus server SDK surfaces, not React Native.

The React Native SDK must satisfy `contracts/sdk-interface.md`, especially sections 1 through 12 and the mobile correlation contract in section 10.1, plus `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

Current status: `@debugbundle/sdk-react-native@1.1.0` and the Android/Swift native `1.1.0` foundations are published. A coordinated `1.2.0` source line contains the production-safety remediation: canonical RN event preservation, truthful native capture-policy/probe/config composition, per-event acknowledgements, universal `beforeSend`, frozen installs, per-file TypeScript and native-wrapper coverage, Android bridge lanes for React Native `0.76.9`, `0.82.1`, and `0.85.3`, bare Android/iOS clean apps, Expo SDK 57 / React Native 0.86 development builds, and iOS JS-to-native-to-ingestion runtime delivery. Publication remains blocked until Android and Swift `1.2.0` are registry-visible and the RN release workflow's clean published-native Android/iOS jobs pass. Hosted green evidence for the full runtime/Expo matrix is still pending.

---

## Coverage Posture

### React Native Mobile Apps

React Native iOS and Android are the V1 center of gravity. The SDK must support:

- TypeScript-first public API with JavaScript compatibility.
- React Native New Architecture through a Turbo Native Module.
- Legacy bridge compatibility for installed-base applications until explicitly dropped.
- Hermes as the primary JS engine, with JSC compatibility where supported by React Native.
- React Navigation breadcrumbs.
- Expo development builds and prebuild workflows through a config plugin.
- JS error, promise rejection, React error boundary, lifecycle, navigation, log, request, and probe capture.
- Native iOS and Android device context, crash evidence, offline queueing, deferred delivery, capture policy, and remote probes through the existing native SDK foundations.

### Two Large Mobile Platforms

V1 must treat Android and iOS as first-class, tested targets. A React Native release is not ready if either platform lacks:

- native module initialization,
- durable offline queueing,
- trace propagation for first-party requests,
- mobile device context,
- app foreground/background handling,
- native fatal-crash evidence strategy,
- capture policy and probe refresh behavior,
- clean-install smoke coverage.

### Native SDK Reuse

The React Native SDK should wrap and reuse the standalone native SDKs rather than reimplementing mobile primitives:

- Android uses `github.com/debugbundle/debugbundle-android` modules for core client, queue, transport, lifecycle, crash/ANR replay, device context, capture policy, and remote probes.
- iOS uses `github.com/debugbundle/debugbundle-swift` products for core client, queue, transport, UIKit/SwiftUI lifecycle helpers where applicable, URLSession instrumentation concepts, SwiftLog where useful, crash evidence, capture policy, and remote probes.

React Native-specific code owns the JS API, React integration, bridge lifecycle, fetch/XMLHttpRequest wrapping, React Navigation helpers, Expo config plugin, and native wrapper glue. It must not fork native queue, redaction, transport, probe, or capture-policy logic unless a platform gap is explicitly documented and tested.

---

## Scope

### V1 In Scope

- `@debugbundle/sdk-react-native` npm package with TypeScript declarations and JS runtime.
- React Native Turbo Native Module implemented for Android and iOS.
- Legacy bridge module compatibility for React Native versions that still need it.
- Universal SDK interface with camelCase naming.
- Singleton facade plus instance client.
- React error boundary helpers and explicit capture APIs.
- JS global error handling through React Native-supported hooks while preserving host behavior.
- Unhandled promise rejection capture where the active RN runtime exposes a safe hook.
- React Navigation listener/helper APIs.
- Expo Router breadcrumbs where they can be implemented without depending on Expo at runtime.
- App foreground/background breadcrumbs through React Native `AppState` plus native lifecycle fallback.
- Network capture through `fetch` and `XMLHttpRequest` wrapping.
- `X-DebugBundle-Trace-Id` injection only for same-origin-equivalent or configured first-party targets.
- Optional Axios helper if it remains a thin wrapper over the same network-capture core.
- Console/log capture as opt-in, plus manual `captureLog`.
- Durable native offline queue across app restarts.
- Direct connected transport to DebugBundle cloud or self-hosted ingestion.
- No browser relay transport mode. React Native sends mobile events through direct connected ingestion using the write-only project token model; platform networking is not subject to browser CORS preflight.
- Mobile-safe config refresh, capture-policy enforcement, always-on probes, remote probe directives, and trigger-token support.
- Native crash evidence on Android through the Android SDK path and on iOS through the Swift SDK path when safe.
- Conservative mobile privacy defaults.
- Example bare React Native app and Expo development-build app.
- Clean-install smoke for staged npm package plus native autolinking.

### V1 Out of Scope

- React Native Web.
- Windows, macOS, tvOS, visionOS, watchOS, Quest, and other non-iOS/non-Android RN targets.
- Expo Go full parity, because Expo Go cannot load arbitrary custom native modules. The SDK may expose a degraded JS-only no-op/test mode, but release docs must state that production parity requires a development build or prebuilt native project.
- Browser relay handlers, browser relay CORS/preflight options, `transportMode`, `allowedOrigins`, and `.debugbundle/local/events` file transport.
- Arbitrary interception of every native HTTP client used by third-party native SDKs.
- Native UI component/Fabric components. The SDK has no UI surface.
- JSI/C++ custom runtime unless a measured performance or lifecycle need appears.
- Reading native device logs, Logcat, OSLog, or unified logs.
- Capturing request/response bodies by default.
- Capturing screenshots, raw view hierarchy, text content, form values, clipboard, contacts, photos, precise location, advertising identifiers, keychain/keystore values, or installed-app lists.
- Deep integrations for Apollo, Relay, TanStack Query, Redux, Zustand, Reanimated, GraphQL clients, SQLite, Realm, MMKV, WatermelonDB, Firebase, or push notifications.
- Source-map upload or symbolication pipeline. The SDK may include release/build metadata needed by future symbolication.

---

## Artifacts

The React Native SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-react-native
```

Publish the npm package:

| Artifact | Purpose |
| --- | --- |
| `@debugbundle/sdk-react-native` | TypeScript/JavaScript API, React helpers, React Navigation helpers, fetch/XHR instrumentation, native module wrappers, Expo config plugin, and package docs. |

Package contents:

| Path | Purpose |
| --- | --- |
| `src/` | TypeScript source for public API, event builders, JS buffering before native readiness, network wrappers, navigation helpers, React helpers, and test utilities. |
| `android/` | Java native module wrapper and Gradle integration with `debugbundle-android` artifacts. The wrapper intentionally avoids Kotlin source so host RN apps do not need to compile the bridge against newer Android SDK Kotlin metadata. |
| `ios/` | Swift/Objective-C++ native module wrapper and CocoaPods integration with `DebugBundle` Swift products. |
| `plugin/` or `app.plugin.js` | Expo config plugin for prebuild/development-build configuration. |
| `example/` | Bare React Native example app. |
| `example-expo/` | Expo development-build example app. |
| `smoke/` | Clean-install smoke applications for npm tarball and registry validation. |

Suggested JS module roots:

| Module | Owner |
| --- | --- |
| `index.ts` | Public facade exports. |
| `client.ts` | Instance client and singleton state. |
| `native.ts` | TurboModule/legacy bridge resolution and native readiness. |
| `network.ts` | fetch/XMLHttpRequest wrapping, trace IDs, network breadcrumbs, request-event promotion. |
| `navigation.tsx` | React Navigation and route breadcrumb helpers. |
| `react.tsx` | Error boundary, hook, and provider helpers. |
| `app-state.ts` | AppState lifecycle breadcrumbs and foreground flush triggers. |
| `console.ts` | Optional console capture with recursion guards. |
| `redaction.ts` | JS-side redaction before native queue calls for JS-originated payloads. |
| `probes.ts` | JS probe facade, lazy/heavy semantics, trigger-token helpers. |
| `types.ts` | Public config, event, status, and helper types. |
| `testing.ts` | Jest helpers and native mock module. |

Suggested native wrapper roots:

| Platform | Package/module | Owner |
| --- | --- | --- |
| Android | `com.debugbundle.reactnative` | React Native module, package registration, config conversion, and calls into `com.debugbundle.android`. |
| iOS | `DebugBundleReactNative` | React Native module, config conversion, bridge lifecycle, and calls into `DebugBundle`. |

Repository tooling should use TypeScript, React Native library build tooling, ESLint, Prettier, Jest, React Native test utilities, Gradle, Kotlin, Android Lint, XCTest or Swift Testing, CocoaPods lint where applicable, package tarball validation, and GitHub Actions release workflow.

Current planning snapshot:

- React Native's official versions page shows recent active release lines changing quickly; refresh the minimum, recommended, and CI lanes immediately before scaffold, beta, and public release.
- The New Architecture is the forward path for native modules. The SDK should implement TurboModule first and keep a legacy bridge wrapper only for compatibility.
- React Native releases on a frequent cadence; release docs must label old RN lanes as compatibility support, not recommended production posture.

These external lanes are intentionally time-sensitive.

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-04`: mobile client breadcrumbs analogous to browser breadcrumbs.
- `FR-SDK-05`: canonical event types, especially `frontend_exception`, `frontend_breadcrumb`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: duplicate suppression, loop protection, and sampling.
- `FR-SDK-16`: universal SDK interface with camelCase naming.
- `FR-SDK-18`, `FR-SDK-19`: in-process log capture and log-level filtering.
- `FR-SDK-22` and `FR-SDK-32`: `X-DebugBundle-Trace-Id` correlation through React Native network instrumentation.
- `FR-SDK-33`: durable offline queueing and deferred delivery.
- `FR-SDK-34`: mobile device context.
- `FR-SDK-38`: React Native SDK delivery plan.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `FR-EVT-07`, `FR-EVT-07a`, `FR-EVT-08`, `FR-EVT-08a`, and `FR-EVT-08d`: server-owned capture policy, capture rules, request-failure promotion, and ingestion backstop enforcement.
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
- `AC-SDK-18`: Android lifecycle and crash capture for the Android half.
- `AC-SDK-19`: iOS lifecycle and crash capture for the iOS half.
- `AC-SDK-20`: mobile privacy defaults.
- `AC-SDK-21`: React Native iOS and Android parity.
- `AC-EVT-09` and `AC-EVT-09a`: local capture-policy enforcement and request-failure promotion.

---

## Public API

The SDK must expose a small TypeScript facade and an instance client.

Minimum setup:

```ts
import { DebugBundle } from "@debugbundle/sdk-react-native";

DebugBundle.init({
  projectToken: process.env.EXPO_PUBLIC_DEBUGBUNDLE_TOKEN,
  service: "checkout-mobile",
  environment: __DEV__ ? "development" : "production",
  releaseChannel: "app-store",
  tracePropagationTargets: ["https://api.example.com"],
});
```

Minimum universal facade:

```ts
DebugBundle.captureException(error, { screen: "Checkout" });
DebugBundle.captureError(error);
DebugBundle.captureLog("payment retry failed", "warning", { attempt });
DebugBundle.captureRequest(requestInfo, responseInfo);
DebugBundle.captureMessage("checkout started");
DebugBundle.setContext("account_id", accountId);
DebugBundle.probe("checkout.cart", { items: itemCount });
DebugBundle.probe("checkout.tax", () => expensiveTaxState(), { heavy: true });
await DebugBundle.flush();
const status = DebugBundle.status;
const lastEventAt = DebugBundle.lastEventAt;
```

Instance API:

```ts
import { createDebugBundleClient } from "@debugbundle/sdk-react-native";

const client = createDebugBundleClient({
  projectToken,
  service: "checkout-mobile",
  tracePropagationTargets: ["https://api.example.com"],
});

client.captureException(error);
client.probe("cart.state", () => cartSnapshot());
await client.flush();
```

React setup:

```tsx
import { DebugBundleErrorBoundary } from "@debugbundle/sdk-react-native/react";

export function App() {
  return (
    <DebugBundleErrorBoundary>
      <CheckoutRoot />
    </DebugBundleErrorBoundary>
  );
}
```

React Navigation setup:

```tsx
import { NavigationContainer } from "@react-navigation/native";
import {
  createDebugBundleNavigationRef,
  onDebugBundleNavigationReady,
  onDebugBundleNavigationStateChange,
} from "@debugbundle/sdk-react-native/navigation";

export const navigationRef = createDebugBundleNavigationRef();

export function AppNavigation() {
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => onDebugBundleNavigationReady(navigationRef)}
      onStateChange={() => onDebugBundleNavigationStateChange(navigationRef)}
    >
      {/* navigators */}
    </NavigationContainer>
  );
}
```

Network setup:

```ts
import { instrumentDebugBundleNetwork } from "@debugbundle/sdk-react-native/network";

instrumentDebugBundleNetwork({
  tracePropagationTargets: ["https://api.example.com"],
  captureNetwork: true,
});
```

The default `init()` path may install network, AppState, global error, and promise hooks when enabled in config. Importing the package must have no side effects.

All public APIs must be no-throw by default. Helpers that wrap application operations may rethrow application errors after capture only when documented.

---

## Runtime Compatibility

- Minimum React Native compatibility: React Native 0.76+ for installed-base compatibility.
- Recommended production React Native version: current stable React Native 0.86.x.
- React versions: `>=18.2 <20`, matching the claimed React Native `0.76+` through current-stable lanes.
- JavaScript engines: Hermes is the primary tested JS engine; JSC compatibility is best-effort where the claimed React Native lane supports it.
- Android: inherit native SDK minimum API 23 and require the coordinated `com.debugbundle:debugbundle-android-bom:1.2.0` dependency for the remediated source line.
- iOS: inherit native SDK minimum iOS 15 and require CocoaPods `DebugBundle ~> 1.2` for the remediated source line.
- New Architecture: TurboModule is required and must be tested.
- Legacy Architecture: bridge adapter is required for V1 compatibility, but docs should state that new applications should use the New Architecture when supported by their RN version.
- Expo: development builds and prebuild are supported; Expo Go is not full parity.
- TypeScript: ship type declarations and test the current supported TypeScript line plus the previous stable line where practical.
- Package managers: npm, pnpm, and Yarn must install cleanly. Yarn Plug'n'Play support is best-effort unless release CI proves it.

Compatibility lanes must be refreshed before repository scaffold, before beta, and before every public release.

---

## Configuration

Required:

| Option | Description |
| --- | --- |
| `projectToken` | Write-only project token for connected mobile ingestion. Treat as extractable from the mobile binary and JS bundle, not as a secret boundary. |

Important optional options:

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Kill switch. |
| `environment` | auto-detect | Runtime environment name. |
| `service` | app bundle/package name | Service name. Prefer one shared RN service or per-platform names by product convention. |
| `endpoint` | `https://api.debugbundle.com/v1/events` | Cloud or self-host ingestion endpoint. |
| `transportMode` | — | Not supported. React Native is a mobile direct-ingestion SDK; browser relay mode belongs to `@debugbundle/sdk-browser` plus a backend relay handler. |
| `releaseChannel` | platform channel | Mobile release channel, e.g. internal, testflight, app-store, play, production. |
| `appVersion` | native app version | App version override. |
| `buildNumber` | native build number | Build number override. |
| `batchSize` | `10` | Max events per batch. |
| `flushInterval` | `3 seconds` | Max delay before foreground flush. |
| `sampleRate` | `1.0` | Per-event sampling. |
| `sessionSampleRate` | `1.0` | Per-app-session sampling. |
| `maxEventsPerSession` | `100` | Cap for non-exception mobile events. |
| `maxBreadcrumbs` | `20` | Screen/action/network breadcrumb ring size. |
| `captureErrors` | `true` | Capture JS global errors and React error-boundary errors. |
| `captureUnhandledRejections` | `true` where supported | Capture unhandled promise rejections when safe hooks exist. |
| `captureScreens` | `true` | Capture screen transition breadcrumbs when navigation helpers are installed. |
| `captureActions` | `false` | Capture coarse user action breadcrumbs. |
| `captureNetwork` | `true` | Capture instrumented fetch/XHR network summaries. |
| `captureConsole` | `false` | Wrap console warning/error calls when explicitly enabled. |
| `captureLogs` | `true` | Capture explicit SDK log API output. |
| `logLevel` | `"warning"` | Minimum captured log level. |
| `tracePropagationTargets` | `[]` | Required allowlist for adding trace headers to cross-origin/non-relative first-party URLs. |
| `networkFilter` | `{}` | String-pattern allow/deny filters, status-code filter, and minimum duration. No user-provided regex execution. |
| `offlineQueueMaxEvents` | `500` | Max persisted offline events. |
| `offlineQueueMaxBytes` | `5 MB` | Max persisted queue bytes. |
| `offlineQueueTtl` | `72 hours` | Drop stale queued events on delivery attempt. |
| `requestTimeout` | `5 seconds` | HTTP transport timeout. |
| `maxProbeLabels` | `50` | Distinct probe labels retained. |
| `maxProbeEntriesPerLabel` | `10` | Entries retained per label. |
| `probeFlushOnError` | `true` | Attach probe buffers to captured errors. |

Configuration sources must include:

- Programmatic `DebugBundle.init()` / `createDebugBundleClient()`.
- Native build configuration for Android Gradle and iOS build settings.
- Expo config plugin options for development builds and prebuild.
- Environment-variable examples for bundlers, with warnings that public mobile env vars are not secret.

Configuration precedence is: explicit programmatic config, dependency-injected/runtime config, Expo/native build config, auto-detection, then SDK defaults. Server-owned capture policy and capture rules are more restrictive than local config when they conflict.

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config` and use ingestion enforcement as the authoritative backstop.

Service naming guidance: React Native apps may use one cross-platform service name such as `checkout-mobile` when product owners want a combined mobile incident surface, or platform-specific service names (`checkout-ios`, `checkout-android`) when they want platform separation. Do not reuse the backend service name. Trace IDs still correlate mobile events with backend events across services.

Safe startup behavior: when `enabled` is true but no usable native module, project token, or endpoint is configured, the SDK must become a no-op or degraded client, expose that state through `status`, emit at most bounded internal diagnostics, and never report healthy connected capture.

Relay/CORS guidance: do not add `allowedOrigins`, CORS preflight handlers, or `/debugbundle/browser` route helpers to the React Native SDK. Split mobile/frontend/backend deployments should configure `tracePropagationTargets` for first-party API correlation and use the mobile direct ingestion endpoint. If a future React Native Web package is considered, it must compose the Browser SDK relay contract instead of extending this mobile SDK with browser relay behavior.

---

## React Native Architecture

### Native Module Strategy

The SDK must implement a Turbo Native Module as the primary bridge. The TurboModule owns:

- native SDK initialization,
- native queue persistence,
- native flush,
- native status and last-event state,
- native device context collection,
- native crash evidence handoff,
- config fetch and probe directive state owned by the native SDKs,
- low-cost enqueue APIs for JS-originated events.

The legacy bridge adapter should call the same native implementation and exist only as compatibility glue.

Native Module lifecycle must handle:

- lazy creation,
- initialization after JS bundle start,
- invalidation when RN surfaces are destroyed in brownfield apps,
- multiple React Native surfaces in one process,
- reloads during development,
- app background/foreground transitions,
- memory warnings where available.

The native module must not assume a single permanent bridge. Native SDK state should be process/app scoped, while JS listeners and bridge references must be attachable/detachable.

### JavaScript Runtime Strategy

The JS layer owns:

- public API ergonomics,
- React error-boundary capture,
- JS stack and component stack capture,
- JS breadcrumbs and persistent context,
- fetch/XMLHttpRequest wrapping,
- React Navigation route extraction,
- JS-side object truncation and redaction before passing data to native,
- short-lived in-memory buffer while the native module becomes ready.

JS-originated events should be passed to native for queueing and transport as soon as possible. If the native module is unavailable, the SDK must degrade safely rather than pretending to provide durable capture.

### Android Native Reuse

The Android wrapper should depend on the Android SDK modules and call `DebugBundleClient`/facade APIs rather than duplicating:

- event envelope construction where native-owned fields are needed,
- device context provider,
- queue store,
- HTTP transport,
- retry/backoff,
- capture policy,
- remote probes,
- fatal crash and ANR evidence.

The wrapper may add React Native metadata such as RN version, JS engine, bridge architecture, bundle version, and React component stack.

### iOS Native Reuse

The iOS wrapper should depend on the Swift SDK products and call `DebugBundleClient`/facade APIs rather than duplicating:

- queue store and file protection,
- HTTP transport,
- connectivity monitor,
- capture policy,
- remote probes,
- crash evidence,
- device context,
- UIKit lifecycle where useful.

React Native packages install through CocoaPods in most apps. If the Swift SDK remains Swift Package Manager-only, the React Native repo must add a clean CocoaPods-compatible integration layer or coordinate a Swift SDK distribution shim. The plan must not copy Swift SDK source into the RN package as a permanent fork.

---

## Setup and Deployment Modes

### Bare React Native

Bare React Native apps should install from npm and rely on autolinking:

```bash
npm install @debugbundle/sdk-react-native
cd ios && pod install
```

Android Gradle and iOS CocoaPods integration must be automatic after install, with manual fallback instructions for brownfield apps.

### Expo Development Builds

Expo support must use a config plugin and require a development build or prebuild:

```json
{
  "expo": {
    "plugins": [
      [
        "@debugbundle/sdk-react-native",
        {
          "android": true,
          "ios": true
        }
      ]
    ]
  }
}
```

The plugin should configure only necessary native metadata. It must not write project tokens into native files unless the developer explicitly chooses build-time config and understands the token is public to the app binary.

### Expo Go

Expo Go cannot provide full parity because custom native modules are unavailable. The SDK must detect this and expose degraded status. Docs may show JS-only local testing for explicit captures, but must not claim offline queueing, native crash capture, native device context, or remote probe parity in Expo Go.

### Brownfield Apps

Brownfield React Native apps may create and destroy RN surfaces. The SDK must document native module invalidation and reinitialization behavior. App-scoped native queue and config state should survive RN surface teardown; JS listeners should be cleaned up on invalidation.

### Local Development

React Native has no server-style `.debugbundle/local/events` file transport. Local development should use:

- endpoint override to a local mock ingestion endpoint reachable from simulator/emulator/device,
- SDK test utilities that expose recorded native queue and transport calls,
- `debugbundle verify cloud` or hosted staging project for connected verification.

### Zero-Install Fallback

When installing the SDK is blocked, React Native apps may emit canonical `debugbundle-ndjson` through app-owned export/debug channels and ingest it manually. This is not full SDK parity because it lacks native offline queueing, capture policy, probes, lifecycle breadcrumbs, and automatic trace injection.

---

## Error, Crash, and Lifecycle Capture

The SDK must capture:

- handled JS `Error` values passed to `captureException`,
- React render errors through `DebugBundleErrorBoundary`,
- component stack traces where React exposes them,
- global JS fatal errors through React Native-supported error hooks while preserving redbox/crash behavior,
- unhandled promise rejections when the RN runtime exposes a safe hook,
- native fatal crash evidence through Android and Swift SDK paths,
- app foreground/background changes through `AppState` and native lifecycle,
- native module initialization/invalidation as internal breadcrumbs where useful.

Fatal JS handling must preserve host behavior. In development, the SDK must not break the RN redbox or Fast Refresh loop. In production, it must not swallow fatal JS exceptions unless a documented wrapper explicitly does so.

Native fatal crash handling belongs to the native SDKs. The React Native wrapper should enrich native crash evidence with RN metadata where safely available, but it must not attempt network work or heavy JS serialization in a crashing path.

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
- navigation action type,
- app foreground/background,
- coarse developer-provided action name,
- sanitized component/display name when supplied by the developer,
- network method, host, path template, status, and duration,
- JS engine and RN bridge architecture as runtime context.

Disallowed by default:

- text content,
- input names or values,
- screenshots,
- full native or React component tree,
- props or state dumps,
- precise tap coordinates unless explicitly enabled and rounded,
- clipboard, contacts, SMS, call logs, photos, location, advertising ID, keychain/keystore values.

React helpers must prefer developer-provided screen/action names over introspecting component internals.

---

## Network Capture and Trace Propagation

React Native V1 network capture must instrument:

- global `fetch`,
- global `XMLHttpRequest`,
- optional Axios helper if it remains a small composition layer.

Network instrumentation must:

- inject one UUID v4 `X-DebugBundle-Trace-Id` per outgoing first-party request,
- only inject into relative URLs or URLs matching `tracePropagationTargets`,
- preserve caller-provided trace IDs when present,
- capture request metadata as a network breadcrumb,
- emit standalone `request_event` for capture-policy-qualified request failures,
- retain the network breadcrumb when a request event is promoted,
- avoid request/response body capture by default,
- never execute user-provided regular expressions for URL filtering,
- avoid double wrapping across Fast Refresh and repeated `init()` calls.

Because React Native networking may cross JS and native layers differently across RN versions, tests must prove the trace header is present on actual platform requests in both Android and iOS example apps.

---

## Logging Integrations

V1 must support:

- `DebugBundle.captureLog(...)` manual logging.
- Optional `console.warn` / `console.error` capture through `captureConsole`.
- Internal diagnostics that do not recurse into user log capture.

Logging integration must:

- capture structured `log_event` records in process,
- never read device logs,
- respect `logLevel` and capture policy,
- include level, message, timestamp, JS/native source, logger name where supplied, and sanitized context,
- include Error summaries when console calls include Error objects,
- avoid recursive SDK logging capture,
- avoid blocking the JS thread with serialization or network work.

Native log integrations such as Timber and SwiftLog remain native SDK concerns. React Native V1 may expose optional passthrough documentation only if the native SDKs already support those paths cleanly in RN apps.

---

## Privacy Defaults

React Native defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Do not capture text content, component props, component state, screenshots, input values, location, contacts, clipboard, photos, advertising IDs, IDFV, Android ID, keychain/keystore values, or installed apps.
- Treat project tokens as write-only but extractable from the app binary and JS bundle.
- Use native app-private storage for queue files.
- Redact sensitive data before native queue persistence and transport.
- Collect rooted/jailbroken status as `null` unless the developer explicitly enables coarse device-integrity collection in the native SDK path.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`
- `traceparent`

If payload capture is later enabled, it must require explicit size limits, content-type filters, redaction, docs warnings, and separate privacy tests.

---

## Transport and Offline Queue

The React Native SDK must implement:

- direct HTTP transport through native SDKs,
- durable native offline queue in app-private storage,
- queue writes that are atomic and crash-safe on each platform,
- queue limits by event count and bytes,
- TTL eviction for events older than 72 hours,
- retry and backoff for `429` and transient `5xx`,
- `Retry-After` handling capped at 5 minutes,
- drop behavior for non-429 `4xx` after recording an internal diagnostic,
- foreground flush on batch size and interval,
- background/deferred flush using native platform mechanisms where available,
- connectivity-aware deferred delivery.

Queue persistence must happen after redaction. Queued events must keep their original `occurred_at` capture timestamp and may add local queue metadata that is not sent as trusted event data.

Transport failures must never throw into app code. JS-thread work must be bounded to cheap event normalization/enqueue. Deep serialization, queue compaction, and network transport belong off the JS thread where practical.

---

## Capture Policy and Probes

The React Native SDK must use mobile-safe config behavior:

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
- Lazy probe callback support in JS.
- `heavy = true` probes dormant until matching activation.
- Remote activation when config/piggyback directives are available.
- Trigger token extraction from deep-link query parameter `_debug_probe`.
- Trigger token extraction from instrumented request header `X-DebugBundle-Probe-Trigger` when observable.
- Trigger tokens apply only to the current app session or instrumented request, not permanently.
- Probe events respect session sampling and queue limits, except error-attached probe data remains attached to the error path.

React Native deep-link helpers should strip `_debug_probe` from app-visible URLs where the routing layer permits it, without breaking app-owned linking behavior.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

React Native events must include:

- `sdk_name`: `@debugbundle/sdk-react-native`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `correlation.trace_id` when an instrumented request created or observed it
- sanitized payload
- mobile device context
- app version, build number, and release channel
- React Native runtime metadata where available: RN version, React version, JS engine, architecture mode, platform, bundle/build identifier.

Mobile client failures use `frontend_exception`. Mobile breadcrumbs use `frontend_breadcrumb`. Network failures use `request_event` when capture policy allows or promotes them. Logs use `log_event`. The SDK must not introduce React-Native-only event types and must not assign `event_class`; classification remains worker-owned.

Device context may include OS name/version, Android API level, iOS version, device manufacturer/model where available, form factor, screen resolution, locale, timezone, network connection type, battery level/charging when available, free disk bytes when available, free memory bytes when available, app version, build number, release channel, and nullable rooted/jailbroken status.

---

## Implementation Slices

1. Repository scaffold and release wiring
   - Create `debugbundle-react-native` with npm package, TypeScript build, native module structure, governance files, CI, release workflow, examples, and package validation.

2. Native dependency integration
   - Wire Android Gradle dependency to `debugbundle-android` modules and iOS CocoaPods/SPM-compatible dependency to `DebugBundle` Swift products without duplicating native SDK internals.

3. TurboModule and legacy bridge wrappers
   - Implement native initialization, enqueue, flush, status, device context, and invalidation paths for Android and iOS.

4. JS client and universal API
   - Config, facade, instance client, native readiness handling, short-lived JS buffer, status, last event timestamp, and no-side-effect imports.

5. Redaction and privacy
   - JS object serialization limits, circular reference handling, default sensitive keys, header allowlist, no body capture defaults, and privacy tests.

6. Offline queue and transport
   - Native queue delegation, retry/backoff, app restart behavior, terminal `4xx` diagnostics, connectivity flush, and no-throw guarantees.

7. Suppression and sampling
   - Duplicate suppression, loop protection, session sampling, per-session caps, and failure injection tests across JS and native-originated events.

8. Error boundary and JS runtime capture
   - React error boundary, global JS error handling, promise rejection capture where safe, component stack capture, and Fast Refresh-safe hook installation.

9. Lifecycle and device context
   - AppState breadcrumbs, native lifecycle enrichment, RN runtime metadata, app/device snapshot, and low-risk battery/storage/network metadata.

10. Network integrations
    - fetch and XMLHttpRequest wrapping, trace propagation targets, request metadata, request-event promotion, and optional Axios helper.

11. Navigation integrations
    - React Navigation helpers, nested route extraction, Expo Router guidance/helpers where safe, and breadcrumb tests.

12. Capture policy and probes
    - Config fetch, ETag caching, mobile-safe refresh, capture-rule enforcement subset, probe buffers, remote directives, trigger tokens, and deep-link handling.

13. Expo support
    - Config plugin, development-build documentation, prebuild smoke, and clear Expo Go degraded-mode behavior.

14. Documentation and examples
    - Bare RN setup, Expo development builds, React Navigation, network capture, privacy, offline queue, probes, first-event verification, and staged artifact smoke apps.

---

## Testing Plan

The React Native SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for every universal method.
- TypeScript type tests for public API examples.
- Native module availability and degraded-mode tests.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for headers, nested objects, circular references, oversized payloads, tokens, cookies, phone/card/OTP fields, React component stacks, and JS errors.
- Duplicate suppression and loop protection tests.
- Retry/backoff tests using fake native transport or mock ingestion server.
- Offline queue app-restart tests on Android and iOS.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, trigger-token, and deep-link tests.
- React error boundary tests.
- Global JS error and promise rejection tests where runtime hooks are stable.
- AppState lifecycle breadcrumb tests.
- React Navigation tests for nested stacks/tabs and route-name sanitization.
- fetch and XMLHttpRequest instrumentation tests for trace injection, target allowlist, request metadata, and failure promotion.
- Fast Refresh/repeated-init tests proving hooks are not double wrapped.
- Android native tests for TurboModule wrapper, queue delegation, lifecycle, crash/ANR handoff, and Gradle dependency alignment.
- iOS native tests for TurboModule wrapper, queue delegation, lifecycle, crash handoff, and CocoaPods/SPM integration.
- Bare RN app-driven smoke tests on Android and iOS.
- Expo development-build smoke tests on Android and iOS.
- Privacy snapshot tests proving no body/text/screenshot/location/device identifiers are captured by default.

CI matrix:

```text
TypeScript current stable lane
TypeScript previous stable lane where practical
React Native minimum compatibility lane, Android, Hermes
React Native minimum compatibility lane, iOS, Hermes
React Native current stable lane, Android, Hermes
React Native current stable lane, iOS, Hermes
React Native New Architecture lane, Android
React Native New Architecture lane, iOS
React Native legacy bridge lane while supported
Android API 23 compatibility lane
Android current stable emulator/device lane
iOS 15 simulator compatibility lane
Current stable iOS simulator/device lane
React Navigation current stable lane
Expo development-build/prebuild lane
npm clean-install lane
pnpm clean-install lane
Yarn clean-install lane
```

Quality gates:

- `npm ci` or package-manager equivalent with lockfile enforcement.
- TypeScript compile with declarations.
- ESLint and Prettier checks.
- Jest unit tests.
- Android Gradle lint/test for native wrapper.
- iOS XCTest/Swift tests for native wrapper where applicable.
- CocoaPods lint or pod install validation for the RN package.
- Example app Android build.
- Example app iOS build.
- Coverage threshold at or above the SDK standard for JS source and native wrapper code.
- `npm pack` validates publishable artifact contents.
- Clean-install smoke app installs the staged tarball and runs first-event verification against a mock ingestion endpoint.
- Registry smoke reruns clean-install verification after npm publish.

---

## Release Readiness Checklist

- [x] Universal React Native API implemented.
- [x] Instance client and facade implemented.
- [x] TurboModule codegen metadata and native module path implemented and covered by Android/iOS clean-app smoke.
- [x] Legacy bridge adapter implemented while V1 compatibility claims require it.
- [x] Native Android SDK integration delegates queue, transport, lifecycle, crash/ANR, capture policy, and probes.
- [x] Native Swift SDK integration delegates queue, transport, lifecycle/crash evidence, capture policy, and probes.
- [x] CocoaPods/native iOS integration does not fork Swift SDK source.
- [x] React error boundary and explicit JS capture APIs are covered by tests.
- [x] Global JS error handling preserves RN development and production behavior.
- [x] React Navigation breadcrumbs implemented and covered for sanitized transitions.
- [x] fetch/XMLHttpRequest trace injection and request-event capture implemented.
- [x] Offline queue survives app restart, respects bounds, and preserves original timestamps through native Android/Swift foundations on both platforms.
- [x] Connectivity-aware deferred delivery works within Android and iOS execution limits through native foundations.
- [x] Console/manual log capture is in-process and non-recursive.
- [x] Duplicate suppression and loop protection match the universal contract through native capture paths plus JS session bounds.
- [x] Capture policy is fetched, cached, and enforced locally through native foundations with ingestion as backstop.
- [x] Always-on probes, heavy probes, native remote directives, and trigger tokens implemented.
- [x] SDK failures never throw into host app code.
- [x] JS-thread work is bounded and tested.
- [x] Request/response bodies, view text, screenshots, location, clipboard, advertising IDs, IDFV, Android ID, keychain/keystore values, props, and state are off by default.
- [x] Trace headers are only added to relative URLs and configured first-party targets.
- [x] Repository-local TypeScript, Android Java, Swift, and Objective-C++ coverage gates enforce the SDK-standard per-file floor.
- [ ] Expo development-build support works on both Android and iOS; Expo Go degraded behavior is documented. Android and iOS build lanes are configured and await hosted green evidence.
- [x] npm package includes README, license metadata, TypeScript declarations, native files, config plugin, and correct package exports.
- [x] Release docs cover config precedence, support labels, install modes, service naming, safe startup/status semantics, and first-event verification.
- [x] Public docs include bare RN, Expo development build, React Navigation, network capture, offline queue, native crash caveats, probes, and privacy examples.
- [ ] CI passes supported RN, TypeScript, Android, iOS, React Navigation, Expo, package-manager, and hardening lanes. The expanded native/runtime matrix is configured but has not yet produced hosted green evidence.
- [x] Clean-install smoke passes from staged npm tarball.
- [ ] Published-package smoke passes from npm registry for the remediated native dependency set.

---

## Release Decisions

- React Native V1 targets iOS and Android only.
- The SDK is distributed as `@debugbundle/sdk-react-native` on npm.
- React Native V1 is a mobile/client SDK and does not provide browser relay handlers.
- React Native V1 does not implement browser relay CORS preflight, `allowedOrigins`, or `transportMode`; those are server/browser SDK responsibilities.
- TurboModule is the primary native module architecture; legacy bridge support is compatibility glue.
- The package should reuse `debugbundle-android` and `debugbundle-swift` for native queue, transport, device context, lifecycle/crash, capture policy, and probes.
- React Navigation is the required V1 navigation integration.
- Expo support means development builds/prebuild, not Expo Go full parity.
- Network trace injection is through JS `fetch`/`XMLHttpRequest` wrapping by default, scoped to configured first-party targets.
- Native all-HTTP-client interception is out of scope.
- Hermes is the required JS engine test lane.
- JS-thread work must stay bounded; durable queueing and transport belong to native SDK paths.

---

## Open Decisions

- Whether Axios helper ships in V1 or remains documented composition over fetch/XHR capture.
- Whether Expo Router receives a first-class helper in V1 or only guidance built on route-name capture APIs.
- Whether JS source-map release metadata should be included in V1 config for future symbolication without shipping upload tooling yet.
