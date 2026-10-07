import { z } from "zod";
import { AnalyticsMetricsGranularitySchema } from "./analytics.js";
const DEFAULT_LAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LAST_MS = 370 * 24 * 60 * 60 * 1000;

export const AnalyticsMetricsQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    granularity: AnalyticsMetricsGranularitySchema.optional().default("day"),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    route: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((value) => !value.includes("?") && !value.includes("#"))
      .optional(),
    device_type: z.string().trim().min(1).max(40).optional(),
    browser: z.string().trim().min(1).max(80).optional(),
    os: z.string().trim().min(1).max(80).optional(),
    language: z.string().trim().min(1).max(40).optional(),
    country: z.string().trim().min(1).max(8).optional(),
    auth_state: z.enum(["anonymous", "authenticated", "unknown"]).optional(),
    referrer: z.string().trim().min(1).max(255).optional(),
    utm_source: z.string().trim().min(1).max(128).optional(),
    utm_medium: z.string().trim().min(1).max(128).optional(),
    utm_campaign: z.string().trim().min(1).max(128).optional(),
    custom_dimensions: z
      .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/), z.string().max(128))
      .refine((value) => Object.keys(value).length <= 8)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10)
  })
  .strict();

export function resolveAnalyticsTimeRange(input: {
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
}): { from: string; to: string } | null {
  if (input.last !== undefined && input.from !== undefined) {
    return null;
  }

  const to = input.to ?? new Date().toISOString();
  const toMs = Date.parse(to);
  if (Number.isNaN(toMs)) {
    return null;
  }

  let from = input.from;
  if (from === undefined) {
    const lastMs =
      input.last === undefined ? DEFAULT_LAST_MS : parseAnalyticsRelativeDurationMs(input.last);
    if (lastMs === null) {
      return null;
    }
    from = new Date(toMs - lastMs).toISOString();
  }

  const fromMs = Date.parse(from);
  if (Number.isNaN(fromMs) || fromMs > toMs) {
    return null;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString()
  };
}

export function parseAnalyticsRelativeDurationMs(value: string): number | null {
  const match = /^([1-9][0-9]{0,4})([hdw])$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "h" ? 60 * 60 * 1000 : unit === "d" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const durationMs = amount * multiplier;

  return durationMs <= MAX_LAST_MS ? durationMs : null;
}

export type AnalyticsMetricsQuery = z.infer<typeof AnalyticsMetricsQuerySchema>;
