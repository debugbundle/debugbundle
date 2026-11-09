import type { PaidTierName, TierName } from "../../shared-types/src/index.js";

/** Trial conversion is a purchase, while an active paid interval change uses renewal. */
export function canCheckoutToBillingPlan(
  billing: {
    plan: TierName;
    trial?: { active?: boolean; plan?: "solo" | "team" | "business" | null };
  },
  target: PaidTierName
): boolean {
  if (billing.trial?.active)
    return (
      billing.trial.plan === "solo" ||
      (billing.trial.plan === "team" && target !== "solo") ||
      (billing.trial.plan === "business" && target === "business")
    );
  if (billing.plan === "free") return true;
  if (billing.plan === "solo") return target === "team" || target === "business";
  return billing.plan === "team" && target === "business";
}
