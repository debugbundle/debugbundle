# Go SDK Implementation Plan

Version: v1
Last updated: 2026-05-23

---

## Purpose

This plan defines the first Go SDK surface for DebugBundle. The goal is a production-ready Go module that feels natural in cloud-native Go services while satisfying the same universal SDK, relay, probe, capture-policy, redaction, and safety contracts as the shipped Node, Python, PHP, WordPress, and Java SDKs.

The Go SDK must satisfy `contracts/sdk-interface.md`, `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

---

## Scope

### V1 In Scope

- Go core SDK for manual capture and shared runtime behavior.
- First-class `net/http` middleware.
- Gin middleware.
- Echo middleware.
- Go 1.21 and newer runtime support.
- Go 1.21 as the minimum supported language version because `log/slog` is part of the standard library and is a V1 logging target.
- Compatibility validation for every supported minimum-to-current Go minor, plus the current and previous official Go support releases.
- Gin 1.x and Echo 4.x validation lanes for the first-class framework adapters.
- Local-only and connected transports.
- Full browser relay handler compatible with the server SDK relay contract.
- Conservative privacy defaults suitable for healthcare, financial, and enterprise services.
- Low allocation overhead, bounded memory, and no host request-path network blocking.

### V1 Out of Scope

- Go versions older than 1.21.
- gRPC interceptors.
- Fiber, Chi, Go kit, AWS Lambda Go, and Connect RPC integrations.
- Runtime monkey-patching, code generation, build tags for unsupported frameworks, or agent-style instrumentation.
- Automatic capture of database clients, HTTP clients, queues, or ORM-like libraries.
- Durable offline queues beyond local file transport and relay spool files.

---

## Artifacts

The Go SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-go
```

Publish as a Go module under:

```text
github.com/debugbundle/debugbundle-go
```

Suggested package layout:

| Package | Purpose |
| --- | --- |
| `debugbundle` | Public singleton API, instance client, config, event model, buffering, status, probes. |
| `transport` | HTTP transport, local file transport, relay spool transport, retry/backoff. |
| `redaction` | Go redaction implementation. |
| `probe` | Probe ring buffers, remote activations, trigger-token evaluation. |
| `relay` | Framework-neutral browser relay handler. |
| `debugbundlehttp` | `net/http` middleware and helpers. |
| `debugbundlegin` | Gin middleware adapter. |
| `debugbundleecho` | Echo middleware adapter. |
| `debugbundleslog` | `log/slog` handler integration. |
| `debugbundlezap` | zap core/wrapper integration. |
| `debugbundlezerolog` | zerolog hook/writer integration. |

Framework and logger integrations should be in subpackages so the core package does not force Gin, Echo, zap, or zerolog dependencies on every consumer.

The repository uses standard Go modules, `go test`, `go vet`, and `golangci-lint`. Consumer installation is the normal module path:

