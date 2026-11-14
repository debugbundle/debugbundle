# Rust SDK qualification and source baseline

## Stable 1.0.0 - published 14 November 2026

Stable source `a522d78385f3a4ae332dab330399625b15e26fa9` and tag `v1.0.0`
pass all eight [qualification jobs](https://github.com/debugbundle/debugbundle-rust/actions/runs/43576997485).
[Trusted publication](https://github.com/debugbundle/debugbundle-rust/actions/runs/43581543389)
passes exact public metadata/index/download checks and genuine registry-installed
standalone, Axum and Actix applications. The immutable crate SHA-256 is
`d5f346aeedaa8d71b6aa74a24ac2a875baabdb93c6a4349a62a3056a00d08524`.
[crates.io](https://crates.io/crates/debugbundle/1.0.0) and the independent
[GitHub release](https://github.com/debugbundle/debugbundle-rust/releases/tag/v1.0.0)
are public. SDK runtime code is unchanged from the audited alpha. Rust is now
recorded in the core release train; the core gate verifies the selected public
archive without republishing it. Core/site deployment remains a separate gate.

## Historical alpha qualification and implementation

Status: Rust source and exact-artifact audit qualified; `1.0.0-alpha.1` published,
14 November 2026. [Audit findings and evidence](rust-sdk-audit.md). Companion
to the [Rust implementation plan](rust-sdk.md) and dated
[implementation receipts](rust-sdk-progress.md). Preparation baselines below are
historical inputs; final source/native/artifact receipts and the separate release
gates are recorded in the implementation record and [publication record](rust-sdk-release.md).
The published alpha matches the qualified archive and passes genuine crates.io consumers.

## 1. Inspected baseline and provenance

Core source: `f90bd82b61e46b8ee1dd58a0e621e1d0a7cb82f0`, with existing local changes.
Read current working-tree rules/contracts/specs; preserve the unrelated changes.
The root overview and older language plans contain historical release/candidate
paragraphs. The source/changelog identities below take precedence for learning
what was implemented locally; publication still needs independent registry proof.

| Maintained surface | Inspected repository HEAD                  | Current local changelog line |
| ------------------ | ------------------------------------------ | ---------------------------- |
| Node / Browser     | `a79262fbdd3d5036026bf81e041af6ea8e1e022b` | 3.2.2                        |
| Python             | `be49fdaa08825ebf2ba7b8be53e9877bb076ae7f` | 2.1.2                        |
| PHP                | `7a9dec787a2703c50108d6f8a30067ed547f8c04` | 2.1.2                        |
| WordPress          | `311c4a30c0fec4716664a71d286ddfa4982378f6` | 2.1.2                        |
| Java               | `a116d4e1a0f398c0437f5c03ebc35404f6fde42a` | 3.1.2                        |
| Go                 | `27186b440a853e025357e81a8d1dec5d17d4bb58` | 3.1.2 (`/v3`)                |
| Ruby               | `f28a85befdbcbce3889d744716fe2d7b55f37988` | 2.1.2                        |
| .NET               | `7cfb99740592b0f87fb86079ac9f62e14cb8c257` | 2.1.2                        |
| Android            | `66ae4dd7fbea7288cfbed5441b4fc916767181da` | 3.1.2                        |
| Swift              | `3f2c764edee5470ee563ea18baddb3181606bd7e` | 3.1.3                        |
| React Native       | `9ce7925280aee6adbca6d1ccca279272aaf58d3f` | 3.1.2                        |

The shared privacy fixture currently has 27 cases. Vendor exact fixture bytes and
SHA-256 checksums with source revision, not a copied case count. Sync again at
implementation and release; an additional future fixture is not optional because
this document said 27. Record the core worktree diff/hash when consuming fixtures
from an uncommitted tree, so HEAD alone is not misleading provenance.

Preparation-time fixture SHA-256 values (refresh rather than pinning stale data):

| Core fixture                                         | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/fixtures/privacy-conformance.json`            | `f428a555e5163f80e4ed627edff12ab264a05e289b62d7b15fd4f454c8c0f6ee` |
| `tests/fixtures/relay-compliance.json`               | `fd29542a49ac44d531a577cbf5dd93cf145836a5d828341a22d5d0bb37b20c49` |
| `tests/fixtures/evidence/event-envelope.schema.json` | `41202613c05efdef754ffe3f6c3ac149c75cb445c0047a5cb2332acb164a7922` |
| `tests/fixtures/evidence/evidence-wire-cases.json`   | `c47b4fbd41fb992e0c7fa17a8335f75671672c54497ae849f06f8ae46aede890` |
| `tests/fixtures/evidence/stack-formats.json`         | `d473397ee553260d5c3a60b1e86faf512f38196f30882d6b9e6eb076e223c2b9` |

### Lessons to carry, with owning implementation

Paths below are relative to this workspace; companion repositories are separate
Git repositories, not core source files to vendor wholesale.

| Latest lesson                             | Inspect / port behaviour from                                                                        | Required Rust proof                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cheap rejection and bounded caller work   | Go `capture_events.go`, `capture_safety_test.go`, `MIGRATION-3.0.md`                                 | Filtered/full queue executes no formatter, hook, producer, disk or network work                       |
| One owner through capture, send and flush | Go HTTP/delivery implementation and `http_acknowledgement_test.go`; changelog 3.0.1                  | Sender releases ownership before flush completion; no double release, resend or hidden tail           |
| Actual byte packing after hook            | Go `internal/evidence/wire.go`, `evidence_delivery_test.go`; .NET `EvidenceWire.cs`                  | Unicode/wrapper boundary, valid replacement cannot revert, chunks share one deadline                  |
| Safe native evidence / honest provenance  | Go `exception_evidence.go`, `panic_evidence_test.go`; .NET `ExceptionEvidence.cs`                    | Rust uses safe snapshots; borrowed/unsafe graph is unavailable; no invented throw stack               |
| Revocable operations                      | Go `operation_context.go`, `operation_context_test.go`; .NET `OperationContext.cs`                   | Nested/task cancellation, stale handles, descendant revocation, actual elapsed duration               |
| Proof downgrade and pending ownership     | Go `internal/evidence/capabilities.go`, `evidence_delivery_test.go`; .NET `EvidenceDeliveryState.cs` | Unknown/revoked/credential-switched proof cannot send unsupported additions                           |
| Relay end-to-end bounds                   | Go `relay/evidence_test.go`, `relay/relay_compliance_test.go`                                        | Final server bytes, all chunks accepted before delivered marker, private metadata integrity           |
| Native error logs are exceptions once     | [November correction](../multiline-exception-capture.md), Go 3.1.1 and .NET 2.1.1 changelogs         | Protected snapshot survives logger path; exact occurrence pairing only after admission                |
| No speculative multiline merge            | Java correction and [acceptance](../acceptance.md) AC-SDK-09a / AC-SDK-MULTILINE                     | Plain Rust logs remain logs, no string/time heuristic coalescing                                      |
| Mandatory newest credential protection    | [Credential spec](../business-credential-redaction.md), current Go/.NET privacy implementations      | Entire current corpus including three invitation/ownership prefixes, before retention and after hooks |
| Cost evidence alongside correctness       | Go `evidence_benchmark_test.go`, `Makefile` evidence-performance target                              | Comparable disabled/enabled capture cost, real pressure, peak queue/ledger/worker bounds              |

Go's bounded renderer is not permission to traverse arbitrary Rust `Error` methods.
The explicit FR-EVID-03 safety rule governs Rust's snapshot design. Likewise, the
Java-only stderr assembler is a runtime-specific fix, not a new cross-SDK default.

The audit refreshed every maintained SDK repository identity on 13 November: all
eleven checkouts remain clean at the HEADs listed above. Shared privacy, relay,
event schema, wire and stack fixtures are byte-identical to the current Core
working tree. New fixes concern Rust-owned graph composition, a public Rust
privacy helper and reqwest feature unification; no other producer or consumer
product was changed. Exact native/artifact evidence is tracked in the audit.

The final persistence correction applies to Rust's single callback lane and its
client-owned automatic replay worker, shared by both Axum and Actix factories.
Go `relay/relay.go` and .NET `DebugBundleRelayHandler.Delivery.cs` retain their
existing direct forwarding/marker paths and do not use this Rust queue. Other
server relays use their own existing delivery engines; Browser and mobile/native
client producers do not host this Rust spool. The cross-surface inventory below
remains applicable; no existing SDK implementation or consumer was changed.

The native logging fast-path correction is also Rust-specific: it separates the
no-sink admission check from Rust record construction and its recursion guard.
The existing universal cheap-filter and application-sink composition requirements
are unchanged. Log-only/tracing-only tests, disabled/detached tee filtering and
flush tests, recursion tests and the unchanged resource benchmark cover it.
The Rust log/tracing and panic-suppression guards construct their RAII owners only on
successful entry; a rejected nested call cannot drop an owner it never acquired.
Repeated-rejection and real global-bridge regressions establish this Rust-specific
fix. Other languages do not use this guard or Rust eager `then_some` destruction.

The two final native test corrections also remain Rust-only: optional resource
snapshots may be unavailable during contention, and operational queue-pressure
summaries must not be counted as captured requests. Tests now wait only for
availability/admission under finite deadlines and assert the first accounting
snapshot or exact request paths/statuses. No production contract or other SDK
implementation changes for either correction.

The snapshot wrapper-budget correction aligns Rust composition with the existing
combined evidence limit. Go `internal/evidence/wire.go` and .NET `EvidenceWire.cs`
validate the complete additions object. Rust's final event validator already did
the same; its builder now reserves that field wrapper before admitting a graph.
Other producer contracts, shared fixtures and their runtime APIs are unchanged.

The combined-evidence/owner-hook budget correction is verified in Rust's shared
capture and hook owners; both Axum and Actix relays call the same hook helper.
Ingress still rejects invalid evidence before downgrade. The corresponding hook
owners in every maintained SDK are applicable to this scenario, with WordPress
inheriting PHP/Browser. Source triage identified similar fallback paths in Go and
.NET; the other language hook owners were located and reviewed for applicability.
Those unchanged SDKs have not received a new runtime regression or fix for this
case. The audit records an explicit cross-SDK follow-up; do not interpret this
Rust audit as a family-wide parity-complete claim.

## 2. Cross-SDK applicability record

Implementation disposition: the standalone Rust candidate, shared reader and
Cargo/CLI setup work are implemented with ongoing qualification. Existing SDK
producer sources remain unchanged. The table retains the complete applicability
inventory; it does not turn a source review into a fresh native/registry result.

Two shared local-reader corrections apply to every producer of canonical local
arrays: missing/null optional project IDs receive an unassigned local correlation
namespace at the CLI boundary, and protected inline probes use the worker's
existing stable projection/deduplication. Explicit project/environment boundaries,
raw arrays, cloud authority and envelope/Bundle v1 schemas are preserved. Core
unit/local-process/installed-CLI regressions and a disposable real Rust API/worker
pipeline pass. Existing Node, Browser, Python, PHP/WordPress, Java, Go, Ruby, .NET,
Android, Swift and React Native producers need no source change for these generic
reader corrections; fresh releases/adoption of those products are not implied.

Rust-only safe snapshot composition, native callback admission and shared relay
worker budgets use its new standalone implementation. Existing SDK runtimes keep
their own established mechanisms. Published Browser 3.2.2 has been exercised in
native Chromium through both extracted Rust relays: capability bootstrap, nested
causes, unsafe cause omission, recovery, backend trace, preflight and credential
isolation pass. Its legacy outer-error reads and safe native-cause traversal are
recorded separately. The same published artifact now passes opted-in analytics,
mixed debug/analytics batches, native beacon and declined-beacon keepalive through
both relays. Current Rust candidate native execution/coverage and exact-crate
consumers pass on Linux x64/arm64, macOS and Windows, as recorded in the execution
record. The Rust audit is qualified; registry acceptance and the explicit
cross-SDK owner-hook follow-up remain open. This is not a family-wide
parity-complete claim.

| Surface and adapters/wrappers                                          | Applicability / implementation disposition                                                     | Regression evidence boundary                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Node; maintained HTTP/framework adapters, loggers and full relays      | Existing evidence/privacy/wire semantics are baseline; shared parser/fixtures applicable | Existing JS core/Node contracts, native logger cases, relay and installed-package fixture consumers                   |
| Browser; maintained framework adapters, direct/relay transports        | Shared reader/negotiation/privacy applicable; Rust relay is a new downstream path        | Current browser artifact → Axum and Actix, mixed debug/analytics, proof downgrade and no browser token                |
| Python; Django/Flask/FastAPI and logging/relays                        | Preserve envelope/reader/privacy behaviour                                               | Python fixture and native logger regressions; shared reader consumes existing Python evidence                         |
| PHP; Laravel/Symfony, PSR-3/Monolog and relays                         | Same; PHP request-end exception does not apply to Rust capture                           | PHP fixture/relay regression; no change to synchronous PHP lifecycle claims                                           |
| WordPress wrapper and bundled PHP/Browser                              | Dependency/relay fixture applicability; no independent Rust code                         | Existing ZIP fixture shapes remain accepted; change bundled dependencies only if implementation actually changes them |
| Java; core/Spring/servlet/JAX-RS/javaagent, JUL/Logback/JBoss          | Parser regression and native-error pairing lessons applicable                            | JVM/module/suppressed/stream fixtures unchanged; no Rust-induced cross-runtime matching                               |
| Go; net/http/Gin/Echo, slog/zap/zerolog and full relays                | Closest behaviour reference; no source modification planned                              | Current Go event/ACK/evidence/privacy fixtures; existing backtrace/fingerprint output unchanged                       |
| Ruby; Rack/Rails/Sidekiq, Logger/SemanticLogger and relays             | Shared evidence/proof/privacy applicable                                                 | Ruby parser/cause and fixture regressions; existing Fiber ownership unaffected                                        |
| .NET; ASP.NET Core, Worker/job adapters, logger packages and relays    | Deferred work/owned data lessons applicable                                              | Existing .NET fixtures/graphs/ACK; no weakened logger/operation semantics                                             |
| Android; maintained HTTP/navigation/log adapters and native foundation | Shared evidence/reader/privacy applicable; server relay not applicable                   | JVM/Android frames and native envelope fixtures; mobile crash/offline/probe contracts retained                        |
| Swift; native/network/log adapters and native foundation               | Shared reader/privacy applicable; fatal limits informative; server relay not applicable  | Swift/native frames and fixtures remain valid; no change to native packaging or runtime floor                         |
| React Native; JS adapters plus Android/iOS bridges                     | Shared evidence/proof/privacy applicable; no Rust bridge introduced                      | JS-authored envelope preserved, native-wrapper fixture versions unchanged                                             |
| Rust core + Tower/Hyper                                                | Implement all applicable backend requirements; runtime limitations explicit in main plan | Vanilla/current-thread/multithread consumers, log/tracing, panic, context, delivery                                   |
| Rust Axum                                                              | Implement middleware **and full relay**                                                  | Installed app + shared relay corpus + browser consumer                                                                |
| Rust Actix Web                                                         | Implement middleware **and full relay**, including non-Send local state                  | Same independent installed-app/relay evidence, not inferred from Axum                                                 |

Re-enumerate actual adapters from each checked-out repository before modifying any
shared behaviour. If a new capability changes a cross-SDK contract, expand the
implementation to every applicable authorised DebugBundle surface, or explicitly
record the unresolved gap and do not claim parity. Do not churn/publish unaffected
SDKs merely to add Rust. Consumers are outside this scope.

## 3. Requirement and acceptance map

Ranges refer to the existing owning documents; Rust-specific checks below add
verification detail without weakening their assertions.

| Requirement / contract                                                   | Rust work                                                                 | Verification                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| AC-SDK-RUST                                                              | Complete Rust expansion rather than partial framework scaffolding         | Every required source/native/artifact/relay/CLI gate below; publication remains separate                        |
| FR-SDK-03/05/16/17/35; SDK interface §§1–7                               | Universal API, canonical backend event types, vanilla and both frameworks | Public API compile examples, all emitted event variants, real application errors/requests                       |
| FR-SDK-06/09/10/13/13a; SDK §§1.1, 7                                     | Batching, suppression/loop, sample and hook semantics                     | Deterministic clock/RNG, first-three/loop thresholds, valid/invalid/drop/panicking hook, replacement identities |
| FR-SDK-18/19/19a/19b/20/21; AC-SDK-SAFETY-FILTER/CALLER/OVERLOAD/INSTALL | Native filtering, bounded work, composition and isolation                 | Real tracing/log collectors and app logger coexistence; no callback below threshold or when saturated           |
| FR-SDK-22; SDK §3.7                                                      | Request/outbound trace and concurrent operation ownership                 | Invalid/missing/valid trace, targeted injection, no cross-request/task leaks                                    |
| FR-EVID-01–09; evidence spec; AC-EVID-\*                                 | Graphs, origins, execution, recovery, proof and byte limits               | Canonical fixtures + semantic validation + reader golden outputs + no fingerprint/lifecycle change              |
| FR-PRB-01–12; SDK §11; AC-PRB-\*                                         | Rings, heavy/lazy, config/ETag, activation/trigger security               | Free/paid, expiry/revocation, duplicate directive IDs, request isolation, object-wrapped values                 |
| SDK §12                                                                  | Authoritative policy and explicit server-side capture-rule disposition    | Initial failure vs legacy response, promoted 4xx cases, minimal diagnostics off, final-delivery tightening      |
| FR-REL-01–14; SDK §13; AC-REL-\*                                         | Two full relays + setup integration                                       | Same current relay corpus on each adapter, real local/process and connected/spool paths                         |
| NFR-PERF-01 / NFR-REL-01; AC-SDK-SAFETY-\*                               | Host safety, bounded ownership and finite flush                           | Contention, overload, slow/stalled callbacks, hung peer, abort/unwind subprocesses                              |
| AC-SDK-ACK-RETRY; SEC-17                                                 | Canonical ACK/retry and deadline arithmetic                               | Every malformed/partial count/index combination, 2xx without ACK, retry hints/date/overflow                     |
| NFR-SEC-12; SEC-16/20/21/22/23/23a/26; AC-PRIV-\*                        | Mandatory protection throughout lifecycle                                 | Current shared corpus, fuzz/property tests, after-hook/native/relay/file boundary assertions                    |
| SEC-12–15; INV-17–19                                                     | Private files, safe paths, relay origin and credential isolation          | Symlink/path/permissions/atomicity/crash/disk-full tests, native platform qualification                         |
| SDK parity/testing rules; package standards                              | Complete inventory and exact artifact qualification                       | Per-file coverage, complete feature/runtime matrix, local and later published consumers                         |

## 4. Functional verification matrix

Tests are grouped by behaviour, with shared helpers; no phase-named tests. Use
unit/property tests for deterministic state machines, real TCP fake servers for
HTTP semantics, and subprocesses for global logger/panic/runtime lifecycle.

| Area             | Required adverse cases and assertions                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config/lifecycle | Empty/invalid token, malformed URL, disabled client, repeated init/drop, exhausted process worker slots, poisoned state, no host panic                                                                              |
| Admission        | Mixed/full all-error queues, contention, multithread captures, callbacks stalled, count+byte+age ownership includes in-flight and tails, primary survives optional evidence                                         |
| Privacy          | All fixture cases; long names/strings; non-ASCII boundaries; query/header/text credentials; unsupported object projections; hook reintroduction; no raw values in status/files                                      |
| Errors           | Safe root/cause/aggregate/shared child; cycle/depth/node/edge excess; opaque trait object; custom Display/Debug/source counters remain zero; no fake native stack                                                   |
| Logging          | Native filtering preserves other sinks; static/dynamic messages; primitives vs custom Debug; native error once; no text coalescing; log↔tracing bridge recursion; detach/reinit                                     |
| Panic            | Prior hook once, hook recursion, custom payload never formatted, unavailable backtrace, no user hook/flush, unwind process survives expected catch; abort child terminates normally for that profile                |
| Operation        | Nested owners, task migration, explicit spawn propagation, cancellation/drop, stale clones/descendants, framework non-Send values, monotonic duration and configured limit                                          |
| Policy/probes    | Failed initial config, absent legacy policy, 304/stale/invalid policy, Free no periodic polling, paid cadence, heavy inactive zero callbacks, multiple directives, expiry and token precedence                      |
| Recovery         | Opt-out/minimal/no proof rejected; valid states, scope mismatch, clock tolerance, five-minute boundary, all cardinality limits and joint 64 KiB ownership under partial ACK/drop                                    |
| Hook             | Sanitised immutable-original copy, full valid field replacement, invalid fallback, drop, panic, never-returning task, no worker replacement or retry re-execution                                                   |
| Wire/ACK         | 256 KiB exact/one-byte-over Unicode+wrapper, 100-event max, changed IDs/types, each retry/terminal reason, malformed numeric/index bodies, truncated/oversized/slow responses                                       |
| Retry/flush      | Seconds/date/negative/NaN/huge hints, response-receipt timing, common chunk deadline, config independent from backlog, custom transport failure, all-rejected last-event unchanged                                  |
| Local files      | Correct array/naming and CLI process output, unsafe name/path/symlink, private permissions, short/failed write, atomic recovery, no HTTP fallback                                                                   |
| Frameworks       | Route not raw sensitive path, 2xx/5xx/preset 4xx, error converted to response, extractor failure, panic, cancelled future, streaming/drop, nested middleware, no automatic body capture and bounded opt-in snapshot |
| Relay            | Both adapters, Origin/Referer/Host and CORS, request size streaming bound, forged credentials/markers, analytics allowlist, 60/min limit, disk cap, partial downstream ACK, restart, proof revocation               |
| Shared core      | All existing stack/graph/wire fixtures, Rust-specific format detection, unchanged incident fingerprints and Bundle v1 output semantics, deterministic repeated bundle generation                                    |

Fuzz targets cover bounded JSON/proof/ACK/stack/relay input, path construction and
state transitions without network or secrets. Check no panic, no unbounded work
and stable ownership rather than merely asserting parse rejection. Where useful,
use concurrency model tests for ownership and revocation; do not rely on sleep
timing to establish ordering.

## 5. Runtime, feature and artifact lanes

The following versions were read from primary upstream documentation on
12 November 2026. They are preparation inputs, not an installed lockfile. Refresh
and resolve together in slice A; commit consumer/test lockfiles and exact container
digests during implementation. Public library semver ranges must match the tested
compatibility window.

| Component            | Observed baseline / planned lane                                          | Source                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rust                 | Stable documentation: 1.99.1; previous 1.98.1; package MSRV proposed 1.89 | [Stable releases](https://doc.rust-lang.org/stable/releases.html), [MSRV semantics](https://doc.rust-lang.org/cargo/reference/rust-version.html) |
| Axum                 | 0.8.9; test supported 0.8 range with resolved lower/current consumers     | [Crate](https://docs.rs/crate/axum/0.8.9), [framework](https://docs.rs/axum/latest/axum/)                                                        |
| Actix Web            | 4.19.0; upstream minimum Rust 1.89                                        | [Crate, observed current version](https://docs.rs/crate/actix-web/latest)                                                                        |
| Tokio                | 1.54.1 current; 1.53 LTS compatibility lane                               | [Crate](https://docs.rs/crate/tokio/1.54.1), [support policy](https://github.com/tokio-rs/tokio#supported-rust-versions)                         |
| Tower / HTTP / Hyper | 0.5 / 1 / 1 as used by the selected Axum line                             | [Axum manifest](https://raw.githubusercontent.com/tokio-rs/axum/axum-v0.8.9/axum/Cargo.toml)                                                     |
| reqwest              | 0.13.5; explicit features/provider and compiler qualification             | [Manifest](https://raw.githubusercontent.com/seanmonstar/reqwest/v0.13.5/Cargo.toml)                                                             |
| tracing              | 0.1.44; typed visitor limitations are part of the API design              | [Visit](https://docs.rs/tracing/0.1.44/tracing/field/trait.Visit.html)                                                                           |
| tracing-subscriber   | 0.3.23; compose or fallible installation                                  | [SubscriberInitExt](https://docs.rs/tracing-subscriber/0.3.23/tracing_subscriber/util/trait.SubscriberInitExt.html)                              |

The development release page showed 1.100.0 dated 12 November while stable docs
still showed 1.99.1 during this research. Confirm the actual stable channel at
implementation; do not derive support from a release date alone. Lock compatible
dependencies so a newer transitive MSRV does not silently break the declared 1.89
floor. A failed MSRV lane blocks release or requires an explicit floor revision.

Additional Rust safety references: [Error](https://doc.rust-lang.org/std/error/trait.Error.html),
[catch_unwind](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html),
[set_hook](https://doc.rust-lang.org/std/panic/fn.set_hook.html).
These explain why arbitrary formatting/source access, panic-abort recovery and
unconditional global hook replacement cannot be promised.

Required matrix:

- Rust MSRV, current stable and previous stable, on Linux; latest stable on
  Linux aarch64, macOS arm64 and Windows x64. TLS/local file behaviour also needs
  native platform checks; Linux Docker does not establish Windows ACL safety.
- Core `--no-default-features`, default HTTP, local-only, each adapter independently,
  tracing only, log only, both logging features, and all supported features.
  Compile doctests/examples and enforce that the core build does not pull Axum,
  Actix, Tower or tracing-subscriber accidentally. Use a locked matrix rather than
  relying only on `--all-features`.
- Tokio current-thread/multithread, Axum current and selected supported lower
  version, Actix current and selected supported lower version, genuine non-Send
  Actix state, vanilla synchronous command, and Hyper/Tower consumer.
- Panic unwind and abort subprocess profiles; default and chosen alternate TLS
  configuration if advertised. Do not advertise unqualified feature combinations.

Make targets to create in the standalone repository: `format-check`, `lint`,
`typecheck`, `test`, `test-contract`, `test-frameworks`, `test-relay`, `coverage`,
`test-msrv`, `test-features`, `evidence-performance`, `package`, `smoke-package`
and `smoke-published`. Routine local commands use pinned Docker images and bounded
workspace mounts; native CI is used where OS semantics require it. Each target
must fail closed and record toolchain/dependency versions. Standard Rust commands
include fmt, clippy with warnings denied, tests/doctests and `cargo package`; add
bounded fuzz and coverage tooling with pinned versions.

Coverage: at least 80% per source file under the SDK testing rule, with complete
critical privacy/normalization/acknowledgement paths, not only a high aggregate.
Exceptions need an explicit rule-backed justification; framework and relay files
cannot be excluded just because they require real runtime tests.

Performance gate: compare identical capture workloads with SDK disabled, baseline
enabled and optional evidence enabled, both under normal load and real queue
pressure. Exclude setup/queue seeding from capture measurements. Report p50/p95/p99,
throughput, allocations/retained bytes, queue/ledger peaks and worker count, including
tracing/log and both frameworks. Filtered/full-queue custom formatting and callback
counts must be zero; queues/ledgers/workers never exceed declared caps; an injected
slow peer/blocked hook never adds its wait to a capture call. Record numerical cost
baselines on a pinned runner and set regression thresholds from repeatable results
before release; no fabricated millisecond or percentage promise at planning time.

## 6. Exact-artifact and release gates

1. Refresh rules/contracts/fixtures/versions and the complete applicability record;
   qualify reader/schema changes before any producer depends on them.
2. Pass repository format/lint/type/test/coverage/security/dependency/license checks
   and the required feature/runtime/framework matrix. Review unsafe dependency
   boundaries; the SDK should not introduce its own `unsafe` error-lifetime tricks.
3. Create the actual `.crate`; record source revision, clean/dirty provenance,
   Cargo.lock/resolution records, checksum and package contents. Exclude secrets,
   operator notes and local fixture outputs. Verify license/README/repository/docs
   metadata and docs.rs feature selection.
4. Extract/install that artifact into isolated vanilla, Axum and Actix consumers
   with no path/Git override back to the source checkout. Exercise native logging,
   structured error, strict ACK/retry, privacy, byte splitting, operation/probes,
   recovery, local output and full browser relays. A fake transport alone cannot
   qualify native HTTP or framework integration.
5. Run bounded Docker core ingestion → processing → bundle retrieval using synthetic
   data, plus local-file → `debugbundle process`. Assert protected evidence reaches
   the reader, original event/trace IDs survive, unsupported additions downgrade,
   and diagnostic context does not independently open/resolve incidents. No
   production or consumer canaries are required.
6. Complete [pre-ship review](../../.agents/skills/pre-ship-review/SKILL.md): inventory,
   failures, trust boundaries, cleanup, contract alignment, coverage and schema
   safety. No database change is expected; if one becomes necessary, stop treating
   it as an SDK-only implementation detail and apply forward-migration gates.
7. Prepare release notes and public setup/privacy/limitation docs. Verify crates.io
   name/owner and automation credentials without publishing. Keep commit, push,
   publication, site deployment and consumer adoption as separately authorised
   actions. No plan checkbox or local test authorises them.
8. After explicit release instruction, publish the already-qualified artifact;
   verify registry checksum/version and independent clean registry consumers.
   Reconcile source vs packaged vs published evidence and documentation. Do not
   mark registry/framework acceptance complete from an upload response alone.

## 7. Implementation review and handoff

The standalone public repository exists and its published alpha source follows
this architecture and interface baseline. Consult the dated implementation record
for source, installed local crate, Core, CLI, Browser and measured cost receipts.
Earlier preparation sections are not current completion claims.

Read the audit's exact-source matrix for native macOS/Windows/Linux x64/arm64,
per-module coverage, adverse/fuzz/resource and extracted-crate acceptance. Older
preparation notes do not reopen completed gates or qualify subsequent source
changes. The first alpha's separate registry acceptance passes, as recorded in
[the release record](rust-sdk-release.md). Windows private files use the narrow owned Win32 ABI boundary; application
error/capture traversal remains sealed and unsafe-free. No existing dependency
version/checksum changed when adding its already-frozen Windows API package as a
target dependency. If a gate fails, resolve and record it before release; never
silently drop a required framework or safety capability.
