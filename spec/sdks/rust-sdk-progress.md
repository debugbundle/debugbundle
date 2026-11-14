# Rust SDK implementation record

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

Rust audit qualified; `1.0.0-alpha.1` published, 14 November 2026. Implementation follows
[the plan](rust-sdk.md) and [qualification matrix](rust-sdk-qualification.md).

## Current work

- Published SDK source: `eb9e09afc02751ebd34464bfa4b8808a565635b4`, tagged
  `v1.0.0-alpha.1`; release tooling and current documentation advance separately. [The deep audit](rust-sdk-audit.md) records all
  seventeen findings and their evidence.
- All eight jobs in [CI `43468613263`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43468613263)
  pass: Linux x64/arm64, macOS ARM64 and Windows x64 native/extracted-crate gates,
  feature/compiler compatibility, coverage/security, both published-Browser relay
  integrations, four bounded fuzz campaigns and 22 unchanged resource budgets.
- All 181 ordinary local tests and strict lint pass. Coverage clears all 53 Linux,
  53 macOS and 54 Windows module floors. The final test-only correction increases
  Windows capture coverage from 79.39% to 85.47%; thresholds and production source
  are unchanged. Earlier failures, including two local timing outliers, are retained.
- The sealed crate SHA-256 is
  `1aed6405f1b6b80ef9430d8300e9efe330a9e06be8c51587da0a41fe07abd8bc`.
  Local/CI bytes match, all four platforms qualify this same archive, and its exact
  event output passes 12 focused Core checks and the disposable actual pipeline.
- Comparable owner-hook budget paths in other SDKs need separate runtime follow-up;
  family-wide equivalence is not claimed and those repositories remain unchanged.
- Core/spec/site changes remain local. Rust references cover 18 articles, the
  homepage and discovery index; site acceptance is recorded in the audit.
  The [first alpha publication and automation record](rust-sdk-release.md)
  retains upload, public checksum and genuine registry-consumer evidence. The tag
  release path is implemented; initial Trusted Publisher registration/OIDC proof
  passes in `43575500128`, and the obsolete GitHub bootstrap secret is removed.
  Stable publication is now complete as recorded above. No core/site deployment or consumer adoption occurred.


## Implementation history

Entries below preserve the implementation sequence. Statements about remaining
work describe their recorded stage; the current audit status above and its linked
evidence take precedence.

- Standalone local repository initialised at `sdks/debugbundle-rust`; current
  authorised source commits and CI status are recorded in the handoff below.
- After explicit public-visibility approval, created
  `https://github.com/debugbundle/debugbundle-rust` and connected local `origin`.
  At creation the remote was empty. Source push/CI were subsequently approved;
  package publication remains unauthorised and explicitly on hold for deep audit.
- Pinned Rust 1.99.1 Docker image resolved to
  `sha256:e6f2cff35d0f309acf8433b4f05878ed77092602c5065cc81801177da0bb3a9c`.
- Canonical privacy/relay/evidence fixtures copied with checksums and source record.
- Rust 1.89 dependency/source check passed before the client was added; rerun for
  final source. Its image digest is
  `sha256:948f9b08a66e7fe01b03a98ef1c7568292e07ec2e4fe90d88c07bb14563c84ff`.
- Built `debugbundle-rust-tools:1.99.1` from the pinned stable base with rustfmt
  and clippy, because the official base omits those components. Make owns the flow.
- Privacy, canonical envelope/semantic evidence, ACK/retry, safe snapshots,
  configuration, real TCP HTTP, private local storage and client/sender paths have
  red/green tests. The shared 27-case privacy corpus and complete evidence-wire
  corpus pass. Current client tests cover deferred/revalidated hooks, identity
  replacement, retry without repeated hooks, zero sampling and queue priority.
- Operation owners now revoke descendants and stale contexts, enter context only
  while futures are polled, and preserve real elapsed/configured-limit evidence.
  Concurrent task and 1,024-owner registry tests pass.
- Always-on probes, isolated lazy producers, 500-item inline retention, remote
  configuration and request-scoped signed triggers have passing tests. Header
  precedence, invalid signatures, TTL/scope, distinct same-ID directives and
  signing-key rotation are covered. Free/disabled configuration ends automatic
  refresh; unknown discovery retries are bounded. Paid cadence has unit checks.
- Explicit recovery and its shared 64 KiB pending/metadata ledger are implemented.
  Tests cover opt-in/proof, ownership, hook identity/time changes, 50 windows,
  five attempts, twenty observations, expiry and no allowance refunds on ACK.
  Custom/local readers use the established balanced legacy policy; authenticated
  native discovery starts minimal. A reader pin cannot override discovered policy.
- Initial composable `tracing` and `log` adapters pass tests for layer-local
  filtering, preserving another sink, native error capture, detachment, overload
  and zero custom formatting. Protected span metadata updates/closes are bounded
  per client. Exact occurrence tokens pair only in the same live operation after
  successful admission; owner hooks and sampling disable irreversible pairing.
  Independent-operation and hook-drop fallback tests pass.
- Deferred callback re-entry cannot recursively capture or flush itself. An
  opaque panic poisons its bounded worker without bypassing later owner hooks.
  Valid hook replacements remain authoritative even when over byte limits.
- Compiler version is embedded at build time; runtime capture runs no compiler
  process. Explicit protected structured frames are bounded and provenance-aware.
- Configuration destructor isolation is now tested: last-client drop and another
  client's delivery stay responsive while an application transport destructor is
  blocked. One cleanup worker and the shared client permit bound pending cleanup;
  capacity is released only after cleanup and callback-worker exit.
- Stable toolchain feature checks pass for no defaults, local only, log/tracing,
  Axum and Actix. Warning cleanup and the final MSRV/native/artifact lanes remain.
