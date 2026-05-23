# Ruby SDK Implementation Plan

Version: v1
Last updated: 2026-05-23

---

## Purpose

This plan defines the first Ruby SDK surface for DebugBundle. The goal is a production-ready RubyGems package that feels native in Rails, Rack, and Sidekiq applications while satisfying the same universal SDK, relay, probe, capture-policy, redaction, and safety contracts as the shipped Node, Python, PHP, WordPress, and Java SDKs.

The Ruby SDK must satisfy `contracts/sdk-interface.md`, `spec/sdk-language-targets.md`, `rules/sdk-testing-strategy.md`, `rules/security-hardening.md`, and the relevant requirements and acceptance criteria in `spec/requirements.md` and `spec/acceptance.md`.

---

## Scope

### V1 In Scope

- Ruby core SDK for manual capture and shared runtime behavior.
- Rails integration through a Railtie and middleware.
- Rack middleware for generic Ruby web applications.
- Sidekiq server middleware for background job capture.
- Ruby `Logger` integration.
- Rails logger integration.
- Semantic Logger integration when present.
- Ruby 3.1 and newer runtime support.
- Ruby 3.1 and 3.2 compatibility support for the large Rails installed base, with current Ruby recommended for production.
- Rails 7.0 and 7.1 validation.
- Rails 8.x validation where dependency compatibility permits.
- Rack 2.2 and Rack 3.x validation.
- Sidekiq 7.x validation plus the current Sidekiq major where dependency compatibility permits.
- Local-only and connected transports.
- Full browser relay handler compatible with the server SDK relay contract.
- Conservative privacy defaults suitable for healthcare, financial, and enterprise applications.

### V1 Out of Scope

- Ruby versions older than 3.1.
- Rails versions older than 7.0.
- Resque, Delayed Job, GoodJob, Sneakers, and Shoryuken integrations.
- Sinatra and Hanami first-class adapters.
- Deep ActiveRecord, SQL, Redis, HTTP-client, or ActionCable auto-instrumentation.
- Monkey-patching Rails internals beyond standard middleware, Railtie, ActiveSupport notification subscribers, and logger extension points.
- Durable offline queues beyond local file transport and relay spool files.

---

## Artifacts

The Ruby SDK should live in a dedicated repository:

```text
github.com/debugbundle/debugbundle-ruby
```

Publish a RubyGems package:

| Artifact | Purpose |
| --- | --- |
| `debugbundle` | Core SDK, Rails/Rack/Sidekiq integrations, transports, redaction, probes, relay handler, docs. |

Suggested Ruby namespace and file layout:

| Namespace / path | Purpose |
| --- | --- |
| `DebugBundle` | Public singleton API, config, status, version. |
| `DebugBundle::Client` | Instance client, event buffering, flush, transports, capture policy. |
| `DebugBundle::Transport` | HTTP, local file, and relay spool transports. |
| `DebugBundle::Redaction` | Ruby redaction implementation. |
| `DebugBundle::Probe` | Probe ring buffers, remote activations, trigger-token evaluation. |
| `DebugBundle::Rack` | Rack middleware and relay middleware. |
| `DebugBundle::Rails` | Railtie, request capture, exception capture, logger wiring. |
| `DebugBundle::Sidekiq` | Sidekiq server middleware. |
| `DebugBundle::Logging` | Ruby Logger and Semantic Logger integrations. |
| `DebugBundle::Relay` | Framework-neutral browser relay handler. |

The repository uses Bundler, RSpec, RuboCop, SimpleCov, and a release workflow for RubyGems. Consumer installation:

```ruby
gem "debugbundle"
```

---

## Requirements Mapping

The implementation must satisfy:

- `FR-SDK-03`: backend request, response, exception, log, service, deploy, runtime, and correlation capture.
- `FR-SDK-05`: normalized event types, including `backend_exception`, `request_event`, `log_event`, `error_suppressed`, and `probe_event`.
- `FR-SDK-06`, `FR-SDK-09`, `FR-SDK-10`, `FR-SDK-13`: batching, sampling, duplicate suppression, and loop protection.
- `FR-SDK-16`: universal backend SDK interface with Ruby snake_case naming.
- `FR-SDK-17`, `FR-SDK-18`, `FR-SDK-19`, `FR-SDK-20`, `FR-SDK-21`: vanilla hooks and in-process logger integrations.
- `FR-SDK-22`: read `X-DebugBundle-Trace-Id` and attach it to backend events.
- `FR-SDK-31`: Ruby SDK with Rails, Rack, Sidekiq, and background job context capture.
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

