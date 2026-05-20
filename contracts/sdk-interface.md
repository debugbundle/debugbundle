# SDK Interface Contract — DebugBundle

Version: v1
Last updated: 2026-05-19

This contract defines the standard interface that ALL DebugBundle SDKs must implement, regardless of language. It ensures behavioral consistency across Node.js, browser, Python, PHP, Go, Ruby, and all future language SDKs.

---

## 1. Initialization

Every SDK must expose an init function that accepts a configuration object and returns a monitor instance (or configures a singleton).

**Required config fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectToken` | string | — | Required. Project token for ingestion auth. |
| `environment` | string | auto-detect | `production`, `staging`, `development`, etc. |
| `service` | string | auto-detect | Service name for multi-service projects. |
| `enabled` | boolean | `true` | Kill switch. When false, SDK is a no-op. |

**Optional config fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `redactFields` | string[] | `["password", "secret", "token", "authorization", "cookie", "ssn", "credit_card"]` | Fields to redact. |
| `sampleRate` | number (0.0–1.0) | `1.0` | Sampling rate for events. |
| `batchSize` | number | `25` | Max events per batch. Language SDKs override: Node.js uses `50` (FR-SDK-06). |
| `flushInterval` | number (ms) | `5000` | Max time before batch is sent. Language SDKs override: Node.js uses `2000` (FR-SDK-06). |
| `endpoint` | string | `https://api.debugbundle.com/v1/events` | Ingestion endpoint (self-host override). |
| `probesPollInterval` | number (ms) | `60000` | Interval for polling `GET /v1/sdk/config` for remote probe directives (paid tiers only). Free-tier SDKs do not poll. |
| `maxProbeLabels` | number | `50` | Max distinct probe labels tracked in ring buffer. New labels beyond this are silently dropped. |
| `maxProbeEntriesPerLabel` | number | `10` | Ring buffer capacity per label. Oldest entry discarded when full. |
| `probeFlushOnError` | boolean | `true` | Whether probe ring buffers flush alongside error events. |

**Node.js local-first config fields (`@debugbundle/sdk-node`):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectMode` | `"connected" \| "local-only"` | `"connected"` | Selects transport behavior. `local-only` keeps local/dev on file transport and warns instead of shipping staging/production remotely. `connected` keeps local/dev on file transport and staging/production on HTTP transport. |
| `localEventsDir` | string | `<cwd>/.debugbundle/local/events` | Filesystem destination for Node file transport batches. |

**Capture policy note:** SDKs do NOT accept capture policy fields in the init config. The capture policy is server-owned and delivered to SDKs via the `capture_policy` field in the `GET /v1/sdk/config` response. SDKs must respect the server-side policy and filter events locally before transmission. See Section 12 (Capture Policy Integration) for details.

### 1.2 Node.js local-first transport selection

The Node.js SDK resolves its default transport from `projectMode` plus the configured environment when no explicit custom transport is supplied:

| `projectMode` | Environment | Transport behavior |
|---------------|-------------|--------------------|
| `local-only` | `local`, `development` | File transport to `.debugbundle/local/events/` |
| `local-only` | `staging`, `production` | No remote capture; emit diagnostic warning instructing the user to run `debugbundle connect` |
| `connected` | `local`, `development` | File transport to `.debugbundle/local/events/` |
| `connected` | `staging`, `production` | HTTP transport to the configured ingestion endpoint |

Node file transport writes one batch per file using atomic temp-file + rename with the filename format `<timestamp>-<sequence>-<service>.events.json` so concurrent local services can write safely into the same events directory.

## 1.1 Required Volume-Control Behavior

These behaviors are mandatory across all SDKs. A new language SDK is non-compliant if any of these are missing, even if the method surface matches.

### Duplicate Suppression

- SDKs must send the first 3 identical events normally within a 30-second window.
- Additional identical events in that window must be suppressed locally.
- Suppressed duplicates must be represented by an aggregate `error_suppressed` event carrying at minimum: fingerprint, suppressed count, first seen timestamp, last seen timestamp, and suppression window length.
- Suppression happens before network transmission so storm control reduces ingestion and storage cost, not just UI noise.

### Loop Protection

- More than 10 identical errors in 2 seconds must force immediate suppression mode.
- While suppression mode remains active, the SDK must emit a checkpoint aggregate at least every 30 seconds so operators still see sustained volume.
- Suppression mode must reset after 60 seconds of silence for that fingerprint.
- Suppression state is in-memory only and resets on process restart / page reload.

### Buffer Retention and Backoff

- Non-success transport responses must not drop buffered events.
- When ingestion returns `429 Too Many Requests`, SDKs must preserve the buffered events and back off before retrying.
- SDKs must respect `Retry-After` when present; otherwise they must apply a safe default backoff.
- Backoff and retry behavior must not block the host request/response path or crash the host application/page.

**Browser-specific config fields (sdk-browser only):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxBreadcrumbs` | number | `10` | Ring buffer capacity for breadcrumbs (clicks, routes, network, console). Oldest discarded when full. |
| `breadcrumbsOnErrorOnly` | boolean | `true` | When true, breadcrumbs are only flushed alongside a `frontend_exception`. When false, breadcrumbs are batched and shipped independently. |
| `captureNetwork` | boolean | `true` | Enable/disable network request breadcrumb capture. |
| `captureClicks` | boolean | `true` | Enable/disable click breadcrumb capture. |
| `captureRouteChanges` | boolean | `true` | Enable/disable route change breadcrumb capture. |
| `captureConsole` | boolean | `false` | Enable/disable console.error/warn breadcrumb capture (opt-in). |
| `networkFilter` | object | `{}` | Filter network breadcrumbs. Fields: `urlPatterns` (string[]/RegExp[] allow list), `urlDenyPatterns` (string[]/RegExp[] deny list), `statusCodes` (default: `[400-599]` — only 4xx/5xx), `minResponseTime` (ms, omit faster requests). |
| `sessionSampleRate` | number (0.0–1.0) | `1.0` | Session-level sampling. Decision made once per session — entire journey captured or nothing. Independent of `sampleRate`. |
| `maxEventsPerSession` | number | `100` | Hard cap on events per session. After cap, only `frontend_exception` events are captured. |

Browser `fetch()` calls may include an optional `debugbundle` metadata object in the init bag:

```ts
fetch("/v1/auth/session", {
  credentials: "include",
  debugbundle: {
    operation: "auth.session.get",
    initiator: "session.bootstrap",
    feature: "auth"
  }
});
```

When present, the browser SDK must copy this metadata into the captured `network_request` breadcrumb payload and must not forward the `debugbundle` field to the actual HTTP request.

---

## 2. Universal SDK Interface

Every language SDK must implement the same core methods. This universal interface makes the system scalable across languages — any developer or agent familiar with one SDK can immediately use another.

