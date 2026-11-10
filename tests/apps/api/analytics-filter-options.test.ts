import { describe, expect, it, vi } from "vitest";
import {
  createDependencies,
  createAnalyticsMetricsDependency,
  createProjectAccess,
  PROJECT_ID,
  FROM,
  TO
} from "../../helpers/analytics-route-fixtures.js";
import { createAnalyticsFilterOptions } from "../../helpers/analytics-filter-options.js";

const headers = { authorization: "Bearer dbundle_mem_test_token" };
const url = `/v1/analytics/filter-options?project_id=${PROJECT_ID}&from=${FROM}&to=${TO}`;

describe("observed analytics filter options", () => {
  it("returns observed choices through existing project read authority", async () => {
    const result = createAnalyticsFilterOptions();
    const getFilterOptionsForProject = vi.fn().mockResolvedValue(result);
    const app = createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency(),
      analyticsFilterOptions: { getFilterOptionsForProject }
    });
    const response = await app.inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual(result);
    expect(getFilterOptionsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      origin_project_ids: [PROJECT_ID],
      from: FROM,
      to: TO,
      granularity: "day",
      service: undefined,
      environment: undefined,
      limit: 100
    });
  });

  it("rejects unsupported filters and unauthorised reads before fetching choices", async () => {
    const read = vi.fn();
    const app = createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency(),
      analyticsFilterOptions: { getFilterOptionsForProject: read }
    });
    expect(
      (await app.inject({ method: "GET", url: `${url}&device_type=mobile`, headers })).statusCode
    ).toBe(400);
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed when the new read capability is unavailable", async () => {
    const app = createDependencies({ analyticsMetrics: createAnalyticsMetricsDependency() });
    const response = await app.inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "analytics_filter_options_unavailable" });
  });

  it("does not fetch another project and preserves the principal's accepted origin set", async () => {
    const read = vi.fn().mockResolvedValue(createAnalyticsFilterOptions());
    const denied = createDependencies({
      analyticsFilterOptions: { getFilterOptionsForProject: read },
      projectAccess: null
    });
    expect((await denied.inject({ method: "GET", url, headers })).statusCode).toBe(404);
    expect(read).not.toHaveBeenCalled();
    const access = Object.assign(
      createProjectAccess({ effective_role: "member", relationship: "shared" }),
      { origin_project_ids: [PROJECT_ID] }
    );
    const allowed = createDependencies({
      analyticsFilterOptions: { getFilterOptionsForProject: read },
      projectAccess: access
    });
    expect((await allowed.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    expect(read.mock.calls[0]?.[0]).toMatchObject({ origin_project_ids: [PROJECT_ID] });
  });

  it("accepts unchanged values regardless of object property ordering", async () => {
    const fixture = createAnalyticsFilterOptions();
    const reordered = {
      custom_dimensions: fixture.custom_dimensions,
      options: Object.fromEntries(Object.entries(fixture.options).reverse()),
      window: Object.fromEntries(Object.entries(fixture.window).reverse())
    };
    const app = createDependencies({
      analyticsFilterOptions: { getFilterOptionsForProject: vi.fn().mockResolvedValue(reordered) }
    });
    const response = await app.inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(fixture);
  });

  it("never turns unsafe legacy values into selectable redaction markers", async () => {
    const result = createAnalyticsFilterOptions();
    result.options.utm_source.values = ["Authorization: Bearer SYNTHETIC_FILTER_SECRET"];
    const app = createDependencies({
      analyticsFilterOptions: { getFilterOptionsForProject: vi.fn().mockResolvedValue(result) }
    });
    const response = await app.inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("SYNTHETIC_FILTER_SECRET");
    expect(response.json()).toEqual({ error: "privacy_projection_unavailable" });
  });
});
