import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { expect, it, beforeAll, afterAll } from "vitest";

import { createApiDependencies } from "../../apps/api/src/default-dependencies.ts";
import { createApiServer } from "../../apps/api/src/server.js";
import { processNextGroupIncidentJob, processNextNormalizeEventsJob } from "../../apps/worker/src/processor.js";
import { createProcessedEventStore } from "../../apps/worker/src/runtime.js";
import { createEventEnvelope } from "../../packages/shared-types/src/index.js";
import {
  createPostgresMetadataStore,
  createS3ObjectStoreClient,
  createRedisQueueClient
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

runIntegration("ingestion integration \u2013 core pipeline", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should persist raw event to S3 and enqueue Redis job without synchronous incident metadata writes", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const projectToken = "dbundle_proj_integration_token";
    const tokenHash = createHash("sha256").update(projectToken, "utf8").digest("hex");

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM processed_events");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Integration Org",
      organizationSlug: `integration-org-${organizationId.slice(0, 8)}`,
      projectName: "Integration Project",
      projectSlug: "integration-project"
    });

    await pool.query(
      `
        INSERT INTO project_tokens (id, project_id, token_hash, label)
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), projectId, tokenHash, "integration-token"]
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
    await queue.clearJobQueue("normalize-events");

    const deps = createApiDependencies({
      db: {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      },
      objectStore,
      queue
    });

    const app = createApiServer(deps);

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read property 'id' of undefined",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {
            authorization: "Bearer secret"
          },
          body: {
            password: "hunter2"
          }
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: `Bearer ${projectToken}`
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);

    const jobs = await queue.readJobQueue("normalize-events");
    expect(jobs).toHaveLength(1);

    const jobPayload = JSON.parse(jobs[0] ?? "{}") as {
      project_id: string;
      event_id: string;
      object_key: string;
    };
    expect(jobPayload.project_id).toBe(projectId);
    expect(jobPayload.event_id).toBe(event.event_id);
    expect(jobPayload.object_key).toContain(`raw-events/${projectId}/`);

    const incidentRows = await pool.query<{ id: string }>("SELECT id FROM incidents WHERE project_id = $1", [projectId]);
    expect(incidentRows.rows).toHaveLength(0);

    const eventRows = await pool.query<{ event_id: string }>(
      "SELECT event_id FROM incident_events WHERE incident_id = $1",
      [incidentRows.rows[0]?.id]
    );
    expect(eventRows.rows).toHaveLength(0);

    const now = new Date(event.occurred_at);
    const yyyy = now.getUTCFullYear().toString();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const key = `raw-events/${projectId}/${yyyy}/${mm}/${dd}/${hh}/${event.event_id}.json.gz`;

    const rawBody = await objectStore.getObject({ key });
    const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as {
      payload: { request: { headers: { authorization: string }; body: { password: string } } };
    };

    expect(parsed.payload.request.headers.authorization).toBe("[REDACTED]");
    expect(parsed.payload.request.body.password).toBe("[REDACTED]");

    await s3Admin.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
  });

  it("should process an enqueued ingestion job and persist normalized output into processed_events", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const projectToken = "dbundle_proj_worker_handoff_token";
    const tokenHash = createHash("sha256").update(projectToken, "utf8").digest("hex");

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM processed_events");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Worker Integration Org",
      organizationSlug: `worker-integration-org-${organizationId.slice(0, 8)}`,
      projectName: "Worker Integration Project",
      projectSlug: "worker-integration-project"
    });

    await pool.query(
      `
        INSERT INTO project_tokens (id, project_id, token_hash, label)
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), projectId, tokenHash, "worker-integration-token"]
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
    await queue.clearJobQueue("normalize-events");

    const deps = createApiDependencies({
      db: {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      },
      objectStore,
      queue
    });

    const app = createApiServer(deps);

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read property 'id' of undefined",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {
            authorization: "Bearer secret"
          },
          body: {
            password: "hunter2"
          }
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: `Bearer ${projectToken}`
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);

    const processResult = await processNextNormalizeEventsJob({
      queue,
      objectStore,
      processedEventStore: createProcessedEventStore({
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      })
    });

    expect(processResult).toEqual({ processed: true });

    const processedRows = await pool.query<{
      event_id: string;
      project_id: string;
      event_type: string;
      fingerprint: string;
      normalized_message: string;
    }>(
      `
        SELECT event_id, project_id, event_type, fingerprint, normalized_message
        FROM processed_events
        WHERE event_id = $1
      `,
      [event.event_id]
    );

    expect(processedRows.rows).toHaveLength(1);
    expect(processedRows.rows[0]?.project_id).toBe(projectId);
    expect(processedRows.rows[0]?.event_type).toBe("backend_exception");
    expect(processedRows.rows[0]?.fingerprint).not.toHaveLength(0);
    expect(processedRows.rows[0]?.normalized_message).toBe("Cannot read property 'id' of undefined");

    const drainedResult = await processNextNormalizeEventsJob({
      queue,
      objectStore,
      processedEventStore: createProcessedEventStore({
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      })
    });

    expect(drainedResult).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should keep incident linkage and occurrence counters stable when group-incident job is reprocessed", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const projectToken = "dbundle_proj_worker_idempotency_token";
    const tokenHash = createHash("sha256").update(projectToken, "utf8").digest("hex");

    await pool.query("DELETE FROM incident_events");
    await pool.query("DELETE FROM incidents");
    await pool.query("DELETE FROM services");
    await pool.query("DELETE FROM project_tokens");
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM processed_events");

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Idempotency Integration Org",
      organizationSlug: `idempotency-org-${organizationId.slice(0, 8)}`,
      projectName: "Idempotency Integration Project",
      projectSlug: "idempotency-integration-project"
    });

    await pool.query(
      `
        INSERT INTO project_tokens (id, project_id, token_hash, label)
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), projectId, tokenHash, "worker-idempotency-token"]
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
    await queue.clearJobQueue("normalize-events");
    await queue.clearJobQueue("group-incident");

    const deps = createApiDependencies({
      db: {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      },
      objectStore,
      queue
    });

    const app = createApiServer(deps);

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read property 'id' of undefined",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {
            authorization: "Bearer secret"
          },
          body: {
            password: "hunter2"
          }
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: `Bearer ${projectToken}`
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);

    const normalizeResult = await processNextNormalizeEventsJob({
      queue,
      objectStore,
      processedEventStore: createProcessedEventStore({
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      })
    });

    expect(normalizeResult).toEqual({ processed: true });

    const groupJobs = await queue.readJobQueue("group-incident");
    expect(groupJobs).toHaveLength(1);
    const groupJob = JSON.parse(groupJobs[0] ?? "{}") as {
      project_id: string;
      event_id: string;
      event_type: "backend_exception";
      event_class: "incident_signal";
      service_name: string;
      environment: string;
      fingerprint: string;
      fingerprint_version: string;
      normalized_message: string;
      matched_fields: string[];
      occurred_at: string;
      severity: "high";
    };
    expect(groupJob.fingerprint_version).toBe("v1");
    expect(groupJob.matched_fields).toEqual([
      "environment",
      "normalized_message",
      "error_type",
      "route_template",
      "top_frames",
      "http_method",
      "http_status"
    ]);

    const groupDependencies = {
      queue,
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

    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    await queue.enqueue("group-incident", groupJob);
    expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({ processed: true });

    const incidentRows = await pool.query<{ id: string; occurrence_count: number }>(
      `
        SELECT id, occurrence_count
        FROM incidents
        WHERE project_id = $1
      `,
      [projectId]
    );
    expect(incidentRows.rows).toHaveLength(1);
    expect(incidentRows.rows[0]?.occurrence_count).toBe(1);

    const eventLinkRows = await pool.query<{ incident_id: string; event_id: string }>(
      `
        SELECT incident_id, event_id
        FROM incident_events
        WHERE event_id = $1
      `,
      [event.event_id]
    );
    expect(eventLinkRows.rows).toHaveLength(1);
    expect(eventLinkRows.rows[0]?.incident_id).toBe(incidentRows.rows[0]?.id);
  });

});
