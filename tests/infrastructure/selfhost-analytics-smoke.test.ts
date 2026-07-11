import { describe, expect, it, vi } from "vitest";

import { runSelfhostAnalyticsSmoke } from "../../scripts/selfhost-smoke-analytics.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const SAMPLE_ID = "33333333-3333-4333-8333-333333333333";

function jsonResponse(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

describe("self-host analytics smoke runner", () => {
  it("proves realistic browser traffic reaches rollups, samples, and AnalyticsBundle generation", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, {
        access_mode: "manage",
        analytics_available: true,
        settings: { enabled: true, journey_sample_rate: 1 }
      }))
      .mockResolvedValueOnce(jsonResponse(202, { accepted: 27, rejected: 0, errors: [] }))
      .mockResolvedValueOnce(jsonResponse(200, {
        summary: { sessions: 0, pageviews: 0, conversions: 0 },
        breakdowns: { device_types: [], browsers: [], os: [], languages: [], referrers: [], auth_states: [] }
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        summary: { sessions: 3, pageviews: 6, conversions: 2 },
        breakdowns: {
          device_types: [{ value: "desktop", sessions: 2, pageviews: 4 }, { value: "mobile", sessions: 1, pageviews: 2 }],
          browsers: [{ value: "Chrome", sessions: 1, pageviews: 2 }],
          os: [{ value: "macOS", sessions: 1, pageviews: 2 }],
          languages: [{ value: "en-US", sessions: 1, pageviews: 2 }],
          referrers: [],
          auth_states: []
        }
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        window: {},
        funnels: [{ funnel_key: "checkout", sessions_entered: 3, sessions_completed: 2, dropoffs: 1, conversion_rate: 2 / 3 }]
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        samples: [{ sample_id: SAMPLE_ID, has_artifact: true }],
        next_cursor: null
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: "pending",
        bundle_generation_id: GENERATION_ID
      }, { "x-debugbundle-generation-id": GENERATION_ID }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "pending", bundle_generation_id: GENERATION_ID }))
      .mockResolvedValueOnce(jsonResponse(200, {
        schema_version: "analytics_bundle.v1",
        bundle_type: "analytics",
        project_id: PROJECT_ID,
        analysis: { kind: "usage_summary" }
      }));

    const result = await runSelfhostAnalyticsSmoke({
      apiBaseUrl: "http://api.debugbundle.test",
      memberToken: "dbundle_mem_smoke",
      projectToken: "dbundle_proj_smoke",
      projectId: PROJECT_ID,
      serviceName: "selfhost-browser-smoke",
      pollIntervalMs: 0,
      timeoutMs: 100,
      fetchImpl,
      wait: async () => undefined
    });

    expect(result).toEqual({
      acceptedEvents: 27,
      sessions: 3,
      pageviews: 6,
      conversions: 2,
      journeySampleId: SAMPLE_ID,
      bundleGenerationId: GENERATION_ID,
      bundleSchemaVersion: "analytics_bundle.v1"
    });

    const ingestionCall = fetchImpl.mock.calls[1];
    const rawIngestionBody = ingestionCall?.[1]?.body;
    if (typeof rawIngestionBody !== "string") {
      throw new Error("Expected the analytics smoke ingestion body to be JSON text.");
    }
    const ingestionBody = JSON.parse(rawIngestionBody) as {
      events: Array<Record<string, unknown>>;
    };
    expect(ingestionBody.events).toHaveLength(27);
    expect(new Set(ingestionBody.events.map((event) => (event["correlation"] as { session_id: string }).session_id)).size).toBe(3);
    expect(ingestionBody.events.every((event) => event["event_type"] === "analytics_event")).toBe(true);
    expect(JSON.stringify(ingestionBody.events)).not.toContain("?token=");
    expect(JSON.stringify(ingestionBody.events)).not.toContain("owner@example.com");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      `http://api.debugbundle.test/v1/analytics/bundles/${GENERATION_ID}?project_id=${PROJECT_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer dbundle_mem_smoke" })
      })
    );
  });

  it("fails when analytics settings are unavailable for the self-host project", async () => {
    await expect(runSelfhostAnalyticsSmoke({
      apiBaseUrl: "http://api.debugbundle.test",
      memberToken: "dbundle_mem_smoke",
      projectToken: "dbundle_proj_smoke",
      projectId: PROJECT_ID,
      serviceName: "selfhost-browser-smoke",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(403, { error: "upgrade_required" }))
    })).rejects.toThrow("Self-host analytics settings failed with HTTP 403.");
  });
});
