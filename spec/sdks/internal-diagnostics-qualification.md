# SDK internal diagnostics remediation qualification

The subsequent [deep final audit](sdk-deep-audit-20261115.md) records additional
corrections and superseding source/artifact qualification. Earlier receipts below
remain historical evidence.

Date: 2026-11-15. Status: initial local qualification complete; deep final audit
completed in the linked superseding record.
Scope: DebugBundle SDKs and their own test/distribution harnesses.
The original [audit](internal-diagnostics-audit.md) records D1–D6 and red-state
reproductions. This record describes the corrected behaviour and local evidence
used by the completed deep final audit. Publication and consumer adoption are
separate actions; candidate artifacts retain the checkout versions.

## Implementation and compatibility

Six direct runtime surfaces changed: Node, Browser, Python, Go, Swift and
WordPress. React Native's native integration was qualified with the corrected
Swift archive; its runtime JavaScript/bridge implementation did not change.
All thirteen maintained surfaces were evaluated. The earlier hook-budget changes
remain part of the candidate source; this work preserves their regression corpus.

| Finding                                                             | Correction                                                                                                                                                                                                    | Compatibility preserved                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D1: Node diagnostic rejection, feedback and error rendering         | Scoped `AsyncLocalStorage` suppression across clients/async descendants; native Promise rejection handling; one pending Promise; bounded metadata/rate; data-only Error projection with no stack rendering    | Synchronous diagnostic invocation, native logger results, normal application capture, hook fallback and delivery decisions |
| D2: Go secondary diagnostic panic and raw retention                 | Configuration failures record the static `remote_config_failed` code without calling `Error()`                                                                                                                | Public `Diagnostics() []string`, 100-entry retention, config readiness/retry and sender ownership                          |
| D3: Python unsafe logger diagnostic sink and feedback               | One sanitised bounded sink; one daemon callback lane and one pending item; no callback under SDK locks; scoped recapture suppression, generation/disposal/fork handling and no replacement of stalled workers | Public callback argument shape and optional default, hook timing, normal logger/capture/flush/ACK/retry contracts          |
| D4: WordPress unsafe diagnostic persistence                         | Mandatory sanitisation before UTF-8 retention limit; oversized safe marker; failed/reentrant writes and reads contained; legacy stored values protected without rewriting data                                | Existing admin keys, seven-day TTL, status visibility and spool/ACK behaviour                                              |
| D5: Node custom privacy and Swift raw ACK detail                    | Configured Node sensitive fields applied to diagnostic metadata; Swift retains bounded protocol codes or `unknown_rejection`                                                                                  | Canonical event schemas and original ACK/retry decisions                                                                   |
| D6: Browser console warning privacy, recapture and ACK interruption | Bounded sanitised local console warnings, bounded code/reason summaries and deduplication, one pending console Promise, contained sink failures and capture/breadcrumb suppression                            | Existing auth/ACK warnings, normal application console breadcrumbs, status and retry bookkeeping                           |

Python diagnostics are deliberately asynchronous now: `flush()` guarantees event
delivery work, not completion of optional diagnostic callbacks. This is documented
in its README/changelog and the shared contract. The new worker is lazy, exits
when idle, and cannot be replaced while stalled, including across reinitialisation.
An already handed-off callback can finish after disposal. JavaScript callback
code still has to return promptly; a catch block cannot pre-empt the event loop.
Unsafe diagnostic details may be omitted or replaced by safe codes; they are not
a stable event schema or a substitute for application exception evidence.

No new endpoint, diagnostic sender, dependency, public capture API or event schema
was introduced. Application `diagnostic_context` events retain their existing
meaning. Normal configured configuration/ingestion/relay traffic is unchanged.
Explicit context updates from diagnostic callbacks remain supported; only recursive
event capture/flush is suppressed. SDK suppression does not control arbitrary I/O or unrelated threads explicitly
created by application callbacks.

## Requirements and regression coverage

