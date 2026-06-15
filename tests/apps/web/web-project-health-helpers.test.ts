import { describe, expect, it } from "vitest";

import {
  availabilityResultVariant,
  availabilityStatusVariant,
  dailyStateVariant,
  formatAvailabilityStatus,
  formatDay,
  formatDateTime,
  formatDowntime,
  formatPausedReason,
  getAvailabilityErrorMessage
} from "../../../apps/web/src/pages/project-health-page-utils.js";

describe("web project health helpers", () => {
  it("maps status and result variants across all supported states", () => {
    expect(availabilityStatusVariant("passing")).toBe("success");
    expect(availabilityStatusVariant("paused")).toBe("warning");
    expect(availabilityStatusVariant("failing")).toBe("destructive");
    expect(availabilityStatusVariant("unknown")).toBe("outline");

    expect(availabilityResultVariant("success")).toBe("success");
    expect(availabilityResultVariant("http_status_mismatch")).toBe("warning");
    expect(availabilityResultVariant("timeout")).toBe("destructive");

    expect(dailyStateVariant("operational")).toBe("success");
    expect(dailyStateVariant("degraded")).toBe("warning");
    expect(dailyStateVariant("paused")).toBe("warning");
    expect(dailyStateVariant("down")).toBe("destructive");
    expect(dailyStateVariant("unknown")).toBe("outline");

    expect(formatAvailabilityStatus("unknown")).toBe("Unknown");
    expect(formatAvailabilityStatus("passing")).toBe("Passing");
    expect(formatAvailabilityStatus("failing")).toBe("Failing");
    expect(formatAvailabilityStatus("paused")).toBe("Paused");
  });

  it("formats paused reasons, downtime, and generic availability errors", () => {
    expect(formatPausedReason("disabled")).toBe("Disabled");
    expect(formatPausedReason("plan_check_limit_exceeded")).toBe("Over plan check limit");
    expect(formatPausedReason("plan_interval_too_low")).toBe("Interval below plan minimum");
    expect(formatPausedReason("custom_reason")).toBe("custom_reason");

    expect(formatDowntime(0)).toBe("No recorded downtime");
    expect(formatDowntime(15)).toBe("15s");
    expect(formatDowntime(180)).toBe("3m");
    expect(formatDowntime(3_600)).toBe("1h");

    const invalidSessionError = new Error("invalid_session");
    expect(getAvailabilityErrorMessage(invalidSessionError)).toBe(
      "Your session expired. Refresh the page and sign in again."
    );
    expect(getAvailabilityErrorMessage(new Error("availability_check_limit_reached"))).toBe(
      "This project already uses the maximum number of health checks allowed by the current plan."
    );
    expect(getAvailabilityErrorMessage(new Error("availability_check_interval_too_low"))).toBe(
      "The polling interval is lower than the minimum allowed by the current plan."
    );
    expect(getAvailabilityErrorMessage(new Error("invalid_check_target"))).toBe(
      "The check URL must be a safe public HTTP or HTTPS endpoint reachable from outside your network."
    );
    expect(getAvailabilityErrorMessage(new Error("forbidden"))).toBe(
      "Only project owners and admins can manage health checks."
    );
    expect(getAvailabilityErrorMessage(new Error("unknown"))).toBe(
      "Could not complete the health-check request."
    );
    expect(getAvailabilityErrorMessage("unknown")).toBe("Could not complete the health-check request.");
  });

  it("formats dates as non-empty user-facing strings", () => {
    expect(formatDateTime("2026-06-15T10:00:00.000Z")).not.toHaveLength(0);
    expect(formatDay("2026-06-15")).not.toHaveLength(0);
  });
});
