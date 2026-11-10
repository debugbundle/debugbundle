import { sanitizeTelemetry } from "../../redaction/src/index.js";
import {
  ANALYTICS_FILTER_OPTION_FIELDS,
  AnalyticsFilterOptionsResponseSchema,
  AnalyticsMetricsQuerySchema,
  type AnalyticsFilterOptionsResponse
} from "../../shared-types/src/index.js";
import {
  buildAnalyticsRollupWhere,
  readAnalyticsOriginScope
} from "./analytics-metrics-queries.js";
import type { AnalyticsUsageSummaryInput } from "./analytics-metrics-store.js";
import { createPostgresAnalyticsSettingsStore } from "./analytics-settings-store.js";
import type { Queryable } from "./types.js";

export type AnalyticsFilterOptionsInput = Pick<
  AnalyticsUsageSummaryInput,
  | "project_id"
  | "origin_project_ids"
  | "from"
  | "to"
  | "granularity"
  | "service"
  | "environment"
  | "limit"
>;
export interface AnalyticsFilterOptionsStore {
  getFilterOptions(input: AnalyticsFilterOptionsInput): Promise<AnalyticsFilterOptionsResponse>;
}
type ChoiceRow = { key: unknown; value: unknown };
const RESPONSE_BYTE_BUDGET = 256 * 1024;
const COLUMNS = [
  ["device_type", "device_type"],
  ["browser", "browser_family"],
  ["os", "os_family"],
  ["language", "language"],
  ["country", "country_code"],
  ["auth_state", "auth_state"],
  ["referrer", "dimensions->>'referrer_domain'"],
  ["utm_source", "dimensions->>'utm_source'"],
  ["utm_medium", "dimensions->>'utm_medium'"],
  ["utm_campaign", "dimensions->>'utm_campaign'"]
] as const;

export function createPostgresAnalyticsFilterOptionsStore(
  db: Queryable
): AnalyticsFilterOptionsStore {
  const settings = createPostgresAnalyticsSettingsStore(db);
  return {
    async getFilterOptions(input) {
      const limit = Math.min(
        100,
        Math.max(1, Math.floor(Number.isFinite(input.limit) ? input.limit! : 100))
      );
      const approved =
        (await settings.getAnalyticsSettingsByProjectId(input.project_id))
          ?.approved_custom_dimensions ?? [];
      const where = buildAnalyticsRollupWhere(input);
      const params = [...where.params, approved, limit + 1];
      // Only repository-owned expressions enter SQL; custom keys remain bound values.
      const expressions = COLUMNS.map(
        ([key, expression]) => `('${key}', NULLIF(${expression}, ''))`
      ).join(",");
      const [sessions, routes, originScope] = await Promise.all([
        db.query<ChoiceRow>(
          `
          WITH scoped AS (
            SELECT device_type,browser_family,os_family,language,country_code,auth_state,dimensions,sessions
            FROM analytics_session_rollups ${where.sql}
          ), candidates AS (
            SELECT choice.key, choice.value, scoped.sessions AS reach
            FROM scoped CROSS JOIN LATERAL (VALUES ${expressions}) choice(key,value)
            UNION ALL
            SELECT 'custom:' || custom.key, custom.value #>> '{}', scoped.sessions
            FROM scoped CROSS JOIN LATERAL jsonb_each(CASE
              WHEN jsonb_typeof(dimensions->'custom_dimensions')='object' THEN dimensions->'custom_dimensions'
              ELSE '{}'::jsonb END) custom
            WHERE custom.key=ANY($${params.length - 1}::text[]) AND jsonb_typeof(custom.value)='string'
          ), ranked AS (
            SELECT key,value,ROW_NUMBER() OVER(PARTITION BY key ORDER BY SUM(reach) DESC,value ASC) AS rank
            FROM candidates WHERE value IS NOT NULL GROUP BY key,value
          ) SELECT key,value FROM ranked WHERE rank <= $${params.length} ORDER BY key,rank
        `,
          params
        ),
        db.query<ChoiceRow>(
          `
          SELECT 'route'::text AS key,route_key AS value FROM analytics_route_rollups
          ${where.sql} AND route_key IS NOT NULL AND route_key <> ''
          GROUP BY route_key ORDER BY SUM(pageviews) DESC,route_key ASC LIMIT $${where.params.length + 1}
        `,
          [...where.params, limit + 1]
        ),
        readAnalyticsOriginScope(db, input.project_id, input.origin_project_ids)
      ]);
      const result: AnalyticsFilterOptionsResponse = {
        window: {
          project_id: input.project_id,
          from: input.from,
          to: input.to,
          granularity: input.granularity,
          service: input.service ?? null,
          environment: input.environment ?? null,
          ...originScope
        },
        options: AnalyticsFilterOptionsResponseSchema.shape.options.parse(
          Object.fromEntries(
            ANALYTICS_FILTER_OPTION_FIELDS.map((key) => [key, { values: [], truncated: false }])
          )
        ),
        custom_dimensions: approved.map((key) => ({ key, values: [], truncated: false }))
      };
      const sets = new Map<string, { values: string[]; truncated: boolean }>([
        ...ANALYTICS_FILTER_OPTION_FIELDS.map((key) => [key, result.options[key]] as const),
        ...result.custom_dimensions.map((set) => [`custom:${set.key}`, set] as const)
      ]);
      let bytes = Buffer.byteLength(JSON.stringify(result));
      for (const row of [...sessions.rows, ...routes.rows]) {
        if (typeof row.key !== "string") continue;
        const set = sets.get(row.key);
        if (set === undefined) continue;
        const value = row.value;
        const valid =
          typeof value === "string" &&
          (row.key.startsWith("custom:")
            ? value.length <= 128
            : ANALYTICS_FILTER_OPTION_FIELDS.includes(
                row.key as (typeof ANALYTICS_FILTER_OPTION_FIELDS)[number]
              ) &&
              AnalyticsMetricsQuerySchema.shape[
                row.key as (typeof ANALYTICS_FILTER_OPTION_FIELDS)[number]
              ].safeParse(value).success &&
              value === value.trim());
        if (!valid || set.values.length >= limit) {
          set.truncated = true;
          continue;
        }
        const safe = sanitizeTelemetry({ value }, { maxTotalBytes: 12 * 1024 });
        // A redacted/truncated value would filter a different record; never offer it.
        if (
          !safe.ok ||
          typeof safe.value !== "object" ||
          safe.value === null ||
          !("value" in safe.value) ||
          safe.value["value"] !== value
        ) {
          set.truncated = true;
          continue;
        }
        const cost = Buffer.byteLength(JSON.stringify(value)) + (set.values.length ? 1 : 0);
        if (bytes + cost > RESPONSE_BYTE_BUDGET) {
          set.truncated = true;
          continue;
        }
        if (!set.values.includes(value)) {
          set.values.push(value);
          bytes += cost;
        }
      }
      return AnalyticsFilterOptionsResponseSchema.parse(result);
    }
  };
}
