import { z } from "zod";
import { ReportOriginIdsSchema } from "../../smart-reports/src/lifecycle-facts.js";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import type { Queryable } from "./types.js";
const InputSchema = z
  .object({
    origin_ids: ReportOriginIdsSchema,
    period: ReportPeriodSchema,
    now: z.string().datetime(),
    retention_at: z.string().datetime().optional()
  })
  .strict();
export interface ReportAnalyticsFacts {
  coverage: "complete" | "partial" | "unavailable";
  sessions: number | null;
  page_views: number | null;
  daily_active_visitor_days: number | null;
  notes: string[];
}
/** Existing additive day rollups only; no raw events, journey identities or
 * additional retention. The caller authorises the exact whole origin scope.
 * Settings come from each origin's current canonical policy, without expanding
 * the requested data origins. Shorter privacy applies before pruning catches up. */
export async function readReportAnalyticsPeriod(
  db: Queryable,
  raw: z.infer<typeof InputSchema>
): Promise<ReportAnalyticsFacts> {
  const input = InputSchema.parse(raw);
  const row = (
    await db.query<Record<string, unknown>>(
      `WITH origins AS (
 SELECT p.id,COALESCE(s.enabled,false) AS enabled,s.updated_at AS policy_since,
 (((GREATEST($4::timestamptz,$5::timestamptz) AT TIME ZONE 'UTC')-make_interval(months=>LEAST(COALESCE(s.aggregate_retention_months,12),12))) AT TIME ZONE 'UTC') AS retained_from
 FROM projects p LEFT JOIN project_analytics_settings s ON s.project_id=debugbundle_canonical_project(p.id) WHERE p.id=ANY($1::uuid[])
 ),policy AS (
 SELECT count(*)=cardinality($1::uuid[]) AND bool_and(enabled AND policy_since<=$2::timestamptz AND retained_from<=$2::timestamptz)
 AND $3::timestamptz<=$4::timestamptz AS complete,
 COALESCE(bool_or(enabled AND retained_from<$3::timestamptz),false) AS available FROM origins
 ),totals AS (
 SELECT count(*) FILTER(WHERE r.updated_at<=$4::timestamptz)::text AS observed_rows,
 COALESCE(bool_or(r.updated_at>$4::timestamptz),false) AS late_rows,
 COALESCE(sum(r.sessions) FILTER(WHERE r.updated_at<=$4::timestamptz),0)::text AS sessions,
 COALESCE(sum(r.total_pageviews) FILTER(WHERE r.updated_at<=$4::timestamptz),0)::text AS page_views,
 COALESCE(sum(r.active_visitors) FILTER(WHERE r.updated_at<=$4::timestamptz),0)::text AS visitor_days
 FROM origins o JOIN analytics_session_rollups r ON r.project_id=o.id AND o.enabled AND r.bucket_granularity='day'
 AND r.bucket_start>=$2::timestamptz AND r.bucket_start<$3::timestamptz AND r.bucket_start>=o.retained_from
 ) SELECT * FROM policy CROSS JOIN totals`,
      [
        input.origin_ids,
        input.period.starts_at,
        input.period.ends_at,
        input.now,
        input.retention_at ?? input.now
      ]
    )
  ).rows[0];
  const complete = row?.["complete"] === true && row["late_rows"] !== true;
  const coverage = row?.["available"] !== true ? "unavailable" : complete ? "complete" : "partial";
  const count = (value: unknown): number =>
    z.coerce
      .number()
      .int()
      .safe()
      .nonnegative()
      .parse(value ?? 0);
  const known = coverage !== "unavailable" && (complete || count(row?.["observed_rows"]) > 0);
  const notes = [
    "Sessions and visitor-days sum daily counts within monitored service, environment and original-project scopes; they are not unique period sessions or unique monthly people.",
    "Analytics reflects captured opt-in/consented observations and configured SDK capture; it does not measure uncaptured visitors or establish causation."
  ];
  if (coverage !== "complete")
    notes.push(
      "Current enabled policy, retention, policy changes or late aggregation leave incomplete analytics coverage; absent data is unknown."
    );
  return {
    coverage,
    sessions: known ? count(row?.["sessions"]) : null,
    page_views: known ? count(row?.["page_views"]) : null,
    daily_active_visitor_days: known ? count(row?.["visitor_days"]) : null,
    notes
  };
}
