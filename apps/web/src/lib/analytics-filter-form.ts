import {
  AnalyticsMetricsQuerySchema,
  parseAnalyticsRelativeDurationMs,
  resolveAnalyticsTimeRange
} from "../../../../packages/shared-types/src/analytics-query.js";
import type { AnalyticsMetricsQuery } from "./api.js";
export const ANALYTICS_DIMENSION_FIELDS = [
  { key: "route", label: "Route", maximum: 2048 },
  { key: "device_type", label: "Device type", maximum: 40 },
  { key: "browser", label: "Browser", maximum: 80 },
  { key: "os", label: "Operating system", maximum: 80 },
  { key: "language", label: "Language", maximum: 40 },
  { key: "country", label: "Country", maximum: 8 },
  { key: "referrer", label: "Referrer", maximum: 255 },
  { key: "utm_source", label: "UTM source", maximum: 128 },
  { key: "utm_medium", label: "UTM medium", maximum: 128 },
  { key: "utm_campaign", label: "UTM campaign", maximum: 128 }
] as const;
export type AnalyticsDimensionKey =
  | (typeof ANALYTICS_DIMENSION_FIELDS)[number]["key"]
  | "auth_state";
export type AnalyticsTimeWindow = "7d" | "30d" | "90d" | "custom" | "relative";
export interface AnalyticsFilterDraft {
  last: AnalyticsTimeWindow;
  relative: string;
  from: string;
  to: string;
  service: string;
  environment: string;
  granularity: "hour" | "day";
  limit: string;
  dimensions: Partial<Record<AnalyticsDimensionKey, string>>;
  customDimensions: string;
}
export const defaultAnalyticsFilters: AnalyticsFilterDraft = {
  last: "30d",
  relative: "30d",
  from: "",
  to: "",
  service: "",
  environment: "",
  granularity: "day",
  limit: "",
  dimensions: {},
  customDimensions: ""
};
export function analyticsQueryFromDraft(
  draft: AnalyticsFilterDraft,
  defaultLimit = 100
): { query: AnalyticsMetricsQuery | null; error: string | null } {
  let customDimensions: unknown;
  if (draft.customDimensions.trim()) {
    try {
      customDimensions = JSON.parse(draft.customDimensions);
    } catch {
      return { query: null, error: "Custom dimensions must be a JSON object of string values." };
    }
  }
  const raw = {
    ...(draft.last === "custom"
      ? { from: draft.from.trim(), to: draft.to.trim() }
      : { last: draft.last === "relative" ? draft.relative.trim() : draft.last }),
    granularity: draft.granularity,
    limit: draft.limit.trim() || defaultLimit,
    ...(draft.service.trim() ? { service: draft.service.trim() } : {}),
    ...(draft.environment.trim() ? { environment: draft.environment.trim() } : {}),
    ...Object.fromEntries(
      Object.entries(draft.dimensions)
        .filter(([, value]) => value?.trim())
        .map(([key, value]) => [key, value.trim()])
    ),
    ...(customDimensions === undefined ? {} : { custom_dimensions: customDimensions })
  };
  const parsed = AnalyticsMetricsQuerySchema.omit({ project_id: true }).safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      query: null,
      error: `${issue?.path.join(" ") ?? "Filter"}: ${issue?.message ?? "Invalid value"}`
    };
  }
  if (parsed.data.last !== undefined && parseAnalyticsRelativeDurationMs(parsed.data.last) === null)
    return { query: null, error: "Use a relative window such as 24h, 7d or 2w, up to 370 days." };
  if (resolveAnalyticsTimeRange(parsed.data) === null)
    return { query: null, error: "Choose a valid UTC window with the start before the end." };
  return { query: parsed.data, error: null };
}
export function analyticsInventoryWindow(query: AnalyticsMetricsQuery): {
  from: string;
  to: string;
} {
  return resolveAnalyticsTimeRange(query) ?? resolveAnalyticsTimeRange({ last: "30d" })!;
}

/** Bundle workers apply scope; dimension selections remain explicit specification metadata. */
export function analyticsBundleSpecificationFilters(
  query: AnalyticsMetricsQuery
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([key, value]) =>
        value !== undefined &&
        !["from", "to", "last", "service", "environment", "limit"].includes(key) &&
        !(key === "granularity" && value === "day")
    )
  );
}
