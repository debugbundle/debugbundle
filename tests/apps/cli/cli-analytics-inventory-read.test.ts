import { expect, it, vi } from "vitest";
import { createAnalyticsBundleApi } from "../../../apps/cli/src/analytics-bundle-commands.js";
import { createAnalyticsJourneySampleApi } from "../../../apps/cli/src/analytics-journey-sample-commands.js";

const projectId = "11111111-1111-4111-8111-111111111111";

it.each(["bundles", "journey-samples"])(
  "keeps %s reads compatible with strict older servers and skips cursor recounts",
  async (resource) => {
    const key = resource === "bundles" ? "bundles" : "samples";
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 400, body: { error: "invalid_query" } })
      .mockResolvedValue({ status: 200, body: { [key]: [], next_cursor: null } });
    const list = (cursor?: string) =>
      resource === "bundles"
        ? createAnalyticsBundleApi({ request }).listBundles({
            bearerToken: "test",
            projectId,
            ...(cursor ? { cursor } : {})
          })
        : createAnalyticsJourneySampleApi({ request }).listJourneySamples({
            bearerToken: "test",
            projectId,
            ...(cursor ? { cursor } : {})
          });
    await list();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0].path).toContain("include_total_count=true");
    expect(request.mock.calls[1]?.[0].path).not.toContain("include_total_count");
    request.mockClear();
    await list("cursor");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0].path).not.toContain("include_total_count");
  }
);

it.each(["bundles", "journey-samples"])(
  "preserves exact %s totals for the CLI and shared MCP client",
  async (resource) => {
    const key = resource === "bundles" ? "bundles" : "samples";
    const request = vi.fn().mockResolvedValue({
      status: 200,
      body: { [key]: [], next_cursor: null, total_count: 21, total_pages: 3 }
    });
    const result =
      resource === "bundles"
        ? await createAnalyticsBundleApi({ request }).listBundles({
            bearerToken: "test",
            projectId
          })
        : await createAnalyticsJourneySampleApi({ request }).listJourneySamples({
            bearerToken: "test",
            projectId
          });
    expect(result).toMatchObject({ total_count: 21, total_pages: 3 });
  }
);

it.each([401, 403, 429, 500])("does not retry count reads after status %s", async (status) => {
  const request = vi.fn().mockResolvedValue({ status, body: { error: "unavailable" } });
  await expect(
    createAnalyticsBundleApi({ request }).listBundles({ bearerToken: "test", projectId })
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
