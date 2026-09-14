# Incident reliability review and capacity gates

Released in hosted core 1.9.1 on 2026-09-14. This records verified corrections and remaining work, not a production capacity certification. Production evidence and incident dispositions are retained in `spec/local/incident-reliability-review-2026-09-13.md`.

## Corrections in this change

| Boundary                     | Correction                                                                                                                    | Requirement / proof                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| MCP bursts                   | One-second local wait, maximum 32 waiters and eight per grant, cancellation/shutdown cleanup, shared Redis admission retained | NFR-MCP-01; eight overlapping HTTP reads, 10,000 local admission attempts |
| Client behavior              | Initialization advertises rate/concurrency budgets and Retry-After backoff                                                    | NFR-MCP-01; SDK initialize regression                                     |
| Operational incidents        | Ten rate/capacity rejections in a process-local minute emit one stable pressure signal; all individual outcomes remain logs   | NFR-OBS-03; 10,000-signal regression, immediate real-failure coverage     |
| Self capture                 | Dedicated MCP/OAuth operational monitor owns these failures; generic self HTTP captures are dropped                           | SEC-33 / AC-MCP-16; excludes duplicate incidents and ambient request data |
| OpenAI artifact state        | Recognize normalized S3 absence; distinguish missing, covered, quota, disabled, build-error and read-error cases              | INV-25; actual object-store integration plus reader tests                 |
| OpenAI reproduction privacy  | Omit stored curl/HTTPie strings, including legacy artifacts                                                                   | SEC-33; embedded identity/body regression                                 |
| Reproduction accuracy        | UNKNOWN/invalid methods or URLs cannot yield replay; missing-origin templates are explicitly infeasible                       | FR-BND-07 / AC-REP-02; deterministic golden and invalid-input tests       |
| Customer release attribution | Remove shared worker deployment/repository fallback                                                                           | FR-BND-01; distinct customer/platform SHA tests                           |
| Duration persistence         | Compare numeric durations without narrowing to Postgres integer                                                               | FR-PROC-01 / NFR-REL-03; real decimal and large-duration evidence         |
| Queue recovery               | Atomically move stale claims in batches of 100                                                                                | NFR-REL-03; 1,000 claims with concurrent reclaimers                       |

The worker durability extension adds the forward migration `202609130001_add_durable_worker_jobs`; upgrades run `db:migrate`, never `db:bootstrap`. Public API, SDK, CLI, MCP, and bundle formats remain compatible. The large worker and metadata modules are split by responsibility while their existing barrel imports remain available.

## Durable worker handoffs in core 1.9.1

- Redis ingress is acknowledged only after Postgres owns the job. Normalization commits the processed-event marker with grouping and optional improvement intents. Grouping commits occurrence/dedupe/retention metadata with required follow-ups. Nested domain transactions use savepoints.
- Jobs have fenced five-minute leases, heartbeats, exponential retry delays, eight automatic attempts, and inspectable failure metadata. Optional improvement evaluation is a separate durable job. Transient artifact failures propagate to the retry owner; quota/disabled/missing evidence remains an explicit unavailable outcome.
- Incident stages get a fair pass through the queue; outbound delivery runs in a separate bounded serial lane in the same worker process. Lifecycle publication waits for a successfully completed bundle dependency. Dependency receipts survive while children still reference them.
- Optional improvement jobs retain a scoped source reference, not a second raw-event copy. Full cleanup batches resume promptly under a bounded cadence.
- Concurrent analytics/incident writes acquire correlation locks before rollup work so route impact cannot be missed through a stale or skipped CTE read.
- Concurrent same-fingerprint grouping is serialized through a transaction lock. Out-of-order arrivals extend the actual first/last occurrence bounds without moving the last-seen time backwards.
- Hosted candidate workers start paused. Migration and protocol readiness precede promotion; activation follows committed promotion. Once Postgres jobs exist, an old Redis-only worker is not a compatible worker rollback.
- `make worker-jobs` provides bounded metadata inspection and an explicit single-job retry for retained failed work. It is an internal database operator command, not a new public API capability.

See `spec/worker-durability.md` for the exact ownership, retention, operator, rollout and test contracts. Local failure-injection checks are evidence for these boundaries; deployment and production observation remain separate gates.

## Reliability gates beyond this candidate

