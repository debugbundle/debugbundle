import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import { expect, it, beforeAll, afterAll } from "vitest";

import { createApiDependencies } from "../../apps/api/src/default-dependencies.ts";
import { createApiServer } from "../../apps/api/src/server.js";
import { processNextBuildBundleJob } from "../../apps/worker/src/processor.js";
import {
  createPostgresMetadataStore,
  createS3ObjectStoreClient,
  createRedisQueueClient,
  buildRawEventObjectKey
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

runIntegration("ingestion bundle probe context", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
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
          items: Array<{
            label: string;
            timestamp: string;
            activation_id: string | null;
            data: Record<string, unknown>;
          }>;
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
});
