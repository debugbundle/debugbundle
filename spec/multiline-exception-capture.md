# Multiline exception capture and logger evidence

Status: local investigation/implementation record, 6 November 2026. The owner
subsequently authorised the DebugBundle release train and its own dogfooding; see
[multiline-exception-release-20261106.md](multiline-exception-release-20261106.md).
Consumer-product changes and incident lifecycle mutations remain outside scope.

## Contract and acceptance

This correction implements FR-SDK-03/09/18/19a, FR-GRP-01/10, FR-EVID-01/02,
NFR-PERF-01 and NFR-REL-01, with AC-SDK-09a, AC-SDK-SAFETY-CALLER/OVERLOAD,
AC-EVID-01/02 and the synthetic regressions recorded below.

Only a recognised redirected Java stderr stream may assemble separate records.
Keep module/classloader/version prefixes, causes, suppressed exceptions, elisions,
native/unknown-source frames and circular-reference markers. Bound every retained
buffer and protect text before retention. Unmatched continuations retain bounded
sanitised evidence as context; absence of correlation must never invent a cause.
Ordinary application error logs retain their eligibility. Different request owners,
clients, logger streams and producer threads cannot share an assembly. Root headers
and ordinary messages terminate the preceding trace. No temporal cross-event
exception merge, historical fingerprint rewrite or blanket log suppression.

Where a logger still owns a native exception, use the existing exception capture
pipeline and preserve its cause graph rather than manufacturing an exception from
text. Keep native filtering, logging behaviour and capture safety. Deduplicate
automatic reports only with actual occurrence identity, never similar text/time.
Existing volume suppression is separate: suppressed totals do not claim individual
persisted incident occurrences.

## Investigation

- Maven Central metadata read on 6 November lists Java 3.1.0 as latest. The JUL
  handler and assembler are identical in tags 3.0.0, 3.0.1 and 3.1.0. New structured
  evidence in 3.1.0 does not correct the rejected frame grammar.
- WildFly creates `LoggingOutputStream(stderr, ERROR)`. JBoss stdio emits individual
  records without `LogRecord.thrown`; `printStackTrace` no longer supplies an object.
- The Java assembler and hosted classifier both restrict frame owners to
  `[\w.$/]+`, excluding `@`, `-` and other valid module/classloader metadata.
  The first rejected frame completes the wrapper and becomes an ERROR log.
- The worker fingerprints each incident signal independently. Log events use their
  canonical message and receive `Application log error`; they have no exception
  stack. Request method belongs to exception fingerprints, explaining GET/POST
  groups. Notification deduplication cannot equate those distinct frame incidents.
- The bundle copies the retained primary exception. It cannot recover a missing
  native cause graph from unrelated incident records without speculative merging.

