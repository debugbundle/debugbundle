import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsUsageStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000123";
const FROM = "2026-03-01T00:00:00.000Z";

describe("analytics usage store", () => {
  it("reads durable analytics allowance usage for an organization billing window", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        analytics_events: "1200",
        analytics_sessions: "250",
        analytics_journey_samples: "40",
        analytics_bundle_generations: "4"
      }]
    });
    const store = createPostgresAnalyticsUsageStore({ query: query as Queryable["query"] });

    await expect(
      store.getAnalyticsUsageForOrganization({
        organization_id: ORGANIZATION_ID,
        period_starts_at: FROM
      })
    ).resolves.toEqual({
      monthly_analytics_events: 1200,
      monthly_analytics_sessions: 250,
      monthly_analytics_journey_samples: 40,
      monthly_analytics_bundle_generations: 4
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("FROM analytics_usage_counters");
    expect(query.mock.calls[0]?.[1]).toEqual([ORGANIZATION_ID, FROM]);
  });

  it("atomically claims usage only when all analytics limits still fit", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        analytics_events: "11",
        analytics_sessions: "2",
        analytics_journey_samples: "1",
        analytics_bundle_generations: "1"
      }]
    });
    const store = createPostgresAnalyticsUsageStore({ query: query as Queryable["query"] });

    await expect(
      store.claimAnalyticsUsageForOrganization({
        organization_id: ORGANIZATION_ID,
        period_starts_at: FROM,
        analytics_events: 3,
        analytics_sessions: 1,
        analytics_journey_samples: 1,
        analytics_bundle_generations: 0,
        limits: {
          monthly_analytics_events: 20,
          monthly_analytics_sessions: 10,
          monthly_analytics_journey_samples: 5,
          monthly_analytics_bundle_generations: 5
        }
      })
    ).resolves.toEqual({
      allowed: true,
      usage: {
        monthly_analytics_events: 11,
        monthly_analytics_sessions: 2,
        monthly_analytics_journey_samples: 1,
        monthly_analytics_bundle_generations: 1
      }
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (organization_id, period_starts_at)");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE analytics_usage_counters.analytics_events");
    expect(query.mock.calls[0]?.[1]).toEqual([ORGANIZATION_ID, FROM, 3, 1, 1, 0, 20, 10, 5, 5]);
  });

  it("returns the exhausted analytics metric when an atomic claim is denied", async (): Promise<void> => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          analytics_events: "20",
          analytics_sessions: "2",
          analytics_journey_samples: "1",
          analytics_bundle_generations: "1"
        }]
      });
    const store = createPostgresAnalyticsUsageStore({ query: query as Queryable["query"] });

    await expect(
      store.claimAnalyticsUsageForOrganization({
        organization_id: ORGANIZATION_ID,
        period_starts_at: FROM,
        analytics_events: 1,
        analytics_sessions: 0,
        analytics_journey_samples: 0,
        analytics_bundle_generations: 0,
        limits: {
          monthly_analytics_events: 20,
          monthly_analytics_sessions: 10,
          monthly_analytics_journey_samples: 5,
          monthly_analytics_bundle_generations: 5
        }
      })
    ).resolves.toEqual({
      allowed: false,
      metric: "monthly_analytics_events",
      used: 21,
      limit: 20,
      usage: {
        monthly_analytics_events: 21,
        monthly_analytics_sessions: 2,
        monthly_analytics_journey_samples: 1,
        monthly_analytics_bundle_generations: 1
      }
    });
  });

  it("returns journey sample exhaustion when a new retained sample would exceed its limit", async (): Promise<void> => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          analytics_events: "20",
          analytics_sessions: "2",
          analytics_journey_samples: "5",
          analytics_bundle_generations: "1"
        }]
      });
    const store = createPostgresAnalyticsUsageStore({ query: query as Queryable["query"] });

    await expect(
      store.claimAnalyticsUsageForOrganization({
        organization_id: ORGANIZATION_ID,
        period_starts_at: FROM,
        analytics_events: 0,
        analytics_sessions: 0,
        analytics_journey_samples: 1,
        analytics_bundle_generations: 0,
        limits: {
          monthly_analytics_events: 20,
          monthly_analytics_sessions: 10,
          monthly_analytics_journey_samples: 5,
          monthly_analytics_bundle_generations: 5
        }
      })
    ).resolves.toEqual({
      allowed: false,
      metric: "monthly_analytics_journey_samples",
      used: 6,
      limit: 5,
      usage: {
        monthly_analytics_events: 20,
        monthly_analytics_sessions: 2,
        monthly_analytics_journey_samples: 6,
        monthly_analytics_bundle_generations: 1
      }
    });
  });

  it("releases claimed analytics usage when downstream persistence fails", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresAnalyticsUsageStore({ query: query as Queryable["query"] });

    await store.releaseAnalyticsUsageForOrganization({
      organization_id: ORGANIZATION_ID,
      period_starts_at: FROM,
      analytics_events: 2,
      analytics_sessions: 1,
      analytics_journey_samples: 1,
      analytics_bundle_generations: 0
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("GREATEST(0, analytics_journey_samples - $5)"), [
      ORGANIZATION_ID,
      FROM,
      2,
      1,
      1,
      0
    ]);
  });
});
