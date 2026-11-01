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
  buildReproductionObjectKey,
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

runIntegration("ingestion bundle reproduction", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
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
      [
        incidentId,
        requestEnvelope.event_id,
        requestEnvelope.event_type,
        requestEnvelope.occurred_at,
        true
      ]
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
      possible: false,
      confidence: 0.1,
      reason: "request_target_unavailable",
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
    expect(JSON.parse(gunzipSync(firstStoredReproduction).toString("utf8"))).toEqual(
      reproductionResponse.json()
    );

    const replayBuildReproductionJob = JSON.parse(
      queuedReproductionJobs[0] ?? "{}"
    ) as BuildReproductionJob;
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

  it("should add a deterministic incomplete template when request context appears without an origin", async (): Promise<void> => {
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
      event_class: "incident_signal",
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
    const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as {
      trigger: string;
      occurrence_count: number;
    };
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
      possible: false,
      confidence: 0.1,
      reason: "request_target_unavailable",
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

    const replayUpgradedBuildReproductionJob = JSON.parse(
      queuedReproductionJobs[0] ?? "{}"
    ) as BuildReproductionJob;
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