- A full 67-test run and all-target Rust 1.89 check passed before panic observation.
  Clippy passed with warnings denied; production unwrap/expect remain denied, while
  fixture assertions use ordinary test failures. Cargo links now run one at a time
  after concurrent full-suite links exhausted shared Docker memory.
- Explicit panic observation now passes an isolated-process test for native prior
  hook chaining, primitive/opaque payload ownership, owner-hook/probe exclusion,
  later application-hook preservation and stopped-client registration cleanup.
  Source smoke consumers retain their own lockfile and pass both unwind and abort
  profiles (`make test-panic`). This is source evidence, not exact-crate proof.
- Optional hook-supplied probe fields above application budgets are now omitted
  without losing the valid owner-edited primary; the red/green regression passes.
- Callback-owned JSON now gets bounded validation before schema work and iterative
  disposal, including known JSON panic payloads. Five isolated subprocess cases
  pass with 50,000 nested arrays across hooks, lazy producers, transport replies,
  invalid configuration and panic payloads. The fixture moves deep values directly
  so recursive serialization in test construction cannot mask the SDK boundary.
  No core dump is produced by future Docker tests (`--ulimit core=0:0`).
- Core presentation parser now accepts Rust numbered symbols plus `.rs` source
  lines under the existing `unknown` evidence runtime. Unix/Windows source paths
  and SDK/framework classification are covered. Core reader/graph tests: 58 pass.
- `sdks.json` and fixture-sync inventories include Rust. The testing guide's event
  schema reference now points to EventEnvelope rather than Bundle.
- Bounded suppression state and unit tests added; integrated sender qualification
  remains in progress. No slice is marked complete from these partial checks.

## Pre-audit handoff (historical)

Implementation and the configured current-candidate source/native/artifact matrix
pass on `244c104`. Linux x64/arm64, macOS and Windows consume the same immutable
crate; their runtime, coverage and application receipts are recorded below.
Core/CLI and published Browser integration receipts remain distinct from SDK
source checks. Earlier implementation-gap and native-pending notes are historical.

The owner's deep audit remains outstanding. Include an explicit review of the
documented root-only nested aggregate snapshot policy against the graph contract,
and actual HTTPS certificate/hostname/root-chain handshake coverage: the current
native HTTP/URL/configuration receipts do not by themselves establish that TLS
acceptance. These are audit topics, not claims of diagnosed defects or completed
proof. Release/published-registry automation is prepared; publication, registry
consumers, site/core release and consumer adoption remain separately authorised
actions. All releases are on hold and no family-wide release/parity claim is made.

The unavailable lazy-producer ownership edge now has a deterministic red/green
interleaving test: poison the callback worker after producer admission but before
scheduling, then block its destructor and verify independent SDK delivery. A
task-side Arc and the existing cleanup worker own disposal. `pending_probe` and
the task's Inner/client permit remain charged until cleanup completes, bounding
the queue to one outstanding producer cleanup per client without another worker.
Stopped clients cannot be resurrected by an internal public-handle clone across
cleanup suspension. Callback process permits also cover queued-closure disposal.

Discovery trust-boundary tests now pass: credential-bearing service/environment
values, endpoint paths and endpoint query values fail closed before authenticated
requests. Benign query encoding remains accepted. Low-level native transport
configuration uses the same guards. The current all-target MSRV check passes.

Native tracing review caught a static-callsite cache bug under backpressure.
The layer now uses `dynamic_filter_fn`, so capacity, server levels, detachment and
internal/recursive thread state are evaluated for every event. A same-callsite
full-queue/recovery/detach red/green test passes with the logging suite.

Axum/Tower and Actix middleware now implement actual native Service readiness,
call and future delegation without imposing Send on local application futures.
Protected request metadata belongs to the operation budget; bodies are opt-in
already-parsed snapshots capped at 8 KiB and never read from native streams.
Shared wrappers define duration as time to headers and retain operation ownership
through body completion/error/drop. Typed errors preserve native response conversion;
status-only failures remain request events. Optional resolved framework versions
are supplied explicitly because the crates do not expose a universal version API.
First-party trace targets use exact origins, preserve valid incoming UUIDv4 values
and exclude the entire SDK ingestion origin. No implicit third-party injection.

Thirteen focused framework/lifecycle/operation tests pass, including cancellation,
readiness on the same service, non-Send Actix state, both body snapshot paths,
typed errors, nested middleware, invalid trace generation, response drop, opaque
body errors without formatting and native handler panic propagation. Inactive
clients still supply empty Context extensions; policy-lock contention uses minimal
snapshot semantics rather than causing a native Context extractor to reject a
request. Explicit correlation-only operation contexts are no longer discarded.
Full TCP/installed-crate middleware/relay qualification and final lint/MSRV remain.

Automatic signed-trigger binding now passes red/green Axum and Actix tests:
header precedence, protected query metadata, no retained trigger header, and no
activation leaking to the next request. Current source suites pass in full;
all-feature Clippy passes with warnings denied. The subsequent relay-tail
proof-revocation regression and focused client/safety/relay rerun also pass.
The Rust 1.89 and independent feature checks passed after middleware changes,
before relay source was added. Rust 1.89 hit an incremental compiler ICE once;
disabling cross-toolchain incremental state (`CARGO_INCREMENTAL=0`) resolved it.

The shared relay engine now implements protected canonical browser validation,
same-origin/allowlist and Referer fallback, exact trusted-proxy peers, CORS,
content type/body/count limits and a bounded 4,096-key per-process limiter.
At most eight ingress operations retain owned request work at once. Native
framework adapters acquire that bound before reading streams. Local debug and analytics arrays are private
and use the backend file writer. Browser credentials and backend/operation
impersonation are withheld. Legacy mixed-batch 400/string responses and opt-in
202/evidence_errors remain compatible with the existing universal contract.

