# SDK Interface Contract — DebugBundle

Version: v1
Last updated: 2026-07-27

This contract defines the standard interface that ALL DebugBundle SDKs must implement, regardless of language. It ensures behavioral consistency across Node.js, browser, Python, PHP/WordPress, Java, Go, Ruby, .NET, Android, Swift, React Native, and future language SDKs.

---

## 1. Initialization

Every SDK must expose an init function that accepts a configuration object and returns a monitor instance (or configures a singleton).

**Required config fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectToken` | string | — | Required for connected ingestion. SDKs that support explicit `local-only` or file-only delivery may allow it to be omitted in that mode. |
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
| `beforeSend` | `(event) → event \| null` | — | Optional synchronous final hook after SDK event construction/redaction and before buffering. Returning `null` drops the event locally. |

**Node.js local-first config fields (`@debugbundle/sdk-node`):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectMode` | `"connected" \| "local-only"` | `"connected"` | Selects transport behavior. `local-only` uses file transport and requires filesystem plus CLI access on the machine doing capture. `connected` keeps local/dev on file transport and staging/production on HTTP transport. |
| `localEventsDir` | string | `<cwd>/.debugbundle/local/events` | Filesystem destination for Node file transport batches. |

**Capture policy note:** SDKs do NOT accept capture policy fields in the init config. The capture policy is server-owned and delivered to SDKs via the `capture_policy` field in the `GET /v1/sdk/config` response. SDKs must respect the server-side policy and filter events locally before transmission. See Section 12 (Capture Policy Integration) for details.

### 1.1 Local beforeSend hook

SDKs must expose a language-idiomatic synchronous `beforeSend` hook as an optional init config field for app-owned local policy such as final redaction, tenant-specific suppression, or dropping events that must never leave the runtime. The hook receives an isolated copy of a fully built canonical DebugBundle event after SDK redaction and before local capture-policy/rule evaluation, sampling, duplicate suppression, persistence, buffering, and transport.

Rules:
- Return the event to keep shipping it.
- Return `null` to drop the event locally.
- A valid replacement may change any event field allowed by the canonical event schema; implementations must not invent additional identity immutability restrictions.
- The SDK must validate the complete returned envelope against the canonical closed event schema.
- If the hook throws, panics, or returns an invalid event, the SDK must keep the SDK-owned original event, emit only a bounded internal diagnostic where supported, and must not throw into host code.
- Mutating the hook input without returning a valid replacement must not mutate the SDK-owned original.
- Hook execution must not block request/response handling beyond normal synchronous JavaScript/runtime execution.
- Fatal signal handlers, hard-crash handlers, and shutdown paths may skip application hook execution when invoking user code is unsafe. Each affected SDK must document the restriction; replayed crash events use the normal hook pipeline when safe.
- Project capture rules remain the preferred operational noise-control surface because they are centralized, auditable, and enforced again by ingestion and worker backstops.

### 1.2 Node.js local-first transport selection

The Node.js SDK resolves its default transport from `projectMode` plus the configured environment when no explicit custom transport is supplied:

| `projectMode` | Environment | Transport behavior |
|---------------|-------------|--------------------|
| `local-only` | any environment | File transport to `.debugbundle/local/events/` on the current machine; operators must run `debugbundle process` there or on a mounted copy of that directory |
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

### Per-event ingestion acknowledgement

Connected transports must reconcile the canonical ingestion acknowledgement body rather than treating every `2xx` response as whole-batch success:

```json
{
  "accepted": 1,
  "rejected": 1,
  "errors": [{ "index": 1, "reason": "rate_limited" }]
}
```

Rules:

- `accepted` and `rejected` are non-negative integers whose sum equals the submitted batch length.
- `errors` contains exactly one unique, in-range index for every rejected event and a non-empty reason.
- Accepted events are removed exactly once and never requeued.
- `rate_limited`, `monthly_quota_exceeded`, and `analytics_quota_exceeded` are retryable indexed reasons. Only those indexed events are retained and retried.
- Other indexed rejection reasons are terminal. Those events are removed with a bounded internal diagnostic.
- An all-rejected acknowledgement must not advance `lastEventAt` or report a successful delivery.
- Missing acknowledgement fields are allowed only for an explicitly compatible custom/legacy transport that cannot expose a response body. The SDK may use its documented HTTP-success fallback for that transport.
- A production HTTP transport that requires acknowledgement must treat a missing, malformed, duplicate-index, out-of-range, or internally inconsistent acknowledgement as a protocol failure and retain the full submitted batch with safe backoff.
- The response may also contain `probe_directives`; processing those directives does not bypass acknowledgement validation.

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
| `tracePropagationTargets` | string[] | same-origin only | Cross-origin first-party URL substrings allowed to receive `X-DebugBundle-Trace-Id`. Third-party absolute URLs are not traced by default. |
| `sessionSampleRate` | number (0.0–1.0) | `1.0` | Session-level sampling. Decision made once per session — entire journey captured or nothing. Independent of `sampleRate`. |
| `maxEventsPerSession` | number | `100` | Hard cap on events per session. After cap, only `frontend_exception` events are captured. |
| `beforeSend` | `(event) → event \| null` | — | Browser-supported synchronous final hook before buffering. Returning `null` drops the event locally. |
| `analytics` | object | `{ enabled: false }` | Opt-in AnalyticsBundle product-usage capture. Analytics events use the analytics lane and are not debug incident events. |

