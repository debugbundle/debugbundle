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

  it("does not record unpromoted 404 observations for anomaly incidents", async () => {
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
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("skips low-value external probe 404 routes before anomaly counting", async () => {
    const recordObservation = vi.fn();

    const result = await evaluateRequestAnomalyCandidate({
      event: createRequestEventEnvelope({
        payload: {
          method: "GET",
          path: "/wp-config.php_old2024",
          query: {},
          headers: {
            host: "203.0.113.10"
          },
          response_status: 404,
          duration_ms: 42,
          route_template: "/wp-config.php_old2024"
        }
      }),
      normalized: createNormalizedEvent({
        normalized_message: "request GET /wp-config.php_old2024",
        route_template: "/wp-config.php_old2024"
      }),
      project_id: "proj_123",
      capture_preset: "investigative",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("skips generic login probes only when the request targets a direct IP host", async () => {
    const recordObservation = vi.fn();

    const result = await evaluateRequestAnomalyCandidate({
      event: createRequestEventEnvelope({
        payload: {
          method: "GET",
          path: "/login",
          query: {},
          headers: {
            host: "203.0.113.10"
          },
          response_status: 404,
          duration_ms: 42,
          route_template: "/login"
        }
      }),
      normalized: createNormalizedEvent({
        normalized_message: "request GET /login",
        route_template: "/login"
      }),
      project_id: "proj_123",
      capture_preset: "investigative",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("keeps normal app login 404s out of request anomaly incidents unless explicitly promoted upstream", async () => {
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
      event: createRequestEventEnvelope({
        payload: {
          method: "GET",
          path: "/login",
          query: {},
          headers: {
            host: "app.example.test"
          },
          response_status: 404,
          duration_ms: 42,
          route_template: "/login"
        }
      }),
      normalized: createNormalizedEvent({
        normalized_message: "request GET /login",
        route_template: "/login"
      }),
      project_id: "proj_123",
      capture_preset: "investigative",
      fingerprint_version: "v1",
      requestAnomalyCounter: {
        recordObservation
      }
    });

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });

  it("does not return a request anomaly job for repeated unpromoted 404s even when counters would cross the old threshold", async () => {
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

    expect(result).toBeNull();
    expect(recordObservation).not.toHaveBeenCalled();
  });
});
