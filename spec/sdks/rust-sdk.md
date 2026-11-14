# Rust SDK implementation plan

Status: Rust stable 1.0.0 published and qualified, 14 November 2026.
Source is implemented and pushed under explicit approval; final native/artifact
receipts and separate release gates are in the [implementation record](rust-sdk-progress.md).
[The deep audit](rust-sdk-audit.md) records findings and acceptance.
[The release record](rust-sdk-release.md) records stable `1.0.0` publication,
all eight exact-source qualification jobs, registry-installed consumers and
verified trusted publishing. Core/site publication is tracked separately in
[the coordinated release](../release-20261114.md). The target is
the separate `debugbundle/debugbundle-rust` repository, locally
`sdks/debugbundle-rust`, and the crates.io package `debugbundle`.

This is the implementation plan for FR-SDK-35. Read it together with the
[qualification plan](rust-sdk-qualification.md), which records the inspected
source revisions, cross-SDK applicability, requirement mapping, verification
matrix and release gates. Both documents must be refreshed against the actual
contracts and SDK source before implementation starts; historical version
paragraphs in older SDK plans are not the baseline.

## 1. Outcome and release boundary

Ship a small, idiomatic server SDK for vanilla Rust programs, Tokio services,
Axum and Actix Web. The first release includes the universal SDK interface,
structured exception evidence, request/operation context, native logging
integration, policy and probes, explicit recovery observations, HTTP and secure
local delivery, and full browser relay handlers for both frameworks.

The reference is the inspected Go 3.1.2 source, including the Go 3.0 safety and
3.1 evidence work, supplemented by .NET 2.1.2 deferred projection and Java/native
logger lessons from the November correction. Port invariants and tests, not Go's
runtime assumptions or its older v1/v2 plan. Carry the 9 November credential
redaction additions from the first Rust build.

First-release support:

| Surface                               | Required capability                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Vanilla Rust, synchronous CLI/jobs    | Instance client, explicit context, safe error snapshots, logging adapter, panic observation, bounded explicit flush/shutdown |
| Tokio                                 | Current-thread and multithread applications; SDK-owned delivery runtime; task-safe operation scopes                          |
| Axum 0.8                              | First-class Tower middleware, route-aware requests, typed error helpers, trace correlation, full relay router                |
| Actix Web 4                           | First-class `Transform`/`Service` middleware, non-`Send` application compatibility, typed error helpers, full relay resource |
| Tower 0.5 / HTTP 1                    | Shared HTTP middleware and a real Hyper 1 consumer example; only tested HTTP semantics claimed                               |
| `tracing` and `log`                   | Composable subscriber layer/logger adapter, native filtering, safe typed fields and explicit exception association           |
| `anyhow` and `thiserror` applications | Compiled examples and explicit snapshot/context helpers; no unsafe automatic formatting or cause traversal                   |

Axum and Actix Web are both release requirements, not a first-release/next-release
split. They match the existing product target list and share useful HTTP/Tokio
coverage. No numerical market-share ranking is asserted here. Tonic/gRPC is next
after these lanes: HTTP 200 is insufficient to interpret gRPC trailers, streaming
completion and failures. Warp, Rocket, Poem, Salvo, ntex and serverless-specific
wrappers remain later targets. Generic Tower compatibility does not establish
framework certification. Desktop/Tauri, WASM, browser Rust, embedded and `no_std`
are outside this server SDK's first release.

## 2. Authority and decisions

Authoritative inputs, in order of application:

- [Requirements](../requirements.md), [acceptance](../acceptance.md),
  [SDK interface](../../contracts/sdk-interface.md) and
  [data schemas](../../contracts/data-schemas.md).
- [SDK parity](../../rules/sdk-capability-parity.md),
  [SDK testing](../../rules/sdk-testing-strategy.md),
  [security](../../rules/security-hardening.md),
  [domain invariants](../../rules/domain-invariants.md) and
  [package standards](../../rules/package-standards.md).
- [Evidence quality](../bundle-evidence-quality.md),
  [credential redaction](../business-credential-redaction.md),
  [native logger correction](../multiline-exception-capture.md) and
  [project/service compatibility](../project-service-sdk-compatibility.md).

Decisions for implementation:

1. One package with feature-gated adapters; no application framework dependency in
   the core feature set. Avoid separate packages until there is a concrete
   independent compatibility or distribution need.
2. Edition 2021 and a declared Rust 1.89 minimum for the entire package. This
   accommodates the current Actix floor. Do not promise a lower core MSRV while
   advertising all features at that same floor.
3. Default `http` delivery, with explicit Rustls TLS selection and disabled
   reqwest default features. No automatic system-proxy discovery. A proxy is an
   explicit configuration decision. Qualify the chosen TLS provider and required
   native build tools; do not describe the dependency graph as C-toolchain-free.
4. `local` file delivery and relay storage are explicit features. `axum` and
   `actix-web` enable the shared relay implementation and required storage.
   `tracing`, `log`, `tower` and `testkit` are separately selectable. Use SDK-owned
   public types; do not expose reqwest types through the universal API.
