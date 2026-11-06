# Multiline exception capture — final local release audit

6 November 2026. Local qualification complete; combined publication is not yet
green because the release gates below remain open. This record does not authorise a
commit, push, publication, deployment, consumer upgrade or incident mutation.
The [investigation and twelve-surface audit](multiline-exception-capture.md)
contains the capture-to-notification diagnosis and compatibility limits.

## Issues found and corrected during the final audit

| Finding | Correction and regression |
| --- | --- |
| Java native JUL exceptions and filtered records could leave an earlier text assembly open. | End that stream's assembly at the boundary, preserving the existing rule that filtered records do not invoke exception/message accessors. Test that a later frame stays unmatched rather than entering the earlier exception. |
| Java orphan drains could consume concurrent refills indefinitely, and separate counter/sample updates could strand evidence. Retired client references did not expire. | One bounded, non-blocking snapshot owns count and samples; retire/remove the bucket at drain. A racing caller falls back to protected continuation capture. Concurrent production/drain regression preserves the 16-sample limit. |
| WARNING orphan summaries passed the SDK's special handling but failed hosted minimal/error-only admission. | Keep ERROR on the wire. An explicitly marked, shape-checked Java stderr summary is context-only in the worker. Ordinary errors and other runtimes retain incident eligibility. **Hosted classifier must precede Java adoption.** |
| New Java/Node/Python/Ruby/.NET identity receipts could suppress a report after rejected admission, or suppress another native log record. PHP's existing WeakMap had the rejected-admission problem too. | Record only accepted handoffs; consume one opposite-path receipt. Same-path native records remain separate in the new guards. Deferred hooks, and deferred .NET sampling, preserve uncertain candidates. Independent overlapping logger bridges without a shared emission token can still report twice. PHP keeps its existing identity semantics and recursive-hook guard but releases rejected receipts. Tests first failed, then passed for repeated native records and a rejected first report. |
| A partially failed Node native-logger attachment left earlier methods wrapped. | Roll back installed wrappers and make any non-restorable wrapper inactive. A real Pino read-only-method fixture failed before the correction and passes afterward. Generic bridges also retain the log message. |
| New logging/identity paths could invoke application-defined metadata accessors in Java, Node and .NET, or an overridden Ruby `equal?`. | Read SDK-owned protected context in Java/.NET/Ruby and use Ruby's bound native identity method. Node takes a bounded data-slot snapshot without invoking getters, proxies or serializers. Throwing accessor/equality regressions failed before the fixes and now preserve the primary exception with zero application callback invocations. |
| Local release helpers had stale assumptions. | Include Java 17 in the maintained matrix; bootstrap pinned Corepack in Node 26 containers; accept explicit current Swift qualification receipts instead of historical `/tmp` paths; allow WordPress staging against the Browser artifact's exact published core pins without forcing an unrelated dependency upgrade. Default local-core candidate checks remain strict. |

These changes do not add a schema migration, change the bundle schema or rewrite
the hosted fingerprint algorithm. Existing GET/POST grouping remains intentional.
No customer fixtures or production data were used.

## Qualification ledger

Results below are local. Counts represent a suite once, rather than adding the
same tests across runtime lanes.

