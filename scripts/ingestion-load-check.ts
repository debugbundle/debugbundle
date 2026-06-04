import { performance } from "node:perf_hooks";

import { hashToken } from "../packages/auth/src/index.js";
import { createApiServer } from "../apps/api/src/server.js";
import { createEventEnvelope } from "../packages/shared-types/src/index.js";

type RequestPlan = {
  kind: "valid" | "malformed" | "invalid-token" | "rate-limited" | "capture-policy";
};

type TimedResult = {
  kind: RequestPlan["kind"];
  statusCode: number;
  latencyMs: number;
  reason: string | null;
};

const VALID_TOKEN = "dbundle_proj_valid_load";
const RATE_LIMITED_TOKEN = "dbundle_proj_rate_limited_load";
const MINIMAL_TOKEN = "dbundle_proj_minimal_load";

const VALID_TOKEN_HASH = hashToken(VALID_TOKEN);
const RATE_LIMITED_TOKEN_HASH = hashToken(RATE_LIMITED_TOKEN);
const MINIMAL_TOKEN_HASH = hashToken(MINIMAL_TOKEN);

const TOTAL_REQUESTS = 600;
const CONCURRENCY = 20;
const VALID_P95_THRESHOLD_MS = 200;

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function summarize(samples: number[]): {
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
} {
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (ratio: number): number => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? 0;
  };
  const avg = sorted.reduce((sum, sample) => sum + sample, 0) / Math.max(sorted.length, 1);

  return {
    p50Ms: roundMs(percentile(0.5)),
    p95Ms: roundMs(percentile(0.95)),
    avgMs: roundMs(avg),
    maxMs: roundMs(sorted[sorted.length - 1] ?? 0)
  };
}

