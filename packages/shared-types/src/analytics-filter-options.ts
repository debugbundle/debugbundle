import { z } from "zod";
import { AnalyticsRouteMetricsResponseSchema } from "./analytics.js";
import { AnalyticsMetricsQuerySchema } from "./analytics-query.js";

function optionSet(schema: z.ZodType<string>): z.ZodType<{ values: string[]; truncated: boolean }> {
  return z
    .object({
      values: z.array(schema).max(100),
      truncated: z.boolean()
    })
    .strict();
}

const fields = {
  route: optionSet(AnalyticsMetricsQuerySchema.shape.route.unwrap()),
  device_type: optionSet(AnalyticsMetricsQuerySchema.shape.device_type.unwrap()),
  browser: optionSet(AnalyticsMetricsQuerySchema.shape.browser.unwrap()),
  os: optionSet(AnalyticsMetricsQuerySchema.shape.os.unwrap()),
  language: optionSet(AnalyticsMetricsQuerySchema.shape.language.unwrap()),
  country: optionSet(AnalyticsMetricsQuerySchema.shape.country.unwrap()),
  auth_state: optionSet(AnalyticsMetricsQuerySchema.shape.auth_state.unwrap()),
  referrer: optionSet(AnalyticsMetricsQuerySchema.shape.referrer.unwrap()),
  utm_source: optionSet(AnalyticsMetricsQuerySchema.shape.utm_source.unwrap()),
  utm_medium: optionSet(AnalyticsMetricsQuerySchema.shape.utm_medium.unwrap()),
  utm_campaign: optionSet(AnalyticsMetricsQuerySchema.shape.utm_campaign.unwrap())
};

export type AnalyticsFilterOptionField = keyof typeof fields;
export const ANALYTICS_FILTER_OPTION_FIELDS = Object.freeze(
  Object.keys(fields) as AnalyticsFilterOptionField[]
);

export const AnalyticsFilterOptionsQuerySchema = AnalyticsMetricsQuerySchema.pick({
  project_id: true,
  from: true,
  to: true,
  last: true,
  granularity: true,
  service: true,
  environment: true,
  limit: true
}).extend({ limit: z.coerce.number().int().min(1).max(100).optional().default(100) });

export const AnalyticsFilterOptionsResponseSchema = z
  .object({
    window: AnalyticsRouteMetricsResponseSchema.shape.window,
    options: z.object(fields).strict(),
    custom_dimensions: z
      .array(
        z
          .object({
            key: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/),
            values: z.array(z.string().max(128)).max(100),
            truncated: z.boolean()
          })
          .strict()
      )
      .max(8)
  })
  .strict();

export type AnalyticsFilterOptionsQuery = z.infer<typeof AnalyticsFilterOptionsQuerySchema>;
export type AnalyticsFilterOptionsResponse = z.infer<typeof AnalyticsFilterOptionsResponseSchema>;
export type AnalyticsFilterOptionSet =
  AnalyticsFilterOptionsResponse["options"][AnalyticsFilterOptionField];