Sources: [WildFly stdio selector](https://github.com/wildfly/wildfly-core/blob/main/logging/src/main/java/org/jboss/as/logging/stdio/LogContextStdioContextSelector.java),
[JBoss stdio](https://github.com/jboss-logging/jboss-stdio/blob/main/src/main/java/org/jboss/stdio/LoggingWriter.java),
[Java package metadata](https://repo.maven.apache.org/maven2/com/debugbundle/debugbundle-java-core/maven-metadata.xml).

## Maintained surface audit

The starting checkouts were clean. Source and latest locally retained release tags:
Node/Browser 3.2.0, Python/PHP/WordPress/Ruby/.NET 2.1.0,
Java/Go/Android/React Native 3.1.0, Swift 3.1.1. Java's latest publication is also
verified against Central; the other tag identities are not a fresh registry audit.

| Surface / supported loggers | Finding and correction | Runtime limits / adoption |
| --- | --- | --- |
| Java 3.0.0–3.1.0; JUL/JBoss, Logback | Fixed redirected stderr syntax/correlation; retained redacted orphan samples; native Logback ERROR Throwable now uses exception capture. Added native identity receipts within owned requests. Fixed HTTP-method omission in local suppression key. | Text retains a bounded cause/suppressed graph when negotiated. Foreign Logback proxies retain their supplied text in log context; no fabricated native Throwable. Upgrade the Java distribution, including agent/starter as applicable. |
| Node 3.2.0; Pino, Bunyan, Winston, console/generic logger bridges | Native Error was flattened into a generic log. Accepted error records now use exception capture, retaining log context; serializers cannot erase synchronous Error identity. Native identity receipts cover logger plus middleware within owned operations. | Native filters still run first; custom asynchronous serializers that destroy identity cannot restore it. No stderr line reader. |
| Browser 3.2.0; console, window errors, rejections | Console capture already creates breadcrumbs, not independent error incidents. Native hooks retain stack/cause/aggregate evidence through the existing bounded pipeline. No equivalent line splitting found; no source change. | Strings and opaque cross-origin errors do not reveal native causes. Independent manual and automatic reports without occurrence identity remain distinguishable events. |
| Python 2.1.0; stdlib logging, Loguru, structlog | stdlib ignored exc_info; Loguru omitted record.exception; structlog could consume exc_info during formatting. Native error records now enter exception capture with traceback/cause; transient per-call structlog clone preserves identity through formatting. Scoped receipts cover logger plus framework capture. | Python built-in exceptions cannot universally be weak-referenced: an opaque owner/operation/time receipt is stored on their native dictionary, with no SDK-held exception reference. No file/stderr line collector. |
| PHP 2.1.0; Monolog/PSR-3 | context.exception was reduced to a generic record (or rejected). Native error records use the existing exception pipeline and WeakMap identity guard once. | Existing request-scoped identity policy remains; request-end delivery is a bounded best-effort synchronous HTTP attempt, not strict zero-wait networking. |
| WordPress 2.1.0 | Uses PHP SDK hooks/Monolog and Browser breadcrumbs through its relay. No independent line parser. Tests run with the corrected PHP checkout mounted into the plugin vendor path. | Future plugin ZIP must bundle the corrected PHP version. Existing installations and production settings remain unchanged. |
| Ruby 2.1.0; stdlib/ActiveSupport Logger, SemanticLogger | stdlib stringified Exception and SemanticLogger omitted it. Native error records now preserve cause/backtrace through exception capture. Weak identity receipts are scoped to Fiber-owned operations. | Asynchronous SemanticLogger delivery preserves the Error object, but may lack original Fiber ownership; do not infer cross-thread duplication. |
| Go 3.1.0; slog, zap, zerolog | slog/standard error fields were sanitised without native cause evidence; zap serialised errors early. Preserve error/err/exception values and route them through native exception capture. | zerolog's serialized JSON has already lost native identity and intrinsic throw location. Its whole record remains a log, not frame incidents. Arbitrary named error fields and multiple native errors in one record are not inferred into a fabricated graph. No maintained logrus adapter. Go stack is capture origin unless supplied natively by an error implementation. |
| .NET 2.1.0; Serilog, NLog, log4net, Microsoft.Extensions.Logging | First three emitted both CaptureException and CaptureLog for one native record. Emit one exception with log context. MEL error records now use the native cause/aggregate pipeline, retaining deferred formatters and weak exception projection. Owned-operation receipts cover logger/framework duplication. | Existing custom IDebugBundleClient implementations remain compatible. Native warnings in Serilog/NLog/log4net retain their pre-existing exception semantics; MEL warning/info remain logs. |
| Android 3.1.0; Timber | Throwable in log context previously retained only outer details. Error/fatal records now use existing native cause/suppressed exception capture. | No stderr line reader. Fatal next-launch journal and canonical external-envelope paths remain separate; arbitrary independently repeated Throwable reports lack an occurrence token. |
| Swift 3.1.1; SwiftLog | Native LogEvent Error in supported compiler/API path now uses native exception capture, including NSError underlying errors. | Older SwiftLog APIs expose metadata only. Swift Error values have no universal stable identity, cause chain or throw stack; do not invent them. Native SPM and CocoaPods/RN qualification remains a separate release gate. |
| React Native 3.1.0; console, ErrorUtils, rejections, native bridges | console.error(Error) was flattened. Preserve native JS cause evidence and avoid synchronous console echo of the exact object from the previous ErrorUtils handler. | Canonical JS envelopes already pass through Android/iOS bridges without native recapture. Legacy fallback bridges cannot reconstruct original JS causes. Stringified echoes cannot establish occurrence identity. |

## Complete data path and loss boundaries

1. `Throwable.printStackTrace(PrintStream)` emits wrapper, frames, causes, suppressed
   branches and elisions. WildFly's stderr selector uses JBoss stdio and LogManager;
   records retain producer thread/logger metadata but no `Throwable` object.
2. `DebugBundleJulHandler` snapshots logger/MDC/request context. The assembler keys
   by SDK client, producer thread, recognised stderr logger and live request owner.
   The old frame grammar rejected legal deployment/module/version prefixes, flushed
   the wrapper and forwarded useful frames to `captureLog(ERROR)`.
3. SDK privacy runs before retaining text/context and again in the existing protected
   delivery pipeline. Native exception graphs use existing negotiated evidence and
   queue admission. The Java first-three suppression window formerly conflated GET
   and POST; including method now matches the hosted grouping dimension.
4. `apps/api/src/routes/ingestion.ts` and `packages/storage/src/ingestion-services.ts`
   validate/redact, persist raw events and enqueue normalization. They do not assemble
   arbitrary nearby events. Event-ID idempotence handles transport retries; different
   SDK event IDs are not proof of separate or identical application occurrences.
5. `apps/worker/src/processor-normalize.ts` uses event-normalizer classification and
   fingerprints. Its matching defective JVM grammar promoted prefixed frames to
   incident signals. The fix retains them as context signals, scoped to Java stderr.
   `processor-group.ts` rejects context-only incident work before occurrence counting,
   bundle lifecycle publishing and alert evaluation. Full exception HTTP method stays
   part of the fingerprint: two GET/POST groups are expected and remain separate.
6. `packages/bundle-engine/src/error-context.ts` retains the primary stack and optional
   native graph. It can parse retained frames; it cannot recover lost native causes
   from unrelated historical incidents. Primary synthetic artifacts now contain the
   NPE and application throwing location. No schema or fingerprint algorithm changes.
7. `processor-group.ts` emits first-occurrence lifecycle work and severity evaluations;
   `processor-alerts.ts` and notification delivery/group stores apply existing rule,
   cooldown, coalescing, idempotence and retry policy. Preventing frame incidents stops
   amplification at its source. Evaluation counts are not actual sent-message counts.

## Safety and ambiguity boundaries

- Java assemblies: at most 128 active + 128 ready, 128 lines / 32,768 characters each,
  20-second idle and 45-second absolute expiry. Ready pressure falls back to bounded
  queue admission, never transport on the logger caller. Published immutable snapshots
  avoid waiting on an append lock. Drain requests coalesce instead of queueing without
  bound; close drains then releases orphan client references.
- Orphans: at most 128 clients, 16 redacted samples of at most 1,024 characters per client, with total
  unmatched/truncation metadata, emitted at most once per minute or forced drain.
  Summaries retain their original ERROR admission level and carry the explicit
  `java_stack_continuation_context` marker. The worker validates their bounded shape
  and classifies them as context. This preserves evidence under minimal/error-only
  hosted policy. Count and samples drain atomically; retired buckets release client
  references, and racing lines fall back to protected continuation capture.
  Capacity, disabled
  capture, sampling and transport outage can still lose telemetry under the existing
  bounded delivery contract. No implementation promises unlimited complete traces.
- Separate native objects, requests, threads and streams are not merged by text or
  proximity. The new cross-adapter receipts use actual native identity plus an owned
  operation, bounded to 128 weak entries/30 seconds where applicable. Expiry is a
  memory bound, not a textual similarity rule. Only one opposite-path report can
  consume an accepted receipt; repeated native logger records remain separate.
  Receipts are recorded only after queue admission. Deferred beforeSend hooks disable
  cross-call pairing because acceptance is uncertain; deferred .NET sampling does too.
  Explicit repeated captures retain existing volume suppression semantics. PHP keeps
  its existing request WeakMap policy, but removes rejected receipts while retaining
  its synchronous reentrancy guard. Concurrent uncertainty preserves evidence.
- When multiple traces are interleaved *inside the same producer identity* without
  request ownership, no line stream can prove attribution. A new root ends the prior
  assembly; unsupported/unmatched material stays separate context where capacity and
  policy permit. Asynchronous work without propagated ownership cannot be guessed.
- Native exception plus separately stringified printStackTrace/log output has no common
  occurrence identity. Such cross-channel duplicates, arbitrary multi-adapter wrappers
  and rethrowing the very same object within one operation cannot be perfectly resolved.
  No broad stderr/error-log suppression or temporal cross-incident merging was added.
- Request telemetry is contextual by default. Explicit HTTP anomaly triggers remain
  independent contractually meaningful signals; this change does not hide genuine
  request failures or rewrite their incident identity.
- Redaction remains at capture, retained-buffer and final transmission boundaries.
  All new fixtures are synthetic. No customer traces, identifiers or production queries
  are required for reproduction.

## Initial implementation verification (local, 6 November 2026)

This ledger records the implementation pass. The linked final audit below adds
regressions, runtime lanes and installed-artifact checks, with updated suite counts.

| Boundary | Result |
| --- | --- |
| Released Java reproduction | `make test-stderr-released` runs the same synthetic real JBoss stdio regression against immutable v3.0.0, v3.0.1 and v3.1.0 archives. All three fail the coherent-six-event assertion (test failures, no compile errors). Latest Central publication is 3.1.0; upgrading to it alone does not fix this defect. |
| Corrected Java | `make verify`: 213 tests across all eight modules, compilation/package/Javadoc and per-file coverage gates pass on JDK 21. The real redirected-stderr regression produces six complete exception events; additional cases cover scoped duplicates, independent threads/requests, expiry/orphans, ERROR-only thresholds, redaction, native/proxy frames, suppressed/circular/elided text, graph bounds, full buffers and blocked/503 transport. |
| Shared hosted processing | 195 existing normalizer/bundle/worker tests plus 53 alert/pipeline tests pass. New pipeline fixture stores all 114 synthetic records, creates only two groups of three, emits two new-incident and six severity evaluations, and no frame work. Primary artifact retains NPE and Service.java:42. Final focused rerun 25/25; root TypeScript, changed-file ESLint/Prettier pass. Storage/queues are test doubles here; no live notification delivery is claimed. |
| Node / Browser | `make check`: 606 tests, per-file coverage, ESLint, TypeScript, build and packed-install Node/Browser delivery/privacy checks pass. Real Pino/Bunyan/Winston records plus hostile getters/proxies and scoped duplicate tests included. |
| Python | `make check-docker`: 401 tests; Ruff, mypy, coverage and wheel/sdist build pass, including real stdlib/Loguru/structlog exceptions and consumed exc_info. |
| PHP / WordPress | PHP 209 tests / 3,504 assertions and PHPStan pass. WordPress 93 tests / 461 assertions and PHPStan pass with corrected PHP checkout mounted read-only into vendor path. |
| Ruby | 335 examples; RuboCop, coverage and gem build pass. Stdlib, ActiveSupport filtering and SemanticLogger native cause tests included. |
| Go | Full module tests, per-file coverage and go vet pass; native generic fields and actual zap error records covered, alongside existing slog/zerolog and transport safety suites. |
| .NET | 192 tests across eight test projects, restore/build and netstandard2.0 compatibility pass. All four logger adapters and deferred hostile formatter/getter safety covered. |
| Android | Full Gradle test/coverage/metadata verification passes (74 executable source files meet coverage). Final changed logging tests pass again after error/warning routing correction; Timber/coroutine/fatal/external-envelope suites remain covered by full run. |
| Swift | 166 native tests and per-file coverage pass (47 executable files). Final five native logger/cause tests pass after confirming warning context remains a log under balanced policy. |
| React Native | 128 tests, per-file coverage, TypeScript and build pass, including canonical/legacy bridge safety and exact-object ErrorUtils console echo. |

Tests initially caught the original hosted frame classification, Java fragmentation,
Python/Ruby/Go lost native evidence and PHP missing capture. New .NET safety tests
also caught a lost deferred formatter during the correction; projection now preserves
log_message without replacing the exception message. Heavily concurrent local checks
caused RN timeouts and a PHP local-HTTP deadline failure; unchanged tests pass on rerun.
No test expectation was weakened to hide those timing failures.

The final local audit and expanded runtime/artifact results are recorded in
[multiline-exception-release-audit-20261106.md](multiline-exception-release-audit-20261106.md).
No consumer application, production ingestion/database, notification provider or
physical device was changed or exercised. JBoss's real redirected stream is exercised
in the synthetic JVM regression. Local Swift simulator and clean source-artifact
consumers are distinct from final published-native mobile qualification.

## Release and compatibility guidance

Prepare separate Java/affected SDK distributions and core ingestion releases.
Release the hosted classifier before the Java SDK: the new ERROR-level orphan
summary marker requires the updated classifier to remain context-only. Hosted
classification can protect old Java installs from future frame incidents;
complete source assembly and native logger evidence require the corrected SDK.
Historical incidents/artifacts stay unchanged. No consumer upgrade is performed.
Public method signatures, Bundle v1 and existing incident fingerprints stay
compatible; newly complete capture inputs can naturally produce a different future
fingerprint. Existing exact capture rules should be reviewed during adoption.


Release preparation should deploy the compatible shared classifier before asking
operators to upgrade SDKs, then publish independently qualified SDK patches. There
are no version bumps, commits, pushes or publications in this working change.
Rebuild WordPress with the fixed PHP artifact; qualify React Native with its declared
native dependency floors. Read `cocoapods-trunk-transition.md` and refresh the official
provider schedule before Swift/RN release preparation; the existing RN test-only SPM
manifest is not production installation support. Existing installations keep working.

Pre-ship review: all changes are capture adapters, bounded SDK helpers, one shared
classifier predicate, tests and documentation. No DB shape, routes, credentials,
access rules or infrastructure changed. Source APIs remain backward compatible;
future exception event types/titles and naturally derived fingerprints can change
for newly complete log captures. Uncertain identity, saturation, runtime metadata and
release-only verification limitations are explicitly retained above.
