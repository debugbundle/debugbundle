import { describe, expect, it } from "vitest";
import {
  analyticsBundleSpecificationFilters,
  analyticsQueryFromDraft,
  defaultAnalyticsFilters,
  analyticsInventoryWindow
} from "../../../apps/web/src/lib/analytics-filter-form.js";
import {
  AnalyticsMetricsQuerySchema,
  parseAnalyticsRelativeDurationMs
} from "../../../packages/shared-types/src/analytics-query.js";
import { AnalyticsSummaryQuerySchema } from "../../../apps/api/src/routes/analytics-contracts.js";
describe("shared analytics query boundaries", () => {
  it("retains the API schema identity and normalizes every browser dimension", () => {
    expect(AnalyticsSummaryQuerySchema).toBe(AnalyticsMetricsQuerySchema);
    expect(
      analyticsQueryFromDraft({
        ...defaultAnalyticsFilters,
        last: "relative",
        relative: "48h",
        granularity: "hour",
        limit: "100",
        service: " web ",
        environment: " production ",
        dimensions: {
          route: "/checkout",
          device_type: "mobile",
          browser: "Firefox",
          os: "Linux",
          language: "sl",
          country: "SI",
          auth_state: "authenticated",
          referrer: "direct",
          utm_source: "mail",
          utm_medium: "email",
          utm_campaign: "launch"
        },
        customDimensions: '{"plan":"team"}'
      }).query
    ).toEqual({
      last: "48h",
      granularity: "hour",
      limit: 100,
      service: "web",
      environment: "production",
      route: "/checkout",
      device_type: "mobile",
      browser: "Firefox",
      os: "Linux",
      language: "sl",
      country: "SI",
      auth_state: "authenticated",
      referrer: "direct",
      utm_source: "mail",
      utm_medium: "email",
      utm_campaign: "launch",
      custom_dimensions: { plan: "team" }
    });
  });
  it.each([
    { limit: "101" },
    { limit: "0" },
    { limit: "1.5" },
    { last: "relative" as const, relative: "371d" },
    { last: "relative" as const, relative: "0h" },
    { last: "custom" as const, from: "2026-10-07T00:00:00Z", to: "2026-10-01T00:00:00Z" },
    { dimensions: { route: "/checkout?secret=1" } },
    { customDimensions: "[]" },
    { customDimensions: '{"plan":false}' },
    {
      customDimensions: JSON.stringify(
        Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`key${i}`, "x"]))
      )
    }
  ])("rejects invalid draft before dispatch: %j", (changes) => {
    expect(analyticsQueryFromDraft({ ...defaultAnalyticsFilters, ...changes }).query).toBeNull();
  });
  it("preserves exact custom inventory windows and bounds relative units", () => {
    expect(
      analyticsInventoryWindow({ from: "2026-10-01T01:02:03.456Z", to: "2026-10-07T04:05:06.789Z" })
    ).toEqual({ from: "2026-10-01T01:02:03.456Z", to: "2026-10-07T04:05:06.789Z" });
    expect(parseAnalyticsRelativeDurationMs("370d")).toBe(370 * 86400000);
    expect(parseAnalyticsRelativeDurationMs("53w")).toBeNull();
  });
  it("carries selected metric dimensions into bundle specification metadata without changing defaults", () => {
    expect(
      analyticsBundleSpecificationFilters({ last: "30d", granularity: "day", limit: 100 })
    ).toEqual({});
    expect(
      analyticsBundleSpecificationFilters({
        from: "2026-10-01T00:00:00Z",
        to: "2026-10-07T00:00:00Z",
        service: "web",
        environment: "production",
        browser: "Firefox",
        granularity: "hour",
        custom_dimensions: { plan: "team" }
      })
    ).toEqual({ browser: "Firefox", granularity: "hour", custom_dimensions: { plan: "team" } });
  });
});