**Browser analytics config fields (sdk-browser only, opt-in):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `analytics.enabled` | boolean | `false` | Enables AnalyticsBundle product-usage capture. Existing installs remain analytics-off after upgrade unless this is explicitly true. |
| `analytics.privacyMode` | `strict \| standard \| custom` | `strict` | `strict` uses session-only analytics. In direct browser mode, `standard` keeps a project-scoped first-party anonymous ID in browser storage and emits only its SHA-256-derived hash for returning-visitor metrics; it is deleted when consent is withdrawn or server settings force `strict`. Relay mode stays session-only until it has an authenticated project-scope bootstrap. `custom` uses customer-owned consent/identity callbacks while preserving schema/redaction limits. |
| `analytics.consentRequired` | boolean | `false` | When true, analytics capture is disabled until `debugbundle.analytics.setConsent(true)` is called. |
| `analytics.trackPageViews` | boolean | `true` | Captures initial page views when analytics is enabled. |
| `analytics.trackRouteChanges` | boolean | `true` | Captures SPA route changes when analytics is enabled. |
| `analytics.trackSessions` | boolean | `true` | Captures session-start/session-summary signals when analytics is enabled. |
| `analytics.trackReferrers` | boolean | `true` | Captures referrer domain and bounded UTM fields. |
| `analytics.trackActions` | boolean | `false` | Enables structural action/click capture. Must not capture raw text or form values. Semantic `track()` calls are preferred. |
| `analytics.trackFrictionSignals` | boolean | `true` | Captures only fixed friction journey markers: three rapid clicks on the same in-memory interactive target yield `friction.repeated_click`, three rapid clicks on an eligible non-interactive target yield `friction.dead_click`, and a quick safe route reversal yields `friction.backtrack`. No target-derived data leaves the page. |
| `analytics.sampleRate` | number (0.0–1.0) | `1.0` | Analytics event sampling, separate from debug event sampling. |
| `analytics.journeySampleRate` | number (0.0–1.0) | tier/project default | Controls retained representative journey samples. |

Browser debug breadcrumbs and AnalyticsBundle events should reuse shared frontend primitives where possible: session id management, route/path normalization, device/browser context collection, referrer/UTM parsing, action/click sanitization, and structured journey timeline formatting. Reuse is an SDK implementation concern only. Debug and analytics capture remain independently configured and emitted as separate envelopes with separate consent, sampling, quota, retention, and processing behavior.

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

When present, the browser SDK must copy this metadata into the captured `network_request` breadcrumb payload and must not forward the `debugbundle` field to the actual HTTP request. Wrapping `fetch()` must otherwise preserve native fetch behavior: callers may pass `string`, `URL`, or `Request` inputs, and headers may be omitted or provided as `Headers`, header tuple arrays, or header records. If the SDK adds `X-DebugBundle-Trace-Id`, it must add it to the effective request headers without dropping caller-provided headers such as `Authorization`. If a `Request` input and `init.headers` are both present, `init.headers` follows native fetch override semantics.

Browser `window` `error` captures must preserve browser-native event metadata when available. If the browser does not expose a usable `Error` object, the SDK may synthesize a fallback error message, but it must also attach `payload.browser_event` with `kind`, `message`, `file_name`, `line_number`, `column_number`, `target`, and `opaque` fields so bundles can explain the signal without attributing it to the SDK listener frame. Resource-load errors should use `kind: "resource_error"` and include `target.source_url` when the browser exposes a failing script, stylesheet, image, or similar target. Bundle generation must treat opaque browser-native signals as low-confidence source data and must not infer an application frame from known SDK listener assets alone.

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

Non-exception browser captures (clicks, route changes, network summaries, console entries) are **breadcrumbs** by default. They accumulate in a fixed-size ring buffer (`maxBreadcrumbs`, default 10). First-party network responses that match the active preset's immediate request-failure statuses, a resolved status-wide client-error incident override, or a matching path-scoped client-error incident rule are the exception: the browser SDK must keep the `network_request` breadcrumb for timeline context and also emit a standalone `request_event` so the failure can create a request-failure incident. Immediate request-failure presets are `minimal`: `5xx`; `balanced`: `5xx`, `408`, `423`, `424`, `425`, `429`; `investigative`: balanced plus `409`. Unpromoted `4xx` responses such as generic 404s remain non-incident telemetry/context and must not open incidents solely because they repeat. When a `frontend_exception` occurs:

