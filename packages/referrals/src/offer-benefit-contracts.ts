import { z } from "zod";
import { OfferPolicySchema } from "./programme-policy.js";

const id = z.string().min(1).max(255);
export const OfferBenefitRecoverySchema = z
  .object({
    organization_external_id: z.uuid(),
    claim_id: z.uuid(),
    version_id: z.uuid(),
    provider_customer_id: id,
    provider_subscription_id: id,
    coupon_id: id,
    invoice_id: id,
    requested_at: z.string().datetime(),
    livemode: z.boolean(),
    policy: OfferPolicySchema
  })
  .strict();
export type OfferBenefitRecovery = z.infer<typeof OfferBenefitRecoverySchema>;
