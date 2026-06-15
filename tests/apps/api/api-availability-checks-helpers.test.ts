import { describe, expect, it } from "vitest";

import { mapAvailabilityValidationError } from "../../../apps/api/src/routes/availability-checks.js";
import { AvailabilityCheckValidationError } from "../../../packages/storage/src/availability-check-executor.js";

describe("api availability-check helper mappings", () => {
  it("maps validation and unexpected execution errors deterministically", () => {
    expect(
      mapAvailabilityValidationError(
        new AvailabilityCheckValidationError("blocked_hostname", "Availability checks cannot target localhost.")
      )
    ).toEqual({
      status: 400,
      error: "invalid_check_target",
      message: "Availability checks cannot target localhost."
    });

    expect(mapAvailabilityValidationError(new Error("boom"))).toEqual({
      status: 500,
      error: "availability_check_execution_failed"
    });
  });
});
