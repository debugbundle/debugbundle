import { z } from "zod";

/** Private Vite simulator controls; never a production billing interface. */
export const BillingPreviewScenarioSchema = z
  .object({
    plan: z.enum(["free", "solo", "team", "business"]),
    interval: z.enum(["month", "year"]),
    mode: z.enum(["paid", "complimentary", "trial", "trial_locked"]),
    additional_capacity_units: z.number().int().min(0).max(99)
  })
  .strict();
export type BillingPreviewScenario = z.infer<typeof BillingPreviewScenarioSchema>;
export const BillingPreviewCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), scenario: BillingPreviewScenarioSchema }).strict(),
  z.object({ action: z.enum(["renew", "cancel", "resume"]) }).strict()
]);
export const BillingPreviewStateSchema = z
  .object({
    scenario: BillingPreviewScenarioSchema,
    cancellation_scheduled: z.boolean()
  })
  .strict();
