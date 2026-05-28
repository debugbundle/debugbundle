# SDK Language Targets — DebugBundle

Version: v1
Last updated: 2026-05-28

---

## Purpose

This document defines the language and platform targets for DebugBundle SDK implementation across all rollout waves.

The goal is not just to pick the most popular languages overall, but to prioritize the ecosystems where DebugBundle is most likely to deliver strong value:

- production backends
- SaaS applications
- API-heavy products
- client/server debugging correlation
- crash and exception workflows
- CMS platforms with high install friction
- environments where developers need more than isolated logs

---

## Recommended Top 12 Language Targets

### Tier 1: Highest-priority initial targets

1. **TypeScript**
2. **JavaScript**
3. **Python**
4. **Go**
5. **PHP**
6. **Ruby**
7. **Java**
8. **C#**

### Tier 2: Important expansion targets

9. **Kotlin**
10. **Swift**
11. **Rust**
12. **Dart**

---

## Important product framing

A key implementation decision is that **TypeScript and JavaScript should likely be delivered as one shared npm SDK surface**, even though they are listed separately for strategic prioritization.

Similarly:

- **Kotlin** should be thought of both as a backend/server language and as an Android/mobile language.
- **Swift** should be treated primarily as an Apple-platform mobile/client SDK target.
- **Dart** is primarily included because of Flutter.

So while the list is expressed as “top 12 languages,” the actual SDK rollout may be better modeled as **SDK surfaces / platform families** rather than fully separate implementations for every language.

### Version support discipline

Before implementing any new SDK, the plan must explicitly separate:

- **Minimum compatibility version** — the oldest language/runtime version the SDK promises to install, compile, and test against.
- **Recommended production version** — the current or upstream-maintained version DebugBundle recommends for security and support.
- **Installed-base compatibility lanes** — older but still common runtime, framework, or platform versions supported to avoid leaving a large user footprint behind. If a lane is upstream EOL, the SDK docs must say so clearly and frame it as compatibility support, not a secure production recommendation.
- **Rolling CI lanes** — the concrete runtime and framework versions tested at release time, including the minimum supported version, important intermediate versions, current stable, and previous stable or LTS where the ecosystem has that concept.

Do not start a new SDK implementation until its plan documents the relevant language/runtime versions, framework versions, package-manager constraints, and EOL/support status. Refresh those lanes before every SDK release so matrices do not age into stale promises.

### Release-gate discipline for all future SDKs

Every future SDK plan must also inherit the release-hardening pattern now used by the shipped SDK surfaces:

- package-level README or registry-native docs shipped in the published artifact
- configuration source precedence documented explicitly, including server-owned capture policy
- runtime support labels for minimum compatibility, recommended production, installed-base lanes, and rolling CI lanes
- install examples for every claimed setup mode
- service naming guidance and safe startup/status semantics
- first-event verification instructions
- staged-artifact smoke before publish and clean-install registry smoke after publish

Do not treat an SDK as release-ready until those gates are defined in the plan and implemented in the repository.

---

## Alignment with existing implementation

**Already shipped (Wave 1, complete):**
- `@debugbundle/sdk-node` — Node.js backend SDK with Express, Fastify, Next.js integrations (Phase 8)
- `@debugbundle/sdk-browser` — Browser SDK with auto-capture hooks, breadcrumbs, device context, trace correlation (Phase 9)
- `debugbundle-python` — Python SDK with Django, Flask, FastAPI integrations (Phase 18)
- `debugbundle/sdk-php` — PHP SDK with Laravel, Symfony integrations (Phase 18a)
- `debugbundle-wordpress` — WordPress plugin wrapper over the PHP SDK plus browser relay
- `com.debugbundle:debugbundle-spring-boot-starter` — Java SDK with Spring Boot MVC starter backed by `debugbundle-java-core`

The JS packages live in the JS SDK monorepo: `github.com/debugbundle/debugbundle-js` (alongside `@debugbundle/shared-types` and `@debugbundle/redaction`). Python, PHP, WordPress, Java, Ruby, and Go live in their own dedicated repositories.

