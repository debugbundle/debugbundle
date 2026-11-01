# Bundle evidence quality

Status: accepted implementation contract; candidate work, not a released capability.
Established: 25 October 2026.

This specification promotes the evidence-quality proposal into the tracked source
of truth. Requirements FR-EVID-01–09 and acceptance AC-EVID-01–09 supplement existing
SDK safety, Bundle v1, privacy, grouping, policy and metering contracts. The local
execution ledger records progress and qualifications. An implementation of a schema
does not establish receiver, SDK, relay, packaged-artifact or device support.

## Compatibility and ownership

Shared schemas and language-neutral fixtures belong to `packages/shared-types`
and `tests/fixtures/evidence/`. Capture belongs to the maintained SDK repositories;
WordPress inherits PHP/browser implementations and React Native preserves JS
identity through both native bridges. Core redaction, normalisation, storage and
bundle interpretation must agree before producers emit additions.

Retain outer exception name/message/stack, existing capture signatures and return
types, Bundle v1 field types, titles, fingerprints and capture-rule inputs. New
frames never enter fingerprint normalisation. `top_frames` remains an array of
strings. No historical rewrite, incident merge, automatic resolution, new probe
entitlement, analytics dependency or consumer adoption is authorised here.

## FR-EVID-01: Structured exception evidence

The optional `payload.exception_evidence` and `context.error.exception_evidence`
blocks use the same `ExceptionEvidenceV1` shape:

- `version: 1`; `runtime`: `node`, `browser`, `python`, `php`, `jvm`, `go`,
  `ruby`, `dotnet`, `android`, `swift`, `react_native` or `unknown`.
- `root_id`: integer node ID; `nodes`: at most eight nodes, including the outer
  error, with unique IDs from zero through seven. Every node is reachable from
  the root; relationships form an acyclic graph, not necessarily a chain.
- Each node has `id`, `name`, `message`, `stack` (sanitised string or null),
  `trace_origin`, `parsing_status`, `frames` and `relationships`.
- Origins: `throw`, `native_fatal`, `capture`, `runtime_reported`, `unavailable`,
  `unknown`. Capture-time traces must never be labelled throw-site traces.
- Parsing states: `parsed`, `partial`, `unparsed`, `unavailable`, `truncated`.
  Unknown text stays in `stack`; a parser must not silently discard it. An absent
  stack is null, with no fabricated application location.
- Frames have nullable `function`, `file`, `line` and `column`, plus
  `classification`: `application`, `framework`, `sdk`, `unknown`. Line coordinates
  are positive, columns nonnegative. Unsupported coordinates stay null.
- Relationships have `kind`: `cause`, `context`, `aggregate`, `suppressed`, and
  `target_id`. At most one causal (`cause` or `context`) edge per node, five total
  outgoing edges, and four edges along any root-to-node path. Shared children are
  allowed; repeated identical edges and cycles are invalid.
- `truncated` is boolean; `unavailable_reason` is null or `unknown`, `unsupported`,
  `unsafe`, `budget_exceeded`. Collection limitations must remain visible.

Additional JSON evidence is at most 32 KiB of UTF-8 including structural overhead.
Semantic byte limits use compact canonical JSON with literal UTF-8, unescaped
forward slashes and the required control/quote escapes, matching `JSON.stringify`.
Each added message is at most 2 KiB, name/function 256 bytes, file 2 KiB, node stack
16 KiB and each node 32 frames. Count UTF-8, not UTF-16 code units. Existing
event/queue/capture-time budgets take precedence. Drop or truncate added evidence
before losing an otherwise admissible original exception. Boundary validators
reject malformed additions; producer builders must fall back to the legacy error.

Each emitted ingestion/relay request stays within the existing 256 KiB body
ceiling, including its compact wrapper and actual UTF-8 serializer output.
`batchSize` is an event-count ceiling; senders split finalized events by bytes as
well and preserve chunk-local ACK indices, retries and ownership. Optional
evidence shrinks before an otherwise admissible original exception is lost to
the wire limit. If a valid hook replacement still cannot fit, withhold it without
restoring pre-hook content or undoing application redaction. Invalid/throwing hooks
retain the established safe-original fallback. Native file paths retain their established admissible-event/ownership
semantics independently of HTTP limits. Custom transports retain their payload
shape; no additional discovery traffic is introduced. Relay forwarding accounts
for final server metadata, keeps a bounded whole-batch deadline, and marks a spool
delivered only after complete canonical acceptance of every downstream chunk.

These schemas validate already normalised JSON. They do not make arbitrary native
objects/getters safe and do not replace mandatory redaction before retention,
after hooks, before server storage and at egress.

## FR-EVID-02: Useful locations and accurate origins

