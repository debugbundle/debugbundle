# Java Spring Boot SDK Implementation Plan

Version: v1
Last updated: 2026-05-20

---

## Purpose

This plan defines the first Java SDK surface for DebugBundle. The goal is a production-ready Spring Boot integration backed by a reusable Java core SDK, not a one-off adapter for a single application.

The Java SDK must satisfy the universal SDK contract in `contracts/sdk-interface.md`, the Java target guidance in `spec/sdk-language-targets.md`, and the SDK testing strategy in `rules/sdk-testing-strategy.md`.

---

## Scope

### V1 In Scope

- Java core SDK for manual capture and shared runtime behavior.
- Spring Boot starter for servlet-based Spring MVC applications.
- Java >=17 runtime support.
- Java 17 compile/release target.
- Java 21 tested and recommended for current LTS deployments.
- Java 25 and Java 26 compatibility validation where the selected Spring Boot line supports them.
- Spring Boot 3.x, Spring Framework 6.x, and `jakarta.servlet` as the first implementation target.
- Spring Boot 4.x and Spring Framework 7.x validation lane for Java 26 compatibility when the adapter code remains compatible.
- Local-only and connected transports.
- Browser relay handler compatible with the server SDK relay contract.
- Conservative privacy defaults suitable for healthcare, financial, and enterprise applications.

### V1 Out of Scope

- Java 8, Java 11, Spring Boot 2.x, and `javax.servlet`.
- Spring WebFlux and Reactor context propagation.
- Generic standalone Jakarta Servlet adapters outside Spring Boot auto-configuration.
- Micronaut, Quarkus, Dropwizard, gRPC Java.
- Java agent bytecode instrumentation.
- Deep ORM, SQL, or HTTP client auto-instrumentation.

---

## Artifacts

The Java SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-java
```

Publish Maven Central artifacts under group `com.debugbundle`:

| Artifact | Purpose |
| --- | --- |
| `debugbundle-java-core` | Core client, event model, buffering, transport, redaction, probes, suppression, capture policy, manual capture API. |
| `debugbundle-spring-boot-starter` | Spring Boot auto-configuration, servlet filter, exception capture, relay route, MDC/log integration, configuration properties. |

Suggested Java package roots:

| Package | Owner |
| --- | --- |
| `com.debugbundle.sdk` | Core SDK public API and implementation. |
| `com.debugbundle.sdk.transport` | HTTP and file transports. |
| `com.debugbundle.sdk.redaction` | Java redaction implementation. |
| `com.debugbundle.sdk.probe` | Probe ring buffers and activation state. |
| `com.debugbundle.spring.boot` | Spring Boot starter and auto-configuration. |

Consumer installation examples must be documented for both Maven and Gradle, even if the SDK repo itself chooses one build tool.

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-03`: backend request, response, exception, log, service, deploy, and correlation capture.
- `FR-SDK-05`: normalized event types, including `backend_exception`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-06`, `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: batching, sampling, duplicate suppression, and loop protection.
- `FR-SDK-16`: universal backend SDK interface, Java camelCase naming.
- `FR-SDK-17`, `FR-SDK-18`, `FR-SDK-19`, `FR-SDK-20`, `FR-SDK-21`: vanilla hooks and in-process log capture.
- `FR-SDK-22`: read `X-DebugBundle-Trace-Id` and attach it to backend events.
- `FR-SDK-35`: Wave 2 backend SDK parity with Spring Boot as the first-class Java framework.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `contracts/sdk-interface.md` sections 1 through 13.
- `rules/security-hardening.md` relay and redaction requirements.
- `rules/sdk-testing-strategy.md` SDK, contract, and relay compliance tiers.

Primary acceptance coverage:

- `AC-SDK-04`: duplicate suppression.
- `AC-SDK-05`: redaction defaults.
- `AC-SDK-09`: in-process log capture.
- `AC-SDK-11`: universal interface consistency.
- `AC-SDK-12`: cross-context trace correlation.
- `AC-SDK-13`: loop protection recovery.
- Relay acceptance criteria from `contracts/sdk-interface.md` section 13 and `rules/sdk-testing-strategy.md`.

---

## Public API

The core SDK must expose a singleton-style API and an instance-based API so Spring Boot can use dependency injection without forcing global state on all Java users.

Minimum public methods:

```java
DebugBundle.init(DebugBundleConfig config);
DebugBundle.captureException(Throwable error);
DebugBundle.captureException(Throwable error, Map<String, Object> context);
DebugBundle.captureError(Throwable error);
DebugBundle.captureLog(String message, LogLevel level);
DebugBundle.captureLog(String message, LogLevel level, Map<String, Object> context);
DebugBundle.captureRequest(Object request, Object response, Map<String, Object> context);
DebugBundle.captureMessage(String message);
DebugBundle.captureMessage(String message, LogLevel level, Map<String, Object> context);
DebugBundle.setContext(String key, Object value);
DebugBundle.probe(String label, Object data);
DebugBundle.probe(String label, Supplier<?> data);
DebugBundle.probe(String label, Supplier<?> data, ProbeOptions options);
CompletableFuture<Void> DebugBundle.flush();
DebugBundleStatus DebugBundle.status();
Optional<Instant> DebugBundle.lastEventAt();
```

Spring applications should usually configure via properties:

```properties
debugbundle.project-token=${DEBUGBUNDLE_TOKEN}
debugbundle.environment=production
debugbundle.service=backend-api
debugbundle.project-mode=connected
```

The starter must also support explicit bean configuration for teams that do not want property-based setup.

### Runtime Compatibility

The SDK must compile with `--release 17` so Java 17 remains the minimum supported runtime. Newer JVMs are supported by normal Java forward-runtime compatibility as long as dependencies and the selected Spring Boot line support them.

Compatibility policy:

- Core SDK: support Java 17 and newer GA JVMs.
- Spring Boot starter: support Java 17 and newer GA JVMs within the compatibility range of the Spring Boot line under test.
- Spring Boot 3.x lane: target Spring Framework 6.x and servlet 5/6 environments.
- Spring Boot 4.x lane: validate Spring Framework 7.x and servlet 6.1 environments for Java 26 support when no adapter split is required.
- Do not use Java APIs newer than 17 in production code unless guarded behind version-specific modules or reflection.

### Vanilla Java Hooks

The core SDK must support Java without Spring:

```java
DebugBundle.init(config);
DebugBundle.captureUncaughtExceptions();
DebugBundle.captureJavaUtilLogging();
```

Vanilla hooks:

- `captureUncaughtExceptions()` installs a default `Thread.UncaughtExceptionHandler`, captures uncaught exceptions, and delegates to any previously configured handler.
- `captureJavaUtilLogging()` registers a `java.util.logging.Handler` that captures records at or above the configured log level.
- Hook registration must be explicit and idempotent.
- Importing the SDK or constructing config objects must have no side effects.

---

## Configuration

Required:

| Property | Description |
| --- | --- |
| `debugbundle.project-token` | Project token used by server-side transport. |

Important optional properties:

| Property | Default | Description |
| --- | --- | --- |
| `debugbundle.enabled` | `true` | Kill switch. |
| `debugbundle.environment` | auto-detect | Runtime environment name. |
| `debugbundle.service` | Spring application name or fallback | Service name. |
| `debugbundle.endpoint` | `https://api.debugbundle.com/v1/events` | Connected ingestion endpoint. |
| `debugbundle.project-mode` | `connected` | `connected` or `local-only`. |
| `debugbundle.local-events-dir` | `.debugbundle/local/events` | Local event file transport destination. |
| `debugbundle.spool-dir` | `.debugbundle/local/browser-relay-spool` | Durable relay spool destination. |
| `debugbundle.batch-size` | `25` | Max events per flush batch. |
| `debugbundle.flush-interval` | `5000ms` | Max delay before background flush. |
| `debugbundle.sample-rate` | `1.0` | Per-event sampling. |
| `debugbundle.log-level` | `warning` | Minimum captured log level. |
| `debugbundle.relay.enabled` | `true` | Enable `/debugbundle/browser` relay route. |
| `debugbundle.relay.rate-limit-per-minute` | `60` | Per-IP relay rate limit. |
| `debugbundle.relay.durable-write` | `true` | Connected relay writes spool before forwarding. |

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config`.

---

## Spring Boot Integration

### Auto-Configuration

The starter must provide Spring Boot 3 auto-configuration using `AutoConfiguration.imports`.

Auto-configured beans:

- `DebugBundleClient`
- `DebugBundleProperties`
- `DebugBundleServletFilter`
- `DebugBundleExceptionResolver`
- `DebugBundleRelayController`
- `DebugBundleLogbackAppender` registration helper when Logback is present
- optional `TaskDecorator` for async context propagation

Auto-configuration must back off when the application defines its own bean.

### Request Capture

Use `OncePerRequestFilter` for servlet request capture.

The filter must:

- Start a request context before downstream handlers run.
- Read incoming `X-DebugBundle-Trace-Id`.
- Read existing `X-Request-Id` when present.
- Preserve existing MDC values, especially `requestId`.
- Add DebugBundle correlation data to request-scoped context.
- Capture method, path, route pattern when available, sanitized allowlisted headers, response status, duration, service, environment, and runtime facts.
- Never block the request path on network I/O.
- Flush asynchronously according to normal batching rules.

If a request already has an application request ID, the SDK must attach it instead of generating a competing correlation concept. If no request ID exists, the SDK may generate one for its own events but must not force application response headers unless explicitly configured.

### Exception Capture

Exception capture must handle both propagated and framework-handled failures:

- The servlet filter captures exceptions that escape the downstream chain, then rethrows.
- A Spring `HandlerExceptionResolver` captures MVC exceptions and returns `null` so existing application exception handling continues.
- The SDK must not replace or reorder application `@RestControllerAdvice` behavior.
- Error capture should include exception class, message, stack trace, request context, trace ID, request ID, route, response status when known, runtime facts, and recent probe buffers.

### Logging and MDC

V1 should support Logback through an appender or appender wrapper because Logback is the default Spring Boot logging backend.

The logging integration must:

- Capture structured `log_event` records in-process.
- Respect `debugbundle.log-level` and server capture policy.
- Include logger name, level, message, throwable summary, timestamp, thread name, and MDC map after redaction.
- Preserve existing appenders and application logging behavior.
- Avoid recursive SDK logging capture.

SLF4J is the application-facing logging API, but the first concrete integration should be Logback. Log4j2 can be added later.

### Async and Virtual Thread Context

V1 must include a context propagation strategy for common Spring async execution:

- Thread-local request context for servlet request handling.
- MDC snapshot/restore around SDK-owned asynchronous work.
- Optional Spring `TaskDecorator` for `@Async` and configured task executors.
- Java 21 virtual threads must be safe: do not assume long-lived thread identity, and always scope context explicitly.

Reactive context propagation is out of scope until Spring WebFlux support.

---

## Browser Relay

The Spring Boot starter must provide a full relay handler at:

```text
POST /debugbundle/browser
```

It must implement the full relay contract in `contracts/sdk-interface.md` section 13:

- Accepted browser event types only.
- Same-origin validation using `Origin`, with `Referer` fallback.
- `Content-Type: application/json` enforcement.
- 256 KB request body limit.
- Schema validation and unknown-field stripping.
- Credential isolation: browser-supplied `project_token`, `organization_id`, and auth headers are stripped or rejected.
- Preserve browser-owned `correlation.trace_id`, `correlation.request_id`, `correlation.session_id`, and `correlation.user_id_hash`.
- Per-IP rate limiting.
- Local-only event file writes.
- Connected durable spool writes.
- Connected low-latency forwarding when durable writes are disabled.

Spring Security integration must avoid requiring user authentication for the relay endpoint by default while still enforcing origin, content type, size, schema, rate limit, and credential isolation. Documentation must show how to permit the endpoint in a `SecurityFilterChain`.

---

## Privacy Defaults

Java/Spring defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Redact sensitive values before buffering or transport.
- Hash stable user, account, organization, and patient references when provided through context helpers.
- Capture route templates and status/duration rather than raw payloads.
- Keep form/message/payload capture explicit opt-in.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`

Default redaction must cover at least the fields in `contracts/sdk-interface.md` and `rules/security-hardening.md`, including passwords, secrets, tokens, API keys, bearer values, authorization, cookies, phone, SSN, card data, OTPs, verification codes, and session identifiers.

If body capture is enabled, the SDK must require explicit size limits, content-type filters, and redaction. The starter should document that body capture is not recommended for healthcare or PHI workloads.

---

## Transport

The core SDK must implement:

- HTTP transport for connected staging and production.
- File transport for local and development modes.
- Local-only mode that writes events to `.debugbundle/local/events`.
- Connected durable relay spool for browser relay events.
- Retry and backoff for 429 and transient 5xx responses.
- `Retry-After` handling.
- Bounded in-memory buffers.
- Safe shutdown flush hooks where possible.

Transport failures must never throw into application code.

---

## Capture Policy and Probes

The Java SDK must fetch `GET /v1/sdk/config` on init and poll according to backend SDK rules.

It must enforce:

- capture logs level/off settings,
- request event capture modes,
- probe event capture modes,
- immediate client error status promotion,
- fallback to safe minimal behavior when config fetch fails.

Probe behavior must match the universal SDK contract:

- Always-on ring buffers for all tiers.
- `Supplier<?>` lazy probe support.
- `{ heavy: true }` equivalent through `ProbeOptions`.
- Remote activation for paid tiers through config polling.
- Trigger token extraction from `_debug_probe` and `X-DebugBundle-Probe-Trigger`.
- Per-request activation only for trigger tokens.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

