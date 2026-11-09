import { expect, it } from "vitest";
import {
  forecastRemainingReportRuns,
  ReportAllowanceSchema
} from "../../../packages/smart-reports/src/report-allowance.js";
const definition = (cadence: "daily" | "weekly" | "monthly") => ({
  cadence,
  schedule: { time: "09:00", timezone: "UTC" },
  next_due_at:
    cadence === "daily"
      ? "2026-01-01T09:00:00.000Z"
      : cadence === "weekly"
        ? "2026-01-05T09:00:00.000Z"
        : "2026-01-01T09:00:00.000Z"
});
it("forecasts five daily schedules above the shared forty-run pool", () => {
  expect(
    forecastRemainingReportRuns({
      now: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-02-01T00:00:00.000Z",
      definitions: Array.from({ length: 5 }, () => definition("daily"))
    })
  ).toBe(155);
});
it("keeps daily, weekly and monthly schedules inside the same allowance", () => {
  expect(
    forecastRemainingReportRuns({
      now: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-02-01T00:00:00.000Z",
      definitions: [definition("daily"), definition("weekly"), definition("monthly")]
    })
  ).toBe(36);
});
it("counts one overdue run and excludes deliveries on the next window boundary", () => {
  expect(
    forecastRemainingReportRuns({
      now: "2026-01-31T10:00:00.000Z",
      ends_at: "2026-02-01T09:00:00.000Z",
      definitions: [definition("daily")]
    })
  ).toBe(1);
});
it("uses actual local delivery times across daylight saving without duplicates", () => {
  expect(
    forecastRemainingReportRuns({
      now: "2026-03-27T00:00:00.000Z",
      ends_at: "2026-03-31T00:00:00.000Z",
      definitions: [
        {
          cadence: "daily",
          schedule: { time: "02:30", timezone: "Europe/Ljubljana" },
          next_due_at: "2026-03-27T01:30:00.000Z"
        }
      ]
    })
  ).toBe(4);
});
it("rejects inconsistent remaining or warning arithmetic in public output", () => {
  expect(
    ReportAllowanceSchema.safeParse({
      organization_id: "00000000-0000-4000-8000-000000000001",
      as_of: "2026-01-01T00:00:00.000Z",
      window: { starts_at: "2026-01-01T00:00:00.000Z", ends_at: "2026-02-01T00:00:00.000Z" },
      limit: 40,
      used: 7,
      remaining: 40,
      scheduled_remaining: 155,
      scope_complete: true,
      schedule_exceeds_remaining: false
    }).success
  ).toBe(false);
});