Bundle interpretation is a pure bounded language-aware parser, independent of the
fingerprint parser. Cover V8, WebKit/Gecko, PHP, JVM/Android, Python, Ruby, .NET,
Go and available native crash formats. Parsing order follows the actual runtime
format; retain original sanitised text and partial/unavailable results. Skip known
SDK capture frames when selecting an application location. Unknown/minified
ownership remains unknown. Never perform source lookup, network symbolication,
frame-local inspection or argument capture.

## FR-EVID-03: Causes and execution context

Use native safe accessors and bounded built-in containers; never traverse an
arbitrary getter, formatter, iterator or overridable unwrap routine simply because
exceptions can be caught. Do not retain the original error for deferred traversal.
Preserve Python explicit cause and unsuppressed implicit context, group children
only on runtimes that support them, JVM suppressed errors, .NET aggregates, Ruby
causes and safe NSError underlying errors. Go errors and Swift Error do not imply
a throw-site stack or universal safe cause accessor. Report unsafe custom graphs
as unavailable. Preserve existing textual cause evidence without duplication.

PHP shutdown records fatal file/line separately from constructed capture traces.
PHP 8.5 may supply `error_get_last()['trace']`; consume only supplied safe frames,
without arguments/objects or enabling the runtime setting. Older PHP retains its
file/line fallback. Qualify patched supported runtime lanes before native fatal
tests. Hard kill/OOM capture remains best effort. Crash paths use at most two
nodes, eight frames per node and 4 KiB additional evidence, without user hooks.

The optional `payload.execution` block is `{version: 1, kind, name, elapsed_ms,
limit_ms}`. `kind` is `request`, `command`, `job` or `unknown`; `name` is a
sanitised technical route/command/job label (128 bytes) or null. Numeric fields
are finite nonnegative numbers or null. Limit is configured duration, never time
remaining; uptime is not operation duration. Backend integrations own operation
start/cleanup and concurrent/thread/task/fork isolation. Reuse existing hooks;
application phases remain probes. No new framework dependency is required.

## FR-EVID-04: Passive browser observations

Use nonempty `currentSrc` for supported media, then `src`/`href`. This corrects
future resource identities without changing the resource fingerprint algorithm
or historical incidents; verify exact-resource rules against the selected URL.

`payload.resource_observations` is optional on frontend exceptions. Its versioned
block contains `version: 1` and at most five `items`. An item is one of:

- `timing`: `observed_at`, sanitised `source_url`, `availability` (`observed`,
  `unsupported`, `no_match`, `withheld`, `ambiguous`, `unknown`), nullable
  `response_status` (100–599), `duration_ms`, `transfer_size_bytes`. Zero status
  becomes null with an appropriate unavailable observation, never success/failure.
- `csp`: `observed_at`, sanitised nullable `source_url`, bounded technical
  `effective_directive` (64 bytes), `disposition` (`enforce` or `report`), nullable
  `document_status_code`. That status is not the failed resource's HTTP status.

Pending observations: at most 20 entries, 32 KiB and 30 seconds per page. No full
policy, referrer, inline sample, script text, raw DOM node retention, unbounded
performance-buffer scan, extra request, buffer resize/clear or policy mutation.
Match only unambiguous identity/time evidence; redaction collisions, concurrent
identical URLs and redirects may remain uncorrelated. Report-only is not a block;
coincidence is not causation. Preserve capture-time lifecycle/device evidence.
Timing-Allow-Origin and HTTP-status exposure are separate browser restrictions.

## FR-EVID-05: Explicit recovery and late context

Add language-idiomatic `captureRecovery(observation) → void`. Existing capture
context may supply `failureRef` and `evidenceScope`; no existing return type changes.
Wire `context.evidence_reference` is `{version: 1, failure_ref, scope}`. All new
references are opaque fresh UUID v4 values, never user IDs, URLs or resource IDs.
Scope is `{kind: 'page', page_id}` or `{kind: 'operation', operation_id}`. Page
observations also require the same nonempty envelope `correlation.session_id`;
operation observations require the same operation ID, and trace IDs must agree
when present on either side. No cross-service join is introduced.

The historical open `context` contract remains intact. A same-named legacy custom
value does not invalidate an original exception or log. Only a value that passes
`EvidenceReferenceSchema`, including its scope/session requirements at association,
can participate in typed correlation. Standalone `diagnostic_context` references
remain strictly validated by their closed payload schema.

The new closed event type `diagnostic_context` is always `context_signal` and
accepts exactly two versioned payload variants:

- `{version: 1, kind: 'resource_observation', failure_ref, scope, source_event_id,
observations}` where observations uses the resource block above. At most one
  coalesced late resource event per failure within 30 seconds; never delay error
  delivery or teardown awaiting observations.
