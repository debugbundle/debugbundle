import { describe, expect, it } from "vitest";

import type { AvailabilityCheckRecord } from "../../../apps/web/src/lib/api.js";
import {
  availabilityResultVariant,
  availabilityStatusVariant,
  dailyStateClassName,
  dailyStateVariant,
  formatDailyStateLabel,
  formatAvailabilityStatus,
  formatDay,
  formatDateTime,
  formatDowntime,
  formatPausedReason,
  getDefaultAvailabilityCheckIntervalSeconds,
  getHealthChecksAutoRefreshIntervalMs,
  hasPendingInitialHealthCheckResult,
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
    expect(
      formatDailyStateLabel(
        {
          check_id: "check_1",
          project_id: "project_1",
          day: "2026-06-16",
          state: "degraded",
          total_checks: 10,
          successful_checks: 9,
          failed_checks: 1,
          degraded_checks: 1,
          avg_duration_ms: 123,
          first_checked_at: "2026-06-16T00:00:00.000Z",
          last_checked_at: "2026-06-16T01:00:00.000Z",
          downtime_seconds: 60,
          incident_ids: []
        },
        3
      )
    ).toBe("Brief interruption");
    expect(
      dailyStateClassName(
        {
          check_id: "check_1",
          project_id: "project_1",
          day: "2026-06-16",
          state: "degraded",
          total_checks: 10,
          successful_checks: 7,
          failed_checks: 3,
          degraded_checks: 3,
          avg_duration_ms: 123,
          first_checked_at: "2026-06-16T00:00:00.000Z",
          last_checked_at: "2026-06-16T01:00:00.000Z",
          downtime_seconds: 180,
          incident_ids: []
        },
        3
      )
    ).toBe("bg-warning text-warning-foreground");

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

  it("chooses a conservative default interval for new checks", () => {
    expect(getDefaultAvailabilityCheckIntervalSeconds(null)).toBe(300);
    expect(getDefaultAvailabilityCheckIntervalSeconds({ max_checks_per_project: 1, min_interval_seconds: 300 })).toBe(300);
    expect(getDefaultAvailabilityCheckIntervalSeconds({ max_checks_per_project: 5, min_interval_seconds: 60 })).toBe(60);
    expect(getDefaultAvailabilityCheckIntervalSeconds({ max_checks_per_project: 25, min_interval_seconds: 30 })).toBe(60);
  });

  it("derives auto-refresh from the smallest active health-check interval", () => {
    expect(getHealthChecksAutoRefreshIntervalMs(null)).toBeNull();
    expect(hasPendingInitialHealthCheckResult(null)).toBe(false);

    const baseCheck: AvailabilityCheckRecord = {
      check_id: "check_1",
      project_id: "project_1",
      name: "Primary API",
      url: "https://example.com/health",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5_000,
      interval_seconds: 60,
      failure_threshold: 3,
      recovery_threshold: 2,
      environment: "production",
      service_name: null,
      enabled: true,
      status: "passing",
      paused_reason: null,
      organization_plan: "solo",
      consecutive_failures: 0,
      consecutive_successes: 12,
      linked_incident_id: null,
      linked_incident_status: null,
      last_checked_at: null,
      next_check_at: null,
      last_result_status: "success",
      last_result_http_status: 200,
      last_result_error_kind: null,
      last_result_error_message: null,
      last_result_duration_ms: 123,
      created_at: "2026-06-16T10:00:00.000Z",
      updated_at: "2026-06-16T10:00:00.000Z"
    };

    expect(
      getHealthChecksAutoRefreshIntervalMs([
        { ...baseCheck, check_id: "check_paused", interval_seconds: 30, status: "paused" },
        { ...baseCheck, check_id: "check_disabled", interval_seconds: 45, enabled: false },
        { ...baseCheck, check_id: "check_slowest", interval_seconds: 300 },
        { ...baseCheck, check_id: "check_fastest", interval_seconds: 60 }
      ])
    ).toBe(60_000);
    expect(
      hasPendingInitialHealthCheckResult([
        { ...baseCheck, check_id: "check_pending", status: "unknown", last_checked_at: null, next_check_at: "2026-06-16T10:01:00.000Z" }
      ])
    ).toBe(true);

    expect(getHealthChecksAutoRefreshIntervalMs([{ ...baseCheck, interval_seconds: 10 }])).toBe(15_000);
    expect(
      getHealthChecksAutoRefreshIntervalMs([
        { ...baseCheck, check_id: "check_only_paused", status: "paused" },
        { ...baseCheck, check_id: "check_only_disabled", enabled: false }
      ])
    ).toBeNull();
    expect(
      hasPendingInitialHealthCheckResult([
        { ...baseCheck, check_id: "check_passing", last_checked_at: "2026-06-16T10:00:00.000Z", next_check_at: "2026-06-16T10:01:00.000Z" },
        { ...baseCheck, check_id: "check_disabled_pending", enabled: false, status: "unknown", next_check_at: "2026-06-16T10:01:00.000Z" }
      ])
    ).toBe(false);
  });
});
