import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsOpportunityEvaluator,
  evaluateAnalyticsFunnelDropoffOpportunities,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("analytics opportunity evaluator", () => {
  it("creates or updates funnel-dropoff opportunities from aggregate funnel rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_funnel_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          20,
          10,
          0.4,
          5
        ]);
        return {
          rows: [{
            service: "web",
            environment: "production",
            funnel_key: "checkout",
            step_key: "payment",
            step_order: 2,
            sessions_entered: "100",
            sessions_completed: "35",
            dropoffs: "65"
          }]
        };
      }

      if (sqlText.includes("INSERT INTO analytics_opportunities")) {
        expect(sqlText).toContain("ON CONFLICT (project_id, fingerprint)");
        expect(params[1]).toBe(PROJECT_ID);
        expect(params[2]).toBe("web");
        expect(params[3]).toBe("production");
        expect(params[4]).toBe("high");
        expect(params[6]).toBe("analytics-opportunity.v1:funnel_dropoff:11111111-1111-4111-8111-111111111111:web:production:checkout:payment");
        expect(params[10]).toBe("2026-03-11T00:00:00.000Z");
        expect(JSON.parse(String(params[9]))).toMatchObject({
          funnel_key: "checkout",
          step_key: "payment",
          sessions_entered: 100,
          sessions_completed: 35,
          dropoffs: 65,
          dropoff_rate: 0.65
        });
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      throw new Error(`Unhandled evaluator SQL: ${sqlText}`);
    });

    const evaluator = createPostgresAnalyticsOpportunityEvaluator({ query: queryMock as Queryable["query"] });

    await expect(
      evaluator.evaluateProjectOpportunities({
        project_id: PROJECT_ID,
        occurred_at: "2026-03-10T13:45:27.000Z",
        service: "web",
        environment: "production"
      })
    ).resolves.toEqual({ opportunities_created_or_updated: 1 });

    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("does not create opportunities when no aggregate candidate crosses thresholds", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      expect(sqlText).toContain("FROM analytics_funnel_rollups");
      return { rows: [] };
    });

    await expect(
      evaluateAnalyticsFunnelDropoffOpportunities(
        { query: queryMock as Queryable["query"] },
        {
          project_id: PROJECT_ID,
          occurred_at: "2026-03-10T13:45:27.000Z"
        }
      )
    ).resolves.toEqual({ opportunities_created_or_updated: 0 });

    expect(queryMock).toHaveBeenCalledOnce();
  });
});