- `{version: 1, kind: 'recovery', failure_ref, scope, attempt_id, state,
operation?, status_code?, duration_ms?}`. `state` is `attempt_started`,
  `attempt_completed`, `attempt_failed`, `recovery_observed`, `failure_persisted`;
  operation is an optional sanitised technical label (64 bytes), status is 100–599
  and duration finite/nonnegative. No arbitrary diagnostic data extension.

Only explicit semantic `recovery_observed` establishes observed application
recovery. HTTP completion, resource load, or a missing terminal event does not.
Missing outcomes derive unknown; conflicting outcomes remain conflicting.
Endpoint-name recognition remains separately labelled legacy heuristic evidence.

Scope each association by project, service, environment, failure reference and
scope. Deduplicate event IDs; evaluate event time, independent of arrival order,
with observations at/after failure and at most five minutes later. Context may
arrive before the failure. At initial admission, new diagnostic context more than
60 seconds ahead of its first `received_at` is ineligible. Evidence-only ingestion
claims first receipt and a hash of the protected canonical payload before time
admission, even when that first submission is rejected as future context. A
changed protected payload under the same evidence event identity is rejected;
ordinary events add no receipt query. Available payload hashes are checked when
loading retained context, with the existing legacy/custom-reader fallback retained.
Receipt time is an
explicit input persisted once by ingestion/local processing; replay and rebuild
must not refresh it. This new check does not change legacy event acceptance.
Bound five attempts/20 observations per failure, 50 pending
failures/64 KiB per SDK instance. Expiry/drop/absent retained failure means unknown.
Context cannot open, regress, resolve, notify or dispatch an incident by itself.

Capture is opt-in and uses existing bounded queues/offline/lifecycle transport,
below original-error priority. The existing resolved capture policy controls it:
minimal disables independent diagnostics; balanced/investigative allow them only
when explicitly enabled locally. Explicit disable, consent, session sampling,
server rules, rate limits and quotas still apply. No log-threshold bypass or probe
activation is involved. Free excludes context from its primary allowance; paid
plans count it under existing INV-15. No exemption or entitlement change.

The candidate local options are `captureRecoveryObservations` (default false),
`captureResourceDiagnostics` and `captureExceptionEvidence` (default true only
after verified capability support). Language-idiomatic spellings are permitted.
The server policy gains nullable override `capture_diagnostic_context`; resolved
defaults are false for minimal and true for balanced/investigative. This flag
never promotes context or bypasses the producer's explicit recovery opt-in.

## FR-EVID-06: Delivery-path capabilities

Opt-in discovery header `X-DebugBundle-Evidence: 1` or query parameter
`debugbundle_evidence=1` requests the optional
`evidence_capabilities` field on existing SDK config/ingestion acknowledgements.
Without either opt-in retain legacy response shapes. Browser SDKs use the query
option on existing requests so an old receiver does not face a new custom-header
preflight requirement. Descriptor is strictly
`{version: 1, features: [...]}`, with unique values from `exception_evidence_v1`,
`resource_observations_v1`, `recovery_v1`, `evidence_provenance_v1` (at most four).
Unknown/malformed versions/features fail closed to no capability. Canonical
intersection follows that feature order and is limited to eight delivery hops.

Only advertise complete-path support. A relay intersects its own support with
verified downstream support; an upgraded relay cannot advertise an old server's
missing capability. A native bridge intersects JS, native storage and downstream
acceptance. Keep independent per-destination state; no global optimistic cache.
Use existing config refresh/piggyback lifecycle, no capture-time request, browser
poll, new auth scope or required service. The descriptor is support evidence,
never permission to bypass policy or redaction.

An explicit `evidenceCapabilities` installation option may pin a verified complete
path, including local-file CLI and short-lived PHP/offline setups. Absent proof,
emit legacy errors and disable new standalone context. A negotiated downgrade
removes optional additions from pending errors and drops unsupported context;
never sacrifice the original error or claim delivery. Existing ACK/retry semantics
remain authoritative. Deploy accepting readers/ingestion/relays before producers;
keep accepting readers during rollback while new producers remain installed.

## FR-EVID-07: Correlation storage

Extend the existing recovery metadata path with a separate additive
`evidence_context_events` index (do not alter historical recovery constraints).
Columns: event ID (UUID primary key), project FK/cascade, service, environment,
kind (`failure`, `resource_observation`, `recovery`), occurred-at, first received-at, failure hash,
scope kind, scope hash, nullable session/trace/attempt hashes and expiry. Store
only project-domain-separated SHA-256 references; raw evidence stays in object
storage under existing retention. Index scope/event time and expiry. Expiry is
no later than seven days or raw retention, whichever is shorter.