| Method | Signature | Description |
|--------|-----------|-------------|
| `init` | `(config) → void` | Initialize the SDK. Must be called once. |
| `captureException` | `(error, context?) → void` | Capture an exception/error object with stack trace. |
| `captureError` | `(error, context?) → void` | Required convenience alias for `captureException` per `FR-SDK-16`. |
| `captureLog` | `(message, level, context?) → void` | Capture a structured log entry at a given severity level. |
| `captureRequest` | `(request, response, context?) → void` | Capture HTTP request/response metadata for request-event correlation. |
| `captureMessage` | `(message, level?, context?) → void` | Capture an arbitrary message (breadcrumb, diagnostic, custom). |
| `setContext` | `(key, value) → void` | Attach persistent context (user, org, request, deploy). |
| `flush` | `() → Promise<void>` | Force-send all buffered events. Call before process exit. |
| `probe` | `(label, data \| () → data, opts?) → void` | Buffer diagnostic data in per-label ring buffer; flushes alongside errors (all tiers). When remotely activated (paid tiers), also ships independently. Backend SDKs accept lazy callback + `{ heavy: true }` option; browser SDK accepts data only. |
| `status` | `→ "healthy" \| "degraded" \| "disconnected"` | Read-only. `healthy`: last flush succeeded or idle. `degraded`: rate-limited (429). `disconnected`: not initialized or ≥3 consecutive failures. |
| `lastEventAt` | `→ number \| null` | Read-only. Unix ms timestamp of last successful event delivery, or `null` if none yet. |

### Language Naming Conventions

SDKs must use the idiomatic naming convention for the target language while keeping method names semantically identical:

| Language | Style | Example |
|----------|-------|---------|
| Node.js / Browser | camelCase | `debugbundle.captureException(err)` |
| Python | snake_case | `debugbundle.capture_exception(err)` |
| PHP | camelCase (PSR) | `DebugBundle::captureException($e)` |
| Go | PascalCase (exported) | `debugbundle.CaptureException(err)` |
| Ruby | snake_case | `DebugBundle.capture_exception(err)` |
| Java | camelCase | `DebugBundle.captureException(err)` |
| C# | PascalCase | `DebugBundle.CaptureException(err)` |
| Kotlin | camelCase | `DebugBundle.captureException(err)` |
| Swift | camelCase | `DebugBundle.captureException(err)` |
| Rust | snake_case | `debugbundle::capture_exception(err)` |
| Dart | camelCase | `debugBundle.captureException(err)` |

---

## 3. Vanilla Language Hooks

Before framework integrations, every backend SDK must support the **vanilla runtime** — hooking into the language's native error, exception, and logging mechanisms with zero framework dependency.

### 3.1 Node.js — Vanilla Hooks

```js
const debugbundle = require('@debugbundle/sdk-node');

debugbundle.init({ projectToken: process.env.DEBUGBUNDLE_TOKEN });

// Automatic hooks (opt-in)
debugbundle.captureConsole();       // Wraps console.error, console.warn
debugbundle.captureExceptions();    // process.on('uncaughtException')
debugbundle.captureRejections();    // process.on('unhandledRejection')
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| `captureConsole()` | Monkey-patches `console.error` and `console.warn` | Off (opt-in) |
| `captureExceptions()` | `process.on('uncaughtException', handler)` | On via `init()` |
| `captureRejections()` | `process.on('unhandledRejection', handler)` | On via `init()` |

**Logger integrations (optional, auto-detected):**

| Logger | Integration | How |
|--------|-------------|-----|
| pino | Custom transport | `pino({ transport: { target: '@debugbundle/pino-transport' } })` |
| winston | Custom transport | `logger.add(new DebugBundleTransport())` |
| bunyan | Custom stream | `bunyan.createLogger({ streams: [{ stream: debugbundleStream }] })` |

When `init()` is called, the SDK should auto-detect installed loggers (check `require.resolve`) and offer to register handlers. With framework integrations (Express/Fastify/Next.js), this is automatic.

### 3.2 PHP — Vanilla Hooks

```php
use DebugBundle\DebugBundle;

DebugBundle::init(['projectToken' => $_ENV['DEBUGBUNDLE_TOKEN']]);

// Automatic hooks (opt-in)
DebugBundle::captureErrors();       // set_error_handler()
DebugBundle::captureExceptions();   // set_exception_handler()
DebugBundle::captureShutdown();     // register_shutdown_function() for fatal errors
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| `captureErrors()` | `set_error_handler()` | On via `init()` |
| `captureExceptions()` | `set_exception_handler()` | On via `init()` |
| `captureShutdown()` | `register_shutdown_function()` for fatal errors | On via `init()` |

**Logger integrations (optional):**

| Logger | Integration | How |
|--------|-------------|-----|
| Monolog | Custom handler | `$logger->pushHandler(new DebugBundleHandler())` |
| Laravel Log | Log channel | Add `'debugbundle'` channel to `config/logging.php` |
| Symfony Log | Monolog config | Add handler in `monolog.yaml` |

PHP's shared-nothing model (one process per request) means logs accumulate during the request and flush at request termination automatically.

### 3.3 Python — Vanilla Hooks

```python
import debugbundle

debugbundle.init(project_token=os.environ["DEBUGBUNDLE_TOKEN"])

# Automatic hooks (opt-in)
debugbundle.capture_logging()       # logging module handler
debugbundle.capture_exceptions()    # sys.excepthook
debugbundle.capture_async()         # asyncio loop exception handler
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| `capture_logging()` | Adds `DebugBundleHandler` to `logging.getLogger()` | Off (opt-in) |
| `capture_exceptions()` | Sets `sys.excepthook` | On via `init()` |
| `capture_async()` | Sets `loop.set_exception_handler()` for asyncio | On when asyncio detected |

**Logger integrations (optional):**

| Logger | Integration | How |
|--------|-------------|-----|
| stdlib `logging` | Custom Handler | `logging.getLogger().addHandler(DebugBundleHandler())` |
| Django LOGGING | Dict config | Add handler to `LOGGING['handlers']` in `settings.py` |
| structlog | Processor | `structlog.configure(processors=[..., debugbundle_processor])` |
| loguru | Custom sink | `logger.add(debugbundle.loguru_sink)` |

### 3.4 Go — Vanilla Hooks

```go
package main

import "github.com/debugbundle/debugbundle-go"

func main() {
    debugbundle.Init(debugbundle.Config{
        ProjectToken: os.Getenv("DEBUGBUNDLE_TOKEN"),
    })
    defer debugbundle.Flush()

    // Automatic hooks
    debugbundle.CapturePanics()  // recover() wrapper for goroutine panics
}
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| `CapturePanics()` | `recover()` wrapper — captures panic value + stack trace | On via `Init()` |

**Logger integrations (optional):**

| Logger | Integration | How |
|--------|-------------|-----|
| `log/slog` | Custom Handler | `slog.SetDefault(slog.New(debugbundle.SlogHandler()))` |
| zerolog | Hook | `zerolog.New(os.Stdout).Hook(debugbundle.ZerologHook())` |
| zap | Core wrapper | `zap.New(debugbundle.ZapCore(existingCore))` |