Analytics now has a separately generated canonical input schema and 18
source-verified semantic cases. The Rust validator also enforces Zod-only
refinements (custom dimensions, route context, UTC timestamps) and validates
trimmed/case-insensitive-hash copies without modifying correlation passthrough.
Malformed native JSON shapes fail without unwinding. Generation is owned by
`make rust-analytics-fixtures`; the generator passes focused lint and records
checksums in the SDK fixture provenance. The relay fixture inventory includes Rust.

Native sender and relay share one ACK/piggyback/proof observer. A browser request
that grows over one HTTP chunk after canonical identity protection is tested:
the first ACK revokes evidence and every unsent tail loses optional additions,
without rerunning producers or changing event IDs. Low-latency forwarding is
implemented; broader native HTTP, partial/restart and proof tests remain open.
Connected durable admission now persists protected immutable arrays and HMAC-bound
per-index state before 202. One replay loop per client resumes current-scope
records at relay construction, without requiring another browser request.

Durable spool tests cover offline restart/stable IDs, partial ACK progress,
bodyless legacy replies remaining pending, token rotation and forged completed
markers. Private tests cover local-time retention, interrupted cleanup and
immutable accepted progress/proof/index counts. Native Axum and Actix relay
factories pass the shared handler corpus including exact legacy errors. Ingress
permits precede native body reads; five-second/256 KiB/4,096-frame limits bound
slow streams. Tests cover preflight, duplicate origins, untrusted forwarding,
stream overflow, eight-upload pressure, cancellation and timeout permit release.
The native lease cleanup reservation uses the owning callback lane, keeping
filesystem cleanup independent of unrelated application destructor stalls.
Remaining relay qualification includes browser consumers, capacity/fault/concurrency
cases and the complete installed-artifact matrix. Owner hooks, shared limiter and
native TCP consumers now have passing checks described below.
Storage now uses rustix 1.1.6 safe descriptor-relative operations on Linux/macOS:
component-by-component no-follow directory opens, effective-UID/private-mode
checks, anchored file access, nonblocking regular-file reads, hard-link rejection,
fallible temp IDs and kernel no-replace rename. A new ownership regression failed
on the old reader and now passes. Existing file/relay tests, strict Clippy and a
16-writer exclusive-publication unit test pass. Native macOS execution is pending;
other local-file platforms fail closed and the supported-platform decision remains
open. The new dependency uses the already-cached locked rustix release. An initial
automatic-review rejection misapplied consumer-product consent to this requested
SDK; rereading both AGENTS files established scope and the identical offline
resolution was approved. No consumer or publication action was taken.
Relay owner hooks now run once on the existing bounded worker before persistence,
with protected input, valid field/identity replacement, mandatory privacy again,
explicit local-policy drop and safe-original panic/invalid fallback. The optional
shared limiter lives on Config so existing isolated configuration cleanup owns
application destructors. Replica tests cover scoped verified keys and unavailable
stores failing closed; calls precede native body reads and have finite waits.
Additional relay gaps before full parity: broader policy/proof rechecks,
malformed/proxy/fault/concurrency tests, genuine browser
and Core local/process/connected ingestion consumers. No slice A–H is complete.

The escaped-byte/primary regression failed before the fix and now passes. Capture
and finalisation count actual JSON bytes without allocating oversized serialized
bodies, reduce optional additions against currently owned byte capacity, and
preserve the current protected primary. Relay forwarding uses the same fitting
helper. Native serde_json Number representations are bounded before cloning or
numeric parsing, including consumers enabling arbitrary_precision; a 100,001-digit
primitive test failed before the fix and passes with feature unification enabled.
The complete all-feature source suite passes after these changes. Strict lint,
Rust 1.89 all-target and independent feature checks pass. Exact-artifact gates
are being implemented.
Local sender filenames now derive a safe label from final service identity without
changing the envelope, with a red/green dotted-service owner-replacement test.
The usual CHANGELOG, SECURITY and CONTRIBUTING repository documents are present.

Current stable refreshed on 13 November: upstream stable release notes now show
Rust 1.100.0. `make test-current` pins the official bookworm image digest
`sha256:ade39a710ef85f3506cffcfec3e8a24ba090badef1dff2fb798f71d878833fea`;
the complete all-feature suite passes on 1.100.0 as well. Existing 1.99.1 checks
cover the previous stable lane. See the upstream stable release notes at
https://doc.rust-lang.org/stable/releases.html for the refreshed release baseline.

Exact-artifact work: `make package` builds/verifies the local crate, including
functional tests and canonical fixtures. `make smoke-package-lock` prepares a
frozen independent consumer resolution; `make smoke-package` extracts the actual
crate into an isolated directory, rejects resolution back to the source checkout,
and runs vanilla, Axum and Actix applications with a real authenticated HTTP
mock. The framework consumers exercise native TCP routes, request middleware,
trace propagation, durable browser relay and browser credential isolation. Runtime
qualification caught consumer API mistakes during compilation; fixtures now use
owned ExceptionInput with explicit anyhow dereferencing. The locked vanilla/Axum/Actix consumers now pass against local crate SHA-256
`41830f1d179cf7f66aea3038588b67fcceb80684c40af73b92fa7d3126b398fa`
using Rust 1.99.1. SDK lock SHA-256 is
`a1c2d02d03e5b011593dc767ef3c3f9fbe16ee96f6ef404d51e8a4d61cdce6a0`;
consumer lock SHA-256 is
`20699009a9a6f573cf640c916fc625a375c8839367cb4e4ba6df4634cd59a5df`.
This proves those application paths for that local artifact, not the entire
release qualification matrix. Evidence
is written under the SDK ignored `.tmp/package-qualification` directory.

