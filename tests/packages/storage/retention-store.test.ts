import { describe, expect, it, vi } from "vitest";

import {
  buildBundleObjectKey,
  buildReproductionObjectKey,
  createPostgresRetentionStore,
  createRetentionCleanupService
} from "../../../packages/storage/src/index.js";

describe("retention cleanup service", () => {
  it("queries and updates retention records through the postgres store", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ project_id: "proj_123", incident_id: "inc_123" }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresRetentionStore({ query });

    await expect(
      store.listExpiredSampledRawEvents({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([{ project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }]);

    await store.markRawEventsExpired({
      references: [{ project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }]
    });

    await expect(
      store.listExpiredIncidents({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([{ project_id: "proj_123", incident_id: "inc_123" }]);

    await store.deleteExpiredIncidents({
      references: [{ project_id: "proj_123", incident_id: "inc_123" }]
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT\n            i.project_id::text AS project_id"),
      ["2026-04-04T12:00:00.000Z", 14, 30, 7, 25]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE incident_events ie"),
      ["evt_123"]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("SELECT\n            i.project_id::text AS project_id"),
      ["2026-04-04T12:00:00.000Z", 30, 90, 7, 25]
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("DELETE FROM incidents i"),
      ["inc_123"]
    );
  });

  it("skips postgres retention updates when the reference lists are empty", async (): Promise<void> => {
    const query = vi.fn();
    const store = createPostgresRetentionStore({ query });

    await store.markRawEventsExpired({ references: [] });
    await store.deleteExpiredIncidents({ references: [] });

    expect(query).not.toHaveBeenCalled();
  });

  it("returns early when the retention cleanup object store is unavailable", async (): Promise<void> => {
    const listExpiredSampledRawEvents = vi.fn();
    const listExpiredIncidents = vi.fn();

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: {
        listExpiredSampledRawEvents,
        markRawEventsExpired: vi.fn(),
        listExpiredIncidents,
        deleteExpiredIncidents: vi.fn()
      },
      objectStore: {}
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(listExpiredSampledRawEvents).not.toHaveBeenCalled();
    expect(listExpiredIncidents).not.toHaveBeenCalled();
  });

  it("marks raw events expired after successful raw-object cleanup", async (): Promise<void> => {
    const markRawEventsExpired = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: {
        listExpiredSampledRawEvents: vi.fn().mockResolvedValue([
          {
            project_id: "proj_123",
            event_id: "evt_123",
            occurred_at: "2026-04-04T10:00:00.000Z"
          }
        ]),
        markRawEventsExpired,
        listExpiredIncidents: vi.fn().mockResolvedValue([]),
        deleteExpiredIncidents: vi.fn().mockResolvedValue(undefined)
      },
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(markRawEventsExpired).toHaveBeenCalledWith({
      references: [
        {
          project_id: "proj_123",
          event_id: "evt_123",
          occurred_at: "2026-04-04T10:00:00.000Z"
        }
      ]
    });
  });

  it("stops after an empty retention cleanup batch", async (): Promise<void> => {
    const listExpiredSampledRawEvents = vi.fn().mockResolvedValue([]);
    const listExpiredIncidents = vi.fn().mockResolvedValue([]);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: {
        listExpiredSampledRawEvents,
        markRawEventsExpired: vi.fn().mockResolvedValue(undefined),
        listExpiredIncidents,
        deleteExpiredIncidents: vi.fn().mockResolvedValue(undefined)
      },
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 2
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(listExpiredSampledRawEvents).toHaveBeenCalledTimes(1);
    expect(listExpiredIncidents).toHaveBeenCalledTimes(1);
  });

  it("does not delete expired incident metadata when artifact cleanup only partially succeeds", async (): Promise<void> => {
    const deleteObject = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("delete_failed"));
    const deleteExpiredIncidents = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: {
        listExpiredSampledRawEvents: vi.fn().mockResolvedValue([]),
        markRawEventsExpired: vi.fn().mockResolvedValue(undefined),
        listExpiredIncidents: vi.fn().mockResolvedValue([{ project_id: "proj_123", incident_id: "inc_123" }]),
        deleteExpiredIncidents
      },
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).toHaveBeenNthCalledWith(1, {
      key: buildBundleObjectKey("proj_123", "inc_123")
    });
    expect(deleteObject).toHaveBeenNthCalledWith(2, {
      key: buildReproductionObjectKey("proj_123", "inc_123")
    });
    expect(deleteExpiredIncidents).not.toHaveBeenCalled();
  });

  it("deletes expired incident metadata only after bundle and reproduction cleanup both succeed", async (): Promise<void> => {
    const deleteExpiredIncidents = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: {
        listExpiredSampledRawEvents: vi.fn().mockResolvedValue([]),
        markRawEventsExpired: vi.fn().mockResolvedValue(undefined),
        listExpiredIncidents: vi.fn().mockResolvedValue([{ project_id: "proj_123", incident_id: "inc_123" }]),
        deleteExpiredIncidents
      },
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteExpiredIncidents).toHaveBeenCalledWith({
      references: [{ project_id: "proj_123", incident_id: "inc_123" }]
    });
  });
});