Current cross-repo release sequencing for the JS family is intentional: publish core-owned `@debugbundle/shared-types` and `@debugbundle/redaction` first, then publish `@debugbundle/sdk-node` and `@debugbundle/sdk-browser` from `debugbundle-js`, then update dependent wrappers such as WordPress after their prerequisite packages are live and verified.

**Java scope update:** The Java SDK's expanded V1 target now includes servlet/JAX-RS app-server adapters and a startup javaagent bootstrap in addition to the existing core plus Spring Boot starter path. See `spec/sdks/java-sdk.md` for the app-server parity plan.

TypeScript and JavaScript are delivered as one shared npm SDK surface, exactly as this document recommends.

**Pre-release SDK expansion and prepared plans:**
- `github.com/debugbundle/debugbundle-go` — Go SDK. Detailed implementation plan: `spec/sdks/go-sdk.md`.
- `debugbundle` (RubyGems) — Ruby SDK. Detailed implementation plan: `spec/sdks/ruby-sdk.md`.
- `github.com/debugbundle/debugbundle-android` — Kotlin Android SDK local standalone repo now includes the implemented core/runtime module family (`debugbundle-android-core`, `debugbundle-android`, OkHttp/Ktor, Navigation/Compose, Timber, testkit, BOM), offline queueing, crash/ANR replay, native trace propagation, capture-policy enforcement, and remote probe directive/trigger-token support; the detailed plan lives in `spec/sdks/kotlin-sdk.md`.
- `github.com/debugbundle/debugbundle-swift` — Swift iOS SDK plan prepared in `spec/sdks/swift-sdk.md`.

---

## Language-by-language guidance

## 1) TypeScript

### Why it matters

TypeScript should be one of the first targets because it is a default language for modern web apps, full-stack products, frontend-heavy systems, edge runtimes, and many backend services.

It is especially important for DebugBundle because:

- many startups and SaaS companies are TS-first,
- it spans browser + backend + edge,
- the same teams often own both frontend and backend,
- bundle-based debugging is especially valuable when errors cross client/server boundaries.

### Keep in mind

- Strong types should shape the SDK design.
- Public SDK interfaces should feel ergonomic in TS-first codebases.
- You should provide typed helpers for metadata, breadcrumbs, context, tags, and manual bundle capture.
- Source map awareness and release/build association matter for frontend use cases.

### V1 framework integrations

- **Express** — Middleware (shipped)
- **Fastify** — Plugin (shipped)
- **Next.js** — API route wrapper (shipped)

### Future framework targets (post-V1)

- NestJS, Hono, Remix, Astro, Nuxt (via TS), Cloudflare Workers / edge runtimes, Bun, Deno

### Implementation notes

- Distinguish browser vs server vs edge capture behavior.
- Make framework adapters thin wherever possible.
- Preserve a strong core SDK with optional integrations.
- TS and JS are already shipped as `@debugbundle/sdk-node` + `@debugbundle/sdk-browser`.

---

## 2) JavaScript

### Why it matters

JavaScript remains critical because many teams still use plain JS even in serious production apps, especially in legacy systems, frontend apps, Node services, and incremental migration codebases.

### Keep in mind

- JS support should not feel like a downgraded TS SDK.
- The API should remain simple, forgiving, and well-documented.
- Good defaults matter more than advanced typing.

### V1 framework integrations

Same as TypeScript — JS and TS share one npm package family (`@debugbundle/sdk-node` + `@debugbundle/sdk-browser`). Already shipped.

### Future framework targets (post-V1)

- Electron, Serverless Node runtimes, Remix, Vue/React apps without TS

### Implementation notes

- JS and TS share one package family. Already implemented.
- Runtime behavior and documentation matter more than language-specific implementation differences.

---

## 3) Python

### Why it matters

Python is a must-have because it is widely used for APIs, SaaS backends, internal tools, AI products, worker systems, automation, and data-heavy production services.

