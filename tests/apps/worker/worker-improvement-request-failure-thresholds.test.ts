import { describe, expect, it, vi } from "vitest";

import { maybeGenerateHostedImprovementBundle } from "../../../apps/worker/src/improvement-bundles.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    getImprovementExecutionSettings: vi.fn().mockResolvedValue({
      plan: "team",
      automated_improvement_bundles_enabled: true,
      improvement_bundle_sensitivity: "high_confidence"
    }),
    listImprovementsForOrganization: vi.fn(),
    getImprovementForOrganization: vi.fn(),
    resolveImprovementForOrganization: vi.fn(),
    reopenImprovementForOrganization: vi.fn(),
    recordWarningHotspot: vi.fn(),
    recordRequestPattern: vi.fn().mockResolvedValue({
      opportunity_id: "imp_request_failure",
      occurrence_count: 1,
      bundle_generation_number: 0,
      should_generate_bundle: false
    }),
    getImprovementBundleBuildContext: vi.fn(),
    listImprovementEventReferences: vi.fn(),
    hasImprovementBundleGenerationForSourceEvent: vi.fn(),
    reserveImprovementBundleGeneration: vi.fn(),
    markImprovementBundleGenerationFailure: vi.fn(),
    pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

describe("worker improvement request-failure thresholds", () => {
  it("records first request-failure candidates below the high-confidence threshold as low-confidence metadata only", async () => {
    const store = createStore();
    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: createEventEnvelope({
        event_id: "00000000-0000-0000-0000-000000000801",
        event_type: "request_event",
        occurred_at: "2026-05-18T12:00:00.000Z",
        service: {
          name: "checkout-api",
          environment: "production"
        },
        payload: {
          method: "GET",
          path: "/missing-product",
          query: {},
          headers: {},
          body: null,
          response_status: 404,
          duration_ms: 42,
          route_template: "/missing-product"
        }
      }),
      normalized: {
        event_type: "request_event",
        environment: "production",
        error_type: null,
        normalized_message: "request GET /missing-product",
        route_template: "/missing-product",
        http_method: "GET",
        http_status: 404,
        top_frames: [],
        payload: {}
      },
      event_class: "context_signal",
      dependencies: {
        improvementOpportunityStore: store,
        objectStore: {
          getObject: vi.fn()
        }
      }
    });

    expect(store.recordRequestPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "request_failure_pattern",
        severity: "medium",
        confidence: 0.57,
        threshold: 10
      })
    );
    expect(store.reserveImprovementBundleGeneration).not.toHaveBeenCalled();
  });

  it("does not create high-confidence request-failure candidates for common external probe 404s", async () => {
    const store = createStore();
    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: createEventEnvelope({
        event_id: "00000000-0000-0000-0000-000000000802",
        event_type: "request_event",
        occurred_at: "2026-05-18T12:00:00.000Z",
        service: {
          name: "checkout-api",
          environment: "production"
        },
        payload: {
          method: "GET",
          path: "/wp-admin",
          query: {},
          headers: {},
          body: null,
          response_status: 404,
          duration_ms: 30,
          route_template: "/wp-admin"
        }
      }),
      normalized: {
        event_type: "request_event",
        environment: "production",
        error_type: null,
        normalized_message: "request GET /wp-admin",
        route_template: "/wp-admin",
        http_method: "get",
        http_status: 404,
        top_frames: [],
        payload: {}
      },
      event_class: "context_signal",
      dependencies: {
        improvementOpportunityStore: store,
        objectStore: {
          getObject: vi.fn()
        }
      }
    });

    expect(store.recordRequestPattern).not.toHaveBeenCalled();
  });
});