Go's `context.Context` is the primary mechanism for per-request correlation. The SDK provides `debugbundle.WithContext(ctx)` to attach DebugBundle metadata to the request context.

### 3.5 Ruby — Vanilla Hooks

```ruby
require 'debugbundle'

DebugBundle.init(project_token: ENV['DEBUGBUNDLE_TOKEN'])

# Automatic hooks
DebugBundle.capture_exceptions   # at_exit + Thread exception handler
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| `capture_exceptions` | `at_exit` block + `Thread.report_on_exception` handler | On via `init` |

**Logger integrations (optional):**

| Logger | Integration | How |
|--------|-------------|-----|
| Ruby `Logger` | Custom device/formatter | `Logger.new(DebugBundle::LogDevice.new)` |
| Rails logger | Broadcast subscriber | Auto-registered via Railtie |
| Semantic Logger | Appender | `SemanticLogger.add_appender(appender: DebugBundle::SemanticAppender.new)` |

Ruby's Rack middleware captures request context automatically. Sidekiq server middleware captures job context for background job errors.

### 3.6 Browser — Vanilla Hooks

```js
import { debugbundle } from '@debugbundle/sdk-browser';

debugbundle.init({
  projectToken: 'dbundle_proj_...',
  // Browser-specific volume controls (all optional, shown with defaults):
  // maxBreadcrumbs: 10,
  // breadcrumbsOnErrorOnly: true,
  // captureNetwork: true,
  // captureClicks: true,
  // captureRouteChanges: true,
  // captureConsole: false,
  // networkFilter: { statusCodes: [400, 599] },
  // sessionSampleRate: 1.0,
  // maxEventsPerSession: 100,
});

// Automatic hooks (on by default)
// - window.onerror (global exceptions)
// - window.onunhandledrejection (promise rejections)
// - console.error wrapping (opt-in)
// - Performance observer for long tasks (opt-in)
```

| Hook | Mechanism | Default |
|------|-----------|---------|
| Global errors | `window.addEventListener('error', handler)` | On via `init()` |
| Promise rejections | `window.addEventListener('unhandledrejection', handler)` | On via `init()` |
| Console capture | Wraps `console.error`, `console.warn` | Off (opt-in via `captureConsole: true`) |
| Network capture | `fetch` / `XMLHttpRequest` wrapping | On via `init()` (filterable via `networkFilter`) |
| Click capture | `document.addEventListener('click', handler)` | On via `init()` |
| Route change capture | `popstate` + `pushState`/`replaceState` wrapping | On via `init()` |
| Device context | Snapshot on `init()` — UA, browser, OS, screen, viewport, touch, locale, connection, color scheme | On via `init()` (always collected) |

### Device Context Collection

The browser SDK collects device/browser metadata once on `init()` and attaches it to all outgoing events as a `device` field on each event payload. This data populates both the `frontend_exception.device` payload field and the bundle's `context.device` block.

**Collected fields:**

| Field | Source | Notes |
|-------|--------|-------|
| `user_agent` | `navigator.userAgent` | Raw UA string |
| `browser.name` | Parsed from UA / `navigator.userAgentData` | e.g. `Chrome`, `Firefox`, `Safari` |
| `browser.version` | Parsed from UA / `navigator.userAgentData` | e.g. `122.0.6261.94` |
| `os.name` | Parsed from UA / `navigator.userAgentData` | e.g. `macOS`, `Windows`, `iOS`, `Android` |
| `os.version` | Parsed from UA / `navigator.userAgentData` | e.g. `14.3`, `11`, `17.4` |
| `device_type` | Derived from UA (mobile/tablet heuristics) | `desktop`, `mobile`, `tablet`, or `unknown` |
| `screen` | `{ width: screen.width, height: screen.height }` | Physical screen resolution |
| `viewport` | `{ width: window.innerWidth, height: window.innerHeight }` | CSS pixel viewport size |
| `device_pixel_ratio` | `window.devicePixelRatio` | Retina/HiDPI scaling factor |
| `touch_capable` | `navigator.maxTouchPoints > 0` | Touch input support |
| `language` | `navigator.language` | BCP 47 language tag (e.g. `en-US`) |
| `connection_type` | `navigator.connection?.effectiveType` | Network quality (`4g`, `3g`, `2g`, `slow-2g`) or `null` if unavailable |
| `color_scheme_preference` | `matchMedia('(prefers-color-scheme: dark)')` | `light`, `dark`, `no-preference`, or `null` |

**Collection rules:**
- Collected once per session on `init()` — values are a snapshot, not live-updated.
- `navigator.userAgentData` (Client Hints API) is preferred when available; falls back to `navigator.userAgent` parsing.
- Fields that cannot be determined are set to `null`.
- No fine-grained hardware identifiers (GPU model, serial numbers) are collected.
- Device context is subject to the same redaction rules as all other captured data.

### Breadcrumb Ring Buffer Behavior

Non-exception browser captures (clicks, route changes, network summaries, console entries) are **breadcrumbs** by default. They accumulate in a fixed-size ring buffer (`maxBreadcrumbs`, default 10). First-party network responses that match the active preset's immediate request-failure statuses are the exception: the browser SDK must keep the `network_request` breadcrumb for timeline context and also emit a standalone `request_event` so the failure can create a request-failure incident. Immediate request-failure presets are `minimal`: `5xx`; `balanced`: `5xx`, `408`, `423`, `424`, `425`, `429`; `investigative`: balanced plus `409`. When `capture_request_events` is `failures_only`, first-party browser responses in the preset's request-anomaly set also emit standalone `request_event` context signals so repeated failures can cross the worker anomaly threshold without reclassifying the source events. When a `frontend_exception` occurs:

1. The ring buffer contents are attached to the exception event as `breadcrumbs[]`.
2. The combined payload (exception + breadcrumbs) is shipped as a single batch.
3. The ring buffer is cleared after flush.

When `breadcrumbsOnErrorOnly` is `true` (default), breadcrumbs are **never** shipped independently — they only appear as context for errors. When set to `false`, breadcrumbs are batched and shipped on their own schedule (standard batching rules apply).

### Session Sampling and Event Caps

- `sessionSampleRate` decision is made once at session start (random check against threshold). If the session is sampled out, the SDK becomes a no-op for all non-exception events for that session.
- `maxEventsPerSession` is a hard ceiling. After the cap, only `frontend_exception` events and first-party immediate request-failure `request_event` incident signals are captured. Breadcrumbs stop accumulating. The cap resets on new session (page reload or new tab).

### Browser Storm Controls

- Browser SDKs must apply the same duplicate suppression and loop-protection guarantees defined in Required Volume-Control Behavior above.
- `frontend_exception` and `error_suppressed` events remain capturable even when non-exception session caps are exhausted.
- Browser SDKs must retain buffered events across failed or throttled flush attempts and retry after the backoff window instead of discarding them.

---

## 3.7 Cross-Context Trace Correlation

The browser SDK injects a `X-DebugBundle-Trace-Id` header (UUID v4) into all outgoing `fetch` and `XMLHttpRequest` requests. Backend SDKs read this header and tag all events from that request with the trace ID.

### Browser SDK (Automatic)
```js
// When Network capture is enabled (default), outgoing requests include:
// X-DebugBundle-Trace-Id: <uuid-v4>
// The SDK wraps fetch() and XMLHttpRequest.open() to inject the header.
```

### Backend SDK (Automatic)
```js
// Framework middleware reads X-DebugBundle-Trace-Id from incoming request headers.
// If present, all events captured during that request include trace_id in the envelope.
// If absent (non-browser client, or browser SDK not installed): no failure, just no cross-context link.
```

### Event Envelope
```json
{
  "event_type": "backend_exception",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "...": "..."
}
```

### Incident Grouping

### Backend Runtime Facts

Backend SDKs should include safe runtime facts in `backend_exception.payload.runtime` when the host language exposes them without reading environment variables or secrets. The common optional fields are `platform`, `arch`, `pid`, `cwd`, `uptime_sec`, `hostname`, `thread_id`, `framework_version`, `memory`, and `framework_extras`; unavailable values may be omitted or set to `null`.

Current package scope: `@debugbundle/sdk-node`, `debugbundle-python`, and `debugbundle/sdk-php` capture safe backend process facts while excluding environment variables.
Incidents use `trace_id` to link frontend breadcrumbs to backend exceptions. This enables the bundle to include the full user journey (frontend actions → backend failure) in a single debug context.

| Behavior | Rule |
|----------|------|
| Header injection | Browser SDK wraps `fetch`/`XHR`, injects `X-DebugBundle-Trace-Id` (UUID v4) |
| Header reading | Backend middleware reads header, attaches to event context |
| Missing header | No failure — backend events ungrouped from frontend |
| Trace ID format | UUID v4, generated per outgoing browser request |
| Envelope field | `trace_id` (top-level, optional) |

---

## 4. Log Capture Mechanism

**Core principle: Logs are captured in-process via logging library plugins, never by reading log files.**

```
App Code → Logging Library → [DebugBundle Handler] → SDK Buffer → Batch Flush → API
                           ↓
                    [File Handler] → log file (unchanged, not read by DebugBundle)