1. **Accepted ingestion durability.** The public ingestion path still writes S3 and Redis separately. The new journal takes ownership when the worker adopts the Redis job. Verify Redis persistence/restart behavior and SDK indexed acknowledgements; an arbitrary S3 object is not proof that processing was accepted. S3-to-queue reconciliation remains separate work.
2. **Historical partial work and malformed legacy queues.** Old processed markers may already lack follow-ups; new transactions cannot reconstruct evidence that was lost earlier. Keep malformed legacy Redis envelopes retained for a reviewed quarantine/recovery process. Do not delete processed markers or replay a production backlog wholesale.
3. **Artifact publication and scale-out.** Keep one active incident-processing worker for the initial hosted rollout. Concurrent group/claim tests do not certify concurrent writers to the same canonical bundle/reproduction object. Before adding worker replicas, prove artifact write ordering, metadata-versus-object recovery, retention during rebuild, and generation/notification/billing idempotency under overlapping writers. Provider sends remain at-least-once across a crash after send and before its delivery receipt.
4. **Production proof.** Migrate and deploy reviewed immutable versions, check activation and backlog age, then verify a bounded project-owned capture through incident, bundle and reproduction. Observe representative traffic before public capacity claims or mass artifact repair.

## Capacity work still required

- Define the target separately for events/second, batched ingestion HTTP requests/second, and interactive evidence reads/second. Thousands of events/minute is substantially different from thousands of HTTP requests/second. Tier allowances are not benchmark results.
- Use a realistic cardinality distribution: hot fingerprints plus new fingerprints, multiple tenants, different services/environments, large allowed payloads, mixed errors/logs/request events, and concurrent incident/improvement/artifact reads.
- Measure the full path with real Postgres, Redis and S3-compatible storage: ingestion accepted/rejected counts, durable backlog age, event-to-incident and event-to-bundle latency, duplicate/lost events, errors, database pool waits, memory, CPU, event-loop delay and storage latency.
- Run step load, burst recovery and a sustained soak with worker/Redis restarts and storage/database fault injection. Test backlog draining after the producer rate subsides. Mocked ingress and bounded-queue tests are not throughput measurements.
- Keep ordinary API/worker capacity reserved. MCP authentication currently precedes the execution gate; tool timeout races do not cancel all underlying I/O. Object downloads are size-checked after materialization. Before raising concurrency, enforce query/connect/read deadlines, bounded object reads, cancellation and capacity accounting for outstanding I/O, and measure isolated pools or a separate evidence-read service.
- The current defaults remain two executing MCP calls globally and per grant, 60 authenticated requests/minute/user/grant, 20 artifact-tool calls/minute/user/grant, and a 2,000-request/minute global backstop. Global execution may rise to four only after the existing reserve and NFR-MCP-03 thresholds are proven. Horizontal replicas must share coordination; a local wait is not a distributed queue or fairness guarantee.
- Client instructions are guidance. Always enforce server limits even if ChatGPT ignores them. Persistent overload must remain visible through aggregate incidents plus authoritative per-request metadata logs.

## Additional product follow-ups

- Correlate duplicate exception/log reports by explicit throwable/request/job identity at the SDK boundary. Keep independently emitted log-only errors actionable. Message equality alone is unsafe for dedupe. The SayCheese report confirms this symptom; this change does not modify its PHP SDK.
- Historical deployment lookup now selects the latest deployment for the exact project, service and environment at or before the triggering occurrence. Raw deploy envelopes use the same service/environment/time boundary and cannot override newer scoped history. Existing artifacts still require the repair policy below.
- Missing application frames or a promise rejection with an undefined reason are evidence limitations. Preserve these incidents until a scoped recurrence provides enough diagnostic context; do not label them noise solely because replay is unavailable.

## Existing artifact repair policy

After a reviewed API/worker rollout, inventory affected artifacts with read-only metadata queries and selected bounded samples. Preserve the original artifact, generation metadata and digest before changing it. Rebuild only where retained source evidence is sufficient, using the owning project's deployment evidence; otherwise explicitly show unknown/unavailable. A missing artifact is not permission to fabricate evidence or consume allowances automatically.