This is especially important for DebugBundle because AI agents, async jobs, and background workflows often need richer execution context than logs alone.

### Keep in mind

- Async support is essential.
- Worker/process context is very important.
- Exception chaining, task metadata, and execution breadcrumbs should be first-class.
- Python users often rely on framework middleware and decorators.

### V1 framework integrations

- **Django** — Middleware
- **Flask** — Error handler + before/after request hooks
- **FastAPI** — Middleware

### Future framework targets (post-V1)

- Celery, RQ, Dramatiq (background job integrations)
- Starlette (standalone)
- Gunicorn / Uvicorn (WSGI/ASGI server hooks)
- AWS Lambda Python

### Implementation notes

- Prioritize web request capture plus worker/job capture.
- Make it easy to attach request data, user context, task arguments, and environment metadata.
- Background job integrations (Celery, RQ, Dramatiq) are a major value surface for post-V1 depth.

---

## 4) Go

### Why it matters

Go is a strong backend target for cloud-native services, APIs, infrastructure tools, and high-reliability systems.

Go teams often care about operational clarity, request flow, and production debugging with low overhead.

### Keep in mind

- Performance and low allocation overhead matter.
- Context propagation should feel natural with `context.Context`.
- Panic handling and error wrapping support are important.
- The SDK should not feel heavy or magical.
- Keep Go 1.21 as the V1 compatibility floor for `log/slog`, but test every claimed minor through current stable and recommend the current or previous officially supported Go release for production.

### V1 framework integrations

- **net/http** — Middleware
- **Gin** — Middleware
- **Echo** — Middleware

### Future framework targets (post-V1)

- Fiber, Chi, gRPC, Go kit, AWS Lambda Go

### Implementation notes

- Make middleware integration very lightweight.
- Support panic recovery hooks via `recover()`.
- Use `context.Context` for per-request correlation.
- Support request correlation and structured metadata cleanly.
- Detailed implementation plan: `spec/sdks/go-sdk.md`.

---

## 5) PHP

### Why it matters

PHP still matters because a huge amount of revenue-generating software runs on it, including SaaS backends, e-commerce systems, internal business apps, CMS platforms, and legacy-modern hybrid stacks.

DebugBundle can be useful here because many PHP issues are workflow-level production problems where bundle context is more useful than raw logs.

### Keep in mind

- Shared hosting and traditional request lifecycle constraints may affect transport assumptions.
- Laravel experience matters a lot.
- PHP's shared-nothing model (one process per request) means events flush at request termination.

### V1 framework integrations

- **Laravel** — Middleware + exception handler + service provider
- **Symfony** — Event subscriber + bundle

### Future framework targets (post-V1)

- Drupal, Magento (CMS-platform integrations — different adoption motion, best suited for community contributions)
- Slim, Laminas (niche frameworks)

### Official CMS integration

- **WordPress** now lives as a dedicated plugin repository at `github.com/debugbundle/debugbundle-wordpress`. It wraps `debugbundle/sdk-php` plus the browser SDK relay path rather than becoming a separate PHP SDK framework adapter.

### Implementation notes

- Laravel is the first-class integration target.
- Exception capture, request metadata, queue/job support, and artisan/CLI support matter.
- Transport should be resilient to PHP execution lifecycle limitations.

---

## 6) Ruby

### Why it matters

Ruby deserves a first-wave slot for DebugBundle because Rails apps remain common in startups, SaaS products, mature internal systems, and API-driven businesses.

Ruby/Rails incidents are often highly contextual: user flow issues, background jobs, request state, and integrations across app layers.

### Keep in mind

- Rails developer experience is critical.
- Convention-over-configuration ergonomics matter.
- Job systems are important, not just web requests.
- Middleware and rack-level integration should be clean.
- Keep Ruby 3.1+ compatibility for the Rails installed base, but label EOL Ruby branches as footprint support and recommend current upstream-maintained Ruby branches for production.

### V1 framework integrations

