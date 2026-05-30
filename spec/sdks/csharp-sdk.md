# C#/.NET SDK Implementation Plan

Version: v1
Last updated: 2026-05-30

Implementation status: `github.com/debugbundle/debugbundle-dotnet` is public, tagged `v0.1.1`, and published to NuGet as the V1 `DebugBundle.*` package family. The release gate passes restore, build, test, format, pack, staged-package clean-install smoke, NuGet trusted publishing, package publish, and published-package clean-install smoke across .NET 8 and .NET 10 consumer lanes. The `v0.1.1` patch also pins the Hangfire integration's transitive `Newtonsoft.Json` floor to a non-vulnerable version so warning-as-error .NET 10 consumers restore cleanly.

---

## Purpose

This plan defines the C#/.NET SDK surface for DebugBundle. The goal is a production-ready NuGet package family that feels native in modern ASP.NET Core, worker, and Microsoft-cloud applications while satisfying the same universal SDK, relay, probe, capture-policy, redaction, and safety contracts as the shipped Node, Python, PHP, WordPress, Java, Ruby, and Go SDKs.

The SDK is named as a C# target because C# is the primary consumer language, but the implementation should be a .NET SDK that is also usable from other .NET languages when practical.

The C#/.NET SDK must satisfy `contracts/sdk-interface.md`, `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

---

## Coverage Posture

### ASP.NET Core Services

ASP.NET Core is the required V1 center of gravity. The SDK must support the common ASP.NET Core shapes through one shared middleware and endpoint-routing integration:

- Minimal APIs.
- MVC controllers and Web API controllers.
- Razor Pages.
- Blazor Server request and server-side circuit error coverage where safe.
- ASP.NET Core gRPC server methods through an optional interceptor.

### Worker and Cloud-Hosted .NET

C# production issues often happen outside request handlers. V1 should include .NET Generic Host support for `BackgroundService`/Worker Service applications, Hangfire server jobs, and Azure Functions isolated worker applications without making those dependencies mandatory for ASP.NET Core users.

### Browser Frontends

The .NET SDK does not instrument browser-side JavaScript or Blazor WebAssembly runtime failures. Browser coverage requires the DebugBundle browser SDK. The .NET server adapter provides the browser relay endpoint so same-origin and explicitly allowed split frontend/backend browser events can be delivered without browser-side cloud credentials.

---

## Scope

### V1 In Scope

- .NET core SDK for manual capture and shared runtime behavior.
- ASP.NET Core middleware for request, response, exception, trace, and route capture.
- ASP.NET Core endpoint route for `POST /debugbundle/browser` relay parity plus `OPTIONS /debugbundle/browser` CORS preflight handling for split frontend/backend deployments.
- Minimal APIs, MVC/Web API, Razor Pages, and standard endpoint-routing metadata capture.
- Blazor Server coverage through ASP.NET Core request/log capture plus optional circuit exception capture.
- ASP.NET Core gRPC server interceptor for service/method/status/exception metadata.
- .NET Generic Host and Worker Service integration for background process capture.
- Hangfire server filter for background job exception and context capture.
- Azure Functions isolated worker middleware for HTTP and non-HTTP function invocation capture.
- `Microsoft.Extensions.Logging` provider integration.
- Optional Serilog sink, NLog target, and log4net appender integrations.
- .NET 8 LTS and .NET 10 LTS full SDK validation.
- Core/manual capture footprint for .NET Framework 4.8/4.8.1 through a `netstandard2.0` target where feasible.
- Local-only and connected transports.
- Full browser relay handler compatible with the server SDK relay contract.
- Conservative privacy defaults suitable for healthcare, financial, government, and enterprise applications.
- Trimming- and NativeAOT-aware design for the core and ASP.NET Core paths where feasible.

### V1 Out of Scope

- .NET 6 and .NET 7 support.
- First-class .NET 9 support after its STS support window; newer LTS lanes are preferred.
- Classic ASP.NET `System.Web`, ASP.NET MVC 5, Web API 2, WCF, and IIS module adapters.
- Blazor WebAssembly client instrumentation.
- MAUI, Xamarin, Unity, WPF, WinForms, and desktop UI breadcrumb integrations.
- SignalR hub filters.
- Deep Entity Framework Core, SQL, Redis, HTTP-client, message-bus, Orleans, Dapr, or Azure SDK auto-instrumentation.
- MassTransit, Quartz.NET, Azure WebJobs in-process, and Service Fabric first-class adapters.
- CLR profiler, dynamic attach, IL weaving, or arbitrary bytecode instrumentation.
- Durable offline queues beyond local file transport and relay spool files.

Classic .NET Framework and desktop applications may use the core manual API if the `netstandard2.0` target remains practical, but they are not V1 first-class framework integrations.

---

## Artifacts

