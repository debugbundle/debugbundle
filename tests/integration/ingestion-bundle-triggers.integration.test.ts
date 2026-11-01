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

runIntegration("ingestion bundle triggers", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should transition bundle retrieval from pending to deterministic JSON for occurrence-threshold trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_threshold_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");
    const eventId = randomUUID();

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
      organizationName: "Bundle Threshold Org",
      organizationSlug: `bundle-threshold-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Threshold Project",
      projectSlug: "bundle-threshold-project",
      ownerUserId: memberId
    });

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-threshold-member-token"]
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
      event_id: eventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_threshold",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:00:00.000Z",
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

    const incidentRows = await pool.query<{ incident_id: string }>(
      `
        SELECT id::text AS incident_id
        FROM incidents
        WHERE project_id = $1 AND fingerprint = $2
        LIMIT 1
      `,
      [projectId, "fp_bundle_threshold"]
    );
    const incidentId = incidentRows.rows[0]?.incident_id;
    expect(incidentId).toBeDefined();

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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string };
    const regenerationJob = JSON.parse(queuedBuildJobs[1] ?? "{}") as { trigger: string };
    expect(buildJob.trigger).toBe("occurrence_threshold");
    expect(regenerationJob.trigger).toBe("regeneration");

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const bundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(bundleResponse.statusCode).toBe(200);
    const firstBundle: {
      bundle_version: number;
      captured_at: string;
      signal: { occurrence_count: number };
      metadata: { created_at: string; updated_at: string };
      summary: { signals: { new_deploy: boolean; regression_suspected: boolean } };
      context: {
        request: null;
        response: null;
        logs: null;
        frontend: null;
        environment: null;
        deploy: null;
        runtime: null;
        git: null;
        dependencies: null;
        device: null;
      };
    } = bundleResponse.json();
    expect(firstBundle.bundle_version).toBe(1);
    expect(firstBundle.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(firstBundle.signal.occurrence_count).toBe(1);
    expect(firstBundle.metadata.created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(firstBundle.metadata.updated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(firstBundle.summary.signals.new_deploy).toBe(false);
    expect(firstBundle.summary.signals.regression_suspected).toBe(false);
    expect(firstBundle.context.request).toBeNull();
    expect(firstBundle.context.response).toBeNull();
    expect(firstBundle.context.logs).toBeNull();
    expect(firstBundle.context.frontend).toBeNull();
    expect(firstBundle.context.environment).toBeNull();
    expect(firstBundle.context.deploy).toBeNull();
    expect(firstBundle.context.runtime).toBeNull();
    expect(firstBundle.context.git).toBeNull();
    expect(firstBundle.context.dependencies).toBeNull();
    expect(firstBundle.context.device).toBeNull();

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

  it("should transition bundle retrieval from pending to deterministic JSON for regression-reopen trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_regression_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");
    const eventId = randomUUID();

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
      organizationName: "Bundle Regression Org",
      organizationSlug: `bundle-regression-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Regression Project",
      projectSlug: "bundle-regression-project",
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
        "fp_bundle_regression",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-regression-member-token"]
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
      event_id: eventId,
      event_type: "backend_exception",
      event_class: "incident_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_regression",
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
    expect(buildJob.trigger).toBe("regression_reopen");
    expect(buildJob.occurrence_count).toBe(2);
    expect(regenerationJob.trigger).toBe("regeneration");

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const bundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(bundleResponse.statusCode).toBe(200);
    const bundle: {
      bundle_version: number;
      captured_at: string;
      signal: { occurrence_count: number; first_seen_at: string; last_seen_at: string };
      metadata: { created_at: string; updated_at: string };
      summary: { signals: { regression_suspected: boolean } };
    } = bundleResponse.json();
    expect(bundle.bundle_version).toBe(1);
    expect(bundle.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bundle.signal.occurrence_count).toBe(2);
    expect(bundle.signal.first_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bundle.signal.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bundle.metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bundle.metadata.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bundle.summary.signals.regression_suspected).toBe(true);
  });

  it("should transition bundle retrieval from pending to deterministic JSON for deploy-metadata trigger", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_deploy_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();

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
      organizationName: "Bundle Deploy Org",
      organizationSlug: `bundle-deploy-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Deploy Project",
      projectSlug: "bundle-deploy-project",
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
        "fp_bundle_deploy",
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
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-deploy-member-token"]
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
      event_type: "deploy_metadata",
      event_class: "context_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_bundle_deploy",
      normalized_message: "TypeError at checkout",
      matched_fields: ["normalized_message"],
      occurred_at: "2026-03-12T00:10:00.000Z",
      severity: "high",
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-12T00:05:00.000Z"
      }
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
    expect(buildJob.trigger).toBe("deploy_metadata");
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
      summary: { signals: { new_deploy: boolean; regression_suspected: boolean } };
    } = firstBundleResponse.json();
    expect(firstBundle.bundle_version).toBe(1);
    expect(firstBundle.signal.occurrence_count).toBe(2);
    expect(firstBundle.signal.source_event_types).toEqual(["backend_exception", "deploy_metadata"]);
    expect(firstBundle.summary.signals.new_deploy).toBe(true);
    expect(firstBundle.summary.signals.regression_suspected).toBe(false);

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
