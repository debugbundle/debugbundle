# Public flow release-candidate audit — 2026-10-04

Scope: FR-ANL-30 / AC-ANL-21 on `update/visit-flows`, including the independent JS SDK
and site checkouts. The expanded analytics branch remains parked. This is a local audit;
no commit, publication, deployment, production mutation or browser inspection was performed.

## Findings corrected

1. **Attribution privacy boundary.** The categorical format allowed recognizable credentials
   and extra runtime attribution fields could reach SDK transport. Both SDK and API now apply
   the existing telemetry sanitizer to source/campaign values. The SDK explicitly projects
   these two fields, rejects unknown keys/accessor fields, and does not execute attribution
   getters. API rejection happens before quota claims or storage. Regression cases reproduced
   the failure before the correction and now pass. No sanitizer dependency/version change.
2. **Nonthrowing SDK initialization.** A malformed JavaScript factory argument could throw
   before the protected request path. The factory now returns an inactive client on initialization
   failure; every method remains safe and no request is made. Red/green regression verified.
3. **Coverage and integration evidence.** Real-DB storage tests were outside the ordinary unit
   coverage gate. Added domain state-transition tests cover invalid/expired/version-mismatched
   contexts, origin checks, retries, hashed storage, linked/unlinked accounting, report arithmetic,
   limits, archive and withdrawal. Form tests cover keyboard selection, ordering, bounded steps,
   duplicate validation, busy state and failed mutations. Startup/settings tests verify withdrawal
   registration and the existing internal switch. The shared CLI transport compatibility path
   is exercised too. Coverage thresholds and release checks were not weakened.
4. **Internal settings wording.** Removed a signup-attribution claim from the internal switch's
   description; it now accurately describes optional browser analytics. Public consent UI and
   marketing/signup pages remain unchanged.

## Cross-layer proof

`tests/integration/analytics-flow-runtime.integration.test.ts` composes the actual default API
dependencies, real project/member token records, analytics settings, quotas and Postgres stores.
It runs HTTP capture/management requests and verifies persisted counters. Start/arrival retries
consume three events and one session across start → handoff → arrival, with no double count;
wrong-origin arrival is rejected and withdrawal works after disabling analytics.

An explicit `INTEGRATION_FLOW_SDK_MODULE` option additionally loads the separately built Browser
SDK candidate. A minimal tab/storage/navigation adapter supplies browser-managed Origin headers
to real loopback HTTP requests. It verifies site → auth → successful login → app, rejection of a
skipped login, same-tab external identity-provider return, preservation of OAuth state, fragment
scrubbing and exactly one count per step. It does not launch a browser or require a private SDK
checkout for ordinary public-core tests. The final composed run includes this optional case.

Reproduce after `make -C sdks/debugbundle-js check`:

```sh
make test-integration \
  INTEGRATION_PROJECT=debugbundle-flow-audit \
  INTEGRATION_CONTAINER_PREFIX=debugbundle-flow-audit \
  INTEGRATION_POSTGRES_PORT=25432 INTEGRATION_REDIS_PORT=26379 \
  INTEGRATION_LOCALSTACK_PORT=24566 \
  INTEGRATION_FLOW_SDK_MODULE=/workspace/sdks/debugbundle-js/packages/sdk-browser/dist/analytics-flows.js \
  INTEGRATION_TEST_FILES='tests/integration/analytics-flow-runtime.integration.test.ts tests/integration/analytics-public-flows.integration.test.ts tests/integration/storage-migrations.integration.test.ts'
```

The runtime fixture deletes only its own projects after each case so its current-clock runs
cannot contaminate historical retention fixtures. The unmodified historical retention assertions
pass with both fixtures present.

## Reviewed boundaries

- Project tokens remain write-only; member/session access and owner/admin management use the
  existing project authorization and CSRF paths. Hosted OpenAI/restricted-agent tools are unchanged.
- Definition and token origins are both enforced. Context/handoff secrets are hashed at rest;
  receiver checks use constant-time comparisons. Ordered steps and version changes fail closed.
- Capture is headless and explicitly configured; there is no inferred login or verified business
  outcome. Missing continuity and omitted attribution stay unlinked/unknown.
- Queues, request deadlines, response size, operational expiry, definition counts and source lists
  are bounded. Aggregates obey retention; project deletion cascades; existing durable continuation
  drains cleanup batches without a new service.
- Additive migration, ledger checks, populated upgrades and API/worker readiness are tested.
  Existing private-cloud rollout source runs migrations before candidate startup; no deployment
  script or production state was changed.
- Existing auth creation-race and analytics-withdrawal fixes remain covered. Existing capture,
  saved funnels, CLI/MCP/OpenClaw, auth and worker regressions were included in the broad core run.

## Evidence and release boundary

See `STATUS.md` for final command results and counts. Session logs are local `/tmp/visit-flows-audit-*`.
The full SDK gate and the composed runtime/migration suite pass. Core source gates and site builds
are verified locally; this is not a claim of full merged-core coverage or a production canary.

The exact existing OpenAI release verifier reports `release_manifest_drift`,
`submission_packet_drift` and `release_checksums_drift` against the uncommitted tree. Its committed
manifest/artifacts were not regenerated to conceal the mismatch. Clean-tree release verification,
SDK publication/adoption (including DebugBundle's own integration), coordinated package releases
and production rollout remain the previously agreed, separately authorized release steps.