The .NET SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-dotnet
```

Publish NuGet packages under the `DebugBundle.*` package family:

| Artifact | Purpose |
| --- | --- |
| `DebugBundle.Sdk` | Core client, event model, buffering, transport, redaction, probes, suppression, capture policy, manual capture API, and vanilla runtime hooks. |
| `DebugBundle.AspNetCore` | ASP.NET Core middleware, DI registration, route metadata capture, exception integration, relay endpoint, and hosted-service flush wiring. |
| `DebugBundle.Extensions.Logging` | `Microsoft.Extensions.Logging` provider and logger scope capture. |
| `DebugBundle.Serilog` | Optional Serilog sink/enricher integration. |
| `DebugBundle.NLog` | Optional NLog target integration. |
| `DebugBundle.Log4Net` | Optional log4net appender integration for installed-base enterprise applications. |
| `DebugBundle.Grpc.AspNetCore` | Optional ASP.NET Core gRPC server interceptor. |
| `DebugBundle.Worker` | Generic Host and `BackgroundService` helpers. |
| `DebugBundle.Hangfire` | Optional Hangfire server filter. |
| `DebugBundle.AzureFunctions.Worker` | Optional Azure Functions isolated worker middleware and HTTP relay helper. |

Suggested namespace roots:

| Namespace | Owner |
| --- | --- |
| `DebugBundle` | Public facade, options, status, and core client. |
| `DebugBundle.Transport` | HTTP, local file, and relay spool transports. |
| `DebugBundle.Redaction` | .NET redaction implementation. |
| `DebugBundle.Probes` | Probe ring buffers and activation state. |
| `DebugBundle.AspNetCore` | ASP.NET Core middleware, endpoint mapping, route helpers, and relay integration. |
| `DebugBundle.Logging` | `ILogger` provider and logging abstractions. |
| `DebugBundle.Serilog` | Serilog sink/enricher. |
| `DebugBundle.NLog` | NLog target. |
| `DebugBundle.Log4Net` | log4net appender. |
| `DebugBundle.Grpc` | gRPC interceptor. |
| `DebugBundle.Worker` | Worker and background-operation helpers. |
| `DebugBundle.Hangfire` | Hangfire filter. |
| `DebugBundle.AzureFunctions` | Azure Functions isolated worker integration. |

The repository uses the .NET SDK, xUnit, Microsoft test host packages, coverlet, Roslyn analyzers, `dotnet format`, SourceLink, deterministic builds, NuGet package validation, and GitHub Actions release workflow for NuGet publishing.

The C#/.NET SDK must also inherit the shared DebugBundle SDK release discipline now used by the current pre-launch SDK surfaces:

- every published NuGet package must include package-level README and license metadata in the final artifact
- docs must explicitly cover configuration source precedence, runtime support labels, install examples for every claimed setup mode, service naming guidance, safe startup/status behavior, and first-event verification
- release automation must validate staged `.nupkg` artifacts before publish and rerun clean-install application smoke after publish
- if the .NET SDK later grows multiple version-aligned packages, public docs and examples must keep those package versions aligned rather than mixing versions across snippets

Consumer installation examples:

```bash
dotnet add package DebugBundle.AspNetCore
dotnet add package DebugBundle.Extensions.Logging
```

Vanilla or worker applications can install only the core package:

```bash
dotnet add package DebugBundle.Sdk
```

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-03`: backend request, response, exception, log, service, deploy, runtime, and correlation capture.
- `FR-SDK-05`: normalized event types, including `backend_exception`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-06`, `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: batching, sampling, duplicate suppression, and loop protection.
- `FR-SDK-16`: universal backend SDK interface with C# PascalCase naming.
- `FR-SDK-17`, `FR-SDK-18`, `FR-SDK-19`, `FR-SDK-20`, `FR-SDK-21`: vanilla hooks and in-process logger integrations.
- `FR-SDK-22`: read `X-DebugBundle-Trace-Id` and attach it to backend events.
- `FR-SDK-35`: C# backend SDK parity with ASP.NET Core as the required V1 framework surface.
- `FR-REL-01` through `FR-REL-14`: full browser relay handler parity.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `contracts/sdk-interface.md` sections 1 through 13.
- `rules/security-hardening.md` SDK, relay, redaction, path, retry, and trace-header requirements.
- `rules/sdk-testing-strategy.md` SDK, contract, relay, and compatibility tiers.

Primary acceptance coverage:

- `AC-SDK-04`: duplicate suppression.
- `AC-SDK-05`: redaction defaults.
- `AC-SDK-09`: in-process log capture.
- `AC-SDK-11`: universal interface consistency.
- `AC-SDK-12`: cross-context trace correlation.
- `AC-SDK-13`: loop protection recovery.
- `AC-REL-01` through `AC-REL-11`: relay behavior and parity matrix.

---

## Public API

The SDK must expose a PascalCase static facade and an instance-based client. ASP.NET Core and worker integrations should use dependency injection and instance clients internally. The static facade is for small applications, console tools, and manual capture.

Minimum static facade:

