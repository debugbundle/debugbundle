import { describe, expect, it, vi } from "vitest";

import {
  AnalyticsMetricsApiError
} from "../../../apps/cli/src/analytics-metrics-commands.js";
import {
  createAnalyticsBundleApi,
  createAnalyticsBundleCommand,
  createAnalyticsBundleWithAuthCommand,
  getAnalyticsBundleCommand,
  getAnalyticsBundleWithAuthCommand,
  listAnalyticsBundlesCommand,
  listAnalyticsBundlesWithAuthCommand
} from "../../../apps/cli/src/analytics-bundle-commands.js";
import { buildAnalyticsBundle } from "../../../packages/analytics-bundle-engine/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const BUNDLE_GENERATION_ID = "00000000-0000-4000-8000-000000000222";
const FROM = "2026-03-01T00:00:00.000Z";
const TO = "2026-03-08T00:00:00.000Z";

const bundlePendingResponse = {
  status: "pending",
  bundle_generation_id: BUNDLE_GENERATION_ID
} as const;

const bundleListResponse = {
  bundles: [{
    generation_id: BUNDLE_GENERATION_ID,
    project_id: PROJECT_ID,
    opportunity_id: null,
    requested_by_user_id: null,
    analysis_kind: "usage_summary",
    analysis_spec: { from: FROM, to: TO },
    input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "completed",
    has_artifact: true,
    failure_reason: null,
    created_at: FROM,
    claimed_at: FROM,
    completed_at: TO,
    updated_at: TO
  }],
  next_cursor: null
} as const;

const completedBundleResponse = buildAnalyticsBundle({
  analysis_kind: "usage_summary",
  input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  project: {
    project_id: PROJECT_ID,
    service: "web",
    environment: "production"
  },
  analysis_window: {
    from: FROM,
    to: TO,
    granularity: "day"
  },
  summary: {
    title: "Usage summary",
    description: "Important usage evidence for agents.",
    confidence: "high",
    severity: "low"
  },
  metrics: {
    sessions_analyzed: 12,
    affected_sessions: 3
  },
  segments: [],
  journey_patterns: [{ from_route_key: "/pricing", to_route_key: "/checkout", transition_count: 4 }],
  representative_journeys: [],
  linked_incidents: [],
  linked_deploys: [],
  recommendations: [{ priority: 1, action: "inspect_checkout" }],
  redaction: {
    rules_applied: ["analytics-aggregate-only"],
    omitted_fields: ["raw_click_text"]
  }
});

