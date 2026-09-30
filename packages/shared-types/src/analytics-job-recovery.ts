import { z } from "zod";

export const AnalyticsSemanticJobRetryResponseSchema = z
  .object({
    project_id: z.string().uuid(),
    event_id: z.string().uuid(),
    status: z.literal("queued")
  })
  .strict();
export type AnalyticsSemanticJobRetryResponse = z.infer<
  typeof AnalyticsSemanticJobRetryResponseSchema
>;
