import { expect, it } from "vitest";
import {
  nextReportSchedule,
  reportDeliveryAt
} from "../../../packages/smart-reports/src/report-schedule.js";
import { lastCompletedReportPeriod } from "../../../packages/smart-reports/src/report-period.js";
it("never sends a calendar report before its UTC period closes in a positive-offset timezone", () => {
  const result = nextReportSchedule({
    cadence: "monthly",
    schedule: { time: "09:00", timezone: "Pacific/Auckland" },
    after: "2026-10-31T12:00:00.000Z"
  });
  expect(result).toMatchObject({
    period: { starts_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-11-01T00:00:00.000Z" },
    due_at: "2026-11-01T20:00:00.000Z"
  });
});
it("advances a skipped local delivery time to the first valid minute", () => {
  const period = lastCompletedReportPeriod("daily", "2026-03-08T00:00:00.000Z");
  expect(
    reportDeliveryAt({ period, schedule: { time: "02:30", timezone: "America/New_York" } })
  ).toBe("2026-03-08T07:00:00.000Z");
});
it("uses only the first repeated local time for a period", () => {
  const period = lastCompletedReportPeriod("daily", "2026-11-01T00:00:00.000Z");
  expect(
    reportDeliveryAt({ period, schedule: { time: "01:30", timezone: "America/New_York" } })
  ).toBe("2026-11-01T05:30:00.000Z");
  const next = nextReportSchedule({
    cadence: "daily",
    schedule: { time: "01:30", timezone: "America/New_York" },
    after: "2026-11-01T05:31:00.000Z"
  });
  expect(next).toMatchObject({
    period: { ends_at: "2026-11-02T00:00:00.000Z" },
    due_at: "2026-11-02T06:30:00.000Z"
  });
});
it("chooses the next future delivery while keeping its closed period identity", () => {
  expect(
    nextReportSchedule({
      cadence: "weekly",
      schedule: { time: "09:00", timezone: "Europe/Ljubljana" },
      after: "2026-11-09T07:30:00.000Z"
    })
  ).toMatchObject({
    period: { ends_at: "2026-11-09T00:00:00.000Z" },
    due_at: "2026-11-09T08:00:00.000Z"
  });
  expect(
    nextReportSchedule({
      cadence: "weekly",
      schedule: { time: "09:00", timezone: "Europe/Ljubljana" },
      after: "2026-11-09T08:00:00.000Z"
    })
  ).toMatchObject({
    period: { ends_at: "2026-11-16T00:00:00.000Z" },
    due_at: "2026-11-16T08:00:00.000Z"
  });
});
