import { z } from "zod";

import {
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleGenerationStatusSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsMetricsGranularitySchema,
  AnalyticsOpportunityBundleStatusSchema,
  AnalyticsOpportunityStatusSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";

const DEFAULT_LAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LAST_MS = 370 * 24 * 60 * 60 * 1000;

export type AnalyticsOpportunitiesDependency = NonNullable<ApiDependencies["analyticsOpportunities"]>;
export type AnalyticsBundlesDependency = NonNullable<ApiDependencies["analyticsBundles"]>;

export const AnalyticsSummaryQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    granularity: AnalyticsMetricsGranularitySchema.optional().default("day"),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    route: z.string().trim().min(1).max(2048).refine((value) => !value.includes("?") && !value.includes("#")).optional(),
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
    custom_dimensions: z.record(
      z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/),
      z.string().max(128)
    ).refine((value) => Object.keys(value).length <= 8).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10)
  })
  .strict();

export function parseAnalyticsSummaryQuery(raw: unknown): ReturnType<typeof AnalyticsSummaryQuerySchema.safeParse> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return AnalyticsSummaryQuerySchema.safeParse(raw);
  }

  const normalized: Record<string, unknown> = {};
  const customDimensions: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.startsWith("custom_dimension.")) {
      normalized[key] = value;
      continue;
    }
    const dimensionKey = key.slice("custom_dimension.".length);
    if (typeof value !== "string" || Object.prototype.hasOwnProperty.call(customDimensions, dimensionKey)) {
      normalized[key] = value;
      continue;
    }
    customDimensions[dimensionKey] = value;
  }
  if (Object.keys(customDimensions).length > 0) {
    normalized["custom_dimensions"] = customDimensions;
  }
  return AnalyticsSummaryQuerySchema.safeParse(normalized);
}

export const AnalyticsFunnelParamsSchema = z.object({
  key: z.string().trim().min(1).max(120)
}).strict();

export const AnalyticsIncidentImpactParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

export const AnalyticsOpportunitiesQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    status: z.union([AnalyticsOpportunityStatusSchema, z.literal("all")]).optional().default("open"),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    severity: AnalyticsBundleSeveritySchema.optional(),
    bundle_status: AnalyticsOpportunityBundleStatusSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
  })
  .strict()
  .refine((value) => value.from === undefined || value.to === undefined || Date.parse(value.from) <= Date.parse(value.to), {
    message: "from must be before or equal to to",
    path: ["from"]
  });

export const AnalyticsOpportunityParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

export const AnalyticsBundleParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

export const AnalyticsBundlesListQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    status: z.union([AnalyticsBundleGenerationStatusSchema, z.literal("all")]).optional().default("all"),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
  })
  .strict()
  .refine((value) => value.from === undefined || value.to === undefined || Date.parse(value.from) <= Date.parse(value.to), {
    message: "from must be before or equal to to",
    path: ["from"]
  });

export const AnalyticsBundleQuerySchema = z
  .object({
    project_id: z.string().uuid()
  })
  .strict();

export const AnalyticsBundleCreateBodySchema = z
  .object({
    project_id: z.string().uuid(),
    opportunity_id: z.string().uuid().nullable().optional(),
    analysis_kind: AnalyticsBundleAnalysisKindSchema,
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    funnel: z.string().trim().min(1).max(120).nullable().optional(),
    route: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((value) => !value.includes("?") && !value.includes("#"))
      .nullable()
      .optional(),
    incident_id: z.string().uuid().nullable().optional(),
    deploy_id: z.string().trim().min(1).max(120).nullable().optional(),
    filters: z.record(z.string(), z.unknown()).optional().default({})
  })
  .strict();

export type AnalyticsQuery = z.infer<typeof AnalyticsSummaryQuerySchema>;
export type AuthorizedAnalyticsQuery = AnalyticsQuery & {
  from: string;
  to: string;
  organization_id: string;
};
export type AnalyticsBundleCreateBody = z.infer<typeof AnalyticsBundleCreateBodySchema>;
export type AnalyticsBundleGeneration = NonNullable<
  Awaited<ReturnType<NonNullable<ApiDependencies["analyticsBundles"]>["getAnalyticsBundleGenerationForProject"]>>
>;
export type AnalyticsBundleGenerationListRecord = AnalyticsBundleGeneration & {
  project_name?: string | undefined;
  project_color_tag?: string | null | undefined;
};

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
    const lastMs = input.last === undefined ? DEFAULT_LAST_MS : parseLastDurationMs(input.last);
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

export function resolveIncidentImpactTimeRange(
  input: {
    from?: string | undefined;
    to?: string | undefined;
    last?: string | undefined;
  },
  incident: { first_seen_at: string; last_seen_at: string }
): { from: string; to: string } | null {
  if (input.from !== undefined || input.last !== undefined || input.to !== undefined) {
    return resolveAnalyticsTimeRange(input);
  }

  const firstSeenAt = Date.parse(incident.first_seen_at);
  const lastSeenAt = Date.parse(incident.last_seen_at);
  if (Number.isNaN(firstSeenAt) || Number.isNaN(lastSeenAt) || firstSeenAt > lastSeenAt) {
    return null;
  }

  const boundedFirstSeenAt = Math.max(firstSeenAt, lastSeenAt - DEFAULT_LAST_MS);
  return {
    from: new Date(boundedFirstSeenAt - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(lastSeenAt + 24 * 60 * 60 * 1000).toISOString()
  };
}

export function parseAnalyticsOpportunitiesCursor(
  rawCursor: string | undefined
): { last_detected_at: string; opportunity_id: string } | null {
  return parseCursor(rawCursor, "last_detected_at", "opportunity_id");
}

export function parseAnalyticsBundleGenerationsCursor(
  rawCursor: string | undefined
): { created_at: string; generation_id: string } | null {
  return parseCursor(rawCursor, "created_at", "generation_id");
}

function parseLastDurationMs(value: string): number | null {
  const match = /^([1-9][0-9]{0,4})([hdw])$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "h"
    ? 60 * 60 * 1000
    : unit === "d"
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  const durationMs = amount * multiplier;

  return durationMs <= MAX_LAST_MS ? durationMs : null;
}

function parseCursor<TimestampKey extends string, IdKey extends string>(
  rawCursor: string | undefined,
  timestampKey: TimestampKey,
  idKey: IdKey
): Record<TimestampKey | IdKey, string> | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const timestamp = rawCursor.slice(0, separatorIndex);
  const id = rawCursor.slice(separatorIndex + 1);
  const parsedTimestamp = Date.parse(timestamp);
  const parsedId = z.string().uuid().safeParse(id);
  if (Number.isNaN(parsedTimestamp) || !parsedId.success) {
    return null;
  }

  return {
    [timestampKey]: new Date(parsedTimestamp).toISOString(),
    [idKey]: parsedId.data
  } as Record<TimestampKey | IdKey, string>;
}
