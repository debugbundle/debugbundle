import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

import { createApiServer } from "../apps/api/src/server.js";
import { buildBundle, type BuildBundleInput } from "../packages/bundle-engine/src/index.js";
import { createEventEnvelope, type EventEnvelope } from "../packages/shared-types/src/index.js";

type SampleStats = {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
};

const INGESTION_THRESHOLD_MS = 200;
const BUNDLE_GENERATION_THRESHOLD_MS = 5_000;

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function summarize(samples: number[]): SampleStats {
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (ratio: number): number => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? 0;
  };
  const average = sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1);

  return {
    samples: sorted.length,
    p50Ms: roundMs(percentile(0.5)),
    p95Ms: roundMs(percentile(0.95)),
    avgMs: roundMs(average),
    maxMs: roundMs(sorted[sorted.length - 1] ?? 0)
  };
}

async function measureAsyncSamples(iterations: number, run: () => Promise<void>): Promise<number[]> {
  const samples: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await run();
    samples.push(performance.now() - startedAt);
  }

  return samples;
}

function measureSyncSamples(iterations: number, run: () => void): number[] {
  const samples: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    run();
    samples.push(performance.now() - startedAt);
  }

  return samples;
}

function createTokenManagementDependency() {
  return {
    listProjectTokensForOrganization: async () => [],
    createProjectTokenForOrganization: async () => ({
      token_id: "ptok_perf",
      project_id: "proj_perf",
      label: "perf",
      token_preview: "dbundle_proj_perf",
      created_at: "2026-04-04T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null
    }),
    revokeProjectTokenForOrganization: async () => null,
    listMemberTokensForOrganization: async () => [],
    createMemberTokenForOrganization: async () => ({
      token_id: "mtok_perf",
      member_id: "mem_perf",
      user_id: "usr_perf",
      organization_id: "org_perf",
      label: "perf",
      token_preview: "dbundle_mem_perf",
      created_at: "2026-04-04T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null
    }),
    revokeMemberTokenForOrganization: async () => null
  };
}

function createIncidentFixture() {
  return {
    incident_id: "inc_perf",
    project_id: "550e8400-e29b-41d4-a716-446655440000",
    project_name: "Main App",
    service_id: "svc_perf",
    service_name: "checkout-api",
    latest_deployment_id: null,
    environment: "production",
    fingerprint: "fp_perf",
    fingerprint_version: "v1",
    title: "TypeError at checkout",
    severity: "high" as const,
    status: "open" as const,
    first_seen_at: "2026-04-04T00:00:00.000Z",
    last_seen_at: "2026-04-04T00:10:00.000Z",
    occurrence_count: 12,
    spike_detected_at: null,
    resolved_at: null,
    regressed_at: null,
    matched_fields: ["fingerprint", "normalized_message", "top_3_frames"]
  };
}