5. `connected` always uses configured HTTP delivery, including development.
   `local-only` never falls through to HTTP and can omit the project token. Explain
   this Rust choice alongside the existing Node-specific local-first convention.
6. `service.runtime = "rust"`, `sdk_name = "@debugbundle/sdk-rust"` and the actual
   package version identify the producer. The v1 exception-evidence runtime enum
   does **not** contain `rust`: emit `exception_evidence.runtime = "unknown"`.
   Structured frames and origins remain usable. Do not emit an invalid enum,
   change Bundle v1, or silently extend the wire protocol for this release.
7. Backend capture-rule actions remain server-enforced initially, as permitted
   for Go/Python/Java. Local capture-policy filtering, sampling, request-failure
   rules and volume controls are mandatory. State this distinction in docs and
   status; never silently claim local deterministic rule evaluation.
8. No mandatory collector, host package installation, source lookup, environment
   dump, symbol server, generic stderr/file tailing or database migration.

The first implementation slice records these Rust-specific choices in the
universal contract, language table and acceptance criteria. It must preserve all
existing SDK behaviour. If a shared requirement has changed meanwhile, update the
plan before coding rather than treating this document as an exception to it.

## 3. Public API and configuration

Use `Client` as the primary API, cheap cloneable handles and an optional singleton
facade. `init(Config)` returns a client/guard; invalid configuration yields an
inactive client with a bounded status reason, never a panic. An administrative
`Config::validate()` may return a typed error for applications that want one.
Construction is synchronous application bootstrap, including rejected-value
disposal. SDK-owned callback fields use separate unwind boundaries; arbitrary
application destructors that block or abort cannot be sandboxed. Capture and
admitted-client cleanup retain their independent bounded non-waiting guarantees.

| API                                               | Required semantics                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `capture_exception(ExceptionInput, Context)`      | Canonical backend exception; privacy-safe snapshot and accurate unavailable metadata                           |
| `capture_error(...)`                              | Exact alias of exception capture                                                                               |
| `capture_log(Level, &str, Context)`               | Structured log; warning default and effective native/server filtering first                                    |
| `capture_message(&str, Level, Context)`           | Universal message convenience with the contract's event mapping                                                |
| `capture_request(RequestSnapshot, Context)`       | Canonical method/path/status/duration; no arbitrary root/payload extras                                        |
| `capture_deploy(DeploySnapshot)`                  | Canonical `deploy_metadata` from explicit version/release/build information; no repository or environment scan |
| `set_context(Context)`                            | Sanitised bounded defaults; request-local overrides remain isolated                                            |
| `probe(label, ProbeValue, ProbeOptions)`          | Always-on local ring; object-wrapped scalar/list/null values                                                   |
| `probe_lazy(label, producer, ProbeOptions)`       | Owned `Send + 'static` producer on bounded callback worker after eligibility                                   |
| `start_operation(OperationOptions)`               | Revocable operation owner and explicit propagation handle                                                      |
| `capture_recovery(RecoveryObservation)`           | Explicit low-priority diagnostic context, locally disabled by default                                          |
| `flush(Duration)` / `flush_async(Duration)`       | Finite administrative wait, with delivery/timeout outcome; not capture APIs                                    |
| `shutdown(Duration)` / `shutdown_async(Duration)` | Bounded drain and detachment; idempotent                                                                       |
| `status()` / `last_event_at()`                    | Bounded read-only status; last canonical accepted delivery, Unix milliseconds                                  |

Capture calls are nonthrowing best effort. Admission receipts, where offered to
framework internals, mean local retention, not remote acceptance. `Drop` revokes
handles and signals stop; it performs no network I/O, filesystem I/O or blocking
thread join. Explicit flush/shutdown must not try to synchronously drive the
application's Tokio runtime. Document the async alternative in every async
example.
Preserve universal status values: `healthy` after successful delivery or idle,
`degraded` for rate limiting, and `disconnected` when uninitialised or after three
consecutive failures. Expose disabled/configuration/drop details separately from
that enum. Explicit error status cannot certify a successful delivery.

The backend produces `backend_exception`, `request_event`, `log_event`,
`deploy_metadata`, `error_suppressed`, `probe_event` and permitted
`diagnostic_context`. Browser event variants are forwarded by the relay, not
fabricated by server instrumentation. All use the current canonical envelope
version and original capture time; deployment context is also available on errors.

Config covers the universal fields: token, endpoint, service/environment,
enabled, extra redaction keys, sample rate, batch size, flush interval, log level,
bounded queues, `before_send`, probes and local storage. Add explicit evidence
and recovery opt-ins, panic observation, trusted proxies and relay options.
Capture policy is server-owned, not accepted as an init override. Only documented
configuration environment variables may be read; never enumerate the environment.
Derive service/build metadata through explicit config or compile-time package
metadata, not shell commands or repository scanning in a running application.

`Context`, `ProbeValue`, `ExceptionSnapshot` and request types are bounded SDK-owned
data. Do not accept arbitrary `Serialize`, `Display`, `Debug`, iterators or getters
in the automatic capture pipeline. An explicit application serialization helper
must be documented as application work performed before capture, not hidden in
`capture_*`. Reject huge input containers without cloning their entire contents.