1. The ring buffer contents are attached to the exception event as `breadcrumbs[]`.
2. The combined payload (exception + breadcrumbs) is shipped as a single batch.
3. The ring buffer is cleared after flush.

The attached `frontend_exception.payload.breadcrumbs[]` payload is the canonical error-context path. Bundle generation must consume those inline breadcrumbs even when standalone `frontend_breadcrumb` events were not emitted, and may merge both sources deterministically when both are present.

When `breadcrumbsOnErrorOnly` is `true` (default), breadcrumbs are **never** shipped independently — they only appear as context for errors. When set to `false`, breadcrumbs are batched and shipped on their own schedule (standard batching rules apply).

Browser-native `window_error` and `resource_error` captures may include an optional `browser_event` object on the `frontend_exception` payload. Existing fields (`kind`, `message`, `file_name`, `line_number`, `column_number`, `target`, `opaque`) are stable. SDKs may add optional sanitized resource-target attributes and page lifecycle state to improve opaque browser-error diagnosis without changing the event envelope or requiring consumers to understand those fields.

Browser `unhandledrejection` captures may include `frontend_exception.payload.rejection_reason` with a bounded sanitized reason summary. `Error` reasons preserve name and message, string reasons preserve a truncated preview, object reasons may preserve sanitized `name` / `message` fields plus a type preview, and null/undefined reasons are represented explicitly.

### Session Sampling and Event Caps

- `sessionSampleRate` decision is made once at session start (random check against threshold). If the session is sampled out, the SDK becomes a no-op for all non-exception events for that session.
- `maxEventsPerSession` is a hard ceiling. After the cap, only `frontend_exception` events and first-party immediate request-failure `request_event` incident signals are captured. Breadcrumbs stop accumulating. The cap resets on new session (page reload or new tab).

### Browser Storm Controls

- Browser SDKs must apply the same duplicate suppression and loop-protection guarantees defined in Required Volume-Control Behavior above.
- `frontend_exception` and `error_suppressed` events remain capturable even when non-exception session caps are exhausted.
- Browser SDKs must retain buffered events across failed or throttled flush attempts and retry after the backoff window instead of discarding them.

### AnalyticsBundle Browser API

Analytics APIs live under `debugbundle.analytics` so product-usage capture remains distinct from debug/error capture.

```ts
debugbundle.analytics.setConsent(true);
debugbundle.analytics.setConsent(false);

debugbundle.analytics.pageView({
  path: "/pricing",
  title: "Pricing"
});

debugbundle.analytics.track("feature.used", {
  feature: "billing_portal"
});

debugbundle.analytics.funnel("checkout", "payment_submitted", {
  plan_selected: "team"
});

debugbundle.analytics.convert("subscription_started", {
  plan_selected: "team"
});

debugbundle.analytics.marker("checkout.validation_failed", {
  attempt_bucket: 3
});

debugbundle.analytics.setContext({
  auth_state: "authenticated",
  account_tier: "pro",
  onboarding_state: "invited"
});

debugbundle.analytics.setUserHash("sha256:...");
```

Required behavior:

- Analytics APIs are no-ops unless analytics is enabled and consent rules allow capture.
- Analytics API failures never throw into host pages.
- Analytics batching, retry, unload flushing, and backoff must not block debug event capture or host page behavior.
- Existing debug capture must continue to work when analytics is disabled, tier-unavailable, missing consent, sampled out, quota-blocked, or internally failing.
- A direct browser SDK with a project token explicitly requests and reads the bounded `analytics` block from `GET /v1/sdk/config` once at initialization. The request adds `X-DebugBundle-Analytics-Config: 1`, so legacy SDK-config clients receive their unchanged response shape. This remote block may only make a local analytics opt-in more restrictive: it can disable capture, disable page/route/action capture, require explicit consent, or force `strict` privacy. It must not enable a locally analytics-disabled SDK or widen a local capture setting. Relay-mode browser SDKs do not fetch this block because relay transport must remain credential-free; server-side ingestion still enforces project settings for every transport.
- In direct browser `standard` privacy mode, the SDK derives a browser-storage key from the SHA-256 digest of the public write-only project token, stores only an opaque anonymous first-party value under that key, and emits a separate SHA-256-derived value as `visitor_id_hash`. It never persists or emits the project token or the raw visitor value. Identifier initialization is bounded in memory; unavailable browser storage or Web Crypto falls back to session-only capture without affecting debug capture. Relay mode does not derive a visitor identifier without an authenticated project scope.
- Analytics events must use `event_type: "analytics_event"` with a `payload.kind` rather than adding many top-level event types.
- SDKs may derive debug breadcrumbs and analytics events from the same sanitized browser signal, but they must decide independently whether to emit a debug breadcrumb, an analytics event, or both.
- Semantic analytics keys are stored in `payload.signal`: `track(name)` emits `kind: "action"` plus `signal.action_key`, `funnel(name, step)` emits `kind: "funnel_step"` plus `signal.funnel_key` and `signal.step_key`, `convert(name)` emits `kind: "conversion"` plus `signal.conversion_key`, and journey friction markers emit `kind: "journey_marker"` plus `signal.marker_key`.
- With `analytics.trackActions: true`, browser structural auto-capture emits only a fixed allowlist of generic action keys, currently `click.link`, `click.button`, `click.input`, `click.input.button`, `click.input.checkbox`, `click.input.radio`, `click.input.reset`, `click.input.submit`, `click.select`, `click.summary`, `click.checkbox`, `click.menuitem`, `click.radio`, `click.switch`, and `click.tab`. It uses the last safe route when available, never stores selectors, IDs, target attributes, URLs, input values, or visible text, and is independent from `captureClicks` debug-breadcrumb configuration.
- With `analytics.trackFrictionSignals: true`, the browser SDK keeps only ephemeral in-memory target-object identity and timing. Three clicks within two seconds on the same structural target emit `friction.repeated_click`; three on the same eligible non-interactive target emit `friction.dead_click`; a safe `A -> B -> A` route reversal within ten seconds emits `friction.backtrack`. Each target has a ten-second local cooldown. Markers contain no target-derived dimensions and remote `capture_friction_signals: false` disables them without changing debug or permitted route analytics.
- `marker(name, dimensions?)` is an explicit bounded semantic journey marker. It uses the last safe route when available and must apply the same custom-dimension sanitization as other analytics methods.
- When session tracking is enabled, the browser SDK emits one `session_summary` before a non-persisted `pagehide` and uses the existing unload-safe beacon/keepalive transport. It must not emit a summary for a page entering the back-forward cache.
- Browser `route_change` analytics events may include `payload.previous_route` with the same privacy-safe route shape as `payload.route`; both routes must strip query strings and fragments so workers can aggregate route transitions without retaining raw URLs.
- Analytics events do not receive `event_class` and cannot create incidents.
- `setContext()` accepts only bounded low-cardinality values. Sensitive, overlong, unapproved, or high-cardinality values must be dropped or redacted locally where possible and rejected/dropped server-side as a backstop.
- `setUserHash()` accepts a customer-supplied privacy-safe hash only. The SDK must not derive raw identity.
- Auto-captured analytics must not include form values, raw click text, screenshots, DOM snapshots, precise coordinates, precise location, raw query strings, tokens, secrets, names, emails, phone numbers, or payment data.

---

## 3.7 Cross-Context Trace Correlation

The browser SDK injects a `X-DebugBundle-Trace-Id` header (UUID v4) into same-origin `fetch` and `XMLHttpRequest` requests, and into cross-origin first-party requests that match `tracePropagationTargets`. Backend SDKs read this header and tag all events from that request with the trace ID. The SDK must not inject trace headers into arbitrary third-party absolute URLs by default.

### Browser SDK (Automatic)
```js
// Same-origin and explicitly allowlisted outgoing requests include:
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
  "schema_version": "2026-03-01",
  "event_type": "backend_exception",
  "correlation": {
    "trace_id": "550e8400-e29b-41d4-a716-446655440000"
  },
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
| Header injection | Browser SDK wraps `fetch`/`XHR`, injects `X-DebugBundle-Trace-Id` (UUID v4) into same-origin or explicitly allowlisted first-party requests |
| Header reading | Backend middleware reads header, attaches to event context |
| Missing header | No failure — backend events ungrouped from frontend |
| Trace ID format | UUID v4, generated per outgoing browser request |
| Envelope field | `correlation.trace_id` (optional) |

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
  "context": { "host": "db-primary", "timeout_ms": 5000 },
  "payload": {
    "level": "error",
    "message": "Database connection timeout",
    "attributes": { "logger": "app.db" }
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
  "schema_version": "2026-03-01",
  "event_id": "<uuid-v4>",
  "event_type": "<type>",
  "occurred_at": "ISO8601",
  "service": { "name": "<service>", "runtime": "<runtime>", "environment": "<environment>" },
  "sdk_name": "@debugbundle/sdk-<lang>",
  "sdk_version": "<version>",
  "correlation": { "trace_id": "<optional>", "request_id": "<optional>" },
  "context": { "...": "optional app/framework context" },
  "payload": { ... }
}
```

SDK name follows the pattern `@debugbundle/sdk-{language}`.