- **Ruby on Rails** — Middleware + Railtie
- **Rack** — Middleware
- **Sidekiq** — Server middleware

### Future framework targets (post-V1)

- Sinatra, Hanami (niche web frameworks)
- Resque, Delayed Job (legacy job systems)

### Implementation notes

- Rails is the first-class integration target.
- Sidekiq support matters almost as much as request capture for background job debugging.
- Attach user/account/request/job context elegantly.
- Detailed implementation plan: `spec/sdks/ruby-sdk.md`.

---

## 7) Java

### Why it matters

Java remains essential for enterprise systems, large backend platforms, financial systems, internal platforms, and mature distributed systems.

It may not be your earliest startup-facing wedge, but it is a major long-term credibility target.

### Keep in mind

- Enterprise users care about stability, performance, and deployment flexibility.
- Support for servlet-based and Spring-based stacks is very important.
- Threading, async execution, and context propagation matter.

### V1 framework integrations

- **Spring Boot** — Starter with servlet filter, MVC exception resolver, relay route, and Logback/MDC integration
- **Servlet app servers** — `jakarta.servlet` and `javax.servlet` filters/listeners plus relay servlet
- **JAX-RS / RESTEasy** — `jakarta.ws.rs` and `javax.ws.rs` filters/providers for route metadata and handled exception capture

### Runtime baseline

- Java >=17.
- Compile/release target: Java 17.
- Java 21 tested and recommended for current LTS deployments.
- Java 25 and Java 26 compatibility should be tested for the core SDK, and for adapters where the selected framework/container line supports them.
- Spring Boot 3.x / Spring Framework 6.x / `jakarta.servlet` remains a first-class implementation target.
- Spring Boot 4.x / Spring Framework 7.x compatibility should be included as a validation lane for Java 26 support when the adapter code remains compatible.
- `javax.servlet` and `javax.ws.rs` compatibility is required for Java 17+ app-server deployments such as WildFly/JBoss. This is namespace compatibility, not Java 8/11 support.
- No Java 8, Java 11, or Spring Boot 2.x support in V1.

### Future framework targets (post-V1)

- Spring WebFlux (reactive), Micronaut, Quarkus, Dropwizard, gRPC Java, deep EJB/Camel/ORM instrumentation

### Implementation notes

- Spring Boot is first-class, but the Java SDK must not be Spring-only.
- Build as a lower-level Java core SDK plus reusable servlet/JAX-RS web modules, with the Spring Boot starter composed on top.
- Include a startup `-javaagent` bootstrap for Docker/application-server JVM injection when modifying every WAR is impractical.
- Support exceptions, request context, MDC/log correlation, multi-deployment service identity, and async propagation.
- Preserve existing application request IDs and MDC values while also reading `X-DebugBundle-Trace-Id` for browser/backend correlation.
- Default to conservative privacy behavior: no request/response bodies, allowlisted headers only, aggressive redaction, and explicit opt-in for payload capture.
- Minimize friction in enterprise deployments.
- Detailed implementation plan: `spec/sdks/java-sdk.md`.

---

## 8) C#

### Why it matters

C# is important for enterprise web apps, APIs, internal business systems, cloud apps, desktop tooling, and Microsoft-heavy environments.

It is a strong commercial target even if it is not the first startup-focused SDK.

### Keep in mind

- ASP.NET Core support is mandatory.
- Background workers and hosted services matter.
- Structured logging and Microsoft ecosystem alignment matter.

### V1 framework integrations

- **ASP.NET Core** — Middleware plus relay endpoint for Minimal APIs, MVC/Web API, and Razor Pages
- **ASP.NET Core gRPC** — Server interceptor
- **.NET Generic Host / Worker Service** — Hosted-service helpers
- **Hangfire** — Server filter
- **Azure Functions isolated worker** — Middleware where the Functions runtime supports the selected .NET LTS lane

### Runtime baseline

