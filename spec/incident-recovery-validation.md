# Incident burst and recovery validation

This exercise covers FR-ING-01/03/04, FR-PROC-07, NFR-REL-02/03 and INV-4 using actual API and worker entry points. It is separate from the older mocked ingestion load check and from production maximum-capacity certification.

Run `make install` once, then `make incident-recovery-check`. The driver creates uniquely named local Docker containers, networks and volumes, uses only synthetic projects and local credentials, and removes its resources when finished. It never restarts a production service. Node tooling runs inside Docker. Reports contain counts, timings and resource samples; transient project-token state is removed after the run.

The workload uses three projects, eight recurring fingerprints per project, 2,100 unique events in individual HTTP requests, a 12-client burst, 120 seconds at ten requests per second, and 60 exact event replays. The API and worker have 384/512 MiB memory ceilings and 0.5/1 CPU ceilings; local Postgres and S3-compatible storage are real services. These are bounded local resource ceilings, not a simulation of hosted network or managed-database performance.

The gates are:

- Demonstrate the snapshot-only persistence gap with 150 accepted events waiting for worker adoption and a forced Redis crash.
- Enable Redis append-only persistence with a disk flush for every write; preserve all 150 pending events through container removal and recreation using the same data volume.
- Kill a worker while it owns a journal lease, restart it with the normal five-minute lease settings, and restart Redis while test traffic is active.
- Drain the queue within the bounded recovery window; require every unique accepted event to be processed exactly once, 24 incidents with exact occurrence totals, no exhausted jobs, schema-valid bundles and readable reproduction objects.
- Fill the real rate limiter's budget and verify the ordinary HTTP 429 response with a positive Retry-After. This tests enforcement without accepting thousands of unnecessary extra events.

Redis snapshotting alone can lose recent accepted queue writes before Postgres adoption. Append-only persistence with `appendfsync always` flushes writes before acknowledgement, at an I/O cost that must be measured. Existing Redis installations must enable AOF online and wait for initialization before restarting with persistent startup settings; retain their exact data volume. Do not simply attach an empty named volume or change startup flags on an unconverted existing dataset. See [Redis persistence guidance](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

The hosted operator flow belongs to `debugbundle-cloud`: validate active and previous release configurations, preserve the existing immutable Redis image and volume, create a protected snapshot/config backup, enable and verify AOF online, then recreate only Redis from the reviewed configuration. A short-lived non-customer persistence canary must survive recreation. Verify API/worker health, jobs, errors and resource headroom afterwards. No larger host, worker replica, schema migration, SDK publication or raised request limit is implied.

Self-hosted installations also need reviewed Redis persistence and volume preservation appropriate to their recovery requirements. This validation does not silently change an existing self-hosted Redis dataset. Host/disk loss still needs backup/restore; multiple worker replicas, prolonged soak and higher MCP concurrency require their own evidence.