| Surface | Evidence |
| --- | --- |
| Core API/worker | `make ci` passes: lint, TypeScript, 5,253 tests across 112 coverage shards (including the isolated Postgres shard), changed-source coverage and build. Merged line coverage is 87.83%. Another 61 integration tests across eight suites pass with isolated Postgres, Redis and LocalStack: ingestion, replay idempotency, occurrence/probe context, worker durability/recovery and alert delivery/retry ownership. |
| Java | Final matrix passes: 217 tests, per-file coverage, package/Javadoc checks and installed application smokes on Java 17/21/25/26/27; Spring Boot 4.1.1 also passes on Java 27. Includes actual JBoss redirected-stderr, filtered/native boundaries, orphan concurrency/expiry, hostile metadata and unavailable transport. |
| Node / Browser | 611 tests, lint, types, per-file coverage, build and clean packed Node/Browser delivery/privacy checks pass on Node 24 and 26. Browser capture behaviour remains unchanged. |
| Python | 403 tests and per-file coverage on Python 3.10–3.14; Ruff/mypy/build on 3.12. Clean wheel applications qualify native and framework/relay delivery. |
| PHP | 210 tests / 3,506 assertions and PHPStan pass. Native evidence smoke passes on PHP 8.2–8.5. Rejected-hook/reentrant identity regression included. |
| WordPress | Existing 93-test / 461-assertion suite with corrected PHP plus a staged ZIP containing the corrected PHP archive and Browser artifact. Installed ZIP passes policy, native/browser delivery, durable retry, revocation and exact asset checks. The ZIP is explicitly marked unpublished and is not a publishable registry release. |
| Ruby | 338 examples, RuboCop, per-file coverage and gem build. Clean installed consumers pass on Ruby 3.1.6, 3.2, 3.3, 3.4.2 and 4.0. |
| Go | Full tests, coverage/vet and installed application/relay smoke matrix on Go 1.21, 1.26 and 1.27. |
| .NET | 195 tests across eight projects, builds and clean NuGet application delivery on .NET 8 and 10. Coverage passes for all 66 production C# files. Changed-file formatting verified separately. |
| Android | Full test/coverage/metadata verification from the implementation pass; fresh Maven-family packaging/license and installed application smoke pass. No physical-device acceptance claimed. |
| Swift | 166 native tests/coverage from implementation; fresh iOS simulator suite passes all 169 tests. A retained source archive passes clean SPM/CocoaPods delivery and the iOS 15 build. The same archive builds and delivers through a clean Swift 5.10 consumer. This does not qualify new public Git/Trunk distribution. |
| React Native | 128 JS tests/types/build from implementation, fresh packed canonical/legacy hook checks and both native wrapper coverage gates. The iOS wrapper harness is not a production SPM installation path. |

The Java identity regression holds deferred exception projection outside the queue
lock, so it tests receipt behaviour independently of documented non-blocking
contention drops. Assertions were retained. Queue pressure, transport failure,
redaction and ordinary log behaviour remain covered by the SDK suites.

Raw current-run logs use `/tmp/debugbundle-*.log`, alongside the SDKs'
`.tmp/evidence-runtime/` or `tmp/evidence-runtime/` logs. Local source identities
are recorded in `.tmp/multiline-release-audit/source-manifest.json`. These are
uncommitted candidates, not immutable public releases.

All twelve surfaces have an applicability/disposition record. Final changed-file
whitespace checks and source-file size checks pass in core and all eleven SDK
repositories. No unresolved local regression failure remains in these checks;
runtime ambiguity and overload limits remain explicit in the investigation.

## Release disposition and remaining gates

- Publish/deploy only after separate authorisation. Deploy the compatible hosted
  classifier first, then publish/adopt Java and other corrected SDKs. No data
  migration or historical incident cleanup is required.
- Candidate version manifests still contain the preceding releases. Select new
  patch versions, update aligned families/native dependency floors and prepare
  immutable release commits/tags before publication. Never publish these bytes
  over an existing version. Rebuild final artifacts from those identities.
- Swift/React Native retain the separate **open**
  [CocoaPods transition gate](cocoapods-trunk-transition.md): the provider schedule
  was refreshed on 6 November; a supported path independent of new Trunk writes,
  matching automation and clean bare-RN/Expo consumers must be qualified. Local
  path-pod success does not close this gate. Independent backend/core releases
  are not blocked by it.
- Registry-installed final artifacts, public source CI and hosted rollout checks
  belong to the authorised release. WordPress must rebuild its final ZIP against
  published prerequisites; React Native must qualify published native artifacts.
- A stringified trace and a separately reported native exception have no shared
  occurrence token. Same-object rethrows and asynchronous callbacks without
  propagated ownership remain ambiguous. Preserve evidence in those cases;
  do not promise perfect cross-channel deduplication. Bounded capture may drop
  telemetry under overload; it must not block the application.

All consumer installations, production settings, incident state and notification
configuration remain unchanged.
