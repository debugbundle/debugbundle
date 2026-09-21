import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("historical worker event privacy", () => {
  it("re-scrubs old raw events before persisting derived records or jobs", async () => {
    const event = createEventEnvelope({
      event_type: "log_event", service: { name: "legacy", environment: "test" },
      context: { password: "HISTORICAL_SECRET" },
      payload: { level: "error", message: "Authorization: Bearer HISTORICAL_SECRET", attributes: {} }
    });
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({ project_id: "proj_123", event_id: event.event_id, object_key: "raw-events/proj_123/old.json.gz" })
    };
    const upsertProcessedEvent = vi.fn().mockResolvedValue(undefined);
    const result = await processNextNormalizeEventsJob({
      queue,
      objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8"))) },
      processedEventStore: { upsertProcessedEvent }
    });
    expect(result).toEqual({ processed: true });
    expect(JSON.stringify(upsertProcessedEvent.mock.calls)).not.toContain("HISTORICAL_SECRET");
    expect(JSON.stringify(queue.enqueue.mock.calls)).not.toContain("HISTORICAL_SECRET");
  });
});