`before_send` consumes a separate sanitised canonical event and returns keep,
replacement or drop. Run it once on a bounded worker. Valid replacement may change
any schema-valid field, including event ID/type/SDK identity. Revalidate the full
envelope and apply mandatory privacy and policy afterwards. Invalid/panicking
hooks use the SDK-owned safe original. A valid replacement that remains too large
is withheld; never restore pre-hook content. Retry already-finalised bytes without
running hooks or sampling callbacks again.

## 4. Capture safety, privacy and ownership

Pipeline:

1. Read enabled state, native level and metadata-only policy; reject ineligible
   work before formatting, callbacks, context collection or queue admission.
2. Reserve bounded count/byte ownership without waiting for a contended lock.
   Existing low-priority queued logs may yield to a primary exception. A full
   all-exception queue rejects immediately without inspecting the new error.
3. Build a bounded primitive snapshot and apply mandatory privacy before retaining
   it in a queue, scope, logger receipt, probe ring, suppression map or file.
4. Worker builds the canonical event, optional evidence and hook input. Apply
   complete validation/privacy after the hook and authoritative policy again.
5. Finalise UTF-8 bytes, partition for the selected transport, deliver and reconcile
   ownership against canonical acknowledgement. Release each owner once.

Suggested Rust limits below become documented, tested configuration constraints,
not claims about existing implementations. Tighter shared limits always win.

| Resource                    | First-release bound                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event ownership             | Default 1,000 events and 8 MiB total queued **plus in flight**, including finalised unsent tails                                                          |
| Event delivery eligibility  | Default 10 minutes from original admission for backend memory delivery, including retries; diagnostics use their tighter five-minute window               |
| HTTP batch                  | Default 25 events / 5 seconds; hard 100 events and 256 KiB **including wrapper**                                                                          |
| Worker slots                | One sender and one callback worker per active client; process-wide ceilings of 8 active clients and 8 live callback workers                               |
| Callback stall              | Retain at most the admitted task in its slot; no replacement thread; a leaked/stalled slot counts across shutdown/reinitialisation                        |
| Config refresh              | Separate bounded SDK-runtime task; not blocked by a user hook or ordinary send backlog                                                                    |
| Request timeout             | Default 5-second whole-response deadline; flush uses its caller's remaining common deadline                                                               |
| Response body               | 256 KiB; bounded incremental read, identity encoding, strict UTF-8 and canonical JSON validation                                                          |
| Sanitizer                   | Existing privacy limits: depth 16, 4,096 nodes, 256 entries/container, 16 KiB string, 256 KiB total traversal/representation budget                       |
| Probe rings                 | 50 labels × 10 entries; additionally 256 KiB total protected data per client                                                                              |
| Operation registry          | 1,024 live owners, nesting depth 32; exhausted scopes become explicitly unavailable                                                                       |
| Span/context metadata       | 1,024 span records and 256 KiB combined protected metadata per client; bounded entries/strings within each record                                         |
| Automatic identity receipts | 128 per client, 30-second TTL, scoped to the live operation and exact occurrence token                                                                    |
| Suppression state           | 1,024 fingerprints; bounded LRU with aggregate loss accounting, no raw-error retention                                                                    |
| Relay ingress / rate map    | Eight active uploads and 4,096 IP keys per client, shared by all its handlers; expiry and fail-closed capacity, never reset by constructing another route |
| Relay disk spool            | 100 MiB / 1,000 files; reject new unretained work when full, never report durable acceptance                                                              |

Use one process-wide SDK-owned Tokio runtime with one I/O thread and at most eight
blocking workers. Sender/config tasks are bounded by the client limit above;
callback threads have the separate eight-slot ceiling. Bound work before handing
it to Tokio's blocking pool or a resolver: `spawn_blocking` is not an admission
queue. Never spawn a task/thread per captured event. File/DNS work that cannot be
interrupted retains its occupied slot; flush may time out without replacing it.
Expiry revokes delivery eligibility and records bounded loss counters; a retry or
hook does not reset age. Cancel supported in-flight work, but keep its bytes/count
charged until the sender actually relinquishes them. A stalled callback retains
its one bounded task/slot even after expiry, and cannot send its result later.
Never free accounting early merely to make an expiry test pass. Relay disk
retention uses its separate 24-hour/seven-day contract. Tests distinguish delivery
eligibility, retained ownership and uninterruptible application callbacks.

All caps include metadata and secondary queues or have a separately accounted
bounded budget. Do not claim the 8 MiB serialised-event budget bounds all heap
allocation. Benchmark peak retained memory, worker count and concurrent ownership.
Avoid data-dependent repeated regex compilation; fixed credential patterns are
precompiled or use bounded scanners. No user-provided regular expressions.