function createBundleInput(): BuildBundleInput {
  const incident = {
    incident_id: "inc_perf",
    project_id: "proj_perf",
    service_id: "svc_perf",
    service_name: "checkout-api",
    service_runtime: "node",
    service_framework: "fastify",
    environment: "production",
    fingerprint: "fp_perf",
    title: "TypeError at checkout",
    severity: "high" as const,
    first_seen_at: "2026-04-04T00:00:00.000Z",
    last_seen_at: "2026-04-04T00:10:00.000Z",
    occurrence_count: 12,
    source_event_types: ["request_event", "backend_exception", "log_event"] as EventEnvelope["event_type"][]
  };

  const sourceEnvelopes = Array.from({ length: 12 }, (_, index) => {
    if (index % 3 === 0) {
      return createEventEnvelope({
        event_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        occurred_at: `2026-04-04T00:${String(index).padStart(2, "0")}:00.000Z`,
        event_type: "backend_exception",
        project_token: "dbundle_proj_perf",
        service: {
          name: "checkout-api",
          environment: "production",
          runtime: "node",
          framework: "fastify"
        },
        payload: {
          name: "TypeError",
          message: "Cannot read properties of undefined",
          stack: "TypeError: Cannot read properties of undefined\n    at checkout.ts:10:5\n    at processPayment.ts:42:9",
          handled: false,
          request: {
            method: "POST",
            path: "/checkout",
            query: { cart_id: "abc123" },
            headers: { "content-type": "application/json" },
            body: { amount: 1999, currency: "USD" }
          },
          response: {
            status_code: 500
          },
          runtime: {
            version: "24.0.0"
          }
        }
      });
    }

    if (index % 3 === 1) {
      return createEventEnvelope({
        event_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        occurred_at: `2026-04-04T00:${String(index).padStart(2, "0")}:15.000Z`,
        event_type: "request_event",
        project_token: "dbundle_proj_perf",
        service: {
          name: "checkout-api",
          environment: "production",
          runtime: "node",
          framework: "fastify"
        },
        payload: {
          method: "POST",
          path: "/checkout",
          route_template: "/checkout",
          query: { cart_id: "abc123" },
          headers: { "content-type": "application/json" },
          body: { amount: 1999, currency: "USD" },
          response_status: 500,
          duration_ms: 187,
        }
      });
    }

    return createEventEnvelope({
      event_id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      occurred_at: `2026-04-04T00:${String(index).padStart(2, "0")}:30.000Z`,
      event_type: "log_event",
      project_token: "dbundle_proj_perf",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "checkout failed",
        attributes: {
          request_id: `req_${index + 1}`,
          attempt: index + 1
        }
      }
    });
  });

  return {
    job: {
      trigger: "occurrence_threshold" as const
    },
    incident,
    bundleMetadata: {
      generation_number: 4,
      created_at: "2026-04-04T00:10:30.000Z",
      updated_at: "2026-04-04T00:10:30.000Z",
      source_event_id: sourceEnvelopes[0]?.event_id ?? "evt_perf",
      source_occurred_at: sourceEnvelopes[0]?.occurred_at ?? "2026-04-04T00:00:00.000Z"
    },
    sourceEnvelopes,
    probeDataItems: Array.from({ length: 8 }, (_, index) => ({
      label: `checkout.debug.${index + 1}`,
      data: {
        step: index + 1,
        attempt: index + 1,
        queue_depth: index * 2
      },
      timestamp: `2026-04-04T00:${String(index).padStart(2, "0")}:45.000Z`,
      activation_id: index % 2 === 0 ? null : `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    }))
  };
}

function createIngestionBenchmarkApp() {
  const event = createEventEnvelope({
    event_id: "40000000-0000-4000-8000-000000000001",
    occurred_at: "2026-04-04T00:00:00.000Z",
    event_type: "backend_exception",
    project_token: "dbundle_proj_perf",
    service: {
      name: "checkout-api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      name: "TypeError",
      message: "Cannot read properties of undefined",
      stack: "TypeError: Cannot read properties of undefined\n    at checkout.ts:10:5",
      handled: false,
      request: {
        method: "POST",
        path: "/checkout",
        query: {},
        headers: {
          "content-type": "application/json"
        },
        body: {
          amount: 1999,
          currency: "USD"
        }
      },
      response: {
        status_code: 500
      },
      runtime: {
        version: "24.0.0"
      }
    }
  });

  const app = createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: async () => ({ object_key: "raw-events/proj_perf/event.json.gz" })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: async () => ({
        project_id: "proj_perf",
        organization_id: "org_perf",
        organization_plan: "solo" as const
      })
    },
    ingestionRateLimiter: {
      claimEvents: async () => ({
        allowed: true,
        limit: 5_000,
        remaining: 4_999,
        retry_after_ms: 0
      })
    },
    billingManagement: {
      getBillingSummaryForOrganization: async () => ({
        plan: "solo" as const,
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-04-01T00:00:00.000Z",
          ends_at: "2026-05-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 4,
            limit: 100
          },
          monthly_raw_ingested_events: {
            used: 12,
            limit: 100_000
          },
          retained_bundle_cap: {
            used: 2,
            limit: 50
          },
          monthly_remote_activations: {
            used: 0,
            limit: 25
          },
          monthly_alert_deliveries: {
            used: 0,
            limit: 100
          },
          monthly_webhook_deliveries: {
            used: 0,
            limit: 250
          }
        }
      }),
      createCheckoutLink: async () => null,
      createPortalLink: async () => null
    },
    memberAuth: {
      resolveMemberByTokenHash: async () => null
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: {
      listIncidentsForOrganization: async () => [],
      getIncidentForOrganization: async () => null,
      listServicesForOrganization: async () => [],
      listIncidentLogsForOrganization: async () => []
    },
    objectStoreReader: {
      getObject: async () => {
        throw new Error("not_found");
      }
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: async () => ({ deliveries: [] })
    }
  });

  const payload = { events: [event] };

  return {
    app,
    run: async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: {
          authorization: "Bearer dbundle_proj_perf",
          "content-type": "application/json"
        },
        payload
      });

      if (response.statusCode !== 202) {
        throw new Error(`ingestion_benchmark_failed:${response.statusCode}`);
      }
    }
  };
}

function createRetrievalBenchmarkApp(bundleGzip: Buffer) {
  const incident = createIncidentFixture();

  const app = createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: async () => ({ object_key: "raw-events/proj_perf/event.json.gz" })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: async () => null
    },
    memberAuth: {
      resolveMemberByTokenHash: async () => ({
        member_id: "mem_perf",
        organization_id: "org_perf",
        role: "owner" as const
      })
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: {
      listIncidentsForOrganization: async () => [incident],
      getIncidentForOrganization: async () => incident,
      listServicesForOrganization: async () => [
        {
          service_id: "svc_perf",
          project_id: incident.project_id,
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ],
      listIncidentLogsForOrganization: async () => [
        {
          event_id: "evt_perf",
          event_type: "backend_exception",
          occurred_at: "2026-04-04T00:00:00.000Z",
          is_sampled: true,
          level: null
        }
      ]
    },
    objectStoreReader: {
      getObject: async () => bundleGzip
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: async () => ({ deliveries: [] }),
      retryDeliveryForOrganization: async () => null
    }
  });

  return {
    app,
    listIncidents: async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/incidents?limit=10",
        headers: {
          authorization: "Bearer dbundle_mem_perf"
        }
      });
      if (response.statusCode !== 200) {
        throw new Error(`retrieval_list_failed:${response.statusCode}`);
      }
    },
    getIncident: async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/incidents/inc_perf",
        headers: {
          authorization: "Bearer dbundle_mem_perf"
        }
      });
      if (response.statusCode !== 200) {
        throw new Error(`retrieval_detail_failed:${response.statusCode}`);
      }
    },
    getBundle: async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/incidents/inc_perf/bundle",
        headers: {
          authorization: "Bearer dbundle_mem_perf"
        }
      });
      if (response.statusCode !== 200) {
        throw new Error(`retrieval_bundle_failed:${response.statusCode}`);
      }
    }
  };
}

async function runConcurrentBenchmark(options: {
  concurrency: number;
  iterationsPerWorker: number;
  run: () => Promise<void>;
}): Promise<number[]> {
  const samples: number[] = [];

  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      for (let iteration = 0; iteration < options.iterationsPerWorker; iteration += 1) {
        const startedAt = performance.now();
        await options.run();
        samples.push(performance.now() - startedAt);
      }
    })
  );

  return samples;
}

async function main(): Promise<void> {
  const bundleInput = createBundleInput();
  const baselineBundle = buildBundle(bundleInput);
  const bundleGzip = gzipSync(Buffer.from(JSON.stringify(baselineBundle), "utf8"));

  const ingestion = createIngestionBenchmarkApp();
  const retrieval = createRetrievalBenchmarkApp(bundleGzip);

  try {
    await measureAsyncSamples(10, ingestion.run);
    await measureAsyncSamples(10, retrieval.listIncidents);
    await measureAsyncSamples(10, retrieval.getIncident);
    await measureAsyncSamples(10, retrieval.getBundle);
    measureSyncSamples(20, () => {
      buildBundle(bundleInput);
    });

    const ingestionStats = summarize(
      await runConcurrentBenchmark({
        concurrency: 12,
        iterationsPerWorker: 20,
        run: ingestion.run
      })
    );
    const bundleStats = summarize(
      measureSyncSamples(400, () => {
        buildBundle(bundleInput);
      })
    );
    const retrievalListStats = summarize(await measureAsyncSamples(160, retrieval.listIncidents));
    const retrievalDetailStats = summarize(await measureAsyncSamples(160, retrieval.getIncident));
    const retrievalBundleStats = summarize(await measureAsyncSamples(160, retrieval.getBundle));

    const result = {
      generatedAt: new Date().toISOString(),
      thresholds: {
        ingestionP95Ms: INGESTION_THRESHOLD_MS,
        bundleGenerationMaxMs: BUNDLE_GENERATION_THRESHOLD_MS
      },
      ingestion: {
        concurrency: 12,
        totalRequests: 240,
        ...ingestionStats
      },
      bundleGeneration: {
        iterations: 400,
        ...bundleStats
      },
      retrieval: {
        incidentsList: retrievalListStats,
        incidentDetail: retrievalDetailStats,
        incidentBundle: retrievalBundleStats
      }
    };

    console.log(JSON.stringify(result, null, 2));

    if (ingestionStats.p95Ms >= INGESTION_THRESHOLD_MS) {
      throw new Error(`ingestion_latency_threshold_exceeded:${ingestionStats.p95Ms}`);
    }
    if (bundleStats.maxMs >= BUNDLE_GENERATION_THRESHOLD_MS) {
      throw new Error(`bundle_generation_threshold_exceeded:${bundleStats.maxMs}`);
    }
  } finally {
    await ingestion.app.close();
    await retrieval.app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_perf_check_error";
  console.error(`perf_check_failed:${message}`);
  process.exitCode = 1;
});
