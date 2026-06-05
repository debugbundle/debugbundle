import { randomUUID } from "node:crypto";

import { expect, it, beforeAll, afterAll } from "vitest";

import { processNextGroupIncidentJob } from "../../apps/worker/src/processor.js";
import { createLifecycleWebhookPublisher, scheduleDueWebhookDeliveries } from "../../apps/worker/src/runtime.js";
import {
  createPostgresMetadataStore,
  createPostgresWebhookDeliveryStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";

import {
  runIntegration,
  createIntegrationPool,
  createS3AdminClient,
  redisUrl,
  bootstrapStorageAndCreateBucket,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("ingestion integration \u2013 lifecycle webhooks", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should keep lifecycle webhook delivery intents stable on duplicate group-incident replay", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Lifecycle Replay Integration Org",
      organizationSlug: `lifecycle-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Lifecycle Replay Integration Project",
      projectSlug: "lifecycle-replay-project"
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
        "fp_lifecycle_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/lifecycle",
        "secret_123",
        ["bundle.reopened"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: createPostgresWebhookDeliveryStore(queryable)
    });

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
      lifecycleWebhookPublisher
    };

    const groupJob = {
      project_id: projectId,
      event_id: eventId,
      event_type: "backend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_lifecycle_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T00:01:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(firstDeliveryCount.rows[0]?.count).toBe("1");

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(secondDeliveryCount.rows[0]?.count).toBe("1");

    const deliveryRows = await pool.query<{ event_type: string; incident_id: string }>(
      `
        SELECT event_type, incident_id::text AS incident_id
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(deliveryRows.rows).toEqual([
      {
        event_type: "bundle.reopened",
        incident_id: incidentId
      }
    ]);
  });

  it("should not enqueue additional deliver-webhook jobs on duplicate group-incident replay without transitions", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Lifecycle Queue Integration Org",
      organizationSlug: `lifecycle-queue-org-${organizationId.slice(0, 8)}`,
      projectName: "Lifecycle Queue Integration Project",
      projectSlug: "lifecycle-queue-project"
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
        "fp_lifecycle_queue",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/lifecycle-queue",
        "secret_456",
        ["bundle.reopened"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore
    });

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
      lifecycleWebhookPublisher
    };

    const groupJob = {
      project_id: projectId,
      event_id: eventId,
      event_type: "backend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_lifecycle_queue",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T00:01:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(firstScheduled).toBe(1);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(secondScheduled).toBe(0);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);
  });

  it("should keep build-bundle and lifecycle side effects jointly stable on duplicate replay when regression and deploy conditions co-occur", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Lifecycle Overlap Replay Org",
      organizationSlug: `lifecycle-overlap-org-${organizationId.slice(0, 8)}`,
      projectName: "Lifecycle Overlap Replay Project",
      projectSlug: "lifecycle-overlap-project"
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
        "fp_lifecycle_overlap_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/lifecycle-overlap",
        "secret_overlap",
        ["bundle.reopened"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore
    });

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
      lifecycleWebhookPublisher
    };

    const groupJob = {
      project_id: projectId,
      event_id: eventId,
      event_type: "deploy_metadata" as const,
      event_class: "context_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_lifecycle_overlap_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T00:01:00.000Z",
      severity: "high" as const,
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-11T00:00:30.000Z"
      }
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("regression_reopen");

    const firstDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(firstDeliveryCount.rows[0]?.count).toBe("1");

    const firstScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(firstScheduled).toBe(1);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);

    const secondDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(secondDeliveryCount.rows[0]?.count).toBe("1");

    const secondScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(secondScheduled).toBe(0);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);
  });

  it("should emit bundle.updated once and keep replay no-op when non-regression deploy/context overlaps co-occur", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const webhookId = randomUUID();
    const baselineEventId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Non-Regression Overlap Org",
      organizationSlug: `non-regression-overlap-org-${organizationId.slice(0, 8)}`,
      projectName: "Non-Regression Overlap Project",
      projectSlug: "non-regression-overlap-project"
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
        "fp_non_regression_overlap_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, true)
      `,
      [incidentId, baselineEventId, "backend_exception", "2026-03-11T00:00:00.000Z"]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/non-regression-overlap",
        "secret_non_regression_overlap",
        ["bundle.updated"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore
    });

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
      lifecycleWebhookPublisher
    };

    const groupJob = {
      project_id: projectId,
      event_id: eventId,
      event_type: "request_event" as const,
      event_class: "context_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_non_regression_overlap_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T00:01:00.000Z",
      severity: "high" as const,
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-11T00:00:30.000Z"
      }
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const firstQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(firstQueuedBuildJobs).toHaveLength(1);
    const firstBuildJob = JSON.parse(firstQueuedBuildJobs[0] ?? "{}") as { trigger: string };
    expect(firstBuildJob.trigger).toBe("deploy_metadata");

    const firstDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(firstDeliveryCount.rows[0]?.count).toBe("1");

    const firstDeliveryRows = await pool.query<{ event_type: string; incident_id: string }>(
      `
        SELECT event_type, incident_id::text AS incident_id
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(firstDeliveryRows.rows).toEqual([
      {
        event_type: "bundle.updated",
        incident_id: incidentId
      }
    ]);

    const firstScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(firstScheduled).toBe(1);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const secondQueuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(secondQueuedBuildJobs).toHaveLength(1);
    expect(secondQueuedBuildJobs[0]).toBe(firstQueuedBuildJobs[0]);

    const secondDeliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(secondDeliveryCount.rows[0]?.count).toBe("1");

    const secondScheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(secondScheduled).toBe(0);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(1);
  });

  it("should not create spike lifecycle intents or deliver-webhook jobs for duplicate replay on already-spiking incidents", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Spike Replay Integration Org",
      organizationSlug: `spike-replay-org-${organizationId.slice(0, 8)}`,
      projectName: "Spike Replay Integration Project",
      projectSlug: "spike-replay-project"
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
          spike_detected_at,
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
          $10::timestamptz,
          $11::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_spike_replay",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        "2026-03-11T00:00:30.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, eventId, "backend_exception", "2026-03-11T00:01:00.000Z", true]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/spike-replay",
        "secret_789",
        ["incident.spike_detected"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore
    });

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 5,
            occurrences_5m: 50,
            occurrences_1h: 60,
            occurrences_24h: 300,
            baseline_1h_per_5m: 5,
            spike_ratio_5m_to_1h: 10,
            has_sufficient_baseline: true,
            is_spiking: true
          })
      },
      lifecycleWebhookPublisher
    };

    const groupJob = {
      project_id: projectId,
      event_id: eventId,
      event_type: "backend_exception" as const,
      event_class: "incident_signal" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_spike_replay",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T00:01:00.000Z",
      severity: "high" as const
    };

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const deliveryCount = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM webhook_deliveries
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(deliveryCount.rows[0]?.count).toBe("0");

    const scheduled = await scheduleDueWebhookDeliveries({
      queue,
      webhookDeliveryStore,
      batchSize: 25
    });
    expect(scheduled).toBe(0);
    expect((await queue.readJobQueue("deliver-webhook")).length).toBe(0);
  });

  it("should correlate deployment metadata for regressions within 24 hours and surface fields in lifecycle delivery payload", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const deploymentId = randomUUID();
    const deploymentEventId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM deployments");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Regression Deploy Integration Org",
      organizationSlug: `reg-deploy-org-${organizationId.slice(0, 8)}`,
      projectName: "Regression Deploy Integration Project",
      projectSlug: "reg-deploy-project"
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
        "fp_regression_after_deploy",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-11T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO deployments (
          id,
          project_id,
          service_id,
          environment,
          source_event_id,
          commit_sha,
          version,
          branch,
          deployed_at,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::uuid,
          $6,
          $7,
          $8,
          $9::timestamptz,
          '{}'::jsonb
        )
      `,
      [
        deploymentId,
        projectId,
        serviceId,
        "production",
        deploymentEventId,
        "abc123def456",
        "v2.4.0",
        "main",
        "2026-03-10T23:30:00.000Z"
      ]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/regression-after-deploy",
        "secret_regression",
        ["bundle.reopened"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("deliver-webhook");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore
    });

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 10,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher
    };

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: eventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_regression_after_deploy",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-11T01:30:00.000Z",
      severity: "high"
    });

    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const payloadRow = await pool.query<{
      regression_after_deploy: string | null;
      deploy_version: string | null;
      deploy_commit_sha: string | null;
      deploy_branch: string | null;
      deploy_deployed_at: string | null;
      minutes_since_deploy: string | null;
    }>(
      `
        SELECT
          payload->>'regression_after_deploy' AS regression_after_deploy,
          payload->>'deploy_version' AS deploy_version,
          payload->>'deploy_commit_sha' AS deploy_commit_sha,
          payload->>'deploy_branch' AS deploy_branch,
          payload->>'deploy_deployed_at' AS deploy_deployed_at,
          payload->>'minutes_since_deploy' AS minutes_since_deploy
        FROM webhook_deliveries
        WHERE project_id = $1
        LIMIT 1
      `,
      [projectId]
    );

    const payload = payloadRow.rows[0];
    expect(payload?.regression_after_deploy).toBe("true");
    expect(payload?.deploy_version).toBe("v2.4.0");
    expect(payload?.deploy_commit_sha).toBe("abc123def456");
    expect(payload?.deploy_branch).toBe("main");
    expect(payload?.minutes_since_deploy).toBe("120");
    expect(payload?.deploy_deployed_at ? Date.parse(payload.deploy_deployed_at) : NaN).toBe(
      Date.parse("2026-03-10T23:30:00.000Z")
    );

    const incidentRow = await pool.query<{ latest_deployment_id: string | null }>(
      `
        SELECT latest_deployment_id::text AS latest_deployment_id
        FROM incidents
        WHERE id = $1
      `,
      [incidentId]
    );

    expect(incidentRow.rows[0]?.latest_deployment_id).toBe(deploymentId);
  });

  it("should surface explicit nullable deploy-correlation keys when reopened regression is outside deploy window", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const deploymentId = randomUUID();
    const deploymentEventId = randomUUID();
    const webhookId = randomUUID();
    const eventId = randomUUID();

    await pool.query("DELETE FROM webhook_deliveries");
    await pool.query("DELETE FROM agent_webhooks");
    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM deployments");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM organizations");

    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Regression No-Correlation Org",
      organizationSlug: `reg-nocorr-org-${organizationId.slice(0, 8)}`,
      projectName: "Regression No-Correlation Project",
      projectSlug: "reg-nocorr-project"
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
        "fp_regression_no_deploy_window",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO deployments (
          id,
          project_id,
          service_id,
          environment,
          source_event_id,
          commit_sha,
          version,
          branch,
          deployed_at,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::uuid,
          $6,
          $7,
          $8,
          $9::timestamptz,
          '{}'::jsonb
        )
      `,
      [
        deploymentId,
        projectId,
        serviceId,
        "production",
        deploymentEventId,
        "oldcommit123",
        "v1.0.0",
        "main",
        "2026-03-09T00:00:00.000Z"
      ]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (id, project_id, created_by_user_id, url, secret_hash, events, filters, is_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, true)
      `,
      [
        webhookId,
        projectId,
        ownerUserId,
        "https://hooks.example.test/regression-no-correlation",
        "secret_regression",
        ["bundle.reopened"],
        JSON.stringify({})
      ]
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: createPostgresWebhookDeliveryStore(queryable)
    });

    const groupDependencies = {
      queue,
      incidentStore: createPostgresMetadataStore(queryable),
      frequencyCounter: {
        recordOccurrence: () =>
          Promise.resolve({
            occurrences_1m: 1,
            occurrences_5m: 1,
            occurrences_1h: 1,
            occurrences_24h: 10,
            baseline_1h_per_5m: 1,
            spike_ratio_5m_to_1h: 1,
            has_sufficient_baseline: false,
            is_spiking: false
          })
      },
      lifecycleWebhookPublisher
    };

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: eventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_regression_no_deploy_window",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T12:00:00.000Z",
      severity: "high"
    });

    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const payloadRow = await pool.query<{
      regression_after_deploy: string | null;
      deploy_version: string | null;
      deploy_commit_sha: string | null;
      deploy_branch: string | null;
      deploy_deployed_at: string | null;
      minutes_since_deploy: string | null;
    }>(
      `
        SELECT
          payload->>'regression_after_deploy' AS regression_after_deploy,
          payload->>'deploy_version' AS deploy_version,
          payload->>'deploy_commit_sha' AS deploy_commit_sha,
          payload->>'deploy_branch' AS deploy_branch,
          payload->>'deploy_deployed_at' AS deploy_deployed_at,
          payload->>'minutes_since_deploy' AS minutes_since_deploy
        FROM webhook_deliveries
        WHERE project_id = $1
        LIMIT 1
      `,
      [projectId]
    );

    expect(payloadRow.rows[0]).toEqual({
      regression_after_deploy: "false",
      deploy_version: null,
      deploy_commit_sha: null,
      deploy_branch: null,
      deploy_deployed_at: null,
      minutes_since_deploy: null
    });
  });
});
