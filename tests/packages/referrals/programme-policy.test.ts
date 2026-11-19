import { describe, expect, it } from "vitest";
import {
  CreatorCodeSchema,
  ProgrammeDraftSchema,
  PublicOfferCodeSchema,
  OfferPolicySchema,
  OfferPercentageInputSchema,
  offerClaimDeadline,
  previewOfferPrice,
  programmeEarningsExamples,
  programmeAcceptsClaims,
  type OfferPolicy
} from "../../../packages/referrals/src/programme-policy.js";

const policy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-11-16T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: null,
  allow_early_purchase_grants: false,
  terms_version: "referrals-2026-11-v2"
};

describe("creator codes", () => {
  it("normalises one memorable code without accepting invisible or encoded alternatives", () => {
    expect(CreatorCodeSchema.parse(" owen20 ")).toBe("OWEN20");
    expect(CreatorCodeSchema.parse("Owen-20")).toBe("OWEN-20");
    for (const code of [
      "aa",
      "a".repeat(25),
      "a b",
      "-abc",
      "abc-",
      "a--b",
      "ＯWEN20",
      "a/b",
      "a%2fb",
      "ab\u200bc"
    ])
      expect(CreatorCodeSchema.safeParse(code).success, code).toBe(false);
  });
  it("protects official names and the legacy namespace", () => {
    for (const code of ["ADMIN", "Support", "debugbundle", "DEBUGBUNDLE20", "D2QM7UBHMH"])
      expect(CreatorCodeSchema.safeParse(code).success, code).toBe(false);
  });
});

it("accepts an operator's chosen promotional code in the draft without opening the creator namespace", () => {
  const draft = {
    name: "Black Friday",
    public_description: "First invoice savings",
    policy: { ...policy, kind: "promotion", commission_basis_points: 0 },
    promotion_code: " blckfryd26 "
  };
  expect(ProgrammeDraftSchema.parse(draft)).toMatchObject({ promotion_code: "BLCKFRYD26" });
  expect(CreatorCodeSchema.safeParse("BLCKFRYD26").success).toBe(false);
  for (const promotion_code of ["ADMIN", "DEBUGBUNDLE20", "a/b", "ß20", "a".repeat(25)])
    expect(ProgrammeDraftSchema.safeParse({ ...draft, promotion_code }).success).toBe(false);
  expect(ProgrammeDraftSchema.safeParse({ ...draft, policy }).success).toBe(false);
  const legacyDraft = {
    name: draft.name,
    public_description: draft.public_description,
    policy: draft.policy
  };
  expect(ProgrammeDraftSchema.safeParse(legacyDraft).success).toBe(true);
});

