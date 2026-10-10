import { describe, expect, it } from "vitest";
import {
  AnalyticsBundleV1Schema,
  AnalyticsFlowReportSchema,
  AnalyticsFlowsResponseSchema,
  AnalyticsSavedFunnelsResponseSchema,
  ANALYTICS_BUNDLE_GENERATION_ID_HEADER
} from "../../packages/shared-types/src/index.js";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";

describe("populated analytics preview", () => {
  it.each([
    ["/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows", "flows"],
    ["/v1/projects/00000000-0000-4000-8000-000000000001/analytics/saved-funnels", "funnels"],
    ["/v1/projects/00000000-0000-4000-8000-000000000001/analytics/funnels", "funnels"],
    ["/v1/projects/00000000-0000-4000-8000-000000000001/analytics/journey-patterns", "patterns"],
    [
      "/v1/analytics/opportunities/opp_0?project_id=00000000-0000-4000-8000-000000000001",
      "opportunity"
    ],
    [
      "/v1/analytics/journey-samples/journey_demo?project_id=00000000-0000-4000-8000-000000000001",
      "journey"
    ],
    [
      "/v1/projects/00000000-0000-4000-8000-000000000001/availability-checks/10000000-0000-4000-8000-000000000002/results",
      "results"
    ]
  ])("populates %s", (path, key) => {
    const result = createDevMockApi().handle("GET", path);
    expect(result.status).toBe(200);
    const record = (result.body as Record<string, unknown>)[key];
    expect(Array.isArray(record) ? record.length : record).toBeTruthy();
  });

  it("serves contract-valid flow definitions, reports, saved funnels and analytics artifacts", () => {
    const api = createDevMockApi();
    expect(
      AnalyticsFlowsResponseSchema.parse(
        api.handle("GET", "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows").body
      ).flows
    ).toHaveLength(1);
    expect(
      AnalyticsFlowReportSchema.parse(
        api.handle(
          "GET",
          "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows/checkout/report?window=30d"
        ).body
      ).steps
    ).toHaveLength(3);
    expect(
      AnalyticsSavedFunnelsResponseSchema.parse(
        api.handle(
          "GET",
          "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/saved-funnels"
        ).body
      ).funnels
    ).toHaveLength(1);
    const bundle = AnalyticsBundleV1Schema.parse(
      api.handle(
        "GET",
        "/v1/analytics/bundles/gen_0?project_id=00000000-0000-4000-8000-000000000001"
      ).body
    );
    expect(bundle.summary.description).toContain("Synthetic");
    expect(
      api.handle(
        "GET",
        "/v1/analytics/bundles/gen_0?project_id=00000000-0000-4000-8000-000000000002"
      ).status
    ).toBe(404);
  });

  it("saves and archives funnels and flows within the selected project only", () => {
    const api = createDevMockApi();
    const definition = {
      funnel_key: "signup",
      display_name: "Signup",
      steps: [
        { step_key: "start", display_name: "Start" },
        { step_key: "finish", display_name: "Finish" }
      ]
    };
    expect(
      api.handle(
        "POST",
        "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/saved-funnels",
        definition
      ).status
    ).toBe(200);
    expect(
      api.handle("GET", "/v1/projects/00000000-0000-4000-8000-000000000002/analytics/saved-funnels")
        .body
    ).toMatchObject({
      funnels: []
    });
    expect(
      api.handle(
        "DELETE",
        "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/saved-funnels/signup"
      ).status
    ).toBe(200);
    expect(
      api.handle(
        "PUT",
        "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows/signup",
        {
          flow_key: "signup",
          display_name: "Signup",
          kind: "activation",
          steps: definition.steps.map((step) => ({ ...step, origin: "https://app.example.test" }))
        }
      ).status
    ).toBe(200);
    expect(
      api.handle(
        "GET",
        "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows/signup/report"
      ).status
    ).toBe(200);
    expect(
      api.handle(
        "DELETE",
        "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows/signup"
      ).status
    ).toBe(200);
    expect(
      api.handle("PUT", "/v1/projects/00000000-0000-4000-8000-000000000001/analytics/flows/bad", {})
        .status
    ).toBe(400);
  });

  it("generates a synthetic analytics bundle and preserves its inventory link", () => {
    const api = createDevMockApi();
    const result = api.handle("POST", "/v1/analytics/bundles", {
      project_id: "00000000-0000-4000-8000-000000000001",
      opportunity_id: "opp_0",
      analysis_kind: "funnel_dropoff",
      last: "30d"
    });
    expect(result.status).toBe(200);
    expect(AnalyticsBundleV1Schema.safeParse(result.body).success).toBe(true);
    expect(result.headers?.[ANALYTICS_BUNDLE_GENERATION_ID_HEADER]).toBeTypeOf("string");
    const opportunity = api.handle(
      "GET",
      "/v1/analytics/opportunities/opp_0?project_id=00000000-0000-4000-8000-000000000001"
    );
    expect(opportunity.body).toHaveProperty("opportunity.bundle_status", "completed");
  });
});
