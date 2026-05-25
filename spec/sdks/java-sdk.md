# Java SDK Implementation Plan

Version: v1
Last updated: 2026-05-24

---

## Purpose

This plan defines the Java SDK surface for DebugBundle. The goal is a production-ready Java SDK that works across modern Java backends, not a Spring Boot-only adapter.

The Java SDK must support two first-class deployment shapes:

- Spring Boot 3.x services, using an ergonomic starter backed by the reusable Java core SDK.
- Classic JVM application-server deployments, including servlet, JSF, JAX-RS, WildFly, and JBoss-style one-JVM/multi-WAR applications.

The Spring Boot starter remains a first-class integration, but it must be composed from lower-level Java core and web/app-server modules. The core SDK cannot assume an embedded server model, Spring dependency injection, or a single deployable per JVM.

The Java SDK must satisfy the universal SDK contract in `contracts/sdk-interface.md`, the Java target guidance in `spec/sdk-language-targets.md`, and the SDK testing strategy in `rules/sdk-testing-strategy.md`.

---

## Coverage Posture

### Spring Boot Services

Spring Boot 3.x on Java 21 is directly supported through `debugbundle-spring-boot-starter`. This is the right path for modern Spring MVC API services.

### Classic App-Server Monoliths

Classic WildFly/JBoss monoliths can be supported only if V1 includes app-server layers in addition to Spring Boot:

- `debugbundle-java-core` for manual capture, buffering, redaction, suppression, probes, capture policy, and transport.
- Servlet adapters for both `jakarta.servlet` and `javax.servlet` namespace families.
- JAX-RS adapters for both `jakarta.ws.rs` and `javax.ws.rs` namespace families, with RESTEasy compatibility as a required lane.
- JSF coverage through servlet request/exception capture, with optional JSF-aware route/view metadata where available.
- A startup `javaagent` bootstrap for Docker and application-server startup injection when changing every WAR is impractical.
- Multi-deployment isolation so one JVM hosting several WAR/JAR deployables does not collapse all events into one service.

Without those additions, the Spring Boot starter alone would not cover a WildFly/JBoss monolith. With them, the core can support both the monolith and the Spring Boot service while preserving SDK parity.

### Browser Frontends

Java SDKs do not instrument React or browser-side JS incidents. Browser coverage for React, Vite, Material UI, or JSF-rendered pages requires the DebugBundle browser SDK. Java server adapters provide the same-origin browser relay endpoint so browser events can be delivered without browser-side cloud credentials.

---

## Scope

### V1 In Scope

- Java core SDK for manual capture and shared runtime behavior.
- Java >=17 runtime support.
- Java 17 compile/release target.
- Java 21 tested and recommended for current LTS deployments.
- Java 25 and Java 26 compatibility validation for core SDK lanes.
- Spring Boot 3.x, Spring Framework 6.x, and `jakarta.servlet` support through a Spring Boot starter.
- Spring Boot 4.x and Spring Framework 7.x validation lane for Java 26 compatibility when the adapter code remains compatible.
- Generic servlet request/exception capture for `jakarta.servlet` 5.x/6.x and `javax.servlet` 4.x style applications running on supported Java runtimes.
- JAX-RS request/exception capture for `jakarta.ws.rs` and `javax.ws.rs`, including RESTEasy compatibility for WildFly/JBoss deployments.
- JSF/Facelets request coverage through servlet capture, including JSF view ID or sanitized request path when available.
- WildFly/JBoss application-server support for Java 21 Docker deployments, including one JVM hosting multiple WAR/JAR deployables.
- Docker/container startup injection through `-javaagent` for app-server JVMs.
- Explicit WAR-level installation for teams that prefer dependency-based setup over javaagent startup injection.
- Local-only and connected transports.
- Browser relay handlers compatible with the server SDK relay contract for both Spring Boot and servlet app-server deployments.
- In-process log capture for Java Util Logging, Spring Boot Logback, and WildFly/JBoss logging via JBoss LogManager where available.
- Conservative privacy defaults suitable for healthcare, financial, and enterprise applications.

### V1 Out of Scope

- Java 8 and Java 11 runtime support.
- Spring Boot 2.x support.
- Spring WebFlux and Reactor context propagation.
- Micronaut, Quarkus, Dropwizard, gRPC Java, and non-servlet frameworks.
- Deep ORM, SQL, HTTP client, JPA, Hibernate, Elasticsearch, mail, or Camel auto-instrumentation.
- Automatic capture of EJB timers, MDBs, batch jobs, or Camel route failures unless they pass through supported request/log/manual capture paths.
- Arbitrary bytecode instrumentation as the primary capture mechanism.
- Attaching to an already-running JVM in V1. The javaagent support is startup injection through `-javaagent`, not dynamic attach.
- JSF component-tree, form-value, PrimeFaces widget, or page-state capture beyond safe servlet/route/error metadata.