- Full server SDK minimum runtime: .NET 8 LTS.
- Recommended production runtime: .NET 10 LTS for new services, or .NET 8 LTS while it remains upstream-supported.
- Core/manual installed-base footprint may target `netstandard2.0` for .NET Framework 4.8/4.8.1 where feasible.
- Do not claim .NET 6 or .NET 7 support because both are upstream EOL.
- Do not claim .NET 9 as a supported production lane after its STS support window; newer LTS lanes are preferred.
- ASP.NET Core validation should cover 8.0 and 10.0, with optional non-blocking preview lanes only as early warning signals.

### Future framework targets (post-V1)

- SignalR hub filters, MassTransit, Quartz.NET, Azure Service Bus processors, Orleans, Dapr, MAUI, WPF/WinForms desktop helpers, classic ASP.NET `System.Web` if customer demand justifies it

### Implementation notes

- ASP.NET Core middleware is the center of the integration strategy.
- Good integration with dependency injection and `ILogger` logging abstractions will help adoption.
- Treat the SDK as a .NET package family with C#-first documentation.
- Preserve ASP.NET Core request IDs, `System.Diagnostics.Activity` context, `ILogger` scopes, and `X-DebugBundle-Trace-Id` without forcing response headers.
- Keep the core dependency footprint small; Serilog, NLog, log4net, gRPC, Hangfire, and Azure Functions support should live in optional packages.
- Default to conservative privacy behavior: no request/response bodies, no raw claims capture, allowlisted headers only, aggressive redaction, and explicit opt-in for payload capture.
- Account for Windows and Linux file-system security differences in local event and relay spool transports.
- Detailed implementation plan: `spec/sdks/csharp-sdk.md`.

---

## 9) Kotlin

### Why it matters

Kotlin is important for two reasons:

1. **Android/mobile**
2. **JVM backend services**

This makes Kotlin strategically valuable because it can participate in both server-side and mobile-side bundle capture.

### Keep in mind

- Kotlin should not be treated only as a Java variant.
- Android and server-Kotlin have different needs.
- Correlation between device events and backend traces/bundles can be a major DebugBundle strength.

### V1 framework integrations

- **Ktor** — Plugin (server Kotlin)
- **Android** — Application lifecycle hooks (mobile Kotlin)

### Future framework targets (post-V1)

- Spring Boot with Kotlin (shares Java SDK infrastructure), Compose Multiplatform, Kotlin Multiplatform

### Implementation notes

- Kotlin server and Kotlin Android are separate SDK surfaces (`debugbundle-kotlin` and `debugbundle-android`).
- The detailed Kotlin Android implementation plan lives in `spec/sdks/kotlin-sdk.md`.
- The current local Android repo already covers the core/runtime slice: lifecycle/process capture, WorkManager flushing, ANR/process-exit replay, offline queueing, capture-policy enforcement, OkHttp/Ktor request instrumentation, Navigation/Compose/Timber adapters, contract-shaped inline probe data, remote probe directives, piggybacked ingestion directives, standalone `probe_event` shipping, and trigger-token validation.
- The Ktor/server SDK still needs a separate server-focused plan before implementation.
- KMP is strategically interesting later, but should not block native-first support.

---

## 10) Swift

### Why it matters

Swift is the primary Apple-platform language and a major mobile opportunity surface for DebugBundle.

It matters because many real incidents start on-device and only make sense once correlated with backend behavior.

### Keep in mind

- Mobile crash/error capture is different from web or backend capture.
- Release/build metadata is crucial.
- Offline behavior and delayed upload matter.
- Lifecycle and navigation breadcrumbs matter.

### V1 framework integrations

- **UIKit / SwiftUI** — App lifecycle hooks

### Future framework targets (post-V1)

- watchOS / tvOS (where relevant), macOS apps

### Implementation notes

- Swift should be treated as a native mobile/client SDK with backend correlation support.
- Focus on crash capture, handled exceptions/errors where possible, network breadcrumbs, and release-aware bundles.
- Trace ID injection via `URLSession` delegate or `URLProtocol` subclass for cross-boundary correlation.
- The detailed Swift iOS implementation plan lives in `spec/sdks/swift-sdk.md`.

