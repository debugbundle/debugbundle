import { z } from "zod";
import {
  ReportLifecycleReadSchema,
  ReportLifecycleBackfillSchema,
  OriginLifecycleSummarySchema,
  type OriginLifecycleSummary
} from "../../smart-reports/src/lifecycle-facts.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

// UTC calendar subtraction remains correct when a self-hosted database's
// session timezone differs, including leap-day and daylight-saving boundaries.
const cutoff = `( (($4::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC')`;
export interface ReportLifecycleStore {
  readPeriod(input: z.infer<typeof ReportLifecycleReadSchema>): Promise<OriginLifecycleSummary[]>;
  backfill(
    input: z.infer<typeof ReportLifecycleBackfillSchema>
  ): Promise<{ examined: number; next_cursor: string | null; done: boolean }>;
  prune(input: { now: string; limit: number }): Promise<number>;
}
interface HistoricalSource extends Record<string, unknown> {
  id: string;
  service_id: string | null;
  first_seen_at: string;
  resolved_at: string | null;
  regressed_at: string | null;
}
/** Internal fact reads consume the exact accepted origins. They do not expand
 * canonical projects or authorise an actor; report services must recheck the
 * whole stored scope before calling them and before any resulting egress. */
export function createReportLifecycleStore(db: Queryable): ReportLifecycleStore {
  return {
    async readPeriod(raw) {
      const input = ReportLifecycleReadSchema.parse(raw);
      const rows = (
        await db.query<Record<string, unknown>>(
          `WITH selected AS (SELECT unnest($1::uuid[]) AS project_id),journal AS (
          SELECT project_id,source_type,source_id,transition,occurred_at,recorded_at FROM report_lifecycle_facts
          WHERE project_id=ANY($1::uuid[]) AND occurred_at>=$2::timestamptz AND occurred_at<$3::timestamptz
            AND occurred_at>=${cutoff} AND recorded_at<=$4::timestamptz
        ),retained AS (
          SELECT project_id,'incident'::text AS source_type,id AS source_id,first_seen_at,resolved_at,regressed_at,updated_at
          FROM incidents WHERE project_id=ANY($1::uuid[]) AND created_at<=$4::timestamptz AND updated_at<=$4::timestamptz
          UNION ALL
          SELECT project_id,'improvement',id,first_detected_at,resolved_at,NULL::timestamptz,updated_at
          FROM improvement_opportunities WHERE project_id=ANY($1::uuid[]) AND created_at<=$4::timestamptz AND updated_at<=$4::timestamptz
        ),known AS (
          SELECT r.project_id,r.source_type,r.source_id,f.transition,f.occurred_at,r.updated_at AS recorded_at
          FROM retained r CROSS JOIN LATERAL(VALUES('opened',r.first_seen_at),('resolved',r.resolved_at),('regressed',r.regressed_at)) f(transition,occurred_at)
          WHERE f.occurred_at>=$2::timestamptz AND f.occurred_at<$3::timestamptz AND f.occurred_at>=${cutoff}
          AND NOT EXISTS(SELECT 1 FROM journal old WHERE (old.project_id,old.source_type,old.source_id,old.transition,old.occurred_at)=
            (r.project_id,r.source_type,r.source_id,f.transition,f.occurred_at))
        ),facts AS (SELECT * FROM journal UNION ALL SELECT * FROM known)
        SELECT s.project_id,c.collected_from::text AS collected_from,
          GREATEST(COALESCE(c.collected_from,$4::timestamptz),${cutoff})::text AS bounded_from,
          COALESCE(c.collected_from<=$2::timestamptz AND ${cutoff}<=$2::timestamptz AND $3::timestamptz<=$4::timestamptz
            AND NOT COALESCE(bool_or(f.recorded_at>=$3::timestamptz),false),false) AS complete,
          count(*) FILTER(WHERE f.source_type='incident' AND f.transition='opened')::text AS incidents_opened,
          count(*) FILTER(WHERE f.source_type='incident' AND f.transition='resolved')::text AS incidents_resolved,
          count(DISTINCT f.source_id) FILTER(WHERE f.source_type='incident' AND f.transition='resolved')::text AS incidents_distinct_resolved,
          count(*) FILTER(WHERE f.source_type='incident' AND f.transition='regressed')::text AS incidents_regressed,
          count(*) FILTER(WHERE f.source_type='incident' AND f.transition='reopened')::text AS incidents_reopened,
          count(*) FILTER(WHERE f.source_type='improvement' AND f.transition='opened')::text AS improvements_opened,
          count(*) FILTER(WHERE f.source_type='improvement' AND f.transition='resolved')::text AS improvements_resolved,
          count(DISTINCT f.source_id) FILTER(WHERE f.source_type='improvement' AND f.transition='resolved')::text AS improvements_distinct_resolved,
          count(*) FILTER(WHERE f.source_type='improvement' AND f.transition='restored')::text AS improvements_restored,
          count(*) FILTER(WHERE f.source_type='improvement' AND f.transition='snoozed')::text AS improvements_snoozed
        FROM selected s LEFT JOIN report_collection_coverage c ON c.project_id=s.project_id AND c.definition_id=$5
        LEFT JOIN facts f ON f.project_id=s.project_id
        GROUP BY s.project_id,c.collected_from ORDER BY s.project_id`,
          [
            input.origin_ids,
            input.period.starts_at,
            input.period.ends_at,
            input.now,
            input.definition_id
          ]
        )
      ).rows;
      return rows.map((row) =>
        OriginLifecycleSummarySchema.parse({
          project_id: row["project_id"],
          coverage: {
            complete: row["complete"],
            collected_from:
              row["collected_from"] === null
                ? null
                : new Date(z.string().parse(row["collected_from"])).toISOString(),
            bounded_from: new Date(z.string().parse(row["bounded_from"])).toISOString()
          },
          incidents: {
            opened: Number(row["incidents_opened"]),
            resolution_events: Number(row["incidents_resolved"]),
            distinct_resolved: Number(row["incidents_distinct_resolved"]),
            regressed: Number(row["incidents_regressed"]),
            reopened: Number(row["incidents_reopened"])
          },
          improvements: {
            opened: Number(row["improvements_opened"]),
            resolution_events: Number(row["improvements_resolved"]),
            distinct_resolved: Number(row["improvements_distinct_resolved"]),
            restored: Number(row["improvements_restored"]),
            snoozed: Number(row["improvements_snoozed"])
          }
        })
      );
    },
    async backfill(raw) {
      const input = ReportLifecycleBackfillSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `report-backfill:${input.project_id}`
        ]);
        const coverage = (
          await tx.query<{ lifecycle_started_at: string }>(
            `SELECT c.lifecycle_started_at::text FROM projects p JOIN report_source_coverage c ON c.project_id=p.id WHERE p.id=$1 FOR KEY SHARE OF p`,
            [input.project_id]
          )
        ).rows[0];
        if (!coverage) throw new Error("report_origin_coverage_missing");
        const table = input.source_type === "incident" ? "incidents" : "improvement_opportunities";
        const first = input.source_type === "incident" ? "first_seen_at" : "first_detected_at";
        const last = input.source_type === "incident" ? "last_seen_at" : "last_detected_at";
        const regressed = input.source_type === "incident" ? "regressed_at" : "NULL::timestamptz";
        const rows = (
          await tx.query<HistoricalSource>(
            `SELECT id,service_id,${first}::text AS first_seen_at,resolved_at::text,${regressed}::text AS regressed_at
          FROM ${table} WHERE project_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid)
            AND (${first}<$5::timestamptz OR resolved_at<$5::timestamptz OR ${regressed}<$5::timestamptz)
            AND (${first}>=${cutoff} OR resolved_at>=${cutoff} OR ${regressed}>=${cutoff} OR ${last}>=${cutoff})
          ORDER BY id LIMIT $3 FOR SHARE`,
            [
              input.project_id,
              input.after_id ?? null,
              input.limit,
              input.now,
              coverage.lifecycle_started_at
            ]
          )
        ).rows;
        const facts: Array<{
          source_id: string;
          service_id: string | null;
          transition: string;
          to_status: string;
          occurred_at: string;
        }> = [];
        for (const row of rows) {
          for (const [transition, toStatus, at] of [
            ["opened", "open", row.first_seen_at],
            ["resolved", "resolved", row.resolved_at],
            ["regressed", "regressed", row.regressed_at]
          ] as const) {
            if (at === null || Date.parse(at) >= Date.parse(coverage.lifecycle_started_at))
              continue;
            facts.push({
              source_id: row.id,
              service_id: row.service_id,
              transition,
              to_status: toStatus,
              occurred_at: new Date(at).toISOString()
            });
          }
        }
        if (facts.length)
          await tx.query(
            `INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,service_id,transition,to_status,severity,occurred_at,backfilled)
          SELECT $1,$3,f.source_id,f.service_id,f.transition,f.to_status,'unknown',f.occurred_at,true
          FROM jsonb_to_recordset($2::jsonb) AS f(source_id uuid,service_id uuid,transition text,to_status text,occurred_at timestamptz)
          WHERE f.occurred_at>=${cutoff} AND NOT EXISTS(SELECT 1 FROM report_lifecycle_facts old WHERE old.project_id=$1 AND old.source_type=$3 AND old.source_id=f.source_id AND old.transition=f.transition AND old.occurred_at=f.occurred_at)`,
            [input.project_id, JSON.stringify(facts), input.source_type, input.now]
          );
        if (rows.length)
          await tx.query(
            `INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,service_id,transition,to_status,severity,occurred_at)
          SELECT s.project_id,$3,s.id,s.service_id,'observed',
            CASE WHEN s.status IN ('open','resolved','regressed','snoozed') THEN s.status ELSE 'other' END,
            CASE WHEN s.severity IN ('low','medium','high','critical') THEN s.severity ELSE 'unknown' END,statement_timestamp()
          FROM ${table} s WHERE s.project_id=$1 AND s.id=ANY($2::uuid[]) AND NOT EXISTS(
            SELECT 1 FROM (SELECT f.to_status,f.severity FROM report_lifecycle_facts f
              WHERE f.project_id=s.project_id AND f.source_type=$3 AND f.source_id=s.id AND NOT f.backfilled ORDER BY f.id DESC LIMIT 1) current
            WHERE current.to_status=CASE WHEN s.status IN ('open','resolved','regressed','snoozed') THEN s.status ELSE 'other' END
              AND current.severity=CASE WHEN s.severity IN ('low','medium','high','critical') THEN s.severity ELSE 'unknown' END)`,
            [input.project_id, rows.map((row) => row.id), input.source_type]
          );
        const done = rows.length < input.limit;
        return { examined: rows.length, next_cursor: done ? null : rows.at(-1)!.id, done };
      });
    },
    async prune(raw) {
      const input = z
        .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(5000) })
        .strict()
        .parse(raw);
      const result = await db.query(
        `WITH expired AS (SELECT id FROM report_lifecycle_facts WHERE occurred_at<(($1::timestamptz AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC' ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT $2)
        DELETE FROM report_lifecycle_facts f USING expired e WHERE f.id=e.id RETURNING f.id`,
        [input.now, input.limit]
      );
      return result.rows.length;
    }
  };
}
