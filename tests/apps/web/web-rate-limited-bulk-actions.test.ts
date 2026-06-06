import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/web/src/lib/api-client.js";
import { runRateLimitedBulkAction } from "../../../apps/web/src/lib/rate-limited-bulk-actions.js";

describe("web rate-limited bulk actions", () => {
  it("retries rate-limited items after the requested delay and preserves result order", async () => {
    const sleep = vi.fn(async () => undefined);
    const attempts = new Map<string, number>();
    const execute = vi.fn(async (item: string) => {
      const currentAttempt = (attempts.get(item) ?? 0) + 1;
      attempts.set(item, currentAttempt);

      if (item === "second" && currentAttempt === 1) {
        throw new ApiRequestError("rate_limited", 429, 0);
      }

      return `${item}-done`;
    });

    const results = await runRateLimitedBulkAction({
      items: ["first", "second", "third"],
      execute,
      sleep
    });

    expect(execute).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(0);
    expect(results).toEqual([
      { status: "fulfilled", value: "first-done" },
      { status: "fulfilled", value: "second-done" },
      { status: "fulfilled", value: "third-done" }
    ]);
  });

  it("does not retry non-rate-limited failures", async () => {
    const sleep = vi.fn(async () => undefined);
    const execute = vi.fn(async (item: string) => {
      if (item === "broken") {
        throw new ApiRequestError("incident_not_found", 404);
      }

      return `${item}-done`;
    });

    const results = await runRateLimitedBulkAction({
      items: ["broken", "healthy"],
      execute,
      sleep
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
    expect(results[0]?.status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: "healthy-done" });
  });
});