---

## 11) Rust

### Why it matters

Rust is not the largest market today, but it is strategically valuable for modern backend services, developer infrastructure, CLI tooling, edge systems, and reliability-focused teams.

It also carries credibility with advanced developer audiences.

### Keep in mind

- Performance overhead must stay low.
- Error handling style is different from many other ecosystems.
- Async runtimes and instrumentation ergonomics matter.

### V1 framework integrations

- **Axum** — Layer / middleware
- **Actix Web** — Middleware

### Future framework targets (post-V1)

- Warp, Rocket, Tonic / gRPC

### Implementation notes

- Keep the SDK core small and composable.
- Provide ergonomic support for error chains, spans, request context, and panics.

---

## 12) Dart

### Why it matters

Dart is included mainly because of Flutter.

Flutter creates a useful expansion path into cross-platform mobile and multi-platform app experiences where client-side bundle capture can be highly valuable.

### Keep in mind

- Dart without Flutter is a smaller commercial priority.
- Flutter app context, navigation, and device state matter more than language-specific backend concerns.
- Treat this as a platform bet, not just a language bet.

### V1 framework integrations

- **Flutter** — `RunZonedGuarded` + `NavigatorObserver`

### Future framework targets (post-V1)

- Flutter web, Flutter desktop

### Implementation notes

- Dart likely becomes important after native mobile SDK concepts are stable.
- Flutter can later become a strong wrapper target once native mobile bundle design is proven.
- Dart/Flutter should not block V1 launch — it is a Wave 3+ target.

---

## Suggested rollout waves

## Wave 1: strongest initial commercial and implementation fit

- TypeScript / JavaScript
- Python
- PHP
- WordPress plugin
- Java core + Spring Boot + servlet/JAX-RS app-server support

### Why

This group gives DebugBundle strong access to:

- startups,
- SaaS backends,
- agent-built services,
- API-heavy systems,
- enterprise Spring MVC systems,
- high-context production debugging problems.

These ecosystems are especially likely to benefit from DebugBundle’s bundle-first model instead of simple log collection.

### Pre-release expansion

- Go

Go is now implemented in the local standalone SDK repo and is in pre-release review alongside Ruby publication work. Detailed plans live in `spec/sdks/go-sdk.md` and `spec/sdks/ruby-sdk.md` so review stays aligned to the same parity, relay, security, and testing baseline used for Java.

---

## Wave 2: enterprise and platform depth

- C#
- Kotlin (server)
- Rust

### Why

This wave expands into larger organizations, internal platforms, more operationally mature systems, and more advanced backend environments.

---

## Wave 3: client and mobile expansion

- Browser JS/TS refinement
- Kotlin Android
- Swift iOS
- React Native
- Dart / Flutter

### Why

This wave expands the product from backend debugging into **cross-boundary debugging**, where client and server bundles can be connected into a richer incident narrative.

### Prerequisite

Before Wave 3 implementation begins, the **Mobile Correlation Contract** must be kept current. It defines:
- How mobile SDKs inject `X-DebugBundle-Trace-Id` into outgoing requests (OkHttp interceptor for Kotlin, URLSession delegate for Swift, fetch wrapper for React Native)
- How offline-captured events timestamp and eventually correlate with backend events
- Whether mobile-specific device context extends the browser SDK's `device` schema or introduces new event types
- The offline queueing and deferred delivery contract

This contract has been drafted in `contracts/sdk-interface.md` Section 10.1 and is now expanded into native implementation plans for Kotlin Android (`spec/sdks/kotlin-sdk.md`) and Swift iOS (`spec/sdks/swift-sdk.md`). React Native and Dart/Flutter must align to the same contract when their plans are prepared.

---

## Mobile SDK strategy

## Core insight

Mobile is not just “nice to have.”

It meaningfully expands the opportunity for DebugBundle because many important production failures are not purely backend or purely client-side. They are **cross-boundary incidents**.

