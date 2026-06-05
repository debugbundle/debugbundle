import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { expect, it, beforeAll, afterAll } from "vitest";

import { createApiDependencies } from "../../apps/api/src/default-dependencies.ts";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  processNextBuildBundleJob,
  processNextBuildReproductionJob,
  processNextGroupIncidentJob
} from "../../apps/worker/src/processor.js";
import {
  createPostgresMetadataStore,
  createS3ObjectStoreClient,
  createRedisQueueClient,
  buildRawEventObjectKey,
  buildBundleObjectKey,
  buildReproductionObjectKey,
  type BuildBundleJob,
  type BuildReproductionJob
} from "../../packages/storage/src/index.js";
import { createEventEnvelope } from "../../packages/shared-types/src/index.js";

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

runIntegration("ingestion integration \u2013 bundle triggers", () => {
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
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
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
    expect(firstBundle.metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(firstBundle.metadata.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
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
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
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
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
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
    expect(firstBundle.signal.source_event_types).toEqual(["backend_exception", "frontend_exception"]);

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
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
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
      event_class: "context_signal",
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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
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

  it("should retrieve rich bundle context blocks and stable generation metadata through the API", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_bundle_rich_token";
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
      organizationName: "Bundle Rich Org",
      organizationSlug: `bundle-rich-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Rich Project",
      projectSlug: "bundle-rich-project",
      ownerUserId: memberId
    });

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-rich-member-token"]
    );

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, runtime, framework, environment)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [serviceId, projectId, "checkout-api", "node", "fastify", "production"]
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
          matched_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9::timestamptz, $10::timestamptz, $11, $12::text[])
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_rich",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-12T00:00:05.000Z",
        "2026-03-12T00:00:40.000Z",
        3,
        ["normalized_message"]
      ]
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
    await queue.clearJobQueue("build-bundle");
    await queue.clearJobQueue("build-reproduction");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    const envelopes = [
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000301",
        event_type: "backend_exception",
        occurred_at: "2026-03-12T00:00:10.000Z",
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: "req_789",
          trace_id: "trace_789",
          session_id: null,
          user_id_hash: null
        },
        payload: {
          name: "TypeError",
          message: "boom",
          stack: "TypeError: boom\n    at processOrder (src/checkout.ts:42:11)",
          handled: false,
          request: {
            method: "POST",
            path: "/checkout",
            query: { coupon: "SAVE10" },
            headers: { "content-type": "application/json" },
            body: { amount: 42 }
          },
          response: {
            status_code: 500
          },
          runtime: {
            version: "22.0.0"
          }
        }
      }),
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000302",
        event_type: "request_event",
        occurred_at: "2026-03-12T00:00:12.000Z",
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: "req_789",
          trace_id: "trace_789",
          session_id: null,
          user_id_hash: null
        },
        payload: {
          method: "POST",
          path: "/checkout",
          query: { coupon: "SAVE10" },
          headers: { "content-type": "application/json" },
          body: { amount: 42 },
          response_status: 500,
          duration_ms: 120,
          route_template: "/checkout"
        }
      }),
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000303",
        event_type: "log_event",
        occurred_at: "2026-03-12T00:00:14.000Z",
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        payload: {
          level: "error",
          message: "payment failed",
          attributes: { orderId: "ord_789" }
        }
      }),
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000304",
        event_type: "frontend_breadcrumb",
        occurred_at: "2026-03-12T00:00:16.000Z",
        service: {
          name: "checkout-api",
          runtime: "browser-js",
          framework: "react",
          environment: "production"
        },
        payload: {
          breadcrumb_type: "route_change",
          route: "/checkout",
          data: { from: "/cart", to: "/checkout" }
        }
      }),
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000305",
        event_type: "frontend_exception",
        occurred_at: "2026-03-12T00:00:18.000Z",
        service: {
          name: "checkout-api",
          runtime: "browser-js",
          framework: "react",
          environment: "production"
        },
        payload: {
          name: "TypeError",
          message: "Cannot read properties of null",
          stack: "TypeError: Cannot read properties of null\n    at CheckoutPage (src/Checkout.tsx:12:3)",
          route: "/checkout",
          browser: { name: "Chrome", version: "122.0.0" },
          device: {
            user_agent: "Mozilla/5.0",
            os: { name: "macOS", version: "14.4" },
            device_type: "desktop",
            screen: { width: 1728, height: 1117 },
            viewport: { width: 1440, height: 900 },
            device_pixel_ratio: 2,
            touch_capable: false,
            language: "en-US",
            connection_type: "4g",
            color_scheme_preference: "light"
          },
          dom_context: {
            mode: "lightweight",
            html_excerpt: "<button>Pay</button>"
          }
        }
      }),
      createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000306",
        event_type: "deploy_metadata",
        occurred_at: "2026-03-12T00:00:20.000Z",
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        payload: {
          commit_sha: "abcdef1234567890",
          version: "v2.4.0",
          branch: "main",
          environment: "production",
          deployed_at: "2026-03-12T00:00:00.000Z"
        }
      })
    ];

    for (const envelope of envelopes) {
      await objectStore.putObject({
        key: buildRawEventObjectKey({
          projectId,
          eventId: envelope.event_id,
          occurredAt: new Date(envelope.occurred_at)
        }),
        body: gzipSync(Buffer.from(JSON.stringify(envelope), "utf8")),
        contentType: "application/json",
        contentEncoding: "gzip"
      });

      await pool.query(
        `
          INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled, level)
          VALUES ($1, $2::uuid, $3, $4::timestamptz, $5, $6)
        `,
        [
          incidentId,
          envelope.event_id,
          envelope.event_type,
          envelope.occurred_at,
          true,
          envelope.event_type === "log_event" ? envelope.payload.level : null
        ]
      );
    }

    const buildJob: BuildBundleJob = {
      project_id: projectId,
      incident_id: incidentId,
      event_id: "00000000-0000-4000-8000-000000000301",
      occurred_at: "2026-03-12T00:00:10.000Z",
      occurrence_count: 3,
      trigger: "deploy_metadata"
    };

    await queue.enqueue("build-bundle", buildJob);
    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const firstResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    const firstBundle: {
      metadata: { generation_number: number };
      captured_at: string;
      context: {
        request: { method: string; route_template: string | null; request_id: string | null };
        response: { status_code: number; duration_ms: number | null };
        logs: { items: Array<{ level: string; message: string; timestamp: string; attributes: Record<string, unknown> }> };
        frontend: {
          route_changes: Array<{ from: string; to: string; ts: string }>;
          exceptions: Array<{ route?: string }>;
          dom_context: { html_excerpt: string } | null;
        };
        deploy: { commit_sha: string | null; deploy_version: string | null };
        runtime: { name: string; runtime_version: string | null };
        git: { commit: string | null; commit_short: string | null };
        device: { browser: { name: string | null }; language: string | null };
      };
    } = firstResponse.json();

    expect(firstBundle.metadata.generation_number).toBe(1);
    expect(firstBundle.captured_at).toBe("2026-03-12T00:00:10.000Z");
    expect(firstBundle.context.request).toMatchObject({
      method: "POST",
      route_template: "/checkout",
      request_id: "req_789"
    });
    expect(firstBundle.context.response).toMatchObject({
      status_code: 500,
      duration_ms: 120
    });
    expect(firstBundle.context.logs.items).toEqual([
      {
        level: "error",
        message: "payment failed",
        timestamp: "2026-03-12T00:00:14.000Z",
        attributes: { orderId: "ord_789" }
      }
    ]);
    expect(firstBundle.context.frontend.route_changes).toEqual([
      { from: "/cart", to: "/checkout", ts: "2026-03-12T00:00:16.000Z" }
    ]);
    expect(firstBundle.context.frontend.exceptions).toHaveLength(1);
    expect(firstBundle.context.frontend.exceptions[0]?.route).toBe("/checkout");
    expect(firstBundle.context.frontend.dom_context?.html_excerpt).toBe("<button>Pay</button>");
    expect(firstBundle.context.deploy).toMatchObject({
      commit_sha: "abcdef1234567890",
      deploy_version: "v2.4.0"
    });
    expect(firstBundle.context.runtime).toMatchObject({
      name: "node",
      runtime_version: "22.0.0"
    });
    expect(firstBundle.context.git).toMatchObject({
      commit: "abcdef1234567890",
      commit_short: "abcdef1"
    });
    expect(firstBundle.context.device).toMatchObject({
      browser: { name: "Chrome" },
      language: "en-US"
    });

    await queue.enqueue("build-bundle", buildJob);
    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const replayResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });

    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json()).toEqual(firstBundle);

    await queue.enqueue("build-bundle", {
      ...buildJob,
      event_id: "00000000-0000-4000-8000-000000000306",
      occurred_at: "2026-03-12T00:00:20.000Z"
    });
    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const regeneratedResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });

    expect(regeneratedResponse.statusCode).toBe(200);
    const regeneratedBundle: { metadata: { generation_number: number } } = regeneratedResponse.json();
    expect(regeneratedBundle.metadata.generation_number).toBe(2);

    const storedBundle = await objectStore.getObject({ key: buildBundleObjectKey(projectId, incidentId) });
    expect(storedBundle.byteLength).toBeGreaterThan(0);
  });

  it("should include deterministic probe_data items from trace-matched and trace-less probe events", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_probe_merge_token";
    const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");

    const incidentEventId = randomUUID();
    const probeTraceMatchEventId = randomUUID();
    const probeTraceMissEventId = randomUUID();
    const probeNoTraceEventId = randomUUID();

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
      organizationName: "Bundle Probe Merge Org",
      organizationSlug: `bundle-probe-merge-org-${organizationId.slice(0, 8)}`,
      projectName: "Bundle Probe Merge Project",
      projectSlug: "bundle-probe-merge-project",
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
          $9,
          $10::timestamptz,
          $11::timestamptz,
          4,
          $12::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_bundle_probe_merge",
        "v1",
        "TypeError at checkout",
        "high",
        "open",
        "2026-03-12T00:00:00.000Z",
        "2026-03-12T00:01:00.000Z",
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES
          ($1, $2, $3, $4::timestamptz, $5),
          ($1, $6, $7, $8::timestamptz, $9),
          ($1, $10, $11, $12::timestamptz, $13),
          ($1, $14, $15, $16::timestamptz, $17)
      `,
      [
        incidentId,
        incidentEventId,
        "backend_exception",
        "2026-03-12T00:00:10.000Z",
        true,
        probeTraceMatchEventId,
        "probe_event",
        "2026-03-12T00:00:20.000Z",
        true,
        probeTraceMissEventId,
        "probe_event",
        "2026-03-12T00:00:25.000Z",
        true,
        probeNoTraceEventId,
        "probe_event",
        "2026-03-12T00:00:30.000Z",
        true
      ]
    );

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "bundle-probe-merge-member-token"]
    );

    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    async function putRawEvent(envelope: ReturnType<typeof createEventEnvelope>): Promise<void> {
      const key = buildRawEventObjectKey({
        projectId,
        occurredAt: new Date(envelope.occurred_at),
        eventId: envelope.event_id
      });

      await objectStore.putObject({
        key,
        body: gzipSync(Buffer.from(JSON.stringify(envelope), "utf8")),
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    }

    await putRawEvent(
      createEventEnvelope({
        event_id: incidentEventId,
        event_type: "backend_exception",
        occurred_at: "2026-03-12T00:00:10.000Z",
        project_id: projectId,
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: null,
          trace_id: "trace-match",
          session_id: null,
          user_id_hash: null
        },
        payload: {
          name: "TypeError",
          message: "boom",
          stack: "TypeError: boom\\n at src/checkout.ts:10:2",
          handled: false,
          request: {
            method: "GET",
            path: "/checkout",
            query: {},
            headers: {},
            body: null
          },
          response: {
            status_code: 500
          },
          runtime: {
            version: "22.0.0"
          },
          probe_data: {
            version: 1,
            items: [
              {
                label: "checkout.tax",
                data: {
                  step: "tax",
                  value: 12
                },
                timestamp: "2026-03-12T00:00:20.000Z",
                activation_id: null
              },
              {
                label: "checkout.inline_only",
                data: {
                  from: "inline"
                },
                timestamp: "2026-03-12T00:00:15.000Z",
                activation_id: null
              }
            ]
          }
        }
      })
    );

    await putRawEvent(
      createEventEnvelope({
        event_id: probeTraceMatchEventId,
        event_type: "probe_event",
        occurred_at: "2026-03-12T00:00:20.000Z",
        project_id: projectId,
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: null,
          trace_id: "trace-match",
          session_id: null,
          user_id_hash: null
        },
        payload: {
          label: "checkout.tax",
          data: {
            step: "tax",
            value: 12
          },
          activation_id: null,
          probe_label_pattern: "checkout.*"
        }
      })
    );

    await putRawEvent(
      createEventEnvelope({
        event_id: probeTraceMissEventId,
        event_type: "probe_event",
        occurred_at: "2026-03-12T00:00:25.000Z",
        project_id: projectId,
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: null,
          trace_id: "trace-other",
          session_id: null,
          user_id_hash: null
        },
        payload: {
          label: "checkout.miss",
          data: {
            ignored: true
          },
          activation_id: "00000000-0000-4000-8000-000000000012",
          probe_label_pattern: "checkout.*"
        }
      })
    );

    await putRawEvent(
      createEventEnvelope({
        event_id: probeNoTraceEventId,
        event_type: "probe_event",
        occurred_at: "2026-03-12T00:00:30.000Z",
        project_id: projectId,
        service: {
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        },
        correlation: {
          request_id: null,
          trace_id: null,
          session_id: null,
          user_id_hash: null
        },
        payload: {
          label: "checkout.no_trace",
          data: {
            fallback: true
          },
          activation_id: "00000000-0000-4000-8000-000000000013",
          probe_label_pattern: "checkout.*"
        }
      })
    );

    const queue = createRedisQueueClient({ redisUrl });
    await queue.clearJobQueue("group-incident");
    await queue.clearJobQueue("build-bundle");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    await queue.enqueue("build-bundle", {
      project_id: projectId,
      incident_id: incidentId,
      event_id: probeNoTraceEventId,
      occurred_at: "2026-03-12T00:00:30.000Z",
      occurrence_count: 4,
      trigger: "new_context_type"
    });

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
      context: {
        probe_data: {
          version: number;
          items: Array<{ label: string; timestamp: string; activation_id: string | null; data: Record<string, unknown> }>;
        };
      };
    } = bundleResponse.json();

    expect(bundle.context.probe_data).toEqual({
      version: 1,
      items: [
        {
          label: "checkout.inline_only",
          data: {
            from: "inline"
          },
          timestamp: "2026-03-12T00:00:15.000Z",
          activation_id: null
        },
        {
          label: "checkout.tax",
          data: {
            step: "tax",
            value: 12
          },
          timestamp: "2026-03-12T00:00:20.000Z",
          activation_id: null
        },
        {
          label: "checkout.no_trace",
          data: {
            fallback: true
          },
          timestamp: "2026-03-12T00:00:30.000Z",
          activation_id: "00000000-0000-4000-8000-000000000013"
        }
      ]
    });

    await queue.enqueue("build-bundle", {
      project_id: projectId,
      incident_id: incidentId,
      event_id: probeNoTraceEventId,
      occurred_at: "2026-03-12T00:00:30.000Z",
      occurrence_count: 4,
      trigger: "new_context_type"
    });

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const replayBundleResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/bundle`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(replayBundleResponse.statusCode).toBe(200);
    expect(replayBundleResponse.json()).toEqual(bundle);
  });

  it("should deterministically apply build-bundle trigger precedence when regeneration conditions overlap", async (): Promise<void> => {
    const queue = createRedisQueueClient({ redisUrl });

    const scenarios = [
      {
        name: "regression dominates all co-occurring triggers",
        incidentStatus: "resolved",
        incomingEventType: "request_event" as const,
        incomingEventClass: "context_signal" as const,
        includeDeployMetadata: true,
        expectedTrigger: "regression_reopen"
      },
      {
        name: "deploy dominates reproduction/new-context/threshold",
        incidentStatus: "open",
        incomingEventType: "request_event" as const,
        incomingEventClass: "context_signal" as const,
        includeDeployMetadata: true,
        expectedTrigger: "deploy_metadata"
      },
      {
        name: "reproduction-confidence dominates new-context/threshold",
        incidentStatus: "open",
        incomingEventType: "request_event" as const,
        incomingEventClass: "context_signal" as const,
        includeDeployMetadata: false,
        expectedTrigger: "reproduction_confidence_change"
      },
      {
        name: "new-context dominates threshold",
        incidentStatus: "open",
        incomingEventType: "frontend_exception" as const,
        incomingEventClass: "incident_signal" as const,
        includeDeployMetadata: false,
        expectedTrigger: "new_context_type"
      }
    ];

    for (const scenario of scenarios) {
      const projectId = randomUUID();
      const organizationId = randomUUID();
      const serviceId = randomUUID();
      const incidentId = randomUUID();
      const existingEventId = randomUUID();
      const incomingEventId = randomUUID();
      const fingerprint = `fp_bundle_precedence_${incomingEventId.slice(0, 8)}`;

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
        organizationName: "Bundle Precedence Org",
        organizationSlug: `bundle-precedence-org-${organizationId.slice(0, 8)}`,
        projectName: "Bundle Precedence Project",
        projectSlug: `bundle-precedence-project-${projectId.slice(0, 8)}`
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
            $9,
            $10::timestamptz,
            $10::timestamptz,
            2,
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
          fingerprint,
          "v1",
          "TypeError at checkout",
          "high",
          scenario.incidentStatus,
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

      await queue.clearJobQueue("group-incident");
      await queue.clearJobQueue("build-bundle");

      const queryable = {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      };

      await queue.enqueue("group-incident", {
        project_id: projectId,
        event_id: incomingEventId,
        event_type: scenario.incomingEventType,
        event_class: scenario.incomingEventClass,
        service_name: "checkout-api",
        environment: "production",
        fingerprint,
        normalized_message: "TypeError at checkout",
        matched_fields: ["normalized_message"],
        occurred_at: "2026-03-12T00:10:00.000Z",
        severity: "high",
        ...(scenario.includeDeployMetadata
          ? {
              deploy_metadata: {
                commit_sha: "abc123",
                version: "v2.4.0",
                branch: "main",
                deployed_at: "2026-03-12T00:05:00.000Z"
              }
            }
          : {})
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

      const queuedBuildJobs = await queue.readJobQueue("build-bundle");
      expect(queuedBuildJobs, scenario.name).toHaveLength(1);
      const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
      expect(buildJob.trigger, scenario.name).toBe(scenario.expectedTrigger);
      expect(buildJob.occurrence_count, scenario.name).toBe(3);

      await queue.enqueue("group-incident", {
        project_id: projectId,
        event_id: incomingEventId,
        event_type: scenario.incomingEventType,
        event_class: scenario.incomingEventClass,
        service_name: "checkout-api",
        environment: "production",
        fingerprint,
        normalized_message: "TypeError at checkout",
        matched_fields: ["normalized_message"],
        occurred_at: "2026-03-12T00:10:00.000Z",
        severity: "high",
        ...(scenario.includeDeployMetadata
          ? {
              deploy_metadata: {
                commit_sha: "abc123",
                version: "v2.4.0",
                branch: "main",
                deployed_at: "2026-03-12T00:05:00.000Z"
              }
            }
          : {})
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

      const replayQueuedBuildJobs = await queue.readJobQueue("build-bundle");
      expect(replayQueuedBuildJobs, scenario.name).toHaveLength(1);
      expect(replayQueuedBuildJobs[0], scenario.name).toBe(queuedBuildJobs[0]);
    }
  });

  it("should transition reproduction retrieval from pending to deterministic artifact availability with replay-stable bytes", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_reproduction_pending_token";
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
      organizationName: "Reproduction Org",
      organizationSlug: `reproduction-org-${organizationId.slice(0, 8)}`,
      projectName: "Reproduction Project",
      projectSlug: "reproduction-project",
      ownerUserId: memberId
    });

    await pool.query(
      `
        INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), memberId, organizationId, memberTokenHash, "reproduction-member-token"]
    );

    await pool.query(
      `
        INSERT INTO services (id, project_id, name, runtime, framework, environment)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [serviceId, projectId, "checkout-api", "node", "fastify", "production"]
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
          matched_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9::timestamptz, $10::timestamptz, $11, $12::text[])
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_reproduction_pending",
        "v1",
        "Checkout request failed",
        "high",
        "2026-03-12T00:00:05.000Z",
        "2026-03-12T00:00:15.000Z",
        1,
        ["normalized_message"]
      ]
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
    await queue.clearJobQueue("build-bundle");
    await queue.clearJobQueue("build-reproduction");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    const requestEnvelope = createEventEnvelope({
      event_id: "00000000-0000-4000-8000-000000000401",
      event_type: "request_event",
      occurred_at: "2026-03-12T00:00:10.000Z",
      service: {
        name: "checkout-api",
        runtime: "node",
        framework: "fastify",
        environment: "production"
      },
      correlation: {
        request_id: "req_repro_1",
        trace_id: "trace_repro_1",
        session_id: null,
        user_id_hash: null
      },
      payload: {
        method: "POST",
        path: "/checkout",
        query: { coupon: "SAVE10" },
        headers: { "content-type": "application/json" },
        body: { amount: 42 },
        response_status: 500,
        duration_ms: 120,
        route_template: "/checkout"
      }
    });

    await objectStore.putObject({
      key: buildRawEventObjectKey({
        projectId,
        eventId: requestEnvelope.event_id,
        occurredAt: new Date(requestEnvelope.occurred_at)
      }),
      body: gzipSync(Buffer.from(JSON.stringify(requestEnvelope), "utf8")),
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    await pool.query(
      `
        INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [incidentId, requestEnvelope.event_id, requestEnvelope.event_type, requestEnvelope.occurred_at, true]
    );

    await queue.enqueue("build-bundle", {
      project_id: projectId,
      incident_id: incidentId,
      event_id: requestEnvelope.event_id,
      occurred_at: requestEnvelope.occurred_at,
      occurrence_count: 1,
      trigger: "occurrence_threshold"
    });

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const pendingResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/reproduction`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json()).toEqual({ status: "pending" });

    const queuedReproductionJobs = await queue.readJobQueue("build-reproduction");
    expect(queuedReproductionJobs).toHaveLength(1);

    expect(
      await processNextBuildReproductionJob({
        queue,
        objectStore
      })
    ).toEqual({ processed: true });

    const reproductionResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/reproduction`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(reproductionResponse.statusCode).toBe(200);
    expect(reproductionResponse.json()).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    const firstStoredReproduction = await objectStore.getObject({
      key: buildReproductionObjectKey(projectId, incidentId)
    });
    expect(JSON.parse(gunzipSync(firstStoredReproduction).toString("utf8"))).toEqual(reproductionResponse.json());

    const replayBuildReproductionJob = JSON.parse(queuedReproductionJobs[0] ?? "{}") as BuildReproductionJob;
    await queue.enqueue("build-reproduction", replayBuildReproductionJob);
    expect(
      await processNextBuildReproductionJob({
        queue,
        objectStore
      })
    ).toEqual({ processed: true });

    const secondStoredReproduction = await objectStore.getObject({
      key: buildReproductionObjectKey(projectId, incidentId)
    });
    expect(firstStoredReproduction.equals(secondStoredReproduction)).toBe(true);
  });

  it("should persist low-confidence reproduction first and deterministically upgrade when request context first appears", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const existingEventId = randomUUID();
    const incomingEventId = randomUUID();
    const memberId = randomUUID();
    const memberToken = "dbundle_mem_reproduction_upgrade_token";
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
      organizationName: "Reproduction Upgrade Org",
      organizationSlug: `reproduction-upgrade-org-${organizationId.slice(0, 8)}`,
      projectName: "Reproduction Upgrade Project",
      projectSlug: "reproduction-upgrade-project",
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
        "fp_reproduction_upgrade",
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
      [randomUUID(), memberId, organizationId, memberTokenHash, "reproduction-upgrade-member-token"]
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
    await queue.clearJobQueue("build-reproduction");

    const queryable = {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
    };

    const app = createApiServer(
      createApiDependencies({
        db: queryable,
        objectStore,
        queue
      })
    );

    await queue.enqueue("build-bundle", {
      project_id: projectId,
      incident_id: incidentId,
      event_id: existingEventId,
      occurred_at: "2026-03-12T00:00:00.000Z",
      occurrence_count: 1,
      trigger: "occurrence_threshold"
    });

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    expect(
      await processNextBuildReproductionJob({
        queue,
        objectStore
      })
    ).toEqual({ processed: true });

    const initialReproductionResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/reproduction`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(initialReproductionResponse.statusCode).toBe(200);
    expect(initialReproductionResponse.json()).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_context_missing",
      artifacts: null,
      feasibility_reference: null
    });

    const initialStoredReproduction = await objectStore.getObject({
      key: buildReproductionObjectKey(projectId, incidentId)
    });

    const requestEnvelope = createEventEnvelope({
      event_id: incomingEventId,
      event_type: "request_event",
      occurred_at: "2026-03-12T00:10:00.000Z",
      service: {
        name: "checkout-api",
        runtime: "node",
        framework: "fastify",
        environment: "production"
      },
      correlation: {
        request_id: "req_repro_upgrade",
        trace_id: "trace_repro_upgrade",
        session_id: null,
        user_id_hash: null
      },
      payload: {
        method: "POST",
        path: "/checkout",
        query: { coupon: "SAVE10" },
        headers: { "content-type": "application/json" },
        body: { amount: 42 },
        response_status: 500,
        duration_ms: 120,
        route_template: "/checkout"
      }
    });

    await objectStore.putObject({
      key: buildRawEventObjectKey({
        projectId,
        eventId: requestEnvelope.event_id,
        occurredAt: new Date(requestEnvelope.occurred_at)
      }),
      body: gzipSync(Buffer.from(JSON.stringify(requestEnvelope), "utf8")),
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    await queue.enqueue("group-incident", {
      project_id: projectId,
      event_id: incomingEventId,
      event_type: "request_event",
      event_class: "context_signal",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_reproduction_upgrade",
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

    const queuedBuildJobs = await queue.readJobQueue("build-bundle");
    expect(queuedBuildJobs).toHaveLength(1);
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as { trigger: string; occurrence_count: number };
    expect(buildJob.trigger).toBe("reproduction_confidence_change");
    expect(buildJob.occurrence_count).toBe(2);

    expect(
      await processNextBuildBundleJob({
        queue,
        incidentStore: createPostgresMetadataStore(queryable),
        objectStore
      })
    ).toEqual({ processed: true });

    const queuedReproductionJobs = await queue.readJobQueue("build-reproduction");
    expect(queuedReproductionJobs).toHaveLength(1);

    expect(
      await processNextBuildReproductionJob({
        queue,
        objectStore
      })
    ).toEqual({ processed: true });

    const upgradedReproductionResponse = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/reproduction`,
      headers: {
        authorization: `Bearer ${memberToken}`
      }
    });
    expect(upgradedReproductionResponse.statusCode).toBe(200);
    expect(upgradedReproductionResponse.json()).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    const upgradedStoredReproduction = await objectStore.getObject({
      key: buildReproductionObjectKey(projectId, incidentId)
    });
    expect(initialStoredReproduction.equals(upgradedStoredReproduction)).toBe(false);

    const replayUpgradedBuildReproductionJob = JSON.parse(queuedReproductionJobs[0] ?? "{}") as BuildReproductionJob;
    await queue.enqueue("build-reproduction", replayUpgradedBuildReproductionJob);
    expect(
      await processNextBuildReproductionJob({
        queue,
        objectStore
      })
    ).toEqual({ processed: true });

    const replayStoredReproduction = await objectStore.getObject({
      key: buildReproductionObjectKey(projectId, incidentId)
    });
    expect(upgradedStoredReproduction.equals(replayStoredReproduction)).toBe(true);
  });

});