Port the exact shared privacy corpus, including `dbundle_invite_`,
`dbundle_org_invite_` and `dbundle_org_transfer_` in arbitrary text. Custom
`redact_fields` extends mandatory protection and cannot disable it. Cover sensitive
headers, cookies, URL userinfo/query credentials, token formats, PEM material,
nested and segment-aware keys, text/stack/message fields, after-hook replacements
and relay input. Withhold unsafe fields if sanitization fails. Oversized field
names must be withheld whole rather than truncated into a harmless-looking key.
The owned JSON model cannot contain reference cycles; native adapter boundaries
must still reject recursive structures and preserve repeated aliases correctly.

SDK failures are silent to the host. Bounded counters/status replace recursive
logging. Exclude SDK transport/config/relay-worker logs from capture. Use checked
arithmetic and fallible allocation where feasible. OS process termination, OOM,
and application callbacks explicitly aborting the process are not recoverable by
this library; do not claim that `catch_unwind` contains `panic=abort`.

## 5. Rust errors, panics and native logs

### Safe error model

Rust's `Error::source`, `Display` and `Debug` are application code; a borrowed
`&dyn Error` cannot be safely moved to a background worker and does not provide a
throw-site stack. The implementation must not solve this with `unsafe`, a strong
retained error graph, synchronous formatting or an unbounded thread pool.

`ExceptionInput` has two explicit forms:

- **Snapshot:** an SDK-owned immutable `ExceptionSnapshot` with a supplied safe
  name/message, optional supplied stack/frames and bounded cause/aggregate edges.
  This is the full structured-evidence path. The builder applies limits and
  privacy before retaining input. Application code can construct it at the error
  boundary from data it already owns, including a technical message independent
  of custom formatting.
- **Borrowed error:** `ExceptionInput::borrowed<E: Error + ?Sized>(&E)` records
  statically available type information and explicit supplied context. It invokes
  no custom formatting, `source`, downcast getter or iterator. Missing message,
  chain and stack use a stable unavailable fallback. A trait-object input may
  have only an opaque type; never pretend `type_name` recovers its concrete type.

The first release does not introduce an opt-in arbitrary-error traversal worker.
FR-EVID-03 forbids treating caught formatter/unwrap failures as safe traversal.
This is a documented Rust runtime limitation, not a hidden implementation TODO.
Any later concrete native-error adapter needs evidence that its complete accessor
path is safe, not merely that its outer wrapper is from a standard crate.

`anyhow` context and `thiserror` derived errors can wrap arbitrary user errors.
Examples show explicit snapshots/causes and ordinary borrowed capture, compile
against the actual packages, and explain the difference. Do not advertise automatic
full `anyhow` chains or `thiserror` fields. Application-provided textual chains are
preserved, protected and parsed conservatively without inventing native identity.

Evidence uses v1 graph limits: 8 nodes, 4-edge depth, at most 5 outgoing edges,
32 frames/node, 32 KiB combined additional JSON; name/function 256 bytes,
message/file 2 KiB and stack 16 KiB. Use UTF-8 byte lengths and the canonical
compact-JSON semantics, not Rust string character counts. Nodes report accurate
`truncated` and `unavailable_reason`. Capture-site stack is `capture`, supplied
runtime stack is `runtime_reported`, absent stack is `unavailable`; no fabricated
`throw`. First release does not synchronously force backtrace capture or symbolise.

### Panic observation

Install only through an explicit safe convenience installer or documented
application bootstrap. Chain the previous hook exactly once, preserve its output
and termination/unwind behaviour, and guard against SDK recursion. A hook receives
only bounded primitive payloads (`&str`/`String`) and supplied location; custom
payload formatting is forbidden. Record runtime-provided location separately from
any optional supplied stack. Fatal additions use at most 2 nodes, 8 frames/node
and 4 KiB total. Skip application hooks, lazy probes and flush/network operations.

The global hook is a bounded dispatcher with revocable client registrations;
detachment must not restore an older hook over one installed later by the app.
Do not call `set_hook` while panicking. A borrowed panic payload is never retained.
In abort mode the queued event may never leave the process; no crash persistence,
signal/OOM or next-launch replay guarantee is made. Qualify unwind and abort in
subprocess tests. No middleware catches and suppresses application panics to make
an error report appear reliable.

### Logging integration

Provide a `tracing_subscriber::Layer` that users compose with their existing
subscriber, and a `log::Log` adapter/explicit tee for applications already using a
logger. A convenience `try_install` may install when unclaimed and reports an
already-installed status without panicking. Rust does not permit a library to
discover and replace arbitrary global subscribers/loggers safely: framework setup
must explain and provide composition, with automatic capture once composed.

Apply layer-local filtering so the SDK does not filter other subscriber layers.
Do not set the global maximum log level lower than the application's level.
Override typed `tracing::field::Visit` methods to copy bounded primitives.
`record_debug`, dynamic `fmt::Arguments` and borrowed `record_error` must not
execute custom formatting on the capture caller. Preserve safe literal/static
messages; otherwise use a clear unavailable marker and typed fields. `log` has no
universal native-error field: never infer one from text. Runtime documentation must
explain this cost/safety tradeoff with examples that retain useful messages.

