import { describe, expect, it, vi } from "vitest";
import { createRetrievalApi } from "../../../packages/retrieval-client/src/index.js";

describe("retrieval resource path boundaries", () => {
  it.each([
    "getImprovement",
    "resolveImprovement",
    "reopenImprovement",
    "snoozeImprovement",
    "getImprovementBundle"
  ] as const)("%s rejects resource IDs that could redirect its request", async (operation) => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const api = createRetrievalApi({ request });
    for (const improvementId of [
      "../another",
      "imp#../../projects/other/leave",
      "a%2fb",
      "a?b",
      "a\\b"
    ]) {
      await expect(
        api[operation]({
          bearerToken: "synthetic",
          improvementId,
          projectId: "proj_valid",
          snoozedUntil: "2026-11-06T00:00:00Z"
        })
      ).rejects.toMatchObject({ status: 400, code: "invalid_improvement_id" });
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects project path traversal before an improvement-bundle request", async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: {} });
    await expect(
      createRetrievalApi({ request }).getImprovementBundle({
        bearerToken: "synthetic",
        projectId: "../other",
        improvementId: "imp_valid"
      })
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_id" });
    expect(request).not.toHaveBeenCalled();
  });
});
