import { describe, expect, it } from "vitest";

import {
  buildHealthStatusDayRange,
  buildHealthStatusProjects,
  formatStatusDayLabel,
  formatStatusUptime
} from "../../../apps/web/src/pages/health-status-page-utils.js";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckRecord,
  ProjectRecord
} from "../../../apps/web/src/lib/api.js";

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    project_id: "proj_1",
    organization_id: "org_1",
    name: "Primary app",
    slug: "primary-app",
    environment_default: "production",
    organization_plan: "team",
    metrics: {
      open_incidents: 0,
      regressed_incidents: 0,
      opened_incidents_today: 0,
      opened_incidents_month: 0,
      monthly_bundle_requests: 0,
      monthly_raw_ingested_events: 0,
      retained_bundles: 0,
      monthly_alert_deliveries: 0
    },
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function buildCheck(overrides: Partial<AvailabilityCheckRecord> = {}): AvailabilityCheckRecord {
  return {
    check_id: "chk_1",
    project_id: "proj_1",
    name: "Primary app",
    url: "https://app.example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    failure_threshold: 3,
    recovery_threshold: 2,
    environment: "production",
    service_name: "web",
    enabled: true,
    status: "passing",
    paused_reason: null,
    organization_plan: "team",
    consecutive_failures: 0,
    consecutive_successes: 4,
    linked_incident_id: null,
    last_checked_at: "2026-06-15T10:00:00.000Z",
    next_check_at: "2026-06-15T10:01:00.000Z",
    last_result_status: "success",
    last_result_http_status: 200,
    last_result_error_kind: null,
    last_result_error_message: null,
    last_result_duration_ms: 180,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
    ...overrides
  };
}

function buildRollup(
  overrides: Partial<AvailabilityCheckDailyRollupRecord> = {}
): AvailabilityCheckDailyRollupRecord {
  return {
    check_id: "chk_1",
    project_id: "proj_1",
    day: "2026-06-15",
    state: "operational",
    total_checks: 10,
    successful_checks: 10,
    failed_checks: 0,
    degraded_checks: 0,
    avg_duration_ms: 180,
    first_checked_at: "2026-06-15T00:00:00.000Z",
    last_checked_at: "2026-06-15T23:00:00.000Z",
    downtime_seconds: 0,
    incident_ids: [],
    ...overrides
  };
}

describe("health status helpers", () => {
  it("builds a UTC 30-day range ending on the provided day", () => {
    expect(buildHealthStatusDayRange(new Date("2026-06-16T18:30:00.000Z"), 3)).toEqual([
      "2026-06-14",
      "2026-06-15",
      "2026-06-16"
    ]);
  });

  it("groups checks by project and fills missing days as unknown", () => {
    const project = buildProject();
    const check = buildCheck();
    const summaries = buildHealthStatusProjects(
      [
        {
          project,
          checks: [check],
          rollupsByCheckId: new Map([
            [
              check.check_id,
              [
                buildRollup({
                  day: "2026-06-15",
                  total_checks: 10,
                  successful_checks: 9,
                  failed_checks: 1,
                  downtime_seconds: 60,
                  state: "down"
                })
              ]
            ]
          ])
        }
      ],
      ["2026-06-14", "2026-06-15", "2026-06-16"]
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.checks[0]?.days).toEqual([
      expect.objectContaining({ day: "2026-06-14", state: "unknown", total_checks: 0 }),
      expect.objectContaining({ day: "2026-06-15", state: "down", failed_checks: 1 }),
      expect.objectContaining({ day: "2026-06-16", state: "unknown", total_checks: 0 })
    ]);
    expect(summaries[0]?.uptime_percentage).toBe(90);
  });

  it("uses worst project state and counts active linked availability incidents", () => {
    const project = buildProject();
    const summaries = buildHealthStatusProjects(
      [
        {
          project,
          checks: [
            buildCheck({ check_id: "chk_ok", status: "passing", linked_incident_id: null }),
            buildCheck({ check_id: "chk_down", status: "failing", linked_incident_id: "inc_1" })
          ],
          rollupsByCheckId: new Map([
            ["chk_ok", [buildRollup({ check_id: "chk_ok", state: "operational" })]],
            ["chk_down", [buildRollup({ check_id: "chk_down", state: "degraded", degraded_checks: 2 })]]
          ])
        }
      ],
      ["2026-06-15"]
    );

    expect(summaries[0]?.current_state).toBe("down");
    expect(summaries[0]?.active_incident_count).toBe(1);
    expect(summaries[0]?.days[0]).toEqual(expect.objectContaining({ state: "degraded" }));
  });

  it("formats uptime and accessible day labels", () => {
    expect(formatStatusUptime(null)).toBe("No data");
    expect(formatStatusUptime(100)).toBe("100%");
    expect(formatStatusUptime(99.987)).toBe("99.99%");
    expect(
      formatStatusDayLabel(
        buildRollup({
          day: "2026-06-15",
          state: "degraded",
          total_checks: 12,
          failed_checks: 2,
          downtime_seconds: 120
        })
      )
    ).toContain("degraded, 2 failed of 12 checks, 2m downtime");
  });
});