---

## Artifacts

The Java SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-java
```

Publish Maven Central artifacts under group `com.debugbundle`:

| Artifact | Purpose |
| --- | --- |
| `debugbundle-java-core` | Core client, event model, buffering, transport, redaction, probes, suppression, capture policy, manual capture API, Java runtime hooks. |
| `debugbundle-java-web` | Adapter-neutral web request model, request context, route/correlation extraction helpers, relay engine, and shared servlet/JAX-RS support code. Not usually installed directly by consumers. |
| `debugbundle-java-servlet-jakarta` | Servlet filter, listener, relay servlet, and request capture for `jakarta.servlet` deployments. |
| `debugbundle-java-servlet-javax` | Servlet filter, listener, relay servlet, and request capture for `javax.servlet` deployments on Java 17+ app servers. |
| `debugbundle-java-jaxrs-jakarta` | JAX-RS filters/providers and exception capture for `jakarta.ws.rs` deployments. |
| `debugbundle-java-jaxrs-javax` | JAX-RS filters/providers and exception capture for `javax.ws.rs` deployments such as RESTEasy on WildFly/JBoss. |
| `debugbundle-spring-boot-starter` | Spring Boot auto-configuration, Spring MVC exception capture, relay route, MDC/log integration, configuration properties. Composes the Jakarta servlet support. |
| `debugbundle-java-agent` | Startup javaagent bootstrap for app-server JVM injection, global SDK config loading, app-server web/log hook registration, and multi-deployment service mapping. |

Suggested Java package roots:

| Package | Owner |
| --- | --- |
| `com.debugbundle.sdk` | Core SDK public API and implementation. |
| `com.debugbundle.sdk.transport` | HTTP and file transports. |
| `com.debugbundle.sdk.redaction` | Java redaction implementation. |
| `com.debugbundle.sdk.probe` | Probe ring buffers and activation state. |
| `com.debugbundle.sdk.web` | Adapter-neutral request context, route/correlation helpers, relay engine. |
| `com.debugbundle.servlet.jakarta` | Jakarta Servlet adapter. |
| `com.debugbundle.servlet.javax` | Javax Servlet adapter. |
| `com.debugbundle.jaxrs.jakarta` | Jakarta JAX-RS adapter. |
| `com.debugbundle.jaxrs.javax` | Javax JAX-RS adapter. |
| `com.debugbundle.spring.boot` | Spring Boot starter and auto-configuration. |
| `com.debugbundle.agent` | Javaagent bootstrap and app-server discovery. |

The repository build uses Maven as a multi-module project. Consumer installation examples must be documented for Maven and Gradle. App-server examples must also include Docker, WildFly/JBoss startup, `web.xml`, and system-property/property-file setup paths.

The core SDK must keep its dependency footprint conservative. Non-JDK dependencies used by the agent or app-server modules must be shaded or isolated when needed so DebugBundle does not force application-server library upgrades or conflict with application-provided Jackson, logging, servlet, JAX-RS, or CDI libraries.

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-03`: backend request, response, exception, log, service, deploy, and correlation capture.
- `FR-SDK-05`: normalized event types, including `backend_exception`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-06`, `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: batching, sampling, duplicate suppression, and loop protection.
- `FR-SDK-16`: universal backend SDK interface, Java camelCase naming.
- `FR-SDK-17`, `FR-SDK-18`, `FR-SDK-19`, `FR-SDK-20`, `FR-SDK-21`: vanilla hooks and in-process log capture.
- `FR-SDK-22`: read `X-DebugBundle-Trace-Id` and attach it to backend events.
- `FR-SDK-35`: Java backend SDK parity, with Spring Boot and servlet/app-server surfaces as Java's V1 framework coverage.
- `FR-CLI-07`, `FR-CLI-08`, `FR-CLI-09`, `FR-CLI-13`: setup/doctor detection, verification, and zero-install fallback coverage for Java runtimes.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `contracts/sdk-interface.md` sections 1 through 13.
- `rules/security-hardening.md` relay, local file, path validation, retry, redaction, and trace-header requirements.
- `rules/sdk-testing-strategy.md` SDK, contract, relay, and compatibility tiers.

Primary acceptance coverage includes `AC-SDK-04`, `AC-SDK-05`, `AC-SDK-09`, `AC-SDK-11`, `AC-SDK-12`, `AC-SDK-13`, `AC-CLI-04`, `AC-CLI-05`, `AC-CLI-06`, `AC-CLI-13`, `AC-CLI-15`, plus relay acceptance from `contracts/sdk-interface.md` section 13 and `rules/sdk-testing-strategy.md`.