The SDK must expose a Ruby-idiomatic singleton API and an instance client.

Minimum singleton methods:

```ruby
DebugBundle.init(project_token: ENV.fetch("DEBUGBUNDLE_TOKEN"), service: "checkout-api")
DebugBundle.capture_exception(error, context: nil)
DebugBundle.capture_error(error, context: nil)
DebugBundle.capture_log("payment retry failed", level: :warning, context: { order_id: order_id })
DebugBundle.capture_request(request, response, context: nil)
DebugBundle.capture_message("worker started", level: nil, context: nil)
DebugBundle.set_context(:account_id, account_id)
DebugBundle.probe("checkout.cart", { item_count: cart.items.length })
DebugBundle.probe("checkout.tax", -> { expensive_tax_state }, heavy: true)
DebugBundle.flush
DebugBundle.status
DebugBundle.last_event_at
```

Minimum instance API:

```ruby
client = DebugBundle::Client.new(project_token: ENV.fetch("DEBUGBUNDLE_TOKEN"))
client.capture_exception(error, context: { job_id: jid })
client.capture_log("retrying charge", level: :warning, context: { attempt: attempt })
client.probe("checkout.job", -> { job_state })
client.flush
```

The singleton API should be a thin wrapper over the default `DebugBundle::Client`. Rails should configure the default client through Railtie configuration while still allowing explicit client injection.

### Runtime Compatibility

- Minimum Ruby version: 3.1.
- Recommended production Ruby version: the current or previous upstream-maintained Ruby branch.
- Compatibility support: Ruby 3.1 and newer should continue to pass the SDK test suite because Rails applications often lag runtime upgrades. Ruby branches that are upstream EOL are supported for footprint only; docs must clearly recommend upgrading to a maintained Ruby for security fixes.
- The SDK should avoid native extensions.
- The core SDK should keep runtime dependencies minimal.
- Rails, Sidekiq, and Semantic Logger should be optional dependencies surfaced through integration files and development/test groups, not mandatory for vanilla Ruby users.

---

## Configuration

Required:

| Option | Description |
| --- | --- |
| `project_token` | Project token used by server-side transport. |

Important optional options:

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Kill switch. |
| `environment` | Rails env or auto-detect | Runtime environment name. |
| `service` | Rails app name or fallback | Service name. |
| `endpoint` | `https://api.debugbundle.com/v1/events` | Connected ingestion endpoint. |
| `project_mode` | `connected` | `connected` or `local_only`. |
| `local_events_dir` | `.debugbundle/local/events` | Local event file transport destination. |
| `spool_dir` | `.debugbundle/local/browser-relay-spool` | Durable relay spool destination. |
| `batch_size` | `25` | Max events per flush batch. |
| `flush_interval` | `5` seconds | Max delay before background flush. |
| `sample_rate` | `1.0` | Per-event sampling. |
| `log_level` | `:warning` | Minimum captured log level. |
| `relay_enabled` | `true` for Rails | Enable `/debugbundle/browser` route when mounted. |
| `relay_rate_limit_per_minute` | `60` | Per-IP relay rate limit. |
| `relay_durable_write` | `true` | Connected relay writes spool before forwarding. |
| `max_probe_labels` | `50` | Distinct probe labels retained. |
| `max_probe_entries_per_label` | `10` | Entries retained per label. |
| `probe_flush_on_error` | `true` | Attach ring buffers to captured errors. |
| `probes_poll_interval` | `60` seconds | Remote config/probe polling interval. |

Rails configuration should feel native:

```ruby
config.debugbundle.project_token = ENV["DEBUGBUNDLE_TOKEN"]
config.debugbundle.service = "checkout-api"
config.debugbundle.environment = Rails.env
config.debugbundle.project_mode = :connected
```

Capture policy fields must not be accepted in local config. The SDK must fetch and enforce server-owned capture policy from `GET /v1/sdk/config`.

---

## Vanilla Ruby Hooks

V1 vanilla support:

- `DebugBundle.capture_exceptions` installs explicit process/thread exception capture hooks where Ruby allows it.
- `DebugBundle.capture_logger(logger = ::Logger.new($stdout))` wraps or attaches a DebugBundle log device/formatter without replacing existing output.
- `DebugBundle.capture_at_exit` performs best-effort flush on process termination.
- `DebugBundle.with_exception_capture { ... }` captures exceptions around explicit blocks and re-raises.