```

The DebugBundle handler sits alongside existing handlers. Logs flow to both destinations. This means:
1. **No file system permissions needed** — capture is in-process
2. **Real-time** — captured at emit time, zero latency
3. **Structured** — receives the log record object (level, message, context, timestamp), not raw text
4. **Filterable** — only capture `warning` and above by default (configurable via `logLevel` in init config)
5. **Redactable** — redaction rules applied before the log event enters the batch buffer
6. **Batched** — feeds into the same SDK event buffer as exceptions and requests

### Log Level Filtering

| Init Config | Type | Default | Description |
|-------------|------|---------|-------------|
| `logLevel` | string | `"warning"` | Minimum log level to capture: `debug`, `info`, `warning`, `error`, `critical` |

Events below the configured level are silently discarded. This keeps SDK overhead minimal in production.

### Event Type Mapping

Captured logs are emitted as `log_event` normalized events:

```json
{
  "event_type": "log_event",
  "timestamp": "ISO8601",
  "payload": {
    "level": "error",
    "message": "Database connection timeout",
    "logger": "app.db",
    "context": { "host": "db-primary", "timeout_ms": 5000 }
  }
}
```

---

## 5. Safety Guarantees

All SDKs must uphold these invariants (see AGENTS.md section 8 — SDK Safety):

1. **Never throw** — SDK code must never throw uncaught exceptions into user code.
2. **Never block** — SDK must not block the request/response cycle or main thread.
3. **Never crash** — SDK failures are caught internally and swallowed silently.
4. **Graceful degradation** — If ingestion endpoint is unreachable, buffer locally (up to limit), then drop silently.
5. **No side effects on import** — Importing the SDK without calling `init()` must have zero side effects.

---

## 6. Event Normalization

All SDKs must normalize captured data into the canonical event envelope (see `/contracts/data-schemas.md`):

```
{
  "event_type": "<type>",
  "timestamp": "ISO8601",
  "service": "<service>",
  "environment": "<environment>",
  "sdk_name": "@debugbundle/sdk-<lang>",
  "sdk_version": "<version>",
  "payload": { ... }
}
```

SDK name follows the pattern `@debugbundle/sdk-{language}`.

---

## 7. Duplicate Suppression

All SDKs must implement duplicate suppression:

- Track recent events by fingerprint (error message + stack trace hash).
- Send first 3 identical events normally, suppress duplicates in a 30-second window, and emit aggregate summary events.
- After >10 identical errors in 2 seconds, enter loop-protection suppression mode and emit a single `error_suppressed` event with a count.

### Loop Protection Recovery

- Suppression resets after **60 seconds of silence** (no matching errors for that fingerprint).
- During sustained suppression: emit a **checkpoint aggregate every 30 seconds** with the count since last checkpoint.
- On process restart: all suppression state resets (in-memory only, not persisted).

---

## 8. Redaction

All SDKs must implement field redaction before transmission:

- Default redact list applied to all captured data.
- Users can extend or override the redact list via config.
- Redacted values replaced with `[REDACTED]`.
- Redaction is applied before any network call — sensitive data must never leave the process.

---

## 9. Framework Integration Pattern

Language SDKs should provide framework-specific middleware/plugins that auto-capture events. The pattern:

1. **Middleware/plugin** — Hooks into the framework's request lifecycle.
2. **Auto-capture** — HTTP requests, responses, errors, exceptions, logs, queries (framework-dependent).
3. **Zero config** — Works with `init()` call only; no manual instrumentation required.
4. **Opt-out granularity** — Individual capture types can be disabled.
5. **Auto-detect loggers** — On `init()`, detect installed logging libraries and register DebugBundle handlers automatically.

### Framework Log Handler Integration

Framework integrations must auto-register log capture alongside error/request capture:

| Framework | Logger | Auto-Registration |
|-----------|--------|--------------------|
| Express | Detected (pino/winston/bunyan/console) | `init()` auto-detects and hooks |
| Fastify | pino (built-in) | Plugin hooks pino transport |
| Next.js | Detected (console default) | Wrapper hooks console + detected |
| Django | stdlib `logging` (built-in) | Middleware adds handler to root logger |
| Flask | stdlib `logging` (built-in) | Error handler adds handler to app logger |
| FastAPI | stdlib `logging` / loguru | Middleware auto-detects and hooks |
| Laravel | Monolog (built-in) | Service provider registers log channel |
| Symfony | Monolog (built-in) | Bundle registers handler in monolog config |
| Gin / Echo / net/http | Detected (slog/zerolog/zap) | `Init()` auto-detects and hooks |
| Ruby on Rails | Rails logger (built-in) | Railtie registers broadcast subscriber |
| Rack / Sidekiq | Detected (Ruby Logger / Semantic Logger) | `init` auto-detects and hooks |

---

## 10. Language-Specific SDKs

### V1 SDK Targets (Wave 1)

> Node.js, Browser, shared-types, and redaction live in the JS SDK monorepo: `github.com/debugbundle/debugbundle-js`

| Language | Package | Registry | Phase | Status |
|----------|---------|----------|-------|--------|
| Node.js | `@debugbundle/sdk-node` | npm | Phase 8 | Shipped (in `debugbundle-js` repo) |
| Browser | `@debugbundle/sdk-browser` | npm | Phase 9 | Shipped (in `debugbundle-js` repo) |
| Python | `debugbundle-python` | PyPI | Phase 18 | Shipped |
| PHP | `debugbundle/sdk-php` | Packagist | Phase 18a | Shipped |
| Go | `github.com/debugbundle/debugbundle-go` | Go modules | Phase 18b | Planned |
| Ruby | `debugbundle` | RubyGems | Phase 18c | Planned |

### V1 SDK Targets (Wave 2 — Enterprise & Platform Depth)

| Language | Package | Registry | Status |
|----------|---------|----------|--------|
| Java | `com.debugbundle:sdk-java` | Maven Central | Planned |
| C# | `DebugBundle.Sdk` | NuGet | Planned |
| Kotlin (server) | `com.debugbundle:sdk-kotlin` | Maven Central | Planned |
| Rust | `debugbundle` | crates.io | Planned |

### V1 SDK Targets (Wave 3 — Client & Mobile Expansion)

| Language | Package | Registry | Status |
|----------|---------|----------|--------|
| Kotlin (Android) | `com.debugbundle:sdk-android` | Maven Central | Planned |
| Swift (iOS) | `DebugBundle` | Swift Package Manager | Planned |
| React Native | `@debugbundle/sdk-react-native` | npm | Planned |
| Dart / Flutter | `debugbundle` | pub.dev | Planned |

### V1 Framework Support Matrix

| Language | Framework | Integration Type |
|----------|-----------|------------------|
| Node.js | Express | Middleware |
| Node.js | Fastify | Plugin |
| Node.js | Next.js | API route wrapper |
| Python | Django | Middleware |
| Python | Flask | Error handler + before/after request |
| Python | FastAPI | Middleware |
| PHP | Laravel | Middleware + exception handler + service provider |
| PHP | Symfony | Event subscriber + bundle |
| Java | Spring Boot | Servlet filter + exception handler |
| Go | net/http | Middleware |
| Go | Gin | Middleware |
| Go | Echo | Middleware |
| Ruby | Ruby on Rails | Middleware + Railtie |
| Ruby | Rack | Middleware |
| Ruby | Sidekiq | Server middleware |
| C# | ASP.NET Core | Middleware |
| Kotlin (server) | Ktor | Plugin |
| Kotlin (Android) | Android | Application lifecycle hooks |
| Swift (iOS) | UIKit / SwiftUI | App lifecycle hooks |
| Rust | Axum | Layer / middleware |
| Rust | Actix Web | Middleware |
| Dart / Flutter | Flutter | RunZonedGuarded + NavigatorObserver |
| Browser | Vanilla / React / Next.js client-side / Vue / Angular / Svelte / SPA | Auto-capture hooks |

### 10.1 Mobile SDK Correlation Contract

Mobile SDKs (Kotlin Android, Swift iOS, React Native, Dart/Flutter) must implement cross-boundary trace correlation equivalent to the browser SDK's `X-DebugBundle-Trace-Id` mechanism.

**Trace ID injection by platform:**

| Platform | HTTP Client | Injection mechanism |
|----------|------------|---------------------|
| Kotlin Android | OkHttp | `Interceptor` that adds `X-DebugBundle-Trace-Id` header |
| Swift iOS | URLSession | `URLProtocol` subclass or delegate wrapper that adds header |
| React Native | fetch (JS bridge) | Same as browser SDK — fetch wrapper |
| Dart / Flutter | `http` / `dio` | `Interceptor` that adds header |

**Mobile-specific event types:**

Mobile SDKs reuse the existing `frontend_exception` and `frontend_breadcrumb` event types. No new mobile-only event types are introduced. Mobile-specific context (app version, build number, OS version, device model, network state) is captured as device context fields extending the browser SDK's `device` schema.

**Extended device context fields (mobile SDKs):**

| Field | Source | Notes |
|-------|--------|-------|
| `app_version` | App manifest / Info.plist | Semantic version string |
| `build_number` | App manifest / Info.plist | Build identifier |
| `release_channel` | SDK config | e.g., `production`, `beta`, `testflight` |
| `jailbroken` | Runtime detection | `true`, `false`, or `null` if undetectable |
| `battery_level` | System API | 0.0–1.0 or `null` if unavailable |
| `battery_charging` | System API | boolean or `null` |
| `free_disk_bytes` | System API | Available disk space or `null` |
| `free_memory_bytes` | System API | Available RAM or `null` |

**Offline queueing (mobile SDKs):**

Mobile SDKs must support offline event capture with deferred delivery:

1. Events are serialized to a durable local queue (SQLite or app-local file storage — platform-idiomatic choice).
2. Queue is bounded (configurable max size, default 500 events or 5 MB).
3. On connectivity restoration, queued events are delivered using standard batching + retry.
4. Queue survives app restarts.
5. Events older than 72 hours are discarded from the queue on delivery attempt.

**Navigation breadcrumbs (mobile SDKs):**

Mobile breadcrumbs capture screen transitions and user actions into the same breadcrumb ring buffer model as the browser SDK:

| Platform | Navigation capture | Action capture |
|----------|-------------------|----------------|
| Kotlin Android | `ActivityLifecycleCallbacks` + `NavController.OnDestinationChangedListener` | Touch event logging (configurable) |
| Swift iOS | `UINavigationControllerDelegate` + SwiftUI `NavigationStack` observer | Touch event logging (configurable) |
| React Native | React Navigation listener | Same as browser SDK |
| Dart / Flutter | `NavigatorObserver` | Gesture detection (configurable) |

---

## 11. SDK Config & Probes

Probes operate in two modes:

- **Always-on (all tiers):** `probe()` buffers data in per-label ring buffers. On error, all ring buffers flush alongside the error event. Zero network cost during normal operation.
- **Remote-activated (paid tiers only):** Agents can activate probes for independent shipping (without waiting for errors) via API/CLI/MCP. Backend SDKs poll for directives; browser SDKs use piggybacking.

Free-tier SDKs get always-on probes (buffer + error-flush) but no remote activation: no config polling, no trigger tokens, activation API returns 403.

### Tier Detection

On `init()`, the SDK config response includes `probes_enabled: boolean` and `remote_probes_enabled: boolean`. When `probes_enabled` is `false`, the SDK disables all probe infrastructure (ring buffers + remote). When `probes_enabled` is `true` but `remote_probes_enabled` is `false` (Free tier), the SDK operates in always-on mode only (ring buffer + error-flush, no polling, no trigger tokens). When both are `true` (paid tier), full probe capability is armed.

### Backend SDK: Polling (Paid Tiers Only)

Backend SDKs poll `GET /v1/sdk/config` to discover active remote probe directives (paid tiers only). Free-tier backend SDKs do not poll.

| Rule | Detail |
|------|--------|
| Default interval | 60 seconds (`probesPollInterval` init config) |
| Active remote probes interval | 15 seconds (server instructs via `poll_interval_ms` in response) |
| Caching | `ETag` / `If-None-Match` — server returns 304 on no change. Response is CDN-edge-cached (`s-maxage=30`). |
| Failure | On poll failure, cached config stands. SDK does not crash or log errors to host. |
| TTL enforcement | SDK deactivates expired remote probes locally based on `expires_at`, without waiting for next poll. |
| Startup | First poll fires immediately on `init()` (paid tiers only). If it fails, SDK operates with always-on probes only (no remote activations). |

### Browser SDK: Zero Polling (Piggyback + Session-Start Check, Paid Tiers Only)

Browser SDKs **never** poll `GET /v1/sdk/config` periodically. This is critical for cost control — 10,000 concurrent browser users polling every 60s would generate 14.4M Cloudflare Worker requests/day.

Instead, browser SDKs receive remote probe directives through (paid tiers only):

1. **Session-start check:** On `init()`, one `GET /v1/sdk/config` request. CDN-edge-cached (`s-maxage=30`), so at scale nearly all requests are served from edge (zero Worker cost).
2. **Ingestion-response piggybacking:** Every `POST /v1/events` response includes a `probe_directives` field (for paid-tier projects with active remote probes; omitted otherwise). The SDK reads this field and updates its local remote probe state — zero additional HTTP requests.

Free-tier browser SDKs skip the session-start config check and ignore `probe_directives` in responses (always-on mode needs no remote config).

| Rule | Detail |
|------|--------|
| Periodic polling | **Disabled.** Browser SDK never polls on an interval. |
| Session start | Single `GET /v1/sdk/config` on `init()` (CDN-cached, paid tiers only). |
| Event response | Read `probe_directives` from `POST /v1/events` response body (paid tiers only). |
| Page lifecycle | Page reload = new `init()` = fresh config check. No mid-session polling. |
| TTL enforcement | Same as backend — local `expires_at` check, no network needed. |
| `probesPollInterval` config | **Not applicable** for browser SDK (ignored if set). |

### Config Response Shape

```json
{
  "probes_enabled": true,
  "remote_probes_enabled": true,
  "active_probes": [
    {
      "id": "uuid",
      "label_pattern": "checkout.*",
      "service": "checkout-api | *",
      "environment": "production | *",
      "expires_at": "ISO8601"
    }
  ],
  "poll_interval_ms": 60000
}
```

### Ingestion Response Shape (Browser Piggybacking)

When active probes exist for a paid-tier project, the `POST /v1/events` response includes:

```json
{
  "accepted": 1,
  "rejected": 0,
  "errors": [],
  "probe_directives": {
    "active_probes": [
      {
        "id": "uuid",
        "label_pattern": "checkout.ui.*",
        "service": "*",
        "environment": "production",
        "expires_at": "ISO8601"
      }
    ]
  }
}
```

`probe_directives` is omitted when no active remote probes exist or for free-tier projects (no payload bloat).

### Probe Method Behavior

1. SDK maintains per-label ring buffers for probe data (bounded by `maxProbeLabels` × `maxProbeEntriesPerLabel`).
2. On `probe(label, data)` call: serialize data, apply redaction, store in ring buffer for that label. If using `{ heavy: true }` option and no remote activation matches, return immediately (zero cost).
3. If `probeFlushOnError` is `true` (default): when an error event occurs (`backend_exception`, `frontend_exception`), all ring buffers are flushed alongside the error batch. Flushed probe entries are embedded on the exception payload as `payload.probe_data = { version: 1, items: [...] }`, where each item contains `label`, `data`, `timestamp`, and `activation_id: null`.
4. If a remote activation matches the label (paid tiers only): data is **also** emitted as `probe_event` through standard batching pipeline immediately (independent shipping). `activation_id` is set to the activation ID.
5. `probe_event` uses the same event envelope as all other events. It bypasses duplicate suppression (probes are inherently unique diagnostic captures).
6. Browser SDK: probe ring buffers are separate from breadcrumb ring buffers. Both flush on error. When remotely activated (paid tiers), probe events bypass `maxEventsPerSession` cap. They respect `sessionSampleRate`.

### Trigger Token (Direct Probe Activation, Paid Tiers Only)

In addition to polling/piggybacking, SDKs support a **trigger token** mechanism for direct, single-request probe activation (paid tiers only). This allows agents to attach a token to a specific HTTP request to force independent probe shipping, rather than waiting for the next poll cycle or error occurrence.

Trigger tokens have their own independent TTL (up to 24 hours), which can be longer than the passive activation TTL (max 1 hour). This is critical for support-ticket workflows where a diagnostic link is shared with a user who may not click it for hours.

**Key distinction with always-on:** Trigger tokens cause matching probes to **ship independently** for that request (like remote activation), in addition to the normal always-on ring buffer behavior.

**Delivery mechanisms:**

| Mechanism | Transport | Use case |
|-----------|-----------|----------|
| Query parameter | `?_debug_probe=dbundle_probe_...` | Browser URLs, shareable diagnostic links |
| Header | `X-DebugBundle-Probe-Trigger: dbundle_probe_...` | Backend API calls, agent-initiated requests |

**SDK validation (local, no API call):**

1. Extract trigger token from query param or header (header takes precedence if both present).
2. Verify HMAC-SHA256 signature using the project's signing key (derived from project token during `init()`).
3. Check `trigger_expires_at` embedded in the token payload — reject if expired. Note: this is the trigger token's own expiry, independent of the activation's `expires_at`.
4. Check label/service/environment scope — only activate matching probes.
5. If valid: activate matching probes for **this single request/session only**.
6. If invalid or expired: silently ignore (no error to host application, probes stay in polling-derived state).

**Browser-specific behavior:**

- On page load, the SDK reads `_debug_probe` from `window.location.search`.
- After reading, the SDK strips the parameter from the URL bar via `history.replaceState` (no page reload, no history entry).
- Trigger token activates probes for the current page load / session. Does not persist across navigations or reloads.

**Scope rules:**

- Trigger tokens are scoped to a single activation (same labels, service, environment).
- They do not override or conflict with polling-derived probe state — they are additive.
- A request/session may have probes active from both polling AND a trigger token simultaneously.
- The passive activation may expire while the trigger token remains valid — this is by design.

All SDKs must implement sections 1–8, section 11, section 12, and section 13 (server SDKs only) of this contract before release.

---

## 12. Capture Policy Integration

SDKs must respect the server-side capture policy delivered via `GET /v1/sdk/config`. The capture policy controls what event types are captured and shipped remotely.

### Policy Delivery

The `GET /v1/sdk/config` response includes a `capture_policy` field:

```json
{
  "capture_policy": {
    "preset": "minimal",
    "capture_logs": "error",
    "capture_request_events": "failures_only",
    "capture_breadcrumbs": "local_only",
    "capture_probe_events": "buffer_only",
    "immediate_client_error_statuses": []
  }
}
```

SDKs fetch this on `init()` alongside probe config. The policy is cached and refreshed on the same schedule as probe config (backend: polling interval; browser: session-start + piggybacking).

### SDK Enforcement Rules

| Control | Value | SDK Behavior |
|---------|-------|-------------|
| `capture_logs` | `off` | Discard all `log_event` before buffering |
| `capture_logs` | `error` | Only buffer/ship `log_event` with level `error` or `critical` |
| `capture_logs` | `warning` | Buffer/ship `log_event` with level `warning`, `error`, or `critical` |
| `capture_logs` | `info` | Buffer/ship `log_event` with level `info` and above |
| `capture_request_events` | `off` | Discard standalone `request_event` unless the response matches the active preset's immediate request-failure statuses or the resolved `immediate_client_error_statuses`; those immediate request failures are still captured as incident signals |
| `capture_request_events` | `failures_only` | Buffer/ship immediate request-failure `request_event` for the active preset (`minimal`: `5xx`; `balanced`: `5xx`, `408`, `423`, `424`, `425`, `429`; `investigative`: balanced plus `409`) plus any resolved `immediate_client_error_statuses`, and also ship preset-enabled request-anomaly candidate `request_event` context signals (`balanced`: `400`, `401`, `403`, `404`, `409`, `410`, `422`; `investigative`: same set with lower thresholds). Minimal has no request-anomaly candidates. |
| `capture_request_events` | `filtered` | Buffer/ship `request_event` matching configured filters; until custom filters are available, SDKs keep only immediate request failures and do not ship additional filtered request context |
| `capture_request_events` | `all` | Buffer/ship all `request_event` |
| `capture_breadcrumbs` | `local_only` | Keep breadcrumbs in local ring buffer; flush only with exceptions |
| `capture_breadcrumbs` | `exception_only` | Ship breadcrumbs only when attached to an exception event |
| `capture_breadcrumbs` | `standalone` | Ship standalone `frontend_breadcrumb` events independently |
| `capture_probe_events` | `buffer_only` | Probes stay in ring buffer; flush only with errors (always-on mode) |
| `immediate_client_error_statuses` | `[401,403,409,422]` etc. | Promote those project-selected `4xx` request failures to immediate standalone `request_event` incident signals across browser and backend SDKs |
| `capture_probe_events` | `standalone_when_activated` | Remote-activated probes ship independently (paid tiers only) |

### Fallback Behavior

- If `capture_policy` is absent from the config response (e.g., older API version), SDKs default to the `balanced` preset behavior.
- If the config fetch fails on `init()`, SDKs operate with a safe default equivalent to the `minimal` preset (capture exceptions and warning+ logs only).
- Policy changes take effect on next config refresh — no mid-request policy switching.

### Event Classification

SDKs do not assign `event_class` — that is the responsibility of the event-normalizer in the worker. SDKs only filter based on the capture policy controls above. The ingestion API performs server-side enforcement as a backstop: events that violate the project's capture policy are rejected with reason `capture_policy_rejected`.

---

## 13. Browser Relay Handler Parity (Server-SDK Responsibility)

Server-side SDKs that support backend frameworks must provide relay handler adapters for receiving browser SDK events via a same-origin endpoint. This enables CSP-compatible, ad-blocker-resistant, privacy-preserving browser event capture without requiring the browser SDK to communicate directly with DebugBundle cloud.

**Requirement references:** `FR-REL-01` through `FR-REL-14` in `/spec/requirements.md`
**Acceptance criteria:** `AC-REL-01` through `AC-REL-10` in `/spec/acceptance.md`
**Phase:** 13a (Browser SDK Relay & Durable Delivery) in `/spec/implementation-roadmap.md`

### 13.1 Compatibility Terms

Use these terms consistently in contracts, docs, release notes, and parity matrices:

| Term | Meaning |
|------|---------|
| Full relay handler | Server SDK implements request validation, sanitization, framework adapters, local-only file writes, connected durable spool writes, connected cloud forwarding, credential isolation, and relay diagnostics using this contract. |
| Relay foundation | Server SDK validates and sanitizes relay requests but leaves delivery to caller-owned callbacks or custom code. This is not full relay parity. |
| Relay client path | Browser SDK sends events to a same-origin relay endpoint. The Browser SDK is not a backend relay handler. |
| Integration relay | Platform integration, such as WordPress, composes a server SDK relay path into a concrete framework or CMS route. |

Only a full relay handler may be marked as relay-handler compatible for V1. Foundation-only SDKs may be documented as manual relay integration helpers, but must not be presented as complete relay parity.

### 13.2 Why Relay Is a Server-SDK Concern

The relay handler runs on the user's backend and bridges browser events into the same event pipeline that the server SDK uses. It shares the server SDK's file transport, configuration, and credentials. Therefore, relay is a subpath export of the server SDK package, not a separate dependency.

### 13.3 Transport Selection (Browser SDK Side)

The browser SDK determines its transport from the `endpoint` config value:

| `endpoint` value | Transport behavior |
|---|---|
| Relative path (e.g., `/debugbundle/browser`) | Relay mode: POST to same-origin endpoint, no `Authorization` header |
| Absolute URL to cloud (e.g., `https://api.debugbundle.com/v1/events`) | Direct-to-cloud: include `projectToken` |
| Absolute URL to self-hosted instance | Direct-to-self-hosted: include `projectToken` |
| Not set + `projectToken` present | Default direct-to-cloud |
| Not set + no `projectToken` | SDK disabled (no-op) |

