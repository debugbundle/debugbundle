import { expect, it } from "vitest";
import {
  lastCompletedReportPeriod,
  previousReportPeriod,
  compareReportMetric
} from "../../../packages/smart-reports/src/report-period.js";

it.each([
  ["daily", "2026-11-07T23:45:00.000Z", "2026-11-06T00:00:00.000Z", "2026-11-07T00:00:00.000Z", 1],
  ["weekly", "2026-11-08T23:59:59.000Z", "2026-10-26T00:00:00.000Z", "2026-11-02T00:00:00.000Z", 7],
  ["weekly", "2026-11-09T00:00:00.000Z", "2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z", 7],
  [
    "monthly",
    "2028-03-01T00:00:00.000Z",
    "2028-02-01T00:00:00.000Z",
    "2028-03-01T00:00:00.000Z",
    29
  ],
  [
    "monthly",
    "2100-03-31T12:30:00.000Z",
    "2100-02-01T00:00:00.000Z",
    "2100-03-01T00:00:00.000Z",
    28
  ],
  [
    "monthly",
    "2027-01-01T00:00:00.000Z",
    "2026-12-01T00:00:00.000Z",
    "2027-01-01T00:00:00.000Z",
    31
  ]
] as const)("uses complete UTC %s periods at %s", (kind, now, start, end, days) => {
  expect(lastCompletedReportPeriod(kind, now)).toEqual({
    kind,
    starts_at: start,
    ends_at: end,
    duration_days: days
  });
});
it("uses the whole previous calendar month, rather than subtracting an equal number of days", () => {
  const current = lastCompletedReportPeriod("monthly", "2028-04-01T00:00:00.000Z");
  const previous = previousReportPeriod(current);
  expect(previous).toMatchObject({
    starts_at: "2028-02-01T00:00:00.000Z",
    ends_at: "2028-03-01T00:00:00.000Z",
    duration_days: 29
  });
  expect(
    compareReportMetric({
      current: 310,
      previous: 290,
      current_period: current,
      previous_period: previous,
      current_complete: true,
      previous_complete: true
    })
  ).toEqual({
    comparison_available: true,
    absolute_change: 20,
    percent_change: (100 * 20) / 290,
    current_per_day: 10,
    previous_per_day: 10,
    unequal_period_lengths: true
  });
});
it("does not interpret absent or incomplete history as zero activity", () => {
  const current = lastCompletedReportPeriod("weekly", "2026-11-09T00:00:00.000Z"),
    previous = previousReportPeriod(current);
  expect(
    compareReportMetric({
      current: 10,
      previous: 0,
      current_period: current,
      previous_period: previous,
      current_complete: true,
      previous_complete: false
    })
  ).toMatchObject({
    comparison_available: false,
    absolute_change: null,
    percent_change: null,
    previous_per_day: null
  });
});
it("does not manufacture an infinite percentage when the previous complete period has zero", () => {
  const current = lastCompletedReportPeriod("daily", "2026-11-07T00:00:00.000Z"),
    previous = previousReportPeriod(current);
  expect(
    compareReportMetric({
      current: 3,
      previous: 0,
      current_period: current,
      previous_period: previous,
      current_complete: true,
      previous_complete: true
    })
  ).toMatchObject({ comparison_available: true, absolute_change: 3, percent_change: null });
});
it("rejects invented period shapes, mismatched comparisons and non-finite counts", () => {
  const current = lastCompletedReportPeriod("monthly", "2026-11-07T00:00:00.000Z"),
    previous = previousReportPeriod(current);
  expect(() =>
    previousReportPeriod({ ...current, starts_at: "2026-10-02T00:00:00.000Z" })
  ).toThrow();
  expect(() =>
    compareReportMetric({
      current: NaN,
      previous: 0,
      current_period: current,
      previous_period: previous,
      current_complete: true,
      previous_complete: true
    })
  ).toThrow();
  expect(() =>
    compareReportMetric({
      current: 1,
      previous: 0,
      current_period: current,
      previous_period: current,
      current_complete: true,
      previous_complete: true
    })
  ).toThrow();
  expect(() => lastCompletedReportPeriod("daily", "invalid")).toThrow();
});
