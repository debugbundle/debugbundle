import { describe, expect, it, vi } from "vitest";

import {
  processNextEvaluateAnalyticsOpportunitiesJob,
  scheduleAnalyticsOpportunityEvaluation
} from "../../../apps/worker/src/analytics-opportunity-evaluation.js";

describe("worker analytics opportunity evaluation", () => {
  it("acquires a bounded lease before enqueuing a scheduled evaluation pass", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const acquireLease = vi.fn().mockResolvedValue(true);

    await expect(
      scheduleAnalyticsOpportunityEvaluation({
        queue: { enqueue, acquireLease },
        intervalMs: 6 * 60 * 60 * 1000,
        now: new Date("2026-03-10T13:45:27.000Z")
      })
    ).resolves.toBe(true);

    expect(acquireLease).toHaveBeenCalledWith(
      "leases:analytics-opportunities:schedule",
      6 * 60 * 60
    );
    expect(enqueue).toHaveBeenCalledWith("evaluate-analytics-opportunities", {
      scheduled_at: "2026-03-10T13:45:27.000Z",
      cursor: null
    });
  });

  it("does not enqueue a duplicate scheduled pass while the lease is held", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    await expect(
      scheduleAnalyticsOpportunityEvaluation({
        queue: { enqueue, acquireLease: vi.fn().mockResolvedValue(false) },
        intervalMs: 6 * 60 * 60 * 1000
      })
    ).resolves.toBe(false);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("evaluates one bounded project batch and queues a deterministic continuation", async (): Promise<void> => {
    const dequeue = vi.fn().mockResolvedValue({
      scheduled_at: "2026-03-10T13:45:27.000Z",
      cursor: null
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const listProjectsForOpportunityEvaluation = vi.fn().mockResolvedValue([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ]);
    const evaluateProjectOpportunities = vi.fn().mockResolvedValue({
      opportunities_created_or_updated: 1
    });

    await expect(
      processNextEvaluateAnalyticsOpportunitiesJob({
        queue: { dequeue, enqueue },
        projectStore: { listProjectsForOpportunityEvaluation },
        opportunityEvaluator: { evaluateProjectOpportunities },
        batchSize: 2
      })
    ).resolves.toEqual({ processed: true });

    expect(listProjectsForOpportunityEvaluation).toHaveBeenCalledWith({
      cursor: null,
      limit: 2,
      occurred_at: "2026-03-10T13:45:27.000Z"
    });
    expect(evaluateProjectOpportunities).toHaveBeenNthCalledWith(1, {
      project_id: "11111111-1111-4111-8111-111111111111",
      occurred_at: "2026-03-10T13:45:27.000Z"
    });
    expect(evaluateProjectOpportunities).toHaveBeenNthCalledWith(2, {
      project_id: "22222222-2222-4222-8222-222222222222",
      occurred_at: "2026-03-10T13:45:27.000Z"
    });
    expect(enqueue).toHaveBeenCalledWith("evaluate-analytics-opportunities", {
      scheduled_at: "2026-03-10T13:45:27.000Z",
      cursor: "22222222-2222-4222-8222-222222222222"
    });
  });

  it("does not queue a continuation when the final project batch is partial", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const evaluateProjectOpportunities = vi.fn().mockResolvedValue({
      opportunities_created_or_updated: 0
    });

    await expect(
      processNextEvaluateAnalyticsOpportunitiesJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue({
            scheduled_at: "2026-03-10T13:45:27.000Z",
            cursor: "11111111-1111-4111-8111-111111111111"
          }),
          enqueue
        },
        projectStore: {
          listProjectsForOpportunityEvaluation: vi.fn().mockResolvedValue([
            "22222222-2222-4222-8222-222222222222"
          ])
        },
        opportunityEvaluator: { evaluateProjectOpportunities },
        batchSize: 2
      })
    ).resolves.toEqual({ processed: true });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns no_jobs without querying or evaluating when the queue is empty", async (): Promise<void> => {
    const listProjectsForOpportunityEvaluation = vi.fn();
    const evaluateProjectOpportunities = vi.fn();

    await expect(
      processNextEvaluateAnalyticsOpportunitiesJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue(null),
          enqueue: vi.fn()
        },
        projectStore: { listProjectsForOpportunityEvaluation },
        opportunityEvaluator: { evaluateProjectOpportunities }
      })
    ).resolves.toEqual({ processed: false, reason: "no_jobs" });

    expect(listProjectsForOpportunityEvaluation).not.toHaveBeenCalled();
    expect(evaluateProjectOpportunities).not.toHaveBeenCalled();
  });
});