describe("cli analytics bundle commands", () => {
  it("renders analytics bundle lists in human and json mode", async () => {
    const listed = await listAnalyticsBundlesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, status: "completed", kind: "usage_summary" },
      { listBundles: vi.fn().mockResolvedValue(bundleListResponse) }
    );
    const empty = await listAnalyticsBundlesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listBundles: vi.fn().mockResolvedValue({ bundles: [], next_cursor: null }) }
    );
    const json = await listAnalyticsBundlesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, json: true },
      { listBundles: vi.fn().mockResolvedValue(bundleListResponse) }
    );

    expect(listed.exitCode).toBe(0);
    expect(listed.output).toContain(BUNDLE_GENERATION_ID);
    expect(listed.output).toContain("usage_summary");
    expect(listed.output).toContain("completed");
    expect(empty.output).toBe("No AnalyticsBundles found.");
    expect(JSON.parse(json.output)).toEqual(bundleListResponse);
  });

  it("omits project_id for an explicit organization-wide bundle list request", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      body: bundleListResponse
    });
    const api = createAnalyticsBundleApi({ request });

    await expect(
      api.listBundles({ bearerToken: "dbundle_mem_x", status: "completed", limit: 5 })
    ).resolves.toEqual(bundleListResponse);

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/analytics/bundles?status=completed&limit=5",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("renders analytics bundle create and get states in human and json mode", async () => {
    const created = await createAnalyticsBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        analysisKind: "funnel_dropoff",
        from: FROM,
        to: TO,
        funnel: "checkout"
      },
      { createBundle: vi.fn().mockResolvedValue(bundlePendingResponse) }
    );
    const pending = await getAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, bundleGenerationId: BUNDLE_GENERATION_ID },
      { getBundle: vi.fn().mockResolvedValue(bundlePendingResponse) }
    );
    const completed = await getAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, bundleGenerationId: BUNDLE_GENERATION_ID },
      { getBundle: vi.fn().mockResolvedValue(completedBundleResponse) }
    );
    const json = await createAnalyticsBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        analysisKind: "usage_summary",
        last: "7d",
        json: true
      },
      { createBundle: vi.fn().mockResolvedValue(bundlePendingResponse) }
    );

    expect(created.exitCode).toBe(0);
    expect(created.output).toBe(`AnalyticsBundle pending: ${BUNDLE_GENERATION_ID}`);
    expect(pending.exitCode).toBe(0);
    expect(pending.output).toBe(`AnalyticsBundle pending: ${BUNDLE_GENERATION_ID}`);
    expect(completed.exitCode).toBe(0);
    expect(completed.output).toContain("AnalyticsBundle: usage_summary");
    expect(completed.output).toContain("Sessions analyzed: 12");
    expect(completed.output).toContain("Recommendations: 1");
    expect(JSON.parse(json.output)).toEqual(bundlePendingResponse);
  });

  it("loads auth state and forwards authenticated bundle list, create, and get calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createBundle = vi.fn().mockResolvedValue(bundlePendingResponse);
    const getBundle = vi.fn().mockResolvedValue(bundlePendingResponse);
    const listBundles = vi.fn().mockResolvedValue(bundleListResponse);
    const createApi = vi.fn().mockReturnValue({ listBundles, createBundle, getBundle });

    const listResult = await listAnalyticsBundlesWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        status: "completed",
        kind: "usage_summary",
        service: "web",
        environment: "production",
        from: FROM,
        to: TO,
        cursor: `${FROM}|${BUNDLE_GENERATION_ID}`,
        limit: 5,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    const createResult = await createAnalyticsBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        analysisKind: "route_health",
        last: "7d",
        route: "/pricing",
        filters: { auth_state: "public" },
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    const getResult = await getAnalyticsBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        bundleGenerationId: BUNDLE_GENERATION_ID,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(listBundles).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      status: "completed",
      kind: "usage_summary",
      service: "web",
      environment: "production",
      from: FROM,
      to: TO,
      cursor: `${FROM}|${BUNDLE_GENERATION_ID}`,
      limit: 5
    });
    expect(createBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      analysisKind: "route_health",
      from: undefined,
      to: undefined,
      last: "7d",
      funnel: undefined,
      route: "/pricing",
      incidentId: undefined,
      deployId: undefined,
      filters: { auth_state: "public" }
    });
    expect(getBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      bundleGenerationId: BUNDLE_GENERATION_ID
    });
    expect(JSON.parse(createResult.output)).toEqual(bundlePendingResponse);
    expect(JSON.parse(getResult.output)).toEqual(bundlePendingResponse);
    expect(JSON.parse(listResult.output)).toEqual(bundleListResponse);
  });

  it("builds HTTP requests against the analytics bundle API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: bundleListResponse })
      .mockResolvedValueOnce({ status: 200, body: bundlePendingResponse })
      .mockResolvedValueOnce({ status: 200, body: bundlePendingResponse });
    const api = createAnalyticsBundleApi({ request });

    await api.listBundles({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      status: "completed",
      kind: "usage_summary",
      service: "web",
      environment: "production",
      from: FROM,
      to: TO,
      cursor: `${FROM}|${BUNDLE_GENERATION_ID}`,
      limit: 5
    });
    await api.createBundle({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      analysisKind: "funnel_dropoff",
      from: FROM,
      to: TO,
      funnel: "checkout",
      filters: { auth_state: "logged_in" }
    });
    await api.getBundle({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      bundleGenerationId: BUNDLE_GENERATION_ID
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/bundles?project_id=${PROJECT_ID}&status=completed&kind=usage_summary&service=web&environment=production&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&cursor=${encodeURIComponent(`${FROM}|${BUNDLE_GENERATION_ID}`)}&limit=5`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/analytics/bundles",
      bearerToken: "dbundle_mem_x",
      body: {
        project_id: PROJECT_ID,
        analysis_kind: "funnel_dropoff",
        from: FROM,
        to: TO,
        funnel: "checkout",
        filters: { auth_state: "logged_in" }
      }
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
  });

  it("maps bundle API command failures to stable exit codes", async () => {
    const invalidKind = await createAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, analysisKind: "invalid" as never },
      { createBundle: vi.fn() }
    );
    const unknown = await createAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, analysisKind: "usage_summary" },
      { createBundle: vi.fn().mockRejectedValue(new Error("boom")) }
    );
    const unauthorized = await getAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, bundleGenerationId: BUNDLE_GENERATION_ID },
      { getBundle: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token")) }
    );
    const missing = await getAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, bundleGenerationId: BUNDLE_GENERATION_ID },
      { getBundle: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(404, "analytics_bundle_not_found")) }
    );
    const forbidden = await createAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, analysisKind: "usage_summary" },
      { createBundle: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(403, "analytics_disabled")) }
    );
    const server = await createAnalyticsBundleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, analysisKind: "usage_summary" },
      { createBundle: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(500, "unavailable")) }
    );
    const invalidStatus = await listAnalyticsBundlesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, status: "invalid" as never },
      { listBundles: vi.fn() }
    );

    expect(invalidKind).toEqual({ exitCode: 4, output: "Invalid value for --kind." });
    expect(unknown).toEqual({ exitCode: 1, output: "boom" });
    expect(unauthorized).toEqual({ exitCode: 2, output: "invalid_member_token" });
    expect(missing).toEqual({ exitCode: 3, output: "analytics_bundle_not_found" });
    expect(forbidden).toEqual({ exitCode: 4, output: "analytics_disabled" });
    expect(server).toEqual({ exitCode: 1, output: "unavailable" });
    expect(invalidStatus).toEqual({ exitCode: 4, output: "Invalid value for --status." });
  });

  it("maps HTTP error and malformed bundle responses", async () => {
    const bodyErrorRequest = vi.fn().mockResolvedValue({ status: 403, body: { error: "analytics_disabled" } });
    const fallbackErrorRequest = vi.fn().mockResolvedValue({ status: 500, body: null });
    const invalidResponseRequest = vi.fn().mockResolvedValue({ status: 200, body: { status: "unknown" } });
    const invalidListResponseRequest = vi.fn().mockResolvedValue({ status: 200, body: { bundles: [{}] } });

    await expect(
      createAnalyticsBundleApi({ request: bodyErrorRequest }).createBundle({
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        analysisKind: "usage_summary"
      })
    ).rejects.toMatchObject({ status: 403, message: "analytics_disabled" });
    await expect(
      createAnalyticsBundleApi({ request: fallbackErrorRequest }).getBundle({
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        bundleGenerationId: BUNDLE_GENERATION_ID
      })
    ).rejects.toMatchObject({ status: 500, message: "Failed to get analytics bundle." });
    await expect(
      createAnalyticsBundleApi({ request: invalidResponseRequest }).createBundle({
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        analysisKind: "usage_summary"
      })
    ).rejects.toMatchObject({ status: 500, message: "Invalid analytics bundle response." });
    await expect(
      createAnalyticsBundleApi({ request: invalidListResponseRequest }).listBundles({
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID
      })
    ).rejects.toMatchObject({ status: 500, message: "Invalid analytics bundle list response." });
  });
});
