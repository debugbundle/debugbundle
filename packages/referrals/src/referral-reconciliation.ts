import { z } from "zod";

export const ReferralReconciliationEventSchema = z
  .object({
    event_id: z.string().min(1).max(255),
    event_type: z.string().min(1).max(100),
    resource_type: z.enum([
      "invoice",
      "invoice_payment",
      "charge",
      "refund",
      "dispute",
      "credit_note",
      "checkout_session"
    ]),
    resource_id: z.string().min(1).max(255),
    provider_customer_id: z.string().min(1).max(255).nullable(),
    livemode: z.boolean(),
    provider_created_at: z.string().datetime()
  })
  .strict();
export type ReferralReconciliationEvent = z.infer<typeof ReferralReconciliationEventSchema>;
export const ReferralCustomerBindingSchema = z
  .object({
    provider_customer_id: z.string().min(1).max(255),
    organization_external_id: z.uuid(),
    owner_identity_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export type ReferralCustomerBinding = z.infer<typeof ReferralCustomerBindingSchema>;
export const ReferralReconciliationRecordSchema = ReferralReconciliationEventSchema.extend({
  organization_external_id: z.uuid().nullable(),
  owner_identity_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  status: z.enum(["pending", "completed"])
});
export type ReferralReconciliationRecord = z.infer<typeof ReferralReconciliationRecordSchema>;
