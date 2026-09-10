import { beforeEach, describe, expect, it, vi } from "vitest";

const { pipeline, quit } = vi.hoisted(() => ({
  pipeline: {
    zadd: vi.fn().mockReturnThis(),
    zremrangebyscore: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    zcount: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([])
  },
  quit: vi.fn().mockResolvedValue("OK")
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn(function () {
    return { multi: () => pipeline, quit };
  })
}));

import { createRedisIncidentFrequencyCounter } from "../../../packages/storage/src/frequency-counter.js";

describe("frequency snapshot cache retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds incident cache cardinality and safely persists again after eviction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const counter = createRedisIncidentFrequencyCounter({
      redisUrl: "redis://unused",
      snapshotStore: { query }
    });
    const record = (id: number, seconds = "00") =>
      counter.recordOccurrence({
        incident_id: `incident-${id}`,
        event_id: `event-${id}-${seconds}`,
        occurred_at: `2026-09-10T12:00:${seconds}.000Z`
      });

    try {
      for (let id = 0; id < 10_000; id++) {
        await record(id);
      }
      expect(query).toHaveBeenCalledTimes(10_000);
      query.mockClear();
      await record(0, "30");
      expect(query).not.toHaveBeenCalled();

      await record(10_000);
      expect(query).toHaveBeenCalledOnce();
      query.mockClear();

      await record(10_000, "30");
      expect(query).not.toHaveBeenCalled();

      await record(0, "30");
      expect(query).toHaveBeenCalledOnce();
      // Eviction is only a throttling-cache miss; durable snapshots stay monotonic.
      expect(query.mock.calls[0]?.[0]).toContain("frequency_snapshot_at <= $10::timestamptz");
      expect(query.mock.calls[0]?.[1]?.[0]).toBe("incident-0");
    } finally {
      await counter.close();
    }
  });

  it("does not cache a snapshot that failed to persist", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("synthetic_db_failure"))
      .mockResolvedValue({ rows: [] });
    const counter = createRedisIncidentFrequencyCounter({
      redisUrl: "redis://unused",
      snapshotStore: { query }
    });
    const event = {
      incident_id: "incident-retry",
      event_id: "event-retry",
      occurred_at: "2026-09-10T12:00:00.000Z"
    };

    try {
      await expect(counter.recordOccurrence(event)).rejects.toThrow("synthetic_db_failure");
      await counter.recordOccurrence(event);
      await counter.recordOccurrence(event);
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      await counter.close();
    }
  });
});
