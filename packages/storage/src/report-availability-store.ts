import { z } from "zod";
import { ReportOriginIdsSchema } from "../../smart-reports/src/lifecycle-facts.js";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import type { Queryable } from "./types.js";
const CursorSchema = z
  .object({
    project_id: z.uuid(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    check_id: z.uuid()
  })
  .strict();
const BackfillSchema = z
  .object({
    definition_id: z.uuid(),
    now: z.string().datetime(),
    limit: z.number().int().min(1).max(500),
    after: CursorSchema.optional()
  })
  .strict();
const ReadSchema = z
  .object({
    definition_id: z.uuid(),
    origin_ids: ReportOriginIdsSchema,
    period: ReportPeriodSchema,
    now: z.string().datetime()
  })
  .strict();
type Cursor = z.infer<typeof CursorSchema>;
interface Summary {
  total_checks: number;
  successful_checks: number;
  estimated_check_downtime_seconds: number;
  complete: boolean;
  collected_from: string | null;
}
export interface ReportAvailabilityStore {
  backfill(
    raw: z.infer<typeof BackfillSchema>
  ): Promise<{ examined: number; done: boolean; next_cursor: Cursor | null }>;
  readPeriod(raw: z.infer<typeof ReadSchema>): Promise<Summary>;
  prune(raw: { now: string; limit: number }): Promise<number>;
}
/** Numeric internal facts only. The report service authorises the entire saved
 * scope before using these reads; this store never expands canonical origins. */
export function createReportAvailabilityStore(db: Queryable): ReportAvailabilityStore {
  return {
    async backfill(raw) {
      const input = BackfillSchema.parse(raw);
      const rows = (
        await db.query<Record<string, unknown> & Cursor>(
          `WITH retained AS (
 SELECT r.* FROM availability_check_daily_rollups r JOIN report_collection_coverage c ON c.project_id=r.project_id AND c.definition_id=$1
 WHERE r.day>=((($2::timestamptz AT TIME ZONE 'UTC')-interval '12 months')::date) AND r.day<=(($2::timestamptz AT TIME ZONE 'UTC')::date)
 AND (r.last_checked_at IS NULL OR r.last_checked_at<=$2::timestamptz)
 AND ($3::uuid IS NULL OR (r.project_id,r.day,r.check_id)>($3::uuid,$4::date,$5::uuid))
 ORDER BY r.project_id,r.day,r.check_id LIMIT $6), saved AS (
 INSERT INTO report_availability_days(project_id,check_id,day,total_checks,successful_checks,failed_checks,degraded_checks,downtime_seconds,first_checked_at,last_checked_at,source_updated_at)
 SELECT project_id,check_id,day,total_checks,successful_checks,failed_checks,degraded_checks,downtime_seconds,first_checked_at,last_checked_at,updated_at FROM retained
 ON CONFLICT(project_id,day,check_id) DO UPDATE SET total_checks=EXCLUDED.total_checks,successful_checks=EXCLUDED.successful_checks,
 failed_checks=EXCLUDED.failed_checks,degraded_checks=EXCLUDED.degraded_checks,downtime_seconds=EXCLUDED.downtime_seconds,
 first_checked_at=EXCLUDED.first_checked_at,last_checked_at=EXCLUDED.last_checked_at,source_updated_at=EXCLUDED.source_updated_at
 WHERE EXCLUDED.source_updated_at>=report_availability_days.source_updated_at RETURNING project_id)
 SELECT project_id,day::text,check_id FROM retained ORDER BY project_id,day,check_id`,
          [
            input.definition_id,
            input.now,
            input.after?.project_id ?? null,
            input.after?.day ?? null,
            input.after?.check_id ?? null,
            input.limit
          ]
        )
      ).rows;
      const done = rows.length < input.limit;
      return {
        examined: rows.length,
        done,
        next_cursor: done ? null : CursorSchema.parse(rows.at(-1))
      };
    },
    async readPeriod(raw) {
      const input = ReadSchema.parse(raw);
      const row = (
        await db.query<Record<string, unknown>>(
          `WITH coverage AS (
 SELECT count(*)=cardinality($2::uuid[]) AND bool_and(collected_from<=$3::timestamptz) AS complete,max(collected_from) AS collected_from
 FROM report_collection_coverage WHERE definition_id=$1 AND project_id=ANY($2::uuid[]))
 SELECT COALESCE(sum(d.total_checks),0)::text AS total_checks,COALESCE(sum(d.successful_checks),0)::text AS successful_checks,
 COALESCE(sum(d.downtime_seconds),0)::text AS downtime_seconds,c.complete AND $4::timestamptz<=$5::timestamptz
 AND $3::timestamptz>=((($5::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC') AS complete,c.collected_from::text
 FROM coverage c LEFT JOIN report_availability_days d ON d.project_id=ANY($2::uuid[])
 AND d.day>=($3::timestamptz AT TIME ZONE 'UTC')::date AND d.day<($4::timestamptz AT TIME ZONE 'UTC')::date
 AND d.day>=((($5::timestamptz AT TIME ZONE 'UTC')-interval '12 months')::date)
 AND (d.last_checked_at IS NULL OR d.last_checked_at<=$5::timestamptz)
 GROUP BY c.complete,c.collected_from`,
          [
            input.definition_id,
            input.origin_ids,
            input.period.starts_at,
            input.period.ends_at,
            input.now
          ]
        )
      ).rows[0];
      const count = (value: unknown): number =>
        z.coerce
          .number()
          .int()
          .safe()
          .nonnegative()
          .parse(value ?? 0);
      return {
        total_checks: count(row?.["total_checks"]),
        successful_checks: count(row?.["successful_checks"]),
        estimated_check_downtime_seconds: count(row?.["downtime_seconds"]),
        complete: row?.["complete"] === true,
        collected_from:
          typeof row?.["collected_from"] === "string"
            ? new Date(row["collected_from"]).toISOString()
            : null
      };
    },
    async prune(raw) {
      const input = z
        .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(5000) })
        .strict()
        .parse(raw);
      return (
        await db.query(
          `WITH expired AS (SELECT project_id,day,check_id FROM report_availability_days
 WHERE day<((($1::timestamptz AT TIME ZONE 'UTC')-interval '12 months')::date) ORDER BY day,project_id,check_id FOR UPDATE SKIP LOCKED LIMIT $2)
 DELETE FROM report_availability_days d USING expired e WHERE (d.project_id,d.day,d.check_id)=(e.project_id,e.day,e.check_id) RETURNING d.project_id`,
          [input.now, input.limit]
        )
      ).rows.length;
    }
  };
}
