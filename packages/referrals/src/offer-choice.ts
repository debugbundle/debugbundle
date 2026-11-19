import { z } from "zod";
import { getBillingCatalogPrice } from "../../shared-types/src/billing-catalog.js";
import {
  PaidOfferPlanSchema,
  OfferIntervalSchema,
  PublicOfferCodeSchema,
  previewOfferPrice,
  type OfferPolicy
} from "./programme-policy.js";

export const OfferPriceSelectionSchema = z
  .object({ target_plan: PaidOfferPlanSchema, interval: OfferIntervalSchema })
  .strict();
export type OfferPriceSelection = z.infer<typeof OfferPriceSelectionSchema>;
export const PublicOfferContextQuerySchema = OfferPriceSelectionSchema.partial()
  .extend({ code: PublicOfferCodeSchema.optional() })
  .strict()
  .refine(
    (value) => (value.target_plan === undefined) === (value.interval === undefined),
    "plan_and_interval_required_together"
  );
export interface OfferChoice {
  code: string;
  available: boolean;
  version: { policy: OfferPolicy };
}
export function offerCovers(policy: OfferPolicy, selection: OfferPriceSelection): boolean {
  return (
    policy.eligible_plans.includes(selection.target_plan) &&
    policy.eligible_intervals.includes(selection.interval)
  );
}
/** Compare actual rounded base amounts. Without a selection, preserve every
 * eligible plan/interval already offered rather than trading scope for a headline rate. */
export function preferOffer<T extends OfferChoice>(
  first: T | null,
  second: T | null,
  selection?: OfferPriceSelection
): T | null {
  const eligible = (offer: T | null): offer is T =>
    offer?.available === true && (!selection || offerCovers(offer.version.policy, selection));
  if (!eligible(second)) return eligible(first) ? first : null;
  if (!eligible(first)) return second;
  const a = first.version.policy,
    b = second.version.policy;
  if (
    !selection &&
    (!a.eligible_plans.every((plan) => b.eligible_plans.includes(plan)) ||
      !a.eligible_intervals.every((interval) => b.eligible_intervals.includes(interval)))
  )
    return first;
  const base = selection
    ? getBillingCatalogPrice(selection.target_plan, selection.interval, "plan").amount_minor
    : null;
  const firstCost =
    base === null ? -a.discount_basis_points : previewOfferPrice(base, a).payable_minor;
  const secondCost =
    base === null ? -b.discount_basis_points : previewOfferPrice(base, b).payable_minor;
  return secondCost < firstCost ||
    (secondCost === firstCost && b.kind === "referral" && a.kind !== "referral")
    ? second
    : first;
}
