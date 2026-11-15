# SDK internal diagnostics audit

Subsequent authorised remediation and publication are complete. See the
[SDK safety release record](../sdk-safety-release-20261115.md) for all 13 surface
versions, published-consumer gates and hosted acceptance. The original findings
and checkpoint limits below remain historical evidence.

The subsequent [deep final audit](sdk-deep-audit-20261115.md) records additional
corrections and superseding source/artifact qualification. Earlier receipts below
remain historical evidence.

Date: 2026-11-15. Status: original findings remediated locally; final qualification
is recorded in [the remediation qualification](internal-diagnostics-qualification.md).
The initial findings below are retained as regression requirements.

## Conclusion and scope

The focused review found reproducible diagnostic safety/privacy gaps in Node,
Python, Go, Swift and WordPress. Implementation qualification subsequently found
the Browser console-warning gaps recorded as D6 below. React Native also needs
qualification with the corrected Swift dependency. These are separate from the completed
[beforeSend size-budget work](before-send-budget-audit.md): the diagnostic sink
and lifecycle files implicated here were unchanged by that work.

The source inventory covered all thirteen maintained capture surfaces in twelve
repositories, including framework/logger adapters, relays, the WordPress wrapper
and React Native native bridges. No separate hidden maintainer-reporting endpoint
or automatic SDK self-report transport was found. Normal configured ingestion,
configuration discovery, relay forwarding, explicit test events and opt-in
analytics are distinct from internal SDK diagnostics. Diagnostic callbacks can,
however, feed internal failures into the normal application capture channel as
described below.

The original review was a current-source audit with focused local failure injection, not a packet
capture of every published registry package, OS or application-owned callback.
No runtime implementation, dependency pin, consumer product or release was
changed during the original audit. Subsequent authorised remediation and its
source/artifact checks are recorded separately in the linked qualification.

## Reproduced findings

### D1 — Node diagnostic failures can escape or feed capture again

Priority: P1, host safety and recursion. Owning files:
`packages/sdk-node/src/event-support.ts:320`, `utils.ts:192`,
`core.ts:692` and `lifecycle.ts:19` in `sdks/debugbundle-js`.

- The diagnostic callback's synchronous exception is contained, but a returned
  rejected Promise is ignored. The SDK's automatically installed rejection hook
  captures that rejection. A failing `beforeSend` then invokes the diagnostic
  callback again. A bounded child-process reproduction observed three unhandled
  rejections; without its test fuse, the child entered a busy rejection loop and
  required stopping the disposable container.
- With console capture enabled, logging from `onDiagnostic` is captured again.
  One application event produced seven diagnostic invocations and seven events
  in the fake transport, with six internal messages. The test stopped logging
  after six iterations; that was a test fuse, not an SDK recursion limit.
- Formatting a rejected transport `Error` happens before entering the diagnostic
  helper's protective `try`. An error with a throwing `message` getter caused
  public `flush()` to reject, even with no `onDiagnostic` configured.

Required fix: contain diagnostic preparation and invocation, safely consume
native Promise rejections without turning diagnostics into an asynchronous API,
and suppress SDK recapture while executing diagnostic output. Use scoped guards
with guaranteed cleanup, not a process-wide flag that could suppress unrelated
application errors. Preserve normal application logging and failure propagation.

### D2 — Go error formatting can crash the host; retained detail is unbounded

Priority: P1 for panic containment; P2 for diagnostic privacy/bounds. Owning
locations: `sdks/debugbundle-go/debugbundle.go:139` and `:328`.

The initial configuration worker contains a panic from `RemoteConfigFetcher`,
but subsequently calls `err.Error()` outside recovery when recording a failure.
A custom fetcher returning an error whose `Error()` panics terminated the child
process with exit status 2. This differs from the already-tested case where
`Fetch()` itself panics, which remains contained.

An ordinary returned error also retained 1,048,602 bytes, including a synthetic
credential, in the public diagnostic snapshot. The list has a 100-entry cap, but
no per-entry byte or sanitisation bound.

Required fix: record a fixed safe failure code or prepare bounded, sanitised
detail inside a protected boundary. Preserve the `Diagnostics() []string` API,
configuration retry policy, readiness signalling and delivery ownership.

### D3 — Python logger diagnostics bypass the safety/privacy boundary

Priority: P1 for escaped callbacks; P2 for recursion and privacy. Owning files:
`sdks/debugbundle-python/src/debugbundle/logger_integrations.py:125`,
`core.py:413` and `core.py:663`.

Optional structlog/loguru attachment passes the raw configured callback directly
to a second emitter. That emitter calls `str(error)` and the callback without
containment or sanitisation. A broken loguru attachment plus a throwing callback
raised through public `capture_logging()`. Another reproduction delivered an
error message exceeding 64 KiB with a synthetic credential intact.

The main emitter catches ordinary callback exceptions, but does not suppress
recapture. Logging from it while `before_send` fails produced seven diagnostic
invocations and seven transported events from one original event, using the same
six-iteration test fuse as Node.

