import { z } from "zod";

export const AnalyticsSavedFunnelKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);

export const AnalyticsSavedFunnelStepSchema = z
  .object({
    step_key: AnalyticsSavedFunnelKeySchema,
    display_name: z.string().trim().min(1).max(120)
  })
  .strict();
export type AnalyticsSavedFunnelStep = z.infer<typeof AnalyticsSavedFunnelStepSchema>;

const AnalyticsSavedFunnelStepsSchema = z
  .array(AnalyticsSavedFunnelStepSchema)
  .min(2)
  .max(20)
  .superRefine((steps, context) => {
    const seen = new Set<string>();
    for (const [index, step] of steps.entries()) {
      if (seen.has(step.step_key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "step_key"],
          message: "Saved funnel step keys must be unique."
        });
      }
      seen.add(step.step_key);
    }
  });

export const AnalyticsSavedFunnelCreateSchema = z
  .object({
    funnel_key: AnalyticsSavedFunnelKeySchema,
    display_name: z.string().trim().min(1).max(120),
    steps: AnalyticsSavedFunnelStepsSchema
  })
  .strict();
export type AnalyticsSavedFunnelCreate = z.infer<typeof AnalyticsSavedFunnelCreateSchema>;

export const AnalyticsSavedFunnelUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120).optional(),
    steps: AnalyticsSavedFunnelStepsSchema.optional()
  })
  .strict()
  .refine((value) => value.display_name !== undefined || value.steps !== undefined, {
    message: "Saved funnel updates require at least one mutable field."
  });
export type AnalyticsSavedFunnelUpdate = z.infer<typeof AnalyticsSavedFunnelUpdateSchema>;

export const AnalyticsSavedFunnelSchema = AnalyticsSavedFunnelCreateSchema.extend({
  project_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable()
}).strict();
export type AnalyticsSavedFunnel = z.infer<typeof AnalyticsSavedFunnelSchema>;

export const AnalyticsSavedFunnelsResponseSchema = z
  .object({
    funnels: z.array(AnalyticsSavedFunnelSchema).max(100)
  })
  .strict();
export type AnalyticsSavedFunnelsResponse = z.infer<typeof AnalyticsSavedFunnelsResponseSchema>;

export const AnalyticsSavedFunnelResponseSchema = z
  .object({
    funnel: AnalyticsSavedFunnelSchema
  })
  .strict();
export type AnalyticsSavedFunnelResponse = z.infer<typeof AnalyticsSavedFunnelResponseSchema>;