The browser SDK wire format is identical regardless of transport mode. Only the target URL and auth header presence differ.

### 13.4 Relay Handler Contract

**Route:** `POST /debugbundle/browser`

**Accepted event types:** `frontend_exception`, `error_suppressed`, `frontend_breadcrumb`, `request_event`, `probe_event`

**Request format:**

```json
{
  "batch": [
    {
      "schema_version": "2026-03-01",
      "event_id": "uuid-v4",
      "event_type": "frontend_exception",
      "sdk_version": "0.1.0",
      "occurred_at": "ISO8601",
      "service": {
        "name": "checkout-web",
        "environment": "production"
      },
      "correlation": { "trace_id": "uuid-v4" },
      "payload": { }
    }
  ]
}
```

**Response format:**

| Status | Body | Meaning |
|--------|------|---------|
| 202 | `{ "accepted": N, "rejected": 0, "errors": [] }` | Events processed |
| 400 | `{ "accepted": N, "rejected": M, "errors": ["..."] }` | Validation failure; valid events in the same batch may already be accepted |
| 413 | — | Request body exceeds 256 KB limit |
| 403 | — | Origin validation failed |
| 429 | — | Rate limited |

### 13.5 Security Requirements (Mandatory)

All relay implementations must enforce these security controls:

1. **Origin validation:** Validate `Origin` header (fallback: `Referer`) against a configured allowlist. Default: same-origin derived from `Host` header. Framework adapters may use a trusted forwarded host only when the host framework already treats that forwarded host as trusted. Reject `403` on mismatch.
2. **Content-Type enforcement:** Reject requests without `Content-Type: application/json`. This ensures browsers trigger CORS preflight, preventing simple cross-origin form submissions.
3. **Payload size limit:** Hard limit 256 KB per request body. Reject `413` on overflow.
4. **Schema validation:** Only known event types accepted. Unknown fields stripped.
5. **Field override policy:** The relay must strip or override trust-sensitive fields:
   - `project_token` — never trust from browser; relay attaches server-side.
   - `sdk_name` — forced to `@debugbundle/sdk-browser`.
   - `organization_id` — never accept from browser.
