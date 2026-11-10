import {
  AnalyticsFilterOptionsQuerySchema,
  AnalyticsFilterOptionsResponseSchema,
  type AnalyticsFilterOptionsResponse
} from "../../../../packages/shared-types/src/analytics-filter-options.js";
import type { AnalyticsMetricsQuery } from "./api-types.js";
import { buildApiUrl, readJson } from "./api-client.js";

export async function getAnalyticsFilterOptions(
  projectId: string,
  context: AnalyticsMetricsQuery,
  signal: AbortSignal
): Promise<AnalyticsFilterOptionsResponse> {
  const query = AnalyticsFilterOptionsQuerySchema.parse({
    project_id: projectId,
    ...context,
    limit: 100
  });
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const result = AnalyticsFilterOptionsResponseSchema.parse(
    await readJson<unknown>(
      await fetch(buildApiUrl(`/v1/analytics/filter-options?${params}`), {
        credentials: "include",
        signal
      })
    )
  );
  // Reject adapter or stale-scope mismatches instead of offering another scope's values.
  const window = result.window;
  if (
    window.project_id !== projectId ||
    window.service !== (query.service ?? null) ||
    window.environment !== (query.environment ?? null) ||
    window.granularity !== query.granularity ||
    (query.from !== undefined && Date.parse(window.from) !== Date.parse(query.from)) ||
    (query.to !== undefined && Date.parse(window.to) !== Date.parse(query.to))
  ) {
    throw new Error("analytics_filter_options_scope_mismatch");
  }
  return result;
}
