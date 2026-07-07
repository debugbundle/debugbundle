import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsMetricsStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("analytics metrics store", () => {
  it("reads aggregate usage summary and bounded breakdowns from analytics rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_session_rollups") && sqlText.includes("SUM(new_visitors)")) {
        return {
          rows: [{
            sessions: "12",
            pageviews: "30",
            new_visitors: "4",
            returning_visitors: "3",
            exits: "2"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_action_rollups")) {
        return { rows: [{ conversions: "5" }] };
      }

      if (sqlText.includes("GROUP BY value")) {
        expect(params.at(-1)).toBe(3);
        if (sqlText.includes("device_type")) {
          return { rows: [{ value: "desktop", sessions: "9", pageviews: "20" }] };
        }
        if (sqlText.includes("browser_family")) {
          return { rows: [{ value: "Chrome", sessions: "7", pageviews: "18" }] };
        }
        if (sqlText.includes("os_family")) {
          return { rows: [{ value: "macOS", sessions: "6", pageviews: "16" }] };
        }
        if (sqlText.includes("language")) {
          return { rows: [{ value: "en", sessions: "10", pageviews: "25" }] };
        }
        if (sqlText.includes("referrer_domain")) {
          return { rows: [{ value: "google.com", sessions: "5", pageviews: "12" }] };
        }
        if (sqlText.includes("auth_state")) {
          return { rows: [{ value: "authenticated", sessions: "8", pageviews: "19" }] };
        }
      }

      throw new Error(`Unhandled analytics metrics SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.getUsageSummary({
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        limit: 3
      })
    ).resolves.toEqual({
      summary: {
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        sessions: 12,
        pageviews: 30,
        active_visitors: 7,
        new_visitors: 4,
        returning_visitors: 3,
        exits: 2,
        conversions: 5
      },
      breakdowns: {
        device_types: [{ value: "desktop", sessions: 9, pageviews: 20 }],
        browsers: [{ value: "Chrome", sessions: 7, pageviews: 18 }],
        os: [{ value: "macOS", sessions: 6, pageviews: 16 }],
        languages: [{ value: "en", sessions: 10, pageviews: 25 }],
        referrers: [{ value: "google.com", sessions: 5, pageviews: 12 }],
        auth_states: [{ value: "authenticated", sessions: 8, pageviews: 19 }]
      }
    });
  });
});
