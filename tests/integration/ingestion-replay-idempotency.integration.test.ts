import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import { expect, it, beforeAll, afterAll } from "vitest";

import { processNextGroupIncidentJob } from "../../apps/worker/src/processor.js";
import {
  buildRawEventObjectKey,
  createPostgresMetadataStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";

import {
  createTestObjectStore,
  runIntegration,
  createIntegrationPool,
  createS3AdminClient,
  redisUrl,
  bootstrapStorageAndCreateBucket,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("ingestion integration \u2013 replay idempotency", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should not enqueue additional build-bundle jobs on duplicate replay for new_context_type trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Bundle New Context Replay Org",
      organizationSlug: `bundle-new-context-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle New Context Replay Project",
      projectSlug: "bundle-new-context-replay-project"
    });

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, environment)
        VALUES ($1, $2, $3, $4)
      `,
      [serviceId, projectId, "checkout-api", "production"]
    );

    await pool.query(
      `
        INSERT INTO incidents (
          id,
          project_id,
          service_id,
          environment,
          fingerprint,
          fingerprint_version,
          title,
          severity,
          status,
          first_seen_at,
          last_seen_at,
          occurrence_count,
          matched_fields,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'open',
          $9::timestamptz,
          $9::timestamptz,
          1,
          $10::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_new_context_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, existingEventId, "backend_exception", "2026-03-12T00:00:00.000Z", true]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const groupJob = {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "frontend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_new_context_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("new_context_type");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);
  });

  it("should not enqueue additional build-bundle jobs on duplicate replay for deploy_metadata trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Bundle Deploy Replay Org",
      organizationSlug: `bundle-deploy-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Deploy Replay Project",
      projectSlug: "bundle-deploy-replay-project"
    });

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, environment)
        VALUES ($1, $2, $3, $4)
      `,
      [serviceId, projectId, "checkout-api", "production"]
    );

    await pool.query(
      `
        INSERT INTO incidents (
          id,
          project_id,
          service_id,
          environment,
          fingerprint,
          fingerprint_version,
          title,
          severity,
          status,
          first_seen_at,
          last_seen_at,
          occurrence_count,
          matched_fields,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'open',
          $9::timestamptz,
          $9::timestamptz,
          1,
          $10::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_deploy_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, existingEventId, "backend_exception", "2026-03-12T00:00:00.000Z", true]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const groupJob = {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "deploy_metadata" as const,
      event_class: "context_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_deploy_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high" as const,
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-12T00:05:00.000Z"
      }
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("deploy_metadata");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);
  });

  it("should not enqueue additional build-bundle jobs on duplicate replay for occurrence_threshold trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const incomingEventId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Bundle Threshold Replay Org",
      organizationSlug: `bundle-threshold-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Threshold Replay Project",
      projectSlug: "bundle-threshold-replay-project"
    });

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const groupJob = {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "backend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_threshold_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("occurrence_threshold");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);
  });

  it("should not enqueue additional build-bundle jobs on duplicate replay for regression_reopen trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Bundle Regression Replay Org",
      organizationSlug: `bundle-regression-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Regression Replay Project",
      projectSlug: "bundle-regression-replay-project"
    });

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, environment)
        VALUES ($1, $2, $3, $4)
      `,
      [serviceId, projectId, "checkout-api", "production"]
    );

    await pool.query(
      `
        INSERT INTO incidents (
          id,
          project_id,
          service_id,
          environment,
          fingerprint,
          fingerprint_version,
          title,
          severity,
          status,
          first_seen_at,
          last_seen_at,
          occurrence_count,
          matched_fields,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'resolved',
          $9::timestamptz,
          $9::timestamptz,
          1,
          $10::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_regression_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, existingEventId, "backend_exception", "2026-03-12T00:00:00.000Z", true]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const groupJob = {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "backend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_regression_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("regression_reopen");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);
  });

  it("should not enqueue additional build-bundle jobs on duplicate replay for reproduction-confidence-change trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Bundle Repro Confidence Replay Org",
      organizationSlug: `bundle-repro-conf-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Repro Confidence Replay Project",
      projectSlug: "bundle-repro-conf-replay-project"
    });

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, environment)
        VALUES ($1, $2, $3, $4)
      `,
      [serviceId, projectId, "checkout-api", "production"]
    );

    await pool.query(
      `
        INSERT INTO incidents (
          id,
          project_id,
          service_id,
          environment,
          fingerprint,
          fingerprint_version,
          title,
          severity,
          status,
          first_seen_at,
          last_seen_at,
          occurrence_count,
          matched_fields,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'open',
          $9::timestamptz,
          $9::timestamptz,
          1,
          $10::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_repro_conf_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, existingEventId, "backend_exception", "2026-03-12T00:00:00.000Z", true]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const groupJob = {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "request_event" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_repro_conf_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("reproduction_confidence_change");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);
  });

  it("should keep the latest occurrence sampled and delete displaced middle raw blobs", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");
    await pool.query("DELETE FROM processed_events");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Sampling Integration Org",
      organizationSlug: `sampling-org-${organizationId.slice(0, 8)}`,
      projectName: "Sampling Integration Project",
      projectSlug: "sampling-integration-project"
    });

    const queue = createRedisQueueClient({ redisUrl });
    const objectStore = createTestObjectStore();
    await queue.clearJobQueue("group-incident");

    const groupDependencies = {
      queue,
      objectStore,
      incidentStore: createPostgresMetadataStore({
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      }),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 1,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher: {
        publish: () => Promise.resolve(undefined)
      }
    };

    const firstEventId = randomUUID();
    const secondEventId = randomUUID();
    const thirdEventId = randomUUID();
    const firstOccurredAt = "2026-03-11T00:00:00.000Z";
    const secondOccurredAt = "2026-03-11T00:00:01.000Z";
    const thirdOccurredAt = "2026-03-11T00:00:02.000Z";

    const writeRawEvent = async (eventId: string, occurredAt: string): Promise<void> => {
      await objectStore.putObject({
        key: buildRawEventObjectKey({
          projectId,
          eventId,
          occurredAt: new Date(occurredAt)
        }),
        body: gzipSync(Buffer.from(JSON.stringify({ event_id: eventId, occurred_at: occurredAt }), "utf8")),
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    };

    await writeRawEvent(firstEventId, firstOccurredAt);
    await writeRawEvent(secondEventId, secondOccurredAt);
    await writeRawEvent(thirdEventId, thirdOccurredAt);

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: firstEventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_sampling_123",
      normalized_message: "TypeError at checkout",
      matched_fields: ["environment", "normalized_message", "error_type"],
      occurred_at: firstOccurredAt,
      severity: "high"
    });

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: secondEventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_sampling_123",
      normalized_message: "TypeError at checkout",
      matched_fields: ["environment", "normalized_message", "error_type"],
      occurred_at: secondOccurredAt,
      severity: "high"
    });

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: thirdEventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_sampling_123",
      normalized_message: "TypeError at checkout",
      matched_fields: ["environment", "normalized_message", "error_type"],
      occurred_at: thirdOccurredAt,
      severity: "high"
    });

    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const sampledRows = await pool.query<{ event_id: string; is_sampled: boolean }>(
      `
        SELECT event_id, is_sampled
        FROM incident_events
        WHERE event_id = ANY($1::uuid[])
        ORDER BY occurred_at ASC
      `,
      [[firstEventId, secondEventId, thirdEventId]]
    );

    expect(sampledRows.rows).toEqual([
      { event_id: firstEventId, is_sampled: true },
      { event_id: secondEventId, is_sampled: false },
      { event_id: thirdEventId, is_sampled: true }
    ]);

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          eventId: secondEventId,
          occurredAt: new Date(secondOccurredAt)
        })
      })
    ).rejects.toThrow("s3_object_not_found");

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          eventId: firstEventId,
          occurredAt: new Date(firstOccurredAt)
        })
      })
    ).resolves.toBeInstanceOf(Buffer);

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          eventId: thirdEventId,
          occurredAt: new Date(thirdOccurredAt)
        })
      })
    ).resolves.toBeInstanceOf(Buffer);
  });

});
