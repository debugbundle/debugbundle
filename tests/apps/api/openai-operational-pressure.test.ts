import { describe, expect, it, vi } from "vitest";
import {
  createApiDogfoodingOpenAiMonitor,
  sanitizeApiDogfoodingEvent
} from "../../../apps/api/src/dogfooding.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("OpenAI operational pressure reporting", () => {
  it("bounds 10000 admission rejections to one sustained-pressure report per kind and minute", () => {
    let now = 0;
    const captureError = vi.fn();
    const monitor = createApiDogfoodingOpenAiMonitor({ captureError }, () => now);
    for (let i = 0; i < 10_000; i++) {
      monitor({
        category: "mcp_admission_rejected",
        method: i % 2 ? "initialize" : "tools/call",
        tool: "get_bundle",
        status: 503,
        admission: "capacity_rejected"
      });
    }
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError.mock.calls[0]?.[0].message).toBe(
      "openai_mcp_admission_pressure admission=capacity_rejected threshold=10 window_seconds=60"
    );
    now = 60_001;
    for (let i = 0; i < 9; i++)
      monitor({
        category: "mcp_admission_rejected",
        method: "initialize",
        status: 503,
        admission: "capacity_rejected"
      });
    expect(captureError).toHaveBeenCalledTimes(1);
    monitor({
      category: "mcp_admission_rejected",
      method: "initialize",
      status: 503,
      admission: "capacity_rejected"
    });
    expect(captureError).toHaveBeenCalledTimes(2);
  });

  it("keeps isolated admission/host rejections out of incidents but reports actual failures immediately", () => {
    const captureError = vi.fn();
    const monitor = createApiDogfoodingOpenAiMonitor({ captureError });
    monitor({
      category: "mcp_admission_rejected",
      method: "initialize",
      status: 429,
      admission: "rate_limited"
    });
    monitor({
      category: "mcp_request_failure",
      method: "initialize",
      status: 421,
      admission: "canonical_host_rejected"
    });
    expect(captureError).not.toHaveBeenCalled();
    monitor({
      category: "mcp_request_failure",
      method: "tools/call",
      tool: "get_bundle",
      status: 500,
      admission: "allowed"
    });
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("omits the generic MCP HTTP duplicate before request data can leave the API", () => {
    const event = createEventEnvelope({
      event_type: "request_event",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        method: "POST",
        path: "/mcp",
        query: {},
        headers: {},
        body: { private: "customer-input" },
        response_status: 503,
        duration_ms: 1.5
      }
    });
    expect(sanitizeApiDogfoodingEvent(event)).toBeNull();
    expect(
      sanitizeApiDogfoodingEvent({ ...event, payload: { ...event.payload, path: "/checkout" } })
    ).not.toBeNull();
  });
});