```csharp
DebugBundle.Init(new DebugBundleOptions
{
    ProjectToken = Environment.GetEnvironmentVariable("DEBUGBUNDLE_TOKEN"),
    Service = "checkout-api",
    Environment = builder.Environment.EnvironmentName
});

DebugBundle.CaptureException(exception, context: new Dictionary<string, object?>
{
    ["order_id"] = orderId
});
DebugBundle.CaptureError(exception);
DebugBundle.CaptureLog("payment retry failed", DebugBundleLogLevel.Warning, new Dictionary<string, object?>
{
    ["attempt"] = attempt
});
DebugBundle.CaptureRequest(request, response, context: null);
DebugBundle.CaptureMessage("worker started", level: DebugBundleLogLevel.Information);
DebugBundle.SetContext("account_id", accountId);
DebugBundle.Probe("checkout.cart", new { ItemCount = cart.Items.Count });
DebugBundle.Probe("checkout.tax", () => expensiveTaxState, new ProbeOptions { Heavy = true });
await DebugBundle.FlushAsync(cancellationToken);
var status = DebugBundle.Status;
var lastEventAt = DebugBundle.LastEventAt;
```

Minimum instance API:

```csharp
var client = DebugBundleClient.Create(new DebugBundleOptions
{
    ProjectToken = Environment.GetEnvironmentVariable("DEBUGBUNDLE_TOKEN"),
    Service = "checkout-worker"
});

client.CaptureException(exception, new Dictionary<string, object?> { ["job_id"] = jobId });
client.CaptureLog("retrying charge", DebugBundleLogLevel.Warning, new Dictionary<string, object?> { ["attempt"] = attempt });
client.CaptureMessage("worker started");
client.Probe("checkout.job", () => jobState);
await client.FlushAsync(cancellationToken);
```

ASP.NET Core setup should feel native:

```csharp
builder.Services.AddDebugBundle(options =>
{
    options.ProjectToken = builder.Configuration["DEBUGBUNDLE_TOKEN"];
    options.Service = "checkout-api";
    options.Environment = builder.Environment.EnvironmentName;
    options.ProjectMode = DebugBundleProjectMode.Connected;
});

builder.Logging.AddDebugBundle();

var app = builder.Build();
app.UseDebugBundle();
app.MapDebugBundleBrowserRelay("/debugbundle/browser");
```

Context helpers:

```csharp
using var scope = DebugBundle.BeginScope(new Dictionary<string, object?>
{
    ["account_id"] = accountId,
    ["request_id"] = requestId
});

DebugBundle.SetUserHash(userId);
DebugBundle.SetTraceId(traceId);
DebugBundle.SetRequestId(requestId);
```

Request-scoped context must use `AsyncLocal`, `HttpContext.Items`, `ILogger` scopes, or DI-scoped services. The SDK must never rely on global mutable state for per-request data.

---

## Runtime Compatibility

- Full server SDK minimum runtime: .NET 8 LTS.
- Recommended production runtime: .NET 10 LTS for new services, or .NET 8 LTS while it remains upstream-supported.
- ASP.NET Core validation: ASP.NET Core 8.0 and 10.0.
- Core/manual installed-base footprint: `netstandard2.0` for .NET Framework 4.8/4.8.1 where feasible.
- No .NET 6 or .NET 7 support because both are upstream EOL.
- Do not claim .NET 9 as a supported production lane after its STS support window. Apps running .NET 9 may consume the .NET 8 assets at their own risk, but release CI should prioritize supported LTS lanes.
- Production code should stay compatible with C# 12 syntax unless newer syntax is isolated to a newer target.
- Do not use .NET APIs newer than .NET 8 in shared code unless guarded by multi-targeting.
- The SDK should avoid native dependencies.
- Core packages should avoid reflection-heavy behavior and dynamic code generation where possible so trimming and NativeAOT paths remain viable.
- Optional integrations should not force Serilog, NLog, log4net, Hangfire, gRPC, or Azure Functions dependencies on core or ASP.NET Core consumers.

Future releases must refresh the concrete .NET, ASP.NET Core, Azure Functions, Hangfire, Serilog, NLog, and log4net version lists before cutting the SDK.

Release preparation must also refresh the clean-install smoke fixtures and documentation examples so published package metadata, runtime claims, and consumer snippets do not drift apart.

---

## Configuration

Required:

| Option | Description |
| --- | --- |
| `ProjectToken` | Project token used by server-side transport. |

Important optional options:

| Option | Default | Description |
| --- | --- | --- |
| `Enabled` | `true` | Kill switch. |
| `Environment` | ASP.NET Core environment or auto-detect | Runtime environment name. |
| `Service` | Application name, assembly name, or fallback | Service name. |
| `Endpoint` | `https://api.debugbundle.com/v1/events` | Connected ingestion endpoint. |
| `ProjectMode` | `Connected` | `Connected` or `LocalOnly`. |
| `LocalEventsDir` | `.debugbundle/local/events` | Local event file transport destination. |
| `SpoolDir` | `.debugbundle/local/browser-relay-spool` | Durable relay spool destination. |
| `BatchSize` | `25` | Max events per flush batch. |
| `FlushInterval` | `5 seconds` | Max delay before background flush. |
| `SampleRate` | `1.0` | Per-event sampling. |
| `LogLevel` | `Warning` | Minimum captured log level. |
| `RequestTimeout` | `5 seconds` | HTTP transport timeout. |
| `Relay.Enabled` | `true` for ASP.NET Core | Enable `/debugbundle/browser` route when mapped. |
| `Relay.AllowedOrigins` | same-origin derived from request host | Browser origins allowed to submit relay requests. Required for split frontend/backend relay URLs. |
| `Relay.RateLimitPerMinute` | `60` | Per-IP relay rate limit. |
| `Relay.DurableWrite` | `true` | Connected relay writes spool before forwarding. |
| `MaxProbeLabels` | `50` | Distinct probe labels retained. |
| `MaxProbeEntriesPerLabel` | `10` | Entries retained per label. |
| `ProbeFlushOnError` | `true` | Attach ring buffers to captured errors. |
| `ProbesPollInterval` | `60 seconds` | Remote config/probe polling interval. |

Configuration sources must include:

- Programmatic `DebugBundleOptions`.
- ASP.NET Core options pattern through `IOptions<DebugBundleOptions>`.
- `IConfiguration` binding from `DebugBundle` section.
- Environment variables such as `DEBUGBUNDLE_TOKEN`, `DEBUGBUNDLE_ENVIRONMENT`, `DEBUGBUNDLE_SERVICE`, and `DEBUGBUNDLE_PROJECT_MODE`.
- Generic Host configuration for worker apps.
- Azure Functions isolated worker configuration.

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config`.

The release docs must state that server-owned capture policy and future project capture rules come from `GET /v1/sdk/config` rather than local app configuration, matching the cross-SDK contract.

---

## Setup and Deployment Modes

### ASP.NET Core

ASP.NET Core applications should configure through DI and the options pattern:

```csharp
builder.Services.AddDebugBundle(builder.Configuration.GetSection("DebugBundle"));
builder.Logging.AddDebugBundle();