The previously empty testkit feature now exports a bounded RecordingTransport.
Its public tests pass for capture/retry/privacy/drain and atomic invalid/full
batch rejection. Source formatting is current. Its deprecated atomic update was replaced with
a bounded MSRV-compatible compare/exchange loop; strict lint passes. The initial core-only runtime run
caught validation fixtures assuming the default HTTP feature; those fixtures now
supply their intended custom test transport, and a separate test explicitly
requires MissingTransport when neither built-in HTTP nor a custom transport is
available. Core-only runtime and the rebuilt exact-artifact applications pass.
Native request-ID correlation now preserves safe printable identifiers up to 128
bytes and supplies a fresh UUIDv4 for missing or privacy-sensitive native headers,
independently of captured header data. Axum and Actix regressions pass. JSON
mathematical-integer semantics now apply consistently to proof versions,
ACK/count/index fields, graph IDs, policy numbers and polling intervals. Capability
features accept valid unique lists in any order and normalise them before use.
The complete all-feature suite passes on Rust 1.99.1 and 1.100.0; Rust 1.89
all-target checking, core-only runtime tests, independent features, strict Clippy
and the refreshed exact-artifact applications pass after these changes.
The Core workspace typecheck and focused fixture-tooling lint/format checks pass.

CLI setup now uses a bounded Cargo metadata reader in `packages/project-discovery`:
standalone/virtual/mixed workspaces, member globs/exclusions, inherited/aliased
framework dependencies, explicit/automatic binaries and generated-tree exclusions.
It never runs Cargo or build scripts. Axum/Actix suggestions include exact features,
logging composition, middleware, relay factories and first-event verification;
unreleased status is explicit. Existing JSON output shapes are retained.
Twenty focused setup/discovery/relay tests passed before an additional explicit-bin
regression was added. The packed CLI passes genuine installed-package setup on
Node 22.23.3, 24.14.0 and 26.12.0; local tarball SHA-256 at that receipt is
`caf30261b52339ea7a0eeaa7a51b7ad2ee9dbd5c1b84890a681f72e29290dbd5`.
The two parser/matcher dependencies were added without updating existing locked
packages; frozen install and supply-chain checks pass. A broad lockfile rewrite
was corrected before proceeding. Final CLI checks follow the explicit-bin fix.

The crate export is available under the ignored SDK `.tmp/packages` directory with
checksum/toolchain records. `make install` and `make build` pass. Repository issue
and PR templates are present. The crates.io namespace read returned HTTP 403;
ownership/availability remains unverified and no reservation or publication ran.
Exact-artifact qualification now also runs the full packaged functional suite and
separate unwind/abort consumers; all pass for the receipt below. Subsequent
client-shared ingress and example changes require the final refreshed crate run.

## Qualification continuation, 13 November

- Extracted crate `79ca07da370db596c84420793b378517a2498d06c864a5b7144ab7bb9ccc478e`
  passes its complete packaged functional suite, vanilla/Axum/Actix native HTTP
  consumers and separate unwind/abort profiles. Compiler host is
  `aarch64-unknown-linux-gnu`, Rust 1.99.1 / LLVM 23.1.1. This qualifies Linux arm64
  paths only; no macOS/Windows or Linux x64 execution is inferred.
- The vanilla artifact consumer also exercises actual private local output with
  a two-node Rust cause graph, command execution, protected inline probes and two
  explicit recovery states. Its exact exported array is tracked at
  `tests/fixtures/evidence/rust-local-events.json`; SHA-256
  `556a848f0d9bbc0941179bf4b289b565894f7b59857adb7532de3f8bfd7ccd22`.
  Event/trace/failure/operation IDs remain those emitted by that consumer.
- These arrays pass canonical admission/schema checks, unchanged fingerprint
  semantics, Rust stack presentation and deterministic Bundle v1 readers.
  Local `process` preserves graph/execution/recovery and leaves the incident open
  with one occurrence. The combined reader/local/receipt/scope regressions passed
  57 cases before the shared inline-probe follow-up; another 35 focused tests pass
  after that follow-up.
- `make rust-core-integration` passes real API/worker processes with disposable,
  privately networked Postgres/Redis/LocalStack. Only occurrence timestamps advance
  for bounded replay of the retained fixture. Original event/trace IDs survive
  authenticated raw storage, durable processing and member-token bundle retrieval;
  graph, execution, inline probes and explicit recovery survive. Recovery neither
  creates an extra incident nor resolves the open incident. The owned stack and
  volumes are removed; no installed local/hosted stack or consumer is changed.
- Local SDK arrays with absent/null project IDs exposed a real reader gap. The
  CLI now binds those canonical inputs to the unassigned local namespace without
  rewriting files or inferring cloud authority. Explicit project/environment
  scope stays separate. A second installed-CLI regression exposed missing inline
  probes; worker and CLI now share the existing protected projection/deduplication
  in `packages/bundle-engine/src/probe-data.ts`. Existing worker behaviour is
  preserved. Core typecheck and focused lint/format pass after the shared change.
- The installed CLI qualification now includes Rust setup, actual local evidence,
  protected probes/recovery, reused trace IDs across project/environment scopes,
  and useful same-scope browser/backend grouping. Node 22.23.3, 24.14.0 and 26.12.0
  pass. Its synthetic browser event is a fixture replay, **not** a genuine Browser
  SDK-to-Rust relay qualification.
- New source tests pass for existing/fresh global logger installation, preserving
  max-level/sink state, recursive application bridges and detach; immutable
  aggregate snapshots; valid ACK policy tightening and invalid ACK policy exclusion;
  proxy identity/Referer validation and limiter capacity/expiry. A deterministic
  test verifies native file cleanup progresses on its callback lane while global
  application cleanup is stalled. SDK resolver/blocking threads now set the
  internal logging marker; its regression failed before the fix and passes.
- Independent relay handlers formerly multiplied a client's upload/rate budgets.
  A regression failed before the fix. All handlers now share eight active uploads
  and 4,096 IP keys through client-owned accounting; constructing another worker
  route cannot reset either allowance. Full relay tests, strict Clippy, Rust 1.89
  all-target checks and refreshed per-file line coverage pass after this change.