Spring request and exception events must include:

- `sdk_name`: `@debugbundle/sdk-java`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `trace_id` when `X-DebugBundle-Trace-Id` is present
- `correlation.request_id` when known
- sanitized payload
- safe runtime facts

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Implementation Slices

1. Repository scaffold and build
   - Create `debugbundle-java` with CI on Java 17 and Java 21.
   - Add core and Spring Boot starter modules.
   - Add publishing metadata for Maven Central.

2. Core event client
   - Config model, singleton and instance APIs, event envelope builder, buffer, flush, status, last event timestamp.
   - Mockable transport interface and HTTP transport.

3. Redaction and privacy
   - Default redaction rules.
   - Header allowlist.
   - Request/response body capture disabled by default.
   - Tests for healthcare-style sensitive fields.

4. Suppression and backoff
   - Duplicate suppression.
   - Loop protection.
   - Retry, `Retry-After`, and bounded buffers.

5. Spring request and exception capture
   - `OncePerRequestFilter`.
   - MVC exception resolver.
   - Request ID, MDC, trace ID, and route capture.
   - Java 21 virtual-thread-safe request context.

6. Logging integration
   - Logback appender integration.
   - MDC capture and redaction.
   - Recursion guard.

7. Local-first transport
   - Atomic local event file writes.
   - Local-only mode.
   - Shutdown flush behavior.

8. Capture policy and probes
   - Config fetch and polling.
   - Capture policy enforcement.
   - Always-on probe buffers.
   - Remote activations and trigger tokens.

9. Browser relay
   - Spring relay route.
   - Origin/content-type/size/schema/rate-limit controls.
   - Local-only writes, durable spool, and connected forwarding.
   - Shared relay compliance fixture coverage.

10. Documentation and examples
   - Spring Boot quickstart.
   - Maven and Gradle install snippets.
   - Spring Security `SecurityFilterChain` example.
   - Privacy and PHI guidance.
   - Local-only and connected setup.

---

## Testing Plan

The Java SDK repository must own its test suite.

Required test groups:

- Core API unit tests for all universal methods.
- Event envelope serialization tests against canonical schemas.
- Redaction tests for default and custom sensitive fields.
- Suppression and loop protection tests.
- Retry/backoff tests using a mock HTTP server.
- File transport atomic-write tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger token tests.
- Spring Boot integration tests with MockMvc or WebTestClient on servlet MVC.
- Logback appender tests.
- Spring Security relay endpoint tests.
- Relay compliance fixtures for valid, invalid, credential-smuggling, wrong-origin, oversized, rate-limited, local-only, durable-spool, and connected-forwarding cases.

CI matrix:

```text
Java 17
Java 21
Java 25
Java 26
Spring Boot lowest supported 3.x baseline on Java 17
Spring Boot current 3.x line on Java 21 and Java 25
Spring Boot current 4.x line on Java 26, when adapter compatibility permits
```

The Java SDK must not require the full DebugBundle Docker stack for tests. Integration tests should use mock HTTP ingestion endpoints and local temp directories.

---

## Release Readiness Checklist

- Universal Java API implemented.
- Spring Boot starter auto-configures cleanly with one property block.
- Java 17, Java 21, Java 25, and Java 26 CI lanes are green for the applicable core/starter matrix.
- Request, exception, log, probe, and relay behavior covered by tests.
- Relay handler passes the shared relay compliance fixtures.
- Capture policy is enforced locally with ingestion as a backstop.
- SDK failures never throw into host application code.
- Request and response bodies are off by default.
- Header capture is allowlist-based by default.
- Existing `X-Request-Id` and MDC `requestId` are preserved.
- `X-DebugBundle-Trace-Id` links browser and backend events.
- Maven Central artifacts build and include source/javadoc jars.
- Public docs include Maven, Gradle, Spring Boot, Spring Security, local-only, connected, and privacy examples.

---

## Open Decisions

- Whether the SDK repo should use Maven or Gradle internally for its own build and release automation.
- Whether `debugbundle-java-core` should replace the current `com.debugbundle:sdk-java` placeholder in `contracts/sdk-interface.md`, or whether `sdk-java` should remain as a convenience aggregate artifact.
- Whether Log4j2 support should ship with V1 or follow after Logback.
- Whether generated Java event model classes should be produced from DebugBundle schemas or maintained manually.
- Whether route template extraction should rely on Spring MVC best-matching-pattern attributes only, or include a fallback normalizer in the starter.
- Whether the Spring relay endpoint path should be configurable beyond `/debugbundle/browser` in V1.