Examples:

- a user taps a button,
- the mobile app sends a request,
- the backend returns unexpected state,
- the UI crashes or enters a broken state,
- support only sees a symptom unless the client and server context are connected.

This is exactly the kind of problem where DebugBundle can be stronger than isolated logs, isolated traces, or isolated crash reporting.

---

## Correct mental model for mobile SDKs

The mobile SDK should behave somewhat like a browser SDK, but with more native-device concerns.

A good model is:

- **client-side bundle** on the device,
- **server/cloud bundle** in backend services,
- **shared correlation layer** between them.

So one real-world incident may span:

- device/app crash or handled error,
- app version and release metadata,
- device metadata,
- navigation breadcrumbs,
- last user action,
- outbound network request,
- trace/request correlation IDs,
- backend exception or failed response,
- retry attempts,
- resulting UI failure.

---

## Why mobile is especially promising

Mobile apps run on user devices with:

- variable network conditions,
- device-specific constraints,
- intermittent connectivity,
- app lifecycle interruptions,
- release fragmentation,
- background/foreground transitions.

That means the debugging context is often fragmented.

A bundle-oriented system can be especially valuable because it can capture a fuller story than a standalone crash event.

---

## What to keep in mind for mobile SDK design

### 1. Native crash capture matters

The SDK should capture native/mobile-specific failures such as:

- app crashes,
- fatal exceptions,
- app hangs / ANRs where applicable,
- rendering or lifecycle failures where detectable.

### 2. Offline queueing is important

Unlike backend services, mobile devices may not be online when an incident occurs.

The SDK should support:

- local buffering,
- deferred delivery,
- retry with backoff,
- safe handling across app restarts where possible.

### 3. Release/build awareness is essential

Mobile debugging often depends on knowing:

- app version,
- build number,
- release channel,
- environment,
- OS version,
- device model.

Release association should be a first-class part of the bundle model.

### 4. Navigation and user-action breadcrumbs matter

The “what just happened” story is extremely important on mobile.

Useful context may include:

- current screen,
- previous screens,
- button taps,
- gestures,
- navigation transitions,
- in-app state transitions.

### 5. Network correlation is a major opportunity

The mobile SDK should make it possible to correlate:

- client event,
- request metadata,
- trace/request IDs,
- backend bundle,
- backend response/failure.

This is one of the most strategically important product opportunities for DebugBundle.

### 6. Keep client-side capture privacy-aware

Mobile apps may contain highly sensitive user and device information.

The SDK should support:

- redaction,
- field filtering,
- opt-in context collection,
- safe defaults,
- clear PII controls.

---

## Recommended mobile platform sequence

### First conceptual target

- Treat mobile as a strategic product category from the beginning.
- The mobile correlation contract (trace ID injection, offline queueing, device context) should be designed during Wave 2 so it is ready when Wave 3 starts.

### First implementation targets

1. **Kotlin / Android** — `com.debugbundle:debugbundle-android` on Maven Central
2. **Swift / iOS** — `DebugBundle` via Swift Package Manager

### Second implementation targets

3. **React Native** — `@debugbundle/sdk-react-native` on npm (wraps browser SDK patterns with native bridge for crash capture)

### Later expansion

4. **Flutter / Dart** — `debugbundle` on pub.dev
5. **Kotlin Multiplatform wrappers / shared logic where useful**

The reason to prefer native-first is that the core bundle model, crash capture strategy, and client/server correlation behavior should be proven in native SDKs before adding cross-platform abstraction layers.

> **Note:** React Native is commercially more important than Dart/Flutter for DebugBundle's target market (startup SaaS teams) and should be implemented before Flutter.

---

## Framework support philosophy

Across all languages, DebugBundle should avoid becoming “just a huge pile of framework-specific code.”

A better strategy is:

- keep a strong core SDK,
- build thin adapters for common frameworks,
- standardize the bundle model across ecosystems,
- support request/job/crash/manual capture in a consistent way,
- let framework integrations mainly handle lifecycle hooks and context extraction.