6. **Field passthrough policy:** Preserve these browser-owned fields:
  - `correlation.request_id`, `correlation.trace_id`, `correlation.session_id`, `correlation.user_id_hash` when supplied as strings or `null`.
   - `service`, `environment` — accepted unless relay has explicit overrides.
   - `occurred_at` — browser timestamp (relay may annotate `received_at`).
7. **Rate limiting:** Default 60 requests per minute per IP. Configurable via `rateLimitPerMinute`.
8. **Credential isolation:** Browser never sends DebugBundle cloud credentials. Relay attaches credentials server-side when forwarding to cloud.

### 13.6 Delivery Requirements (Mandatory for Full Relay Handlers)

Full relay handlers must implement these delivery modes without requiring caller-owned callbacks:

| Mode | Behavior | Write destination |
|------|----------|-------------------|
| Local-only | Write validated events to local events directory | `.debugbundle/local/events/` |
| Connected (durable) | Write to spool, then forward to cloud. Spool survives cloud failures. | `.debugbundle/local/browser-relay-spool/` |
| Connected (low-latency) | Forward to cloud without local spool. `durableWrite: false` or the language-idiomatic equivalent. | No local write |

Default: connected durable (`durableWrite: true`). Local-only mode is selected by the server SDK's project-mode setting or language-idiomatic equivalent.

