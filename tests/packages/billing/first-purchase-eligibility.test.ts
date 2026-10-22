import { describe, expect, it } from "vitest";
import { getFirstPurchaseEligibility } from "../../../packages/shared-types/src/first-purchase-eligibility.js";

const startedAt = "2026-10-22T15:00:00.000Z";
const unlockAt = "2026-10-29T15:00:00.000Z";

describe("first paid purchase eligibility", () => {
  it("requires seven complete 24-hour days, including across a daylight-saving change", () => {
    const input = { trial_started_at: startedAt, previously_paid: false };
    expect(getFirstPurchaseEligibility(input, Date.parse(unlockAt) - 1)).toEqual({
      allowed: false,
      unlocks_at: unlockAt
    });
    expect(getFirstPurchaseEligibility(input, Date.parse(unlockAt))).toEqual({
      allowed: true,
      unlocks_at: unlockAt
    });
    expect(
      getFirstPurchaseEligibility(
        { ...input, trial_started_at: "2026-10-22T17:00:00+02:00" },
        Date.parse(unlockAt)
      )
    ).toEqual({ allowed: true, unlocks_at: unlockAt });
  });

  it.each([null, "", "invalid", "1", "2026-10-23T15:00:00Z"])(
    "fails closed for missing, malformed or future trial start %s",
    (trial_started_at) => {
      expect(
        getFirstPurchaseEligibility(
          { trial_started_at, previously_paid: false },
          Date.parse(startedAt)
        )
      ).toEqual({ allowed: false, unlocks_at: null });
    }
  );

  it("preserves previously paid billing without using customer creation as payment proof", () => {
    expect(
      getFirstPurchaseEligibility(
        { trial_started_at: null, previously_paid: true },
        Date.parse(startedAt)
      )
    ).toEqual({ allowed: true, unlocks_at: null });
    expect(
      getFirstPurchaseEligibility(
        { trial_started_at: startedAt, previously_paid: false },
        Number.NaN
      )
    ).toEqual({ allowed: false, unlocks_at: null });
  });
});