var app = builder.Build();
app.UseDebugBundle();
app.MapDebugBundleBrowserRelay();
```

`app.UseDebugBundle()` should run after routing has identified endpoints and before endpoint handlers complete. Documentation must include ordering examples for MVC, Minimal APIs, Razor Pages, authentication, authorization, exception handling, and static files.

### Worker Services

Worker applications should configure through the Generic Host:

```csharp
builder.Services.AddDebugBundle(options =>
{
    options.ProjectToken = builder.Configuration["DEBUGBUNDLE_TOKEN"];
    options.Service = "billing-worker";
});
builder.Services.AddDebugBundleWorkerCapture();
```

The SDK should flush on `IHostApplicationLifetime.ApplicationStopping` with a bounded timeout.

### Azure Functions Isolated Worker

Azure Functions isolated worker applications should use middleware:

```csharp
builder.Services.AddDebugBundle(builder.Configuration.GetSection("DebugBundle"));
builder.UseMiddleware<DebugBundleFunctionsMiddleware>();
```

HTTP-triggered functions may optionally expose the relay endpoint through a documented HTTP function helper. Non-HTTP triggers should capture function name, trigger type, invocation ID, retry metadata when available, and sanitized binding metadata.

### Hangfire

Hangfire applications should install an optional server filter:

```csharp
GlobalJobFilters.Filters.Add(new DebugBundleHangfireFilter());
```

The filter must capture job type, method, queue, job ID, retry count when available, sanitized argument summaries, exception details, runtime facts, service/environment, and probe buffers. It must never swallow job exceptions or change retry/failure behavior.

### Zero-Install Fallback

When adding the SDK is not immediately possible, .NET applications can emit canonical `debugbundle-ndjson` through existing logging pipelines and ingest it with `debugbundle ingest` or `debugbundle watch`. This path does not provide full SDK parity, but it gives enterprise teams a bridge until NuGet installation is possible.

---

## Vanilla .NET Hooks

V1 vanilla support:

- `DebugBundle.CaptureUnhandledExceptions()` installs explicit process-level handlers where .NET allows it.
- `DebugBundle.CaptureTaskSchedulerExceptions()` observes `TaskScheduler.UnobservedTaskException` without changing host behavior.
- `DebugBundle.CaptureAppDomainExceptions()` observes `AppDomain.CurrentDomain.UnhandledException` and delegates to normal runtime termination behavior.
- `DebugBundle.CaptureConsoleLogs()` may capture `Console.Error`/`Console.Out` only when explicitly enabled.
- `DebugBundle.WithExceptionCapture(Action action)` and async variants capture exceptions around explicit blocks and rethrow.
- `DebugBundle.BeginScope(...)` attaches request/job scoped context through `AsyncLocal`.

Runtime hook behavior must be honest and conservative. The SDK must not claim it can capture every unhandled exception in every hosting model. ASP.NET Core middleware, `ILogger`, worker, Hangfire, Azure Functions, and explicit manual capture are the primary production paths.

Hook registration must be explicit and idempotent. Importing an assembly, constructing options, or adding services to DI must not create global side effects until the host calls the relevant capture method or starts the configured hosted service.

---

## Framework Integrations

### ASP.NET Core

ASP.NET Core integration must include:

- DI registration for `IDebugBundleClient`.
- Middleware around the request pipeline.
- Request context setup and teardown.
- Exception capture that rethrows and preserves existing exception handling.
- Optional `IExceptionHandler` integration for framework-handled exceptions that returns `false` unless explicitly configured otherwise.
- Endpoint route template capture through `HttpContext.GetEndpoint()` and `RouteEndpoint.RoutePattern`.
- MVC controller/action metadata when available.
- Minimal API endpoint display name and route pattern when available.
- Razor Pages page path metadata when available.
- Request ID preservation from `HttpContext.TraceIdentifier`, `X-Request-ID`, and common correlation headers.
- `X-DebugBundle-Trace-Id` correlation.
- `System.Diagnostics.Activity.Current` capture for trace/span alignment without becoming an OpenTelemetry exporter.
- `ILogger` scope capture and MDC-like context from logging scopes.
- Relay route mapping at `POST /debugbundle/browser` and `OPTIONS /debugbundle/browser`.
- Bounded flush on host shutdown.

The integration must not reorder application exception handlers, require authentication changes, or force response headers unless explicitly configured.

### Minimal APIs, MVC, and Razor Pages

The shared ASP.NET Core middleware must cover all endpoint-routing based request surfaces. It should capture method, path, route template, endpoint display name, status, duration, sanitized headers, request ID, trace ID, exception summary, runtime facts, service/environment, and recent probe buffers.

### Blazor Server

Blazor Server should be covered through ASP.NET Core request/log capture plus an optional `CircuitHandler` or equivalent integration for server-side circuit exceptions where this can be done without changing app behavior. The SDK must not capture component state, form values, SignalR payloads, or circuit user data by default.

Blazor WebAssembly is browser/client-side .NET and is out of scope for this server SDK.

### ASP.NET Core gRPC

The optional gRPC interceptor must capture service name, method name, status code, deadline metadata when safe, sanitized request metadata, exception details, trace ID, request ID, runtime facts, and probe buffers. It must not capture protobuf message bodies by default.

### Generic Host and Worker Services

Worker integration must capture background operation exceptions and logs without assuming an HTTP request. It should provide helpers for wrapping operations with job context:

```csharp
await debugBundleClient.CaptureOperationAsync("billing.reconcile", async operationContext =>
{
    operationContext.Set("tenant_id", tenantId);
    await ReconcileAsync(cancellationToken);
}, cancellationToken);
```

The SDK must preserve cancellation behavior and must not swallow exceptions unless the caller explicitly chooses a no-throw helper.

### Azure Functions Isolated Worker

Azure Functions integration must capture function name, trigger type, invocation ID, retry context when available, sanitized binding metadata, exceptions, logs, trace IDs, request IDs for HTTP triggers, runtime facts, service/environment, and probe buffers. It must preserve Functions retry and failure behavior.

---

## Exception Capture

.NET capture must handle:

- Explicit `Exception` objects passed to `CaptureException`.
- Exceptions escaping ASP.NET Core middleware.
- Framework-handled ASP.NET Core exceptions where safe hooks are available.
- Worker Service and `BackgroundService` exceptions.
- Hangfire job exceptions.
- Azure Functions invocation exceptions.
- gRPC `RpcException` and non-RPC exceptions.
- `AggregateException`, inner exceptions, and exception data dictionaries after redaction.
- Stack traces with framework/runtime frame filtering where possible.

Captured error events should include exception type, message, stack trace, inner exception chain, HRESULT when safe, request/job/function context, trace ID, request ID, route/controller/action/endpoint metadata, response status when known, runtime facts, and recent probe buffers.

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Logging Integrations

V1 should support:

- `Microsoft.Extensions.Logging` through an `ILoggerProvider`.
- ASP.NET Core logger integration through DI.
- Serilog through an optional sink and enricher.
- NLog through an optional target.
- log4net through an optional appender.

Logging integration must:

- Capture structured `log_event` records in-process.
- Respect `LogLevel` and server capture policy.
- Include logger category, level, event ID, message template when available, rendered message, exception summary, timestamp, scopes, `Activity` IDs, request/job/function context, and structured state after redaction.
- Preserve existing logging providers, sinks, targets, appenders, and formatting.
- Avoid recursive SDK logging capture.
- Avoid calling async network flushes from logging callbacks.

Auto-registration should happen for ASP.NET Core defaults when `AddDebugBundle()` and `AddDebugBundle()` logging helpers are used. Vanilla .NET logger integration should remain explicit to avoid surprising global logger mutation.

---

## Browser Relay

The .NET SDK must provide a full relay handler at:

```text
POST /debugbundle/browser
OPTIONS /debugbundle/browser
```

Minimum exported surfaces:

```csharp
app.MapDebugBundleBrowserRelay("/debugbundle/browser");
app.UseDebugBundleBrowserRelay();
DebugBundleRelayHandler.HandleAsync(httpContext, options, cancellationToken);
```

It must implement `contracts/sdk-interface.md` section 13:

- Accepted browser event types only.
- Same-origin validation using `Origin`, with `Referer` fallback.
- `Content-Type: application/json` enforcement.
- 256 KB request body limit.
- Schema validation and unknown-field stripping.
- Credential isolation: browser-supplied `project_token`, `organization_id`, and auth headers are stripped or rejected.
- Preserve browser-owned `correlation.trace_id`, `correlation.request_id`, `correlation.session_id`, and `correlation.user_id_hash`.
- Per-IP rate limiting with an in-memory default and store interfaces for `IMemoryCache`, `IDistributedCache`, or Redis-backed implementations.
- CORS preflight support for allowed split frontend/backend origins: `OPTIONS` responses must return `204` with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 600`, and `Vary: Origin`. Allowed `POST` responses must include matching `Access-Control-Allow-Origin` and `Vary: Origin`; disallowed origins must not receive successful CORS headers.
- Local-only event file writes.
- Connected durable spool writes.
- Connected low-latency forwarding when durable writes are disabled.