SDKs must keep payloads event-type-specific and strict. `captureException`, `captureRequest`, `captureLog`, `captureMessage`, probes, and framework middleware may collect extra application context, but that context belongs in envelope `context` after redaction. SDKs must not place arbitrary context under `payload.context`, must not place request-only metadata under `request_event.payload.attributes`, and must not add root metadata fields outside the envelope contract. Existing ingestion compatibility shims are for installed SDKs only; new SDK versions must emit canonical envelopes directly.

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
| Spring Boot | Logback (default) / SLF4J backend | Starter registers DebugBundle appender/helper without replacing existing appenders |
| Servlet/JAX-RS app servers | Java Util Logging / JBoss LogManager | Servlet/app-server adapter or javaagent registers handler where available |
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
| Java | `com.debugbundle:debugbundle-java-core`, servlet/JAX-RS adapters, `com.debugbundle:debugbundle-spring-boot-starter`, and `com.debugbundle:debugbundle-java-agent` | Maven Central | Java SDK | Pre-release |
| Go | `github.com/debugbundle/debugbundle-go` | Go modules | Phase 18b | Pre-release |
| Ruby | `debugbundle` | RubyGems | Phase 18c | Pre-release |

### V1 SDK Targets (Wave 2 — Enterprise & Platform Depth)

| Language | Package | Registry | Status |
|----------|---------|----------|--------|
| C# | `DebugBundle.Sdk` plus `DebugBundle.*` integrations | NuGet | Released v0.1.1 |
| Kotlin (server) | `com.debugbundle:debugbundle-kotlin` | Maven Central | Planned |
| Rust | `debugbundle` | crates.io | Planned |

### V1 SDK Targets (Wave 3 — Client & Mobile Expansion)

| Language | Package | Registry | Status |
|----------|---------|----------|--------|
| Kotlin (Android) | `com.debugbundle:debugbundle-android` | Maven Central | Released v0.1.2 |
| Swift (iOS) | `DebugBundle` | Swift Package Manager and CocoaPods | Released v0.1.1; CocoaPods `DebugBundle@0.1.1` published |
| React Native | `@debugbundle/sdk-react-native` | npm | Released v0.1.1 |
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
| Java | Spring Boot | Starter: servlet filter + MVC exception resolver + relay route |
| Java | Servlet app servers (`jakarta.servlet`, `javax.servlet`) | Filter/listener + relay servlet |
| Java | JAX-RS / RESTEasy (`jakarta.ws.rs`, `javax.ws.rs`) | Request/response filters + exception providers |
| Go | net/http | Middleware |
| Go | Gin | Middleware |
| Go | Echo | Middleware |
| Ruby | Ruby on Rails | Middleware + Railtie |
| Ruby | Rack | Middleware |
| Ruby | Sidekiq | Server middleware |
| C# | ASP.NET Core | Middleware + browser relay endpoint |
| C# | ASP.NET Core gRPC | Server interceptor |
| C# | .NET Generic Host / Worker Service | Hosted-service helpers |
| C# | Hangfire | Server filter |
| C# | Azure Functions isolated worker | Worker middleware |
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

Mobile trace injection must be scoped to explicit first-party propagation targets or explicitly instrumented first-party clients. SDKs must not add `X-DebugBundle-Trace-Id` to arbitrary third-party requests.

**Mobile-specific event types:**

Mobile SDKs reuse the existing `frontend_exception` and `frontend_breadcrumb` event types. No new mobile-only event types are introduced. Mobile-specific context (app version, build number, OS version, device model, network state) is captured as device context fields extending the browser SDK's `device` schema.

**Extended device context fields (mobile SDKs):**

| Field | Source | Notes |
|-------|--------|-------|
| `app_version` | App manifest / Info.plist | Semantic version string |
| `build_number` | App manifest / Info.plist | Build identifier |
| `release_channel` | SDK config | e.g., `production`, `beta`, `testflight` |
| `jailbroken` | Root/jailbreak detection | `true`, `false`, or `null` if unavailable, disabled, or undetectable. Android uses this field for rooted-device status; Apple platforms use it for jailbreak status. |
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
- **Remote-activated (paid tiers only):** Agents can activate probes for independent shipping (without waiting for errors) via API/CLI/MCP. Backend SDKs poll for directives; browser and mobile SDKs use session-start checks plus ingestion-response piggybacking.

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

### Mobile SDK: Bounded Refresh (Piggyback + Lifecycle Check, Paid Tiers Only)

Mobile SDKs must not run aggressive background polling. Android and iOS apps may be suspended, offline, on metered networks, or killed by the OS, so config/probe refresh must be opportunistic and bounded.

Mobile SDKs receive remote probe directives through (paid tiers only):

1. **App/session-start check:** On `init()`, one `GET /v1/sdk/config` request when the SDK has a project token and endpoint.
2. **Foreground lifecycle check:** On foreground resume, the SDK may refresh config only if a bounded minimum interval has elapsed since the last check.
3. **Ingestion-response piggybacking:** Every `POST /v1/events` response may include `probe_directives`; the SDK reads this field and updates local remote probe state.

