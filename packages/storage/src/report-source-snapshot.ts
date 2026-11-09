import { z } from "zod";
import { ReportOriginIdsSchema } from "../../smart-reports/src/lifecycle-facts.js";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import {
  ReportSourceStateSchema,
  type ReportSourceSnapshot as SnapshotResult
} from "../../smart-reports/src/source-state.js";
import type { Queryable } from "./types.js";
const InputSchema = z
  .object({
    origin_ids: ReportOriginIdsSchema,
    at: z.string().datetime(),
    cutoff_at: z.string().datetime(),
    period: ReportPeriodSchema
  })
  .strict()
  .refine((input) => Date.parse(input.at) <= Date.parse(input.cutoff_at), {
    message: "report_snapshot_after_cutoff"
  });
export type ReportSourceSnapshotResult = SnapshotResult;
/** Numeric source states survive routine pruning. Missing text is never a
 * resolution. Historical states use recorded transitions, not today's status;
 * late-recorded facts cannot enter a frozen cutoff. Whole-scope access is the
 * calling report service's responsibility. */
export async function readReportSourceSnapshot(
  db: Queryable,
  raw: z.infer<typeof InputSchema>
): Promise<ReportSourceSnapshotResult> {
  const input = InputSchema.parse(raw);
  const row = (
    await db.query<Record<string, unknown>>(
      `WITH retained AS (
 SELECT project_id AS origin_project_id,'incident'::text AS source_type,id AS source_id,status,severity,first_seen_at,last_seen_at,updated_at AS state_at,resolved_at,regressed_at
 FROM incidents WHERE project_id=ANY($1::uuid[]) AND created_at<=$3::timestamptz AND updated_at<=$3::timestamptz AND first_seen_at<$2::timestamptz
 UNION ALL
 SELECT project_id,'improvement',id,status,severity,first_detected_at,last_detected_at,updated_at,resolved_at,NULL::timestamptz
 FROM improvement_opportunities WHERE project_id=ANY($1::uuid[]) AND created_at<=$3::timestamptz AND updated_at<=$3::timestamptz AND first_detected_at<$2::timestamptz
 ),journal AS (
 SELECT f.*,CASE WHEN transition='observed' THEN recorded_at ELSE occurred_at END AS state_at
 FROM report_lifecycle_facts f WHERE project_id=ANY($1::uuid[]) AND recorded_at<=$3::timestamptz
 AND occurred_at>=((($3::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC')
 AND CASE WHEN transition='observed' THEN recorded_at ELSE occurred_at END<$2::timestamptz
 ),known_events AS (
 SELECT project_id,source_type,source_id,transition,occurred_at FROM journal
 UNION ALL SELECT r.origin_project_id,r.source_type,r.source_id,f.transition,f.occurred_at FROM retained r
 CROSS JOIN LATERAL(VALUES('opened',r.first_seen_at),('resolved',r.resolved_at),('regressed',r.regressed_at)) f(transition,occurred_at)
 WHERE f.occurred_at<$2::timestamptz
 ),period_events AS (
 SELECT project_id AS origin_project_id,source_type,source_id,ARRAY_REMOVE(ARRAY[
 CASE WHEN bool_or(transition='opened') THEN 'new' END,
 CASE WHEN bool_or(transition='resolved') THEN 'resolved' END,
 CASE WHEN bool_or(transition='regressed') THEN 'regressed' END,
 CASE WHEN bool_or(transition IN ('reopened','restored')) THEN 'reopened' END],NULL) AS events
 FROM known_events WHERE occurred_at>=$4::timestamptz AND occurred_at<$5::timestamptz
 GROUP BY project_id,source_type,source_id
 ),journal_states AS (
 SELECT DISTINCT ON(project_id,source_type,source_id) project_id AS origin_project_id,source_type,source_id,
 CASE WHEN to_status='other' THEN 'dismissed' ELSE to_status END AS status,severity,
 min(occurred_at) FILTER(WHERE transition='opened') OVER(PARTITION BY project_id,source_type,source_id) AS first_seen_at,
 NULL::timestamptz AS last_seen_at,state_at,false AS from_retained
 FROM journal ORDER BY project_id,source_type,source_id,state_at DESC,id DESC
 ),candidates AS (
 SELECT * FROM journal_states UNION ALL SELECT origin_project_id,source_type,source_id,status,severity,first_seen_at,last_seen_at,state_at,true FROM retained WHERE state_at<$2::timestamptz
 ),states AS (
 SELECT DISTINCT ON(origin_project_id,source_type,source_id) * FROM candidates
 ORDER BY origin_project_id,source_type,source_id,state_at DESC,from_retained DESC
 ),classified AS (
 SELECT s.*,CASE WHEN status IN ('open','regressed') AND severity IN ('critical','high') THEN 'urgent'
 WHEN status='resolved' THEN 'resolved' ELSE 'recent' END AS summary_group,
 CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS severity_order
 FROM states s
 ),aged AS (
 SELECT *,row_number() OVER(PARTITION BY summary_group,severity ORDER BY COALESCE(first_seen_at,state_at),state_at,origin_project_id,source_type,source_id) AS age_position FROM classified
 ),ranked AS (
 SELECT *,row_number() OVER(PARTITION BY summary_group ORDER BY CASE WHEN summary_group='urgent' AND age_position=1 THEN 0 ELSE 1 END,severity_order,state_at DESC,origin_project_id,source_type,source_id) AS position FROM aged
 ),selected AS (SELECT * FROM ranked WHERE position<=CASE summary_group WHEN 'urgent' THEN 20 ELSE 15 END),
 totals AS (SELECT count(*)::text AS known_sources,count(*) FILTER(WHERE source_type='incident' AND status IN ('open','regressed') AND severity='high')::text AS open_high,
 count(*) FILTER(WHERE source_type='incident' AND status IN ('open','regressed') AND severity='critical')::text AS open_critical FROM states),
 coverage AS (SELECT count(*)=cardinality($1::uuid[]) AND bool_and(c.lifecycle_started_at<=p.created_at
 AND p.created_at>=((($3::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC') AND p.created_at<$2::timestamptz) AS complete
 FROM projects p JOIN report_source_coverage c ON c.project_id=p.id WHERE p.id=ANY($1::uuid[]))
 SELECT totals.*,coverage.complete,COALESCE((SELECT jsonb_agg(jsonb_build_object(
 'origin_project_id',s.origin_project_id,'source_type',s.source_type,'source_id',s.source_id,'status',s.status,'severity',s.severity,
 'source_version_at',s.state_at,'first_seen_at',COALESCE(r.first_seen_at,s.first_seen_at),
 'last_seen_at',CASE WHEN r.state_at<$2::timestamptz AND r.last_seen_at<$2::timestamptz THEN r.last_seen_at ELSE NULL END,
 'retained',r.source_id IS NOT NULL,'period_events',COALESCE(e.events,ARRAY[]::text[]))
 ORDER BY s.severity_order,s.state_at DESC,s.origin_project_id,s.source_type,s.source_id)
 FROM selected s LEFT JOIN retained r USING(origin_project_id,source_type,source_id)
 LEFT JOIN period_events e USING(origin_project_id,source_type,source_id)),'[]'::jsonb) AS sources FROM totals CROSS JOIN coverage`,
      [input.origin_ids, input.at, input.cutoff_at, input.period.starts_at, input.period.ends_at]
    )
  ).rows[0];
  const count = (value: unknown): number =>
    z.coerce
      .number()
      .int()
      .safe()
      .nonnegative()
      .parse(value ?? 0);
  const sources = z
    .array(z.record(z.string(), z.unknown()))
    .max(50)
    .parse(row?.["sources"] ?? [])
    .map((source) => {
      const iso = (value: unknown): string | null =>
        value === null ? null : new Date(z.string().parse(value)).toISOString();
      return ReportSourceStateSchema.parse({
        ...source,
        first_seen_at: iso(source["first_seen_at"]),
        last_seen_at: iso(source["last_seen_at"]),
        source_version_at: iso(source["source_version_at"])
      });
    });
  return {
    sources,
    known_sources: count(row?.["known_sources"]),
    open_high_incidents: count(row?.["open_high"]),
    open_critical_incidents: count(row?.["open_critical"]),
    complete: row?.["complete"] === true
  };
}