Required fix: route logger setup and delivery/config diagnostics through one
bounded, sanitised, failure-contained sink and suppress diagnostic recapture.
Review callback execution under SDK locks in `remote_config_client.py` and
`flush_delivery.py` as part of that fix; moving a callback must not introduce
unbounded workers, wait times or retention. This audit did not independently
qualify indefinitely stalled callbacks at those lock sites.

### D4 — WordPress stores raw failure text and can fail inside its error handler

Priority: P1 for escaped sink failures; P2 for privacy. Owning locations:
`sdks/debugbundle-wordpress/src/SdkBootstrap.php:287` and
`src/Diagnostics.php:44,86`.

The backend wrapper forwards an exception message directly into a transient.
The text is capped at 500 bytes and expires after seven days, but is not
sanitised. An isolated `onShutdown()` reproduction using fake WordPress functions
stored a synthetic credential for 604,800 seconds. When the fake transient sink
threw, its exception escaped the same public shutdown method from inside the
original error handler.

Required fix: use safe codes or sanitised bounded details and contain diagnostic
storage failure. Keep the existing admin status keys, ordinary status visibility,
TTL and spool/ACK behaviour. This is wrapper code, not a reason to change the PHP
SDK's otherwise silent diagnostic behaviour or any installed WordPress site.

### D5 — Node and Swift diagnostic metadata has privacy gaps

Priority: P2. Node's `sanitizeMetadataObject` applies default sanitisation without
the client's additional `redactFields`. A fake transport throwing a structured
error exposed a configured sensitive field unchanged to `onDiagnostic`.

Swift's `Sources/DebugBundle/DebugBundleClient.swift:596` copies a terminal ACK
reason directly into `latestInternalDiagnostic.metadata["first_reason"]`. A fake
transport retained a 65,562-byte reason with a synthetic credential. Native HTTP
response limits bound the entire response, but do not sanitise this field; custom
transports have no independent diagnostic string limit. This state is internal
memory, not an identified outbound reporting channel.

Required fix: honour configured privacy fields in Node diagnostics; use bounded
safe diagnostic reasons in Swift. Preserve ACK decisions, unknown-reason terminal
handling, retry ownership and status transitions. Qualify React Native's Swift
dependency/bridge with the corrected native candidate.

### D6 — Browser warnings can leak detail, recapture and interrupt ACK bookkeeping

The original search missed warnings emitted through the `consoleSource` alias in
`index.ts`; the initial Browser matrix conclusion was too broad. Full qualification
exposed authentication and acknowledgement diagnostics on that path. The source
retained arbitrary rejection-detail keys in an uncapped Set, printed raw response
and endpoint text, and admitted SDK warnings into application breadcrumbs. A
throwing console also interrupted terminal ACK bookkeeping, leaving an incorrect
healthy status.

Two regression tests fail against isolated read-only original-source overlays
and pass with the correction. Remediation extracts bounded, sanitised local
warnings into `internal-diagnostics.ts`, suppresses their capture and breadcrumb
projection, caps emission/deduplication/pending Promise state, and contains console
failure. Existing local warnings and normal application console breadcrumbs remain
available. WordPress inherits the correction through its rebuilt Browser asset.

## Initial cross-SDK applicability

Dispositions below apply to this narrow internal-diagnostics capability. An
equivalent silent implementation does not need a new diagnostics API. Rows with
no finding are not a claim that every SDK behaviour is defect-free.

| Surface      | Disposition                       | Source behaviour and evidence                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | Implement                         | Optional local callback; D1/D5 reproduced. Existing synchronous callback-throw control passes.                                                                                                                                                                                                      |
| Browser      | Implemented; see qualification    | D6 corrects the original source-review conclusion. Existing console warnings are bounded, sanitised and contained; no diagnostic transport is added.                                                                                                                                                |
| Python       | Implement                         | Optional local callback; duplicate unprotected logger emitter and recapture, D3. Existing hook/logger suite still passes: 117 tests.                                                                                                                                                                |
| PHP          | Already equivalent for this scope | `BeforeSend.php` catches failures; no internal callback or self-report channel found in core/framework/relay source. Existing full qualification is recorded in the budget audit; not rerun here.                                                                                                   |
| WordPress    | Implement                         | PHP/browser inheritance plus its own persisted admin diagnostics; D4 reproduced in the wrapper. Explicit admin test events are a separate operator action.                                                                                                                                          |
| Java         | Already equivalent for this scope | Hook, sender, config and framework/logger paths contain failure without an internal reporting sink. HTTP owners use configured event/config/relay destinations. Existing full qualification, not rerun here.                                                                                        |
| Go           | Implement                         | Local diagnostic list; D2 reproduced. Existing fetch/sender panic-containment test passes separately.                                                                                                                                                                                               |
| Ruby         | Already equivalent for this scope | Hook/worker failures are contained without a diagnostic callback/reporting sink; HTTP event/config destinations derive from configuration. Existing full qualification, not rerun here.                                                                                                             |
| .NET         | Already equivalent for this scope | `BeforeSendProcessor`, sender and logger integrations contain failure without a diagnostic reporting sink. Existing full qualification, not rerun here.                                                                                                                                             |
| Android      | Already equivalent for this scope | Hook and HTTP failure paths contain `Throwable`; no internal diagnostic reporting channel found. Existing native and RN bridge qualification, not rerun here.                                                                                                                                       |
| Swift        | Implement                         | Bounded number of local diagnostic snapshots, but raw/unbounded reason content: D5. Focused reproduction fails; ACK controls pass independently.                                                                                                                                                    |
| React Native | Deferred dependency gap           | No independent JS diagnostic callback/channel found; native iOS uses Swift and inherits D5. Requalify the updated Swift dependency and real bridge; do not call this row complete beforehand.                                                                                                       |
| Rust         | Already equivalent for this scope | Internal worker/callback guards prevent recapture; no internal diagnostic sender found. Focused client safety and panic-observer suites pass, 14 tests. Previous native panic-hook chaining remains intentional host behaviour; abort/OOM/foreign native failures remain documented runtime limits. |