---

## Manual Validation Hardening

Manual SDK setup feedback reinforces several release requirements already implied by the Java plan. These are durable product-hardening gates, not one-off customer accommodations.

The Java SDK release must include a complete configuration reference. The reference must list every supported builder option, Spring property, environment variable, JVM system property, servlet init/context parameter, and javaagent properties-file key, including default values and source precedence. It must explicitly document that capture-policy fields are server-owned and are not accepted from local config.

The Java SDK release must publish install examples for every supported setup mode rather than only the Spring Boot starter path:

- Spring Boot auto-configuration with Maven and Gradle snippets.
- Explicit Spring bean configuration for teams that cannot use property-only setup.
- WAR-level servlet filter/listener and relay servlet setup for both `jakarta.servlet` and `javax.servlet` deployments.
- JAX-RS and RESTEasy setup for both namespace families.
- WildFly/JBoss Docker and startup-script javaagent injection.
- Local-only, connected, and zero-install `debugbundle-ndjson` fallback setup.

The compatibility docs must use consistent support labels: supported, recommended, validation lane, installed-base compatibility, and out of scope. Spring Boot 2.x remains out of scope for V1; documentation should say that plainly instead of implying partial or untested support. Likewise, `javax` support means Java EE namespace compatibility on Java 17+ app-server lanes, not Java 8 or Java 11 runtime support.

Published artifacts must include a Maven BOM or equivalent dependency-alignment guidance for Maven and Gradle so consumers can keep `core`, `web`, servlet, JAX-RS, starter, and agent modules on one coherent version. Examples must avoid mixed-version snippets.

Browser relay documentation must be first-class in the Java SDK docs because Java is a server-side relay host for browser events. The docs must include production-ready Spring Security and Java EE/Jakarta EE security examples for `POST /debugbundle/browser`, including same-origin defaults, explicit allowed origins for split frontend/backend hosts, content-type enforcement, request-size limits, rate limiting, credential isolation, local-only behavior, connected durable spool behavior, connected forwarding, and the behavior when relay is disabled.

Service naming guidance must cover multi-surface applications. A Java backend service, a browser frontend service, and multiple WARs in one JVM must be able to keep distinct service identities while sharing correlation through `X-DebugBundle-Trace-Id`. Public examples should recommend explicit service names for production and show how a backend relay preserves browser-owned service fields unless an operator intentionally configures a relay-level override.

The Java SDK must expose safe startup diagnostics. If connected mode is enabled but the project token is missing or invalid, the SDK must not crash the host application or throw into request handling. It must enter a disabled or degraded state, expose that state through `DebugBundle.status()` and setup/doctor diagnostics, and avoid silently reporting a healthy connected state. Local-only mode must remain usable without a project token.

Java release verification must include an app-driven smoke path in addition to CLI synthetic checks. A minimal supported Java application must initialize the SDK, call `captureException`, call `flush`, and verify that the event reaches a hosted or mock ingestion project with the expected service, environment, and correlation fields. This check proves the public dependency snippets, configuration precedence, transport, and flush behavior together.

These gates do not add Spring Boot 2.x, deployment automation for specific customer infrastructure, or framework coverage outside V1 scope. They make the supported Java surfaces easier to install correctly and harder to publish in a partially documented state.

---

## Public API

The core SDK must expose a singleton-style API and an instance-based API. Spring Boot can use dependency injection, app-server deployments can create one client per deployment, and vanilla Java users can still use a simple static entry point.

Minimum public singleton methods:

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

Minimum instance API:

```java
DebugBundleClient client = DebugBundle.create(config);
client.captureException(error, context);
client.captureLog("message", LogLevel.WARNING, context);
client.probe("checkout.pricing", () -> pricingSnapshot);
client.flush();
```

Web and app-server adapters must use the instance API internally. The static singleton is suitable for simple applications and manual capture, but it must not force all deployments in a shared JVM to share one service identity or request context.

### Runtime Hooks

