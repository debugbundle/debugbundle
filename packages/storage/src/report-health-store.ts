import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { z } from "zod";
import { ReportOriginIdsSchema } from "../../smart-reports/src/lifecycle-facts.js";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import {
  ReportSourceStateSchema,
  type ReportSourceState
} from "../../smart-reports/src/source-state.js";
import type { Queryable } from "./types.js";
const IdentitySchema = z
  .object({
    project_id: z.uuid(),
    result_id: z.uuid(),
    check_id: z.uuid(),
    occurred_at: z.string().datetime()
  })
  .strict();
/** Called only by the transactional health executor after a successful,
 * threshold-backed failing-to-passing transition. No names, URLs or bodies are
 * copied. Routine raw pruning leaves this numeric observation intact. */
export async function recordReportHealthRecovery(
  db: Queryable,
  raw: z.infer<typeof IdentitySchema>
): Promise<void> {
  const input = IdentitySchema.parse(raw);
  await db.query(
    `INSERT INTO report_health_recoveries(project_id,result_id,check_id,occurred_at)
 SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM report_collection_coverage c
 JOIN report_definitions d ON d.id=c.definition_id JOIN organizations o ON o.id=d.organization_id
 WHERE c.project_id=$1 AND d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND (o.plan='business' OR $5::boolean) AND o.suspended_at IS NULL AND ${REPORT_TRIAL_ENTITLEMENT_SQL})
 ON CONFLICT(project_id,result_id) DO NOTHING`,
    [input.project_id, input.result_id, input.check_id, input.occurred_at, isSelfHostMode()]
  );
}
export function createReportHealthStore(db: Queryable): {
  readRecoveries(raw: {
    origin_ids: string[];
    period: z.infer<typeof ReportPeriodSchema>;
    cutoff_at: string;
  }): Promise<ReportSourceState[]>;
  prune(raw: { now: string; limit: number }): Promise<number>;
} {
  return {
    async readRecoveries(raw) {
      const input = z
        .object({
          origin_ids: ReportOriginIdsSchema,
          period: ReportPeriodSchema,
          cutoff_at: z.string().datetime()
        })
        .strict()
        .parse(raw);
      const rows = (
        await db.query<{
          project_id: string;
          result_id: string;
          occurred_at: string;
          recorded_at: string;
          retained: boolean;
        }>(
          `SELECT f.project_id,f.result_id,f.occurred_at::text,f.recorded_at::text,
 EXISTS(SELECT 1 FROM availability_check_results r JOIN availability_checks c ON c.id=r.check_id
 WHERE r.id=f.result_id AND r.project_id=f.project_id AND r.check_id=f.check_id AND r.status='success' AND c.deleted_at IS NULL AND r.completed_at+interval '30 days'>clock_timestamp()) AS retained
 FROM report_health_recoveries f WHERE f.project_id=ANY($1::uuid[]) AND f.occurred_at>=$2::timestamptz AND f.occurred_at<$3::timestamptz
 AND f.occurred_at>=((($4::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC') AND f.recorded_at<=$4::timestamptz
 ORDER BY f.occurred_at DESC,f.project_id,f.result_id LIMIT 10`,
          [input.origin_ids, input.period.starts_at, input.period.ends_at, input.cutoff_at]
        )
      ).rows;
      return rows.map((row) =>
        ReportSourceStateSchema.parse({
          origin_project_id: row.project_id,
          source_type: "health",
          source_id: row.result_id,
          status: "observed_recovery",
          severity: "unknown",
          first_seen_at: new Date(row.occurred_at).toISOString(),
          last_seen_at: new Date(row.occurred_at).toISOString(),
          source_version_at: new Date(row.recorded_at).toISOString(),
          retained: row.retained,
          period_events: ["observed_recovery"]
        })
      );
    },
    async prune(raw) {
      const input = z
        .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(5000) })
        .strict()
        .parse(raw);
      return (
        await db.query(
          `WITH selected AS(SELECT project_id,result_id FROM report_health_recoveries
 WHERE occurred_at<((($1::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC') ORDER BY occurred_at,project_id,result_id FOR UPDATE SKIP LOCKED LIMIT $2)
 DELETE FROM report_health_recoveries f USING selected s WHERE (f.project_id,f.result_id)=(s.project_id,s.result_id) RETURNING f.result_id`,
          [input.now, input.limit]
        )
      ).rows.length;
    }
  };
}
