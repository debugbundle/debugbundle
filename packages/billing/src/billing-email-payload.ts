import { z } from "zod";

export const BillingLifecycleEmailPayloadSchema = z
  .object({
    subject: z.string().min(1).max(500),
    text: z.string().max(64_000),
    html: z.string().max(128_000)
  })
  .strict();
