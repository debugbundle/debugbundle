import { z } from "zod";
import { PublicOfferCodeSchema } from "./programme-policy.js";

/** Signed public provenance only; never expose internal creator/payment identity. */
export const OfferClaimSourceSchema = z
  .object({
    attribution_id: z.uuid().nullable(),
    partner_code: PublicOfferCodeSchema.nullable()
  })
  .strict()
  .refine(
    (value) => (value.attribution_id === null) === (value.partner_code === null),
    "incomplete_attribution_source"
  );
export type OfferClaimSource = z.infer<typeof OfferClaimSourceSchema>;
export const NewOfferClaimSchema = OfferClaimSourceSchema.safeExtend({ claim_id: z.uuid() });
