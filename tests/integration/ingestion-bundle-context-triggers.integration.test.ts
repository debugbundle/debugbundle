import { createHash, randomUUID } from "node:crypto";

import { expect, it, beforeAll, afterAll } from "vitest";

import { createApiDependencies } from "../../apps/api/src/default-dependencies.ts";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  processNextBuildBundleJob,
  processNextGroupIncidentJob
} from "../../apps/worker/src/processor.js";
import {
  createPostgresMetadataStore,
  createS3ObjectStoreClient,
  createRedisQueueClient,
  type BuildBundleJob
} from "../../packages/storage/src/index.js";

import {
  runIntegration,
  createIntegrationPool,
  createS3AdminClient,
  s3Endpoint,
  s3Region,
  s3Bucket,
  redisUrl,
  bootstrapStorageAndCreateBucket,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("ingestion bundle context triggers", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should transition bundle retrieval from pending to deterministic JSON for new_context_type trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_new_context_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");

    await pool.query("DELETE FROM member_tokens");
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
      organizationName: "Bundle New Context Org",
      organizationSlug: `bundle-new-context-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle New Context Project",
      projectSlug: "bundle-new-context-project",
      ownerUserId: memberId
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
        "fp_bundle_new_context",
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

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-new-context-member-token"]
    );

    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
        pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "frontend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_new_context",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high"
    });

    expect(
      await processNextGroupIncidentJob({
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
      })
    ).toEqual({ processed: true });

    const pendingResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json()).toEqual({ status: "pending" });

    const queuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(queuedBuildJobs).toHaveLength(2);
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as {
      trigger: string;
      occurrence_count: number;
    };
    const regenerationJob = JSON.parse(queuedBuildJobs[1] ?? "{}") as { trigger: string };
    expect(buildJob.trigger).toBe("new_context_type");
    expect(buildJob.occurrence_count).toBe(2);
    expect(regenerationJob.trigger).toBe("regeneration");

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const firstBundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(firstBundleResponse.statusCode).toBe(200);
    const firstBundle: {
      bundle_version: number;
      signal: { occurrence_count: number; source_event_types: string[] };
    } = firstBundleResponse.json();
    expect(firstBundle.bundle_version).toBe(1);
    expect(firstBundle.signal.occurrence_count).toBe(2);
    expect(firstBundle.signal.source_event_types).toEqual([
      "backend_exception",
      "frontend_exception"
    ]);

    await queue.clearJobQueue("build-bundle");
    await queue.enqueue("build-bundle", JSON.parse(queuedBuildJobs[0] ?? "{}") as BuildBundleJob);
    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const secondBundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(secondBundleResponse.statusCode).toBe(200);
    expect(secondBundleResponse.json()).toEqual(firstBundle);
  });

  it("should transition bundle retrieval from pending to deterministic JSON for reproduction-confidence-change trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_repro_conf_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");

    await pool.query("DELETE FROM member_tokens");
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
      organizationName: "Bundle Repro Confidence Org",
      organizationSlug: `bundle-repro-conf-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Repro Confidence Project",
      projectSlug: "bundle-repro-conf-project",
      ownerUserId: memberId
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
        "fp_bundle_repro_conf",
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

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-repro-conf-member-token"]
    );

    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
        pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "request_event",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_repro_conf",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high"
    });

    expect(
      await processNextGroupIncidentJob({
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
      })
    ).toEqual({ processed: true });

    const pendingResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json()).toEqual({ status: "pending" });

    const queuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(queuedBuildJobs).toHaveLength(2);
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as {
      trigger: string;
      occurrence_count: number;
    };
    const regenerationJob = JSON.parse(queuedBuildJobs[1] ?? "{}") as { trigger: string };
    expect(buildJob.trigger).toBe("reproduction_confidence_change");
    expect(buildJob.occurrence_count).toBe(2);
    expect(regenerationJob.trigger).toBe("regeneration");

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const firstBundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(firstBundleResponse.statusCode).toBe(200);
    const firstBundle: {
      bundle_version: number;
      signal: { occurrence_count: number; source_event_types: string[] };
    } = firstBundleResponse.json();
    expect(firstBundle.bundle_version).toBe(1);
    expect(firstBundle.signal.occurrence_count).toBe(2);
    expect(firstBundle.signal.source_event_types).toEqual(["backend_exception", "request_event"]);

    await queue.clearJobQueue("build-bundle");
    await queue.enqueue("build-bundle", JSON.parse(queuedBuildJobs[0] ?? "{}") as BuildBundleJob);
    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const secondBundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(secondBundleResponse.statusCode).toBe(200);
    expect(secondBundleResponse.json()).toEqual(firstBundle);
  });
});
