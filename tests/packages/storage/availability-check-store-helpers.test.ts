import { describe, expect, it, vi } from "vitest";

import {
  availabilityCheckDayBucket,
  buildPlanEligibilityCaseSql,
  computeAvailabilityCheckNextScheduledAt,
  deriveAvailabilityCheckDailyState,
  getPlanCheckLimit,
  getPlanMinIntervalSeconds,
  mapAvailabilityCheckRow,
  normalizeAvailabilityCheckPlan,
  projectExistsForAvailabilityChecks
} from "../../../packages/storage/src/availability-check-store-helpers.js";

const baseRow = {
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
  base_status: "passing",
  within_plan_limit: true,
  meets_plan_interval: true,
  organization_plan: "solo",
  consecutive_failures: 0,
  consecutive_successes: 7,
  linked_incident_id: null,
  linked_incident_status: null,
  last_checked_at: "2026-06-15T10:00:00.000Z",
  next_check_at: "2026-06-15T10:01:00.000Z",
  last_result_status: "success",
  last_result_http_status: 200,
  last_result_error_kind: null,
  last_result_error_message: null,
  last_result_duration_ms: 180,
  created_at: "2026-06-15T09:00:00.000Z",
  updated_at: "2026-06-15T10:00:00.000Z"
};

describe("availability check store helpers", () => {
  it("normalizes plan names and returns tier-specific availability limits", () => {
    expect(normalizeAvailabilityCheckPlan("solo")).toBe("solo");
    expect(normalizeAvailabilityCheckPlan("team")).toBe("team");
    expect(normalizeAvailabilityCheckPlan("enterprise")).toBe("free");
    expect(getPlanCheckLimit("free")).toBe(1);
    expect(getPlanCheckLimit("solo")).toBe(3);
    expect(getPlanCheckLimit("team")).toBe(8);
    expect(getPlanMinIntervalSeconds("free")).toBe(300);
    expect(getPlanMinIntervalSeconds("solo")).toBe(60);
    expect(getPlanMinIntervalSeconds("team")).toBe(30);
  });

  it("builds plan eligibility SQL for check counts and intervals", () => {
    expect(buildPlanEligibilityCaseSql("limit")).toContain("WHEN 'team' THEN 8");
    expect(buildPlanEligibilityCaseSql("limit")).toContain("ELSE 1");
    expect(buildPlanEligibilityCaseSql("interval")).toContain("WHEN 'solo' THEN 60");
    expect(buildPlanEligibilityCaseSql("interval")).toContain("ELSE 300");
  });

  it("maps rows into user-visible check status with pause reasons", () => {
    expect(mapAvailabilityCheckRow(baseRow)).toEqual(
      expect.objectContaining({
        check_id: "chk_1",
        status: "passing",
        paused_reason: null,
        service_name: "web",
        organization_plan: "solo",
        linked_incident_status: null,
        last_result_status: "success",
        last_result_http_status: 200
      })
    );

    expect(mapAvailabilityCheckRow({ ...baseRow, enabled: false })).toEqual(
      expect.objectContaining({ status: "paused", paused_reason: "disabled" })
    );
    expect(mapAvailabilityCheckRow({ ...baseRow, within_plan_limit: false })).toEqual(
      expect.objectContaining({ status: "paused", paused_reason: "plan_check_limit_exceeded" })
    );
    expect(mapAvailabilityCheckRow({ ...baseRow, meets_plan_interval: false })).toEqual(
      expect.objectContaining({ status: "paused", paused_reason: "plan_interval_too_low" })
    );
    expect(
      mapAvailabilityCheckRow({
        ...baseRow,
        service_name: null,
        organization_plan: "unknown",
        last_checked_at: null,
        next_check_at: null,
        last_result_status: null,
        last_result_http_status: null,
        last_result_error_kind: null,
        last_result_error_message: null,
        last_result_duration_ms: null
      })
    ).toEqual(
      expect.objectContaining({
        service_name: null,
        organization_plan: "free",
        last_checked_at: null,
        next_check_at: null,
        last_result_status: null,
        last_result_http_status: null
      })
    );
  });

  it("derives daily rollup states from execution results", () => {
    expect(
      deriveAvailabilityCheckDailyState({
        status: "success",
        http_status: 200,
        duration_ms: 10,
        error_kind: null,
        error_message: null,
        checked_url_host: "app.example.com",
        checked_url_path: "/health",
        checked_url_query: {},
        final_url: "https://app.example.com/health",
        redirect_count: 0
      })
    ).toBe("operational");
    expect(
      deriveAvailabilityCheckDailyState({
        status: "http_status_mismatch",
        http_status: 404,
        duration_ms: 10,
        error_kind: "http_status_mismatch",
        error_message: "not found",
        checked_url_host: "app.example.com",
        checked_url_path: "/health",
        checked_url_query: {},
        final_url: "https://app.example.com/health",
        redirect_count: 0
      })
    ).toBe("degraded");
    expect(
      deriveAvailabilityCheckDailyState({
        status: "timeout",
        http_status: null,
        duration_ms: 5000,
        error_kind: "timeout",
        error_message: "timed out",
        checked_url_host: "app.example.com",
        checked_url_path: "/health",
        checked_url_query: {},
        final_url: "https://app.example.com/health",
        redirect_count: 0
      })
    ).toBe("degraded");
  });

  it("computes schedule and day buckets from execution timestamps", () => {
    expect(
      computeAvailabilityCheckNextScheduledAt({
        previous_scheduled_for: "2026-06-15T10:00:00.000Z",
        completed_at: "2026-06-15T10:02:30.000Z",
        interval_seconds: 60
      })
    ).toBe("2026-06-15T10:03:00.000Z");
    expect(availabilityCheckDayBucket("2026-06-15T23:59:59.999Z")).toBe("2026-06-15");
  });

  it("loads project availability metadata with safe defaults", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ environment_default: null, organization_plan: "team" }] })
        .mockResolvedValueOnce({ rows: [{ environment_default: "staging", organization_plan: "unknown" }] })
    };

    await expect(
      projectExistsForAvailabilityChecks(db, {
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toBeNull();
    await expect(
      projectExistsForAvailabilityChecks(db, {
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toEqual({ environment_default: "production", organization_plan: "team" });
    await expect(
      projectExistsForAvailabilityChecks(db, {
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toEqual({ environment_default: "staging", organization_plan: "free" });
  });
});