Ordered forward migration and checksum/ledger, predecessor-upgrade tests,
readiness refusal and migration-before-activation are required before this table
is consumed. Empty bootstrap mirrors the shape only. No backfill/deletion.
Ordered correlation locks plus transactional durable rebuild intents cover both
arrival orders and sampled failures. Context-only processing cannot invoke incident
lifecycle services. Local CLI uses the same pure association rules. Retention
removes expired references; retry and replay do not duplicate associations/jobs.

## FR-EVID-08: Provenance and readers

Optional `context.evidence` contains `version: 1`, `primary_event_id`,
`retained_event_count`, `retained_first_at`, `retained_last_at` and bounded
`observations` (at most 20), each with `source_event_id`, `occurred_at`, `kind`
and `availability`. Kind is `exception`, `resource_observation`, `recovery`,
`probe`; availability is `observed`, `unknown`, `unsupported`, `truncated`,
`not_retained`. Specific absence reasons require actual capability/retention
evidence. Counts/ranges describe retained inputs, not all incident occurrences.

Keep `captured_at`/`signal.signal_id` tied to the primary occurrence, incident
first/last times tied to occurrence history, and metadata times tied to artifact
generation. Sort derived observations by capture time then event ID; selection
never attaches another occurrence's runtime/device/stack as primary evidence.
Both typed and legacy recovery rebuilds retain the primary failure identity and
capture time; the context event remains the rebuild's idempotency identity only.
Regeneration cannot recreate measurements. Shared interpretation separates facts,
possible causes, importance and deterministic next-evidence guidance. Ordinary
API/CLI/MCP/dashboard facts agree. Restricted OpenAI projections require their
existing allowlist review and expose no raw causes, correlation IDs or payloads.
UI implementation still requires explicit design-system approval.

## FR-EVID-09: Probe truth and qualification

Instrumentation supplies labels/data; activation enables matching existing code.
Document safe media/auth/job/cache checkpoint recipes without identifiers or
heap/locals promises. Empty retained probe data proves no matching retained
observations, not activation delivery, instance coverage or absence of labels.
No new inventory/heartbeat service. Evaluate all twelve maintained surfaces and
all their relays/wrappers/bridges under `rules/sdk-capability-parity.md`.

## Acceptance

| ID         | Executable obligation before capability activation                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-EVID-01 | Strict closed exception graph; UTF-8 per-field/whole-block boundaries; missing/duplicate/unreachable IDs, cycles, duplicate edges, depth/width/frames rejected; malformed additions never discard an otherwise admissible producer error.                                              |
| AC-EVID-02 | Real-format synthetic stack corpus covers all runtimes, partial/unknown/native cases, correct origin/location and original text; exact old fingerprint hashes/rule matches remain unchanged; deterministic reordered/replayed input.                                                   |
| AC-EVID-03 | Native cause/group/suppression semantics and PHP old/native fatal paths; hostile accessors/formatters/cycles cannot escape or stall capture; no arguments/locals; concurrent/task/fork operation cleanup; both RN bridges and real WP ZIP.                                             |
| AC-EVID-04 | Selected media source, empty fallback/mutation/late callback, observed 404, status zero/unknown, unsupported/no-match, enforced/report-only CSP, ambiguous matches, bounded buffers and detached listeners; no extra request.                                                          |
| AC-EVID-05 | Independent delivery, each recovery state, HTTP 200 plus persistent image failure, client-only semantic recovery, missing/conflicting/concurrent outcomes, unrelated scopes, expired/future/replayed/out-of-order events and missing original; context never changes lifecycle/alerts. |
| AC-EVID-06 | Absent/invalid/unknown descriptors disable emission; complete-path intersection in both relay upgrade orders, offline/local explicit pin, downgrade with queued new events, all native bridges; old response shapes/ACK/retry/policy preserved.                                        |
| AC-EVID-07 | Disposable real-storage predecessor migration, missing-migration readiness refusal, migration-before-runtime, atomic replay-safe rebuilds in both arrival orders, raw/index retention and no bootstrap upgrade.                                                                        |
| AC-EVID-08 | Permutation-stable provenance, correct primary/ranges/generation age, honest absence, legacy bundle reads, ordinary reader equivalence and restricted-output negative privacy fixtures.                                                                                                |
| AC-EVID-09 | All SDK capability cells have implementation/equivalence/runtime evidence, packaged install/framework/device gates and performance comparison; accurate probe recipes/empty states; existing transport/privacy/suppression/policy/priority/offline/shutdown regressions pass.          |

Runtime references: [PHP native fatal trace availability](https://www.php.net/manual/en/function.error-get-last.php),
[Python cause/context semantics](https://docs.python.org/3/library/exceptions.html#exception-context),
[Go unwrap conventions](https://pkg.go.dev/errors#Unwrap). These define available
runtime evidence, not proof of SDK implementation or installed qualification.
