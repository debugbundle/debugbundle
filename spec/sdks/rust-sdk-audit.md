# Rust SDK deep audit

Status: Rust source and exact-artifact audit qualified, 13 November 2026.
The subsequent [first alpha release](rust-sdk-release.md) publishes that same
qualified archive; core/spec/site remain local and undeployed. The audit began on `244c104692f72777061c66b0a835844bd07f84c6`;
final SDK source is **`eb9e09afc02751ebd34464bfa4b8808a565635b4`**.
Only Rust SDK source was committed/pushed, under the existing approval.
[Final qualification run `43468613263`](https://github.com/debugbundle/debugbundle-rust/actions/runs/43468613263)
passed all eight jobs. All seventeen findings have remediation and verification
evidence. The last correction adds manual-capture regression fixtures; production
Rust bytes are unchanged from `072cc5f`. Core/spec/site changes remain local.
The cross-SDK owner-hook follow-up below remains separate and unverified.

## Scope and method

Reviewed current requirements, acceptance, SDK/evidence contracts, security rules,
parity rule and [qualification matrix](rust-sdk-qualification.md), with Go and .NET
as behavioural references. Native framework/logger adapters, relays, Core/CLI
readers and public discovery pages are included. Source tests, native execution,
extracted artifacts, shared readers and documentation exports are separate gates.
All eleven other maintained SDK repositories retain their original clean HEADs;
no consumer product is in scope. Initial worktree hashes are retained in
`.tmp/rust-audit/initial-inventory.json`.

## Findings and remediation

| ID | Finding | Contract | Resolution and regression evidence |
| --- | --- | --- | --- |
| RUST-AUD-01 | Aggregate snapshots silently lost nested child edges within budget. | FR-EVID-01/03 | Red: five expected nodes became two. Cause and aggregate builders now share complete child-graph remapping and combined limits; rejection preserves prior nodes and honest truncation. All 14 model tests pass. |
| RUST-AUD-02 | Native HTTP qualification omitted real chain and hostname handshakes. | NFR-SEC-01; native TLS matrix | Added five real TLS tests for valid authenticated event/config requests, unknown root, wrong host, missing intermediate, expired leaf, redirects and timeout. Extra trust root is private to the test client. Production explicitly selects Rustls. Native portability corrections are described below; source and extracted-artifact qualification covers all four platform targets, with final receipts recorded below. |
| RUST-AUD-03 | Repository qualification prose was stale and public SDK entry points omitted Rust. | FR-SDK-35; documentation gates | Reconciled SDK/spec/contracts and 18 public documentation pages plus the homepage SDK catalogue, SDK/parity tables, CLI guidance and generated `llms.txt`. Article content and internal link targets pass static-export checks. Rust was labelled unpublished at audit completion; the later alpha publication is recorded separately. |
| RUST-AUD-04 | Public privacy-key matching lacked the internal callers' input bound. | SEC-16 | Red at 129 bytes. Reject names over 128 bytes before allocation/matching; 128-byte, 129-byte and very large input cases pass. |
| RUST-AUD-05 | Cargo-unified reqwest gzip decoded responses before the SDK could reject compression. | Rust transport boundary; SEC-16 | Red with a genuine gzip response despite `Accept-Encoding: identity`. Explicitly disable gzip/Brotli/deflate/zstd in the SDK client. The application client still decodes; SDK event/config requests reject the same compressed bytes. |
| RUST-AUD-06 | Rejected configuration destructors could unwind out of `Client::new`. | SDK failure isolation; plan section 3 | Red with a disabled-config transport destructor. Every rejected callback field now has a separate unwind boundary; disabled/invalid/capacity cases, two panicking fields and restored caller capture state pass. Synchronous bootstrap limitation remains explicit. |
| RUST-AUD-07 | Browser qualification withdrew analytics consent before deferred capture reached the relay. | Genuine Browser-to-relay acceptance | Failure receipt had no analytics request/event. Wait for the actual analytics relay ACK under a finite deadline before consent withdrawal; retain every original assertion. Published Browser 3.2.2 passes both local relay lanes, 13 protected events each. Browser SDK unchanged. |
| RUST-AUD-08 | An older Core context job could overwrite a completed recovery bundle using a newer generation's metadata without its primary occurrence. | FR-EVID-05/07/08; FR-PROC-07 | Intermittent real Rust pipeline timeout led to a deterministic two-write regression: recovery became absent. After reservation, a superseded job now completes without rewriting the newer bundle. Existing worker readers/persistence/reproduction and Rust discovery regression group passes (60 tests). This shared correction applies to all SDK evidence; no SDK wire change or migration. |
| RUST-AUD-09 | Native artifact helper discarded captured subprocess failure/timeout output. | Actionable native/artifact qualification evidence | Red/green helper test preserves exact output and original exception. All eight helper tests pass. All eight jobs subsequently passed on `937b1ce`; the earlier failure cannot be reconstructed from its lost output and remains historical evidence. |
| RUST-AUD-10 | A full callback queue could discard known relay ACK progress and allow same-process replay. | Canonical indexed ACKs; bounded durable ownership | Final Browser receipts exposed three repeated upstream IDs. A deterministic regression confirms the ACK update was abandoned when the callback queue was full. Persistence now waits on the existing bounded lane and retains its record/lease across failures; exact progress/completion retries are idempotent. Queue pressure, timeout, shutdown and lost-result regressions pass locally and in native source/artifact CI. Both real Browser relays pass the stricter no-duplicate gate. |
| RUST-AUD-11 | Disabled logging entered the full record-building function and exceeded its frozen first-call timing budget. | Cheap disabled capture; measured resource regression gate | Two unchanged-source CI attempts failed at 4,664/4,544 ns (3,000 ns budget); local reproduction reached 13,917 ns. A small no-sink admission wrapper now returns before record construction and its recursion guard. The unchanged disabled-log benchmark measures 291 ns locally and 416 ns in final CI, with zero allocations; all 22 final CI resource cases and application-sink filtering/flush, disabled/detached capture regressions pass. |
| RUST-AUD-12 | Rejected recursive logger/panic calls constructed and dropped eager guards, clearing protection still owned by their callers. | Native logger recursion and host safety | New unit regression proves the outer guard was lost; the repeated native bridge regression observed nine sink calls for one application log. Guard construction now occurs only after successful entry. Both `log` and `tracing` share this corrected owner. The same pattern in panic suppression has its own red/green regression; repeated-rejection and global composition tests cover the corrected boundaries. |
| RUST-AUD-13 | Resource-accounting qualification unconditionally unwrapped a non-waiting snapshot after flush. | Documented `testkit::resources` availability contract | ARM64 extracted-crate CI returned the permitted `None` during state contention. The test now waits under a two-second deadline only for snapshot availability; every queue/diagnostic/operation assertion still applies immediately to the first snapshot. Production code, capture and budgets are unchanged. |
| RUST-AUD-14 | Remote-policy qualification counted valid pressure summaries as captured requests. | Nonblocking admission and canonical queue-pressure summaries | Windows coverage failed with two records instead of one. The unchanged expectation reproduced locally on diagnostic attempt 34: one expected HTTP 500 request and one valid pressure summary, with no HTTP 408 request. The test now checks exact request paths/statuses, excludes only the canonical pressure summary, and retries absent eligible admission under a finite deadline. All eleven remote-configuration tests and strict lint pass. |
| RUST-AUD-15 | Snapshot composition admitted a graph below 32 KiB whose JSON field wrapper exceeded the shared evidence budget. | Canonical combined evidence byte budget; FR-EVID-01/03 | Snapshot fuzzing retained a 256-byte escaped-text input. Ordinary regression reproduces a 32,756-byte graph that fails the wrapped event budget. Composition now reserves the field wrapper within the unchanged limit, preserving honest truncation. The input is retained as an ordinary per-step regression and a permanent fuzz seed; all 177 source tests, strict lint and four bounded sanitizer campaigns pass, coverage passes all 53 Linux production modules and all 22 unchanged resource budgets pass. Final exact-artifact/native CI passes on all four platforms. |
| RUST-AUD-16 | Combined evidence overflow could discard a valid primary or classify an owner-hook replacement as invalid and restore owner-removed text. | SDK interface hook/privacy budget contract; optional evidence yields to the primary | Two deterministic regressions observed a missing primary and restoration of the original message. A shared borrowed-value size counter preserves canonical budget validation; capture reduces optional evidence after privacy, and hooks reduce it before invalid-shape fallback. Both regressions, all 179 ordinary source tests, strict lint, 53-module coverage and four sanitizer campaigns pass. Both Rust relays use this same hook helper and retain strict ingress validation. All 22 hosted resource gates and final native/artifact qualification pass. |
| RUST-AUD-17 | Windows native functional tests passed, but manual capture coverage missed the mandatory per-file floor. | SDK testing strategy: at least 80% executable lines per production module | The preserved receipt reports `client/capture.rs` at 235/296 (79.39%). New public API fixtures check protected error/message aliases, empty-message fallback, explicit deployment metadata, invalid/oversized request targets and omission of oversized protected bodies. All seven focused client tests, 181 ordinary full-suite tests, strict lint and all 53 Linux production-module coverage floors pass; final native/artifact qualification passes. Windows capture coverage is now 253/296 (85.47%), and all 54 Windows module floors pass. Production Rust source and coverage thresholds are unchanged. |

## Acceptance checklist

- [x] Safe snapshots, graphs, privacy, hooks and canonical evidence
- [x] Admission, suppression, ownership, cleanup and panic/logger safety
- [x] Operations, probes, recovery, policy and proof downgrade
- [x] HTTP/TLS, indexed ACK/retry/deadlines and local files
- [x] Tower/Axum/Actix request/response semantics and both durable relays
- [x] Core/CLI readers, Cargo discovery and stable SDK regression boundaries
- [x] Specs, contracts, repository guides and current public SDK references
- [x] Final native, compiler, feature and extracted-artifact CI on the exact source
- [x] Final measured performance acceptance with unchanged budgets
- [x] Final immutable evidence and release-hold reconciliation

## Boundary review and failure modes

| Boundary | Review disposition and exercised failures |
| --- | --- |
| Primitive/safe capture and canonical evidence | SDK-owned snapshots avoid arbitrary Display/Debug/source accessors. Graph composition now preserves nested edges; unsafe/omitted evidence is explicit. Shared wire/privacy corpus and model, owned JSON, evidence and panic tests cover byte/depth/node limits. |
| Admission, suppression, callbacks and cleanup | Cheap filters/full queues precede lazy work. Event/byte ownership covers pending and in-flight items. One bounded callback lane does not spawn replacements for stalled application code; deferred cleanup retains its reservation. Queue, lifecycle, destructor and suppression suites cover contention and shutdown. |
| Native logging and panic observation | `tracing` is a composable layer; `log` preserves existing sinks and opaque arguments are not formatted. Exact occurrence pairing happens only after admission. Panic observation chains the previous hook, is revocable, and makes no abort-time delivery promise. Dedicated child-process profiles cover unwind/abort. |
| Operations, probes and recovery | Poll-scoped, client-bound handles revoke descendants and cannot leak into sibling tasks. Trigger tokens are request-bound, signed and expiry-checked. Lazy probe work shares queue/ledger bounds. Recovery requires local opt-in, negotiated proof and explicit application facts; ACK does not refund observation quotas. |
| HTTP, policy and proof | Native authenticated config starts conservatively; ETag/304 preserves last valid policy. Strict indexed ACKs release only known accepted IDs; malformed/partial replies, revoked proof and deadlines retain or drop ownership according to the contract. Real TLS and Cargo-unified gzip tests close the audit gaps. |
| Framework adapters | Tower readiness/calls and Actix non-Send futures remain native. Body wrappers retain request scopes through streaming completion/drop, cancellation releases ownership, and ingestion/relay paths are excluded. Request/header/body limits and trace/origin rules use shared protected helpers. |
| Browser relays and durable delivery | Both factories share client-wide ingress/rate budgets before upload reads. Origin, peer/proxy trust, schema, owner hook and privacy checks precede retention. Analytics uses a distinct schema. Authenticated metadata binds immutable arrays to endpoint/token scope; per-index ACK progress survives restart and prevents accepted-ID replay. Terminal/no-receipt records cannot become delivered markers. |
| Local and spool files | Linux/macOS use no-follow descriptor-relative operations, private ownership and atomic no-replace publication. Windows pins ancestors without delete-sharing, rejects reparse/hardlink paths and attests private DACLs through its narrow ABI boundary. Unsupported OS storage fails closed. Disk-full, stale-directory, tampered-marker, retained-lock and native ACL tests remain required. |
| Core and CLI | Rust stack matching is gated by runtime/shape; canonical fingerprint and other-runtime fixtures remain stable. Local-only project binding preserves explicit scope and input bytes. Inline probe projection is shared with the worker. Cargo discovery reads bounded manifests without executing Cargo or rewriting source. |
| Packaging and release | Approved include/extraction inventory rejects hidden or unrelated payloads. One checksum is shared by exact-crate CI consumers. Only the manual release workflow can publish, after source/checksum checks and environment approval. No workflow dispatch, tag, registry publication, site deployment or consumer adoption was performed. |

No database schema or hosted runtime change is part of this audit. The shared
worker correction is local source only and needs a separately authorised Core
release before it affects hosted installations.

## Documentation inventory

Rust references now cover the repository SDK catalog, language roadmap, execution
and qualification plans, requirements/acceptance, universal SDK/relay contract,
architecture overviews and the test strategy. Public paths cover `/docs`,
installation, both cloud/local quickstarts, How it works, FAQ, the SDK index and
parity table, universal API, browser relay, CLI setup/local workflow, local-only
and split frontend/backend setup, profile runtimes, capture policy, probes,
redaction and the generated `llms.txt` index. The dedicated Rust guide is registered
in the content source. Existing page components/layouts are reused.

Generic home/analytics/API prose that does not enumerate runtimes, language-specific
SDK guides, WordPress-only integration instructions and historical blog/release
posts do not need Rust inserted. At audit completion the crate was unpublished;
the subsequent [alpha publication](rust-sdk-release.md) adds exact-version
crates.io install commands. Rust local mode is explicit; Node environment defaults are not
presented as universal. Source/export checks are distinct from a deployed website. The homepage quick
installation guide reuses the existing SDK-tab definition, link styles and icon;
no new layout, interaction or design token is introduced.

The owner-requested naming follow-up uses "Rust" or "Rust SDK" in public labels,
with publication status kept separately. Homepage, installation/quickstart tabs,
SDK tables, sidebar and machine-readable discovery place Rust after PHP. Tab
panels move with their labels, and capability values retain their runtime owners.
This public/core documentation change leaves the SDK's sealed release source
and active manual release workflow unchanged.

## Verification and provenance

- Core/CLI: 23 files / 185 tests pass across all stack formats, Cargo discovery,
  local processing, setup/relay and worker evidence (`core-regression.log`).
- Worker recovery correction: 13 files / 60 tests pass (`worker-regression-final.log`);
  the deterministic red receipt is `core-recovery-replay-red.log`.
- Final-candidate fixture: four files / 12 worker, reader, CLI and public discovery
  checks pass, followed by the disposable real ingestion/worker/bundle replay
  (`final-fixture-regression.log`, `current-artifact-core-final.log`). The three
  events are unchanged output from the sealed extracted crate.
- SDK local source: 181 ordinary all-feature tests and strict lint pass; the
  disk-full case remains a separate bounded Linux tmpfs gate. All 53 Linux
  production modules meet their individual executable-line floors. Final compiler,
  feature, native and extracted-artifact CI passes on Linux x64/arm64, macOS ARM64
  and Windows x64. All 53 macOS and 54 Windows production-module floors pass.
- Site: 98 tests, 150-page static export and typecheck pass. HTML checks verify
  Rust in all 18 affected article bodies, their internal documentation links,
  and the homepage SDK catalogue,
  the synchronous-bootstrap guidance and labelled machine-readable candidate link.
  Receipts: `site-check-final.log`, `site-export-verification.json`. No visual
  browser review or website deployment was performed.
- Final CI Browser acceptance: published Browser 3.2.2 through both extracted
  Rust adapters passes all assertions, with 13 upstream records each and no
  repeated IDs (`.tmp/ci-eb9e09a/browser-verification.json`).
- Final CI resource receipts cover 22 scenarios with caller-allocation and sampled
  ownership measurements, all under the unchanged budgets. The full checker and
  its rejection tests also pass against the downloaded CI report. Two local runs
  failed different latency limits, as recorded below; neither is relabelled as a
  pass. Whole-process RSS is not treated as a total SDK heap guarantee. All four
  production fuzz targets pass their bounded campaigns on this source. Receipts
  are under `.tmp/ci-eb9e09a`, including `performance-verification.json` and
  `fuzz-verification.json`.
- Shared fixtures are byte-identical to current Core; other maintained SDK HEADs
  remain unchanged (`fixture-parity.json`, `stable-sdk-inventory.json`).

Root receipts live under `.tmp/rust-audit`; SDK receipts under
`sdks/debugbundle-rust/.tmp`. The final local candidate is sealed:
`debugbundle-1.0.0-alpha.1.crate`, 224,714 bytes / 131 regular archive members,
SHA-256 `1aed6405f1b6b80ef9430d8300e9efe330a9e06be8c51587da0a41fe07abd8bc`,
embedded clean VCS `eb9e09afc02751ebd34464bfa4b8808a565635b4`.
The source manifest covers 204 tracked inputs; all 129 nongenerated archive source
members match checkout bytes. Manifest SHA-256:
`55d7e32b5025d54c3d2f07a7ecddffe4138ab75532b0a8b6b33ff4916136b3fb`.
`.tmp/ci-eb9e09a/identity.json` records this provenance and confirms production
source is byte-identical to `072cc5f`. The local and CI crate bytes are identical.
All 181 packaged tests, three independent applications and panic profiles pass
locally. The three protected events copied unchanged from this crate have SHA-256
`5282c31164e4582ea52077a1f7f7b5261129dd0e98382e300995bb1d233e4508`.
The refreshed 12 worker/reader/CLI/discovery tests and disposable actual Core
pipeline pass. `current-artifact-core-fixture.json` records exact provenance.
Final native/artifact CI passes on all four platforms. The complete machine-readable
receipt is `.tmp/ci-eb9e09a/qualification.json`; the source manifest, archive,
lockfile digests and native/Browser/resource/fuzz receipts are retained alongside it.
Windows checks out the frozen consumer-fixture lockfile with CRLF: its raw digest
`84db948368db4237579bfc0e1418a9ec401b1b658fb4431923435e2c50863773`
exactly matches conversion of the LF source bytes, whose digest is
`ff3a0a6a75613a8ab59fff71d589e2530c1dfc64a7d25732fe71d9ce483740d5`.
No dependency-resolution difference is accepted by this check. The immutable
crate and its SDK lockfile remain byte-identical on every platform.

## Qualification failures retained as evidence

Earlier audit candidates `89d3d0d`, `be4a836` and `c1e44d2` are superseded;
their successful subsets do not qualify the final commit. Native CI exposed
synthetic TLS fixture portability issues. macOS rejected the original ten-year
leaf with `OtherTrustValidityPeriod`; a one-year leaf passes a read-only local
native trust check, with no keychain changes. See [Apple's certificate
requirements](https://support.apple.com/en-us/103769). Issuer validity is nested,
complete HTTP request bodies are drained, and TLS close-notify is sent. The
accepted socket is explicitly switched back to blocking mode because BSD/Windows
may inherit the listener's nonblocking mode. Production certificate/hostname
validation is unchanged. Test-only failure diagnostics expose no production errors.

The first final Core replay timed out after successful ingestion. Two diagnostic
reruns passed, but were not accepted as a reason to dismiss the failure. The
out-of-order context-job regression reproduced evidence loss deterministically
and now passes with the worker correction. Initial failure logs are retained.

The macOS `d0bbbf0` source and coverage gates passed, but extracted-crate tests
returned exit 101. The native package helper lost captured subprocess output on
failure, so the underlying failure is not yet diagnosed. `937b1ce` preserves
failure/timeout output in CI while retaining the original exception; its regression
fails before the correction and all eight helper tests pass after it. All eight
`937b1ce` jobs subsequently passed, including native packaged tests. The lost
prior failure cannot be reconstructed; no causal diagnosis is claimed for it.
No production Rust source changed in that diagnostic commit. The later RUST-AUD-10
correction also passes its own exact-source native/artifact acceptance.

The `937b1ce` Axum Browser receipt contained 16 upstream records including three
repeated IDs, although all workflow jobs passed. Receipt review produced
RUST-AUD-10's deterministic full-queue ACK regression and the stricter native
Browser duplicate-ID assertion. Its cause is established by that regression;
the unrelated historical macOS failure is not attributed to it.

Two `5efcdbd` performance attempts exceeded only the disabled-log p99 guard:
4,664 and 4,544 ns against 3,000 ns. Median 48 ns and zero allocations matched the
preceding passing run; all other 21 cases and resource/allocation bounds passed.
The disabled logging and benchmark sources had not changed. The one same-commit
retry confirmed the regression; it was not dismissed as runner variance.

Local reproduction reached 13,917 ns. Disassembly showed that even disabled capture
entered the 2,664-byte record-building function, reserved its 544-byte stack frame
and called the recursion guard before admission. A small inline no-sink admission
wrapper now avoids that function on rejection; the original tee/filter/guard path
remains intact. The first local correction reports 334 ns; final source including guard fixes
reports 291 ns and zero allocations,
and all 22 local resource cases pass. No sample, warmup, percentile calculation or
budget was changed. The source-level cost is removed; the precise linker/page-cache
cause of the difference between earlier builds is not asserted. Both failed CI
receipts and the local before/after measurements are retained. The subsequent
`7fc1682` CI passed all 22 cases with disabled logging at 368 ns; the current
`072cc5f` CI independently passes all 22 cases with disabled logging at 400 ns.
Both retain zero caller allocations.

The `7fc1682` run passed seven jobs, including native macOS/Windows and Linux x64
packaged applications, but ARM64 packaged tests unwrapped `None` from the documented
non-waiting resource snapshot immediately after flush. Source/API documentation
and `try_lock` behaviour establish that this is permitted contention. The test-only
`ec2901d` correction waits up to two seconds for availability and checks all original
accounting values on the first snapshot; it never retries an incorrect value.
All three focused testkit tests and strict lint pass. Production source is byte-
identical to `7fc1682`; the new crate still requires fresh exact-artifact CI.
The failed job log and archive are retained under `.tmp/ci-7fc1682` and
`deep-audit-7fc1682-arm-failed.log`.

The `ec2901d` Windows source suite passed, but instrumented native coverage failed
at the initial-discovery test's total-record count. A bounded local diagnostic
reproduced the same assertion on attempt 34 and retained the actual records: the
expected `/unknown-500` request and an `error_suppressed` queue-pressure summary.
The SDK's documented nonblocking admission may record pressure when configuration
work owns its state mutex. No `/unknown-408` request was emitted. RUST-AUD-14 checks
exact request paths and statuses, ignores only this canonical operational summary,
and retries only absent eligible admission within two seconds. It does not retry
incorrect events or alter production policy. The original Windows log and local
red receipt remain in `deep-audit-ec2901d-windows-failed.log` and
`deep-audit-remote-policy-diagnostic.log`. Final source qualification must pass
independently; successful subsets of `ec2901d` do not close it.

Run `43454266604` exposed the wrapper-budget defect in RUST-AUD-15. Its
`rust-bounded-fuzz` artifact retains the exact input and sanitizer assertion log;
`deep-audit-snapshot-fuzz-diagnostic.log` reproduces the same byte-boundary failure
as an ordinary test. The graph itself occupied 32,756 bytes, but its enclosing
`exception_evidence` field exceeded the 32 KiB combined budget. The source fix
reserves this wrapper during composition, without weakening event validation or
raising any limit. The retained input passes in the new bounded snapshot campaign,
and all four local sanitizer targets pass. The same old CI run also lost its
macOS job before execution: GitHub reported hosted arm64 runner capacity
constraints and failure to acquire a runner. No SDK test ran in that cancelled
job; provider annotations are retained separately. Current Go and .NET combined evidence validators already count
the enclosing additions object; this correction is to the Rust-owned snapshot
builder's admission boundary, not a new cross-SDK contract.

The combined-budget correction passes all 179 ordinary source tests, strict lint,
all 53 Linux module coverage floors and all four bounded sanitizer campaigns.
Two local performance runs retained different isolated latency failures:
`log/evidence` p99 491,792 ns against 398,000 ns, then `axum/disabled` p99
15,208 ns against 8,000 ns. Logging passed the second run at 152,625 ns; disabled
Axum passed the first at 4,709 ns and its median remained about 958 ns in both.
All other cases and allocation/resource bounds passed each run. Disabled Axum
does not call the changed evidence validator. These observations suggest timing
variance but do not establish its cause or turn either report into a pass.
Both reports are retained. Final hosted CI independently passes all 22 cases
against its existing pinned-runner baseline; the downloaded report also passes
the complete resource checker and its rejection tests. This qualifies the hosted
performance lane without asserting a cause for the local outliers. No benchmark
sample count, warmup, calculation or budget was changed.

The `ef4d9f7` macOS job also failed to acquire a hosted ARM64 runner before any
step ran. Provider annotations explicitly report capacity constraints. Earlier
macOS successes did not qualify the latest crate. The final `eb9e09a` ARM64 job
acquired a runner and passed source, coverage, packaged tests and all three
applications; the provider failures remain retained separately.

The `072cc5f` Windows job completed its functional tests but failed the strict
per-file coverage gate: `client/capture.rs` reached 235/296 (79.39%), below 80%.
The native LCOV file and complete job log are retained. Manual public capture
aliases and explicit deployment/request boundaries lacked direct regression
fixtures. The added tests assert canonical protected payloads at transport,
correlation, empty-message fallback, invalid/oversized target handling and body
omission; they do not merely call these methods for coverage. Production Rust
source and the coverage checker/threshold remain unchanged. Final `eb9e09a`
qualification passes all eight jobs; Windows capture coverage is 253/296 (85.47%),
with all 54 native production modules above their unchanged floor.

### Cross-SDK follow-up from the combined-budget review

The owner-hook budget case applies across maintained SDKs. Source review found
similar "semantic rejection returns the protected original" paths in Go
(`before_send.go` + `internal/evidence/wire.go`) and .NET (`BeforeSendProcessor.cs`
+ `EvidenceWire.cs`), and identified the corresponding Node/Browser, Python, PHP,
Ruby, Java, Android, Swift and React Native hook owners. WordPress inherits its
bundled PHP/Browser boundaries. These source paths need separate runtime
reproduction and qualification; they are not verified equivalent to the Rust fix.
No other SDK repository was changed, and no family-wide parity closure is claimed.
The Rust scope includes the core and both framework/relay adapters, all of which
use the corrected wire/hook owners. This follow-up does not represent an observed
production incident or a Rust-induced regression in those unchanged repositories.

## Explicit limits and release hold

`Client::new` is synchronous application bootstrap, including TLS/runtime setup.
Rejected configuration callback destructors cannot be sandboxed against arbitrary
blocking or process abort; their unwinds are contained independently. No unbounded
rejection cleanup queue, leaked callbacks or replacement worker is introduced.
Admitted capture and last-client-drop keep their bounded worker isolation.

Rust supplies safe explicit snapshots rather than inspecting arbitrary borrowed
`Display`, `Debug` or error-source accessors. Panic-abort cannot guarantee delivery.
Linux/macOS/Windows are the qualified private-file platforms; other OS file storage
fails closed. The published Browser's existing outer-error getter behaviour is
recorded separately from Rust/native graph accessor guarantees.

Crate publication, a release tag/workflow, registry-consumer acceptance after
publication, Core/site commits and deployment, and consumer adoption remain
separate actions. None was performed. Refresh contract/fixture/provider and exact
artifact gates for a future authorised release. No new glossary term or database
schema change is introduced by this audit.
