# AnalyticsBundle: semantic tracking and core growth analytics

Date: 2026-09-22; execution reconciled 2026-10-01.
Status: entire Analytics feature in progress, browser and Node SDK packages selected. Eleven original slices apply; two SDK slices are deferred. No slice closure is claimed by this documentation reconciliation.

Current execution order and scope: [completion plan](../analytics-semantic-completion-plan-20261001.md). Current evidence: [checkpoint](../analytics-semantic-implementation-20260928.md). The complete former proposal/ledger is [archived unchanged](../history/analytics-before-reconciliation-20261001/original-proposal-and-ledger.md); its repeated latest/Next statements are historical. The approximately 45% estimate was withdrawn as insufficiently grounded. Use the reconciled ledger below and original exit table, not a historical 0/13 headline.

### One Analytics product and cutover direction — owner clarification 2026-09-30

The owner wants an improvement to the existing Analytics product, with JavaScript browser and Node as the first release candidate. The two date-stamped analytics schema values are internal wire identifiers. They must not create a second customer-facing Analytics product, navigation tree, plan, or parallel long-term configuration choice. The candidate's explicit `schemaVersion` switch is a temporary development gate, not the final first-install experience.

The release candidate must provide one documented current JavaScript setup per package and one Analytics UI. Existing installed SDKs continue to send their current event shape during an explicit upgrade window; debug capture must remain unaffected. New browser and Node installations use the new semantic protocol after the complete capability/report gates pass, with an SDK major-version/migration guide if the meaning of an installed method changes. The site and app dogfood installations both pin browser SDK `3.0.3` in their local package manifests and still configure its current analytics shape; move those two call sites through the same reviewed cutover. The owner accepted a **30-day old-writer window after both known installs upgrade**, conditional on confirming no other active old analytics writers. Record the actual upgrade and cutoff dates in the release migration guide; a source build or local test does not start that window. No project silently sends both shapes for the same fact or counts both in one metric.

Historical V1 rollups, saved funnels and `analytics_bundle.v1` artifacts remain readable under their retention and versioned artifact contracts. They are not relabeled as verified semantic facts: old `funnel_step`/`conversion` signals lack a declared catalog revision, verified business boundary and server authority. A new report's `available_from` and coverage show where trustworthy semantic measurement begins. Once installed producers have migrated and the 30-day old-writer window is complete, remove the old analytics capture/processing lane in a later reviewed change; do not maintain two product experiences indefinitely. Historical readers remain only for applicable retention and artifact obligations. Debug event ingestion on `/v1/events` remains unaffected. No production setting or installed SDK is changed by this local decision record.

## 1. Decision and desired outcome

Extend the existing analytics lane, SDK APIs, rollups, funnels, opportunities and AnalyticsBundle engine. Do not build a separate analytics product inside DebugBundle or replace the existing collectors.

The outcome is enough first-party analytics for a small product team to answer its everyday acquisition, activation, engagement, retention and monetization questions without needing a second product-analytics service. Preserve DebugBundle's differentiator: a compact, reliable evidence bundle that an agent can interpret and act on.

The intended workflow is:

1. Install/configure the existing SDK, with analytics explicitly enabled.
2. Add small semantic hooks at real business boundaries, using one consistent SDK method family.
3. Discover captured event capabilities through the dashboard, API, CLI or stdio MCP.
4. Define goals, ordered funnels, cohorts and reports centrally, without editing application code whenever the question changes.
5. Obtain bounded aggregate results and an evidence-rich AnalyticsBundle, including measurement gaps.
6. Make a change, compare like-for-like periods/cohorts, and measure again.

This is similar to probes in having named application integration points, but it is not probe capture. Probes collect diagnostic context; semantic analytics hooks record intentional product milestones. They must keep separate payloads, consent, sampling, retention, quotas and failure handling.

**Honest boundary:** installing an SDK cannot tell us that an arbitrary payment settled, an account was created, or an agent fixed a bug. Existing events can be recombined remotely. A genuinely new business fact needs a hook or an explicitly supported integration at its authoritative source. No remote arbitrary code execution, DOM scraping or inference from a generic HTTP 200.

Cross-project tracking is included in this phase, through explicit same-organization analytics spaces. It is not automatic tracking across every project an owner happens to have.

## 2. Audit scope and evidence quality

This proposal audits current local contracts, implementations and tests/source structure. It builds on the read-only conversion audit conducted on 2026-09-22. It does not establish deployed-asset parity or prove production implementation correctness by executing a new end-to-end test suite.

The earlier live CLI checks found analytics enabled for the DebugBundle site and app, standard privacy mode, page/route capture enabled, action capture disabled, and no saved funnels. The local app/site integration has page and sanitized route reporting but no explicit semantic `track`, `funnel` or `convert` calls in the inspected source. Live admin/billing analytics were not inspected; the admin endpoint requires a privileged browser session, not an ordinary member-token CLI call.

Prior audit: [conversion tracking audit](</Users/owenfar/.codex/.chatgpt-projects/g-p-69b11c1dd9a4819192ba4c14fd35968a/marketing/research/CONVERSION_TRACKING_AUDIT_2026-09-22.md>).

### Existing foundation and gaps

| Area | Verified foundation | Gap to close in this phase |
| --- | --- | --- |
| Browser SDK | Opt-in page, route, session, action, funnel, conversion, friction and privacy-safe context APIs | Typed business events, measurement catalog, explicit identity lifecycle, clean distinction between manual events and automatic clicks |
| Backend SDKs | Browser relay support across server language families | Relaying a browser event is not native server business-event capture; add a first-class API |
| Native/mobile SDKs | Debug capture and mobile delivery foundations | First-class semantic analytics, screen/session lifecycle and equivalent identity/consent semantics were not found in the inspected public surfaces |
| Ingestion | Separate analytics envelope/lane, quotas and acknowledgements | Current analytics runtime is browser-oriented and requires a session; support server events without fabricated visits |
| Identity | Session ID; optional visitor/user hashes; browser `setUserHash` | No complete user/account lifecycle, authenticated cross-project linking, account-level analytics or robust anonymous-to-known merge contract |
| Funnels | Saved names and ordered step labels; per-step/session aggregate counters | No predicate-based definition, conversion window or proof that the same subject performed all steps in order |
| Distinct counts | Hour/day subject uniqueness ledgers and rollups | Current multi-bucket readers sum bucket counts; these are not a general arbitrary-window distinct-user calculation |
| Acquisition | Referrer and standard UTM breakdowns | Durable, explicitly defined campaign-to-activation/payment attribution and identity continuity across site/app |
| Retention | New/returning visitor data | Cohort retention, meaningful active users/accounts, stickiness and lifecycle metrics |
| Revenue | Internal hosted account/billing counters | These are operator metrics, not a reusable customer-facing revenue SDK and reporting contract |
| Cross-project | Organization-wide opportunity/bundle inventory | Inventory is not a joined funnel, shared identity domain or deduplicated aggregate across projects |
| AnalyticsBundle | Deterministic V1 engine and bounded artifacts | Typed coverage/provenance, true cohort/funnel evidence, revenue/retention evidence and explicit unavailable states |
| Agent interfaces | API/CLI/stdio MCP parity for existing capabilities | Discovery, validated measurement plans, previews and safe versioned application of new definitions |

### Source map

These are implementation pointers, not an assertion that every SDK package or runtime lane was executed:

- `contracts/sdk-interface.md`: existing AnalyticsBundle browser API and privacy rules.
- `packages/shared-types/src/analytics.ts`: event kinds, browser runtime/session model, safe hashes, dimensions and schema versions.
- `packages/shared-types/src/analytics-product.ts`: settings, metrics, bundle and opportunity contracts.
- `packages/shared-types/src/analytics-saved-funnels.ts`: current strict saved-funnel definition schema.
- `sdks/debugbundle-js/packages/sdk-browser/src/analytics.ts`: public methods, consent and capture gating.
- `sdks/debugbundle-js/packages/sdk-browser/src/analytics-normalization.ts`: origin-local visitor storage scoped through the project token, sanitization and normalized dimensions.
- `sdks/debugbundle-js/packages/sdk-node/src/relay.ts` and equivalent Python/Go/Java/.NET/PHP/Ruby relay implementations: forwarding is not native semantic capture.
- `apps/api/src/routes/analytics-ingestion.ts`, `analytics-settings.ts`, `analytics-saved-funnels.ts`, `analytics-route-services.ts`: API enforcement and authorization.
- `packages/storage/src/analytics-rollup-store.ts`, `analytics-rollup-uniques.ts`, `analytics-metrics-store.ts`: aggregate writes, deduplication and reads.
- `packages/storage/src/analytics-bootstrap-statements.ts`, `analytics-schema-migrations.ts`, `retention-store.ts`: existing storage, migration and retention boundaries.
- `apps/worker/src/analytics-aggregation.ts`, `analytics-bundle-processor.ts`: worker paths.
- `packages/analytics-bundle-engine/src/index.ts`: deterministic bundle normalization and recommendations.
- `packages/storage/src/account-analytics-store.ts`, `apps/api/src/routes/admin-analytics.ts`: internal operator metrics, separate from customer product analytics.
- `site/src/lib/dogfooding.ts`, `apps/web/src/lib/dogfooding.ts`: first dogfood integration consumers.

Important nuance: existing `capture_actions=false` blocks action signals, including current `track` events. It does **not** by itself block explicit `funnel_step` or `conversion` signals. Do not enable broad automatic click capture as a shortcut for missing business instrumentation.

Current funnel writes deduplicate subjects separately for each step/bucket; reads compare aggregate step totals. Step ordering in a saved definition does not establish observed chronological completion by the same cohort. Keep existing historical results clearly identified as legacy step aggregates; do not relabel them as reconstructed ordered funnels.

### SDK re-review findings (2026-09-28)

The baseline is now Node/Browser **3.0.3**; Python/PHP/Ruby/.NET **2.0.1**; Java/Go/Android/Swift/React Native **3.0.1**; WordPress **2.0.2**; core **1.13.4**. Core-owned JS shared-types/redaction remain independently versioned at **2.1.0**. These versions are recorded in `spec/local/sdk-release-review-20260926.md` and `sdk-release-train-20260926.json`; browser/Node and dogfood pins were checked again locally. This is local source and retained release evidence, not a new registry/production readback. Rebase and verify the exact baselines again before implementation/publication.

