import { expect, it } from "vitest";
import { preferOffer } from "../../../packages/referrals/src/offer-choice.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
const referral = { code: "CREATOR20", available: true, version: offerVersion };
const promotion = (discount: number) => ({
  code: "SALE30",
  available: true,
  version: {
    ...offerVersion,
    policy: {
      ...offerVersion.policy,
      kind: "promotion" as const,
      commission_basis_points: 0,
      discount_basis_points: discount
    }
  }
});
it("prefers the lowest eligible amount and the referral on a money tie", () => {
  const selection = { target_plan: "solo" as const, interval: "month" as const };
  expect(preferOffer(referral, promotion(3000), selection)?.code).toBe("SALE30");
  expect(preferOffer(promotion(2000), referral, selection)?.code).toBe("CREATOR20");
  expect(preferOffer(referral, promotion(2001), selection)?.code).toBe("CREATOR20");
  expect(preferOffer(referral, promotion(1000), selection)?.code).toBe("CREATOR20");
});
it("never trades away eligible scope before a plan is selected", () => {
  const solo = promotion(5000);
  solo.version.policy = { ...solo.version.policy, eligible_plans: ["solo"] };
  expect(preferOffer(referral, solo)?.code).toBe("CREATOR20");
  expect(preferOffer(referral, solo, { target_plan: "solo", interval: "month" })?.code).toBe(
    "SALE30"
  );
  expect(preferOffer(referral, solo, { target_plan: "team", interval: "month" })?.code).toBe(
    "CREATOR20"
  );
  expect(preferOffer(referral, { ...promotion(5000), available: false })?.code).toBe("CREATOR20");
});
