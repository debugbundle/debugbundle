import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsBundleObjectKey,
  buildAnalyticsJourneyObjectKey,
  buildAnalyticsRawEventObjectKey,
  deleteProjectObjects,
} from "../../../packages/storage/src/index.js";

describe("storage object helpers", () => {
  it("deletes debug, improvement, and analytics project object prefixes", async (): Promise<void> => {
    const deleteObjectsByPrefix = vi.fn().mockResolvedValue(undefined);

    await deleteProjectObjects({ deleteObjectsByPrefix }, "proj_abc");

    expect(deleteObjectsByPrefix).toHaveBeenCalledTimes(7);
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(1, "raw-events/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(2, "bundles/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(3, "improvement-bundles/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(4, "reproductions/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(5, "analytics-events/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(6, "analytics-journeys/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(7, "analytics-bundles/proj_abc/");
  });

  it("builds analytics object keys from the public storage contract", (): void => {
    const occurredAt = new Date("2026-07-07T09:08:07.000Z");

    expect(buildAnalyticsRawEventObjectKey({
      projectId: "proj_abc",
      eventId: "evt_123",
      occurredAt,
    })).toBe("analytics-events/proj_abc/2026/07/07/09/evt_123.json.gz");
    expect(buildAnalyticsJourneyObjectKey("proj_abc", "sample_123")).toBe(
      "analytics-journeys/proj_abc/sample_123.json.gz"
    );
    expect(buildAnalyticsBundleObjectKey("proj_abc", "gen_123")).toBe(
      "analytics-bundles/proj_abc/gen_123/analytics-bundle.json.gz"
    );
  });
});