NFR-REL-01a and AC-SDK-02a now make the no-hidden-reporting and diagnostic safety
rule explicit. INV-2, architectural constraints, SDK testing strategy and SDK
contract §1.3 agree on optional bounded local diagnostics. AC-SDK-02 no longer
requires unconditional diagnostic output. SEC-16/21/22/23a and FR-SDK-13a remain
the privacy/ownership baseline. Existing Browser console warnings and local
status snapshots are retained; silent SDKs remain silent.

Permanent functional tests cover callback throws, rejected native Promises,
hostile error rendering/accessors, logging feedback, unrelated later application
logs, custom sensitive fields, oversized metadata, pending Promise/worker bounds,
Python stalled callback/reinitialisation/rate/coroutine behaviour, WordPress
recursive/failed storage and Swift ACK diagnostic codes. The Browser tests also
prove console failure cannot interrupt terminal ACK bookkeeping. Original red
expectations are retained; tests were not weakened to accept the failures. The
pre-existing Python SDK test module exceeded the hard file-size limit, so capture
safety tests and shared setup were split into functional files without changing
test names or assertions. Shared setup and fixture resources are explicitly
included in the source distribution and checked by the package gate.

Installed Node, Python and Go canaries now exercise diagnostic failures through
public installed exports. The exact installed WordPress ZIP checks diagnostic
privacy and bounds as well as native/browser hooks, relay, spool, retry and
revocation. Swift's extracted source archive runs the diagnostic regression and
SPM/CocoaPods consumers. React Native real bare and Expo iOS consumers resolve
that extracted Swift source; stub bridge tests remain a separate evidence layer.
The RN harness now refreshes an existing local Podfile source when an explicit
candidate path changes, preventing reuse of an old native checkout.

## Surface applicability and verification

| Surface      | Disposition                     | Evidence in this remediation                                                                                                                                                          |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | Implemented                     | Full JS lint/types/coverage/build and installed package canaries; diagnostic and logger regressions                                                                                   |
| Browser      | Implemented                     | Full JS suite plus D6 regressions; rebuilt asset qualified in WordPress                                                                                                               |
| Python       | Implemented                     | 439 tests, Ruff, mypy, per-file coverage, wheel/sdist and installed framework/relay/diagnostic canaries                                                                               |
| Go           | Implemented                     | Full tests, per-file coverage, vet, race detector and installed module archive with diagnostic canary                                                                                 |
| Swift        | Implemented                     | 169 tests, 48-file coverage gate; exact extracted archive regression and SPM/CocoaPods iOS 15 consumers                                                                               |
| WordPress    | Implemented                     | 98 tests/486 assertions, PHPStan, 19-file coverage gate and actual staged plugin ZIP qualification                                                                                    |
| React Native | Verified dependency integration | 164 JS tests with coverage/type/build/packed checks; seven iOS bridge tests, Swift bridge 97.14% and Objective-C bridge 100%; real bare and Expo iOS delivery against corrected Swift |
| .NET         | Verified existing equivalence   | 16 CaptureSafety tests rerun; existing full 197-test/artifact qualification remains recorded in the hook-budget audit; runtime source unchanged here                                  |
| Java         | Verified existing equivalence   | 24 CaptureSafety tests rerun; existing full Maven/artifact qualification retained; runtime source unchanged here                                                                      |
| Ruby         | Verified existing equivalence   | 26 capture safety examples rerun; existing full 365-example/artifact qualification retained; runtime source unchanged here                                                            |
| PHP          | Verified existing equivalence   | 11 BeforeSend tests/291 assertions rerun; existing full 212-test/artifact qualification retained and bundled PHP candidate requalified in WordPress; runtime source unchanged here    |
| Android      | Verified existing equivalence   | Six CaptureSafety tests rerun; prior full/native/RN Android bridge qualification retained; runtime source unchanged here                                                              |
| Rust         | Verified existing equivalence   | 14 client safety/panic observer tests rerun; internal worker/callback guards prevent recapture; prior full/extracted-crate qualification retained; runtime source unchanged here      |

The unchanged surfaces have no new optional diagnostic callback/report transport
added. Their normal transport/config/framework failure handling and source owners
were reviewed in the original audit, alongside the fresh safety controls above.
These focused checks supplement the earlier full qualification; they are not a
new claim that every OS or every registry artifact was exercised today.

