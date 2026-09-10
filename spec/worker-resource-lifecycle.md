# Worker resource lifecycle

Source requirements: `NFR-REL-03`, `NFR-REL-04`, `NFR-REL-08`, `NFR-SCALE-01`; acceptance: `AC-WORKER-01`.

## Invariants

- Idle polls retain only active waits. Never repeatedly race a timeout against one unresolved process-lifetime promise: each losing reaction remains attached until shutdown.
- Poll completion unregisters its shutdown callback. Shutdown resolves all active polls and clears their timers, including long configured intervals. Existing readiness draining, queue acknowledgement, leases, concurrency, and job priority stay unchanged.
- The incident-frequency snapshot cache is a write-throttling optimization capped at 10,000 IDs. A successful persistence refreshes entry order; overflow evicts the oldest persisted entry. A failed write does not update or evict entries. Cache eviction can cause an extra guarded database write, not lost counters or older durable snapshots. Closing the counter clears the cache.
- Each temporary S3 readiness client is destroyed in `finally`; readiness still validates actual dependency and migration state on every probe.
- Status-only alert, lifecycle webhook, weekly Slack, and worker dogfooding requests abort any unread response when the attempt ends. GitHub token errors and dispatch responses cancel unused bodies without changing status/retry handling. Availability checks cancel redirect bodies before validating the next target, including targets rejected by SSRF rules.

## Local verification

`make worker-memory-check` runs Node 24 in a disposable 768 MiB Docker container against read-only source. Dependencies must already be installed through the normal Docker workflow. The script uses synthetic timers and real promises from the actual worker implementation: 2,000 warm-up polls followed by two batches of 100,000 completed polls, with full garbage collection and V8 promise-object counts at each checkpoint. It performs no network requests, worker jobs, or customer-data reads.

After warm-up, each checkpoint must retain fewer than 2,048 extra promises and less than 4 MiB extra heap. Completed timers must be zero; shutdown must clear both outstanding lane timers. The same check runs in the infrastructure unit suite and `make worker-check`, which also runs every worker test.

The original implementation retained about 69.6 MB and 300,000 promises per 100,000 completed polls in the isolated Node 24 reproduction. At the default idle maximum of five polls per second across the two lanes, that predicts about 12.5 MB/hour; actual job execution reduces polling frequency. The fixed implementation showed no positive retained-heap or promise growth across 200,000 polls. These are synthetic retention measurements, not total runtime RSS or a workload-capacity guarantee.

## Rollout and observation

This change needs no schema migration, data rewrite, customer configuration change, or new service. Ship through the normal approved immutable-image rollout and preserve the verified rollback release. Updating source alone does not fix an already running worker; a newly deployed process is required.

After rollout, verify both polling lanes, normal job delivery, readiness, container restarts/OOM state, and the exact deployed revision. Compare worker memory after warm-up, then over 24–48 hours at comparable workload. Use existing metadata-only host/container observations; do not collect customer-bearing heap dumps or add paid monitoring without approval.

RSS includes native allocations, buffers, and allocator retention as well as the JavaScript heap. It may rise during warm-up and fluctuate with work; the objective is a bounded working range, not an identical byte count at every sample. Keep the existing host memory reserve of the greater of 30% or 512 MiB. A sustained post-warm-up slope or reserve breach needs further investigation before raising workload caps.

Do not treat scheduled restarts, forced production garbage collection, tighter heap limits, or a larger server as proof that a leak is fixed. Keep the one-minute Team check floor and current execution caps; measure demand and remaining headroom before increasing capacity. Removing startup package-manager wrappers is a separate possible footprint optimization and requires its own startup/signal verification.
