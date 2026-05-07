import { describe, expect, it, vi } from "vitest";

import { processNextCleanupRetentionJob } from "../../../apps/worker/src/processor.js";

describe("worker retention cleanup processor", () => {
  it("should return no_jobs when the cleanup-retention queue is empty", async (): Promise<void> => {
    const result = await processNextCleanupRetentionJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue(null)
      },
      retentionCleanupRunner: {
        runCleanup: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should execute the retention cleanup runner for queued cleanup-retention work", async (): Promise<void> => {
    const runCleanup = vi.fn().mockResolvedValue(undefined);

    const result = await processNextCleanupRetentionJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue({ scheduled_at: "2026-04-04T12:00:00.000Z" })
      },
      retentionCleanupRunner: {
        runCleanup
      }
    });

    expect(runCleanup).toHaveBeenCalledWith({ scheduled_at: "2026-04-04T12:00:00.000Z" });
    expect(result).toEqual({ processed: true });
  });
});