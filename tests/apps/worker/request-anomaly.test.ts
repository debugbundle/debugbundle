import { describe, expect, it, vi } from "vitest";

import type { NormalizedEvent } from "../../../packages/event-normalizer/src/index.js";
import { createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { evaluateRequestAnomalyCandidate } from "../../../apps/worker/src/request-anomaly.js";

function createNormalizedEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    event_type: "request_event",
    environment: "production",
    error_type: null,
    normalized_message: "request GET /checkout/:orderId",
    route_template: "/checkout/:orderId",
    http_method: "GET",
    http_status: 404,
    top_frames: [],
    payload: {},
    ...overrides
  };
}

function createRequestEventEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return createEventEnvelope({
    event_id: "00000000-0000-4000-8000-000000000401",
    occurred_at: "2026-03-20T00:00:00.000Z",
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "request_event",
    service: {
      name: "checkout-api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      method: "GET",
      path: "/checkout/123",
      query: {},
      headers: {
        host: "checkout.local"
      },
      response_status: 404,
      duration_ms: 42,
      route_template: "/checkout/:orderId"
    },
    ...overrides
  });
}

describe("request anomaly evaluation", () => {
  it("ignores non-request events", async () => {
    const recordObservation = vi.fn();

    const result = await evaluateRequestAnomalyCandidate({
      event: createEventEnvelope({
        event_id: "00000000-0000-4000-8000-000000000402",
        occurred_at: "2026-03-20T00:00:00.000Z",
        project_id: "00000000-0000-4000-8000-000000000001",
        event_type: "backend_exception",
        service: {
          name: "checkout-api",
          environment: "production",
          runtime: "node",
          framework: "fastify"
        },
        payload: {
          name: "TypeError",
          message: "boom",
          stack: "TypeError: boom",
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
            version: "24.0.0"
          }
        }
      }),
      normalized: createNormalizedEvent({ event_type: "backend_exception" }),
      project_id: "proj_123",
      capture_preset: "balanced",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("skips contextual request failures when the preset has no anomaly threshold", async () => {
    const recordObservation = vi.fn();

    const result = await evaluateRequestAnomalyCandidate({
      event: createRequestEventEnvelope(),
      normalized: createNormalizedEvent(),
      project_id: "proj_123",
      capture_preset: "minimal",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("records observations but returns null when the anomaly threshold is not crossed", async () => {
    const recordObservation = vi.fn().mockResolvedValue({
      occurrences_1m: 2,
      occurrences_5m: 10,
      occurrences_1h: 50,
      occurrences_24h: 50,
      baseline_1h_per_5m: 4,
      spike_ratio_5m_to_1h: 2.5,
      has_sufficient_baseline: true,
      is_spiking: false
    });

    const result = await evaluateRequestAnomalyCandidate({
      event: createRequestEventEnvelope(),
      normalized: createNormalizedEvent(),
      project_id: "proj_123",
      capture_preset: "balanced",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).toHaveBeenCalledWith({
      anomaly_key: "proj_123:balanced:checkout-api:production:GET:/checkout/:orderId:404",
      event_id: "00000000-0000-4000-8000-000000000401",
      occurred_at: "2026-03-20T00:00:00.000Z"
    });
  });

  it("returns a request anomaly job when the threshold is crossed", async () => {
    const recordObservation = vi.fn().mockResolvedValue({
      occurrences_1m: 6,
      occurrences_5m: 24,
      occurrences_1h: 30,
      occurrences_24h: 30,
      baseline_1h_per_5m: 2.5,
      spike_ratio_5m_to_1h: 4,
      has_sufficient_baseline: true,
      is_spiking: true
    });

    const result = await evaluateRequestAnomalyCandidate({
      event: createRequestEventEnvelope(),
      normalized: createNormalizedEvent(),
      project_id: "proj_123",
      capture_preset: "balanced",
      fingerprint_version: "v2",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toEqual({
      project_id: "proj_123",
      event_id: "00000000-0000-4000-8000-000000000401",
      event_type: "request_event",
      event_class: "context_signal",
      incident_trigger: "request_anomaly",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: expect.any(String),
      fingerprint_version: "v2",
      normalized_message: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
      matched_fields: ["request_anomaly", "route_template", "http_method", "http_status", "environment"],
      occurred_at: "2026-03-20T00:00:00.000Z",
      severity: "medium"
    });
  });
});