Offer an SDK helper to associate a protected `ExceptionSnapshot` and occurrence
token with an error log in the current operation. An ERROR/native-error record
uses one `backend_exception` with log context; it does not also emit `log_event`.
Opaque borrowed errors still follow exception capture with unavailable graph;
plain text stays a log. Span metadata/field maps are bounded and dropped on close.
Respect existing native logger filters and evaluate an eligible owned lazy producer
at most once. SDK detachment stops telemetry without removing the app's logger.

Logger/middleware pairing needs an exact SDK occurrence token plus operation
identity and an actual admission receipt. Pointer address, matching text or close
timestamps are insufficient. No receipt on failed admission; no irreversible
pair suppression if a deferred hook can later discard the only event. Independent
reports remain independent, subject only to ordinary volume suppression. No Java
stderr assembler is copied to Rust.

## 6. Operations, frameworks and correlation

An operation owns a fresh UUIDv4, monotonic start, kind (`request`, `command`,
`job`, `unknown`), sanitised technical name and configured time limit. Execution
evidence contains elapsed time and configured duration, not process uptime or time
remaining. Never invent a timeout when none is configured.

Use explicit operation handles and poll-scoped task context. A thread-local guard
held across `.await` is invalid. Helpers wrap a future so context is entered only
while that future is polled; nested scopes restore parents. Propagation to spawned
tasks is explicit. Completion/drop revokes the owner and descendants; stale clones
cannot admit new execution or recovery data. Actix's local non-`Send` futures remain
on its executor; only protected owned snapshots cross into SDK workers.

Axum middleware must implement `poll_ready` correctly and instrument the actual
service future. Actix middleware preserves its normal error/response conversion.
Both capture method, sanitised route/path, actual status, duration, framework
version and safe runtime facts without buffering application request/response
bodies. Error status alone does not reveal a native exception: use explicit typed
error helpers where the framework converts an error into a response before the
outer middleware can inspect it. Do not manufacture an exception from a 500.
Each adapter converts its native HTTP/error types to SDK-owned snapshots; do not
force Tower traits, a common external HTTP crate version or `Send` on Actix apps.
Capture a bounded sanitized header map, request ID and route template. Request
body capture is off by default; support an explicit already-parsed SDK-owned
primitive body snapshot, capped at 8 KiB and protected before retention. Middleware
must not consume, duplicate or buffer an arbitrary application body stream. Include
this opt-in path in both framework tests to satisfy useful request context safely.

Test successful, failed, cancelled, streaming and dropped response bodies,
nested middleware, handler panic and rejected extraction. Define request duration
as time to response headers; a separate execution owner may remain live through
body completion, with guaranteed cleanup on drop. Never fabricate a completed
request status for cancellation before headers, or infer recovery from a 200.
Middleware and full relay routes must avoid reporting their own transport as user
request incidents. Incoming config policy is snapshotted for the request; final
delivery still applies any stricter current policy.

Read a valid incoming UUIDv4 `X-DebugBundle-Trace-Id`; generate one when absent or
invalid, expose it to handlers and propagate it on the response. Never overwrite
a valid incoming trace. Explicit outbound HTTP instrumentation propagates it only
to configured first-party destinations, never to DebugBundle ingestion/config or
arbitrary third parties. Trace and operation IDs are different identifiers. Do
not silently substitute W3C/OpenTelemetry IDs for the product correlation contract.
Honour trusted proxy configuration; untrusted forwarded host/IP cannot determine
relay origins, rate-limit keys or trace trust decisions.

Runtime facts follow the canonical memory object (`rss`, `heap_total`,
`heap_used`, `external`, `peak`); Rust cannot universally supply allocator totals,
so omit unavailable values. Platform-specific facts are optional and bounded;
framework extras stay under `framework_extras`. Never invent JVM-style heap values.

## 7. Policy, probes, suppression and recovery

Configuration fetch runs asynchronously, authenticates with the project token
and scopes state by endpoint, token hash, service and client generation. Old
responses after credential changes cannot enable the new client. Initial unknown/
failed config uses minimal policy (exceptions and warning+ logs); a successful
legacy response without `capture_policy` uses balanced. Server disable is honoured
before expensive work. Cache last valid policy and ETag without logging credentials.

Paid backend config polling defaults to 60 seconds and tightens to 15 seconds while
remote probes are active. Free does not periodically poll. Handle 304, invalid
responses, stale responses, revocation and bounded retry; an initial discovery
request is not an excuse for periodic Free polling. Existing response piggyback
may refresh config without extra discovery calls.

Request-failure presets: minimal includes 5xx; balanced adds 408/423/424/425/429;
investigative also includes 409. Apply resolved status-wide and path+method client
error promotions. Generic 404 repetition must not open incidents. No client-side
assignment of `event_class` and no invented local rule hashing.

Always-on probes buffer protected data and flush with admitted exceptions when
enabled. Match the current contract's versioned inline `probe_data` and remote
`probe_event` behaviour; do not resurrect older unbounded separate-event designs.
Non-heavy lazy producers run for an eligible always-on probe; heavy producers run
only for matching valid remote activation. Disabled/full/expired work runs no
producer. Producers execute on bounded callback slots, so their inputs must be
owned; request-local borrowing is not supported by lazy capture. Callback result
is validated/redacted before retention. Error snapshots contain only completed
probe data, not a wait for pending callbacks.