- Pinned cargo-llvm-cov 0.9.1 / LLVM tools measure production source only. Inline
  unit tests were moved into functional `tests.rs` modules, which are excluded;
  all 52 production source files have records and at least 80% executable-line
  coverage. This is a line-coverage receipt; branch instrumentation is not
  supplied by this stable lane, and no branch/function coverage claim is made.
- Pinned cargo-deny 0.20.2 passes current advisories, license, registry/source and
  banned-dependency policy on the frozen SDK graph. MIT-0 for `borrow-or-share`
  was inspected and added to the permitted license set; no advisory suppression
  exists. Expected duplicate-version warnings remain in the dependency inventory.
- Seven regular examples now cover local, safe/opaque error models, Tokio,
  tracing, Tower, Axum and Actix. They compile with strict lint, Rust 1.89 and
  independent feature checks. Dev-only Tokio signal support enables ordinary
  graceful server shutdown without changing the production dependency features.
- Candidate API/configuration docs, issue/PR templates and CI are present. CI
  covers Docker Linux x64/arm64, MSRV/current/previous stable, features, line
  coverage/audit, exact artifacts, native macOS and Windows HTTP/compile checks.
  Windows private file/relay support remains an implementation gap, not an
  inherent runtime limitation. CI source is unexecuted while the remote is empty.
- Public Rust candidate documentation and its registered route pass site tests,
  static build and typecheck in an isolated Docker copy. Site source remains
  undeployed and unrelated site changes are preserved.

Additional implementation review (13 November, ongoing):

- Added an optional `testkit::resources` numeric snapshot for queue, recovery,
  operation and process permit accounting. It exposes no payloads or identifiers;
  contended/inactive snapshots return `None`. Stopped operations release their
  own admission slots even if callers retain revoked context clones.
- Added 2,560 deterministic generated privacy/ACK/capability cases. These bounded
  property checks pass; they are not coverage-guided fuzzing or a concurrency
  model-checking claim.
- A new graph-composition regression demonstrated that aggregate builders erased
  existing cause edges and could orphan nodes. Both composition orders now retain
  reachable evidence; repeated additions respect shared edge/node/depth/byte
  limits. Byte pressure preserves previously accepted nodes and honestly marks
  omitted children. The new tests failed before the fix and pass afterward.
- The independent release-profile performance executable initially passed twenty
  ordinary/blocked-hook/custom-transport cases. A real loopback HTTP slow-peer
  lane then exposed lazy producer work under full event ownership when the
  callback lane was idle. A deterministic source regression also failed before
  the fix. Lazy admission now rechecks count/byte ownership before scheduling and
  before invocation. Twenty-two cases pass after the change. Three measured
  repeats now define explicit p99/allocation regression guards. Negative
  acceptance checks reject missing/duplicate cases, wrong runners, invalid
  receipts, resource excess and timing/allocation regressions.
- Published Browser 3.2.2 and exact dependencies are frozen in the independent
  browser consumer lockfile. Native Chromium passes through both extracted Rust
  relay adapters, each forwarding nine protected upstream events. Receipts cover
  proof bootstrap, nested causes, unsafe cause omission, recovery, backend trace,
  preflight, forged authority/authorization and no upstream cookies. Its legacy
  outer-error normalization performs guarded field reads on opaque inputs; this
  existing producer behaviour is separate from native cause-evidence traversal.
  No Browser SDK source, publication or consumer installation was changed.
- Refreshed strict Clippy, Rust 1.89 all-target checks, independent features and
  executable-line coverage pass for all 53 production modules after these fixes.
  Native CI, formal fuzz/model lanes and full release gates remain open.

## Final source and artifact review, 13 November

- The Windows private storage backend is implemented in `storage/windows.rs` and
  its narrow Win32 `ffi.rs` boundary. Pinned ancestor handles refuse reparse
  points and rename substitution; protected owner/System DACLs precede writes,
  existing files/ACLs/links are attested and publication is atomic/write-through.
  Native Windows fixtures include junction/hardlink/ACL widening and concurrent
  no-overwrite cases. Rust 1.89 Windows-target compilation and lint pass; these
  are not native MSVC execution, ACL durability or executable-line coverage proof.
- The actual Linux 64 KiB tmpfs fault lane passes real ENOSPC/short-write checks:
  partial files are removed, no canonical array is falsely published, all eight
  locally owned events survive the finite flush and no HTTP fallback is used.
- Snapshot field clipping now marks truncation, and unsafe child provenance
  survives cause/aggregate composition and byte-pressure fallback. All twelve
  model tests pass, including custom borrowed Display/Debug/source methods that
  would panic if invoked. The new regressions failed before the production fixes.
- Ten HTTP configuration cases pass, including failed initial discovery, valid
  legacy fallback, ETag/304 retention, invalid refresh exclusion, signed request
  isolation/key rotation and actual automatic paid polling at the instructed
  fifteen-second cadence. Valid/malformed ingestion policy piggyback tests remain
  separate from discovery transport tests.
- Refreshed Rust 1.99.1/1.100.0 all-feature suites, independent core/local/logger/
  framework features, Rust 1.89 all-target checks, panic profiles and strict lint
  pass. The final core-only panic gate caught an inactive Windows-local dependency
  edge added to its isolated lockfile. Removing that edge fixed the locked run;
  no dependency version/checksum changed. Core-only dependency inventory excludes
  optional HTTP, framework and subscriber stacks. Refreshed executable-line
  coverage passes all 53 Linux production modules; Windows' two private modules
  remain native-CI obligations.
- Four production-cfg AddressSanitizer fuzz targets pass after the final snapshot
  tests: wire/relay/files each ran 4,096 inputs; snapshots reached its thirty-second
  cap after 1,793. These are bounded sanitizer checks, not leak detection, exhaustive
  fuzzing or formal concurrency proof. An earlier whole-domain idempotence oracle
  rejected a malformed encoded credential that became more restricted on a second
  pass; Core behaves identically, no secret survived, and no such universal
  idempotence contract exists. The corrected oracle and compatibility regression
  preserve production privacy semantics.
