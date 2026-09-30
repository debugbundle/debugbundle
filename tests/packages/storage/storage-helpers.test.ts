import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsBundleObjectKey,
  buildAnalyticsJourneyObjectKey,
  buildAnalyticsRawEventObjectKey,
  buildSemanticAnalyticsRawEventObjectKey,
  deleteProjectObjects
} from "../../../packages/storage/src/index.js";

describe("storage object helpers", () => {
  it("deletes debug, improvement, and analytics project object prefixes", async (): Promise<void> => {
    const deleteObjectsByPrefix = vi.fn().mockResolvedValue(undefined);

    await deleteProjectObjects({ deleteObjectsByPrefix }, "proj_abc");

    expect(deleteObjectsByPrefix).toHaveBeenCalledTimes(8);
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(1, "raw-events/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(2, "bundles/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(3, "improvement-bundles/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(4, "reproductions/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(5, "analytics-events/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(6, "semantic-events/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(7, "analytics-journeys/proj_abc/");
    expect(deleteObjectsByPrefix).toHaveBeenNthCalledWith(8, "analytics-bundles/proj_abc/");
  });

  it("builds analytics object keys from the public storage contract", (): void => {
    const occurredAt = new Date("2026-07-07T09:08:07.000Z");

    expect(
      buildAnalyticsRawEventObjectKey({
        projectId: "proj_abc",
        eventId: "evt_123",
        occurredAt
      })
    ).toBe("analytics-events/proj_abc/2026/07/07/09/evt_123.json.gz");
    expect(buildAnalyticsJourneyObjectKey("proj_abc", "sample_123")).toBe(
      "analytics-journeys/proj_abc/sample_123.json.gz"
    );
    expect(buildAnalyticsBundleObjectKey("proj_abc", "gen_123")).toBe(
      "analytics-bundles/proj_abc/gen_123/analytics-bundle.json.gz"
    );
  });

  it("keeps conflicting V2 event IDs on distinct protected object keys", () => {
    const input = {
      projectId: "11111111-1111-4111-8111-111111111111",
      eventId: "22222222-2222-4222-8222-222222222222",
      occurredAt: new Date("2026-09-28T09:08:07.000Z"),
      contentHash: `sha256:${"a".repeat(64)}`
    };
    const first = buildSemanticAnalyticsRawEventObjectKey(input);
    expect(first).toBe(
      `semantic-events/${input.projectId}/2026/09/28/09/${input.eventId}/${"a".repeat(64)}.json.gz`
    );
    expect(buildSemanticAnalyticsRawEventObjectKey(input)).toBe(first);
    expect(
      buildSemanticAnalyticsRawEventObjectKey({
        ...input,
        contentHash: `sha256:${"b".repeat(64)}`
      })
    ).not.toBe(first);
    expect(() =>
      buildSemanticAnalyticsRawEventObjectKey({ ...input, contentHash: "invalid/path" })
    ).toThrow("semantic_analytics_object_key_invalid");
  });
});