The core SDK must support Java without Spring or servlet dependencies:

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
| `debugbundle.service` | auto-detect | Service name. Spring uses application name; servlet/app-server adapters use context root or deployment name unless overridden. |
| `debugbundle.endpoint` | `https://api.debugbundle.com/v1/events` | Connected ingestion endpoint. |
| `debugbundle.project-mode` | `connected` | `connected` or `local-only`. |
| `debugbundle.local-events-dir` | `.debugbundle/local/events` | Local event file transport destination. |
| `debugbundle.spool-dir` | `.debugbundle/local/browser-relay-spool` | Durable relay spool destination. |
| `debugbundle.batch-size` | `25` | Max events per flush batch. |
| `debugbundle.flush-interval` | `5000ms` | Max delay before background flush. |
| `debugbundle.sample-rate` | `1.0` | Per-event sampling. |
| `debugbundle.log-level` | `warning` | Minimum captured log level. |
| `debugbundle.relay.enabled` | `true` | Enable `/debugbundle/browser` relay route when the adapter supports route registration. |
| `debugbundle.relay.rate-limit-per-minute` | `60` | Per-IP relay rate limit. |
| `debugbundle.relay.durable-write` | `true` | Connected relay writes spool before forwarding. |

Configuration sources must include:

- Programmatic `DebugBundleConfig` builder.
- Spring Boot properties.
- JVM system properties.
- Environment variables such as `DEBUGBUNDLE_TOKEN`, `DEBUGBUNDLE_ENVIRONMENT`, `DEBUGBUNDLE_SERVICE`, and `DEBUGBUNDLE_PROJECT_MODE`.
- Properties file path supplied to the javaagent or app-server bootstrap.
- Servlet context params and filter init params for WAR-level installation.

For shared app-server JVMs, configuration must support per-deployment service overrides. A global token/environment may be shared, but service names and optional deployment-specific settings must be resolvable by context root, WAR module name, or explicit deployment key.

Example app-server deployment mapping:

```properties
debugbundle.project-token=${DEBUGBUNDLE_TOKEN}
debugbundle.environment=production
debugbundle.project-mode=connected
debugbundle.deployments.web-portal.service=web-portal
debugbundle.deployments.identity-api.service=identity-api
debugbundle.deployments.data-api.service=data-api
debugbundle.deployments.terminology-api.service=terminology-api
```

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config`.

---

## Setup and Deployment Modes

### Spring Boot

Spring applications should usually configure via properties:

```properties
debugbundle.project-token=${DEBUGBUNDLE_TOKEN}
debugbundle.environment=production
debugbundle.service=api-backend
debugbundle.project-mode=connected
```

The starter must also support explicit bean configuration for teams that do not want property-based setup.

### WAR-Level Servlet/JAX-RS Install

For app-server deployments where each WAR can be changed, install the correct servlet namespace artifact in each deployable and configure the filter/listener through `web.xml`, a `ServletContainerInitializer`, or framework-native registration.

For WildFly/JBoss Java EE-style applications using `javax.*` APIs, use the `javax` artifacts. For newer Jakarta EE 9+ applications using `jakarta.*`, use the `jakarta` artifacts.

Example `web.xml` shape:

```xml
<context-param>
  <param-name>debugbundle.service</param-name>
   <param-value>web-portal</param-value>
</context-param>

<filter>
  <filter-name>DebugBundle</filter-name>
  <filter-class>com.debugbundle.servlet.javax.DebugBundleServletFilter</filter-class>
