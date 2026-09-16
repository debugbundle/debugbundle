import { gzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor-normalize.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

it("carries resource identity, title, severity and a sanitized route into durable grouping", async () => {
  const event = browserResourceEvent({ route: "/e/aBcdEF12gh34IJ56?token=secret" });
  const queue = {
    dequeue: vi
      .fn()
      .mockResolvedValue({ project_id: "proj_test", event_id: event.event_id, object_key: "raw" }),
    enqueue: vi.fn().mockResolvedValue(undefined)
  };
  await processNextNormalizeEventsJob({
    queue,
    objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(JSON.stringify(event))) },
    processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
  });
  expect(queue.enqueue).toHaveBeenCalledWith(
    "group-incident",
    expect.objectContaining({
      fingerprint_version: "v3",
      incident_title: "Google Tag Manager script failed to load",
      normalized_message: "Browser resource load error",
      resource_route: "/e/{param}",
      severity: "medium"
    })
  );
  expect(JSON.stringify(queue.enqueue.mock.calls)).not.toMatch(/secret|aBcdEF12/);
});