The recent train hardened debug capture and the shared transport. It does **not** prove that every current analytics controller path already meets the same privacy/caller-safety contract. Treat the following as implementation obligations, with failing regressions before fixes; no product code was changed or runtime defect reproduced by this re-review.

| Finding from current source | Consequence and required resolution |
| --- | --- |
| Browser `before-send.ts` accepts the closed debug `EventEnvelope`; `index.ts` applies it through `admitDebugEvent`, while analytics directly calls `enqueueAnalytics` | Preserve existing debug hook input/timing/replacement behavior. Do not widen that hook or route analytics through debug suppression/policy. Freeze a separate optional analytics hook contract before adding one. |
| Browser V1 now protects analytics before its first owned snapshot/queue and again before transport, with recognized credential values tested in titles, campaigns and innocuous custom fields | Preserve schema-aware mandatory protection and safe positive controls when adding V2, mobile/offline or new output paths. The server's `protectAnalyticsEvent` cannot protect earlier SDK memory. |
| Browser V1 now gates ineligible capture before app-data traversal and retains bounded sanitized deferred snapshots instead of raw caller closures | Preserve the 16-record/64-KiB bound, throwing getter/proxy containment and caller-mutation isolation in V2 capture and every new SDK queue. |
| The browser V1 withdrawal repair now calls an analytics-only transport revocation path and clears deferred captures, known-user context and analytics session state | Keep the repaired boundary in V2 and mobile queues; complete the direct/relay, restart, multi-instance and async-identity matrix below before full slice qualification. Already transmitted bytes cannot be recalled. |
| Browser V1 analytics sampling is decided once in `configure`, separately from debug event sampling. The current SDK contract now names that initialized-session decision. `trackReferrers=false` now prevents reading both referrer and campaign sources, with a regression that checks absent UTM dimensions and no source access. | Preserve these V1 behaviors and their focused regressions. Freeze the distinct V2 sampling unit, seed, retry behavior and report-coverage implications before adding V2 writers; do not reinterpret historical data. |
| Browser transport now accounts for overlapping sends and shares a lifecycle reservation; PHP has one bounded request-end attempt | Analytics reset/new workers must preserve ownership accounting and debug priority. Do not introduce a second PHP request-end send or an independent browser unload budget. |

Some overview/contract prose still calls the now-published SDK work a candidate or describes legacy hook ordering generically. Use the version-specific migration guides, current requirements/acceptance and exact release evidence to resolve this; slice 1 must reconcile contradictory applicable wording explicitly, including FR-SDK-13a/AC-SDK-13a versus the hardened §1.1 timing, without weakening the safety requirements. Leave unrelated historical release narrative out of the implementation diff.

## 3. Scope and product success criteria

The single phase must deliver the following, not merely prepare foundations for an unspecified later phase:

| Question | Required capability |
| --- | --- |
| Where does useful traffic come from? | Landing/referrer/UTM reports, first-touch and last-non-direct attribution, campaign conversion and revenue |
| What turns visitors into users? | Page/action goals and sequential funnels with real signup success, conversion windows and time-to-convert |
| Are new customers reaching value? | Configurable activation milestone and time-to-value, including server-side events |
| What is actually used? | Event trends, feature adoption, active users/accounts, frequency and bounded numeric distributions |
| Do they return? | D1/D7/D30 and weekly/monthly cohorts, exact-period and on-or-after retention, lifecycle/stickiness |
| Is it producing revenue? | Authoritative purchases/refunds, paying accounts, basic subscription MRR movements and churn |
| Where does the journey fail? | Ordered dropoff, route/friction context, incident/deploy correlation without claims of causation |
| Can the journey span projects? | Approved site/app/backend analytics space, identity continuity and explicit unmatched coverage |
| Can an agent manage the measurement? | Catalog, validate/preview/apply, aggregate queries, saved reports and deterministic bundles |
| Can the numbers be trusted? | Instrumentation coverage, source authority, duplicate/late/loss counters, processing watermark and clear unknowns |

Non-goals: a data warehouse, arbitrary SQL, advertising audience exports, ad-network spend ingestion, heatmaps/video replay, experimentation/feature flags, individual surveillance profiles, probabilistic identity matching, an accounting ledger, or a full billing platform. Search Console remains needed for search impressions, queries and indexing: first-party SDKs cannot see searches that never reach the product. No claim of replacing every specialist analytics tool.

## 4. Conventional model, adapted to DebugBundle

Use familiar concepts: named events and properties, page/screen views, anonymous and identified subjects, customer-account grouping, goals, sequential funnels and cohort retention. Keep DebugBundle's privacy and bounded-storage contract rather than copying a vendor's unrestricted property collection.