Ruby exception hook behavior must be honest and conservative. The SDK must not claim it can capture every unhandled exception in every hosting model. Rails, Rack, and Sidekiq integrations are the primary production capture paths.

Hook registration must be explicit and idempotent. Requiring the gem or constructing config objects must have no side effects.

---

## Framework Integrations

### Rails

The gem must provide a Railtie that can auto-configure the SDK when Rails is present.

Rails integration must include:

- Rack middleware inserted into the Rails middleware stack.
- Request context setup and teardown.
- Exception capture that preserves Rails exception handling and `rescue_from` behavior.
- ActionController route/action metadata when available.
- Request ID preservation from `request.request_id` and `X-Request-Id`.
- `X-DebugBundle-Trace-Id` correlation.
- Rails logger integration without replacing existing log subscribers.
- Optional ActiveSupport notification subscribers for safe framework metadata only, not broad SQL/body capture in V1.
- Relay route mounting at `POST /debugbundle/browser` through a Rails engine or route helper.

The integration must not reorder application exception handlers or force response headers unless explicitly configured.

### Rack

Provide Rack middleware:

```ruby
use DebugBundle::Rack::Middleware, client: DebugBundle.client
```

Rack middleware must capture request method, path, route metadata when available, status, duration, sanitized headers, request ID, trace ID, exceptions, and probe buffers. It must preserve the downstream Rack app response and re-raise exceptions after capture unless configured otherwise.

### Sidekiq

Provide Sidekiq server middleware:

```ruby
Sidekiq.configure_server do |config|
  config.server_middleware do |chain|
    chain.add DebugBundle::Sidekiq::ServerMiddleware
  end
end
```

Sidekiq integration must capture job class, queue, jid, retry count, sanitized args summary, exception details, runtime facts, service/environment, and probe buffers. It must never swallow job exceptions; Sidekiq retry and failure behavior must remain intact.

---

## Exception Capture

Ruby capture must handle:

- Explicit `Exception`/`StandardError` objects passed to `capture_exception`.
- Exceptions escaping Rack/Rails middleware.
- Framework-handled Rails exceptions where safe hooks are available.
- Sidekiq job exceptions.
- Exception cause chains via `error.cause`.
- Backtraces with gem/framework frame filtering where possible.

Captured error events should include exception class, message, backtrace, cause chain, request or job context, trace ID, request ID, route/controller/action, response status when known, runtime facts, and recent probe buffers.

The SDK must not assign `event_class`; classification remains worker-owned.

---

## Logging Integrations

V1 should support:

- Ruby stdlib `Logger` through a custom log device/formatter or additive wrapper.
- Rails logger through the Railtie.
- Semantic Logger through an appender when the gem is present.

Logging integration must:

- Capture structured `log_event` records in-process.
- Respect `log_level` and server capture policy.
- Include logger name when available, severity, message, timestamp, progname/tags when available, thread/request/job context when available, and structured fields after redaction.
- Preserve existing logger output and formatters.
- Avoid recursive SDK logging capture.

Auto-registration should happen for Rails defaults through the Railtie. Vanilla Ruby logger integration should remain explicit to avoid surprising global logger mutation.

---

## Browser Relay

The Ruby SDK must provide a full relay handler at:

```text
POST /debugbundle/browser
```

Minimum exported surfaces:

```ruby
DebugBundle::Relay::Handler.new(client: DebugBundle.client, options: ...)
DebugBundle::Rack::RelayMiddleware
DebugBundle::Rails::Engine.routes # mounted route for /debugbundle/browser
```

It must implement `contracts/sdk-interface.md` section 13:

- Accepted browser event types only.
- Same-origin validation using `Origin`, with `Referer` fallback.
- `Content-Type: application/json` enforcement.
- 256 KB request body limit.
- Schema validation and unknown-field stripping.
- Credential isolation: browser-supplied `project_token`, `organization_id`, and auth headers are stripped or rejected.
- Preserve browser-owned `correlation.trace_id`, `correlation.request_id`, `correlation.session_id`, and `correlation.user_id_hash`.
- Per-IP rate limiting with an in-memory default and a store interface suitable for Rails cache or Redis.
- Local-only event file writes.
- Connected durable spool writes.
- Connected low-latency forwarding when durable writes are disabled.

