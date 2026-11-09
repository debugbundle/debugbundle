import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  createReportSourceText,
  ReportSourceTextSchema,
  REPORT_SOURCE_TEXT_GROUP_LIMITS,
  type ReportSourceText
} from "../../smart-reports/src/source-text.js";
import { canAccessReportScope } from "./report-authorization.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const CollectSchema = z
  .object({
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    expected_version: z.number().int().positive(),
    now: z.string().datetime()
  })
  .strict();
const ReadSchema = z.object({ definition_id: z.uuid(), now: z.string().datetime() }).strict();
interface SourceRow extends Record<string, unknown> {
  origin_project_id: string;
  source_type: "incident" | "improvement";
  source_id: string;
  source_version_at: string;
  source_content_at: string;
  first_seen_at: string;
  last_seen_at: string;
  status: "open" | "resolved" | "regressed" | "snoozed" | "dismissed";
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  title: string;
  context: string | null;
}
const groups = Object.entries(REPORT_SOURCE_TEXT_GROUP_LIMITS) as Array<
  [ReportSourceText["summary_group"], number]
>;
const severityOrder =
  "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END";
const refreshedSummary = `CASE WHEN report_source_text.summary->>'context_origin'='bundle'
  AND report_source_text.summary->>'source_content_at'=EXCLUDED.summary->>'source_content_at'
  THEN EXCLUDED.summary || jsonb_build_object('context',report_source_text.summary->'context','title',report_source_text.summary->'title',
    'context_origin','bundle','context_bundle_generation',report_source_text.summary->'context_bundle_generation') ELSE EXCLUDED.summary END`;
export interface ReportSourceTextStore {
  collect(raw: z.infer<typeof CollectSchema>): Promise<{ collected: number; paused: boolean }>;
  read(raw: z.infer<typeof ReadSchema>): Promise<ReportSourceText[]>;
  prune(raw: { now: string; limit: number }): Promise<number>;
}
/** Internal collection only. Saved initiating authority and exact origins are
 * checked again here; internal reads still require a whole-scope service gate. */