```bash
go get github.com/debugbundle/debugbundle-go
```

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-03`: backend request, response, exception, log, service, deploy, runtime, and correlation capture.
- `FR-SDK-05`: normalized event types, including `backend_exception`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-06`, `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: batching, sampling, duplicate suppression, and loop protection.
- `FR-SDK-16`: universal backend SDK interface with Go PascalCase naming.
- `FR-SDK-17`, `FR-SDK-18`, `FR-SDK-19`, `FR-SDK-20`, `FR-SDK-21`: vanilla hooks and in-process logger integrations.
- `FR-SDK-22`: read `X-DebugBundle-Trace-Id` and attach it to backend events.
- `FR-SDK-30`: Go backend SDK with `net/http`, Gin, Echo, `context.Context` correlation, panic recovery, and low overhead.
- `FR-REL-01` through `FR-REL-14`: full browser relay handler parity.
- `FR-PRB-01` through `FR-PRB-12`: always-on probes, remote activation, trigger tokens, and probe configuration.
- `contracts/sdk-interface.md` sections 1 through 13.
- `rules/security-hardening.md` SDK, relay, redaction, path, and retry requirements.
- `rules/sdk-testing-strategy.md` SDK, contract, and relay compliance tiers.

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

The SDK must expose both singleton-style functions and an instance-based client so framework integrations can avoid global state when needed.

Minimum singleton methods:

```go
debugbundle.Init(debugbundle.Config{...})
debugbundle.CaptureException(err error, ctx ...context.Context)
debugbundle.CaptureError(err error, ctx ...context.Context)
debugbundle.CaptureLog(message string, level debugbundle.LogLevel, ctx ...context.Context)
debugbundle.CaptureLogWithContext(message string, level debugbundle.LogLevel, fields map[string]any, ctx ...context.Context)
debugbundle.CaptureRequest(req *http.Request, response debugbundle.ResponseInfo, ctx ...context.Context)
debugbundle.CaptureMessage(message string, opts ...debugbundle.MessageOption)
debugbundle.SetContext(key string, value any)
debugbundle.Probe(label string, data any, opts ...debugbundle.ProbeOption)
debugbundle.ProbeLazy(label string, data func() any, opts ...debugbundle.ProbeOption)
debugbundle.Flush(ctx context.Context) error
debugbundle.Status() debugbundle.Status
debugbundle.LastEventAt() *time.Time
```

Minimum instance methods:

```go
client := debugbundle.New(debugbundle.Config{...})
client.CaptureException(ctx, err, debugbundle.WithEventContext(map[string]any{...}))
client.CaptureLog(ctx, "payment retry failed", debugbundle.LevelWarning, map[string]any{"order_id": orderID})
client.CaptureMessage(ctx, "worker started")
client.Probe(ctx, "checkout.cart", map[string]any{"item_count": itemCount})
client.Flush(ctx)
client.Status()
client.LastEventAt()
```

The singleton API should be a thin wrapper over a default `Client`. Instance APIs should be preferred in examples for larger applications and tests.

### Context Helpers

Go applications should use `context.Context` for per-request state:

```go
ctx = debugbundle.ContextWithValue(ctx, "account_id", accountID)
ctx = debugbundle.ContextWithUserHash(ctx, userID)
ctx = debugbundle.ContextWithRequestID(ctx, requestID)
ctx = debugbundle.ContextWithTraceID(ctx, traceID)
```

The SDK must never store request-scoped data only in package globals. Middleware must pass request context through the normal Go request lifecycle.

### Runtime Compatibility

- Minimum Go version: 1.21, chosen because `log/slog` is part of the standard library and is a V1 logging target.
- Recommended production Go version: the current or previous officially supported Go release.
- Compatibility support: Go 1.21 through current stable should continue to compile and pass the SDK test suite while the maintenance cost stays low. Older compatibility lanes are for installed-base reach, not a statement that those Go toolchains still receive upstream security fixes.
- The SDK must not require cgo.
- The core SDK should depend only on the Go standard library.
- Gin, Echo, zap, and zerolog support must live in optional subpackages.
- CI must validate the minimum supported Go version, every intermediate minor still claimed by the SDK, the previous officially supported Go release, and the current stable Go release.

---

## Configuration

Required:

| Field | Description |
| --- | --- |
| `ProjectToken` | Project token used by server-side transport. |

Important optional fields:

| Field | Default | Description |
| --- | --- | --- |
| `Enabled` | `true` | Kill switch. |
| `Environment` | auto-detect | Runtime environment name. |
| `Service` | module/app fallback | Service name. |
| `Endpoint` | `https://api.debugbundle.com/v1/events` | Connected ingestion endpoint. |
| `ProjectMode` | `connected` | `connected` or `local-only`. |
| `LocalEventsDir` | `.debugbundle/local/events` | Local file transport destination. |
| `SpoolDir` | `.debugbundle/local/browser-relay-spool` | Durable relay spool destination. |
| `BatchSize` | `25` | Max events per flush batch. |
| `FlushInterval` | `5s` | Max delay before background flush. |
| `SampleRate` | `1.0` | Per-event sampling. |
| `LogLevel` | `warning` | Minimum captured log level. |
| `RequestTimeout` | `5s` | HTTP client timeout. |
| `Relay.Enabled` | `true` for framework adapters | Enable relay handler when mounted. |
| `Relay.RateLimitPerMinute` | `60` | Per-IP relay rate limit. |
| `Relay.DurableWrite` | `true` | Connected relay writes spool before forwarding. |
| `MaxProbeLabels` | `50` | Distinct probe labels retained. |
| `MaxProbeEntriesPerLabel` | `10` | Entries retained per label. |
| `ProbeFlushOnError` | `true` | Attach ring buffers to captured errors. |
| `ProbesPollInterval` | `60s` | Remote config/probe polling interval. |

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config`.

---

## Vanilla Go Hooks

Go has no global exception hook equivalent. V1 should provide explicit safe wrappers and middleware:

```go
func main() {
    client := debugbundle.New(debugbundle.Config{ProjectToken: os.Getenv("DEBUGBUNDLE_TOKEN")})
    defer client.Flush(context.Background())

    go debugbundle.Go(context.Background(), func(ctx context.Context) {
        runWorker(ctx)
    })
}
```

V1 vanilla support:

- `debugbundle.Recover(ctx)` for use in `defer` blocks.
- `debugbundle.Go(ctx, func(context.Context))` helper that recovers panics in SDK-managed goroutines.
- `debugbundle.CapturePanics()` may configure the default client for helper-based recovery, but it must not imply Go can catch arbitrary panics outside SDK wrappers.
- `debugbundleslog.Handler` for `log/slog`.
- Optional zap and zerolog subpackages.

Hook registration must be explicit and idempotent. Importing the SDK or constructing config objects must have no side effects.

---

## Framework Integrations

### net/http

Provide middleware:

```go
handler := debugbundlehttp.Middleware(client)(routes)
http.ListenAndServe(":8080", handler)
```

The middleware must:

- Start a request context before downstream handlers run.
- Read incoming `X-DebugBundle-Trace-Id`.
- Read existing `X-Request-Id` when present.
- Preserve the application's existing request ID concept instead of forcing a response header by default.
- Capture method, path, route pattern when available, sanitized allowlisted headers, response status, duration, service, environment, and runtime facts.
- Recover panics, capture them with request context and probe buffers, then re-panic or write a response according to a documented option. Default should preserve Go middleware expectations by re-panicking after capture unless configured as recovery middleware.
- Never perform network I/O on the request path.
- Flush asynchronously according to normal batching rules.

### Gin

Provide middleware:

```go
router.Use(debugbundlegin.Middleware(client))
```

Gin integration must capture `c.FullPath()` as the route template when available, preserve request context, capture panics through Gin's middleware chain, and avoid interfering with existing Gin recovery middleware ordering.

### Echo

Provide middleware:

```go
e.Use(debugbundleecho.Middleware(client))
```

Echo integration must capture `c.Path()` as the route template when available, preserve Echo error handling behavior, and avoid replacing caller-owned `HTTPErrorHandler` behavior.

---

## Exception and Panic Capture

Go capture must handle:

- Explicit `error` values passed to `CaptureException`.
- `panic` values recovered by middleware, `Recover`, or `Go` helper wrappers.
- Error wrapping chains via `errors.Unwrap`, `errors.Join`, and `%w` wrapping where available.
- Stack traces from `runtime.Callers`/`runtime.CallersFrames` with library/runtime frame filtering.

Captured error events should include error type, message, wrapping chain, stack frames, request context, trace ID, request ID, route, response status when known, runtime facts, and recent probe buffers.

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Logging Integrations

V1 should support:

- `log/slog` through a custom `slog.Handler`.
- zap through a `zapcore.Core` wrapper or hook subpackage.
- zerolog through a hook/writer subpackage.

Logging integration must:

- Capture structured `log_event` records in-process.
- Respect `LogLevel` and server capture policy.
- Include logger name when available, level, message, timestamp, source/location when available, goroutine/request context when available, and structured fields after redaction.
- Preserve existing logger behavior and handlers.
- Avoid recursive SDK logging capture.

Auto-detection in Go should be conservative: the SDK can expose helpers for common loggers, but it should not import optional logger packages or mutate global logger state unless the user explicitly calls an integration helper. `log/slog` default handler setup may be offered as a documented opt-in.

---

## Browser Relay

The Go SDK must provide a full relay handler at:

```text
POST /debugbundle/browser
```

Minimum exported surfaces:

```go
relay.NewHandler(client, relay.Options{...}) http.Handler
debugbundlehttp.RelayHandler(client, relay.Options{...}) http.Handler
```

It must implement `contracts/sdk-interface.md` section 13:

- Accepted browser event types only.
- Same-origin validation using `Origin`, with `Referer` fallback.
- `Content-Type: application/json` enforcement.
- 256 KB request body limit.
- Schema validation and unknown-field stripping.
- Credential isolation: browser-supplied `project_token`, `organization_id`, and auth headers are stripped or rejected.
- Preserve browser-owned `correlation.trace_id`, `correlation.request_id`, `correlation.session_id`, and `correlation.user_id_hash`.
- Per-IP rate limiting with an in-memory default and an interface for shared stores.
- Local-only event file writes.
- Connected durable spool writes.
- Connected low-latency forwarding when durable writes are disabled.

Go services commonly sit behind reverse proxies. The relay must only trust forwarded host/proto headers when explicitly configured by the user.

---

## Privacy Defaults

Go defaults must be conservative.

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

Default redaction must cover `contracts/sdk-interface.md` and `rules/security-hardening.md`, including passwords, secrets, tokens, API keys, bearer values, authorization, cookies, phone, SSN, card data, OTPs, verification codes, and session identifiers.

If body capture is later enabled, the SDK must require explicit size limits, content-type filters, and redaction. Body capture is not recommended for healthcare or PHI workloads.

---

## Transport

The core SDK must implement:

- HTTP transport for connected staging and production.
- File transport for local and development modes.
- Local-only mode that writes events to `.debugbundle/local/events`.
- Connected durable relay spool for browser relay events.
- Retry and backoff for `429` and transient `5xx` responses.
- `Retry-After` handling capped at 5 minutes.
- Bounded in-memory buffers.
- Safe shutdown flush hooks where possible through explicit `Flush` and documented signal handling examples.

Transport failures must never panic into application code. File writes must follow `SEC-12` through `SEC-15`: owner-only permissions, canonical path validation, symlink protection, and unpredictable temp file names.

---

## Capture Policy and Probes

The Go SDK must fetch `GET /v1/sdk/config` on init and poll according to backend SDK rules.

It must enforce:

- capture log level/off settings,
- request event capture modes,
- probe event capture modes,
- immediate client error status promotion,
- fallback to safe minimal behavior when config fetch fails.

Probe behavior must match the universal SDK contract:

- Always-on ring buffers for all tiers.
- Lazy `func() any` probe support.
- `ProbeHeavy` or `WithHeavyProbe()` equivalent for dormant heavy probes.
- Remote activation for paid tiers through config polling.
- Trigger token extraction from `_debug_probe` and `X-DebugBundle-Probe-Trigger`.
- Per-request activation only for trigger tokens.
- Request correlation (`trace_id`, `request_id`) on standalone `probe_event` shipping.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

Go request and exception events must include:

- `sdk_name`: `@debugbundle/sdk-go`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `trace_id` when `X-DebugBundle-Trace-Id` is present
- `correlation.request_id` when known
- sanitized payload
- safe runtime facts

Runtime facts may include `go_version`, `goos`, `goarch`, `pid`, `cwd`, `hostname`, goroutine count, memory statistics from `runtime.ReadMemStats`, and framework name/version where known. Environment variables must never be captured.

---

## Implementation Slices

1. Repository scaffold and build
   - Create `debugbundle-go` with Go modules, governance files, Makefile, CI, release workflow, lint, coverage, and examples.
   - Add core package plus optional integration subpackages.

2. Core event client
   - Config model, singleton and instance APIs, event envelope builder, buffer, flush, status, last event timestamp, mockable transport interface, HTTP transport.

3. Redaction and privacy
   - Default redaction rules, header allowlist, request/response body capture disabled by default, object depth and size limits, healthcare-style sensitive-field tests.

4. Suppression and backoff
   - Duplicate suppression, loop protection, retry, `Retry-After`, bounded buffers, no-throw/no-panic failure isolation.

5. net/http request and panic capture
   - Middleware, response writer wrapper, panic recovery capture, request ID/trace ID/route capture, context propagation.

6. Gin and Echo integrations
   - Thin adapters over the shared request-capture core, preserving native error and recovery behavior.

7. Logging integrations
   - `log/slog` handler first, then zap and zerolog optional subpackages, recursion guard, level filtering.

8. Local-first transport
   - Atomic local event file writes, local-only mode, secure file permissions, shutdown examples.

9. Capture policy and probes
   - Config fetch and polling, ETag handling, capture-policy enforcement, always-on probe buffers, remote activations, trigger tokens.

10. Browser relay
    - Framework-neutral `http.Handler`, origin/content-type/size/schema/rate-limit controls, local-only writes, durable spool, connected forwarding, shared relay compliance fixtures.

11. Documentation and examples
    - `net/http`, Gin, Echo, slog, zap, zerolog, local-only, connected, browser relay, privacy guidance, and release docs.

---

## Testing Plan

The Go SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for all universal methods.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for default and custom sensitive fields.
- Suppression and loop protection tests.
- Retry/backoff tests using `httptest.Server`.
- File transport atomic-write, permissions, symlink, and path-validation tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger-token tests.
- `net/http` middleware tests with `httptest`.
- Gin and Echo integration tests.
- slog, zap, and zerolog integration tests.
- Relay compliance fixtures for valid, invalid, credential-smuggling, wrong-origin, oversized, rate-limited, local-only, durable-spool, and connected-forwarding cases.
- Race tests for concurrent capture and flush paths with `go test -race` in CI.

CI matrix:

```text
Go 1.21
Go 1.22
Go 1.23
Go 1.24
Go 1.25
Go 1.26 / current stable Go as of 2026-05-23
Gin 1.x with the minimum and current Go lanes
Echo 4.x with the minimum and current Go lanes
```

Future releases must refresh the concrete Go version list before cutting the SDK: keep `go.mod` at the minimum supported version, keep compatibility lanes for every still-claimed minor, and ensure the matrix includes the previous officially supported Go release plus current stable as Go releases advance.

Quality gates:

- `go test ./...`
- `go test -race ./...`
- `go vet ./...`
- `golangci-lint run`
- Coverage threshold at or above the SDK standard.
- `go list -m` and package examples validate the publishable module.

---

## Release Readiness Checklist

- [ ] Universal Go API implemented.
- [ ] Instance client and singleton facade implemented.
- [ ] `net/http`, Gin, and Echo integrations capture requests, panics, and trace/request IDs.
- [ ] `log/slog`, zap, and zerolog integrations capture structured logs without recursion.
- [ ] Local-only and connected transports are implemented.
- [ ] Secure local file writes enforce owner-only permissions, path validation, symlink protection, and unpredictable temp names.
- [ ] Duplicate suppression and loop protection match the universal contract.
- [ ] Capture policy is fetched, cached, polled, and enforced locally with ingestion as a backstop.
- [ ] Always-on probes, remote probes, heavy probes, and trigger tokens are implemented.
- [ ] Browser relay covers the shared relay contract: origin validation, content type, body size, schema, credential stripping, local-only writes, durable spool, connected forwarding, and rate limiting.
- [ ] SDK failures never panic into host application code.
- [ ] Request and response bodies are off by default.
- [ ] Header capture is allowlist-based by default.
- [ ] Existing `X-Request-Id` is preserved.
- [ ] `X-DebugBundle-Trace-Id` links browser and backend events.
- [ ] Public docs include install, `net/http`, Gin, Echo, browser relay, local-only, connected, logging, probes, and privacy examples.
- [ ] CI passes all supported Go version lanes and race tests.

---

## Open Decisions

- Whether zap and zerolog should ship in V1 or whether `log/slog` plus documented manual `CaptureLog` should be the initial release floor.
- Whether panic middleware should re-panic by default or recover/write `500` by default for `net/http`; the default must preserve common Go expectations and be documented clearly.
- Whether Gin/Echo packages should be separate Go modules or subpackages within one module.
- Whether gRPC should be the first post-V1 integration or wait until after real user demand.
- Whether runtime dependency capture should inspect `debug.ReadBuildInfo()` module metadata by default or only expose it through an explicit helper to avoid large payloads.