Free-tier mobile SDKs skip remote probe activation checks unless the config response is already needed for capture policy. Always-on probes still buffer locally and flush with errors.

| Rule | Detail |
|------|--------|
| Periodic polling | Disabled by default. No fixed background poll loop. |
| App/session start | Single `GET /v1/sdk/config` on `init()` when configured. |
| Foreground resume | Optional bounded refresh after a minimum interval; no refresh storm on rapid lifecycle changes. |
| Event response | Read `probe_directives` from `POST /v1/events` response body when present. |
| Offline behavior | Cached config stands while offline; queued events keep original capture timestamps. |
| TTL enforcement | Same as backend: local `expires_at` check, no network needed. |
| `probesPollInterval` config | Not applicable by default for mobile SDKs; a mobile-specific bounded refresh interval may be exposed instead. |

### Config Response Shape

```json
{
  "probes_enabled": true,
  "remote_probes_enabled": true,
  "active_probes": [
    {
      "activation_id": "uuid",
      "label_pattern": "checkout.*",
      "service": "checkout-api | *",
      "environment": "production | *",
      "expires_at": "ISO8601"
    }
  ],
  "poll_interval_ms": 60000,
  "trigger_token_key": "project-scoped signing key for trigger-token validation"
}
```

### Ingestion Response Shape (Browser And Mobile Piggybacking)

When active probes exist for a paid-tier project, the `POST /v1/events` response includes:

```json
{
  "accepted": 1,
  "rejected": 0,
  "errors": [],
  "probe_directives": {
    "active_probes": [
      {
        "activation_id": "uuid",
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
2. On `probe(label, data)` call: serialize data, apply redaction, and store an object in the ring buffer for that label. Object/map values remain objects; every scalar, `null`, or list/array value is represented as `{ "value": <redacted value> }`. If using `{ heavy: true }` option and no remote activation matches, return immediately (zero cost).
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
2. Verify HMAC-SHA256 signature using the project-scoped `trigger_token_key` delivered by `GET /v1/sdk/config`.
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

All SDKs must implement sections 1-8, section 11, and section 12 of this contract before release. Mobile SDKs must also implement section 10.1. Server SDKs with backend framework integrations must also implement section 13.

---

## 12. Capture Policy And Capture Rule Integration

SDKs must respect the server-side capture policy and project capture rules delivered via `GET /v1/sdk/config`. The capture policy controls broad event capture behavior. Capture rules apply manual project decisions to known noisy patterns.

### Policy Delivery

The `GET /v1/sdk/config` response includes `capture_policy` and `capture_rules` fields:

```json
{
  "capture_policy": {
    "preset": "minimal",
    "capture_logs": "error",
    "capture_request_events": "failures_only",
    "capture_breadcrumbs": "local_only",
    "capture_probe_events": "buffer_only",
    "immediate_client_error_statuses": [],
    "immediate_client_error_path_rules": []
  },
  "capture_rules": []
}
```

SDKs fetch this on `init()` alongside probe config. The policy and active rules are cached and refreshed on the same schedule as probe config (backend: polling interval; browser: session-start + piggybacking).

### SDK Enforcement Rules

| Control | Value | SDK Behavior |
|---------|-------|-------------|
| `capture_logs` | `off` | Discard all `log_event` before buffering |
| `capture_logs` | `error` | Only buffer/ship `log_event` with level `error` or `critical` |
| `capture_logs` | `warning` | Buffer/ship `log_event` with level `warning`, `error`, or `critical` |
| `capture_logs` | `info` | Buffer/ship `log_event` with level `info` and above |
| `capture_request_events` | `off` | Discard standalone `request_event` unless the response matches the active preset's immediate request-failure statuses, the resolved `immediate_client_error_statuses`, or a matching `immediate_client_error_path_rules` rule; those immediate request failures are still captured as incident signals |
| `capture_request_events` | `failures_only` | Buffer/ship immediate request-failure `request_event` for the active preset (`minimal`: `5xx`; `balanced`: `5xx`, `408`, `423`, `424`, `425`, `429`; `investigative`: balanced plus `409`) plus any resolved status-wide or path-scoped client-error incident promotions. Unpromoted `4xx` responses such as generic `404` remain non-incident telemetry and are not emitted in `failures_only` unless another SDK feature explicitly captures all request telemetry. |
| `capture_request_events` | `filtered` | Buffer/ship `request_event` matching configured filters; until custom filters are available, SDKs keep only immediate request failures and do not ship additional filtered request context |
| `capture_request_events` | `all` | Buffer/ship all `request_event` |
| `capture_breadcrumbs` | `local_only` | Keep breadcrumbs in local ring buffer; flush only with exceptions |
| `capture_breadcrumbs` | `exception_only` | Ship breadcrumbs only when attached to an exception event |
| `capture_breadcrumbs` | `standalone` | Ship standalone `frontend_breadcrumb` events independently |
| `capture_probe_events` | `buffer_only` | Probes stay in ring buffer; flush only with errors (always-on mode) |
| `immediate_client_error_statuses` | `[401,403,409,422]` etc. | Promote those project-selected `4xx` request failures to immediate standalone `request_event` incident signals across browser and backend SDKs |
| `immediate_client_error_path_rules` | `[{ status_code: 404, path_pattern: "/checkout/*", methods: ["GET"] }]` | Promote only matching status+path+method client errors to immediate request incidents, useful for real application routes that should not 404 |
| `capture_probe_events` | `standalone_when_activated` | Remote-activated probes ship independently (paid tiers only) |

### Fallback Behavior

- If `capture_policy` is absent from the config response (e.g., older API version), SDKs default to the `balanced` preset behavior.
- If the config fetch fails on `init()`, SDKs operate with a safe default equivalent to the `minimal` preset (capture exceptions and warning+ logs only).
- Policy changes take effect on next config refresh — no mid-request policy switching.

### Event Classification

SDKs do not assign `event_class` — that is the responsibility of the event-normalizer in the worker. SDKs only filter based on the capture policy controls and local capture-rule outcomes above. The ingestion API performs server-side enforcement as a backstop: events that violate the project's capture policy are rejected with reason `capture_policy_rejected`.

### Capture Rule Actions

| Action | SDK Behavior | Server Backstop |
|--------|--------------|-----------------|
| `demote` | Browser SDK converts matching incident-eligible browser events into context where possible. Node and other backend SDKs may send the event normally until local context-preservation parity exists. | Worker stores matching events as `context_signal`; they cannot create, reopen, regress, alert, or dispatch automation. |
| `sample` | SDKs use deterministic sampling keyed by `project_id`, `rule_id`, and `event_id`. Sampled-out events are discarded locally where implemented. | Ingestion rejects sampled-out events with `capture_rule_sampled_out`; sampled-in events can optionally become context when `sample_event_class` is `context`. |
| `drop` | SDKs discard matching events before buffering where implemented. | Ingestion rejects matching events with `capture_rule_dropped` before raw persistence. |

Capture-rule matchers support structured browser-noise fields including `browser_event_kind`, `browser_event_opaque`, `client_kind`, and `bot_family`. Bot matching is evidence for scoped operational demotion or sampling; it must not be treated as proof that the underlying browser behavior is impossible for human users.

### Capture Rule Runtime Parity

| SDK | Local rule enforcement |
|-----|------------------------|
| Browser | `demote`, `sample`, and `drop` |
| Node.js | `drop` and sampled-out `sample`; `demote` is server-enforced |
| Python, PHP, Java, Go, Ruby | Server-side enforcement until local parity is added |

---

## 13. Browser Relay Handler Parity (Server-SDK Responsibility)

Server-side SDKs that support backend frameworks must provide relay handler adapters for receiving browser SDK events via a backend endpoint. Same-origin relay paths are the default recommendation because they minimize CORS and CSP setup. Split frontend/backend deployments may use an absolute backend relay URL when the browser SDK is explicitly configured for relay mode and the relay route is allowed to receive both `OPTIONS` preflight and `POST` batch requests.

**Requirement references:** `FR-REL-01` through `FR-REL-14` in `/spec/requirements.md`
**Acceptance criteria:** `AC-REL-01` through `AC-REL-11` in `/spec/acceptance.md`
**Phase:** 13a (Browser SDK Relay & Durable Delivery) in `/spec/implementation-roadmap.md`

### 13.1 Compatibility Terms

Use these terms consistently in contracts, docs, release notes, and parity matrices:

| Term | Meaning |
|------|---------|
| Full relay handler | Server SDK implements request validation, sanitization, framework adapters, local-only file writes, connected durable spool writes, connected cloud forwarding, credential isolation, and relay diagnostics using this contract. |
| Relay foundation | Server SDK validates and sanitizes relay requests but leaves delivery to caller-owned callbacks or custom code. This is not full relay parity. |
| Relay client path | Browser SDK sends events to a relay endpoint. Same-origin paths are inferred as relay; absolute backend relay URLs require explicit `transportMode: "relay"`. The Browser SDK is not a backend relay handler. |
| Integration relay | Platform integration, such as WordPress, composes a server SDK relay path into a concrete framework or CMS route. |

Only a full relay handler may be marked as relay-handler compatible for V1. Foundation-only SDKs may be documented as manual relay integration helpers, but must not be presented as complete relay parity.

### 13.2 Why Relay Is a Server-SDK Concern

The relay handler runs on the user's backend and bridges browser events into the same event pipeline that the server SDK uses. It shares the server SDK's file transport, configuration, and credentials. Therefore, relay is a subpath export of the server SDK package, not a separate dependency.

### 13.3 Transport Selection (Browser SDK Side)

The browser SDK supports explicit `transportMode: "relay" | "direct"`. When omitted, it preserves endpoint-based inference for compatibility:

| Config shape | Transport behavior |
|---|---|
| `transportMode: "relay"` + relative path (e.g., `/debugbundle/browser`) | Relay mode: POST to same-origin endpoint, no `Authorization` header, no `project_token` field |
| `transportMode: "relay"` + absolute backend URL (e.g., `https://api.example.com/debugbundle/browser`) | Relay mode for split frontend/backend deployments. Requires relay CORS preflight support and `allowedOrigins`. No browser-side DebugBundle credentials. |
| Relative path with no `transportMode` | Compatibility inference: relay mode |
| `transportMode: "direct"` + absolute ingestion URL + `projectToken` | Direct-to-cloud or direct-to-self-hosted: include `projectToken` |
| Absolute URL with no `transportMode` + `projectToken` | Compatibility inference: direct mode |
| Not set + `projectToken` present | Default direct-to-cloud |
| Not set + no `projectToken` | SDK disabled (no-op) |