export function createReportSourceTextStore(db: Queryable): ReportSourceTextStore {
  return {
    async collect(
      raw: z.infer<typeof CollectSchema>
    ): Promise<{ collected: number; paused: boolean }> {
      const input = CollectSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          input.organization_id
        ]);
        const organization = (
          await tx.query<{ plan: string; suspended_at: unknown }>(
            `SELECT plan,suspended_at FROM organizations WHERE id=$1 AND ${REPORT_TRIAL_ENTITLEMENT_SQL}`,
            [input.organization_id]
          )
        ).rows[0];
        const definition = (
          await tx.query<Record<string, unknown>>(
            `SELECT version,enabled,paused_at,requires_owner_review,privacy_mode,source_collection_consent,
          accepted_scope,initiating_authority FROM report_definitions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
            [input.definition_id, input.organization_id]
          )
        ).rows[0];
        if (!definition) throw new SmartReportError("report_not_found");
        if (definition["version"] !== input.expected_version)
          throw new SmartReportError("report_version_conflict");
        if (
          !organization ||
          organization.suspended_at !== null ||
          !getTierCapabilities(organization.plan).smart_reports ||
          definition["enabled"] !== true ||
          definition["paused_at"] !== null ||
          definition["requires_owner_review"] === true
        )
          return { collected: 0, paused: true };
        if (
          definition["privacy_mode"] !== "full" ||
          definition["source_collection_consent"] !== true
        )
          return { collected: 0, paused: false };
        const scope = AcceptedReportScopeSchema.parse(definition["accepted_scope"]);
        if (
          !(await canAccessReportScope(tx, {
            organization_id: input.organization_id,
            scope,
            initiator: definition["initiating_authority"],
            manage: true
          }))
        ) {
          await tx.query(
            "UPDATE report_definitions SET pause_reason='creator_access_lost',paused_at=$2,version=version+1,updated_at=$2 WHERE id=$1",
            [input.definition_id, input.now]
          );
          return { collected: 0, paused: true };
        }
        await tx.query(
          "DELETE FROM report_source_text WHERE definition_id=$1 AND text_expires_at<=$2",
          [input.definition_id, input.now]
        );
        let collected = 0;
        for (const view of scope) {
          // Refresh lifecycle metadata independently of the text selection. A
          // newly resolved source must not survive as an urgent cached issue.
          for (const [table, kind, lastSeen] of [
            ["incidents", "incident", "last_seen_at"],
            ["improvement_opportunities", "improvement", "last_detected_at"]
          ] as const) {
            await tx.query(
              `UPDATE report_source_text t SET
              summary_group=CASE WHEN s.status='resolved' THEN 'resolved' WHEN s.status IN ('open','regressed') AND s.severity IN ('critical','high') THEN 'urgent' ELSE 'recent' END,
              summary=t.summary || jsonb_build_object('status',s.status,'severity',s.severity,
                'summary_group',CASE WHEN s.status='resolved' THEN 'resolved' WHEN s.status IN ('open','regressed') AND s.severity IN ('critical','high') THEN 'urgent' ELSE 'recent' END,
                'source_version_at',to_char(s.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'last_seen_at',to_char(s.${lastSeen} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
              FROM ${table} s WHERE t.definition_id=$1 AND t.selected_project_id=$2 AND t.source_type=$3
                AND s.project_id=t.origin_project_id AND s.id=t.source_id AND s.project_id=ANY($4::uuid[])
                AND s.updated_at<=$5::timestamptz AND s.${lastSeen}<=$5::timestamptz
                AND (t.summary->>'status',t.summary->>'severity',(t.summary->>'source_version_at')::timestamptz,(t.summary->>'last_seen_at')::timestamptz)
                  IS DISTINCT FROM (s.status,s.severity,date_trunc('milliseconds',s.updated_at),date_trunc('milliseconds',s.${lastSeen}))`,
              [input.definition_id, view.project_id, kind, view.origin_project_ids, input.now]
            );
          }
          for (const [group, limit] of groups) {
            const rows = (
              await tx.query<SourceRow>(
                `WITH sources AS (
              SELECT project_id AS origin_project_id,'incident' AS source_type,id AS source_id,updated_at AS source_version_at,
                COALESCE(bundle_updated_at,bundle_created_at,created_at) AS source_content_at,first_seen_at,last_seen_at,status,severity,left(title,4096) AS title,NULL::text AS context
              FROM incidents WHERE project_id=ANY($1::uuid[])
              UNION ALL
              SELECT project_id,'improvement',id,updated_at,COALESCE(bundle_updated_at,bundle_created_at,created_at),first_detected_at,last_detected_at,status,severity,left(title,4096),left(summary,8192)
              FROM improvement_opportunities WHERE project_id=ANY($1::uuid[])
            ) SELECT origin_project_id,source_type,source_id,source_version_at::text,source_content_at::text,first_seen_at::text,last_seen_at::text,status,severity,title,context
            FROM sources WHERE source_content_at>$2::timestamptz-interval '90 days' AND source_content_at<=$2::timestamptz
              AND source_version_at<=$2::timestamptz AND last_seen_at<=$2::timestamptz
              AND CASE WHEN status='resolved' THEN 'resolved' WHEN status IN ('open','regressed') AND severity IN ('critical','high') THEN 'urgent' ELSE 'recent' END=$3
            ORDER BY ${severityOrder},last_seen_at DESC,origin_project_id,source_type,source_id LIMIT $4`,
                [view.origin_project_ids, input.now, group, limit]
              )
            ).rows;
            for (const row of rows) {
              const summary = createReportSourceText({
                ...row,
                selected_project_id: view.project_id,
                source_version_at: new Date(row.source_version_at).toISOString(),
                source_content_at: new Date(row.source_content_at).toISOString(),
                first_seen_at: new Date(row.first_seen_at).toISOString(),
                last_seen_at: new Date(row.last_seen_at).toISOString(),
                privacy_mode: "full",
                source_collection_consent: true,
                retention_days: 90,
                now: input.now
              });
              if (!summary) continue;
              await tx.query(
                `INSERT INTO report_source_text(definition_id,selected_project_id,origin_project_id,source_type,source_id,summary_group,text_expires_at,summary)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(definition_id,selected_project_id,origin_project_id,source_type,source_id)
                DO UPDATE SET summary_group=EXCLUDED.summary_group,text_expires_at=EXCLUDED.text_expires_at,
                summary=${refreshedSummary}
                WHERE (report_source_text.summary-'captured_at') IS DISTINCT FROM ((${refreshedSummary})-'captured_at')`,
                [
                  input.definition_id,
                  view.project_id,
                  row.origin_project_id,
                  row.source_type,
                  row.source_id,
                  summary.summary_group,
                  summary.text_expires_at,
                  JSON.stringify(summary)
                ]
              );
              collected++;
            }
          }
          // Cached rows whose sources were routinely pruned compete within the
          // same fixed slots; they cannot cause unbounded per-definition growth.
          await tx.query(
            `WITH ranked AS (SELECT origin_project_id,source_type,source_id,
            row_number() OVER(PARTITION BY summary_group ORDER BY
              CASE summary->>'severity' WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
              (summary->>'last_seen_at')::timestamptz DESC,origin_project_id,source_type,source_id) AS position,summary_group
            FROM report_source_text WHERE definition_id=$1 AND selected_project_id=$2)
            DELETE FROM report_source_text t USING ranked r WHERE t.definition_id=$1 AND t.selected_project_id=$2
              AND (t.origin_project_id,t.source_type,t.source_id)=(r.origin_project_id,r.source_type,r.source_id)
              AND r.position>CASE r.summary_group WHEN 'urgent' THEN 20 ELSE 15 END`,
            [input.definition_id, view.project_id]
          );
        }
        return { collected, paused: false };
      });
    },
    async read(raw: z.infer<typeof ReadSchema>): Promise<ReportSourceText[]> {
      const input = ReadSchema.parse(raw);
      const rows = (
        await db.query<{ summary: unknown }>(
          `SELECT summary FROM report_source_text WHERE definition_id=$1 AND text_expires_at>$2
        ORDER BY selected_project_id,summary_group,origin_project_id,source_type,source_id LIMIT 500`,
          [input.definition_id, input.now]
        )
      ).rows;
      return rows.map((row) => ReportSourceTextSchema.parse(row.summary));
    },
    async prune(raw: { now: string; limit: number }): Promise<number> {
      const input = z
        .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(5000) })
        .strict()
        .parse(raw);
      const result = await db.query(
        `WITH expired AS (SELECT ctid FROM report_source_text WHERE text_expires_at<=$1 ORDER BY text_expires_at,definition_id FOR UPDATE SKIP LOCKED LIMIT $2)
        DELETE FROM report_source_text t USING expired e WHERE t.ctid=e.ctid RETURNING t.definition_id`,
        [input.now, input.limit]
      );
      return result.rows.length;
    }
  };
}