Trigger verification uses the configured signing key from authenticated config,
not the project token as a guessed key. Honour header over query precedence,
constant-time signature checks, expiry and the contract's TTL limits: activation
at most 3,600 seconds and trigger token at most 86,400 seconds. Do not persist or
log the raw token. Bound label matching without user regex; request activation is
scoped to that operation. Multiple directives sharing an activation ID remain
distinct. Preserve original project/service identity and merged-service config
semantics from the compatibility spec.
Verify signed label/service/environment scope as well as signature and time.
Expose the exact `_debug_probe` query and `X-DebugBundle-Probe-Trigger` header
names in both framework guides, and remove the query secret from captured URLs.

Suppression sends the first three identical events in 30 seconds, then aggregates.
More than ten in two seconds forces loop suppression, checkpoints at least every
30 seconds and reset after 60 seconds of silence. Use the actual event/method in
the local key, protect fields first and keep sampling/aggregation bounded. Optional
evidence never changes historical server fingerprints. Queue-pressure accounting
uses the canonical optional reason/level fields; aggregates cannot displace all
primary errors or recursively aggregate themselves.

Recovery is locally opt-in and additionally gated by current server policy and
complete-path proof. Minimal policy never admits diagnostic recovery. Fresh UUIDv4
failure/attempt IDs bind to the current operation; validate scope and ownership.
Support `attempt_started`, `attempt_completed`, `attempt_failed`,
`recovery_observed` and `failure_persisted`. Only `recovery_observed` asserts actual
recovery. An HTTP 200, successful retry or completed task alone is not equivalent.
Recovery does not resolve incidents, change fingerprints or drive lifecycle state.

Enforce five-minute associations, 50 failure windows, five attempts and 20
observations per failure, and a **joint** 64 KiB budget for pending diagnostics plus
association metadata. Reject future observations beyond the allowed 60-second
clock tolerance. Consume allowances once; ACK/drop frees bytes without refunding
counts. Handle hook ID/type replacements and ownership atomically. Diagnostics
yield to primary errors; unknown policy/proof cannot leak previously queued data.

## 8. Delivery, evidence negotiation and files

Send the canonical `{ "events": [...] }` envelope with project-token bearer
authentication. Use one pooled SDK-owned HTTP client; disable redirects carrying
credentials and response decompression surprises. Require TLS verification;
explicit local test HTTP is not a production default. Self-host endpoints may be
private HTTPS addresses: hosted outbound-health-check SSRF rules must not be
misapplied to forbid customer self-hosted ingestion.

Negotiate only the existing v1 features (`exception_evidence_v1`,
`resource_observations_v1`, `recovery_v1`, `evidence_provenance_v1`) through existing
traffic (`X-DebugBundle-Evidence: 1` or `debugbundle_evidence=1`). Validate version,
unique known features (at most four), and the complete reader/relay/ingestion
intersection (at most eight hops). Only a valid canonical ingestion ACK can grant
its advertised proof; a malformed ACK revokes it. No
extra capability-ping endpoint, assumed support by SDK version, or proof copied
between credentials. Unknown or revoked proof downgrades queued primary errors by
removing unsupported additions; context-only diagnostic events are withheld.
Capability proof is not permission to override policy. Existing explicit reader
pins for local/custom transports must be documented, validated and tested.

Final HTTP chunks obey actual serialised bytes, wrapper, commas and server relay
metadata. A shared flush deadline covers all chunks. Reduce optional evidence
before dropping an otherwise admissible primary; never reverse valid hook edits.
Keep unsent finalised tails charged and retry the same identity/bytes. No hook
reruns, duplicate accepted events or early release while an in-flight sender still
owns the batch.

An HTTP 2xx requires canonical ACK: nonnegative integral accepted/rejected counts
summing to the chunk length, and exactly one unique in-range error index per
rejection with nonempty reason. Accepted items leave ownership exactly once.
Only `rate_limited`, `monthly_quota_exceeded` and `analytics_quota_exceeded` indexed
rejections retry; other indexed rejections terminate with bounded diagnostics.
Malformed/missing ACK retains the whole chunk. All-rejected ACK does not advance
`last_event_at`. File/custom legacy success is a separate explicitly documented
contract, never the fallback for SDK-owned HTTP.

Respect numeric and HTTP-date `Retry-After`, capped at 300 seconds **before**
overflow-prone arithmetic and measured from response receipt, including partial
retry ACK, protocol failure and server failure. Without a valid hint, use bounded
exponential backoff with jitter. Distinguish auth/configuration failures from
canonical terminal per-event decisions; never drop an entire opaque failed batch
solely because an old test-strategy summary says all 4xx drop. Retention ends only
through documented bounded capacity, shutdown/drop, terminal ACK or configured
retention policy, with observable safe counters.

