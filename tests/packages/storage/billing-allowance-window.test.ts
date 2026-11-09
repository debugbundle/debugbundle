import { describe, expect, it } from "vitest";
import { resolveBillingUsageWindow } from "../../../packages/storage/src/billing-allowance-window.js";

const annual = (
  now: string,
  starts = "2026-01-31T13:42:00.000Z",
  ends = "2027-01-31T13:42:00.000Z",
  anchor = starts
) =>
  resolveBillingUsageWindow({
    now: new Date(now),
    plan: "business",
    billing_interval: "year",
    billing_period_starts_at: starts,
    billing_period_ends_at: ends,
    billing_allowance_anchor_at: anchor
  });

describe("monthly allowance windows within paid terms", () => {
  it("clamps short months from the original day without accumulating drift", () => {
    expect(annual("2026-02-28T13:42:00.000Z")).toEqual({
      starts_at: "2026-02-28T13:42:00.000Z",
      ends_at: "2026-03-31T13:42:00.000Z"
    });
    expect(annual("2026-04-30T14:00:00.000Z")).toEqual({
      starts_at: "2026-04-30T13:42:00.000Z",
      ends_at: "2026-05-31T13:42:00.000Z"
    });
  });

  it("uses half-open windows at the exact reset instant", () => {
    expect(annual("2026-02-28T13:41:59.999Z").ends_at).toBe("2026-02-28T13:42:00.000Z");
    expect(annual("2026-02-28T13:42:00.000Z").starts_at).toBe("2026-02-28T13:42:00.000Z");
  });

  it("preserves a leap-day anchor through later annual renewals", () => {
    expect(
      annual(
        "2027-03-28T00:00:00.000Z",
        "2027-02-28T00:00:00.000Z",
        "2028-02-29T00:00:00.000Z",
        "2024-02-29T00:00:00.000Z"
      )
    ).toEqual({ starts_at: "2027-02-28T00:00:00.000Z", ends_at: "2027-03-29T00:00:00.000Z" });
  });

  it("does not invent a renewed paid window before provider reconciliation", () => {
    expect(annual("2027-02-02T00:00:00.000Z")).toEqual({
      starts_at: "2026-12-31T13:42:00.000Z",
      ends_at: "2027-01-31T13:42:00.000Z"
    });
  });

  it("keeps legacy monthly periods byte-identical and free windows calendar-based", () => {
    const input = {
      now: new Date("2026-03-24T12:00:00.000Z"),
      billing_period_starts_at: "2026-03-23T00:00:00Z",
      billing_period_ends_at: "2026-04-23T00:00:00Z"
    };
    expect(resolveBillingUsageWindow({ ...input, plan: "solo" })).toEqual({
      starts_at: input.billing_period_starts_at,
      ends_at: input.billing_period_ends_at
    });
    expect(resolveBillingUsageWindow({ ...input, plan: "free" })).toEqual({
      starts_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-04-01T00:00:00.000Z"
    });
  });

  it("uses calendar fallback for absent/invalid provider dates without mutating them", () => {
    expect(
      resolveBillingUsageWindow({
        now: new Date("2026-03-24T12:00:00Z"),
        plan: "solo",
        billing_period_starts_at: "invalid",
        billing_period_ends_at: "2026-04-01"
      })
    ).toEqual({ starts_at: "2026-03-01T00:00:00.000Z", ends_at: "2026-04-01T00:00:00.000Z" });
  });
});
