import { z } from "zod";
import { OfferIntervalSchema, PaidOfferPlanSchema } from "./programme-policy.js";
export const OfferQuoteSelectionSchema = z
  .object({
    target_plan: PaidOfferPlanSchema,
    interval: OfferIntervalSchema,
    additional_capacity_units: z.number().int().min(0).max(99).default(0)
  })
  .strict();
export const OfferPurchaseQuoteSchema = OfferQuoteSelectionSchema.extend({
  claim_id: z.uuid(),
  version_id: z.uuid(),
  currency: z.literal("usd"),
  base_minor: z.number().int().nonnegative(),
  discount_minor: z.number().int().nonnegative(),
  capacity_minor: z.number().int().nonnegative(),
  initial_total_minor: z.number().int().nonnegative(),
  renewal_total_minor: z.number().int().nonnegative(),
  tax_calculated_at_checkout: z.literal(true),
  expires_at: z.string().datetime(),
  confirmation_token: z.string().min(1).max(8192)
});
export type OfferPurchaseQuote = z.infer<typeof OfferPurchaseQuoteSchema>;