Local-only backend events use `.debugbundle/local/events/` and canonical
`<timestamp>-<sequence>-<service>.events.json` JSON arrays. Local reader integration
must actually run `debugbundle process`; a successful file write is not end-to-end
proof. Use private directories/files, canonical bounded paths, safe service names,
exclusive no-follow creation, cryptographic temporary suffixes, atomic rename and
validated regular-file checks. Never retain tokens in event files. Filesystem
work stays on workers. Permission/path failure disables that transport safely
without falling through to HTTP. Unix modes are 0700/0600; Windows ACL/private-path
equivalence needs native CI and must fail closed if it cannot be established.

## 9. Full browser relay

One framework-independent relay engine with Axum and Actix adapters, mounted at
`POST /debugbundle/browser` plus `OPTIONS`. Both are full relays at release.

- Validate JSON content type, body at most 256 KiB during streaming read, event
  count/schema and the browser `{ "batch": [...] }` wrapper. The browser allowlist
  includes `frontend_exception`, `frontend_breadcrumb`, `request_event`,
  `probe_event`, `error_suppressed`, opt-in `analytics_event`, and negotiated
  browser-scoped `diagnostic_context` variants. Do not accept backend/operation
  diagnostic impersonation through a browser relay.
  Reject backend event impersonation; preserve valid batch members with indexed
  outcomes as the contract requires.
- Default same-origin verification uses valid Origin then the documented Referer
  fallback; support explicit frontend allowlists and matching allowed POST/CORS
  preflight headers. Never reflect arbitrary origins or trust unconfigured proxies.
- Enforce 60 requests/minute/IP with bounded state; document the per-process
  limitation and offer a bounded shared limiter interface for multiple replicas.
- Document the relay's application-auth/CSRF exemption with origin validation and
  rate limiting as its boundary; it must not require a member token or a browser
  project token. Mount the exact route so a framework's normal CSRF middleware
  does not silently reject valid SDK batches.
- Strip/reject browser-supplied project/organisation credentials and privileged
  fields, override SDK identity as required, preserve valid correlation and
  reapply mandatory privacy. Attach the server credential only on upstream HTTP.
- In local-only mode, write the shared canonical event arrays. In connected mode,
  durable spool is default: persist under `.debugbundle/local/browser-relay-spool/`
  before acknowledging local retention, then forward on a bounded worker. Clearly
  distinguish local durable admission from upstream acceptance in status/docs.
- A spool item is delivered only after **every** downstream chunk has canonical
  acceptance. Persist partial progress safely so accepted events do not reappear
  on ordinary retry; preserve stable IDs through crash recovery. Do not promise
  distributed exactly-once delivery across a crash at the ACK/persist boundary.
- Retain delivered entries 24 hours and undelivered entries seven days; bounded
  cleanup touches only validated owned regular files. Disk full, permission
  failure and capacity exhaustion fail without a false acceptance receipt.
- Evidence proof is complete-path intersection and credential-scoped. Preserve
  private delivery metadata outside public event arrays, bind it to owned records,
  reject forged markers and downgrade legacy browser data safely.

Return the contract's statuses and indexed outcomes: 202 for accounted opt-in batches,
204 for allowed preflight, 400 for a malformed wrapper, 413 for oversized bodies,
403 for forbidden origin and 429 for rate limits. Preserve the established
opt-in evidence error extension where the browser contract requires it; preserve
the universal contract's existing legacy mixed-batch 400/string compatibility.
Never
return a downstream ACK indexed against a different browser input array.

Share the current relay fixtures with both frameworks. Qualify restart, partial
ACK, credential rotation, proof revocation, missing disk, symlinks, malicious
Origin/Host/forwarded headers, mixed analytics/debug batches and slow upstream.
Relay durability necessarily includes bounded request-side filesystem admission;
document it separately from the nonblocking application `capture_*` guarantee.

## 10. Repository and core integration

Proposed standalone layout (functional names only):

```text
Cargo.toml                     # features, MSRV, metadata and independent version
src/lib.rs                     # public re-exports; no framework dependency
src/{client,config,status,context,operations}.rs
src/capture/                   # admission, suppression, requests, probes, recovery
src/evidence/                  # owned snapshots, graph, proof, wire budgets
src/privacy/                   # bounded JSON and fixed text/key protection
src/delivery/                  # HTTP, ACK, ownership, retries, local files
src/integrations/               # tracing, log, panic, tower, axum, actix
src/relay/                     # validation, origin, storage, forwarding
tests/                         # functional suites and shared helpers
fixtures/                      # exact vendored canonical fixtures + provenance
examples/                      # vanilla, Tokio, Axum, Actix, Hyper, error models
smoke/                         # isolated consumers of the packaged artifact
Makefile, Dockerfile.test       # pinned container-backed commands
README.md, CHANGELOG.md, docs/  # API, privacy, limitations, integrations, releases
```

