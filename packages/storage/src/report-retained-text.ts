import { z } from "zod";
import {
  createReportSourceText,
  type ReportSourceText
} from "../../smart-reports/src/source-text.js";
import type { ReportSourceState } from "../../smart-reports/src/source-state.js";
import type { Queryable } from "./types.js";

/** An explicitly admitted manual run can use retained metadata without enabling
 * a reusable cache. Read only the already bounded selected source identities,
 * preserve original content expiry, and never write a new collection epoch. */
export async function readRetainedReportText(
  tx: Queryable,
  input: {
    project_id: string;
    origin_ids: string[];
    sources: ReportSourceState[];
    cutoff_at: string;
    now: string;
  }
): Promise<ReportSourceText[]> {
  const ids = (kind: "incident" | "improvement"): string[] =>
    input.sources
      .filter((item) => item.source_type === kind && item.retained)
      .map((item) => item.source_id);
  if (input.sources.length > 50) throw new Error("report_source_selection_exceeded");
  const rows = (
    await tx.query<Record<string, unknown>>(
      `WITH sources AS (
    SELECT project_id AS origin_project_id,'incident'::text AS source_type,id AS source_id,updated_at AS source_version_at,
      COALESCE(bundle_updated_at,bundle_created_at,created_at) AS source_content_at,first_seen_at,last_seen_at,status,severity,left(title,4096) AS title,NULL::text AS context
    FROM incidents WHERE project_id=ANY($1::uuid[]) AND id=ANY($2::uuid[])
    UNION ALL
    SELECT project_id,'improvement',id,updated_at,COALESCE(bundle_updated_at,bundle_created_at,created_at),first_detected_at,last_detected_at,status,severity,left(title,4096),left(summary,8192)
    FROM improvement_opportunities WHERE project_id=ANY($1::uuid[]) AND id=ANY($3::uuid[])
    ) SELECT origin_project_id,source_type,source_id,source_version_at::text,source_content_at::text,first_seen_at::text,last_seen_at::text,status,severity,title,context
    FROM sources WHERE source_version_at<=$4::timestamptz AND source_content_at<=$4::timestamptz AND last_seen_at<=$4::timestamptz
    AND source_content_at+interval '90 days'>GREATEST($4::timestamptz,$5::timestamptz)
    ORDER BY origin_project_id,source_type,source_id LIMIT 50`,
      [input.origin_ids, ids("incident"), ids("improvement"), input.cutoff_at, input.now]
    )
  ).rows;
  const text: ReportSourceText[] = [];
  const iso = (value: unknown): string => new Date(z.string().parse(value)).toISOString();
  for (const row of rows) {
    const summary = createReportSourceText({
      selected_project_id: input.project_id,
      origin_project_id: z.uuid().parse(row["origin_project_id"]),
      source_type: z.enum(["incident", "improvement"]).parse(row["source_type"]),
      source_id: z.uuid().parse(row["source_id"]),
      source_version_at: iso(row["source_version_at"]),
      source_content_at: iso(row["source_content_at"]),
      first_seen_at: iso(row["first_seen_at"]),
      last_seen_at: iso(row["last_seen_at"]),
      status: z
        .enum(["open", "resolved", "regressed", "snoozed", "dismissed"])
        .parse(row["status"]),
      severity: z.enum(["critical", "high", "medium", "low", "unknown"]).parse(row["severity"]),
      title: z.string().parse(row["title"]),
      context: z.string().nullable().parse(row["context"]),
      privacy_mode: "full",
      source_collection_consent: true,
      retention_days: 90,
      now: input.cutoff_at
    });
    if (summary) text.push(summary);
  }
  return text;
}