That approach should make it easier to maintain parity across SDKs and keep the product coherent.

---

## Notable omissions

### Elixir / Phoenix

Not a top-12 candidate, but worth noting. Elixir/Phoenix has a loyal SaaS community and a process-model (GenServer, Supervisor trees) that maps well to per-request bundle capture and background job debugging. Could be a Wave 2+ community target if demand materializes.

---

## Final recommendation summary

For the next phase of SDK implementation, DebugBundle should prioritize these twelve language targets:

1. TypeScript
2. JavaScript
3. Python
4. Go
5. PHP
6. Ruby
7. Java
8. C#
9. Kotlin
10. Swift
11. Rust
12. Dart

### Practical rollout interpretation

- **Immediate implementation focus (Wave 1):** TS/JS, Python, PHP, WordPress plugin, Java core + Spring Boot + servlet/JAX-RS app-server support, Ruby, Go
- **Pre-release expansion:** Ruby and Go publication handoff
- **Next depth layer (Wave 2):** C#, Kotlin server, Rust
- **Strategic product expansion (Wave 3):** Kotlin Android and Swift iOS plans prepared; React Native and Dart/Flutter remain future plans.

### V1 framework scope per SDK

Each SDK ships with 1–3 first-class framework integrations. Additional frameworks are post-V1 targets:

| SDK | V1 Frameworks | Post-V1 Targets |
|-----|--------------|----------------|
| Node.js | Express, Fastify, Next.js | NestJS, Hono, Remix, Astro, edge runtimes |
| Python | Django, Flask, FastAPI | Celery, RQ, Dramatiq, Starlette, Lambda |
| Go | net/http, Gin, Echo | Fiber, Chi, gRPC, Go kit, Lambda |
| PHP | Laravel, Symfony | Drupal, Magento (community) |
| WordPress plugin | Backend PHP capture, frontend browser capture, REST relay | Network-wide settings, deeper admin diagnostics |
| Ruby | Rails, Rack, Sidekiq | Sinatra, Hanami, Resque, Delayed Job |
| Java | Spring Boot, Servlet/JAX-RS app servers, WildFly/JBoss startup injection | Spring WebFlux, Micronaut, Quarkus, deep EJB/Camel/ORM instrumentation |
| C# | ASP.NET Core | Blazor, Azure Functions, Worker Services |
| Kotlin (server) | Ktor | Spring Boot Kotlin |
| Kotlin (Android) | Android lifecycle | — |
| Swift (iOS) | UIKit / SwiftUI | watchOS, tvOS, macOS |
| React Native | React Navigation | — |
| Rust | Axum, Actix Web | Warp, Rocket, Tonic |
| Dart / Flutter | Flutter | Flutter web, Flutter desktop |

### Most important strategic takeaway

DebugBundle should not think only in terms of "language support."

It should think in terms of **debugging surfaces**:

- backend services,
- browser/client apps,
- background jobs,
- mobile/native apps,
- cross-boundary incident correlation.

That is where the bundle model becomes much more valuable than a narrow error SDK or log collector.

---

## Cross-references

| Document | Relationship |
|---|---|
| `contracts/sdk-interface.md` | Universal SDK interface contract — naming conventions, framework matrix, mobile correlation contract (Section 10.1) |
| `spec/requirements.md` | Functional requirements FR-SDK-01 through FR-SDK-37 |
| `spec/sdks/kotlin-sdk.md` | Detailed Kotlin Android SDK implementation plan |
| `spec/sdks/swift-sdk.md` | Detailed Swift iOS SDK implementation plan |
| `spec/implementation-roadmap.md` | Phase 18 (Python), 18a (PHP), 18b (Go), 18c (Ruby), Wave 2/3 placeholders |
| `SYSTEM_OVERVIEW.md` | SDK surface count and tech stack references |
| `ARCHITECTURE_MAP.md` | Package entries for all SDK repositories |
