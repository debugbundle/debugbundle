import type { AnalyticsFilterOptionsResponse } from "../../packages/shared-types/src/analytics-filter-options.js";

export function createAnalyticsFilterOptions(
  projectId = "00000000-0000-0000-0000-000000000001"
): AnalyticsFilterOptionsResponse {
  const set = (values: string[]) => ({ values, truncated: false });
  return {
    window: {
      project_id: projectId,
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day",
      service: null,
      environment: null
    },
    options: {
      route: set(["/checkout", "/pricing"]),
      device_type: set(["mobile", "desktop"]),
      browser: set(["Chrome", "Firefox"]),
      os: set(["Linux", "iOS"]),
      language: set(["sl", "en"]),
      country: set(["SI", "US"]),
      auth_state: set(["authenticated", "anonymous"]),
      referrer: set(["direct", "example.test"]),
      utm_source: set(["mail"]),
      utm_medium: set(["email"]),
      utm_campaign: set(["launch"])
    },
    custom_dimensions: [{ key: "plan", values: ["team"], truncated: false }]
  };
}