- Segment's specification separates named `track` events/properties from identity operations. Adopt that separation and stable semantic naming, not its permissive raw-property examples. [Track specification](https://www.twilio.com/docs/segment/connections/spec/track), [Identify specification](https://www.twilio.com/docs/segment/connections/spec/identify).
- Conventional funnels count ordered steps for the same subject and distinguish overall from previous-step conversion. Use sequential-with-intermediate-events as the first supported ordering, with an explicit window. [PostHog funnels](https://posthog.com/docs/product-analytics/funnels).
- Retention has a cohort entry event and a return event, measured for the same user or group. Its start condition and observation period must be explicit. [PostHog retention](https://posthog.com/docs/product-analytics/retention).
- Payment notifications can be duplicated or arrive out of order. Revenue needs verified server events, deduplication and state reconciliation, not a client success page. [Stripe webhook guidance](https://docs.stripe.com/webhooks).

These references establish familiar semantics. The API names, storage choices, proposed limits and default windows below are DebugBundle design recommendations, not external standards or already-shipped functionality.

## 5. One event model and one tracking catalog

### Versioned event contract

Introduce an explicitly negotiated successor to the browser-only analytics envelope. Preserve the current envelope and its meaning for installed SDKs.

Required concepts:

- Stable event ID; event name; event schema revision; occurrence time and server receipt time.
- Origin project, service, environment, SDK family/version and capture source assigned/validated by ingestion.
- Optional session, anonymous subject, identified subject and customer-account references in protected correlation fields, never ordinary dimensions.
- Event properties with approved names, types, enum/cardinality limits and privacy classification.
- Dedicated numeric measurements with units; dedicated money fields with integer minor units and explicit currency.
- Safe route/screen context, campaign context and optional trace/deploy correlation.
- Optional business-operation idempotency key distinct from transport event ID.
- Data-purpose/consent mode and synthetic/internal exclusions where configured; no sensitive consent receipt contents in event properties.

Server events may have no session or browser dimensions. They must not increment visits, invent devices or pretend to be browser traffic. Route templates must sanitize dynamic identifiers, not just strip query strings.

Do not scatter new enum values or fields into strict V1 schemas and assume old readers accept them. Define V2 validators and a documented negotiation/compatibility matrix first. Keep existing public default responses compatible unless a new version is explicitly selected.

### Tracking catalog / measurement plan

Add a typed, revisioned catalog owned by the project or analytics space. Each event definition records its purpose, source, allowed properties/measurements, success boundary, identity requirement and expected producers. It also records whether it is a goal, or is referenced by a saved funnel/cohort/report.

Recommended names describe a fact, for example `account.created`, `project.created`, `sdk.first_event_received`, `bundle.retrieved`, `subscription.started`. Keep readable display labels separate. Do not rename existing arbitrary customer event names or require these particular DebugBundle dogfood names.

Allow bounded matching on event name, declared property enums, normalized route templates, source project/service/environment and approved numeric comparisons. Support small typed AND/OR groups. No arbitrary JavaScript, SQL, runtime expressions or unbounded regular expressions.

Preserve three distinct states: **declared**, **observed**, and **verified at its success boundary**. Seeing an event proves delivery, not that its business meaning is correct. Discovery reports schema/producer coverage, not example customer values or identity lists.

Keep V1 acceptance unchanged. For V2, locally opted-in events can enter a bounded discovery mode with only privacy-safe, schema-valid fields; undeclared property values are not retained for later inspection. Owners can select strict catalog enforcement. Unknown/rejected names and fields produce bounded health counters, not unbounded diagnostics or exceptions in the host application. A remotely edited catalog never widens the SDK's local allowlist.

Definitions have immutable revisions and effective times; edits show a diff and use optimistic concurrency. Historical results name their definition revision. New definitions use retained evidence only where sufficient; otherwise they start prospectively and display `available_from`. Never fabricate a historical backfill from expired events or a sampled journey.

## 6. SDK instrumentation: small hooks, broad parity

Preserve `analytics.track`, `pageView`, `funnel`, `convert`, `marker`, `setContext`, `setUserHash` and `setConsent`. Extend the family instead of creating a competing `AnalyticsBundle.capture` API. The bundle is an analysis output, not the capture client.

Illustrative proposed usage, not runnable current API:

```ts
// Browser: intent, after local analytics opt-in and any required consent.
analytics.track("signup.started", { placement: "pricing" });

// Server: after the account transaction commits, not before it succeeds.
analytics.track("account.created", { signup_method: "email" }, {
  eventId: stableAnalyticsEventId,
  occurredAt: committedAt,
  context: requestScopedAnalyticsContext,
});
```

The third argument and server method are proposed additions. Exact language signatures are frozen in the first slice. Never copy raw account IDs, request bodies, emails, payment payloads or session cookies into these examples' properties.

Key rules:

1. Manual semantic events and automatic structural actions get separate V2 capture controls. Both require local opt-in; remote configuration can only restrict that local permission. Legacy `capture_actions` behavior stays intact for V1.
2. A semantic event may satisfy several definitions without being ingested/billed several times. Existing `funnel`/`convert` remain supported; their compatibility mapping and counting are explicit. Do not emit both a new event and a compatibility alias for the same fact by default.
3. Add an explicit identify/reset lifecycle and customer-account context using opaque references. Retain `setUserHash` for compatibility; it does not silently establish cross-project trust.
4. Backend identity/context is request/job-scoped, never mutable process-global user state. Do not attach one customer's identity to a concurrent request.
5. SDK-owned capture never throws or waits on delivery/configuration/persistence. Preserve the runtime-specific callback and PHP/WordPress request-end boundaries below. Use bounded buffers, batching, retry/backoff, indexed acknowledgements and finite flush/shutdown deadlines. Reuse transport foundations while isolating debug failure/quota state and reserving debug capacity.
6. Best-effort SDK queues are not guaranteed business delivery. Provide a documented durable outbox integration pattern for committed business events and the existing durable transport where applicable. Emit after transaction commit; stable operation IDs survive retries. Outbox acknowledgement/cleanup must not lose unaccepted events.
7. Catalog and capture configuration have version/TTL handling, restrictive offline defaults, capability reporting and a kill switch. Remote enablement cannot bypass local consent or manufacture an integration point. Preserve browser zero-periodic-polling, credential-free relay mode, bounded mobile lifecycle refresh, and PHP/WordPress's no-request-time-config-fetch behavior. A remote kill switch takes effect when learned or when the new capability expires; it cannot promise instantaneous revocation on an offline client.
8. Form intent can use explicit semantic hooks or an opt-in safe attribute adapter. Do not collect values, text, arbitrary attributes or identify successful submissions by click alone.

### Inherited SDK safety contract: implementation gates

These are required behavior, not optional later hardening. They apply to new semantic APIs, identity helpers and automatic adapters as well as existing V1 analytics paths touched by this work. Preserve `FR-SDK-07/13a/19a/19b`, `NFR-PERF-01`, `NFR-REL-01`, `AC-SDK-SAFETY-*`, `AC-SDK-ACK-RETRY`, `AC-SDK-BROWSER-UNLOAD`, `AC-PRIV-*`, `INV-2/3`, and `SEC-12` through `SEC-23a` at their applicable boundaries.

**Capture and privacy order:** cheap enabled/consent/capability/metadata/capacity checks → bounded safe snapshot and mandatory sanitization/schema validation → bounded admission → optional deferred analytics hook → mandatory re-sanitization/full validation and current restrictive policy → delivery. No retained closure may own unexamined app input. No user getter, custom iterator, lazy formatter or serializer may escape into host code or become unbounded capture work. Drop unsupported hostile input safely. Property definitions and defaults must remain useful without an app-owned hook; custom redaction adds to the mandatory baseline. Preserve validated protocol/correlation fields with explicit schema handling, not a broad exemption for arbitrary IDs. Test serialized disk/bridge/relay/HTTP bytes, not only the final server record.

**Application callbacks:** existing `beforeSend` stays debug-only with its published signatures, valid field/ID replacement, `null` drop and safe-original fallback. If analytics needs app-owned filtering, the recommended additive surface is an optional analytics-scoped synchronous-return hook; freeze its exact per-language signature and identity/operation-field rules in slice 1. Node/Browser/RN execute it after capture returns on the JS event loop; callbacks must return promptly. Other runtimes reuse their existing bounded delivery owner and documented exceptions. Invalid/throwing/Promise-returning hooks cannot escape or weaken privacy. Retry reuses the finalized event, without re-running hooks, sampling, identity resolution or business timestamps. Unload/fatal paths must not execute pending user code or send an unfinalized event to avoid losing it. Existing debug hooks must never start receiving analytics events on upgrade.

**Finite ownership and priority:** give every SDK an explicit count/byte/age/concurrency ledger covering pre-config work, identity resolution, pending hooks, queued/finalized replacements, in-flight sends, retry snapshots, retired generations, native bridges and disk spools. Browser's current transport bounds are 512 debug events / 8 MiB and 256 analytics events / 4 MiB; its controller's 16 pending entries also need a shared byte/work charge. Reserve debug capacity under analytics pressure; stalled analytics must not prevent exception/breadcrumb capture or debug-lane delivery. Combined explicit flush retains its shared finite deadline. Hold ownership until each sender settles, even after ACK, timeout, revoke or reinitialization. Do not free retained bytes merely to admit more events. Bound replacement workers/timers and cleanup on repeated init/close; imports remain side-effect-free. Freeze other runtime bounds from their existing owners before extending them, with pressure/recovery tests, not larger unexplained defaults.

**Acknowledgements and retry:** all SDK-owned HTTP sends require canonical non-negative integer counts and unique in-range indexed rejections; missing/malformed/overflowing ACKs retain the submitted batch with bounded backoff. Preserve explicit custom/file/legacy-relay success compatibility. Remove accepted entries exactly once; retain only retryable indexed entries (`rate_limited`, `monthly_quota_exceeded`, `analytics_quota_exceeded`), terminally dispose others, and do not report successful delivery for an all-rejected batch. Cap numeric/date/custom retry hints at five minutes **before arithmetic**, measured from response receipt, including partial/protocol/server failures; preserve existing no-hint timing. Mixed V1/V2/debug batch indices refer to the original submitted order after lane splitting. New reason codes need a reviewed disposition table for old and new SDKs; terminal capability/privacy failures must not become endless retries. Preserve debug `status`/`lastEventAt` compatibility and expose analytics disposition through an additive bounded surface.

**Browser lifecycle:** debug and analytics retain one **60-KiB outstanding lifecycle-body budget per instance**, with debug attempted first. Direct mode uses authenticated keepalive fetch; relay mode uses credential-free beacon with keepalive fallback. Accepted beacons have no server ACK or completion signal and keep their reservation. Revocation/reset must not release that reservation or still-running keepalive bytes. Recheck generation immediately before invoking a transport, including the keepalive microtask after a body has been prepared. Handle overlapping ordinary/lifecycle responses without resurrection or duplicate ownership release. Unsent/oversized records may use ordinary delivery while the page survives. Explicit flush has one finite deadline and is not proof of delivery; page termination remains best effort. Preserve one summary on a non-persisted exit and no false session end on back-forward-cache entry. Define resumed/native background session behavior before computing active duration or retention.

**PHP/WordPress:** retain the owner-approved single best-effort request-end attempt (currently at most 25 events / 256 KiB), after capture, with documented possible loss and worker occupancy. Coordinate both lanes within that one attempt with debug priority; analytics must not add another automatic network call, inline batch-full send, ordinary-request config fetch, blocking retry loop, or mandatory collector/service. Explicit flush remains the documented opt-in synchronous boundary. WordPress continues endpoint/token-scoped cached config and authenticated WP-Cron refresh. Business-event durability uses an optional application-owned outbox; it is not a new requirement for baseline debug capture. Requalify real installed PHP/FPM/WordPress cost and loss behavior.

**Sampling and repeated business facts:** never apply debug error fingerprint suppression or `error_suppressed` incident semantics to analytics. Two legitimate identical purchases/actions with distinct operation identities both count; a replay of one operation counts once. Keep debug `sampleRate`, debug session caps, analytics sampling, and representative-journey sampling independent. V2 defaults to unsampled admitted semantic/revenue capture for exact metrics; any locally selected sampling must be disclosed and make unsupported exact cohort/financial claims unavailable. Do not force full capture or widen collection remotely. Freeze deterministic sampling unit/seed, window and identity-link behavior for sampled funnels; re-evaluation on retry is forbidden. Analytics loss counters use fixed reasons and bounded cardinality, do not create debug incidents or retain rejected names/values, and cannot infer counts for users who never consented or events never observed.

**Capability/configuration and mode matrix:** before retaining V2 work, distinguish `supported`, `unsupported`, and `temporarily unavailable` through authenticated, versioned capabilities bound to endpoint, project/credential scope, mode and schema. Bound pending work and expiry; invalidate cache/work on configuration or authority changes. Never downgrade server-authoritative V2 facts into browser V1 to obtain acceptance. Preserve legacy config response shape for clients without opt-in and implement cache/ETag variants so a widened response or another project's capabilities cannot leak across requests. A relay needs an explicit credential-free capability path before browser V2 use; no extra browser bearer token and no unbounded polling. Unknown/expired capabilities disable new V2 work with bounded diagnostics while established V1/debug behavior remains intact. Freeze refresh and recovery behavior for every supported mode, including self-hosted endpoints without internet access.

### SDK/API contract freeze checklist

Slice 1 must produce one cross-language matrix with exact signatures, defaults, return values, transport ownership, credentials and executable examples. The following cannot be left for individual SDK authors to invent:

| Boundary | Required frozen decision/evidence |
| --- | --- |
| Existing V1 methods | Keep signatures, void/async behavior, debug hooks and direct/relay wire shapes; document `track` versus auto-click control and the current marker/friction server gate. Define separate V2 manual/automatic controls without changing V1 meaning silently. |
| New semantic calls | Stable event ID and distinct business-operation ID; snapshot identity/context/purpose and occurrence time at capture/commit, not after awaited delivery or a later account switch. No mutable global server subject state. |
| Server authority | Project-bound server-only writer credential lifecycle, revocation, hash-at-rest, allowed operations and old-server rejection; management still requires member/session auth. Public project tokens and relays can never acquire server authority through client fields or a new default. |
| Identity/reset/consent | Distinguish logout/reset, consent revoke, remote disable, strict-mode tightening and full SDK shutdown. Set initial consent before listeners/capture; specify which queues, sessions, properties and persistent identities reset, including async races and multi-tab/restart restoration. |
| Flush/receipt/outbox | Keep existing flush API; add a bounded per-event receipt/disposition path only where required for the outbox. Capture return, queue admission, local file write, beacon acceptance and fulfilled `flush()` do not mean durable API acceptance. |
| Client/server mode | Direct, every claimed relay adapter, local file, connected HTTP, self-host, mobile offline and RN old/new native bridges each get a behavior row. Unsupported analytics modes return an explicit bounded disposition and retain existing debug behavior; do not claim local CLI analytics processing merely because an SDK can write a file. |
| Numbers/time | Cross-language finite ranges, safe integer/decimal wire encoding, overflow rejection, UTC occurrence/receipt timestamps, allowed clock skew, producer sequence and timezone rules. JSON/JavaScript must not silently round money, IDs or aggregate totals. |
| Public releases | Package-major versus wire-schema-version distinction, additive feature SemVer, supported predecessor upgrade/downgrade rows, migration docs and exact framework/platform lanes. No hidden new required option, helper service, permission or package dependency. |

Once these contracts are frozen, keep them stable across all SDK slices. Any later signature/schema change reopens all consumers and release gates before publication; do not publish one SDK and discover missing cross-language semantics in the next slice.

### Customer-owned consent and withdrawal safety (required in this phase)

Owner clarification, 2026-09-22: AnalyticsBundle must not inject consent popups or require a second banner. Keep the existing headless integration: the customer owns its consent UI/provider, persists its decision, restores that decision after SDK initialization, and forwards changes through `analytics.setConsent(true|false)`. Any future convenience UI must be a separately opted-in component, never a condition for using analytics or an automatic addition on SDK upgrade. Building that optional UI is not required by this plan.

Current behavior, source-verified: analytics defaults off; `consentRequired` defaults false. Setting it true locally pauses analytics until an explicit grant. The project's "Require consent" setting is a capture restriction, not a popup. Customers using consent-gated collection must configure the local requirement before capture starts; do not rely on a later banner callback or remote configuration fetch to establish the initial boundary. Consent and privacy/identity mode are separate controls.

**V1 browser repair checkpoint (source and focused tests rechecked 2026-09-28):** `analytics.ts` now invalidates the analytics generation and invokes `event-transport.ts`'s analytics-only revocation. It clears pending captures, visitor and known-user context, and analytics session counters. The focused consent/privacy/normalization run passes 23 tests, including populated-queue withdrawal, threshold microtask, retry, in-flight failure, keepalive reservation, re-grant and remote tightening. This is a local prerequisite, not complete direct/relay, restart, multi-instance, async-identity or V2/mobile acceptance. The following behavior and remaining matrix stay mandatory.

Required implementation behavior:

1. Add a narrow analytics-only revocation path between the controller and transport. On withdrawal, discard unsent analytics events and pending deferred capture/identity work; cancel analytics timers and retries. Do not call a full SDK reset, purge the debug lane, change incident capture, or reset the shared debug session.
2. Enforce the current consent generation at every dispatch path: scheduled/manual flush, batch-threshold microtask, retry, pagehide/beacon/keepalive and asynchronous visitor initialization. Tag or invalidate queued work by generation so an old callback cannot send or restore an old event after withdrawal or after a later re-grant.
3. An in-flight response or failed request from a revoked generation must not repopulate the queue, schedule another retry, or mutate the newer generation's transport state. Cancel in-flight analytics requests where the transport permits it, but do not claim that cancellation retracts an already transmitted request. Events already delivered cannot be recalled by a client-side consent toggle; historical deletion remains a separate authorized workflow.
4. Re-grant permits only fresh capture under the current policy. Never replay discarded events, buffered pre-consent actions or withdrawn visitor identifiers. Clear pending raw/deferred work and stale known-user/account/context state; require deliberate re-identification where applicable. Define analytics-only session/counter reset and subsequent incident-correlation behavior explicitly without resetting the debug session. Keep `setConsent` safe and idempotent, including rapid grant/revoke cycles, asynchronous storage cleanup and multiple SDK instances sharing a storage scope; stale cleanup must not delete a newer grant's identity.
5. Apply the same unsent-data rule to remote analytics disablement and a newly enforced consent requirement. When privacy tightens, discard or safely rebuild queued records under the stricter policy before any delivery; stale identity-bearing records must not bypass it. Preserve restrictive-only remote configuration and initial opt-in semantics.
6. Carry the withdrawal contract into the selected browser consent-managed queue now; mobile offline persistence and React Native/native bridges must meet it before their later activation. Backend handling is request/subject-specific: one customer's withdrawal must not clear other customers' events in a shared process or revoke unrelated server business records. Freeze purpose and propagation boundaries in slice 1 rather than promising global retroactive deletion from a browser callback.

Required regression cases, written before the fix: queue an event while granted, revoke before scheduled/manual flush and assert no analytics delivery; repeat for a pending threshold microtask, failed-send retry, pagehide/beacon/keepalive and async identity/config completion. Exercise in-flight success/failure after withdrawal, rapid re-grant and SDK reinitialization; assert no stale replay or mutation of new state. Cover direct and relay modes, repeated withdrawal, stored consent restoration and remote tightening. In each applicable fixture, a queued debug event must still deliver normally. Add equivalent native/offline fixtures as those SDKs gain analytics.

Acceptance is stronger than "no events captured after withdrawal": **no new transmission or retry of revoked, unsent analytics work after the revocation boundary**, with the already-transmitted limitation documented. Update SDK/API privacy docs and changelogs. This correction applies to supported V1 browser analytics as well as V2; it must not require customers to adopt the new analytics schema to obtain the fix.

### SDK completeness by selected release

| Family | Implementation obligation |
| --- | --- |
| JS browser | Evolve current analytics controller; page/session/semantic/identity APIs; safe cross-origin continuity adapter |
| JS Node | Native semantic events, request/job context and durable business-event recipe; relay remains browser-origin data |
| Python, PHP, Go, Java, .NET, Ruby | Deferred from the browser/Node candidate; later release requires idiomatic equivalent native analytics and context/flush/consent contracts, plus relay compatibility |
| WordPress | Deferred from the browser/Node candidate; later release reuses PHP/browser implementations; documented frontend and backend hooks; no assumption that every installation uses one commerce plugin |
| Android, Swift, React Native | Deferred from the browser/Node candidate; later release requires equivalent semantic events, screen/session lifecycle, opt-in identity and consent/reset; reuse native offline queueing and avoid double capture across RN/native bridges |

Use one cross-language golden event/acknowledgement corpus. Universal meanings matter more than identical syntax. Do not claim an activated SDK is supported from documentation alone. Deferred families are explicitly outside this candidate; preserve their installed behavior. Published packages, source tests and actually exercised framework/platform lanes remain separate evidence states.

For native/RN queues, persist only protected finalized analytics envelopes and consent/identity generation metadata sufficient to reject stale replay. Test migration from populated debug-only queues, restart while offline, OS termination, byte/age caps, disk-full/corrupt records, withdrawal during bridge promises and old native binaries with new JS. One native owner handles delivery, IDs and acknowledgements; JS cannot double-send the same event. A missing analytics bridge fails analytics closed without disabling native debug capture. Retain the published Android/Swift/RN host-safety and crash paths; semantic analytics must not be added to unsafe fatal handlers.

## 7. Cross-project tracking without global tracking

### Analytics spaces

Introduce an **analytics space**: an explicit measurement boundary linking related projects in the same owning organization. It is not a customer account/group and does not merge incident permissions, tokens, billing accounts or project ownership.

Example: `DebugBundle growth` contains the public site project and application project, plus a separately registered backend project if one is used. It supports site visit → signup → first SDK event → first bundle retrieval → paid subscription. Other independent products stay separate unless the owner deliberately creates a legitimate shared measurement scope and compatible identity model.

Start with one active analytics space per project, with single-project behavior as the default. Multiple overlapping spaces and cross-organization joins are outside this phase. This avoids duplicate identity namespaces, ambiguous attribution and quota arbitrage while still solving the immediate site/app/backend use case.

Creation/join/removal require the owning organization's authorized owner/admin and access to every project being bound. A collaborator on unrelated projects cannot link them just because both appear in their project list. Membership changes are audited and versioned; the event's origin project is immutable.

### Two explicit report modes

1. **Portfolio comparison:** project-by-project aggregates, no identity linking required. Label sums as sums, not deduplicated people or a conversion funnel.
2. **Connected product journey:** events share an approved identity namespace and are evaluated together, while retaining origin-project provenance. Unlinked visitors/events remain unlinked and count toward coverage, not inferred completions.

Cross-project reports require space read permission **and access to every contributing source project**. Otherwise deny the combined report, or return a separately named explicit subset report with its own denominator. Never silently remove inaccessible funnel steps. Apply this check to saved reports, bundle retrieval, exports, caches and queued jobs, not just the initial request. Individual incident links require their normal source-project permission.

Sessions remain project-scoped unless a separate, explicitly validated session-continuity contract is implemented. The initial cross-project journey uses linked visitor/user/account units; it does not assume identical session IDs across sites. Each milestone declares its canonical producer so a browser observation and its backend confirmation do not become two conversions. Portfolio comparison can work immediately without this identity integration, but cannot answer cross-project conversion questions.

### Identity continuity

- Default: retain current project/session isolation. Strict mode remains session-only; it cannot promise cross-session/user retention or joined cross-project journeys.
- Known users: customer-controlled backend helpers derive space-scoped opaque user/account references from a canonical identity namespace. Prefer keyed pseudonymization, with keys kept server-side. A plain email hash is not a safe anonymous identity system.
- Shared namespaces must be explicitly agreed across applications. `user 123` in two independent databases is not evidence of the same person. Never merge based on email, IP, device, display name or matching raw IDs by coincidence.
- Anonymous → known: permit a bounded association only through an authenticated, validated first-party transition, within the same space and consent policy. Do not merge two already-known users. Define logout, shared-device reset and account-switch behavior.
- Same-site subdomains: use an explicit first-party relay/linking integration that can issue short-lived opaque continuity context. Origin-local storage alone is insufficient. Do not default to domain-wide readable cookies or expose server credentials to JavaScript.
- Different domains: offer an opt-in, allowlisted one-time handoff code. Bind it to source/destination/space and a short expiry, exchange it server-side, prevent replay/open redirects, and scrub it from location/referrer/log capture. It is a continuity capability, not an authentication token. Identity linking is best effort and must fail closed when the handoff or consent is absent.
- Never place a stable user ID, hash, account ID or reusable token in campaign URLs. No third-party cookies or fingerprinting. Do not reuse OAuth state as analytics storage.
- Project credential rotation must not reset the new authorized analytics identity namespace. Existing visitor identities are not automatically stitched across token changes or origin changes.

Browser/relay events remain client-observed even when forwarded with a server credential. A client-provided `trusted=true` field or a copied opaque user handle cannot authorize a business outcome or a known-user merge. New server business-event writers require a narrowly scoped server-only credential/capability; ingestion assigns the source authority. Existing ingestion credentials retain their documented permissions without being silently upgraded.

Joining a space begins collection/projection prospectively. No automatic historical project merge. Removing a project revokes future linking immediately and invalidates combined cached results; define historical contribution deletion/rebuild and artifact access before release. Identity unlink/deletion and namespace/key rotation require bounded rebuild rules, not only hiding a UI row.

## 8. Analysis semantics and metric correctness

### Goals, events and trends

Define a goal centrally as a predicate over an observed event/page/screen. Explicit SDK conversions remain available. Distinguish event count, unique converters and conversion rate. Every rate names its denominator, eligibility condition, unit and time window. A success-only backend event cannot supply its own traffic denominator.

Offer daily/hourly trends, comparison periods, device/referrer/approved-property breakdowns, feature adoption, first use and repeat frequency. Numeric measures support count/sum/min/max/mean and bounded histogram percentiles with units and quality labels. Never mix currency or incompatible units. Exclude configured internal/test traffic consistently, with visible exclusion counts and no claim that all bots can be perfectly detected.

DAU/WAU/MAU and account activity must use union-capable subject state across the whole requested window, not sums of daily uniques. Use exact bounded distinct projections for the supported window; any approximate alternative must expose its algorithm/error and cannot be introduced silently. Calendar boundaries and timezone/DST behavior must be explicit. Keep legacy V1 aggregate fields compatible and name the new distinct semantics separately.

### Ordered funnels

A new funnel definition includes revision, space/project scope, eligible subject unit (session, anonymous visitor, identified user, customer account), entry event, ordered step predicates, conversion window, timezone, exclusions and property-attribution rule.

Initial defaults: sequential steps with intermediate events allowed; one subject entry per analysis cohort using its first eligible entry; seven-day conversion window configurable within a tested cap; entry-time breakdown values. Distinct steps require distinct events. Account funnels can be completed by different users in the same account only when the definition explicitly selects account units.

Use event occurrence time with a documented lateness allowance. Ingest time is a watermark, not proof of business order. Equal timestamps without producer sequencing are ambiguous for strict chronological claims; report ambiguity instead of using a random UUID as causal order. Deterministic tie sorting may make output stable but cannot prove ordering.

Return entered/completed counts by step, overall and previous-step conversion, time-to-convert distributions, expired dropoffs and still-open entries. The entry cohort is selected in `[from, to)`; later steps may fall after `to` within that entry's conversion window and the report's observation cutoff. Expose that cutoff. Compare fully observed cohorts separately from immature entries. Late arrivals can revise provisional results within the supported correction window.

Counts at later steps cannot exceed earlier steps for the same cohort. A completion from a different subject, before entry, or outside the window must not inflate conversion. Anonymous visits that cannot link to known users are a coverage gap, not evidence of abandonment or success. Legacy saved funnels remain legacy until an owner approves migration to a new definition and measurement start date.

### Retention, cohorts and lifecycle

Support saved cohorts using bounded event/property predicates, first-observed milestone dates and recency/frequency within supported windows. No arbitrary SQL or export of cohort members through agent readers.

Retention definitions specify entry event, return event, subject unit, exact-calendar-period or on-or-after mode, timezone and horizon. Provide D1/D7/D30 and weekly/monthly tables/curves with counts and percentages. Immature cells are pending, not zero; mean retention excludes unobserved cells. "First ever" means first observed since a stated tracking start unless complete earlier history is available.

Active means an explicit meaningful event set, not merely leaving a tab open. Report new, retained, resurrected and dormant subjects using documented lookback rules. Engagement duration uses lifecycle-aware active-time measurement; pagehide alone is not proof of total engaged time. Session-scoped data cannot be sold as person-level retention. Customer-account membership changes must not retroactively recategorize past events without a new documented recomputation.

### Acquisition and attribution

Preserve normalized referrer and standard UTM fields at entry, with allowlists, length/cardinality caps and PII checks. Maintain first eligible touch and last non-direct eligible touch within a configurable window (proposed default 30 days). Direct/internal navigation does not overwrite a prior eligible campaign; expired/absent evidence becomes direct/unknown with a reason.

Each report states model, lookback, subject unit and coverage. Attribute a conversion once per selected single-touch model; do not add totals from different models. First-touch and last-touch are separate views, not claims of marketing causation. Anonymous touch history can follow a validated identity association only under the approved policy. A forwarded UTM is not by itself proof that two users or sessions are the same.

Preserve the original external touch across an approved site → app handoff. Traffic between member projects is internal to that space for acquisition classification. For customer-account acquisition, choose an explicit originating conversion/contact rule rather than arbitrarily borrowing the last campaign of any teammate.

### Revenue and subscriptions

Capture successful payments, refunds and subscription-state changes at verified backend boundaries. Provide purchases, gross/net receipts, paying accounts, average order value and campaign-to-payment reporting. Keep transaction/event deduplication distinct from subscription state.

Support a basic subscription projection: new, expansion, contraction, reactivation and churned MRR, plus current MRR and subscriber/account churn with explicit denominators. Normalize annual recurring amounts to months with a documented rounding policy; exclude one-off revenue and taxes. Document discounts, credits, trials, grace periods, pauses, failed payments, cancellations effective in the future, refunds and usage-based charges. Do not equate a checkout visit, a trial or a failed invoice with paid revenue.

Amounts use integer minor units, explicit ISO currency and currency-specific exponent handling. Keep currency series separate; no implicit exchange rates or combined MRR across currencies. A refund affects receipts, not necessarily subscription MRR. Provider event arrival order does not define current subscription state. Stable object/operation identities and reconciled effective state prevent double counting.

Freeze money/aggregate bounds and a language-neutral lossless encoding before SDK signatures: JavaScript safe integers, 64-bit native integers, JSON numbers and database numerics are not interchangeable. Validate capture and derived sums for overflow; use documented decimal encoding when required, never floating-point currency arithmetic. Clock-skew/future-dated records need a bounded explicit disposition so they cannot keep cohorts open indefinitely or falsely advance processing watermarks.

Provide provider-neutral SDK helpers and a tested Stripe integration recipe for DebugBundle's own dogfood. A customer still integrates the authoritative events; do not promise automatic ingestion from every payment provider. Minimal protected subscription state and reconciliation are required for MRR; these are not accounting/tax reports.

### Incident and deploy impact

Reuse existing exact session/trace/route/deploy correlations. Extend them to affected activation cohorts and conversion changes only where linkage is valid. Show baseline/cohort size, exclusions and competing explanations. Do not claim a release caused a conversion change from a small before/after sample. Do not call a retrieved bundle an agent-resolved incident.

## 9. Storage, processing and cost boundaries

Keep Postgres, the existing queue/object storage, lightweight ingestion and idempotent worker architecture. NFR-SCALE-01a excludes introducing a new warehouse, arbitrary query engine or long-term raw-event store without separate architectural approval.

Cross-session ordered funnels and retention cannot be reconstructed from aggregate totals alone. This plan therefore explicitly extends the privacy/retention contract for **bounded protected pseudonymous analysis state**, not unlimited raw history:

| State | Contents and lifetime |
| --- | --- |
| Catalog/definitions/space membership | Versioned metadata, no captured customer payloads; retained for interpretation/audit |
| Event/operation receipts | Minimal dedupe keys and acknowledgements within a declared retry/reconciliation horizon |
| Active funnel/correction state | Subject reference, relevant milestone times, definition revision and approved breakdowns; bounded by conversion window plus lateness |
| Identity associations and attribution state | Space-scoped opaque associations and safe touch metadata; opt-in, expiry/deletion, no global person graph |
| Retention/distinct state | Bounded subject membership/first-observed state needed for supported cohorts and exact unions; never public dimensions |
| Subscription projection | Minimal opaque account/subscription reference, effective normalized state, dedupe/reconciliation version; no billing payloads |
| Aggregate reports | Existing hourly/daily rollups plus typed new projections; published retention and coverage metadata |

Proposed initial engineering limits to ratify in slice 1: maximum funnel window 30 days; 48-hour correction allowance; 90-day detailed identity/cohort analysis horizon. Keep existing configured raw/sample/aggregate retention unchanged by default. Plan entitlements may be lower: definitions exceeding effective retention/capabilities must be rejected or explicitly shortened with owner approval, never silently produce incomplete results. Revenue dedupe/state must accommodate provider retries and subscription lifetime independently of the 48-hour general funnel correction window.

Do not replace these constraints with an indefinite generic event table. Persist only definition-relevant bounded milestones needed for ordering/correction, not full event payloads. A new definition may lack historical detail even while older aggregate totals exist. Show that boundary before applying it.

Compute state estimates before activation: active subjects × definitions × milestones × window, plus dimension cardinality and index overhead. Cap events, dimensions, definitions, memberships, query windows, exports and job work. Apply backpressure fairly by project/space and reserve debug-processing capacity. A space aggregates already accepted events; it must not duplicate ingestion charges or pool project allowances to evade quotas.

Do not independently sample conversion/revenue events and then report exact totals. Journey-example sampling remains separate. If capture loss, quota, sampling, schema rejection or a cardinality cap affects measurement, expose completeness/overflow counters and refuse misleading precise conclusions. Application performance always takes priority over analytics delivery.

Workers atomically claim receipt/state/rollup effects and survive retries/crashes. Handle late and out-of-order events with bounded recalculation of affected projections. Events older than supported correction windows receive a visible disposition; do not silently backdate a finalized cohort. Reconcile server financial state by a separate bounded procedure.

Define acceptance and deduplication at **both** boundaries. A lost HTTP response followed by retry must not claim analytics quota or business totals again; worker-only dedupe does not establish this. Key transport receipts by authenticated origin scope and stable event ID, business receipts by the documented operation scope, and reject conflicting safe content under a reused ID with a bounded disposition. The receipt horizon must cover supported offline/outbox/provider retries; older replay has an explicit policy. Preserve original indexed ACKs, charge a semantic event only once even when it feeds multiple definitions, and do not charge a session for a sessionless backend fact. Test concurrent ingress, exact remaining event/session allowance, persistence/enqueue failure, lost ACK, duplicate financial operation with a different transport ID, and rollback before claiming durable acceptance.

Keep the existing durable worker ownership boundary: the shared dequeue/journal wrapper owns completion and retry, and new analytics processors must not independently acknowledge Redis. Use the existing transaction/fenced-lease machinery for receipts, projections and follow-up jobs. Replay after artifact write but before journal completion must not consume another generation allowance or duplicate publication. Keep the current correlation-lock ordering for analytics/incident joins and reserve incident worker progress during analytics backlog. Deletion or space revocation must fence queued work so a delayed job cannot recreate deleted subject/link state or publish a newly unauthorized artifact.

An application outbox removes/marks entries delivered only after a documented durable acceptance receipt for the exact operation, never after `track()` or `flush()` returns. Terminal rejections move to a bounded application-visible failed disposition rather than silent success; transient failures stay within retry/retention limits. No SDK background worker holds a customer's transaction open for delivery, and no required outbox/collector is introduced for ordinary debug installs. Include a framework transaction-commit/rollback recipe and a tested retrying consumer in each server SDK's release docs.

Privacy controls cover deletion/reset/withdrawal, project deletion, space unlinking, entitlement downgrade and backup/artifact retention. Remove protected subject state and rebuild affected projections where feasible under the defined policy. Clearly document which irreversibly aggregated historical totals cannot be tied back to an individual. Pseudonymous is not synonymous with anonymous or legally exempt; do not advertise automatic compliance.

## 10. AnalyticsBundle and data quality

Keep V1 artifacts readable and byte-stable. Introduce a new artifact version for typed additions rather than slipping incompatible fields or analysis kinds into V1.

The new artifact contains:

- The bounded question, project/space, source-project set and environment.
- Event catalog, identity, funnel/cohort/attribution and calculation revisions.
- Analysis window, observation cutoff, processing watermark and relevant retention availability.
- Typed measures with units, numerator/denominator, exact/approximate status and comparable baseline.
- Capture coverage: expected/observed producers, missing events, linked/unlinked population, consent exclusions where knowable, rejection/loss/sampling and clock/late-event issues.
- Current metrics, segments, mature/provisional cohorts, incident/deploy links and bounded aggregate patterns.
- Recommendations tied to specific evidence, with uncertainty and a testable next action. No generic template presented as a discovered fact.

Do not claim complete consent-denied population counts when the client correctly sent nothing. Distinguish measured ingestion loss from unknowable blocked/offline/non-consenting traffic. States include `not_instrumented`, `not_available`, `insufficient_history`, `partial`, `provisional` and `observed_zero`, not a single empty chart.

An authorized owner's small exact totals remain useful and should be shown with low-sample warnings. Define any sensitive-segment suppression policy by output surface and permission rather than hiding every small startup's metrics. Where suppression applies, complementary totals, filters and exports must obey it too; do not imply that a count threshold alone guarantees anonymity.

Determinism requires a frozen normalized evidence snapshot, source membership/definition versions and processing cutoff in the fingerprint. Equivalent input yields identical bytes despite worker order. Do not introduce wall-clock generation values or random ordering into the deterministic payload. Preserve strict output size/field allowlists and omit customer identity references, secrets and unbounded custom data from aggregate agent outputs.

## 11. Dashboard, CLI, API and agent workflow

Reuse the current Analytics workspace, project Analytics tabs and settings components described in `analyticsbundle-web-product-surface-design.md`. Add a clear project/space scope selector, tracking health/catalog, goals/ordered funnels, retention and revenue views. Use familiar report patterns, not a novel analytics canvas.

Before UI implementation, obtain the repository-required design-system proposal approval, including reused components, states, accessibility and mobile layout. A written architecture plan is not that approval.

API, CLI and stdio MCP use the same domain services for catalog discovery, definition management, space membership, previews, metrics, saved reports and artifact generation. Proposed command families include `analytics catalog`, `analytics plan validate/preview/apply`, `analytics spaces`, `analytics retention`, and `analytics revenue`; freeze exact names against existing CLI conventions in slice 1. These names are not available commands yet.

A normal agent workflow:

1. Inspect authorized scope, installed SDK capabilities and current definitions.
2. Read aggregate coverage and identify what the requested question actually needs.
3. Generate a reviewable local measurement-plan document, including required new hooks separately from remote-only changes.
4. Validate privacy, entitlement, cardinality, identity, window and source-authority rules.
5. Preview the definition diff, data availability, expected storage cost and synthetic test outcomes without writes.
6. Apply only after owner authorization, with expected revision/idempotency; preserve a rollback revision.
7. Verify observed producers and production success-boundary evidence before claiming measurement is ready.

Allow bounded CSV/JSON aggregate export and saved comparison reports through the same permissions; no raw journey or person export masquerading as aggregate analysis. A requested recurring analysis can use existing authorized scheduling infrastructure; no unsolicited marketing automation is created by this proposal.

**Hosted OpenAI connection boundary:** its current 23-tool read-only V1 catalog stays unchanged. Do not add mutations, custom dimensions, identities, bundles or cross-project joins to that approved projection implicitly. Rich new automation is available through the normal authorized API/CLI/stdio MCP. Any future hosted-connector version needs its own explicit contract/security review and release; it is not required to complete this core phase.

## 12. DebugBundle dogfood measurement plan

Create one approved growth space for site + app/backend, with production separated from development/test and explicit internal/friend/client exclusions where the owner can truthfully identify them. Do not call all existing accounts independently acquired customers. Start clean measurement from a recorded baseline date.

| Milestone | Authoritative source | What it does not prove |
| --- | --- | --- |
| Landing/page visited | Browser page event, sanitized landing/UTM context | Unique human customer or purchase intent |
| Signup started | Explicit browser CTA/form-start hook | Successful new account |
| Account created | Backend successful committed account creation | Returning-user login or activated customer |
| Project created | Backend committed project creation | Working SDK integration |
| First real SDK event accepted | Ingestion, first eligible non-synthetic event for the customer project | A purchase or successful debugging |
| First bundle retrieved | Successful authorized artifact retrieval; dedupe agent retries | An agent fix, deployed fix or incident resolution |
| Trial started | Authoritative trial state transition | Paid subscriber |
| Subscription started/payment received | Verified server billing state/payment result | Each webhook retry as new revenue |
| Returned to meaningful use | Deliberately defined subsequent capture/retrieval activity | Merely opening a dashboard tab |

Do not treat customer analytics data inside their projects as DebugBundle marketing telemetry. Dogfood activation events come from our own allowed product lifecycle counters, with opaque customer references and no customer payloads. Reuse existing account-analytics event sources where appropriate without exposing the privileged admin endpoint or double counting.

Use separate analyses instead of one misleading mixed-unit funnel:

- Acquisition: eligible visitor → signup intent → validated link to new account; report linked coverage.
- Activation: newly created customer account → project → first real event → bundle retrieved, proposed seven-day window.
- Monetization: eligible account/trial → authoritative paid state, proposed 30-day window.
- Retention: activated account → meaningful return, D1/D7/D30 and weekly view.
- Campaign quality: new activated/paid accounts and observed revenue by eligible attributed touch, with unmatched counts.

The user-to-account transition must be explicit in an acquisition-conversion definition. Never divide account completions by a differently filtered user denominator and label it a standard same-subject funnel. Report numerators and denominators even when the sample is tiny. Do not infer post performance, statistical lift or commercial demand from internal traffic.

## 13. Single-phase delivery slices

The original thirteen slices remain the full roadmap. On 2026-09-29 the owner narrowed the first usable release candidate to JavaScript browser and Node so those paths can be evaluated end to end. Slices 5 and 6 are deferred from that first candidate; they are not silently passed or implemented. Their installed V1 SDKs remain supported. The first candidate still needs its applicable contract, identity, projection, report, UI and integrated functional gates before V2 capability can be enabled. Intermediate merges/deploy ordering may be needed for safe compatibility, but incomplete slices must not be marketed as the completed capability. No phase numbers in code identifiers or test names.

| Slice | Deliverable and main implementation owners | Exit evidence |
| --- | --- | --- |
| 1 | Freeze contracts, metric semantics, limits, privacy changes, the SDK/API matrix in section 6, credential model and UI proposal; reconcile released SDK/legacy wording | Reviewed V1/V2/ACK/config examples, threat model, per-runtime ownership budgets, migration/SemVer matrix, exact metric fixtures; required owner/UI approvals recorded |
| 2 | Analytics spaces, membership revisions and authorization in shared types/domain/storage/API | Same-org linking, all-source access, revoke/unlink/delete tests; single-project defaults unchanged |
| 3 | Versioned event/catalog schemas, server writer authority, lightweight ingestion, capability/config negotiation and receipts | Mixed V1/V2 batches, spoofed backend events rejected, browser relay stays untrusted, cache/auth isolation, exact indexed ACKs and retry-safe quota claims |
| 4 | JS browser + Node semantic/identity integration; fix V1 analytics privacy/caller/consent gaps from section 2 | Failing regressions then protected first snapshot, no raw deferred inputs, independent hook/sampling controls, no false sessions, request isolation and generation-fenced withdrawal; shared lifecycle/retention budgets and debug behavior preserved |
| 5 | Remaining server SDKs and WordPress parity | Per-language privacy/ACK/safety corpus, exact built-package installs, relay adapters, committed-success/outbox examples; one PHP/WP request-end attempt with measured cost |
| 6 | Android/Swift/RN analytics parity | Native lifecycle/offline/reset/consent tests, populated-queue upgrade and stale-retry prevention, old/new bridge negotiation and deduplication; honest device/runtime acceptance record |
| 7 | Approved identity continuity and site/app handoff | Cross-project funnel fixture, absent-consent/unlinked mode, namespace collision, forged handle, replay and account-switch tests |
| 8 | Central goals and true ordered-funnel projections | Same-cohort ordering, window boundaries, late correction, mature/provisional cohorts and legacy coexistence |
| 9 | Trends, distincts, cohorts, retention, numeric measures and acquisition attribution | Exact multi-day unions, D1/D7/D30 censoring, currency/unit boundaries, first/last-touch fixtures |
| 10 | Revenue/subscription state and reconciliation | Duplicate/out-of-order payment/refund lifecycle, trial/annual/discount/cancel cases; receipts and MRR reconcile to synthetic truth |
| 11 | Typed AnalyticsBundle successor, measurement health and opportunity evidence | Golden deterministic artifacts, missing-vs-zero states, privacy/size/injection fixtures and evidence-backed recommendations |
| 12 | Dashboard and full API/CLI/stdio MCP parity, saved reports/export, measurement-plan review flow | Same answers/permissions across interfaces; read-only preview; revision conflicts; accessible states; unchanged hosted OpenAI V1 catalog |
| 13 | Retention/deletion/cost/load hardening, rollout/migration rehearsal, docs and dogfood acceptance | Complete release gate below, no deferred core capability, explicit remaining environment/device limitations |

Original conceptual dependency order: 1 → 2/3 → 4 → 5/6/7 → 8/9/10 → 11/12 → 13. The current candidate skips deferred 5/6 and follows the completion plan checkpoints; this graph must not add downstream features to an earlier slice exit. Independent SDK work may proceed after contracts stabilize, but ordered funnel work cannot assume identity/capture semantics that have not been frozen. Storage and security tests accompany each slice; slice 13 is final integrated proof, not the first time these concerns are tested.

### Progress ledger — reconciled 2026-10-01

The original exit table above is unchanged. A component can meet its original local exit while a downstream feature or overall release gate remains open. Do not add those downstream features to its closure definition. Required contracts, safety and activation conditions remain binding. Before marking any slice reviewed, apply `.agents/skills/pre-ship-review/SKILL.md` and record its evidence; this docs-only reconciliation does not award closure.

| Original slice | Locally evidenced state at this handoff | Work owned by that slice / review still needed |
| --- | --- | --- |
| 1 — Contracts/design | Event, catalog, receipt, identity, outbox and metric contracts; approved dashboard design; partial SDK freeze | Complete the browser/Node signature/config/mode/examples matrix and outstanding metric/privacy decisions. Other-language implementation and runtime proof belong to deferred releases. |
| 2 — Space membership/authorization | Same-organization space store, reviewed membership changes, all-source access and API/CLI/MCP adapters; membership/deletion integration tests exist | Audit the **original** linking, access, revoke/unlink/delete and unchanged single-project exits. Connected identity is slice 7; report execution is slices 8–10; report adapters/artifacts are 11–12. Those must not silently expand slice 2. |
| 3 — Catalog/writers/ingestion | Reviewed catalogs/plans/writers; protected S3/receipt/job handoff; authenticated server/relay/direct-client candidates and capability negotiation; default activation disabled | Audit original mixed batches, producer spoofing, credential/cache isolation, indexed receipts and retry-safe quota evidence. Record exact gaps. Report correctness and final activation remain separate dependent gates. |
| 4 — Browser and Node | Packed manual/automatic browser facts and a protected Node user fact traverse local ingestion/worker/project funnel; bounded SDK capture/delivery and consent regressions | Complete browser relay/identity/lifecycle and Node claimed modes/examples, source-success integration and one current setup. Keep SDK code small and use existing transport. |
| 5 — Other server SDKs/WP | Existing installed behavior and intentional local changes preserved | Deferred from this candidate; no semantic writer implementation required here. |
| 6 — Android/Swift/RN | Existing installed behavior and intentional local changes preserved | Deferred from this candidate; no semantic writer implementation required here. |
| 7 — Identity/handoff | Project namespaces and relay contexts; durable revocation and subject erasure; protected Node identity; connected namespace metadata only | Complete exact allowlists, one-use exchange, current membership/writer/context/consent authority, connected erasure and SDK account-switch/reset/joined-journey proof. Migration 26 belongs to this preparation; it does not perform handoff. |
| 8 — Goals/ordered funnels | Calculation/compiler, project and portfolio facts, partial-quality readers; disabled project API/CLI/MCP and local ordered-funnel UI | Finish goals, source/success evidence, late correction/rebuild and mature/provisional quality; connected funnel depends on slice 7. |
| 9 — Other growth metrics | Calendar-retention calculation kernel and partial browser acquisition inputs | Persist and expose trends, exact distincts, numeric measures, activation, retention/cohorts and attribution with their defined quality boundaries. |
| 10 — Revenue/subscriptions | Currency arithmetic and payment/refund calculation kernels only; financial admission closed | Verified billing-source namespace, separate durable financial dedupe, subscription state/reconciliation and corresponding reports. Never call a calculation kernel a complete revenue service. |
| 11 — AnalyticsBundle | Supporting types/kernels; successor generator not implemented | Typed deterministic artifact, measurement health/opportunities and missing-versus-zero/privacy/size/injection evidence. |
| 12 — UI/interface parity | Management APIs/CLI/MCP; local Tracking and project ordered-funnel UI; incomplete reports/export | Complete approved measurement/report flows and saved reports/export with shared domain services. Add each report's interfaces with that report, not as a second backend design. |
| 13 — Integrated acceptance | Scoped migration/readiness, retention/deletion, SDK and mixed-client evidence | Consolidated local package/upgrade/rollback/debug-regression and end-to-end acceptance, docs and reviewable cutover candidate; authorized live evidence follows separately. |

**Next:** completion-plan checkpoint 1: bound the review to original slices 2 and 3 plus exact JS contract gaps, then complete the project browser/Node goal/funnel workflow. Continue through connected identity, remaining reports, financials, AnalyticsBundle/UI and integrated acceptance. The current checkpoint indexes prior source/test evidence; no runtime suites were rerun for this reconciliation.

**Reporting:** show locally demonstrated behavior, reviewed slice exits, local candidate readiness and authorized external outcomes separately. Slices 5/6 are explicitly deferred and excluded from the current candidate denominator. No reliable percentage or completion count is asserted. Update this table in place, with evidence and exact missing items; preserve detailed history in the archive rather than appending competing current-status paragraphs.

## 14. Compatibility, migrations and release

Use ordered forward migrations with ledger/checksum validation, never bootstrap as an upgrade. Expand the schema first; deploy readers/validators and gated workers before new writers emit V2. Rehearse old SDK → new API, new SDK → old/unavailable capability, mixed batches, rolling worker versions and API rollback. Unsupported new semantic data must get an explicit capability/disposition, not disappear or be downgraded into falsely trusted V1 events.

Protocol version and package SemVer are separate. Plan the additive feature as a coordinated **minor** release on each family's current major, with exact versions allocated at release freeze; do not assume every package shares a version. A V2 wire envelope negotiated alongside unchanged V1 need not force a package major. Changing existing hooks, init requirements, SDK return types, custom transport behavior or V1 output semantics does require the normal explicit breaking-change review/major migration. Existing V1 safety corrections are bug fixes, not a reason to force new analytics adoption. If a correction needs an earlier patch, scope and authorize that release independently; do not conceal an existing defect merely to avoid a follow-up version.

Preserve V1 project settings, funnel schemas, event interpretation, CLI JSON, artifact retrieval and SDK signatures. Keep historical legacy results accessible. Catalog/funnel upgrades are explicit, with an effective date. Dual processing must ledger the original event once and keep analytical projections separate from billing counters.

Runtime readiness must fail closed if required migrations are absent. Feature flags keep incomplete V2 functionality inaccessible until all dependency gates pass. Rollback disables new writes/jobs and preserves data; destructive schema cleanup is a separate later operation, not part of this release. Never enable analytics or broader collection for an existing project merely because it upgraded.

Apply contract/documentation changes with their implementations: `spec/requirements.md`, `spec/acceptance.md`, `contracts/sdk-interface.md`, API/CLI/MCP/schema docs, relevant privacy/domain/security rules, SDK READMEs, `SYSTEM_OVERVIEW.md`, `ARCHITECTURE_MAP.md` and site docs. Follow repo size limits by adding cohesive modules instead of inflating already large storage/routes files.

The existing `analyticsbundle-agent-native-analytics-plan.md` remains the historical browser-first plan, not an unfinished checklist to overwrite. Its non-goals/contracts are changed explicitly where this proposal extends them. Hosted deployment work belongs in `.local-repos/debugbundle-cloud`; SDKs and `site/` have their own repository/release boundaries.

### Coordinated candidate and publication gates

Freeze the full browser/Node feature/configuration matrix before the selected packages are published. Other SDK-family implementation and runtime gates apply to their later releases. Prepare all candidates and run installed-artifact integration against the exact shared-package archives; source aliases or workspace linking do not prove a consumer can install the feature. Follow `rules/sdk-testing-strategy.md`, current standalone-repo workflows and `rules/release-governance.md`; stale workspace-bridge prose is not permission to skip standalone gates.

1. Qualify expanded migrations, readiness, compatibility readers, worker ownership and feature gates against a populated predecessor database; rehearse compatible rollback. Deploy negotiated support before enabling new writers, with owner authorization for external actions.
2. Publish changed core-owned shared-types/redaction prerequisites, then same-version Node/Browser packages. Preserve independent shared-package versions and exact tested dependency ranges.
3. **Deferred from this candidate:** publish independent backend and Android/Swift package families after their later candidate gates. Publish React Native only after its exact supported native dependencies are registry-visible and installed-app smokes pass; qualify both bridges and claimed framework/runtime lanes.
4. **Deferred from this candidate:** publish WordPress only after its PHP/browser prerequisites; execute the extracted browser asset with actual PHP-generated configuration and test the assembled ZIP in installed WordPress. Do not infer plugin safety from source SDK tests.
5. Verify each exact registry artifact, source revision, package contents, provenance/checksums and clean consumer. Retry unchanged verification on registry propagation delay; do not republish/move immutable tags to bypass it.
6. Update core `package.json`, `apps/web/package.json`, `site/package.json` and their lockfiles only after registry versions exist; verify actual installed dogfood versions. Update packaged/public docs, examples, configuration precedence, support labels, migration notes and changelogs together.
7. For changed CLI/MCP/OpenClaw surfaces, run parity and packed-consumer gates. After any new `@debugbundle/mcp` publication, run the repo-owned MCP ecosystem pipeline (official registry, Smithery MCP/skill, ClawHub skill/OpenClaw plugin and discovery). Preserve the separately frozen hosted OpenAI catalog and independent release process.
8. Activate only complete, owner-approved functionality; record immutable source/artifact/deployed refs, retained rollback release, synthetic dogfood truth and live readback. Package publication, deployment, customer adoption and actual browser/device acceptance are separate results.

New SDK features must not require installed customers to add a hook, helper service, consent popup or new option merely to keep debug capture safe. A new opt-in analytics authority/configuration step is documented as a feature setup step. Public examples must show both the normal existing debug install and the minimal additional analytics integration.

## 15. Requirements traceability and acceptance gates

Preserve FR-ANL-01 through FR-ANL-29 and AC-ANL-01 through AC-ANL-20 (including lettered additions), SDK safety, separate analytics quotas, deterministic bundles and SEC rules. Where their browser-only/project-only scope must expand, write additive/versioned requirements rather than pretending the old wording already authorizes new identity storage or joined reports.

Proposed requirement labels below are planning labels; allocate final FR/AC identifiers during slice 1:

| Proposed requirement | Primary acceptance proof |
| --- | --- |
| SEMANTIC-CAPTURE | Browser/server/mobile event parity; actual success boundaries; no phantom visits; no uncaught SDK errors |
| ANALYTICS-SPACE | Explicit same-owner binding; distinct source lineage; no joins/leaks without every source permission |
| IDENTITY-LIFECYCLE | Consent-aware anonymous/known/account linkage; no cross-user merge; logout, rotation, deletion and tenant isolation |
| CONSENT-OWNERSHIP-AND-WITHDRAWAL | No injected consent UI; existing customer consent state drives SDK; unsent revoked analytics cannot newly transmit/retry/replay; debug transport unaffected; in-flight limitation documented |
| MEASUREMENT-CATALOG | Typed event/property rules; immutable revisions; read-only preview; explicit historical coverage |
| ORDERED-FUNNELS | Correct same-subject event ordering/window; true denominators; mature/provisional/unknown separation |
| GROWTH-METRICS | Multi-period exact distincts, feature use, valid cohorts/retention and attributable conversion |
| REVENUE-STATE | Verified source, idempotent receipts/refunds, coherent subscription MRR and reconciliation |
| EVIDENCE-QUALITY | Missing instrumentation is not zero; typed coverage and provenance; deterministic bounded artifacts |
| AGENT-PARITY | Shared domain answers via dashboard/API/CLI/stdio MCP; unchanged approved OpenAI V1 boundary |
| SAFE-UPGRADE | Ordered migrations, rolling versions, old client compatibility, bounded retention/cost and operational rollback |
| SDK-SAFETY-PARITY | First-buffer protection and bounded no-throw capture for analytics; published debug hooks, filtering, suppression, priority, queue ownership and PHP exception preserved |
| SDK-DELIVERY-PARITY | Canonical ACKs, original mixed-batch indices, five-minute retry cap, shared browser lifecycle budget, revocation fencing and native queue/bridge compatibility |
| SDK-CAPABILITY-AND-RELEASE | Restrictive versioned config, legacy/offline behavior, full signature/mode matrix and exact staged/published-consumer proof for each activated SDK; other families qualify with their later release |

Required test suites/fixtures:

1. Unit/property tests for schema validation, redaction, event/operation IDs, timezones/DST, money rounding, identity namespace separation, aggregation associativity and deterministic serialization.
2. A tiny hand-calculated cohort dataset: duplicate events, A-only/B-only different people, B-before-A, repeated entry, step outside window, same-timestamp ambiguity, late receipt, account team participation and an immature cohort. Assert exact counts, not just response shapes.
3. Repeat visitors across hour/day boundaries and cross-project visits: one subject counted once for window uniques; project sums explicitly differ from deduplicated space counts.
4. Same-site and cross-domain handoff: consent absent, forged/replayed/expired codes, disallowed origin, shared device, two users, namespace collisions, source revocation and origin project retention.
5. Privacy/security: raw identifiers and secret-like dimensions rejected; no customer values in catalog discovery; server authority spoofing fails; configured sensitive-cell suppression is consistent across complementary totals, filters and exports; authorized low-sample totals have honest warnings; prompt injection is inert evidence.
6. Transport/concurrency: timeout/retry, accepted/rejected mixed indices, process crash, worker replay, outbox replay, duplicate financial webhooks, state updates arriving out of order, debug buffer isolation and bounded resource use.
7. Retention/deletion: expiry during active funnels, insufficient entitlement/history, subject removal, project unlink/delete, cache/artifact authorization recheck, downgrade, key rotation and finalized-report revision semantics.
8. Compatibility: old/new event and bundle golden fixtures, old SDKs/config, relay formats, CLI/MCP output versions and migration from a populated pre-upgrade database.
9. Docker-backed integrated acceptance through real SDK → API/relay → queue → worker → projections → API/CLI/stdio MCP → deterministic artifact. Hosted and self-hosted behavior equivalent except documented provider/billing boundaries.
10. Load/cost budgets: multi-tenant fairness, cardinality attack, busy accounts, project-space fanout, maximum active windows, bounded queue recovery and no measurable breach of agreed debug ingestion/SDK performance budgets.
11. Financial synthetic truth: partial/full refunds, two legitimate purchases, repeated webhook IDs, separate webhook types for one payment, annual subscriptions, upgrades/proration, scheduled cancellation, non-USD exponents, trial expiry and delayed reconciliation.
12. Dogfood: approved synthetic journey distinguished from real traffic, backend truth matched to aggregates, first-party handoff observed, absence-of-consent path verified, no mistaken claim that bundle retrieval means a fix.
13. Consent withdrawal: populated analytics queue before revoke; scheduled/manual/microtask/retry/unload dispatch; asynchronous identity/config work; in-flight completion; rapid re-grant/reinitialization; offline/native bridge queues; direct/relay modes. Assert no stale transmission or replay after withdrawal while queued debug events still work. Document already-transmitted requests separately from unsent work and verify no consent UI is injected.
14. First-buffer SDK safety: absent consent, disabled capture, full queues, throwing getters/proxies/serializers, cyclic/deep/wide inputs, caller mutation after capture, held config/crypto work and pending identity hooks. Assert cheap rejection before traversal, bounded protected snapshots only, mandatory credential corpus at memory/disk/bridge/relay/HTTP boundaries, no unhandled errors, and useful safe fields preserved. Cover V1 corrections as well as V2.
15. Hook/priority compatibility: existing debug callbacks receive only debug envelopes, retain valid replacement-ID/drop/fallback behavior and run at published timing; optional analytics hooks follow their separate contract, prepare once and never run at unsafe unload. With 10,000 analytics calls and a stalled sender, debug errors still capture/deliver within baseline bounds. Verify count **and** byte charges for replacements, overlapping sends, timed-out custom transports and retired generations.
16. Transport conformance corpus in every affected SDK: empty/malformed/overflowing ACK counts, duplicate/out-of-range indices, all-rejected and mixed terminal/retryable entries, bodyless built-in versus explicit custom/file/legacy cases, numeric/date/nonfinite/extreme retry hints, response-relative deadlines, unauthorized responses and oversized bodies. Lost ACK retry preserves event/operation identity, accepted entries cannot resurrect, and debug status remains compatible.
17. Browser/native lifecycle: combined 60-KiB debug/analytics reservation, debug-first selection, repeated hidden/pagehide, beacon acceptance/decline/throw, keepalive failure/timeout, revoke between body preparation and fetch invocation, overlapping acknowledgements, huge event, back-forward cache and bounded explicit flush. Native fixtures cover populated old queues, restart/OS termination, storage corruption/full disk and new JS against old native bridges. No unexecuted browser-engine/physical-device claim.
18. Configuration/mode compatibility: old response shape and ETag/cache isolation; analytics-off and unsupported/temporarily unavailable V2; endpoint/token rotation; no browser polling/relay credential leakage; offline expiry and eventual remote-disable learning; self-host without internet; all claimed local/connected relay/framework paths. Test referrer/campaign disablement and explicit V1/V2 sampling units separately from debug and journey-example sampling.
19. SDK release matrix: each supported predecessor → exact candidate and compatible rollback; each framework/logger adapter still works; imports have no side effects; minimum/intermediate/current runtime lanes, packed package types/exports, published dependency versions, native bridge/WordPress assembled artifacts and optional outbox consumers pass. Rerun applicable existing debug safety/privacy suites alongside new analytics fixtures; package builds alone cannot close the gate.

Use the repo's Docker/Make gates and every touched SDK's own checks. Establish quantitative performance/storage baselines and acceptable thresholds in slice 1; do not claim they passed from source inspection. UI design approval and any requested browser/device acceptance are separate from automated source tests.

Known starting points are `make privacy-fixtures-check`, `make privacy-js-candidate-check`, targeted `make test-focused TEST_FILES=...`, and the existing Docker-backed integration gates; each standalone SDK owns its actual runtime/package matrix. Check current target definitions before execution. Add a repo-owned Make target if the integrated semantic conformance/upgrade matrix needs a new runner. Record skipped/unsupported lanes explicitly instead of converting them into passes. This document-only re-review ran no product test suite and grants no release approval.

## 16. Decisions to ratify before implementation

Recommended defaults are sufficiently concrete to start contract design, but the following require explicit product/security confirmation:

1. One active same-organization analytics space per project; no cross-organization identity joins.
2. Protected pseudonymous analysis state and its retention/deletion policy, with 30-day funnel, 48-hour correction and 90-day detailed analysis caps as starting engineering proposals.
3. New server-only event authority, canonical identity namespace and first-party handoff threat model.
4. Tier/capacity limits for new definitions, state and reports; no silent changes to existing paid entitlements or collection settings.
5. Subscription MRR policy and provider-neutral contract, including how unavailable/partial billing history is represented.
6. SDK support matrix and the required runtime/device evidence for each published claim.
7. Existing-component UI proposal and normal release approvals.

Engineering freeze items are the exact signatures, hook scope, per-runtime resource budgets, acknowledgement/disposition and outbox semantics, capability refresh/cache behavior, V1 sampling discrepancy resolution and mode/runtime/release matrix in section 6. These are slice-1 deliverables, not permission to improvise incompatible choices in later SDK slices. Source/contract discrepancies require an explicit documented resolution; do not edit tests simply to agree with current implementation.

**Readiness after this review:** the implementation scope and SDK regression gates are strengthened, but feature coding must follow the contract-freeze slice and the existing owner decisions above. No claim that implementation, published packages or production are already gap-free is made. The aim is to settle cross-SDK behavior before publication and include the necessary fixes in the planned phase, not to promise that future patches will never be necessary.

## 17. Definition of done

One owner-approved, versioned measurement plan can be installed using normal SDK hooks and then managed through existing agent-friendly interfaces. It answers the core questions in section 3 for single projects and explicitly linked site/app/backend projects; demonstrates correct attribution, activation, retention and monetization with known fixtures; and reports incomplete coverage honestly.

All eleven applicable slices are implemented, tested, documented and compatibility-reviewed for the browser/Node candidate; original slices 5 and 6 remain explicitly deferred for their later SDK releases. No new third-party analytics dependency is required for these core reports. Installed projects keep working. Collection remains opt-in. Hosted OpenAI V1 stays within its approved read-only projection. Marketing can use the resulting measurements without overstating audience, conversion, causal impact or revenue.

The owner subsequently authorized local implementation on 2026-09-28. This does not authorize commit, push, publication, deployment or production settings/credential changes. The owner explicitly approved the concrete design proposal on 2026-09-28; the AGENTS.md §3 gate for local UI implementation is satisfied.


Current continuation is recorded only in the reconciled ledger and linked completion plan/checkpoint. Historical no-SDK and all-thirteen execution statements are superseded by the owner-selected browser/Node candidate; the full backend/report/UI/artifact scope remains required.