All full relay handlers must support language-idiomatic equivalents for these options:

| Option | Meaning |
|--------|---------|
| `projectMode` | `connected` or `local-only` delivery selection. |
| `projectToken` | Server-side project token used only for connected forwarding. |
| `endpoint` | Cloud or self-host ingestion endpoint for connected forwarding. |
| `localEventsDir` | Destination for local-only relay event files. |
| `spoolDir` | Destination for connected durable relay spool files. |
| `durableWrite` | Whether connected mode writes to spool before forwarding. Defaults to true. |
| `service` | Optional relay-level service override. |
| `environment` | Optional relay-level environment override. |
| `rateLimitPerMinute` | Per-IP relay request limit. Defaults to 60. |
| `rateLimitStore` | Optional language-idiomatic persistent/shared rate-limit store for runtimes where in-memory request state is insufficient. |

The handler may still expose an `onAccept` callback for instrumentation or custom extension, but callback-only delivery is a relay foundation, not full relay parity.

### 13.7 Wire Format Alignment (Invariant)

Relay-written event files must use the **same format and naming convention** as the server SDK file transport:

- Filename: `<timestamp>-<sequence>-<service>.events.json`
- Contents: JSON array of event envelopes
- Write mechanism: atomic temp-file + rename

This ensures `debugbundle process` handles browser-originated and backend-originated event files identically. The only distinction is `event_type` and `sdk_name` inside the envelope.

