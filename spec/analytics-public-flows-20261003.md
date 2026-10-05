# Public acquisition and activation flows

Owner correction, 2026-10-03: this is a customer product capability. The earlier operator-only site/app implementation is superseded. DebugBundle is one integration of the public feature. The parked analytics expansion remains parked; million-visit testing is deferred. No release or production action is authorized.

## Contract and scope

- Every project can own named acquisition or activation flows, using ordinary project read/manage permissions. There is no operator allowlist or global configured pair.
- A flow has two to eight explicitly ordered steps, each with a key, display name and exact origin. Main site, blog, dedicated auth pages and app may be different origins. All participants use the flow's project token; they may separately use different projects for debug capture. Separate products configure separate project flows.
- Capture is explicitly enabled and headless. The Browser SDK provides a public flow client; HTTP callers have the same write contract. No public consent UI is supplied. Browser observations are labeled observed, never inferred successful authentication or server-confirmed business outcomes.
- The integration marks meaningful completed steps. An auth origin retains its tab-scoped flow context while visiting an external identity provider, then marks login completion after success and hands off to the app. It never overwrites OAuth state or sends analytics tokens to an identity provider. An uninstrumented intermediary may preserve a token destined for the final configured origin in its own validated return URL.
- A flow context expires after a configured 10 minutes to 24 hours (default one hour). A handoff expires after ten minutes or the flow expiry, whichever is sooner, is bound to the next step/origin and is redeemed once. Tokens are hashed at rest. No global visitor identity, email, customer user ID, raw URL or form data is stored.
- Repeated steps and retries do not add conversions; out-of-order steps cannot advance a flow. A destination without valid continuity can start an explicitly unlinked observation, excluded from linked conversion counts.
- Short-lived run state supports continuity only. Reports read daily aggregate counters, compare equal previous full-UTC-day periods, and show reached steps, drop-off, elapsed time, source attribution and unknown/unlinked coverage. Raw-event scans and individual journey reads are excluded.
- Reconfiguration starts a new definition version. Existing aggregates remain bounded by retention and are not reinterpreted using new steps. Archive disables new capture without inventing conversions.
- Definition count uses the existing tier's saved-funnel scale; flow sessions/events use existing analytics allowances. Project deletion cascades. Additive migrations and readiness enforcement are required.

## Interfaces and design

API, CLI, ordinary MCP and the existing Analytics Flows tab expose definitions and aggregate reports through the same domain service. Reuse current Button, Input, Select, Card, Table, Notice, Empty and Skeleton primitives, current time filter, project access rules, keyboard focus and field labels. Use a normal create/edit form with an ordered step list; no canvas, graph editor or public-site UI. Existing blanket design approval applies.

## Acceptance (FR-ANL-30, AC-ANL-21)

1. Two independent customer projects can configure and measure their own flows without DebugBundle operator settings or access to each other's data.
2. Main site → blog and main site → auth → successful login → app both produce the expected ordered counts. Failed/abandoned login does not count success. External OAuth transit preserves context without changing its state parameter.
3. Missing/expired/replayed tokens, blocked storage, withdrawal, wrong origins, wrong project tokens, concurrent requests, retries and out-of-order events cannot fabricate linked conversions.
4. Viewers can read accessible project reports; only owner/admin can manage. Cross-project and cross-organization access is denied. Project tokens cannot read reports or manage definitions.
5. Reports are computed from aggregates; counters, elapsed time, prior-window comparison and unlinked coverage match a hand-calculated real-DB fixture. Expired operational state and aggregates drain through bounded retention jobs; project deletion removes project data.
6. Existing analytics, saved funnels, auth, incident/bundle delivery and installed SDK capture remain compatible. No generic feature reads DebugBundle's users/projects/incidents as customer business outcomes.
7. Public docs use customer examples. DebugBundle's consumer configuration lives separately. All exposed APIs, CLI/MCP operations and SDK methods have matching tests/docs.

## Execution status

The subsequent [final audit](analytics-public-flows-audit-20261004.md) corrected attribution
privacy and malformed SDK initialization, added composed SDK/API/database proof, and passed
the changed-source coverage gate. Its final 517-test SDK and 23-test composed/migration results
supersede the initial evidence below. `STATUS.md` records the final counts and release boundary.

The generic local candidate is implemented and verified on `update/visit-flows` as of
2026-10-04. The superseded internal implementation was removed directly; no compatibility
layer or migration for that unreleased iteration is retained. Existing published behavior
remains covered by regression tests.

Acceptance evidence:

- Real-DB fixtures verify two independent customer projects, main-site/blog and
  site/auth/login/app paths, aggregate counts, previous cohorts, unlinked observations,
  duplicate/concurrent steps, skipped-login rejection, wrong origins, replay, expiry,
  withdrawal, tier admission under concurrency, version changes, archive, bounded retention
  and cascading deletion. The final four-test public fixture passes.
- The full configured integration suite passes 134 tests across 29 files, including
  populated-schema upgrade and existing analytics/ingestion/worker paths. The forward
  migration participates in the migration ledger and API/worker readiness requirements;
  existing hosted rollout scripts migrate before candidate startup.
- API, CLI/MCP and dashboard tests cover project authorization, write-only project tokens,
  owner/admin management, settings/consent enforcement, quota claims, shared schemas,
  report windows and loading/empty/error/read-only states. The broad affected-module run
  passed 2,996 tests with one stale OpenClaw manifest failure; regeneration and explicit
  mutation classification fixed it, and the 11-test API/plugin/parity rerun passes.
- SDK checks pass 515 tests, coverage, lint/typecheck, builds and installed-package smoke
  tests. Cases include same-tab OAuth return, fragment scrubbing, malformed/blocked
  storage, consent withdrawal, bounded queue/timeout/response handling and export parity.
- Core lint/typecheck/candidate builds and site tests/typecheck/static build pass.
  OpenClaw generated metadata and plugin validation pass. No browser checks were used.

Review limitations and release boundary:

- These are explicitly instrumented observations. The integration chooses when a completed
  login or custom business step occurred; the browser cannot independently prove a backend
  outcome. Backend callers can use the documented HTTP contract; no backend SDK helper is
  included in this slice.
- Continuity is scoped to the configured flow, origins, tab and expiry. Missing continuity
  remains unlinked. Attribution is explicit; omitted source is `unknown`.
- Browser SDK 3.1.0 was published on 2026-10-05. The authorized release adopts it in
  DebugBundle's app/site as ordinary public clients; no private flow wrappers remain.
  See `STATUS.md` for package, deployment and live verification progress.
- This is not a full merged-core coverage or production/load-test claim. The parked
  analytics expansion remains parked. See `STATUS.md` for the current release handoff.