Use a bounded, resumable repair with dry-run inventory, per-project scope, dedupe keys, rate limits and validation of the resulting artifact. Avoid replaying a production backlog wholesale: historical stage-deduplication gaps and external side effects can either skip work or amplify notifications/billing. Resolve or annotate pressure/duplicate incidents only after post-rollout verification; real worker/DNS failures remain separate. No production repair or incident resolution is performed by this local change.

## Browser and improvement evidence corrections

- Native browser `ErrorEvent`, `PromiseRejectionEvent` and DOM fields are inherited accessors. The JS SDK reads a fixed allowlist with guarded getters instead of enumerating native objects. It keeps the original application error, source coordinates and existing bounded structural breadcrumbs; it never fabricates an SDK listener stack for a missing error. Cross-realm errors remain supported. Form inspection is capped at 1,000 controls and stores only a count. No new runtime dependency, polling or capture option is added.
- Browser stack HTTP(S) URLs drop credentials, query and fragment while retaining source line/column. Browser-event page/resource URLs retain their existing sanitization. Genuine cross-origin `Script error.` events may have their details withheld by the browser; the SDK cannot reconstruct them. Correct script CORS configuration or application-owned error capture is required for new evidence.
- The additive OpenAI `primary_signal.browser_context` projection exposes a bounded source/resource clue, page state and explicit evidence status. It uses only a matching frontend exception at or before capture, with safe route fallback from existing frontend evidence. It does not expose raw DOM, breadcrumbs, stack strings, URL query or request bodies.
- Improvement builders convert PostgreSQL text timestamps to ISO UTC before BundleV1 validation. All three independently generated kinds (warning hotspot, slow request, request-failure pattern) have real-Postgres regressions. Incident-derived improvements continue to use related incident bundles. A stored `build_error` remains distinct from intentional absence or a read failure.
- Improvement detection bounds follow earliest/latest event occurrence time, including delayed arrivals. Latest title, summary, evidence and source-event ID remain associated with the latest occurrence; exact replay does not increment the count. Artifact generation time is separate from last detection and does not advance on every log line.
- Fingerprint v2 normalizes Java calendar values only inside the known WildFly WFLYEJB0020/0022 timer diagnostics. Error codes, component, timer state and following exception remain significant. Existing incidents are not re-fingerprinted. Ingestion derives a bounded v1 fingerprint alias when installed v1 exact-match rules need it, preserving rule behavior without trusting client-provided fingerprint metadata. Unchanged messages retain their hash.

`make browser-evidence-check` exercises native Chromium runtime/rejection/resource/cross-origin errors through the actual local Node relay, normalization, deterministic bundle and OpenAI projection. JS SDK `make check` covers unit/privacy/safety, per-file coverage, builds and packed consumers; Java SDK `make verify` covers its unchanged relay plus servlet integrations. This is local proof, not evidence that installed SDKs have been upgraded.

Server ingestion also removes credentials/query/fragment from frontend exception HTTP(S) stack locations before persistence, including submissions from installed older SDKs. This protects new ingested events; historical stored artifacts still follow the bounded repair policy.

## Hosted release verification — 2026-09-14

Core 1.9.1 passed full CI and the canonical release gates, then passed the hosted migration, paused-candidate, promotion and activation checks. The image build now also executes the pause-setting parser before publication. Core 1.9.0 was rejected by the promotion guard because that setting was omitted from environment parsing; use 1.9.1 for staged worker deployment.

Published shared/Node/browser packages are 1.7.1, CLI/MCP packages are 1.8.1, and the WordPress wrapper is 1.4.3. The hosted app and paired site use the published browser dependency. Existing customer applications still need their own SDK upgrade and deployment.

An isolated project with notifications disabled accepted four native Chromium errors through the published browser SDK and Node relay, plus ten warnings through the Node SDK. All four incident bundles and reproduction artifacts were readable; the ordinary error retained its application message, stack, source and route, while resource/cross-origin evidence retained explicit limitations. The warning produced a schema-valid improvement bundle with current ISO timestamps and no build failure. All 67 scoped jobs completed on their first attempt and cleared their payloads. API/MCP readiness, the exact app revision, updated documentation and OAuth boundaries passed independent checks.

This is bounded live functional evidence. Limits and worker count remain unchanged; representative load/soak, customer SDK adoption and reviewed historical artifact repair remain separate follow-ups. Missing historical browser details cannot be reconstructed.
