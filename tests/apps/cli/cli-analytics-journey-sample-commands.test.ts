import { describe, expect, it, vi } from "vitest";

import {
  createAnalyticsJourneySampleApi,
  getAnalyticsJourneySampleCommand,
  getAnalyticsJourneySampleWithAuthCommand,
  listAnalyticsJourneySamplesCommand,
  listAnalyticsJourneySamplesWithAuthCommand
} from "../../../apps/cli/src/analytics-journey-sample-commands.js";
import { AnalyticsMetricsApiError } from "../../../apps/cli/src/analytics-metrics-commands.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const SAMPLE_ID = "00000000-0000-4000-8000-000000000333";

const sample = {
  sample_id: SAMPLE_ID,
  project_id: PROJECT_ID,
  service: "web",
  environment: "production",
  session_id_hash: "sha256:session",
  visitor_id_hash: "sha256:visitor",
  analysis_tags: ["checkout", "loop"],
  first_seen_at: "2026-03-01T00:00:00.000Z",
  last_seen_at: "2026-03-01T00:05:00.000Z",
  dimensions_summary: { device_type: "mobile" },
  has_artifact: true,
  expires_at: "2026-03-08T00:05:00.000Z",
  created_at: "2026-03-01T00:05:01.000Z"
} as const;

const listResponse = {
  samples: [sample],
  next_cursor: null
} as const;

const sampleResponse = {
  sample,
  journey: {
    schema_version: "analytics_journey_sample.v1",
    timeline: [{ kind: "page_view", route: "/pricing" }]
  }
} as const;

describe("cli analytics journey sample commands", () => {
  it("renders journey sample list and detail in human and json mode", async () => {
    const listHuman = await listAnalyticsJourneySamplesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listJourneySamples: vi.fn().mockResolvedValue(listResponse) }
    );
    const detailHuman = await getAnalyticsJourneySampleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, sampleId: SAMPLE_ID },
      { getJourneySample: vi.fn().mockResolvedValue(sampleResponse) }
    );
    const detailJson = await getAnalyticsJourneySampleCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, sampleId: SAMPLE_ID, json: true },
      { getJourneySample: vi.fn().mockResolvedValue(sampleResponse) }
    );

    expect(listHuman.exitCode).toBe(0);
    expect(listHuman.output).toContain(`${SAMPLE_ID}  web  production`);
    expect(detailHuman.exitCode).toBe(0);
    expect(detailHuman.output).toContain(`Journey sample: ${SAMPLE_ID}`);
    expect(detailHuman.output).toContain("Journey keys: schema_version, timeline");
    expect(JSON.parse(detailJson.output)).toEqual(sampleResponse);
  });

  it("loads auth state and forwards authenticated list and get calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const listJourneySamples = vi.fn().mockResolvedValue(listResponse);
    const getJourneySample = vi.fn().mockResolvedValue(sampleResponse);
    const createApi = vi.fn().mockReturnValue({ listJourneySamples, getJourneySample });

    await listAnalyticsJourneySamplesWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        service: "web",
        environment: "production",
        tag: "checkout",
        cursor: "cursor-1",
        limit: 5,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    await getAnalyticsJourneySampleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        sampleId: SAMPLE_ID,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(listJourneySamples).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: "cursor-1",
      limit: 5
    });
    expect(getJourneySample).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      sampleId: SAMPLE_ID
    });
  });

  it("builds GET requests against journey sample API routes", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: listResponse })
      .mockResolvedValueOnce({ status: 200, body: sampleResponse });
    const api = createAnalyticsJourneySampleApi({ request });

    await api.listJourneySamples({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: "cursor-1",
      limit: 5
    });
    await api.getJourneySample({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      sampleId: SAMPLE_ID
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}&service=web&environment=production&tag=checkout&cursor=cursor-1&limit=5`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/journey-samples/${SAMPLE_ID}?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
  });

  it("maps HTTP error responses from the journey sample API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 403, body: { error: "upgrade_required" } })
      .mockResolvedValueOnce({ status: 500, body: {} });
    const api = createAnalyticsJourneySampleApi({ request });

    await expect(api.listJourneySamples({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID
    })).rejects.toMatchObject({
      status: 403,
      message: "upgrade_required"
    });
    await expect(api.getJourneySample({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      sampleId: SAMPLE_ID
    })).rejects.toMatchObject({
      status: 500,
      message: "Failed to get analytics journey sample."
    });
  });

  it("maps API failures to stable exit codes", async () => {
    const result = await listAnalyticsJourneySamplesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listJourneySamples: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(403, "upgrade_required")) }
    );
    const serverError = await listAnalyticsJourneySamplesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listJourneySamples: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(500, "server_error")) }
    );

    expect(result).toEqual({ exitCode: 4, output: "upgrade_required" });
    expect(serverError).toEqual({ exitCode: 1, output: "server_error" });
  });
});
