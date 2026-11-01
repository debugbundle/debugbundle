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
  buildRawEventObjectKey,
  buildBundleObjectKey,
  type BuildBundleJob
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

runIntegration("ingestion bundle occurrence context", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
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
          stack:
            "TypeError: Cannot read properties of null\n    at CheckoutPage (src/Checkout.tsx:12:3)",
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
        logs: {
          items: Array<{
            level: string;
            message: string;
            timestamp: string;
            attributes: Record<string, unknown>;
          }>;
        };
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
    // The backend primary cannot inherit a neighbouring browser occurrence's device.
    expect(firstBundle.context.device).toBeNull();

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
    const regeneratedBundle: { metadata: { generation_number: number } } =
      regeneratedResponse.json();
    expect(regeneratedBundle.metadata.generation_number).toBe(2);

    const storedBundle = await objectStore.getObject({
      key: buildBundleObjectKey(projectId, incidentId)
    });
    expect(storedBundle.byteLength).toBeGreaterThan(0);
  });
});
