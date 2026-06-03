import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor.js";
import { inferSeverity } from "../../../apps/worker/src/severity.js";

describe("worker severity inference", () => {
  it("keeps backend and non-opaque frontend exceptions high severity", (): void => {
    const backendException = createEventEnvelope({
      event_type: "backend_exception",
      service: { name: "checkout-api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: { method: "GET", path: "/checkout", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "24.0.0" }
      }
    });

    const frontendException = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
      payload: {
        name: "TypeError",
        message: "Cannot read properties of undefined",
        stack: "TypeError: Cannot read properties of undefined\n    at App (https://example.com/app.js:10:5)",
        route: "/checkout",
        browser: { name: "Chrome", version: "125.0.0.0" }
      }
    });

    expect(inferSeverity(backendException)).toBe("high");
    expect(inferSeverity(frontendException)).toBe("high");
  });

  it("downgrades opaque browser-native frontend exceptions by confidence", (): void => {
    const opaqueWindowError = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
      payload: {
        name: "Error",
        message: "Window error",
        stack: "Error: Window error",
        route: "/checkout",
        browser: { name: "Chrome", version: "125.0.0.0" },
        browser_event: {
          kind: "window_error",
          message: "Script error.",
          file_name: null,
          line_number: null,
          column_number: null,
          target: null,
          opaque: true
        }
      }
    });

    const opaqueResourceError = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
      payload: {
        name: "ResourceLoadError",
        message: "Failed to load resource",
        stack: "ResourceLoadError: Failed to load resource",
        route: "/checkout",
        browser: { name: "Chrome", version: "125.0.0.0" },
        browser_event: {
          kind: "resource_error",
          message: "Failed to load resource",
          file_name: "https://cdn.example.com/app.css",
          line_number: null,
          column_number: null,
          target: {
            tag_name: "LINK",
            source_url: "https://cdn.example.com/app.css"
          },
          opaque: true
        }
      }
    });

    expect(inferSeverity(opaqueWindowError)).toBe("low");
    expect(inferSeverity(opaqueResourceError)).toBe("medium");
  });

  it("enqueues opaque window errors below high severity during normalization", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "production", runtime: "browser", framework: "wordpress" },
      payload: {
        name: "Error",
        message: "Window error",
        stack: "Error: Window error",
        route: "/checkout",
        browser: { name: "Chrome", version: "125.0.0.0" },
        browser_event: {
          kind: "window_error",
          message: "Script error.",
          file_name: null,
          line_number: null,
          column_number: null,
          target: null,
          opaque: true
        }
      }
    });
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: event.event_id,
        object_key: "raw-events/proj_123/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_type: "frontend_exception", severity: "low" })
    );
  });
});