The browser SDK uses the relay wire shape (`{"batch": [...]}`) in relay mode and the ingestion wire shape (`{"events": [...]}`) in direct mode. Relay mode must remain credential-free even when the relay endpoint is an absolute URL.

### 13.4 Relay Handler Contract

**Routes:** `POST /debugbundle/browser` for event batches; `OPTIONS /debugbundle/browser` for allowed CORS preflight.

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
| 202 | `{ "accepted": N, "rejected": M, "errors": [{ "index": 0, "reason": "..." }] }` | Batch accounted; valid events may be accepted while other events are rejected |
| 204 | — | Allowed CORS preflight for split frontend/backend relay |
| 400 | `{ "accepted": 0, "rejected": 0, "errors": [{ "index": -1, "reason": "malformed_payload" }] }` | Request wrapper is malformed; no events were processed |
| 413 | — | Request body exceeds 256 KB limit |
| 403 | — | Origin validation failed |
| 429 | — | Rate limited |

### 13.5 Security Requirements (Mandatory)

All relay implementations must enforce these security controls:

1. **Origin validation:** Validate `Origin` header (fallback: `Referer`) against a configured allowlist. Default: same-origin derived from `Host` header. Framework adapters may use a trusted forwarded host only when the host framework already treats that forwarded host as trusted. Reject `403` on mismatch.
2. **Content-Type enforcement:** Reject requests without `Content-Type: application/json`. This ensures browsers trigger CORS preflight, preventing simple cross-origin form submissions.
3. **CORS preflight:** Full relay handlers and framework adapters must answer allowed `OPTIONS /debugbundle/browser` requests with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: POST, OPTIONS`, and `Access-Control-Allow-Headers: content-type`. Allowed POST responses must include `Access-Control-Allow-Origin` and `Vary: Origin`. Disallowed origins must not receive successful CORS headers.
4. **Payload size limit:** Hard limit 256 KB per request body. Reject `413` on overflow.
5. **Schema validation:** Only known event types accepted. Unknown fields stripped.
6. **Field override policy:** The relay must strip or override trust-sensitive fields:
   - `project_token` — never trust from browser; relay attaches server-side.
   - `sdk_name` — forced to `@debugbundle/sdk-browser`.
   - `organization_id` — never accept from browser.
7. **Field passthrough policy:** Preserve these browser-owned fields:
  - `correlation.request_id`, `correlation.trace_id`, `correlation.session_id`, `correlation.user_id_hash` when supplied as strings or `null`.
   - `service`, `environment` — accepted unless relay has explicit overrides.
   - `occurred_at` — browser timestamp (relay may annotate `received_at`).
8. **Rate limiting:** Default 60 requests per minute per IP. Configurable via `rateLimitPerMinute`.
9. **Credential isolation:** Browser never sends DebugBundle cloud credentials. Relay attaches credentials server-side when forwarding to cloud.

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
| Java SDK | Spring Boot relay route plus servlet relay servlet for supported `jakarta.servlet` and `javax.servlet` app-server adapters |

When a runtime or integration is added to the shipped relay-capable surface list above, the core product follow-through is mandatory in the same change: update `debugbundle setup` service discovery and relay-guidance coverage, update the relevant CLI/public docs and interface contracts, and add focused CLI regression coverage proving the new surface is detected and receives exact relay guidance or deterministic scaffolding.

Future server SDKs must implement the same full relay handler contract before they are marked relay-handler compatible:

| SDK | Relay adapters |
|-----|---------------|
| Go | `net/http` handler |
| Ruby | Rack middleware, Rails engine |
| C# | ASP.NET Core endpoint mapping and middleware |
| Kotlin (server) | Ktor plugin |

All server SDKs must implement sections 1–8, section 11, section 12, and section 13 of this contract before release.
