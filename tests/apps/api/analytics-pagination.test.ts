import { describe, expect, it, vi } from "vitest";
import {
  PROJECT_ID,
  createAnalyticsBundleGeneration,
  createAnalyticsBundlesDependency,
  createAnalyticsOpportunitiesDependency,
  createDependencies
} from "../../helpers/analytics-route-fixtures.js";

describe("analytics pagination compatibility", () => {
  it("preserves the filtered total pages in bundle list responses", async () => {
    const analyticsBundles = createAnalyticsBundlesDependency({
      listAnalyticsBundleGenerationsForProject: vi.fn().mockResolvedValue({
        bundles: [createAnalyticsBundleGeneration()],
        next_cursor: null,
        total_pages: 3
      })
    });
    const app = createDependencies({ analyticsBundles });
    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}&limit=10&include_total=true`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().total_pages).toBe(3);
  });

  it.each(["bundles", "opportunities"])(
    "keeps legacy %s response keys unless totals are requested",
    async (resource) => {
      const app = createDependencies({
        analyticsBundles: createAnalyticsBundlesDependency({
          listAnalyticsBundleGenerationsForProject: vi
            .fn()
            .mockResolvedValue({ bundles: [], next_cursor: null, total_pages: 3 })
        }),
        analyticsOpportunities: createAnalyticsOpportunitiesDependency({
          listAnalyticsOpportunitiesForProject: vi
            .fn()
            .mockResolvedValue({ opportunities: [], next_cursor: null, total_pages: 3 })
        })
      });
      for (const query of ["", "&include_total=false"]) {
        const response = await app.inject({
          method: "GET",
          url: `/v1/analytics/${resource}?project_id=${PROJECT_ID}${query}`,
          headers: { authorization: "Bearer dbundle_mem_test_token" }
        });
        expect(response.statusCode).toBe(200);
        expect(Object.keys(response.json()).sort()).toEqual([resource, "next_cursor"].sort());
      }
      const response = await app.inject({
        method: "GET",
        url: `/v1/analytics/${resource}?project_id=${PROJECT_ID}&include_total=true`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().total_pages).toBe(3);
      await app.close();
    }
  );
});
