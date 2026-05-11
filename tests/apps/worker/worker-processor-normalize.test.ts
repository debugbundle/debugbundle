import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor.js";

describe("worker processor \u2013 normalize-events", () => {
  it("should process next normalize-events job and persist processed event", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
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

    const objectStore = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
    };

    const processedEventStore = {
      upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore,
      processedEventStore
    });

    expect(result.processed).toBe(true);
    expect(processedEventStore.upsertProcessedEvent).toHaveBeenCalledOnce();
    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({
        project_id: "proj_123",
        event_id: event.event_id,
        event_type: "log_event",
        severity: "low"
      })
    );
  });

  it("should assign high severity for exception event types during normalization", async (): Promise<void> => {
    const event = createEventEnvelope({
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
        stack: "TypeError: boom\n    at checkout (/srv/app.js:1:1)",
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

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: event.event_id,
        object_key: "raw-events/proj_123/file.json.gz"
      })
    };

    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({
        severity: "high",
        event_type: "backend_exception",
        fingerprint_version: "v1",
        matched_fields: [
          "environment",
          "normalized_message",
          "error_type",
          "route_template",
          "top_frames",
          "http_method",
          "http_status"
        ]
      })
    );
  });

  it("should assign medium severity for error_suppressed events during normalization", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "error_suppressed",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        fingerprint: "fp_123",
        suppressed_count: 2,
        window_seconds: 30,
        first_seen: "2026-03-11T00:00:00.000Z",
        last_seen: "2026-03-11T00:00:30.000Z"
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

    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ severity: "medium", event_type: "error_suppressed" })
    );
  });

  it("should return no_jobs when queue is empty", async (): Promise<void> => {
    const result = await processNextNormalizeEventsJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      objectStore: {
        getObject: vi.fn()
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should return invalid_event when stored payload cannot be validated", async (): Promise<void> => {
    const invalidPayload = {
      event_type: "nope"
    };

    const result = await processNextNormalizeEventsJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: "00000000-0000-0000-0000-000000000000",
          object_key: "raw-events/proj_123/invalid.json.gz"
        })
      },
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(invalidPayload), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "invalid_event" });
  });

  it("does not enqueue group-incident when the event was already normalized", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
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

    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn().mockResolvedValue({ inserted: false })
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("should canonicalize volatile message tokens before enqueueing group-incident", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message:
          "failure id 550e8400-e29b-41d4-a716-446655440000 user jane@example.com at 2026-03-10T10:10:10.000Z from 10.23.45.67 hash deadbeefcafebabe",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
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

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: event.event_id,
        object_key: "raw-events/proj_123/file.json.gz"
      })
    };

    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
      },
      processedEventStore: {
        upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({
        normalized_message: "failure id {dynamic} user {dynamic} at {dynamic} from {dynamic} hash {dynamic}"
      })
    );
  });

  it("should normalize query/hash route noise before enqueueing group-incident", async (): Promise<void> => {
    const queueA = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "d4f8f8c1-2dd9-4e9d-8c7b-20a3f1e58d11",
        object_key: "raw-events/proj_123/file-a.json.gz"
      })
    };

    const queueB = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "a89c1991-3273-4f5f-a040-1854ef078ca9",
        object_key: "raw-events/proj_123/file-b.json.gz"
      })
    };

    const eventA = createEventEnvelope({
      event_id: "d4f8f8c1-2dd9-4e9d-8c7b-20a3f1e58d11",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123/orders/456?expand=items#details",
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

    const eventB = createEventEnvelope({
      event_id: "a89c1991-3273-4f5f-a040-1854ef078ca9",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/999/orders/888?expand=payments#summary",
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

    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventA), "utf8")))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventB), "utf8")))
    };

    const processedEventStore = {
      upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
    };

    const resultA = await processNextNormalizeEventsJob({ queue: queueA, objectStore, processedEventStore });
    const resultB = await processNextNormalizeEventsJob({ queue: queueB, objectStore, processedEventStore });

    expect(resultA).toEqual({ processed: true });
    expect(resultB).toEqual({ processed: true });

    const payloadA = queueA.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };
    const payloadB = queueB.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };

    expect(payloadA.matched_fields).toContain("route_template");
    expect(payloadB.matched_fields).toContain("route_template");
    expect(payloadA.fingerprint).toBe(payloadB.fingerprint);
  });

  it("should normalize percent-encoded route segments before enqueueing group-incident", async (): Promise<void> => {
    const queueA = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "a895ab4d-2fcb-4f1d-a3fb-312f587afe18",
        object_key: "raw-events/proj_123/file-encoded.json.gz"
      })
    };

    const queueB = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "35b78287-b813-4663-ab87-c9a55ed8d5a0",
        object_key: "raw-events/proj_123/file-plain.json.gz"
      })
    };

    const eventA = createEventEnvelope({
      event_id: "a895ab4d-2fcb-4f1d-a3fb-312f587afe18",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%31%32%33/orders/%34%35%36",
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

    const eventB = createEventEnvelope({
      event_id: "35b78287-b813-4663-ab87-c9a55ed8d5a0",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/999/orders/888",
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

    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventA), "utf8")))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventB), "utf8")))
    };

    const processedEventStore = {
      upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
    };

    const resultA = await processNextNormalizeEventsJob({ queue: queueA, objectStore, processedEventStore });
    const resultB = await processNextNormalizeEventsJob({ queue: queueB, objectStore, processedEventStore });

    expect(resultA).toEqual({ processed: true });
    expect(resultB).toEqual({ processed: true });

    const payloadA = queueA.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };
    const payloadB = queueB.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };

    expect(payloadA.matched_fields).toContain("route_template");
    expect(payloadB.matched_fields).toContain("route_template");
    expect(payloadA.fingerprint).toBe(payloadB.fingerprint);
  });

  it("should normalize malformed percent-encoded route segments before enqueueing group-incident", async (): Promise<void> => {
    const queueA = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "7deed47d-6b79-4d7b-bcb4-5f542264507c",
        object_key: "raw-events/proj_123/file-malformed-a.json.gz"
      })
    };

    const queueB = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "a2bff398-28b5-47e8-b646-1c7514dc2f4e",
        object_key: "raw-events/proj_123/file-malformed-b.json.gz"
      })
    };

    const eventA = createEventEnvelope({
      event_id: "7deed47d-6b79-4d7b-bcb4-5f542264507c",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%31%32%/orders/%34%35%",
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

    const eventB = createEventEnvelope({
      event_id: "a2bff398-28b5-47e8-b646-1c7514dc2f4e",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%39%39%/orders/%38%38%",
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

    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventA), "utf8")))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventB), "utf8")))
    };

    const processedEventStore = {
      upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
    };

    const resultA = await processNextNormalizeEventsJob({ queue: queueA, objectStore, processedEventStore });
    const resultB = await processNextNormalizeEventsJob({ queue: queueB, objectStore, processedEventStore });

    expect(resultA).toEqual({ processed: true });
    expect(resultB).toEqual({ processed: true });

    const payloadA = queueA.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };
    const payloadB = queueB.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };

    expect(payloadA.matched_fields).toContain("route_template");
    expect(payloadB.matched_fields).toContain("route_template");
    expect(payloadA.fingerprint).toBe(payloadB.fingerprint);
  });

  it("should normalize encoded slash-bearing route segments before enqueueing group-incident", async (): Promise<void> => {
    const queueA = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "d29b4461-3590-4ed6-b4a0-fd638fcde839",
        object_key: "raw-events/proj_123/file-encoded-slash-a.json.gz"
      })
    };

    const queueB = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "22a87734-222b-46c7-a4ab-64748aa429b4",
        object_key: "raw-events/proj_123/file-encoded-slash-b.json.gz"
      })
    };

    const eventA = createEventEnvelope({
      event_id: "d29b4461-3590-4ed6-b4a0-fd638fcde839",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/abc%2Fdef/orders/123",
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

    const eventB = createEventEnvelope({
      event_id: "22a87734-222b-46c7-a4ab-64748aa429b4",
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n    at checkout (/srv/app.js:1:1)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/xyz%2Fuvw/orders/999",
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

    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventA), "utf8")))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(eventB), "utf8")))
    };

    const processedEventStore = {
      upsertProcessedEvent: vi.fn().mockResolvedValue(undefined)
    };

    const resultA = await processNextNormalizeEventsJob({ queue: queueA, objectStore, processedEventStore });
    const resultB = await processNextNormalizeEventsJob({ queue: queueB, objectStore, processedEventStore });

    expect(resultA).toEqual({ processed: true });
    expect(resultB).toEqual({ processed: true });

    const payloadA = queueA.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };
    const payloadB = queueB.enqueue.mock.calls[0]?.[1] as { fingerprint: string; matched_fields: string[] };

    expect(payloadA.matched_fields).toContain("route_template");
    expect(payloadB.matched_fields).toContain("route_template");
    expect(payloadA.fingerprint).toBe(payloadB.fingerprint);
  });

  it("should classify backend_exception as incident_signal", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom\n    at fn (/srv/app.js:1:1)",
        handled: false,
        request: { method: "GET", path: "/", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "24.0.0" }
      }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "incident_signal" })
    );
  });

  it("should classify log_event with error level as incident_signal", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "log_event",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: { level: "error", message: "db fail", attributes: {} }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "incident_signal" })
    );
  });

  it("should classify 5xx request_event as incident_signal with high severity", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "request_event",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        method: "POST",
        path: "/v1/billing/checkout",
        query: {},
        headers: {},
        response_status: 503,
        duration_ms: 42
      }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "incident_signal", severity: "high" })
    );
  });

  it("should classify non-5xx request_event as context_signal with low severity", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "request_event",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        method: "GET",
        path: "/v1/billing/checkout",
        query: {},
        headers: {},
        response_status: 404,
        duration_ms: 12
      }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "context_signal", severity: "low" })
    );
  });

  it("should classify log_event with info level as context_signal", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "log_event",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: { level: "info", message: "startup", attributes: {} }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "context_signal" })
    );
  });

  it("should classify error_suppressed as operational_signal", async (): Promise<void> => {
    const event = createEventEnvelope({
      event_type: "error_suppressed",
      service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
      payload: {
        fingerprint: "fp_1",
        suppressed_count: 5,
        window_seconds: 60,
        first_seen: "2026-03-11T00:00:00.000Z",
        last_seen: "2026-03-11T00:01:00.000Z"
      }
    });

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_1",
        event_id: event.event_id,
        object_key: "raw-events/proj_1/file.json.gz"
      })
    };

    await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
    });

    expect(queue.enqueue).toHaveBeenCalledWith(
      "group-incident",
      expect.objectContaining({ event_class: "operational_signal" })
    );
  });

});