Keep files below the 800-line target and split before 1,000. No phase numbers in
source/test names. Core services are not a runtime dependency of ordinary SDK
unit/contract tests. Use a local fake ingestion/config server and controlled
clock/random sources. Integration-only core tests use Docker Compose.
Include Apache-2.0 `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
issue/PR templates and CI/release workflows per the repository release-governance
rule, adapted to Rust rather than copying the TypeScript command pipeline.

Core follow-through during implementation, with focused regressions:

1. Extend the pure stack presentation parser and `stack-formats.json` for positively
   identified Rust numbered/backtrace formats, `at file.rs:line:column`, Windows
   paths, missing symbols and inline frames. Under `runtime: unknown`, do not
   reinterpret other runtimes' text. Add narrow SDK/framework frame classification;
   preserve original protected text. No fingerprint parser changes.
2. Add Rust golden EventEnvelope examples to the evidence fixtures and run actual
   ingestion/normalizer/bundle-reader validation. Use
   `tests/fixtures/evidence/event-envelope.schema.json`, generated from current
   `EventEnvelopeSchema`, **not** the Bundle schema. Add semantic graph/UTF-8 tests
   beyond JSON Schema. If the testing guide still points at `/schemas/bundle.json`
   for an event envelope, correct that reference in the same contract slice.
3. Teach `debugbundle setup` about Cargo packages/workspaces and Axum/Actix
   dependencies; avoid target/vendor trees. Provide exact dependency feature,
   logger composition, middleware and relay setup guidance for the detected
   framework. Treat mixed/virtual workspaces deterministically. Add CLI tests;
   do not edit consumer repositories as a qualification shortcut.
4. Add the standalone repo to `sdks.json`/bootstrap and fixture synchronization
   inventory only when it exists. Update SDK/interface/framework/relay tables,
   requirements/acceptance, system overview and architecture together.
5. Prepare public SDK docs with the same version/features and explicit limitations.
   The site is a separate repository/release; preparation is within DebugBundle,
   publication still requires the user's explicit instruction. No new dashboard
   feature, API/CLI/MCP business capability or database change is needed.

## 11. Dependency-ordered implementation slices

Each slice follows red → green → refactor, updates owning docs, records exact
commands/results and runs the applicable pre-ship checklist. A checked planning
document is not a checked implementation task.

| Order | Deliverable and dependency                                                                                | Exit evidence                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Refresh source/versions; record Rust contract decisions; reader fixtures and parser before a new producer | Existing runtime fixtures/fingerprints unchanged; Rust fixtures parse under current canonical schema; all-surface impact audit updated |
| B     | Standalone package, Docker Make targets, bounded owned types, privacy, config/no-op client                | MSRV/stable feature builds; exact privacy corpus; all unsafe/oversized inputs fail safely; package contains intended files only        |
| C     | Admission/ownership, sender, canonical HTTP ACK, byte splitting, retry/deadline, local files              | Failure injection, strict partial ACK, privacy before retention, no loss on protocol failure, finite flush, exact local arrays         |
| D     | Snapshot evidence, operation scopes, proof downgrade, policy/probes/recovery                              | Graph/provenance bounds, revocation/isolation, disabled heavy probes, policy/proof transitions, joint recovery ledger                  |
| E     | Vanilla panic/log/tracing integrations and error-model examples                                           | Real subscriber/logger tests; no custom formatter on capture path; no recursive/duplicate reporting; panic subprocesses                |
| F     | Shared Tower/Hyper and Axum middleware/relay                                                              | Actual installed app, cancellation/streaming, typed error + log pairing, trace, local and connected full relay                         |
| G     | Actix middleware/relay with non-Send apps                                                                 | Same complete framework matrix; no executor assumptions or drift from Axum relay semantics                                             |
| H     | CLI setup, docs, package consumers and full qualification                                                 | Exact `.crate` extracted consumers, all feature/MSRV/platform lanes, per-file coverage, off/on cost evidence, core regression gates    |
| I     | Separately authorised release and registry acceptance                                                     | Exact crates.io artifact/checksum and clean registry consumers on supported lanes; changelog/docs reconciled                           |

A through H are implemented and qualified on the exact source/artifact recorded
in the audit and implementation record. Subsequent changes need fresh qualification.
I requires an explicit publication instruction. Do not call the SDK complete if
either framework, a full relay, current privacy, evidence safety, strict ACK or
exact-artifact qualification is still deferred.

## 12. Known limitations and implementation-entry checks

Resolved limitations: safe snapshots rather than arbitrary Rust error traversal;
unknown v1 evidence runtime tag; subscriber/logger composition rather than forced
global replacement; abort-mode panic delivery best effort; explicit task
propagation; server-side capture-rule actions; no automatic gRPC certification.
Document these in README/API/examples and test them as behaviour.

Before slice A, confirm the remote repository/package ownership and create the
local scaffold only within the requested implementation scope. Name reservation,
remote repository creation and publication are distinct external actions. Resolve
the pinned dependency graph in Docker, prove Rust 1.89 works for all supported
features, and refresh stable Rust because 12 November is a release transition
date. If any selected dependency requires a newer compiler, fix the selection or
explicitly revise the support floor before exposing a public API.

No plan decision requires production traffic, paid model calls, another product's
credentials, consumer adoption, commit, push or deployment. The qualification
document defines what must be measured before claims of implementation or release.
