# CI failure follow-up — 2 November 2026

Scope: source fixes for DebugBundle core and Ruby CI. The owner authorised commit
and push on 2 November 2026; pushes to `main` trigger the existing CI workflows.
No publication, deployment, consumer adoption or manual workflow dispatch is included.

## Requirements and causes

- FR-MCP-11 / AC-MCP-12: release verification must reject evidence from changed
  source. The positive infrastructure test incorrectly required an older tracked
  release manifest to verify at every later core commit. Prepare fresh evidence
  only inside its disposable clone before checking exact package hashes. The
  source-edit negative case first proves its fixture valid. The tracked manifest
  and the production verifier remain unchanged.
- The `isolated-portable` rejection is intentional under AC-MCP-12. Capture its
  expected subprocess stderr so it cannot obscure an unrelated failed test.
- NFR-PERF-01, NFR-REL-01, AC-SDK-SAFETY-CALLER and SEC-16/21/22/23/23a:
  Ruby's CI runner exceeded the existing 1.5-second budget for 200 enriched
  exceptions. Its privacy traversal repeatedly scanned identical frame keys.
  Reuse field-name decisions and short unchanged scalar text within one protection
  operation, each capped at 256 entries. Scalar reuse is limited to 128 bytes and
  excludes structured or redacted text. Keep value traversal, output ownership, mandatory/custom rules,
  cycle detection, byte/node limits and the original timing gate.

## SDK applicability

The observable privacy/capture contract is unchanged. This is a Ruby implementation
optimisation, not a new SDK capability or a claim of equal runtime timings.
The following source review covers all maintained capture surfaces. Existing
green CI results are baseline evidence; unchanged SDKs are not requalified here.

| Surface      | Disposition and evidence                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | Already equivalent mandatory bounded protection through core `packages/redaction/src/telemetry.ts`; sender owns deferred capture. No Ruby traversal.                                                                                        |
| Browser      | Already equivalent shared telemetry protection and bounded transport ownership; no Ruby traversal.                                                                                                                                          |
| Python       | Already equivalent `src/debugbundle/redaction.py` owns per-call fields, nodes, bytes and cycle state. No Ruby traversal.                                                                                                                    |
| PHP          | Already equivalent `src/TelemetryPrivacy.php` owns bounded per-call state; documented request-end delivery exception remains.                                                                                                               |
| WordPress    | Already equivalent through bundled PHP protection and its independently bounded relay; inherits the PHP runtime exception. No dependency change.                                                                                            |
| Java         | Already equivalent `TelemetryPrivacy.java` uses per-call Work and precompiled mandatory patterns; no Ruby traversal.                                                                                                                        |
| Go           | Already equivalent `redaction/telemetry.go` owns per-operation policy and bounded work; no Ruby traversal.                                                                                                                                  |
| Ruby         | Implement: `TelemetryPrivacy` bounds per-operation key decisions and short unchanged text to 256 entries each. Rack/Rails and Sidekiq use the same implementation. Privacy, evidence, hook, relay and safety/performance regressions apply. |
| .NET         | Already equivalent `Redaction/TelemetryPrivacy.cs` owns per-operation Work and retained immutable patterns; no Ruby traversal.                                                                                                              |
| Android      | Already equivalent `internal/TelemetryPrivacy.kt` already has the same bounded, per-protection 256-key decision cache.                                                                                                                      |
| Swift/iOS    | Already equivalent `DebugBundleTelemetryPrivacy.swift` owns per-protection node/byte counters and bounded policy; no Ruby traversal.                                                                                                        |
| React Native | Already equivalent `privacy-telemetry.ts` owns per-projection matchers and budgets, with Android/Swift bridge protection; no Ruby traversal.                                                                                                |

All maintained SDK repositories were green in the preceding GitHub audit except
Ruby. That does not establish production workload, physical-device or new
installed-version performance acceptance. The Ruby source patch needs a separate
package release and consumer adoption before installed projects receive it.

## Validation

- Red: original core suite fails its committed-manifest assertion; the new Ruby
  repeated-key and scalar-text regressions each observe 48 matching calls instead
  of one.
- Core: 34 focused OpenAI plugin/contract checks pass; full core lint and
  TypeScript checks pass. Formatting passes for the changed tests and this record.
- Ruby: full lint, 332 examples and gem build pass; overall line coverage is
  94.28%, with 136/140 executable lines covered in `TelemetryPrivacy`.
- Performance: the unchanged gate passes three consecutive Docker runs on Ruby
  3.4.2. The enriched 200-exception measurements are 0.6742, 0.6890 and 0.7063
  seconds, versus the pre-change local 0.8438 seconds. The CI failure measured
  1.7099 seconds on its different runner; the limit stays 1.5 seconds. Every
  filtered/configured/accepted/stalled-transport/recovery and retention gate also
  passes. These local measurements do not substitute for a fresh GitHub run.
- Installed artifact: the final rebuilt gem passes clean-install app-driven
  smoke on Ruby 3.1.6, 3.2, 3.3, 3.4.2 and 4.0. The pre-fix artifact is retained under
  `/private/tmp/debugbundle-ci-original-artifacts/`.

## Pre-ship review

- Inventory: two core infrastructure tests and this record; Ruby privacy, its
  functional tests, README and Unreleased changelog. Existing domain boundaries
  and public interfaces are preserved.
- Bad input/capacity: oversized keys are rejected before matching; both caches
  have fixed capacity and uncached fallback. Redacted/structured text cannot be
  reused. Per-occurrence byte/node accounting and cycle handling remain active.
- Trust/concurrency: fresh per-call state prevents policy, event or client sharing;
  repeated returned strings remain independently mutable. No credentials or
  untrusted values enter logs or persistent caches.
- Cleanup: protection-local caches expire on return, and release fixtures retain
  their existing `finally` cleanup. Installed smoke services are synthetic and
  confined to disposable Docker runs.
- Contract/tests: mandatory/custom privacy and the shared portable corpus remain
  covered; valid fixture verification precedes the source-drift negative case.
- Schema/deploy: no database shape, public SDK options or event schema changes.
  No package version, release manifest or hosted runtime is changed. GitHub CI
  validation follows the authorised source pushes; any SDK publication remains
  separate.