- The fuzz workspace now declares Apache-2.0 and an exact local SDK version.
  Its separate dependency audit uses the production policy plus a named,
  version-specific NCSA allowance solely for test-only `libfuzzer-sys` 0.4.13.
  Production license policy and advisory suppressions are unchanged. SDK and
  fuzz dependency/advisory/source/license checks pass independently.
- Public namespace reads now return 404 from the crates.io index, crate and
  owner APIs. This records absence only; it reserves no name or ownership.
  The public GitHub repository still has no refs, verified with `git ls-remote`.
- CI creates one immutable `.crate` candidate and shares its SHA-256 across
  Linux x64/arm64, macOS/Windows and native Browser relay consumers. Pure Python
  tests reject unsafe archives, links/devices, missing/mismatched hashes, duplicate
  names, file ancestors and portable case/Unicode aliases before writing.
  Native helper tests do not execute host Rust. Manual release and genuine public
  registry consumers are prepared: source/commit/version/dry-run byte matching,
  explicitly selected bootstrap/OIDC authentication, public checksum and frozen
  registry-resolution verification. Negative registry tests and pinned actionlint
  pass. No workflow execution, publication, ownership or environment setup is
  implied. Initial trusted publishing still requires an existing owned crate.
- Compiled DebugBundle OpenClaw local-processing gates pass on Node 22.23.3,
  24.14.0 and 26.12.0, preserving project/environment isolation and useful
  same-scope full-stack grouping. Evidence:
  `/private/tmp/debugbundle-rust-openclaw-runtime.log`. This closes the additional
  compiled-reader regression gate; it is not a new plugin publication/adoption.

Pre-ship inventory covers SDK config/model/privacy/wire, client admission/sender/
HTTP/local ownership, callbacks/cleanup, operation/probe/recovery state, native
logging/panic, both middleware/body/relay adapters, private storage and durable
indexed spool, testkit, package/CI/release tooling, Cargo discovery, CLI guidance,
shared local scope/probe projection, Core reader/integration fixtures and candidate
site documentation. Bad input, contention, stale owners, partial ACK/retry,
timeouts, blocked callbacks, filesystem failure, stream cancellation, credential
isolation and cleanup have functional receipts. No database shape or deployment
change is involved. Native OS execution/coverage, including its same-candidate
artifact consumers, remain open; the review does not mark any slice or the goal
complete.

Final local candidate: `debugbundle-1.0.0-alpha.1.crate`, SHA-256
`236fd81171629a31d9ef4799c0c47112ce69a59386a3d7b829bb0c12da12d524`.
All packaged functional tests, exact-artifact panic profiles and independent
vanilla/Axum/non-Send Actix applications pass. The same archive passes the lower
Tokio 1.53.3 / Tower 0.5.2 consumer graph and both genuine Browser 3.2.2 relays.
Each Browser route forwards thirteen protected events, including opted-in
analytics/mixed batches, debug graph/recovery, native beacon, keepalive fallback,
backend trace and hostile credential fields. Analytics ordinary ACKs correctly do
not carry opt-in debug capability discovery. The first expanded harness assumed
otherwise; the contract-correct separate assertion passes without a producer or
relay change. Lifecycle preparation uses an observed deferred hook, not guessed
timer timing, and does not claim real-navigation unload delivery.

Candidate receipts are under the SDK's `.tmp/package-qualification/` (normal and
`lower/`), `.tmp/browser-qualification/`, `.tmp/coverage/`, `.tmp/audit/`,
`.tmp/fuzz/` and `.tmp/performance/`. These all refer to Linux arm64 local work;
there is still no Git commit/source push, native CI run or crates.io publication.
This local archive is not a promised future committed-CI artifact: Cargo may add
VCS provenance once source is committed. CI must qualify its own one-checksum
candidate across every required platform before release.

Current handoff: the owner explicitly approved committing/pushing the prepared
Rust SDK source and necessary SDK qualification fixes. Initial commit
`e2a7be11da889de07f817c312ed4a3ae78f55f5f` is on public `main`; qualification run
[`43386149247`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43386149247)
was superseded after its completed candidate job exposed a Python-version
exception difference in the negative TAR test. Python 3.12 rejects the malformed
header earlier with `tarfile.ReadError`; accepting that safe rejection alongside
the manual guard preserves the no-write assertion. All five local helper tests
pass. Commit `d54692c115c41ec004e4ac1e027f0e94d48784ca` contains only this test
portability fix. Current qualification run
[`43386753459`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43386753459)
is in progress. The first commit only removed a trailing manifest blank line from
the reviewed inventory. Root Core/site changes remain uncommitted. Releases are
explicitly on hold pending the owner's requested deep audit: do not run release
workflows, create releases, publish crates or change consumers. Inspect the live
matrix, fix SDK qualification failures and retain same-candidate per-platform
receipts before closing implementation. `.tmp/final-review.json` records 197 historical source files,
source-manifest SHA-256
`a462e7a68acca9a269593db39ebcc8a886af99a59d170467256f074ea92c9be8`.

Native qualification continuation (source push approved; release held):

- Commit `9e4bb48c4e427b041cba7bf5e575a66f8b29ab2e` fixes the actual Windows
  spool-retention failure: release the per-record lease before reading/removing
  its file while retaining the global spool guard. Windows lock contention now
  preserves `WouldBlock`. Native Windows run `43389554253` passes all 23 library
  tests, including the unchanged retention/recovery tests and new lease retry
  check. Later functional/coverage/artifact gates still require completion.
- The synthetic configuration server now makes accepted sockets blocking with a
  finite timeout and ignores closed/incomplete connections. An injected closed
  connection reproduced the prior mock-thread panic locally before the fix.
  Logging fixtures now observe bounded best-effort admission rather than assume
  flush reserves a mutex-free instant; exact application sink counts, recursion
  protection and recovery of the same disabled callsite remain asserted.