## Evidence and source baseline

Receipts live in `.tmp/internal-diagnostics-fix/`. `initial-state.json` preserves
the starting dirty state and HEADs; `source-inventory.json` records final candidate
source identities. The original reproductions remain under
`.tmp/internal-diagnostics-audit/`. Repository HEADs stay unchanged.

| Check                                                      | Receipt                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Node/Browser full final checks                             | `js-final-source.log` (678 tests)                                                                                    |
| Packed installed diagnostic canaries and retained archives | `js-export-final.log`                                                                                                |
| Python full gates and installed wheel                      | `python-production-ready.log`, `python-installed-qualified.log`                                                      |
| Go full/race/installed module                              | `go-full.log`, `go-race.log`, `go-installed-diagnostics.log`                                                         |
| Swift full/extracted/native consumers                      | `swift-full.log`, `swift-extracted-diagnostics.log`, `swift-installed.log`                                           |
| WordPress unit/static/coverage/ZIP                         | `wordpress-production-ready.log`, `wordpress-coverage-final.log`, `wordpress-release-ready.log`                      |
| RN JavaScript, bridge, real bare and Expo iOS              | `rn-js-full.log`, `rn-ios-bridge.log`, `rn-bare-ios-runtime.log`, `rn-expo-ios-runtime.log`                          |
| Unchanged SDK safety parity                                | `dotnet-parity.log`, `java-parity.log`, `ruby-parity.log`, `php-parity.log`, `android-parity.log`, `rust-parity.log` |
| Core contract/docs/types/format                            | `core-hook-contract.log`, `core-fixtures.log`, `core-docs.log`, `core-typecheck.log`, `core-format.log`              |

`artifact-identities.json` ties retained local archives to SHA-256 digests. The
WordPress staged qualification records the exact Browser/PHP/ZIP digests and its
prepublication-only marker. The Swift manifest and RN Podfile record the native
source used. Candidate archives use current checkout versions and are not new
registry releases or production adoption evidence.

Intermediate WordPress ZIP runs failed in the disposable harness with an unhealthy
container and a Docker API state error; their receipts are retained as
`wordpress-installed-final.log` and `wordpress-installed-qualified.log`. A fresh
run uses an explicit isolated Compose project after earlier cleanup completes,
without relaxing health checks or touching other products. The root health request
now sends the configured public Host (`127.0.0.1:18080`), matching WordPress
canonical URL handling while still connecting to the internal port 80. A raw
internal Host could redirect to the externally published port inside the container.
The health helper checks HTTP 200 after installation and only the known installer
302 before installation, without following that public port internally. Its eight
contract assertions reject server errors and unexpected redirects.
Failure cleanup now retains bounded service logs before deleting only this harness. Python test splitting
exposed timer leakage between older tests; the two split core modules now close
the clients they create. All 44 core/safety assertions pass in the focused rerun. A remaining pressure-only
flush test also raced its 60-second setup timer on the slow coverage runner; setup
now uses a long idle interval, then restores the original 0.1-second delivery
interval before flushing. Its automatic pressure-report assertion and 1.5-second
deadline remain unchanged.

The pre-ship review covers capture/transport/diagnostic ownership, invalid input,
concurrency and stalled work, privacy boundaries, listener/thread/queue cleanup,
contract compatibility and installed distributions. No database schema or hosted
runtime path changed. Native hard abort/OOM/foreign crashes and arbitrary blocking
JavaScript callbacks retain their documented runtime limits. CocoaPods' official
schedule was refreshed on 15 November: the announced permanent Trunk freeze is
still 2 December 2026; immutable Git-pod/SPM qualification remains separate from
any Trunk publication.

The subsequent deep final audit inspected these source identities, diagnostic
context guards and cleanup, bounded output/worker state, the documented Python
callback timing change and installed-artifact receipts. Its additional corrections
and final evidence are recorded in `sdk-deep-audit-20261115.md`. Version selection, any
React Native production pin update for the selected Swift release, registry
publication/readback and consumer adoption remain the separately authorised
release sequence. Nothing here commits, pushes, publishes or updates a consumer.
