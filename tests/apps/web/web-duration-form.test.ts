import { expect, it } from "vitest";
import { durationFromSeconds, durationToSeconds } from "../../../apps/web/src/lib/duration-form.js";
it.each([0, 1, 59, 60, 300, 3600, 86400, 604800])(
  "round-trips %i seconds without rounding",
  (seconds) => {
    expect(durationToSeconds(durationFromSeconds(seconds), 604800)).toBe(seconds);
  }
);
it("accepts a fractional unit only if it resolves to whole seconds", () => {
  expect(durationToSeconds({ amount: "1.5", unit: "hours" }, 86400)).toBe(5400);
  expect(durationToSeconds({ amount: "0.5", unit: "seconds" }, 86400)).toBeNull();
});
it.each(["", "-1", "Infinity", "300abc", "1e3", "604801"])(
  "rejects invalid or unbounded input %s",
  (amount) => {
    expect(durationToSeconds({ amount, unit: "seconds" }, 604800)).toBeNull();
  }
);
