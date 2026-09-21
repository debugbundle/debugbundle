import { describe, expect, it, vi } from "vitest";
import {
  createRetrievalApi,
  RetrievalApiError,
  type HttpClient
} from "../../../packages/retrieval-client/src/index.js";

describe("retrieval mutation outcome safety", () => {
  const operations = [
    "resolveIncident",
    "reopenIncident",
    "resolveIncidents",
    "reopenIncidents",
    "resolveImprovement",
    "reopenImprovement",
    "snoozeImprovement"
  ] as const;
  const input = {
    bearerToken: "synthetic-token",
    incidentId: "inc_synthetic",
    incidentIds: ["inc_synthetic"],
    improvementId: "imp_synthetic",
    snoozedUntil: "2026-10-01T00:00:00.000Z"
  };

  it.each(operations)(
    "does not claim %s failed after a malformed success response or retry the write",
    async (operation) => {
      const request = vi
        .fn<HttpClient["request"]>()
        .mockResolvedValue({ status: 200, body: { unexpected: true } });
      await expect(createRetrievalApi({ request })[operation](input)).rejects.toMatchObject({
        code: "mutation_outcome_unconfirmed",
        outcome: "unknown",
        retrySafe: false,
        status: 200
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it("does not expose a transport error payload or retry a mutation with an uncertain outcome", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockRejectedValue(new Error("sensitive-transport-canary"));
    const result = createRetrievalApi({ request }).resolveIncident(input);
    await expect(result).rejects.toMatchObject({
      code: "mutation_outcome_unconfirmed",
      retrySafe: false
    });
    await expect(result).rejects.toThrow("Check the current state before retrying");
    await expect(result).rejects.not.toThrow("sensitive-transport-canary");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves a definite authorization rejection", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValue({ status: 403, body: { error: "forbidden" } });
    await expect(createRetrievalApi({ request }).resolveIncident(input)).rejects.toEqual(
      new RetrievalApiError(403, "forbidden")
    );
  });

  it("treats a server error as uncertain because it can follow a committed write", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValue({ status: 503, body: { error: "unavailable" } });
    await expect(createRetrievalApi({ request }).resolveIncident(input)).rejects.toMatchObject({
      code: "mutation_outcome_unconfirmed",
      status: 503
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