- Run `43389554253` passes candidate, Linux coverage/security and bounded fuzz.
  Both genuine Browser relays pass. macOS passes its complete runtime suite;
  its coverage gate identifies `recovery.rs` at 11/14 executable lines. Uncommitted
  tests now exercise every recovery state, explicit page/session scope and timing
  without lowering the 80 percent floor. They pass locally with strict lint.
- Linux/Windows recovery quota fixtures counted an operational pressure summary
  alongside recovery observations. The revised test fills and ACKs the exact
  twenty-observation allowance, attempts more, and still requires exactly twenty
  recovery events. Only canonical pressure summaries may appear beside them.
  The ledger's direct cardinality/byte tests and production limit stay unchanged.
- The resource guard's only measured latency overrun is the SDK-disabled Axum
  control: 11,320 ns against an 8,000 ns developer-host budget. Its allocation and
  resource checks remain within their unchanged limits. A GitHub runner requires
  its own reviewed numerical baseline, as the qualification guide already states.
  Isolated branch `ci/resource-baseline` at `3d4a84594b5895c66946cc67eedb53645c23bd15`
  changes only workflow definitions; SDK and benchmark source exactly match
  `9e4bb48`. Measurement-only run
  [`43393447198`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43393447198)
  records three same-source reports, host/toolchain and source hashes. It is not
  full qualification or release acceptance. Its branch has no publishing path.
  Review those measurements before choosing a separate CI baseline; do not simply
  raise thresholds to silence a failure. The developer-host baseline remains.
- Commit `0706383d0bb9fb43a28e26d0f199dcd09566ea6e` contains the recovery
  qualification tests and the separate GitHub runner baseline. Measurement run
  `43393447198` completed successfully; all 72 SDK/benchmark source hashes match
  `9e4bb48`. The three report SHA-256 values are
  `6dd9f9877560d79d0c039a9d0de94d8e1a080ccb4ecf9d05e3f199400c55e7a1`,
  `9f5d1748e86d3ea673c7adee9c2fcab781044bd8760998c1b35449cfbeced292`,
  `d8239b0f5492f4f653e5d7d79fef929cd1b15c2cbfd07eafbf9935be19deee25`.
  The checked-in CI baseline preserves the original four-times-p99/110-percent
  allocation policy, zero-allocation cases and every fixed resource cap. Its
  source digest and host/compiler/dependency hashes are recorded beside the
  measured values. The developer baseline is unchanged. Explicit baseline
  selection was demonstrated red before Make/test wiring and green afterwards;
  all three reports, the earlier failing CI report, rejection checks and workflow
  lint pass. The full qualification run
  [`43395654404`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43395654404)
  is now in progress on `0706383`; the calibration run alone is not acceptance.
  Its candidate job passes. The immutable candidate is 206,771 bytes, SHA-256
  `57fded122e8ad5b0907bd38340c798c86f6afd1209bd9dae0d2836d236256f1d`.
  Inspection confirms 126 regular package members, clean embedded VCS identity
  `0706383`, byte-identical included source (apart from Cargo's expected manifest
  normalization), and unchanged lock SHA-256
  `44156cdb30b3ac15a73a979fd83572dca102ccbd96a3b56ca66f058a04304560`.
  The current 198-file Git source inventory is separately retained at
  `.tmp/ci-0706383-source.json`, manifest SHA-256
  `cdc66900cb55c8fe8042db99531561d192f59b86540da6bf7b4ae6dd79410653`.
- Run `43395654404` passed candidate creation, bounded fuzz, both published
  Browser relay paths and all measured resource guards with the reviewed CI
  baseline. Windows and macOS each passed the complete source functional suite.
  Linux x64 passed its previous-stable/features/functional stage. The coverage
  job failed only `runtime/native.rs` at 32/42 executable lines: callback-inline
  and disconnected-close paths were unexercised; full-queue scheduling did not
  reliably contribute those incidental hits. Commit
  `908a46fd071b0b2cbacd2fc9581d0182dd6bd27d` adds two focused tests for actual
  locked-file closure, existing waiter notification and client-permit release
  through those paths. Production code is unchanged. Focused tests, strict
  format/lint, all 53 Linux per-file floors (native cleanup 37/42) and Windows
  Rust 1.89 cross-lint pass locally. Full qualification run
  [`43397367345`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43397367345)
  supersedes the prior run. New artifact/native receipts are still required;
  neither the prior mixed result nor local coverage marks this commit accepted.
  Its passing candidate job produces a 207,239-byte archive, SHA-256
  `39c0a84b375c2a0c05731eab334deb03e78aef8213f3b6b457e4501844be4742`,
  with 126 regular members and clean embedded commit `908a46f`. Included-source
  byte comparison passes apart from Cargo's expected manifest normalization;
  the lock hash remains `44156cdb…04304560`. The 198-file current Git source
  inventory is `.tmp/ci-908a46f-source.json`, manifest SHA-256
  `ec6aa7b20e7ff92b11cee84e5d73b365a20d8ad4fdf8aded60e7b4ee20560251`.
  The current-commit coverage/security job passes (all per-file floors plus
  dependency/advisory/license policy); native runtime and same-artifact consumer
  gates remain in progress.
- Run `43397367345` ended with two fixture failures, not full acceptance. Linux
  arm64 passes every source/compiler/exact-artifact/lower-consumer/panic gate.
  Windows passes the complete runtime, all 54 per-file floors and all three
  extracted-artifact applications using the exact `39c0a84b…44be4742` candidate.
  Windows storage has 178/206 covered lines, its FFI 210/233; the consumer-lock
  hash `84db9483…0863773` is exactly the CRLF checkout of frozen LF hash
  `ff3a0a6a…83740d5`, verified without dependency changes. Coverage/security, fuzz
  and Browser/resource jobs pass. macOS logging assumed two single-shot captures
  would both be admitted (observed one); Linux x64 passed all packaged tests and
  applications, then its old panic smoke failed while hiding assertion details.