### 13.8 Cross-Context Correlation (Invariant)

The browser SDK attaches `correlation.trace_id` (UUID v4) to events and may also include `request_id`, `session_id`, and `user_id_hash` when the browser context has them. The relay must preserve the browser-supplied correlation fields without modification when they are strings or `null`. Backend SDK middleware reads the same `X-DebugBundle-Trace-Id` header from incoming requests. When both browser and backend events share a `trace_id`, `debugbundle process` links them into a single full-stack incident bundle.

The relay must never strip, overwrite, or regenerate `correlation.trace_id`.

### 13.9 Packaging

Relay handlers are subpath exports of the server SDK package:

| Export | Purpose |
|--------|---------|
| `@debugbundle/sdk-node/relay` | Core relay logic |
| `@debugbundle/sdk-node/relay/express` | Express middleware adapter |
| `@debugbundle/sdk-node/relay/fastify` | Fastify plugin adapter |
| `@debugbundle/sdk-node/relay/nextjs` | Next.js route handler export |

Usage examples:

```ts
// Express
import { debugBundleRelay } from '@debugbundle/sdk-node/relay/express';
app.use('/debugbundle/browser', debugBundleRelay());

// Fastify
import { debugBundleRelayPlugin } from '@debugbundle/sdk-node/relay/fastify';
app.register(debugBundleRelayPlugin);

// Next.js App Router (app/debugbundle/browser/route.ts)
export { debugBundleRelay as POST } from '@debugbundle/sdk-node/relay/nextjs';
```

### 13.10 Multi-Language Requirement

Any server-side SDK that provides framework integrations must also provide relay handler adapters following the same contract. The relay request/response schema, security requirements, wire format, and correlation invariant are language-agnostic and must be implemented consistently.

For V1, full relay parity applies to the shipped server SDK and integration surfaces:

| Surface | Required relay adapters or route |
|---------|----------------------------------|
| Node.js SDK | Express middleware, Fastify plugin, Next.js route handler |
| Python SDK | Django middleware, Flask route, FastAPI endpoint |
| PHP SDK | Laravel middleware, Symfony controller |
| WordPress plugin | WordPress REST route that composes the PHP relay behavior and adds WordPress-appropriate persistent rate limiting/spool handling |

Future server SDKs must implement the same full relay handler contract before they are marked relay-handler compatible:

| SDK | Relay adapters |
|-----|---------------|
| Go | `net/http` handler |
| Ruby | Rack middleware, Rails engine |
| Java | Spring Boot filter |
| C# | ASP.NET Core middleware |
| Kotlin (server) | Ktor plugin |

All server SDKs must implement sections 1–8, section 11, section 12, and section 13 of this contract before release.