Rails apps commonly run behind proxies. The relay must only trust forwarded host/proto headers when Rails has been configured to trust the proxy or when the user explicitly enables that behavior.

---

## Privacy Defaults

Ruby defaults must be conservative.

Default behavior:

- Do not capture request bodies.
- Do not capture response bodies.
- Capture only allowlisted headers.
- Redact sensitive values before buffering or transport.
- Hash stable user, account, organization, and patient references when provided through context helpers.
- Capture route templates, controller/action names, job class, status, and duration rather than raw payloads.
- Keep form/message/payload capture explicit opt-in.

Default header allowlist:

- `user-agent`
- `content-type`
- `accept`
- `x-request-id`
- `x-correlation-id`
- `x-debugbundle-trace-id`

Default redaction must cover `contracts/sdk-interface.md` and `rules/security-hardening.md`, including passwords, secrets, tokens, API keys, bearer values, authorization, cookies, phone, SSN, card data, OTPs, verification codes, and session identifiers.

Rails parameter filtering should be reused as an additional source of sensitive keys when available, but DebugBundle defaults must still apply even when the host app has no `filter_parameters` configured.

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
- Safe shutdown flush hooks through explicit `flush`, `at_exit`, and documented server lifecycle examples.

Transport failures must never raise into application code. File writes must follow `SEC-12` through `SEC-15`: owner-only permissions, canonical path validation, symlink protection, and unpredictable temp file names.

Ruby server runtimes vary in threading and process models. The SDK must use thread-safe queues and locks where needed, avoid unbounded background threads, and be safe under Puma clustered workers and Sidekiq server processes.

---

## Capture Policy and Probes

The Ruby SDK must fetch `GET /v1/sdk/config` on init and poll according to backend SDK rules.

It must enforce:

- capture log level/off settings,
- request event capture modes,
- probe event capture modes,
- immediate client error status promotion,
- fallback to safe minimal behavior when config fetch fails.

Probe behavior must match the universal SDK contract:

- Always-on ring buffers for all tiers.
- Proc/lambda lazy probe support.
- `heavy: true` probes dormant until a matching activation exists.
- Remote activation for paid tiers through config polling.
- Trigger token extraction from `_debug_probe` and `X-DebugBundle-Probe-Trigger`.
- Per-request activation only for trigger tokens.
- Request/job correlation (`trace_id`, `request_id`, `job_id`) on standalone `probe_event` shipping where available.

---

## Event Shape

The SDK must emit canonical DebugBundle event envelopes compatible with `contracts/data-schemas.md`.

Ruby request, job, and exception events must include:

- `sdk_name`: `@debugbundle/sdk-ruby`
- `sdk_version`
- `service`
- `environment`
- `event_type`
- `occurred_at`
- `trace_id` when `X-DebugBundle-Trace-Id` is present
- `correlation.request_id` when known
- sanitized payload
- safe runtime facts

Runtime facts may include Ruby version, platform, engine, engine version, pid, cwd, hostname, thread id, memory facts when available without non-portable dependencies, framework name/version, Rails environment, Rack version, and Sidekiq version. Environment variables must never be captured.

---

## Implementation Slices

1. Repository scaffold and build
   - Create `debugbundle-ruby` with gemspec, Bundler, governance files, Makefile, CI, release workflow, RuboCop, RSpec, SimpleCov, and examples.

2. Core event client
   - Config model, singleton and instance APIs, event envelope builder, buffer, flush, status, last event timestamp, mockable transport interface, HTTP transport.

3. Redaction and privacy
   - Default redaction rules, Rails filter-parameter merging, header allowlist, request/response body capture disabled by default, object depth and size limits, healthcare-style sensitive-field tests.

4. Suppression and backoff
   - Duplicate suppression, loop protection, retry, `Retry-After`, bounded buffers, no-raise failure isolation.

5. Rack and Rails request capture
   - Rack middleware, Rails Railtie, request ID/trace ID/route/controller/action capture, exception capture preserving Rails behavior.

6. Sidekiq capture
   - Server middleware, job context capture, exception propagation, retry/failure preservation.

7. Logging integrations
   - Ruby Logger first, Rails logger auto-registration, Semantic Logger appender, recursion guard, level filtering.

8. Local-first transport
   - Atomic local event file writes, local-only mode, secure file permissions, shutdown/at-exit behavior.

9. Capture policy and probes
   - Config fetch and polling, ETag handling, capture-policy enforcement, always-on probe buffers, remote activations, trigger tokens.

