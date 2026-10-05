import { z } from "zod";

export const AnalyticsFlowKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_.-]{0,63}$/);
export const AnalyticsFlowOriginSchema = z
  .string()
  .max(255)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.origin === value &&
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }, "Use an exact HTTPS origin (HTTP is allowed for localhost).");
export const AnalyticsFlowDefinitionInputSchema = z
  .object({
    flow_key: AnalyticsFlowKeySchema,
    display_name: z.string().trim().min(1).max(120),
    kind: z.enum(["acquisition", "activation"]),
    timeout_minutes: z.number().int().min(10).max(1440).default(60),
    steps: z
      .array(
        z
          .object({
            step_key: AnalyticsFlowKeySchema,
            display_name: z.string().trim().min(1).max(120),
            origin: AnalyticsFlowOriginSchema
          })
          .strict()
      )
      .min(2)
      .max(8)
  })
  .strict()
  .refine(
    (value) => new Set(value.steps.map((step) => step.step_key)).size === value.steps.length,
    "Step keys must be unique."
  );
export type AnalyticsFlowDefinitionInput = z.infer<typeof AnalyticsFlowDefinitionInputSchema>;
export const AnalyticsFlowDefinitionSchema = AnalyticsFlowDefinitionInputSchema.innerType()
  .extend({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    version: z.number().int().positive(),
    archived_at: z.string().datetime().nullable()
  })
  .refine(
    (value) => new Set(value.steps.map((step) => step.step_key)).size === value.steps.length,
    "Step keys must be unique."
  );
export type AnalyticsFlowDefinition = z.infer<typeof AnalyticsFlowDefinitionSchema>;
const Count = z.number().int().nonnegative();
export const AnalyticsFlowReportSchema = z.object({
  flow: AnalyticsFlowDefinitionSchema,
  window: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    previous_from: z.string().datetime()
  }),
  starts: Count,
  previous_starts: Count,
  completions: Count,
  steps: z
    .array(
      z.object({
        step_key: AnalyticsFlowKeySchema,
        display_name: z.string(),
        reached: Count,
        previous_reached: Count,
        unlinked: Count,
        dropoff: Count,
        average_seconds: z.number().nonnegative().nullable()
      })
    )
    .min(2)
    .max(8),
  sources: z
    .array(
      z.object({ source: z.string(), campaign: z.string(), starts: Count, completions: Count })
    )
    .max(50),
  coverage: z.object({
    observation: z.literal("explicit_integration_signals"),
    incomplete: z.literal(true),
    sources_truncated: z.boolean()
  })
});
export type AnalyticsFlowReport = z.infer<typeof AnalyticsFlowReportSchema>;
export const AnalyticsFlowsResponseSchema = z.object({
  flows: z.array(AnalyticsFlowDefinitionSchema).max(100)
});
export const AnalyticsFlowResponseSchema = z.object({ flow: AnalyticsFlowDefinitionSchema });

const Secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const Label = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._~+-]{0,99}$/);
const Context = z.object({ context: Secret, consent: z.boolean().optional() });
export const AnalyticsFlowCaptureSchemas = {
  start: Context.extend({
    step_key: AnalyticsFlowKeySchema,
    source: Label.optional(),
    campaign: Label.optional()
  }).strict(),
  step: Context.extend({ step_key: AnalyticsFlowKeySchema }).strict(),
  handoff: Context.extend({ step_key: AnalyticsFlowKeySchema, token: Secret }).strict(),
  arrive: Context.extend({ token: Secret }).strict(),
  withdraw: Context.strict()
};