describe("frozen introductory policy", () => {
  it("projects selected catalogue examples and leaves shorter annual earnings date-dependent", () => {
    const selected: OfferPolicy = {
      ...policy,
      eligible_plans: ["team"],
      commission_basis_points: 6667,
      discount_basis_points: 1250,
      commission_months: 6
    };
    expect(
      programmeEarningsExamples(selected, (_plan, interval) =>
        interval === "month" ? 1900 : 19200
      )
    ).toEqual([
      {
        plan: "team",
        interval: "month",
        baseMinor: 1900,
        payableMinor: 1662,
        commissionMinor: 1108
      },
      {
        plan: "team",
        interval: "year",
        baseMinor: 19200,
        payableMinor: 16800,
        commissionMinor: null
      }
    ]);
  });
  it("converts exact two-decimal percentages without float artefacts or silent truncation", () => {
    for (const [percentage, bps] of [
      ["0", 0],
      ["50.01", 5001],
      ["66.67", 6667],
      ["99.99", 9999],
      ["100", 10000]
    ] as const)
      expect(OfferPercentageInputSchema.parse(percentage)).toBe(bps);
    for (const value of ["", "-1", "100.01", "101", "50.001", "1e2", "NaN"])
      expect(OfferPercentageInputSchema.safeParse(value).success).toBe(false);
  });
  it("rejects duplicate scope, unlimited percentages and unsupported financial policies", () => {
    for (const change of [
      { eligible_plans: ["solo", "solo"] },
      { eligible_intervals: [] },
      { discount_basis_points: 10000 },
      { discount_basis_points: 0 },
      { commission_basis_points: 10001 },
      { commission_basis_points: -1 },
      { commission_months: 13 },
      { claims_end_at: "2026-11-15T00:00:00.000Z" },
      { kind: "promotion", commission_basis_points: 5000 },
      { forever: true }
    ])
      expect(OfferPolicySchema.safeParse({ ...policy, ...change }).success).toBe(false);
  });
  it.each([0, 5001, 7500, 9999, 10000])(
    "allows a %i basis-point commission without a negative retained share after discounts",
    (rate) => {
      const selected = { ...policy, commission_basis_points: rate };
      expect(OfferPolicySchema.parse(selected).commission_basis_points).toBe(rate);
      for (const base of [1, 3, 101, 500, 1900, 5900, 4800, 19200, 58800]) {
        const price = previewOfferPrice(base, selected);
        expect(price.estimated_commission_minor).toBeLessThanOrEqual(price.payable_minor);
        expect(price.payable_minor - price.estimated_commission_minor).toBeGreaterThanOrEqual(0);
      }
      expect(previewOfferPrice(10000, { ...selected, discount_basis_points: 2000 })).toMatchObject({
        payable_minor: 8000,
        estimated_commission_minor: Math.floor((8000 * rate + 5000) / 10000)
      });
    }
  );
  it("uses an inclusive start and exclusive end and reserves capacity at claim", () => {
    const end = "2026-11-17T00:00:00.000Z";
    const limited = { ...policy, claims_end_at: end, max_claims: 1 };
    expect(programmeAcceptsClaims(limited, "active", 0, Date.parse(policy.claims_start_at))).toBe(
      true
    );
    expect(programmeAcceptsClaims(limited, "active", 1, Date.parse(policy.claims_start_at))).toBe(
      false
    );
    expect(programmeAcceptsClaims(limited, "paused", 0, Date.parse(policy.claims_start_at))).toBe(
      false
    );
    expect(
      programmeAcceptsClaims(limited, "scheduled", 0, Date.parse(policy.claims_start_at))
    ).toBe(true);
    expect(programmeAcceptsClaims(limited, "active", 0, Date.parse(end))).toBe(false);
    expect(programmeAcceptsClaims(limited, "active", 0, Number.NaN)).toBe(false);
  });
  it("keeps referrals non-expiring and gives campaigns at least a full trial plus grace", () => {
    const now = Date.parse("2026-11-16T00:00:00.000Z");
    expect(offerClaimDeadline(policy, now, null)).toBeNull();
    const campaign = {
      ...policy,
      kind: "promotion" as const,
      commission_basis_points: 0,
      redeem_by: "2026-11-20T00:00:00.000Z"
    };
    expect(offerClaimDeadline(campaign, now, null)).toBe("2026-12-23T00:00:00.000Z");
    expect(offerClaimDeadline(campaign, now, "2026-12-01T00:00:00.000Z")).toBe(
      "2026-12-08T00:00:00.000Z"
    );
    expect(
      offerClaimDeadline({ ...campaign, redeem_by: "2027-01-01T00:00:00.000Z" }, now, null)
    ).toBe("2027-01-01T00:00:00.000Z");
  });
  it.each([
    [500, 400, 200],
    [1900, 1520, 760],
    [5900, 4720, 2360],
    [4800, 3840, 1920],
    [19200, 15360, 7680],
    [58800, 47040, 23520]
  ])("keeps the quote and commission example exact for %i minor units", (base, paid, earned) => {
    expect(previewOfferPrice(base, policy)).toEqual({
      base_minor: base,
      discount_minor: base - paid,
      payable_minor: paid,
      estimated_commission_minor: earned
    });
  });
  it("rounds integer money once and never discounts capacity", () => {
    expect(previewOfferPrice(101, policy)).toMatchObject({
      discount_minor: 20,
      payable_minor: 81,
      estimated_commission_minor: 41
    });
    expect(() => previewOfferPrice(-1, policy)).toThrow();
    expect(() => previewOfferPrice(Number.MAX_SAFE_INTEGER, policy)).toThrow();
  });
});

it("rejects non-ASCII characters before Unicode uppercasing can fold them into a real code", () => {
  for (const code of ["ß20", "ſale20", "ı20", "ﬀ20"])
    for (const schema of [CreatorCodeSchema, PublicOfferCodeSchema])
      expect(schema.safeParse(code).success, code).toBe(false);
});