</filter>
<filter-mapping>
  <filter-name>DebugBundle</filter-name>
  <url-pattern>/*</url-pattern>
</filter-mapping>

<servlet>
  <servlet-name>DebugBundleRelay</servlet-name>
  <servlet-class>com.debugbundle.servlet.javax.DebugBundleRelayServlet</servlet-class>
</servlet>
<servlet-mapping>
  <servlet-name>DebugBundleRelay</servlet-name>
  <url-pattern>/debugbundle/browser</url-pattern>
</servlet-mapping>
```

### App-Server Javaagent Startup Injection

For one JVM hosting many deployables, or for environments where changing every WAR is expensive, V1 must provide startup injection through `-javaagent`.

Example Docker/WildFly shape:

```sh
JAVA_OPTS="$JAVA_OPTS -javaagent:/opt/debugbundle/debugbundle-java-agent.jar=config=/opt/debugbundle/debugbundle.properties"
exec /opt/jboss/wildfly/bin/standalone.sh -b 0.0.0.0
```

The javaagent must:

- Load core SDK configuration before application deployments handle requests.
- Register supported servlet/JAX-RS/logging hooks without requiring Spring Boot.
- Preserve per-deployment service identity in a shared JVM.
- Avoid leaking SDK classes into application classloaders except through the supported API bridge.
- Fail closed to no-op capture if a container hook cannot be safely registered.

The javaagent is a bootstrap and integration mechanism. It must not depend on broad bytecode weaving to meet V1 parity.

### Zero-Install Fallback

When neither WAR changes nor javaagent startup injection is feasible, DebugBundle must still document a zero-install fallback for Java environments: emit canonical `debugbundle-ndjson` through existing logs or a small sidecar/adapter and ingest it with `debugbundle ingest` or `debugbundle watch`. This path does not provide full SDK parity, but it satisfies the required ecosystem fallback and gives operators a bridge until SDK installation is possible.

---

## Runtime Compatibility

The SDK must compile with `--release 17` so Java 17 remains the minimum supported runtime. Newer JVMs are supported by normal Java forward-runtime compatibility as long as dependencies and the selected framework/container line support them.

Compatibility policy:

- Core SDK: support Java 17 and newer GA JVMs.
- Java 21: recommended and tested for current LTS deployments.
- Java 25 and Java 26: compatibility validation lanes for the core SDK, and for adapters where the framework/container line supports them.
- Spring Boot starter: support Java 17 and newer GA JVMs within the compatibility range of the Spring Boot line under test.
- Spring Boot 3.x lane: target Spring Framework 6.x and servlet 5/6 environments.
- Spring Boot 4.x lane: validate Spring Framework 7.x and servlet 6.1 environments for Java 26 support when no adapter split is required.
- `debugbundle-java-servlet-javax`: support Servlet 4.x / Java EE 8 style APIs on Java 17+ app servers. This is namespace compatibility, not Java 8/11 support.
- `debugbundle-java-servlet-jakarta`: support Servlet 5.x/6.x/6.1 style APIs.
- `debugbundle-java-jaxrs-javax`: support JAX-RS 2.x style APIs and RESTEasy compatibility for WildFly/JBoss lanes.
- `debugbundle-java-jaxrs-jakarta`: support Jakarta REST 3.x style APIs.
- WildFly/JBoss compatibility lane: validate a Docker-started WildFly/JBoss app-server process with multiple deployed WAR/JAR applications in one JVM on Java 21 where the selected server image can run on that JVM. Public docs must note upstream server support status when an older app-server line is tested for installed-base compatibility.
- Do not use Java APIs newer than 17 in production code unless guarded behind version-specific modules or reflection.

---

## Servlet, JAX-RS, and App-Server Integration

### Request Capture

Servlet adapters must capture requests through a filter that runs around downstream handlers.

The filter must:

- Start a request context before downstream handlers run.
- Read incoming `X-DebugBundle-Trace-Id`.
- Read existing `X-Request-Id` when present.
- Preserve existing MDC values, especially `requestId`.
- Add DebugBundle correlation data to request-scoped context.
- Capture method, path, route pattern when available, sanitized allowlisted headers, response status, duration, service, environment, deployment identity, and runtime facts.
- Never block the request path on network I/O.
- Flush asynchronously according to normal batching rules.

If a request already has an application request ID, the SDK must attach it instead of generating a competing correlation concept. If no request ID exists, the SDK may generate one for its own events but must not force application response headers unless explicitly configured.

### JSF Coverage

JSF applications should be covered through the servlet filter because JSF requests still flow through the servlet container.

The SDK should capture:

- Request and response metadata for JSF page requests and AJAX requests.
- Exceptions that escape the JSF lifecycle into the servlet container.
- Sanitized route/view metadata such as JSF view ID or XHTML path when available.

The SDK must not capture component-tree state, form field values, view state payloads, or PrimeFaces widget data by default.

### JAX-RS and RESTEasy Coverage

JAX-RS adapters must provide request filters, response filters, and exception mappers/providers where available.

The JAX-RS integration must:

- Preserve servlet-level correlation context when running inside a servlet container.
- Capture resource class/method and route template when available through JAX-RS metadata.
- Capture framework-handled exceptions without replacing application exception mappers.
- Return control to existing exception handling, similarly to the Spring MVC resolver behavior.
- Support RESTEasy compatibility for WildFly/JBoss lanes.

### Exception Capture

Exception capture must handle propagated and framework-handled failures:

- The servlet filter captures exceptions that escape the downstream chain, then rethrows.
- JAX-RS providers capture mapped REST exceptions and return control so existing application handlers continue.
- Spring MVC resolver captures MVC exceptions and returns `null` so existing application exception handling continues.
- The SDK must not replace, reorder, or swallow application exception behavior.
- Error capture should include exception class, message, stack trace, request context, trace ID, request ID, route, response status when known, runtime facts, deployment identity, and recent probe buffers.

### One JVM With Multiple Deployments

WildFly/JBoss deployments may host many WAR/JAR applications inside one JVM. The SDK must model this explicitly.

Rules:

- Each deployment gets an isolated `DebugBundleClient` or logical client scope with its own service name, request context, probe buffers, suppression state, and last-event status.
- A shared transport executor may be used only if it preserves per-service event envelopes and never leaks request context across deployments.
- Service name auto-detection may use context root, servlet context name, deployment unit name, or WAR filename, but production docs must recommend explicit names.
- Global static context must not cause events from `identity-api.war`, `data-api.war`, and `web-portal.war` to appear as one service unless the operator configures them that way.

### Logging and MDC

Java logging integration must capture structured `log_event` records in-process.

V1 must support:

- Java Util Logging through a `Handler`.
- Logback for Spring Boot.
- JBoss LogManager where available for WildFly/JBoss.

The logging integration must:

- Respect `debugbundle.log-level` and server capture policy.
- Include logger name, level, message, throwable summary, timestamp, thread name, MDC map where available, and deployment/service identity after redaction.
- Preserve existing appenders/handlers and application logging behavior.
- Avoid recursive SDK logging capture.

SLF4J is the common application-facing logging API, but concrete capture must integrate with the active backend. Log4j2 support can follow after V1 unless a V1 app-server lane requires it.

### Async, Threads, and Context

V1 must include a context propagation strategy for common Java server execution:

- Thread-local request context for servlet request handling.
- MDC snapshot/restore around SDK-owned asynchronous work.
- Spring `TaskDecorator` for `@Async` and configured task executors.
- Java 21 virtual-thread safety: do not assume long-lived thread identity, and always scope context explicitly.

EJB timers, MDBs, Camel routes, and background executors are not auto-instrumented in V1. They can be covered through manual capture, log capture, probes, or future dedicated adapters.

---

## Spring Boot Integration

### Auto-Configuration

The starter must provide Spring Boot 3 auto-configuration using `AutoConfiguration.imports`.

Auto-configured beans:

- `DebugBundleClient`
- `DebugBundleProperties`
- `DebugBundleServletFilter`
- `DebugBundleExceptionResolver`
- `DebugBundleRelayController` or equivalent relay handler registration
- `DebugBundleLogbackAppender` registration helper when Logback is present
- optional `TaskDecorator` for async context propagation

Auto-configuration must back off when the application defines its own bean.

The Spring Boot starter must compose the generic Java core and Jakarta servlet/web modules instead of implementing a separate capture pipeline.

### Spring MVC Request and Exception Capture

Use `OncePerRequestFilter` for servlet request capture.

The Spring filter follows the same request-capture rules as the generic servlet filter and additionally captures Spring MVC route pattern metadata when available.

Exception capture must handle both propagated and framework-handled failures:

- The servlet filter captures exceptions that escape the downstream chain, then rethrows.
- A Spring `HandlerExceptionResolver` captures MVC exceptions and returns `null` so existing application exception handling continues.
- The SDK must not replace or reorder application `@RestControllerAdvice` behavior.

Spring Security integration must avoid requiring user authentication for the relay endpoint by default while still enforcing origin, content type, size, schema, rate limit, and credential isolation. Documentation must show how to permit the endpoint in a `SecurityFilterChain`.

---

## Browser Relay

All Java web surfaces that claim relay parity must provide a full relay handler at:

```text
POST /debugbundle/browser
```

Required Java relay surfaces:

- Spring Boot relay route/controller or registered handler.
- Servlet relay servlet for `jakarta.servlet` deployments.
- Servlet relay servlet for `javax.servlet` deployments.

The relay must implement the full contract in `contracts/sdk-interface.md` section 13:

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

App-server security integration must make it possible to expose the relay endpoint without requiring application user authentication while still enforcing origin, content type, size, schema, rate limit, and credential isolation. Documentation must include examples for Spring Security and Java EE/Jakarta EE security constraints.

---

## Privacy Defaults

Java defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Redact sensitive values before buffering or transport.
- Hash stable user, account, organization, and patient references when provided through context helpers.
- Capture route templates, view IDs, status, duration, service, environment, and deployment facts rather than raw payloads.
- Keep form/message/payload capture explicit opt-in.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`
- `faces-request`

Default redaction must cover at least the fields in `contracts/sdk-interface.md` and `rules/security-hardening.md`, including passwords, secrets, tokens, API keys, bearer values, authorization, cookies, phone, SSN, card data, OTPs, verification codes, session identifiers, and JSF view-state fields.

If body capture is enabled, the SDK must require explicit size limits, content-type filters, and redaction. The SDK docs should state that body capture is not recommended for healthcare or PHI workloads.

---

## Transport

The core SDK must implement:

- HTTP transport for connected staging and production.
- File transport for local and development modes.
- Local-only mode that writes events to `.debugbundle/local/events`.
- Connected durable relay spool for browser relay events.
- Retry and backoff for 429 and transient 5xx responses.
- `Retry-After` handling with bounded maximum delay.
- Bounded in-memory buffers.
- Safe shutdown flush hooks where possible.
- Owner-only local file permissions and symlink/path-traversal protections required by `rules/security-hardening.md`.

Transport failures must never throw into application code.

For application servers, shutdown hooks must be best-effort and must not delay container shutdown indefinitely. Servlet context destruction and JVM shutdown should both attempt bounded flushes.

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

In shared app-server JVMs, probe buffers must be isolated by deployment/service unless the operator intentionally configures a shared client.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

Java request and exception events must include:

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
- deployment identity when available
- framework/container metadata when safe

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Implementation Slices

1. Repository scaffold and build
   - Create `debugbundle-java` with CI on Java 17, Java 21, Java 25, and Java 26 where applicable.
   - Add core, web-common, servlet, JAX-RS, Spring Boot, and javaagent modules.
   - Add publishing metadata for Maven Central.

2. Core event client
   - Config model, singleton and instance APIs, event envelope builder, buffer, flush, status, last event timestamp.
   - Mockable transport interface and HTTP transport.

3. Redaction and privacy
   - Default redaction rules.
   - Header allowlist.
   - Request/response body capture disabled by default.
   - Tests for healthcare-style sensitive fields, JSF view state, session IDs, and auth cookies.

4. Suppression and backoff
   - Duplicate suppression.
   - Loop protection.
   - Retry, `Retry-After`, and bounded buffers.

5. Local-first transport
   - Atomic local event file writes.
   - Local-only mode.
   - File permission, symlink, and path validation hardening.
   - Shutdown/context-destroy flush behavior.

6. Adapter-neutral web core
   - Request context model.
   - Correlation and request ID handling.
   - Route/template extraction interfaces.
   - Shared relay engine.

7. Servlet adapters
   - `jakarta.servlet` filter/listener/relay servlet.
   - `javax.servlet` filter/listener/relay servlet.
   - Multi-deployment service isolation.
   - JSF-compatible request capture.

8. JAX-RS and RESTEasy adapters
   - `jakarta.ws.rs` filters/providers.
   - `javax.ws.rs` filters/providers.
   - Resource method/template capture.
   - Framework-handled exception capture.

9. Spring Boot starter
   - `OncePerRequestFilter` and MVC exception resolver.
   - Request ID, MDC, trace ID, and route capture.
   - Java 21 virtual-thread-safe request context.
   - Spring Security relay documentation.

10. Logging integration
   - Java Util Logging handler.
   - Logback appender integration.
   - JBoss LogManager handler integration where available.
   - MDC capture and redaction.
   - Recursion guard.

11. Javaagent and app-server bootstrap
   - `-javaagent` startup config loading.
   - WildFly/JBoss Docker startup examples.
   - Container hook registration for supported servlet/JAX-RS/logging surfaces.
   - Per-deployment service mapping.
   - Classloader isolation tests.

12. Capture policy and probes
   - Config fetch and polling.
   - Capture policy enforcement.
   - Always-on probe buffers.
   - Remote activations and trigger tokens.
   - Deployment-isolated probe buffers for app servers.

13. Browser relay
   - Spring relay route.
   - Servlet relay servlet for `jakarta` and `javax` deployments.
   - Origin/content-type/size/schema/rate-limit controls.
   - Local-only writes, durable spool, and connected forwarding.
   - Shared relay compliance fixture coverage.

14. Documentation, setup, and examples
   - Spring Boot quickstart.
   - Maven and Gradle install snippets.
   - WildFly/JBoss Docker startup injection guide.
   - WAR-level servlet/JAX-RS installation guide.
   - One-JVM/multi-WAR service mapping guide.
   - Spring Security and Java EE/Jakarta EE relay security examples.
   - Privacy and PHI guidance.
   - Local-only, connected, and zero-install `debugbundle-ndjson` fallback setup.
   - CLI `doctor` detection and verification expectations for Java modes.

---

## Testing Plan

The Java SDK repository must own its test suite.

Required test groups:

- Core API unit tests for all universal methods.
- Event envelope serialization tests against canonical schemas.
- Redaction tests for default and custom sensitive fields.
- Suppression and loop protection tests.
- Retry/backoff tests using a mock HTTP server.
- File transport atomic-write, permissions, symlink, and path-validation tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger token tests.
- Java Util Logging handler tests.
- Logback appender tests.
- JBoss LogManager handler tests where the dependency lane is available.
- Servlet adapter tests for both `jakarta.servlet` and `javax.servlet` namespaces.
- JAX-RS adapter tests for both `jakarta.ws.rs` and `javax.ws.rs` namespaces.
- RESTEasy compatibility tests for request metadata and exception capture.
- JSF-style servlet flow tests that verify request/exception capture without capturing form/view-state data.
- Spring Boot integration tests with MockMvc or WebTestClient on servlet MVC.
- Spring Security relay endpoint tests.
- Java EE/Jakarta EE security constraint relay tests.
- Multi-deployment tests proving separate service names, buffers, probe state, and suppression state in one JVM.
- Javaagent startup injection tests in Docker.
- WildFly/JBoss smoke test with multiple deployables copied into one server process.
- Relay compliance fixtures for valid, invalid, credential-smuggling, wrong-origin, oversized, rate-limited, local-only, durable-spool, and connected-forwarding cases.

CI matrix:

```text
Java 17 core
Java 21 core
Java 25 core
Java 26 core
Spring Boot lowest supported 3.x baseline on Java 17
Spring Boot 3.3.x on Java 21
Spring Boot current 3.x line on Java 21 and Java 25 where supported
Spring Boot current 4.x line on Java 26 when adapter compatibility permits
Servlet javax lane on Java 17 and Java 21
Servlet jakarta lane on Java 17, Java 21, and newer supported JVMs
JAX-RS javax / RESTEasy lane on Java 17 and Java 21
JAX-RS jakarta lane on Java 17, Java 21, and newer supported JVMs
WildFly/JBoss Docker app-server lane on Java 21 with multiple WAR/JAR deployables when the selected server image supports that JVM
```

The Java SDK must not require the full DebugBundle Docker stack for tests. Integration tests should use mock HTTP ingestion endpoints and local temp directories. App-server compatibility tests may use Docker images for WildFly/JBoss, but they must still avoid Postgres, Redis, and S3.

---

## Release Readiness Checklist

Expanded Java V1 is not complete until Spring Boot and app-server parity are both covered.

- [x] Universal Java API implemented.
- [x] Spring Boot starter auto-configures cleanly with one property block.
- [x] Java 17, Java 21, Java 25, and Java 26 Docker-backed verification lanes are green for the applicable core/starter matrix.
- [x] Request, exception, log, probe, and relay behavior covered by Spring Boot tests.
- [x] Spring Boot relay handler covers the shared relay contract: origin validation, content type, body size, schema, credential stripping, local-only writes, durable spool, connected forwarding, and rate limiting.
- [x] Capture policy is enforced locally with ingestion as a backstop.
- [x] SDK failures never throw into host application code.
- [x] Request and response bodies are off by default.
- [x] Header capture is allowlist-based by default.
- [x] Existing `X-Request-Id` and MDC `requestId` are preserved.
- [x] `X-DebugBundle-Trace-Id` links browser and backend events.
- [x] Maven artifacts build with source/javadoc jars and Maven Central metadata; release signing profile is present.
- [x] `jakarta.servlet` adapter captures request, exception, trace, request ID, relay, and shutdown behavior.
- [x] `javax.servlet` adapter captures request, exception, trace, request ID, relay, and shutdown behavior on Java 17+ app-server lanes.
- [x] `jakarta.ws.rs` and `javax.ws.rs` adapters capture JAX-RS/RESTEasy route metadata and framework-handled exceptions.
- [x] WildFly/JBoss Docker lane validates one JVM with multiple deployed WAR/JAR applications and per-deployment service isolation.
- [ ] Javaagent startup injection works with `standalone.sh`/Docker-style startup and does not require modifying every WAR.
- [x] Java Util Logging, Logback, and JBoss LogManager capture paths are covered by tests.
- [x] Servlet relay handlers pass the shared relay compliance fixtures for both namespace families.
- [x] Public docs include Maven, Gradle, Spring Boot, Spring Security, servlet `web.xml`, JAX-RS, WildFly/JBoss Docker, javaagent startup, local-only, connected, zero-install fallback, and privacy examples.
- [x] CLI/setup/doctor documentation can distinguish Spring Boot, servlet/JAX-RS app-server, javaagent, and browser SDK coverage.

---

## Open Decisions

- Whether the repo should later publish an aggregate convenience artifact in addition to the focused Java modules.
- Whether Log4j2 support should ship with V1 or follow after Logback/JBoss LogManager.
- Whether generated Java event model classes should be produced from DebugBundle schemas or maintained manually.
- Whether route template extraction should include a shared fallback normalizer for servlet/JSF apps when framework route metadata is unavailable.
- Whether the Spring relay endpoint path should become configurable beyond `/debugbundle/browser` after V1.
- Whether the javaagent should register WildFly/JBoss hooks through server-specific deployment processors, servlet initializer discovery, or a hybrid model.
- Whether CDI/EJB/Camel/background-job adapters should become the next Java depth layer after servlet/JAX-RS parity.