The earlier installed-artifact and full-suite results are in the
[budget audit](before-send-budget-audit.md). They do not cover these new fault
combinations and cannot replace remediation tests.

## Contract updates and compatibility requirements

The current foundations are INV-2, NFR-REL-01, NFR-PERF-01, FR-SDK-13a,
AC-SDK-13a, SEC-16/21/22/23, and the SDK testing/parity rules. AC-SDK-02 currently
says the SDK logs an internal diagnostic unconditionally, while INV-2 describes
diagnostics as optional. Resolve that mismatch as part of TODO non-priority #5.

Add an explicit shared requirement: SDK-internal failures must not initiate an
undisclosed maintainer-reporting channel or recursively enter application event
capture. Supported diagnostic output is local/operator-controlled, sanitised,
bounded in retained bytes and emission work, and failure-contained. Do not make
diagnostics mandatory or enable new output by default. Distinguish application
`diagnostic_context` evidence from SDK self-diagnostics.

Keep public APIs, installed defaults, canonical event schemas, `beforeSend`
replacement/drop/safe-original behaviour, mandatory privacy, sampling, normal
application logs, ACK/retry semantics and lifecycle ownership unchanged. Any
diagnostic throttling, omission of unsafe details or callback scheduling changes
must be documented deliberately. No new dependency, hidden network request or
replacement-worker pool is necessary. A JavaScript callback that blocks the
event loop remains a documented runtime responsibility, not something a catch
block or timer can pre-empt.

Promote the reproductions into permanent tests before fixing their owning paths.
Cover synchronous throws, rejected callback Promises, hostile error formatting,
logger feedback, failed diagnostic storage, oversized metadata and custom privacy
fields. Verify unrelated application logs still capture and protected originals
still survive failed hooks. Extend every SDK's applicable failure tests with
negative assertions on unexpected events/outbound calls, using fake transports
and fake configuration clients. Keep diagnostics optional where unsupported.

## Evidence and release disposition

Local receipts and original reproductions are retained under
`.tmp/internal-diagnostics-audit/`. `source-before.json` records repository HEADs,
dirty state and source hashes. `network-candidates.txt` and `sink-candidates.txt`
are discovery aids, not proof on their own. `source-verification.json` confirms
the audited SDK source and pre-existing work were preserved.

- Node: `node-probes-final.log`, five tests: one containment control passes,
  four new fault cases fail. `node-probes.log` is the stopped unbounded child;
  the final probe uses both a callback fuse and a SIGKILL timeout.
- Python: `python-probes.log`, three new fault cases fail.
- Go: `go-probes.log`, both new fault cases fail, including isolated host exit 2.
- Swift: `swift-probes.log`, one test fails its privacy and size assertions.
- WordPress: `wordpress-probes.log`, both raw storage and escaped sink failure
  observed with network disabled and read-only repository mounts.
- Controls: `js-safety-controls.log` (43 tests),
  `python-safety-controls.log` (117), `rust-safety-control.log` (14),
  `go-safety-control.log` and `swift-ack-controls.log` pass. These demonstrate the
  gaps were absent from existing coverage, not that the new cases are acceptable.

The temporary probe files are archived with their original destination paths in
`reproductions/manifest.json`; they are not left in ordinary test discovery.
Use their failing expectations as regression requirements, not green evidence.

Original recommendation: fix D1–D5 and the shared contract/test gap before qualifying the
next affected releases. Re-run affected full suites, coverage and installed
artifacts, plus WordPress bundling and the React Native native dependency/bridge
checks. Preserve the independent release gates and leave consumer adoption
separately authorised. Nothing was committed, pushed or published by this audit.