function createValidEvent() {
  return createEventEnvelope({
    event_id: "50000000-0000-4000-8000-000000000001",
    occurred_at: "2026-04-04T00:00:00.000Z",
    event_type: "backend_exception",
    project_token: VALID_TOKEN,
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
        headers: { "content-type": "application/json" },
        body: { amount: 1999 }
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

function createCapturePolicyRejectedEvent() {
  return createEventEnvelope({
    event_id: "50000000-0000-4000-8000-000000000002",
    occurred_at: "2026-04-04T00:00:00.000Z",
    event_type: "request_event",
    project_token: MINIMAL_TOKEN,
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
      query: {},
      headers: { "content-type": "application/json" },
      body: { amount: 1999 },
      response_status: 200,
      duration_ms: 85
    }
  });
}

function buildPlan(totalRequests: number): RequestPlan[] {
  const pattern: RequestPlan[] = [
    { kind: "valid" },
    { kind: "valid" },
    { kind: "valid" },
    { kind: "malformed" },
    { kind: "invalid-token" },
    { kind: "rate-limited" },
    { kind: "capture-policy" },
    { kind: "valid" },
    { kind: "malformed" },
    { kind: "valid" }
  ];

  return Array.from(
    { length: totalRequests },
    (_, index) => pattern[index % pattern.length] ?? { kind: "valid" }
  );
}

async function main(): Promise<void> {
  const persistAndEnqueue = async () => ({ object_key: "raw-events/proj_load/event.json.gz" });
  let persistedCount = 0;

  const app = createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: async () => {
        persistedCount += 1;
        return persistAndEnqueue();
      }
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: async (tokenHash: string) => {
        if (tokenHash === VALID_TOKEN_HASH) {
          return {
            project_id: "proj_valid_load",
            organization_id: "org_load",
            organization_plan: "solo" as const
          };
        }
        if (tokenHash === RATE_LIMITED_TOKEN_HASH) {
          return {
            project_id: "proj_rate_limited_load",
            organization_id: "org_load",
            organization_plan: "solo" as const
          };
        }
        if (tokenHash === MINIMAL_TOKEN_HASH) {
          return {
            project_id: "proj_minimal_load",
            organization_id: "org_load",
            organization_plan: "free" as const
          };
        }

        return null;
      }
    },
    ingestionRateLimiter: {
      claimEvents: async (input) => {
        if (input.token_hash === RATE_LIMITED_TOKEN_HASH) {
          return {
            allowed: false,
            limit: 1,
            remaining: 0,
            retry_after_ms: 2_000
          };
        }

        return {
          allowed: true,
          limit: 5_000,
          remaining: 4_999,
          retry_after_ms: 0
        };
      }
    },
    billingManagement: {
      getBillingSummaryForOrganization: async () => ({
        plan: "solo" as const,
        billing_state: "active" as const,
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
          monthly_bundle_requests: { used: 0, limit: 100 },
          monthly_raw_ingested_events: { used: 10, limit: 100_000 },
          retained_bundle_cap: { used: 0, limit: 50 },
          monthly_remote_activations: { used: 0, limit: 25 },
          monthly_alert_deliveries: { used: 0, limit: 100 },
          monthly_webhook_deliveries: { used: 0, limit: 250 }
        },
        trial: {
          available: false,
          active: false,
          plan: null,
          started_at: null,
          ends_at: null,
          used_at: null,
          converted_at: null,
          expired_at: null,
          days_remaining: null
        }
      }),
      createCheckoutLink: async () => null,
      createPortalLink: async () => null
    },
    capturePolicyManagement: {
      getCapturePolicyForProject: async (input) => {
        if (input.project_id === "proj_minimal_load") {
          return {
            project_id: input.project_id,
            preset: "minimal",
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null,
            updated_at: "2026-04-04T00:00:00.000Z"
          };
        }

        return null;
      },
      upsertCapturePolicyForProject: async () => null
    },
    memberAuth: {
      resolveMemberByTokenHash: async () => null
    },
    tokenManagement: {
      listProjectTokensForOrganization: async () => [],
      createProjectTokenForOrganization: async () => ({
        token_id: "ptok_load",
        project_id: "proj_valid_load",
        label: "load",
        allowed_origins: [],
        token_preview: VALID_TOKEN,
        created_at: "2026-04-04T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeProjectTokenForOrganization: async () => null,
      listMemberTokensForOrganization: async () => [],
      createMemberTokenForOrganization: async () => ({
        token_id: "mtok_load",
        member_id: "mem_load",
        user_id: "usr_load",
        organization_id: "org_load",
        label: "load",
        token_preview: "dbundle_mem_load",
        created_at: "2026-04-04T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeMemberTokenForOrganization: async () => null
    },
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

  const validEvent = createValidEvent();
  const capturePolicyRejectedEvent = createCapturePolicyRejectedEvent();
  const plan = buildPlan(TOTAL_REQUESTS);
  const expectedCounts = plan.reduce<Record<RequestPlan["kind"], number>>(
    (counts, item) => {
      counts[item.kind] += 1;
      return counts;
    },
    {
      valid: 0,
      malformed: 0,
      "invalid-token": 0,
      "rate-limited": 0,
      "capture-policy": 0
    }
  );
  const results: TimedResult[] = [];
  let nextIndex = 0;

  try {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;

          if (currentIndex >= plan.length) {
            return;
          }

          const entry = plan[currentIndex];
          if (entry === undefined) {
            return;
          }

          let authorization = `Bearer ${VALID_TOKEN}`;
          let payload: { events: unknown[]; extra?: boolean } = { events: [validEvent] };

          if (entry.kind === "malformed") {
            payload = { events: [], extra: true };
          } else if (entry.kind === "invalid-token") {
            authorization = "Bearer dbundle_mem_noise";
          } else if (entry.kind === "rate-limited") {
            authorization = `Bearer ${RATE_LIMITED_TOKEN}`;
          } else if (entry.kind === "capture-policy") {
            authorization = `Bearer ${MINIMAL_TOKEN}`;
            payload = { events: [capturePolicyRejectedEvent] };
          }

          const startedAt = performance.now();
          const response = await app.inject({
            method: "POST",
            url: "/v1/events",
            headers: {
              authorization,
              "content-type": "application/json"
            },
            payload
          });
          const latencyMs = performance.now() - startedAt;

          let reason: string | null = null;
          const body = response.json<{ errors?: Array<{ reason: string }> }>();
          reason = body.errors?.[0]?.reason ?? null;

          results.push({
            kind: entry.kind,
            statusCode: response.statusCode,
            latencyMs,
            reason
          });
        }
      })
    );

    const groupedCounts = {
      validAccepted: results.filter(
        (result) => result.kind === "valid" && result.statusCode === 202 && result.reason === null
      ).length,
      malformed400: results.filter(
        (result) =>
          result.kind === "malformed" &&
          result.statusCode === 400 &&
          result.reason === "malformed_payload"
      ).length,
      invalid401: results.filter(
        (result) =>
          result.kind === "invalid-token" &&
          result.statusCode === 401 &&
          result.reason === "invalid_project_token"
      ).length,
      rateLimited429: results.filter(
        (result) =>
          result.kind === "rate-limited" &&
          result.statusCode === 429 &&
          result.reason === "rate_limited"
      ).length,
      capturePolicyRejected: results.filter(
        (result) =>
          result.kind === "capture-policy" &&
          result.statusCode === 202 &&
          result.reason === "capture_policy_rejected"
      ).length,
      unexpected: results.filter((result) => {
        if (result.kind === "valid") {
          return !(result.statusCode === 202 && result.reason === null);
        }
        if (result.kind === "malformed") {
          return !(result.statusCode === 400 && result.reason === "malformed_payload");
        }
        if (result.kind === "invalid-token") {
          return !(result.statusCode === 401 && result.reason === "invalid_project_token");
        }
        if (result.kind === "rate-limited") {
          return !(result.statusCode === 429 && result.reason === "rate_limited");
        }

        return !(result.statusCode === 202 && result.reason === "capture_policy_rejected");
      }).length
    };

    const validLatencies = results
      .filter((result) => result.kind === "valid")
      .map((result) => result.latencyMs);
    const overallLatencies = results.map((result) => result.latencyMs);

    const summary = {
      generatedAt: new Date().toISOString(),
      totalRequests: TOTAL_REQUESTS,
      concurrency: CONCURRENCY,
      expectedCounts,
      observedCounts: groupedCounts,
      persistedCount,
      latency: {
        valid: summarize(validLatencies),
        overall: summarize(overallLatencies)
      }
    };

    console.log(JSON.stringify(summary, null, 2));

    if (groupedCounts.unexpected !== 0) {
      throw new Error(`unexpected_response_count:${groupedCounts.unexpected}`);
    }
    if (groupedCounts.validAccepted !== expectedCounts.valid) {
      throw new Error(`valid_acceptance_mismatch:${groupedCounts.validAccepted}`);
    }
    if (groupedCounts.malformed400 !== expectedCounts.malformed) {
      throw new Error(`malformed_response_mismatch:${groupedCounts.malformed400}`);
    }
    if (groupedCounts.invalid401 !== expectedCounts["invalid-token"]) {
      throw new Error(`invalid_token_response_mismatch:${groupedCounts.invalid401}`);
    }
    if (groupedCounts.rateLimited429 !== expectedCounts["rate-limited"]) {
      throw new Error(`rate_limit_response_mismatch:${groupedCounts.rateLimited429}`);
    }
    if (groupedCounts.capturePolicyRejected !== expectedCounts["capture-policy"]) {
      throw new Error(`capture_policy_response_mismatch:${groupedCounts.capturePolicyRejected}`);
    }
    if (persistedCount !== expectedCounts.valid) {
      throw new Error(`persisted_count_mismatch:${persistedCount}`);
    }
    if (summary.latency.valid.p95Ms >= VALID_P95_THRESHOLD_MS) {
      throw new Error(`valid_ingestion_p95_threshold_exceeded:${summary.latency.valid.p95Ms}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_ingestion_load_error";
  console.error(`ingestion_load_check_failed:${message}`);
  process.exitCode = 1;
});
