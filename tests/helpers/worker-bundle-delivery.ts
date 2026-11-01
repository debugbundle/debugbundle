import { readFileSync } from "node:fs";
import { BundleV1Schema, createEventEnvelope } from "../../packages/shared-types/src/index.js";

export const deployMetadataGoldenFixture = readFileSync(
  new URL("../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url),
  "utf8"
).trim();

export const deployMetadataSourceEnvelope = createEventEnvelope({
  event_id: "00000000-0000-4000-8000-000000000111",
  event_type: "backend_exception",
  sdk_name: "debugbundle-node",
  sdk_version: "0.1.0",
  occurred_at: "2026-03-12T00:00:00.000Z",
  service: {
    name: "checkout-api",
    environment: "production",
    runtime: "node",
    framework: "fastify"
  },
  payload: {
    name: "backend_exception",
    message: "TypeError at checkout",
    stack: "unavailable",
    handled: false,
    request: {
      method: "GET",
      path: "/checkout",
      query: {},
      headers: {}
    },
    response: {
      status_code: 500
    },
    runtime: {
      version: "24.0.0"
    }
  }
});

export function createReservedBundleGeneration(
  overrides?: Partial<{
    generation_number: number;
    created_at: string;
    updated_at: string;
    source_event_id: string;
    source_occurred_at: string;
    trigger:
      | "occurrence_threshold"
      | "regression_reopen"
      | "deploy_metadata"
      | "new_context_type"
      | "reproduction_confidence_change"
      | "regeneration";
  }>
): {
  generation_number: number;
  created_at: string;
  updated_at: string;
  source_event_id: string;
  source_occurred_at: string;
  trigger:
    | "occurrence_threshold"
    | "regression_reopen"
    | "deploy_metadata"
    | "new_context_type"
    | "reproduction_confidence_change"
    | "regeneration";
} {
  return {
    generation_number: 1,
    created_at: "2026-03-12T00:00:00.000Z",
    updated_at: "2026-03-12T00:00:00.000Z",
    source_event_id: "evt_123",
    source_occurred_at: "2026-03-12T00:00:00.000Z",
    trigger: "occurrence_threshold",
    ...overrides
  };
}

export function createReproductionBundle(input: { includeRequest: boolean }): unknown {
  return BundleV1Schema.parse({
    bundle_version: 1,
    bundle_id: "bnd_123",
    bundle_type: "failure",
    captured_at: "2026-03-12T00:00:00.000Z",
    sdk: {
      name: "debugbundle-node",
      version: "0.1.0"
    },
    project: {
      id: "proj_123",
      slug: "project-proj_123",
      environment: "production"
    },
    service: {
      id: "svc_123",
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      version: null,
      region: null
    },
    signal: {
      signal_id: "inc_123",
      signal_type: input.includeRequest ? "request_failure" : "exception",
      severity: "high",
      fingerprint: "fp_123",
      first_seen_at: "2026-03-12T00:00:00.000Z",
      last_seen_at: "2026-03-12T00:00:00.000Z",
      occurrence_count: input.includeRequest ? 2 : 1,
      source_event_types: input.includeRequest
        ? ["backend_exception", "request_event"]
        : ["backend_exception"]
    },
    summary: {
      title: "Checkout request failed",
      description: "Checkout request failed",
      likely_cause: null,
      confidence: 0.75,
      recommended_action: null,
      severity: "high",
      error_type: null,
      error_message: null,
      first_application_frame: null,
      primary_signal: input.includeRequest ? "request_event" : "exception",
      signals: {
        new_deploy: false,
        regression_suspected: false,
        customer_visible: false
      }
    },
    impact: {
      affected_users_estimate: 1,
      affected_requests_estimate: 1,
      business_criticality: "high",
      customer_visible: false,
      regression_suspected: false
    },
    context: {
      error: null,
      request: input.includeRequest
        ? {
            version: 1,
            method: "POST",
            path: "/checkout",
            route_template: "/checkout",
            query: {
              coupon: "SAVE10"
            },
            headers: {
              "content-type": "application/json"
            },
            body: {
              amount: 42
            },
            request_id: "req_123"
          }
        : null,
      response: input.includeRequest
        ? {
            version: 1,
            status_code: 500,
            duration_ms: 120
          }
        : null,
      logs: null,
      frontend: null,
      environment: null,
      deploy: null,
      runtime: null,
      git: null,
      dependencies: null,
      probe_data: {
        version: 1,
        items: []
      },
      device: null
    },
    reproduction: {
      possible: false,
      confidence: 0,
      reason: "reproduction_not_generated",
      artifacts: null,
      feasibility_reference: null
    },
    verification: {
      verification_type: null,
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      self: null,
      reproduction: null,
      incident: null,
      project: null,
      docs: null
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      generator_version: "bundle-engine@0.1.0",
      generation_number: input.includeRequest ? 2 : 1
    }
  });
}