10. Browser relay
    - Framework-neutral relay handler, Rack middleware, Rails mounted route, origin/content-type/size/schema/rate-limit controls, local-only writes, durable spool, connected forwarding, shared relay compliance fixtures.

11. Documentation and examples
    - Rails, Rack, Sidekiq, Logger, Semantic Logger, browser relay, local-only, connected, probes, and privacy guidance.

---

## Testing Plan

The Ruby SDK repository must own its test suite and must not require the full DebugBundle Docker stack.

Required test groups:

- Core API unit tests for all universal methods.
- Event envelope serialization tests against canonical schemas or vendored fixtures.
- Redaction tests for default fields, Rails filter parameters, and custom sensitive fields.
- Suppression and loop protection tests.
- Retry/backoff tests using WebMock or a local Rack test server.
- File transport atomic-write, permissions, symlink, and path-validation tests.
- Capture policy enforcement tests.
- Probe ring buffer, heavy probe, remote activation, and trigger-token tests.
- Rack middleware tests.
- Rails integration tests with a minimal Rails app.
- Sidekiq server middleware tests.
- Ruby Logger, Rails logger, and Semantic Logger integration tests.
- Relay compliance fixtures for valid, invalid, credential-smuggling, wrong-origin, oversized, rate-limited, local-only, durable-spool, and connected-forwarding cases.
- Thread-safety tests for concurrent request/log capture and flush paths.

CI matrix:

```text
Ruby 3.1
Ruby 3.2
Ruby 3.3
Ruby 3.4
Ruby 4.0 / current stable Ruby as of 2026-05-23
Rails 7.0
Rails 7.1
Rails 8.x where dependency compatibility permits
Rack 2.2
Rack 3.x
Sidekiq 7.x
Current Sidekiq major where dependency compatibility permits
```

Future releases must refresh the concrete Ruby, Rails, Rack, and Sidekiq version list before cutting the SDK: keep compatibility lanes for the documented installed-base floor, add current stable runtime lanes, and label EOL runtime compatibility as footprint support rather than recommended production posture.

Quality gates:

- `bundle exec rspec`
- `bundle exec rubocop`
- SimpleCov coverage threshold at or above the SDK standard.
- `gem build` validates the publishable artifact.
- A clean install smoke verifies `gem install` from the built artifact in a fresh app fixture.

---

## Release Readiness Checklist

- [x] Universal Ruby API implemented.
- [x] Instance client and singleton facade implemented.
- [x] Rails Railtie and middleware auto-configure cleanly with one configuration block.
- [x] Rack middleware captures requests, exceptions, trace IDs, and request IDs.
- [x] Sidekiq server middleware captures job exceptions and preserves retry/failure behavior.
- [x] Ruby Logger, Rails logger, and Semantic Logger integrations capture structured logs without recursion.
- [x] Local-only and connected transports are implemented.
- [x] Secure local file writes enforce owner-only permissions, path validation, symlink protection, and unpredictable temp names.
- [x] Duplicate suppression and loop protection match the universal contract.
- [x] Capture policy is fetched, cached, polled, and enforced locally with ingestion as a backstop.
- [x] Always-on probes, remote probes, heavy probes, and trigger tokens are implemented.
- [x] Browser relay covers the shared relay contract: origin validation, content type, body size, schema, credential stripping, local-only writes, durable spool, connected forwarding, and rate limiting.
- [x] SDK failures never raise into host application code.
- [x] Request and response bodies are off by default.
- [x] Header capture is allowlist-based by default.
- [x] Existing Rails/Rack `X-Request-Id` and `request_id` are preserved.
- [x] `X-DebugBundle-Trace-Id` links browser and backend events.
- [x] Public docs include install, Rails, Rack, Sidekiq, browser relay, local-only, connected, logging, probes, and privacy examples.
- [x] CI passes all supported Ruby/Rails/Rack/Sidekiq lanes.

---

## Release Decisions

- Rails 7.0 and 7.1 are the first-class V1 Rails compatibility lanes; Rails 8.x can be added after dependency compatibility is proven.
- Semantic Logger ships in V1 with explicit recursion protection.
- The Rails relay endpoint is mounted automatically by the Railtie and remains configurable or disableable.
- Sidekiq captures sanitized job argument type summaries by default, not raw job arguments.
- Rails 6.1 is handled through generic Rack guidance rather than first-class Railtie support.
- Sinatra is handled through generic Rack guidance until demand justifies a dedicated helper.
