import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsOpportunitySchedulerStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

describe("analytics opportunity scheduler store", () => {
  it("lists enabled projects with recent aggregate activity in stable cursor order", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { project_id: "22222222-2222-4222-8222-222222222222" },
        { project_id: "33333333-3333-4333-8333-333333333333" }
      ]
    });
    const store = createPostgresAnalyticsOpportunitySchedulerStore({
      query: query as Queryable["query"]
    });

    await expect(
      store.listProjectsForOpportunityEvaluation({
        cursor: "11111111-1111-4111-8111-111111111111",
        limit: 25,
        occurred_at: "2026-03-10T13:45:27.000Z"
      })
    ).resolves.toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ]);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM project_analytics_settings settings"),
      [
        "11111111-1111-4111-8111-111111111111",
        "2026-03-04T00:00:00.000Z",
        "2026-03-11T00:00:00.000Z",
        25
      ]
    );
    expect(String(query.mock.calls[0]?.[0])).toContain("settings.enabled = true");
    expect(String(query.mock.calls[0]?.[0])).toContain("analytics_session_rollups");
  });

  it("does not query when the scheduled timestamp is invalid", async (): Promise<void> => {
    const query = vi.fn();
    const store = createPostgresAnalyticsOpportunitySchedulerStore({
      query: query as Queryable["query"]
    });

    await expect(
      store.listProjectsForOpportunityEvaluation({
        cursor: null,
        limit: 25,
        occurred_at: "invalid"
      })
    ).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });
});