- Commit `7b8e9bcb64e1aa06ece04f8163ebfce6227a4592` makes native logging/recovery
  fixtures observe bounded best-effort admission, retains exact application-sink
  counts and all formatting/pairing/scope assertions, and separates only canonical
  queue-pressure summaries from the requested observations. A subsequent local
  archive run exposed the same summary-vs-observation assumption in a stale-scope
  recovery assertion; actual diagnostics remain forbidden. Panic smoke retains
  default assertion diagnostics, checks every prior-hook invocation and zero owner
  hooks, and requires exactly one observed exception before stopping. Unwind and
  abort semantics are unchanged. The shell wrapper now prints failed smoke logs.
- Local archive inspection also exposed Cargo's unanchored basename patterns:
  a developer archive included ten dependency README/LICENSE files and
  `src/.DS_Store`. The clean CI archive contained none, and no crate was published.
  Anchored typed includes plus the shared pre-copy inventory guard now reject such
  development files. Seven adverse member cases failed before the guard and pass
  after it; positive source/fixture/example/document cases remain accepted. The
  documented examples README is retained. Earlier local archive receipts are
  historical and are not publication candidates.
- Full local strict lint/source tests, all 53 per-file floors, Windows MSRV lint,
  source panic profiles and extracted local-crate tests/applications/panic profiles
  pass after these corrections. Independent log-only and tracing-only fixtures,
  all six archive helper tests, workflow lint and the final 126-member package
  inventory also pass. All five frozen lockfiles retain their recorded hashes.
  No production `src/` code changed after the lease fix except tests. Full current
  qualification [run `43403436610`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43403436610)
  is in progress and must qualify its own immutable candidate on every platform.
- Run `43403436610` stopped at candidate creation: the validation-only helper
  attempted to create `.tmp/native-package` beneath Docker-owned output on Linux.
  This did not weaken archive checks or expose a runtime defect. Commit
  `446101e0ac67088774d4992fbea0288acc4d8f4f` skips repository output creation in
  `--prepare-only`; validation uses owned OS scratch and invokes no host Rust.
  A regression with an unwritable repository-output sentinel reproduces the
  failure before the fix and passes after it. All seven helper tests pass.
  Full qualification [run `43404451547`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43404451547)
  is current; same-commit native/artifact acceptance remains required.
  Candidate creation now passes: 208,574 bytes, 126 regular members, SHA-256
  `e2cdd69d7fb709426a889e34e86a7a11ef349125f16a64ce177dd7226e16229d`.
  Clean embedded VCS identity is `446101e`; included-source byte comparison
  passes apart from expected Cargo manifest normalization, with unchanged SDK
  lock hash. `.tmp/ci-446101e-source.json` retains the 198-file source inventory,
  manifest SHA-256 `c4f49874a468283222705f9228c90235bff9b08973bbcc87bf15ac3c1ca44722`.
- Run `43404451547` passes candidate, coverage/security, bounded fuzz and both
  Browser/resource paths. The corrected macOS functional suite passes and reaches
  native coverage. Linux x64's isolated ENOSPC fixture failed its pre-flush seed
  assertion (seven admitted, expected eight), before it tested disk retention.
  Commit `244c104692f72777061c66b0a835844bd07f84c6` observes admission of each
  distinct primary before flushing. Capacity is exactly eight so an operational
  pressure summary cannot take a ninth slot; retained bytes must exceed 100,000.
  The unchanged post-failure assertion still requires eight retained events,
  no partial files and no HTTP fallback. The real 64-KiB tmpfs test and strict
  lint pass locally. Production code and frozen locks are unchanged. Current full
  qualification [run `43406799897`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43406799897)
  must pass its own native and exact-artifact gates; prior mixed runs are not final
  acceptance.
  Candidate creation passes: 208,808 bytes, 126 regular members, SHA-256
  `6b1511cc8a3a7ead55fd8d951dc04bbdb6ce28c1493e262e9eda586399d56b20`.
  Clean embedded commit and included-source bytes match `244c104` (expected Cargo
  manifest normalization excluded). SDK lock hash remains unchanged. The 198-file
  source manifest is `.tmp/ci-244c104-source.json`, SHA-256
  `99976474549a91e91a77f68c9dfb3e913b862763c55e482ba77574fef887917a`.
- Final current-candidate result: [run `43406799897`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43406799897)
  is **successful**, all eight jobs on `244c104` pass. Native macOS and Windows
  each pass complete source and packaged suites, all per-file floors (53 and 54
  production modules respectively), plus independent vanilla/Axum/non-Send Actix
  TCP/middleware/durable-relay applications. Linux x64 and arm64 each additionally
  pass MSRV/current/previous compiler checks, isolated core and logger features,
  real ENOSPC, exact-crate normal/lower consumers and unwind/abort profiles.
  Both native receipts and both Linux normal/lower checksum files attest the
  exact `6b1511cc…99d56b20` candidate. Browser/resource, dependency/security/license,
  per-file coverage and bounded sanitizer jobs pass. Source remains sealed and
  clean; no SDK source was edited after qualification. Combined receipt:
  `sdks/debugbundle-rust/.tmp/ci-244c104/qualification.json`; all raw artifacts
  are retained under the same directory.
- SDK main is clean. Root Core/site work remains uncommitted. No release workflow,
  GitHub release, registry publication, production canary or consumer update is
  authorised. The owner's requested deep audit remains outstanding.

Implementation baseline for unrelated work is stored at
`/private/tmp/debugbundle-rust-implementation-baseline.json` (69 pre-existing dirty
files). Preserve concurrent unrelated edits per the updated AGENTS rule. Do not
reset, commit, push, publish, deploy or change any consumer product.
