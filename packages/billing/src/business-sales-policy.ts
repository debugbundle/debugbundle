import type { PaidTierName, TierName } from "../../shared-types/src/index.js";
/** New enrolment is a separate launch decision. A valid paid subscription,
 * renewal, archive or already admitted payment is not revoked by this switch. */
export function businessSalesReady(input: {
  launch: boolean;
  reports: boolean;
  ai: boolean;
}): boolean {
  return input.launch && input.reports && input.ai;
}
export function canStartBusinessSale(input: {
  enabled: boolean;
  current_plan?: TierName;
  target_plan: PaidTierName;
}): boolean {
  return input.target_plan !== "business" || input.current_plan === "business" || input.enabled;
}