ASP.NET Core applications commonly run behind IIS, Azure App Service, nginx, YARP, Kubernetes ingress, and other proxies. The relay must only trust forwarded host/proto headers when ASP.NET Core forwarded headers middleware has been configured correctly or when the user explicitly enables trusted forwarded-host behavior.

The relay endpoint must be easy to exempt from app authentication while still enforcing origin, preflight, content type, size, schema, rate limit, and credential isolation. Documentation must include examples for ASP.NET Core authentication/authorization, endpoint routing, and CORS middleware ordering for split frontend/backend deployments. The SDK-owned relay handler must be capable of answering preflight itself so correctness does not depend on a separate application CORS policy.

---

## Privacy Defaults

.NET defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Do not capture protobuf, SignalR, form, JSON, or multipart payload bodies by default.
- Capture only allowlisted headers.
- Redact sensitive values before buffering or transport.
- Do not capture `ClaimsPrincipal` claims by default.
- Hash stable user, account, organization, tenant, and patient references when provided through context helpers.
- Capture route templates, endpoint names, controller/action names, job/function names, status, and duration rather than raw payloads.
- Keep form/message/payload capture explicit opt-in.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`
- `traceparent`

Default redaction must cover `contracts/sdk-interface.md` and `rules/security-hardening.md`, including passwords, secrets, tokens, API keys, bearer values, authorization, cookies, phone, SSN, card data, OTPs, verification codes, connection strings, session identifiers, and common identity/claim names.

If body capture is later enabled, the SDK must require explicit size limits, content-type filters, and redaction. Body capture is not recommended for healthcare or PHI workloads.

---

## Transport

The core SDK must implement:

- HTTP transport for connected staging and production.
- `HttpClient` and `IHttpClientFactory` friendly design.
- File transport for local and development modes.
- Local-only mode that writes events to `.debugbundle/local/events`.
- Connected durable relay spool for browser relay events.
- Retry and backoff for `429` and transient `5xx` responses.
- `Retry-After` handling capped at 5 minutes.
- Bounded in-memory buffers, likely using `Channel<T>` or equivalent.
- Safe shutdown flush hooks through explicit `FlushAsync`, ASP.NET Core host lifetime, Worker Service lifetime, and Azure Functions host shutdown where available.

Transport failures must never throw into application code. File writes must follow `SEC-12` through `SEC-15`: owner-only permissions, canonical path validation, symlink/reparse-point protection, and unpredictable temp file names.

Cross-platform file safety must be explicit:

- Linux/macOS: create directories with owner-only permissions and files with owner-only permissions where supported.
- Windows: apply current-user-only ACLs where feasible and reject suspicious reparse points or junctions that escape the target directory.
- All platforms: use canonical absolute paths, random temp names, create-new semantics, and atomic rename.

---

## Capture Policy and Probes

The .NET SDK must fetch `GET /v1/sdk/config` on init and poll according to backend SDK rules.

It must enforce:

- capture log level/off settings,
- request event capture modes,
- probe event capture modes,
- immediate client error status promotion,
- fallback to safe minimal behavior when config fetch fails.

Probe behavior must match the universal SDK contract:

- Always-on ring buffers for all tiers.
- `Func<object?>` lazy probe support.
- Optional async lazy probe support only if it can be bounded and never block request paths.
- `Heavy = true` probes dormant until a matching activation exists.
- Remote activation for paid tiers through config polling.
- Trigger token extraction from `_debug_probe` and `X-DebugBundle-Probe-Trigger`.
- Per-request activation only for trigger tokens.
- Request/job/function correlation (`trace_id`, `request_id`, `job_id`, `invocation_id`) on standalone `probe_event` shipping where available.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

.NET request, job, function, log, and exception events must include:

- `sdk_name`: `@debugbundle/sdk-dotnet`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `trace_id` when `X-DebugBundle-Trace-Id` is present
- `correlation.request_id` when known
- sanitized payload
- safe runtime facts

Runtime facts may include .NET runtime version, target framework, OS description, process architecture, process ID, machine name when safe, current directory when safe, entry assembly name/version, ASP.NET Core environment, hosting model, framework/integration name/version, container indicators, Azure App Service/Functions indicators, and GC mode. Environment variables must never be captured.

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Implementation Slices

1. Repository scaffold and build
   - Create `debugbundle-dotnet` with solution structure, governance files, Makefile or equivalent scripts, CI, release workflow, analyzers, formatting, coverage, SourceLink, package validation, and examples.

2. Core event client
   - Options model, static facade, instance API, event envelope builder, buffer, flush, status, last event timestamp, mockable transport interface, and HTTP transport.

3. Redaction and privacy
   - Default redaction rules, header allowlist, claims exclusion, request/response body capture disabled by default, object depth and size limits, healthcare-style sensitive-field tests.

4. Suppression and backoff
   - Duplicate suppression, loop protection, retry, `Retry-After`, bounded buffers, no-throw failure isolation.

5. Local-first transport
   - Atomic local event file writes, local-only mode, secure file permissions/ACLs, symlink and reparse-point protection, shutdown flush behavior.

6. ASP.NET Core request capture
   - Middleware, endpoint metadata capture, request ID/trace ID handling, route/controller/action capture, response status/duration, exception capture preserving behavior.

7. ASP.NET Core relay
    - Endpoint mapping, origin/preflight/content-type/size/schema/rate-limit controls, local-only writes, durable spool, connected forwarding, shared relay compliance fixtures.

8. Logging integrations
   - `Microsoft.Extensions.Logging` provider first, then optional Serilog, NLog, and log4net integrations, recursion guard, scope capture, level filtering.

9. gRPC and Blazor Server coverage
   - gRPC interceptor, safe service/method metadata, status/exception capture, optional Blazor Server circuit exception capture.

10. Worker and background job integrations
    - Generic Host helpers, Worker Service lifecycle, Hangfire server filter, operation wrappers, exception propagation preservation.

11. Azure Functions isolated worker
    - Invocation middleware, HTTP trigger context capture, non-HTTP trigger metadata, exception preservation, optional HTTP relay helper.

12. Capture policy and probes
    - Config fetch and polling, ETag handling, capture-policy enforcement, always-on probe buffers, remote activations, trigger tokens.

13. NativeAOT, trimming, and package polish
    - Source-generated serialization where useful, analyzer warnings addressed, trimming smoke tests, NativeAOT smoke for supported core/ASP.NET Core paths, NuGet metadata and symbols.

14. Documentation and examples
    - ASP.NET Core Minimal API, MVC, Razor Pages, gRPC, Blazor Server caveats, Worker Service, Hangfire, Azure Functions isolated worker, `ILogger`, Serilog, NLog, log4net, browser relay, local-only, connected, probes, privacy, and zero-install fallback guidance.

---

## Testing Plan

The .NET SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for all universal methods.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for default fields, custom sensitive fields, connection strings, claims, cookies, and authorization headers.
- Suppression and loop protection tests.
- Retry/backoff tests using a mock `HttpMessageHandler` or local test server.
- File transport atomic-write, permissions/ACL, symlink/reparse-point, and path-validation tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger-token tests.
- ASP.NET Core middleware tests with `TestServer` and `WebApplicationFactory`.
- Minimal API, MVC/Web API, and Razor Pages route metadata tests.
- ASP.NET Core authentication/authorization relay endpoint examples and tests.
- gRPC interceptor tests.
- Blazor Server circuit capture tests where supported by stable APIs.
- Worker Service and `BackgroundService` tests.
- Hangfire server filter tests.
- Azure Functions isolated worker middleware tests.
- `Microsoft.Extensions.Logging` provider tests.
- Serilog, NLog, and log4net integration tests.
- Relay compliance fixtures for valid, invalid, credential-smuggling, wrong-origin, allowed preflight, disallowed preflight, allowed POST CORS headers, oversized, rate-limited, local-only, durable-spool, and connected-forwarding cases.
- Concurrency tests for parallel request/log/probe capture and flush paths.
- Trimming and NativeAOT smoke tests for supported package paths.

CI matrix:

```text
.NET 8 LTS core
.NET 10 LTS core
.NET 8 ASP.NET Core middleware and relay
.NET 10 ASP.NET Core middleware and relay
.NET 8 MVC / Minimal API / Razor Pages lanes
.NET 10 MVC / Minimal API / Razor Pages lanes
.NET 8 gRPC lane
.NET 10 gRPC lane
.NET 8 Worker Service lane
.NET 10 Worker Service lane
Azure Functions isolated worker on supported .NET LTS lanes where the Functions runtime permits
Hangfire current stable lane on .NET 8 and .NET 10
Serilog current stable lane
NLog current stable lane
log4net current stable lane
Windows .NET Framework 4.8/4.8.1 core/manual compatibility lane if `netstandard2.0` remains supported
Linux and Windows file-transport hardening lanes
NativeAOT smoke lane for supported core/ASP.NET Core paths
```

Quality gates:

- `dotnet restore`
- `dotnet build --configuration Release --no-restore`
- `dotnet test --configuration Release --no-build`
- `dotnet format --verify-no-changes`
- Analyzer warnings treated as errors for SDK source.
- Coverage threshold at or above the SDK standard.
- `dotnet pack --configuration Release` validates publishable artifacts.
- NuGet package validation checks metadata, license, README, SourceLink, symbols, deterministic builds, and dependency boundaries.
- A clean install smoke verifies package installation in fresh ASP.NET Core and Worker Service fixtures.
- A published-package smoke reruns the same application-driven verification against the target NuGet feed before the release is considered complete.

---

## Release Readiness Checklist

- [x] Universal C# API implemented.
- [x] Instance client and static facade implemented.
- [x] ASP.NET Core middleware captures requests, exceptions, trace IDs, request IDs, endpoint metadata, status, duration, and probe buffers.
- [x] Minimal APIs, MVC/Web API, and Razor Pages share the endpoint-routing middleware path; focused tests cover the shared route metadata behavior.
- [x] ASP.NET Core relay handler covers the shared relay contract: origin validation, CORS preflight, POST CORS headers, content type, body size, schema, credential stripping, local-only writes, durable spool, connected forwarding, and rate limiting.
- [x] `Microsoft.Extensions.Logging`, Serilog, NLog, and log4net integrations capture structured logs without recursion.
- [x] gRPC interceptor captures service/method/status/exception metadata without message bodies.
- [x] Worker Service and Hangfire integrations capture background failures and preserve retry/failure behavior.
- [x] Azure Functions isolated worker middleware captures invocation context and preserves host behavior.
- [x] Local-only and connected transports are implemented.
- [x] Secure local file writes enforce owner-only permissions where supported, path validation, symlink/reparse-point protection, and unpredictable temp names.
- [x] Duplicate suppression and loop protection match the universal contract.
- [x] Capture policy is fetched, cached, polled, and enforced locally with ingestion as a backstop.
- [x] Always-on probes, remote probes, heavy probes, and trigger tokens are implemented.
- [x] SDK failures never throw into host application code.
- [x] Request and response bodies are off by default.
- [x] Header capture is allowlist-based by default.
- [x] Existing request IDs and `Activity` trace context are preserved.
- [x] `X-DebugBundle-Trace-Id` links browser and backend events.
- [x] NuGet packages build with SourceLink, symbols, README, license metadata, and deterministic build settings.
- [x] Release docs cover config precedence, support labels, install modes, service naming, safe startup semantics, and first-event verification.
- [x] Public docs include install, ASP.NET Core, Minimal APIs, MVC/Razor shared middleware guidance, gRPC, Worker Service, Hangfire, Azure Functions, browser relay, local-only, connected, logging, probes, runtime support, and privacy examples.
- [x] CI is configured for .NET 8/.NET 10 SDK lanes, Linux/Windows, test, format, pack, and staged clean-install smoke.
- [x] Clean-install smoke passes against staged packages.
- [x] Published-package smoke passes against the target NuGet feed.

---

## Release Decisions

- .NET 8 LTS is the minimum full server SDK runtime.
- .NET 10 LTS is the recommended production runtime for new deployments at this plan date.
- ASP.NET Core is the first-class V1 framework surface, with Minimal APIs, MVC/Web API, Razor Pages, and endpoint routing sharing the same capture pipeline.
- `Microsoft.Extensions.Logging` is the required logging integration; Serilog, NLog, and log4net ship as optional packages because they are common in enterprise .NET deployments.
- Worker Service, Hangfire, and Azure Functions isolated worker are V1 background/runtime surfaces because C# production failures commonly occur outside HTTP requests.
- Classic ASP.NET `System.Web` is handled through core/manual guidance and zero-install `debugbundle-ndjson` fallback until demand justifies a dedicated adapter.
- Blazor WebAssembly is not covered by the server SDK; browser/client .NET support should be designed separately if needed.
- The SDK should align with `System.Diagnostics.Activity` and OpenTelemetry context without acting as a general-purpose tracing exporter.

---

## Open Decisions

- Whether to publish a convenience aggregate package in addition to focused `DebugBundle.*` packages.
- Whether the root facade should be `DebugBundle` or `DebugBundleSdk` to avoid namespace/type ambiguity in C# projects.
- Whether Azure Functions HTTP relay support should ship as a first-class route helper in V1 or remain documented composition over the relay handler.
- Whether SignalR hub filters should be the first post-V1 ASP.NET Core depth layer.
- Whether MassTransit, Quartz.NET, or Azure Service Bus processors should follow Hangfire as the next background job integrations.
- Whether generated .NET event model classes should be produced from DebugBundle schemas or maintained manually.
- Whether NativeAOT compatibility should be a hard release gate for all packages or a supported subset of core and ASP.NET Core packages.
- Whether future post-launch SDK waves beyond .NET should receive local project capture-rule enforcement at initial release or rely on server-side enforcement first and add runtime parity later.
